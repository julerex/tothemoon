import { R_EARTH, R_MOON } from "./constants";
import { bodyPositions } from "./bodies";
import {
  phaseLabel,
  runMission,
  type MissionResult,
  type PhaseId,
  type Sample,
} from "./mission";
import { len, type V3, v3 } from "./vec3";
import packedTrajectory from "../data/trajectory.json";

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
};

/** Build-time packed format (see scripts/precompute-trajectory.ts). */
type PackedTrajectory = {
  version: number;
  moonPhase0: number;
  tliDv: number;
  durationS: number;
  ok: boolean;
  message: string;
  samples: Array<{
    t: number;
    p: number[];
    v: number[];
    phase: string;
    burning: boolean;
  }>;
};

function unpack(packed: PackedTrajectory): MissionResult {
  return {
    moonPhase0: packed.moonPhase0,
    tliDv: packed.tliDv,
    durationS: packed.durationS,
    ok: packed.ok,
    message: packed.message,
    minMoonAlt: 0,
    samples: packed.samples.map((s) => ({
      t: s.t,
      pos: { x: s.p[0]!, y: s.p[1]!, z: s.p[2]! },
      vel: { x: s.v[0]!, y: s.v[1]!, z: s.v[2]! },
      phase: s.phase as PhaseId,
      burning: s.burning,
    })),
  };
}

export class TrajectoryCache {
  readonly samples: Sample[];
  readonly durationS: number;
  readonly ok: boolean;
  readonly message: string;
  readonly moonPhase0: number;

  constructor(result: MissionResult) {
    this.samples = result.samples;
    this.durationS = Math.max(result.durationS, 1);
    this.ok = result.ok;
    this.message = result.message;
    this.moonPhase0 = result.moonPhase0;
  }

  /** Load baked trajectory (default). Instant — no RK4 on the main thread. */
  static loadPrecomputed(): TrajectoryCache {
    const result = unpack(packedTrajectory as unknown as PackedTrajectory);
    console.info(
      `[tothemoon] Loaded precomputed trajectory — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 3600).toFixed(2)} h`,
    );
    return new TrajectoryCache(result);
  }

  /** Re-run integration in the browser (slow). Use `?recompute=1`. */
  static compute(): TrajectoryCache {
    const t0 = performance.now();
    const result = runMission();
    console.info(
      `[tothemoon] Runtime recompute ${(performance.now() - t0).toFixed(0)}ms — ${result.message}, ${result.samples.length} samples, ${(result.durationS / 3600).toFixed(2)} h`,
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
        phase: "leo",
        phaseLabel: phaseLabel("leo"),
        burning: false,
        speed: 0,
        altMoon: 0,
        altEarth: 0,
        distMoon: 0,
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
    return this.makeFrame(t, pos, vel, phase, burning);
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
    return this.makeFrame(s.t, s.pos, s.vel, s.phase, s.burning);
  }

  private makeFrame(
    t: number,
    pos: V3,
    vel: V3,
    phase: PhaseId,
    burning: boolean,
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
    };
  }
}
