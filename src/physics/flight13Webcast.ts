/**
 * Flight 13 webcast HUD telemetry — ground-relative speed (km/h) and
 * altitude (km) read from `assets/flight13-webcast/` stills.
 *
 * SpaceX overlay speed is Earth-fixed (pad hold ≈ 0), not ECI |v − v_earth|.
 */

/** One HUD sample from a Flight 13 replay still. */
export type WebcastHudPoint = {
  t: number;
  label: string;
  /** Starship ground-relative speed (km/h) when the overlay showed it. */
  shipKmh?: number;
  /** Starship geodetic altitude (km). */
  shipAltKm?: number;
  /** Super Heavy geodetic altitude (km). */
  boosterAltKm?: number;
  altTolKm: number;
  speedTolKmh: number;
};

/**
 * Captured T+ / speed / altitude from the official Flight 13 webcast HUD.
 * Times are mission seconds (liftoff = 0).
 */
export const FLIGHT13_WEBCAST_HUD: readonly WebcastHudPoint[] = [
  { t: 0, label: "liftoff", shipKmh: 0, shipAltKm: 0.1, altTolKm: 0.12, speedTolKmh: 80 },
  { t: 16, label: "ascent T+0:16", shipKmh: 219, shipAltKm: 0.4, altTolKm: 0.35, speedTolKmh: 120 },
  { t: 56, label: "max-Q", shipKmh: 1275, shipAltKm: 7.3, altTolKm: 2.5, speedTolKmh: 250 },
  { t: 141, label: "hot-stage", shipKmh: 5962, altTolKm: 12, speedTolKmh: 900 },
  { t: 385, label: "SH landing T+6:25", shipKmh: 15132, boosterAltKm: 3.5, altTolKm: 1.8, speedTolKmh: 4000 },
  { t: 400, label: "SH landing T+6:40", shipKmh: 16411, boosterAltKm: 0.1, altTolKm: 0.35, speedTolKmh: 4500 },
  { t: 487, label: "SECO", shipKmh: 26496, shipAltKm: 148, altTolKm: 10, speedTolKmh: 600 },
  { t: 505, label: "coast T+8:25", shipKmh: 26506, shipAltKm: 150, altTolKm: 12, speedTolKmh: 600 },
  { t: 1006, label: "payload deploy", shipKmh: 26334, shipAltKm: 189, altTolKm: 70, speedTolKmh: 1500 },
  { t: 2845, label: "entry", shipKmh: 26775, shipAltKm: 83, altTolKm: 14, speedTolKmh: 1200 },
  { t: 3739, label: "transonic", shipKmh: 2748, shipAltKm: 28.1, altTolKm: 8, speedTolKmh: 800 },
  { t: 3895, label: "landing T+1:04:55", shipKmh: 383, shipAltKm: 1.9, altTolKm: 1.0, speedTolKmh: 150 },
  { t: 3902, label: "landing burn", shipKmh: 368, shipAltKm: 1.2, altTolKm: 0.7, speedTolKmh: 140 },
  { t: 3909, label: "landing T+1:05:09", shipKmh: 283, shipAltKm: 0.5, altTolKm: 0.4, speedTolKmh: 120 },
  { t: 3912, label: "landing plume", shipKmh: 178, shipAltKm: 0.3, altTolKm: 0.3, speedTolKmh: 100 },
];

/** km/s → km/h. */
export function kmSToKmh(kmS: number): number {
  return kmS * 3600;
}

type ShipHudKnot = { t: number; altKm: number; kmh: number };

const SHIP_HUD_KNOTS: readonly ShipHudKnot[] = [
  ...FLIGHT13_WEBCAST_HUD
    .filter((p): p is WebcastHudPoint & { shipAltKm: number; shipKmh: number } =>
      p.shipAltKm != null && p.shipKmh != null)
    .map((p) => ({ t: p.t, altKm: p.shipAltKm, kmh: p.shipKmh })),
  { t: 3921, altKm: 0.04, kmh: 12 },
];

/** Piecewise-linear Starship HUD (alt km, ground-relative km/h) at mission time. */
export function webcastShipHudAt(t: number): ShipHudKnot {
  const knots = SHIP_HUD_KNOTS;
  const first = knots[0]!;
  const last = knots[knots.length - 1]!;
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  for (let i = 1; i < knots.length; i++) {
    const b = knots[i]!;
    const a = knots[i - 1]!;
    if (t > b.t) continue;
    const u = (t - a.t) / (b.t - a.t);
    return {
      t,
      altKm: a.altKm + u * (b.altKm - a.altKm),
      kmh: a.kmh + u * (b.kmh - a.kmh),
    };
  }
  return last;
}
