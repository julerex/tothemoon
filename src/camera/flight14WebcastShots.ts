/**
 * Flight 14 Auto-cam beats keyed to the official T+ table (analog cameras
 * until HUD stills are cataloged). Pad / ascent / booster recovery follow
 * the Flight 13 left-pane language; insertion, 26-sat Pez, deorbit, and the
 * ~T+9:50 splash use the public Flight 14 clock.
 *
 * Stills: `assets/flight14-webcast/README.md`. Capture SOP: `docs/STARSHIP_14.md`.
 * When a still and this table disagree, the still wins.
 */

import { TOWER2_DOWN_FOV } from "./towerCam";
import {
  ASCENT_TRACK_AZ_DEG,
  ASCENT_TRACK_EL_DEG,
  ASCENT_TRACK_FOV,
  ASCENT_TRACK_FRAME_SCALE,
  ASCENT_TRACK_T0,
  GROUND1_AZ_DEG,
  GROUND1_EL_DEG,
  GROUND1_FOV,
  GROUND1_FRAME_SCALE,
  GROUND1_HOLD_T0,
  GROUND1_T0,
  PAD_AERIAL_FOV,
  SPLASH_DRONE_AZ0_DEG,
  SPLASH_DRONE_ELEV_DEG,
  SPLASH_DRONE_FOV,
  SPLASH_DRONE_FRAME_SCALE,
  TRENCH_T0,
  WEBCAST_ONBOARD_FOV,
  type WebcastShot,
  webcastShotAtFrom,
} from "./webcastShots";
import { F14 } from "../physics/flight14Timeline";

export type { WebcastShot, WebcastMount } from "./webcastShots";

/** Flight 14 sea-level recovery drone (public splash + a few seconds). */
const F14_SPLASH_DRONE_T0 = F14.SPLASH + 8;

/**
 * Sorted Flight 14 webcast cuts (left pane when split).
 * Ascent through Super Heavy splash uses the same analog cameras as Flight 13
 * at the Flight 14 public T+ marks. On-orbit / deorbit / landing follow the
 * official six-orbit table until captured stills reclassify a cut.
 */
export const FLIGHT14_WEBCAST_SHOTS: readonly WebcastShot[] = [
  { key: "pad-wide", t0: -300, mode: "aerial", frame: true, fov: PAD_AERIAL_FOV },
  {
    key: "ground-cam-1", t0: GROUND1_T0, mode: "ground1", frame: true,
    frameScale: GROUND1_FRAME_SCALE, azimuthDeg: GROUND1_AZ_DEG,
    elevationDeg: GROUND1_EL_DEG, padTrack: true, fov: GROUND1_FOV,
  },
  { key: "pad-wide-2", t0: -112, mode: "aerial", frame: true, fov: PAD_AERIAL_FOV },
  { key: "trench-engines-up", t0: TRENCH_T0, mode: "trench", frame: true },
  { key: "pad-wide-3", t0: -75, mode: "aerial", frame: true, fov: PAD_AERIAL_FOV },
  {
    key: "ground-cam-1-hold", t0: GROUND1_HOLD_T0, mode: "ground1", frame: true,
    frameScale: GROUND1_FRAME_SCALE, azimuthDeg: GROUND1_AZ_DEG,
    elevationDeg: GROUND1_EL_DEG, padTrack: true, fov: GROUND1_FOV,
  },
  {
    key: "tower-two-down", t0: 3, mode: "tower2cam", frame: true,
    towerTrack: true, fov: TOWER2_DOWN_FOV,
  },
  { key: "pad-drone-ascent", t0: 8, mode: "aerial", frame: true, fov: PAD_AERIAL_FOV },
  {
    key: "ascent-track", t0: ASCENT_TRACK_T0, mode: "starbase", frame: true,
    frameScale: ASCENT_TRACK_FRAME_SCALE, azimuthDeg: ASCENT_TRACK_AZ_DEG,
    elevationDeg: ASCENT_TRACK_EL_DEG, padTrack: true, fov: ASCENT_TRACK_FOV,
  },
  {
    key: "ascent-ship-hull", t0: 29, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "maxq-engines-down", t0: F14.MAX_Q, mode: "enginesDown", frame: true,
    mount: "enginesDown", fov: 76,
  },
  {
    key: "ascent-ship-hull-2", t0: 75, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "hotstage-engines", t0: 124, mode: "engines", frame: true,
    mount: "engines", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "postsep-ship-hull", t0: 157, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "boostback-engines-down", t0: 180, mode: "enginesDown", frame: true,
    mount: "enginesDown", fov: 76,
  },
  {
    key: "booster-hull", t0: 250, mode: "gridfin", frame: true,
    mount: "boosterHull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-engines-mid", t0: 265, mode: "engines", frame: true,
    mount: "engines", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-gridfin", t0: 311, mode: "gridfin", frame: true,
    mount: "boosterHull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "booster-engines-late", t0: 328, mode: "engines", frame: true,
    mount: "engines", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "sh-descent", t0: 385, mode: "gridfin", frame: true,
    mount: "boosterHull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "ship-hull", t0: 410, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "insert-hull", t0: F14.INSERT, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "payload-bay", t0: F14.PAYLOAD_START, mode: "payload", frame: true,
    mount: "payload", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "orbit-hull", t0: F14.PAYLOAD_END, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "deorbit-hull", t0: F14.DEORBIT, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "entry-flap", t0: F14.ENTRY, mode: "fin", frame: true,
    mount: "flap", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "landing-hull", t0: F14.TRANSONIC, mode: "hull", frame: true,
    mount: "hull", fov: WEBCAST_ONBOARD_FOV,
  },
  {
    key: "splash-chase", t0: F14.SPLASH, mode: "chase", frame: true,
    frameScale: 1.7, azimuthDeg: 145, elevationDeg: 55,
  },
  {
    key: "splash-drone", t0: F14_SPLASH_DRONE_T0, mode: "drone", frame: true,
    frameScale: SPLASH_DRONE_FRAME_SCALE, azimuthDeg: SPLASH_DRONE_AZ0_DEG,
    elevationDeg: SPLASH_DRONE_ELEV_DEG, fov: SPLASH_DRONE_FOV, droneTrack: true,
  },
];

/** Active Flight 14 webcast shot at mission time `t` (s). */
export function webcastShotAt(t: number): WebcastShot {
  return webcastShotAtFrom(FLIGHT14_WEBCAST_SHOTS, t);
}
