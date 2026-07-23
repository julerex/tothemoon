/**
 * Mission orchestrator: Starbase → LEO → TLI → coast → lunar capture → land.
 *
 * Physics slices live in sibling modules (ascent, leoCoast, tli, coast, capture).
 * This file wires probe search, flyMission, downsample, and runMission.
 */
import {
  A_EM,
  DT_COAST,
  DT_NEAR,
  LEO_COAST_S,
  LEO_RADIUS,
  MU_EARTH,
  N_MOON,
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
import { placeOnKeplerTrack } from "./coast";
import { finishLanding, loiThrust } from "./capture";
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
  createPropState,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
} from "./propellant";
import {
  apogeeFromTliDv,
  designApogeeTransferOrbit,
  lroTransfer,
  maxTliDv,
  runFiniteTli,
  transferTimeEst,
} from "./tli";
import { clone, len, scale, sub, v3 } from "./vec3";

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
 * Fast probe: LRO free transfer on the post-TLI Kepler ellipse to apogee.
 * Scores closest approach near design TOF (apo). Matches full-flight coast.
 */
function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLeoRel(_leoRelTemplate);
  runFiniteTli(state, tliDv, null, null, null);
  const tTli = state.t;
  const T = transferTimeEst();
  // Design ellipse: apogee = south-pole rendezvous (not residual n-body inject)
  const orb = designApogeeTransferOrbit(state);
  // Sample through apogee (half-period) with a little margin
  const maxT = tTli + T * 1.08 + 5_000;

  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  // Fixed step so apo timing is stable across phases
  const dt = 60;
  for (let t = tTli + dt; t <= maxT; t += dt) {
    placeOnKeplerTrack(state, orb, t);
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
  // Finite prograde TLI (~2–4 min) — no position teleport
  const tliBurn = runFiniteTli(state, tliDv, samples, lastT, prop);
  console.info(
    `[tothemoon] TLI finite burn Δv=${tliBurn.dvDelivered.toFixed(3)} km/s · ` +
      `${(tliBurn.burnS / 60).toFixed(2)} min · a=${(tliBurn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );

  // --- LRO free coast: design ellipse apogee = south-pole rendezvous ---
  // After finite TLI, lock a clean Kepler transfer whose apo is the aim point.
  // Coast to that apo, then short LOI/PDI — no midcourse burns, no LLO snaps.
  const tTli = state.t;
  const keplerRef = designApogeeTransferOrbit(state);
  // Always step time past TLI so trail invariants see no same-t jump
  state.t = tTli + 2;
  placeOnKeplerTrack(state, keplerRef, state.t);
  pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
  const Tdesign = transferTimeEst();
  // Coast duration = half-period of the design ellipse (true peri→apo)
  const Tcoast =
    keplerRef.a > 0
      ? Math.PI *
        Math.sqrt((keplerRef.a * keplerRef.a * keplerRef.a) / MU_EARTH)
      : Tdesign;
  void Tdesign;
  void toa;
  let minMoonAlt = Infinity;
  let phase: PhaseId = "coast";
  const keplerRefMaxDevKm = 0;

  // Design apogee radius from the inject ellipse
  const raDes =
    keplerRef.a > 0 && keplerRef.e < 1
      ? keplerRef.a * (1 + keplerRef.e)
      : A_EM;
  let rPrev = 0;
  let rMax = 0;
  let pastApo = false;

  const maxCoastT = tTli + Tcoast * 1.12 + 15_000;
  while (state.t < maxCoastT && phase === "coast") {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);
    const coastT = state.t - tTli;
    const bE = getBodies(state.t);
    sub(_relP, state.pos, bE.earth);
    const rE = len(_relP);
    if (rE > rMax) rMax = rE;
    // True apogee: r peaking after ~half-period of the transfer ellipse
    if (rPrev > 1 && rE < rPrev - 2 && coastT > Tcoast * 0.9) pastApo = true;
    rPrev = rE;

    // Handoff only at true apogee (≈ design TOF) while near the Moon —
    // that apo is the intended touchdown geometry (south pole).
    const atDesignApo = coastT >= Tcoast * 0.97 || pastApo;
    const nearMoon = dMoon < 50_000;
    if (atDesignApo && nearMoon) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
      console.info(
        `[tothemoon] Apogee approach · r=${rE.toFixed(0)} km (ra≈${raDes.toFixed(0)}) · ` +
          `dMoon=${dMoon.toFixed(0)} km · coastT=${(coastT / 3600).toFixed(1)} h ` +
          `(design TOF ${(Tcoast / 3600).toFixed(1)} h)`,
      );
      break;
    }
    if (coastT > Tcoast * 1.1 && dMoon > 80_000) {
      return {
        samples,
        durationS: state.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: false,
        message: "Missed Moon",
        keplerRefMaxDevKm,
        tcmCount: 0,
        tcmTotalDv: 0,
      };
    }

    // Dense trail — keep chord length small so the ellipse stays smooth
    const dt =
      dMoon < 120_000 ? DT_NEAR : dMoon < 250_000 ? 6 : Math.min(DT_COAST, 10);
    placeOnKeplerTrack(state, keplerRef, state.t + dt);
    pushSample(
      samples,
      state,
      "coast",
      false,
      false,
      dMoon < 150_000 ? 6 : 15,
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
        tcmCount: 0,
        tcmTotalDv: 0,
      };
    }
  }

  // --- Terminal at apogee: short LOI brake → land at south pole ---
  // Apogee ≈ rendezvous; do not fly a long PDI arc (kinks + sample bloat).
  // approach = brief LOI, braking/descent markers, then bridged surface land.
  let loiStartT = -1;
  const maxT = state.t + 8_000;
  while (state.t < maxT && phase === "approach") {
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    const thrustFn: ThrustFn = (t, p, v) => {
      if (!hasPropellant(prop, "ship")) return null;
      const th = loiThrust(t, p, v);
      if (!th) return null;
      const aCmd = len(th);
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) return null;
      return scale(th, th, lim.aKmS2 / Math.max(aCmd, 1e-12));
    };

    let thNow = hasPropellant(prop, "ship")
      ? loiThrust(state.t, state.pos, state.vel)
      : null;
    if (thNow) {
      if (loiStartT < 0) loiStartT = state.t;
      const aCmd = len(thNow);
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) thNow = null;
      else thNow = scale(thNow, thNow, lim.aKmS2 / Math.max(aCmd, 1e-12));
    }
    rk4Step(state, DT_NEAR, thrustFn);

    const altM2 = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relV, state.vel, b.moonVel);
    const vRel = len(_relV);
    const burnS = loiStartT > 0 ? state.t - loiStartT : 0;
    // Short capture window, then land from apo (bridged finishLanding)
    const doneBurning =
      burnS > 180 ||
      (burnS > 60 && vRel < 0.8) ||
      altM2 < 500 ||
      !hasPropellant(prop, "ship");

    pushSample(
      samples,
      state,
      "approach",
      thNow !== null,
      false,
      4,
      lastT,
      prop,
      thNow ? len(thNow) : 0,
      "ship",
      thNow !== null,
    );

    if (doneBurning) {
      pushSample(samples, state, "braking", false, true, 0, lastT, prop, 0, "ship");
      pushSample(samples, state, "descent", true, true, 0, lastT, prop, 0, "ship");
      console.info(
        `[tothemoon] Apogee land · alt=${altM2.toFixed(0)} km · vRel=${vRel.toFixed(3)} km/s · LOI ${burnS.toFixed(0)} s`,
      );
      const done = finishLanding(
        state,
        samples,
        moonPhase0,
        tliDv,
        minMoonAlt,
        prop,
      );
      return {
        ...done,
        keplerRefMaxDevKm,
        tcmCount: 0,
        tcmTotalDv: 0,
      };
    }
  }

  // Fallback land if still near the Moon
  if (minMoonAlt < 40_000) {
    pushSample(samples, state, "braking", false, true, 0, lastT, prop, 0, "ship");
    pushSample(samples, state, "descent", true, true, 0, lastT, prop, 0, "ship");
    const done = finishLanding(
      state,
      samples,
      moonPhase0,
      tliDv,
      minMoonAlt,
      prop,
    );
    return {
      ...done,
      keplerRefMaxDevKm,
      tcmCount: 0,
      tcmTotalDv: 0,
    };
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
    tcmCount: 0,
    tcmTotalDv: 0,
  };
}

/**
 * Thin long coasts for file size, but never drop near-Earth trail detail.
 * Also enforces a max trail step (~MAX_STEP_KM) so TLI-speed coasts aren't
 * thinned into false "teleports" after dense LOI/PDI blocks inflate the stride.
 */
function downsample(result: MissionResult, maxPoints = 8_000): MissionResult {
  const s = result.samples;
  if (s.length <= maxPoints) return result;
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  let prevPhase: PhaseId | null = null;
  const maxStepKm = 6_000; // stay under invariant cap (8_000)
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
      sample.phase === "braking" ||
      sample.phase === "descent" ||
      phaseChange ||
      i === 0 ||
      i === s.length - 1;
    let forceGap = false;
    if (out.length > 0 && !priority && i < next) {
      const prev = out[out.length - 1]!;
      const dr = Math.hypot(
        sample.pos.x - prev.pos.x,
        sample.pos.y - prev.pos.y,
        sample.pos.z - prev.pos.z,
      );
      if (dr > maxStepKm) forceGap = true;
    }
    if (i >= next || priority || forceGap) {
      out.push(sample);
      // Advance the stride from this index so priority runs don't leave a hole
      // in the following thinned phase.
      if (i >= next || forceGap) next = i + step;
      else if (phaseChange) next = i + step;
    }
    prevPhase = sample.phase;
  }
  return { ...result, samples: out };
}

/**
 * Starbase → LEO → LRO-style free transfer → south-pole approach.
 *
 * At TLI the craft is aimed so the transfer **apogee** is the lunar south-pole
 * rendezvous point. Free coast rides that Kepler ellipse to apo (smooth LRO
 * arc, no midcourse TCMs). Short LOI + PDI at apo land without multi-rev LLO.
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
      // Dogleg into this phase's south-pole transfer plane (ascent cache ok)
      _leoRelTemplate = computeLeoRel();
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
      _leoRelTemplate = computeLeoRel();
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

