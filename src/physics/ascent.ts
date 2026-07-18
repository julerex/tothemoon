/**
 * Powered ascent from Starbase (Boca Chica, TX) to circular LEO.
 *
 * Theater model: continuous thrust ~2.5 g, gravity turn due-east so parking
 * inclination ≈ site latitude (~26°). Not a staged mass model — enough fidelity
 * for a visible pad→orbit arc before TLI.
 */

import {
  ASCENT_ACCEL,
  LEO_ALTITUDE,
  LEO_RADIUS,
  MU_EARTH,
  R_EARTH,
} from "./constants";
import { enuAtPosition, starbasePadState } from "./earthFrame";
import {
  altitudeEarth,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import {
  clone,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

export type AscentPhase = "launch" | "ascent" | "leo";

export type AscentSample = {
  t: number;
  pos: V3;
  vel: V3;
  phase: AscentPhase;
  burning: boolean;
};

export type AscentResult = {
  state: CraftState;
  samples: AscentSample[];
  ok: boolean;
  message: string;
  insertionAlt: number;
  insertionSpeed: number;
};

const _up = v3();
const _east = v3();
const _north = v3();
const _relP = v3();
const _relV = v3();
const _thrust = v3();
const _target = v3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Desired thrust acceleration (km/s²) in inertial frame for ascent guidance.
 */
function ascentThrust(t: number, pos: V3, vel: V3): V3 | null {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  const alt = r - R_EARTH;
  if (alt < -1) return null;

  enuAtPosition(t, pos, b.earth, _up, _east, _north);
  sub(_relV, vel, b.earthVel);

  const vRad = dot(_relV, _up);
  const vEast = dot(_relV, _east);
  const vNorth = dot(_relV, _north);
  const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));

  // Pitch from vertical (0) toward east (π/2) with altitude
  let pitch: number;
  if (alt < 1.2) {
    pitch = 0; // tower clear / vertical rise
  } else if (alt < 80) {
    pitch = smoothstep(1.2, 90, alt) * (Math.PI / 2) * 0.88;
  } else {
    pitch = (Math.PI / 2) * 0.95;
  }

  // Near LEO: steer to circular due-east orbit
  if (alt > 100) {
    // Target velocity: circular, due east, kill radial & north
    const tgtEast = vCirc;
    const tgtRad =
      alt < LEO_ALTITUDE - 5
        ? 0.12 + 0.15 * ((LEO_ALTITUDE - alt) / LEO_ALTITUDE)
        : alt > LEO_ALTITUDE + 5
          ? -0.05
          : 0;
    set(
      _target,
      _up.x * tgtRad + _east.x * tgtEast,
      _up.y * tgtRad + _east.y * tgtEast,
      _up.z * tgtRad + _east.z * tgtEast,
    );
    // thrust ∝ (v_des - v)
    set(
      _thrust,
      _target.x - _relV.x,
      _target.y - _relV.y,
      _target.z - _relV.z,
    );
  } else {
    // Gravity turn: up * cos(pitch) + east * sin(pitch), damp north drift
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    set(
      _thrust,
      _up.x * cp + _east.x * sp - _north.x * vNorth * 0.15,
      _up.y * cp + _east.y * sp - _north.y * vNorth * 0.15,
      _up.z * cp + _east.z * sp - _north.z * vNorth * 0.15,
    );
    void vEast;
    void vRad;
  }

  const mag = len(_thrust);
  if (mag < 1e-12) {
    set(_thrust, _up.x, _up.y, _up.z);
  } else {
    normalize(_thrust, _thrust);
  }

  let a = ASCENT_ACCEL;
  // Throttle near insertion for control
  if (alt > 120) {
    const err = Math.hypot(
      vRad * 2,
      vEast - vCirc,
      vNorth * 2,
      (alt - LEO_ALTITUDE) * 0.03,
    );
    a = Math.min(ASCENT_ACCEL * 1.1, Math.max(0.006, err * 1.2));
  }
  return scale(_thrust, _thrust, a);
}

function insertionOk(t: number, pos: V3, vel: V3): boolean {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  const alt = r - R_EARTH;
  if (alt < LEO_ALTITUDE - 8 || alt > LEO_ALTITUDE + 25) return false;
  sub(_relV, vel, b.earthVel);
  normalize(_up, _relP);
  const vRad = Math.abs(dot(_relV, _up));
  const v = len(_relV);
  const vCirc = Math.sqrt(MU_EARTH / r);
  return vRad < 0.08 && Math.abs(v - vCirc) < 0.2;
}

/**
 * Integrate Starbase pad → circular LEO. Returns samples and end state in LEO.
 */
export function flyAscent(): AscentResult {
  const samples: AscentSample[] = [];
  const pad = starbasePadState(0);
  const state: CraftState = {
    t: 0,
    pos: clone(pad.pos),
    vel: clone(pad.vel),
  };
  // Small vertical hop so we leave the surface cleanly
  state.vel.x += pad.up.x * 0.01;
  state.vel.y += pad.up.y * 0.01;
  state.vel.z += pad.up.z * 0.01;

  samples.push({
    t: 0,
    pos: clone(state.pos),
    vel: clone(state.vel),
    phase: "launch",
    burning: true,
  });

  let lastSampleT = 0;
  let phase: AscentPhase = "launch";
  const maxT = 12 * 60; // 12 min hard cap

  while (state.t < maxT) {
    const alt = altitudeEarth(state.t, state.pos);
    if (alt < 1.5) phase = "launch";
    else phase = "ascent";

    if (insertionOk(state.t, state.pos, state.vel)) {
      phase = "leo";
      samples.push({
        t: state.t,
        pos: clone(state.pos),
        vel: clone(state.vel),
        phase: "leo",
        burning: false,
      });
      const b = getBodies(state.t);
      sub(_relV, state.vel, b.earthVel);
      return {
        state,
        samples,
        ok: true,
        message: "LEO",
        insertionAlt: altitudeEarth(state.t, state.pos),
        insertionSpeed: len(_relV),
      };
    }

    if (alt < -2) {
      return {
        state,
        samples,
        ok: false,
        message: "Ascent impact",
        insertionAlt: alt,
        insertionSpeed: 0,
      };
    }

    const thrustFn: ThrustFn = (t, p, v) => ascentThrust(t, p, v);
    const dt = alt < 20 ? 0.25 : alt < 100 ? 0.5 : 1.0;
    rk4Step(state, dt, thrustFn);

    const minDt = phase === "launch" ? 0.5 : 2;
    if (state.t - lastSampleT >= minDt) {
      lastSampleT = state.t;
      const burning = ascentThrust(state.t, state.pos, state.vel) !== null;
      samples.push({
        t: state.t,
        pos: clone(state.pos),
        vel: clone(state.vel),
        phase,
        burning,
      });
    }
  }

  // Force LEO if close enough
  const alt = altitudeEarth(state.t, state.pos);
  if (alt > 150) {
    // Snap circularize for theater reliability
    const b = getBodies(state.t);
    sub(_relP, state.pos, b.earth);
    normalize(_up, _relP);
    enuAtPosition(state.t, state.pos, b.earth, _up, _east, _north);
    // Place on LEO sphere along current radial
    state.pos.x = b.earth.x + _up.x * LEO_RADIUS;
    state.pos.y = b.earth.y + _up.y * LEO_RADIUS;
    state.pos.z = b.earth.z + _up.z * LEO_RADIUS;
    const vCirc = Math.sqrt(MU_EARTH / LEO_RADIUS);
    state.vel.x = b.earthVel.x + _east.x * vCirc;
    state.vel.y = b.earthVel.y + _east.y * vCirc;
    state.vel.z = b.earthVel.z + _east.z * vCirc;
    samples.push({
      t: state.t,
      pos: clone(state.pos),
      vel: clone(state.vel),
      phase: "leo",
      burning: false,
    });
    return {
      state,
      samples,
      ok: true,
      message: "LEO (forced circularize)",
      insertionAlt: LEO_ALTITUDE,
      insertionSpeed: vCirc,
    };
  }

  return {
    state,
    samples,
    ok: false,
    message: "Ascent timeout",
    insertionAlt: alt,
    insertionSpeed: 0,
  };
}
