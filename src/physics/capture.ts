/**
 * Near-Moon capture and landing (B1 discrete lunar orbit insertion → low lunar orbit → powered descent initiation).
 *
 * Phase mapping (keeps existing PhaseId for timeline/HUD):
 * - approach  → Lunar orbit insertion burn (polar low lunar orbit capture, south-pole geometry)
 * - braking   → ballistic Low lunar orbit coast (~¾ rev)
 * - descent   → powered descent initiation + powered descent to south pole
 * - landed    → surface settle (no polar taxi)
 */

import {
  LANDING_ACCEL,
  LOW_LUNAR_ORBIT_ALTITUDE_KM,
  LUNAR_ORBIT_INSERTION_ACCEL,
  LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM,
  LUNAR_ORBIT_INSERTION_VELOCITY_ERROR_OK,
  LUNAR_ORBIT_INSERTION_RADIAL_VELOCITY_OK,
  MU_MOON,
  R_MOON,
} from "./constants";
import {
  bodyPositions,
  moonSouthPoleSurface,
  moonSouthUnit,
} from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
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
export function southPoleAlign(t: number, pos: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): number {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.moon);
  if (len(_relP) < 1e-6) return 0;
  normalize(_radial, _relP);
  moonSouthUnit(_south);
  return dot(_radial, _south);
}

/** Sidereal period (s) of a circular lunar orbit at radius r (km). */
export function lowLunarOrbitPeriodS(rKm: number): number {
  const r = Math.max(rKm, R_MOON + 50);
  return 2 * Math.PI * Math.sqrt((r * r * r) / MU_MOON);
}

/**
 * Polar low lunar orbit angular-momentum unit: orbit plane contains lunar poles and the
 * craft radial (so powered descent initiation can reach the south pole without a huge plane change).
 */
function polarOrbitNormal(relP: V3, relV: V3, out: V3): V3 {
  moonSouthUnit(_south); cross(out, relP, _south);
  if (len(out) < 1e-8) {
    cross(out, relP, relV);
    if (len(out) < 1e-8) set(out, 0, 1, 0);
  }
  normalize(out, out);
  cross(_hFly, relP, relV);
  if (len(_hFly) > 1e-8 && dot(out, _hFly) < 0) scale(out, out, -1);
  return out;
}

/** Polar alignment of h with lunar south (true if near-polar). */
function polarOkH(): boolean {
  moonSouthUnit(_south);
  cross(_h, _relP, _relV);
  const hLen = len(_h);
  return hLen < 1e-8 || Math.abs(dot(_h, _south) / hLen) < 0.7;
}

function fillMoonRel(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): number {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  return len(_relP);
}

function loiNearCircular(r: number, v: number, vRad: number): boolean {
  const vCirc = Math.sqrt(MU_MOON / r);
  const vEsc = Math.sqrt((2 * MU_MOON) / r);
  return (
    v < vEsc * 0.97 &&
    Math.abs(v - vCirc) < LUNAR_ORBIT_INSERTION_VELOCITY_ERROR_OK * 2 &&
    vRad < LUNAR_ORBIT_INSERTION_RADIAL_VELOCITY_OK * 2 &&
    polarOkH()
  );
}

/** True when lunar orbit insertion has achieved near-circular polar-ish low lunar orbit. */
export function lunarOrbitInsertionComplete(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): boolean {
  const r = fillMoonRel(t, pos, vel, epoch);
  const alt = r - R_MOON;
  if (alt < 50 || alt > 2_500) return false;
  normalize(_radial, _relP);
  return loiNearCircular(r, len(_relV), Math.abs(dot(_relV, _radial)));
}

/**
 * Bound enough to keep integrating LLO / PDI — no position teleport.
 * Hyperbolic leftover after LOI is a flyby, not a polar snap.
 */
export function lunarOrbitInsertionBound(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): boolean {
  const r = fillMoonRel(t, pos, vel, epoch);
  const alt = r - R_MOON;
  if (!(alt > 50 && alt < 8_000)) return false;
  const vEsc = Math.sqrt((2 * MU_MOON) / r);
  return len(_relV) < vEsc * 0.98;
}

/** LOI velocity targets from altitude band. */
function loiVelocityTargets(
  alt: number, r: number, vRad: number, rLlo: number,
): { vTgt: number; tgtVRad: number } {
  if (alt > 2_500) {
    const sink = Math.min(0.25, 0.04 + (alt - LOW_LUNAR_ORBIT_ALTITUDE_KM) * 2e-5);
    return { vTgt: Math.sqrt(MU_MOON / Math.max(rLlo, r * 0.75)), tgtVRad: Math.min(vRad, 0) * 0.2 - sink };
  }
  if (alt > LOW_LUNAR_ORBIT_ALTITUDE_KM * 1.8) {
    return { vTgt: Math.sqrt(MU_MOON / Math.max(r * 0.9, rLlo)), tgtVRad: -vRad * 0.45 - 0.03 };
  }
  return { vTgt: Math.sqrt(MU_MOON / Math.max(r, rLlo * 0.95)), tgtVRad: -vRad * 0.7 };
}

/** Cap LOI thrust vector to LUNAR_ORBIT_INSERTION_ACCEL. */
function clampLoiThrust(): V3 | null {
  const mag = len(_thrust);
  if (!Number.isFinite(mag) || mag < 1e-6) return null;
  if (mag > LUNAR_ORBIT_INSERTION_ACCEL) {
    scale(_thrust, _thrust, LUNAR_ORBIT_INSERTION_ACCEL / mag);
  }
  return _thrust;
}

/** Pure retrograde LOI when hyperbolic. */
function loiHyperbolicRetro(): V3 {
  normalize(_tmp, _relV);
  set(
    _thrust,
    -_tmp.x * LUNAR_ORBIT_INSERTION_ACCEL,
    -_tmp.y * LUNAR_ORBIT_INSERTION_ACCEL,
    -_tmp.z * LUNAR_ORBIT_INSERTION_ACCEL,
  );
  return _thrust;
}

/** Bound LOI: chase polar circular target velocity. */
function loiBoundThrust(alt: number, r: number, vRad: number): V3 | null {
  const rLlo = R_MOON + LOW_LUNAR_ORBIT_ALTITUDE_KM;
  const { vTgt, tgtVRad } = loiVelocityTargets(alt, r, vRad, rLlo);
  set(
    _thrust,
    (_pro.x * vTgt + _radial.x * tgtVRad - _relV.x) * 1.25,
    (_pro.y * vTgt + _radial.y * tgtVRad - _relV.y) * 1.25,
    (_pro.z * vTgt + _radial.z * tgtVRad - _relV.z) * 1.25,
  ); return clampLoiThrust();
}

/**
 * Lunar orbit insertion burn (phase `approach`): kill hyperbolic excess, change into a **polar**
 * low lunar orbit, and lower toward ~LOW_LUNAR_ORBIT_ALTITUDE. Lights when alt &lt; LUNAR_ORBIT_INSERTION_ALTITUDE_START.
 */
function fillLoiFrame(_r: number): boolean {
  normalize(_radial, _relP);
  polarOrbitNormal(_relP, _relV, _h);
  cross(_pro, _h, _radial);
  if (len(_pro) < 1e-8) return false;
  normalize(_pro, _pro);
  return true;
}

export function lunarOrbitInsertionThrust(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): V3 | null {
  const r = fillMoonRel(t, pos, vel, epoch);
  const alt = r - R_MOON;
  if (alt < -1 || !Number.isFinite(alt) || alt > LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM) return null;
  if (!fillLoiFrame(r)) return null;
  const vEsc = Math.sqrt((2 * MU_MOON) / r);
  if (len(_relV) > vEsc * 0.92) return loiHyperbolicRetro();
  return loiBoundThrust(alt, r, dot(_relV, _radial));
}

/** Horizontal velocity residual (perp to radial). */
function fillHorizVel(): void {
  const vRad = dot(_relV, _radial);
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;
}

/** Base PD gains: vertical + horizontal kill. */
function pdiBaseAccel(
  targetVRad: number,
  gain: number,
  hGain: number,
): { ax: number; ay: number; az: number } {
  return { ax: (_radial.x * targetVRad - _relV.x) * gain - _tmp.x * hGain, ay: (_radial.y * targetVRad - _relV.y) * gain - _tmp.y * hGain, az: (_radial.z * targetVRad - _relV.z) * gain - _tmp.z * hGain };
}

function siteApproachSpeed(alt: number): number {
  return Math.min(0.22, Math.max(0.002, Math.sqrt(2 * LANDING_ACCEL * 0.45 * alt)));
}

function setHoverAim(b: ReturnType<typeof getBodies>, hoverAlt: number): void {
  set(_aim, b.moon.x + _south.x * (R_MOON + hoverAlt), b.moon.y + _south.y * (R_MOON + hoverAlt), b.moon.z + _south.z * (R_MOON + hoverAlt));
}

function siteAimComponents(vel: V3, moonVel: V3, distAim: number, sp: number, w: number): {
  ax: number; ay: number; az: number;
} {
  return { ax: ((_toAim.x / distAim) * sp - (vel.x - moonVel.x)) * w, ay: ((_toAim.y / distAim) * sp - (vel.y - moonVel.y)) * w, az: ((_toAim.z / distAim) * sp - (vel.z - moonVel.z)) * w };
}

/** Site-aim accel toward south-pole hover point. */
function pdiSiteAimAccel(
  pos: V3, vel: V3, b: ReturnType<typeof getBodies>, alt: number, poleW: number,
): { ax: number; ay: number; az: number } {
  setHoverAim(b, Math.max(alt * 0.25, 0.3));
  sub(_toAim, _aim, pos);
  return siteAimComponents(vel, b.moonVel, len(_toAim) || 1, siteApproachSpeed(alt), poleW * 0.9);
}

/** Lateral accel toward lunar south. */
function pdiLateralAccel(
  poleAlign: number, maxA: number, poleW: number,
): { ax: number; ay: number; az: number } {
  set(_lat, _south.x - _radial.x * poleAlign, _south.y - _radial.y * poleAlign, _south.z - _radial.z * poleAlign);
  const latLen = len(_lat);
  if (latLen <= 1e-8) return { ax: 0, ay: 0, az: 0 };
  scale(_lat, _lat, 1 / latLen);
  cross(_tmp, _south, _radial);
  const latA = maxA * poleW * (0.4 + 0.6 * Math.min(1, len(_tmp)));
  return { ax: _lat.x * latA, ay: _lat.y * latA, az: _lat.z * latA };
}

/** Near-surface hover against lunar gravity. */
function pdiHoverAccel(
  alt: number,
  r: number,
  poleAlign: number,
): { ax: number; ay: number; az: number } {
  if (alt >= 40) return { ax: 0, ay: 0, az: 0 };
  const gMoon = MU_MOON / (r * r);
  const up = poleAlign > 0.7 ? _south : _radial;
  const hover = alt < 5 ? 1.06 : 0.92;
  return { ax: up.x * gMoon * hover, ay: up.y * gMoon * hover, az: up.z * gMoon * hover };
}

/** Cap powered-descent thrust to maxA. */
function clampPdiThrust(maxA: number): V3 | null {
  const mag = len(_thrust);
  if (!Number.isFinite(mag) || mag < 1e-18) return null;
  if (mag > maxA) scale(_thrust, _thrust, maxA / mag);
  return _thrust;
}

/**
 * powered descent initiation / powered descent (phase `descent`) toward the lunar south pole.
 */
function sumPdiAccel(
  base: { ax: number; ay: number; az: number },
  site: { ax: number; ay: number; az: number },
  lat: { ax: number; ay: number; az: number },
  hover: { ax: number; ay: number; az: number },
): void {
  set(
    _thrust,
    base.ax + site.ax + lat.ax + hover.ax,
    base.ay + site.ay + lat.ay + hover.ay,
    base.az + site.az + lat.az + hover.az,
  );
}

function pdiTargetVRad(alt: number): number {
  const safe = Math.sqrt(Math.max(0, 2 * LANDING_ACCEL * 0.35 * Math.max(alt, 0.05)));
  return -Math.min(0.15, Math.max(0.0012, safe));
}

function prepPdiFrame(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): { r: number; alt: number } | null {
  const r = fillMoonRel(t, pos, vel, epoch);
  const alt = r - R_MOON;
  if (alt < -1 || !Number.isFinite(alt)) return null;
  normalize(_radial, _relP);
  moonSouthUnit(_south);
  moonSouthPoleSurface(t, epoch, _site);
  fillHorizVel();
  return { r, alt };
}

function applyPdiComponents(
  pos: V3, vel: V3, b: ReturnType<typeof getBodies>, geo: { r: number; alt: number }, maxA: number,
): void {
  const poleAlign = dot(_radial, _south);
  sumPdiAccel(
    pdiBaseAccel(pdiTargetVRad(geo.alt), 1.05, 1.35),
    pdiSiteAimAccel(pos, vel, b, geo.alt, 0.95),
    pdiLateralAccel(poleAlign, maxA, 0.95),
    pdiHoverAccel(geo.alt, geo.r, poleAlign),
  );
}

export function poweredDescentThrust(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): V3 | null {
  const b = getBodies(t, epoch);
  const geo = prepPdiFrame(t, pos, vel, epoch);
  if (!geo) return null;
  applyPdiComponents(pos, vel, b, geo, LANDING_ACCEL * 1.55);
  return clampPdiThrust(LANDING_ACCEL * 1.55);
}

/**
 * @deprecated Prefer lunarOrbitInsertionThrust / poweredDescentThrust. Kept for any external callers.
 */
export function landingThrust(
  t: number,
  pos: V3,
  vel: V3,
  phase: PhaseId,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 | null {
  if (phase === "approach") return lunarOrbitInsertionThrust(t, pos, vel, epoch);
  if (phase === "descent") return poweredDescentThrust(t, pos, vel, epoch);
  return null;
}

/** Place on a Moon-centered sphere along `dir`. */
function placeAtMoonRadius(
  state: CraftState, bi: ReturnType<typeof bodyPositions>, dir: V3, r: number,
): void {
  state.pos.x = bi.moon.x + dir.x * r;
  state.pos.y = bi.moon.y + dir.y * r;
  state.pos.z = bi.moon.z + dir.z * r;
  state.vel.x = bi.moonVel.x;
  state.vel.y = bi.moonVel.y;
  state.vel.z = bi.moonVel.z;
}

function finishAltitudeBridge(
  state: CraftState, _samples: Sample[], lastT: { t: number },
  _prop: PropState | null, epoch: EphemerisEpoch, r0: number,
): void {
  const alt0 = r0 - R_MOON;
  if (alt0 <= 5) placeOnMoonSurface(state, lastT, epoch);
}

/** Snap to surface along current radial when already low. */
function placeOnMoonSurface(
  state: CraftState,
  lastT: { t: number },
  epoch: EphemerisEpoch,
): void {
  const b = getBodies(state.t, epoch);
  state.pos.x = b.moon.x + _from.x * R_MOON;
  state.pos.y = b.moon.y + _from.y * R_MOON;
  state.pos.z = b.moon.z + _from.z * R_MOON;
  state.vel.x = b.moonVel.x;
  state.vel.y = b.moonVel.y;
  state.vel.z = b.moonVel.z;
  if (state.t <= lastT.t) state.t = lastT.t + 0.05;
}

/** Short hop: already near south pole. */
function finishNoTaxi(
  state: CraftState,
  samples: Sample[],
  lastT: { t: number },
  prop: PropState | null,
  epoch: EphemerisEpoch,
): void {
  if (state.t <= lastT.t) state.t = lastT.t + 0.05;
  set(_landDir, _south.x, _south.y, _south.z);
  placeAtMoonRadius(state, bodyPositions(state.t, epoch), _landDir, R_MOON);
  pushSample(samples, state, "landed", false, true, 0, lastT, prop, 0, "ship");
}

function surfaceHoldSample(
  t: number, bi: ReturnType<typeof bodyPositions>, fb: number, fs: number, st: boolean,
): Sample {
  return { t, pos: v3(bi.moon.x + _landDir.x * R_MOON, bi.moon.y + _landDir.y * R_MOON, bi.moon.z + _landDir.z * R_MOON), vel: clone(bi.moonVel), phase: "landed", burning: false, fuelBooster: fb, fuelShip: fs, thrustN: 0, staged: st };
}

/** Hold on surface co-moving with Moon. */
function finishSurfaceHold(
  state: CraftState, samples: Sample[], prop: PropState | null, epoch: EphemerisEpoch,
): void {
  const landT0 = state.t;
  const fb = prop ? fuelBoosterFrac(prop) : 0;
  const fs = prop ? fuelShipFrac(prop) : 0;
  const st = prop?.staged ?? true;
  for (let i = 1; i <= 30; i++) {
    const t = landT0 + i * 60;
    samples.push(surfaceHoldSample(t, bodyPositions(t, epoch), fb, fs, st));
  }
}

function packLandedResult(
  samples: Sample[], moonPhase0: number, translunarInjectionDeltaV: number, minMoonAlt: number,
): MissionResult {
  return { samples, durationS: samples[samples.length - 1]!.t, moonPhase0, translunarInjectionDeltaV, minMoonAlt: Math.min(minMoonAlt, 0), ok: true, message: "Landed · lunar south pole" };
}

/**
 * Soft touchdown: radial project (bridged), then great-circle taxi to south pole.
 * Always advances time on large position moves so trail invariants stay clean.
 */
function prepLandingRadial(state: CraftState, epoch: EphemerisEpoch): number {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.moon);
  const r0 = Math.max(len(_relP), 1);
  if (r0 < 1) set(_relP, 0, 0, -1);
  normalize(_from, _relP);
  moonSouthUnit(_south);
  return r0;
}

function finishTaxiOrHop(
  state: CraftState, samples: Sample[], lastT: { t: number },
  prop: PropState | null, epoch: EphemerisEpoch,
): void {
  const arcKm = Math.acos(clamp1(dot(_from, _south))) * R_MOON;
  if (arcKm > 2) {
    set(_landDir, _from.x, _from.y, _from.z);
    if (state.t <= lastT.t) state.t = lastT.t + 0.05;
    placeAtMoonRadius(state, bodyPositions(state.t, epoch), _landDir, R_MOON);
    pushSample(samples, state, "landed", false, true, 0, lastT, prop, 0, "ship");
    return;
  }
  finishNoTaxi(state, samples, lastT, prop, epoch);
}

export function finishLanding(
  state: CraftState,
  samples: Sample[],
  moonPhase0: number,
  translunarInjectionDeltaV: number,
  minMoonAlt: number,
  prop: PropState | null = null,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): MissionResult {
  const r0 = prepLandingRadial(state, epoch);
  const lastT = { t: samples.length > 0 ? samples[samples.length - 1]!.t : state.t - 1 };
  finishAltitudeBridge(state, samples, lastT, prop, epoch, r0);
  finishTaxiOrHop(state, samples, lastT, prop, epoch);
  finishSurfaceHold(state, samples, prop, epoch);
  return packLandedResult(samples, moonPhase0, translunarInjectionDeltaV, minMoonAlt);
}
