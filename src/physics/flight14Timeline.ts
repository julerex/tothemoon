/** Flight 14 timeline anchors (official SpaceX T+ table, approximate). */

/** Official approximate T+ anchors (s) from Flight 14 profile. */
export const F14 = {
  LIFTOFF: 0,
  MAX_Q: 58,
  MECO: 140,
  HOT_STAGE: 142,
  SECO: 491,
  /** Single-Raptor circularization after the health check. */
  INSERT: 1528,
  INSERT_END: 1547,
  PAYLOAD_START: 2058,
  PAYLOAD_END: 3890,
  DEORBIT: 31938,
  DEORBIT_END: 31949,
  ENTRY: 34132,
  TRANSONIC: 35250,
  SUBSONIC: 35287,
  LAND_BURN: 35411,
  LAND_FLIP: 35413,
  LAND_3TO2: 35421,
  LAND_2TO1: 35422,
  SPLASH: 35430,
  /**
   * Theater end: post-splash drone hold of the floating ship through
   * T+9:55:00 (public splash is T+9:50:30).
   */
  END: 9 * 3600 + 55 * 60,
} as const;

/** Attitude / entry helpers still import this alias. */
export const F14_ATT = F14;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function firstSplashdownT(
  samples: readonly { phase: string; t: number }[],
): number {
  for (const s of samples) {
    if (s.phase === "splashdown") return s.t;
  }
  return F14.SPLASH;
}

export const FLOAT_DT_S = 2;
/** Leave ship prop for insertion + deorbit + landing. */
export const SHIP_PROP_RESERVE = 0.12;
/**
 * SECO is intentionally short of circular — passively safe to the Indian
 * Ocean until the insertion burn (SpaceX Flight 14 notes).
 */
export const SECO_VCIRC_FRAC = 0.996;
export const SECO_VRAD_MAX = 0.18;
export const SECO_ALT_MIN_KM = 220;
/** Target circular altitude after the insertion burn (km). */
export const INSERT_ALT_KM = 275;
