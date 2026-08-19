/** Scale constants, ogive math, fin-cam poses, locator sizing. Scene unit = 1 km. */
/** World km = mesh units × this. 1 mesh unit ≈ 40 m. */
export const CRAFT_MESH_SCALE = 0.04;

/**
 * Ship barrel weld-band fractions of ship height (cylinder only, nose → aft).
 * Kept off the ogive so they do not hover around the taper.
 */
export const SHIP_WELD_RING_FRACTIONS = [
  0.62, 0.54, 0.46, 0.38, 0.3, 0.22, 0.14,
] as const;

/** Booster barrel weld ring count (V4). */
export const BOOSTER_WELD_RING_COUNT = 9;

/** Grid-fin lattice lines per axis (V4 denser sky silhouette; V22 denser still). */
export const GRID_FIN_LATTICE_N = 8;

/**
 * Super Heavy V3 grid-fin azimuths (90° / 90° / 180°), not equal 120° thirds.
 * First fin stays at +Y so the existing gridfin-cam mount does not jump.
 */
export const GRID_FIN_AZIMUTHS = [
  Math.PI / 2,
  Math.PI,
  (3 * Math.PI) / 2,
] as const;

/** Mesh units per real meter (before CRAFT_MESH_SCALE). */
export const U = 1 / 40;

/** Super Heavy Raptor ring radii in mesh units (3 inner / 10 mid / 20 outer). */
export const BOOST_RING_INNER = 0.95 * U;
export const BOOST_RING_MID = 2.25 * U;
export const BOOST_RING_OUTER = 3.55 * U;

/** Vehicle diameter (m) → radius in mesh units. */
const DIA_M = 9;
export const R = (DIA_M / 2) * U; // 0.1125

const SHIP_H_M = 52;
const BOOST_H_M = 71;
export const SHIP_H = SHIP_H_M * U; // 1.3
export const BOOST_H = BOOST_H_M * U; // 1.775

/** Tangent-ogive length (m) from tip to the 9 m barrel. */
export const SHIP_OGIVE_H_M = 17;
/** Fraction of ship height at the ogive/barrel join (engines = 0, tip = 1). */
export const SHIP_OGIVE_BASE_FRAC = (SHIP_H_M - SHIP_OGIVE_H_M) / SHIP_H_M;

export const SHIP_OGIVE_H = SHIP_OGIVE_H_M * U;
export const SHIP_OGIVE_BASE_Z = SHIP_H - SHIP_OGIVE_H;

/** Forward flap chord / span (m) — Block 2 class, ~18 m². */
export const FWD_FLAP_CHORD_M = 6.5;
export const FWD_FLAP_SPAN_M = 3.5;
/** Aft flap chord / span (m) — ~40 m² class; 9 + 2×4 = 17 m wingspan. */
export const AFT_FLAP_CHORD_M = 11;
export const AFT_FLAP_SPAN_M = 4;
/** Flap thickness (m) — Block 2 “thinner” forward flaps. */
export const FLAP_THICKNESS_M = 0.25;
/** Block 2 forward flaps: included angle about the leeward (−Y) axis. */
export const FWD_FLAP_INCLUDED_DEG = 140;

export const FWD_FLAP_CHORD = FWD_FLAP_CHORD_M * U;
export const FWD_FLAP_SPAN = FWD_FLAP_SPAN_M * U;
export const AFT_FLAP_CHORD = AFT_FLAP_CHORD_M * U;
export const AFT_FLAP_SPAN = AFT_FLAP_SPAN_M * U;
export const FLAP_T = FLAP_THICKNESS_M * U;

/** Sea-level / vacuum Raptor exit radii (m → mesh). */
export const SL_BELL_R = (1.3 / 2) * U;
export const VAC_BELL_R = (2.4 / 2) * U;
export const SL_BELL_H = 3.1 * U;
export const VAC_BELL_H = 3.9 * U;

export function shipOgiveRadiusM(xFromTipM: number): number {
  const len = SHIP_OGIVE_H_M;
  const baseR = DIA_M / 2;
  if (xFromTipM <= 0) return 0;
  if (xFromTipM >= len) return baseR;
  const rho = (baseR * baseR + len * len) / (2 * baseR);
  const d = len - xFromTipM;
  return Math.sqrt(Math.max(0, rho * rho - d * d)) + baseR - rho;
}

export function fwdFlapAz(side: number): number {
  const half = ((FWD_FLAP_INCLUDED_DEG * Math.PI) / 180) / 2;
  return -Math.PI / 2 + side * half;
}

export function fwdFlapZ(): number {
  return SHIP_OGIVE_BASE_Z + 2.8 * U;
}

export const FIN_CAM_LOCAL = {
  x: Math.cos(fwdFlapAz(1)) * (R + FWD_FLAP_SPAN * 0.75),
  y: Math.sin(fwdFlapAz(1)) * (R + FWD_FLAP_SPAN * 0.75) + 0.04,
  z: fwdFlapZ() + FWD_FLAP_CHORD * 0.55,
} as const;

/** Fin-cam look — aft along the TPS/steel chine toward the engines. */
export const FIN_CAM_LOOK_LOCAL = {
  x: Math.cos(fwdFlapAz(1)) * (R + 0.04),
  y: Math.sin(fwdFlapAz(1)) * R * 0.15,
  z: 0.22,
} as const;

export const CRAFT_CAM_MOUNT_NAMES = [
  "fin-cam",
  "fin-cam-look",
  "flap-cam",
  "flap-cam-look",
  "hull-cam",
  "hull-cam-look",
  "grid-fin-cam",
  "grid-fin-cam-look",
  "booster-hull-cam",
  "booster-hull-cam-look",
  "engines-cam",
  "engines-cam-look",
  "engines-down-cam",
  "engines-down-cam-look",
] as const;

/**
 * Approximate craft length (km) for locator pixel-size heuristic.
 * Full stack ~123 m; ship alone ~52 m.
 */
export function craftLengthKm(staged: boolean): number {
  return staged ? SHIP_H_M / 1000 : (SHIP_H_M + BOOST_H_M) / 1000;
}

/** Super Heavy alone (~71 m) for free-flyer locator sizing after stage-out. */
export function boosterLengthKm(): number {
  return BOOST_H_M / 1000;
}
