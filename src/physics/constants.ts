/**
 * Physical constants in km, s, km³/s².
 * Standard textbook / IAU-ish values for visualization (not flight-ops grade).
 */

/** Earth mean radius (km) */
export const R_EARTH = 6371.0;

/**
 * Earth axial tilt vs the ecliptic / orbital plane (rad).
 * In this theater the Sun–Earth–Moon plane is XY; ecliptic north is +Z.
 */
export const EARTH_OBLIQUITY = (23.439_281 * Math.PI) / 180;

/** Sidereal day (s) — Earth spin period relative to inertial frame */
export const EARTH_SIDEREAL_DAY_S = 86_164.0905;

/** Moon mean radius (km) */
export const R_MOON = 1737.4;

/**
 * Mean lunar axial tilt vs the ecliptic (rad) ≈ 1.54°.
 * Small compared to Earth; still applied so the pole is not exactly +Z.
 */
export const MOON_OBLIQUITY = (1.543 * Math.PI) / 180;

/** Sun mean radius (km) */
export const R_SUN = 695_700;

/** Earth gravitational parameter (km³/s²) */
export const MU_EARTH = 398600.4418;

/** Moon gravitational parameter (km³/s²) */
export const MU_MOON = 4902.800066;

/** Sun gravitational parameter (km³/s²) */
export const MU_SUN = 1.32712440018e11;

/** Astronomical unit (km) */
export const AU = 149_597_870.7;

/** Mean Earth–Moon semi-major axis (km) */
export const A_EM = 384_400;

/**
 * Mean lunar orbital eccentricity.
 * Perigee ≈ a(1−e) ≈ 363 300 km, apogee ≈ a(1+e) ≈ 405 500 km.
 */
export const MOON_ECC = 0.0549;

/**
 * Mean inclination of the lunar orbit to the ecliptic (rad) ≈ 5.145°.
 * Theater ecliptic = XY plane; Moon’s path leaves that plane by ±i.
 */
export const MOON_INCLINATION = (5.145 * Math.PI) / 180;

/**
 * Longitude of the ascending node Ω (rad) in the ecliptic frame.
 * Fixed for this theater (real node regresses ~18.6 yr). Chosen so the
 * July-2027 mission geometry is easy to read from the default camera.
 */
export const MOON_NODE = (12.5 * Math.PI) / 180;

/**
 * Argument of perigee ω (rad) — fixed for the theater (real apsides precess
 * ~8.85 yr). Periapsis near the ascending-node side of the orbit.
 */
export const MOON_ARG_PERI = (30 * Math.PI) / 180;

/** Mass ratio Moon/Earth (for barycenter) ≈ μ_m/μ_e */
export const MASS_RATIO_ME = MU_MOON / MU_EARTH;

/** Earth distance from EM barycenter at mean separation */
export const R_EARTH_BARY = (A_EM * MASS_RATIO_ME) / (1 + MASS_RATIO_ME);

/** Moon distance from EM barycenter at mean separation */
export const R_MOON_BARY = A_EM / (1 + MASS_RATIO_ME);

/** Sidereal month (s) — mean lunar orbital period */
export const SIDEREAL_MONTH_S = 27.321661 * 86400;

/** Mean motion of Moon (rad/s) */
export const N_MOON = (2 * Math.PI) / SIDEREAL_MONTH_S;

/**
 * Effective μ for the Earth–Moon relative Kepler problem so that
 * n² a³ = μ with the observed sidereal month (includes mean solar effects
 * baked into a and n).
 */
export const MU_EM_ORB = N_MOON * N_MOON * A_EM * A_EM * A_EM;

/** Earth orbital mean motion about Sun (rad/s) — for Sun ephemeris in bary frame */
export const N_EARTH_SUN = (2 * Math.PI) / (365.256363 * 86400);

/** LEO altitude (km) */
export const LEO_ALTITUDE = 200;

/** LEO radius from Earth center (km) */
export const LEO_RADIUS = R_EARTH + LEO_ALTITUDE;

/**
 * SpaceX Starbase / Boca Chica, Texas (geodetic, WGS84-ish).
 * Due-east launch → parking inclination ≈ site latitude.
 */
export const STARBASE_LAT = (25.997 * Math.PI) / 180;
export const STARBASE_LON = (-97.156 * Math.PI) / 180; // °W negative

/** Pad altitude above mean radius (km) */
export const STARBASE_ALT = 0.01;

/**
 * Peak ascent acceleration (km/s²) — theater value ~2.5 g continuous
 * (real staged vehicles vary; this yields ~8–12 min to LEO).
 */
export const ASCENT_ACCEL = 0.028; // ~2.8 g peak theater

/**
 * Default LEO coast after insertion before TLI (s).
 * runMission may pick a nearby value for a better lunar intercept.
 */
export const LEO_COAST_S = 15 * 60;

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
