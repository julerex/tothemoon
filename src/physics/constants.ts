/**
 * Physical constants in km, s, km³/s².
 * Standard textbook / IAU-ish values for visualization (not flight-ops grade).
 */

/** Earth mean radius (km) */
export const R_EARTH = 6371.0;

/** Moon mean radius (km) */
export const R_MOON = 1737.4;

/** Earth gravitational parameter (km³/s²) */
export const MU_EARTH = 398600.4418;

/** Moon gravitational parameter (km³/s²) */
export const MU_MOON = 4902.800066;

/** Sun gravitational parameter (km³/s²) */
export const MU_SUN = 1.32712440018e11;

/** Astronomical unit (km) */
export const AU = 149_597_870.7;

/** Mean Earth–Moon center distance (km) */
export const A_EM = 384_400;

/** Mass ratio Moon/Earth (for barycenter) ≈ μ_m/μ_e */
export const MASS_RATIO_ME = MU_MOON / MU_EARTH;

/** Earth distance from EM barycenter */
export const R_EARTH_BARY = (A_EM * MASS_RATIO_ME) / (1 + MASS_RATIO_ME);

/** Moon distance from EM barycenter */
export const R_MOON_BARY = A_EM / (1 + MASS_RATIO_ME);

/** Sidereal month (s) — circular EM period used for prescribed orbits */
export const SIDEREAL_MONTH_S = 27.321661 * 86400;

/** Mean motion of Moon about barycenter (rad/s) */
export const N_MOON = (2 * Math.PI) / SIDEREAL_MONTH_S;

/** Earth orbital mean motion about Sun (rad/s) — for Sun ephemeris in bary frame */
export const N_EARTH_SUN = (2 * Math.PI) / (365.256363 * 86400);

/** LEO altitude (km) */
export const LEO_ALTITUDE = 200;

/** LEO radius from Earth center (km) */
export const LEO_RADIUS = R_EARTH + LEO_ALTITUDE;

/** Max continuous thrust acceleration during landing (km/s²) — ~1.2 g for theater */
export const LANDING_ACCEL = 0.012;

/** Capture / approach guidance start distance from Moon center (km) */
export const APPROACH_RANGE = 40_000;

/** Powered descent start altitude above Moon surface (km) */
export const DESCENT_ALTITUDE = 100;

/** Soft-land speed threshold (km/s) */
export const TOUCHDOWN_SPEED = 0.005;

/** Integration step sizes (s) */
export const DT_COAST = 20;
export const DT_NEAR = 2;
export const DT_BURN = 0.5;
