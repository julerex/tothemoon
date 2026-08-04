import { flyAscent, type AscentResult } from "./ascent";
import { getMissionLandingT } from "./horizonsEpoch";

/** Cached Starbase → low Earth orbit under the current Moon/Sun/Horizons epoch. */
let _ascentCache: AscentResult | null = null;
let _ascentPhaseKey = NaN;
/** Horizons map t_land used when the cache was baked (absolute Earth motion). */
let _ascentLandTKey = NaN;

export function getAscent(): AscentResult {
  if (!_ascentCache) {
    _ascentCache = flyAscent();
    _ascentLandTKey = getMissionLandingT();
    console.info(
      `[tothemoon] Ascent ${_ascentCache.ok ? "OK" : "FAIL"}: ${_ascentCache.message} · ` +
        `t=${(_ascentCache.state.t / 60).toFixed(1)} min · alt=${_ascentCache.insertionAlt.toFixed(1)} km · ` +
        `v=${_ascentCache.insertionSpeed.toFixed(3)} km/s · samples=${_ascentCache.samples.length}`,
    );
  }
  return _ascentCache;
}

/** Force a fresh ascent under the currently set moon/sun phases / epoch. */
export function resetAscentCache(): void {
  _ascentCache = null;
  _ascentPhaseKey = NaN;
  _ascentLandTKey = NaN;
}

/**
 * Ensure ascent matches `moonPhase0` and the current Horizons landing map.
 * landT is part of the key: craft absolute positions sit on moving Earth.
 */
export function ensureAscent(moonPhase0: number): AscentResult {
  const landT = getMissionLandingT();
  if (
    _ascentCache &&
    _ascentPhaseKey === moonPhase0 &&
    _ascentLandTKey === landT
  ) {
    return _ascentCache;
  }
  _ascentCache = null;
  _ascentPhaseKey = moonPhase0;
  _ascentLandTKey = landT;
  return getAscent();
}
