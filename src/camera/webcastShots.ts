/**
 * Flight 13 Auto-cam beats keyed to the official X-replay camera cuts.
 *
 * One entry per camera the broadcast cut to, at the mission `T+` second the
 * still catalog caught the switch (negative = countdown). Split-screen frames
 * use the **left** pane. Stills: `assets/flight13-webcast/README.md`; capture
 * SOP: `docs/STARSHIP_13.md`.
 *
 * Modes map to theater cameras; `azimuthDeg` / `elevationDeg` are pad or
 * Earth-ENU bearings (see `enuPose.ts`). Onboard shots use named mounts, the
 * Launchpad Drone flies the `padDrone.ts` path, and the tower peak cams can
 * pan with the climbing stack (`towerTrack`).
 *
 * @see webcastShotPoses.ts — pose constants
 */

import type { CameraMode } from "./cameraMode";
import { TOWER2_CAM_FOV } from "./towerCam";
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
  PAD_TRACK_AZ_DEG,
  PAD_TRACK_EL_DEG,
  PAD_TRACK_FOV,
  PAD_TRACK_FRAME_SCALE,
  PAD_TRACK_T0,
  SPLASH_DRONE_AZ0_DEG,
  SPLASH_DRONE_ELEV_DEG,
  SPLASH_DRONE_FOV,
  SPLASH_DRONE_FRAME_SCALE,
  SPLASH_DRONE_T0,
  TRENCH_T0,
  WEBCAST_ONBOARD_FOV,
} from "./webcastShotPoses";

export * from "./webcastShotPoses";

/** Onboard mount picked on a gridfin / hull / fin cut. */
export type WebcastMount =
  | "fin"
  | "hull"
  | "gridfin"
  | "trench"
  | "engines"
  | "enginesDown"
  | "boosterHull"
  | "flap"
  | "payload";

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
  /** Tower peak mount pans with the climbing stack instead of the pad look-at. */
  towerTrack?: boolean;
  /**
   * Sea-level drone hold: reseat each frame on an Earth-ENU orbit of the
   * floating ship (Flight 13 post-splash).
   */
  droneTrack?: boolean;
};

/**
 * Sorted Flight 13 webcast cuts (left pane when split).
 *
 * Countdown: Launchpad Drone wide, Ground Camera One at T−2:00, flame trench
 * under the engines at T−1:46, drone again at T−1:15, Ground Camera One from
 * T−0:30, pad tracker from T−0:05.
 * Liftoff: launch-tower peak panning down at the rising stack (T+3), Launchpad
 * Drone perched above the pad (T+8) tilting up as the stack climbs past, pad
 * tracker long lens (T+18).
 * Ascent: Starship hull-cam over the plumes (T+29) with the booster
 * engines-down look at Max Q (T+58).
 * Staging through Super Heavy splash: booster engine bay / hull / grid fin
 * (left of the split), Starship hull-cam on the post-sep and SECO beats.
 * Orbit: payload-bay cam for the Starlink deploy, hull-cam after.
 * Entry and landing: forward-flap cam on the plasma split, hull-cam through
 * the flip and landing burn, then an aerial splash chase and the sea-level
 * recovery drone.
 */
export const FLIGHT13_WEBCAST_SHOTS: readonly WebcastShot[] = [
  {
    // T−5:00 wide pad tableau (`tminus-000500-pad-hold-wide.jpg`). The drone
    // flies the padDrone.ts path from here.
    key: "pad-wide",
    t0: -300,
    mode: "aerial",
    frame: true,
    fov: PAD_AERIAL_FOV,
  },
  {
    // T−2:00 ground-level full stack (`tminus-000200-full-stack.jpg`).
    key: "ground-cam-1",
    t0: GROUND1_T0,
    mode: "ground1",
    frame: true,
    frameScale: GROUND1_FRAME_SCALE,
    azimuthDeg: GROUND1_AZ_DEG,
    elevationDeg: GROUND1_EL_DEG,
    padTrack: true,
    fov: GROUND1_FOV,
  },
  {
    // Back to the drone between the T−2:00 and T−1:46 stills
    // (`tminus-000148-pad-hold-wide.jpg` catches the tail of this hold).
    key: "pad-wide-2",
    t0: -112,
    mode: "aerial",
    frame: true,
    fov: PAD_AERIAL_FOV,
  },
  {
    // T−1:46 / T−1:30 looking up into the Raptor cluster
    // (`tminus-000146-engines-up.jpg`).
    key: "trench-engines-up",
    t0: TRENCH_T0,
    mode: "trench",
    frame: true,
  },
  {
    // T−1:15 through T−0:42 pad-hold wide (`tminus-000115-pad-hold-wide.jpg`).
    key: "pad-wide-3",
    t0: -75,
    mode: "aerial",
    frame: true,
    fov: PAD_AERIAL_FOV,
  },
  {
    // T−0:30 → T−0:10 full stack, chopsticks open
    // (`tminus-000030-full-stack.jpg`).
    key: "ground-cam-1-hold",
    t0: GROUND1_HOLD_T0,
    mode: "ground1",
    frame: true,
    frameScale: GROUND1_FRAME_SCALE,
    azimuthDeg: GROUND1_AZ_DEG,
    elevationDeg: GROUND1_EL_DEG,
    padTrack: true,
    fov: GROUND1_FOV,
  },
  {
    // T−0:05 ignition → T+0:02 liftoff pad tracking
    // (`tminus-000005-liftoff-pad.jpg`, `tplus-000002-liftoff-pad.jpg`).
    key: "pad-track-liftoff",
    t0: PAD_TRACK_T0,
    mode: "starbase",
    frame: true,
    frameScale: PAD_TRACK_FRAME_SCALE,
    azimuthDeg: PAD_TRACK_AZ_DEG,
    elevationDeg: PAD_TRACK_EL_DEG,
    padTrack: true,
    fov: PAD_TRACK_FOV,
  },
  {
    // T+0:03 → T+0:07 launch-tower peak panning down at the rising stack
    // (`tplus-000003-ascent-hull-from-tower-top.jpg`, `tplus-000007-ascent-tower-down.jpg`).
    key: "tower-two-down",
    t0: 3,
    mode: "tower2cam",
    frame: true,
    towerTrack: true,
    fov: TOWER2_CAM_FOV,
  },
  {
    // T+0:08 → T+0:17 Launchpad Drone perched above the pad, tilting up as the
    // stack climbs past (`tplus-000008-liftoff-aerial.jpg` → `tplus-000017-ascent-plume-sky.jpg`).
    key: "pad-drone-ascent",
    t0: 8,
    mode: "aerial",
    frame: true,
    fov: PAD_AERIAL_FOV,
  },
  {
    // T+0:18 → T+0:28 pad long lens on the climbing stack
    // (`tplus-000022-ascent-tracking.jpg`).
    key: "ascent-track",
    t0: ASCENT_TRACK_T0,
    mode: "starbase",
    frame: true,
    frameScale: ASCENT_TRACK_FRAME_SCALE,
    azimuthDeg: ASCENT_TRACK_AZ_DEG,
    elevationDeg: ASCENT_TRACK_EL_DEG,
    padTrack: true,
    fov: ASCENT_TRACK_FOV,
  },
  {
    // T+0:29 → T+0:56 Starship hull-cam: S40 steel, tiles, plumes over the
    // coast (`tplus-000029-ascent-hull-plumes.jpg`).
    key: "ascent-ship-hull",
    t0: 29,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+0:58 Max Q looking down past the Raptor bells
    // (`tplus-000058-maxq-engines-down.jpg`).
    key: "maxq-engines-down",
    t0: 58,
    mode: "enginesDown",
    frame: true,
    mount: "enginesDown",
    fov: 76,
  },
  {
    // T+1:15 → T+2:00 back on the ship hull-cam
    // (`tplus-000115-ascent-hull-plumes.jpg`).
    key: "ascent-ship-hull-2",
    t0: 75,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+2:04 → T+2:35 booster engine bay, left of the hot-stage split
    // (`tplus-000204-prestage-split.jpg`, `tplus-000227-enginebay.jpg`).
    key: "hotstage-engines",
    t0: 124,
    mode: "engines",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+2:37 → T+2:53 post-sep ship hull-cam over the Earth limb
    // (`tplus-000237-postsep-hull-s40.jpg`).
    key: "postsep-ship-hull",
    t0: 157,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+3:00 → T+4:00 booster engine bay over Earth (left pane)
    // (`tplus-000300-split-postsep.jpg`).
    key: "boostback-engines",
    t0: 180,
    mode: "engines",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+4:10 → T+4:20 booster hull over the ocean
    // (`tplus-000410-booster-hull-earth.jpg`).
    key: "booster-hull",
    t0: 250,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+4:25 / T+4:28 hot engine bay and Raptor bells
    // (`tplus-000425-split-engines-gridfin.jpg`).
    key: "booster-engines-mid",
    t0: 265,
    mode: "engines",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+4:53 booster hull with the ship in the right pane
    // (`tplus-000453-booster-hull-earth.jpg`).
    key: "booster-hull-2",
    t0: 293,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+5:11 grid-fin hardware over the coast
    // (`tplus-000511-booster-gridfin-earth.jpg`).
    key: "booster-gridfin",
    t0: 311,
    mode: "gridfin",
    frame: true,
    mount: "gridfin",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+5:28 → T+5:50 engine bay, Raptor IDs and bells
    // (`tplus-000528-split-enginebay.jpg`).
    key: "booster-engines-late",
    t0: 328,
    mode: "engines",
    frame: true,
    mount: "engines",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+6:25 → T+6:40 Super Heavy descent and landing burn, hull-down
    // (`tplus-000625-sh-descent-clouds.jpg`).
    key: "sh-descent",
    t0: 385,
    mode: "gridfin",
    frame: true,
    mount: "boosterHull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+6:50 → T+8:21 ship hull-cam through SECO
    // (`tplus-000650-ship-hull-engines.jpg`, `tplus-000807-seco-hull-s40.jpg`).
    key: "ship-hull",
    t0: 410,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+16:46 → T+21:19 payload-bay cam on the Starlink V3 deploy
    // (`tplus-001646-payload-deploy-start.jpg`).
    key: "payload-bay",
    t0: 1006,
    mode: "payload",
    frame: true,
    mount: "payload",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+27:39 deploy complete, back on the hull-cam
    // (`tplus-002739-payload-complete.jpg`).
    key: "coast-hull",
    t0: 1659,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+39:03 relight glow on the forward flap, then the T+47:25 entry-plasma
    // split (`tplus-003903-raptor-relight.jpg`, `tplus-004725-entry-plasma-split.jpg`).
    key: "entry-flap",
    t0: 2343,
    mode: "fin",
    frame: true,
    mount: "flap",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+1:02:19 transonic flap over the cloud deck
    // (`tplus-010219-transonic-flap-earth.jpg`).
    key: "transonic-flap",
    t0: 3739,
    mode: "fin",
    frame: true,
    mount: "flap",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+1:02:55 → T+1:05:12 hull-cam through the flip and landing burn
    // (`tplus-010255-subsonic-hull-s40.jpg`, `tplus-010502-landing-burn.jpg`).
    key: "landing-hull",
    t0: 3775,
    mode: "hull",
    frame: true,
    mount: "hull",
    fov: WEBCAST_ONBOARD_FOV,
  },
  {
    // T+1:05:20 aerial splash frame (`tplus-010520-splashdown.jpg`).
    key: "splash-chase",
    t0: 3920,
    mode: "chase",
    frame: true,
    frameScale: 1.7,
    azimuthDeg: 145,
    elevationDeg: 55,
  },
  {
    // T+1:05:26 sea-level recovery drone orbit of the floating ship.
    key: "splash-drone",
    t0: SPLASH_DRONE_T0,
    mode: "drone",
    frame: true,
    frameScale: SPLASH_DRONE_FRAME_SCALE,
    azimuthDeg: SPLASH_DRONE_AZ0_DEG,
    elevationDeg: SPLASH_DRONE_ELEV_DEG,
    fov: SPLASH_DRONE_FOV,
    droneTrack: true,
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
