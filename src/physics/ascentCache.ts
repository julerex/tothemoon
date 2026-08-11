import { flyAscent, type AscentResult } from "./ascent";
import type { EphemerisEpoch } from "./ephemerisEpoch";

/** Cached Starbase → low Earth orbit under a fixed ephemeris epoch. */
let _ascentCache: AscentResult | null = null;
let _ascentPhaseKey = NaN;
/** Horizons map t_land used when the cache was baked (absolute Earth motion). */
let _ascentLandTKey = NaN;
let _ascentUseHorizons: boolean | null = null;
let _ascentSunPhase0 = NaN;
let _ascentClockUtc: number | null | undefined = undefined;

export function getAscent(): AscentResult {
  if (!_ascentCache) {
    throw new Error(
      "getAscent: cache empty — call ensureAscent(epoch) first",
    );
  }
  return _ascentCache;
}

/** Force a fresh ascent on the next ensureAscent. */
export function resetAscentCache(): void {
  _ascentCache = null;
  _ascentPhaseKey = NaN;
  _ascentLandTKey = NaN;
  _ascentUseHorizons = null;
  _ascentSunPhase0 = NaN;
  _ascentClockUtc = undefined;
}

/**
 * Ensure ascent matches the given ephemeris (moon phase + Horizons landing map).
 * landT / sun / horizons flag are part of the key: craft absolute positions sit
 * on moving Earth.
 */
export function ensureAscent(epoch: EphemerisEpoch): AscentResult {
  const landT = epoch.horizonsLandingT;
  if (
    _ascentCache &&
    _ascentPhaseKey === epoch.moonPhase0 &&
    _ascentLandTKey === landT &&
    _ascentUseHorizons === epoch.useHorizons &&
    _ascentSunPhase0 === epoch.sunPhase0 &&
    _ascentClockUtc === epoch.clockUtcMsAtT0
  ) {
    return _ascentCache;
  }
  _ascentPhaseKey = epoch.moonPhase0;
  _ascentLandTKey = landT;
  _ascentUseHorizons = epoch.useHorizons;
  _ascentSunPhase0 = epoch.sunPhase0;
  _ascentClockUtc = epoch.clockUtcMsAtT0;
  _ascentCache = flyAscent(epoch);
  console.info(
    `[tothemoon] Ascent ${_ascentCache.ok ? "OK" : "FAIL"}: ${_ascentCache.message} · ` +
      `t=${(_ascentCache.state.t / 60).toFixed(1)} min · alt=${_ascentCache.insertionAlt.toFixed(1)} km · ` +
      `v=${_ascentCache.insertionSpeed.toFixed(3)} km/s · samples=${_ascentCache.samples.length}`,
  );
  return _ascentCache;
}
