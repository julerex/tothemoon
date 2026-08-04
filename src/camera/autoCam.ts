/**
 * Guided phase cameras (Auto-cam): map mission phase → default focus framing.
 *
 * Applied only on phase (or staging) transitions while Auto-cam is enabled.
 * Manual camera picks, WASD pan, and mouse orbit disable Auto-cam so Free
 * orbit is never fought mid-drag.
 */

import type { CameraMode } from "./modes";
import type { PhaseId } from "../physics/missionTypes";

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
 * Default framing for a mission phase.
 *
 * | Phase            | Framing                         |
 * |------------------|---------------------------------|
 * | Launch           | Starbase pad                    |
 * | Ascent / low Earth orbit / translunar injection | Ship chase                    |
 * | Coast            | Wide Earth (cislunar overview)  |
 * | Approach / Lunar orbit insertion / low lunar orbit | Moon                        |
 * | Descent / landed | Ship chase                      |
 * | Impact           | Moon                            |
 */
export function autoCamForPhase(phase: PhaseId): AutoCamSuggestion {
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
      return { mode: "chase", frame: true };
    case "impact":
      return { mode: "moon", frame: true };
  }
}

/** Close Ship chase when Super Heavy stages off (theater beat). */
export function autoCamForStaging(): AutoCamSuggestion {
  return { mode: "chase", frame: true };
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
): { suggestion: AutoCamSuggestion | null; phase: PhaseId; staged: boolean } {
  if (!enabled) {
    return { suggestion: null, phase, staged };
  }

  if (prev.phase === null || phase !== prev.phase) {
    return {
      suggestion: autoCamForPhase(phase),
      phase,
      staged,
    };
  }

  if (staged && !prev.staged) {
    return {
      suggestion: autoCamForStaging(),
      phase,
      staged,
    };
  }

  return { suggestion: null, phase, staged };
}
