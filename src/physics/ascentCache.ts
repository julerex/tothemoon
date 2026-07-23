import { flyAscent, type AscentResult } from "./ascent";

/** Cached Starbase → LEO under the current Moon/Sun ephemeris. */
let _ascentCache: AscentResult | null = null;
let _ascentPhaseKey = NaN;

export function getAscent(): AscentResult {
  if (!_ascentCache) {
    _ascentCache = flyAscent();
    console.info(
      `[tothemoon] Ascent ${_ascentCache.ok ? "OK" : "FAIL"}: ${_ascentCache.message} · ` +
        `t=${(_ascentCache.state.t / 60).toFixed(1)} min · alt=${_ascentCache.insertionAlt.toFixed(1)} km · ` +
        `v=${_ascentCache.insertionSpeed.toFixed(3)} km/s · samples=${_ascentCache.samples.length}`,
    );
  }
  return _ascentCache;
}

/** Force a fresh ascent under the currently set moon/sun phases. */
export function resetAscentCache(): void {
  _ascentCache = null;
  _ascentPhaseKey = NaN;
}

export function ensureAscent(moonPhase0: number): AscentResult {
  if (_ascentCache && _ascentPhaseKey === moonPhase0) return _ascentCache;
  _ascentCache = null;
  _ascentPhaseKey = moonPhase0;
  return getAscent();
}
