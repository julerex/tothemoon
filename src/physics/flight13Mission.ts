/**
 * Starship Flight 13 theater mission (suborbital flight test).
 *
 * Timeline anchors match docs/STARSHIP_13.md (SpaceX public profile, approx).
 * Dynamics: restricted RK4 with mass-coupled thrust + atmosphere. Default
 * force model is full restricted n-body (Earth + Moon + solar tide + J₂ +
 * drag). Pass `{ gravity: "earth" }` for Earth-only mechanics (μ + J₂ + drag,
 * no Moon/Sun) — used to cross-check that third-body terms stay small on a
 * ~1 h suborbital arc.
 *
 * Steering aims along the Starbase → Indian Ocean great-circle corridor
 * (same plane as the Earth GC view).
 *
 * Profile (theater-grade, not ops — but intentionally more ballistic):
 * - Gravity-turn ascent + hot-stage along the corridor
 * - Upper burn builds near-circular horizontal speed (low radial rate at SECO)
 * - Free coast is pure ballistic (no midcourse PD / altitude-hold glide)
 * - In-space relight is a real retrograde deorbit burn (theater-lengthened
 *   vs the public ~12 s demo so periapsis drops before the entry mark)
 * - Entry: high-AoA belly drag (+ modest lift) only — no powered cruise
 * - Landing burn brakes near the splash fix; late descent is seated at the
 *   sunlit theater splash site (dynamics dump energy ~30° west, at night)
 * - After splash the ship stays Earth-fixed on the ocean through {@link F13.END}
 *   (T+1:10) so the theater can hold a sea-level drone shot
 *
 * Splash coordinates are theater (west of Australia), not a surveyed buoy.
 */

import {
  BOOSTER_THRUST_N,
  EARTH_SURFACE_RADIUS_KM,
  HOT_STAGE_S,
  MU_EARTH,
  R_EARTH,
  SHIP_THRUST_N,
} from "./constants";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import {
  corridorAlongAt,
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "./flight13Corridor";
import { makeFlight13Epoch } from "./flight13Epoch";
import {
  altitudeEarth,
  atmDensity,
  getBodies,
  rk4Step,
  type AccelOptions,
  type CraftState,
  type GravityModel,
  type ThrustFn,
} from "./integrator";
import { downsampleTrajectory } from "./missionDownsample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  burnForce,
  coastProp,
  createPropState,
  fuelBoosterFrac,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
  stageBooster,
  wetMassKg,
  type PropState,
  type Tank,
} from "./propellant";
import { deriveTrajectoryMeta } from "./trajectoryMeta";
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

export { FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON } from "./flight13Corridor";

/** Official approximate T+ anchors (s) from Flight 13 profile. */
export const F13 = {
  LIFTOFF: 0,
  MAX_Q: 58,
  MECO: 138,
  HOT_STAGE: 141,
  SECO: 485,
  PAYLOAD_START: 1000,
  PAYLOAD_END: 1659,
  /** Public table ~T+38:58; burn window theater-lengthened for deorbit Δv. */
  RELIGHT: 2338,
  /**
   * End of single-engine deorbit. Public demo is ~12 s; theater uses ~20 s
   * for a modest periapsis drop (~0.15–0.3 km/s) without killing the coast.
   */
  RELIGHT_END: 2358,
  ENTRY: 2850,
  TRANSONIC: 3743,
  SUBSONIC: 3781,
  LAND_BURN: 3901,
  LAND_FLIP: 3903,
  LAND_3TO2: 3912,
  LAND_2TO1: 3919,
  SPLASH: 3921,
  /**
   * Theater end: post-splash drone hold of the floating ship through
   * T+1:10:00 (public splash is T+1:05:21).
   */
  END: 70 * 60,
} as const;

/** Sample step while the ship is Earth-fixed on the ocean (s). */
const FLOAT_DT_S = 2;

/** Keep this fraction of ship prop for relight + landing burn. */
const SHIP_PROP_RESERVE = 0.07;

/**
 * Target horizontal speed fraction of local circular at SECO.
 * Near-circular for a long eastbound coast to the Indian Ocean; deorbit is
 * the relight's job. (Slightly under-circular + theater drag reenters over
 * the Atlantic before splash.)
 */
const SECO_VCIRC_FRAC = 0.998;

/**
 * Max |v_radial| (km/s) at SECO energy cut — keep loft modest without
 * forcing a shallow low-altitude ellipse that reenters halfway to splash.
 */
const SECO_VRAD_MAX = 0.18;

/** Prefer not to declare SECO energy until this altitude (km). */
const SECO_ALT_MIN_KM = 165;

/**
 * Belly-flop Cd·A/m (km²/kg) — high-AoA entry (ascent stack factor is much
 * smaller). Theater only; not a CFD table.
 */
const BELLY_CD_A_OVER_M = 1.6e-10;

/**
 * Lift-to-drag fraction of belly drag (outward). Tuned so the hypersonic
 * corridor covers the last ~1–2e3 km to splash without a powered altitude-hold.
 */
const BELLY_L_OVER_D = 0.42;

const _up = v3();
const _relP = v3();
const _relV = v3();
const _steer = v3();
const _tmp = v3();
const _tmp2 = v3();
const _tmp3 = v3();
const _splashLocal = v3();
const _along = v3();
const _horiz = v3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Unit surface radial at splash site (inertial) at mission time t. */
export function splashSurfaceInertial(
  t: number,
  out: V3 = v3(),
  epoch?: EphemerisEpoch,
): V3 {
  geodeticToMeshLocal(
    FLIGHT13_SPLASH_LAT,
    FLIGHT13_SPLASH_LON,
    1,
    _splashLocal,
  );
  meshLocalToInertial(_splashLocal, t, out, epoch);
  return normalize(out, out);
}

function makeSample(
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  prop: PropState,
  thrustN: number,
): Sample {
  return { t: state.t, pos: clone(state.pos), vel: clone(state.vel), phase, burning, fuelBooster: fuelBoosterFrac(prop), fuelShip: fuelShipFrac(prop), thrustN, staged: prop.staged };
}

function pushSample(
  samples: Sample[],
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  prop: PropState,
  thrustN: number,
): void {
  samples.push(makeSample(state, phase, burning, prop, thrustN));
}

type BurnMode =
  | "boost"
  | "hot_stage"
  | "upper"
  | "relight"
  | "land"
  | "idle";

type SteerGeo = {
  alt: number;
  vRad: number;
  vHoriz: number;
  vCirc: number;
  along: V3;
};

/** Radial/horizontal geometry about Earth; fills `_up`, `_relV`, `_horiz`. */
function fillEarthRelGeo(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): {
  r: number;
  vRad: number;
  vHoriz: number;
} {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const r = len(_relP) || 1;
  set(_up, _relP.x / r, _relP.y / r, _relP.z / r);
  sub(_relV, vel, b.earthVel);
  const vRad = dot(_relV, _up);
  set(_horiz, _relV.x - _up.x * vRad, _relV.y - _up.y * vRad, _relV.z - _up.z * vRad);
  return { r, vRad, vHoriz: len(_horiz) };
}

/** Local ENU-ish geometry for steering. */
function fillSteerFrame(
  t: number,
  pos: V3,
  vel: V3,
  epoch: EphemerisEpoch,
): SteerGeo {
  const g = fillEarthRelGeo(t, pos, vel, epoch);
  return {
    alt: g.r - R_EARTH,
    vRad: g.vRad,
    vHoriz: g.vHoriz,
    vCirc: Math.sqrt(MU_EARTH / Math.max(g.r, R_EARTH + 50)),
    along: corridorAlongAt(t, pos, _along, epoch),
  };
}

/** Vector from craft to surface point at radius `rSurf` along unit `surf`. */
function aimToSurfPoint(pos: V3, earth: V3, surf: V3, rSurf: number, out: V3): number {
  set(out, earth.x + surf.x * rSurf - pos.x, earth.y + surf.y * rSurf - pos.y, earth.z + surf.z * rSurf - pos.z);
  const d = len(out);
  if (d > 1e-6) normalize(out, out);
  return d;
}

/** Landing burn aim direction (writes unit aim into `_tmp3`). */
function fillSplashAim(t: number, pos: V3, epoch: EphemerisEpoch): number {
  const splash = splashSurfaceInertial(t, _tmp2, epoch);
  const bL = getBodies(t, epoch);
  return aimToSurfPoint(pos, bL.earth, splash, EARTH_SURFACE_RADIUS_KM, _tmp3);
}

function steerLandBrake(out: V3, distSplash: number): void {
  const v = len(_relV);
  set(out, -_relV.x / v, -_relV.y / v, -_relV.z / v);
  if (distSplash <= 2) return;
  const w = Math.min(0.55, distSplash / 80);
  out.x = out.x * (1 - w) + _tmp3.x * w;
  out.y = out.y * (1 - w) + _tmp3.y * w;
  out.z = out.z * (1 - w) + _tmp3.z * w;
  normalize(out, out);
}

function steerLand(
  t: number, pos: V3, alt: number, out: V3, epoch: EphemerisEpoch,
): void {
  const distSplash = fillSplashAim(t, pos, epoch);
  if (len(_relV) > 0.08) { steerLandBrake(out, distSplash); return; }
  if (alt > 0.4) {
    set(out, _up.x * 0.35 + _tmp3.x * 0.65, _up.y * 0.35 + _tmp3.y * 0.65, _up.z * 0.35 + _tmp3.z * 0.65);
    normalize(out, out);
    return;
  }
  set(out, _up.x, _up.y, _up.z);
}

/** Retrograde deorbit aim. */
function steerRelight(vHoriz: number, along: V3, out: V3): void {
  if (vHoriz > 0.05) {
    set(out, -_horiz.x / vHoriz, -_horiz.y / vHoriz, -_horiz.z / vHoriz);
  } else {
    set(out, -along.x, -along.y, -along.z);
  }
}

/** Aim thrust as pitch from local up toward `along`. */
function aimPitchAlong(along: V3, pitch: number, out: V3): void {
  const cosP = Math.cos(pitch); const sinP = Math.sin(pitch);
  set(
    out,
    _up.x * cosP + along.x * sinP,
    _up.y * cosP + along.y * sinP,
    _up.z * cosP + along.z * sinP,
  );
  normalize(out, out);
}

function pitchBoost(alt: number): number {
  // Slightly slower pitch-over than a due-west short-arc loft so the eastbound
  // corridor still has altitude in the bank when horizontal speed arrives.
  if (alt < 0.6) return 0;
  if (alt < 55) return smoothstep(0.6, 55, alt) * (Math.PI / 2) * 0.88;
  return (Math.PI / 2) * 0.9;
}

/** Boost gravity-turn pitch along corridor. */
function steerBoost(alt: number, along: V3, out: V3): void {
  aimPitchAlong(along, pitchBoost(alt), out);
}

function pitchUpperClimb(vRad: number, vHoriz: number, vTarget: number): number {
  const speedFrac = Math.min(1, vHoriz / Math.max(vTarget, 1));
  let pitch = (Math.PI / 2) * (0.5 + 0.4 * smoothstep(1.0, 5.5, vHoriz));
  if (vRad < 0.05) pitch = Math.max(0.35, pitch - 0.25);
  if (speedFrac > 0.9) pitch = Math.min((Math.PI / 2) * 0.92, pitch + 0.12);
  return pitch;
}

/** Hot-stage / upper climb toward insert altitude. */
function steerUpperClimb(
  _alt: number,
  vRad: number,
  vHoriz: number,
  vTarget: number,
  along: V3,
  out: V3,
): void {
  aimPitchAlong(along, pitchUpperClimb(vRad, vHoriz, vTarget), out);
}

/** Above insert altitude: kill radial, push horizontal. */
function steerUpperCircular(
  vRad: number,
  vHoriz: number,
  vTarget: number,
  along: V3,
  out: V3,
): void {
  const tgtRad = -1.1 * vRad;
  const needH = Math.max(0, vTarget - vHoriz);
  const radW = Math.min(0.55, 0.2 + Math.abs(vRad) * 1.2);
  const hW = 1 - radW + (needH > 0.05 ? 0.15 : 0);
  set(out, along.x * hW + _up.x * tgtRad, along.y * hW + _up.y * tgtRad, along.z * hW + _up.z * tgtRad);
  if (len(out) < 1e-8) set(out, along.x, along.y, along.z);
  normalize(out, out);
}

/**
 * At speed but below insert alt: climb with mostly radial thrust so eastbound
 * assist does not keep stacking horizontal Δv into a high ellipse.
 */
function steerUpperLoft(along: V3, vRad: number, vHoriz: number, vTarget: number, out: V3): void {
  const upW = vRad > 0.8 ? 0.55 : 0.8;
  const alongW = vHoriz < vTarget ? 0.2 : -0.12;
  set(
    out,
    _up.x * upW + along.x * alongW,
    _up.y * upW + along.y * alongW,
    _up.z * upW + along.z * alongW,
  );
  if (len(out) < 1e-8) set(out, _up.x, _up.y, _up.z);
  normalize(out, out);
}

function steerUpper(geo: SteerGeo, out: V3): void {
  const vTarget = SECO_VCIRC_FRAC * geo.vCirc;
  if (geo.alt < SECO_ALT_MIN_KM) {
    if (geo.vHoriz >= vTarget * 0.9) {
      steerUpperLoft(geo.along, geo.vRad, geo.vHoriz, vTarget, out);
    } else {
      steerUpperClimb(geo.alt, geo.vRad, geo.vHoriz, vTarget, geo.along, out);
    }
  } else {
    steerUpperCircular(geo.vRad, geo.vHoriz, vTarget, geo.along, out);
  }
}

function steer(
  t: number,
  pos: V3,
  vel: V3,
  mode: BurnMode,
  out: V3,
  epoch: EphemerisEpoch,
): void {
  const geo = fillSteerFrame(t, pos, vel, epoch);
  if (mode === "idle") { set(out, 0, 0, 0); return; }
  if (mode === "land") { steerLand(t, pos, geo.alt, out, epoch); return; }
  if (mode === "relight") { steerRelight(geo.vHoriz, geo.along, out); return; }
  if (mode === "boost") { steerBoost(geo.alt, geo.along, out); return; }
  steerUpper(geo, out);
}

function throttleBoost(t: number, alt: number): number {
  let thr = 0.9;
  if (alt > 5 && alt < 30) thr *= 0.78;
  if (alt < 2) thr = 0.98;
  if (t > F13.MECO - 8) thr *= Math.max(0.15, (F13.HOT_STAGE - t) / 12);
  return Math.max(0, Math.min(1, thr));
}

function throttleLand(t: number): number {
  if (t < F13.LAND_3TO2) return 0.95;
  if (t < F13.LAND_2TO1) return 0.62;
  return 0.38;
}

function throttleFor(t: number, alt: number, mode: BurnMode): number {
  if (mode === "idle") return 0;
  if (mode === "hot_stage") return 0.55;
  if (mode === "relight") return 0.5;
  if (mode === "land") return throttleLand(t);
  if (mode === "boost") return throttleBoost(t, alt);
  if (t >= F13.SECO - 8) return Math.max(0, (F13.SECO - t) / 8) * 0.8;
  return 0.88;
}

function peakForceN(mode: BurnMode, thr: number): number {
  if (mode === "boost") return BOOSTER_THRUST_N * thr;
  if (mode === "hot_stage")
    return BOOSTER_THRUST_N * 0.18 * thr + SHIP_THRUST_N * 0.95;
  if (mode === "upper") return SHIP_THRUST_N * thr;
  if (mode === "relight") return SHIP_THRUST_N * 0.34 * thr;
  if (mode === "land") return SHIP_THRUST_N * thr;
  return 0;
}

function tankFor(mode: BurnMode, staged: boolean): Tank {
  if (!staged && (mode === "boost" || mode === "hot_stage")) return "booster";
  return "ship";
}

/** Options for {@link runFlight13Mission}. */
export type Flight13MissionOptions = {
  /**
   * Force model. Default `"nbody"` (Earth + Moon + solar tide + J₂ + drag).
   * `"earth"` drops Moon / Sun for an independent Earth-mechanics check.
   */
  gravity?: GravityModel;
  /** Explicit ephemeris; default {@link makeFlight13Epoch}. */
  epoch?: EphemerisEpoch;
};

type F13Loop = {
  state: CraftState;
  samples: Sample[];
  prop: PropState;
  epoch: EphemerisEpoch;
  mode: BurnMode;
  hotStageT0: number;
  lastThrustN: number;
  lastBoostN: number;
  lastShipN: number;
  thrAcc: V3;
  accelOpts: AccelOptions;
  /** True after the terminal splash snap; remaining time is a kinematic float. */
  splashed: boolean;
  /** Mission time of the splash snap (s). */
  splashT: number;
};

/**
 * Mission time of the first splashdown sample, or {@link F13.SPLASH} if none.
 *
 * @param samples - Trajectory samples (live or packed)
 */
export function firstSplashdownT(
  samples: readonly { phase: string; t: number }[],
): number {
  for (const s of samples) {
    if (s.phase === "splashdown") return s.t;
  }
  return F13.SPLASH;
}

/** Belly drag + lift + bank toward splash during atmospheric entry. */
function bellyEntryActive(
  t: number, alt: number, vRel: number, prop: PropState, mode: BurnMode,
): boolean {
  return prop.staged && mode === "idle" && t >= F13.RELIGHT_END &&
    alt > 8 && alt < 120 && vRel > 0.8;
}

function bellyLiftBand(alt: number): number {
  if (alt > 25 && alt < 65) return 1.1;
  if (alt < 25) return 0.65;
  return 1.0;
}

function applyBellyLift(
  alt: number, vRel: number, vRad: number, aDrag: number, a: { ax: number; ay: number; az: number },
): void {
  if (!(vRad < 0 && vRel > 1.5 && alt > 12 && alt < 95)) return;
  const aLift = Math.min(0.015, aDrag * BELLY_L_OVER_D * bellyLiftBand(alt));
  a.ax += _up.x * aLift; a.ay += _up.y * aLift; a.az += _up.z * aLift;
}

function bellyDragLift(
  alt: number, vRel: number, vRad: number,
): { ax: number; ay: number; az: number; aDrag: number } {
  const aDrag = Math.min(0.04, 0.5 * BELLY_CD_A_OVER_M * atmDensity(alt) * vRel);
  const a = { ax: 0, ay: 0, az: 0, aDrag };
  if (aDrag > 1e-9) {
    a.ax -= (_relV.x / vRel) * aDrag;
    a.ay -= (_relV.y / vRel) * aDrag;
    a.az -= (_relV.z / vRel) * aDrag;
  }
  applyBellyLift(alt, vRel, vRad, aDrag, a);
  return a;
}

function fillEarthUpVel(t: number, pos: V3, vel: V3, epoch: EphemerisEpoch): {
  alt: number; vRel: number; vRad: number;
} {
  const b = getBodies(t, epoch);
  sub(_relP, pos, b.earth);
  const rL = len(_relP) || 1;
  set(_up, _relP.x / rL, _relP.y / rL, _relP.z / rL);
  sub(_relV, vel, b.earthVel);
  return { alt: rL - R_EARTH, vRel: len(_relV), vRad: dot(_relV, _up) };
}

function bellyAeroAccel(
  t: number, pos: V3, vel: V3, prop: PropState, mode: BurnMode, epoch: EphemerisEpoch,
): { ax: number; ay: number; az: number } {
  const g = fillEarthUpVel(t, pos, vel, epoch);
  if (!bellyEntryActive(t, g.alt, g.vRel, prop, mode)) return { ax: 0, ay: 0, az: 0 };
  const dl = bellyDragLift(g.alt, g.vRel, g.vRad);
  const bank = bellyBankAccel(t, pos, g.alt, g.vRel, g.vRad, dl.aDrag, epoch);
  return { ax: dl.ax + bank.ax, ay: dl.ay + bank.ay, az: dl.az + bank.az };
}

/** Project vector onto plane ⊥ up into `_horiz`; return false if degenerate. */
function projectHorizOntoUp(vec: V3): boolean {
  const rd = dot(vec, _up);
  set(_horiz, vec.x - _up.x * rd, vec.y - _up.y * rd, vec.z - _up.z * rd);
  if (len(_horiz) <= 1e-6) return false;
  normalize(_horiz, _horiz);
  return true;
}

/** Horizontal bank toward splash during entry. */
function fillDesiredHorizHeading(t: number, pos: V3, alt: number, epoch: EphemerisEpoch): boolean {
  const splash = splashSurfaceInertial(t, _tmp2, epoch);
  const earth = getBodies(t, epoch).earth;
  const r = R_EARTH + alt;
  set(_tmp3, earth.x + splash.x * r - pos.x, earth.y + splash.y * r - pos.y, earth.z + splash.z * r - pos.z);
  return projectHorizOntoUp(_tmp3);
}

function zeroAccel(): { ax: number; ay: number; az: number } {
  return { ax: 0, ay: 0, az: 0 };
}

function bankCrossTrack(align: number, aDrag: number): { ax: number; ay: number; az: number } {
  set(_tmp2, _horiz.x - _tmp3.x * align, _horiz.y - _tmp3.y * align, _horiz.z - _tmp3.z * align);
  if (len(_tmp2) <= 1e-8) return zeroAccel();
  normalize(_tmp2, _tmp2);
  const aBank = Math.min(0.008, aDrag * 0.45 * (1 - align));
  return { ax: _tmp2.x * aBank, ay: _tmp2.y * aBank, az: _tmp2.z * aBank };
}

function bankLateralAccel(vRad: number, aDrag: number): { ax: number; ay: number; az: number } {
  set(_tmp3, _relV.x - _up.x * vRad, _relV.y - _up.y * vRad, _relV.z - _up.z * vRad);
  if (len(_tmp3) <= 0.3) return zeroAccel();
  normalize(_tmp3, _tmp3);
  const align = dot(_horiz, _tmp3);
  if (align >= 0.98) return zeroAccel();
  return bankCrossTrack(align, aDrag);
}

function bellyBankAccel(
  t: number, pos: V3, alt: number, vRel: number, vRad: number, aDrag: number, epoch: EphemerisEpoch,
): { ax: number; ay: number; az: number } {
  if (!(vRel > 1.0 && alt > 12 && alt < 90)) return { ax: 0, ay: 0, az: 0 };
  if (!fillDesiredHorizHeading(t, pos, alt, epoch)) return { ax: 0, ay: 0, az: 0 };
  return bankLateralAccel(vRad, aDrag);
}

function bookHotStageShip(loop: F13Loop, aTot: number, limForceN: number): number {
  if (!(loop.mode === "hot_stage" && hasPropellant(loop.prop, "ship"))) return aTot;
  const shipA = (SHIP_THRUST_N * 0.9) / Math.max(wetMassKg(loop.prop), 1) / 1000;
  const shipLim = limitAccelByThrust(loop.prop, shipA, "ship");
  loop.lastShipN += shipLim.forceN;
  loop.lastBoostN = limForceN;
  return aTot + shipLim.aKmS2;
}

/** Engine thrust accel + book last*N on loop. */
function engineThrustAccel(
  loop: F13Loop,
  t: number,
  pos: V3,
  vel: V3,
  thr: number,
): number {
  steer(t, pos, vel, loop.mode, _steer, loop.epoch); const tank = tankFor(loop.mode, loop.prop.staged);
  const aCmd = peakForceN(loop.mode, thr) / Math.max(wetMassKg(loop.prop), 1) / 1000;
  const lim = limitAccelByThrust(loop.prop, aCmd, tank);
  loop.lastBoostN = tank === "booster" ? lim.forceN : 0;
  loop.lastShipN = tank === "ship" ? lim.forceN : 0;
  const aTot = bookHotStageShip(loop, lim.aKmS2, lim.forceN);
  loop.lastThrustN = loop.lastBoostN + loop.lastShipN;
  return aTot;
}

function clearThrustBook(loop: F13Loop): void {
  loop.lastThrustN = 0;
  loop.lastBoostN = 0;
  loop.lastShipN = 0;
}

function aeroOnlyAcc(loop: F13Loop, aero: { ax: number; ay: number; az: number }): V3 | null {
  clearThrustBook(loop);
  if (aero.ax === 0 && aero.ay === 0 && aero.az === 0) return null;
  set(loop.thrAcc, aero.ax, aero.ay, aero.az);
  return loop.thrAcc;
}

function combineThrustAero(
  loop: F13Loop, aTot: number, aero: { ax: number; ay: number; az: number },
): V3 | null {
  if (aTot < 1e-9 && aero.ax === 0 && aero.ay === 0 && aero.az === 0) return null;
  scale(loop.thrAcc, _steer, aTot);
  loop.thrAcc.x += aero.ax;
  loop.thrAcc.y += aero.ay;
  loop.thrAcc.z += aero.az;
  return loop.thrAcc;
}

/** Combined thrustFn for RK4 (aero + engines). */
function makeFlight13ThrustFn(loop: F13Loop): ThrustFn {
  return (t, pos, vel) => {
    const alt = altitudeEarth(t, pos, loop.epoch);
    const thr = throttleFor(t, alt, loop.mode);
    const aero = bellyAeroAccel(t, pos, vel, loop.prop, loop.mode, loop.epoch);
    if (loop.mode === "idle" || thr < 1e-4) return aeroOnlyAcc(loop, aero);
    return combineThrustAero(loop, engineThrustAccel(loop, t, pos, vel, thr), aero);
  };
}

function hotStageDone(loop: F13Loop): boolean {
  const t = loop.state.t;
  return (
    loop.mode === "hot_stage" &&
    (t - loop.hotStageT0 >= HOT_STAGE_S || t >= F13.HOT_STAGE + HOT_STAGE_S)
  );
}

function advanceBoostHot(loop: F13Loop): void {
  const t = loop.state.t;
  if (loop.mode === "boost" && t >= F13.MECO) {
    loop.mode = "hot_stage";
    loop.hotStageT0 = t;
  }
  if (hotStageDone(loop) || (!loop.prop.staged && t >= F13.HOT_STAGE + 1)) {
    stageBooster(loop.prop, t);
    loop.mode = "upper";
  }
}

function advanceRelightWindow(loop: F13Loop): void {
  const t = loop.state.t;
  if (loop.mode === "idle" && t >= F13.RELIGHT && t < F13.RELIGHT_END) {
    loop.mode = "relight";
  }
  if (loop.mode === "relight" && t >= F13.RELIGHT_END) loop.mode = "idle";
}

/** Boost / hot-stage / SECO / relight / land mode machine. */
function advanceFlight13Mode(loop: F13Loop, alt: number): void {
  advanceBoostHot(loop);
  if (loop.mode === "upper") maybeSeco(loop, alt);
  advanceRelightWindow(loop);
  maybeStartLand(loop, alt);
  if (loop.state.t >= F13.SPLASH + 5) loop.mode = "idle";
}

type SecoGeom = { vRad: number; vHoriz: number; vCirc: number };

function fillHorizFromRel(r: number, vRad: number): number {
  set(
    _horiz,
    _relV.x - (_relP.x / r) * vRad,
    _relV.y - (_relP.y / r) * vRad,
    _relV.z - (_relP.z / r) * vRad,
  );
  return len(_horiz);
}

function secoGeom(loop: F13Loop): SecoGeom {
  const bCut = getBodies(loop.state.t, loop.epoch);
  sub(_relV, loop.state.vel, bCut.earthVel);
  sub(_relP, loop.state.pos, bCut.earth);
  const r = len(_relP) || 1;
  const vRad = dot(_relV, _relP) / r;
  const vHoriz = fillHorizFromRel(r, vRad);
  const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));
  return { vRad, vHoriz, vCirc };
}

function secoShouldCut(loop: F13Loop, alt: number, g: SecoGeom): boolean {
  const t = loop.state.t; const vNeed = SECO_VCIRC_FRAC * g.vCirc;
  const energyOk =
    alt >= SECO_ALT_MIN_KM && g.vHoriz >= vNeed * 0.998 && Math.abs(g.vRad) <= SECO_VRAD_MAX;
  const speedCap = alt >= SECO_ALT_MIN_KM && g.vHoriz >= vNeed * 1.025;
  const propLow = fuelShipFrac(loop.prop) <= SHIP_PROP_RESERVE;
  const clockCut =
    t >= F13.SECO && (Math.abs(g.vRad) <= SECO_VRAD_MAX * 1.5 || propLow || alt < 100);
  return energyOk || speedCap || propLow || clockCut;
}

/** SECO energy / clock cut for upper stage. */
function maybeSeco(loop: F13Loop, alt: number): void {
  if (secoShouldCut(loop, alt, secoGeom(loop))) loop.mode = "idle";
}

function landStartRangeKm(loop: F13Loop): { vRel: number; rangeKm: number } {
  const t = loop.state.t;
  const bL = getBodies(t, loop.epoch);
  sub(_relV, loop.state.vel, bL.earthVel);
  const splash = splashSurfaceInertial(t, _tmp2, loop.epoch);
  sub(_relP, loop.state.pos, bL.earth);
  normalize(_tmp3, _relP);
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(_tmp3, splash))));
  return { vRel: len(_relV), rangeKm: ang * R_EARTH };
}

function shouldStartLand(t: number, alt: number, vRel: number, rangeKm: number): boolean {
  if (t >= F13.LAND_BURN) return true;
  if (alt < 12 && vRel < 0.9 && rangeKm < 600 && t >= F13.ENTRY - 60) return true;
  return alt < 4 && vRel < 0.55 && t >= F13.ENTRY;
}

/** Light landing burn when aero has bled speed or public mark. */
function maybeStartLand(loop: F13Loop, alt: number): void {
  const t = loop.state.t;
  if (loop.mode === "land" || loop.mode === "relight") return;
  if (t < F13.ENTRY - 90) return;
  const g = landStartRangeKm(loop);
  if (shouldStartLand(t, alt, g.vRel, g.rangeKm)) loop.mode = "land";
}

/** HUD phase id from time / mode / altitude. */
function flight13Phase(loop: F13Loop, alt: number): PhaseId {
  if (loop.splashed) return "splashdown";
  const t = loop.state.t;
  if (t < 12) return "launch";
  if (t < F13.SECO) return "ascent";
  if (loop.mode === "land") return "descent";
  if (loop.prop.staged && t >= F13.RELIGHT && alt < 120) return "entry";
  return "coast";
}

/** Integrator step size. */
function flight13Dt(loop: F13Loop, phase: PhaseId, alt: number, maxT: number): number {
  let dt = 1.0;
  if (loop.mode === "boost" || loop.mode === "hot_stage" || loop.mode === "upper") {
    dt = 0.25;
  } else if (loop.mode === "land" || loop.mode === "relight") dt = 0.15;
  else if (phase === "entry" || alt < 120) dt = 0.4;
  else if (phase === "coast") dt = 2.0;
  return Math.min(dt, maxT - loop.state.t);
}

function placeOnSphere(
  pos: V3, center: V3, dir: V3, L: number, radius: number,
): void {
  pos.x = center.x + (dir.x / L) * radius;
  pos.y = center.y + (dir.y / L) * radius;
  pos.z = center.z + (dir.z / L) * radius;
}

function killInwardRadialRel(vel: V3, bodyVel: V3, dir: V3, L: number): void {
  sub(_relV, vel, bodyVel);
  const vr = dot(_relV, dir) / L;
  if (vr >= 0) return;
  vel.x -= (dir.x / L) * vr;
  vel.y -= (dir.y / L) * vr;
  vel.z -= (dir.z / L) * vr;
}

/** Soften velocity toward `refVel`: vel ← ref + (vel − ref)·factor. */
function dampRelVel(vel: V3, refVel: V3, factor: number): void {
  vel.x = refVel.x + (vel.x - refVel.x) * factor;
  vel.y = refVel.y + (vel.y - refVel.y) * factor;
  vel.z = refVel.z + (vel.z - refVel.z) * factor;
}

/**
 * Co-rotating surface velocity at `_relP` (Earth COM vel + ω × r).
 * Writes into `out`. Must not use `_relP` as `out`.
 */
function surfaceFrameVel(earthVel: V3, relP: V3, out: V3): V3 {
  earthNorthPole(_tmp);
  set(_tmp2, _tmp.x * EARTH_SPIN_RATE, _tmp.y * EARTH_SPIN_RATE, _tmp.z * EARTH_SPIN_RATE);
  cross(_tmp3, _tmp2, relP);
  return set(out, earthVel.x + _tmp3.x, earthVel.y + _tmp3.y, earthVel.z + _tmp3.z);
}

/** One-shot surface floor sits this far above the pad so clamp releases after the first snap. */
const SURFACE_CLAMP_ABOVE_PAD_KM = 0.01;

/**
 * Keep craft above surface with light friction when decked early.
 * Friction damps toward the **co-rotating pad frame** (not Earth COM) — damping
 * vs earthVel strips ω×r and kicks the stack westward at liftoff (~17 m/s).
 */
function surfaceClamp(loop: F13Loop): void {
  const b = getBodies(loop.state.t, loop.epoch);
  sub(_relP, loop.state.pos, b.earth);
  const L = len(_relP) || 1;
  const floorR = EARTH_SURFACE_RADIUS_KM + SURFACE_CLAMP_ABOVE_PAD_KM;
  if (!(L < floorR && loop.state.t < F13.SPLASH - 1)) return;
  placeOnSphere(loop.state.pos, b.earth, _relP, L, floorR);
  sub(_relP, loop.state.pos, b.earth);
  const L2 = len(_relP) || 1;
  killInwardRadialRel(loop.state.vel, b.earthVel, _relP, L2);
  surfaceFrameVel(b.earthVel, _relP, _tmp);
  dampRelVel(loop.state.vel, _tmp, 0.96);
}

/** Drain propellant once per step. */
function bookFlight13Prop(loop: F13Loop): void {
  if (loop.lastBoostN > 1e-3 && !loop.prop.staged) {
    burnForce(loop.prop, loop.state.t, loop.lastBoostN, "booster");
  } else if (loop.lastBoostN > 1e-3) {
    burnForce(loop.prop, loop.state.t, loop.lastBoostN, "ship");
  }
  if (loop.lastShipN > 1e-3) {
    burnForce(loop.prop, loop.state.t, loop.lastShipN, "ship");
  }
  if (loop.lastThrustN < 1e-3) coastProp(loop.prop, loop.state.t);
}

/** Snap to splash / under-craft surface and push terminal sample. */
function splashRangeKm(loop: F13Loop, surf: V3): { L: number; curAlt: number; vRel: number; rangeKm: number } {
  const b = getBodies(loop.state.t, loop.epoch);
  sub(_relP, loop.state.pos, b.earth);
  const L = len(_relP) || 1;
  sub(_relV, loop.state.vel, b.earthVel);
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(normalize(_tmp3, _relP), surf))));
  return { L, curAlt: L - R_EARTH, vRel: len(_relV), rangeKm: ang * R_EARTH };
}

/** Earth-fixed pose at the theater splash lat/lon, `altKm` above the water. */
function placeAtSplash(loop: F13Loop, altKm: number): void {
  const b = getBodies(loop.state.t, loop.epoch);
  const surf = splashSurfaceInertial(loop.state.t, _tmp, loop.epoch);
  placeOnSphere(
    loop.state.pos,
    b.earth,
    surf,
    1,
    EARTH_SURFACE_RADIUS_KM + Math.max(0, altKm),
  );
  sub(_relP, loop.state.pos, b.earth);
  surfaceFrameVel(b.earthVel, _relP, loop.state.vel);
}

function snapSplash(loop: F13Loop, _surf: V3, _L: number, _rangeKm: number): void {
  placeAtSplash(loop, 0);
}

/**
 * Late descent / landing burn play out over the sunlit splash site.
 * Dynamics dump energy ~30° west (night); without this seat the webcast
 * landing sequence is on the dark side of Earth.
 */
function seatLandingAtSplash(loop: F13Loop, alt: number): void {
  if (loop.splashed) return;
  if (loop.mode !== "land" && loop.state.t < F13.LAND_BURN) return;
  if (alt > 25) return;
  placeAtSplash(loop, alt);
}

/** Earth-fixed float at the theater splash lat/lon (co-rotating ocean). */
function placeFloating(loop: F13Loop): void {
  placeAtSplash(loop, 0);
}

function naturalSplashDone(loop: F13Loop, geo: ReturnType<typeof splashRangeKm>): boolean {
  return (
    loop.mode === "land" &&
    geo.curAlt < 2.5 &&
    geo.vRel < 0.35 &&
    geo.rangeKm < 180 &&
    loop.state.t >= F13.ENTRY
  );
}

function trySplashdown(loop: F13Loop): boolean {
  if (loop.splashed) return false;
  const surf = splashSurfaceInertial(loop.state.t, _tmp, loop.epoch);
  const geo = splashRangeKm(loop, surf);
  if (!(naturalSplashDone(loop, geo) || loop.state.t >= F13.SPLASH - 0.1)) return false;
  snapSplash(loop, surf, geo.L, geo.rangeKm);
  loop.splashed = true;
  loop.splashT = loop.state.t;
  pushSample(loop.samples, loop.state, "splashdown", false, loop.prop, 0);
  return true;
}

function flight13SampleMinDt(loop: F13Loop, phase: PhaseId): number {
  if (phase === "splashdown" || loop.splashed) return FLOAT_DT_S;
  if (phase === "launch" || loop.mode === "boost" || loop.mode === "hot_stage") return 0.2;
  if (phase === "coast" && loop.mode === "idle") return 4;
  return 0.4;
}

/** Maybe push a trajectory sample this step. */
function maybePushFlight13Sample(loop: F13Loop, phase: PhaseId): void {
  const burning = loop.lastThrustN > 1e3;
  const last = loop.samples[loop.samples.length - 1]!;
  const due =
    loop.state.t - last.t >= flight13SampleMinDt(loop, phase) ||
    phase !== last.phase ||
    burning !== last.burning;
  if (due) pushSample(loop.samples, loop.state, phase, burning, loop.prop, loop.lastThrustN);
}

function makeFlight13Raw(
  loop: F13Loop,
  durationS: number,
  meta: ReturnType<typeof deriveTrajectoryMeta>,
): MissionResult {
  return { samples: loop.samples, durationS, moonPhase0: loop.epoch.moonPhase0, translunarInjectionDeltaV: 0, minMoonAlt: Infinity, ok: true, message: "Flight 13 · suborbital · Indian Ocean splashdown (theater timeline)", peakSpeedKmS: meta.peakSpeedKmS, stageT: meta.stageT, horizonsLandingT: firstSplashdownT(loop.samples) };
}

function stampFlight13Out(
  out: MissionResult,
  meta: ReturnType<typeof deriveTrajectoryMeta>,
  gravity: GravityModel | undefined,
): MissionResult {
  out.horizonsLandingT = firstSplashdownT(out.samples); out.peakSpeedKmS = meta.peakSpeedKmS;
  out.stageT = meta.stageT ?? F13.HOT_STAGE;
  out.minMoonAlt = Infinity;
  const gLabel = gravity === "earth" ? "earth-only" : "n-body";
  console.info(
    `[flight13] ${out.message} · ${gLabel} · duration=${(out.durationS / 60).toFixed(1)} min · samples=${out.samples.length} · stageT=${out.stageT?.toFixed(0)}s`,
  );
  return out;
}

/** Pack + downsample Flight 13 result. */
function finalizeFlight13(loop: F13Loop): MissionResult {
  if (loop.splashed && loop.state.t < F13.END - 1e-3) {
    loop.state.t = F13.END;
    placeFloating(loop);
  }
  const last = loop.samples[loop.samples.length - 1]!;
  if (last.phase !== "splashdown" || last.t < F13.END - 0.05) {
    pushSample(loop.samples, loop.state, "splashdown", false, loop.prop, 0);
  }
  const durationS = loop.samples[loop.samples.length - 1]!.t;
  const meta = deriveTrajectoryMeta(loop.samples, loop.epoch);
  const out = downsampleTrajectory(makeFlight13Raw(loop, durationS, meta));
  return stampFlight13Out(out, meta, loop.accelOpts.gravity);
}

function padLiftoffState(epoch: EphemerisEpoch): CraftState {
  const pad = starbasePadState(0, epoch);
  const state: CraftState = { t: 0, pos: clone(pad.pos), vel: clone(pad.vel) };
  state.vel.x += pad.up.x * 0.015;
  state.vel.y += pad.up.y * 0.015;
  state.vel.z += pad.up.z * 0.015;
  return state;
}

function emptyF13Loop(epoch: EphemerisEpoch, gravity: GravityModel): F13Loop {
  return {
    state: padLiftoffState(epoch), samples: [], prop: createPropState(0), epoch,
    mode: "boost", hotStageT0: -1, lastThrustN: 0, lastBoostN: 0, lastShipN: 0,
    thrAcc: v3(), accelOpts: { gravity, epoch }, splashed: false, splashT: 0,
  };
}

/**
 * Integrate Flight 13 from liftoff through Indian Ocean splashdown
 * and a post-splash drone hold to {@link F13.END}.
 */
function initFlight13Loop(opts?: Flight13MissionOptions): F13Loop {
  const epoch = opts?.epoch ?? makeFlight13Epoch(0, 0);
  return emptyF13Loop(epoch, opts?.gravity ?? "nbody");
}

function stepFlight13Float(loop: F13Loop, maxT: number): boolean {
  const dt = Math.min(FLOAT_DT_S, maxT - loop.state.t);
  if (dt < 1e-4) return false;
  loop.state.t += dt;
  placeFloating(loop);
  maybePushFlight13Sample(loop, "splashdown");
  return true;
}

function flight13PostStep(loop: F13Loop, phase: PhaseId): boolean {
  surfaceClamp(loop);
  bookFlight13Prop(loop);
  const alt = altitudeEarth(loop.state.t, loop.state.pos, loop.epoch);
  seatLandingAtSplash(loop, alt);
  if (trySplashdown(loop)) return true;
  maybePushFlight13Sample(loop, phase);
  return true;
}

function flight13Step(loop: F13Loop, thrustFn: ThrustFn, maxT: number): boolean {
  if (loop.splashed) return stepFlight13Float(loop, maxT);
  const alt = altitudeEarth(loop.state.t, loop.state.pos, loop.epoch);
  advanceFlight13Mode(loop, alt);
  const phase = flight13Phase(loop, alt);
  const dt = flight13Dt(loop, phase, alt, maxT);
  if (dt < 1e-4) return false;
  rk4Step(loop.state, dt, thrustFn, loop.accelOpts);
  return flight13PostStep(loop, phase);
}

export function runFlight13Mission(opts?: Flight13MissionOptions): MissionResult {
  const loop = initFlight13Loop(opts);
  const thrustFn = makeFlight13ThrustFn(loop);
  pushSample(loop.samples, loop.state, "launch", true, loop.prop, peakForceN("boost", 0.98));
  const maxT = F13.END;
  while (loop.state.t < maxT) {
    if (!flight13Step(loop, thrustFn, maxT)) break;
  }
  return finalizeFlight13(loop);
}
