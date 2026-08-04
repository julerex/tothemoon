/**
 * Pure ballistic restricted n-body coast after TLI (no TCMs, no LOI/PDI).
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
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
} from "./integrator";
import type { LeoRel } from "./leoCoast";
import { restoreLeoRel } from "./leoCoast";
import { pushSample } from "./missionSample";
import type { MissionResult, Sample } from "./missionTypes";
import type { PropState } from "./propellant";
import { runFiniteTli, transferTimeEst } from "./tli";
import { len, normalize, set, sub, v3 } from "./vec3";

const _relP = v3();
const _from = v3();

export type ProbeResult = {
  minAlt: number;
  periluneT: number;
  rEarth: number;
};

/**
 * Fast probe: pure restricted n-body ballistic coast after TLI (no burns).
 * Matches {@link runBallisticCoast} so search scores the path the bake will fly.
 */
export function probePerilune(
  tliDv: number,
  leoRelTemplate: LeoRel | null,
): ProbeResult {
  if (!leoRelTemplate) {
    return { minAlt: Infinity, periluneT: 0, rEarth: Infinity };
  }
  const state = restoreLeoRel(leoRelTemplate);
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

export type BallisticCoastArgs = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  tliDv: number;
};

/**
 * Integrate post-TLI ballistic coast until lunar impact, flyby end, Earth
 * impact, or max transfer window. Appends coast / impact samples in place.
 */
export function runBallisticCoast(args: BallisticCoastArgs): MissionResult {
  const { state, samples, lastT, prop, moonPhase0, tliDv } = args;
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
