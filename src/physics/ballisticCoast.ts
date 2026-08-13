/**
 * Pure ballistic restricted n-body coast after translunar injection (no trajectory corrections, no lunar orbit insertion / powered descent).
 *
 * Used by the full bake (`runBallisticCoast`) and the fast transfer probe
 * (`probePerilune`) so search scores match the path that will be packed.
 */

import {
  DT_COAST,
  DT_NEAR,
  R_MOON,
} from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
} from "./integrator";
import { keplerRvAt } from "./kepler";
import type { LowEarthOrbitRelative } from "./lowEarthOrbitCoast";
import { restoreLowEarthOrbitRelative } from "./lowEarthOrbitCoast";
import { pushSample } from "./missionSample";
import type { MissionResult, Sample } from "./missionTypes";
import type { PropState } from "./propellant";
import { orbitAfterTranslunarInjection, runFiniteTranslunarInjection, transferTimeEst } from "./translunarInjection";
import { moonRelativeEncounter } from "./bplane";
import { copy, len, normalize, set, sub, v3, type V3 } from "./vec3";

const _relP = v3();
const _relV = v3();
const _from = v3();

export type ProbeResult = {
  minAlt: number;
  periluneT: number;
  rEarth: number;
  /** B-plane miss vs south-pole design (km); ∞ if no encounter */
  bPlaneMissKm: number;
  /** r̂_ca · lunar south at closest approach */
  southDot: number;
};

/** Probe step size by Moon distance. */
function probeDt(dMoon: number): number {
  if (dMoon < 60_000) return 10;
  if (dMoon < 150_000) return 25;
  return 45;
}

/** Past-perilune stop for the fast probe. */
function probePastPerilune(
  coastT: number,
  T: number,
  stateT: number,
  periluneT: number,
  altM: number,
  minAlt: number,
): boolean {
  return (
    coastT > T * 0.75 &&
    stateT > periluneT + 5_000 &&
    altM > minAlt + 15_000 &&
    minAlt < 200_000
  );
}

type ProbeTrack = {
  minAlt: number;
  periluneT: number;
  rEarthAtMin: number;
  caRelP: V3;
  caRelV: V3;
  haveCa: boolean;
};

const _caP = v3();
const _caV = v3();

/** Update probe closest-approach track (Moon-relative state at the event). */
function noteProbeAlt(
  altM: number,
  stateT: number,
  rE: number,
  track: ProbeTrack,
  state: CraftState,
  epoch: EphemerisEpoch,
): void {
  if (altM >= track.minAlt) return;
  track.minAlt = altM;
  track.periluneT = stateT;
  track.rEarthAtMin = rE;
  const b = getBodies(stateT, epoch);
  sub(track.caRelP, state.pos, b.moon);
  set(track.caRelV, state.vel.x - b.moonVel.x, state.vel.y - b.moonVel.y, state.vel.z - b.moonVel.z);
  track.haveCa = true;
}

function earthHitProbe(coastT: number, T: number, epoch: EphemerisEpoch, state: CraftState): boolean {
  return altitudeEarth(state.t, state.pos, epoch) < 0 && coastT < T * 0.7;
}

/** Integrate one probe step; returns early result or null to continue. */
function probeStepResult(
  state: CraftState,
  epoch: EphemerisEpoch,
  tTli: number,
  T: number,
  track: ProbeTrack,
): ProbeResult | "continue" | "break" {
  const coastT = state.t - tTli;
  const altM = altitudeMoon(state.t, state.pos, epoch);
  sub(_relP, state.pos, getBodies(state.t, epoch).earth);
  const rE = len(_relP);
  noteProbeAlt(altM, state.t, rE, track, state, epoch);
  if (earthHitProbe(coastT, T, epoch, state)) return emptyProbe();
  if (altM < 0) return probeFromTrack(track, tTli, Math.min(track.minAlt, 0), rE);
  return probePastPerilune(coastT, T, state.t, track.periluneT, altM, track.minAlt) ? "break" : "continue";
}

/**
 * Fast probe: pure restricted n-body ballistic coast after translunar injection (no burns).
 * Matches {@link runBallisticCoast} so search scores the path the bake will fly.
 */
function emptyProbe(): ProbeResult {
  return { minAlt: Infinity, periluneT: 0, rEarth: Infinity, bPlaneMissKm: Infinity, southDot: 0 };
}

function probeFromTrack(
  track: ProbeTrack,
  tTli: number,
  minAlt = track.minAlt,
  rEarth = track.rEarthAtMin,
): ProbeResult {
  if (!track.haveCa) {
    return { minAlt, periluneT: track.periluneT - tTli, rEarth, bPlaneMissKm: Infinity, southDot: 0 };
  }
  copy(_caP, track.caRelP);
  copy(_caV, track.caRelV);
  const enc = moonRelativeEncounter(_caP, _caV);
  return {
    minAlt,
    periluneT: track.periluneT - tTli,
    rEarth,
    bPlaneMissKm: enc.bPlaneMissKm,
    southDot: enc.southDot,
  };
}

function probeFinal(track: ProbeTrack, tTli: number): ProbeResult {
  return probeFromTrack(track, tTli);
}

function runProbeLoop(
  state: CraftState, epoch: EphemerisEpoch, tTli: number, T: number, track: ProbeTrack,
): ProbeResult {
  let dt = 45;
  while (state.t < tTli + T * 1.35 + 50_000) {
    rk4Step(state, dt, undefined, { epoch });
    const res = probeStepResult(state, epoch, tTli, T, track);
    if (res === "break") break;
    if (res !== "continue") return res;
    dt = probeDt(distanceToMoon(state.t, state.pos, epoch));
  }
  return probeFinal(track, tTli);
}

export function probePerilune(
  translunarInjectionDeltaV: number,
  lowEarthOrbitRelativeTemplate: LowEarthOrbitRelative | null,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): ProbeResult {
  if (!lowEarthOrbitRelativeTemplate) return emptyProbe();
  const state = restoreLowEarthOrbitRelative(lowEarthOrbitRelativeTemplate, epoch);
  runFiniteTranslunarInjection(state, translunarInjectionDeltaV, null, null, null, epoch);
  const tTli = state.t;
  const track: ProbeTrack = {
    minAlt: Infinity, periluneT: tTli, rEarthAtMin: Infinity,
    caRelP: v3(), caRelV: v3(), haveCa: false,
  };
  return runProbeLoop(state, epoch, tTli, transferTimeEst(), track);
}

export type BallisticCoastArgs = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  epoch?: EphemerisEpoch;
};

type CoastTrack = {
  minMoonAlt: number;
  periluneT: number;
  keplerRefMaxDevKm: number;
};

type CoastCtx = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  epoch: EphemerisEpoch;
  track: CoastTrack;
  keplerRef: ReturnType<typeof orbitAfterTranslunarInjection>;
};

function keplerDevKm(state: CraftState, keplerRef: CoastCtx["keplerRef"], epoch: EphemerisEpoch): number {
  keplerRvAt(keplerRef, state.t, _relP, _relV);
  const b = getBodies(state.t, epoch);
  return Math.hypot(
    state.pos.x - (b.earth.x + _relP.x),
    state.pos.y - (b.earth.y + _relP.y),
    state.pos.z - (b.earth.z + _relP.z),
  );
}

/** Max |Δr| vs osculating Kepler reference at inject. */
function trackKeplerDev(ctx: CoastCtx): void {
  const { keplerRef, state, epoch, track } = ctx;
  if (!(keplerRef.a > 0) || keplerRef.e >= 1) return;
  const d = keplerDevKm(state, keplerRef, epoch);
  if (Number.isFinite(d) && d > track.keplerRefMaxDevKm) track.keplerRefMaxDevKm = d;
}

/** Pack MissionResult for ballistic coast outcomes. */
function coastResult(ctx: CoastCtx, message: string, minAlt?: number): MissionResult {
  return { samples: ctx.samples, durationS: ctx.samples[ctx.samples.length - 1]!.t, moonPhase0: ctx.moonPhase0, translunarInjectionDeltaV: ctx.translunarInjectionDeltaV, minMoonAlt: minAlt ?? ctx.track.minMoonAlt, ok: true, message, keplerRefMaxDevKm: ctx.track.keplerRefMaxDevKm, trajectoryCorrectionCount: 0, trajectoryCorrectionTotalDeltaV: 0 };
}

function placeOnMoonSurface(state: CraftState, moon: V3, moonVel: V3, dir: V3): void {
  state.pos.x = moon.x + dir.x * R_MOON;
  state.pos.y = moon.y + dir.y * R_MOON;
  state.pos.z = moon.z + dir.z * R_MOON;
  set(state.vel, moonVel.x, moonVel.y, moonVel.z);
}

/** Project onto lunar surface and freeze with Moon. */
function snapToMoonSurface(ctx: CoastCtx): void {
  const b = getBodies(ctx.state.t, ctx.epoch);
  sub(_relP, ctx.state.pos, b.moon);
  if (len(_relP) < 1e-6) set(_relP, 0, 0, -1);
  normalize(_from, _relP);
  placeOnMoonSurface(ctx.state, b.moon, b.moonVel, _from);
}

function pushImpactSample(ctx: CoastCtx): void {
  pushSample(ctx.samples, ctx.state, "impact", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
}

/** Short settle samples co-moving with Moon after impact. */
function pushImpactSettle(ctx: CoastCtx, tHit: number): void {
  for (let i = 1; i <= 20; i++) {
    const t = tHit + i * 60;
    const bi = bodyPositions(t, ctx.epoch);
    ctx.state.t = t;
    placeOnMoonSurface(ctx.state, bi.moon, bi.moonVel, _from);
    pushImpactSample(ctx);
  }
}

/** Lunar impact terminal path. */
function lunarImpactResult(ctx: CoastCtx): MissionResult {
  snapToMoonSurface(ctx);
  pushImpactSample(ctx);
  pushImpactSettle(ctx, ctx.state.t);
  const msg =
    `Lunar impact (ballistic · no post-Translunar injection burns) · minAlt before hit ≈ ${Math.max(0, ctx.track.minMoonAlt).toFixed(0)} km`;
  console.info(`[tothemoon] ${msg}`);
  return coastResult(ctx, msg, Math.min(ctx.track.minMoonAlt, 0));
}

/** Flyby end message from min lunar altitude. */
function flybyMessage(minMoonAlt: number): string {
  if (minMoonAlt < 100) {
    return `Ballistic skim · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`;
  }
  if (minMoonAlt < 25_000) {
    return `Ballistic flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`;
  }
  return `Distant flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`;
}

/** End after transfer arc (design TOF + margin). */
function transferDone(
  coastT: number,
  Tcoast: number,
  stateT: number,
  track: CoastTrack,
  altM: number,
): boolean {
  return (
    (coastT > Tcoast * 0.95 &&
      stateT > track.periluneT + 8_000 &&
      altM > track.minMoonAlt + 10_000) ||
    coastT > Tcoast * 1.15
  );
}

/** Coast step size by Moon distance. */
function ballisticCoastDt(dMoon: number): number {
  if (dMoon < 40_000) return DT_NEAR;
  if (dMoon < 100_000) return 5;
  if (dMoon < 250_000) return 12;
  return DT_COAST;
}

/** Note min lunar alt and track Kepler deviation. */
function noteCoastAlt(ctx: CoastCtx, altM: number): void {
  if (altM < ctx.track.minMoonAlt) {
    ctx.track.minMoonAlt = altM;
    ctx.track.periluneT = ctx.state.t;
  }
  trackKeplerDev(ctx);
}

function pushForcedCoast(ctx: CoastCtx): void {
  pushSample(ctx.samples, ctx.state, "coast", false, true, 0, ctx.lastT, ctx.prop, 0, "ship");
}

function flybyTerminal(ctx: CoastCtx): MissionResult {
  pushForcedCoast(ctx);
  const msg = flybyMessage(ctx.track.minMoonAlt);
  console.info(`[tothemoon] ${msg}`);
  return coastResult(ctx, msg);
}

function earthImpactTerminal(ctx: CoastCtx): MissionResult {
  pushForcedCoast(ctx);
  console.info(`[tothemoon] Earth impact @ t=${(ctx.state.t / 3600).toFixed(1)} h`);
  return coastResult(ctx, "Earth impact (ballistic · no post-Translunar injection burns)");
}

/** Handle impact / flyby / Earth hit; null = continue integrating. */
function coastTerminal(
  ctx: CoastCtx,
  altM: number,
  coastT: number,
  Tcoast: number,
): MissionResult | null {
  if (altM < 0) return lunarImpactResult(ctx);
  if (transferDone(coastT, Tcoast, ctx.state.t, ctx.track, altM)) return flybyTerminal(ctx);
  if (altitudeEarth(ctx.state.t, ctx.state.pos, ctx.epoch) < 0) return earthImpactTerminal(ctx);
  return null;
}

/** Timeout message after long coast. */
function timeoutMessage(minMoonAlt: number): string {
  if (Number.isFinite(minMoonAlt) && minMoonAlt < 500_000) {
    return `Ballistic coast end · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`;
  }
  return "Ballistic coast end · no lunar encounter (no post-Translunar injection burns)";
}

/**
 * Integrate post–translunar-injection ballistic coast until lunar impact, flyby end, Earth
 * impact, or max transfer window. Appends coast / impact samples in place.
 */
function makeCoastCtx(args: BallisticCoastArgs): CoastCtx {
  const epoch = args.epoch ?? DEFAULT_EPHEMERIS;
  return {
    state: args.state, samples: args.samples, lastT: args.lastT, prop: args.prop,
    moonPhase0: args.moonPhase0, translunarInjectionDeltaV: args.translunarInjectionDeltaV,
    epoch, track: { minMoonAlt: Infinity, periluneT: args.state.t, keplerRefMaxDevKm: 0 },
    keplerRef: orbitAfterTranslunarInjection(args.state, epoch),
  };
}

function coastIntegrateStep(ctx: CoastCtx, tTli: number, Tcoast: number): MissionResult | null {
  const dMoon = distanceToMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  const altM = altitudeMoon(ctx.state.t, ctx.state.pos, ctx.epoch);
  noteCoastAlt(ctx, altM);
  const done = coastTerminal(ctx, altM, ctx.state.t - tTli, Tcoast);
  if (done) return done;
  rk4Step(ctx.state, ballisticCoastDt(dMoon), undefined, { epoch: ctx.epoch });
  pushSample(ctx.samples, ctx.state, "coast", false, false, dMoon < 100_000 ? 8 : 25, ctx.lastT, ctx.prop, 0, "ship");
  return null;
}

function coastTimeout(ctx: CoastCtx): MissionResult {
  pushForcedCoast(ctx);
  const msg = timeoutMessage(ctx.track.minMoonAlt);
  console.info(`[tothemoon] ${msg}`);
  return coastResult(ctx, msg);
}

export function runBallisticCoast(args: BallisticCoastArgs): MissionResult {
  const ctx = makeCoastCtx(args); const tTli = ctx.state.t;
  const Tcoast = transferTimeEst();
  pushForcedCoast(ctx);
  trackKeplerDev(ctx);
  while (ctx.state.t < tTli + Tcoast * 1.35 + 60_000) {
    const done = coastIntegrateStep(ctx, tTli, Tcoast);
    if (done) return done;
  }
  return coastTimeout(ctx);
}
