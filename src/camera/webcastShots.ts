/**
 * Flight 13 Auto-cam beats keyed to the official X-replay camera cuts.
 *
 * Times are mission `T+` seconds (negative = countdown). Split-screen
 * webcast frames use the **left** pane. Catalog:
 * `assets/flight13-webcast/README.md` and `docs/STARSHIP_13.md`.
 *
 * Modes map to theater cameras; `azimuthDeg` / `elevationDeg` are pad or
 * Earth-ENU bearings (see `enuPose.ts`). Onboard shots use named mounts.
 */

import type { CameraMode } from "./modes";

/** Onboard mount picked on a gridfin / hull / fin cut. */
export type WebcastMount =
  | "fin"
  | "hull"
  | "gridfin"
  | "trench"
  | "engines"
  | "enginesDown"
  | "boosterHull"
  | "flap";

/** One webcast camera hold, active from `t0` until the next shot. */
export type WebcastShot = {
  /** Stable id for Auto-cam edge detection. */
  key: string;
  /** Mission time (s) when this cut starts. */
  t0: number;
  mode: CameraMode;
  frame: boolean;
  frameScale?: number;
  /** ENU azimuth from east toward north (pad / chase pose). */
  azimuthDeg?: number;
  /** Elevation above the local horizon (pad / chase pose). */
  elevationDeg?: number;
  /** Keep the camera Earth-fixed at the pad and look at the stack. */
  padTrack?: boolean;
  mount?: WebcastMount;
  chaseSubject?: "ship" | "booster";
  /** Vertical FOV; onboard hull/engine cams are wider than the theater default. */
  fov?: number;
};

/** Wider FOV for webcast hull / engine-bay stills. */
export const WEBCAST_ONBOARD_FOV = 80;
/** Default theater PerspectiveCamera FOV. */
export const THEATER_DEFAULT_FOV = 50;

/**
 * Sorted Flight 13 webcast cuts (left pane when split).
 *
 * Times follow `assets/flight13-webcast/README.md` HUD clocks. Consecutive
 * stills that keep the same left-pane mount are collapsed into one hold.
 *
 * Pad: wide aerial → ground stack that tracks the climb.
 * Ascent through Super Heavy splash: booster hull / engine-bay (left of split).
 * After SH landing: ship hull-cam (payload / coast / landing) and flap-cam
 * on the entry split. Splash: external aerial chase.
 */
export const FLIGHT13_WEBCAST_SHOTS: readonly WebcastShot[] = [
  {
    key: "pad-wide",
    t0: -120,
    mode: "starbase",
    frame: true,
    frameScale: 2.85,
    // South-southwest: Gulf (east) to the right, tower three-quarter.
    azimuthDeg: 255,
    elevationDeg: 18,
  },
  {
    key: "pad-track",
    t0: -8,
    mode: "starbase",
    frame: true,
    frameScale: 0.95,
    azimuthDeg: 198,
    elevationDeg: 5,
    padTrack: true,
  },
  {
    key: "ascent-track",
    t0: 8,
    mode: "starbase",
    frame: true,
    frameScale: 1.55,
    azimuthDeg: 188,
    elevationDeg: 16,
    padTrack: true,
    fov: 42,
  },
  {
    key: "maxq-hull",
    t0: 22,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "hotstage-engines",
    t0: 130,
    mode: "gridfin",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-engines-down",
    t0: 185,
    mode: "gridfin",
    frame: true,
    mount: "enginesDown",
    fov: 76,
  },
  {
    key: "booster-hull",
    t0: 248,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-engines-mid",
    t0: 272,
    mode: "gridfin",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-hull-coast",
    t0: 314,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-engines-late",
    t0: 337,
    mode: "gridfin",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "sh-descent",
    t0: 380,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "ship-hull",
    t0: 408,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "payload-chase",
    t0: 1200,
    mode: "chase",
    frame: true,
    frameScale: 1.55,
    azimuthDeg: 110,
    elevationDeg: 12,
  },
  {
    key: "coast-hull",
    t0: 1659,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "entry-flap",
    t0: 2845,
    mode: "fin",
    frame: true,
    mount: "flap",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "transonic-hull",
    t0: 3739,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "splash-chase",
    t0: 3918,
    mode: "chase",
    frame: true,
    frameScale: 1.7,
    azimuthDeg: 145,
    elevationDeg: 55,
  },
];

/**
 * Active webcast shot at mission time `t` (s). Times before the first cut
 * still return that opening pad-wide hold.
 */
export function webcastShotAt(t: number): WebcastShot {
  let current = FLIGHT13_WEBCAST_SHOTS[0]!;
  for (const shot of FLIGHT13_WEBCAST_SHOTS) {
    if (t + 1e-9 >= shot.t0) current = shot;
    else break;
  }
  return current;
}
