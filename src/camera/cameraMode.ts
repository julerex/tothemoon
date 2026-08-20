/**
 * Camera focus presets. `"free"` is internal (no subject co-motion).
 * `"drone"` is the Flight 13 sea-level recovery orbit of the floating ship.
 */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "starbase"
  | "fin"
  | "gridfin"
  | "trench"
  | "hull"
  | "drone";
