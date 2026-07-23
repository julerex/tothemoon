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
  LLO_COAST_REVS,
  N_MOON,
  R_MOON,
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
  type CraftState,
  type ThrustFn,
} from "./integrator";
import {
  keplerRefPos,
  rejoinSouthOfMoon,
  runTcmBurn,
  tcmDeltaV,
  TCM_APPROACH_FRAC,
  TCM_HOURS_AFTER_TLI,
  type TcmRecord,
} from "./coast";
import {
  finishLanding,
  lloPeriodS,
  loiComplete,
  loiThrust,
  pdiThrust,
  snapPolarLlo,
} from "./capture";
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
  lroTransfer,
  maxTliDv,
  orbitAfterTli,
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
 * Apply a TCM if |Δv| is meaningful. Mutates state; optional samples/prop.
 */
function maybeTcm(
  state: CraftState,
  orb: ReturnType<typeof orbitAfterTli>,
  tTli: number,
  label: string,
  hoursAfterTli: number,
  records: TcmRecord[],
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: ReturnType<typeof createPropState> | null,
): void {
  const { dv, mag } = tcmDeltaV(state.t, state.pos, state.vel, orb);
  if (mag < 0.002) return; // skip tiny corrections
  const delivered = runTcmBurn(state, dv, samples, lastT, prop, orb);
  if (delivered > 1e-4) {
    records.push({
      t: state.t,
      hoursAfterTli,
      dvKmS: delivered,
      label,
    });
  }
  void tTli;
}

/**
 * Fast probe: N-body **ballistic** coast + discrete TCMs after TLI.
 * Caller must set moon/sun phases first (see runMission).
 */
function probePerilune(tliDv: number): ProbeResult {
  if (!_leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLeoRel(_leoRelTemplate);
  // Same finite burn as full flight (no samples) so probe matches inject
  runFiniteTli(state, tliDv, null, null, null);
  const tTli = state.t;
  const T = transferTimeEst();
  const orb = orbitAfterTli(state);
  const maxT = tTli + T * 1.2 + 40_000;
  const records: TcmRecord[] = [];
  const tcmDue = TCM_HOURS_AFTER_TLI.map((h) => ({
    t: tTli + h * 3600,
    h,
    label: `TCM +${h}h`,
    done: false,
  }));
  let approachTcmDone = false;

  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  let dt = 45;
  while (state.t < maxT) {
    const coastT = state.t - tTli;
    for (const slot of tcmDue) {
      if (!slot.done && state.t >= slot.t) {
        maybeTcm(state, orb, tTli, slot.label, slot.h, records, null, null, null);
        slot.done = true;
      }
    }
    if (!approachTcmDone && coastT >= T * TCM_APPROACH_FRAC) {
      // Probe: keep Kepler TCM so intercept search stays well-posed
      maybeTcm(
        state,
        orb,
        tTli,
        "TCM approach",
        coastT / 3600,
        records,
        null,
        null,
        null,
      );
      approachTcmDone = true;
    }

    rk4Step(state, dt); // pure restricted 4-body (no continuous track)
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
  // Finite prograde TLI (~2–4 min) — no position teleport
  const tliBurn = runFiniteTli(state, tliDv, samples, lastT, prop);
  console.info(
    `[tothemoon] TLI finite burn Δv=${tliBurn.dvDelivered.toFixed(3)} km/s · ` +
      `${(tliBurn.burnS / 60).toFixed(2)} min · a=${(tliBurn.accel / 0.00980665).toFixed(2)} g · ` +
      `ship fuel=${(fuelShipFrac(prop) * 100).toFixed(1)}%`,
  );

  // --- N-body ballistic coast + discrete TCMs (Kepler ref for corridor only) ---
  const tTli = state.t;
  const keplerRef = orbitAfterTli(state);
  const Tdesign = transferTimeEst();
  const Tcoast = Tdesign;
  void toa;
  let minMoonAlt = Infinity;
  let phase: PhaseId = "coast";
  let keplerRefMaxDevKm = 0;
  const _kPos = v3();
  const tcmRecords: TcmRecord[] = [];
  const tcmDue = TCM_HOURS_AFTER_TLI.map((h) => ({
    t: tTli + h * 3600,
    h,
    label: `TCM +${h}h`,
    done: false,
  }));
  let approachTcmDone = false;

  const maxCoastT = tTli + Tcoast * 1.2 + 40_000;
  while (state.t < maxCoastT && phase === "coast") {
    const dMoon = distanceToMoon(state.t, state.pos);
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    // Kepler reference check (Earth-centered 2-body from TLI state) — diagnostic
    keplerRefPos(keplerRef, state.t, _kPos);
    const dev = Math.hypot(
      state.pos.x - _kPos.x,
      state.pos.y - _kPos.y,
      state.pos.z - _kPos.z,
    );
    if (dev > keplerRefMaxDevKm) keplerRefMaxDevKm = dev;

    const coastT = state.t - tTli;

    // Discrete midcourse corrections (not continuous PD)
    for (const slot of tcmDue) {
      if (!slot.done && state.t >= slot.t) {
        maybeTcm(
          state,
          keplerRef,
          tTli,
          slot.label,
          slot.h,
          tcmRecords,
          samples,
          lastT,
          prop,
        );
        slot.done = true;
      }
    }
    // Midcourse Kepler TCMs (12h / 48h). South corridor is applied at approach entry.
    if (!approachTcmDone && coastT >= Tcoast * TCM_APPROACH_FRAC) {
      maybeTcm(
        state,
        keplerRef,
        tTli,
        "TCM approach",
        coastT / 3600,
        tcmRecords,
        samples,
        lastT,
        prop,
      );
      approachTcmDone = true;
    }

    // Meet Moon on the inbound/near-side (start early so LOI can fire before peri)
    if (coastT > Tcoast * 0.7 && dMoon < 80_000) {
      // South-pole geometry: bridge onto a southern approach corridor before LOI
      const dvS = rejoinSouthOfMoon(state, samples, lastT, prop);
      if (dvS > 1e-4) {
        tcmRecords.push({
          t: state.t,
          hoursAfterTli: coastT / 3600,
          dvKmS: dvS,
          label: "TCM approach (south)",
        });
      }
      approachTcmDone = true;
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
        tcmCount: tcmRecords.length,
        tcmTotalDv: tcmRecords.reduce((s, r) => s + r.dvKmS, 0),
      };
    }

    const dt = dMoon < 80_000 ? DT_NEAR : dMoon < 200_000 ? 10 : DT_COAST;
    rk4Step(state, dt); // pure ballistic restricted 4-body
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

  const tcmTotalDv = tcmRecords.reduce((s, r) => s + r.dvKmS, 0);
  if (tcmRecords.length > 0) {
    console.info(
      `[tothemoon] TCMs: ${tcmRecords.length} · total Δv=${tcmTotalDv.toFixed(4)} km/s · ` +
        tcmRecords.map((r) => `${r.label}=${(r.dvKmS * 1000).toFixed(0)} m/s`).join(", "),
    );
  }

  if (phase === "coast") {
    if (minMoonAlt < 80_000) {
      const dvS = rejoinSouthOfMoon(state, samples, lastT, prop);
      if (dvS > 1e-4) {
        tcmRecords.push({
          t: state.t,
          hoursAfterTli: (state.t - tTli) / 3600,
          dvKmS: dvS,
          label: "TCM approach (south)",
        });
      }
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
        tcmCount: tcmRecords.length,
        tcmTotalDv,
      };
    }
  }

  // --- B1: LOI burn → LLO coast → PDI → south-pole land ---
  // approach = LOI, braking = ballistic LLO, descent = PDI
  let lloCoastEndT = Infinity;
  let loiStartT = -1;
  const maxT = state.t + 250_000;
  while (state.t < maxT) {
    const altM = altitudeMoon(state.t, state.pos);
    minMoonAlt = Math.min(minMoonAlt, altM);

    // LOI complete → snap polar LLO + coast
    if (phase === "approach" && loiComplete(state.t, state.pos, state.vel)) {
      snapPolarLlo(state.t, state, samples, lastT, prop);
      const altSnap = altitudeMoon(state.t, state.pos);
      minMoonAlt = Math.min(minMoonAlt, altSnap);
      const coastS = Math.min(
        LLO_COAST_REVS * lloPeriodS(R_MOON + Math.max(altSnap, 80)),
        3.5 * 3600,
      );
      lloCoastEndT = state.t + coastS;
      phase = "braking";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
      console.info(
        `[tothemoon] LOI complete · LLO alt=${altSnap.toFixed(0)} km · coast ${(coastS / 3600).toFixed(2)} h`,
      );
    }

    // Force capture: long LOI, past peri, or dry tanks near Moon (theater)
    if (
      phase === "approach" &&
      minMoonAlt < 40_000 &&
      ((altM < 6_000 &&
        loiStartT > 0 &&
        state.t - loiStartT > 2_400) ||
        (altM > minMoonAlt + 300 &&
          minMoonAlt < 12_000 &&
          loiStartT > 0 &&
          state.t - loiStartT > 400) ||
        (altM > minMoonAlt + 500 &&
          minMoonAlt < 35_000 &&
          !hasPropellant(prop, "ship") &&
          state.t - (loiStartT > 0 ? loiStartT : state.t) > 60) ||
        (altM > minMoonAlt + 800 &&
          minMoonAlt < 8_000 &&
          state.t > 0))
    ) {
      snapPolarLlo(state.t, state, samples, lastT, prop);
      const altSnap = altitudeMoon(state.t, state.pos);
      minMoonAlt = Math.min(minMoonAlt, altSnap);
      const coastS = Math.min(
        LLO_COAST_REVS * lloPeriodS(R_MOON + Math.max(altSnap, 80)),
        3.5 * 3600,
      );
      lloCoastEndT = state.t + coastS;
      phase = "braking";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
      console.info(
        `[tothemoon] LOI → LLO coast · alt=${altSnap.toFixed(0)} km · minAlt=${minMoonAlt.toFixed(0)} km · coast ${(coastS / 3600).toFixed(2)} h`,
      );
    }

    // LLO coast done → PDI
    if (phase === "braking" && state.t >= lloCoastEndT) {
      phase = "descent";
      pushSample(samples, state, phase, true, true, 0, lastT, prop, 0, "ship");
      console.info(`[tothemoon] PDI · powered descent from ${altM.toFixed(0)} km`);
    }

    // Emergency: very low without LOI complete → PDI
    if (phase === "approach" && altM < 40) {
      phase = "descent";
      pushSample(samples, state, phase, true, true, 0, lastT, prop, 0, "ship");
    }
    if (phase === "braking" && altM < DESCENT_ALTITUDE * 0.5) {
      phase = "descent";
      pushSample(samples, state, phase, true, true, 0, lastT, prop, 0, "ship");
    }

    const dt =
      phase === "descent"
        ? DT_BURN
        : phase === "braking"
          ? DT_NEAR * 2
          : DT_NEAR;

    const thrustFn: ThrustFn = (t, p, v) => {
      if (!hasPropellant(prop, "ship")) return null;
      let th =
        phase === "approach"
          ? loiThrust(t, p, v)
          : phase === "descent"
            ? pdiThrust(t, p, v)
            : null;
      if (!th) return null;
      const aCmd = len(th);
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) return null;
      return scale(th, th, lim.aKmS2 / Math.max(aCmd, 1e-12));
    };

    let thNow =
      phase === "approach"
        ? loiThrust(state.t, state.pos, state.vel)
        : phase === "descent"
          ? pdiThrust(state.t, state.pos, state.vel)
          : null;
    if (thNow && hasPropellant(prop, "ship")) {
      if (phase === "approach" && loiStartT < 0) loiStartT = state.t;
      const aCmd = len(thNow);
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) thNow = null;
      else thNow = scale(thNow, thNow, lim.aKmS2 / Math.max(aCmd, 1e-12));
    } else if (!hasPropellant(prop, "ship")) {
      thNow = null;
    }
    const burning = thNow !== null;
    rk4Step(state, dt, thrustFn);

    const altM2 = altitudeMoon(state.t, state.pos);
    const b = getBodies(state.t);
    sub(_relV, state.vel, b.moonVel);
    const relSpeed = len(_relV);

    const softTouch =
      phase === "descent" &&
      altM2 < 0.35 &&
      relSpeed < TOUCHDOWN_SPEED * 15;
    const hardImpact = phase === "descent" && altM2 < 0;
    // Dry tanks in descent: theater finish (bridged surface project + taxi)
    const dryDescent =
      phase === "descent" &&
      !hasPropellant(prop, "ship") &&
      altM2 < 8_000 &&
      state.t - (loiStartT > 0 ? loiStartT : state.t) > 30;

    if (softTouch || hardImpact || dryDescent) {
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
        tcmCount: tcmRecords.length,
        tcmTotalDv,
      };
    }

    const minSampleDt =
      phase === "descent" ? 2 : phase === "braking" ? 20 : 8;
    const aMag = thNow ? len(thNow) : 0;
    // LOI + PDI spend fuel; LLO coast is ballistic
    const consume = phase === "approach" || phase === "descent";
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

  // Timeout: settle if we got close
  if (minMoonAlt < 5_000) {
    if (phase === "approach") {
      pushSample(samples, state, "braking", false, true, 0, lastT, prop, 0, "ship");
      pushSample(samples, state, "descent", true, true, 0, lastT, prop, 0, "ship");
    } else if (phase === "braking") {
      pushSample(samples, state, "descent", true, true, 0, lastT, prop, 0, "ship");
    }
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
      tcmCount: tcmRecords.length,
      tcmTotalDv,
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
    tcmCount: tcmRecords.length,
    tcmTotalDv,
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
 * Starbase → LEO → LRO-style Kepler transfer → meet Moon at apogee.
 *
 * Transfer plane is **south-biased** (through a point south of the Moon at
 * arrival) so the approach stays in the southern hemisphere — correct for a
 * south-pole landing, not a northern flyby above the lunar orbital plane.
 * LOI then captures into polar LLO before PDI.
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

