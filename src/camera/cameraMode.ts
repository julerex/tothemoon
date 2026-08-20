/**
 * Camera focus presets. `"free"` is internal (no subject co-motion).
 * `"drone"` is the Flight 13 sea-level recovery orbit of the floating ship.
 * `"aerial"` is the Starbase pad flying-drone hover (T− hold wide).
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
  | "drone";

/** Starbase ground/opening and the pad flying-drone hover share pad ENU. */
export function isPadFocus(mode: CameraMode): boolean {
  return mode === "starbase" || mode === "aerial";
}
