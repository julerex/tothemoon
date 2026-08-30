/**
 * Surveyed Starbase pad-local geometry (WGS84 → km).
 *
 * Pad-local origin is the OLP-2 OLM: +X west, +Z north, +Y up. Deltas use the
 * WGS84 meridian / prime-vertical radii at OLP-2 so Pad 1 and the site apron
 * sit on the same tangent plane as the farm mesh.
 *
 * The Earth-mesh pin (`STARBASE_LAT` / `STARBASE_LON`) stays the rounded site
 * coordinate used by the committed Sentinel/NAIP plates (~209 m east of this origin).
 */
import { WGS84_A, WGS84_E2, primeVerticalRadius } from "../../physics/wgs84";

/** OLP-2 / Pad 2 OLM (Flight 13 live pad). */
export const OLP2_LAT_DEG = 25.99677211965216;
export const OLP2_LON_DEG = -97.15807620321927;

/** OLP-1 / Pad A empty-mount centre (OLM pulled at Flight 13). */
export const OLP1_LAT_DEG = 25.996153431591285;
export const OLP1_LON_DEG = -97.15445483846192;

/** OLP-1 Mechazilla base — previously mistaken for the pad centre. */
export const OLP1_TOWER_LAT_DEG = 25.99610843707591;
export const OLP1_TOWER_LON_DEG = -97.15477680548673;

/**
 * Site concrete apron, north-up aerial, vertices in trace order (Pad 2 NW,
 * south along the west edge, then east around OLP-1, then back along SH 4).
 * Covers OLP-2, the tank farm, and OLP-1 — not a Pad-2-only triangle.
 */
export const PAD2_APRON_CORNERS_DEG: ReadonlyArray<readonly [number, number]> = [
  [25.99808447639599, -97.15891689066093],
  [25.996134391339766, -97.15837928694013],
  [25.996992950474393, -97.15657927448207],
  [25.99666505928407, -97.15561446780454],
  [25.996600343809416, -97.15560966777133],
  [25.996548571404052, -97.15620007185757],
  [25.99640188279825, -97.15622407202368],
  [25.996151648871585, -97.15593126999715],
  [25.99576335379233, -97.15505286391765],
  [25.995159336674003, -97.15482726235622],
  [25.995284454760636, -97.1536176539844],
  [25.996151648871585, -97.15326725155923],
  [25.997264754320074, -97.15294564933339],
  [25.99800250444577, -97.1566944752794],
  [25.998226848594626, -97.15797128411631],
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

/** OLP-1 empty-mount centre in pad-local km from the OLP-2 origin. */
export const olp1FromOlp2 = geodeticDeltaToPadLocal(OLP1_LAT_DEG, OLP1_LON_DEG);

/** OLP-1 tower base in pad-local km from the OLP-2 origin. */
export const olp1TowerFromOlp2 = geodeticDeltaToPadLocal(
  OLP1_TOWER_LAT_DEG,
  OLP1_TOWER_LON_DEG,
);

/** Pad 2 apron vertices `[x west, z north]` (km), same order as the survey. */
export function pad2ApronXz(): Array<readonly [number, number]> {
  return PAD2_APRON_CORNERS_DEG.map(([lat, lon]) => {
    const p = geodeticDeltaToPadLocal(lat, lon);
    return [p.x, p.z] as const;
  });
}

/**
 * Even-odd inclusion in the surveyed site apron (pad-local km).
 */
export function pad2ApronContains(x: number, z: number): boolean {
  const v = pad2ApronXz();
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [xi, zi] = v[i]!;
    const [xj, zj] = v[j]!;
    const hit = (zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
