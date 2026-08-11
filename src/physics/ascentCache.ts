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

function ascentCacheHit(epoch: EphemerisEpoch): boolean {
  return !!(
    _ascentCache &&
    _ascentPhaseKey === epoch.moonPhase0 &&
    _ascentLandTKey === epoch.horizonsLandingT &&
    _ascentUseHorizons === epoch.useHorizons &&
    _ascentSunPhase0 === epoch.sunPhase0 &&
    _ascentClockUtc === epoch.clockUtcMsAtT0
  );
}

function storeAscentKeys(epoch: EphemerisEpoch): void {
  _ascentPhaseKey = epoch.moonPhase0;
  _ascentLandTKey = epoch.horizonsLandingT;
  _ascentUseHorizons = epoch.useHorizons;
  _ascentSunPhase0 = epoch.sunPhase0;
  _ascentClockUtc = epoch.clockUtcMsAtT0;
}

function logAscent(a: AscentResult): void {
  console.info(
    `[tothemoon] Ascent ${a.ok ? "OK" : "FAIL"}: ${a.message} · ` +
      `t=${(a.state.t / 60).toFixed(1)} min · alt=${a.insertionAlt.toFixed(1)} km · ` +
      `v=${a.insertionSpeed.toFixed(3)} km/s · samples=${a.samples.length}`,
  );
}

/**
 * Ensure ascent matches the given ephemeris (moon phase + Horizons landing map).
 * landT / sun / horizons flag are part of the key: craft absolute positions sit
 * on moving Earth.
 */
export function ensureAscent(epoch: EphemerisEpoch): AscentResult {
  if (ascentCacheHit(epoch)) return _ascentCache!;
  storeAscentKeys(epoch);
  _ascentCache = flyAscent(epoch);
  logAscent(_ascentCache);
  return _ascentCache;
}
