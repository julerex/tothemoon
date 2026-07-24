/**
 * Mission orchestrator: Starbase → LEO → TLI → pure ballistic n-body coast.
 *
 * After TLI there are **no burns** (no TCMs, no LOI/PDI). The craft coasts under
 * restricted n-body gravity (Earth + Moon + solar tide + J₂). Outcome is lunar
 * impact or ballistic flyby — not a powered landing.
 */
import {
  A_EM,
  DT_COAST,
  DT_NEAR,
  LEO_COAST_S,
  LEO_RADIUS,
  N_MOON,
  R_MOON,
} from "./constants";
import { ensureAscent, getAscent, resetAscentCache } from "./ascentCache";
import { bodyPositions, setMoonPhase0, setSunPhase0 } from "./bodies";
import { sunPhase0ForLanding } from "./epoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
} from "./integrator";
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
import { createPropState, fuelShipFrac } from "./propellant";
import {
  apogeeFromTliDv,
  lroTransfer,
  maxTliDv,
  runFiniteTli,
  transferTimeEst,
} from "./tli";
import { clone, len, normalize, set, sub, v3 } from "./vec3";

// Re-export public types / helpers so existing imports of ./mission keep working.
export type { PhaseId, Sample, MissionResult } from "./missionTypes";
export { phaseLabel } from "./missionTypes";

const _relP = v3();
const _from = v3();

/** Template LEO (Earth-relative) for probes — set in runMission after a reference ascent. */
let _leoRelTemplate: LeoRel | null = null;

type ProbeResult = { minAlt: number; periluneT: number; rEarth: number };

/** Apply July-2027-consistent ephemeris for a candidate moon phase. */
function setEpochPhases(moonPhase0: number, landingT = transferTimeEst()): void {
  setMoonPhase0(moonPhase0);
  setSunPhase0(sunPhase0ForLanding(moonPhase0, landingT));
}

/**
 * Fast probe: pure restricted n-body ballistic coast after TLI (no burns).
 * Matches flyMission so search scores the path the bake will fly.
 */
function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLeoRel(_leoRelTemplate);
  runFiniteTli(state, tliDv, null, null, null);
  const tTli = state.t;
  const T = transferTimeEst();
  const maxT = tTli + T * 1.35 + 50_000;

  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  let dt = 45;

  while (state.t < maxT) {
    const coastT = state.t - tTli;
    rk4Step(state, dt);

    const altM = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relP, state.pos, b.earth);
    const rE = len(_relP);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
      rEarthAtMin = rE;
    }
    if (altitudeEarth(state.t, state.pos) < 0 && coastT < T * 0.7) {
      return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
    }
    if (altM < 0) {
      return {
        minAlt: Math.min(minAlt, 0),
        periluneT: state.t - tTli,
        rEarth: rE,
      };
    }
    if (
      coastT > T * 0.75 &&
      state.t > periluneT + 5_000 &&
      altM > minAlt + 15_000 &&
      minAlt < 200_000
    ) {
      break;
    }
    const dMoon = distanceToMoon(state.t, state.pos);
    if (dMoon < 60_000) dt = 10;
    else if (dMoon < 150_000) dt = 25;
    else dt = 45;
  }
  return {
    minAlt,
    periluneT: periluneT - tTli,
    rEarth: rEarthAtMin,
  };
}

/**
 * Full flight: ascent → LEO dogleg → finite TLI → pure n-body ballistic coast.
 * Ends in lunar impact or ballistic flyby (no LOI/PDI/landing burns).
 */
function flyMission(moonPhase0: number, tliDv: number, toa?: number): MissionResult {
  void moonPhase0;
  void toa;
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
  const tliBurn = runFiniteTli(state, tliDv, samples, lastT, prop);
  console.info(
    `[tothemoon] TLI finite burn Δv=${tliBurn.dvDelivered.toFixed(3)} km/s · ` +
      `${(tliBurn.burnS / 60).toFixed(2)} min · a=${(tliBurn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );

  // --- Pure ballistic restricted n-body coast (no TCMs, no Kepler rail) ---
  const tTli = state.t;
  const Tcoast = transferTimeEst();
  let minMoonAlt = Infinity;
  let periluneT = tTli;
  const keplerRefMaxDevKm = 0;

  pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");

  // Integrate through lunar encounter; stop after flyby (do not fall all the
  // way back to Earth on a multi-day return leg).
  const maxCoastT = tTli + Tcoast * 1.35 + 60_000;
  while (state.t < maxCoastT) {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    const coastT = state.t - tTli;

    if (altM < minMoonAlt) {
      minMoonAlt = altM;
      periluneT = state.t;
    }

    // Lunar impact — project onto surface, freeze for a short settle
    if (altM < 0) {
      const b = getBodies(state.t);
      sub(_relP, state.pos, b.moon);
      if (len(_relP) < 1e-6) set(_relP, 0, 0, -1);
      normalize(_from, _relP);
      state.pos.x = b.moon.x + _from.x * R_MOON;
      state.pos.y = b.moon.y + _from.y * R_MOON;
      state.pos.z = b.moon.z + _from.z * R_MOON;
      state.vel.x = b.moonVel.x;
      state.vel.y = b.moonVel.y;
      state.vel.z = b.moonVel.z;
      pushSample(samples, state, "impact", false, true, 0, lastT, prop, 0, "ship");
      const tHit = state.t;
      for (let i = 1; i <= 20; i++) {
        const t = tHit + i * 60;
        const bi = bodyPositions(t);
        state.t = t;
        state.pos.x = bi.moon.x + _from.x * R_MOON;
        state.pos.y = bi.moon.y + _from.y * R_MOON;
        state.pos.z = bi.moon.z + _from.z * R_MOON;
        state.vel.x = bi.moonVel.x;
        state.vel.y = bi.moonVel.y;
        state.vel.z = bi.moonVel.z;
        pushSample(samples, state, "impact", false, true, 0, lastT, prop, 0, "ship");
      }
      const msg =
        `Lunar impact (ballistic · no post-TLI burns) · minAlt before hit ≈ ${Math.max(0, minMoonAlt).toFixed(0)} km`;
      console.info(`[tothemoon] ${msg}`);
      return {
        samples,
        durationS: samples[samples.length - 1]!.t,
        moonPhase0,
        tliDv,
        minMoonAlt: Math.min(minMoonAlt, 0),
        ok: true,
        message: msg,
        keplerRefMaxDevKm,
        tcmCount: 0,
        tcmTotalDv: 0,
      };
    }

    // End after the transfer arc (design TOF + margin).
    const transferDone =
      (coastT > Tcoast * 0.95 &&
        state.t > periluneT + 8_000 &&
        altM > minMoonAlt + 10_000) ||
      coastT > Tcoast * 1.15;
    if (transferDone) {
      pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
      const msg =
        minMoonAlt < 100
          ? `Ballistic skim · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-TLI burns)`
          : minMoonAlt < 25_000
            ? `Ballistic flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-TLI burns)`
            : `Distant flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-TLI burns)`;
      console.info(`[tothemoon] ${msg}`);
      return {
        samples,
        durationS: samples[samples.length - 1]!.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: true,
        message: msg,
        keplerRefMaxDevKm,
        tcmCount: 0,
        tcmTotalDv: 0,
      };
    }

    // Earth impact only if it happens before we declare flyby
    if (altitudeEarth(state.t, state.pos) < 0) {
      pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
      console.info(`[tothemoon] Earth impact @ t=${(state.t / 3600).toFixed(1)} h`);
      return {
        samples,
        durationS: samples[samples.length - 1]!.t,
        moonPhase0,
        tliDv,
        minMoonAlt,
        ok: true,
        message: "Earth impact (ballistic · no post-TLI burns)",
        keplerRefMaxDevKm,
        tcmCount: 0,
        tcmTotalDv: 0,
      };
    }

    const dt =
      dMoon < 40_000
        ? DT_NEAR
        : dMoon < 100_000
          ? 5
          : dMoon < 250_000
            ? 12
            : DT_COAST;
    rk4Step(state, dt); // restricted n-body, zero thrust

    pushSample(
      samples,
      state,
      "coast",
      false,
      false,
      dMoon < 100_000 ? 8 : 25,
      lastT,
      prop,
      0,
      "ship",
    );
  }

  // Timeout after long coast
  pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
  const msg =
    Number.isFinite(minMoonAlt) && minMoonAlt < 500_000
      ? `Ballistic coast end · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-TLI burns)`
      : "Ballistic coast end · no lunar encounter (no post-TLI burns)";
  console.info(`[tothemoon] ${msg}`);
  return {
    samples,
    durationS: samples[samples.length - 1]!.t,
    moonPhase0,
    tliDv,
    minMoonAlt,
    ok: true,
    message: msg,
    keplerRefMaxDevKm,
    tcmCount: 0,
    tcmTotalDv: 0,
  };
}

/**
 * Thin long coasts for file size, but never drop near-Earth trail detail.
 */
function downsample(result: MissionResult, maxPoints = 8_000): MissionResult {
  const s = result.samples;
  if (s.length <= maxPoints) return result;
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  let prevPhase: PhaseId | null = null;
  const maxStepKm = 6_000;
  for (let i = 0; i < s.length; i++) {
    const sample = s[i]!;
    const phaseChange = prevPhase !== null && sample.phase !== prevPhase;
    const priority =
      sample.burning ||
      sample.phase === "launch" ||
      sample.phase === "ascent" ||
      sample.phase === "leo" ||
      sample.phase === "tli" ||
      sample.phase === "impact" ||
      sample.phase === "landed" ||
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
      if (i >= next || forceGap) next = i + step;
      else if (phaseChange) next = i + step;
    }
    prevPhase = sample.phase;
  }
  return { ...result, samples: out };
}

/**
 * Starbase → LEO → TLI → ballistic free coast (no post-TLI burns).
 * Outcome: lunar impact or flyby. Probe search aims for a close Moon pass.
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

  const guess = Math.PI - N_MOON * (T + tTli0);

  // Epoch + Δv search for free n-body close pass (hot TLI ladder)
  const phaseOffsets: number[] = [];
  for (let i = -80; i <= 80; i++) phaseOffsets.push(i * 0.03);

  const dvMax = maxTliDv();
  // Prefer design / hotter injects for free-coast reach
  const dvScales = [1.0, 1.015, 1.03, 1.045, 1.06].filter(
    (s) => baseDv * s <= dvMax + 1e-9,
  );

  const INTERCEPT_ALT = 80_000;
  const IDEAL_PERILUNE = 8_000;
  const IDEAL_TOA = T;
  const TOA_MIN = T * 0.65;
  const TOA_MAX = T * 1.4;

  function periluneScore(
    alt: number,
    periluneT: number,
    rEarth: number,
  ): number {
    if (!Number.isFinite(alt) || alt > 400_000) return 1e12;
    // Ignore "closest approach" still in LEO (rE ≪ A_EM)
    if (rEarth < A_EM * 0.5 && alt > 50_000) return 1e12;
    const altTerm =
      alt < 0
        ? 100
        : Math.abs(alt - IDEAL_PERILUNE) +
          (alt > INTERCEPT_ALT ? (alt - INTERCEPT_ALT) * 10 : 0) +
          (alt > 150_000 ? (alt - 150_000) * 8 : 0);
    const dtH = (periluneT - IDEAL_TOA) / 3600;
    const timeTerm = dtH * dtH * 40;
    const rErr = Math.abs(rEarth - A_EM) / 1000;
    const rTerm = rErr * rErr * 25;
    const windowPen =
      periluneT < TOA_MIN
        ? ((TOA_MIN - periluneT) / 3600) ** 2 * 80
        : periluneT > TOA_MAX
          ? ((periluneT - TOA_MAX) / 3600) ** 2 * 80
          : 0;
    const nearLunar =
      rEarth > A_EM * 0.75 && rEarth < A_EM * 1.2
        ? 0
        : ((rEarth - A_EM) / 1000) ** 2 * 50;
    return altTerm + timeTerm + rTerm + windowPen + nearLunar;
  }

  function evalCandidate(dv: number, ph: number): {
    sc: number;
    alt: number;
    t: number;
    rE: number;
  } {
    setEpochPhases(ph, T);
    _leoRelTemplate = computeLeoRel();
    const pr = probePerilune(dv);
    return {
      sc: periluneScore(pr.minAlt, pr.periluneT, pr.rEarth),
      alt: pr.minAlt,
      t: pr.periluneT,
      rE: pr.rEarth,
    };
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
    for (const off of phaseOffsets) {
      const ph = guess + off;
      const ev = evalCandidate(dv, ph);
      if (ev.sc < bestScore) {
        bestScore = ev.sc;
        bestAlt = ev.alt;
        bestPeriluneT = ev.t;
        bestREarth = ev.rE;
        bestPhase = ph;
        bestDv = dv;
      }
    }
  }

  // Coordinate descent refine (phase, then Δv)
  for (let iter = 0; iter < 8; iter++) {
    let improved = false;
    const dPh = 0.02 / (1 + iter);
    for (const s of [-2, -1, 1, 2]) {
      const ph = bestPhase + s * dPh;
      const ev = evalCandidate(bestDv, ph);
      if (ev.sc < bestScore - 1e-6) {
        bestScore = ev.sc;
        bestAlt = ev.alt;
        bestPeriluneT = ev.t;
        bestREarth = ev.rE;
        bestPhase = ph;
        improved = true;
      }
    }
    const dDv = 0.008 / (1 + iter);
    for (const s of [-2, -1, 1, 2]) {
      // Never cool below design (sub-lunar apo → early Earth return)
      const dv = Math.min(dvMax, Math.max(baseDv * 0.999, bestDv + s * dDv));
      const ev = evalCandidate(dv, bestPhase);
      if (ev.sc < bestScore - 1e-6) {
        bestScore = ev.sc;
        bestAlt = ev.alt;
        bestPeriluneT = ev.t;
        bestREarth = ev.rE;
        bestDv = dv;
        improved = true;
      }
    }
    if (!improved) break;
  }

  if (bestAlt < INTERCEPT_ALT) found = true;

  const raDes = apogeeFromTliDv(LEO_RADIUS, bestDv);
  console.info(
    `[tothemoon] Ballistic 4-body probe minMoonAlt=${bestAlt.toFixed(0)} km @${(bestPeriluneT / 3600).toFixed(1)}h ` +
      `rEarth=${(bestREarth / A_EM).toFixed(3)}×A_EM phase=${bestPhase.toFixed(3)} ` +
      `dv=${bestDv.toFixed(4)} (Hohmann=${baseDv.toFixed(4)}) · ` +
      `ra_des≈${Number.isFinite(raDes) ? (raDes / A_EM).toFixed(3) : "∞"}×A_EM · ` +
      `${found ? "close-pass" : "best-effort"}`,
  );

  const toa =
    Number.isFinite(bestPeriluneT) && bestPeriluneT > 0 ? bestPeriluneT : T;
  setEpochPhases(bestPhase, T);
  resetAscentCache();
  ensureAscent(bestPhase);
  _leoRelTemplate = computeLeoRel();

  const flown = flyMission(bestPhase, bestDv, toa);
  setEpochPhases(bestPhase, flown.durationS);

  console.info(
    `[tothemoon] ${flown.message} · duration=${(flown.durationS / 3600).toFixed(1)}h · samples=${flown.samples.length}`,
  );
  return downsample(flown);
}
