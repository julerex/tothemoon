/**
 * Pure telemetry view model: {@link Telemetry} → display labels.
 *
 * No DOM. {@link bindHud} applies the result each frame. Sky lines accept an
 * optional formatter so tests stay free of Horizons / body geometry.
 */

import type { CameraMode } from "../camera/modes";
import {
  landingBeatCompleteSubtitle,
  type LandingBeatKind,
} from "../mission/landingBeat";
import { phaseContextAt, type PhaseSegment } from "../mission/timeline";
import type { PhaseId } from "../physics/missionTypes";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { formatSkyPhaseLine } from "../physics/skyPhase";
import { CAMERA_LABELS } from "./hudCameraLabels";
import {
  cameraReadoutLabels,
  type CameraPoseVec,
} from "./hudCameraPose";
import {
  formatCompactDuration,
  formatDistance,
  formatFocusDistance,
  formatFuel,
  formatMinMoonAlt,
  formatMissionTime,
  formatOptional,
  formatProgressPercent,
  formatSpeed,
  formatSpeedKmh,
  formatThrust,
  formatTranslunarInjectionDv,
  formatWebcastMissionTime,
  fuelBarWidthPercent,
} from "./hudFormat";
import { buildMetricsLabels } from "./telemetryMetricsView";

export {
  boosterMetricsLabel,
  enginesLabel,
  keplerDevLabel,
  stagedLabel,
} from "./telemetryMetricsView";

/** Live HUD inputs from the theater (one frame). */
export type Telemetry = {
  phase: string;
  phaseId: PhaseId;
  t: number;
  durationS: number;
  distanceToMoon: number;
  altitude: number;
  speed: number;
  /** Main-strip speed as km/h (Flight 13 webcast HUD). Default km/s. */
  speedKmh?: boolean;
  /** Booster propellant remaining 0–1 */
  fuelBooster: number;
  /** Ship propellant remaining 0–1 */
  fuelShip: number;
  /** Thrust force (N) */
  thrustN: number;
  playing: boolean;
  dateUtc: string;
  /** Texas civil time (America/Chicago), shown above UTC. */
  dateTexas: string;
  /** Western Australia civil time (Australia/Perth), third date row. */
  dateAustralia: string;
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
  /** Active CameraDirector focus (HUD Cam row) */
  cameraMode: CameraMode;
  /** OrbitControls look-at point (scene km). */
  cameraTarget?: CameraPoseVec | null;
  /** Camera eye (scene km). */
  cameraPosition?: CameraPoseVec | null;
  /** Unit look from eye toward target. */
  cameraLook?: CameraPoseVec | null;
  /** WGS84 height (km); null when farther from Earth than GEO. */
  cameraAltEarth?: number | null;
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
  nextPhase: string;
  phaseLeft: string;
  cameraMode: string;
  cameraDetail: string;
  missionClock: string;
  dateUtc: string;
  dateTexas: string;
  dateAustralia: string;
  distance: string;
  progress: string;
  altitude: string;
  focusDistance: string;
  cameraTarget: string;
  cameraAltitude: string;
  cameraAltitudeVisible: boolean;
  cameraPosition: string;
  cameraDirection: string;
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
  dateTexas: string;
  dateAustralia: string;
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
  /** Timeline segments for next-phase / time-left on the left rail. */
  segments?: readonly PhaseSegment[];
};

function safeSkyLine(
  missionT: number,
  opts?: TelemetryViewOptions,
): string {
  try {
    if (opts?.skyLine) return opts.skyLine(missionT);
    return formatSkyPhaseLine(missionT, opts?.epoch ?? DEFAULT_EPHEMERIS);
  } catch {
    return "—";
  }
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
  const skyLive = safeSkyLine(Math.max(0, tel.t), opts);
  const skyTerminal = safeSkyLine(terminalSkyT(tel), opts);
  return Object.freeze({
    main: buildMainLabels(tel, skyLive, opts?.segments),
    complete: buildCompleteLabels(tel, skyTerminal),
    metrics: buildMetricsLabels(tel, skyLive),
  });
}

function terminalSkyT(tel: Telemetry): number {
  return Math.max(0, tel.durationS > 0 ? tel.durationS : tel.t);
}

function progressUOf(tel: Telemetry): number {
  return tel.durationS > 0
    ? Math.min(1, Math.max(0, tel.t / tel.durationS))
    : 0;
}

function buildMainLabels(
  tel: Telemetry,
  skyLive: string,
  segments?: readonly PhaseSegment[],
): MainTelemetryLabels {
  return Object.freeze({
    ...mainClockFields(tel, segments),
    ...mainRangeFields(tel),
    ...mainPropFields(tel, skyLive),
    ...mainControlFields(tel),
  });
}

function mainClockFields(tel: Telemetry, segments?: readonly PhaseSegment[]) {
  const phase = phaseContextAt(segments ?? [], tel.t);
  const cam = CAMERA_LABELS[tel.cameraMode];
  return {
    phase: tel.phase,
    nextPhase: phase.nextLabel ?? "—",
    phaseLeft: phaseLeftLabel(phase.remainingS, phase.nextLabel),
    cameraMode: cam.title,
    cameraDetail: cam.detail,
    missionClock: formatWebcastMissionTime(tel.t),
    dateUtc: tel.dateUtc,
    dateTexas: tel.dateTexas,
    dateAustralia: tel.dateAustralia,
    distance: formatDistance(tel.distanceToMoon),
    progress: formatProgressPercent(tel.t, tel.durationS),
  };
}

function phaseLeftLabel(remainingS: number, nextLabel: string | null): string {
  if (nextLabel == null && remainingS <= 0) return "—";
  return `${formatCompactDuration(remainingS)} left`;
}

function mainRangeFields(tel: Telemetry) {
  return {
    altitude: formatDistance(Math.max(0, tel.altitude)),
    focusDistance: formatFocusDistance(tel.focusDistance),
    ...cameraReadoutLabels(tel),
    speed: tel.speedKmh ? formatSpeedKmh(tel.speed) : formatSpeed(tel.speed),
  };
}

function mainPropFields(tel: Telemetry, skyLive: string) {
  return {
    fuelBooster: formatFuel(tel.fuelBooster, "booster"),
    fuelShip: formatFuel(tel.fuelShip, "ship"),
    thrust: formatThrust(tel.thrustN),
    sky: skyLive,
    fuelBoosterBar: fuelBarWidthPercent(tel.fuelBooster),
    fuelShipBar: fuelBarWidthPercent(tel.fuelShip),
  };
}

function mainControlFields(tel: Telemetry) {
  return {
    playLabel: tel.playing ? "Pause" : "Play",
    playPressed: tel.playing,
    scrubValue: scrubRangeValue(tel.t, tel.durationS),
    progressU: progressUOf(tel),
    playbackSpeed: tel.playbackSpeed,
    phaseId: tel.phaseId,
    missionComplete: tel.missionComplete,
  };
}

function buildCompleteLabels(
  tel: Telemetry,
  skyTerminal: string,
): CompleteCardLabels | null {
  if (!tel.missionComplete) return null;
  return Object.freeze({
    ...completePrimaryFields(tel),
    ...completeMetaFields(tel, skyTerminal),
  });
}

function completePrimaryFields(tel: Telemetry) {
  return {
    subtitle: completeSubtitle(tel),
    duration: formatMissionTime(tel.durationS),
    translunarInjectionDeltaV: formatTranslunarInjectionDv(
      tel.translunarInjectionDeltaV,
    ),
    minMoonAlt: formatMinMoonAlt(tel.minMoonAlt),
  };
}

function completeSubtitle(tel: Telemetry): string {
  return landingBeatCompleteSubtitle(tel.completeKind, {
    splashdown: tel.phaseId === "splashdown",
  });
}

function completeMetaFields(tel: Telemetry, skyTerminal: string) {
  return {
    fuelShip: formatFuel(tel.fuelShip, "ship"),
    peakSpeed: formatOptional(tel.peakSpeedKmS, formatSpeed),
    stageT: formatOptional(tel.stageT, formatMissionTime),
    sky: skyTerminal,
  };
}
