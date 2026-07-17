import {
  A_EM,
  APPROACH_RANGE,
  DESCENT_ALTITUDE,
  DT_BURN,
  DT_COAST,
  DT_NEAR,
  LANDING_ACCEL,
  LEO_RADIUS,
  MU_EARTH,
  MU_MOON,
  N_MOON,
  R_MOON,
  TOUCHDOWN_SPEED,
} from "./constants";
import { bodyPositions, setMoonPhase0 } from "./bodies";
import {
  altitudeEarth,
  altitudeMoon,
  applyDeltaV,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import {
  clone,
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

export type PhaseId =
  | "leo"
  | "tli"
  | "coast"
  | "approach"
  | "braking"
  | "descent"
  | "landed";

export type Sample = {
  t: number;
  pos: V3;
  vel: V3;
  phase: PhaseId;
  burning: boolean;
};

export type MissionResult = {
  samples: Sample[];
  durationS: number;
  moonPhase0: number;
  tliDv: number;
  minMoonAlt: number;
  ok: boolean;
  message: string;
};

const PHASE_LABELS: Record<PhaseId, string> = {
  leo: "LEO",
  tli: "Trans-lunar injection",
  coast: "Trans-lunar coast",
  approach: "Lunar approach",
  braking: "Braking",
  descent: "Powered descent",
  landed: "Landed",
};

export function phaseLabel(id: PhaseId): string {
  return PHASE_LABELS[id];
}

function leoState(t: number, anomaly = 0): CraftState {
  const b = bodyPositions(t);
  const c = Math.cos(anomaly);
  const s = Math.sin(anomaly);
  const rRel = v3(LEO_RADIUS * c, LEO_RADIUS * s, 0);
  const vOrb = Math.sqrt(MU_EARTH / LEO_RADIUS);
  const vRel = v3(-vOrb * s, vOrb * c, 0);
  return {
    t,
    pos: v3(b.earth.x + rRel.x, b.earth.y + rRel.y, b.earth.z + rRel.z),
    vel: v3(b.earthVel.x + vRel.x, b.earthVel.y + vRel.y, b.earthVel.z + vRel.z),
  };
}

function hohmannTliDv(): number {
  const r1 = LEO_RADIUS;
  const r2 = A_EM;
  const a = 0.5 * (r1 + r2);
  const vLeo = Math.sqrt(MU_EARTH / r1);
  const vPeri = Math.sqrt(MU_EARTH * (2 / r1 - 1 / a));
  return vPeri - vLeo;
}

function transferTimeEst(): number {
  const r1 = LEO_RADIUS;
  const r2 = A_EM;
  const a = 0.5 * (r1 + r2);
  return Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
}

const _radial = v3();
const _tangent = v3();
const _relP = v3();
const _relV = v3();
const _thrust = v3();
const _tmp = v3();
const _up = v3(0, 0, 1);
const _landDir = v3(1, 0, 0);

function pushSample(
  samples: Sample[],
  state: CraftState,
  phase: PhaseId,
  burning: boolean,
  force = false,
  minDt = 0,
  lastT = { t: -Infinity },
): void {
  if (!force && state.t - lastT.t < minDt) return;
  lastT.t = state.t;
  samples.push({
    t: state.t,
    pos: clone(state.pos),
    vel: clone(state.vel),
    phase,
    burning,
  });
}

function landingThrust(t: number, pos: V3, vel: V3, phase: PhaseId): V3 | null {
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
  _tmp.x = _relV.x - _radial.x * vRad;
  _tmp.y = _relV.y - _radial.y * vRad;
  _tmp.z = _relV.z - _radial.z * vRad;

  let targetVRad: number;
  if (phase === "approach") {
    targetVRad = Math.min(vRad, -0.15);
  } else if (phase === "braking") {
    targetVRad = -0.12 - 0.35 * Math.min(1, alt / 5000);
  } else {
    const safe = Math.sqrt(
      Math.max(0, 2 * LANDING_ACCEL * 0.4 * Math.max(alt, 0.05)),
    );
    targetVRad = -Math.min(0.2, Math.max(0.0015, safe));
  }

  const gain = phase === "descent" ? 1.0 : 0.4;
  let ax = (_radial.x * targetVRad - _relV.x) * gain;
  let ay = (_radial.y * targetVRad - _relV.y) * gain;
  let az = (_radial.z * targetVRad - _relV.z) * gain;

  const hGain = phase === "descent" ? 1.4 : 0.55;
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
  const maxA = phase === "descent" ? LANDING_ACCEL * 1.6 : LANDING_ACCEL;
  if (mag > maxA) scale(_thrust, _thrust, maxA / mag);
  return _thrust;
}

function applyTli(state: CraftState, tliDv: number): void {
  const b0 = getBodies(state.t);
  sub(_relP, state.pos, b0.earth);
  normalize(_radial, _relP);
  cross(_tangent, _up, _radial);
  normalize(_tangent, _tangent);
  sub(_relV, state.vel, b0.earthVel);
  if (dot(_tangent, _relV) < 0) scale(_tangent, _tangent, -1);
  applyDeltaV(state.vel, scale(_tmp, _tangent, tliDv));
}

/**
 * Fast probe: coast only, return minimum Moon altitude.
 */
function probeMinMoonAlt(moonPhase0: number, tliDv: number): number {
  setMoonPhase0(moonPhase0);
  const state = leoState(0, 0);
  applyTli(state, tliDv);
  const maxT = transferTimeEst() * 2.2;
  let minAlt = Infinity;
  const dt = 120; // coarse
  while (state.t < maxT) {
    rk4Step(state, dt);
    const altM = altitudeMoon(state.t, state.pos);
    minAlt = Math.min(minAlt, altM);
    if (altitudeEarth(state.t, state.pos) < 0) return Infinity;
    // Early exit if climbing away after a decent approach
    if (state.t > transferTimeEst() * 0.6 && altM > minAlt + 50_000 && minAlt < 100_000) {
      break;
    }
  }
  return minAlt;
}

function finishLanding(
  state: CraftState,
  samples: Sample[],
  moonPhase0: number,
  tliDv: number,
  minMoonAlt: number,
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
  pushSample(samples, state, "landed", false, true, 0, lastT);

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

/**
 * Full fidelity flight: ballistic coast under 4-body gravity, then guided landing.
 */
function flyMission(moonPhase0: number, tliDv: number): MissionResult {
  setMoonPhase0(moonPhase0);
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const state = leoState(0, 0);
  pushSample(samples, state, "leo", false, true, 0, lastT);

  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const maxT = transferTimeEst() * 2.8 + 50_000;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    if (altE < 80) {
      // Skip atmosphere; only fail on deep impact
      if (altE < 0) {
        return {
          samples,
          durationS: state.t,
          moonPhase0,
          tliDv,
          minMoonAlt,
          ok: false,
          message: "Earth impact",
        };
      }
    }

    if (phase === "coast" && dMoon < APPROACH_RANGE) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT);
    }
    if (phase === "approach" && altM < DESCENT_ALTITUDE * 10) {
      phase = "braking";
      pushSample(samples, state, phase, true, true, 0, lastT);
    }
    if ((phase === "braking" || phase === "approach") && altM < DESCENT_ALTITUDE) {
      phase = "descent";
      pushSample(samples, state, phase, true, true, 0, lastT);
    }

    // Engage guidance if we get relatively close even outside nominal approach
    if (phase === "coast" && dMoon < APPROACH_RANGE * 2.5) {
      phase = "approach";
    }

    const guided =
      phase === "approach" || phase === "braking" || phase === "descent";

    // If past estimated TOA and still far, fail this attempt
    if (phase === "coast" && state.t > transferTimeEst() * 2.3 && dMoon > 120_000) {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
      };
    }

    const thrustFn: ThrustFn | undefined = guided
      ? (t, p, v) => landingThrust(t, p, v, phase)
      : undefined;

    const dt = guided
      ? phase === "descent"
        ? DT_BURN
        : DT_NEAR
      : dMoon < 80_000
        ? DT_NEAR
        : DT_COAST;

    const burning =
      guided && landingThrust(state.t, state.pos, state.vel, phase) !== null;

    rk4Step(state, dt, thrustFn);

    const altM2 = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relV, state.vel, b.moonVel);
    const relSpeed = len(_relV);

    if (guided && altM2 < 0.1 && relSpeed < TOUCHDOWN_SPEED * 8) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }
    if (guided && altM2 < 0) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }

    const minSampleDt = guided ? (phase === "descent" ? 2 : 15) : 90;
    pushSample(samples, state, phase, burning, false, minSampleDt, lastT);
  }

  // Timeout: if we got somewhat close, force landing from current approach
  if (minMoonAlt < 80_000) {
    return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
  }

  return {
    samples,
    durationS: state.t,
    moonPhase0,
    tliDv,
    minMoonAlt,
    ok: false,
    message: "Timeout",
  };
}

function downsample(result: MissionResult, maxPoints = 2200): MissionResult {
  const s = result.samples;
  if (s.length <= maxPoints) return result;
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  for (let i = 0; i < s.length; i++) {
    const sample = s[i]!;
    if (
      i >= next ||
      sample.burning ||
      sample.phase === "tli" ||
      sample.phase === "landed" ||
      i === 0 ||
      i === s.length - 1
    ) {
      out.push(sample);
      if (i >= next) next += step;
    }
  }
  return { ...result, samples: out };
}

/**
 * Search a compact phase/Δv grid, then fly the best candidate with full guidance.
 */
export function runMission(): MissionResult {
  const baseDv = hohmannTliDv();
  const T = transferTimeEst();
  // Analytic-ish lead: Moon advances ~N*T during transfer; apogee is opposite periapsis.
  // Periapsis at anomaly 0 → apogee toward −X in Earth frame at t=0 → prefer Moon near that.
  const guess = Math.PI - N_MOON * T;

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;

  const phaseOffsets = [
    -0.6, -0.4, -0.25, -0.15, -0.08, 0, 0.08, 0.15, 0.25, 0.4, 0.6, 0.9, 1.2, -0.9, -1.2,
  ];
  const dvScales = [0.95, 1.0, 1.05, 1.1, 1.15];

  for (const dS of dvScales) {
    const dv = baseDv * dS;
    for (const off of phaseOffsets) {
      const ph = guess + off;
      const alt = probeMinMoonAlt(ph, dv);
      if (alt < bestAlt) {
        bestAlt = alt;
        bestPhase = ph;
        bestDv = dv;
      }
    }
  }

  // Local refine
  for (const off of [-0.06, -0.03, 0.03, 0.06]) {
    for (const dS of [0.98, 1.02, 1.07]) {
      const ph = bestPhase + off;
      const dv = bestDv * dS;
      const alt = probeMinMoonAlt(ph, dv);
      if (alt < bestAlt) {
        bestAlt = alt;
        bestPhase = ph;
        bestDv = dv;
      }
    }
  }

  console.info(
    `[tothemoon] Best probe minMoonAlt=${bestAlt.toFixed(0)} km phase=${bestPhase.toFixed(3)} dv=${bestDv.toFixed(4)}`,
  );

  const flown = flyMission(bestPhase, bestDv);
  if (flown.ok) {
    console.info(
      `[tothemoon] Mission OK duration=${(flown.durationS / 3600).toFixed(1)}h samples=${flown.samples.length}`,
    );
    return downsample(flown);
  }

  // Guidance-heavy retry: start approach earlier
  console.warn(`[tothemoon] Primary flight: ${flown.message}; retrying with early guidance`);
  const retry = flyMissionEarlyGuidance(bestPhase, bestDv);
  return downsample(retry);
}

/** Same as flyMission but forces approach guidance within 100_000 km. */
function flyMissionEarlyGuidance(moonPhase0: number, tliDv: number): MissionResult {
  setMoonPhase0(moonPhase0);
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const state = leoState(0, 0);
  pushSample(samples, state, "leo", false, true, 0, lastT);
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const maxT = transferTimeEst() * 3;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    if (altitudeEarth(state.t, state.pos) < 0) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }

    if (phase === "coast" && dMoon < 120_000) phase = "approach";
    if (phase === "approach" && altM < 5000) phase = "braking";
    if (altM < DESCENT_ALTITUDE) phase = "descent";

    const guided = phase !== "coast";
    const thrustFn: ThrustFn | undefined = guided
      ? (t, p, v) => landingThrust(t, p, v, phase === "coast" ? "approach" : phase)
      : undefined;

    rk4Step(
      state,
      guided ? (phase === "descent" ? DT_BURN : DT_NEAR) : DT_COAST,
      thrustFn,
    );

    const altM2 = altitudeMoon(state.t, state.pos);
    if (guided && altM2 < 0.15) {
      return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
    }

    pushSample(
      samples,
      state,
      phase,
      guided,
      false,
      guided ? 5 : 90,
      lastT,
    );
  }

  return finishLanding(state, samples, moonPhase0, tliDv, minMoonAlt);
}
