/**
 * Guided phase cameras (Auto-cam): map mission phase → default focus framing.
 *
 * Applied only on phase (or staging) transitions while Auto-cam is enabled,
 * except Flight 13 which follows a time-keyed webcast shot list (left pane
 * when the replay is split). Manual camera picks, WASD pan, and mouse orbit
 * disable Auto-cam so guided cuts do not fight user framing mid-drag
 * (tracking of the current focus stays).
 *
 * Profiles:
 * - **lunar** — cislunar arc (pad → ship → wide Earth coast → Moon)
 * - **flight13** — official Flight 13 X-replay cuts (pad aerial → ground
 *   track → booster hull / engine-bay through Super Heavy splash → ship
 *   hull / entry flap → splash chase → sea-level drone)
 */

import type { CameraMode } from "./modes";
import type { PhaseId } from "../physics/missionTypes";
import {
  PAD_AERIAL_AZ_DEG,
  PAD_AERIAL_EL_DEG,
  PAD_AERIAL_FOV,
  PAD_AERIAL_FRAME_SCALE,
  SPLASH_DRONE_AZ0_DEG,
  SPLASH_DRONE_ELEV_DEG,
  SPLASH_DRONE_FOV,
  SPLASH_DRONE_FRAME_SCALE,
  webcastShotAt,
  type WebcastMount,
  type WebcastShot,
} from "./webcastShots";

/** Which mission’s Auto-cam table to use. */
export type AutoCamProfile = "lunar" | "flight13";

/** Suggested focus when Auto-cam advances to a phase (or staging). */
export type AutoCamSuggestion = {
  mode: CameraMode;
  /** Zoom so the subject fills a comfortable fraction of the view. */
  frame: boolean;
  /**
   * Multiplier on the normal framed distance (e.g. wide Earth for cislunar
   * coast so both bodies can sit in frame).
   */
  frameScale?: number;
  /** ENU azimuth from east toward north (pad / chase pose). */
  azimuthDeg?: number;
  /** Elevation above the local horizon (pad / chase pose). */
  elevationDeg?: number;
  /** Earth-fixed pad camera that looks at the climbing stack. */
  padTrack?: boolean;
  /** Onboard mount override (hull / engine-bay / booster hull). */
  mount?: WebcastMount;
  chaseSubject?: "ship" | "booster";
  fov?: number;
  /** Sea-level drone orbit of a floating ship (Flight 13 post-splash). */
  droneTrack?: boolean;
};

type PhaseTable = Partial<Record<PhaseId, AutoCamSuggestion>>;

const CHASE: AutoCamSuggestion = { mode: "chase", frame: true };
const MOON: AutoCamSuggestion = { mode: "moon", frame: true };

/** Default framing for a mission phase (lunar / cislunar profile). */
const LUNAR_PHASE: PhaseTable = {
  launch: { mode: "starbase", frame: true },
  ascent: CHASE,
  lowEarthOrbit: CHASE,
  translunarInjection: CHASE,
  coast: { mode: "earth", frame: true, frameScale: 22 },
  approach: MOON,
  braking: MOON,
  descent: CHASE,
  landed: CHASE,
  entry: CHASE,
  splashdown: CHASE,
  impact: MOON,
};

/** Wider chase so dust plate + ship share the frame in the last ~30 s. */
export const LUNAR_FINALE_FRAME_SCALE = 1.45;
/** Mission-time window (s before landT) for the lunar finale widen. */
export const LUNAR_FINALE_WINDOW_S = 30;

/**
 * Chase frameScale for the last {@link LUNAR_FINALE_WINDOW_S} of lunar descent.
 * Returns null outside the window (callers must not cut).
 *
 * @param timeToLandS - `landT - missionT` (s)
 */
export function lunarFinaleChaseScale(timeToLandS: number): number | null {
  if (!Number.isFinite(timeToLandS) || timeToLandS > LUNAR_FINALE_WINDOW_S || timeToLandS < -8) {
    return null;
  }
  const u = 1 - Math.max(0, timeToLandS) / LUNAR_FINALE_WINDOW_S;
  return 1 + (LUNAR_FINALE_FRAME_SCALE - 1) * u;
}

/**
 * True when Auto-cam should fire the one-shot lunar finale widen
 * (crossing into the last 30 s of descent).
 */
export function lunarFinaleShouldCut(
  enabled: boolean,
  phase: PhaseId,
  timeToLandS: number,
  alreadyNudged: boolean,
): boolean {
  if (!enabled || alreadyNudged || phase !== "descent") return false;
  return lunarFinaleChaseScale(timeToLandS) != null;
}

/**
 * Chase look-ahead / look-down for terminal Auto-cam shots.
 * Identity when Auto-cam is off so Free orbit is not biased.
 */
export function finaleChaseBias(
  enabled: boolean,
  profile: AutoCamProfile,
  phase: PhaseId,
): { lookAheadScale: number; lookDownKm: number } {
  if (!enabled) return { lookAheadScale: 1, lookDownKm: 0 };
  if (profile === "flight13" && phase === "descent") {
    return { lookAheadScale: 1.18, lookDownKm: 0.08 };
  }
  if (profile === "flight13" && (phase === "splashdown" || phase === "landed")) {
    // Floating ship: look at the hull, not along heliocentric velocity.
    return { lookAheadScale: 0, lookDownKm: 0 };
  }
  if (profile === "lunar" && (phase === "descent" || phase === "landed")) {
    return { lookAheadScale: 1.1, lookDownKm: 0.06 };
  }
  return { lookAheadScale: 1, lookDownKm: 0 };
}

/**
 * Default framing for a mission phase (lunar / cislunar profile).
 *
 * | Phase            | Framing                         |
 * |------------------|---------------------------------|
 * | Launch           | Starbase pad                    |
 * | Ascent / low Earth orbit / translunar injection | Ship chase                    |
 * | Coast            | Wide Earth (cislunar overview)  |
 * | Approach / Lunar orbit insertion / low lunar orbit | Moon                        |
 * | Descent / land   | Ship chase                      |
 * | Impact           | Moon                            |
 */
export function autoCamForPhaseLunar(phase: PhaseId): AutoCamSuggestion {
  return LUNAR_PHASE[phase] ?? CHASE;
}

const FLIGHT13_PHASE: PhaseTable = {
  launch: {
    mode: "aerial",
    frame: true,
    frameScale: PAD_AERIAL_FRAME_SCALE,
    azimuthDeg: PAD_AERIAL_AZ_DEG,
    elevationDeg: PAD_AERIAL_EL_DEG,
    fov: PAD_AERIAL_FOV,
  },
  ascent: { mode: "starbase", frame: true, frameScale: 1.18, azimuthDeg: 198, elevationDeg: 8, padTrack: true },
  lowEarthOrbit: { mode: "hull", frame: true },
  translunarInjection: { mode: "hull", frame: true },
  coast: { mode: "hull", frame: true },
  entry: { mode: "hull", frame: true },
  descent: { mode: "hull", frame: true },
  splashdown: {
    mode: "drone",
    frame: true,
    frameScale: SPLASH_DRONE_FRAME_SCALE,
    azimuthDeg: SPLASH_DRONE_AZ0_DEG,
    elevationDeg: SPLASH_DRONE_ELEV_DEG,
    fov: SPLASH_DRONE_FOV,
    droneTrack: true,
  },
  landed: {
    mode: "drone",
    frame: true,
    frameScale: SPLASH_DRONE_FRAME_SCALE,
    azimuthDeg: SPLASH_DRONE_AZ0_DEG,
    elevationDeg: SPLASH_DRONE_ELEV_DEG,
    fov: SPLASH_DRONE_FOV,
    droneTrack: true,
  },
  approach: { mode: "hull", frame: true },
  braking: { mode: "hull", frame: true },
  impact: { mode: "hull", frame: true },
};

/**
 * Fallback Flight 13 phase table when no mission clock is available.
 * Live Auto-cam uses {@link webcastShotAt} instead (replay left-pane cuts).
 *
 * | Phase / beat | Framing |
 * |--------------|---------|
 * | Launch (incl. T− countdown) | Wide pad aerial |
 * | Ascent | Ground track, then booster hull |
 * | Staging | Engine-bay (left of hot-stage split) |
 * | Boostback / SH landing | Booster engines-down / hull (left pane) |
 * | Coast / landing | Ship hull-cam |
 * | Entry | Forward-flap cam (left of plasma split) |
 * | Splash | Aerial chase, then sea-level drone |
 */
export function autoCamForPhaseFlight13(phase: PhaseId): AutoCamSuggestion {
  return FLIGHT13_PHASE[phase] ?? CHASE;
}

/** Map a webcast still cut onto an Auto-cam suggestion. */
export function autoCamFromWebcastShot(shot: WebcastShot): AutoCamSuggestion {
  return {
    mode: shot.mode,
    frame: shot.frame,
    frameScale: shot.frameScale,
    azimuthDeg: shot.azimuthDeg,
    elevationDeg: shot.elevationDeg,
    padTrack: shot.padTrack,
    mount: shot.mount,
    chaseSubject: shot.chaseSubject,
    fov: shot.fov,
    droneTrack: shot.droneTrack,
  };
}

/** Default framing for a mission phase under the given profile. */
export function autoCamForPhase(
  phase: PhaseId,
  profile: AutoCamProfile = "lunar",
): AutoCamSuggestion {
  return profile === "flight13"
    ? autoCamForPhaseFlight13(phase)
    : autoCamForPhaseLunar(phase);
}

/** Close Ship chase when Super Heavy stages off (lunar / default). */
export function autoCamForStagingLunar(): AutoCamSuggestion {
  return { mode: "chase", frame: true };
}

/** Engine-bay (left of hot-stage split) on stage-out (Flight 13 webcast beat). */
export function autoCamForStagingFlight13(): AutoCamSuggestion {
  return { mode: "engines", frame: true, mount: "engines", fov: 72 };
}

/** Staging rising-edge cut for the active profile. */
export function autoCamForStaging(
  profile: AutoCamProfile = "lunar",
): AutoCamSuggestion {
  return profile === "flight13"
    ? autoCamForStagingFlight13()
    : autoCamForStagingLunar();
}

/** Previous Auto-cam markers (phase edge + Flight 13 webcast shot). */
export type AutoCamPrev = {
  phase: PhaseId | null;
  staged: boolean;
  shotKey?: string | null;
};

/**
 * Decide whether Auto-cam should cut on this tick.
 * Lunar: phase / staging edges. Flight 13 with `missionT`: webcast shot key.
 */
export function nextAutoCamCut(
  enabled: boolean,
  phase: PhaseId,
  staged: boolean,
  prev: AutoCamPrev,
  profile: AutoCamProfile = "lunar",
  missionT?: number,
): {
  suggestion: AutoCamSuggestion | null;
  phase: PhaseId;
  staged: boolean;
  shotKey: string | null;
} {
  const shotKey =
    profile === "flight13" && missionT != null ? webcastShotAt(missionT).key : null;
  if (!enabled) return { suggestion: null, phase, staged, shotKey };
  const suggestion = cutSuggestion(phase, staged, prev, profile, missionT, shotKey);
  return { suggestion, phase, staged, shotKey };
}

function cutSuggestion(
  phase: PhaseId,
  staged: boolean,
  prev: AutoCamPrev,
  profile: AutoCamProfile,
  missionT: number | undefined,
  shotKey: string | null,
): AutoCamSuggestion | null {
  if (profile === "flight13" && missionT != null && shotKey) {
    if (shotKey === prev.shotKey) return null;
    return autoCamFromWebcastShot(webcastShotAt(missionT));
  }
  if (prev.phase === null || phase !== prev.phase) {
    return autoCamForPhase(phase, profile);
  }
  if (staged && !prev.staged) return autoCamForStaging(profile);
  return null;
}
