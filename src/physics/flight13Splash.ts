/** Surface clamp, splash snap, float hold, and mission finalize. */
import { EARTH_SURFACE_ALT_KM, R_EARTH } from "./constants";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  inertialRelToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import { earthSurfaceRadiusAlong, geodeticToEllipsoidMeshLocal, radialHeightAboveEllipsoid } from "./wgs84";
import { altitudeEarth, getBodies, rk4Step, type CraftState, type GravityModel, type ThrustFn } from "./integrator";
import { downsampleTrajectory } from "./missionDownsample";
import type { MissionResult, PhaseId } from "./missionTypes";
import { burnForce, coastProp, createPropState } from "./propellant";
import { deriveTrajectoryMeta } from "./trajectoryMeta";
import { cross, dot, len, normalize, set, sub, type V3, v3, clone } from "./vec3";
import { FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON } from "./flight13Corridor";
import { makeFlight13Epoch } from "./flight13Epoch";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { F13, FLOAT_DT_S, firstSplashdownT, splashSurfaceInertial } from "./flight13Timeline";
import { _relP, _relV, _splashLocal, _tmp, _tmp2, _tmp3 } from "./flight13Scratch";
import type { F13Loop, Flight13MissionOptions } from "./flight13Types";
import { pushSample } from "./flight13Types";
import { clearThrustBook } from "./flight13Thrust";
import { advanceFlight13Mode, flight13Dt, flight13Phase } from "./flight13Mode";
import { makeInterceptNormal } from "./flight13Steer";

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
  earthNorthPole(_tmp);
  const floorR = earthSurfaceRadiusAlong(_relP, _tmp, EARTH_SURFACE_ALT_KM + SURFACE_CLAMP_ABOVE_PAD_KM);
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
  earthNorthPole(_tmp);
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(normalize(_tmp3, _relP), surf))));
  return { L, curAlt: radialHeightAboveEllipsoid(_relP, _tmp), vRel: len(_relV), rangeKm: ang * R_EARTH };
}

function geodeticOf(loop: F13Loop): { lat: number; lon: number } {
  const b = getBodies(loop.state.t, loop.epoch);
  sub(_relP, loop.state.pos, b.earth);
  inertialRelToMeshLocal(_relP, loop.state.t, _tmp, loop.epoch);
  const r = len(_tmp) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, _tmp.y / r)));
  let lon = Math.atan2(_tmp.z, -_tmp.x) - Math.PI;
  while (lon > Math.PI) lon -= 2 * Math.PI;
  while (lon < -Math.PI) lon += 2 * Math.PI;
  return { lat, lon };
}

function placeAtGeodetic(loop: F13Loop, lat: number, lon: number, altKm: number): void {
  const b = getBodies(loop.state.t, loop.epoch);
  geodeticToEllipsoidMeshLocal(lat, lon, EARTH_SURFACE_ALT_KM + Math.max(0, altKm), _splashLocal);
  meshLocalToInertial(_splashLocal, loop.state.t, _tmp, loop.epoch);
  set(loop.state.pos, b.earth.x + _tmp.x, b.earth.y + _tmp.y, b.earth.z + _tmp.z);
  sub(_relP, loop.state.pos, b.earth);
  surfaceFrameVel(b.earthVel, _relP, loop.state.vel);
}

function snapSplash(loop: F13Loop): void {
  const g = geodeticOf(loop);
  loop.floatLat = g.lat;
  loop.floatLon = g.lon;
  placeAtGeodetic(loop, loop.floatLat, loop.floatLon, 0);
}

/** Earth-fixed float at the recorded splash lat/lon (co-rotating ocean). */
function placeFloating(loop: F13Loop): void {
  placeAtGeodetic(loop, loop.floatLat, loop.floatLon, 0);
}

function naturalSplashDone(loop: F13Loop, geo: ReturnType<typeof splashRangeKm>): boolean {
  if (loop.state.t < F13.LAND_BURN - 20) return false;
  // geo.vRel is ECI (includes ~0.4 km/s Earth rotation on the deck).
  return geo.curAlt < 0.22 && geo.vRel < 0.55;
}

function trySplashdown(loop: F13Loop): boolean {
  if (loop.splashed) return false;
  const surf = splashSurfaceInertial(loop.state.t, _tmp, loop.epoch);
  const geo = splashRangeKm(loop, surf);
  if (!naturalSplashDone(loop, geo)) return false;
  snapSplash(loop);
  loop.splashed = true;
  loop.splashT = loop.state.t;
  loop.mode = "idle";
  clearThrustBook(loop);
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
export function finalizeFlight13(loop: F13Loop): MissionResult {
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
  state.vel.x += pad.up.x * 0.002;
  state.vel.y += pad.up.y * 0.002;
  state.vel.z += pad.up.z * 0.002;
  return state;
}

function emptyF13Loop(epoch: EphemerisEpoch, gravity: GravityModel): F13Loop {
  return {
    state: padLiftoffState(epoch), samples: [], prop: createPropState(0), epoch,
    mode: "boost", hotStageT0: -1, lastThrustN: 0, lastBoostN: 0, lastShipN: 0,
    thrAcc: v3(), accelOpts: { gravity, epoch }, splashed: false, splashT: 0,
    floatLat: FLIGHT13_SPLASH_LAT, floatLon: FLIGHT13_SPLASH_LON,
    interceptN: makeInterceptNormal(epoch),
  };
}

/**
 * Integrate Flight 13 from liftoff through Indian Ocean splashdown
 * and a post-splash drone hold to {@link F13.END}.
 */
export function initFlight13Loop(opts?: Flight13MissionOptions): F13Loop {
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
  if (trySplashdown(loop)) return true;
  maybePushFlight13Sample(loop, phase);
  return true;
}

export function flight13Step(loop: F13Loop, thrustFn: ThrustFn, maxT: number): boolean {
  if (loop.splashed) return stepFlight13Float(loop, maxT);
  const alt = altitudeEarth(loop.state.t, loop.state.pos, loop.epoch);
  advanceFlight13Mode(loop, alt);
  const phase = flight13Phase(loop, alt);
  const dt = flight13Dt(loop, phase, alt, maxT);
  if (dt < 1e-4) return false;
  rk4Step(loop.state, dt, thrustFn, loop.accelOpts);
  return flight13PostStep(loop, phase);
}

