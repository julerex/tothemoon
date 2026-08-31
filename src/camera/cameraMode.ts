/**
 * Camera focus presets. `"free"` is internal (no subject co-motion).
 * `"drone"` is the Flight 13 sea-level recovery orbit of the floating ship.
 * `"aerial"` is the Starbase pad flying-drone hover (T− hold wide).
 * `"ground1"` is Ground Camera One — T−2 full stack and tower from the pad.
 * `"engines"` / `"enginesDown"` are Super Heavy engine-bay webcast mounts.
 * `"booster"` looks at Super Heavy from outside; `"tower"` looks at Mechazilla.
 *
 * Rails: {@link FREE_LOOK_CAMERAS} can pan / orbit / zoom (Auto-cam off).
 * {@link FIXED_CAMERAS} are livestream analogs — movement is locked.
 */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "starbase"
  | "aerial"
  | "ground1"
  | "fin"
  | "gridfin"
  | "trench"
  | "hull"
  | "drone"
  | "engines"
  | "enginesDown"
  | "booster"
  | "tower";

/**
 * Exhaustive look kind. Adding a {@link CameraMode} fails typecheck until
 * it is classified here.
 */
const LOOK_KIND: Record<CameraMode, "free" | "fixed"> = {
  free: "free",
  sun: "free",
  earth: "free",
  moon: "free",
  booster: "free",
  tower: "free",
  chase: "free",
  starbase: "fixed",
  aerial: "fixed",
  ground1: "fixed",
  fin: "fixed",
  gridfin: "fixed",
  trench: "fixed",
  hull: "fixed",
  drone: "fixed",
  engines: "fixed",
  enginesDown: "fixed",
};

/**
 * Free rail (movable). Sun / Earth / Moon, then exterior pad / booster /
 * Starship. Internal `"free"` is not a rail button.
 */
export const FREE_LOOK_CAMERAS: readonly CameraMode[] = [
  "sun",
  "earth",
  "moon",
  "booster",
  "tower",
  "chase",
];

/**
 * Fixed rail (no pan / orbit / zoom). Livestream analogs: pad drone,
 * Ground Camera One, Starbase, trench, engine-bay, hull, grid-fin, ship
 * fin, recovery drone.
 */
export const FIXED_CAMERAS: readonly CameraMode[] = [
  "aerial",
  "ground1",
  "starbase",
  "trench",
  "enginesDown",
  "hull",
  "engines",
  "gridfin",
  "fin",
  "drone",
];

/** True for livestream-style mounts: user movement is rejected. */
export function isFixedCamera(mode: CameraMode): boolean {
  return LOOK_KIND[mode] === "fixed";
}

/**
 * True for fly-around looks (rail free cameras plus internal `"free"`).
 * Auto-cam turns off when the user picks one of these.
 */
export function isFreeLookCamera(mode: CameraMode): boolean {
  return LOOK_KIND[mode] === "free";
}

/**
 * Starbase ground/opening, pad flying-drone, Ground Camera One, and
 * launch-tower looks share pad ENU: WASD slides parallel to the Earth,
 * T/B is surface-normal. Aerial, Starbase, and Ground Camera One are still
 * {@link isFixedCamera}; only the launch tower accepts that pan.
 */
export function isPadFocus(mode: CameraMode): boolean {
  return (
    mode === "starbase" ||
    mode === "aerial" ||
    mode === "ground1" ||
    mode === "tower"
  );
}

/**
 * Super Heavy onboard mounts that share the booster host (grid-fin, engine
 * bay looking at the ship Raptors, engines-down looking through the bells).
 */
export function isBoosterMountFocus(mode: string): boolean {
  return mode === "gridfin" || mode === "engines" || mode === "enginesDown";
}
