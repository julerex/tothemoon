import { DT_BURN, R_MOON, TRANSFER_AIM_ALT_KM } from "./constants";
import { bodyPositions, moonSouthUnit } from "./bodies";
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

/**
 * Max |Δv| (km/s) per midcourse correction (velocity match to design track).
 * Theater-sized; real TCMs are usually smaller.
 */
export const TCM_MAX_DV = 0.35;

/** TCM finite-burn accel (km/s²) ~1 g so small Δv reads as tens of seconds. */
export const TCM_ACCEL = 0.01;

/**
 * Scheduled TCM epochs as hours after TLI (+ approach TCM near the Moon).
 * Locked plan: 2–3 discrete TCMs.
 */
export const TCM_HOURS_AFTER_TLI = [12, 48] as const;

/** Approach TCM window: fraction of design transfer time after TLI. */
export const TCM_APPROACH_FRAC = 0.8;

export type TcmRecord = {
  t: number;
  hoursAfterTli: number;
  dvKmS: number;
  label: string;
};

/**
 * Earth-centered Kepler reference position at time t.
 */
export function keplerRefPos(orb: KeplerOrbit, t: number, out: V3): V3 {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  return set(out, b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z);
}

/**
 * Place craft on the Earth-centered Kepler design track (LRO-style free
 * transfer). No burns — smooth elliptical coast aimed at TLI inject.
 */
export function placeOnKeplerTrack(
  state: { t: number; pos: V3; vel: V3 },
  orb: KeplerOrbit,
  t: number,
): void {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  state.t = t;
  state.pos.x = b.earth.x + _relP.x;
  state.pos.y = b.earth.y + _relP.y;
  state.pos.z = b.earth.z + _relP.z;
  state.vel.x = b.earthVel.x + _relV.x;
  state.vel.y = b.earthVel.y + _relV.y;
  state.vel.z = b.earthVel.z + _relV.z;
}

/**
 * Velocity-to-go (km/s) to match Kepler design velocity (no position term).
 */
export function tcmDeltaV(
  t: number,
  _pos: V3,
  vel: V3,
  orb: KeplerOrbit,
  maxDv = TCM_MAX_DV,
): { dv: V3; mag: number } {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  let dvx = b.earthVel.x + _relV.x - vel.x;
  let dvy = b.earthVel.y + _relV.y - vel.y;
  let dvz = b.earthVel.z + _relV.z - vel.z;
  let mag = Math.hypot(dvx, dvy, dvz);
  if (mag > maxDv && mag > 1e-12) {
    const s = maxDv / mag;
    dvx *= s;
    dvy *= s;
    dvz *= s;
    mag = maxDv;
  }
  if (mag < 1e-5) {
    return { dv: set(_dv, 0, 0, 0), mag: 0 };
  }
  return { dv: set(_dv, dvx, dvy, dvz), mag };
}

/**
 * Discrete TCM: short finite burn to match Kepler velocity, then optional
 * soft position rejoin (sampled bridge) so the trail stays continuous.
 * Coast is ballistic between TCMs.
 */
export function runTcmBurn(
  state: CraftState,
  dv: V3,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  orb?: KeplerOrbit,
): number {
  const mag0 = Math.hypot(dv.x, dv.y, dv.z);
  if (mag0 < 1e-5) return 0;

  const burnS = Math.min(90, Math.max(15, mag0 / TCM_ACCEL));
  const aBurn = mag0 / burnS;
  set(_dir, dv.x / mag0, dv.y / mag0, dv.z / mag0);

  const tEnd = state.t + burnS;
  let delivered = 0;

  if (samples && lastT) {
    pushSample(
      samples,
      state,
      "coast",
      true,
      true,
      0,
      lastT,
      prop,
      aBurn,
      "ship",
      true,
    );
  }

  const dt = Math.min(DT_BURN, 1.5);
  while (state.t < tEnd - 1e-9) {
    if (prop && !hasPropellant(prop, "ship")) break;
    const step = Math.min(dt, tEnd - state.t);
    // Re-aim to current Kepler velocity residual each step
    let aCmd = aBurn;
    if (orb) {
      const { mag: gm } = tcmDeltaV(
        state.t,
        state.pos,
        state.vel,
        orb,
        TCM_MAX_DV,
      );
      if (gm > 1e-5) {
        // keep aBurn magnitude; direction from go below
      }
    }
    let ax = _dir.x * aCmd;
    let ay = _dir.y * aCmd;
    let az = _dir.z * aCmd;
    if (orb) {
      const { dv: go, mag: gm } = tcmDeltaV(
        state.t,
        state.pos,
        state.vel,
        orb,
        TCM_MAX_DV,
      );
      if (gm > 1e-5) {
        ax = (go.x / gm) * aCmd;
        ay = (go.y / gm) * aCmd;
        az = (go.z / gm) * aCmd;
      }
    }
    let forceN = 0;
    if (prop) {
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) break;
      const s = lim.aKmS2 / Math.max(aCmd, 1e-12);
      ax *= s;
      ay *= s;
      az *= s;
      forceN = lim.forceN;
      aCmd = lim.aKmS2;
    }
    const thrustFn: ThrustFn = () => set(_thrust, ax, ay, az);
    const tBefore = state.t;
    rk4Step(state, step, thrustFn);
    delivered += aCmd * step;

    if (prop && forceN > 0) {
      prop.lastT = tBefore;
      burnForce(prop, state.t, forceN, "ship");
    }

    if (samples && lastT) {
      pushSample(
        samples,
        state,
        "coast",
        true,
        false,
        1.2,
        lastT,
        prop,
        aCmd,
        "ship",
        false, // already drained
      );
    }
  }

  // Residual velocity match
  if (orb) {
    const { dv: trim, mag: tm } = tcmDeltaV(
      state.t,
      state.pos,
      state.vel,
      orb,
      TCM_MAX_DV,
    );
    if (tm > 1e-6) {
      state.vel.x += trim.x;
      state.vel.y += trim.y;
      state.vel.z += trim.z;
      delivered += tm;
    }
  }

  // Soft position rejoin onto the Kepler design track (sampled chord).
  if (orb) {
    keplerRvAt(orb, state.t, _relP, _relV);
    const b = bodyPositions(state.t);
    set(_p0, state.pos.x, state.pos.y, state.pos.z);
    set(_p1, b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z);
    const dr = Math.hypot(_p1.x - _p0.x, _p1.y - _p0.y, _p1.z - _p0.z);

    if (!samples) {
      // Probe: hard snap when close enough
      if (dr < 80_000) {
        state.pos.x = _p1.x;
        state.pos.y = _p1.y;
        state.pos.z = _p1.z;
        state.vel.x = b.earthVel.x + _relV.x;
        state.vel.y = b.earthVel.y + _relV.y;
        state.vel.z = b.earthVel.z + _relV.z;
      }
    } else if (samples && lastT && dr > 5 && dr < 80_000) {
      // Flight: uniform chord to Kepler endpoint. Duration from chord length
      // so apparent speed stays ≤ vBridge (trail invariant is 25 km/s).
      const vBridge = 8;
      const t0 = state.t;
      let rejoinS = Math.min(1_500, Math.max(60, dr / vBridge));
      let vxe = 0;
      let vye = 0;
      let vze = 0;
      for (let pass = 0; pass < 3; pass++) {
        const tEnd = t0 + rejoinS;
        keplerRvAt(orb, tEnd, _relP, _relV);
        const be = bodyPositions(tEnd);
        set(_p1, be.earth.x + _relP.x, be.earth.y + _relP.y, be.earth.z + _relP.z);
        vxe = be.earthVel.x + _relV.x;
        vye = be.earthVel.y + _relV.y;
        vze = be.earthVel.z + _relV.z;
        const chord = Math.hypot(
          _p1.x - _p0.x,
          _p1.y - _p0.y,
          _p1.z - _p0.z,
        );
        rejoinS = Math.min(2_000, Math.max(60, chord / vBridge));
      }
      const steps = Math.max(40, Math.ceil(rejoinS / 1.5));
      for (let i = 1; i <= steps; i++) {
        const u = i / steps;
        state.t = t0 + rejoinS * u;
        state.pos.x = _p0.x + u * (_p1.x - _p0.x);
        state.pos.y = _p0.y + u * (_p1.y - _p0.y);
        state.pos.z = _p0.z + u * (_p1.z - _p0.z);
        state.vel.x = vxe;
        state.vel.y = vye;
        state.vel.z = vze;
        // burning=true so downsample keeps the bridge (trail continuity)
        pushSample(
          samples,
          state,
          "coast",
          true,
          true,
          0,
          lastT,
          prop,
          1e-5,
          "ship",
          false,
        );
      }
    }
  }

  if (samples && lastT) {
    pushSample(
      samples,
      state,
      "coast",
      false,
      true,
      0,
      lastT,
      prop,
      0,
      "ship",
      true,
    );
  }

  return delivered;
}

/**
 * Soft position bridge to a point **south of the Moon** (south-pole geometry).
 * Used as the approach TCM rejoin so the trail does not cut through the
 * northern hemisphere above the lunar orbital plane.
 */
export function rejoinSouthOfMoon(
  state: CraftState,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null,
  southAimKm = R_MOON + TRANSFER_AIM_ALT_KM,
): number {
  const b0 = bodyPositions(state.t);
  moonSouthUnit(_south);
  // Aim: above lunar south pole (legacy helper; mission no longer calls this)
  const aimR = Math.max(R_MOON + 2_500, Math.abs(southAimKm));
  set(
    _aim,
    b0.moon.x + _south.x * Math.min(southAimKm, aimR),
    b0.moon.y + _south.y * Math.min(southAimKm, aimR),
    b0.moon.z + _south.z * Math.min(southAimKm, aimR),
  );
  // Keep range similar (don't dive into the Moon); rotate toward south
  const ox = state.pos.x - b0.moon.x;
  const oy = state.pos.y - b0.moon.y;
  const oz = state.pos.z - b0.moon.z;
  const rNow = Math.hypot(ox, oy, oz);
  const rTgt = Math.min(Math.max(rNow, R_MOON + 2_000), 40_000);
  // Rotate moon-relative direction toward south (positive southAlign)
  let tx = ox / (rNow || 1) + _south.x * 1.8;
  let ty = oy / (rNow || 1) + _south.y * 1.8;
  let tz = oz / (rNow || 1) + _south.z * 1.8;
  const tlen = Math.hypot(tx, ty, tz) || 1;
  tx /= tlen;
  ty /= tlen;
  tz /= tlen;
  set(
    _p1,
    b0.moon.x + tx * rTgt,
    b0.moon.y + ty * rTgt,
    b0.moon.z + tz * rTgt,
  );
  set(_p0, state.pos.x, state.pos.y, state.pos.z);
  const dr = Math.hypot(_p1.x - _p0.x, _p1.y - _p0.y, _p1.z - _p0.z);
  if (dr < 20) return 0;

  const vBridge = 7;
  let rejoinS = Math.min(2_500, Math.max(80, dr / vBridge));
  const t0 = Math.max(state.t, lastT ? lastT.t + 0.05 : state.t);
  const steps = Math.max(40, Math.ceil(rejoinS / 1.5));

  // End velocity: modest inbound toward Moon (helps LOI)
  const endVx = b0.moonVel.x + (b0.moon.x - _p1.x) * 0.00015;
  const endVy = b0.moonVel.y + (b0.moon.y - _p1.y) * 0.00015;
  const endVz = b0.moonVel.z + (b0.moon.z - _p1.z) * 0.00015;

  if (!samples || !lastT) {
    state.t = t0 + rejoinS;
    const bi = bodyPositions(state.t);
    // Rebuild aim at end time
    moonSouthUnit(_south);
    let ux = tx;
    let uy = ty;
    let uz = tz;
    state.pos.x = bi.moon.x + ux * rTgt;
    state.pos.y = bi.moon.y + uy * rTgt;
    state.pos.z = bi.moon.z + uz * rTgt;
    state.vel.x = bi.moonVel.x + (bi.moon.x - state.pos.x) * 0.00015;
    state.vel.y = bi.moonVel.y + (bi.moon.y - state.pos.y) * 0.00015;
    state.vel.z = bi.moonVel.z + (bi.moon.z - state.pos.z) * 0.00015;
    return dr * 0.001; // nominal small Δv proxy
  }

  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    state.t = t0 + rejoinS * u;
    const bi = bodyPositions(state.t);
    // Chord in moon-relative frame so the Moon’s motion doesn’t stretch the trail
    const mx0 = _p0.x - b0.moon.x;
    const my0 = _p0.y - b0.moon.y;
    const mz0 = _p0.z - b0.moon.z;
    const mx1 = tx * rTgt;
    const my1 = ty * rTgt;
    const mz1 = tz * rTgt;
    state.pos.x = bi.moon.x + mx0 + u * (mx1 - mx0);
    state.pos.y = bi.moon.y + my0 + u * (my1 - my0);
    state.pos.z = bi.moon.z + mz0 + u * (mz1 - mz0);
    state.vel.x = endVx;
    state.vel.y = endVy;
    state.vel.z = endVz;
    pushSample(
      samples,
      state,
      "coast",
      true,
      true,
      0,
      lastT,
      prop,
      TCM_ACCEL,
      "ship",
      false,
    );
  }
  // Match end velocity to moon frame inbound
  {
    const bi = bodyPositions(state.t);
    state.vel.x = bi.moonVel.x + (bi.moon.x - state.pos.x) * 0.00015;
    state.vel.y = bi.moonVel.y + (bi.moon.y - state.pos.y) * 0.00015;
    state.vel.z = bi.moonVel.z + (bi.moon.z - state.pos.z) * 0.00015;
  }
  void _aim;
  return Math.min(TCM_MAX_DV, dr / Math.max(rejoinS, 1));
}

/**
 * @deprecated Continuous midcourse PD — replaced by discrete TCMs (A2).
 */
export function keplerTrackThrust(
  t: number,
  pos: V3,
  vel: V3,
  orb: KeplerOrbit,
): V3 | null {
  const { dv, mag } = tcmDeltaV(t, pos, vel, orb, 0.0008);
  if (mag < 1e-9) return null;
  return set(_thrust, dv.x * 0.5, dv.y * 0.5, dv.z * 0.5);
}
