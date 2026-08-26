/**
 * Shared orbital tank farm — between OLP-2 and OLP-1, north of the pads.
 *
 * Pad-local km: +X west (inland), −X gulf/east, +Z north (SH 4), +Y up.
 * Live origin is the OLP-2 OLM. The farm sits east of Pad 2 (`x < 0`) and
 * west of Pad 1 (`PAD1_X_KM`), south of SH 4 — matching the Google Maps
 * orbital-tank-farm pin (rows of white horizontal cylinders between the pads).
 *
 * The live Mechazilla stays west of the OLM (`TOWER_OX` > 0) so trench /
 * webcast cameras keep their mounts. NSF Pad 2 faces south; that yaw is
 * not applied here.
 */
import { PAD1_X_KM } from "./mechazillaDims";

/** 10 m shells — the white rows between the pads. */
export const CRYO_TANK_D_KM = 0.01;
/** ~36 m E–W cylinders (the long white rows in the aerial). */
export const CRYO_TANK_LEN_KM = 0.036;

/**
 * Six E–W columns spanning Pad 2 → Pad 1.
 * West bank (~70 m east of the OLP-2 OLM), main bank, east bank (~30 m
 * west of OLP-1). 42 m column spacing.
 */
export const CRYO_COL_X_KM = [-0.07, -0.112, -0.154, -0.196, -0.238, -0.28] as const;
/** Two E–W rows, north of the OLM line and south of SH 4. */
export const CRYO_ROW_Z_KM = [0.08, 0.11] as const;

/** Boca Chica Blvd / SH 4 northing (km). Pads sit south of the highway. */
export const SH4_Z_KM = 0.148;

/** Blast wall south of the farm, between the tanks and the pad line. */
export const BLAST_WALL_Z_KM = 0.062;
/** Wall center in X — mid-span of the E–W bank. */
export const BLAST_WALL_X_KM =
  (CRYO_COL_X_KM[0] + CRYO_COL_X_KM[CRYO_COL_X_KM.length - 1]!) * 0.5;

export { PAD1_X_KM };

/** Count of E–W cryo tanks (columns × rows). */
export const CRYO_TANK_COUNT = CRYO_COL_X_KM.length * CRYO_ROW_Z_KM.length;

/** Pad-local [x west, z north] centers of the E–W cryo bank. */
export function cryoEwCenters(): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  for (const z of CRYO_ROW_Z_KM) {
    for (const x of CRYO_COL_X_KM) out.push([x, z]);
  }
  return out;
}

/** Berm / slab envelope around the E–W bank (pad-local km). */
export function farmPlanBounds(): {
  xWest: number;
  xEast: number;
  zSouth: number;
  zNorth: number;
} {
  const halfLen = CRYO_TANK_LEN_KM * 0.5;
  const halfD = CRYO_TANK_D_KM * 0.5;
  const pad = 0.012;
  return {
    xWest: Math.max(...CRYO_COL_X_KM) + halfLen + pad,
    xEast: Math.min(...CRYO_COL_X_KM) - halfLen - pad,
    zSouth: Math.min(...CRYO_ROW_Z_KM) - halfD - pad,
    zNorth: Math.max(...CRYO_ROW_Z_KM) + halfD + pad,
  };
}

/**
 * Four vent stacks: SW / SE / NW / NE corners of the E–W bank.
 * World Y is the tank diameter (horizontal shells sit on the pad).
 */
export function tankFarmVentAnchors(): Array<readonly [number, number, number]> {
  const y = CRYO_TANK_D_KM;
  const west = CRYO_COL_X_KM[0]!;
  const east = CRYO_COL_X_KM[CRYO_COL_X_KM.length - 1]!;
  const south = CRYO_ROW_Z_KM[0]!;
  const north = CRYO_ROW_Z_KM[CRYO_ROW_Z_KM.length - 1]!;
  return [
    [west, y, south],
    [east, y, south],
    [west, y, north],
    [east, y, north],
  ];
}
