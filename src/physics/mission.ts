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
import { bodyPositions, setMoonPhase0, setSunPhase0 } from "./bodies";
import { sunPhase0ForLanding } from "./epoch";
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

/**
 * Target apogee slightly beyond mean lunar distance so the Moon can be met
 * near apogee under 3/4-body perturbations (classic min-energy lunar transfer).
 */
function transferApogee(): number {
  return A_EM * 1.02;
}

function hohmannTliDv(): number {
  const r1 = LEO_RADIUS;
  const r2 = transferApogee();
  const a = 0.5 * (r1 + r2);
  const vLeo = Math.sqrt(MU_EARTH / r1);
  const vPeri = Math.sqrt(MU_EARTH * (2 / r1 - 1 / a));
  return vPeri - vLeo;
}

function transferTimeEst(): number {
  const r1 = LEO_RADIUS;
  const r2 = transferApogee();
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
  let gain: number;
  let hGain: number;
  let maxA: number;

  if (phase === "approach") {
    // Far-field capture for min-energy arrivals: close in slowly and cancel
    // horizontal rate. Stronger authority at long range so a ~1–2×10⁵ km
    // flyby can still be bent into a lunar approach.
    const closeIn = alt > 80_000 ? 0.35 : alt > 20_000 ? 0.22 : 0.12;
    targetVRad = -closeIn;
    gain = 0.55;
    hGain = 0.7;
    maxA = LANDING_ACCEL * (alt > 50_000 ? 1.8 : 1.2);
  } else if (phase === "braking") {
    targetVRad = -0.12 - 0.35 * Math.min(1, alt / 5000);
    gain = 0.5;
    hGain = 0.7;
    maxA = LANDING_ACCEL * 1.3;
  } else {
    const safe = Math.sqrt(
      Math.max(0, 2 * LANDING_ACCEL * 0.4 * Math.max(alt, 0.05)),
    );
    targetVRad = -Math.min(0.2, Math.max(0.0015, safe));
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
 * Caller must set moon/sun phases first (see runMission).
 */
function probeMinMoonAlt(tliDv: number): number {
  const state = leoState(0, 0);
  applyTli(state, tliDv);
  const T = transferTimeEst();
  // Allow coast through apogee and a bit past (free-return arc)
  const maxT = T * 1.4;
  let minAlt = Infinity;
  let dt = 120;
  while (state.t < maxT) {
    rk4Step(state, dt);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    minAlt = Math.min(minAlt, altM);
    // Earth impact before lunar encounter → miss
    if (altE < 0 && state.t < T * 0.85) return Infinity;
    if (altE < 0) break;
    // Passed closest approach to Moon and climbing away
    if (
      state.t > T * 0.5 &&
      altM > minAlt + 25_000 &&
      minAlt < 200_000
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 80_000) dt = 30;
    else if (dMoon < 200_000) dt = 60;
    else dt = 120;
  }
  return minAlt;
}

/** Apply July-2027-consistent ephemeris for a candidate moon phase. */
function setEpochPhases(moonPhase0: number, landingT = transferTimeEst()): void {
  setMoonPhase0(moonPhase0);
  setSunPhase0(sunPhase0ForLanding(moonPhase0, landingT));
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
  // moon/sun phases set by caller (setEpochPhases)
  void moonPhase0;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const state = leoState(0, 0);
  pushSample(samples, state, "leo", false, true, 0, lastT);

  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const T = transferTimeEst();
  // Min-energy coast ~T; margin for capture + landing (not multi-rev)
  const maxT = T * 1.55 + 60_000;

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

    // Engage lunar guidance near first lunar encounter only (not free-return)
    if (
      phase === "coast" &&
      state.t > T * 0.55 &&
      dMoon < APPROACH_RANGE * 2
    ) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT);
    }
    if (phase === "approach" && altM < DESCENT_ALTITUDE * 10) {
      phase = "braking";
      pushSample(samples, state, phase, true, true, 0, lastT);
    }
    if (
      (phase === "braking" || phase === "approach") &&
      altM < DESCENT_ALTITUDE
    ) {
      phase = "descent";
      pushSample(samples, state, phase, true, true, 0, lastT);
    }

    const guided =
      phase === "approach" || phase === "braking" || phase === "descent";

    // If past estimated TOA and still far, fail this attempt
    if (phase === "coast" && state.t > T * 1.4 && dMoon > 200_000) {
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

    const minSampleDt = guided
      ? phase === "descent"
        ? 2
        : phase === "braking"
          ? 10
          : 45 // approach: coarser samples over long capture
      : 120;
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
 * Minimum-energy LEO→Moon mission (Hohmann-class TLI).
 *
 * Strategy: start at the 2-body Hohmann Δv and search Moon phase under a
 * July-2027-consistent Sun. If 3/4-body effects prevent intercept, raise Δv
 * in small steps and re-search phase — keep the lowest Δv that approaches
 * within APPROACH_RANGE (true min-energy under this model).
 */
export function runMission(): MissionResult {
  const baseDv = hohmannTliDv();
  const T = transferTimeEst();
  // Analytic lead: Moon advances ~N·T during transfer; apogee opposite periapsis.
  const guess = Math.PI - N_MOON * T;

  const phaseOffsets: number[] = [];
  for (let i = -50; i <= 50; i++) phaseOffsets.push(i * 0.035);

  // Δv ladder from pure Hohmann upward. Under Sun+EM gravity the theoretical
  // 2-body Hohmann ellipse is eroded; intercept typically needs a few % more.
  const dvScales = [
    1.0, 1.02, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09, 1.1, 1.12, 1.14, 1.16, 1.18,
    1.2,
  ];

  /**
   * Require a true near-miss / hit on the ballistic coast. Guidance then finishes
   * the landing — not a multi-day chase from 1–2×10⁵ km.
   */
  const INTERCEPT_ALT = 40_000;

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;
  let found = false;

  for (const dS of dvScales) {
    const dv = baseDv * dS;
    let localBestPhase = guess;
    let localBestAlt = Infinity;

    for (const off of phaseOffsets) {
      const ph = guess + off;
      setEpochPhases(ph, T);
      const alt = probeMinMoonAlt(dv);
      if (alt < localBestAlt) {
        localBestAlt = alt;
        localBestPhase = ph;
      }
    }

    // Fine phase around local best
    for (const off of [
      -0.03, -0.02, -0.012, -0.006, 0.006, 0.012, 0.02, 0.03,
    ]) {
      const ph = localBestPhase + off;
      setEpochPhases(ph, T);
      const alt = probeMinMoonAlt(dv);
      if (alt < localBestAlt) {
        localBestAlt = alt;
        localBestPhase = ph;
      }
    }

    // Track global closest as fallback
    if (localBestAlt < bestAlt) {
      bestAlt = localBestAlt;
      bestPhase = localBestPhase;
      bestDv = dv;
    }

    // First (lowest) Δv with a real lunar intercept wins — min-energy path
    if (localBestAlt < INTERCEPT_ALT) {
      bestAlt = localBestAlt;
      bestPhase = localBestPhase;
      bestDv = dv;
      found = true;
      break;
    }
  }

  console.info(
    `[tothemoon] Min-energy probe minMoonAlt=${bestAlt.toFixed(0)} km phase=${bestPhase.toFixed(3)} ` +
      `dv=${bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}, +${(((bestDv / baseDv) - 1) * 100).toFixed(2)}%) ` +
      `· T≈${(T / 3600).toFixed(1)}h · ${found ? "intercept" : "best-effort"}`,
  );

  setEpochPhases(bestPhase, T);
  const flown = flyMission(bestPhase, bestDv);
  setEpochPhases(bestPhase, flown.durationS);

  if (flown.ok) {
    console.info(
      `[tothemoon] Mission OK duration=${(flown.durationS / 3600).toFixed(1)}h ` +
        `(${(flown.durationS / 86400).toFixed(2)} d) samples=${flown.samples.length}`,
    );
    return downsample(flown);
  }

  console.warn(
    `[tothemoon] Primary flight: ${flown.message}; retrying with early guidance`,
  );
  setEpochPhases(bestPhase, T);
  const retry = flyMissionEarlyGuidance(bestPhase, bestDv);
  setEpochPhases(bestPhase, retry.durationS);
  return downsample(retry);
}

/** Same as flyMission but forces approach guidance within 100_000 km. */
function flyMissionEarlyGuidance(moonPhase0: number, tliDv: number): MissionResult {
  // moon/sun phases set by caller
  void moonPhase0;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const state = leoState(0, 0);
  pushSample(samples, state, "leo", false, true, 0, lastT);
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const T = transferTimeEst();
  const maxT = T * 1.55 + 60_000;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    if (altitudeEarth(state.t, state.pos) < 0 && minMoonAlt > 50_000) {
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

    if (
      phase === "coast" &&
      state.t > T * 0.55 &&
      dMoon < APPROACH_RANGE * 2
    ) {
      phase = "approach";
    }
    if (phase === "approach" && altM < 5000) phase = "braking";
    if (altM < DESCENT_ALTITUDE) phase = "descent";

    const guided = phase !== "coast";
    const thrustFn: ThrustFn | undefined = guided
      ? (t, p, v) =>
          landingThrust(t, p, v, phase === "coast" ? "approach" : phase)
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
      guided ? 5 : 120,
      lastT,
    );
  }

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
