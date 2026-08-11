import {
  A_EM,
  DT_BURN,
  LOW_EARTH_ORBIT_RADIUS,
  MU_EARTH,
  R_EARTH,
  R_MOON,
  TRANSLUNAR_INJECTION_ACCEL,
  TRANSLUNAR_INJECTION_BURN_MAX_S,
  TRANSFER_AIM_ALT_KM,
} from "./constants";
import { moonRelativeToEarth, moonSouthUnit } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import { rvToKepler, type KeplerOrbit } from "./kepler";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  burnForce,
  hasPropellant,
  limitAccelByThrust,
  type PropState,
} from "./propellant";
import {
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

const _radial = v3();
const _tangent = v3();
const _relP = v3();
const _relV = v3();
const _tmp = v3();
const _n = v3();
const _pro = v3();
const _thrust = v3();
const _up = v3(0, 0, 1);
const _south = v3();
const _axis = v3();

/**
 * Blend transfer-plane normal toward ecliptic north so the free-coast arc
 * reads more anticlockwise when viewed from the northern hemisphere (+Z).
 * 0 = pure lunar plane; 1 = pure ecliptic equatorial.
 */
export const TRANSFER_PLANE_NORTH_BIAS = 0.32;

/**
 * Advance the line of apsides (rad) about the transfer normal (RH rule).
 * Positive = prograde / anticlockwise from northern view — delays translunar injection along
 * the low Earth orbit arc so free coast crosses the lunar sphere of influence near the Moon’s orbit.
 */
export const APSIS_CCW_BIAS_RAD = 0.55; // ~31.5°

/**
 * Hot free-coast translunar injection (super-Hohmann).
 *
 * Design apogee past the Moon so restricted n-body free coast (tidal Sun)
 * still reaches the lunar region with margin. time of flight ≈ half-period.
 */
export function designLunarTransfer(): {
  ra: number;
  a: number;
  translunarInjectionDeltaV: number;
  tof: number;
  vPeri: number;
} {
  const rp = LOW_EARTH_ORBIT_RADIUS;
  // Hotter inject: more velocity, apo well past mean lunar distance
  const ra = A_EM * 1.35;
  const a = 0.5 * (rp + ra);
  const vLeo = Math.sqrt(MU_EARTH / rp);
  const vPeri = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  const tof = Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
  return { ra, a, translunarInjectionDeltaV: vPeri - vLeo, tof, vPeri };
}

export function transferTimeEst(): number {
  return designLunarTransfer().tof;
}

/**
 * Cap periapsis speed so 2-body apogee stays cislunar (not near-escape).
 */
export function vPeriForRa(r: number, ra: number): number {
  const a = 0.5 * (r + ra);
  return Math.sqrt(MU_EARTH * (2 / r - 1 / a));
}

/**
 * Max design apogee (km) for free-coast translunar injection search ladder.
 * High enough for hot injects; still sub-escape (v/v_esc ≈ 0.996).
 */
export const TRANSLUNAR_INJECTION_APOGEE_CAP = A_EM * 2.0;

/** Periapsis speed = circular low Earth orbit + Translunar injection Δv, capped so ra ≤ TRANSLUNAR_INJECTION_APOGEE_CAP. */
export function transferPeriapsisSpeed(r: number, translunarInjectionDeltaV: number): number {
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vCap = vPeriForRa(r, TRANSLUNAR_INJECTION_APOGEE_CAP);
  const dvCap = Math.max(0, vCap - vCirc);
  return vCirc + Math.min(translunarInjectionDeltaV, dvCap);
}

/** Earth-centered radius of transfer apogee for a given periapsis Δv. */
export function apogeeFromTranslunarInjectionDeltaV(r: number, translunarInjectionDeltaV: number): number {
  const v = transferPeriapsisSpeed(r, translunarInjectionDeltaV);
  const invA = 2 / r - (v * v) / MU_EARTH;
  if (invA <= 1e-12) return Infinity;
  const a = 1 / invA;
  return 2 * a - r;
}

/** Max Translunar injection Δv from low Earth orbit (km/s) — hot free-coast ladder headroom. */
export function maxTranslunarInjectionDeltaV(r = LOW_EARTH_ORBIT_RADIUS): number {
  const base = designLunarTransfer().translunarInjectionDeltaV;
  const vCirc = Math.sqrt(MU_EARTH / r);
  const dvCap = transferPeriapsisSpeed(r, base * 2) - vCirc;
  return Math.min(dvCap, base * 1.06);
}

/** Lunar orbital plane normal at time t (unit), same hemisphere as fallback. */
function lunarPlaneNormal(t: number, out: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): V3 {
  const moon = moonRelativeToEarth(t, epoch);
  cross(out, moon.pos, moon.vel);
  if (len(out) < 1e-12) {
    const arr = moonRelativeToEarth(t + transferTimeEst(), epoch);
    cross(out, arr.pos, arr.vel);
  }
  if (len(out) < 1e-12) set(out, _up.x, _up.y, _up.z);
  return normalize(out, out);
}

/**
 * Earth-relative rendezvous aim at translunar injection+TOF: above the lunar **south pole**
 * at arrival (where the Moon will be).
 */
export function southPoleRendezvousAim(
  tInject: number, out: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const moonArr = moonRelativeToEarth(tInject + transferTimeEst(), epoch);
  moonSouthUnit(_south);
  const rAim = R_MOON + TRANSFER_AIM_ALT_KM;
  return set(out, moonArr.pos.x + _south.x * rAim, moonArr.pos.y + _south.y * rAim, moonArr.pos.z + _south.z * rAim);
}

/**
 * Transfer-plane normal (unit): lunar plane blended toward ecliptic north
 * so free-coast arcs read more anticlockwise from the northern hemisphere.
 */
export function transferPlaneNormal(
  t: number,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  lunarPlaneNormal(t, out, epoch);
  // Keep northern sense before blending
  if (dot(out, _up) < 0) scale(out, out, -1);
  const b = TRANSFER_PLANE_NORTH_BIAS;
  out.x = out.x * (1 - b) + _up.x * b;
  out.y = out.y * (1 - b) + _up.y * b;
  out.z = out.z * (1 - b) + _up.z * b;
  if (len(out) < 1e-12) set(out, _up.x, _up.y, _up.z);
  return normalize(out, out);
}

/** Rotate `v` about unit axis `k` by angle (rad) → out (may alias v). */
function rotateAbout(v: V3, k: V3, ang: number, out: V3): V3 {
  const c = Math.cos(ang), s = Math.sin(ang), dotK = v.x * k.x + v.y * k.y + v.z * k.z;
  const cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
  return set(
    out,
    v.x * c + cx * s + k.x * dotK * (1 - c),
    v.y * c + cy * s + k.y * dotK * (1 - c),
    v.z * c + cz * s + k.z * dotK * (1 - c),
  );
}

/**
 * Earth-relative Moon direction at arrival, then advanced prograde about the
 * transfer normal (APSIS_CCW_BIAS) so periapsis / outbound leg bend more CCW.
 */
function projectInPlane(out: V3, axis: V3): void {
  const nDot = dot(out, axis);
  out.x -= axis.x * nDot; out.y -= axis.y * nDot; out.z -= axis.z * nDot;
  if (len(out) >= 1e-12) return;
  cross(out, axis, _up);
  if (len(out) < 1e-12) cross(out, axis, set(_tmp, 1, 0, 0));
}

export function moonArrivalDirection(
  tInject: number, out: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const moonArr = moonRelativeToEarth(tInject + transferTimeEst(), epoch);
  normalize(out, moonArr.pos);
  transferPlaneNormal(tInject, _axis, epoch);
  projectInPlane(out, _axis);
  normalize(out, out);
  rotateAbout(out, _axis, APSIS_CCW_BIAS_RAD, out);
  return normalize(out, out);
}

/**
 * Prograde unit in a given plane at Earth-relative position: n × r̂.
 */
function progradeInPlane(relPos: V3, n: V3, out: V3): V3 {
  cross(out, n, relPos);
  if (len(out) < 1e-12) {
    // Degenerate: fall back to pure tangential in XY
    set(out, -relPos.y, relPos.x, 0);
  }
  return normalize(out, out);
}

/**
 * @deprecated Prefer runFiniteTranslunarInjection — kept for reference / emergency snaps.
 * Impulsive lunar-transfer-style velocity set (may adjust position if poorly aligned).
 */
function tliPeriDir(t0: number, epoch: EphemerisEpoch): void {
  transferPlaneNormal(t0, _tangent, epoch);
  moonArrivalDirection(t0, _tmp, epoch);
  const nDot = dot(_tmp, _tangent);
  _tmp.x -= _tangent.x * nDot; _tmp.y -= _tangent.y * nDot; _tmp.z -= _tangent.z * nDot;
  normalize(_radial, _tmp);
  set(_relP, -_radial.x, -_radial.y, -_radial.z);
  cross(_tmp, _tangent, _relP);
  normalize(_relV, _tmp);
}

function tliSnapAligned(state: CraftState, b0: ReturnType<typeof getBodies>, r: number, vPeri: number): void {
  cross(_tmp, _tangent, _radial);
  normalize(_relV, _tmp);
  set(state.vel, b0.earthVel.x + _relV.x * vPeri, b0.earthVel.y + _relV.y * vPeri, b0.earthVel.z + _relV.z * vPeri);
  set(state.pos, b0.earth.x + _radial.x * r, b0.earth.y + _radial.y * r, b0.earth.z + _radial.z * r);
}

function tliSnapPeri(state: CraftState, b0: ReturnType<typeof getBodies>, peri: V3, r: number, vPeri: number): void {
  set(state.pos, b0.earth.x + peri.x * r, b0.earth.y + peri.y * r, b0.earth.z + peri.z * r);
  set(state.vel, b0.earthVel.x + _relV.x * vPeri, b0.earthVel.y + _relV.y * vPeri, b0.earthVel.z + _relV.z * vPeri);
}

function tliAlignOk(b0: ReturnType<typeof getBodies>, periX: number, periY: number, periZ: number, state: CraftState): boolean {
  sub(_relP, state.pos, b0.earth);
  const rNow = len(_relP);
  normalize(_radial, _relP);
  return periX * _radial.x + periY * _radial.y + periZ * _radial.z > 0.8 && rNow > R_EARTH + 100;
}

export function applyTranslunarInjection(
  state: CraftState, translunarInjectionDeltaV: number, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  const b0 = getBodies(state.t, epoch);
  tliPeriDir(state.t, epoch);
  const periX = -_radial.x, periY = -_radial.y, periZ = -_radial.z;
  const r = LOW_EARTH_ORBIT_RADIUS, vPeri = transferPeriapsisSpeed(r, translunarInjectionDeltaV);
  if (tliAlignOk(b0, periX, periY, periZ, state)) tliSnapAligned(state, b0, r, vPeri);
  else tliSnapPeri(state, b0, set(_tmp, periX, periY, periZ), r, vPeri);
}

export type FiniteTranslunarInjectionResult = {
  /** Delivered thrust Δv (km/s) */
  dvDelivered: number;
  /** Burn duration (s) */
  burnS: number;
  /** Peak thrust accel used (km/s²) */
  accel: number;
};

/**
 * Ideal Earth-relative velocity after impulsive translunar injection at the craft's current
 * Earth-relative position: transfer-plane prograde × v_peri (hot inject).
 */
function idealTliRelVel(
  state: CraftState, translunarInjectionDeltaV: number, out: V3, epoch: EphemerisEpoch,
): V3 {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.earth);
  const r = Math.max(len(_relP), R_EARTH + 100);
  transferPlaneNormal(state.t, _n, epoch);
  progradeInPlane(_relP, _n, _pro);
  const vPeri = Math.min(Math.sqrt(MU_EARTH / r) + translunarInjectionDeltaV, vPeriForRa(r, TRANSLUNAR_INJECTION_APOGEE_CAP));
  return scale(out, _pro, vPeri);
}

/**
 * Finite Translunar injection burn under capped ship acceleration.
 *
 * Starts from current low Earth orbit (no position teleport). Thrusts along
 * **velocity-to-go** toward the impulsive inject velocity until the
 * Earth-relative residual is small — so intercept geometry matches the
 * design transfer while the HUD sees a multi-minute burn + plume.
 */
function tliPush(
  samples: Sample[] | null, lastT: { t: number } | null, state: CraftState,
  prop: PropState | null, burning: boolean, force: boolean, a: number, interval = 0, drain = true,
): void {
  if (!samples || !lastT) return;
  pushSample(samples, state, "translunarInjection", burning, force, interval, lastT, prop, a, "ship", drain);
}

function tliVelGo(state: CraftState, dv: number, vIdeal: V3, vGo: V3, epoch: EphemerisEpoch): number {
  const b = getBodies(state.t, epoch);
  idealTliRelVel(state, dv, vIdeal, epoch);
  sub(_relV, state.vel, b.earthVel);
  vGo.x = vIdeal.x - _relV.x; vGo.y = vIdeal.y - _relV.y; vGo.z = vIdeal.z - _relV.z;
  return len(vGo);
}

function tliStepAccel(prop: PropState | null, aCmd: number): { aStep: number; forceN: number } | null {
  if (!prop) return { aStep: aCmd, forceN: 0 };
  const lim = limitAccelByThrust(prop, aCmd, "ship");
  if (lim.forceN < 1e-3) return null;
  return { aStep: lim.aKmS2, forceN: lim.forceN };
}

function tliBurnStep(
  state: CraftState, step: number, aStep: number, vGo: V3,
  prop: PropState | null, forceN: number, epoch: EphemerisEpoch,
): number {
  normalize(_pro, vGo);
  const ax = _pro.x * aStep, ay = _pro.y * aStep, az = _pro.z * aStep;
  const thrustFn: ThrustFn = () => set(_thrust, ax, ay, az);
  const tBefore = state.t;
  rk4Step(state, step, thrustFn, { epoch });
  if (prop && forceN > 0) { prop.lastT = tBefore; burnForce(prop, state.t, forceN, "ship"); }
  return aStep * step;
}

function tliLoopOnce(
  state: CraftState, tHardCap: number, aNom: number, dv: number, dt: number, vIdeal: V3, vGo: V3,
  samples: Sample[] | null, lastT: { t: number } | null, prop: PropState | null, epoch: EphemerisEpoch,
): number | null {
  if (prop && !hasPropellant(prop, "ship")) return null;
  const go = tliVelGo(state, dv, vIdeal, vGo, epoch);
  if (go < 0.012) return null;
  const lim = tliStepAccel(prop, Math.min(aNom, Math.max(go / dt, 0.002)));
  if (!lim) return null;
  const d = tliBurnStep(state, Math.min(dt, tHardCap - state.t), lim.aStep, vGo, prop, lim.forceN, epoch);
  tliPush(samples, lastT, state, prop, true, false, lim.aStep, 0.8, false);
  return d;
}

function tliBurnLoop(
  state: CraftState, tHardCap: number, aNom: number, dv: number,
  samples: Sample[] | null, lastT: { t: number } | null, prop: PropState | null, epoch: EphemerisEpoch,
): number {
  let delivered = 0;
  const dt = Math.min(DT_BURN, 1.0), vIdeal = v3(), vGo = v3();
  while (state.t < tHardCap - 1e-9) {
    const d = tliLoopOnce(state, tHardCap, aNom, dv, dt, vIdeal, vGo, samples, lastT, prop, epoch);
    if (d == null) break;
    delivered += d;
  }
  return delivered;
}

function tliSnapIdeal(state: CraftState, dv: number, epoch: EphemerisEpoch): void {
  const b = getBodies(state.t, epoch), vIdeal = v3();
  idealTliRelVel(state, dv, vIdeal, epoch);
  set(state.vel, b.earthVel.x + vIdeal.x, b.earthVel.y + vIdeal.y, b.earthVel.z + vIdeal.z);
}

export function runFiniteTranslunarInjection(
  state: CraftState, translunarInjectionDeltaV: number,
  samples: Sample[] | null = null, lastT: { t: number } | null = null,
  prop: PropState | null = null, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): FiniteTranslunarInjectionResult {
  const aNom = TRANSLUNAR_INJECTION_ACCEL, tIgnition = state.t;
  const tHardCap = tIgnition + TRANSLUNAR_INJECTION_BURN_MAX_S * 1.35;
  tliPush(samples, lastT, state, prop, aNom > 0, true, aNom, 0, true);
  const delivered = tliBurnLoop(state, tHardCap, aNom, translunarInjectionDeltaV, samples, lastT, prop, epoch);
  tliSnapIdeal(state, translunarInjectionDeltaV, epoch);
  tliPush(samples, lastT, state, prop, false, true, 0, 0, true);
  return { dvDelivered: delivered, burnS: state.t - tIgnition, accel: aNom };
}

/** Build osculating Kepler orbit about Earth right after translunar injection (2-body reference). */
export function orbitAfterTranslunarInjection(
  state: CraftState,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): KeplerOrbit {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.earth);
  sub(_relV, state.vel, b.earthVel);
  return rvToKepler(_relP, _relV, MU_EARTH, state.t);
}

/**
 * Optional design ellipse: coplanar Hohmann-class at current r.
 * Prefer runFiniteTranslunarInjection + transferPeriapsisSpeed cap for free-coast missions.
 */
export function designApogeeTransferOrbit(
  state: CraftState, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): KeplerOrbit {
  const t0 = state.t, b = getBodies(t0, epoch);
  sub(_relP, state.pos, b.earth);
  transferPlaneNormal(t0, _n, epoch);
  progradeInPlane(_relP, _n, _pro);
  const r = Math.max(len(_relP), R_EARTH + 100);
  scale(_relV, _pro, transferPeriapsisSpeed(r, designLunarTransfer().translunarInjectionDeltaV));
  return rvToKepler(_relP, _relV, MU_EARTH, t0);
}
