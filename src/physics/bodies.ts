import {
  A_EM,
  AU,
  MASS_RATIO_ME,
  MOON_ARG_PERI,
  MOON_ARG_PERI_DOT,
  MOON_ECC,
  MOON_ELEMENT_EPOCH_UTC_MS,
  MOON_INCLINATION,
  MOON_NODE,
  MOON_NODE_DOT,
  MOON_OBLIQUITY,
  MU_EARTH,
  MU_EM_ORB,
  MU_MOON,
  N_EARTH_SUN,
  N_MOON,
  R_MOON,
} from "./constants";
import {
  DEFAULT_EPHEMERIS,
  epochUsesHorizons,
  type EphemerisEpoch,
} from "./ephemerisEpoch";
import { interpolateHorizons } from "./horizonsEpoch";
import { keplerRvAt, rvToKepler } from "./kepler";
import { cross, len, set, type V3, v3 } from "./vec3";

/** Two-body μ for Earth–Moon relative motion (osculating ring). */
const MU_EM_REL = MU_EARTH + MU_MOON;

/** Earth orbital eccentricity (approx IAU) — used for the green orbit ribbon. */
const EARTH_ORB_E = 0.016_708_6;

/**
 * Prescribed body positions in a **heliocentric** theater frame (Sun ≈ origin,
 * ecliptic J2000 XY).
 *
 * Prefer **JPL Horizons (DE441)** samples for the July 2027 window when
 * `epoch.useHorizons` and `horizons-epoch.json` is present. Falls back to
 * analytic circular Earth + Keplerian Moon otherwise.
 *
 * - Sun fixed at origin
 * - Earth / Moon from Horizons (or analytic EM bary on 1 AU circle)
 * - `epoch.moonPhase0` / `epoch.sunPhase0` drive the analytic fallback
 */

export type BodyState = {
  sun: V3;
  earth: V3;
  moon: V3;
  earthVel: V3;
  moonVel: V3;
};

const _sun = v3();
const _earth = v3();
const _moon = v3();
const _earthVel = v3();
const _moonVel = v3();

/** Solve Kepler’s equation M = E − e sin E (elliptical). */
function eccentricAnomaly(M: number, e: number): number {
  const m = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

type MoonRel = { pos: V3; vel: V3; r: number; nu: number; E: number };

function moonRelFromScratch(): MoonRel {
  const r = len(_moon);
  const nu = Math.atan2(_moon.y, _moon.x);
  return {
    pos: { x: _moon.x, y: _moon.y, z: _moon.z },
    vel: { x: _moonVel.x, y: _moonVel.y, z: _moonVel.z },
    r, nu, E: nu,
  };
}

/** Horizons path when M0 matches live epoch phase. */
function tryMoonRelHorizons(
  t: number,
  epoch: EphemerisEpoch,
  M0: number,
): MoonRel | null {
  if (!epochUsesHorizons(epoch) || Math.abs(M0 - epoch.moonPhase0) >= 1e-12) return null;
  if (!interpolateHorizons(t, epoch, _earth, _earthVel, _moon, _moonVel)) {
    return null;
  }
  return moonRelFromScratch();
}

/** Perifocal (xp, yp) and velocity from true anomaly. */
function perifocalRv(
  r: number, nu: number, a: number, e: number,
): { xp: number; yp: number; vxp: number; vyp: number } {
  const cosNu_ = Math.cos(nu);
  const sinNu_ = Math.sin(nu);
  const sp = Math.sqrt(MU_EM_ORB / (a * (1 - e * e)));
  return { xp: r * cosNu_, yp: r * sinNu_, vxp: -sp * sinNu_, vyp: sp * (e + cosNu_) };
}

/** Seconds from the analytic lunar-element epoch (2027-07-20 landing). */
function moonElementDtS(t: number, epoch: EphemerisEpoch): number {
  if (epoch.clockUtcMsAtT0 != null) {
    return (epoch.clockUtcMsAtT0 - MOON_ELEMENT_EPOCH_UTC_MS) / 1000 + t;
  }
  return t - epoch.horizonsLandingT;
}

/** Osculating Ω (rad) on the analytic Kepler Moon. */
export function moonNodeAt(t: number, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): number {
  return MOON_NODE + MOON_NODE_DOT * moonElementDtS(t, epoch);
}

/** Osculating ω (rad) on the analytic Kepler Moon. */
export function moonArgPeriAt(t: number, epoch: EphemerisEpoch = DEFAULT_EPHEMERIS): number {
  return MOON_ARG_PERI + MOON_ARG_PERI_DOT * moonElementDtS(t, epoch);
}

/** Rotate perifocal XY → ecliptic via R_z(Ω) R_x(i) R_z(ω). */
function rotatePerifocalToEcliptic(
  xp: number, yp: number, Ω: number, ω: number,
): { x: number; y: number; z: number } {
  const cosΩ = Math.cos(Ω); const sinΩ = Math.sin(Ω);
  const cosi = Math.cos(MOON_INCLINATION); const sini = Math.sin(MOON_INCLINATION);
  const cosω = Math.cos(ω); const sinω = Math.sin(ω);
  const x1 = cosω * xp - sinω * yp;
  const y1 = sinω * xp + cosω * yp;
  return { x: cosΩ * x1 - sinΩ * y1 * cosi, y: sinΩ * x1 + cosΩ * y1 * cosi, z: y1 * sini };
}

function trueAnomalyFromE(E: number, e: number): number {
  const cosE = Math.cos(E); const sinE = Math.sin(E);
  const sinNu = (Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE);
  const cosNu = (cosE - e) / (1 - e * cosE);
  return Math.atan2(sinNu, cosNu);
}

/** Analytic Keplerian Moon relative to Earth. */
function moonRelAnalytic(t: number, epoch: EphemerisEpoch, M0: number): MoonRel {
  const a = A_EM; const e = MOON_ECC;
  const E = eccentricAnomaly(M0 + N_MOON * t, e);
  const r = a * (1 - e * Math.cos(E));
  const nu = trueAnomalyFromE(E, e);
  const pf = perifocalRv(r, nu, a, e);
  const Ω = moonNodeAt(t, epoch);
  const ω = moonArgPeriAt(t, epoch);
  const pos = rotatePerifocalToEcliptic(pf.xp, pf.yp, Ω, ω);
  const vel = rotatePerifocalToEcliptic(pf.vxp, pf.vyp, Ω, ω);
  return { pos, vel, r, nu, E };
}

/**
 * Moon state relative to Earth in the ecliptic frame.
 * Uses Horizons samples when the epoch enables them and M0 is the live phase;
 * otherwise Keplerian with elements from constants.
 */
export function moonRelativeToEarth(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  M0: number = epoch.moonPhase0,
): { pos: V3; vel: V3; r: number; nu: number; E: number } {
  return tryMoonRelHorizons(t, epoch, M0) ?? moonRelAnalytic(t, epoch, M0);
}

/** Ecliptic longitude of Earth→Moon (atan2 of XY), for phase / Sun geometry. */
export function moonEclipticLongitude(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  M0: number = epoch.moonPhase0,
): number {
  const rel = moonRelativeToEarth(t, epoch, M0);
  return Math.atan2(rel.pos.y, rel.pos.x);
}

function addEarthToMoonScratch(): void {
  _moon.x += _earth.x; _moon.y += _earth.y; _moon.z += _earth.z;
  _moonVel.x += _earthVel.x; _moonVel.y += _earthVel.y; _moonVel.z += _earthVel.z;
}

/** Fill scratch Earth/Moon from Horizons (heliocentric Moon). */
function fillBodiesFromHorizons(t: number, epoch: EphemerisEpoch): boolean {
  if (!epochUsesHorizons(epoch)) return false;
  if (!interpolateHorizons(t, epoch, _earth, _earthVel, _moon, _moonVel)) {
    return false;
  }
  addEarthToMoonScratch();
  return true;
}

function barycentricEarthMoon(
  bx: number, by: number, bvx: number, bvy: number,
  kE: number, kM: number, rel: MoonRel,
): void {
  set(_earth, bx - kE * rel.pos.x, by - kE * rel.pos.y, -kE * rel.pos.z);
  set(_moon, bx + kM * rel.pos.x, by + kM * rel.pos.y, kM * rel.pos.z);
  set(_earthVel, bvx - kE * rel.vel.x, bvy - kE * rel.vel.y, -kE * rel.vel.z);
  set(_moonVel, bvx + kM * rel.vel.x, bvy + kM * rel.vel.y, kM * rel.vel.z);
}

/** Analytic circular Earth + Keplerian Moon into scratch. */
function fillBodiesAnalytic(t: number, epoch: EphemerisEpoch): void {
  const rel = moonRelativeToEarth(t, epoch);
  const kM = 1 / (1 + MASS_RATIO_ME);
  const kE = MASS_RATIO_ME / (1 + MASS_RATIO_ME);
  const θ = epoch.sunPhase0 + N_EARTH_SUN * t;
  const cosθ = Math.cos(θ); const sinθ = Math.sin(θ);
  const r = AU; const vOrb = N_EARTH_SUN * r;
  barycentricEarthMoon(r * cosθ, r * sinθ, -vOrb * sinθ, vOrb * cosθ, kE, kM, rel);
}

function copyScratchInto(out: BodyState): BodyState {
  set(out.sun, _sun.x, _sun.y, _sun.z);
  set(out.earth, _earth.x, _earth.y, _earth.z);
  set(out.moon, _moon.x, _moon.y, _moon.z);
  set(out.earthVel, _earthVel.x, _earthVel.y, _earthVel.z);
  set(out.moonVel, _moonVel.x, _moonVel.y, _moonVel.z);
  return out;
}

/** Copy scratch bodies into caller buffer or fresh object. */
function copyBodyState(out?: BodyState): BodyState {
  if (out) return copyScratchInto(out);
  return {
    sun: { ..._sun }, earth: { ..._earth }, moon: { ..._moon },
    earthVel: { ..._earthVel }, moonVel: { ..._moonVel },
  };
}

export function bodyPositions(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  out?: BodyState,
): BodyState {
  set(_sun, 0, 0, 0);
  if (!fillBodiesFromHorizons(t, epoch)) fillBodiesAnalytic(t, epoch);
  return copyBodyState(out);
}

/** Unit vector Earth → Moon at time t. */
export function earthMoonUnit(
  t: number,
  out: V3,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): V3 {
  const rel = moonRelativeToEarth(t, epoch);
  const inv = 1 / rel.r;
  return set(out, rel.pos.x * inv, rel.pos.y * inv, rel.pos.z * inv);
}

/**
 * Lunar north unit vector in the ecliptic/inertial frame.
 * Matches scene orientation: tilt MOON_OBLIQUITY from +Z toward +X.
 */
export function moonNorthUnit(out: V3 = v3()): V3 {
  return set(
    out,
    Math.sin(MOON_OBLIQUITY),
    0,
    Math.cos(MOON_OBLIQUITY),
  );
}

/** Lunar south unit vector (Artemis-style polar target). */
export function moonSouthUnit(out: V3 = v3()): V3 {
  moonNorthUnit(out);
  return set(out, -out.x, -out.y, -out.z);
}

/** Inertial position of the lunar south pole on the mean surface at time t. */
export function moonSouthPoleSurface(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  out: V3 = v3(),
): V3 {
  const b = bodyPositions(t, epoch);
  moonSouthUnit(out);
  return set(
    out,
    b.moon.x + out.x * R_MOON,
    b.moon.y + out.y * R_MOON,
    b.moon.z + out.z * R_MOON,
  );
}

/**
 * Longitude of perihelion ϖ (rad) for the Earth orbit ribbon.
 * Fitted so the ellipse passes through Horizons Earth near landing (July ≈
 * aphelion). Falls back to the classic ~102.9° value.
 */
function earthPerihelionLongitude(epoch: EphemerisEpoch): number {
  const ep = v3(); const ev = v3(); const mp = v3(); const mv = v3();
  const tLand = epoch.horizonsLandingT;
  if (!epochUsesHorizons(epoch) || !interpolateHorizons(tLand, epoch, ep, ev, mp, mv)) {
    return (102.9 * Math.PI) / 180;
  }
  return fitPerihelionFromEarthPos(ep);
}

function wrapAboutClassic(ang: number, classic: number): number {
  return ((((ang - classic) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

/** Fit ϖ from heliocentric Earth position near aphelion. */
function fitPerihelionFromEarthPos(ep: V3): number {
  const e = EARTH_ORB_E;
  const r = Math.hypot(ep.x, ep.y, ep.z);
  const cosNu = Math.max(-1, Math.min(1, (AU * (1 - e * e) / r - 1) / e));
  const nu = Math.acos(cosNu);
  const lon = Math.atan2(ep.y, ep.x);
  const classic = (102.9 * Math.PI) / 180;
  const plus = lon - nu; const minus = lon + nu;
  return Math.abs(wrapAboutClassic(minus, classic)) < Math.abs(wrapAboutClassic(plus, classic)) ? minus : plus;
}

/**
 * Sample `n + 1` points evenly over a curve parameter in [0, 1].
 *
 * Ring / path builders share this so the inclusive end point (needed to close a
 * loop) is written once rather than in every fencepost loop.
 */
function ringPoints(n: number, at: (u: number) => V3): V3[] {
  return Array.from({ length: n + 1 }, (_unused, i) => at(i / n));
}

/**
 * Moon’s heliocentric trail over the mission window [0, durationS].
 * Uses the same ephemeris as bodyPositions (Horizons when available).
 */
export function moonPathThroughSim(
  durationS: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  samples = 512,
): V3[] {
  const dur = Math.max(durationS, 1);
  return ringPoints(Math.max(2, samples), (u) => {
    const b = bodyPositions(u * dur, epoch);
    return { x: b.moon.x, y: b.moon.y, z: b.moon.z };
  });
}

const _oscR = v3();
const _oscV = v3();
const _circE1 = v3();
const _circE2 = v3();
const _circH = v3();

/**
 * Closed Earth-relative orbit through the Moon at time `t`.
 *
 * Uses the osculating two-body ellipse from the current geocentric r,v
 * (always intersects the Moon). If the state is unbound or degenerate,
 * falls back to a circle of radius |r| in the r×v plane (also through Moon).
 * Parent under the Earth group so the ring co-moves with Earth.
 */
export function osculatingMoonOrbitPoints(
  t: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  samples = 256,
): V3[] {
  const rel = moonRelativeToEarth(t, epoch);
  const n = Math.max(8, samples);
  if (!(len(rel.pos) > 1e-6) || !(len(rel.vel) > 1e-12)) {
    return circleThroughMoon(rel.pos, rel.vel, n);
  }
  return osculatingEllipseOrCircle(rel, t, n);
}

function boundKeplerPeriod(orb: ReturnType<typeof rvToKepler>): number | null {
  if (!(orb.a > 0) || !(orb.e < 1) || !Number.isFinite(orb.a)) return null;
  const period = 2 * Math.PI * Math.sqrt((orb.a * orb.a * orb.a) / MU_EM_REL);
  if (!(period > 0) || !Number.isFinite(period)) return null;
  return period;
}

/** Bound Kepler ring or circle fallback through Moon. */
function osculatingEllipseOrCircle(
  rel: { pos: V3; vel: V3 },
  t: number,
  n: number,
): V3[] {
  const R = len(rel.pos);
  const energy = 0.5 * len(rel.vel) ** 2 - MU_EM_REL / R;
  if (energy >= 0) return circleThroughMoon(rel.pos, rel.vel, n);
  const orb = rvToKepler(rel.pos, rel.vel, MU_EM_REL, t);
  const period = boundKeplerPeriod(orb);
  if (period == null) return circleThroughMoon(rel.pos, rel.vel, n);
  return sampleKeplerPeriod(orb, t, period, n);
}

/** Sample one orbital period of a Kepler orbit. */
function sampleKeplerPeriod(
  orb: ReturnType<typeof rvToKepler>,
  t: number,
  period: number,
  n: number,
): V3[] {
  return ringPoints(n, (u) => {
    keplerRvAt(orb, t + u * period, _oscR, _oscV);
    return { x: _oscR.x, y: _oscR.y, z: _oscR.z };
  });
}

/** Build orthonormal e1,e2 in the r×v plane. */
function planeBasisFromRv(pos: V3, vel: V3, r: number): void {
  set(_circE1, pos.x / r, pos.y / r, pos.z / r); cross(_circH, pos, vel);
  if (len(_circH) < 1e-12) {
    if (Math.abs(_circE1.z) < 0.9) set(_circH, 0, 0, 1);
    else set(_circH, 1, 0, 0);
  }
  cross(_circE2, _circH, _circE1);
  const e2Len = len(_circE2);
  if (e2Len < 1e-12) set(_circE2, -_circE1.y, _circE1.x, 0);
  else set(_circE2, _circE2.x / e2Len, _circE2.y / e2Len, _circE2.z / e2Len);
}

function zeroRing(samples: number): V3[] {
  return ringPoints(samples, () => ({ x: 0, y: 0, z: 0 }));
}

function circlePoint(r: number, θ: number): V3 {
  const c = Math.cos(θ); const s = Math.sin(θ);
  return { x: r * (_circE1.x * c + _circE2.x * s), y: r * (_circE1.y * c + _circE2.y * s), z: r * (_circE1.z * c + _circE2.z * s) };
}

/** Circle of radius |r| in the plane of r×v, starting at the Moon. */
function circleThroughMoon(pos: V3, vel: V3, samples: number): V3[] {
  const r = len(pos);
  if (!(r > 1e-6)) return zeroRing(samples);
  planeBasisFromRv(pos, vel, r);
  return ringPoints(samples, (u) => circlePoint(r, u * 2 * Math.PI));
}

function ellipsePoint(p: number, e: number, ϖ: number, ν: number): V3 {
  const r = p / (1 + e * Math.cos(ν));
  const lon = ϖ + ν;
  return { x: r * Math.cos(lon), y: r * Math.sin(lon), z: 0 };
}

/** Eccentric Earth orbit ring (Horizons-fitted ϖ). */
function earthOrbitEllipsePoints(epoch: EphemerisEpoch, samples: number): V3[] {
  const e = EARTH_ORB_E;
  const p = AU * (1 - e * e);
  const ϖ = earthPerihelionLongitude(epoch);
  return ringPoints(samples, (u) => ellipsePoint(p, e, ϖ, u * 2 * Math.PI));
}

/** Circular 1 AU Earth orbit (analytic fallback). */
function earthOrbitCirclePoints(samples: number): V3[] {
  return ringPoints(samples, (u) => {
    const theta = u * 2 * Math.PI;
    return { x: AU * Math.cos(theta), y: AU * Math.sin(theta), z: 0 };
  });
}

/**
 * Earth’s heliocentric orbit about the Sun (origin) in the ecliptic (XY).
 *
 * With Horizons: eccentric ellipse (e≈0.0167) with ϖ fitted so July DE441
 * Earth sits on the green ring (circular 1 AU is ~2.4e6 km low at aphelion).
 * Analytic fallback: circle of radius AU.
 */
export function earthOrbitPathPoints(
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
  samples = 256,
): V3[] {
  if (epochUsesHorizons(epoch)) return earthOrbitEllipsePoints(epoch, samples);
  return earthOrbitCirclePoints(samples);
}
