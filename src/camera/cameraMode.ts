/**
 * Camera focus presets. `"free"` is internal (no subject co-motion).
 * `"drone"` is the Flight 13 sea-level recovery orbit of the floating ship.
 * `"aerial"` is the Starbase pad flying-drone hover (T− hold wide).
 * `"engines"` / `"enginesDown"` are Super Heavy engine-bay webcast mounts.
 * `"booster"` looks at Super Heavy from outside; `"tower"` looks at Mechazilla.
 */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "starbase"
  | "aerial"
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
 * Starbase ground/opening, pad flying-drone, and launch-tower looks share
 * pad ENU: WASD slides parallel to the Earth, T/B is surface-normal.
 */
export function isPadFocus(mode: CameraMode): boolean {
  return mode === "starbase" || mode === "aerial" || mode === "tower";
}

/**
 * Super Heavy onboard mounts that share the booster host (grid-fin, engine
 * bay looking at the ship Raptors, engines-down looking through the bells).
 */
export function isBoosterMountFocus(mode: string): boolean {
  return mode === "gridfin" || mode === "engines" || mode === "enginesDown";
}
