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
function newtonE(E: number, e: number, m: number): number {
  for (let k = 0; k < 16; k++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

export function solveEccentricAnomaly(M: number, e: number): number {
  const m = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const E0 = e < 0.8 ? m : Math.PI * Math.sign(m || 1);
  return newtonE(E0, e, m);
}

/**
 * Convert Earth-relative position & velocity to classical elements.
 * Assumes bound elliptical orbit (e < 1).
 */
function nodeOm(_hLen: number): { nLen: number; Om: number } {
  void _hLen;
  set(_n, -_h.y, _h.x, 0);
  const nLen = len(_n);
  if (nLen < 1e-12) return { nLen, Om: 0 };
  let Om = Math.acos(clamp(_n.x / nLen, -1, 1));
  if (_n.y < 0) Om = 2 * Math.PI - Om;
  return { nLen, Om };
}

function eccVector(r: V3, v: V3, R: number, V: number, vr: number, mu: number): number {
  const v2 = V * V;
  _eVec.x = ((v2 - mu / R) * r.x - vr * R * v.x) / mu;
  _eVec.y = ((v2 - mu / R) * r.y - vr * R * v.y) / mu;
  _eVec.z = ((v2 - mu / R) * r.z - vr * R * v.z) / mu;
  return len(_eVec);
}

function argPeri(nLen: number, e: number): number {
  if (nLen < 1e-12) {
    const w = Math.atan2(_eVec.y, _eVec.x);
    return w < 0 ? w + 2 * Math.PI : w;
  }
  if (e > 1e-10) {
    const w = Math.acos(clamp(dot(_n, _eVec) / (nLen * e), -1, 1));
    return _eVec.z < 0 ? 2 * Math.PI - w : w;
  }
  return 0;
}

function anomalyFromUnit(a: V3, r: V3, scale: number, flip: boolean): number {
  const nu = Math.acos(clamp(dot(a, r) / scale, -1, 1));
  return flip ? 2 * Math.PI - nu : nu;
}

function trueAnomaly(r: V3, R: number, vr: number, e: number, nLen: number): number {
  if (e > 1e-10) return anomalyFromUnit(_eVec, r, e * R, vr < 0);
  if (nLen > 1e-12) return anomalyFromUnit(_n, r, nLen * R, r.z < 0);
  const nu = Math.atan2(r.y, r.x);
  return nu < 0 ? nu + 2 * Math.PI : nu;
}

function meanFromTrue(e: number, nu: number): number {
  const cosE = clamp((e + Math.cos(nu)) / (1 + e * Math.cos(nu)), -1, 1);
  let E = Math.acos(cosE);
  if (nu > Math.PI) E = 2 * Math.PI - E;
  return E - e * Math.sin(E);
}

export function rvToKepler(r: V3, v: V3, mu: number, t0: number): KeplerOrbit {
  const R = len(r), V = len(v), vr = dot(r, v) / R;
  cross(_h, r, v);
  const h = len(_h), i = Math.acos(clamp(_h.z / h, -1, 1));
  const { nLen, Om } = nodeOm(h), e = eccVector(r, v, R, V, vr, mu);
  const w = argPeri(nLen, e), nu = trueAnomaly(r, R, vr, e, nLen);
  return { a: 1 / (2 / R - (V * V) / mu), e, i, Om, w, M0: meanFromTrue(e, nu), t0, mu };
}

/**
 * Propagate Kepler orbit to time t; returns Earth-relative r, v.
 */
type RotBasis = {
  cosO: number; sinO: number; cosi: number; sini: number; cosw: number; sinw: number;
};

function rotBasis(Om: number, i: number, w: number): RotBasis {
  return {
    cosO: Math.cos(Om), sinO: Math.sin(Om),
    cosi: Math.cos(i), sini: Math.sin(i),
    cosw: Math.cos(w), sinw: Math.sin(w),
  };
}

function rot(x: number, y: number, b: RotBasis, out: V3): void {
  const x1 = b.cosw * x - b.sinw * y;
  const y1 = b.sinw * x + b.cosw * y;
  const y2 = y1 * b.cosi, z2 = y1 * b.sini;
  out.x = b.cosO * x1 - b.sinO * y2;
  out.y = b.sinO * x1 + b.cosO * y2;
  out.z = z2;
}

function perifocalRV(a: number, e: number, E: number, mu: number) {
  const cosE = Math.cos(E), sinE = Math.sin(E), den = 1 - e * cosE;
  const cosNu = (cosE - e) / den, sinNu = (Math.sqrt(Math.max(0, 1 - e * e)) * sinE) / den;
  const rPerif = a * den, sp = Math.sqrt(mu / (a * (1 - e * e)));
  return { xp: rPerif * cosNu, yp: rPerif * sinNu, vxp: -sp * sinNu, vyp: sp * (e + cosNu) };
}

export function keplerRvAt(
  orb: KeplerOrbit, t: number, outR: V3 = v3(), outV: V3 = v3(),
): { r: V3; v: V3 } {
  const { a, e, i, Om, w, M0, t0, mu } = orb;
  const n = Math.sqrt(mu / (a * a * a));
  const E = solveEccentricAnomaly(M0 + n * (t - t0), e);
  const pf = perifocalRV(a, e, E, mu);
  const b = rotBasis(Om, i, w);
  rot(pf.xp, pf.yp, b, outR);
  rot(pf.vxp, pf.vyp, b, outV);
  return { r: outR, v: outV };
}

/** Sample smooth points along a Kepler arc from t0 to t1 (inclusive). */
function sampleKeplerPoint(orb: KeplerOrbit, t: number): { t: number; r: V3; v: V3 } {
  const rr = v3(), vv = v3();
  keplerRvAt(orb, t, rr, vv);
  return { t, r: { x: rr.x, y: rr.y, z: rr.z }, v: { x: vv.x, y: vv.y, z: vv.z } };
}

export function sampleKeplerArc(
  orb: KeplerOrbit, t0: number, t1: number, count: number,
): { t: number; r: V3; v: V3 }[] {
  const out: { t: number; r: V3; v: V3 }[] = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) out.push(sampleKeplerPoint(orb, t0 + (t1 - t0) * (i / (n - 1))));
  return out;
}

