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
  coast: "Coast to apogee",
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
 * Hohmann-class TLI: Earth-centered ellipse with apogee near the Moon.
 * Craft is injected at periapsis (LEO); the Moon “catches” it near apogee
 * after half an orbital period (~5 days), not on a fast free-return arc.
 */
/** Target apogee radius (km) — slightly past mean lunar distance for 4-body margin. */
function transferApogee(): number {
  return A_EM * 1.05;
}

function hohmannTransfer(): { ra: number; a: number; tliDv: number; tof: number; vPeri: number } {
  const rp = LEO_RADIUS;
  const ra = transferApogee();
  const a = 0.5 * (rp + ra);
  const vLeo = Math.sqrt(MU_EARTH / rp);
  const vPeri = Math.sqrt(MU_EARTH * (2 / rp - 1 / a));
  // Half ellipse periapsis → apogee
  const tof = Math.PI * Math.sqrt((a * a * a) / MU_EARTH);
  return { ra, a, tliDv: vPeri - vLeo, tof, vPeri };
}

function transferTimeEst(): number {
  return hohmannTransfer().tof;
}

/** Periapsis speed for a transfer with given Δv above circular LEO. */
function transferVPeri(r: number, tliDv: number): number {
  return Math.sqrt(MU_EARTH / r) + tliDv;
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
 * Impulsive TLI: put the craft on a transfer ellipse that meets the Moon
 * near **Earth-centered apogee**.
 *
 * Geometry (2-body ideal):
 * - Periapsis now, on the LEO sphere, opposite the predicted Moon at TOA
 * - Apogee ~ half-period later toward that Moon — lunar gravity “catches” it
 * - Plane = plane of Earth→Moon_arrival and a small reference so Starbase
 *   LEO inclination is replaced by a lunar-plane injection at TLI
 */
function applyTli(state: CraftState, tliDv: number): void {
  const b0 = getBodies(state.t);
  const T = transferTimeEst();
  const b1 = bodyPositions(state.t + T);

  // Predicted Earth→Moon at apogee arrival
  set(
    _tmp,
    b1.moon.x - b1.earth.x,
    b1.moon.y - b1.earth.y,
    b1.moon.z - b1.earth.z,
  );
  const mLen = len(_tmp) || A_EM;
  normalize(_radial, _tmp); // moon-hat at arrival ≈ apogee direction

  // Periapsis opposite the Moon so apogee aims at lunar intercept
  const periX = -_radial.x;
  const periY = -_radial.y;
  const periZ = -_radial.z;

  // Transfer plane: use Moon’s motion for a stable normal
  set(
    _relV,
    b1.moonVel.x - b1.earthVel.x,
    b1.moonVel.y - b1.earthVel.y,
    b1.moonVel.z - b1.earthVel.z,
  );
  // n ∝ r_moon × v_moon (lunar orbital plane); fallback ecliptic north
  cross(_tangent, _tmp, _relV);
  if (len(_tangent) < 1e-6) set(_tangent, _up.x, _up.y, _up.z);
  normalize(_tangent, _tangent); // n

  // Prograde at periapsis: n × peri_hat
  set(_relP, periX, periY, periZ);
  cross(_tmp, _tangent, _relP);
  if (len(_tmp) < 1e-6) {
    cross(_tmp, _up, _relP);
  }
  normalize(_tangent, _tmp); // prograde

  // Park on LEO sphere at periapsis of the transfer
  const r = LEO_RADIUS;
  state.pos.x = b0.earth.x + periX * r;
  state.pos.y = b0.earth.y + periY * r;
  state.pos.z = b0.earth.z + periZ * r;

  // Periapsis speed: circular + tliDv (search scales Δv → tweaks apogee)
  const vPeri = transferVPeri(r, tliDv);
  state.vel.x = b0.earthVel.x + _tangent.x * vPeri;
  state.vel.y = b0.earthVel.y + _tangent.y * vPeri;
  state.vel.z = b0.earthVel.z + _tangent.z * vPeri;

  void mLen;
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
  // Coast through apogee and a bit past (Hohmann half-period + margin)
  const maxT = tTli + T * 1.35 + 40_000;
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
    // Earth impact before apogee → miss
    if (altE < 0 && coastT < T * 0.75) {
      return { minAlt: Infinity, periluneT: 0 };
    }
    if (altE < 0) break;
    // Past closest approach after apogee window — stop
    if (
      coastT > T * 0.7 &&
      state.t > periluneT + 3_000 &&
      altM > minAlt + 20_000 &&
      minAlt < 200_000
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
 * Full fidelity flight: Starbase ascent → LEO → TLI → apogee intercept → landing.
 * `toa` is expected coast time from TLI to lunar encounter (≈ half transfer period).
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
  // Through apogee + margin for capture / descent
  const maxT = tTli + Tcoast * 1.35 + 50_000;

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

    // Capture near apogee when the Moon is close (Hohmann intercept geometry)
    const CAPTURE_RANGE = 45_000;
    if (
      phase === "coast" &&
      coastT > Tcoast * 0.75 &&
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

    // Past apogee with no capture → miss
    if (phase === "coast" && coastT > Tcoast * 1.25 && dMoon > 80_000) {
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
 * Starbase (TX) → LEO → Hohmann-class TLI → Moon at transfer apogee → landing.
 *
 * TLI places the craft at periapsis of an Earth-centered ellipse whose apogee
 * is near the Moon; lunar gravity captures near that apogee (~half period).
 */
export function runMission(): MissionResult {
  const xfer = hohmannTransfer();
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
  // Short LEO coast for visuals; TLI repositions to transfer periapsis
  _leoCoastS = LEO_COAST_S;
  _leoRelTemplate = computeLeoRel();
  const tTli0 = _leoRelTemplate.t;

  // Moon should be near the apogee direction after half-period coast
  // Analytic lead: Moon advances N·T while craft goes periapsis → apogee (π).
  const guess = Math.PI - N_MOON * (T + tTli0);

  const phaseOffsets: number[] = [];
  for (let i = -60; i <= 60; i++) phaseOffsets.push(i * 0.04);

  // Hohmann Δv ladder — small bumps for 4-body intercept at apogee
  const dvScales = [
    0.98, 0.99, 1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.08, 1.1, 1.12, 1.15,
  ];

  /** Prefer close approach near apogee TOA (capture window). */
  const INTERCEPT_ALT = 40_000;
  const IDEAL_PERILUNE = 5_000;
  const IDEAL_TOA = T;
  const TOA_MIN = T * 0.75;
  const TOA_MAX = T * 1.25;

  function periluneScore(alt: number, periluneT: number): number {
    if (!Number.isFinite(alt) || alt > 300_000) return 1e12;
    const altTerm =
      alt < 0
        ? 35_000 - alt
        : Math.abs(alt - IDEAL_PERILUNE) +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 5 : 0);
    // Strongly prefer encounter near apogee (half-period)
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    const timeTerm = dtH * dtH * 120;
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

    for (const off of [
      -0.04, -0.02, -0.01, 0.01, 0.02, 0.04,
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

    // First (lowest) Δv with a real near-apogee intercept wins
    if (
      localBestAlt > 0 &&
      localBestAlt < INTERCEPT_ALT &&
      localBestT >= TOA_MIN &&
      localBestT <= TOA_MAX
    ) {
      bestAlt = localBestAlt;
      bestPeriluneT = localBestT;
      bestPhase = localBestPhase;
      bestDv = dv;
      found = true;
      if (localBestAlt < IDEAL_PERILUNE) break;
    }
  }

  console.info(
    `[tothemoon] Apogee-intercept probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `phase=${bestPhase.toFixed(3)} dv=${bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}, ×${(bestDv / baseDv).toFixed(3)}) ` +
      `· T_apogee≈${(T / 3600).toFixed(1)}h ra≈${(xfer.ra / A_EM).toFixed(2)}×A_EM · ` +
      `${found ? "intercept" : "best-effort"}`,
  );

  // Full flight under the winning ephemeris (ascent recomputed so pad tracks Earth)
  const toa =
    Number.isFinite(bestPeriluneT) && bestPeriluneT > 0 ? bestPeriluneT : T;
  setEpochPhases(bestPhase, T);
  resetAscentCache();
  ensureAscent(bestPhase);
  _leoRelTemplate = computeLeoRel();

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

    if (phase === "coast" && coastT > Tcoast * 0.75 && dMoon < 50_000) {
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
