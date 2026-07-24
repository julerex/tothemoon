/**
 * Physical constants in km, s, km³/s².
 * Standard textbook / IAU-ish values for visualization (not flight-ops grade).
 */

/** Earth mean radius (km) */
export const R_EARTH = 6371.0;

/**
 * Earth dynamical form factor J₂ (unnormalized). Used for LEO nodal precession
 * and slight equatorial bulge force (theater-grade, not EGM).
 */
export const EARTH_J2 = 1.082_626_68e-3;

/**
 * Simple exponential atmosphere for ascent / low LEO drag (theater).
 * ρ = ρ₀ exp(−h / H) for h < ATM_H_MAX_KM; zero above.
 * ρ₀ in kg/km³ (1.225 kg/m³ = 1.225×10⁹ kg/km³).
 */
export const ATM_RHO0_KG_KM3 = 1.225e9;
export const ATM_SCALE_HEIGHT_KM = 7.5;
/** Cutoff altitude (km) — drag ignored above this. */
export const ATM_H_MAX_KM = 120;

/**
 * Ballistic factor Cd·A/m for the stack (km²/kg).
 * ~ Cd 0.5 · A 80 m² / m 5e6 kg → order 1e-11 km²/kg.
 */
export const DRAG_CD_A_OVER_M = 1.2e-11;

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
 * Laplace sphere of influence radii (km).
 * r_SOI ≈ a (m/M)^{2/5} — theater values for overlay shells.
 * Earth vs Sun; Moon vs Earth. (Uses μ ratio = mass ratio.)
 */
export const SOI_EARTH_KM = AU * (MU_EARTH / MU_SUN) ** (2 / 5);
export const SOI_MOON_KM = A_EM * (MU_MOON / MU_EARTH) ** (2 / 5);

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
 * LEO parking coast before TLI: ~1.25 revolutions so the craft clearly
 * loops with the Moon’s sense of motion (not a short reverse arc).
 * Sidereal LEO period at 200 km ≈ 88.5 min.
 */
export const LEO_COAST_REVS = 1.25;
export const LEO_PERIOD_S =
  2 * Math.PI * Math.sqrt((LEO_RADIUS * LEO_RADIUS * LEO_RADIUS) / MU_EARTH);
export const LEO_COAST_S = LEO_COAST_REVS * LEO_PERIOD_S;

/** Max continuous thrust acceleration during landing (km/s²) — ~1.2 g for theater */
export const LANDING_ACCEL = 0.012;

/**
 * Ship acceleration during finite TLI (km/s²).
 * ~1.8 g so a Hohmann-class ~3.1 km/s inject fits a **~2–4 min** burn window
 * (real Starship is higher thrust; 0.3–0.5 g would need ~10+ min).
 */
export const TLI_ACCEL = 0.018;

/** Finite TLI burn duration bounds (s) */
export const TLI_BURN_MIN_S = 120;
export const TLI_BURN_MAX_S = 240;

/** Standard gravity (m/s²) — force / Isp bookkeeping */
export const G0 = 9.80665;

/**
 * Theater stack masses (kg) — Super Heavy / Starship order-of-magnitude.
 * Propellant loads sized for pure rocket-equation ṁ under mass-coupled burns
 * (A4) so ascent + dogleg + TLI + TCM + landing still complete.
 */
export const BOOSTER_DRY_KG = 200_000;
/** Sized for pure-RE multi-g burn lasting a few minutes to ~70+ km. */
export const BOOSTER_PROP_KG = 9_000_000;
export const SHIP_DRY_KG = 120_000;
export const SHIP_PROP_KG = 5_000_000;

/** Specific impulse (s) — rocket-equation mass flow */
export const ISP_BOOSTER = 330;
export const ISP_SHIP = 380;

/**
 * Peak thrust (N). Mass-coupled a = F / m(t) (km/s² = F/m/1000).
 *
 * Peak is set so *continuous* full-throttle at full wet mass is a fraction of
 * the old theater accel (pure rocket-equation ṁ would empty a multi-g stack in
 * ~1–2 min). As mass drops, a rises — classic rocket. Guidance may still
 * request up to this peak.
 */
export const STACK_WET_KG =
  BOOSTER_DRY_KG + BOOSTER_PROP_KG + SHIP_DRY_KG + SHIP_PROP_KG;
export const SHIP_WET_KG = SHIP_DRY_KG + SHIP_PROP_KG;
/**
 * ~1.6 g at full stack (must exceed 1 g to lift off). Pure-RE ṁ empties the
 * booster in a few minutes; ascent stages dry and force-circularizes if high.
 * a rises as mass drops.
 */
export const BOOSTER_THRUST_N = STACK_WET_KG * 0.016 * 1000;
/** ~1.2 g at full ship wet mass (TLI / landing / TCM). */
export const SHIP_THRUST_N = SHIP_WET_KG * 0.012 * 1000;

/**
 * @deprecated A4 uses pure rocket equation (scale ≡ 1). Kept for any external refs.
 */
export const BOOSTER_MDOT_SCALE = 1;
/** @deprecated A4 uses pure rocket equation (scale ≡ 1). */
export const SHIP_MDOT_SCALE = 1;

/** Capture / approach guidance start distance from Moon center (km) */
export const APPROACH_RANGE = 40_000;

/**
 * Aim altitude above the lunar south pole surface (km) for the TLI inject.
 * Transfer plane + LEO dogleg target the south-pole rendezvous point at
 * arrival (Moon center + south·(R_MOON + this)). Pure ballistic coast after
 * TLI (LRO-style); lunar gravity is cleaned up by LOI / PDI, not midcourse TCMs.
 */
export const TRANSFER_AIM_ALT_KM = 1_500;

/** Target circular LLO altitude above mean lunar surface (km) */
export const LLO_ALT_KM = 120;

/** LLO coast after LOI (revolutions) — scrubber-visible parking */
export const LLO_COAST_REVS = 0.75;

/** Peak accel for LOI capture burn (km/s²) ~1 g */
export const LOI_ACCEL = 0.01;

/** Begin LOI capture burn when lunar altitude falls below this (km) */
export const LOI_ALT_START_KM = 45_000;

/** LOI complete: |v − v_circ| and |v_rad| thresholds (km/s) */
export const LOI_V_ERR_OK = 0.15;
export const LOI_VRAD_OK = 0.1;

/** Powered descent start altitude above Moon surface (km) — PDI gate */
export const DESCENT_ALTITUDE = 100;

/** Soft-land speed threshold (km/s) */
export const TOUCHDOWN_SPEED = 0.005;

/** Integration step sizes (s) */
export const DT_COAST = 20;
export const DT_NEAR = 2;
export const DT_BURN = 0.5;
