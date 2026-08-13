/**
 * Post–translunar-injection lunar capture arc:
 * ballistic n-body coast → lunar orbit insertion → low lunar orbit coast →
 * powered descent → soft land (south pole).
 *
 * Theater-grade (not ops). Uses the same restricted n-body force model as the
 * free coast; LOI / PDI thrust is mass-coupled ship propellant.
 */

import {
  DT_BURN,
  DT_COAST,
  DT_NEAR,
  DESCENT_ALTITUDE,
  LOW_LUNAR_ORBIT_ALTITUDE_KM,
  LOW_LUNAR_ORBIT_COAST_REVS,
  LUNAR_ORBIT_INSERTION_ACCEL,
  LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM,
  R_MOON,
  TOUCHDOWN_SPEED,
} from "./constants";
import {
  finishLanding,
  loiResidualAllowsSnap,
  lowLunarOrbitPeriodS,
  lunarOrbitInsertionComplete,
  lunarOrbitInsertionThrust,
  poweredDescentThrust,
  snapPolarLowLunarOrbit,
} from "./capture";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import { keplerRvAt } from "./kepler";
import { pushSample } from "./missionSample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  hasPropellant,
  limitAccelByThrust,
  type PropState,
} from "./propellant";
import { orbitAfterTranslunarInjection, transferTimeEst } from "./translunarInjection";
import { moonRelativeEncounter } from "./bplane";
import {
  TRAJECTORY_CORRECTION_APPROACH_FRAC,
  TRAJECTORY_CORRECTION_MAX_DELTA_V,
  runTrajectoryCorrectionBurn,
  trajectoryCorrectionDeltaV,
} from "./coast";
import { len, scale, set, sub, v3, type V3 } from "./vec3";

const _relP = v3();
const _relV = v3();
const _th = v3();
const _tcmDv = v3();

export type LunarCaptureArgs = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  epoch?: EphemerisEpoch;
  /** One approach TCM if B-plane search could not close ballistically. */
  applyTcm?: boolean;
};

/** Mutable trackers shared across capture phases. */
type CaptureTrack = {
  minMoonAlt: number;
  periluneT: number;
  keplerRefMaxDevKm: number;
  phase: PhaseId;
  ballisticPeriluneAltKm: number;
  bPlaneMissKm: number;
  caRelP: V3;
  caRelV: V3;
  haveCa: boolean;
  tcmDone: boolean;
  tcmCount: number;
  tcmDv: number;
  frozenPerilune: boolean;
};

function limitGuideThrust(prop: PropState, th: V3): V3 | null {
  const aCmd = len(th);
  if (!(aCmd > 1e-12)) return null;
  const lim = limitAccelByThrust(prop, aCmd, "ship");
  if (lim.forceN < 1e-3) return null;
  return scale(_th, th, lim.aKmS2 / aCmd);
}

/**
 * Ship thrust guide with wet-mass limit. Mutates a scratch vector.
 */
function shipThrustFn(
  prop: PropState,
  guide: (t: number, pos: typeof _relP, vel: typeof _relV) => typeof _th | null,
): ThrustFn {
  return (t, pos, vel) => {
    if (!hasPropellant(prop, "ship")) return null;
    const th = guide(t, pos, vel);
    return th ? limitGuideThrust(prop, th) : null;
  };
}

function keplerDevAt(
  state: CraftState,
  keplerRef: ReturnType<typeof orbitAfterTranslunarInjection>,
  epoch: EphemerisEpoch,
): number {
  keplerRvAt(keplerRef, state.t, _relP, _relV);
  const b = getBodies(state.t, epoch);
  return Math.hypot(
    state.pos.x - (b.earth.x + _relP.x),
    state.pos.y - (b.earth.y + _relP.y),
    state.pos.z - (b.earth.z + _relP.z),
  );
}

/** Max |Δr| vs osculating Kepler reference at inject. */
function trackKeplerDev(
  state: CraftState,
  keplerRef: ReturnType<typeof orbitAfterTranslunarInjection>,
  epoch: EphemerisEpoch,
  track: CaptureTrack,
): void {
  if (!(keplerRef.a > 0) || keplerRef.e >= 1) return;
  const d = keplerDevAt(state, keplerRef, epoch);
  if (Number.isFinite(d) && d > track.keplerRefMaxDevKm) track.keplerRefMaxDevKm = d;
}

/** Coast step size by Moon distance. */
function coastDt(dMoon: number): number {
  if (dMoon < 40_000) return DT_NEAR;
  if (dMoon < 100_000) return 5;
  if (dMoon < 250_000) return 12;
  return DT_COAST;
}

/** LOI handoff gate: near Moon and late enough in the transfer. */
function loiGateReached(
  altM: number,
  coastT: number,
  Tcoast: number,
  stateT: number,
  track: CaptureTrack,
): boolean {
  const nearMoon = altM < LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM;
  const lateEnough =
    coastT > Tcoast * 0.55 ||
    (stateT > track.periluneT - 4_000 && track.minMoonAlt < 80_000);
  return nearMoon && lateEnough && altM > 0;
}

/** Past-perilune flyby without LOI sphere entry. */
function isBallisticFlyby(
  altM: number,
  coastT: number,
  Tcoast: number,
  stateT: number,
  track: CaptureTrack,
): boolean {
  return (
    coastT > Tcoast * 1.05 &&
    stateT > track.periluneT + 12_000 &&
    altM > track.minMoonAlt + 15_000 &&
    altM > LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM
  );
}

/** Update min lunar altitude / perilune epoch; store Moon-relative CA state. */
function noteMoonAlt(
  altM: number,
  stateT: number,
  track: CaptureTrack,
  state: CraftState,
  epoch: EphemerisEpoch,
): void {
  if (altM >= track.minMoonAlt) return;
  track.minMoonAlt = altM;
  track.periluneT = stateT;
  const b = getBodies(stateT, epoch);
  sub(track.caRelP, state.pos, b.moon);
  set(track.caRelV, state.vel.x - b.moonVel.x, state.vel.y - b.moonVel.y, state.vel.z - b.moonVel.z);
  track.haveCa = true;
}

function freezeBallisticPerilune(ctx: CaptureCtx): void {
  if (ctx.track.frozenPerilune) return;
  ctx.track.frozenPerilune = true;
  ctx.track.ballisticPeriluneAltKm = ctx.track.minMoonAlt;
  if (!ctx.track.haveCa) return;
  const enc = moonRelativeEncounter(ctx.track.caRelP, ctx.track.caRelV);
  ctx.track.bPlaneMissKm = enc.bPlaneMissKm;
}

type CaptureCtx = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  epoch: EphemerisEpoch;
  track: CaptureTrack;
  keplerRef: ReturnType<typeof orbitAfterTranslunarInjection>;
  applyTcm: boolean;
};

/** Pack early-exit MissionResult (flyby / impact / Earth hit). */
function packResult(
  samples: Sample[],
  moonPhase0: number,
  translunarInjectionDeltaV: number,
  minMoonAlt: number,
  message: string,
  keplerRefMaxDevKm: number,
  extra?: Partial<MissionResult>,
): MissionResult {
  return {
    samples, durationS: samples[samples.length - 1]!.t, moonPhase0, translunarInjectionDeltaV, minMoonAlt,
    ok: true, message, keplerRefMaxDevKm, trajectoryCorrectionCount: extra?.trajectoryCorrectionCount ?? 0,
    trajectoryCorrectionTotalDeltaV: extra?.trajectoryCorrectionTotalDeltaV ?? 0,
    periluneAltKm: extra?.periluneAltKm, bPlaneMissKm: extra?.bPlaneMissKm,
  };
}

function captureMeta(ctx: CaptureCtx): Partial<MissionResult> {
  freezeBallisticPerilune(ctx);
  return {
    trajectoryCorrectionCount: ctx.track.tcmCount,
    trajectoryCorrectionTotalDeltaV: ctx.track.tcmDv,
    periluneAltKm: ctx.track.ballisticPeriluneAltKm,
    bPlaneMissKm: ctx.track.bPlaneMissKm,
  };
}

function packFromCtx(ctx: CaptureCtx, message: string, minAlt?: number): MissionResult {
  return packResult(
    ctx.samples, ctx.moonPhase0, ctx.translunarInjectionDeltaV,
    minAlt ?? ctx.track.minMoonAlt, message, ctx.track.keplerRefMaxDevKm, captureMeta(ctx),
  );
}

function snapStateToMoon(state: CraftState, epoch: EphemerisEpoch): void {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.moon);
  const L = len(_relP) || 1;
  state.pos.x = b.moon.x + (_relP.x / L) * R_MOON;
  state.pos.y = b.moon.y + (_relP.y / L) * R_MOON;
  state.pos.z = b.moon.z + (_relP.z / L) * R_MOON;
  set(state.vel, b.moonVel.x, b.moonVel.y, b.moonVel.z);
}

/** Snap craft to lunar surface and freeze velocity with Moon. */
function impactSettle(ctx: CaptureCtx): MissionResult {
  snapStateToMoon(ctx.state, ctx.epoch);
  pushSample(ctx.samples, ctx.state, "impact", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
  const msg = `Lunar impact during capture · minAlt ≈ ${Math.max(0, ctx.track.minMoonAlt).toFixed(0)} km`;
  console.info(`[tothemoon] ${msg}`);
  return packFromCtx(ctx, msg, Math.min(ctx.track.minMoonAlt, 0));
}

/** One ballistic coast sample after rk4. */
function pushCoastSample(ctx: CaptureCtx, dMoon: number): void {
  pushSample(ctx.samples, ctx.state, "coast", false, false, dMoon < 100_000 ? 8 : 25, ctx.lastT, ctx.prop, 0, "ship");
}

/** Enter approach at LOI gate. */
function enterLoiApproach(ctx: CaptureCtx, altM: number, dMoon: number, coastT: number): void {
  freezeBallisticPerilune(ctx);
  ctx.track.phase = "approach";
  pushSample(ctx.samples, ctx.state, "approach", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
  console.info(
    `[tothemoon] LOI gate · alt=${altM.toFixed(0)} km · dMoon=${dMoon.toFixed(0)} km · ` +
      `coastT=${(coastT / 3600).toFixed(1)} h · ballistic perilune=${ctx.track.ballisticPeriluneAltKm.toFixed(0)} km · ` +
      `Bmiss=${Number.isFinite(ctx.track.bPlaneMissKm) ? ctx.track.bPlaneMissKm.toFixed(0) : "∞"} km`,
  );
}

function pushForcedCoastCap(ctx: CaptureCtx): void {
  pushSample(ctx.samples, ctx.state, "coast", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
}

function flybyExit(ctx: CaptureCtx): MissionResult {
  pushForcedCoastCap(ctx);
  const msg = `Ballistic flyby · min lunar alt ${ctx.track.minMoonAlt.toFixed(0)} km (no LOI)`;
  console.info(`[tothemoon] ${msg}`);
  return packFromCtx(ctx, msg);
}

/** Handle coast loop exit conditions; returns result if mission ends. */
function coastLoopExit(
  ctx: CaptureCtx,
  altM: number,
  dMoon: number,
  coastT: number,
  Tcoast: number,
): MissionResult | null {
  if (altM < 0) return impactSettle(ctx);
  if (loiGateReached(altM, coastT, Tcoast, ctx.state.t, ctx.track)) {
    enterLoiApproach(ctx, altM, dMoon, coastT); return null;
  }
  if (isBallisticFlyby(altM, coastT, Tcoast, ctx.state.t, ctx.track)) return flybyExit(ctx);
  if (altitudeEarth(ctx.state.t, ctx.state.pos, ctx.epoch) >= 0) return null;
  pushForcedCoastCap(ctx);
  return packFromCtx(ctx, "Earth impact (pre-LOI)");
}

function ballisticCoastOnce(
  ctx: CaptureCtx, tTli: number, Tcoast: number,
): MissionResult | null {
  const dMoon = distanceToMoon(ctx.state.t, ctx.state.pos, ctx.epoch); const altM = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  noteMoonAlt(altM, ctx.state.t, ctx.track, ctx.state, ctx.epoch);
  trackKeplerDev(ctx.state, ctx.keplerRef, ctx.epoch, ctx.track);
  maybeApproachTcm(ctx, tTli, Tcoast);
  const early = coastLoopExit(ctx, altM, dMoon, ctx.state.t - tTli, Tcoast);
  if (early || ctx.track.phase !== "coast") return early;
  rk4Step(ctx.state, coastDt(dMoon), undefined, { epoch: ctx.epoch });
  pushCoastSample(ctx, dMoon);
  return null;
}

function maybeApproachTcm(ctx: CaptureCtx, tTli: number, Tcoast: number): void {
  if (!ctx.applyTcm || ctx.track.tcmDone) return;
  if (ctx.state.t - tTli < Tcoast * TRAJECTORY_CORRECTION_APPROACH_FRAC) return;
  ctx.track.tcmDone = true;
  const { dv, mag } = trajectoryCorrectionDeltaV(
    ctx.state.t, ctx.state.pos, ctx.state.vel, ctx.keplerRef,
    TRAJECTORY_CORRECTION_MAX_DELTA_V, ctx.epoch,
  );
  if (mag < 1e-5) return;
  set(_tcmDv, dv.x, dv.y, dv.z);
  // Velocity-only finite burn (no Kepler position rejoin / teleport).
  const delivered = runTrajectoryCorrectionBurn(
    ctx.state, _tcmDv, ctx.samples, ctx.lastT, ctx.prop, undefined, ctx.epoch,
  );
  ctx.track.tcmCount += 1;
  ctx.track.tcmDv += delivered;
  console.info(
    `[tothemoon] Approach TCM · Δv=${delivered.toFixed(3)} km/s (B-plane search did not close ballistically)`,
  );
}

/** Ballistic coast until LOI gate, flyby, impact, or timeout. */
function runBallisticToLoi(
  ctx: CaptureCtx,
  tTli: number,
  Tcoast: number,
): MissionResult | null {
  const maxCoastT = tTli + Tcoast * 1.4 + 80_000;
  while (ctx.state.t < maxCoastT && ctx.track.phase === "coast") {
    const early = ballisticCoastOnce(ctx, tTli, Tcoast);
    if (early) return early;
  }
  return null;
}

/** Timeout after max coast: try LOI if close, else distant flyby. */
function resolveCoastTimeout(ctx: CaptureCtx): MissionResult | null {
  if (ctx.track.phase !== "coast") return null;
  if (ctx.track.minMoonAlt < LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM) {
    freezeBallisticPerilune(ctx);
    ctx.track.phase = "approach";
    pushSample(ctx.samples, ctx.state, "approach", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
    return null;
  }
  const msg = `Distant flyby · min lunar alt ${ctx.track.minMoonAlt.toFixed(0)} km (no LOI)`;
  console.info(`[tothemoon] ${msg}`);
  return packFromCtx(ctx, msg);
}

/** Commanded LOI accel and whether thrust is active this sample. */
function loiThrustNow(
  ctx: CaptureCtx,
  loiStartT: { t: number },
): { thNow: ReturnType<typeof lunarOrbitInsertionThrust>; aCmd: number } {
  const thNow = hasPropellant(ctx.prop, "ship")
    ? lunarOrbitInsertionThrust(ctx.state.t, ctx.state.pos, ctx.state.vel, ctx.epoch)
    : null;
  if (!thNow) return { thNow, aCmd: 0 };
  const aRaw = len(thNow); const lim = limitAccelByThrust(ctx.prop, aRaw, "ship");
  if (lim.forceN < 1e-3) return { thNow: null, aCmd: 0 };
  if (loiStartT.t < 0) loiStartT.t = ctx.state.t;
  return { thNow, aCmd: lim.aKmS2 };
}

/** Whether LOI burn loop should stop. */
function loiBurnDone(
  complete: boolean,
  burnS: number,
  dry: boolean,
  altM2: number,
): boolean {
  return complete || burnS > 3_600 || dry || altM2 < 80;
}


function noteLoiAlt(ctx: CaptureCtx, alt: number): void {
  ctx.track.minMoonAlt = Math.min(ctx.track.minMoonAlt, alt);
}

function loiEndStatus(
  ctx: CaptureCtx, loiStartT: { t: number },
): { complete: boolean; burnS: number; dry: boolean } {
  return { complete: lunarOrbitInsertionComplete(ctx.state.t, ctx.state.pos, ctx.state.vel, ctx.epoch), burnS: loiStartT.t > 0 ? ctx.state.t - loiStartT.t : 0, dry: !hasPropellant(ctx.prop, "ship") };
}

function loiAfterStep(
  ctx: CaptureCtx, loiStartT: { t: number }, thNow: unknown, aCmd: number,
): "continue" | "break" {
  const altM2 = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  noteLoiAlt(ctx, altM2);
  pushSample(ctx.samples, ctx.state, "approach", thNow !== null, false, 2, ctx.lastT, ctx.prop, aCmd, "ship", true);
  const st = loiEndStatus(ctx, loiStartT);
  if (!loiBurnDone(st.complete, st.burnS, st.dry, altM2)) return "continue";
  console.info(`[tothemoon] LOI end · alt=${altM2.toFixed(0)} km · burn=${st.burnS.toFixed(0)} s · complete=${st.complete} · dry=${st.dry}`);
  return "break";
}

/** One LOI integrate + sample step; returns impact result or null. */
function loiBurnStep(
  ctx: CaptureCtx,
  loiThrustFn: ThrustFn,
  loiStartT: { t: number },
): MissionResult | "continue" | "break" {
  const altM = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  noteLoiAlt(ctx, altM);
  if (altM < 0) return impactSettle(ctx);
  const { thNow, aCmd } = loiThrustNow(ctx, loiStartT);
  rk4Step(ctx.state, DT_BURN, loiThrustFn, { epoch: ctx.epoch });
  return loiAfterStep(ctx, loiStartT, thNow, aCmd);
}

function loiThrustGuide(ctx: CaptureCtx): ThrustFn {
  return shipThrustFn(ctx.prop, (t, pos, vel) =>
    lunarOrbitInsertionThrust(t, pos, vel, ctx.epoch),
  );
}

/** Lunar orbit insertion burn (phase approach). */
function runLoiBurn(ctx: CaptureCtx): MissionResult | null {
  const loiThrustFn = loiThrustGuide(ctx);
  const loiStartT = { t: -1 };
  for (const maxLoiT = ctx.state.t + 12_000; ctx.state.t < maxLoiT && ctx.track.phase === "approach";) {
    const res = loiBurnStep(ctx, loiThrustFn, loiStartT);
    if (res === "break") break;
    if (res !== "continue") return res;
  }
  return null;
}

function shouldSnapLoi(ctx: CaptureCtx): boolean {
  if (lunarOrbitInsertionComplete(ctx.state.t, ctx.state.pos, ctx.state.vel, ctx.epoch)) return false;
  return loiResidualAllowsSnap(ctx.state.t, ctx.state.pos, ctx.state.vel, ctx.epoch);
}

/** Residual floor to polar circular LLO — only when leftover dr is tiny. */
function maybeSnapLoi(ctx: CaptureCtx): void {
  if (!shouldSnapLoi(ctx)) return;
  snapPolarLowLunarOrbit(ctx.state.t, ctx.state, ctx.samples, ctx.lastT, ctx.prop, ctx.epoch);
  pushSample(ctx.samples, ctx.state, "approach", true, true, 0, ctx.lastT, ctx.prop, LUNAR_ORBIT_INSERTION_ACCEL * 0.5, "ship", false);
  console.info(`[tothemoon] LOI snap · polar low lunar orbit @ ${LOW_LUNAR_ORBIT_ALTITUDE_KM} km`);
}

/** Low lunar orbit coast (phase braking). */
function lloCoastStep(ctx: CaptureCtx, tEnd: number): boolean {
  rk4Step(ctx.state, Math.min(DT_NEAR * 2, tEnd - ctx.state.t), undefined, { epoch: ctx.epoch });
  const altM = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  noteLoiAlt(ctx, altM);
  if (altM < 5) return false;
  pushSample(ctx.samples, ctx.state, "braking", false, false, 8, ctx.lastT, ctx.prop, 0, "ship");
  return true;
}

function logLloCoast(period: number, coastS: number): void {
  console.info(
    `[tothemoon] Low lunar orbit coast · ${(coastS / 3600).toFixed(2)} h ` +
      `(${LOW_LUNAR_ORBIT_COAST_REVS} rev · P≈${(period / 3600).toFixed(2)} h)`,
  );
}

function runLowLunarOrbitCoast(ctx: CaptureCtx): void {
  ctx.track.phase = "braking"; pushSample(ctx.samples, ctx.state, "braking", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
  const period = lowLunarOrbitPeriodS(R_MOON + LOW_LUNAR_ORBIT_ALTITUDE_KM);
  const coastS = period * LOW_LUNAR_ORBIT_COAST_REVS;
  const tEnd = ctx.state.t + coastS;
  logLloCoast(period, coastS);
  while (ctx.state.t < tEnd) {
    if (!lloCoastStep(ctx, tEnd)) break;
  }
  pushSample(ctx.samples, ctx.state, "braking", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
}

/** Commanded PDI accel this sample. */
function pdiThrustNow(
  ctx: CaptureCtx,
): { thNow: ReturnType<typeof poweredDescentThrust>; aCmd: number } {
  const thNow = hasPropellant(ctx.prop, "ship")
    ? poweredDescentThrust(ctx.state.t, ctx.state.pos, ctx.state.vel, ctx.epoch)
    : null;
  if (!thNow) return { thNow, aCmd: 0 };
  const aRaw = len(thNow);
  const lim = limitAccelByThrust(ctx.prop, aRaw, "ship");
  if (lim.forceN < 1e-3) return { thNow: null, aCmd: 0 };
  return { thNow, aCmd: lim.aKmS2 };
}

/** PDI step size from altitude. */
function pdiDt(altM: number): number {
  if (altM < 20) return DT_BURN;
  if (altM < DESCENT_ALTITUDE) return DT_NEAR;
  return DT_NEAR * 2;
}

/** Whether powered descent should stop. */
function pdiDone(alt2: number, vRel: number, prop: PropState): boolean {
  return (
    (alt2 < 2 && vRel < TOUCHDOWN_SPEED * 40) ||
    alt2 < 0.2 ||
    !hasPropellant(prop, "ship")
  );
}


/** One powered-descent integrate + sample step. */
function pdiStep(ctx: CaptureCtx, pdiFn: ThrustFn): "continue" | "break" {
  const altM = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch); noteLoiAlt(ctx, altM);
  if (altM < 0.05) return "break";
  const { thNow, aCmd } = pdiThrustNow(ctx);
  rk4Step(ctx.state, pdiDt(altM), altM < DESCENT_ALTITUDE * 1.5 ? pdiFn : undefined, { epoch: ctx.epoch });
  sub(_relV, ctx.state.vel, getBodies(ctx.state.t, ctx.epoch).moonVel);
  const alt2 = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  pushSample(ctx.samples, ctx.state, "descent", thNow !== null, false, alt2 < 30 ? 1 : 3, ctx.lastT, ctx.prop, aCmd, "ship", true);
  return pdiDone(alt2, len(_relV), ctx.prop) ? "break" : "continue";
}

/** Powered descent (phase descent). */
function runPoweredDescent(ctx: CaptureCtx): void {
  ctx.track.phase = "descent";
  pushSample(ctx.samples, ctx.state, "descent", true, true, 0, ctx.lastT, ctx.prop, 0, "ship");
  const pdiFn = shipThrustFn(ctx.prop, (t, pos, vel) =>
    poweredDescentThrust(t, pos, vel, ctx.epoch),
  );
  const maxPdiT = ctx.state.t + 8_000;
  while (ctx.state.t < maxPdiT) {
    if (pdiStep(ctx, pdiFn) === "break") break;
  }
}


/** Build shared capture context from public args. */
function makeCaptureCtx(args: LunarCaptureArgs): CaptureCtx {
  const epoch = args.epoch ?? DEFAULT_EPHEMERIS;
  const track: CaptureTrack = {
    minMoonAlt: Infinity, periluneT: args.state.t, keplerRefMaxDevKm: 0, phase: "coast",
    ballisticPeriluneAltKm: Infinity, bPlaneMissKm: Infinity,
    caRelP: v3(), caRelV: v3(), haveCa: false,
    tcmDone: false, tcmCount: 0, tcmDv: 0, frozenPerilune: false,
  };
  return {
    state: args.state, samples: args.samples, lastT: args.lastT, prop: args.prop,
    moonPhase0: args.moonPhase0, translunarInjectionDeltaV: args.translunarInjectionDeltaV,
    epoch, track, keplerRef: orbitAfterTranslunarInjection(args.state, epoch),
    applyTcm: args.applyTcm === true,
  };
}

function landWithMeta(ctx: CaptureCtx): MissionResult {
  const landed = finishLanding(
    ctx.state, ctx.samples, ctx.moonPhase0, ctx.translunarInjectionDeltaV,
    ctx.track.minMoonAlt, ctx.prop, ctx.epoch,
  );
  return { ...landed, keplerRefMaxDevKm: ctx.track.keplerRefMaxDevKm, ...captureMeta(ctx) };
}

/**
 * Full capture path from post–translunar-injection state through soft land.
 */
function captureAfterCoast(ctx: CaptureCtx): MissionResult {
  const loiImpact = runLoiBurn(ctx);
  if (loiImpact) return loiImpact;
  maybeSnapLoi(ctx);
  runLowLunarOrbitCoast(ctx);
  runPoweredDescent(ctx);
  return landWithMeta(ctx);
}

export function runLunarCapture(args: LunarCaptureArgs): MissionResult {
  const ctx = makeCaptureCtx(args);
  const tTli = ctx.state.t;
  pushForcedCoastCap(ctx);
  trackKeplerDev(ctx.state, ctx.keplerRef, ctx.epoch, ctx.track);
  const early = runBallisticToLoi(ctx, tTli, transferTimeEst()) ?? resolveCoastTimeout(ctx);
  if (early) return early;
  return captureAfterCoast(ctx);
}
