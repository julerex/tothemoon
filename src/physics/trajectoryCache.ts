/**
 * Baked / runtime mission trajectory: pure load, sample, and trail helpers.
 *
 * Packs are immutable after {@link makeTrajectory}. Sampling is a pure function
 * of (trajectory, t) + ephemeris epoch — no class instance methods required.
 */

import { R_EARTH, R_MOON } from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { makeFlight13Epoch } from "./flight13Epoch";
import { makeLunarEpoch } from "./missionEpoch";
import { hasHorizonsTable } from "./horizonsEpoch";
import {
  phaseLabel,
  runMission,
  type MissionResult,
  type PhaseId,
  type Sample,
} from "./mission";
import {
  buildCoastCorridor,
  computeKeplerRefMaxDevKm,
  type CoastCorridor,
} from "./coastCorridor";
import { resolveTrajectoryMeta } from "./trajectoryMeta";
import { len, type V3, v3 } from "./vec3";
import packedTrajectory from "../data/trajectory.json";
import packedFlight13 from "../data/flight13-trajectory.json";
import { runFlight13Mission } from "./flight13Mission";

export type FrameState = {
  t: number;
  pos: V3;
  vel: V3;
  phase: PhaseId;
  phaseLabel: string;
  burning: boolean;
  speed: number;
  altMoon: number;
  altEarth: number;
  distMoon: number;
  /** Booster propellant remaining (0–1) */
  fuelBooster: number;
  /** Ship propellant remaining (0–1) */
  fuelShip: number;
  /** Thrust force (N) */
  thrustN: number;
  /** True after booster stage-out */
  staged: boolean;
};

/**
 * Immutable mission trail + meta after unpack / integrate.
 * Prefer free functions: {@link sampleAtTime}, {@link trailPoints}, etc.
 */
export type Trajectory = Readonly<{
  samples: Sample[];
  durationS: number;
  ok: boolean;
  message: string;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  minMoonAlt: number;
  /** Peak inertial |v| (km/s) — from pack meta when present */
  peakSpeedKmS: number;
  /** Mission time (s) of booster stage-out, or null */
  stageT: number | null;
  /** Peak |r_nbody − r_kepler| on Translunar injection coast (km) */
  keplerRefMaxDevKm: number;
  /** Horizons τ=0 mission time used when samples were baked. */
  horizonsLandingT: number;
  /** Explicit ephemeris matching the bake (lunar Horizons or Flight 13). */
  epoch: EphemerisEpoch;
}>;

/** Build-time packed format (see scripts/precompute-trajectory.ts). */
export type PackedTrajectory = {
  version: number;
  moonPhase0: number;
  /** Preferred pack field name */
  translunarInjectionDeltaV?: number;
  /** Legacy pack field (pre–full-term rename) */
  tliDv?: number;
  durationS: number;
  horizonsLandingT?: number;
  ok: boolean;
  message: string;
  /** v1+ — prefer packed value; do not re-scan when finite */
  minMoonAlt?: number;
  /** v2+ peak inertial |v| (km/s) */
  peakSpeedKmS?: number;
  /** v2+ mission time of stage-out (s), or null */
  stageT?: number | null;
  /** Peak |r_nbody − r_kepler| on translunar coast (km) */
  keplerRefMaxDevKm?: number;
  samples: Array<{
    t: number;
    p: number[];
    v: number[];
    phase: string;
    burning: boolean;
    fb?: number;
    fs?: number;
    th?: number;
    st?: boolean;
  }>;
};

/** Ephemeris for a packed / computed mission result (lunar or Flight 13). */
export function epochFromResult(result: {
  moonPhase0: number;
  horizonsLandingT?: number;
  durationS: number;
  message?: string;
}): EphemerisEpoch {
  const landT =
    result.horizonsLandingT != null && Number.isFinite(result.horizonsLandingT)
      ? result.horizonsLandingT
      : result.durationS;
  // Flight 13: short suborbital duration + splash copy (not landT — lunar maps can be negative)
  const isFlight13 =
    (result.message != null &&
      (/Flight 13/i.test(result.message) ||
        /suborbital/i.test(result.message) ||
        /splashdown/i.test(result.message))) ||
    result.durationS < 20_000;
  if (isFlight13) {
    return makeFlight13Epoch(result.moonPhase0, landT);
  }
  return makeLunarEpoch(result.moonPhase0, landT, hasHorizonsTable());
}

/** Map legacy phase ids (leo/tli) to full terms. */
export function normalizePhaseId(phase: string): PhaseId {
  if (phase === "leo") return "lowEarthOrbit";
  if (phase === "tli") return "translunarInjection";
  return phase as PhaseId;
}

/** Unpack a JSON pack into a {@link MissionResult} (samples + meta). */
export function unpackPackedTrajectory(
  packed: PackedTrajectory,
): MissionResult {
  const samples = packed.samples.map((s) => ({
    t: s.t,
    pos: { x: s.p[0]!, y: s.p[1]!, z: s.p[2]! },
    vel: { x: s.v[0]!, y: s.v[1]!, z: s.v[2]! },
    phase: normalizePhaseId(s.phase),
    burning: s.burning,
    fuelBooster: s.fb ?? 0,
    fuelShip: s.fs ?? 1,
    thrustN: (s.th ?? 0) * 1000, // kN → N
    // Infer staged if missing: booster empty and not still in pad/ascent
    staged:
      s.st ??
      (s.phase !== "launch" && s.phase !== "ascent" && (s.fb ?? 0) < 1e-6),
  }));
  const provisional = {
    moonPhase0: packed.moonPhase0,
    horizonsLandingT: packed.horizonsLandingT,
    durationS: packed.durationS,
    message: packed.message,
  };
  const epoch = epochFromResult(provisional);
  const meta = resolveTrajectoryMeta(
    {
      minMoonAlt: packed.minMoonAlt,
      peakSpeedKmS: packed.peakSpeedKmS,
      stageT: packed.stageT,
    },
    samples,
    epoch,
  );
  const keplerRefMaxDevKm =
    packed.keplerRefMaxDevKm != null && Number.isFinite(packed.keplerRefMaxDevKm)
      ? packed.keplerRefMaxDevKm
      : computeKeplerRefMaxDevKm(samples, epoch);

  const translunarInjectionDeltaV =
    packed.translunarInjectionDeltaV ?? packed.tliDv ?? 0;

  return {
    moonPhase0: packed.moonPhase0,
    translunarInjectionDeltaV,
    durationS: packed.durationS,
    horizonsLandingT: packed.horizonsLandingT,
    ok: packed.ok,
    message: packed.message,
    minMoonAlt: meta.minMoonAlt,
    peakSpeedKmS: meta.peakSpeedKmS,
    stageT: meta.stageT,
    keplerRefMaxDevKm,
    samples,
  };
}

/**
 * Build an immutable {@link Trajectory} from a mission result (bake or recompute).
 */
export function makeTrajectory(result: MissionResult): Trajectory {
  const durationS = Math.max(result.durationS, 1);
  const horizonsLandingT =
    result.horizonsLandingT != null && Number.isFinite(result.horizonsLandingT)
      ? result.horizonsLandingT
      : durationS;
  const epoch = epochFromResult({
    moonPhase0: result.moonPhase0,
    horizonsLandingT,
    durationS,
    message: result.message,
  });
  const meta = resolveTrajectoryMeta(
    {
      minMoonAlt: result.minMoonAlt,
      peakSpeedKmS: result.peakSpeedKmS,
      stageT: result.stageT,
    },
    result.samples,
    epoch,
  );
  const keplerRefMaxDevKm =
    result.keplerRefMaxDevKm != null &&
    Number.isFinite(result.keplerRefMaxDevKm)
      ? result.keplerRefMaxDevKm
      : computeKeplerRefMaxDevKm(result.samples, epoch);

  return Object.freeze({
    samples: result.samples,
    durationS,
    ok: result.ok,
    message: result.message,
    moonPhase0: result.moonPhase0,
    translunarInjectionDeltaV: result.translunarInjectionDeltaV,
    horizonsLandingT,
    epoch,
    minMoonAlt: meta.minMoonAlt,
    peakSpeedKmS: meta.peakSpeedKmS,
    stageT: meta.stageT,
    keplerRefMaxDevKm,
  });
}

/** Load baked lunar trajectory. Instant — no RK4 on the main thread. */
export function loadPrecomputedTrajectory(): Trajectory {
  const result = unpackPackedTrajectory(
    packedTrajectory as unknown as PackedTrajectory,
  );
  console.info(
    `[tothemoon] Loaded precomputed trajectory — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 3600).toFixed(2)} h`,
  );
  return makeTrajectory(result);
}

/** Load baked Flight 13 trajectory pack. */
export function loadFlight13Trajectory(): Trajectory {
  const result = unpackPackedTrajectory(
    packedFlight13 as unknown as PackedTrajectory,
  );
  console.info(
    `[flight13] Loaded precomputed trajectory — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 60).toFixed(1)} min`,
  );
  return makeTrajectory(result);
}

/** Re-run lunar integration in the browser (slow). Use `?recompute=1`. */
export function computeLunarTrajectory(): Trajectory {
  const t0 = performance.now();
  const result = runMission();
  console.info(
    `[tothemoon] Runtime recompute ${(performance.now() - t0).toFixed(0)}ms — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 3600).toFixed(2)} h`,
  );
  return makeTrajectory(result);
}

/** Re-run Flight 13 integration in the browser (slow). Use `?recompute=1`. */
export function computeFlight13Trajectory(): Trajectory {
  const t0 = performance.now();
  const epoch = makeFlight13Epoch(0, 0);
  const result = runFlight13Mission({ epoch });
  console.info(
    `[flight13] Runtime recompute ${(performance.now() - t0).toFixed(0)}ms — ${result.message}, ${result.samples.length} samples`,
  );
  return makeTrajectory(result);
}

/**
 * Kepler-vs-n-body coast corridor for scene overlays.
 * Null when the pack has no post-Translunar injection coast.
 */
export function trajectoryCoastCorridor(traj: Trajectory): CoastCorridor | null {
  let corridor = buildCoastCorridor(traj.samples, 480, traj.epoch);
  if (corridor && traj.keplerRefMaxDevKm > corridor.maxDevKm) {
    corridor = {
      ...corridor,
      maxDevKm: traj.keplerRefMaxDevKm,
    };
  }
  return corridor;
}

/** Normalized progress u ∈ [0,1] → interpolated frame. */
export function sampleAtProgress(traj: Trajectory, u: number): FrameState {
  const t = Math.min(1, Math.max(0, u)) * traj.durationS;
  return sampleAtTime(traj, t);
}

/** Mission time (s) → linearly interpolated frame + live body altitudes. */
export function sampleAtTime(traj: Trajectory, t: number): FrameState {
  const s = traj.samples;
  if (s.length === 0) {
    return emptyFrame();
  }

  if (t <= s[0]!.t) return frameFromSample(s[0]!, traj.epoch);
  if (t >= s[s.length - 1]!.t) {
    return frameFromSample(s[s.length - 1]!, traj.epoch);
  }

  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.t <= t) lo = mid;
    else hi = mid;
  }

  const a = s[lo]!;
  const b = s[hi]!;
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;

  const pos = v3(
    a.pos.x + (b.pos.x - a.pos.x) * f,
    a.pos.y + (b.pos.y - a.pos.y) * f,
    a.pos.z + (b.pos.z - a.pos.z) * f,
  );
  const vel = v3(
    a.vel.x + (b.vel.x - a.vel.x) * f,
    a.vel.y + (b.vel.y - a.vel.y) * f,
    a.vel.z + (b.vel.z - a.vel.z) * f,
  );

  const phase = f < 0.5 ? a.phase : b.phase;
  const burning = a.burning || b.burning;
  const fuelBooster = a.fuelBooster + (b.fuelBooster - a.fuelBooster) * f;
  const fuelShip = a.fuelShip + (b.fuelShip - a.fuelShip) * f;
  const thrustN = a.thrustN + (b.thrustN - a.thrustN) * f;
  // Switch at mid-span so scrubbing across stage-out is stable
  const staged = f < 0.5 ? a.staged : b.staged;
  return makeFrame(
    t,
    pos,
    vel,
    phase,
    burning,
    fuelBooster,
    fuelShip,
    thrustN,
    staged,
    traj.epoch,
  );
}

/** Positions for trail rendering (optionally decimated). */
export function trailPoints(traj: Trajectory, max = 1200): V3[] {
  const s = traj.samples;
  if (s.length <= max) return s.map((x) => ({ ...x.pos }));
  const out: V3[] = [];
  const step = (s.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push({ ...s[Math.round(i * step)]!.pos });
  }
  return out;
}

function emptyFrame(): FrameState {
  return {
    t: 0,
    pos: v3(),
    vel: v3(),
    phase: "lowEarthOrbit",
    phaseLabel: phaseLabel("lowEarthOrbit"),
    burning: false,
    speed: 0,
    altMoon: 0,
    altEarth: 0,
    distMoon: 0,
    fuelBooster: 0,
    fuelShip: 1,
    thrustN: 0,
    staged: true,
  };
}

function frameFromSample(s: Sample, epoch: EphemerisEpoch): FrameState {
  return makeFrame(
    s.t,
    s.pos,
    s.vel,
    s.phase,
    s.burning,
    s.fuelBooster,
    s.fuelShip,
    s.thrustN,
    s.staged,
    epoch,
  );
}

function makeFrame(
  t: number,
  pos: V3,
  vel: V3,
  phase: PhaseId,
  burning: boolean,
  fuelBooster: number,
  fuelShip: number,
  thrustN: number,
  staged: boolean,
  epoch: EphemerisEpoch,
): FrameState {
  const b = bodyPositions(t, epoch);
  const dxM = pos.x - b.moon.x;
  const dyM = pos.y - b.moon.y;
  const dzM = pos.z - b.moon.z;
  const distMoon = Math.hypot(dxM, dyM, dzM);
  const dxE = pos.x - b.earth.x;
  const dyE = pos.y - b.earth.y;
  const dzE = pos.z - b.earth.z;
  const distEarth = Math.hypot(dxE, dyE, dzE);
  return {
    t,
    pos: { x: pos.x, y: pos.y, z: pos.z },
    vel: { x: vel.x, y: vel.y, z: vel.z },
    phase,
    phaseLabel: phaseLabel(phase),
    burning,
    speed: len(vel),
    altMoon: distMoon - R_MOON,
    altEarth: distEarth - R_EARTH,
    distMoon,
    fuelBooster,
    fuelShip,
    thrustN,
    staged,
  };
}

function isTrajectory(value: MissionResult | Trajectory): value is Trajectory {
  return (
    typeof value === "object" &&
    value != null &&
    "epoch" in value &&
    (value as Trajectory).epoch != null &&
    typeof (value as Trajectory).epoch === "object"
  );
}

/**
 * Thin object facade over pure trajectory helpers (same call shape as the old class).
 * Prefer free functions + {@link Trajectory} for new code.
 */
export class TrajectoryCache {
  readonly samples: Sample[];
  readonly durationS: number;
  readonly ok: boolean;
  readonly message: string;
  readonly moonPhase0: number;
  readonly translunarInjectionDeltaV: number;
  readonly minMoonAlt: number;
  readonly peakSpeedKmS: number;
  readonly stageT: number | null;
  readonly keplerRefMaxDevKm: number;
  readonly horizonsLandingT: number;
  readonly epoch: EphemerisEpoch;
  private readonly traj: Trajectory;
  private _corridor: CoastCorridor | null | undefined;

  constructor(result: MissionResult | Trajectory) {
    const t = isTrajectory(result) ? result : makeTrajectory(result);
    this.traj = t;
    this.samples = t.samples;
    this.durationS = t.durationS;
    this.ok = t.ok;
    this.message = t.message;
    this.moonPhase0 = t.moonPhase0;
    this.translunarInjectionDeltaV = t.translunarInjectionDeltaV;
    this.minMoonAlt = t.minMoonAlt;
    this.peakSpeedKmS = t.peakSpeedKmS;
    this.stageT = t.stageT;
    this.keplerRefMaxDevKm = t.keplerRefMaxDevKm;
    this.horizonsLandingT = t.horizonsLandingT;
    this.epoch = t.epoch;
  }

  /** Underlying pure trajectory data. */
  asTrajectory(): Trajectory {
    return this.traj;
  }

  getCoastCorridor(): CoastCorridor | null {
    if (this._corridor === undefined) {
      this._corridor = trajectoryCoastCorridor(this.traj);
    }
    return this._corridor;
  }

  static loadPrecomputed(): TrajectoryCache {
    return new TrajectoryCache(loadPrecomputedTrajectory());
  }

  static loadFlight13(): TrajectoryCache {
    return new TrajectoryCache(loadFlight13Trajectory());
  }

  static compute(): TrajectoryCache {
    return new TrajectoryCache(computeLunarTrajectory());
  }

  static computeFlight13(): TrajectoryCache {
    return new TrajectoryCache(computeFlight13Trajectory());
  }

  sampleAtProgress(u: number): FrameState {
    return sampleAtProgress(this.traj, u);
  }

  sampleAtTime(t: number): FrameState {
    return sampleAtTime(this.traj, t);
  }

  trailPoints(max = 1200): V3[] {
    return trailPoints(this.traj, max);
  }
}
