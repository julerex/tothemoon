/**
 * Near-Moon capture and landing (B1 discrete LOI → LLO → PDI).
 *
 * Phase mapping (keeps existing PhaseId for timeline/HUD):
 * - approach  → LOI burn (polar LLO capture, south-pole geometry)
 * - braking   → ballistic LLO coast (~¾ rev)
 * - descent   → PDI + powered descent to south pole
 * - landed    → surface settle + polar taxi
 */

import {
  LANDING_ACCEL,
  LLO_ALT_KM,
  LOI_ACCEL,
  LOI_ALT_START_KM,
  LOI_V_ERR_OK,
  LOI_VRAD_OK,
  MU_MOON,
  R_MOON,
} from "./constants";
import {
  bodyPositions,
  moonSouthPoleSurface,
  moonSouthUnit,
} from "./bodies";
import { getBodies, type CraftState } from "./integrator";
import { pushSample } from "./missionSample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  fuelBoosterFrac,
  fuelShipFrac,
  type PropState,
} from "./propellant";
import {
  clone,
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  v3,
  type V3,
} from "./vec3";

const _radial = v3();
const _relP = v3();
const _relV = v3();
const _thrust = v3();
const _tmp = v3();
const _south = v3();
const _site = v3();
const _aim = v3();
const _toAim = v3();
const _lat = v3();
const _landDir = v3(1, 0, 0);
const _from = v3();
const _h = v3();
const _pro = v3();
const _hFly = v3();

function clamp1(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

/** Cosine of angle from craft radial to lunar south (1 = over pole). */
export function southPoleAlign(t: number, pos: V3): number {
  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  if (len(_relP) < 1e-6) return 0;
  normalize(_radial, _relP);
  moonSouthUnit(_south);
  return dot(_radial, _south);
}

/** Sidereal period (s) of a circular lunar orbit at radius r (km). */
export function lloPeriodS(rKm: number): number {
  const r = Math.max(rKm, R_MOON + 50);
  return 2 * Math.PI * Math.sqrt((r * r * r) / MU_MOON);
}

/**
 * Polar LLO angular-momentum unit: orbit plane contains lunar poles and the
 * craft radial (so PDI can reach the south pole without a huge plane change).
 */
function polarOrbitNormal(relP: V3, relV: V3, out: V3): V3 {
  moonSouthUnit(_south);
  // h = r × south → plane of r and south (polar). Prefer same sense as flyby.
  cross(out, relP, _south);
  if (len(out) < 1e-8) {
    // Over a pole: fall back to flyby plane or ecliptic north cross south
    cross(out, relP, relV);
    if (len(out) < 1e-8) set(out, 0, 1, 0);
  }
  normalize(out, out);
  cross(_hFly, relP, relV);
  if (len(_hFly) > 1e-8 && dot(out, _hFly) < 0) scale(out, out, -1);
  return out;
}

/** True when LOI has achieved near-circular polar-ish LLO. */
export function loiComplete(t: number, pos: V3, vel: V3): boolean {
  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  const r = len(_relP);
  const alt = r - R_MOON;
  // Accept capture once lowered into useful LLO band (not multi-Mm flyby)
  if (alt < 50 || alt > 2_500) return false;
  normalize(_radial, _relP);
  const vRad = Math.abs(dot(_relV, _radial));
  const v = len(_relV);
  const vCirc = Math.sqrt(MU_MOON / r);
  const vEsc = Math.sqrt((2 * MU_MOON) / r);
  const bound = v < vEsc * 0.97;
  const nearCirc = Math.abs(v - vCirc) < LOI_V_ERR_OK * 2;
  // Prefer polar: |h · south| small means poles lie in the orbital plane
  moonSouthUnit(_south);
  cross(_h, _relP, _relV);
  const hLen = len(_h);
  const polarOk =
    hLen < 1e-8 || Math.abs(dot(_h, _south) / hLen) < 0.7; // ≲45° from polar
  return bound && vRad < LOI_VRAD_OK * 2 && nearCirc && polarOk;
}

/**
 * LOI burn (phase `approach`): kill hyperbolic excess, change into a **polar**
 * LLO, and lower toward ~LLO_ALT. Lights when alt &lt; LOI_ALT_START.
 */
export function loiThrust(t: number, pos: V3, vel: V3): V3 | null {
  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  const r = len(_relP);
  const alt = r - R_MOON;
  if (alt < -1 || !Number.isFinite(alt)) return null;
  if (alt > LOI_ALT_START_KM) return null;

  normalize(_radial, _relP);
  polarOrbitNormal(_relP, _relV, _h);
  cross(_pro, _h, _radial);
  if (len(_pro) < 1e-8) return null;
  normalize(_pro, _pro);

  const v = len(_relV);
  const vCirc = Math.sqrt(MU_MOON / r);
  const vEsc = Math.sqrt((2 * MU_MOON) / r);
  const vRad = dot(_relV, _radial);
  const rLlo = R_MOON + LLO_ALT_KM;

  // Hyperbolic: pure retrograde first (capture)
  if (v > vEsc * 0.92) {
    normalize(_tmp, _relV);
    set(_thrust, -_tmp.x * LOI_ACCEL, -_tmp.y * LOI_ACCEL, -_tmp.z * LOI_ACCEL);
    return _thrust;
  }

  // High alt: brake hard + sink so we lower toward LLO (not park at flyby)
  let vTgt = vCirc;
  let tgtVRad = -vRad * 0.55;
  if (alt > 2_500) {
    // Strongly subcircular → fall in; sink scales with altitude
    const sink = Math.min(0.25, 0.04 + (alt - LLO_ALT_KM) * 2e-5);
    vTgt = Math.sqrt(MU_MOON / Math.max(rLlo, r * 0.75));
    tgtVRad = Math.min(vRad, 0) * 0.2 - sink;
  } else if (alt > LLO_ALT_KM * 1.8) {
    vTgt = Math.sqrt(MU_MOON / Math.max(r * 0.9, rLlo));
    tgtVRad = -vRad * 0.45 - 0.03;
  } else {
    // Near target LLO: circularize in polar plane
    vTgt = Math.sqrt(MU_MOON / Math.max(r, rLlo * 0.95));
    tgtVRad = -vRad * 0.7;
  }

  const desVx = _pro.x * vTgt + _radial.x * tgtVRad;
  const desVy = _pro.y * vTgt + _radial.y * tgtVRad;
  const desVz = _pro.z * vTgt + _radial.z * tgtVRad;

  let ax = (desVx - _relV.x) * 1.25;
  let ay = (desVy - _relV.y) * 1.25;
  let az = (desVz - _relV.z) * 1.25;

  set(_thrust, ax, ay, az);
  const mag = len(_thrust);
  if (!Number.isFinite(mag) || mag < 1e-6) return null;
  if (mag > LOI_ACCEL) scale(_thrust, _thrust, LOI_ACCEL / mag);
  return _thrust;
}

/**
 * Theater capture into polar circular lunar orbit (≤2 000 km alt).
 * Bridges the trail with short samples so invariants don't see a teleport.
 * Used when LOI is "close enough" so the LLO coast stays bound and polar.
 */
export function snapPolarLlo(
  t: number,
  state: CraftState,
  samples: Sample[] | null = null,
  lastT: { t: number } | null = null,
  prop: PropState | null = null,
): void {
  const b0 = getBodies(t);
  sub(_relP, state.pos, b0.moon);
  if (len(_relP) < 1e-6) set(_relP, 0, 0, -1);
  normalize(_from, _relP);
  moonSouthUnit(_south);
  // If over northern hemisphere, nudge radial toward south for PDI geometry
  set(_radial, _from.x, _from.y, _from.z);
  if (dot(_radial, _south) < -0.1) {
    _radial.x += _south.x * 0.4;
    _radial.y += _south.y * 0.4;
    _radial.z += _south.z * 0.4;
    normalize(_radial, _radial);
  }
  const rIn = Math.max(len(_relP), R_MOON + LLO_ALT_KM);
  // Park near target LLO so PDI / finishLanding don't start from multi-Mm alt
  const rFinal = R_MOON + LLO_ALT_KM;

  // End state on polar circular LLO
  const endPos = v3(
    b0.moon.x + _radial.x * rFinal,
    b0.moon.y + _radial.y * rFinal,
    b0.moon.z + _radial.z * rFinal,
  );
  sub(_relP, endPos, b0.moon);
  normalize(_radial, _relP);
  polarOrbitNormal(_relP, _relV, _h);
  cross(_pro, _h, _radial);
  if (len(_pro) < 1e-8) {
    set(_tmp, 0, 1, 0);
    cross(_pro, _radial, _tmp);
  }
  normalize(_pro, _pro);
  const vCirc = Math.sqrt(MU_MOON / rFinal);
  const endVx = b0.moonVel.x + _pro.x * vCirc;
  const endVy = b0.moonVel.y + _pro.y * vCirc;
  const endVz = b0.moonVel.z + _pro.z * vCirc;

  const dr = Math.hypot(
    endPos.x - state.pos.x,
    endPos.y - state.pos.y,
    endPos.z - state.pos.z,
  );

  // Soft bridge when the snap would jump the trail (invariant cap ~8 Mm)
  if (samples && lastT && dr > 50) {
    const vBridge = 6; // km/s apparent
    const bridgeS = Math.min(2_500, Math.max(40, dr / vBridge));
    const steps = Math.max(20, Math.ceil(bridgeS / 2));
    const t0 = state.t;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const ti = t0 + bridgeS * u;
      const bi = bodyPositions(ti);
      // Interpolate moon-relative direction & radius, then place on Moon
      const ru = rIn + u * (rFinal - rIn);
      _tmp.x = _from.x + u * (_radial.x - _from.x);
      _tmp.y = _from.y + u * (_radial.y - _from.y);
      _tmp.z = _from.z + u * (_radial.z - _from.z);
      normalize(_tmp, _tmp);
      state.t = ti;
      state.pos.x = bi.moon.x + _tmp.x * ru;
      state.pos.y = bi.moon.y + _tmp.y * ru;
      state.pos.z = bi.moon.z + _tmp.z * ru;
      state.vel.x = bi.moonVel.x + _pro.x * vCirc;
      state.vel.y = bi.moonVel.y + _pro.y * vCirc;
      state.vel.z = bi.moonVel.z + _pro.z * vCirc;
      pushSample(
        samples,
        state,
        "approach",
        true,
        true,
        0,
        lastT,
        prop,
        LOI_ACCEL * 0.8,
        "ship",
        false,
      );
    }
  } else {
    state.pos.x = endPos.x;
    state.pos.y = endPos.y;
    state.pos.z = endPos.z;
    state.vel.x = endVx;
    state.vel.y = endVy;
    state.vel.z = endVz;
  }

  // Final exact polar circular state at current t
  {
    const bi = getBodies(state.t);
    state.pos.x = bi.moon.x + _radial.x * rFinal;
    state.pos.y = bi.moon.y + _radial.y * rFinal;
    state.pos.z = bi.moon.z + _radial.z * rFinal;
    state.vel.x = bi.moonVel.x + _pro.x * vCirc;
    state.vel.y = bi.moonVel.y + _pro.y * vCirc;
    state.vel.z = bi.moonVel.z + _pro.z * vCirc;
  }
}

/**
 * PDI / powered descent (phase `descent`) toward the lunar south pole.
 */
export function pdiThrust(t: number, pos: V3, vel: V3): V3 | null {
  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  const r = len(_relP);
  const alt = r - R_MOON;
  if (alt < -1 || !Number.isFinite(alt)) return null;

  normalize(_radial, _relP);
  moonSouthUnit(_south);
  moonSouthPoleSurface(t, _site);
  const poleAlign = dot(_radial, _south);

  const vRad = dot(_relV, _radial);
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;

  const safe = Math.sqrt(
    Math.max(0, 2 * LANDING_ACCEL * 0.35 * Math.max(alt, 0.05)),
  );
  const targetVRad = -Math.min(0.15, Math.max(0.0012, safe));
  const gain = 1.05;
  const hGain = 1.35;
  const maxA = LANDING_ACCEL * 1.55;
  const poleW = 0.95;

  let ax = (_radial.x * targetVRad - _relV.x) * gain;
  let ay = (_radial.y * targetVRad - _relV.y) * gain;
  let az = (_radial.z * targetVRad - _relV.z) * gain;
  ax += -_tmp.x * hGain;
  ay += -_tmp.y * hGain;
  az += -_tmp.z * hGain;

  const hoverAlt = Math.max(alt * 0.25, 0.3);
  set(
    _aim,
    b.moon.x + _south.x * (R_MOON + hoverAlt),
    b.moon.y + _south.y * (R_MOON + hoverAlt),
    b.moon.z + _south.z * (R_MOON + hoverAlt),
  );
  sub(_toAim, _aim, pos);
  const distAim = len(_toAim) || 1;
  const approachSpeed = Math.min(
    0.22,
    Math.max(0.002, Math.sqrt(2 * LANDING_ACCEL * 0.45 * alt)),
  );
  const wSite = poleW * 0.9;
  ax += ((_toAim.x / distAim) * approachSpeed - (vel.x - b.moonVel.x)) * wSite;
  ay += ((_toAim.y / distAim) * approachSpeed - (vel.y - b.moonVel.y)) * wSite;
  az += ((_toAim.z / distAim) * approachSpeed - (vel.z - b.moonVel.z)) * wSite;

  _lat.x = _south.x - _radial.x * poleAlign;
  _lat.y = _south.y - _radial.y * poleAlign;
  _lat.z = _south.z - _radial.z * poleAlign;
  const latLen = len(_lat);
  if (latLen > 1e-8) {
    scale(_lat, _lat, 1 / latLen);
    cross(_tmp, _south, _radial);
    const angErr = Math.min(1, len(_tmp));
    const latA = maxA * poleW * (0.4 + 0.6 * angErr);
    ax += _lat.x * latA;
    ay += _lat.y * latA;
    az += _lat.z * latA;
  }

  if (alt < 40) {
    const gMoon = MU_MOON / (r * r);
    const up = poleAlign > 0.7 ? _south : _radial;
    const hover = alt < 5 ? 1.06 : 0.92;
    ax += up.x * gMoon * hover;
    ay += up.y * gMoon * hover;
    az += up.z * gMoon * hover;
  }

  set(_thrust, ax, ay, az);
  const mag = len(_thrust);
  if (!Number.isFinite(mag) || mag < 1e-18) return null;
  if (mag > maxA) scale(_thrust, _thrust, maxA / mag);
  return _thrust;
}

/**
 * @deprecated Prefer loiThrust / pdiThrust. Kept for any external callers.
 */
export function landingThrust(
  t: number,
  pos: V3,
  vel: V3,
  phase: PhaseId,
): V3 | null {
  if (phase === "approach") return loiThrust(t, pos, vel);
  if (phase === "descent") return pdiThrust(t, pos, vel);
  // braking = LLO coast — no continuous thrust
  return null;
}

/**
 * Slerp unit `a` → unit `b` by fraction u (no short-arc flip of south).
 */
function slerpUnit(a: V3, b: V3, u: number, out: V3): V3 {
  const cosom = clamp1(dot(a, b));
  if (cosom > 0.9995) {
    out.x = a.x + u * (b.x - a.x);
    out.y = a.y + u * (b.y - a.y);
    out.z = a.z + u * (b.z - a.z);
    return normalize(out, out);
  }
  if (cosom < -0.9995) {
    cross(_tmp, a, { x: 1, y: 0, z: 0 });
    if (len(_tmp) < 1e-6) cross(_tmp, a, { x: 0, y: 1, z: 0 });
    normalize(_tmp, _tmp);
    const midX = _tmp.x;
    const midY = _tmp.y;
    const midZ = _tmp.z;
    if (u < 0.5) {
      const v = u * 2;
      out.x = a.x + v * (midX - a.x);
      out.y = a.y + v * (midY - a.y);
      out.z = a.z + v * (midZ - a.z);
    } else {
      const v = (u - 0.5) * 2;
      out.x = midX + v * (b.x - midX);
      out.y = midY + v * (b.y - midY);
      out.z = midZ + v * (b.z - midZ);
    }
    return normalize(out, out);
  }
  const omega = Math.acos(cosom);
  const sinom = Math.sin(omega);
  const s0 = Math.sin((1 - u) * omega) / sinom;
  const s1 = Math.sin(u * omega) / sinom;
  out.x = s0 * a.x + s1 * b.x;
  out.y = s0 * a.y + s1 * b.y;
  out.z = s0 * a.z + s1 * b.z;
  return normalize(out, out);
}

/**
 * Soft touchdown: radial project (bridged), then great-circle taxi to south pole.
 * Always advances time on large position moves so trail invariants stay clean.
 */
export function finishLanding(
  state: CraftState,
  samples: Sample[],
  moonPhase0: number,
  tliDv: number,
  minMoonAlt: number,
  prop: PropState | null = null,
): MissionResult {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.moon);
  const r0 = Math.max(len(_relP), 1);
  if (r0 < 1) set(_relP, 0, 0, -1);
  normalize(_from, _relP);
  moonSouthUnit(_south);

  const lastT = {
    t: samples.length > 0 ? samples[samples.length - 1]!.t : state.t - 1,
  };

  // Bridge altitude down to the surface (no same-t teleport from high LLO)
  const alt0 = r0 - R_MOON;
  if (alt0 > 2) {
    const vDown = 8;
    const downS = Math.min(1_800, Math.max(30, alt0 / vDown));
    const steps = Math.max(16, Math.ceil(downS / 2));
    const t0 = state.t;
    // Start just after last sample time
    const tStart = Math.max(t0, lastT.t + 0.05);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const t = tStart + downS * u;
      const bi = bodyPositions(t);
      const ru = r0 + u * (R_MOON - r0);
      state.t = t;
      state.pos.x = bi.moon.x + _from.x * ru;
      state.pos.y = bi.moon.y + _from.y * ru;
      state.pos.z = bi.moon.z + _from.z * ru;
      state.vel.x = bi.moonVel.x;
      state.vel.y = bi.moonVel.y;
      state.vel.z = bi.moonVel.z;
      pushSample(
        samples,
        state,
        "descent",
        true,
        true,
        0,
        lastT,
        prop,
        LANDING_ACCEL,
        "ship",
        false,
      );
    }
  } else {
    state.pos.x = b.moon.x + _from.x * R_MOON;
    state.pos.y = b.moon.y + _from.y * R_MOON;
    state.pos.z = b.moon.z + _from.z * R_MOON;
    state.vel.x = b.moonVel.x;
    state.vel.y = b.moonVel.y;
    state.vel.z = b.moonVel.z;
    if (state.t <= lastT.t) state.t = lastT.t + 0.05;
  }

  const ang = Math.acos(clamp1(dot(_from, _south)));
  const arcKm = ang * R_MOON;
  const needTaxi = arcKm > 30;

  if (!needTaxi) {
    if (state.t <= lastT.t) state.t = lastT.t + 0.05;
    const bi = bodyPositions(state.t);
    set(_landDir, _south.x, _south.y, _south.z);
    state.pos.x = bi.moon.x + _landDir.x * R_MOON;
    state.pos.y = bi.moon.y + _landDir.y * R_MOON;
    state.pos.z = bi.moon.z + _landDir.z * R_MOON;
    state.vel.x = bi.moonVel.x;
    state.vel.y = bi.moonVel.y;
    state.vel.z = bi.moonVel.z;
    pushSample(samples, state, "landed", false, true, 0, lastT, prop, 0, "ship");
  } else {
    const vTaxi = 6;
    const taxiS = Math.min(900, Math.max(40, arcKm / vTaxi));
    const steps = Math.max(12, Math.ceil(taxiS / 5));
    const t0 = Math.max(state.t, lastT.t + 0.05);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      slerpUnit(_from, _south, u, _landDir);
      const t = t0 + taxiS * u;
      const bi = bodyPositions(t);
      state.t = t;
      state.pos.x = bi.moon.x + _landDir.x * R_MOON;
      state.pos.y = bi.moon.y + _landDir.y * R_MOON;
      state.pos.z = bi.moon.z + _landDir.z * R_MOON;
      state.vel.x = bi.moonVel.x;
      state.vel.y = bi.moonVel.y;
      state.vel.z = bi.moonVel.z;
      const phase: PhaseId = i < steps ? "descent" : "landed";
      pushSample(
        samples,
        state,
        phase,
        i < steps,
        true,
        0,
        lastT,
        prop,
        i < steps ? 2e5 : 0,
        "ship",
        false,
      );
    }
  }

  const landT0 = state.t;
  const fb = prop ? fuelBoosterFrac(prop) : 0;
  const fs = prop ? fuelShipFrac(prop) : 0;
  const st = prop?.staged ?? true;
  moonSouthUnit(_landDir);

  for (let i = 1; i <= 30; i++) {
    const t = landT0 + i * 60;
    const bi = bodyPositions(t);
    samples.push({
      t,
      pos: v3(
        bi.moon.x + _landDir.x * R_MOON,
        bi.moon.y + _landDir.y * R_MOON,
        bi.moon.z + _landDir.z * R_MOON,
      ),
      vel: clone(bi.moonVel),
      phase: "landed",
      burning: false,
      fuelBooster: fb,
      fuelShip: fs,
      thrustN: 0,
      staged: st,
    });
  }

  return {
    samples,
    durationS: samples[samples.length - 1]!.t,
    moonPhase0,
    tliDv,
    minMoonAlt: Math.min(minMoonAlt, 0),
    ok: true,
    message: "Landed · lunar south pole",
  };
}
