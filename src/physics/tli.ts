import {
  A_EM,
  LEO_RADIUS,
  MU_EARTH,
  R_EARTH,
} from "./constants";
import { moonRelativeToEarth } from "./bodies";
import { getBodies, type CraftState } from "./integrator";
import { rvToKepler, type KeplerOrbit } from "./kepler";
import {
  cross,
  dot,
  len,
  normalize,
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
const _up = v3(0, 0, 1);

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

/**
 * LRO-style TLI: inject onto a **Keplerian ellipse in the Moon’s orbital plane**
 * with periapsis at LEO opposite the predicted Moon, apogee at lunar distance.
 *
 * The craft meets the Moon at the same place and time it reaches apogee —
 * a smooth coplanar arc like the LRO magenta path, not an out-of-plane
 * southbound miss that needs a hard correction.
 */
export function applyTli(state: CraftState, tliDv: number): void {
  const t0 = state.t;
  const T = transferTimeEst();
  const b0 = getBodies(t0);

  // Moon state relative to Earth at arrival (apogee target)
  const moonArr = moonRelativeToEarth(t0 + T);
  // Lunar orbital plane from current Moon motion
  const moonNow = moonRelativeToEarth(t0);
  cross(_tangent, moonNow.pos, moonNow.vel); // n raw
  if (len(_tangent) < 1e-12) {
    cross(_tangent, moonArr.pos, moonArr.vel);
  }
  if (len(_tangent) < 1e-12) set(_tangent, _up.x, _up.y, _up.z);
  normalize(_tangent, _tangent); // lunar plane normal n

  // Apogee direction = Moon at arrival (projected into lunar plane)
  set(_tmp, moonArr.pos.x, moonArr.pos.y, moonArr.pos.z);
  // Remove any out-of-plane component
  const nDot = dot(_tmp, _tangent);
  _tmp.x -= _tangent.x * nDot;
  _tmp.y -= _tangent.y * nDot;
  _tmp.z -= _tangent.z * nDot;
  normalize(_radial, _tmp); // apo-hat

  // Periapsis opposite apogee (Hohmann geometry)
  const periX = -_radial.x;
  const periY = -_radial.y;
  const periZ = -_radial.z;

  // Prograde at periapsis: n × peri_hat — same orbital sense as the Moon
  // (Moon: v ∥ n × r with this n). Do NOT flip; that caused retrograde TLI.
  set(_relP, periX, periY, periZ);
  cross(_tmp, _tangent, _relP);
  normalize(_relV, _tmp);

  const r = LEO_RADIUS;
  const vPeri = transferVPeri(r, tliDv);

  // Prefer continuous position: LEO coast aims at periapsis — velocity-only TLI
  sub(_relP, state.pos, b0.earth);
  const rNow = len(_relP);
  normalize(_radial, _relP);
  const align = periX * _radial.x + periY * _radial.y + periZ * _radial.z;
  if (align > 0.8 && rNow > R_EARTH + 100) {
    // Prograde at current radius: n × r̂
    cross(_tmp, _tangent, _radial);
    normalize(_relV, _tmp);
    state.vel.x = b0.earthVel.x + _relV.x * vPeri;
    state.vel.y = b0.earthVel.y + _relV.y * vPeri;
    state.vel.z = b0.earthVel.z + _relV.z * vPeri;
    // Keep altitude exact circular LEO
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
  void moonNow;
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
