/**
 * Ascent memo keyed by the ephemeris fields the baked ascent depends on.
 *
 * The memo is a value the caller owns rather than module state: `runMission`
 * and the transfer search thread one explicitly, so a scoring pass cannot leak
 * a stale ascent into a later run and tests need no reset hook. Discard the
 * cache (create a new one) to force a fresh ascent.
 */

import { flyAscent, type AscentResult } from "./ascent";
import type { EphemerisEpoch } from "./ephemerisEpoch";

/**
 * Epoch fields the ascent depends on. `horizonsLandingT` / sun / horizons flag
 * are part of the key because craft absolute positions sit on a moving Earth.
 */
type AscentKey = Readonly<{
  moonPhase0: number;
  horizonsLandingT: number;
  useHorizons: boolean;
  sunPhase0: number;
  clockUtcMsAtT0: number | null;
}>;

/** Memoized Starbase → low Earth orbit ascent under a fixed ephemeris epoch. */
export type AscentCache = Readonly<{
  /** Ascent for `epoch`, reusing the memo when the epoch key is unchanged. */
  ensure: (epoch: EphemerisEpoch) => AscentResult;
}>;

function ascentKey(epoch: EphemerisEpoch): AscentKey {
  return {
    moonPhase0: epoch.moonPhase0,
    horizonsLandingT: epoch.horizonsLandingT,
    useHorizons: epoch.useHorizons,
    sunPhase0: epoch.sunPhase0,
    clockUtcMsAtT0: epoch.clockUtcMsAtT0,
  };
}

function sameAscentKey(a: AscentKey, b: AscentKey): boolean {
  return (
    a.moonPhase0 === b.moonPhase0 &&
    a.horizonsLandingT === b.horizonsLandingT &&
    a.useHorizons === b.useHorizons &&
    a.sunPhase0 === b.sunPhase0 &&
    a.clockUtcMsAtT0 === b.clockUtcMsAtT0
  );
}

function logAscent(a: AscentResult): void {
  console.info(
    `[tothemoon] Ascent ${a.ok ? "OK" : "FAIL"}: ${a.message} · ` +
      `t=${(a.state.t / 60).toFixed(1)} min · alt=${a.insertionAlt.toFixed(1)} km · ` +
      `v=${a.insertionSpeed.toFixed(3)} km/s · samples=${a.samples.length}`,
  );
}

/** Fresh ascent memo; the first `ensure` always flies. */
export function createAscentCache(): AscentCache {
  let entry: { key: AscentKey; ascent: AscentResult } | null = null;
  return Object.freeze({
    ensure(epoch: EphemerisEpoch): AscentResult {
      const key = ascentKey(epoch);
      if (entry && sameAscentKey(entry.key, key)) return entry.ascent;
      const ascent = flyAscent(epoch);
      logAscent(ascent);
      entry = { key, ascent };
      return ascent;
    },
  });
}
