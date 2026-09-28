/**
 * Starship Flight 14 theater mission (first orbital flight test).
 *
 * Timeline anchors match docs/STARSHIP_14.md (SpaceX public profile, approx).
 * Dynamics: restricted RK4 with mass-coupled thrust + atmosphere. Default
 * force model is full restricted n-body (Earth + Moon + solar tide + J₂ +
 * drag).
 *
 * Ascent follows the same passively safe Starbase → Indian Ocean corridor as
 * Flight 13 until SECO (intentionally short of circular). A single-Raptor
 * insertion burn circularizes near 275 km. Free coast, 26-sat deploy window,
 * single-Raptor deorbit at the public mark, then belly entry and splash
 * wherever the force model meets the sea. No Chile buoy.
 */

export { F14, firstSplashdownT } from "./flight14Timeline";
export type { Flight14MissionOptions } from "./flight14Types";
export { runFlight14Mission } from "./flight14Run";
