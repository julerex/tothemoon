/**
 * Post–translunar-injection lunar capture arc:
 * ballistic n-body coast → lunar orbit insertion → low lunar orbit coast →
 * powered descent → soft land (south pole).
 *
 * Theater-grade (not ops). Uses the same restricted n-body force model as the
 * free coast; LOI / PDI thrust is mass-coupled ship propellant.
 */

import {
  DT_BURN,
  DT_COAST,
  DT_NEAR,
  DESCENT_ALTITUDE,
  LOW_LUNAR_ORBIT_ALTITUDE_KM,
  LOW_LUNAR_ORBIT_COAST_REVS,
  LUNAR_ORBIT_INSERTION_ACCEL,
  LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM,
  R_MOON,
  TOUCHDOWN_SPEED,
} from "./constants";
import {
  finishLanding,
  lowLunarOrbitPeriodS,
  lunarOrbitInsertionComplete,
  lunarOrbitInsertionThrust,
  poweredDescentThrust,
  snapPolarLowLunarOrbit,
} from "./capture";
import type { EphemerisEpoch } from "./ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "./ephemerisEpoch";
import {
  altitudeEarth,
  altitudeMoon,
  distanceToMoon,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import { keplerRvAt } from "./kepler";
import { pushSample } from "./missionSample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  hasPropellant,
  limitAccelByThrust,
  type PropState,
} from "./propellant";
import { orbitAfterTranslunarInjection, transferTimeEst } from "./translunarInjection";
import { len, scale, sub, v3 } from "./vec3";

const _relP = v3();
const _relV = v3();
const _th = v3();

export type LunarCaptureArgs = {
  state: CraftState;
  samples: Sample[];
  lastT: { t: number };
  prop: PropState;
  moonPhase0: number;
  translunarInjectionDeltaV: number;
  epoch?: EphemerisEpoch;
};

/**
 * Ship thrust guide with wet-mass limit. Mutates a scratch vector.
 */
function shipThrustFn(
  prop: PropState,
  guide: (t: number, pos: typeof _relP, vel: typeof _relV) => typeof _th | null,
): ThrustFn {
  return (t, pos, vel) => {
    if (!hasPropellant(prop, "ship")) return null;
    const th = guide(t, pos, vel);
    if (!th) return null;
    const aCmd = len(th);
    if (!(aCmd > 1e-12)) return null;
    const lim = limitAccelByThrust(prop, aCmd, "ship");
    if (lim.forceN < 1e-3) return null;
    return scale(_th, th, lim.aKmS2 / aCmd);
  };
}

/**
 * Full capture path from post–translunar-injection state through soft land.
 */
export function runLunarCapture(args: LunarCaptureArgs): MissionResult {
  const { state, samples, lastT, prop, moonPhase0, translunarInjectionDeltaV } =
    args;
  const epoch = args.epoch ?? DEFAULT_EPHEMERIS;
  const tTli = state.t;
  const Tcoast = transferTimeEst();
  let minMoonAlt = Infinity;
  let periluneT = tTli;

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

  // --- 1. Ballistic coast until LOI gate ---
  let phase: PhaseId = "coast";
  const maxCoastT = tTli + Tcoast * 1.4 + 80_000;
  while (state.t < maxCoastT && phase === "coast") {
    const dMoon = distanceToMoon(state.t, state.pos, epoch);
    const altM = altitudeMoon(state.t, state.pos, epoch);
    const coastT = state.t - tTli;
    if (altM < minMoonAlt) {
      minMoonAlt = altM;
      periluneT = state.t;
    }
    trackKeplerDev();

    // Lunar impact before LOI — rare if targeting is good
    if (altM < 0) {
      return impactSettle(
        state,
        samples,
        lastT,
        prop,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        keplerRefMaxDevKm,
        epoch,
      );
    }

    // Handoff: inside LOI start sphere and past most of the transfer
    const nearMoon = altM < LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM;
    const lateEnough =
      coastT > Tcoast * 0.55 ||
      (state.t > periluneT - 4_000 && minMoonAlt < 80_000);
    if (nearMoon && lateEnough && altM > 0) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
      console.info(
        `[tothemoon] LOI gate · alt=${altM.toFixed(0)} km · dMoon=${dMoon.toFixed(0)} km · ` +
          `coastT=${(coastT / 3600).toFixed(1)} h`,
      );
      break;
    }

    // Miss / flyby past perilune without entering LOI sphere
    if (
      coastT > Tcoast * 1.05 &&
      state.t > periluneT + 12_000 &&
      altM > minMoonAlt + 15_000 &&
      altM > LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM
    ) {
      pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
      const msg = `Ballistic flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no LOI)`;
      console.info(`[tothemoon] ${msg}`);
      return packResult(
        samples,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        msg,
        keplerRefMaxDevKm,
      );
    }

    if (altitudeEarth(state.t, state.pos, epoch) < 0) {
      pushSample(samples, state, "coast", false, true, 0, lastT, prop, 0, "ship");
      return packResult(
        samples,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        "Earth impact (pre-LOI)",
        keplerRefMaxDevKm,
      );
    }

    const dt =
      dMoon < 40_000
        ? DT_NEAR
        : dMoon < 100_000
          ? 5
          : dMoon < 250_000
            ? 12
            : DT_COAST;
    rk4Step(state, dt, undefined, { epoch });
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

  if (phase === "coast") {
    // Timeout — try LOI if we ever got close
    if (minMoonAlt < LUNAR_ORBIT_INSERTION_ALTITUDE_START_KM) {
      phase = "approach";
      pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
    } else {
      const msg = `Distant flyby · min lunar alt ${minMoonAlt.toFixed(0)} km (no LOI)`;
      console.info(`[tothemoon] ${msg}`);
      return packResult(
        samples,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        msg,
        keplerRefMaxDevKm,
      );
    }
  }

  // --- 2. Lunar orbit insertion burn ---
  const loiThrustFn = shipThrustFn(prop, (t, pos, vel) => lunarOrbitInsertionThrust(t, pos, vel, epoch));
  let loiStartT = -1;
  const maxLoiT = state.t + 12_000;
  while (state.t < maxLoiT && phase === "approach") {
    const altM = altitudeMoon(state.t, state.pos, epoch);
    minMoonAlt = Math.min(minMoonAlt, altM);
    if (altM < 0) {
      return impactSettle(
        state,
        samples,
        lastT,
        prop,
        moonPhase0,
        translunarInjectionDeltaV,
        minMoonAlt,
        keplerRefMaxDevKm,
        epoch,
      );
    }

    let thNow = hasPropellant(prop, "ship")
      ? lunarOrbitInsertionThrust(state.t, state.pos, state.vel, epoch)
      : null;
    let aCmd = 0;
    if (thNow) {
      aCmd = len(thNow);
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) {
        thNow = null;
        aCmd = 0;
      } else {
        aCmd = lim.aKmS2;
        if (loiStartT < 0) loiStartT = state.t;
      }
    }

    rk4Step(state, DT_BURN, loiThrustFn, { epoch });

    const altM2 = altitudeMoon(state.t, state.pos, epoch);
    minMoonAlt = Math.min(minMoonAlt, altM2);
    const complete = lunarOrbitInsertionComplete(
      state.t,
      state.pos,
      state.vel,
      epoch,
    );
    const burnS = loiStartT > 0 ? state.t - loiStartT : 0;
    const dry = !hasPropellant(prop, "ship");

    pushSample(
      samples,
      state,
      "approach",
      thNow !== null,
      false,
      2,
      lastT,
      prop,
      aCmd,
      "ship",
      true,
    );

    if (complete || burnS > 3_600 || dry || altM2 < 80) {
      console.info(
        `[tothemoon] LOI end · alt=${altM2.toFixed(0)} km · burn=${burnS.toFixed(0)} s · ` +
          `complete=${complete} · dry=${dry}`,
      );
      break;
    }
  }

  // Theater capture: snap to polar circular low lunar orbit if still unbound/high
  if (!lunarOrbitInsertionComplete(state.t, state.pos, state.vel, epoch)) {
    const altM = altitudeMoon(state.t, state.pos, epoch);
    if (altM > 0 && altM < 80_000) {
      snapPolarLowLunarOrbit(state.t, state, samples, lastT, prop, epoch);
      pushSample(
        samples,
        state,
        "approach",
        true,
        true,
        0,
        lastT,
        prop,
        LUNAR_ORBIT_INSERTION_ACCEL * 0.5,
        "ship",
        false,
      );
      console.info(
        `[tothemoon] LOI snap · polar low lunar orbit @ ${LOW_LUNAR_ORBIT_ALTITUDE_KM} km`,
      );
    }
  }

  // --- 3. Low lunar orbit coast (phase braking) ---
  phase = "braking";
  pushSample(samples, state, phase, false, true, 0, lastT, prop, 0, "ship");
  {
    const rLlo = R_MOON + LOW_LUNAR_ORBIT_ALTITUDE_KM;
    const period = lowLunarOrbitPeriodS(rLlo);
    const coastS = period * LOW_LUNAR_ORBIT_COAST_REVS;
    const tEnd = state.t + coastS;
    console.info(
      `[tothemoon] Low lunar orbit coast · ${(coastS / 3600).toFixed(2)} h ` +
        `(${LOW_LUNAR_ORBIT_COAST_REVS} rev · P≈${(period / 3600).toFixed(2)} h)`,
    );
    while (state.t < tEnd) {
      rk4Step(state, Math.min(DT_NEAR * 2, tEnd - state.t), undefined, { epoch });
      const altM = altitudeMoon(state.t, state.pos, epoch);
      minMoonAlt = Math.min(minMoonAlt, altM);
      if (altM < 5) break;
      pushSample(
        samples,
        state,
        "braking",
        false,
        false,
        8,
        lastT,
        prop,
        0,
        "ship",
      );
    }
    pushSample(samples, state, "braking", false, true, 0, lastT, prop, 0, "ship");
  }

  // --- 4. Powered descent ---
  phase = "descent";
  pushSample(samples, state, phase, true, true, 0, lastT, prop, 0, "ship");
  const pdiFn = shipThrustFn(prop, (t, pos, vel) => poweredDescentThrust(t, pos, vel, epoch));
  const maxPdiT = state.t + 8_000;
  while (state.t < maxPdiT) {
    const altM = altitudeMoon(state.t, state.pos, epoch);
    minMoonAlt = Math.min(minMoonAlt, altM);
    if (altM < 0.05) break;

    let thNow = hasPropellant(prop, "ship")
      ? poweredDescentThrust(state.t, state.pos, state.vel, epoch)
      : null;
    let aCmd = 0;
    if (thNow) {
      aCmd = len(thNow);
      const lim = limitAccelByThrust(prop, aCmd, "ship");
      if (lim.forceN < 1e-3) {
        thNow = null;
        aCmd = 0;
      } else aCmd = lim.aKmS2;
    }

    // Start thrusting once below PDI gate (or always if already low)
    const dt =
      altM < 20 ? DT_BURN : altM < DESCENT_ALTITUDE ? DT_NEAR : DT_NEAR * 2;
    rk4Step(state, dt, altM < DESCENT_ALTITUDE * 1.5 ? pdiFn : undefined, { epoch });

    const b = getBodies(state.t, epoch);
    sub(_relV, state.vel, b.moonVel);
    const vRel = len(_relV);
    const alt2 = altitudeMoon(state.t, state.pos, epoch);

    pushSample(
      samples,
      state,
      "descent",
      thNow !== null,
      false,
      alt2 < 30 ? 1 : 3,
      lastT,
      prop,
      aCmd,
      "ship",
      true,
    );

    if (
      (alt2 < 2 && vRel < TOUCHDOWN_SPEED * 40) ||
      alt2 < 0.2 ||
      !hasPropellant(prop, "ship")
    ) {
      break;
    }
  }

  // --- 5. Soft land + polar taxi ---
  const landed = finishLanding(
    state,
    samples,
    moonPhase0,
    translunarInjectionDeltaV,
    minMoonAlt,
    prop,
    epoch,
  );
  return {
    ...landed,
    keplerRefMaxDevKm,
    trajectoryCorrectionCount: 0,
    trajectoryCorrectionTotalDeltaV: 0,
  };
}

function packResult(
  samples: Sample[],
  moonPhase0: number,
  translunarInjectionDeltaV: number,
  minMoonAlt: number,
  message: string,
  keplerRefMaxDevKm: number,
): MissionResult {
  return {
    samples,
    durationS: samples[samples.length - 1]!.t,
    moonPhase0,
    translunarInjectionDeltaV,
    minMoonAlt,
    ok: true,
    message,
    keplerRefMaxDevKm,
    trajectoryCorrectionCount: 0,
    trajectoryCorrectionTotalDeltaV: 0,
  };
}

function impactSettle(
  state: CraftState,
  samples: Sample[],
  lastT: { t: number },
  prop: PropState,
  moonPhase0: number,
  translunarInjectionDeltaV: number,
  minMoonAlt: number,
  keplerRefMaxDevKm: number,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): MissionResult {
  const b = getBodies(state.t, epoch);
  sub(_relP, state.pos, b.moon);
  const L = len(_relP) || 1;
  state.pos.x = b.moon.x + (_relP.x / L) * R_MOON;
  state.pos.y = b.moon.y + (_relP.y / L) * R_MOON;
  state.pos.z = b.moon.z + (_relP.z / L) * R_MOON;
  state.vel.x = b.moonVel.x;
  state.vel.y = b.moonVel.y;
  state.vel.z = b.moonVel.z;
  pushSample(samples, state, "impact", false, true, 0, lastT, prop, 0, "ship");
  const msg = `Lunar impact during capture · minAlt ≈ ${Math.max(0, minMoonAlt).toFixed(0)} km`;
  console.info(`[tothemoon] ${msg}`);
  return packResult(
    samples,
    moonPhase0,
    translunarInjectionDeltaV,
    Math.min(minMoonAlt, 0),
    msg,
    keplerRefMaxDevKm,
  );
}
