/** Surface clamp, splash snap, float hold, and Flight 14 mission finalize. */
import { EARTH_SURFACE_ALT_KM } from "./constants";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame";
import { earthSurfaceRadiusAlong, geodeticToEllipsoidMeshLocal, radialHeightAboveEllipsoid } from "./wgs84";
import { altitudeEarth, getBodies, rk4Step, type CraftState, type GravityModel, type ThrustFn } from "./integrator";
import { downsampleTrajectory } from "./missionDownsample";
import type { MissionResult, PhaseId } from "./missionTypes";
import { burnForce, coastProp, createPropState } from "./propellant";
import { deriveTrajectoryMeta } from "./trajectoryMeta";
import { cross, dot, len, set, sub, type V3, v3, clone } from "./vec3";
import { makeFlight14Epoch } from "./flight14Epoch";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { F14, FLOAT_DT_S, firstSplashdownT } from "./flight14Timeline";
import { _relP, _relV, _splashLocal, _tmp, _tmp2, _tmp3 } from "./flight13Scratch";
import type { F14Loop, Flight14MissionOptions } from "./flight14Types";
import { pushSample } from "./flight14Types";
import { clearThrustBook } from "./flight14Thrust";
import { advanceFlight14Mode, flight14Dt, flight14Phase } from "./flight14Mode";
import { makeInterceptNormal } from "./flight14Steer";
import { inertialGeodetic } from "./flight13Splash";

export { firstSplashGeodetic, inertialGeodetic } from "./flight13Splash";

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

function dampRelVel(vel: V3, refVel: V3, factor: number): void {
  vel.x = refVel.x + (vel.x - refVel.x) * factor;
  vel.y = refVel.y + (vel.y - refVel.y) * factor;
  vel.z = refVel.z + (vel.z - refVel.z) * factor;
}

function surfaceFrameVel(earthVel: V3, relP: V3, out: V3): V3 {
  earthNorthPole(_tmp);
  set(_tmp2, _tmp.x * EARTH_SPIN_RATE, _tmp.y * EARTH_SPIN_RATE, _tmp.z * EARTH_SPIN_RATE);
  cross(_tmp3, _tmp2, relP);
  return set(out, earthVel.x + _tmp3.x, earthVel.y + _tmp3.y, earthVel.z + _tmp3.z);
}

const SURFACE_CLAMP_ABOVE_PAD_KM = 0.01;

function surfaceClamp(loop: F14Loop): void {
  const b = getBodies(loop.state.t, loop.epoch);
  sub(_relP, loop.state.pos, b.earth);
  const L = len(_relP) || 1;
  earthNorthPole(_tmp);
  const floorR = earthSurfaceRadiusAlong(_relP, _tmp, EARTH_SURFACE_ALT_KM + SURFACE_CLAMP_ABOVE_PAD_KM);
  if (!(L < floorR)) return;
  // Orbital coast: do not skate on the 50 m shell, but never tunnel through
  // the planet if a slightly-short ellipse would punch underground.
  if (loop.state.t >= F14.SECO + 15 && loop.state.t < F14.ENTRY - 20) {
    if (L > floorR - 2) return;
  }
  if (loop.state.t >= F14.SPLASH - 1) return;
  placeOnSphere(loop.state.pos, b.earth, _relP, L, floorR);
  sub(_relP, loop.state.pos, b.earth);
  const L2 = len(_relP) || 1;
  killInwardRadialRel(loop.state.vel, b.earthVel, _relP, L2);
  surfaceFrameVel(b.earthVel, _relP, _tmp);
  dampRelVel(loop.state.vel, _tmp, 0.96);
}

function bookFlight14Prop(loop: F14Loop): void {
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

function splashState(loop: F14Loop): { curAlt: number; vRel: number } {
  const b = getBodies(loop.state.t, loop.epoch);
  sub(_relP, loop.state.pos, b.earth);
  sub(_relV, loop.state.vel, b.earthVel);
  earthNorthPole(_tmp);
  return { curAlt: radialHeightAboveEllipsoid(_relP, _tmp), vRel: len(_relV) };
}

function geodeticOf(loop: F14Loop): { lat: number; lon: number } {
  return inertialGeodetic(loop.state.t, loop.state.pos, loop.epoch);
}

function placeAtGeodetic(loop: F14Loop, lat: number, lon: number, altKm: number): void {
  const b = getBodies(loop.state.t, loop.epoch);
  geodeticToEllipsoidMeshLocal(lat, lon, EARTH_SURFACE_ALT_KM + Math.max(0, altKm), _splashLocal);
  meshLocalToInertial(_splashLocal, loop.state.t, _tmp, loop.epoch);
  set(loop.state.pos, b.earth.x + _tmp.x, b.earth.y + _tmp.y, b.earth.z + _tmp.z);
  sub(_relP, loop.state.pos, b.earth);
  surfaceFrameVel(b.earthVel, _relP, loop.state.vel);
}

function snapSplash(loop: F14Loop): void {
  const g = geodeticOf(loop);
  loop.floatLat = g.lat;
  loop.floatLon = g.lon;
  placeAtGeodetic(loop, loop.floatLat, loop.floatLon, 0);
}

function placeFloating(loop: F14Loop): void {
  placeAtGeodetic(loop, loop.floatLat, loop.floatLon, 0);
}

function naturalSplashDone(loop: F14Loop, geo: ReturnType<typeof splashState>): boolean {
  if (loop.state.t < F14.LAND_BURN) return false;
  return geo.curAlt < 0.22 && geo.vRel < 0.55;
}

function trySplashdown(loop: F14Loop): boolean {
  if (loop.splashed) return false;
  const geo = splashState(loop);
  if (!naturalSplashDone(loop, geo)) return false;
  snapSplash(loop);
  loop.splashed = true;
  loop.splashT = loop.state.t;
  loop.mode = "idle";
  clearThrustBook(loop);
  pushSample(loop.samples, loop.state, "splashdown", false, loop.prop, 0);
  return true;
}

function flight14SampleMinDt(loop: F14Loop, phase: PhaseId): number {
  if (phase === "splashdown" || loop.splashed) return FLOAT_DT_S;
  if (phase === "launch" || loop.mode === "boost" || loop.mode === "hot_stage") return 0.2;
  if (phase === "lowEarthOrbit" && loop.mode === "idle") return 20;
  if (phase === "coast" && loop.mode === "idle") return 4;
  return 0.4;
}

function maybePushFlight14Sample(loop: F14Loop, phase: PhaseId): void {
  const burning = loop.lastThrustN > 1e3;
  const last = loop.samples[loop.samples.length - 1]!;
  const due =
    loop.state.t - last.t >= flight14SampleMinDt(loop, phase) ||
    phase !== last.phase ||
    burning !== last.burning;
  if (due) pushSample(loop.samples, loop.state, phase, burning, loop.prop, loop.lastThrustN);
}

function makeFlight14Raw(
  loop: F14Loop,
  durationS: number,
  meta: ReturnType<typeof deriveTrajectoryMeta>,
): MissionResult {
  return {
    samples: loop.samples, durationS, moonPhase0: loop.epoch.moonPhase0,
    translunarInjectionDeltaV: 0, minMoonAlt: Infinity, ok: true,
    message: "Flight 14 · orbital · Pacific splashdown (theater timeline)",
    peakSpeedKmS: meta.peakSpeedKmS, stageT: meta.stageT,
    horizonsLandingT: firstSplashdownT(loop.samples),
  };
}

function stampFlight14Out(
  out: MissionResult,
  meta: ReturnType<typeof deriveTrajectoryMeta>,
  gravity: GravityModel | undefined,
): MissionResult {
  out.horizonsLandingT = firstSplashdownT(out.samples);
  out.peakSpeedKmS = meta.peakSpeedKmS;
  out.stageT = meta.stageT ?? F14.HOT_STAGE;
  out.minMoonAlt = Infinity;
  const gLabel = gravity === "earth" ? "earth-only" : "n-body";
  console.info(
    `[flight14] ${out.message} · ${gLabel} · duration=${(out.durationS / 3600).toFixed(2)} h · samples=${out.samples.length} · stageT=${out.stageT?.toFixed(0)}s`,
  );
  return out;
}

export function finalizeFlight14(loop: F14Loop): MissionResult {
  if (loop.splashed && loop.state.t < F14.END - 1e-3) {
    loop.state.t = F14.END;
    placeFloating(loop);
  }
  const last = loop.samples[loop.samples.length - 1]!;
  if (loop.splashed && (last.phase !== "splashdown" || last.t < F14.END - 0.05)) {
    pushSample(loop.samples, loop.state, "splashdown", false, loop.prop, 0);
  }
  const durationS = loop.samples[loop.samples.length - 1]!.t;
  const meta = deriveTrajectoryMeta(loop.samples, loop.epoch);
  const raw = makeFlight14Raw(loop, durationS, meta);
  if (!loop.splashed) {
    raw.ok = false;
    raw.message = "Flight 14 · orbital · did not splash (theater timeline)";
  }
  const out = downsampleTrajectory(raw);
  return stampFlight14Out(out, meta, loop.accelOpts.gravity);
}

function padLiftoffState(epoch: EphemerisEpoch): CraftState {
  const pad = starbasePadState(0, epoch);
  const state: CraftState = { t: 0, pos: clone(pad.pos), vel: clone(pad.vel) };
  state.vel.x += pad.up.x * 0.002;
  state.vel.y += pad.up.y * 0.002;
  state.vel.z += pad.up.z * 0.002;
  return state;
}

function emptyF14Loop(epoch: EphemerisEpoch, gravity: GravityModel): F14Loop {
  return {
    state: padLiftoffState(epoch), samples: [], prop: createPropState(0), epoch,
    mode: "boost", hotStageT0: -1, lastThrustN: 0, lastBoostN: 0, lastShipN: 0,
    thrAcc: v3(), accelOpts: { gravity, epoch }, splashed: false, splashT: 0,
    floatLat: 0, floatLon: 0,
    interceptN: makeInterceptNormal(epoch),
  };
}

export function initFlight14Loop(opts?: Flight14MissionOptions): F14Loop {
  const epoch = opts?.epoch ?? makeFlight14Epoch(0, 0);
  return emptyF14Loop(epoch, opts?.gravity ?? "nbody");
}

function stepFlight14Float(loop: F14Loop, maxT: number): boolean {
  const dt = Math.min(FLOAT_DT_S, maxT - loop.state.t);
  if (dt < 1e-4) return false;
  loop.state.t += dt;
  placeFloating(loop);
  maybePushFlight14Sample(loop, "splashdown");
  return true;
}

function flight14PostStep(loop: F14Loop, phase: PhaseId): boolean {
  surfaceClamp(loop);
  bookFlight14Prop(loop);
  if (trySplashdown(loop)) return true;
  maybePushFlight14Sample(loop, phase);
  return true;
}

export function flight14Step(loop: F14Loop, thrustFn: ThrustFn, maxT: number): boolean {
  if (loop.splashed) return stepFlight14Float(loop, maxT);
  const alt = altitudeEarth(loop.state.t, loop.state.pos, loop.epoch);
  advanceFlight14Mode(loop, alt);
  const phase = flight14Phase(loop, alt);
  const dt = flight14Dt(loop, phase, alt, maxT);
  if (dt < 1e-4) return false;
  rk4Step(loop.state, dt, thrustFn, loop.accelOpts);
  return flight14PostStep(loop, phase);
}
