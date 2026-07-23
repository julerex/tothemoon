import { LANDING_ACCEL, MU_MOON, R_MOON } from "./constants";
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

/**
 * Near-Moon guidance: LOI-style capture, then steer toward the **lunar south
 * pole** (theater Artemis-style site).
 */
export function landingThrust(
  t: number,
  pos: V3,
  vel: V3,
  phase: PhaseId,
): V3 | null {
  if (phase !== "braking" && phase !== "descent" && phase !== "approach") {
    return null;
  }

  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  const r = len(_relP);
  const alt = r - R_MOON;
  if (alt < -1) return null;
  if (!Number.isFinite(alt) || !Number.isFinite(r)) return null;

  normalize(_radial, _relP);
  moonSouthUnit(_south);
  moonSouthPoleSurface(t, _site);

  const poleAlign = dot(_radial, _south);

  const vRad = dot(_relV, _radial);
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;

  let targetVRad: number;
  let gain: number;
  let hGain: number;
  let maxA: number;
  let poleW: number;

  if (phase === "approach") {
    const closeIn =
      alt > 5_000 ? 0.4 : alt > 1_500 ? 0.18 : alt > 400 ? 0.07 : 0.03;
    targetVRad = -closeIn;
    gain = 0.65;
    hGain = 1.3;
    maxA = LANDING_ACCEL * (alt > 3_000 ? 2.2 : 1.5);
    poleW = alt > 3_000 ? 0.4 : 0.6;
  } else if (phase === "braking") {
    targetVRad = -0.08 - 0.3 * Math.min(1, alt / 3500);
    gain = 0.75;
    hGain = 1.15;
    maxA = LANDING_ACCEL * 1.5;
    poleW = 0.8;
  } else {
    const safe = Math.sqrt(
      Math.max(0, 2 * LANDING_ACCEL * 0.35 * Math.max(alt, 0.05)),
    );
    targetVRad = -Math.min(0.15, Math.max(0.0012, safe));
    gain = 1.05;
    hGain = 1.35;
    maxA = LANDING_ACCEL * 1.55;
    poleW = 0.95;
  }

  let ax = (_radial.x * targetVRad - _relV.x) * gain;
  let ay = (_radial.y * targetVRad - _relV.y) * gain;
  let az = (_radial.z * targetVRad - _relV.z) * gain;
  ax += -_tmp.x * hGain;
  ay += -_tmp.y * hGain;
  az += -_tmp.z * hGain;

  const hoverAlt =
    phase === "descent"
      ? Math.max(alt * 0.25, 0.3)
      : phase === "braking"
        ? Math.max(alt * 0.4, 5)
        : Math.max(alt * 0.55, 80);
  set(
    _aim,
    b.moon.x + _south.x * (R_MOON + hoverAlt),
    b.moon.y + _south.y * (R_MOON + hoverAlt),
    b.moon.z + _south.z * (R_MOON + hoverAlt),
  );
  sub(_toAim, _aim, pos);
  const distAim = len(_toAim) || 1;
  const approachSpeed =
    phase === "descent"
      ? Math.min(0.22, Math.max(0.002, Math.sqrt(2 * LANDING_ACCEL * 0.45 * alt)))
      : phase === "braking"
        ? 0.22
        : 0.35;
  const desVx = (_toAim.x / distAim) * approachSpeed;
  const desVy = (_toAim.y / distAim) * approachSpeed;
  const desVz = (_toAim.z / distAim) * approachSpeed;
  const wSite = poleW * (phase === "approach" ? 0.55 : 0.85);
  ax += (desVx - (vel.x - b.moonVel.x)) * wSite;
  ay += (desVy - (vel.y - b.moonVel.y)) * wSite;
  az += (desVz - (vel.z - b.moonVel.z)) * wSite;

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

  if (phase === "descent" && alt < 40) {
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

/** Rotate unit vector `a` toward unit `b` by angle fraction u ∈ [0,1] (slerp). */
function slerpUnit(a: V3, b: V3, u: number, out: V3): V3 {
  let cosom = clamp1(dot(a, b));
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
  }
  if (cosom > 0.9995) {
    out.x = a.x + u * (bx - a.x);
    out.y = a.y + u * (by - a.y);
    out.z = a.z + u * (bz - a.z);
    return normalize(out, out);
  }
  const omega = Math.acos(cosom);
  const sinom = Math.sin(omega);
  const s0 = Math.sin((1 - u) * omega) / sinom;
  const s1 = Math.sin(u * omega) / sinom;
  out.x = s0 * a.x + s1 * bx;
  out.y = s0 * a.y + s1 * by;
  out.z = s0 * a.z + s1 * bz;
  return normalize(out, out);
}

/**
 * Soft touchdown: radial project to surface, then **great-circle taxi** to the
 * lunar south pole at ≤ ~8 km/s so the trail stays continuous (no teleport).
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
  if (len(_relP) < 1) set(_relP, 0, 0, -1);
  normalize(_from, _relP);
  moonSouthUnit(_south);

  // First: settle onto local surface under the craft
  state.pos.x = b.moon.x + _from.x * R_MOON;
  state.pos.y = b.moon.y + _from.y * R_MOON;
  state.pos.z = b.moon.z + _from.z * R_MOON;
  state.vel.x = b.moonVel.x;
  state.vel.y = b.moonVel.y;
  state.vel.z = b.moonVel.z;

  const lastT = { t: -Infinity };
  // Still in descent while taxiing if far from pole
  const ang = Math.acos(clamp1(dot(_from, _south)));
  const arcKm = ang * R_MOON;
  const needTaxi = arcKm > 30;

  if (!needTaxi) {
    set(_landDir, _south.x, _south.y, _south.z);
    state.pos.x = b.moon.x + _landDir.x * R_MOON;
    state.pos.y = b.moon.y + _landDir.y * R_MOON;
    state.pos.z = b.moon.z + _landDir.z * R_MOON;
    pushSample(samples, state, "landed", false, true, 0, lastT, prop, 0, "ship");
  } else {
    // Surface taxi along great circle at ~5–8 km/s (well under invariant cap)
    const vTaxi = 6; // km/s along surface
    const taxiS = Math.min(900, Math.max(40, arcKm / vTaxi));
    const steps = Math.max(12, Math.ceil(taxiS / 5));
    const t0 = state.t;
    for (let i = 0; i <= steps; i++) {
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
        i < steps,
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
