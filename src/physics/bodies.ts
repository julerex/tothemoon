import {
  A_EM,
  AU,
  MASS_RATIO_ME,
  MOON_ARG_PERI,
  MOON_ECC,
  MOON_INCLINATION,
  MOON_NODE,
  MOON_OBLIQUITY,
  MU_EM_ORB,
  N_EARTH_SUN,
  N_MOON,
  R_MOON,
} from "./constants";
import {
  getMissionLandingT,
  hasHorizonsEpoch,
  interpolateHorizons,
} from "./horizonsEpoch";
import { len, set, type V3, v3 } from "./vec3";

/** Earth orbital eccentricity (approx IAU) — used for the green orbit ribbon. */
const EARTH_ORB_E = 0.016_708_6;

/**
 * Prescribed body positions in a **heliocentric** theater frame (Sun ≈ origin,
 * ecliptic J2000 XY).
 *
 * Prefer **JPL Horizons (DE441)** samples for the July 2027 window when
 * `horizons-epoch.json` is present (`scripts/fetch-horizons-epoch.ts`). Falls
 * back to analytic circular Earth + Keplerian Moon otherwise.
 *
 * - Sun fixed at origin
 * - Earth / Moon from Horizons (or analytic EM bary on 1 AU circle)
 * - moonPhase0 / sunPhase0 still used by the analytic fallback and mission search
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

/** Moon mean anomaly at t=0 (rad). Tuned by mission search. */
let moonPhase0 = 0;

/**
 * Earth mean ecliptic longitude at t=0 (rad) — heliocentric angle of the
 * EM barycenter about the Sun. Set from July 2027 epoch so landing geometry
 * is a waning gibbous (see epoch.ts).
 */
let sunPhase0 = Math.PI;

export function setMoonPhase0(phase: number): void {
  moonPhase0 = phase;
}

export function getMoonPhase0(): number {
  return moonPhase0;
}

export function setSunPhase0(phase: number): void {
  sunPhase0 = phase;
}

export function getSunPhase0(): number {
  return sunPhase0;
}

/** Solve Kepler’s equation M = E − e sin E (elliptical). */
function eccentricAnomaly(M: number, e: number): number {
  // Normalize M to (−π, π] for faster convergence
  let m = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? m : Math.PI;
  for (let i = 0; i < 12; i++) {
    const f = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    const d = f / fp;
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/**
 * Moon state relative to Earth in the ecliptic frame.
 * Uses Horizons samples when available (M0 must be the active moonPhase0);
 * otherwise Keplerian with elements from constants.
 */
export function moonRelativeToEarth(
  t: number,
  M0: number = moonPhase0,
): { pos: V3; vel: V3; r: number; nu: number; E: number } {
  // Horizons path only when using the live epoch phase (not probe offsets)
  if (hasHorizonsEpoch() && Math.abs(M0 - moonPhase0) < 1e-12) {
    if (
      interpolateHorizons(t, _earth, _earthVel, _moon, _moonVel)
    ) {
      // _moon/_moonVel temporarily hold moonRel from the table
      const r = len(_moon);
      const nu = Math.atan2(_moon.y, _moon.x);
      return {
        pos: { x: _moon.x, y: _moon.y, z: _moon.z },
        vel: { x: _moonVel.x, y: _moonVel.y, z: _moonVel.z },
        r,
        nu,
        E: nu, // true anomaly stand-in for diagnostics
      };
    }
  }

  const a = A_EM;
  const e = MOON_ECC;
  const i = MOON_INCLINATION;
  const Ω = MOON_NODE;
  const ω = MOON_ARG_PERI;
  const M = M0 + N_MOON * t;
  const E = eccentricAnomaly(M, e);

  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = a * (1 - e * cosE);

  // True anomaly
  const sinNu = (Math.sqrt(1 - e * e) * sinE) / (1 - e * cosE);
  const cosNu = (cosE - e) / (1 - e * cosE);
  const nu = Math.atan2(sinNu, cosNu);

  // Perifocal position
  const cosNu_ = Math.cos(nu);
  const sinNu_ = Math.sin(nu);
  const xp = r * cosNu_;
  const yp = r * sinNu_;

  // Perifocal velocity (μ = MU_EM_ORB, p = a(1−e²))
  const p = a * (1 - e * e);
  const sp = Math.sqrt(MU_EM_ORB / p);
  const vxp = -sp * sinNu_;
  const vyp = sp * (e + cosNu_);

  // Rotate perifocal → ecliptic: R_z(Ω) R_x(i) R_z(ω)
  const cosΩ = Math.cos(Ω);
  const sinΩ = Math.sin(Ω);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const cosω = Math.cos(ω);
  const sinω = Math.sin(ω);

  // R = R_z(Ω) · R_x(i) · R_z(ω) applied to (xp, yp, 0)
  // First R_z(ω)
  const x1 = cosω * xp - sinω * yp;
  const y1 = sinω * xp + cosω * yp;
  // R_x(i): (x1, y1 cos i, y1 sin i)
  const x2 = x1;
  const y2 = y1 * cosi;
  const z2 = y1 * sini;
  // R_z(Ω)
  const x = cosΩ * x2 - sinΩ * y2;
  const y = sinΩ * x2 + cosΩ * y2;
  const z = z2;

  // Same rotation for velocity
  const vx1 = cosω * vxp - sinω * vyp;
  const vy1 = sinω * vxp + cosω * vyp;
  const vx2 = vx1;
  const vy2 = vy1 * cosi;
  const vz2 = vy1 * sini;
  const vx = cosΩ * vx2 - sinΩ * vy2;
  const vy = sinΩ * vx2 + cosΩ * vy2;
  const vz = vz2;

  return {
    pos: { x, y, z },
    vel: { x: vx, y: vy, z: vz },
    r,
    nu,
    E,
  };
}

/** Ecliptic longitude of Earth→Moon (atan2 of XY), for phase / Sun geometry. */
export function moonEclipticLongitude(t: number, M0: number = moonPhase0): number {
  const rel = moonRelativeToEarth(t, M0);
  return Math.atan2(rel.pos.y, rel.pos.x);
}

export function bodyPositions(t: number, out?: BodyState): BodyState {
  // Sun fixed at origin (heliocentric theater)
  set(_sun, 0, 0, 0);

  // Prefer JPL Horizons samples for the July 2027 window
  if (
    hasHorizonsEpoch() &&
    interpolateHorizons(t, _earth, _earthVel, _moon, _moonVel)
  ) {
    // _moon/_moonVel hold geocentric Moon; convert to heliocentric
    _moon.x += _earth.x;
    _moon.y += _earth.y;
    _moon.z += _earth.z;
    _moonVel.x += _earthVel.x;
    _moonVel.y += _earthVel.y;
    _moonVel.z += _earthVel.z;
  } else {
    // Analytic fallback: circular Earth + Keplerian Moon
    const rel = moonRelativeToEarth(t);
    const kM = 1 / (1 + MASS_RATIO_ME);
    const kE = MASS_RATIO_ME / (1 + MASS_RATIO_ME);

    const θ = sunPhase0 + N_EARTH_SUN * t;
    const cosθ = Math.cos(θ);
    const sinθ = Math.sin(θ);
    const r = AU;
    const vOrb = N_EARTH_SUN * r;
    const bx = r * cosθ;
    const by = r * sinθ;
    const bz = 0;
    const bvx = -vOrb * sinθ;
    const bvy = vOrb * cosθ;
    const bvz = 0;

    set(
      _earth,
      bx - kE * rel.pos.x,
      by - kE * rel.pos.y,
      bz - kE * rel.pos.z,
    );
    set(
      _moon,
      bx + kM * rel.pos.x,
      by + kM * rel.pos.y,
      bz + kM * rel.pos.z,
    );
    set(
      _earthVel,
      bvx - kE * rel.vel.x,
      bvy - kE * rel.vel.y,
      bvz - kE * rel.vel.z,
    );
    set(
      _moonVel,
      bvx + kM * rel.vel.x,
      bvy + kM * rel.vel.y,
      bvz + kM * rel.vel.z,
    );
  }

  if (out) {
    set(out.sun, _sun.x, _sun.y, _sun.z);
    set(out.earth, _earth.x, _earth.y, _earth.z);
    set(out.moon, _moon.x, _moon.y, _moon.z);
    set(out.earthVel, _earthVel.x, _earthVel.y, _earthVel.z);
    set(out.moonVel, _moonVel.x, _moonVel.y, _moonVel.z);
    return out;
  }

  return {
    sun: { ..._sun },
    earth: { ..._earth },
    moon: { ..._moon },
    earthVel: { ..._earthVel },
    moonVel: { ..._moonVel },
  };
}

/** Unit vector Earth → Moon at time t. */
export function earthMoonUnit(t: number, out: V3): V3 {
  const rel = moonRelativeToEarth(t);
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
export function moonSouthPoleSurface(t: number, out: V3 = v3()): V3 {
  const b = bodyPositions(t);
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
function earthPerihelionLongitude(): number {
  const ep = v3();
  const ev = v3();
  const mp = v3();
  const mv = v3();
  const tLand = getMissionLandingT();
  if (hasHorizonsEpoch() && interpolateHorizons(tLand, ep, ev, mp, mv)) {
    const a = AU;
    const e = EARTH_ORB_E;
    const p = a * (1 - e * e);
    const r = Math.hypot(ep.x, ep.y, ep.z);
    let cosNu = (p / r - 1) / e;
    cosNu = Math.max(-1, Math.min(1, cosNu));
    const nu = Math.acos(cosNu); // magnitude; July is near aphelion (ν≈π)
    const lon = Math.atan2(ep.y, ep.x);
    // Choose sign of ν that places perihelion near the classical ~103°
    const ϖPlus = lon - nu;
    const ϖMinus = lon + nu;
    const classic = (102.9 * Math.PI) / 180;
    const wrap = (a: number) =>
      ((((a - classic) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) -
      Math.PI;
    return Math.abs(wrap(ϖMinus)) < Math.abs(wrap(ϖPlus)) ? ϖMinus : ϖPlus;
  }
  return (102.9 * Math.PI) / 180;
}

/**
 * Moon’s heliocentric trail over the mission window [0, durationS].
 * Uses the same ephemeris as bodyPositions (Horizons when available).
 */
export function moonPathThroughSim(durationS: number, samples = 512): V3[] {
  const pts: V3[] = [];
  const dur = Math.max(durationS, 1);
  const n = Math.max(2, samples);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur;
    const b = bodyPositions(t);
    pts.push({ x: b.moon.x, y: b.moon.y, z: b.moon.z });
  }
  return pts;
}

/**
 * Mean lunar orbit as a circle of radius A_EM in the lunar orbital plane
 * (inclination + node from constants). Earth-relative positions — parent the
 * line under the Earth group so it co-moves with Earth.
 */
export function moonRelativeOrbitCirclePoints(samples = 256): V3[] {
  const pts: V3[] = [];
  const a = A_EM;
  const i = MOON_INCLINATION;
  const Ω = MOON_NODE;
  const cosΩ = Math.cos(Ω);
  const sinΩ = Math.sin(Ω);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const n = Math.max(3, samples);
  for (let k = 0; k <= n; k++) {
    const θ = (k / n) * 2 * Math.PI;
    // Orbital plane: (a cos θ, a sin θ, 0) → ecliptic via R_z(Ω) R_x(i)
    const x1 = a * Math.cos(θ);
    const y1 = a * Math.sin(θ);
    const x2 = x1;
    const y2 = y1 * cosi;
    const z2 = y1 * sini;
    pts.push({
      x: cosΩ * x2 - sinΩ * y2,
      y: sinΩ * x2 + cosΩ * y2,
      z: z2,
    });
  }
  return pts;
}

/**
 * Earth’s heliocentric orbit about the Sun (origin) in the ecliptic (XY).
 *
 * With Horizons: eccentric ellipse (e≈0.0167) with ϖ fitted so July DE441
 * Earth sits on the green ring (circular 1 AU is ~2.4e6 km low at aphelion).
 * Analytic fallback: circle of radius AU.
 */
export function earthOrbitPathPoints(samples = 256): V3[] {
  const pts: V3[] = [];
  if (hasHorizonsEpoch()) {
    const a = AU;
    const e = EARTH_ORB_E;
    const p = a * (1 - e * e);
    const ϖ = earthPerihelionLongitude();
    for (let i = 0; i <= samples; i++) {
      const ν = (i / samples) * 2 * Math.PI;
      const r = p / (1 + e * Math.cos(ν));
      const lon = ϖ + ν;
      pts.push({
        x: r * Math.cos(lon),
        y: r * Math.sin(lon),
        z: 0,
      });
    }
    return pts;
  }
  for (let i = 0; i <= samples; i++) {
    const θ = (i / samples) * 2 * Math.PI;
    pts.push({
      x: AU * Math.cos(θ),
      y: AU * Math.sin(θ),
      z: 0,
    });
  }
  return pts;
}
