/**
 * Baked / runtime mission trajectory: pure load, sample, and trail helpers.
 *
 * Packs are frozen by {@link makeTrajectory}. Everything here is a free function
 * of (trajectory, t) + ephemeris epoch, so a trajectory is plain data that
 * callers pass around rather than an object with behavior.
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

function landTFromResult(result: {
  horizonsLandingT?: number;
  durationS: number;
}): number {
  return result.horizonsLandingT != null && Number.isFinite(result.horizonsLandingT)
    ? result.horizonsLandingT
    : result.durationS;
}

function isFlight13Result(result: { message?: string; durationS: number }): boolean {
  return (
    (result.message != null &&
      (/Flight 13/i.test(result.message) ||
        /suborbital/i.test(result.message) ||
        /splashdown/i.test(result.message))) ||
    result.durationS < 20_000
  );
}

/** Ephemeris for a packed / computed mission result (lunar or Flight 13). */
export function epochFromResult(result: {
  moonPhase0: number;
  horizonsLandingT?: number;
  durationS: number;
  message?: string;
}): EphemerisEpoch {
  const landT = landTFromResult(result);
  if (isFlight13Result(result)) return makeFlight13Epoch(result.moonPhase0, landT);
  return makeLunarEpoch(result.moonPhase0, landT, hasHorizonsTable());
}

/** Map legacy phase ids (leo/tli) to full terms. */
export function normalizePhaseId(phase: string): PhaseId {
  if (phase === "leo") return "lowEarthOrbit";
  if (phase === "tli") return "translunarInjection";
  return phase as PhaseId;
}

function inferStaged(s: PackedTrajectory["samples"][number]): boolean {
  return s.st ?? (s.phase !== "launch" && s.phase !== "ascent" && (s.fb ?? 0) < 1e-6);
}

function unpackSample(s: PackedTrajectory["samples"][number]): Sample {
  return {
    t: s.t, pos: { x: s.p[0]!, y: s.p[1]!, z: s.p[2]! }, vel: { x: s.v[0]!, y: s.v[1]!, z: s.v[2]! },
    phase: normalizePhaseId(s.phase), burning: s.burning, fuelBooster: s.fb ?? 0, fuelShip: s.fs ?? 1,
    thrustN: (s.th ?? 0) * 1000, staged: inferStaged(s),
  };
}

function resolveKeplerDev(
  packed: number | undefined,
  samples: Sample[],
  epoch: EphemerisEpoch,
): number {
  return packed != null && Number.isFinite(packed)
    ? packed
    : computeKeplerRefMaxDevKm(samples, epoch);
}

function packToMissionResult(
  packed: PackedTrajectory, samples: Sample[],
  meta: ReturnType<typeof resolveTrajectoryMeta>, keplerRefMaxDevKm: number,
): MissionResult {
  return {
    moonPhase0: packed.moonPhase0, translunarInjectionDeltaV: packed.translunarInjectionDeltaV ?? packed.tliDv ?? 0,
    durationS: packed.durationS, horizonsLandingT: packed.horizonsLandingT, ok: packed.ok, message: packed.message,
    minMoonAlt: meta.minMoonAlt, peakSpeedKmS: meta.peakSpeedKmS, stageT: meta.stageT, keplerRefMaxDevKm, samples,
  };
}

/** Unpack a JSON pack into a {@link MissionResult} (samples + meta). */
function packedEpochArgs(packed: PackedTrajectory) {
  return { moonPhase0: packed.moonPhase0, horizonsLandingT: packed.horizonsLandingT, durationS: packed.durationS, message: packed.message };
}

export function unpackPackedTrajectory(packed: PackedTrajectory): MissionResult {
  const samples = packed.samples.map(unpackSample);
  const epoch = epochFromResult(packedEpochArgs(packed));
  const meta = resolveTrajectoryMeta(
    { minMoonAlt: packed.minMoonAlt, peakSpeedKmS: packed.peakSpeedKmS, stageT: packed.stageT }, samples, epoch,
  );
  return packToMissionResult(packed, samples, meta, resolveKeplerDev(packed.keplerRefMaxDevKm, samples, epoch));
}

function freezeTrajectory(
  result: MissionResult, durationS: number, horizonsLandingT: number, epoch: EphemerisEpoch,
  meta: ReturnType<typeof resolveTrajectoryMeta>, keplerRefMaxDevKm: number,
): Trajectory {
  return Object.freeze({
    samples: result.samples, durationS, ok: result.ok, message: result.message,
    moonPhase0: result.moonPhase0, translunarInjectionDeltaV: result.translunarInjectionDeltaV,
    horizonsLandingT, epoch, minMoonAlt: meta.minMoonAlt, peakSpeedKmS: meta.peakSpeedKmS,
    stageT: meta.stageT, keplerRefMaxDevKm,
  });
}

/**
 * Build an immutable {@link Trajectory} from a mission result (bake or recompute).
 */
function trajectoryMetaArgs(result: MissionResult) {
  return { minMoonAlt: result.minMoonAlt, peakSpeedKmS: result.peakSpeedKmS, stageT: result.stageT };
}

export function makeTrajectory(result: MissionResult): Trajectory {
  const durationS = Math.max(result.durationS, 1);
  const horizonsLandingT = landTFromResult({ ...result, durationS });
  const epoch = epochFromResult({ moonPhase0: result.moonPhase0, horizonsLandingT, durationS, message: result.message });
  const meta = resolveTrajectoryMeta(trajectoryMetaArgs(result), result.samples, epoch);
  return freezeTrajectory(result, durationS, horizonsLandingT, epoch, meta, resolveKeplerDev(result.keplerRefMaxDevKm, result.samples, epoch));
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

function findSampleBracket(s: Sample[], t: number): { a: Sample; b: Sample; f: number } {
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid]!.t <= t) lo = mid; else hi = mid;
  }
  const a = s[lo]!, b = s[hi]!;
  return { a, b, f: (t - a.t) / (b.t - a.t || 1) };
}

function lerpV3(a: V3, b: V3, f: number): V3 {
  return v3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
}

function interpFrameFields(a: Sample, b: Sample, f: number) {
  return {
    phase: f < 0.5 ? a.phase : b.phase,
    burning: a.burning || b.burning,
    fuelBooster: a.fuelBooster + (b.fuelBooster - a.fuelBooster) * f,
    fuelShip: a.fuelShip + (b.fuelShip - a.fuelShip) * f,
    thrustN: a.thrustN + (b.thrustN - a.thrustN) * f,
    staged: f < 0.5 ? a.staged : b.staged,
  };
}

/** Mission time (s) → linearly interpolated frame + live body altitudes. */
export function sampleAtTime(traj: Trajectory, t: number): FrameState {
  const s = traj.samples;
  if (s.length === 0) return emptyFrame();
  if (t <= s[0]!.t) return frameFromSample(s[0]!, traj.epoch);
  if (t >= s[s.length - 1]!.t) return frameFromSample(s[s.length - 1]!, traj.epoch);
  const { a, b, f } = findSampleBracket(s, t);
  const fields = interpFrameFields(a, b, f);
  return makeFrame(t, lerpV3(a.pos, b.pos, f), lerpV3(a.vel, b.vel, f), fields.phase,
    fields.burning, fields.fuelBooster, fields.fuelShip, fields.thrustN, fields.staged, traj.epoch);
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
    t: 0, pos: v3(), vel: v3(), phase: "lowEarthOrbit",
    phaseLabel: phaseLabel("lowEarthOrbit"), burning: false, speed: 0,
    altMoon: 0, altEarth: 0, distMoon: 0, fuelBooster: 0, fuelShip: 1, thrustN: 0, staged: true,
  };
}

function frameFromSample(s: Sample, epoch: EphemerisEpoch): FrameState {
  return makeFrame(s.t, s.pos, s.vel, s.phase, s.burning, s.fuelBooster, s.fuelShip, s.thrustN, s.staged, epoch);
}

function frameAlts(t: number, pos: V3, epoch: EphemerisEpoch) {
  const b = bodyPositions(t, epoch);
  const distMoon = Math.hypot(pos.x - b.moon.x, pos.y - b.moon.y, pos.z - b.moon.z);
  const distEarth = Math.hypot(pos.x - b.earth.x, pos.y - b.earth.y, pos.z - b.earth.z);
  return { distMoon, altMoon: distMoon - R_MOON, altEarth: distEarth - R_EARTH };
}

function frameCore(
  t: number, pos: V3, vel: V3, phase: PhaseId, burning: boolean,
  fuelBooster: number, fuelShip: number, thrustN: number, staged: boolean,
  alts: { distMoon: number; altMoon: number; altEarth: number },
): FrameState {
  return {
    t, pos: { x: pos.x, y: pos.y, z: pos.z }, vel: { x: vel.x, y: vel.y, z: vel.z },
    phase, phaseLabel: phaseLabel(phase), burning, speed: len(vel),
    altMoon: alts.altMoon, altEarth: alts.altEarth, distMoon: alts.distMoon,
    fuelBooster, fuelShip, thrustN, staged,
  };
}

function makeFrame(
  t: number, pos: V3, vel: V3, phase: PhaseId, burning: boolean,
  fuelBooster: number, fuelShip: number, thrustN: number, staged: boolean,
  epoch: EphemerisEpoch,
): FrameState {
  return frameCore(t, pos, vel, phase, burning, fuelBooster, fuelShip, thrustN, staged, frameAlts(t, pos, epoch));
}
