import { bodyPositions } from "./bodies";
import { keplerRvAt, type KeplerOrbit } from "./kepler";
import { set, type V3, v3 } from "./vec3";

const _relP = v3();
const _relV = v3();
const _thrust = v3();

/** Soft accel (km/s²) to stay near the Kepler reference under 4-body drift. */
const KEPLER_TRACK_ACCEL = 0.0008; // ~0.08 g max

/**
 * Earth-centered Kepler reference position at time t.
 * Focus is the prescribed Earth ephemeris at t.
 */
export function keplerRefPos(orb: KeplerOrbit, t: number, out: V3): V3 {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  return set(out, b.earth.x + _relP.x, b.earth.y + _relP.y, b.earth.z + _relP.z);
}

/**
 * PD-style thrust toward the osculating Kepler trajectory (reference track).
 * Primary dynamics remain N-body RK4; this only counters secular drift so the
 * path stays near the designed LRO ellipse.
 */
export function keplerTrackThrust(
  t: number,
  pos: V3,
  vel: V3,
  orb: KeplerOrbit,
): V3 | null {
  keplerRvAt(orb, t, _relP, _relV);
  const b = bodyPositions(t);
  const dx = b.earth.x + _relP.x - pos.x;
  const dy = b.earth.y + _relP.y - pos.y;
  const dz = b.earth.z + _relP.z - pos.z;
  const dvx = b.earthVel.x + _relV.x - vel.x;
  const dvy = b.earthVel.y + _relV.y - vel.y;
  const dvz = b.earthVel.z + _relV.z - vel.z;
  // Soft PD (1/s² and 1/s scales chosen for multi-day coast)
  let ax = dx * 2e-8 + dvx * 4e-4;
  let ay = dy * 2e-8 + dvy * 4e-4;
  let az = dz * 2e-8 + dvz * 4e-4;
  const mag = Math.hypot(ax, ay, az);
  if (mag < 1e-9) return null;
  if (mag > KEPLER_TRACK_ACCEL) {
    const s = KEPLER_TRACK_ACCEL / mag;
    ax *= s;
    ay *= s;
    az *= s;
  }
  return set(_thrust, ax, ay, az);
}
