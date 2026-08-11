/**
 * Guided phase cameras (Auto-cam): map mission phase → default focus framing.
 *
 * Applied only on phase (or staging) transitions while Auto-cam is enabled.
 * Manual camera picks, WASD pan, and mouse orbit disable Auto-cam so guided
 * cuts do not fight user framing mid-drag (tracking of the current focus stays).
 *
 * Profiles:
 * - **lunar** — cislunar arc (pad → ship → wide Earth coast → Moon)
 * - **flight13** — webcast-style flight test (trench → ship → booster at sep → entry chase)
 */

import type { CameraMode } from "./modes";
import type { PhaseId } from "../physics/missionTypes";

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
};

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
  switch (phase) {
    case "launch":
      return { mode: "starbase", frame: true };
    case "ascent":
    case "lowEarthOrbit":
    case "translunarInjection":
      return { mode: "chase", frame: true };
    case "coast":
      // Pull back past a full-Earth frame so the Moon path stays readable.
      return { mode: "earth", frame: true, frameScale: 22 };
    case "approach":
    case "braking":
      return { mode: "moon", frame: true };
    case "descent":
    case "landed":
    case "entry":
    case "splashdown":
      return { mode: "chase", frame: true };
    case "impact":
      return { mode: "moon", frame: true };
  }
}

/**
 * Flight 13 / suborbital flight-test Auto-cam table (webcast beats).
 *
 * | Phase / beat | Framing |
 * |--------------|---------|
 * | Launch (incl. T− countdown) | Flame trench (engines) |
 * | Ascent | Starship chase |
 * | Staging | Booster grid-fin cam |
 * | Coast | Ship chase (suborbital; stay with stack) |
 * | Entry / descent / splash | Starship chase |
 */
export function autoCamForPhaseFlight13(phase: PhaseId): AutoCamSuggestion {
  switch (phase) {
    case "launch":
      return { mode: "trench", frame: true };
    case "ascent":
    case "lowEarthOrbit":
    case "translunarInjection":
      return { mode: "chase", frame: true };
    case "coast":
      // Suborbital free-coast: keep ship framed (not a cislunar Earth pull-back).
      return { mode: "chase", frame: true, frameScale: 1.35 };
    case "entry":
    case "descent":
    case "splashdown":
    case "landed":
      return { mode: "chase", frame: true };
    case "approach":
    case "braking":
    case "impact":
      // Unused on Flight 13; sane fallbacks
      return { mode: "chase", frame: true };
  }
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

/** Booster grid-fin cam on stage-out (Flight 13 webcast beat). */
export function autoCamForStagingFlight13(): AutoCamSuggestion {
  return { mode: "gridfin", frame: true };
}

/** Staging rising-edge cut for the active profile. */
export function autoCamForStaging(
  profile: AutoCamProfile = "lunar",
): AutoCamSuggestion {
  return profile === "flight13"
    ? autoCamForStagingFlight13()
    : autoCamForStagingLunar();
}

/**
 * Decide whether Auto-cam should cut on this tick.
 * Tracks last phase / staged edge so callers stay stateless about “what changed”.
 */
export function nextAutoCamCut(
  enabled: boolean,
  phase: PhaseId,
  staged: boolean,
  prev: { phase: PhaseId | null; staged: boolean },
  profile: AutoCamProfile = "lunar",
): { suggestion: AutoCamSuggestion | null; phase: PhaseId; staged: boolean } {
  if (!enabled) {
    return { suggestion: null, phase, staged };
  }

  if (prev.phase === null || phase !== prev.phase) {
    return {
      suggestion: autoCamForPhase(phase, profile),
      phase,
      staged,
    };
  }

  if (staged && !prev.staged) {
    return {
      suggestion: autoCamForStaging(profile),
      phase,
      staged,
    };
  }

  return { suggestion: null, phase, staged };
}
