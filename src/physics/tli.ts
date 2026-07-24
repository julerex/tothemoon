import {
  A_EM,
  DT_BURN,
  LEO_RADIUS,
  MU_EARTH,
  R_EARTH,
  R_MOON,
  TLI_ACCEL,
  TLI_BURN_MAX_S,
  TRANSFER_AIM_ALT_KM,
} from "./constants";
import { moonRelativeToEarth, moonSouthUnit } from "./bodies";
import {
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import { rvToKepler, type KeplerOrbit } from "./kepler";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  burnForce,
  hasPropellant,
  limitAccelByThrust,
  type PropState,
} from "./propellant";
import {
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

const _radial = v3();
const _tangent = v3();
const _relP = v3();
const _relV = v3();
const _tmp = v3();
const _n = v3();
const _pro = v3();
const _thrust = v3();
const _up = v3(0, 0, 1);
const _south = v3();
const _axis = v3();

/**
 * Blend transfer-plane normal toward ecliptic north so the free-coast arc
 * reads more anticlockwise when viewed from the northern hemisphere (+Z).
 * 0 = pure lunar plane; 1 = pure ecliptic equatorial.
 */
export const TRANSFER_PLANE_NORTH_BIAS = 0.32;

/**
 * Advance the line of apsides (rad) about the transfer normal (RH rule).
 * Positive = prograde / anticlockwise from northern view.
 */
export const APSIS_CCW_BIAS_RAD = 0.4; // ~23°

/**
 * Hot free-coast TLI (super-Hohmann).
 *
 * Design apogee past the Moon so restricted n-body free coast (tidal Sun)
 * still reaches the lunar region with margin. TOF ≈ half-period.
 */
export function lroTransfer(): {
  ra: number;
  a: number;
  tliDv: number;
  tof: number;
  vPeri: number;
} {
  const rp = LEO_RADIUS;
  // Hotter inject: more velocity, apo well past mean lunar distance
  const ra = A_EM * 1.35;
  const a = 0.5 * (rp + ra);
  const vLeo = Math.sqrt(MU_EARTH / rp);
  const vPeri = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  const tof = Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
  return { ra, a, tliDv: vPeri - vLeo, tof, vPeri };
}

export function transferTimeEst(): number {
  return lroTransfer().tof;
}

/**
 * Cap periapsis speed so 2-body apogee stays cislunar (not near-escape).
 */
export function vPeriForRa(r: number, ra: number): number {
  const a = 0.5 * (r + ra);
  return Math.sqrt(MU_EARTH * (2 / r - 1 / a));
}

/**
 * Max design apogee (km) for free-coast TLI search ladder.
 * High enough for hot injects; still sub-escape (v/v_esc ≈ 0.996).
 */
export const TLI_RA_CAP = A_EM * 2.0;

/** Periapsis speed = circular LEO + TLI Δv, capped so ra ≤ TLI_RA_CAP. */
export function transferVPeri(r: number, tliDv: number): number {
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vCap = vPeriForRa(r, TLI_RA_CAP);
  const dvCap = Math.max(0, vCap - vCirc);
  return vCirc + Math.min(tliDv, dvCap);
}

/** Earth-centered radius of transfer apogee for a given periapsis Δv. */
export function apogeeFromTliDv(r: number, tliDv: number): number {
  const v = transferVPeri(r, tliDv);
  const invA = 2 / r - (v * v) / MU_EARTH;
  if (invA <= 1e-12) return Infinity;
  const a = 1 / invA;
  return 2 * a - r;
}

/** Max TLI Δv from LEO (km/s) — hot free-coast ladder headroom. */
export function maxTliDv(r = LEO_RADIUS): number {
  const base = lroTransfer().tliDv;
  const vCirc = Math.sqrt(MU_EARTH / r);
  const dvCap = transferVPeri(r, base * 2) - vCirc;
  return Math.min(dvCap, base * 1.06);
}

/** Lunar orbital plane normal at time t (unit), same hemisphere as fallback. */
function lunarPlaneNormal(t: number, out: V3): V3 {
  const moon = moonRelativeToEarth(t);
  cross(out, moon.pos, moon.vel);
  if (len(out) < 1e-12) {
    const arr = moonRelativeToEarth(t + transferTimeEst());
    cross(out, arr.pos, arr.vel);
  }
  if (len(out) < 1e-12) set(out, _up.x, _up.y, _up.z);
  return normalize(out, out);
}

/**
 * Earth-relative rendezvous aim at TLI+TOF: above the lunar **south pole**
 * at arrival (where the Moon will be).
 */
export function southPoleRendezvousAim(tInject: number, out: V3): V3 {
  const T = transferTimeEst();
  const moonArr = moonRelativeToEarth(tInject + T);
  moonSouthUnit(_south);
  const rAim = R_MOON + TRANSFER_AIM_ALT_KM;
  return set(
    out,
    moonArr.pos.x + _south.x * rAim,
    moonArr.pos.y + _south.y * rAim,
    moonArr.pos.z + _south.z * rAim,
  );
}

/**
 * Transfer-plane normal (unit): lunar plane blended toward ecliptic north
 * so free-coast arcs read more anticlockwise from the northern hemisphere.
 */
export function transferPlaneNormal(t: number, out: V3): V3 {
  lunarPlaneNormal(t, out);
  // Keep northern sense before blending
  if (dot(out, _up) < 0) scale(out, out, -1);
  const b = TRANSFER_PLANE_NORTH_BIAS;
  out.x = out.x * (1 - b) + _up.x * b;
  out.y = out.y * (1 - b) + _up.y * b;
  out.z = out.z * (1 - b) + _up.z * b;
  if (len(out) < 1e-12) set(out, _up.x, _up.y, _up.z);
  return normalize(out, out);
}

/** Rotate `v` about unit axis `k` by angle (rad) → out (may alias v). */
function rotateAbout(v: V3, k: V3, ang: number, out: V3): V3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const dotK = v.x * k.x + v.y * k.y + v.z * k.z;
  // Rodrigues: v c + (k×v) s + k (k·v) (1−c)
  const cx = k.y * v.z - k.z * v.y;
  const cy = k.z * v.x - k.x * v.z;
  const cz = k.x * v.y - k.y * v.x;
  return set(
    out,
    v.x * c + cx * s + k.x * dotK * (1 - c),
    v.y * c + cy * s + k.y * dotK * (1 - c),
    v.z * c + cz * s + k.z * dotK * (1 - c),
  );
}

/**
 * Earth-relative Moon direction at arrival, then advanced prograde about the
 * transfer normal (APSIS_CCW_BIAS) so periapsis / outbound leg bend more CCW.
 */
export function moonArrivalDirection(tInject: number, out: V3): V3 {
  const moonArr = moonRelativeToEarth(tInject + transferTimeEst());
  normalize(out, moonArr.pos);
  transferPlaneNormal(tInject, _axis);
  // Project onto transfer plane, then rotate prograde (CCW from north)
  const nDot = dot(out, _axis);
  out.x -= _axis.x * nDot;
  out.y -= _axis.y * nDot;
  out.z -= _axis.z * nDot;
  if (len(out) < 1e-12) {
    // Degenerate: pick any in-plane direction
    cross(out, _axis, _up);
    if (len(out) < 1e-12) cross(out, _axis, set(_tmp, 1, 0, 0));
  }
  normalize(out, out);
  rotateAbout(out, _axis, APSIS_CCW_BIAS_RAD, out);
  return normalize(out, out);
}

/**
 * Prograde unit in a given plane at Earth-relative position: n × r̂.
 */
function progradeInPlane(relPos: V3, n: V3, out: V3): V3 {
  cross(out, n, relPos);
  if (len(out) < 1e-12) {
    // Degenerate: fall back to pure tangential in XY
    set(out, -relPos.y, relPos.x, 0);
  }
  return normalize(out, out);
}

/**
 * @deprecated Prefer runFiniteTli — kept for reference / emergency snaps.
 * Impulsive LRO-style velocity set (may adjust position if poorly aligned).
 */
export function applyTli(state: CraftState, tliDv: number): void {
  const t0 = state.t;
  const b0 = getBodies(t0);

  transferPlaneNormal(t0, _tangent);

  // Periapsis opposite the (CCW-biased) Moon arrival direction
  moonArrivalDirection(t0, _tmp);
  const nDot = dot(_tmp, _tangent);
  _tmp.x -= _tangent.x * nDot;
  _tmp.y -= _tangent.y * nDot;
  _tmp.z -= _tangent.z * nDot;
  normalize(_radial, _tmp);

  const periX = -_radial.x;
  const periY = -_radial.y;
  const periZ = -_radial.z;

  set(_relP, periX, periY, periZ);
  cross(_tmp, _tangent, _relP);
  normalize(_relV, _tmp);

  const r = LEO_RADIUS;
  const vPeri = transferVPeri(r, tliDv);

  sub(_relP, state.pos, b0.earth);
  const rNow = len(_relP);
  normalize(_radial, _relP);
  const align = periX * _radial.x + periY * _radial.y + periZ * _radial.z;
  if (align > 0.8 && rNow > R_EARTH + 100) {
    cross(_tmp, _tangent, _radial);
    normalize(_relV, _tmp);
    state.vel.x = b0.earthVel.x + _relV.x * vPeri;
    state.vel.y = b0.earthVel.y + _relV.y * vPeri;
    state.vel.z = b0.earthVel.z + _relV.z * vPeri;
    state.pos.x = b0.earth.x + _radial.x * r;
    state.pos.y = b0.earth.y + _radial.y * r;
    state.pos.z = b0.earth.z + _radial.z * r;
  } else {
    state.pos.x = b0.earth.x + periX * r;
    state.pos.y = b0.earth.y + periY * r;
    state.pos.z = b0.earth.z + periZ * r;
    state.vel.x = b0.earthVel.x + _relV.x * vPeri;
    state.vel.y = b0.earthVel.y + _relV.y * vPeri;
    state.vel.z = b0.earthVel.z + _relV.z * vPeri;
  }
}

export type FiniteTliResult = {
  /** Delivered thrust Δv (km/s) */
  dvDelivered: number;
  /** Burn duration (s) */
  burnS: number;
  /** Peak thrust accel used (km/s²) */
  accel: number;
};

/**
 * Ideal Earth-relative velocity after impulsive TLI at the craft's current
 * Earth-relative position: transfer-plane prograde × v_peri (hot inject).
 */
function idealTliRelVel(state: CraftState, tliDv: number, out: V3): V3 {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.earth);
  const r = Math.max(len(_relP), R_EARTH + 100);
  transferPlaneNormal(state.t, _n);
  progradeInPlane(_relP, _n, _pro);
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vCap = vPeriForRa(r, TLI_RA_CAP);
  const vPeri = Math.min(vCirc + tliDv, vCap);
  return scale(out, _pro, vPeri);
}

/**
 * Finite TLI burn under capped ship acceleration.
 *
 * Starts from current LEO (no position teleport). Thrusts along
 * **velocity-to-go** toward the impulsive inject velocity until the
 * Earth-relative residual is small — so intercept geometry matches the
 * design transfer while the HUD sees a multi-minute burn + plume.
 */
export function runFiniteTli(
  state: CraftState,
  tliDv: number,
  samples: Sample[] | null = null,
  lastT: { t: number } | null = null,
  prop: PropState | null = null,
): FiniteTliResult {
  const aNom = TLI_ACCEL;
  const tIgnition = state.t;
  const tHardCap = tIgnition + TLI_BURN_MAX_S * 1.35;
  let delivered = 0;

  // Opening sample at ignition
  if (samples && lastT) {
    pushSample(
      samples,
      state,
      "tli",
      aNom > 0,
      true,
      0,
      lastT,
      prop,
      aNom,
      "ship",
      true,
    );
  }

  const dt = Math.min(DT_BURN, 1.0);
  const vIdeal = v3();
  const vGo = v3();

  while (state.t < tHardCap - 1e-9) {
    if (prop && !hasPropellant(prop, "ship")) break;

    const b = getBodies(state.t);
    idealTliRelVel(state, tliDv, vIdeal);
    sub(_relV, state.vel, b.earthVel);
    vGo.x = vIdeal.x - _relV.x;
    vGo.y = vIdeal.y - _relV.y;
    vGo.z = vIdeal.z - _relV.z;
    const go = len(vGo);
    if (go < 0.012) break; // ~12 m/s residual

    const aCmd = Math.min(aNom, Math.max(go / dt, 0.002));
    let aStep = aCmd;
    let forceN = 0;
    if (prop) {
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      aStep = lim.aKmS2;
      forceN = lim.forceN;
      if (forceN < 1e-3) break;
    }
    normalize(_pro, vGo);
    const ax = _pro.x * aStep;
    const ay = _pro.y * aStep;
    const az = _pro.z * aStep;

    const thrustFn: ThrustFn = () => set(_thrust, ax, ay, az);

    const step = Math.min(dt, tHardCap - state.t);
    const tBefore = state.t;
    rk4Step(state, step, thrustFn);
    delivered += aStep * step;

    if (prop && forceN > 0) {
      prop.lastT = tBefore;
      burnForce(prop, state.t, forceN, "ship");
    }

    if (samples && lastT) {
      pushSample(
        samples,
        state,
        "tli",
        true,
        false,
        0.8,
        lastT,
        prop,
        aStep,
        "ship",
        false,
      );
    }
  }

  // Snap residual velocity-to-go so coast matches design inject
  {
    const b = getBodies(state.t);
    idealTliRelVel(state, tliDv, vIdeal);
    state.vel.x = b.earthVel.x + vIdeal.x;
    state.vel.y = b.earthVel.y + vIdeal.y;
    state.vel.z = b.earthVel.z + vIdeal.z;
  }

  if (samples && lastT) {
    pushSample(
      samples,
      state,
      "tli",
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

  return {
    dvDelivered: delivered,
    burnS: state.t - tIgnition,
    accel: aNom,
  };
}

/** Build osculating Kepler orbit about Earth right after TLI (2-body reference). */
export function orbitAfterTli(state: CraftState): KeplerOrbit {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.earth);
  sub(_relV, state.vel, b.earthVel);
  return rvToKepler(_relP, _relV, MU_EARTH, state.t);
}

/**
 * Optional design ellipse: coplanar Hohmann-class at current r.
 * Prefer runFiniteTli + transferVPeri cap for free-coast missions.
 */
export function designApogeeTransferOrbit(state: CraftState): KeplerOrbit {
  const t0 = state.t;
  const b = getBodies(t0);
  sub(_relP, state.pos, b.earth);
  const r = Math.max(len(_relP), R_EARTH + 100);
  transferPlaneNormal(t0, _n);
  progradeInPlane(_relP, _n, _pro);
  const xfer = lroTransfer();
  const vPeri = transferVPeri(r, xfer.tliDv);
  scale(_relV, _pro, vPeri);
  return rvToKepler(_relP, _relV, MU_EARTH, t0);
}
