import { DT_BURN, R_MOON, TRANSFER_AIM_ALT_KM } from "./constants";
import { bodyPositions, moonSouthUnit } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import { keplerRvAt, type KeplerOrbit } from "./kepler";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  burnForce,
  hasPropellant,
  limitAccelByThrust,
  type PropState,
} from "./propellant";
import { set, type V3, v3 } from "./vec3";

const _relP = v3();
const _relV = v3();
const _dv = v3();
const _thrust = v3();
const _dir = v3();
const _p0 = v3();
const _p1 = v3();
const _south = v3();
const _aim = v3();
const _tmpSouth = v3();

/**
 * Max |Δv| (km/s) per midcourse correction (velocity match to design track).
 * Theater-sized; real trajectory corrections are usually smaller.
 */
export const TRAJECTORY_CORRECTION_MAX_DELTA_V = 0.35;

/** trajectory correction finite-burn accel (km/s²) ~1 g so small Δv reads as tens of seconds. */
export const TRAJECTORY_CORRECTION_ACCEL = 0.01;

/**
 * Scheduled trajectory correction epochs as hours after translunar injection (+ approach trajectory correction near the Moon).
 * Locked plan: 2–3 discrete trajectory corrections.
 */
export const TRAJECTORY_CORRECTION_HOURS_AFTER_TRANSLUNAR_INJECTION = [12, 48] as const;

/** Approach trajectory correction window: fraction of design transfer time after translunar injection. */
export const TRAJECTORY_CORRECTION_APPROACH_FRAC = 0.8;

export type TrajectoryCorrectionRecord = {
  t: number;
  hoursAfterTli: number;
  dvKmS: number;
  label: string;
};

/**
 * Earth-centered Kepler reference position at time t.
 */
export function keplerRefPos(
  orb: KeplerOrbit,
  t: number,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t, epoch);
  return set(out, b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z);
}

function setPosVel(
  state: { pos: V3; vel: V3 },
  px: number, py: number, pz: number,
  vx: number, vy: number, vz: number,
): void {
  set(state.pos, px, py, pz);
  set(state.vel, vx, vy, vz);
}

function writeKeplerInertial(
  state: { t: number; pos: V3; vel: V3 },
  orb: KeplerOrbit,
  t: number,
  epoch: EphemerisEpoch,
): void {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t, epoch);
  state.t = t;
  setPosVel(
    state,
    b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z,
    b.earthVel.x + _relV.x, b.earthVel.y + _relV.y, b.earthVel.z + _relV.z,
  );
}

/**
 * Place craft on the Earth-centered Kepler design track (lunar-transfer-style free
 * transfer). No burns — smooth elliptical coast aimed at translunar injection inject.
 */
export function placeOnKeplerTrack(
  state: { t: number; pos: V3; vel: V3 },
  orb: KeplerOrbit,
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  writeKeplerInertial(state, orb, t, epoch);
}

function capDvComponents(
  dvx: number, dvy: number, dvz: number, maxDv: number,
): { dvx: number; dvy: number; dvz: number; mag: number } {
  const mag = Math.hypot(dvx, dvy, dvz);
  if (mag > maxDv && mag > 1e-12) {
    const s = maxDv / mag;
    return { dvx: dvx * s, dvy: dvy * s, dvz: dvz * s, mag: maxDv };
  }
  return { dvx, dvy, dvz, mag };
}

function rawTcbDv(t: number, vel: V3, orb: KeplerOrbit, epoch: EphemerisEpoch) {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t, epoch);
  return {
    dvx: b.earthVel.x + _relV.x - vel.x,
    dvy: b.earthVel.y + _relV.y - vel.y,
    dvz: b.earthVel.z + _relV.z - vel.z,
  };
}

/**
 * Velocity-to-go (km/s) to match Kepler design velocity (no position term).
 */
export function trajectoryCorrectionDeltaV(
  t: number,
  _pos: V3,
  vel: V3,
  orb: KeplerOrbit,
  maxDv = TRAJECTORY_CORRECTION_MAX_DELTA_V,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): { dv: V3; mag: number } {
  const r = rawTcbDv(t, vel, orb, epoch);
  const c = capDvComponents(r.dvx, r.dvy, r.dvz, maxDv);
  if (c.mag < 1e-5) return { dv: set(_dv, 0, 0, 0), mag: 0 };
  return { dv: set(_dv, c.dvx, c.dvy, c.dvz), mag: c.mag };
}

function tcbPush(
  samples: Sample[] | null,
  lastT: { t: number } | null,
  state: CraftState,
  prop: PropState | null,
  burning: boolean,
  a: number,
  force: boolean,
  interval = 0,
): void {
  if (!samples || !lastT) return;
  pushSample(samples, state, "coast", burning, force, interval, lastT, prop, a, "ship", force || !burning);
}

function tcbDirFromGo(go: V3, gm: number, aCmd: number): { ax: number; ay: number; az: number } {
  return { ax: (go.x / gm) * aCmd, ay: (go.y / gm) * aCmd, az: (go.z / gm) * aCmd };
}

function tcbAccelDir(
  state: CraftState,
  aCmd: number,
  orb: KeplerOrbit | undefined,
  epoch: EphemerisEpoch,
): { ax: number; ay: number; az: number } {
  if (!orb) return { ax: _dir.x * aCmd, ay: _dir.y * aCmd, az: _dir.z * aCmd };
  const { dv: go, mag: gm } = trajectoryCorrectionDeltaV(
    state.t, state.pos, state.vel, orb, TRAJECTORY_CORRECTION_MAX_DELTA_V, epoch,
  );
  if (gm > 1e-5) return tcbDirFromGo(go, gm, aCmd);
  return { ax: _dir.x * aCmd, ay: _dir.y * aCmd, az: _dir.z * aCmd };
}

function tcbLimitProp(
  prop: PropState | null,
  aCmd: number,
  ax: number, ay: number, az: number,
): { ax: number; ay: number; az: number; aCmd: number; forceN: number } | null {
  if (!prop) return { ax, ay, az, aCmd, forceN: 0 };
  const lim = limitAccelByThrust(prop, aCmd, "ship");
  if (lim.forceN < 1e-3) return null;
  const s = lim.aKmS2 / Math.max(aCmd, 1e-12);
  return { ax: ax * s, ay: ay * s, az: az * s, aCmd: lim.aKmS2, forceN: lim.forceN };
}

function tcbDrainProp(prop: PropState | null, forceN: number, tBefore: number, tNow: number): void {
  if (!prop || forceN <= 0) return;
  prop.lastT = tBefore;
  burnForce(prop, tNow, forceN, "ship");
}

function tcbPrepDir(
  state: CraftState,
  aBurn: number,
  orb: KeplerOrbit | undefined,
  epoch: EphemerisEpoch,
) {
  if (orb) {
    trajectoryCorrectionDeltaV(
      state.t, state.pos, state.vel, orb, TRAJECTORY_CORRECTION_MAX_DELTA_V, epoch,
    );
  }
  return tcbAccelDir(state, aBurn, orb, epoch);
}

function tcbIntegrateStep(
  state: CraftState,
  step: number,
  lim: { ax: number; ay: number; az: number; aCmd: number; forceN: number },
  prop: PropState | null,
  epoch: EphemerisEpoch,
): number {
  const thrustFn: ThrustFn = () => set(_thrust, lim.ax, lim.ay, lim.az);
  const tBefore = state.t;
  rk4Step(state, step, thrustFn, { epoch });
  tcbDrainProp(prop, lim.forceN, tBefore, state.t);
  return lim.aCmd * step;
}

function tcbBurnOnce(
  state: CraftState,
  step: number,
  aBurn: number,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  orb: KeplerOrbit | undefined,
  epoch: EphemerisEpoch,
): number | null {
  const d = tcbPrepDir(state, aBurn, orb, epoch);
  const lim = tcbLimitProp(prop, aBurn, d.ax, d.ay, d.az);
  if (!lim) return null;
  const delivered = tcbIntegrateStep(state, step, lim, prop, epoch);
  tcbPush(samples, lastT, state, prop, true, lim.aCmd, false, 1.2);
  return delivered;
}

function tcbBurnLoop(
  state: CraftState,
  tEnd: number,
  aBurn: number,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  orb: KeplerOrbit | undefined,
  epoch: EphemerisEpoch,
): number {
  let delivered = 0;
  const dt = Math.min(DT_BURN, 1.5);
  while (state.t < tEnd - 1e-9) {
    if (prop && !hasPropellant(prop, "ship")) break;
    const d = tcbBurnOnce(state, Math.min(dt, tEnd - state.t), aBurn, samples, lastT, prop, orb, epoch);
    if (d == null) break;
    delivered += d;
  }
  return delivered;
}

function tcbSnapResidual(
  state: CraftState,
  orb: KeplerOrbit,
  epoch: EphemerisEpoch,
): number {
  const { dv: trim, mag: tm } = trajectoryCorrectionDeltaV(
    state.t, state.pos, state.vel, orb, TRAJECTORY_CORRECTION_MAX_DELTA_V, epoch,
  );
  if (tm <= 1e-6) return 0;
  state.vel.x += trim.x;
  state.vel.y += trim.y;
  state.vel.z += trim.z;
  return tm;
}

function tcbProbeSnap(
  state: CraftState,
  orb: KeplerOrbit,
  epoch: EphemerisEpoch,
  dr: number,
): void {
  if (dr >= 80_000) return;
  keplerRvAt(orb, state.t, _relP, _relV);
  const b = bodyPositions(state.t, epoch);
  setPosVel(
    state, _p1.x, _p1.y, _p1.z,
    b.earthVel.x + _relV.x, b.earthVel.y + _relV.y, b.earthVel.z + _relV.z,
  );
}

function tcbRejoinPass(
  orb: KeplerOrbit, tEnd: number, epoch: EphemerisEpoch,
): { vxe: number; vye: number; vze: number; chord: number } {
  keplerRvAt(orb, tEnd, _relP, _relV);
  const be = bodyPositions(tEnd, epoch);
  set(_p1, be.earth.x + _relP.x, be.earth.y + _relP.y, be.earth.z + _relP.z);
  const chord = Math.hypot(_p1.x - _p0.x, _p1.y - _p0.y, _p1.z - _p0.z);
  return { vxe: be.earthVel.x + _relV.x, vye: be.earthVel.y + _relV.y, vze: be.earthVel.z + _relV.z, chord };
}

function tcbRejoinDuration(orb: KeplerOrbit, t0: number, epoch: EphemerisEpoch, dr: number): {
  rejoinS: number; vxe: number; vye: number; vze: number;
} {
  let rejoinS = Math.min(1_500, Math.max(60, dr / 8));
  let vxe = 0, vye = 0, vze = 0;
  for (let pass = 0; pass < 3; pass++) {
    const p = tcbRejoinPass(orb, t0 + rejoinS, epoch);
    vxe = p.vxe; vye = p.vye; vze = p.vze;
    rejoinS = Math.min(2_000, Math.max(60, p.chord / 8));
  }
  return { rejoinS, vxe, vye, vze };
}

function tcbBridgeStep(
  state: CraftState, t0: number, rejoinS: number, u: number,
  vxe: number, vye: number, vze: number,
): void {
  state.t = t0 + rejoinS * u;
  setPosVel(
    state,
    _p0.x + u * (_p1.x - _p0.x), _p0.y + u * (_p1.y - _p0.y), _p0.z + u * (_p1.z - _p0.z),
    vxe, vye, vze,
  );
}

function tcbFlightRejoin(
  state: CraftState,
  samples: Sample[],
  lastT: { t: number },
  prop: PropState | null,
  orb: KeplerOrbit,
  epoch: EphemerisEpoch,
  dr: number,
): void {
  if (dr <= 5 || dr >= 80_000) return;
  const t0 = state.t;
  const { rejoinS, vxe, vye, vze } = tcbRejoinDuration(orb, t0, epoch, dr);
  const steps = Math.max(40, Math.ceil(rejoinS / 1.5));
  for (let i = 1; i <= steps; i++) {
    tcbBridgeStep(state, t0, rejoinS, i / steps, vxe, vye, vze);
    pushSample(samples, state, "coast", true, true, 0, lastT, prop, 1e-5, "ship", false);
  }
}

function tcbSoftRejoin(
  state: CraftState,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  orb: KeplerOrbit,
  epoch: EphemerisEpoch,
): void {
  keplerRvAt(orb, state.t, _relP, _relV);
  const b = bodyPositions(state.t, epoch);
  set(_p0, state.pos.x, state.pos.y, state.pos.z);
  set(_p1, b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z);
  const dr = Math.hypot(_p1.x - _p0.x, _p1.y - _p0.y, _p1.z - _p0.z);
  if (!samples) tcbProbeSnap(state, orb, epoch, dr);
  else if (lastT) tcbFlightRejoin(state, samples, lastT, prop, orb, epoch, dr);
}

function tcbAfterBurn(
  state: CraftState,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  orb: KeplerOrbit | undefined,
  epoch: EphemerisEpoch,
  delivered: number,
): number {
  let d = delivered;
  if (orb) d += tcbSnapResidual(state, orb, epoch);
  if (orb) tcbSoftRejoin(state, samples, lastT, prop, orb, epoch);
  tcbPush(samples, lastT, state, prop, false, 0, true);
  return d;
}

/**
 * Discrete trajectory correction: short finite burn to match Kepler velocity, then optional
 * soft position rejoin (sampled bridge) so the trail stays continuous.
 * Coast is ballistic between trajectory corrections.
 */
export function runTrajectoryCorrectionBurn(
  state: CraftState,
  dv: V3,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  orb?: KeplerOrbit,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const mag0 = Math.hypot(dv.x, dv.y, dv.z);
  if (mag0 < 1e-5) return 0;
  const burnS = Math.min(90, Math.max(15, mag0 / TRAJECTORY_CORRECTION_ACCEL));
  const aBurn = mag0 / burnS;
  set(_dir, dv.x / mag0, dv.y / mag0, dv.z / mag0);
  tcbPush(samples, lastT, state, prop, true, aBurn, true);
  const delivered = tcbBurnLoop(state, state.t + burnS, aBurn, samples, lastT, prop, orb, epoch);
  return tcbAfterBurn(state, samples, lastT, prop, orb, epoch, delivered);
}

type SouthRejoinGeom = {
  tx: number; ty: number; tz: number; rTgt: number; dr: number; rejoinS: number; t0: number;
  endVx: number; endVy: number; endVz: number; moon0: V3;
};

function southBlendDir(ox: number, oy: number, oz: number, rNow: number): V3 {
  const tx = ox / (rNow || 1) + _south.x * 1.8;
  const ty = oy / (rNow || 1) + _south.y * 1.8;
  const tz = oz / (rNow || 1) + _south.z * 1.8;
  const tlen = Math.hypot(tx, ty, tz) || 1;
  return set(_tmpSouth, tx / tlen, ty / tlen, tz / tlen);
}

function southAimPoint(b0: ReturnType<typeof bodyPositions>, southAimKm: number): void {
  const aimR = Math.max(R_MOON + 2_500, Math.abs(southAimKm));
  const s = Math.min(southAimKm, aimR);
  set(_aim, b0.moon.x + _south.x * s, b0.moon.y + _south.y * s, b0.moon.z + _south.z * s);
}

function southEndVel(b0: ReturnType<typeof bodyPositions>) {
  return {
    endVx: b0.moonVel.x + (b0.moon.x - _p1.x) * 0.00015,
    endVy: b0.moonVel.y + (b0.moon.y - _p1.y) * 0.00015,
    endVz: b0.moonVel.z + (b0.moon.z - _p1.z) * 0.00015,
  };
}

function makeSouthGeom(
  state: CraftState, b0: ReturnType<typeof bodyPositions>,
  dir: V3, rTgt: number, lastT: { t: number } | null,
): SouthRejoinGeom | null {
  set(_p1, b0.moon.x + dir.x * rTgt, b0.moon.y + dir.y * rTgt, b0.moon.z + dir.z * rTgt);
  set(_p0, state.pos.x, state.pos.y, state.pos.z);
  const dr = Math.hypot(_p1.x - _p0.x, _p1.y - _p0.y, _p1.z - _p0.z);
  if (dr < 20) return null;
  const rejoinS = Math.min(2_500, Math.max(80, dr / 7));
  const t0 = Math.max(state.t, lastT ? lastT.t + 0.05 : state.t);
  return { tx: dir.x, ty: dir.y, tz: dir.z, rTgt, dr, rejoinS, t0, ...southEndVel(b0), moon0: b0.moon };
}

function southRejoinGeom(
  state: CraftState,
  southAimKm: number,
  lastT: { t: number } | null,
  epoch: EphemerisEpoch,
): SouthRejoinGeom | null {
  const b0 = bodyPositions(state.t, epoch);
  moonSouthUnit(_south);
  southAimPoint(b0, southAimKm);
  const ox = state.pos.x - b0.moon.x, oy = state.pos.y - b0.moon.y, oz = state.pos.z - b0.moon.z;
  const rNow = Math.hypot(ox, oy, oz);
  const rTgt = Math.min(Math.max(rNow, R_MOON + 2_000), 40_000);
  return makeSouthGeom(state, b0, southBlendDir(ox, oy, oz, rNow), rTgt, lastT);
}

function moonInboundVel(bi: ReturnType<typeof bodyPositions>, pos: V3, out: V3): void {
  set(
    out,
    bi.moonVel.x + (bi.moon.x - pos.x) * 0.00015,
    bi.moonVel.y + (bi.moon.y - pos.y) * 0.00015,
    bi.moonVel.z + (bi.moon.z - pos.z) * 0.00015,
  );
}

function southRejoinProbe(state: CraftState, g: SouthRejoinGeom, epoch: EphemerisEpoch): number {
  state.t = g.t0 + g.rejoinS;
  const bi = bodyPositions(state.t, epoch);
  moonSouthUnit(_south);
  set(state.pos, bi.moon.x + g.tx * g.rTgt, bi.moon.y + g.ty * g.rTgt, bi.moon.z + g.tz * g.rTgt);
  moonInboundVel(bi, state.pos, state.vel);
  return g.dr * 0.001;
}

function southLerpMoonRel(g: SouthRejoinGeom, u: number, bi: ReturnType<typeof bodyPositions>): void {
  const mx0 = _p0.x - g.moon0.x, my0 = _p0.y - g.moon0.y, mz0 = _p0.z - g.moon0.z;
  const mx1 = g.tx * g.rTgt, my1 = g.ty * g.rTgt, mz1 = g.tz * g.rTgt;
  set(
    _p1,
    bi.moon.x + mx0 + u * (mx1 - mx0),
    bi.moon.y + my0 + u * (my1 - my0),
    bi.moon.z + mz0 + u * (mz1 - mz0),
  );
}

function southRejoinSampleStep(
  state: CraftState, g: SouthRejoinGeom, u: number, epoch: EphemerisEpoch,
): void {
  state.t = g.t0 + g.rejoinS * u;
  southLerpMoonRel(g, u, bodyPositions(state.t, epoch));
  set(state.pos, _p1.x, _p1.y, _p1.z);
  set(state.vel, g.endVx, g.endVy, g.endVz);
}

function southMatchEndVel(state: CraftState, epoch: EphemerisEpoch): void {
  moonInboundVel(bodyPositions(state.t, epoch), state.pos, state.vel);
  void _aim;
}

function southRejoinFlight(
  state: CraftState,
  samples: Sample[],
  lastT: { t: number },
  prop: PropState | null,
  g: SouthRejoinGeom,
  epoch: EphemerisEpoch,
): number {
  const steps = Math.max(40, Math.ceil(g.rejoinS / 1.5));
  for (let i = 1; i <= steps; i++) {
    southRejoinSampleStep(state, g, i / steps, epoch);
    pushSample(
      samples, state, "coast", true, true, 0, lastT, prop, TRAJECTORY_CORRECTION_ACCEL, "ship", false,
    );
  }
  southMatchEndVel(state, epoch);
  return Math.min(TRAJECTORY_CORRECTION_MAX_DELTA_V, g.dr / Math.max(g.rejoinS, 1));
}

/**
 * Soft position bridge to a point **south of the Moon** (south-pole geometry).
 * Used as the approach trajectory correction rejoin so the trail does not cut through the
 * northern hemisphere above the lunar orbital plane.
 */
export function rejoinSouthOfMoon(
  state: CraftState,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  southAimKm = R_MOON + TRANSFER_AIM_ALT_KM,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): number {
  const g = southRejoinGeom(state, southAimKm, lastT, epoch);
  if (!g) return 0;
  if (!samples || !lastT) return southRejoinProbe(state, g, epoch);
  return southRejoinFlight(state, samples, lastT, prop, g, epoch);
}

/**
 * @deprecated Continuous midcourse PD — replaced by discrete trajectory corrections (A2).
 */
export function keplerTrackThrust(
  t: number,
  pos: V3,
  vel: V3,
  orb: KeplerOrbit,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 | null {
  const { dv, mag } = trajectoryCorrectionDeltaV(t, pos, vel, orb, 0.0008, epoch);
  if (mag < 1e-9) return null;
  return set(_thrust, dv.x * 0.5, dv.y * 0.5, dv.z * 0.5);
}
