/**
 * Starship Flight 13 theater mission (suborbital flight test).
 *
 * Timeline anchors match docs/STARSHIP_13.md (SpaceX public profile, approx).
 * Dynamics: restricted RK4 with mass-coupled thrust + atmosphere. Default
 * force model is full restricted n-body (Earth + Moon + solar tide + J₂ +
 * drag). Pass `{ gravity: "earth" }` for Earth-only mechanics (μ + J₂ + drag,
 * no Moon/Sun) — used to cross-check that third-body terms stay small on a
 * ~1 h suborbital arc.
 *
 * Ascent follows the Earth-fixed Starbase → Gauteng → splash corridor
 * with a modest out-of-plane pull toward the inertial plane through the
 * pad at liftoff and the splash site at {@link F13.SPLASH}. Flying the
 * rotating GC alone and then coasting inertial left the ship ~5° north of
 * the site; the landing burn then hooked ~120° south. A full intercept
 * insert overshoots east onto Australia, so the blend keeps the original
 * loft and only slides latitude into the Indian Ocean.
 *
 * Profile (theater-grade, not ops — but intentionally more ballistic):
 * - Gravity-turn ascent + hot-stage in the intercept plane
 * - Upper burn builds near-circular horizontal speed (low radial rate at SECO)
 * - Free coast is pure ballistic (no midcourse PD / altitude-hold glide)
 * - In-space relight is the public ~12 s single-engine demo. Theater insert
 *   is closer to circular than the flown 8×195 km, so the burn is a modest
 *   retrograde (not the old 20 s deorbit) so aero can finish over the
 *   Indian Ocean without a longitude teleport.
 * - Entry: piecewise US76-ish density, altitude-varying CdA / L/D (theater
 *   bounded) and a light bank back onto the intercept plane — no powered cruise
 * - Landing burn brakes near the splash fix; splash is a sub-km floor at the
 *   flown lat/lon (no published-fix seat, no clock-forced splash)
 * - After splash the ship stays Earth-fixed on the ocean through {@link F13.END}
 *   (T+1:10) so the theater can hold a sea-level drone shot
 *
 * Splash coordinates are the published Flight 11 Indian Ocean fix
 * (19°S 107°E, northwest of Western Australia) — not a surveyed Flight 13 buoy.
 */

export { FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON } from "./flight13Corridor";
export { F13, splashSurfaceInertial, firstSplashdownT } from "./flight13Timeline";
export type { Flight13MissionOptions } from "./flight13Types";
export { runFlight13Mission } from "./flight13Run";
