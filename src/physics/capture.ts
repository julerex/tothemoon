import { LANDING_ACCEL, MU_MOON, R_MOON } from "./constants";
import { bodyPositions } from "./bodies";
import { getBodies, type CraftState } from "./integrator";
import { pushSample } from "./missionSample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  fuelBoosterFrac,
  fuelShipFrac,
  type PropState,
} from "./propellant";
import {
  clone,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  v3,
  type V3,
} from "./vec3";

const _radial = v3();
const _relP = v3();
const _relV = v3();
const _thrust = v3();
const _tmp = v3();
const _landDir = v3(1, 0, 0);

/**
 * Near-Moon guidance: LOI-like capture first (match Moon velocity, settle
 * onto a low approach), then soft land. Avoids a sharp radial dive from a
 * distant miss (which looked like a southbound kink).
 */
export function landingThrust(
  t: number,
  pos: V3,
  vel: V3,
  phase: PhaseId,
): V3 | null {
  if (phase !== "braking" && phase !== "descent" && phase !== "approach") {
    return null;
  }

  const b = getBodies(t);
  sub(_relP, pos, b.moon);
  sub(_relV, vel, b.moonVel);
  const r = len(_relP);
  const alt = r - R_MOON;
  if (alt < -1) return null;

  normalize(_radial, _relP);
  const vRad = dot(_relV, _radial);
  // Horizontal (along-track / cross-track) relative to Moon
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;

  let targetVRad: number;
  let gain: number;
  let hGain: number;
  let maxA: number;

  if (phase === "approach") {
    // LOI-style: cancel flyby velocity, then settle inward (smooth meet)
    const closeIn =
      alt > 5_000 ? 0.45 : alt > 1_500 ? 0.2 : alt > 400 ? 0.08 : 0.035;
    targetVRad = -closeIn;
    gain = 0.7;
    hGain = 1.5;
    maxA = LANDING_ACCEL * (alt > 3_000 ? 2.4 : 1.6);
  } else if (phase === "braking") {
    targetVRad = -0.1 - 0.35 * Math.min(1, alt / 3500);
    gain = 0.7;
    hGain = 1.2;
    maxA = LANDING_ACCEL * 1.55;
  } else {
    const safe = Math.sqrt(
      Math.max(0, 2 * LANDING_ACCEL * 0.4 * Math.max(alt, 0.05)),
    );
    targetVRad = -Math.min(0.18, Math.max(0.0015, safe));
    gain = 1.0;
    hGain = 1.4;
    maxA = LANDING_ACCEL * 1.6;
  }

  let ax = (_radial.x * targetVRad - _relV.x) * gain;
  let ay = (_radial.y * targetVRad - _relV.y) * gain;
  let az = (_radial.z * targetVRad - _relV.z) * gain;

  ax += -_tmp.x * hGain;
  ay += -_tmp.y * hGain;
  az += -_tmp.z * hGain;

  if (phase === "descent" && alt < 30) {
    const gMoon = MU_MOON / (r * r);
    const hover = alt < 5 ? 1.05 : 0.9;
    ax += _radial.x * gMoon * hover;
    ay += _radial.y * gMoon * hover;
    az += _radial.z * gMoon * hover;
  }

  set(_thrust, ax, ay, az);
  const mag = len(_thrust);
  if (mag > maxA) scale(_thrust, _thrust, maxA / mag);
  return _thrust;
}

export function finishLanding(
  state: CraftState,
  samples: Sample[],
  moonPhase0: number,
  tliDv: number,
  minMoonAlt: number,
  prop: PropState | null = null,
): MissionResult {
  const b = getBodies(state.t);
  sub(_relP, state.pos, b.moon);
  if (len(_relP) < 1) set(_relP, 1, 0, 0);
  normalize(_landDir, _relP);
  state.pos.x = b.moon.x + _landDir.x * R_MOON;
  state.pos.y = b.moon.y + _landDir.y * R_MOON;
  state.pos.z = b.moon.z + _landDir.z * R_MOON;
  state.vel.x = b.moonVel.x;
  state.vel.y = b.moonVel.y;
  state.vel.z = b.moonVel.z;

  const landT0 = state.t;
  const lastT = { t: -Infinity };
  pushSample(samples, state, "landed", false, true, 0, lastT, prop, 0, "ship");

  const fb = prop ? fuelBoosterFrac(prop) : 0;
  const fs = prop ? fuelShipFrac(prop) : 0;
  const st = prop?.staged ?? true;
  for (let i = 1; i <= 30; i++) {
    const t = landT0 + i * 60;
    const bi = bodyPositions(t);
    samples.push({
      t,
      pos: v3(
        bi.moon.x + _landDir.x * R_MOON,
        bi.moon.y + _landDir.y * R_MOON,
        bi.moon.z + _landDir.z * R_MOON,
      ),
      vel: clone(bi.moonVel),
      phase: "landed",
      burning: false,
      fuelBooster: fb,
      fuelShip: fs,
      thrustN: 0,
      staged: st,
    });
  }

  return {
    samples,
    durationS: samples[samples.length - 1]!.t,
    moonPhase0,
    tliDv,
    minMoonAlt: Math.min(minMoonAlt, 0),
    ok: true,
    message: "Landed",
  };
}
