/**
 * Metrics overlay label builders.
 */
import {
  BOOSTER_DRY_KG, BOOSTER_PROP_KG, R_EARTH, R_MOON, SHIP_DRY_KG, SHIP_PROP_KG,
} from "../physics/constants";
import {
  clamp01, formatAccelG, formatDistancePrecise, formatFocusDistance, formatFuelDetailed, formatMassKg,
  formatMissionTimeDetailed, formatOptional, formatPlaybackLine, formatProgressRemainingLine,
  formatSpeedPrecise, formatThrustDetailed, formatTranslunarInjectionDvDetailed,
  thrustAccelG, wetMassFromFuel,
} from "./hudFormat";
import type { MetricsLabels, Telemetry } from "./telemetryView";

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
export function wetMassKg(tel: Telemetry): number {
  return wetMassFromFuel(
    tel.fuelBooster,
    tel.fuelShip,
    tel.staged,
    BOOSTER_DRY_KG,
    BOOSTER_PROP_KG,
    SHIP_DRY_KG,
    SHIP_PROP_KG,
  );
}

export function minAltLabel(tel: Telemetry): string {
  if (!Number.isFinite(tel.minMoonAlt)) return "—";
  return formatDistancePrecise(Math.max(0, tel.minMoonAlt));
}

export function buildMetricsLabels(
  tel: Telemetry,
  skyLive: string,
): MetricsLabels {
  return Object.freeze({
    ...metricsClockFields(tel, skyLive),
    ...metricsGeoFields(tel),
    ...metricsDynFields(tel),
    ...metricsPropFields(tel),
    ...metricsPackFields(tel),
  });
}

export function metricsClockFields(tel: Telemetry, skyLive: string) {
  return {
    phase: tel.phase,
    time: formatMissionTimeDetailed(tel.t),
    date: tel.dateUtc,
    dateTexas: tel.dateTexas,
    dateAustralia: tel.dateAustralia,
    sky: skyLive,
    progress: formatProgressRemainingLine(tel.t, tel.durationS),
    playback: formatPlaybackLine(tel.playbackSpeed, tel.playing),
  };
}

export function metricsGeoFields(tel: Telemetry) {
  const rMoon = tel.distMoon;
  return {
    altEarth: formatDistancePrecise(tel.altEarth),
    rEarth: formatDistancePrecise(R_EARTH + tel.altEarth),
    altMoon: formatDistancePrecise(tel.altMoon),
    distMoon: formatDistancePrecise(Math.max(0, rMoon - R_MOON)),
    rMoon: formatDistancePrecise(rMoon),
    cam: formatFocusDistance(tel.focusDistance),
  };
}

export function metricsDynFields(tel: Telemetry) {
  return {
    speed: formatSpeedPrecise(tel.speed),
    speedEarth: formatSpeedPrecise(tel.speedEarth),
    speedMoon: formatSpeedPrecise(tel.speedMoon),
  };
}

export function metricsPropFields(tel: Telemetry) {
  const wetKg = wetMassKg(tel);
  return {
    ...metricsFuelFields(tel),
    mass: formatMassKg(wetKg),
    thrust: formatThrustDetailed(tel.thrustN),
    accel: formatAccelG(thrustAccelG(tel.thrustN, wetKg)),
    engines: enginesLabel(tel.burning, tel.thrustN),
    staged: stagedLabel(tel.staged),
  };
}

export function metricsFuelFields(tel: Telemetry) {
  const boosterKg = clamp01(tel.fuelBooster) * BOOSTER_PROP_KG;
  const shipKg = clamp01(tel.fuelShip) * SHIP_PROP_KG;
  return {
    booster: boosterMetricsLabel(tel.staged, tel.fuelBooster, boosterKg),
    ship: formatFuelDetailed(tel.fuelShip, shipKg, SHIP_PROP_KG),
  };
}

export function metricsPackFields(tel: Telemetry) {
  return {
    ...metricsDurationFields(tel),
    ...metricsForceFields(tel),
  };
}

export function metricsDurationFields(tel: Telemetry) {
  return {
    ...metricsTimePack(tel),
    ...metricsMetaPack(tel),
  };
}

export function metricsTimePack(tel: Telemetry) {
  return {
    duration: formatMissionTimeDetailed(tel.durationS),
    translunarInjectionDeltaV: formatTranslunarInjectionDvDetailed(
      tel.translunarInjectionDeltaV,
    ),
    minalt: minAltLabel(tel),
  };
}

export function metricsMetaPack(tel: Telemetry) {
  return {
    peakSpeed: formatOptional(tel.peakSpeedKmS, formatSpeedPrecise),
    stageT: formatOptional(tel.stageT, formatMissionTimeDetailed),
    keplerDev: keplerDevLabel(tel.keplerRefMaxDevKm),
  };
}

export function metricsForceFields(tel: Telemetry) {
  const forceLine = tel.forceCompareLine?.trim() ?? "";
  return {
    forceCheck: forceLine || "—",
    forceCheckVisible: forceLine.length > 0,
  };
}
