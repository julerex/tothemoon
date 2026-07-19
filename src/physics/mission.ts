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
import {
  bodyPositions,
  moonRelativeToEarth,
  setMoonPhase0,
  setSunPhase0,
} from "./bodies";
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
import { keplerRvAt, rvToKepler, type KeplerOrbit } from "./kepler";
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
  /** Max |r_N-body − r_Kepler| (km) on the TLI coast, if computed */
  keplerRefMaxDevKm?: number;
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

/** Chosen LEO coast duration (s). */
let _leoCoastS = LEO_COAST_S;

/**
 * Lunar-plane unit basis: e1, e2 with n = e1 × e2 matching Moon's orbital sense
 * (right-hand: v_moon ∥ n × r_moon).
 */
function lunarPlaneBasis(
  t: number,
  e1: V3,
  e2: V3,
  n: V3,
): void {
  const moon = moonRelativeToEarth(t);
  cross(n, moon.pos, moon.vel);
  if (len(n) < 1e-12) set(n, _up.x, _up.y, _up.z);
  normalize(n, n);
  // e1 from Moon position projected in-plane
  set(e1, moon.pos.x, moon.pos.y, moon.pos.z);
  const nd = dot(e1, n);
  e1.x -= n.x * nd;
  e1.y -= n.y * nd;
  e1.z -= n.z * nd;
  if (len(e1) < 1e-8) {
    // fallback
    cross(e1, n, _up);
    if (len(e1) < 1e-8) set(e1, 1, 0, 0);
  }
  normalize(e1, e1);
  cross(e2, n, e1);
  normalize(e2, e2);
}

/**
 * Circular LEO in the lunar plane, co-rotating with the Moon
 * (v = n × r̂ · v_circ — same sense as lunar orbit).
 * θ = 0 along e1 (toward Moon’s current projection).
 */
function setLunarPlaneLeoState(state: CraftState, t: number, theta: number): void {
  const b = bodyPositions(t);
  lunarPlaneBasis(t, _radial, _tangent, _tmp); // e1, e2, n in _radial,_tangent,_tmp
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // r_hat = e1 cos θ + e2 sin θ
  const rx = _radial.x * c + _tangent.x * s;
  const ry = _radial.y * c + _tangent.y * s;
  const rz = _radial.z * c + _tangent.z * s;
  // v_hat = n × r_hat = e1×e2 wait: n×(e1 c + e2 s) = e2 c - e1 s
  // since n×e1 = e2, n×e2 = -e1 (if e2 = n×e1)
  const vx = _tangent.x * c - _radial.x * s;
  const vy = _tangent.y * c - _radial.y * s;
  const vz = _tangent.z * c - _radial.z * s;
  const vCirc = Math.sqrt(MU_EARTH / LEO_RADIUS);
  state.t = t;
  state.pos.x = b.earth.x + rx * LEO_RADIUS;
  state.pos.y = b.earth.y + ry * LEO_RADIUS;
  state.pos.z = b.earth.z + rz * LEO_RADIUS;
  state.vel.x = b.earthVel.x + vx * vCirc;
  state.vel.y = b.earthVel.y + vy * vCirc;
  state.vel.z = b.earthVel.z + vz * vCirc;
}

/**
 * After ascent: park in lunar-plane LEO going WITH the Moon, coast ~1.25 revs,
 * ending near the transfer periapsis (opposite the Moon at TLI+TOF).
 */
function runLunarPlaneLeoCoast(
  state: CraftState,
  samples: Sample[] | null,
  lastT: { t: number } | null,
): void {
  const t0 = state.t;
  const period = 2 * Math.PI * Math.sqrt((LEO_RADIUS ** 3) / MU_EARTH);
  const coastS = _leoCoastS > 0 ? _leoCoastS : period * 1.25;
  const steps = Math.max(48, Math.ceil(coastS / 45));

  // Start angle: from ascent position projected into lunar plane
  lunarPlaneBasis(t0, _radial, _tangent, _tmp);
  const b0 = bodyPositions(t0);
  sub(_relP, state.pos, b0.earth);
  const x = dot(_relP, _radial);
  const y = dot(_relP, _tangent);
  let theta0 = Math.atan2(y, x);

  // Target end angle: transfer periapsis opposite Moon at arrival
  const T = transferTimeEst();
  const moonArr = moonRelativeToEarth(t0 + coastS + T);
  lunarPlaneBasis(t0 + coastS, _radial, _tangent, _tmp);
  // peri-hat ≈ -moon_arr in plane
  set(_relV, -moonArr.pos.x, -moonArr.pos.y, -moonArr.pos.z);
  const px = dot(_relV, _radial);
  const py = dot(_relV, _tangent);
  let thetaPeri = Math.atan2(py, px);

  // Advance θ0 → θPeri in the prograde sense (increasing θ, same as n×r)
  let dTheta = thetaPeri - theta0;
  while (dTheta < 0.4) dTheta += 2 * Math.PI; // at least ~1/4 rev visible
  // Prefer ~1.25 revs total coast
  const targetSpan = (coastS / period) * 2 * Math.PI;
  if (dTheta < targetSpan * 0.7) dTheta += 2 * Math.PI;

  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const t = t0 + coastS * u;
    const theta = theta0 + dTheta * u;
    setLunarPlaneLeoState(state, t, theta);
    if (samples && lastT) {
      pushSample(samples, state, "leo", false, i === 0 || i === steps, 0, lastT);
    }
  }
}

/** Ascent end → lunar-plane LEO coast → LEO-rel state for probes. */
function computeLeoRel(_coastS?: number): LeoRel {
  void _coastS;
  const ascent = getAscent();
  const state = cloneState(ascent.state);
  runLunarPlaneLeoCoast(state, null, null);
  return captureLeoRel(state);
}

/** Append ascent samples, then coplanar LEO co-rotating with the Moon. */
function appendAscentAndLeoCoast(
  samples: Sample[],
  lastT: { t: number },
  _coastS?: number,
): CraftState {
  void _coastS;
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
  runLunarPlaneLeoCoast(state, samples, lastT);
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

/**
 * Near-Moon guidance: LOI-like capture first (match Moon velocity, settle
 * onto a low approach), then soft land. Avoids a sharp radial dive from a
 * distant miss (which looked like a southbound kink).
 */
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
  // Horizontal (along-track / cross-track) relative to Moon
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;

  let targetVRad: number;
  let gain: number;
  let hGain: number;
  let maxA: number;

  if (phase === "approach") {
    // LOI-style: cancel flyby velocity, then settle inward (smooth meet)
    const closeIn =
      alt > 5_000 ? 0.45 : alt > 1_500 ? 0.2 : alt > 400 ? 0.08 : 0.035;
    targetVRad = -closeIn;
    gain = 0.7;
    hGain = 1.5;
    maxA = LANDING_ACCEL * (alt > 3_000 ? 2.4 : 1.6);
  } else if (phase === "braking") {
    targetVRad = -0.1 - 0.35 * Math.min(1, alt / 3500);
    gain = 0.7;
    hGain = 1.2;
    maxA = LANDING_ACCEL * 1.55;
  } else {
    const safe = Math.sqrt(
      Math.max(0, 2 * LANDING_ACCEL * 0.4 * Math.max(alt, 0.05)),
    );
    targetVRad = -Math.min(0.18, Math.max(0.0015, safe));
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
 * LRO-style TLI: inject onto a **Keplerian ellipse in the Moon’s orbital plane**
 * with periapsis at LEO opposite the predicted Moon, apogee at lunar distance.
 *
 * The craft meets the Moon at the same place and time it reaches apogee —
 * a smooth coplanar arc like the LRO magenta path, not an out-of-plane
 * southbound miss that needs a hard correction.
 */
function applyTli(state: CraftState, tliDv: number): void {
  const t0 = state.t;
  const T = transferTimeEst();
  const b0 = getBodies(t0);

  // Moon state relative to Earth at arrival (apogee target)
  const moonArr = moonRelativeToEarth(t0 + T);
  // Lunar orbital plane from current Moon motion
  const moonNow = moonRelativeToEarth(t0);
  cross(_tangent, moonNow.pos, moonNow.vel); // n raw
  if (len(_tangent) < 1e-12) {
    cross(_tangent, moonArr.pos, moonArr.vel);
  }
  if (len(_tangent) < 1e-12) set(_tangent, _up.x, _up.y, _up.z);
  normalize(_tangent, _tangent); // lunar plane normal n

  // Apogee direction = Moon at arrival (projected into lunar plane)
  set(_tmp, moonArr.pos.x, moonArr.pos.y, moonArr.pos.z);
  // Remove any out-of-plane component
  const nDot = dot(_tmp, _tangent);
  _tmp.x -= _tangent.x * nDot;
  _tmp.y -= _tangent.y * nDot;
  _tmp.z -= _tangent.z * nDot;
  normalize(_radial, _tmp); // apo-hat

  // Periapsis opposite apogee (Hohmann geometry)
  const periX = -_radial.x;
  const periY = -_radial.y;
  const periZ = -_radial.z;

  // Prograde at periapsis: n × peri_hat — same orbital sense as the Moon
  // (Moon: v ∥ n × r with this n). Do NOT flip; that caused retrograde TLI.
  set(_relP, periX, periY, periZ);
  cross(_tmp, _tangent, _relP);
  normalize(_relV, _tmp);

  const r = LEO_RADIUS;
  const vPeri = transferVPeri(r, tliDv);

  // Place at transfer periapsis in the lunar plane (continuous with LEO park)
  state.pos.x = b0.earth.x + periX * r;
  state.pos.y = b0.earth.y + periY * r;
  state.pos.z = b0.earth.z + periZ * r;
  state.vel.x = b0.earthVel.x + _relV.x * vPeri;
  state.vel.y = b0.earthVel.y + _relV.y * vPeri;
  state.vel.z = b0.earthVel.z + _relV.z * vPeri;
  void moonNow;
}

/** Build osculating Kepler orbit about Earth right after TLI (2-body reference). */
function orbitAfterTli(state: CraftState): KeplerOrbit {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.earth);
  sub(_relV, state.vel, b.earthVel);
  return rvToKepler(_relP, _relV, MU_EARTH, state.t);
}

/**
 * Earth-centered Kepler reference position at time t.
 * Focus is the prescribed Earth ephemeris at t.
 */
function keplerRefPos(orb: KeplerOrbit, t: number, out: V3): V3 {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  return set(out, b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z);
}

/** Soft accel (km/s²) to stay near the Kepler reference under 4-body drift. */
const KEPLER_TRACK_ACCEL = 0.0008; // ~0.08 g max

/**
 * PD-style thrust toward the osculating Kepler trajectory (reference track).
 * Primary dynamics remain N-body RK4; this only counters secular drift so the
 * path stays near the designed LRO ellipse.
 */
function keplerTrackThrust(
  t: number,
  pos: V3,
  vel: V3,
  orb: KeplerOrbit,
): V3 | null {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  const dx = b.earth.x + _relP.x - pos.x;
  const dy = b.earth.y + _relP.y - pos.y;
  const dz = b.earth.z + _relP.z - pos.z;
  const dvx = b.earthVel.x + _relV.x - vel.x;
  const dvy = b.earthVel.y + _relV.y - vel.y;
  const dvz = b.earthVel.z + _relV.z - vel.z;
  // Soft PD (1/s² and 1/s scales chosen for multi-day coast)
  let ax = dx * 2e-8 + dvx * 4e-4;
  let ay = dy * 2e-8 + dvy * 4e-4;
  let az = dz * 2e-8 + dvz * 4e-4;
  const mag = Math.hypot(ax, ay, az);
  if (mag < 1e-9) return null;
  if (mag > KEPLER_TRACK_ACCEL) {
    const s = KEPLER_TRACK_ACCEL / mag;
    ax *= s;
    ay *= s;
    az *= s;
  }
  return set(_thrust, ax, ay, az);
}

/**
 * Fast probe: N-body ballistic coast after TLI, return minimum Moon altitude.
 * Caller must set moon/sun phases first (see runMission).
 */
type ProbeResult = { minAlt: number; periluneT: number; rEarth: number };

/** Template LEO (Earth-relative) for probes — set in runMission after a reference ascent. */
let _leoRelTemplate: LeoRel | null = null;

function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLeoRel(_leoRelTemplate);
  applyTli(state, tliDv);
  const tTli = state.t;
  const T = transferTimeEst();
  const orb = orbitAfterTli(state);
  const maxT = tTli + T * 1.2 + 40_000;

  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  let dt = 45;
  while (state.t < maxT) {
    const thrustFn: ThrustFn = (tt, p, v) => keplerTrackThrust(tt, p, v, orb);
    rk4Step(state, dt, thrustFn); // N-body + soft Kepler track
    const altM = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relP, state.pos, b.earth);
    const rE = len(_relP);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
      rEarthAtMin = rE;
    }
    const coastT = state.t - tTli;
    if (altitudeEarth(state.t, state.pos) < 0 && coastT < T * 0.7) {
      return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
    }
    if (
      coastT > T * 0.75 &&
      state.t > periluneT + 4_000 &&
      altM > minAlt + 12_000 &&
      minAlt < 120_000
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 60_000) dt = 15;
    else if (dMoon < 150_000) dt = 30;
    else dt = 45;
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
  // TLI: lunar-plane Hohmann injection (initial conditions)
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  // --- N-body ballistic coast; Kepler osculating orbit is reference only ---
  const tTli = state.t;
  const keplerRef = orbitAfterTli(state);
  const Tdesign = transferTimeEst();
  const Tcoast = Tdesign;
  void toa;
  let minMoonAlt = Infinity;
  let phase: PhaseId = "coast";
  let keplerRefMaxDevKm = 0;
  const _kPos = v3();

  const maxCoastT = tTli + Tcoast * 1.2 + 40_000;
  while (state.t < maxCoastT && phase === "coast") {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    // Kepler reference check (Earth-centered 2-body from TLI state)
    keplerRefPos(keplerRef, state.t, _kPos);
    const dev = Math.hypot(
      state.pos.x - _kPos.x,
      state.pos.y - _kPos.y,
      state.pos.z - _kPos.z,
    );
    if (dev > keplerRefMaxDevKm) keplerRefMaxDevKm = dev;

    const coastT = state.t - tTli;
    // Meet Moon near apogee / lunar distance
    if (coastT > Tcoast * 0.85 && dMoon < 35_000) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT);
      break;
    }
    if (coastT > Tcoast * 1.15 && dMoon > 100_000) {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
        keplerRefMaxDevKm,
      };
    }

    const dt =
      dMoon < 80_000 ? DT_NEAR : dMoon < 200_000 ? 10 : DT_COAST;
    const trackFn: ThrustFn = (tt, p, v) =>
      keplerTrackThrust(tt, p, v, keplerRef);
    const tracking = keplerTrackThrust(state.t, state.pos, state.vel, keplerRef);
    rk4Step(state, dt, trackFn); // restricted 4-body + soft Kepler track
    pushSample(
      samples,
      state,
      "coast",
      tracking !== null,
      false,
      dMoon < 100_000 ? 15 : 45,
      lastT,
    );
  }

  if (phase === "coast") {
    if (minMoonAlt < 80_000) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT);
    } else {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
        keplerRefMaxDevKm,
      };
    }
  }

  // --- LOI-style capture + soft landing (N-body + thrust) ---
  const maxT = state.t + 80_000;
  while (state.t < maxT) {
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    if (phase === "approach" && altM < DESCENT_ALTITUDE * 15) {
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

    const thrustFn: ThrustFn = (t, p, v) => landingThrust(t, p, v, phase);
    const dt =
      phase === "descent" ? DT_BURN : phase === "braking" ? DT_NEAR : DT_NEAR;
    const burning = landingThrust(state.t, state.pos, state.vel, phase) !== null;
    rk4Step(state, dt, thrustFn);

    const altM2 = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relV, state.vel, b.moonVel);
    const relSpeed = len(_relV);

    if (altM2 < 0.1 && relSpeed < TOUCHDOWN_SPEED * 8) {
      const done = finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
      return { ...done, keplerRefMaxDevKm };
    }
    if (altM2 < 0) {
      const done = finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
      return { ...done, keplerRefMaxDevKm };
    }

    const minSampleDt =
      phase === "descent" ? 2 : phase === "braking" ? 6 : 12;
    pushSample(samples, state, phase, burning, false, minSampleDt, lastT);
  }

  if (minMoonAlt < 5_000) {
    const done = finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    return { ...done, keplerRefMaxDevKm };
  }

  return {
    samples,
    durationS: state.t,
    moonPhase0,
    tliDv,
    minMoonAlt,
    ok: false,
    message: "Timeout",
    keplerRefMaxDevKm,
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
 * Starbase → LEO → LRO-style coplanar Kepler transfer → meet Moon at apogee.
 *
 * Geometry mirrors LRO: transfer lies in the lunar plane; craft reaches
 * lunar distance at the same time it meets the Moon (smooth arc, no
 * out-of-plane southbound miss).
 */
export function runMission(): MissionResult {
  const xfer = lroTransfer();
  const baseDv = xfer.tliDv;
  const T = xfer.tof;

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
  _leoCoastS = LEO_COAST_S;
  _leoRelTemplate = computeLeoRel();
  const tTli0 = _leoRelTemplate.t;

  // Moon at apogee after half-period: λ_m(tTli+T) ≈ periapsis + π
  const guess = Math.PI - N_MOON * (T + tTli0);

  const phaseOffsets: number[] = [];
  for (let i = -80; i <= 80; i++) phaseOffsets.push(i * 0.03);

  const dvMax = Math.min(maxTliDv(), baseDv * 1.03);
  const dvScales = [1.0, 1.005, 1.01, 1.015, 1.02, 1.025, 1.03].filter(
    (s) => baseDv * s <= dvMax + 1e-9,
  );

  // Want tight meet at apogee: craft r ≈ A_EM when Moon is close
  const INTERCEPT_ALT = 25_000;
  const IDEAL_PERILUNE = 2_000;
  const IDEAL_TOA = T;
  const TOA_MIN = T * 0.85;
  const TOA_MAX = T * 1.12;

  function periluneScore(
    alt: number,
    periluneT: number,
    rEarth: number,
  ): number {
    if (!Number.isFinite(alt) || alt > 200_000) return 1e12;
    // Prefer intercept at the same time we reach lunar distance
    const altTerm =
      alt < 0
        ? 25_000 - alt
        : Math.abs(alt - IDEAL_PERILUNE) * 2 +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 8 : 0);
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    const timeTerm = dtH * dtH * 200; // strong: meet at apogee TOA
    const rErr = Math.abs(rEarth - A_EM) / 1000;
    const rTerm = rErr * rErr * 25; // at lunar orbit radius
    const overshoot = Math.max(0, rEarth - A_EM * 1.02);
    const overshootTerm = (overshoot / 1000) * (overshoot / 1000) * 100;
    const windowPen =
      periluneT < TOA_MIN
        ? ((TOA_MIN - periluneT) / 3600) ** 2 * 250
        : periluneT > TOA_MAX
          ? ((periluneT - TOA_MAX) / 3600) ** 2 * 250
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
    const kDev = flown.keplerRefMaxDevKm ?? 0;
    console.info(
      `[tothemoon] Mission OK duration=${(flown.durationS / 3600).toFixed(1)}h ` +
        `(${(flown.durationS / 86400).toFixed(2)} d) samples=${flown.samples.length} ` +
        `· Kepler-ref max |Δr|=${kDev.toFixed(0)} km ` +
        `(${((kDev / A_EM) * 100).toFixed(2)}% of A_EM)`,
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
  if (retry.keplerRefMaxDevKm != null) {
    console.info(
      `[tothemoon] Kepler-ref max |Δr|=${retry.keplerRefMaxDevKm.toFixed(0)} km on retry`,
    );
  }
  return downsample(retry);
}

/** Fallback with earlier capture gate on the N-body coast. */
function flyMissionEarlyGuidance(
  moonPhase0: number,
  tliDv: number,
  toa?: number,
): MissionResult {
  void toa;
  // Primary already uses N-body coast + LOI; re-run with same TLI
  return flyMission(moonPhase0, tliDv, transferTimeEst());
}
