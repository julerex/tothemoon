/**
 * Pure ballistic restricted n-body coast after translunar injection (no trajectory corrections, no lunar orbit insertion / powered descent).
 *
 * Used by the full bake (`runBallisticCoast`) and the fast transfer probe
 * (`probePerilune`) so search scores match the path that will be packed.
 */

import {
  DT_COAST,
  DT_NEAR,
  R_MOON,
} from "./constants";
import { bodyPositions } from "./bodies";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
} from "./integrator";
import { keplerRvAt } from "./kepler";
import type { LowEarthOrbitRelative } from "./lowEarthOrbitCoast";
import { restoreLowEarthOrbitRelative } from "./lowEarthOrbitCoast";
import { pushSample } from "./missionSample";
import type { MissionResult, Sample } from "./missionTypes";
import type { PropState } from "./propellant";
import { orbitAfterTranslunarInjection, runFiniteTranslunarInjection, transferTimeEst } from "./translunarInjection";
import { len, normalize, set, sub, v3 } from "./vec3";

const _relP = v3();
const _relV = v3();
const _from = v3();

export type ProbeResult = {
  minAlt: number;
  periluneT: number;
  rEarth: number;
};

/**
 * Fast probe: pure restricted n-body ballistic coast after translunar injection (no burns).
 * Matches {@link runBallisticCoast} so search scores the path the bake will fly.
 */
export function probePerilune(
  translunarInjectionDeltaV: number,
  lowEarthOrbitRelativeTemplate: LowEarthOrbitRelative | null,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): ProbeResult {
  if (!lowEarthOrbitRelativeTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLowEarthOrbitRelative(lowEarthOrbitRelativeTemplate, epoch);
  runFiniteTranslunarInjection(state, translunarInjectionDeltaV, null, null, null, epoch);
  const tTli = state.t;
  const T = transferTimeEst();
  const maxT = tTli + T * 1.35 + 50_000;

  let minAlt = Infinity;
  let periluneT = tTli;
  let rEarthAtMin = Infinity;
  let dt = 45;

  while (state.t < maxT) {
    const coastT = state.t - tTli;
    rk4Step(state, dt, undefined, { epoch });

    const altM = altitudeMoon(state.t, state.pos, epoch);
    const b = getBodies(state.t, epoch);
    sub(_relP, state.pos, b.earth);
    const rE = len(_relP);
    if (altM < minAlt) {
      minAlt = altM;
      periluneT = state.t;
      rEarthAtMin = rE;
    }
    if (altitudeEarth(state.t, state.pos, epoch) < 0 && coastT < T * 0.7) {
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
    const dMoon = distanceToMoon(state.t, state.pos, epoch);
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

export type BallisticCoastArgs = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  epoch?: EphemerisEpoch;
};

/**
 * Integrate post–translunar-injection ballistic coast until lunar impact, flyby end, Earth
 * impact, or max transfer window. Appends coast / impact samples in place.
 */
export function runBallisticCoast(args: BallisticCoastArgs): MissionResult {
  const { state, samples, lastT, prop, moonPhase0, translunarInjectionDeltaV } = args;
  const epoch = args.epoch ?? DEFAULT_EPHEMERIS;
  const tTli = state.t;
  const Tcoast = transferTimeEst();
  let minMoonAlt = Infinity;
  let periluneT = tTli;
  // Osculating 2-body reference at inject — track max |Δr| for corridor meta
  const keplerRef = orbitAfterTranslunarInjection(state, epoch);
  let keplerRefMaxDevKm = 0;

  function trackKeplerDev(): void {
    if (!(keplerRef.a > 0) || keplerRef.e >= 1) return;
    keplerRvAt(keplerRef, state.t, _relP, _relV);
    const b = getBodies(state.t, epoch);
    const dx = state.pos.x - (b.earth.x + _relP.x);
    const dy = state.pos.y - (b.earth.y + _relP.y);
    const dz = state.pos.z - (b.earth.z + _relP.z);
    const d = Math.hypot(dx, dy, dz);
    if (Number.isFinite(d) && d > keplerRefMaxDevKm) keplerRefMaxDevKm = d;
  }

  pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
  trackKeplerDev();

  // Integrate through lunar encounter; stop after flyby (do not fall all the
  // way back to Earth on a multi-day return leg).
  const maxCoastT = tTli + Tcoast * 1.35 + 60_000;
  while (state.t < maxCoastT) {
    const dMoon = distanceToMoon(state.t, state.pos, epoch);
    const altM = altitudeMoon(state.t, state.pos, epoch);
    const coastT = state.t - tTli;

    if (altM < minMoonAlt) {
      minMoonAlt = altM;
      periluneT = state.t;
    }
    trackKeplerDev();

    // Lunar impact — project onto surface, freeze for a short settle
    if (altM < 0) {
      const b = getBodies(state.t, epoch);
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
        const bi = bodyPositions(t, epoch);
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
        `Lunar impact (ballistic · no post-Translunar injection burns) · minAlt before hit ≈ ${Math.max(0, minMoonAlt).toFixed(0)} km`;
      console.info(`[tothemoon] ${msg}`);
      return {
        samples,
        durationS: samples[samples.length - 1]!.t,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt: Math.min(minMoonAlt, 0),
        ok: true,
        message: msg,
        keplerRefMaxDevKm,
        trajectoryCorrectionCount: 0,
        trajectoryCorrectionTotalDeltaV: 0,
      };
    }

    // End after the transfer arc (design time of flight + margin).
    const transferDone =
      (coastT > Tcoast * 0.95 &&
        state.t > periluneT + 8_000 &&
        altM > minMoonAlt + 10_000) ||
      coastT > Tcoast * 1.15;
    if (transferDone) {
      pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
      const msg =
        minMoonAlt < 100
          ? `Ballistic skim · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`
          : minMoonAlt < 25_000
            ? `Ballistic flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`
            : `Distant flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`;
      console.info(`[tothemoon] ${msg}`);
      return {
        samples,
        durationS: samples[samples.length - 1]!.t,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        ok: true,
        message: msg,
        keplerRefMaxDevKm,
        trajectoryCorrectionCount: 0,
        trajectoryCorrectionTotalDeltaV: 0,
      };
    }

    // Earth impact only if it happens before we declare flyby
    if (altitudeEarth(state.t, state.pos, epoch) < 0) {
      pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
      console.info(`[tothemoon] Earth impact @ t=${(state.t / 3600).toFixed(1)} h`);
      return {
        samples,
        durationS: samples[samples.length - 1]!.t,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        ok: true,
        message: "Earth impact (ballistic · no post-Translunar injection burns)",
        keplerRefMaxDevKm,
        trajectoryCorrectionCount: 0,
        trajectoryCorrectionTotalDeltaV: 0,
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
    rk4Step(state, dt, undefined, { epoch }); // restricted n-body, zero thrust

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
      ? `Ballistic coast end · min lunar alt ${minMoonAlt.toFixed(0)} km (no post-Translunar injection burns)`
      : "Ballistic coast end · no lunar encounter (no post-Translunar injection burns)";
  console.info(`[tothemoon] ${msg}`);
  return {
    samples,
    durationS: samples[samples.length - 1]!.t,
    moonPhase0,
    translunarInjectionDeltaV,
    minMoonAlt,
    ok: true,
    message: msg,
    keplerRefMaxDevKm,
    trajectoryCorrectionCount: 0,
    trajectoryCorrectionTotalDeltaV: 0,
  };
}
