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
const _aim = v3();

/**
 * LRO-style direct lunar transfer (near min-energy).
 *
 * LRO flew a ~4.5-day direct TLI→Moon path aimed for lunar approach / LOI,
 * not a free-return and not an Earth ellipse whose apogee sits well beyond
 * the Moon. We target apogee ≈ mean lunar distance so the craft reaches the
 * Moon near the high point of the transfer (r ≈ A_EM), with only the smallest
 * Δv bump the 4-body model needs for intercept.
 *
 * Pure Hohmann LEO→A_EM is ~5.0 d half-period; LRO was slightly faster.
 * Design: ra = A_EM (no intentional overshoot); TOF = half-period.
 */
export function lroTransfer(): {
  ra: number;
  a: number;
  tliDv: number;
  tof: number;
  vPeri: number;
} {
  const rp = LEO_RADIUS;
  // Apogee at the Moon — do not aim past lunar orbit
  const ra = A_EM;
  const a = 0.5 * (rp + ra);
  const vLeo = Math.sqrt(MU_EARTH / rp);
  const vPeri = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  const tof = Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
  return { ra, a, tliDv: vPeri - vLeo, tof, vPeri };
}

export function transferTimeEst(): number {
  return lroTransfer().tof;
}

/** Periapsis speed = circular LEO + TLI Δv (elliptical: strictly below escape). */
export function transferVPeri(r: number, tliDv: number): number {
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vEsc = Math.sqrt((2 * MU_EARTH) / r);
  // Safety only — must not clip pure Hohmann (≈0.97× escape Δv)
  const dvMax = (vEsc - vCirc) * 0.999;
  return vCirc + Math.min(tliDv, dvMax);
}

/** Earth-centered radius of transfer apogee for a given periapsis Δv. */
export function apogeeFromTliDv(r: number, tliDv: number): number {
  const v = transferVPeri(r, tliDv);
  const invA = 2 / r - (v * v) / MU_EARTH;
  if (invA <= 1e-12) return Infinity;
  const a = 1 / invA;
  return 2 * a - r;
}

/** Max TLI Δv from LEO (km/s) for search ladder (keep near Hohmann). */
export function maxTliDv(r = LEO_RADIUS): number {
  const base = lroTransfer().tliDv;
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vEsc = Math.sqrt((2 * MU_EARTH) / r);
  const escMargin = (vEsc - vCirc) * 0.999;
  // Allow only a few % above Hohmann — LRO is not a high-energy lob
  return Math.min(escMargin, base * 1.04);
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
 * at arrival (where the Moon will be). LRO-style free coast is aimed here
 * from TLI; no midcourse TCMs.
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
 * Transfer-plane normal for south-pole rendezvous (unit).
 * Plane through Earth and the south-pole aim at arrival, prograde sense
 * matching lunar motion / LEO dogleg.
 */
export function transferPlaneNormal(t: number, out: V3): V3 {
  const T = transferTimeEst();
  const moonArr = moonRelativeToEarth(t + T);
  lunarPlaneNormal(t, _n);
  southPoleRendezvousAim(t, _aim);

  // Plane through Earth & south-pole aim, prograde-aligned with lunar motion
  cross(out, _aim, moonArr.vel);
  if (len(out) < 1e-12) {
    cross(_pro, _n, moonArr.pos);
    cross(out, _aim, _pro);
  }
  if (len(out) < 1e-12) {
    set(out, _n.x, _n.y, _n.z);
  }
  normalize(out, out);
  // Keep same hemisphere as lunar north so inject sense matches LEO dogleg
  if (dot(out, _n) < 0) scale(out, out, -1);
  return out;
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

  // Periapsis opposite the south-pole aim (apogee toward rendezvous)
  southPoleRendezvousAim(t0, _tmp);
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
 * Earth-relative position (south-biased transfer-plane prograde × v_peri).
 * No teleport.
 */
function idealTliRelVel(state: CraftState, tliDv: number, out: V3): V3 {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.earth);
  const r = Math.max(len(_relP), R_EARTH + 100);
  transferPlaneNormal(state.t, _n);
  progradeInPlane(_relP, _n, _pro);
  const vPeri = transferVPeri(r, tliDv);
  return scale(out, _pro, vPeri);
}

/**
 * Finite TLI burn under capped ship acceleration.
 *
 * Starts from current LEO (no position teleport). Thrusts along
 * **velocity-to-go** toward the impulsive LRO inject velocity until the
 * Earth-relative residual is small — so intercept geometry matches the
 * design transfer while the HUD sees a multi-minute burn + plume.
 *
 * Duration is typically ~2–4 min at TLI_ACCEL (gravity losses extend slightly).
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
    // Recompute ideal inject velocity at current r (updates as we arc)
    idealTliRelVel(state, tliDv, vIdeal);
    sub(_relV, state.vel, b.earthVel);
    vGo.x = vIdeal.x - _relV.x;
    vGo.y = vIdeal.y - _relV.y;
    vGo.z = vIdeal.z - _relV.z;
    const go = len(vGo);
    if (go < 0.012) break; // ~12 m/s residual — close enough

    const aCmd = Math.min(aNom, Math.max(go / dt, 0.002));
    // Mass-coupled: a = F/m ≤ peak ship thrust
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
      // Mass already drained via burnForce — record without double-drain
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

  // Snap residual velocity-to-go (tiny) so coast matches design inject
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

/** Scratch export for callers that need a temp vector (avoid shared state). */
export function tliScratchRelP(): V3 {
  return _relP;
}
