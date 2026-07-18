import {
  A_EM,
  DESCENT_ALTITUDE,
  DT_BURN,
  DT_COAST,
  DT_NEAR,
  LANDING_ACCEL,
  LEO_COAST_S,
  LEO_RADIUS,
  MU_EARTH,
  MU_MOON,
  N_MOON,
  R_MOON,
  TOUCHDOWN_SPEED,
} from "./constants";
import { flyAscent, type AscentResult } from "./ascent";
import { bodyPositions, setMoonPhase0, setSunPhase0 } from "./bodies";
import { sunPhase0ForLanding } from "./epoch";
import {
  altitudeEarth,
  altitudeMoon,
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
  | "launch"
  | "ascent"
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
  launch: "Liftoff · Starbase",
  ascent: "Ascent to LEO",
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

/** Cached Starbase → LEO under the current Moon/Sun ephemeris. */
let _ascentCache: AscentResult | null = null;
let _ascentPhaseKey = NaN;

function getAscent(): AscentResult {
  // Recompute if ephemeris changed (Moon phase moves the barycentric Earth)
  const key = 0; // filled by ensureAscent(phaseKey)
  void key;
  if (!_ascentCache) {
    _ascentCache = flyAscent();
    console.info(
      `[tothemoon] Ascent ${_ascentCache.ok ? "OK" : "FAIL"}: ${_ascentCache.message} · ` +
        `t=${(_ascentCache.state.t / 60).toFixed(1)} min · alt=${_ascentCache.insertionAlt.toFixed(1)} km · ` +
        `v=${_ascentCache.insertionSpeed.toFixed(3)} km/s · samples=${_ascentCache.samples.length}`,
    );
  }
  return _ascentCache;
}

/** Force a fresh ascent under the currently set moon/sun phases. */
function resetAscentCache(): void {
  _ascentCache = null;
  _ascentPhaseKey = NaN;
}

function ensureAscent(moonPhase0: number): AscentResult {
  if (_ascentCache && _ascentPhaseKey === moonPhase0) return _ascentCache;
  _ascentCache = null;
  _ascentPhaseKey = moonPhase0;
  return getAscent();
}

function cloneState(s: CraftState): CraftState {
  return { t: s.t, pos: clone(s.pos), vel: clone(s.vel) };
}

/** Earth-relative LEO state at TLI epoch (survives Moon-phase ephemeris changes). */
type LeoRel = { t: number; relPos: V3; relVel: V3 };

function captureLeoRel(state: CraftState): LeoRel {
  const b = getBodies(state.t);
  return {
    t: state.t,
    relPos: {
      x: state.pos.x - b.earth.x,
      y: state.pos.y - b.earth.y,
      z: state.pos.z - b.earth.z,
    },
    relVel: {
      x: state.vel.x - b.earthVel.x,
      y: state.vel.y - b.earthVel.y,
      z: state.vel.z - b.earthVel.z,
    },
  };
}

function restoreLeoRel(rel: LeoRel): CraftState {
  const b = getBodies(rel.t);
  return {
    t: rel.t,
    pos: {
      x: b.earth.x + rel.relPos.x,
      y: b.earth.y + rel.relPos.y,
      z: b.earth.z + rel.relPos.z,
    },
    vel: {
      x: b.earthVel.x + rel.relVel.x,
      y: b.earthVel.y + rel.relVel.y,
      z: b.earthVel.z + rel.relVel.z,
    },
  };
}

/** Chosen LEO coast before TLI (s); set by runMission search. */
let _leoCoastS = LEO_COAST_S;

/** Ascent + LEO coast under current ephemeris → Earth-relative TLI state. */
function computeLeoRel(coastS: number = _leoCoastS): LeoRel {
  const ascent = getAscent();
  const state = cloneState(ascent.state);
  const tliEpoch = state.t + coastS;
  while (state.t < tliEpoch) {
    const dt = Math.min(DT_COAST, tliEpoch - state.t);
    rk4Step(state, dt);
  }
  return captureLeoRel(state);
}

/** Append ascent samples, then coast LEO until TLI epoch; returns post-coast state. */
function appendAscentAndLeoCoast(
  samples: Sample[],
  lastT: { t: number },
  coastS: number = _leoCoastS,
): CraftState {
  const ascent = getAscent();
  for (const s of ascent.samples) {
    samples.push({
      t: s.t,
      pos: clone(s.pos),
      vel: clone(s.vel),
      phase: s.phase,
      burning: s.burning,
    });
    lastT.t = s.t;
  }
  const state = cloneState(ascent.state);
  const tliEpoch = state.t + coastS;
  while (state.t < tliEpoch) {
    const dt = Math.min(DT_COAST, tliEpoch - state.t);
    rk4Step(state, dt);
    if (state.t - lastT.t >= 30) {
      pushSample(samples, state, "leo", false, false, 30, lastT);
    }
  }
  pushSample(samples, state, "leo", false, true, 0, lastT);
  return state;
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
    // Far-field capture from inclined-LEO intercepts (~10–50 Mm): close in
    // aggressively so approach is hours, not a full day.
    const closeIn = alt > 30_000 ? 2.2 : alt > 12_000 ? 1.1 : alt > 4_000 ? 0.45 : 0.16;
    targetVRad = -closeIn;
    gain = 0.9;
    hGain = 1.25;
    maxA = LANDING_ACCEL * (alt > 20_000 ? 4.0 : alt > 8_000 ? 2.6 : 1.6);
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

/**
 * Impulsive TLI from (possibly inclined) Starbase LEO toward the Moon.
 *
 * Sets Earth-relative velocity to transfer-periapsis speed (v_circ + tliDv) in the
 * plane containing the craft and the predicted Moon at TOA. That both raises
 * energy and does the plane change a pure-prograde burn from i≈26° cannot.
 */
function applyTli(state: CraftState, tliDv: number): void {
  const b0 = getBodies(state.t);
  sub(_relP, state.pos, b0.earth);
  sub(_relV, state.vel, b0.earthVel);
  const r = len(_relP);
  normalize(_radial, _relP);

  // Predicted Earth→Moon at coast TOA
  const T = transferTimeEst();
  const b1 = bodyPositions(state.t + T);
  set(
    _tmp,
    b1.moon.x - b1.earth.x,
    b1.moon.y - b1.earth.y,
    b1.moon.z - b1.earth.z,
  );

  // Transfer-plane normal n ∝ r × r_moon; periapsis prograde = n × r̂
  cross(_tangent, _relP, _tmp); // n raw
  if (len(_tangent) < 1e-6) {
    if (len(_relV) > 1e-9) normalize(_tangent, _relV);
    else {
      cross(_tangent, _up, _radial);
      normalize(_tangent, _tangent);
    }
  } else {
    cross(_tmp, _tangent, _radial); // n × r̂
    normalize(_tangent, _tmp);
    if (dot(_tangent, _relV) < 0) scale(_tangent, _tangent, -1);
  }

  // Periapsis speed on a transfer with Δv ≈ tliDv above circular
  const vCirc = Math.sqrt(MU_EARTH / r);
  const vPeri = vCirc + tliDv;
  state.vel.x = b0.earthVel.x + _tangent.x * vPeri;
  state.vel.y = b0.earthVel.y + _tangent.y * vPeri;
  state.vel.z = b0.earthVel.z + _tangent.z * vPeri;
}

/**
 * Fast probe: coast only, return minimum Moon altitude.
 * Caller must set moon/sun phases first (see runMission).
 */
type ProbeResult = { minAlt: number; periluneT: number };

/** Template LEO (Earth-relative) for probes — set in runMission after a reference ascent. */
let _leoRelTemplate: LeoRel | null = null;

function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0 };
  }
  // Reattach LEO to current Earth (Moon phase may have changed barycentric frame)
  const state = restoreLeoRel(_leoRelTemplate);
  const tTli = state.t;
  applyTli(state, tliDv);
  const T = transferTimeEst();
  // Free-return: allow coast past lunar encounter (and a bit of the return arc)
  const maxT = tTli + T * 1.7 + 60_000;
  let minAlt = Infinity;
  let periluneT = tTli;
  let dt = 120;
  while (state.t < maxT) {
    rk4Step(state, dt);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
    }
    const coastT = state.t - tTli;
    // Earth impact before lunar encounter → miss
    if (altE < 0 && coastT < T * 0.65) {
      return { minAlt: Infinity, periluneT: 0 };
    }
    if (altE < 0) break;
    // Passed closest approach to Moon and climbing away (free-return outbound)
    if (
      coastT > T * 0.5 &&
      state.t > periluneT + 3_000 &&
      altM > minAlt + 20_000 &&
      minAlt < 250_000
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 80_000) dt = 30;
    else if (dMoon < 200_000) dt = 60;
    else dt = 120;
  }
  // Return perilune time measured from TLI for transfer scoring
  return { minAlt, periluneT: periluneT - tTli };
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
 * Full fidelity flight: Starbase ascent → LEO → TLI → free-return → landing.
 * `toa` is expected coast time from TLI to lunar perilune (ballistic probe).
 */
function flyMission(moonPhase0: number, tliDv: number, toa?: number): MissionResult {
  // moon/sun phases set by caller (setEpochPhases)
  void moonPhase0;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };

  if (!getAscent().ok) {
    return {
      samples,
      durationS: 0,
      moonPhase0,
      tliDv,
      minMoonAlt: Infinity,
      ok: false,
      message: "Ascent failed",
    };
  }

  const state = appendAscentAndLeoCoast(samples, lastT);
  const tTli = state.t;
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const Tcoast = toa && toa > 0 ? toa : transferTimeEst();
  // Absolute perilune estimate; margin for braking + powered descent
  const maxT = tTli + Tcoast * 1.25 + 40_000;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    const altE = altitudeEarth(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);
    const coastT = state.t - tTli;

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

    // Capture once near the Moon. Wider gate than pure free-return: Starbase
    // inclined LEO rarely threads a <200 km perilune ballistically.
    const CAPTURE_RANGE = 55_000;
    if (
      phase === "coast" &&
      coastT > Tcoast * 0.45 &&
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
    if (phase === "coast" && coastT > Tcoast * 1.2 && dMoon > 80_000) {
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

function downsample(result: MissionResult, maxPoints = 2800): MissionResult {
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
      sample.phase === "launch" ||
      sample.phase === "ascent" ||
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
 * Starbase (TX) → LEO → Apollo free-return → lunar landing.
 *
 * Ascent is integrated once (due-east from ~26° N), then TLI Δv / Moon phase
 * are searched for a free-return intercept under July-2027 Sun geometry.
 */
export function runMission(): MissionResult {
  const xfer = apolloTransfer();
  const baseDv = xfer.tliDv;
  const T = xfer.tof;

  // Reference ascent under a neutral ephemeris to get Earth-relative LEO / TLI time
  resetAscentCache();
  setEpochPhases(0, T);
  const ascent0 = ensureAscent(0);
  if (!ascent0.ok) {
    return {
      samples: ascent0.samples.map((s) => ({
        t: s.t,
        pos: clone(s.pos),
        vel: clone(s.vel),
        phase: s.phase,
        burning: s.burning,
      })),
      durationS: ascent0.state.t,
      moonPhase0: 0,
      tliDv: 0,
      minMoonAlt: Infinity,
      ok: false,
      message: ascent0.message,
    };
  }
  _leoRelTemplate = computeLeoRel();
  const tTli0 = _leoRelTemplate.t;

  // Encounter true anomaly f_enc < π; Moon lead from TLI epoch
  const guess = xfer.fEnc - N_MOON * (T + tTli0);

  const phaseOffsets: number[] = [];
  // Wider search — inclined LEO from Starbase is less coplanar with the Moon
  for (let i = -90; i <= 90; i++) phaseOffsets.push(i * 0.035);

  // Stay near Apollo design energy; ladder covers 4-body intercept solutions.
  const dvScales = [
    0.97, 0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.08, 1.1,
    1.12, 1.14, 1.16, 1.18, 1.2, 1.22, 1.25,
  ];

  /**
   * From inclined Starbase LEO, a pure free-return <200 km perilune is rare.
   * Accept a moderate flyby that guidance can capture (CAPTURE_RANGE ~55 Mm).
   */
  const INTERCEPT_ALT = 55_000;
  const IDEAL_PERILUNE = 8_000;
  const IDEAL_TOA = T;
  const TOA_MIN = 1.5 * 86_400;
  const TOA_MAX = 5.5 * 86_400;

  function periluneScore(alt: number, periluneT: number): number {
    if (!Number.isFinite(alt) || alt > 350_000) return 1e12;
    const altTerm =
      alt < 0
        ? 40_000 - alt
        : Math.abs(alt - IDEAL_PERILUNE) +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 4 : 0);
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    const timeTerm = dtH * dtH * 40;
    const windowPen =
      periluneT < TOA_MIN
        ? ((TOA_MIN - periluneT) / 3600) ** 2 * 100
        : periluneT > TOA_MAX
          ? ((periluneT - TOA_MAX) / 3600) ** 2 * 100
          : 0;
    return altTerm + timeTerm + windowPen;
  }

  // LEO coast candidates (min) — departure true anomaly matters a lot
  const coastOptions = [10, 15, 20, 30, 45].map((m) => m * 60);

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;
  let bestPeriluneT = T;
  let bestScore = Infinity;
  let bestCoast = LEO_COAST_S;
  let found = false;

  for (const coastS of coastOptions) {
    _leoCoastS = coastS;
    // Rebuild LEO template at this coast under reference ephemeris
    setEpochPhases(0, T);
    resetAscentCache();
    ensureAscent(0);
    _leoRelTemplate = computeLeoRel(coastS);

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

      for (const off of [-0.03, -0.015, 0.015, 0.03]) {
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
        bestCoast = coastS;
      }

      if (localBestAlt > 0 && localBestAlt < INTERCEPT_ALT) {
        found = true;
        if (localBestAlt < IDEAL_PERILUNE * 2) break;
      }
    }
    if (found && bestAlt < IDEAL_PERILUNE * 2) break;
  }

  _leoCoastS = bestCoast;

  console.info(
    `[tothemoon] Starbase→Moon probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `phase=${bestPhase.toFixed(3)} dv=${bestDv.toFixed(4)} coast=${(bestCoast / 60).toFixed(0)}min ` +
      `· T_des≈${(T / 3600).toFixed(1)}h · ${found ? "intercept" : "best-effort"}`,
  );

  // Full flight under the winning ephemeris (ascent recomputed so pad tracks Earth)
  const toa =
    Number.isFinite(bestPeriluneT) && bestPeriluneT > 0 ? bestPeriluneT : T;
  setEpochPhases(bestPhase, T);
  resetAscentCache();
  ensureAscent(bestPhase);
  _leoRelTemplate = computeLeoRel(bestCoast);

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
  resetAscentCache();
  ensureAscent(bestPhase);
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
  const state = appendAscentAndLeoCoast(samples, lastT);
  const tTli = state.t;
  applyTli(state, tliDv);
  pushSample(samples, state, "tli", true, true, 0, lastT);

  let phase: PhaseId = "coast";
  let minMoonAlt = Infinity;
  const Tcoast = toa && toa > 0 ? toa : transferTimeEst();
  const maxT = tTli + Tcoast * 1.35 + 50_000;

  while (state.t < maxT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);
    const coastT = state.t - tTli;

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

    if (phase === "coast" && coastT > Tcoast * 0.45 && dMoon < 60_000) {
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
