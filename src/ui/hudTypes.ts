/**
 * HUD runtime types. {@link bindHud} in hud.ts is the public entry.
 */

import type { CameraMode } from "../camera/modes";
import type { CinematicBookmark } from "../mission/bookmarks";
import type { NewsBeat } from "../mission/newsTicker";
import type { ScrubEventTick } from "../mission/scrubEvents";
import type { MissionTimeline } from "../mission/timeline";
import type {
  BoosterRecoveryKeyframe,
  RecoveryProfile,
  StageState,
} from "../physics/boosterRecovery";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import type { PhaseId } from "../physics/mission";
import type { ReadonlySample } from "../physics/missionTypes";
import type { CrossSectionModel } from "./crossSection";
import type { HudDom, MetricsDom } from "./hudDom";

export type HudHandlers = {
  onPlayToggle: () => void;
  /** Playback speed multiplier (1, 10, …) */
  onSpeedMode: (rate: number) => void;
  /** `,` / `.` — step playback speed down / up through fixed presets */
  onSpeedNudge: (dir: -1 | 1) => number;
  onScrub: (t: number) => void;
  onCamera: (mode: CameraMode) => void;
  /**
   * Focus + size-relative zoom (double-tap number keys).
   * Falls back to onCamera when omitted.
   */
  onCameraFrame?: (mode: CameraMode) => void;
  /** Q/E yaw about the mode axis, R/F pitch, C/V view-axis roll (hold) */
  onOrbitKey: (
    key: "q" | "e" | "r" | "f" | "c" | "v",
    down: boolean,
  ) => CameraMode;
  /** WASD — pan (hold) */
  onPanKey: (key: "w" | "a" | "s" | "d", down: boolean) => CameraMode;
  /** Z/X — zoom in/out (hold) */
  onZoomKey: (key: "z" | "x", down: boolean) => CameraMode;
  /** L — toggle scene labels (Earth, Moon, Starship, poles, …) */
  onToggleLabels?: () => boolean;
  /** O — toggle orbit overlays (grids, Moon path, craft trail, ground track) */
  onToggleOrbits?: () => boolean;
  /**
   * Toggle guided phase cameras. Returns the new enabled state.
   * Default on; manual camera picks and mouse orbit turn it off.
   */
  onAutoCamToggle?: () => boolean;
  /**
   * Cinematic bookmark: seek + guided camera. Does not count as a manual
   * focus pick (Auto-cam stays on).
   */
  onBookmark?: (bookmark: CinematicBookmark) => void;
};

export type HudFlags = {
  scrubbing: boolean;
  lastPhase: PhaseId | null;
  lastPlaying: boolean;
  completeShown: boolean;
  keymapOpen: boolean;
  metricsOpen: boolean;
  crossSectionOpen: boolean;
  hudVisible: boolean;
  lastCamMode: CameraMode;
  autoCamEnabled: boolean;
  labelsEnabled: boolean;
  orbitsEnabled: boolean;
  lastCamKey: string | null;
  lastCamKeyT: number;
  lastNewsId: string | null;
  lastNewsRate: number;
};

export type HudData = {
  timeline: MissionTimeline;
  handlers: HudHandlers;
  samples: readonly ReadonlySample[];
  recoveryProfile: RecoveryProfile;
  bookmarks: CinematicBookmark[];
  scrubEventTicks: ScrubEventTick[];
  newsBeats: NewsBeat[];
  stageState: StageState | null;
  crossModel: CrossSectionModel | null;
  boosterKeyframes: BoosterRecoveryKeyframe[] | null;
  epoch: EphemerisEpoch;
};

export type HudRuntime = {
  dom: HudDom;
  mx: MetricsDom;
  flags: HudFlags;
  data: HudData;
};
