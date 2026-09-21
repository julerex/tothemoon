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
 * Ascent follows the Earth-fixed Starbase → Gauteng great circle, with a
 * modest out-of-plane pull onto that same plane in inertial axes at liftoff.
 * There is no splash aim point. Flying the rotating GC alone and then
 * coasting inertial left the ship north of the corridor; a full intercept
 * insert overshoots east onto Australia, so the blend keeps the original
 * loft and only slides the ground track onto the corridor.
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
 * - Landing burn is retrograde plus an up-hold. It does not steer at a ground
 *   point. Splash is a sub-km floor at the flown lat/lon (no clock-forced splash)
 * - After splash the ship stays Earth-fixed on the ocean through {@link F13.END}
 *   (T+1:10) so the theater can hold a sea-level drone shot
 */

export { F13, firstSplashdownT } from "./flight13Timeline";
export type { Flight13MissionOptions } from "./flight13Types";
export { runFlight13Mission } from "./flight13Run";
