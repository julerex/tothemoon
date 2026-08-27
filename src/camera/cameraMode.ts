/**
 * Camera focus presets. `"free"` is internal (no subject co-motion).
 * `"drone"` is the Flight 13 sea-level recovery orbit of the floating ship.
 * `"aerial"` is the Starbase pad flying-drone hover (T− hold wide).
 * `"engines"` / `"enginesDown"` are Super Heavy engine-bay webcast mounts.
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
  | "enginesDown";

/** Starbase ground/opening and the pad flying-drone hover share pad ENU. */
export function isPadFocus(mode: CameraMode): boolean {
  return mode === "starbase" || mode === "aerial";
}

/**
 * Super Heavy onboard mounts that share the booster host (grid-fin, engine
 * bay looking at the ship Raptors, engines-down looking through the bells).
 */
export function isBoosterMountFocus(mode: string): boolean {
  return mode === "gridfin" || mode === "engines" || mode === "enginesDown";
}
