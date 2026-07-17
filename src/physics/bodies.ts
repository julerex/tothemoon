import {
  A_EM,
  AU,
  N_EARTH_SUN,
  N_MOON,
  R_EARTH_BARY,
  R_MOON_BARY,
} from "./constants";
import { set, type V3, v3 } from "./vec3";

/**
 * Prescribed body positions in the Earth–Moon barycentric inertial frame.
 * t = 0: Moon at +X, Earth at −X (barycenter split), Sun roughly −X at 1 AU.
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

/** Moon true anomaly offset at t=0 (rad). Tuned by mission search. */
let moonPhase0 = 0;

/** Sun ecliptic longitude offset at t=0 (rad). */
const sunPhase0 = Math.PI; // opposite Moon side for nice lighting

export function setMoonPhase0(phase: number): void {
  moonPhase0 = phase;
}

export function getMoonPhase0(): number {
  return moonPhase0;
}

export function bodyPositions(t: number, out?: BodyState): BodyState {
  const θm = moonPhase0 + N_MOON * t;
  const θs = sunPhase0 + N_EARTH_SUN * t;

  // Earth & Moon circular about barycenter in XY plane
  set(_earth, -R_EARTH_BARY * Math.cos(θm), -R_EARTH_BARY * Math.sin(θm), 0);
  set(_moon, R_MOON_BARY * Math.cos(θm), R_MOON_BARY * Math.sin(θm), 0);

  // Velocities for relative-velocity / burns
  const ve = R_EARTH_BARY * N_MOON;
  const vm = R_MOON_BARY * N_MOON;
  set(_earthVel, ve * Math.sin(θm), -ve * Math.cos(θm), 0);
  set(_moonVel, -vm * Math.sin(θm), vm * Math.cos(θm), 0);

  // Sun at ~1 AU (gravity source only for craft)
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
  const b = bodyPositions(t);
  return set(
    out,
    (b.moon.x - b.earth.x) / A_EM,
    (b.moon.y - b.earth.y) / A_EM,
    (b.moon.z - b.earth.z) / A_EM,
  );
}
