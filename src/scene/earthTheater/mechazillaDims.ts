/**
 * Mechazilla / OLT published dimensions (meters) and pad-km scales.
 * Scene unit = 1 km. Shared by the tower truss and chopsticks builders.
 */
import { olp1FromOlp2, olp1TowerFromOlp2 } from "./starbaseSurvey";

/** Official OLT height (m), ground to lightning rod (FAA / Guinness). */
export const OLT_HEIGHT_M = 146;
/** Main truss / rail height (m) — just above the stacked vehicle. */
export const OLT_TRUSS_M = 132;
/** Chopstick beam length, tower face to tip (m). */
export const CHOPSTICK_LEN_M = 36;
/** Square truss face (m). */
export const TOWER_FACE_M = 12;
/** Pad-origin to tower center (m); +X is toward the tower. */
export const TOWER_OX_M = 20;
/**
 * Launch-park chopsticks carriage height (m).
 * Webcast T−2 stills park the arms at the ship nose / rail top, not the
 * Super Heavy grid-fin band. Catch drops them via {@link CHOPSTICK_CATCH_M}.
 */
export const CHOPSTICK_REST_M = 122;
/** Super Heavy catch height (m) — grid-fin / interstage band. */
export const CHOPSTICK_CATCH_M = 72;
/** Half-span of the open chopsticks from pad center (m). */
export const CHOPSTICK_HALF_SPAN_M = 12;
/** Open-park yaw of each arm away from the vehicle (rad). */
export const CHOPSTICK_OPEN_YAW_RAD = 0.55;
/** Ship QD arm height (m) — mid Starship after the 71 m booster. */
export const SHIP_QD_M = 98;
/** Booster QD arm height (m) — mid Super Heavy. */
export const BOOST_QD_M = 42;

const M = 0.001;
export const TOWER_H = OLT_TRUSS_M * M;
export const TOWER_FACE = TOWER_FACE_M * M;
export const TOWER_COL = 0.002;
export const TOWER_OX = TOWER_OX_M * M;
export const TOWER_OY0 = 0.0;
export const TOWER_BEACON_Y = OLT_HEIGHT_M * M;
export const CHOPSTICK_LEN = CHOPSTICK_LEN_M * M;
export const CHOPSTICK_REST_Y = CHOPSTICK_REST_M * M;
export const CHOPSTICK_HALF_SPAN = CHOPSTICK_HALF_SPAN_M * M;
export const SHIP_QD_Y = SHIP_QD_M * M;
export const BOOST_QD_Y = BOOST_QD_M * M;
/** Carriage drop (km) from launch-park to catch — negative = down. */
export const CHOPSTICK_CATCH_DROP_KM = (CHOPSTICK_CATCH_M - CHOPSTICK_REST_M) * M;

/**
 * OLP-1 (Pad A) empty-mount centre, pad-local km from the Flight 13 OLP-2 origin.
 *
 * Wikipedia: Flight 13 (2026-07-24) is the first OLP-2 launch; OLP-1 was
 * decommissioned 2025-10-14 for a V3 rebuild (new OLM staged at Sanchez).
 * Pad-local +X is west, −X is gulf/east. Surveyed ~363 m east and ~69 m south
 * of the OLP-2 OLM (OLP-1 nearer the beach / slightly gulf-south). The tower
 * base is a separate pin ~32 m west of this mount.
 */
export const PAD1_X_KM = olp1FromOlp2.x;
export const PAD1_Z_KM = olp1FromOlp2.z;
/**
 * Pad-1-local shift so the shared tower builder (meshes at {@link TOWER_OX})
 * lands on the surveyed OLP-1 tower base instead of Pad 2’s 20 m gap.
 */
export const PAD1_TOWER_DX_KM = olp1TowerFromOlp2.x - olp1FromOlp2.x - TOWER_OX;
export const PAD1_TOWER_DZ_KM = olp1TowerFromOlp2.z - olp1FromOlp2.z;
