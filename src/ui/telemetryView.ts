/**
 * Pure telemetry view model: {@link Telemetry} → display labels.
 *
 * No DOM. {@link bindHud} applies the result each frame. Sky lines accept an
 * optional formatter so tests stay free of Horizons / body geometry.
 */

import {
  landingBeatCompleteSubtitle,
  type LandingBeatKind,
} from "../mission/landingBeat";
import type { PhaseId } from "../physics/missionTypes";
import {
  BOOSTER_DRY_KG,
  BOOSTER_PROP_KG,
  R_EARTH,
  R_MOON,
  SHIP_DRY_KG,
  SHIP_PROP_KG,
} from "../physics/constants";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { formatSkyPhaseLine } from "../physics/skyPhase";
import {
  clamp01,
  formatAccelG,
  formatDistance,
  formatDistancePrecise,
  formatFocusDistance,
  formatFuel,
  formatFuelDetailed,
  formatMassKg,
  formatMinMoonAlt,
  formatMissionTime,
  formatMissionTimeDetailed,
  formatOptional,
  formatPlaybackLine,
  formatProgressPercent,
  formatProgressRemainingLine,
  formatSpeed,
  formatSpeedPrecise,
  formatThrust,
  formatThrustDetailed,
  formatTranslunarInjectionDv,
  formatTranslunarInjectionDvDetailed,
  formatWebcastMissionTime,
  fuelBarWidthPercent,
  thrustAccelG,
  wetMassFromFuel,
} from "./hudFormat";

/** Live HUD inputs from the theater (one frame). */
export type Telemetry = {
  phase: string;
  phaseId: PhaseId;
  t: number;
  durationS: number;
  distanceToMoon: number;
  altitude: number;
  speed: number;
  /** Booster propellant remaining 0–1 */
  fuelBooster: number;
  /** Ship propellant remaining 0–1 */
  fuelShip: number;
  /** Thrust force (N) */
  thrustN: number;
  playing: boolean;
  dateUtc: string;
  /** Effective playback speed currently applied to the clock */
  playbackSpeed: number;
  /** True once the craft has landed (and landing-beat hold has elapsed) */
  missionComplete: boolean;
  /** Terminal beat kind for complete-card copy (landed / impact / flyby) */
  completeKind?: LandingBeatKind | null;
  /** Translunar injection Δv (km/s) for mission-complete stats */
  translunarInjectionDeltaV: number;
  /** Minimum lunar altitude during approach/capture (km) */
  minMoonAlt: number;
  /** Peak inertial |v| (km/s) from pack meta */
  peakSpeedKmS?: number;
  /** Mission time of booster stage-out (s), or null */
  stageT?: number | null;
  /** Peak |r_nbody − r_kepler| on Translunar injection coast (km) */
  keplerRefMaxDevKm?: number;
  /** Camera distance to focus target (km) */
  focusDistance: number;
  /** Detailed metrics (M overlay) */
  altEarth: number;
  altMoon: number;
  distMoon: number;
  speedEarth: number;
  speedMoon: number;
  staged: boolean;
  burning: boolean;
  /**
   * Optional Flight 13 force-model check (n-body vs Earth-only).
   * When set, Metrics shows a "Force check" row.
   */
  forceCompareLine?: string | null;
};

/** Main chrome telemetry strip. */
export type MainTelemetryLabels = Readonly<{
  phase: string;
  missionClock: string;
  dateUtc: string;
  distance: string;
  progress: string;
  altitude: string;
  focusDistance: string;
  speed: string;
  fuelBooster: string;
  fuelShip: string;
  thrust: string;
  sky: string;
  fuelBoosterBar: string;
  fuelShipBar: string;
  playLabel: string;
  playPressed: boolean;
  /** Scrubber range value 0…1000 */
  scrubValue: string;
  /** Normalized progress u ∈ [0, 1] */
  progressU: number;
  playbackSpeed: number;
  phaseId: PhaseId;
  missionComplete: boolean;
}>;

/** Mission-complete card fields (always computed; HUD shows when complete). */
export type CompleteCardLabels = Readonly<{
  subtitle: string;
  duration: string;
  translunarInjectionDeltaV: string;
  minMoonAlt: string;
  fuelShip: string;
  peakSpeed: string;
  stageT: string;
  sky: string;
}>;

/** Metrics (M) overlay rows. */
export type MetricsLabels = Readonly<{
  phase: string;
  time: string;
  date: string;
  sky: string;
  progress: string;
  playback: string;
  altEarth: string;
  rEarth: string;
  altMoon: string;
  distMoon: string;
  rMoon: string;
  cam: string;
  speed: string;
  speedEarth: string;
  speedMoon: string;
  booster: string;
  ship: string;
  mass: string;
  thrust: string;
  accel: string;
  engines: string;
  staged: string;
  duration: string;
  translunarInjectionDeltaV: string;
  minalt: string;
  peakSpeed: string;
  stageT: string;
  keplerDev: string;
  forceCheck: string;
  forceCheckVisible: boolean;
}>;

/** Full pure view for one telemetry frame. */
export type TelemetryView = Readonly<{
  main: MainTelemetryLabels;
  /** Non-null when `missionComplete` (labels for the complete card). */
  complete: CompleteCardLabels | null;
  metrics: MetricsLabels;
}>;

export type TelemetryViewOptions = {
  /**
   * Sky one-liner at mission time. Defaults to {@link formatSkyPhaseLine}
   * with {@link DEFAULT_EPHEMERIS} (or `epoch` when provided).
   */
  skyLine?: (missionT: number) => string;
  /** Ephemeris for default sky geometry when `skyLine` is omitted. */
  epoch?: EphemerisEpoch;
};

function safeSkyLine(
  missionT: number,
  opts?: TelemetryViewOptions,
): string {
  try {
    if (opts?.skyLine) return opts.skyLine(missionT);
    return formatSkyPhaseLine(
      missionT,
      opts?.epoch ?? DEFAULT_EPHEMERIS,
    );
  } catch {
    return "—";
  }
}

/** Engines row for Metrics. */
export function enginesLabel(burning: boolean, thrustN: number): string {
  return burning && thrustN > 500 ? "burning" : "coast / idle";
}

/** Staged row for Metrics. */
export function stagedLabel(staged: boolean): string {
  return staged ? "yes · ship only" : "no · full stack";
}

/** Booster Metrics cell (empty after stage-out). */
export function boosterMetricsLabel(
  staged: boolean,
  fuelBooster: number,
  boosterKg: number,
): string {
  if (staged) return "staged · empty";
  return formatFuelDetailed(fuelBooster, boosterKg, BOOSTER_PROP_KG);
}

/** Kepler deviation cell (— when missing or zero). */
export function keplerDevLabel(keplerRefMaxDevKm?: number): string {
  if (
    keplerRefMaxDevKm != null &&
    Number.isFinite(keplerRefMaxDevKm) &&
    keplerRefMaxDevKm > 0
  ) {
    return formatDistancePrecise(keplerRefMaxDevKm);
  }
  return "—";
}

/** Scrubber integer 0…1000 from mission time. */
export function scrubRangeValue(t: number, durationS: number): string {
  const u = durationS > 0 ? t / durationS : 0;
  return String(Math.round(Math.min(1, Math.max(0, u)) * 1000));
}

/**
 * Map live {@link Telemetry} to all HUD label strings for this frame.
 */
export function buildTelemetryView(
  tel: Telemetry,
  opts?: TelemetryViewOptions,
): TelemetryView {
  const progressU =
    tel.durationS > 0 ? Math.min(1, Math.max(0, tel.t / tel.durationS)) : 0;
  const skyLive = safeSkyLine(Math.max(0, tel.t), opts);
  const skyTerminal = safeSkyLine(
    Math.max(0, tel.durationS > 0 ? tel.durationS : tel.t),
    opts,
  );

  const main: MainTelemetryLabels = Object.freeze({
    phase: tel.phase,
    missionClock: formatWebcastMissionTime(tel.t),
    dateUtc: tel.dateUtc,
    distance: formatDistance(tel.distanceToMoon),
    progress: formatProgressPercent(tel.t, tel.durationS),
    altitude: formatDistance(Math.max(0, tel.altitude)),
    focusDistance: formatFocusDistance(tel.focusDistance),
    speed: formatSpeed(tel.speed),
    fuelBooster: formatFuel(tel.fuelBooster, "booster"),
    fuelShip: formatFuel(tel.fuelShip, "ship"),
    thrust: formatThrust(tel.thrustN),
    sky: skyLive,
    fuelBoosterBar: fuelBarWidthPercent(tel.fuelBooster),
    fuelShipBar: fuelBarWidthPercent(tel.fuelShip),
    playLabel: tel.playing ? "Pause" : "Play",
    playPressed: tel.playing,
    scrubValue: scrubRangeValue(tel.t, tel.durationS),
    progressU,
    playbackSpeed: tel.playbackSpeed,
    phaseId: tel.phaseId,
    missionComplete: tel.missionComplete,
  });

  const complete: CompleteCardLabels | null = tel.missionComplete
    ? Object.freeze({
        subtitle: landingBeatCompleteSubtitle(tel.completeKind, {
          splashdown: tel.phaseId === "splashdown",
        }),
        duration: formatMissionTime(tel.durationS),
        translunarInjectionDeltaV: formatTranslunarInjectionDv(
          tel.translunarInjectionDeltaV,
        ),
        minMoonAlt: formatMinMoonAlt(tel.minMoonAlt),
        fuelShip: formatFuel(tel.fuelShip, "ship"),
        peakSpeed: formatOptional(tel.peakSpeedKmS, formatSpeed),
        stageT: formatOptional(tel.stageT, formatMissionTime),
        sky: skyTerminal,
      })
    : null;

  const rEarth = R_EARTH + tel.altEarth;
  const rMoon = tel.distMoon;
  const boosterKg = clamp01(tel.fuelBooster) * BOOSTER_PROP_KG;
  const shipKg = clamp01(tel.fuelShip) * SHIP_PROP_KG;
  const wetKg = wetMassFromFuel(
    tel.fuelBooster,
    tel.fuelShip,
    tel.staged,
    BOOSTER_DRY_KG,
    BOOSTER_PROP_KG,
    SHIP_DRY_KG,
    SHIP_PROP_KG,
  );
  const accelG = thrustAccelG(tel.thrustN, wetKg);
  const forceLine = tel.forceCompareLine?.trim() ?? "";

  const metrics: MetricsLabels = Object.freeze({
    phase: tel.phase,
    time: formatMissionTimeDetailed(tel.t),
    date: tel.dateUtc,
    sky: skyLive,
    progress: formatProgressRemainingLine(tel.t, tel.durationS),
    playback: formatPlaybackLine(tel.playbackSpeed, tel.playing),
    altEarth: formatDistancePrecise(tel.altEarth),
    rEarth: formatDistancePrecise(rEarth),
    altMoon: formatDistancePrecise(tel.altMoon),
    distMoon: formatDistancePrecise(Math.max(0, rMoon - R_MOON)),
    rMoon: formatDistancePrecise(rMoon),
    cam: formatFocusDistance(tel.focusDistance),
    speed: formatSpeedPrecise(tel.speed),
    speedEarth: formatSpeedPrecise(tel.speedEarth),
    speedMoon: formatSpeedPrecise(tel.speedMoon),
    booster: boosterMetricsLabel(tel.staged, tel.fuelBooster, boosterKg),
    ship: formatFuelDetailed(tel.fuelShip, shipKg, SHIP_PROP_KG),
    mass: formatMassKg(wetKg),
    thrust: formatThrustDetailed(tel.thrustN),
    accel: formatAccelG(accelG),
    engines: enginesLabel(tel.burning, tel.thrustN),
    staged: stagedLabel(tel.staged),
    duration: formatMissionTimeDetailed(tel.durationS),
    translunarInjectionDeltaV: formatTranslunarInjectionDvDetailed(
      tel.translunarInjectionDeltaV,
    ),
    minalt: Number.isFinite(tel.minMoonAlt)
      ? formatDistancePrecise(Math.max(0, tel.minMoonAlt))
      : "—",
    peakSpeed: formatOptional(tel.peakSpeedKmS, formatSpeedPrecise),
    stageT: formatOptional(tel.stageT, formatMissionTimeDetailed),
    keplerDev: keplerDevLabel(tel.keplerRefMaxDevKm),
    forceCheck: forceLine || "—",
    forceCheckVisible: forceLine.length > 0,
  });

  return Object.freeze({ main, complete, metrics });
}
