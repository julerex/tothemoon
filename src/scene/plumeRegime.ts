/**
 * Theater-grade plume look by flight regime.
 *
 * Pure helpers (no THREE) so scrub-safe burn FX stay unit-tested and shared
 * by craft stack, hot-stage dual plumes, and detached-booster recovery.
 *
 * ## Pattern
 *
 * ```
 * phase + kind + opts  →  plumeRegimeFor()  →  plumeLook()
 * missionT / lag        →  plumeThrustLag() / plumeGimbalOffset()
 *                              ↓
 *                    craft.applyPlumeLayers  (THREE)
 * ```
 *
 * Not CFD: opacity/scale tables for watchability. Atmosphere = denser/tighter;
 * vacuum = wider/sparser; LOI and landing get distinct ship beats.
 *
 * @see padLaunchFx — same pure-FX style for Starbase pad
 */

/** Which stage owns the plume. */
export type PlumeKind = "booster" | "ship";

/**
 * Visual regime for a burn.
 * - atmosphere — dense air (pad / ascent)
 * - vacuum — LEO / TLI / coast relights
 * - loi — lunar orbit insertion (`approach`)
 * - landing — powered descent / soft land
 * - hotStage — ship side of dual-plume window
 * - boostback — detached Super Heavy reverse burn
 */
export type PlumeRegimeId =
  | "atmosphere"
  | "vacuum"
  | "loi"
  | "landing"
  | "hotStage"
  | "boostback";

/** Multipliers and colors applied on top of thrust-normalized base scales. */
export type PlumeLook = {
  /** Radial width mult (1 = baseline). */
  radial: number;
  /** Along-plume stretch mult (sprite Y). */
  length: number;
  /** Opacity mult. */
  opacity: number;
  /** Core RGB 0–1. */
  core: readonly [number, number, number];
  /** Outer rim RGB 0–1. */
  rim: readonly [number, number, number];
  /** Point-light intensity mult. */
  lightI: number;
  /** Point-light distance mult. */
  lightDist: number;
  /** Light RGB 0–1. */
  light: readonly [number, number, number];
};

export type PlumeRegimeOpts = {
  /** Hot-stage pre-sep ramp in [0, 1] (ship lighting before sep). */
  hotPre?: number;
  staged?: boolean;
  /** Altitude above Earth (km); atmosphere cue when phase is ambiguous. */
  altEarthKm?: number;
  /**
   * Detached-booster recovery phase from StagingFx
   * (`boostback` | `landing` | …).
   */
  recoveryPhase?: string;
};

/** Karman-line class gate for atmosphere vs vacuum when phase is vague. */
const ATMO_ALT_KM = 80;

/**
 * Pick a plume regime from mission phase + stage context.
 *
 * Scrub-safe: pure function of sample fields (no wall-clock). Order of
 * precedence: detached recovery phase → ship hot-stage pre-sep → phase map →
 * altitude fallback for ambiguous coasts.
 *
 * @param phase - Timeline phase id, or `undefined` for recovery-only booster
 * @param kind - Booster vs ship palette / rules
 * @param opts - Hot-stage ramp, staged flag, altitude, recovery phase
 */
export function plumeRegimeFor(
  phase: string | undefined,
  kind: PlumeKind,
  opts: PlumeRegimeOpts = {},
): PlumeRegimeId {
  const hotPre = opts.hotPre ?? 0;
  const staged = opts.staged ?? false;
  const alt = opts.altEarthKm;
  const recovery = opts.recoveryPhase;

  // Detached Super Heavy recovery path
  if (kind === "booster" && recovery) {
    if (recovery === "landing" || recovery === "caught") return "landing";
    if (recovery === "boostback") return "boostback";
  }

  // Ship lights during hot-stage pre-sep
  if (kind === "ship" && !staged && hotPre > 0.02) return "hotStage";

  if (phase === "launch" || phase === "ascent") return "atmosphere";
  if (phase === "approach") return "loi";
  if (
    phase === "descent" ||
    phase === "braking" ||
    phase === "landed" ||
    phase === "splashdown"
  ) {
    return "landing";
  }
  if (
    phase === "translunarInjection" ||
    phase === "lowEarthOrbit" ||
    phase === "coast" ||
    phase === "entry"
  ) {
    return "vacuum";
  }

  // Altitude fallback (prelaunch / unknown phase)
  if (kind === "booster") {
    if (alt != null && Number.isFinite(alt) && alt < ATMO_ALT_KM) {
      return "atmosphere";
    }
    return "atmosphere";
  }

  if (alt != null && Number.isFinite(alt) && alt < ATMO_ALT_KM) {
    return "atmosphere";
  }
  return "vacuum";
}

const BOOSTER_ATMO: PlumeLook = {
  radial: 0.85,
  length: 0.9,
  opacity: 1.15,
  core: [1.0, 0.88, 0.72],
  rim: [1.0, 0.45, 0.18],
  lightI: 1.05,
  lightDist: 0.9,
  light: [1.0, 0.58, 0.32],
};

const BOOSTER_VACUUM: PlumeLook = {
  radial: 1.35,
  length: 1.45,
  opacity: 0.72,
  core: [1.0, 0.82, 0.65],
  rim: [1.0, 0.4, 0.22],
  lightI: 0.85,
  lightDist: 1.15,
  light: [1.0, 0.55, 0.35],
};

const BOOSTER_BOOSTBACK: PlumeLook = {
  radial: 1.05,
  length: 1.1,
  opacity: 0.95,
  core: [1.0, 0.85, 0.7],
  rim: [1.0, 0.5, 0.22],
  lightI: 0.95,
  lightDist: 1.0,
  light: [1.0, 0.6, 0.35],
};

const BOOSTER_LANDING: PlumeLook = {
  radial: 0.75,
  length: 0.7,
  opacity: 1.05,
  core: [1.0, 0.9, 0.78],
  rim: [1.0, 0.55, 0.28],
  lightI: 0.9,
  lightDist: 0.85,
  light: [1.0, 0.63, 0.38],
};

const SHIP_VACUUM: PlumeLook = {
  radial: 1.4,
  length: 1.55,
  opacity: 0.7,
  core: [0.92, 0.97, 1.0],
  rim: [0.35, 0.7, 1.0],
  lightI: 0.9,
  lightDist: 1.2,
  light: [0.53, 0.8, 1.0],
};

const SHIP_ATMO: PlumeLook = {
  radial: 0.9,
  length: 0.95,
  opacity: 1.05,
  core: [0.95, 0.98, 1.0],
  rim: [0.45, 0.75, 1.0],
  lightI: 1.0,
  lightDist: 0.95,
  light: [0.55, 0.82, 1.0],
};

const SHIP_LOI: PlumeLook = {
  // Stronger visual beat for capture burn
  radial: 1.55,
  length: 1.75,
  opacity: 0.95,
  core: [0.95, 0.98, 1.0],
  rim: [0.4, 0.78, 1.0],
  lightI: 1.35,
  lightDist: 1.35,
  light: [0.55, 0.85, 1.0],
};

const SHIP_LANDING: PlumeLook = {
  radial: 0.8,
  length: 0.75,
  opacity: 1.1,
  core: [1.0, 0.95, 0.88],
  rim: [0.7, 0.85, 1.0],
  lightI: 1.05,
  lightDist: 0.9,
  light: [0.75, 0.88, 1.0],
};

const SHIP_HOT: PlumeLook = {
  radial: 1.05,
  length: 1.15,
  opacity: 0.9,
  core: [0.9, 0.96, 1.0],
  rim: [0.4, 0.72, 1.0],
  lightI: 1.1,
  lightDist: 1.05,
  light: [0.53, 0.8, 1.0],
};

/**
 * Regime → look table. Booster and ship palettes differ (methane orange vs
 * blue-white Raptor vacuum).
 *
 * @param regime - From {@link plumeRegimeFor}
 * @param kind - Selects booster vs ship constant tables
 * @returns Multipliers + RGB triples applied on top of thrust-normalized bases
 */
export function plumeLook(regime: PlumeRegimeId, kind: PlumeKind): PlumeLook {
  if (kind === "booster") {
    switch (regime) {
      case "atmosphere":
        return BOOSTER_ATMO;
      case "vacuum":
        return BOOSTER_VACUUM;
      case "boostback":
        return BOOSTER_BOOSTBACK;
      case "landing":
        return BOOSTER_LANDING;
      case "loi":
      case "hotStage":
        // Booster rarely in these; fall back sensibly
        return regime === "loi" ? BOOSTER_VACUUM : BOOSTER_ATMO;
      default:
        return BOOSTER_ATMO;
    }
  }

  switch (regime) {
    case "atmosphere":
      return SHIP_ATMO;
    case "vacuum":
      return SHIP_VACUUM;
    case "loi":
      return SHIP_LOI;
    case "landing":
      return SHIP_LANDING;
    case "hotStage":
      return SHIP_HOT;
    case "boostback":
      return SHIP_VACUUM;
    default:
      return SHIP_VACUUM;
  }
}

/**
 * Scrub-safe thrust lag for mechanical feel.
 *
 * When mission time advances smoothly, `lag` eases toward `target` with time
 * constant `tauS`. On scrub jumps (rewind or big forward skip) snap to target
 * so the plume never trails a past scrub position.
 *
 * @returns updated lag in the same units as `target` (usually thrust fraction)
 */
export function plumeThrustLag(
  prevLag: number,
  target: number,
  prevT: number,
  missionT: number,
  tauS = 0.18,
): number {
  const dt = missionT - prevT;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.55 || !Number.isFinite(prevLag)) {
    return target;
  }
  const a = 1 - Math.exp(-dt / Math.max(tauS, 1e-3));
  return prevLag + (target - prevLag) * a;
}

/**
 * Tiny deterministic gimbal wobble (radians-ish xy in mesh units).
 * Outer plume layers use a larger mult so the stack feels mechanical.
 */
export function plumeGimbalOffset(
  missionT: number,
  layer = 0,
): { x: number; y: number } {
  const t = missionT;
  const amp = 0.004 + layer * 0.0025;
  return {
    x:
      amp *
      (Math.sin(t * 2.7 + layer * 0.9) + 0.35 * Math.sin(t * 5.1 + 1.2)),
    y:
      amp *
      (Math.cos(t * 2.1 + layer * 1.1) + 0.3 * Math.sin(t * 4.3 + 0.4)),
  };
}
