/**
 * Two-body Kepler utilities (Earth-centered) for smooth transfer sampling.
 * Units: km, s, km³/s².
 */

import { cross, dot, len, set, type V3, v3 } from "./vec3";

export type KeplerOrbit = {
  a: number;
  e: number;
  i: number;
  Om: number; // Ω longitude of ascending node
  w: number; // ω argument of periapsis
  /** Mean anomaly at epoch t0 */
  M0: number;
  t0: number;
  mu: number;
};

const _h = v3();
const _n = v3();
const _eVec = v3();

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Solve Kepler’s equation M = E − e sin E. */
export function solveEccentricAnomaly(M: number, e: number): number {
  let m = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  for (let k = 0; k < 16; k++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/**
 * Convert Earth-relative position & velocity to classical elements.
 * Assumes bound elliptical orbit (e < 1).
 */
export function rvToKepler(r: V3, v: V3, mu: number, t0: number): KeplerOrbit {
  const R = len(r);
  const V = len(v);
  const vr = dot(r, v) / R;

  cross(_h, r, v);
  const h = len(_h);
  const i = Math.acos(clamp(_h.z / h, -1, 1));

  // Node vector n = k̂ × h
  set(_n, -_h.y, _h.x, 0);
  const nLen = len(_n);
  let Om: number;
  if (nLen < 1e-12) {
    Om = 0; // equatorial
  } else {
    Om = Math.acos(clamp(_n.x / nLen, -1, 1));
    if (_n.y < 0) Om = 2 * Math.PI - Om;
  }

  // Eccentricity vector
  // e = ((v² − μ/r) r − (r·v) v) / μ
  const v2 = V * V;
  _eVec.x = ((v2 - mu / R) * r.x - vr * R * v.x) / mu;
  _eVec.y = ((v2 - mu / R) * r.y - vr * R * v.y) / mu;
  _eVec.z = ((v2 - mu / R) * r.z - vr * R * v.z) / mu;
  const e = len(_eVec);

  let w: number;
  if (nLen < 1e-12) {
    // Argument of periapsis measured from x-axis
    w = Math.atan2(_eVec.y, _eVec.x);
    if (w < 0) w += 2 * Math.PI;
  } else if (e > 1e-10) {
    w = Math.acos(clamp(dot(_n, _eVec) / (nLen * e), -1, 1));
    if (_eVec.z < 0) w = 2 * Math.PI - w;
  } else {
    w = 0;
  }

  // True anomaly
  let nu: number;
  if (e > 1e-10) {
    nu = Math.acos(clamp(dot(_eVec, r) / (e * R), -1, 1));
    if (vr < 0) nu = 2 * Math.PI - nu;
  } else if (nLen > 1e-12) {
    nu = Math.acos(clamp(dot(_n, r) / (nLen * R), -1, 1));
    if (r.z < 0) nu = 2 * Math.PI - nu;
  } else {
    nu = Math.atan2(r.y, r.x);
    if (nu < 0) nu += 2 * Math.PI;
  }

  // Eccentric anomaly → mean anomaly
  const cosE = clamp((e + Math.cos(nu)) / (1 + e * Math.cos(nu)), -1, 1);
  let E = Math.acos(cosE);
  if (nu > Math.PI) E = 2 * Math.PI - E;
  const M0 = E - e * Math.sin(E);

  const a = 1 / (2 / R - v2 / mu);

  return { a, e, i, Om, w, M0, t0, mu };
}

/**
 * Propagate Kepler orbit to time t; returns Earth-relative r, v.
 */
export function keplerRvAt(
  orb: KeplerOrbit,
  t: number,
  outR: V3 = v3(),
  outV: V3 = v3(),
): { r: V3; v: V3 } {
  const { a, e, i, Om, w, M0, t0, mu } = orb;
  const n = Math.sqrt(mu / (a * a * a));
  const M = M0 + n * (t - t0);
  const E = solveEccentricAnomaly(M, e);

  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const rPerif = a * (1 - e * cosE);
  // Perifocal position
  const cosNu = (cosE - e) / (1 - e * cosE);
  const sinNu =
    (Math.sqrt(Math.max(0, 1 - e * e)) * sinE) / (1 - e * cosE);
  const xp = rPerif * cosNu;
  const yp = rPerif * sinNu;

  // Perifocal velocity
  const p = a * (1 - e * e);
  const sp = Math.sqrt(mu / p);
  const vxp = -sp * sinNu;
  const vyp = sp * (e + cosNu);

  // R_z(Om) R_x(i) R_z(w)
  const cosO = Math.cos(Om);
  const sinO = Math.sin(Om);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);

  const rot = (x: number, y: number, out: V3) => {
    // R_z(w)
    const x1 = cosw * x - sinw * y;
    const y1 = sinw * x + cosw * y;
    // R_x(i)
    const x2 = x1;
    const y2 = y1 * cosi;
    const z2 = y1 * sini;
    // R_z(Om)
    out.x = cosO * x2 - sinO * y2;
    out.y = sinO * x2 + cosO * y2;
    out.z = z2;
  };

  rot(xp, yp, outR);
  rot(vxp, vyp, outV);
  return { r: outR, v: outV };
}

/** Sample smooth points along a Kepler arc from t0 to t1 (inclusive). */
export function sampleKeplerArc(
  orb: KeplerOrbit,
  t0: number,
  t1: number,
  count: number,
): { t: number; r: V3; v: V3 }[] {
  const out: { t: number; r: V3; v: V3 }[] = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const t = t0 + (t1 - t0) * u;
    const rr = v3();
    const vv = v3();
    keplerRvAt(orb, t, rr, vv);
    out.push({ t, r: { x: rr.x, y: rr.y, z: rr.z }, v: { x: vv.x, y: vv.y, z: vv.z } });
  }
  return out;
}

