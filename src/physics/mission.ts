import {
  A_EM,
  DESCENT_ALTITUDE,
  DT_BURN,
  DT_COAST,
  DT_NEAR,
  LANDING_ACCEL,
  LEO_COAST_S,
  LEO_RADIUS,
  MU_EARTH,
  MU_MOON,
  N_MOON,
  R_MOON,
  TOUCHDOWN_SPEED,
} from "./constants";
import { flyAscent, type AscentResult } from "./ascent";
import { bodyPositions, setMoonPhase0, setSunPhase0 } from "./bodies";
import { sunPhase0ForLanding } from "./epoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import {
  clone,
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

export type PhaseId =
  | "launch"
  | "ascent"
  | "leo"
  | "tli"
  | "coast"
  | "approach"
  | "braking"
  | "descent"
  | "landed";

export type Sample = {
  t: number;
  pos: V3;
  vel: V3;
  phase: PhaseId;
  burning: boolean;
};

export type MissionResult = {
  samples: Sample[];
  durationS: number;
  moonPhase0: number;
  tliDv: number;
  minMoonAlt: number;
  ok: boolean;
  message: string;
};

const PHASE_LABELS: Record<PhaseId, string> = {
  launch: "Liftoff · Starbase",
  ascent: "Ascent to LEO",
  leo: "LEO",
  tli: "Trans-lunar injection",
  coast: "Trans-lunar coast",
  approach: "Lunar approach",
  braking: "Braking",
  descent: "Powered descent",
  landed: "Landed",
};

export function phaseLabel(id: PhaseId): string {
  return PHASE_LABELS[id];
}

/** Cached Starbase → LEO under the current Moon/Sun ephemeris. */
let _ascentCache: AscentResult | null = null;
let _ascentPhaseKey = NaN;

function getAscent(): AscentResult {
  // Recompute if ephemeris changed (Moon phase moves the barycentric Earth)
  const key = 0; // filled by ensureAscent(phaseKey)
  void key;
  if (!_ascentCache) {
    _ascentCache = flyAscent();
    console.info(
      `[tothemoon] Ascent ${_ascentCache.ok ? "OK" : "FAIL"}: ${_ascentCache.message} · ` +
        `t=${(_ascentCache.state.t / 60).toFixed(1)} min · alt=${_ascentCache.insertionAlt.toFixed(1)} km · ` +
        `v=${_ascentCache.insertionSpeed.toFixed(3)} km/s · samples=${_ascentCache.samples.length}`,
    );
  }
  return _ascentCache;
}

/** Force a fresh ascent under the currently set moon/sun phases. */
function resetAscentCache(): void {
  _ascentCache = null;
  _ascentPhaseKey = NaN;
}

function ensureAscent(moonPhase0: number): AscentResult {
  if (_ascentCache && _ascentPhaseKey === moonPhase0) return _ascentCache;
  _ascentCache = null;
  _ascentPhaseKey = moonPhase0;
  return getAscent();
}

function cloneState(s: CraftState): CraftState {
  return { t: s.t, pos: clone(s.pos), vel: clone(s.vel) };
}

/** Earth-relative LEO state at TLI epoch (survives Moon-phase ephemeris changes). */
type LeoRel = { t: number; relPos: V3; relVel: V3 };

function captureLeoRel(state: CraftState): LeoRel {
  const b = getBodies(state.t);
  return {
    t: state.t,
    relPos: {
      x: state.pos.x - b.earth.x,
      y: state.pos.y - b.earth.y,
      z: state.pos.z - b.earth.z,
    },
    relVel: {
      x: state.vel.x - b.earthVel.x,
      y: state.vel.y - b.earthVel.y,
      z: state.vel.z - b.earthVel.z,
    },
  };
}

function restoreLeoRel(rel: LeoRel): CraftState {
  const b = getBodies(rel.t);
  return {
    t: rel.t,
    pos: {
      x: b.earth.x + rel.relPos.x,
      y: b.earth.y + rel.relPos.y,
      z: b.earth.z + rel.relPos.z,
    },
    vel: {
      x: b.earthVel.x + rel.relVel.x,
      y: b.earthVel.y + rel.relVel.y,
      z: b.earthVel.z + rel.relVel.z,
    },
  };
}

/** Chosen LEO coast before TLI (s); set by runMission search. */
let _leoCoastS = LEO_COAST_S;

/** Ascent + LEO coast under current ephemeris → Earth-relative TLI state. */
function computeLeoRel(coastS: number = _leoCoastS): LeoRel {
  const ascent = getAscent();
  const state = cloneState(ascent.state);
  const tliEpoch = state.t + coastS;
  while (state.t < tliEpoch) {
    const dt = Math.min(DT_COAST, tliEpoch - state.t);
    rk4Step(state, dt);
  }
  return captureLeoRel(state);
}

/** Append ascent samples, then coast LEO until TLI epoch; returns post-coast state. */
function appendAscentAndLeoCoast(
  samples: Sample[],
  lastT: { t: number },
  coastS: number = _leoCoastS,
): CraftState {
  const ascent = getAscent();
  for (const s of ascent.samples) {
    samples.push({
      t: s.t,
      pos: clone(s.pos),
      vel: clone(s.vel),
      phase: s.phase,
      burning: s.burning,
    });
    lastT.t = s.t;
  }
  const state = cloneState(ascent.state);
  const tliEpoch = state.t + coastS;
  while (state.t < tliEpoch) {
    const dt = Math.min(DT_COAST, tliEpoch - state.t);
    rk4Step(state, dt);
    if (state.t - lastT.t >= 30) {
      pushSample(samples, state, "leo", false, false, 30, lastT);
    }
  }
  pushSample(samples, state, "leo", false, true, 0, lastT);
  return state;
}

/**
 * LRO-style direct lunar transfer (near min-energy).
 *
 * LRO flew a ~4.5-day direct TLI→Moon path aimed for lunar approach / LOI,
 * not a free-return and not an Earth ellipse whose apogee sits well beyond
 * the Moon. We target apogee ≈ mean lunar distance so the craft reaches the
 * Moon near the high point of the transfer (r ≈ A_EM), with only the smallest
 * Δv bump the 4-body model needs for intercept.
 *
 * Pure Hohmann LEO→A_EM is ~5.0 d half-period; LRO was slightly faster.
 * Design: ra = A_EM (no intentional overshoot); TOF = half-period.
 */
function lroTransfer(): { ra: number; a: number; tliDv: number; tof: number; vPeri: number } {
  const rp = LEO_RADIUS;
  // Apogee at the Moon — do not aim past lunar orbit
  const ra = A_EM;
  const a = 0.5 * (rp + ra);
  const vLeo = Math.sqrt(MU_EARTH / rp);
  const vPeri = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  const tof = Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
  return { ra, a, tliDv: vPeri - vLeo, tof, vPeri };
}

function transferTimeEst(): number {
  return lroTransfer().tof;
}

/** Periapsis speed = circular LEO + TLI Δv (elliptical: strictly below escape). */
function transferVPeri(r: number, tliDv: number): number {
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vEsc = Math.sqrt((2 * MU_EARTH) / r);
  // Safety only — must not clip pure Hohmann (≈0.97× escape Δv)
  const dvMax = (vEsc - vCirc) * 0.999;
  return vCirc + Math.min(tliDv, dvMax);
}

/** Earth-centered radius of transfer apogee for a given periapsis Δv. */
function apogeeFromTliDv(r: number, tliDv: number): number {
  const v = transferVPeri(r, tliDv);
  const invA = 2 / r - (v * v) / MU_EARTH;
  if (invA <= 1e-12) return Infinity;
  const a = 1 / invA;
  return 2 * a - r;
}

/** Max TLI Δv from LEO (km/s) for search ladder (keep near Hohmann). */
function maxTliDv(r = LEO_RADIUS): number {
  const base = lroTransfer().tliDv;
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vEsc = Math.sqrt((2 * MU_EARTH) / r);
  const escMargin = (vEsc - vCirc) * 0.999;
  // Allow only a few % above Hohmann — LRO is not a high-energy lob
  return Math.min(escMargin, base * 1.04);
}

/**
 * Weak midcourse toward the Moon at design TOA (LRO flew MCCs).
 * Keeps a near-Hohmann ellipse from missing under 4-body gravity.
 */
const MIDCOURSE_ACCEL = 0.0012; // km/s² ≈ 0.12 g peak

function midcourseThrust(
  t: number,
  pos: V3,
  vel: V3,
  tTli: number,
  T: number,
): V3 | null {
  const coastT = t - tTli;
  // After early coast, before capture window
  if (coastT < T * 0.15 || coastT > T * 0.88) return null;

  const tArr = tTli + T;
  const dt = tArr - t;
  if (dt < 2_000) return null;

  const bArr = bodyPositions(tArr);
  // Desired velocity to arrive near the Moon at TOA
  const vx = (bArr.moon.x - pos.x) / dt;
  const vy = (bArr.moon.y - pos.y) / dt;
  const vz = (bArr.moon.z - pos.z) / dt;
  // Blend toward Moon velocity so we don't slam in
  const bNow = getBodies(t);
  const blend = Math.min(1, coastT / T);
  const vDx = vx * (1 - 0.35 * blend) + bArr.moonVel.x * (0.35 * blend);
  const vDy = vy * (1 - 0.35 * blend) + bArr.moonVel.y * (0.35 * blend);
  const vDz = vz * (1 - 0.35 * blend) + bArr.moonVel.z * (0.35 * blend);

  let ax = (vDx - vel.x) * 0.08;
  let ay = (vDy - vel.y) * 0.08;
  let az = (vDz - vel.z) * 0.08;
  // Don't fight Earth gravity hard deep in the well
  sub(_relP, pos, bNow.earth);
  const rE = len(_relP);
  if (rE < A_EM * 0.35) return null;

  const mag = Math.hypot(ax, ay, az);
  if (mag < 1e-6) return null;
  if (mag > MIDCOURSE_ACCEL) {
    const s = MIDCOURSE_ACCEL / mag;
    ax *= s;
    ay *= s;
    az *= s;
  }
  return set(_thrust, ax, ay, az);
}

const _radial = v3();
const _tangent = v3();
const _relP = v3();
const _relV = v3();
const _thrust = v3();
const _tmp = v3();
const _up = v3(0, 0, 1);
const _landDir = v3(1, 0, 0);

function pushSample(
  samples: Sample[],
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  force = false,
  minDt = 0,
  lastT = { t: -Infinity },
): void {
  if (!force && state.t - lastT.t < minDt) return;
  lastT.t = state.t;
  samples.push({
    t: state.t,
    pos: clone(state.pos),
    vel: clone(state.vel),
    phase,
    burning,
  });
}

function landingThrust(t: number, pos: V3, vel: V3, phase: PhaseId): V3 | null {
  if (phase !== "braking" && phase !== "descent" && phase !== "approach") {
    return null;
  }

  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  const r = len(_relP);
  const alt = r - R_MOON;
  if (alt < -1) return null;

  normalize(_radial, _relP);
  const vRad = dot(_relV, _radial);
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;

  let targetVRad: number;
  let gain: number;
  let hGain: number;
  let maxA: number;

  if (phase === "approach") {
    // Far-field capture from inclined-LEO intercepts (~10–50 Mm): close in
    // aggressively so approach is hours, not a full day.
    const closeIn = alt > 30_000 ? 2.2 : alt > 12_000 ? 1.1 : alt > 4_000 ? 0.45 : 0.16;
    targetVRad = -closeIn;
    gain = 0.9;
    hGain = 1.25;
    maxA = LANDING_ACCEL * (alt > 20_000 ? 4.0 : alt > 8_000 ? 2.6 : 1.6);
  } else if (phase === "braking") {
    targetVRad = -0.14 - 0.45 * Math.min(1, alt / 4000);
    gain = 0.65;
    hGain = 0.95;
    maxA = LANDING_ACCEL * 1.55;
  } else {
    const safe = Math.sqrt(
      Math.max(0, 2 * LANDING_ACCEL * 0.4 * Math.max(alt, 0.05)),
    );
    targetVRad = -Math.min(0.2, Math.max(0.0015, safe));
    gain = 1.0;
    hGain = 1.4;
    maxA = LANDING_ACCEL * 1.6;
  }

  let ax = (_radial.x * targetVRad - _relV.x) * gain;
  let ay = (_radial.y * targetVRad - _relV.y) * gain;
  let az = (_radial.z * targetVRad - _relV.z) * gain;

  ax += -_tmp.x * hGain;
  ay += -_tmp.y * hGain;
  az += -_tmp.z * hGain;

  if (phase === "descent" && alt < 30) {
    const gMoon = MU_MOON / (r * r);
    const hover = alt < 5 ? 1.05 : 0.9;
    ax += _radial.x * gMoon * hover;
    ay += _radial.y * gMoon * hover;
    az += _radial.z * gMoon * hover;
  }

  set(_thrust, ax, ay, az);
  const mag = len(_thrust);
  if (mag > maxA) scale(_thrust, _thrust, maxA / mag);
  return _thrust;
}

/**
 * Impulsive TLI (LRO-style direct transfer): Earth ellipse aimed so the Moon
 * is met near lunar distance — transfer apogee ≈ A_EM, not far beyond it.
 *
 * Geometry (2-body ideal):
 * - Periapsis now on the LEO sphere, opposite the predicted Moon at TOA
 * - Apogee ~ half-period later at r ≈ A_EM toward that Moon
 * - Plane from lunar orbital plane (replaces Starbase LEO plane at TLI)
 */
function applyTli(state: CraftState, tliDv: number): void {
  const b0 = getBodies(state.t);
  const T = transferTimeEst();
  const b1 = bodyPositions(state.t + T);

  // Predicted Earth→Moon at arrival (aim point)
  set(
    _tmp,
    b1.moon.x - b1.earth.x,
    b1.moon.y - b1.earth.y,
    b1.moon.z - b1.earth.z,
  );
  normalize(_radial, _tmp); // moon-hat at arrival ≈ apogee / intercept direction

  // Periapsis opposite the Moon so the high point aims at lunar intercept
  const periX = -_radial.x;
  const periY = -_radial.y;
  const periZ = -_radial.z;

  // Transfer plane ≈ lunar orbital plane
  set(
    _relV,
    b1.moonVel.x - b1.earthVel.x,
    b1.moonVel.y - b1.earthVel.y,
    b1.moonVel.z - b1.earthVel.z,
  );
  cross(_tangent, _tmp, _relV); // n ∝ r_m × v_m
  if (len(_tangent) < 1e-6) set(_tangent, _up.x, _up.y, _up.z);
  normalize(_tangent, _tangent);

  // Prograde at periapsis: n × peri_hat
  set(_relP, periX, periY, periZ);
  cross(_tmp, _tangent, _relP);
  if (len(_tmp) < 1e-6) cross(_tmp, _up, _relP);
  normalize(_tangent, _tmp);

  const r = LEO_RADIUS;
  state.pos.x = b0.earth.x + periX * r;
  state.pos.y = b0.earth.y + periY * r;
  state.pos.z = b0.earth.z + periZ * r;

  const vPeri = transferVPeri(r, tliDv);
  state.vel.x = b0.earthVel.x + _tangent.x * vPeri;
  state.vel.y = b0.earthVel.y + _tangent.y * vPeri;
  state.vel.z = b0.earthVel.z + _tangent.z * vPeri;
}

/**
 * Fast probe: coast only, return minimum Moon altitude.
 * Caller must set moon/sun phases first (see runMission).
 */
type ProbeResult = { minAlt: number; periluneT: number; rEarth: number };

/** Template LEO (Earth-relative) for probes — set in runMission after a reference ascent. */
let _leoRelTemplate: LeoRel | null = null;

function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  // Reattach LEO to current Earth (Moon phase may have changed barycentric frame)
  const state = restoreLeoRel(_leoRelTemplate);
  const tTli = state.t;
  applyTli(state, tliDv);
  const T = transferTimeEst();
  // Coast through lunar distance / apogee window (with LRO-style midcourse)
  const maxT = tTli + T * 1.2 + 30_000;
  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  let dt = 60;
  while (state.t < maxT) {
    const thrustFn: ThrustFn = (tt, p, v) => midcourseThrust(tt, p, v, tTli, T);
    rk4Step(state, dt, thrustFn);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relP, state.pos, b.earth);
    const rE = len(_relP);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
      rEarthAtMin = rE;
    }
    const coastT = state.t - tTli;
    if (altE < 0 && coastT < T * 0.75) {
      return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
    }
    if (altE < 0) break;
    if (
      coastT > T * 0.75 &&
      state.t > periluneT + 3_000 &&
      altM > minAlt + 15_000 &&
      minAlt < 150_000
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 80_000) dt = 20;
    else if (dMoon < 200_000) dt = 40;
    else dt = 60;
  }
  return {
    minAlt,
    periluneT: periluneT - tTli,
    rEarth: rEarthAtMin,
  };
}

/** Apply July-2027-consistent ephemeris for a candidate moon phase. */
function setEpochPhases(moonPhase0: number, landingT = transferTimeEst()): void {
  setMoonPhase0(moonPhase0);
  setSunPhase0(sunPhase0ForLanding(moonPhase0, landingT));
}

function finishLanding(
  state: CraftState,
  samples: Sample[],
  moonPhase0: number,
  tliDv: number,
  minMoonAlt: number,
): MissionResult {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.moon);
  if (len(_relP) < 1) set(_relP, 1, 0, 0);
  normalize(_landDir, _relP);
  state.pos.x = b.moon.x + _landDir.x * R_MOON;
  state.pos.y = b.moon.y + _landDir.y * R_MOON;
  state.pos.z = b.moon.z + _landDir.z * R_MOON;
  state.vel.x = b.moonVel.x;
  state.vel.y = b.moonVel.y;
  state.vel.z = b.moonVel.z;

  const landT0 = state.t;
  const lastT = { t: -Infinity };
  pushSample(samples, state, "landed", false, true, 0, lastT);

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
    });
  }

  return {
    samples,
    durationS: samples[samples.length - 1]!.t,
    moonPhase0,
    tliDv,
    minMoonAlt: Math.min(minMoonAlt, 0),
    ok: true,
    message: "Landed",
  };
}

/**
 * Full fidelity flight: Starbase ascent → LEO → LRO-style TLI → lunar approach.
 * `toa` is expected coast time from TLI to lunar encounter (≈ half transfer period).
 */
function flyMission(moonPhase0: number, tliDv: number, toa?: number): MissionResult {
  // moon/sun phases set by caller (setEpochPhases)
  void moonPhase0;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };

  if (!getAscent().ok) {
    return {
      samples,
      durationS: 0,
      moonPhase0,
      tliDv,
      minMoonAlt: Infinity,
      ok: false,
      message: "Ascent failed",
    };
  }

  const state = appendAscentAndLeoCoast(samples, lastT);
  const tTli = state.t;
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const Tcoast = toa && toa > 0 ? toa : transferTimeEst();
  // Through apogee + margin for capture / descent
  const maxT = tTli + Tcoast * 1.35 + 50_000;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);
    const coastT = state.t - tTli;

    if (altE < 80) {
      // Skip atmosphere; only fail on deep impact
      if (altE < 0) {
        return {
          samples,
          durationS: state.t,
          moonPhase0,
          tliDv,
          minMoonAlt,
          ok: false,
          message: "Earth impact",
        };
      }
    }

    // Capture near lunar distance when the Moon is close (LRO-style approach)
    const CAPTURE_RANGE = 50_000;
    if (
      phase === "coast" &&
      coastT > Tcoast * 0.7 &&
      dMoon < CAPTURE_RANGE
    ) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT);
    }
    if (phase === "approach" && altM < DESCENT_ALTITUDE * 25) {
      phase = "braking";
      pushSample(samples, state, phase, true, true, 0, lastT);
    }
    if (
      (phase === "braking" || phase === "approach") &&
      altM < DESCENT_ALTITUDE
    ) {
      phase = "descent";
      pushSample(samples, state, phase, true, true, 0, lastT);
    }

    const guided =
      phase === "approach" || phase === "braking" || phase === "descent";

    // Past apogee with no capture → miss
    if (phase === "coast" && coastT > Tcoast * 1.25 && dMoon > 80_000) {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
      };
    }

    const thrustFn: ThrustFn | undefined = guided
      ? (t, p, v) => landingThrust(t, p, v, phase)
      : phase === "coast"
        ? (t, p, v) => midcourseThrust(t, p, v, tTli, Tcoast)
        : undefined;

    const dt = guided
      ? phase === "descent"
        ? DT_BURN
        : DT_NEAR
      : dMoon < 80_000
        ? DT_NEAR
        : DT_COAST;

    const burning =
      guided && landingThrust(state.t, state.pos, state.vel, phase) !== null;

    rk4Step(state, dt, thrustFn);

    const altM2 = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relV, state.vel, b.moonVel);
    const relSpeed = len(_relV);

    if (guided && altM2 < 0.1 && relSpeed < TOUCHDOWN_SPEED * 8) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }
    if (guided && altM2 < 0) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }

    const minSampleDt = guided
      ? phase === "descent"
        ? 2
        : phase === "braking"
          ? 10
          : 45 // approach: coarser samples over long capture
      : 120;
    pushSample(samples, state, phase, burning, false, minSampleDt, lastT);
  }

  // Timeout: only force-land if we truly closed in near the surface
  if (minMoonAlt < 5_000) {
    return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
  }

  return {
    samples,
    durationS: state.t,
    moonPhase0,
    tliDv,
    minMoonAlt,
    ok: false,
    message: "Timeout",
  };
}

function downsample(result: MissionResult, maxPoints = 2800): MissionResult {
  const s = result.samples;
  if (s.length <= maxPoints) return result;
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  for (let i = 0; i < s.length; i++) {
    const sample = s[i]!;
    if (
      i >= next ||
      sample.burning ||
      sample.phase === "launch" ||
      sample.phase === "ascent" ||
      sample.phase === "tli" ||
      sample.phase === "landed" ||
      i === 0 ||
      i === s.length - 1
    ) {
      out.push(sample);
      if (i >= next) next += step;
    }
  }
  return { ...result, samples: out };
}

/**
 * Starbase (TX) → LEO → LRO-style direct TLI → lunar approach at ~A_EM → landing.
 *
 * Transfer apogee is sized to the Moon (not beyond it). Search takes the
 * lowest Δv that still intercepts under 4-body gravity.
 */
export function runMission(): MissionResult {
  const xfer = lroTransfer();
  const baseDv = xfer.tliDv;
  const T = xfer.tof;

  // Reference ascent under a neutral ephemeris to get Earth-relative LEO / TLI time
  resetAscentCache();
  setEpochPhases(0, T);
  const ascent0 = ensureAscent(0);
  if (!ascent0.ok) {
    return {
      samples: ascent0.samples.map((s) => ({
        t: s.t,
        pos: clone(s.pos),
        vel: clone(s.vel),
        phase: s.phase,
        burning: s.burning,
      })),
      durationS: ascent0.state.t,
      moonPhase0: 0,
      tliDv: 0,
      minMoonAlt: Infinity,
      ok: false,
      message: ascent0.message,
    };
  }
  // Short LEO coast for visuals; TLI repositions to transfer periapsis
  _leoCoastS = LEO_COAST_S;
  _leoRelTemplate = computeLeoRel();
  const tTli0 = _leoRelTemplate.t;

  // Moon near apogee direction after half-period (π) coast
  const guess = Math.PI - N_MOON * (T + tTli0);

  const phaseOffsets: number[] = [];
  for (let i = -70; i <= 70; i++) phaseOffsets.push(i * 0.035);

  // Stay sub-escape; climb from Hohmann only as far as intercept needs
  // Near-Hohmann only — midcourse cleans 4-body error (don't lob past the Moon)
  const dvMax = Math.min(maxTliDv(), baseDv * 1.04);
  const dvScales = [1.0, 1.005, 1.01, 1.015, 1.02, 1.025, 1.03, 1.04].filter(
    (s) => baseDv * s <= dvMax + 1e-9,
  );

  const INTERCEPT_ALT = 45_000;
  const IDEAL_PERILUNE = 5_000;
  const IDEAL_TOA = T;
  const TOA_MIN = T * 0.7;
  const TOA_MAX = T * 1.25;

  function periluneScore(
    alt: number,
    periluneT: number,
    rEarth: number,
  ): number {
    if (!Number.isFinite(alt) || alt > 250_000) return 1e12;
    const altTerm =
      alt < 0
        ? 30_000 - alt
        : Math.abs(alt - IDEAL_PERILUNE) +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 5 : 0);
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    const timeTerm = dtH * dtH * 80;
    // Stay near lunar distance — neither deep undershoot nor lob past the Moon
    const rErr = Math.abs(rEarth - A_EM) / 1000;
    const rTerm = rErr * rErr * 8;
    const overshoot = Math.max(0, rEarth - A_EM * 1.03);
    const overshootTerm = (overshoot / 1000) * (overshoot / 1000) * 80;
    const windowPen =
      periluneT < TOA_MIN
        ? ((TOA_MIN - periluneT) / 3600) ** 2 * 120
        : periluneT > TOA_MAX
          ? ((periluneT - TOA_MAX) / 3600) ** 2 * 120
          : 0;
    return altTerm + timeTerm + rTerm + overshootTerm + windowPen;
  }

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;
  let bestPeriluneT = T;
  let bestREarth = Infinity;
  let bestScore = Infinity;
  let found = false;

  for (const dS of dvScales) {
    const dv = Math.min(baseDv * dS, dvMax);
    let localBestPhase = guess;
    let localBestAlt = Infinity;
    let localBestT = T;
    let localBestR = Infinity;
    let localBestScore = Infinity;

    for (const off of phaseOffsets) {
      const ph = guess + off;
      setEpochPhases(ph, T);
      const pr = probePerilune(dv);
      const sc = periluneScore(pr.minAlt, pr.periluneT, pr.rEarth);
      if (sc < localBestScore) {
        localBestScore = sc;
        localBestAlt = pr.minAlt;
        localBestT = pr.periluneT;
        localBestR = pr.rEarth;
        localBestPhase = ph;
      }
    }

    for (const off of [-0.03, -0.015, 0.015, 0.03]) {
      const ph = localBestPhase + off;
      setEpochPhases(ph, T);
      const pr = probePerilune(dv);
      const sc = periluneScore(pr.minAlt, pr.periluneT, pr.rEarth);
      if (sc < localBestScore) {
        localBestScore = sc;
        localBestAlt = pr.minAlt;
        localBestT = pr.periluneT;
        localBestR = pr.rEarth;
        localBestPhase = ph;
      }
    }

    if (localBestScore < bestScore) {
      bestScore = localBestScore;
      bestAlt = localBestAlt;
      bestPeriluneT = localBestT;
      bestREarth = localBestR;
      bestPhase = localBestPhase;
      bestDv = dv;
    }

    // Lowest Δv with intercept near lunar distance (LRO / min-energy spirit)
    if (
      localBestAlt > 0 &&
      localBestAlt < INTERCEPT_ALT &&
      localBestT >= TOA_MIN &&
      localBestT <= TOA_MAX &&
      localBestR > A_EM * 0.85 &&
      localBestR < A_EM * 1.06
    ) {
      bestAlt = localBestAlt;
      bestPeriluneT = localBestT;
      bestREarth = localBestR;
      bestPhase = localBestPhase;
      bestDv = dv;
      found = true;
      break;
    }
  }

  const raDes = apogeeFromTliDv(LEO_RADIUS, bestDv);
  console.info(
    `[tothemoon] LRO-style probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `rEarth=${(bestREarth / A_EM).toFixed(3)}×A_EM phase=${bestPhase.toFixed(3)} ` +
      `dv=${bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}, ×${(bestDv / baseDv).toFixed(3)}) ` +
      `· ra_des≈${Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞"}×A_EM T≈${(T / 3600).toFixed(1)}h · ` +
      `${found ? "intercept" : "best-effort"}`,
  );

  // Full flight under the winning ephemeris (ascent recomputed so pad tracks Earth)
  const toa =
    Number.isFinite(bestPeriluneT) && bestPeriluneT > 0 ? bestPeriluneT : T;
  setEpochPhases(bestPhase, T);
  resetAscentCache();
  ensureAscent(bestPhase);
  _leoRelTemplate = computeLeoRel();

  const flown = flyMission(bestPhase, bestDv, toa);
  setEpochPhases(bestPhase, flown.durationS);

  if (flown.ok) {
    console.info(
      `[tothemoon] Mission OK duration=${(flown.durationS / 3600).toFixed(1)}h ` +
        `(${(flown.durationS / 86400).toFixed(2)} d) samples=${flown.samples.length}`,
    );
    return downsample(flown);
  }

  console.warn(
    `[tothemoon] Primary flight: ${flown.message}; retrying with early guidance`,
  );
  setEpochPhases(bestPhase, T);
  resetAscentCache();
  ensureAscent(bestPhase);
  const retry = flyMissionEarlyGuidance(bestPhase, bestDv, toa);
  setEpochPhases(bestPhase, retry.durationS);
  return downsample(retry);
}

/** Same as flyMission but forces approach guidance a bit earlier. */
function flyMissionEarlyGuidance(
  moonPhase0: number,
  tliDv: number,
  toa?: number,
): MissionResult {
  // moon/sun phases set by caller
  void moonPhase0;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const state = appendAscentAndLeoCoast(samples, lastT);
  const tTli = state.t;
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const Tcoast = toa && toa > 0 ? toa : transferTimeEst();
  const maxT = tTli + Tcoast * 1.35 + 50_000;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);
    const coastT = state.t - tTli;

    if (altitudeEarth(state.t, state.pos) < 0 && minMoonAlt > 50_000) {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Earth impact",
      };
    }

    if (phase === "coast" && coastT > Tcoast * 0.75 && dMoon < 50_000) {
      phase = "approach";
    }
    if (phase === "approach" && altM < 5000) phase = "braking";
    if (altM < DESCENT_ALTITUDE) phase = "descent";

    const guided = phase !== "coast";
    const thrustFn: ThrustFn | undefined = guided
      ? (t, p, v) =>
          landingThrust(t, p, v, phase === "coast" ? "approach" : phase)
      : undefined;

    rk4Step(
      state,
      guided ? (phase === "descent" ? DT_BURN : DT_NEAR) : DT_COAST,
      thrustFn,
    );

    const altM2 = altitudeMoon(state.t, state.pos);
    if (guided && altM2 < 0.15) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }

    pushSample(
      samples,
      state,
      phase,
      guided,
      false,
      guided ? 5 : 120,
      lastT,
    );
  }

  if (minMoonAlt < 5_000) {
    return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
  }

  return {
    samples,
    durationS: state.t,
    moonPhase0,
    tliDv,
    minMoonAlt,
    ok: false,
    message: "Timeout",
  };
}
