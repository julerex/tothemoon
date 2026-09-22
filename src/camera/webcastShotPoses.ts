/**
 * Pad / chase / drone pose constants for the Flight 13 webcast shot list.
 *
 * Split out of `webcastShots.ts` (which keeps the cut table) so each file
 * stays readable. Pad bearings are ENU azimuth from east toward north; see
 * `enuPose.ts`. Stills: `assets/flight13-webcast/README.md`.
 */

import { TOWER_H, TOWER_OX, TOWER_OZ } from "../scene/earthTheater/mechazillaDims";
import {
  padAerialFromOlp2,
  padLocalAzimuthDeg,
} from "../scene/earthTheater/starbaseSurvey";

/** Wider FOV for webcast hull / engine-bay stills. */
export const WEBCAST_ONBOARD_FOV = 80;
/** Default theater PerspectiveCamera FOV. */
export const THEATER_DEFAULT_FOV = 50;

/* T−5 pad drone: south of the OLM, looking NNW at Mechazilla mid-truss. */
/** Look-at west of the OLM (km) — live tower center. */
export const PAD_AERIAL_LOOK_WEST_KM = TOWER_OX;
/** Look-at north of the OLM (km) — live tower center. */
export const PAD_AERIAL_LOOK_NORTH_KM = TOWER_OZ;
/** Look-at height above the OLM (km) — mid-truss, not the apron. */
export const PAD_AERIAL_LOOK_UP_KM = TOWER_H * 0.5;

/** Camera nadir relative to the look-at, pad-local `[west, north]` km. */
function padAerialFromLookAt(): { x: number; z: number } {
  return {
    x: padAerialFromOlp2.x - PAD_AERIAL_LOOK_WEST_KM,
    z: padAerialFromOlp2.z - PAD_AERIAL_LOOK_NORTH_KM,
  };
}

export const PAD_AERIAL_AZ_DEG = padLocalAzimuthDeg(padAerialFromLookAt());
/** Elevation of the eye above the look-at horizon (deg). */
export const PAD_AERIAL_EL_DEG = 18.5;
/** Handheld drone lens (vertical FOV). */
export const PAD_AERIAL_FOV = 62;
/**
 * Must match `CameraDirector.frameDistanceFor` pad radius/fill (0.12 km, 0.5)
 * so {@link PAD_AERIAL_FRAME_SCALE} seats the ground track on the T−5 pin.
 */
const PAD_AERIAL_FRAME_RADIUS_KM = 0.12;
const PAD_AERIAL_FRAME_FILL = 0.5;

/** Slant range so the nadir sits on {@link padAerialFromOlp2}. */
function padAerialFrameScale(): number {
  const p = padAerialFromLookAt();
  const horiz = Math.hypot(p.x, p.z);
  const slant = horiz / Math.cos((PAD_AERIAL_EL_DEG * Math.PI) / 180);
  const half =
    ((PAD_AERIAL_FOV * Math.PI) / 180) * PAD_AERIAL_FRAME_FILL * 0.5;
  const framed = PAD_AERIAL_FRAME_RADIUS_KM / Math.tan(half);
  return slant / framed;
}

/** Framed pad radius multiplier — ground track on the T−5 pin. */
export const PAD_AERIAL_FRAME_SCALE = padAerialFrameScale();

/**
 * Ground Camera One — `tminus-000200-full-stack.jpg`.
 * South-southwest of the OLM, telephoto up at the full stack and chopsticks.
 * Gulf (east) to the right; TPS camera-left / stainless right.
 */
export const GROUND1_AZ_DEG = 248;
/** Elevation above the local horizon (deg) — rooftop / pad-fence height. */
export const GROUND1_EL_DEG = 5.2;
/** Telephoto vertical FOV so the stack + tower fill the frame. */
export const GROUND1_FOV = 36;
/** Tight framed-pad multiplier — OLM in the footer, chopsticks at the top. */
export const GROUND1_FRAME_SCALE = 0.34;
/** Look-at height above the OLM (km) so the camera frames the stack, not dirt. */
export const GROUND1_LOOK_UP_KM = 0.085;

/** Mission time (s) of the T−2:00 Ground Camera One cut. */
export const GROUND1_T0 = -120;
/** Mission time (s) of the T−0:30 return to Ground Camera One. */
export const GROUND1_HOLD_T0 = -30;
/** Mission time (s) of the T−1:46 flame-trench engines-up cut. */
export const TRENCH_T0 = -106;
/** Mission time (s) of the T−0:05 pad tracker (ignition through tower clear). */
export const PAD_TRACK_T0 = -5;

/**
 * Pad tracking camera (`tminus-000000-liftoff-pad.jpg` → `tplus-000002`).
 * Ground level south of the pad, wide enough to hold the stack in the deluge
 * steam as it clears the tower.
 */
export const PAD_TRACK_AZ_DEG = 250;
export const PAD_TRACK_EL_DEG = 6;
export const PAD_TRACK_FOV = 46;
export const PAD_TRACK_FRAME_SCALE = 0.85;

/**
 * Ascent tracker (`tplus-000022-ascent-tracking.jpg`): long lens at the pad
 * holding the stack and plume against the sky after the drone hand-off.
 */
export const ASCENT_TRACK_T0 = 18;
export const ASCENT_TRACK_AZ_DEG = 188;
export const ASCENT_TRACK_EL_DEG = 16;
export const ASCENT_TRACK_FOV = 42;
export const ASCENT_TRACK_FRAME_SCALE = 1.55;

/** Mission time (s) when Auto-cam cuts from aerial splash to the sea drone. */
export const SPLASH_DRONE_T0 = 3926;
/** Opening ENU azimuth (deg from east toward north) for the drone hold. */
export const SPLASH_DRONE_AZ0_DEG = 218;
/** Slow orbit rate (deg/s) — ~32°/min, a leisurely recovery-drone circle. */
export const SPLASH_DRONE_AZ_RATE_DEG_S = 32 / 60;
/** Elevation above the local ocean horizon (deg). */
export const SPLASH_DRONE_ELEV_DEG = 8;
/** Chase frameScale: ship + steam + horizon, close enough to read the hull. */
export const SPLASH_DRONE_FRAME_SCALE = 0.92;
/** Slightly wider than the theater default — handheld drone lens. */
export const SPLASH_DRONE_FOV = 58;

/**
 * ENU azimuth for the post-splash recovery drone at mission time `t`.
 * Scrub-deterministic slow orbit around the floating ship.
 *
 * @param t - Mission time (s)
 */
export function splashDroneAzimuthDeg(t: number): number {
  const age = Math.max(0, t - SPLASH_DRONE_T0);
  return SPLASH_DRONE_AZ0_DEG + age * SPLASH_DRONE_AZ_RATE_DEG_S;
}
