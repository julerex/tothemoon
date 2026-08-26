/**
 * Starbase launch-site plan in pad-local km.
 *
 * +X west (inland / tank farm), −X gulf / OLP-1, +Z north (SH 4), +Y up.
 * Live OLP-2 OLM is the origin; Mechazilla stays at +X so trench / webcast
 * cameras keep their pad-local mounts. Tank rows run east–west, parallel to
 * Boca Chica Blvd, matching NAIP / T−5 aerials. Cryo outer shells are 12 m
 * (NSF 2021 orbital farm) — as wide as the 12 m tower face, not 7.6 m kegs.
 */

/** NSF 2021 orbital-farm outer shell diameter (km). */
export const CRYO_SHELL_D_KM = 0.012;
/** Vertical cryo bank height (km) — ring-stack, much shorter than the 146 m OLT. */
export const CRYO_VERTICAL_H_KM = 0.018;
/** North row is closer to SH 4. */
export const CRYO_ROW_Z_KM = [0.036, 0.014] as const;
/** West of Mechazilla (`TOWER_OX` = 0.020). 24 m column spacing. */
export const CRYO_COL_X_KM = [0.082, 0.106, 0.130, 0.154] as const;

/** Pad-local [x west, z north] centers of the 2×4 vertical cryo bank. */
export function cryoVerticalCenters(): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const z of CRYO_ROW_Z_KM) {
    for (const x of CRYO_COL_X_KM) out.push([x, z]);
  }
  return out;
}

/** Large N–S horizontals (Pad 2 water / commodity) west of the verticals. */
export const HORIZ_LARGE_R_KM = 0.005;
export const HORIZ_LARGE_LEN_KM = 0.036;
export const HORIZ_LARGE_X_KM = 0.188;
export const HORIZ_LARGE_Z_KM = [-0.008, 0.014, 0.036, 0.058] as const;

/** Smaller N–S horizontals further west. */
export const HORIZ_SMALL_R_KM = 0.0028;
export const HORIZ_SMALL_LEN_KM = 0.020;
export const HORIZ_SMALL_X_KM = 0.216;
export const HORIZ_SMALL_Z_KM = [-0.012, 0.006, 0.024, 0.042, 0.060] as const;

/** Compact LN2 verticals at the north-west corner of the farm. */
export const LN2_R_KM = 0.003;
export const LN2_H_KM = 0.011;
export const LN2_XZ_KM: readonly (readonly [number, number])[] = [
  [0.168, 0.058], [0.178, 0.058], [0.168, 0.069], [0.178, 0.069],
];

/** Boca Chica Blvd / SH 4 northing (km). Pads sit south of the highway. */
export const SH4_Z_KM = 0.148;
/** N–S blast wall between the live tower and the first cryo row. */
export const BLAST_WALL_X_KM = 0.058;

/**
 * Cryo-vent sprite anchors (pad-local km) over the vertical bank + two large
 * horizontals. Y is just above the tank roof.
 */
export function tankFarmVentAnchors(): Array<readonly [number, number, number]> {
  const vertY = CRYO_VERTICAL_H_KM * 0.92;
  const verts = cryoVerticalCenters().map(
    ([x, z]) => [x, vertY, z] as const,
  );
  const horiz = HORIZ_LARGE_Z_KM.slice(0, 2).map(
    (z) => [HORIZ_LARGE_X_KM, HORIZ_LARGE_R_KM * 2.1, z] as const,
  );
  return [...verts, ...horiz];
}
