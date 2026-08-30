/**
 * Surveyed Starbase pad-local geometry (WGS84 → km).
 *
 * Pad-local origin is the OLP-2 OLM: +X west, +Z north, +Y up. Deltas use the
 * WGS84 meridian / prime-vertical radii at OLP-2 so Pad 1 and the Pad 2 apron
 * sit on the same tangent plane as the farm mesh.
 *
 * The Earth-mesh pin (`STARBASE_LAT` / `STARBASE_LON`) stays the rounded site
 * coordinate used by the committed Sentinel/NAIP plates (~209 m east of this origin).
 */
import { WGS84_A, WGS84_E2, primeVerticalRadius } from "../../physics/wgs84";

/** OLP-2 / Pad 2 OLM (Flight 13 live pad). */
export const OLP2_LAT_DEG = 25.99677211965216;
export const OLP2_LON_DEG = -97.15807620321927;

/** OLP-1 / Pad A (tower standing, mount pulled at Flight 13). */
export const OLP1_LAT_DEG = 25.99610843707591;
export const OLP1_LON_DEG = -97.15477680548673;

/**
 * Pad 2 concrete apron corners, north-up aerial (NW, SW, east vertex).
 * The three points bound the polygonal hardstand west of the tank farm.
 */
export const PAD2_APRON_CORNERS_DEG: ReadonlyArray<readonly [number, number]> = [
  [25.998070202727856, -97.15890144142246],
  [25.99612479210832, -97.15837042097712],
  [25.99697980239395, -97.15655005546843],
];

/**
 * Tangent-plane pad-local km from a geodetic point relative to an origin.
 *
 * @returns `{ x, z }` with +x west and +z north (km)
 */
export function geodeticDeltaToPadLocal(
  latDeg: number,
  lonDeg: number,
  originLatDeg = OLP2_LAT_DEG,
  originLonDeg = OLP2_LON_DEG,
): { x: number; z: number } {
  const lat0 = (originLatDeg * Math.PI) / 180;
  const dlat = ((latDeg - originLatDeg) * Math.PI) / 180;
  const dlon = ((lonDeg - originLonDeg) * Math.PI) / 180;
  const sin = Math.sin(lat0);
  const denom = 1 - WGS84_E2 * sin * sin;
  const rm = (WGS84_A * (1 - WGS84_E2)) / denom ** 1.5;
  const east = dlon * primeVerticalRadius(lat0) * Math.cos(lat0);
  const north = dlat * rm;
  return { x: -east, z: north };
}

/** OLP-1 centre in pad-local km from the OLP-2 origin. */
export const olp1FromOlp2 = geodeticDeltaToPadLocal(OLP1_LAT_DEG, OLP1_LON_DEG);

/** Pad 2 apron vertices `[x west, z north]` (km), same order as the survey. */
export function pad2ApronXz(): Array<readonly [number, number]> {
  return PAD2_APRON_CORNERS_DEG.map(([lat, lon]) => {
    const p = geodeticDeltaToPadLocal(lat, lon);
    return [p.x, p.z] as const;
  });
}
