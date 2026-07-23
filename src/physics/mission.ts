/**
 * Mission orchestrator: Starbase → LEO → TLI → coast → lunar capture → land.
 *
 * Physics slices live in sibling modules (ascent, leoCoast, tli, coast, capture).
 * This file wires probe search, flyMission, downsample, and runMission.
 */
import {
  A_EM,
  DESCENT_ALTITUDE,
  DT_BURN,
  DT_COAST,
  DT_NEAR,
  LEO_COAST_S,
  LEO_RADIUS,
  N_MOON,
  TOUCHDOWN_SPEED,
} from "./constants";
import { ensureAscent, getAscent, resetAscentCache } from "./ascentCache";
import { setMoonPhase0, setSunPhase0 } from "./bodies";
import { sunPhase0ForLanding } from "./epoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type ThrustFn,
} from "./integrator";
import { keplerRefPos, keplerTrackThrust } from "./coast";
import { finishLanding, landingThrust } from "./capture";
import {
  appendAscentAndLeoCoast,
  computeLeoRel,
  getLastDoglegDvKmS,
  restoreLeoRel,
  setLeoCoastS,
  type LeoRel,
} from "./leoCoast";
import { pushSample } from "./missionSample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  applyImpulsiveShipDv,
  createPropState,
  fuelBoosterFrac,
  fuelShipFrac,
} from "./propellant";
import {
  applyTli,
  apogeeFromTliDv,
  lroTransfer,
  maxTliDv,
  orbitAfterTli,
  transferTimeEst,
} from "./tli";
import { clone, len, sub, v3 } from "./vec3";

// Re-export public types / helpers so existing imports of ./mission keep working.
export type { PhaseId, Sample, MissionResult } from "./missionTypes";
export { phaseLabel } from "./missionTypes";

const _relP = v3();
const _relV = v3();

/** Template LEO (Earth-relative) for probes — set in runMission after a reference ascent. */
let _leoRelTemplate: LeoRel | null = null;

type ProbeResult = { minAlt: number; periluneT: number; rEarth: number };

/** Apply July-2027-consistent ephemeris for a candidate moon phase. */
function setEpochPhases(moonPhase0: number, landingT = transferTimeEst()): void {
  setMoonPhase0(moonPhase0);
  setSunPhase0(sunPhase0ForLanding(moonPhase0, landingT));
}

/**
 * Fast probe: N-body ballistic coast after TLI, return minimum Moon altitude.
 * Caller must set moon/sun phases first (see runMission).
 */
function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLeoRel(_leoRelTemplate);
  applyTli(state, tliDv);
  const tTli = state.t;
  const T = transferTimeEst();
  const orb = orbitAfterTli(state);
  const maxT = tTli + T * 1.2 + 40_000;

  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  let dt = 45;
  while (state.t < maxT) {
    const thrustFn: ThrustFn = (tt, p, v) => keplerTrackThrust(tt, p, v, orb);
    rk4Step(state, dt, thrustFn); // N-body + soft Kepler track
    const altM = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relP, state.pos, b.earth);
    const rE = len(_relP);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
      rEarthAtMin = rE;
    }
    const coastT = state.t - tTli;
    if (altitudeEarth(state.t, state.pos) < 0 && coastT < T * 0.7) {
      return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
    }
    if (
      coastT > T * 0.75 &&
      state.t > periluneT + 4_000 &&
      altM > minAlt + 12_000 &&
      minAlt < 120_000
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 60_000) dt = 15;
    else if (dMoon < 150_000) dt = 30;
    else dt = 45;
  }
  return {
    minAlt,
    periluneT: periluneT - tTli,
    rEarth: rEarthAtMin,
  };
}

/**
 * Full fidelity flight: Starbase ascent → LEO → LRO-style TLI → lunar approach.
 * `toa` is expected coast time from TLI to lunar encounter (≈ half transfer period).
 */
function flyMission(moonPhase0: number, tliDv: number, toa?: number): MissionResult {
  // moon/sun phases set by caller (setEpochPhases)
  void moonPhase0;
  const samples: Sample[] = [];
  const lastT = { t: -Infinity };
  const prop = createPropState(0);

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

  const state = appendAscentAndLeoCoast(samples, lastT, prop);
  console.info(
    `[tothemoon] LEO dogleg Δv=${getLastDoglegDvKmS().toFixed(3)} km/s · ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );
  // TLI: lunar-plane Hohmann injection (initial conditions)
  applyTli(state, tliDv);
  // Impulsive Δv as a finite ship burn for fuel + HUD thrust spike
  const tliThrustN = applyImpulsiveShipDv(prop, state.t, tliDv, 180);
  samples.push({
    t: state.t,
    pos: clone(state.pos),
    vel: clone(state.vel),
    phase: "tli",
    burning: true,
    fuelBooster: fuelBoosterFrac(prop),
    fuelShip: fuelShipFrac(prop),
    thrustN: tliThrustN,
    staged: prop.staged,
  });
  lastT.t = state.t;

  // --- N-body ballistic coast; Kepler osculating orbit is reference only ---
  const tTli = state.t;
  const keplerRef = orbitAfterTli(state);
  const Tdesign = transferTimeEst();
  const Tcoast = Tdesign;
  void toa;
  let minMoonAlt = Infinity;
  let phase: PhaseId = "coast";
  let keplerRefMaxDevKm = 0;
  const _kPos = v3();

  const maxCoastT = tTli + Tcoast * 1.2 + 40_000;
  while (state.t < maxCoastT && phase === "coast") {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    // Kepler reference check (Earth-centered 2-body from TLI state)
    keplerRefPos(keplerRef, state.t, _kPos);
    const dev = Math.hypot(
      state.pos.x - _kPos.x,
      state.pos.y - _kPos.y,
      state.pos.z - _kPos.z,
    );
    if (dev > keplerRefMaxDevKm) keplerRefMaxDevKm = dev;

    const coastT = state.t - tTli;
    // Meet Moon near apogee / lunar distance
    if (coastT > Tcoast * 0.85 && dMoon < 35_000) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
      break;
    }
    if (coastT > Tcoast * 1.15 && dMoon > 100_000) {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
        keplerRefMaxDevKm,
      };
    }

    const dt = dMoon < 80_000 ? DT_NEAR : dMoon < 200_000 ? 10 : DT_COAST;
    const trackFn: ThrustFn = (tt, p, v) =>
      keplerTrackThrust(tt, p, v, keplerRef);
    // Soft midcourse: dynamics use it; HUD ignores tiny accel (fuel floor)
    rk4Step(state, dt, trackFn); // restricted 4-body + soft Kepler track
    pushSample(
      samples,
      state,
      "coast",
      false,
      false,
      dMoon < 100_000 ? 15 : 45,
      lastT,
      prop,
      0,
      "ship",
    );
  }

  if (phase === "coast") {
    if (minMoonAlt < 80_000) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
    } else {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
        keplerRefMaxDevKm,
      };
    }
  }

  // --- LOI-style capture + soft landing (N-body + thrust) ---
  const maxT = state.t + 80_000;
  while (state.t < maxT) {
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    if (phase === "approach" && altM < DESCENT_ALTITUDE * 15) {
      phase = "braking";
      const th = landingThrust(state.t, state.pos, state.vel, phase);
      pushSample(
        samples,
        state,
        phase,
        true,
        true,
        0,
        lastT,
        prop,
        th ? len(th) : 0,
        "ship",
      );
    }
    if (
      (phase === "braking" || phase === "approach") &&
      altM < DESCENT_ALTITUDE
    ) {
      phase = "descent";
      const th = landingThrust(state.t, state.pos, state.vel, phase);
      pushSample(
        samples,
        state,
        phase,
        true,
        true,
        0,
        lastT,
        prop,
        th ? len(th) : 0,
        "ship",
      );
    }

    const thrustFn: ThrustFn = (t, p, v) => landingThrust(t, p, v, phase);
    const dt =
      phase === "descent" ? DT_BURN : phase === "braking" ? DT_NEAR : DT_NEAR;
    const thNow = landingThrust(state.t, state.pos, state.vel, phase);
    const burning = thNow !== null;
    rk4Step(state, dt, thrustFn);

    const altM2 = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relV, state.vel, b.moonVel);
    const relSpeed = len(_relV);

    if (altM2 < 0.1 && relSpeed < TOUCHDOWN_SPEED * 8) {
      const done = finishLanding(
        state,
        samples,
        moonPhase0,
        tliDv,
        minMoonAlt,
        prop,
      );
      return { ...done, keplerRefMaxDevKm };
    }
    if (altM2 < 0) {
      const done = finishLanding(
        state,
        samples,
        moonPhase0,
        tliDv,
        minMoonAlt,
        prop,
      );
      return { ...done, keplerRefMaxDevKm };
    }

    const minSampleDt =
      phase === "descent" ? 2 : phase === "braking" ? 6 : 12;
    const aMag = thNow ? len(thNow) : 0;
    // Approach guidance shows thrust but only braking/descent spend ship fuel
    const consume = phase === "braking" || phase === "descent";
    pushSample(
      samples,
      state,
      phase,
      burning,
      false,
      minSampleDt,
      lastT,
      prop,
      aMag,
      "ship",
      consume,
    );
  }

  if (minMoonAlt < 5_000) {
    const done = finishLanding(
      state,
      samples,
      moonPhase0,
      tliDv,
      minMoonAlt,
      prop,
    );
    return { ...done, keplerRefMaxDevKm };
  }

  return {
    samples,
    durationS: state.t,
    moonPhase0,
    tliDv,
    minMoonAlt,
    ok: false,
    message: "Timeout",
    keplerRefMaxDevKm,
  };
}

/**
 * Thin long coasts for file size, but never drop near-Earth trail detail.
 * Previous index-stride thinning skipped the first LEO samples after a dense
 * ascent block (next was already ahead), which looked like a ~300 km teleport.
 */
function downsample(result: MissionResult, maxPoints = 4000): MissionResult {
  const s = result.samples;
  if (s.length <= maxPoints) return result;
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  let prevPhase: PhaseId | null = null;
  for (let i = 0; i < s.length; i++) {
    const sample = s[i]!;
    const phaseChange = prevPhase !== null && sample.phase !== prevPhase;
    // Keep full pad→LEO trail; thin only the long TLI coast / approach.
    const priority =
      sample.burning ||
      sample.phase === "launch" ||
      sample.phase === "ascent" ||
      sample.phase === "leo" ||
      sample.phase === "tli" ||
      sample.phase === "landed" ||
      phaseChange ||
      i === 0 ||
      i === s.length - 1;
    if (i >= next || priority) {
      out.push(sample);
      // Advance the stride from this index so priority runs don't leave a hole
      // in the following thinned phase.
      if (i >= next) next = i + step;
      else if (phaseChange) next = i + step;
    }
    prevPhase = sample.phase;
  }
  return { ...result, samples: out };
}

/**
 * Starbase → LEO → LRO-style coplanar Kepler transfer → meet Moon at apogee.
 *
 * Geometry mirrors LRO: transfer lies in the lunar plane; craft reaches
 * lunar distance at the same time it meets the Moon (smooth arc, no
 * out-of-plane southbound miss).
 */
export function runMission(): MissionResult {
  const xfer = lroTransfer();
  const baseDv = xfer.tliDv;
  const T = xfer.tof;

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
        fuelBooster: s.fuelBooster,
        fuelShip: s.fuelShip,
        thrustN: s.thrustN,
        staged: s.staged,
      })),
      durationS: ascent0.state.t,
      moonPhase0: 0,
      tliDv: 0,
      minMoonAlt: Infinity,
      ok: false,
      message: ascent0.message,
    };
  }
  setLeoCoastS(LEO_COAST_S);
  _leoRelTemplate = computeLeoRel();
  const tTli0 = _leoRelTemplate.t;

  // Moon at apogee after half-period: λ_m(tTli+T) ≈ periapsis + π
  const guess = Math.PI - N_MOON * (T + tTli0);

  const phaseOffsets: number[] = [];
  for (let i = -80; i <= 80; i++) phaseOffsets.push(i * 0.03);

  const dvMax = Math.min(maxTliDv(), baseDv * 1.03);
  const dvScales = [1.0, 1.005, 1.01, 1.015, 1.02, 1.025, 1.03].filter(
    (s) => baseDv * s <= dvMax + 1e-9,
  );

  // Want tight meet at apogee: craft r ≈ A_EM when Moon is close
  const INTERCEPT_ALT = 25_000;
  const IDEAL_PERILUNE = 2_000;
  const IDEAL_TOA = T;
  const TOA_MIN = T * 0.85;
  const TOA_MAX = T * 1.12;

  function periluneScore(
    alt: number,
    periluneT: number,
    rEarth: number,
  ): number {
    if (!Number.isFinite(alt) || alt > 200_000) return 1e12;
    // Prefer intercept at the same time we reach lunar distance
    const altTerm =
      alt < 0
        ? 25_000 - alt
        : Math.abs(alt - IDEAL_PERILUNE) * 2 +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 8 : 0);
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    const timeTerm = dtH * dtH * 200; // strong: meet at apogee TOA
    const rErr = Math.abs(rEarth - A_EM) / 1000;
    const rTerm = rErr * rErr * 25; // at lunar orbit radius
    const overshoot = Math.max(0, rEarth - A_EM * 1.02);
    const overshootTerm = (overshoot / 1000) * (overshoot / 1000) * 100;
    const windowPen =
      periluneT < TOA_MIN
        ? ((TOA_MIN - periluneT) / 3600) ** 2 * 250
        : periluneT > TOA_MAX
          ? ((periluneT - TOA_MAX) / 3600) ** 2 * 250
          : 0;
    return altTerm + timeTerm + rTerm + overshootTerm + windowPen;
  }

  let bestPhase = guess;
  let bestDv = baseDv;
  let bestAlt = Infinity;
  let bestPeriluneT = T;
  let bestREarth = Infinity;
  let bestScore = Infinity;
  let found = false;

  for (const dS of dvScales) {
    const dv = Math.min(baseDv * dS, dvMax);
    let localBestPhase = guess;
    let localBestAlt = Infinity;
    let localBestT = T;
    let localBestR = Infinity;
    let localBestScore = Infinity;

    for (const off of phaseOffsets) {
      const ph = guess + off;
      setEpochPhases(ph, T);
      const pr = probePerilune(dv);
      const sc = periluneScore(pr.minAlt, pr.periluneT, pr.rEarth);
      if (sc < localBestScore) {
        localBestScore = sc;
        localBestAlt = pr.minAlt;
        localBestT = pr.periluneT;
        localBestR = pr.rEarth;
        localBestPhase = ph;
      }
    }

    for (const off of [-0.03, -0.015, 0.015, 0.03]) {
      const ph = localBestPhase + off;
      setEpochPhases(ph, T);
      const pr = probePerilune(dv);
      const sc = periluneScore(pr.minAlt, pr.periluneT, pr.rEarth);
      if (sc < localBestScore) {
        localBestScore = sc;
        localBestAlt = pr.minAlt;
        localBestT = pr.periluneT;
        localBestR = pr.rEarth;
        localBestPhase = ph;
      }
    }

    if (localBestScore < bestScore) {
      bestScore = localBestScore;
      bestAlt = localBestAlt;
      bestPeriluneT = localBestT;
      bestREarth = localBestR;
      bestPhase = localBestPhase;
      bestDv = dv;
    }

    // Lowest Δv with intercept near lunar distance (LRO / min-energy spirit)
    if (
      localBestAlt > 0 &&
      localBestAlt < INTERCEPT_ALT &&
      localBestT >= TOA_MIN &&
      localBestT <= TOA_MAX &&
      localBestR > A_EM * 0.85 &&
      localBestR < A_EM * 1.06
    ) {
      bestAlt = localBestAlt;
      bestPeriluneT = localBestT;
      bestREarth = localBestR;
      bestPhase = localBestPhase;
      bestDv = dv;
      found = true;
      break;
    }
  }

  const raDes = apogeeFromTliDv(LEO_RADIUS, bestDv);
  console.info(
    `[tothemoon] LRO-style probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `rEarth=${(bestREarth / A_EM).toFixed(3)}×A_EM phase=${bestPhase.toFixed(3)} ` +
      `dv=${bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}, ×${(bestDv / baseDv).toFixed(3)}) ` +
      `· ra_des≈${Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞"}×A_EM T≈${(T / 3600).toFixed(1)}h · ` +
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
    const kDev = flown.keplerRefMaxDevKm ?? 0;
    console.info(
      `[tothemoon] Mission OK duration=${(flown.durationS / 3600).toFixed(1)}h ` +
        `(${(flown.durationS / 86400).toFixed(2)} d) samples=${flown.samples.length} ` +
        `· Kepler-ref max |Δr|=${kDev.toFixed(0)} km ` +
        `(${((kDev / A_EM) * 100).toFixed(2)}% of A_EM)`,
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
  if (retry.keplerRefMaxDevKm != null) {
    console.info(
      `[tothemoon] Kepler-ref max |Δr|=${retry.keplerRefMaxDevKm.toFixed(0)} km on retry`,
    );
  }
  return downsample(retry);
}

/** Fallback with earlier capture gate on the N-body coast. */
function flyMissionEarlyGuidance(
  moonPhase0: number,
  tliDv: number,
  toa?: number,
): MissionResult {
  void toa;
  // Primary already uses N-body coast + LOI; re-run with same TLI
  return flyMission(moonPhase0, tliDv, transferTimeEst());
}

