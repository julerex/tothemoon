/** Flight 13 timeline anchors and splash surface helper. */
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { geodeticToMeshLocal, meshLocalToInertial } from "./earthFrame";
import { FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON } from "./flight13Corridor";
import type { V3 } from "./vec3";
import { normalize, v3 } from "./vec3";
import { _splashLocal } from "./flight13Scratch";

export { FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON } from "./flight13Corridor";

/** Official approximate T+ anchors (s) from Flight 13 profile. */
export const F13 = {
  LIFTOFF: 0,
  MAX_Q: 58,
  MECO: 138,
  HOT_STAGE: 141,
  SECO: 485,
  PAYLOAD_START: 1000,
  PAYLOAD_END: 1659,
  /** Public table ~T+38:58; single-engine in-space relight demo. */
  RELIGHT: 2338,
  /** ~10 s single-engine demo (public table ~12 s). */
  RELIGHT_END: 2348,
  ENTRY: 2850,
  TRANSONIC: 3743,
  SUBSONIC: 3781,
  LAND_BURN: 3901,
  LAND_FLIP: 3903,
  LAND_3TO2: 3912,
  LAND_2TO1: 3919,
  SPLASH: 3921,
  /**
   * Theater end: post-splash drone hold of the floating ship through
   * T+1:10:00 (public splash is T+1:05:21).
   */
  END: 70 * 60,
} as const;

/** Attitude / entry helpers still import this alias. */
export const F13_ATT = F13;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Unit surface radial at splash site (inertial) at mission time t. */
export function splashSurfaceInertial(
  t: number,
  out: V3 = v3(),
  epoch?: EphemerisEpoch,
): V3 {
  geodeticToMeshLocal(
    FLIGHT13_SPLASH_LAT,
    FLIGHT13_SPLASH_LON,
    1,
    _splashLocal,
  );
  meshLocalToInertial(_splashLocal, t, out, epoch);
  return normalize(out, out);
}
export function firstSplashdownT(
  samples: readonly { phase: string; t: number }[],
): number {
  for (const s of samples) {
    if (s.phase === "splashdown") return s.t;
  }
  return F13.SPLASH;
}

export const FLOAT_DT_S = 2;
export const SHIP_PROP_RESERVE = 0.07;
export const SECO_VCIRC_FRAC = 1.0;
export const SECO_VRAD_MAX = 0.18;
export const SECO_ALT_MIN_KM = 148;
