import { R_EARTH, R_MOON } from "./constants";
import { bodyPositions } from "./bodies";
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

/** Build-time packed format (see scripts/precompute-trajectory.ts). */
type PackedTrajectory = {
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

/** Map legacy phase ids (leo/tli) to full terms. */
function normalizePhaseId(phase: string): PhaseId {
  if (phase === "leo") return "lowEarthOrbit";
  if (phase === "tli") return "translunarInjection";
  return phase as PhaseId;
}

function unpack(packed: PackedTrajectory): MissionResult {
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
  const meta = resolveTrajectoryMeta(
    {
      minMoonAlt: packed.minMoonAlt,
      peakSpeedKmS: packed.peakSpeedKmS,
      stageT: packed.stageT,
    },
    samples,
  );
  const keplerRefMaxDevKm =
    packed.keplerRefMaxDevKm != null && Number.isFinite(packed.keplerRefMaxDevKm)
      ? packed.keplerRefMaxDevKm
      : computeKeplerRefMaxDevKm(samples);

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

export class TrajectoryCache {
  readonly samples: Sample[];
  readonly durationS: number;
  readonly ok: boolean;
  readonly message: string;
  readonly moonPhase0: number;
  readonly translunarInjectionDeltaV: number;
  readonly minMoonAlt: number;
  /** Peak inertial |v| (km/s) — from pack meta when present */
  readonly peakSpeedKmS: number;
  /** Mission time (s) of booster stage-out, or null */
  readonly stageT: number | null;
  /** Peak |r_nbody − r_kepler| on Translunar injection coast (km) */
  readonly keplerRefMaxDevKm: number;
  /** Horizons τ=0 mission time used when samples were baked. */
  readonly horizonsLandingT: number;
  private _corridor: CoastCorridor | null | undefined;

  constructor(result: MissionResult) {
    this.samples = result.samples;
    this.durationS = Math.max(result.durationS, 1);
    this.ok = result.ok;
    this.message = result.message;
    this.moonPhase0 = result.moonPhase0;
    this.translunarInjectionDeltaV = result.translunarInjectionDeltaV;
    this.horizonsLandingT =
      result.horizonsLandingT != null && Number.isFinite(result.horizonsLandingT)
        ? result.horizonsLandingT
        : this.durationS;
    // Prefer packed / result meta; only re-scan when fields are missing (v1 packs)
    const meta = resolveTrajectoryMeta(
      {
        minMoonAlt: result.minMoonAlt,
        peakSpeedKmS: result.peakSpeedKmS,
        stageT: result.stageT,
      },
      result.samples,
    );
    this.minMoonAlt = meta.minMoonAlt;
    this.peakSpeedKmS = meta.peakSpeedKmS;
    this.stageT = meta.stageT;
    this.keplerRefMaxDevKm =
      result.keplerRefMaxDevKm != null &&
      Number.isFinite(result.keplerRefMaxDevKm)
        ? result.keplerRefMaxDevKm
        : computeKeplerRefMaxDevKm(result.samples);
  }

  /**
   * Lazy Kepler-vs-n-body coast corridor for scene overlays.
   * Null when the pack has no post-Translunar injection coast.
   */
  getCoastCorridor(): CoastCorridor | null {
    if (this._corridor === undefined) {
      this._corridor = buildCoastCorridor(this.samples);
      // Prefer bake maxDev when corridor was thinned differently
      if (
        this._corridor &&
        this.keplerRefMaxDevKm > this._corridor.maxDevKm
      ) {
        this._corridor = {
          ...this._corridor,
          maxDevKm: this.keplerRefMaxDevKm,
        };
      }
    }
    return this._corridor;
  }

  /** Load baked lunar trajectory (default). Instant — no RK4 on the main thread. */
  static loadPrecomputed(): TrajectoryCache {
    const result = unpack(packedTrajectory as unknown as PackedTrajectory);
    console.info(
      `[tothemoon] Loaded precomputed trajectory — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 3600).toFixed(2)} h`,
    );
    return new TrajectoryCache(result);
  }

  /** Load baked Flight 13 trajectory pack. */
  static loadFlight13(): TrajectoryCache {
    const result = unpack(packedFlight13 as unknown as PackedTrajectory);
    console.info(
      `[flight13] Loaded precomputed trajectory — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 60).toFixed(1)} min`,
    );
    return new TrajectoryCache(result);
  }

  /** Re-run lunar integration in the browser (slow). Use `?recompute=1`. */
  static compute(): TrajectoryCache {
    const t0 = performance.now();
    const result = runMission();
    console.info(
      `[tothemoon] Runtime recompute ${(performance.now() - t0).toFixed(0)}ms — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 3600).toFixed(2)} h`,
    );
    return new TrajectoryCache(result);
  }

  /** Re-run Flight 13 integration in the browser (slow). Use `?recompute=1`. */
  static computeFlight13(): TrajectoryCache {
    const t0 = performance.now();
    const result = runFlight13Mission();
    console.info(
      `[flight13] Runtime recompute ${(performance.now() - t0).toFixed(0)}ms — ${result.message}, ${result.samples.length} samples`,
    );
    return new TrajectoryCache(result);
  }

  /** Normalized progress u ∈ [0,1] → interpolated frame. */
  sampleAtProgress(u: number): FrameState {
    const t = Math.min(1, Math.max(0, u)) * this.durationS;
    return this.sampleAtTime(t);
  }

  sampleAtTime(t: number): FrameState {
    const s = this.samples;
    if (s.length === 0) {
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

    if (t <= s[0]!.t) return this.frameFromSample(s[0]!);
    if (t >= s[s.length - 1]!.t) return this.frameFromSample(s[s.length - 1]!);

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
    return this.makeFrame(
      t,
      pos,
      vel,
      phase,
      burning,
      fuelBooster,
      fuelShip,
      thrustN,
      staged,
    );
  }

  /** Positions for trail rendering. */
  trailPoints(max = 1200): V3[] {
    const s = this.samples;
    if (s.length <= max) return s.map((x) => ({ ...x.pos }));
    const out: V3[] = [];
    const step = (s.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) {
      out.push({ ...s[Math.round(i * step)]!.pos });
    }
    return out;
  }

  private frameFromSample(s: Sample): FrameState {
    return this.makeFrame(
      s.t,
      s.pos,
      s.vel,
      s.phase,
      s.burning,
      s.fuelBooster,
      s.fuelShip,
      s.thrustN,
      s.staged,
    );
  }

  private makeFrame(
    t: number,
    pos: V3,
    vel: V3,
    phase: PhaseId,
    burning: boolean,
    fuelBooster: number,
    fuelShip: number,
    thrustN: number,
    staged: boolean,
  ): FrameState {
    const b = bodyPositions(t);
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
}
