/**
 * Camera focus presets. `"free"` is internal (no subject co-motion).
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
  | "hull";
