/**
 * Flight-graph series: Earth altitude, ground speed, and non-gravitational
 * acceleration for Starship and Super Heavy across a baked trajectory.
 *
 * Acceleration is |Δv_ground/Δt − g_earth| / g0, so a coast sits near 0 g
 * and burns and entry drag show up. The booster matches the stack until
 * stage-out, then follows recovery keyframes until that path ends.
 */

import type { BoosterRecoveryKeyframe, StageState } from "../physics/boosterRecovery";
import { G0, MU_EARTH } from "../physics/constants";
import { earthNorthPole, groundRelativeVelocity } from "../physics/earthFrame";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { getBodies } from "../physics/integrator";
import type { ReadonlySample } from "../physics/missionTypes";
import { v3, type V3 } from "../physics/vec3";
import { radialHeightAboveEllipsoid } from "../physics/wgs84";

/** Switch the altitude chart to log when the ship climbs past this (km). */
export const ALT_LOG_ABOVE_KM = 2000;

/** Floor for the log altitude axis (km). */
export const ALT_LOG_FLOOR_KM = 0.1;

/** Target samples per vehicle after downsampling. */
export const FLIGHT_GRAPH_MAX_POINTS = 480;

const G0_KM_S2 = G0 / 1000;

const _earth = v3();
const _earthVel = v3();
const _pos = v3();
const _vel = v3();
const _gvel = v3();
const _rel = v3();
const _north = v3();

/** One plotted sample. */
export type FlightGraphPoint = {
  t: number;
  altKm: number;
  speedKmS: number;
  accelG: number;
};

/** Both vehicles plus the shared mission-time axis. */
export type FlightGraphSeries = {
  durationS: number;
  /** True when ship altitude spans a lunar transfer. */
  logAltitude: boolean;
  ship: FlightGraphPoint[];
  booster: FlightGraphPoint[];
};

export type FlightGraphInput = {
  samples: readonly ReadonlySample[];
  stage: StageState | null;
  keyframes: readonly BoosterRecoveryKeyframe[] | null;
  epoch: EphemerisEpoch;
  durationS: number;
};

type Kin = FlightGraphPoint & {
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
};

/** Log altitude axis when the ship leaves low Earth orbit far behind. */
export function altitudeAxisIsLog(peakAltKm: number): boolean {
  return peakAltKm > ALT_LOG_ABOVE_KM;
}

/**
 * Non-gravitational acceleration (g) from a ground-relative velocity step.
 * `r` is the Earth-centered position (km) used for point-mass gravity.
 */
export function nongravAccelG(v0: V3, v1: V3, dt: number, r: V3): number {
  if (!(dt > 1e-6)) return 0;
  const ax = (v1.x - v0.x) / dt;
  const ay = (v1.y - v0.y) / dt;
  const az = (v1.z - v0.z) / dt;
  const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
  const r3 = r2 * Math.sqrt(r2);
  if (!(r3 > 1e-6)) return Math.hypot(ax, ay, az) / G0_KM_S2;
  const k = MU_EARTH / r3;
  return Math.hypot(ax + k * r.x, ay + k * r.y, az + k * r.z) / G0_KM_S2;
}

/** Playhead position on the shared time axis, clamped to [0, 1]. */
export function playheadFraction(t: number, durationS: number): number {
  if (!(durationS > 0)) return 0;
  return Math.min(1, Math.max(0, t / durationS));
}

/**
 * Value at mission time `t`.
 * `holdEnds` clamps outside the series; otherwise times outside return null
 * (the booster line stops when recovery ends).
 */
export function interpolateFlightGraph(
  points: readonly FlightGraphPoint[],
  t: number,
  holdEnds: boolean,
): FlightGraphPoint | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (t <= first.t) return t < first.t && !holdEnds ? null : first;
  if (t >= last.t) return t > last.t && !holdEnds ? null : last;
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  return lerpPoint(points[lo]!, points[hi]!, t);
}

/** Ship and booster series for the flight-graphs dashboard. */
export function buildFlightGraphSeries(input: FlightGraphInput): FlightGraphSeries {
  const shipKin = shipKinematics(input);
  const ship = withAccel(shipKin);
  const peak = ship.reduce((m, p) => Math.max(m, p.altKm), 0);
  const lastT = input.samples.length > 0 ? input.samples[input.samples.length - 1]!.t : 0;
  return {
    durationS: Math.max(input.durationS, lastT, 0),
    logAltitude: altitudeAxisIsLog(peak),
    ship,
    booster: boosterPoints(ship, input),
  };
}

function lerpPoint(a: FlightGraphPoint, b: FlightGraphPoint, t: number): FlightGraphPoint {
  const u = (t - a.t) / (b.t - a.t || 1);
  return {
    t,
    altKm: a.altKm + u * (b.altKm - a.altKm),
    speedKmS: a.speedKmS + u * (b.speedKmS - a.speedKmS),
    accelG: a.accelG + u * (b.accelG - a.accelG),
  };
}

function shipKinematics(input: FlightGraphInput): Kin[] {
  const { samples, epoch, stage } = input;
  if (samples.length === 0) return [];
  const idx = withNearestTime(
    downsampleStride(samples.length, FLIGHT_GRAPH_MAX_POINTS),
    samples,
    stage?.t ?? null,
  );
  return idx.map((i) => {
    const s = samples[i]!;
    return kinFromInertial(s.t, s.pos, s.vel, epoch);
  });
}

function boosterPoints(ship: FlightGraphPoint[], input: FlightGraphInput): FlightGraphPoint[] {
  const { stage, keyframes, epoch } = input;
  if (stage == null || keyframes == null || keyframes.length === 0) return ship;
  const pre = ship.filter((p) => p.t <= stage.t + 1e-6);
  const preEnd = pre.length > 0 ? pre[pre.length - 1]!.t : stage.t;
  const post: Kin[] = [];
  for (const i of downsampleStride(keyframes.length, FLIGHT_GRAPH_MAX_POINTS)) {
    const kf = keyframes[i]!;
    const t = stage.t + kf.age;
    if (t <= preEnd + 1e-3) continue;
    post.push(kinFromRel(t, kf.p, kf.v, epoch));
  }
  return pre.concat(withAccel(post));
}

function withAccel(points: Kin[]): FlightGraphPoint[] {
  return points.map((p, i) => ({
    t: p.t,
    altKm: p.altKm,
    speedKmS: p.speedKmS,
    accelG: accelAt(points, i),
  }));
}

function accelAt(points: Kin[], i: number): number {
  const n = points.length;
  if (n < 2) return 0;
  const i0 = i === 0 ? 0 : i - 1;
  const i1 = i === n - 1 ? n - 1 : i + 1;
  const a = points[i0]!;
  const b = points[i1]!;
  const here = points[i]!;
  return nongravAccelG(
    v3(a.vx, a.vy, a.vz),
    v3(b.vx, b.vy, b.vz),
    b.t - a.t,
    v3(here.rx, here.ry, here.rz),
  );
}

/** Even stride across `count` items, always keeping the last index. */
export function downsampleStride(count: number, maxPoints: number): number[] {
  if (count <= 0) return [];
  if (count <= maxPoints) return Array.from({ length: count }, (_, i) => i);
  const last = count - 1;
  const steps = maxPoints - 1;
  const out: number[] = [];
  let prev = -1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * last) / steps);
    if (idx === prev) continue;
    out.push(idx);
    prev = idx;
  }
  return out;
}

function withNearestTime(
  indices: number[],
  samples: readonly ReadonlySample[],
  stageT: number | null,
): number[] {
  if (stageT == null || samples.length === 0) return indices;
  let best = 0;
  let bestDt = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const dt = Math.abs(samples[i]!.t - stageT);
    if (dt < bestDt) {
      bestDt = dt;
      best = i;
    }
  }
  if (indices.includes(best)) return indices;
  return [...indices, best].sort((a, b) => a - b);
}

function copyBodies(t: number, epoch: EphemerisEpoch): void {
  const b = getBodies(t, epoch);
  _earth.x = b.earth.x;
  _earth.y = b.earth.y;
  _earth.z = b.earth.z;
  _earthVel.x = b.earthVel.x;
  _earthVel.y = b.earthVel.y;
  _earthVel.z = b.earthVel.z;
}

function kinFromInertial(
  t: number,
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  epoch: EphemerisEpoch,
): Kin {
  copyBodies(t, epoch);
  _pos.x = pos.x;
  _pos.y = pos.y;
  _pos.z = pos.z;
  _vel.x = vel.x;
  _vel.y = vel.y;
  _vel.z = vel.z;
  return kinHere(t);
}

function kinFromRel(t: number, relP: V3, relV: V3, epoch: EphemerisEpoch): Kin {
  copyBodies(t, epoch);
  _pos.x = _earth.x + relP.x;
  _pos.y = _earth.y + relP.y;
  _pos.z = _earth.z + relP.z;
  _vel.x = _earthVel.x + relV.x;
  _vel.y = _earthVel.y + relV.y;
  _vel.z = _earthVel.z + relV.z;
  return kinHere(t);
}

function kinHere(t: number): Kin {
  groundRelativeVelocity(_pos, _vel, _earth, _earthVel, _gvel);
  const vx = _gvel.x;
  const vy = _gvel.y;
  const vz = _gvel.z;
  _rel.x = _pos.x - _earth.x;
  _rel.y = _pos.y - _earth.y;
  _rel.z = _pos.z - _earth.z;
  const rx = _rel.x;
  const ry = _rel.y;
  const rz = _rel.z;
  earthNorthPole(_north);
  return {
    t,
    altKm: radialHeightAboveEllipsoid(_rel, _north),
    speedKmS: Math.hypot(vx, vy, vz),
    accelG: 0,
    vx, vy, vz, rx, ry, rz,
  };
}
