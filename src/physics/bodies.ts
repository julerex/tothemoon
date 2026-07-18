import {
  A_EM,
  AU,
  MASS_RATIO_ME,
  MOON_ARG_PERI,
  MOON_ECC,
  MOON_INCLINATION,
  MOON_NODE,
  MU_EM_ORB,
  N_EARTH_SUN,
  N_MOON,
} from "./constants";
import { set, type V3, v3 } from "./vec3";

/**
 * Prescribed body positions in the Earth–Moon barycentric inertial frame.
 *
 * - Ecliptic / Sun–Earth plane: XY (z = 0)
 * - Moon: Keplerian ellipse about Earth (a, e, i, Ω, ω), barycenter at origin
 * - moonPhase0 = mean anomaly M at t = 0 (mission search tunes this)
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
 * Sun inertial angle offset at t=0 (rad).
 * Set from July 2027 epoch so landing geometry is a waning gibbous
 * (see epoch.ts); default π is a placeholder until the trajectory loads.
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
 * Moon state relative to Earth in the ecliptic frame (Keplerian).
 * Returns position (km) and velocity (km/s) of Moon w.r.t. Earth.
 */
export function moonRelativeToEarth(
  t: number,
  M0: number = moonPhase0,
): { pos: V3; vel: V3; r: number; nu: number; E: number } {
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
  const rel = moonRelativeToEarth(t);
  // Barycenter at origin: Earth and Moon on opposite sides of r_em
  const kM = 1 / (1 + MASS_RATIO_ME); // m_e / (m_e + m_m)
  const kE = MASS_RATIO_ME / (1 + MASS_RATIO_ME); // m_m / (m_e + m_m)

  set(_moon, kM * rel.pos.x, kM * rel.pos.y, kM * rel.pos.z);
  set(_earth, -kE * rel.pos.x, -kE * rel.pos.y, -kE * rel.pos.z);
  set(_moonVel, kM * rel.vel.x, kM * rel.vel.y, kM * rel.vel.z);
  set(_earthVel, -kE * rel.vel.x, -kE * rel.vel.y, -kE * rel.vel.z);

  // Sun on the ecliptic at ~1 AU
  const θs = sunPhase0 + N_EARTH_SUN * t;
  set(_sun, AU * Math.cos(θs), AU * Math.sin(θs), 0);

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
 * Sample the Moon’s path about the barycenter for orbit visualization.
 * Returns points in ecliptic/bary frame over one sidereal month.
 */
export function moonOrbitPathPoints(samples = 180, M0 = 0): V3[] {
  const pts: V3[] = [];
  const period = (2 * Math.PI) / N_MOON;
  const kM = 1 / (1 + MASS_RATIO_ME);
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * period;
    const rel = moonRelativeToEarth(t, M0);
    pts.push({
      x: kM * rel.pos.x,
      y: kM * rel.pos.y,
      z: kM * rel.pos.z,
    });
  }
  return pts;
}
