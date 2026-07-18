import {
  A_EM,
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
 * Apollo free-return style: coast ~3 days (not min-energy Hohmann ~5 days).
 * Higher TLI energy; Moon is met before apogee on an ellipse that would
 * free-return past the Moon if no capture/landing burn is applied.
 */
const APOLLO_COAST_S = 3 * 86_400;

/** 2-body TOF from periapsis to geocentric radius `r` on ellipse (rp, ra). */
function tofPeriToRadius(rp: number, ra: number, r: number): number {
  if (r <= rp || r > ra * 1.000_001) return Infinity;
  const a = 0.5 * (rp + ra);
  const e = (ra - rp) / (ra + rp);
  if (e < 1e-9) return Infinity;
  let cosf = (a * (1 - e * e) / r - 1) / e;
  cosf = Math.max(-1, Math.min(1, cosf));
  let cosE = (e + cosf) / (1 + e * cosf);
  cosE = Math.max(-1, Math.min(1, cosE));
  const E = Math.acos(cosE);
  const M = E - e * Math.sin(E);
  return Math.sqrt((a * a * a) / MU_EARTH) * M;
}

/** True anomaly (0…π) at geocentric radius `r` on ellipse (rp, ra). */
function trueAnomalyAtRadius(rp: number, ra: number, r: number): number {
  const a = 0.5 * (rp + ra);
  const e = (ra - rp) / (ra + rp);
  if (e < 1e-9) return Math.PI;
  let cosf = (a * (1 - e * e) / r - 1) / e;
  cosf = Math.max(-1, Math.min(1, cosf));
  return Math.acos(cosf);
}

/**
 * Apogee beyond the Moon so that 2-body flight time LEO→A_EM ≈ APOLLO_COAST_S.
 * Larger ra → shorter TOF to lunar distance (higher energy). Bracket:
 * lo ≈ near-Hohmann (slow), hi ≈ energetic free-return (fast).
 */
function apolloApogee(): number {
  const rp = LEO_RADIUS;
  let lo = A_EM * 1.05; // ~3.9 d to A_EM
  let hi = A_EM * 2.2; // ~2.6 d to A_EM
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    const tof = tofPeriToRadius(rp, mid, A_EM);
    // Too slow → raise apogee; too fast → lower apogee
    if (tof > APOLLO_COAST_S) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function apolloTransfer(): { ra: number; tliDv: number; tof: number; fEnc: number } {
  const rp = LEO_RADIUS;
  const ra = apolloApogee();
  const a = 0.5 * (rp + ra);
  const vLeo = Math.sqrt(MU_EARTH / rp);
  const vPeri = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  const tof = tofPeriToRadius(rp, ra, A_EM);
  const fEnc = trueAnomalyAtRadius(rp, ra, A_EM);
  return { ra, tliDv: vPeri - vLeo, tof, fEnc };
}

function transferTimeEst(): number {
  return apolloTransfer().tof;
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
    // Apollo free-return arrival: higher v∞ than Hohmann. Kill horizontal
    // rate hard near SOI, then settle onto a steep close-in.
    const closeIn = alt > 25_000 ? 0.8 : alt > 8_000 ? 0.35 : 0.16;
    targetVRad = -closeIn;
    gain = 0.75;
    hGain = 1.0;
    maxA = LANDING_ACCEL * (alt > 20_000 ? 2.4 : 1.5);
  } else if (phase === "braking") {
    targetVRad = -0.14 - 0.45 * Math.min(1, alt / 4000);
    gain = 0.65;
    hGain = 0.95;
    maxA = LANDING_ACCEL * 1.55;
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
type ProbeResult = { minAlt: number; periluneT: number };

function probePerilune(tliDv: number): ProbeResult {
  const state = leoState(0, 0);
  applyTli(state, tliDv);
  const T = transferTimeEst();
  // Free-return: allow coast past lunar encounter (and a bit of the return arc)
  const maxT = T * 1.7 + 60_000;
  let minAlt = Infinity;
  let periluneT = 0;
  let dt = 120;
  while (state.t < maxT) {
    rk4Step(state, dt);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
    }
    // Earth impact before lunar encounter → miss
    if (altE < 0 && state.t < T * 0.65) {
      return { minAlt: Infinity, periluneT: 0 };
    }
    if (altE < 0) break;
    // Passed closest approach to Moon and climbing away (free-return outbound)
    if (
      state.t > periluneT + 3_000 &&
      altM > minAlt + 20_000 &&
      minAlt < 250_000 &&
      state.t > T * 0.5
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 80_000) dt = 30;
    else if (dMoon < 200_000) dt = 60;
    else dt = 120;
  }
  return { minAlt, periluneT };
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
 * Full fidelity flight: ballistic free-return coast, then guided landing near perilune.
 * `toa` is expected time of lunar perilune (from the ballistic probe).
 */
function flyMission(moonPhase0: number, tliDv: number, toa?: number): MissionResult {
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
  const T = toa && toa > 0 ? toa : transferTimeEst();
  // Free-return coast to perilune; margin for braking + powered descent
  const maxT = T * 1.25 + 40_000;

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

    // Stay ballistic on the free-return until near perilune, then capture.
    // Tight gate so we don't steal the inbound leg 10k–20k km out.
    const CAPTURE_RANGE = 6_000;
    if (
      phase === "coast" &&
      state.t > T * 0.85 &&
      dMoon < CAPTURE_RANGE
    ) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT);
    }
    if (phase === "approach" && altM < DESCENT_ALTITUDE * 25) {
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

    // Past perilune on free-return outbound with no capture → miss
    if (phase === "coast" && state.t > T * 1.2 && dMoon > 80_000) {
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

  // Timeout: only force-land if we truly closed in near the surface
  if (minMoonAlt < 5_000) {
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
 * Apollo free-return style LEO→Moon mission.
 *
 * Strategy: size a 2-body TLI for ~3 day coast to lunar distance (apogee well
 * past the Moon), then search Moon phase under a July-2027-consistent Sun for
 * a free-return intercept. Nudge Δv slightly if 3/4-body gravity erodes the
 * ballistic pass. Prefer a tight perilune (Apollo free-return ~100–200 km
 * class) over min-energy Δv.
 */
export function runMission(): MissionResult {
  const xfer = apolloTransfer();
  const baseDv = xfer.tliDv;
  const T = xfer.tof;
  // Encounter true anomaly f_enc < π (before apogee); Moon lead = f − N·T.
  const guess = xfer.fEnc - N_MOON * T;

  const phaseOffsets: number[] = [];
  for (let i = -55; i <= 55; i++) phaseOffsets.push(i * 0.032);

  // Stay near Apollo design energy; ladder covers 4-body intercept solutions.
  const dvScales = [
    0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.08, 1.1,
    1.12, 1.14, 1.16, 1.18, 1.2, 1.22, 1.25,
  ];

  /**
   * Apollo free-return: perilune ~100–200 km (figure-8 capable), coast ~3 days
   * (faster than min-energy ~5 d). Prefer a real free-return pass over a
   * distant early flyby.
   */
  const INTERCEPT_ALT = 8_000;
  const IDEAL_PERILUNE = 200;
  /** Soft TOA target: Apollo was ~3 d; accept ~2.5–4.5 d free-returns. */
  const IDEAL_TOA = T;
  const TOA_MIN = 2.5 * 86_400;
  const TOA_MAX = 4.5 * 86_400;

  /** Score: lower is better. Tight free-return perilune dominates. */
  function periluneScore(alt: number, periluneT: number): number {
    if (!Number.isFinite(alt) || alt > 300_000) return 1e12;
    if (periluneT < TOA_MIN * 0.85 || periluneT > TOA_MAX * 1.15) {
      return 1e12;
    }
    const altTerm =
      alt < 0
        ? 30_000 - alt // impact trajectories: usable but not free-return
        : Math.abs(alt - IDEAL_PERILUNE) * 4 +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 8 : 0);
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    // Mild time preference — free-return shape beats exact 72 h
    const timeTerm = dtH * dtH * 80;
    // Soft gate outside the Apollo coast window
    const windowPen =
      periluneT < TOA_MIN
        ? ((TOA_MIN - periluneT) / 3600) ** 2 * 200
        : periluneT > TOA_MAX
          ? ((periluneT - TOA_MAX) / 3600) ** 2 * 200
          : 0;
    return altTerm + timeTerm + windowPen;
  }

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;
  let bestPeriluneT = T;
  let bestScore = Infinity;
  let found = false;

  for (const dS of dvScales) {
    const dv = baseDv * dS;
    let localBestPhase = guess;
    let localBestAlt = Infinity;
    let localBestT = T;
    let localBestScore = Infinity;

    for (const off of phaseOffsets) {
      const ph = guess + off;
      setEpochPhases(ph, T);
      const pr = probePerilune(dv);
      const sc = periluneScore(pr.minAlt, pr.periluneT);
      if (sc < localBestScore) {
        localBestScore = sc;
        localBestAlt = pr.minAlt;
        localBestT = pr.periluneT;
        localBestPhase = ph;
      }
    }

    // Fine phase around local best
    for (const off of [
      -0.04, -0.025, -0.015, -0.008, -0.004, 0.004, 0.008, 0.015, 0.025, 0.04,
    ]) {
      const ph = localBestPhase + off;
      setEpochPhases(ph, T);
      const pr = probePerilune(dv);
      const sc = periluneScore(pr.minAlt, pr.periluneT);
      if (sc < localBestScore) {
        localBestScore = sc;
        localBestAlt = pr.minAlt;
        localBestT = pr.periluneT;
        localBestPhase = ph;
      }
    }

    if (localBestScore < bestScore) {
      bestScore = localBestScore;
      bestAlt = localBestAlt;
      bestPeriluneT = localBestT;
      bestPhase = localBestPhase;
      bestDv = dv;
    }

    // Good free-return: tight perilune inside Apollo coast window
    if (
      localBestAlt > 50 &&
      localBestAlt < INTERCEPT_ALT &&
      localBestT >= TOA_MIN &&
      localBestT <= TOA_MAX
    ) {
      found = true;
      if (Math.abs(localBestAlt - IDEAL_PERILUNE) < 400) break;
    }
  }

  console.info(
    `[tothemoon] Apollo free-return probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `phase=${bestPhase.toFixed(3)} dv=${bestDv.toFixed(4)} (design=${baseDv.toFixed(4)}, ×${(bestDv / baseDv).toFixed(3)}) ` +
      `· T_des≈${(T / 3600).toFixed(1)}h · ra≈${(xfer.ra / A_EM).toFixed(2)}×A_EM · ` +
      `${found ? "intercept" : "best-effort"}`,
  );

  // Size guidance gates around actual perilune. Keep the same Sun phase used
  // during the probe search (setEpochPhases(_, T)) so 4-body dynamics match.
  const toa =
    Number.isFinite(bestPeriluneT) && bestPeriluneT > 0 ? bestPeriluneT : T;
  setEpochPhases(bestPhase, T);
  const flown = flyMission(bestPhase, bestDv, toa);
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
  const retry = flyMissionEarlyGuidance(bestPhase, bestDv, toa);
  setEpochPhases(bestPhase, retry.durationS);
  return downsample(retry);
}

/** Same as flyMission but forces approach guidance a bit earlier. */
function flyMissionEarlyGuidance(
  moonPhase0: number,
  tliDv: number,
  toa?: number,
): MissionResult {
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
  const T = toa && toa > 0 ? toa : transferTimeEst();
  const maxT = T * 1.35 + 50_000;

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

    if (phase === "coast" && state.t > T * 0.8 && dMoon < 10_000) {
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

  if (minMoonAlt < 5_000) {
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
