/**
 * Powered ascent from Starbase (Boca Chica, TX) to circular LEO.
 *
 * Theater model (A5 staged profile):
 * - Gravity turn due-east (parking i ≈ site lat)
 * - Mass-coupled thrust a = F/m with pure rocket-equation ṁ
 * - Booster throttle schedule (Max-Q dip + late MECO ramp) → ~1.2–1.5 g avg
 * - Hot-stage: booster throttle-down → ship ignition → separation
 * - Short ship upper burn, then residual circularize (path-smoothed LEO with
 *   capped rocket-equation Δv — theater, not a free zero-dt teleport)
 *
 * Not ops-grade: timing and throttle tables are approximate Starship-shaped.
 */

import {
  ASCENT_ACCEL,
  ASCENT_SHIP_ACCEL,
  CIRC_DV_CAP_KM_S,
  HOT_STAGE_S,
  LEO_ALTITUDE,
  LEO_RADIUS,
  MU_EARTH,
  R_EARTH,
  SHIP_ASCENT_THRUST_N,
  STAGE_ALT_MIN_KM,
  STAGE_PROP_ARM,
  UPPER_BURN_MAX_S,
} from "./constants";
import { enuAtPosition, starbasePadState } from "./earthFrame";
import {
  altitudeEarth,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import {
  applyImpulsiveShipDv,
  burnForce,
  createPropState,
  fuelBoosterFrac,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
  stageBooster,
  wetMassKg,
  type PropState,
} from "./propellant";
import {
  clone,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

export type AscentPhase = "launch" | "ascent" | "leo";

/** Internal burn mode for the staged profile. */
export type AscentBurnMode = "boost" | "hot_stage" | "upper";

export type AscentSample = {
  t: number;
  pos: V3;
  vel: V3;
  phase: AscentPhase;
  burning: boolean;
  /** Booster propellant remaining (0–1) */
  fuelBooster: number;
  /** Ship propellant remaining (0–1) */
  fuelShip: number;
  /** Thrust force (N); 0 when engines idle */
  thrustN: number;
  /** True after booster stage-out */
  staged: boolean;
};

export type AscentResult = {
  state: CraftState;
  samples: AscentSample[];
  ok: boolean;
  message: string;
  insertionAlt: number;
  insertionSpeed: number;
  /** Propellant state after insert (booster staged) */
  prop: PropState;
};

function pushAscentSample(
  samples: AscentSample[],
  state: CraftState,
  phase: AscentPhase,
  burning: boolean,
  prop: PropState,
  thrustN: number,
): void {
  samples.push({
    t: state.t,
    pos: clone(state.pos),
    vel: clone(state.vel),
    phase,
    burning,
    fuelBooster: fuelBoosterFrac(prop),
    fuelShip: fuelShipFrac(prop),
    thrustN,
    staged: prop.staged,
  });
}

const _up = v3();
const _east = v3();
const _north = v3();
const _relP = v3();
const _relV = v3();
const _steer = v3();
const _target = v3();
const _aBoost = v3();
const _aShip = v3();
const _aSum = v3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Booster throttle in [0, 1] — theater schedule for average ~1.2–1.5 g.
 *
 * - Liftoff: near full (need T/W > 1)
 * - Max-Q dip ~8–20 km (Starship-shaped)
 * - Recovery after Max-Q
 * - Late MECO ramp when propellant is nearly gone
 * - Hot-stage: deep throttle-down before separation
 *
 * Exported for unit tests.
 */
export function boosterThrottle(
  altKm: number,
  propFrac: number,
  mode: AscentBurnMode,
): number {
  if (mode === "upper") return 0;
  if (mode === "hot_stage") {
    // Linear ramp 0.35 → 0 over the hot-stage window is applied by caller
    // via propFrac; here a base MECO hold.
    return 0.2;
  }

  // Base schedule: slightly under peak so pure-RE burn lasts ~3 min class
  let thr = 0.88;

  // Max-Q dip (theater envelope ~T+40–80 s / ~8–20 km)
  if (altKm > 5 && altKm < 28) {
    const dip = 1 - 0.32 * Math.sin(Math.PI * smoothstep(5, 28, altKm));
    // Strongest dip near mid band
    const mid = 1 - 0.22 * Math.sin(Math.PI * smoothstep(8, 22, altKm));
    thr *= Math.min(dip, mid);
  } else if (altKm >= 28 && altKm < 50) {
    thr *= 0.92 + 0.08 * smoothstep(28, 50, altKm);
  }

  // Liftoff: full available for the first few km (clear tower with margin)
  if (altKm < 2.5) thr = Math.max(thr, 0.98);

  // MECO ramp: taper as tank empties toward STAGE_PROP_ARM
  if (propFrac < STAGE_PROP_ARM * 2.5) {
    const u = propFrac / (STAGE_PROP_ARM * 2.5);
    thr *= Math.max(0.15, u);
  }

  return Math.max(0, Math.min(1, thr));
}

/**
 * Unit thrust direction in inertial frame.
 *
 * - Boost: gravity turn (vertical → east) with earlier pitch-over so most Δv
 *   goes horizontal before MECO (theater; real tables differ).
 * - Hot-stage / upper: velocity-to-be-gained toward circular due-east LEO
 *   (kill radial, build east) — powered insert, not a lofted ballistic hop.
 *
 * Writes into `out` and returns local geometry.
 */
function steerDirection(
  t: number,
  pos: V3,
  vel: V3,
  out: V3,
  mode: AscentBurnMode,
): { alt: number; vRad: number; vEast: number; vNorth: number; vCirc: number } {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  const alt = r - R_EARTH;

  enuAtPosition(t, pos, b.earth, _up, _east, _north);
  sub(_relV, vel, b.earthVel);

  const vRad = dot(_relV, _up);
  const vEast = dot(_relV, _east);
  const vNorth = dot(_relV, _north);
  const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));

  // Upper / hot-stage: always closed-loop circular LEO target (even below 100 km)
  const closedLoop = mode !== "boost" || alt > 85;

  if (closedLoop) {
    // Circularize at *current* altitude once above ~95 km (don't climb to
    // LEO_ALTITUDE after already orbital — that burned ship prop for nothing).
    const speedFrac = Math.min(1, Math.max(0, vEast / Math.max(vCirc, 1)));
    let tgtRad = -0.5 * vRad;
    // Only loft while still deeply suborbital and below ~110 km
    if (alt < 110 && speedFrac < 0.85) {
      tgtRad += 0.1 * (1 - speedFrac);
    } else if (alt > 250) {
      tgtRad -= 0.08;
    }
    const tgtEast = vCirc;
    const eastW = 1.0 + 1.0 * (1 - speedFrac);
    set(
      _target,
      _up.x * tgtRad + _east.x * tgtEast * eastW,
      _up.y * tgtRad + _east.y * tgtEast * eastW,
      _up.z * tgtRad + _east.z * tgtEast * eastW,
    );
    set(
      out,
      _target.x - _relV.x,
      _target.y - _relV.y,
      _target.z - _relV.z,
    );
    if (vEast < vCirc * 0.9) {
      out.x += _east.x * (vCirc - vEast) * 1.2;
      out.y += _east.y * (vCirc - vEast) * 1.2;
      out.z += _east.z * (vCirc - vEast) * 1.2;
    }
  } else {
    // Gravity turn: aggressive early pitch-over so booster Δv goes east
    let pitch: number;
    if (alt < 0.6) {
      pitch = 0;
    } else if (alt < 40) {
      // ~80° by ~40 km
      pitch = smoothstep(0.6, 42, alt) * (Math.PI / 2) * 0.88;
    } else {
      pitch =
        smoothstep(40, 85, alt) * (Math.PI / 2) * 0.08 + (Math.PI / 2) * 0.88;
      pitch = Math.min(pitch, (Math.PI / 2) * 0.97);
    }
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    set(
      out,
      _up.x * cp + _east.x * sp - _north.x * vNorth * 0.2,
      _up.y * cp + _east.y * sp - _north.y * vNorth * 0.2,
      _up.z * cp + _east.z * sp - _north.z * vNorth * 0.2,
    );
  }

  const mag = len(out);
  if (mag < 1e-12) {
    set(out, _up.x, _up.y, _up.z);
  } else {
    normalize(out, out);
  }

  return { alt, vRad, vEast, vNorth, vCirc };
}

/**
 * Commanded acceleration magnitude (km/s²) before thrust/mass limits.
 */
function aCmdForAlt(
  alt: number,
  vRad: number,
  vEast: number,
  vNorth: number,
  vCirc: number,
  peak: number,
): number {
  if (alt > 120) {
    const err = Math.hypot(
      vRad * 2,
      vEast - vCirc,
      vNorth * 2,
      (alt - LEO_ALTITUDE) * 0.03,
    );
    return Math.min(peak * 1.1, Math.max(0.003, err * 1.0));
  }
  return peak;
}

type TankThrust = { a: V3; forceN: number };

/**
 * Booster thrust under the current mode + throttle schedule.
 */
function boosterThrust(
  t: number,
  pos: V3,
  vel: V3,
  prop: PropState,
  mode: AscentBurnMode,
  hotStageAgeS: number,
): TankThrust | null {
  if (mode === "upper" || prop.staged || !hasPropellant(prop, "booster")) {
    return null;
  }

  const geo = steerDirection(t, pos, vel, _steer, mode);
  if (geo.alt < -1) return null;

  let thr = boosterThrottle(geo.alt, fuelBoosterFrac(prop), mode);
  if (mode === "hot_stage") {
    // Linear MECO ramp over HOT_STAGE_S
    const u = Math.max(0, 1 - hotStageAgeS / HOT_STAGE_S);
    thr = 0.35 * u;
  }

  const peak = ASCENT_ACCEL * thr;
  // During boost always request peak·throttle (force-limited by F/m)
  const aCmd =
    mode === "boost" && geo.alt < 85
      ? peak
      : aCmdForAlt(geo.alt, geo.vRad, geo.vEast, geo.vNorth, geo.vCirc, peak);
  const { aKmS2, forceN } = limitAccelByThrust(prop, aCmd, "booster");
  if (forceN < 1e-3 || aKmS2 < 1e-9) return null;
  return { a: scale(_aBoost, _steer, aKmS2), forceN };
}

/**
 * Ship thrust during hot-stage and upper / circularization.
 */
function shipThrust(
  t: number,
  pos: V3,
  vel: V3,
  prop: PropState,
  mode: AscentBurnMode,
): TankThrust | null {
  if (mode === "boost") return null;
  if (!hasPropellant(prop, "ship")) return null;

  const geo = steerDirection(t, pos, vel, _steer, mode);
  if (geo.alt < -1) return null;

  // Full ascent thrust while far from circular; taper when close to save prop
  const vErr = Math.hypot(
    geo.vRad * 2,
    geo.vEast - geo.vCirc,
    geo.vNorth * 2,
  );
  let peak = ASCENT_SHIP_ACCEL;
  if (vErr < 1.5) peak = Math.min(peak, 0.02 + vErr * 0.025);
  if (vErr < 0.4) peak = Math.min(peak, 0.008 + vErr * 0.02);

  const aCmd = aCmdForAlt(
    geo.alt,
    geo.vRad,
    geo.vEast,
    geo.vNorth,
    geo.vCirc,
    peak,
  );
  const m = wetMassKg(prop);
  if (m < 1e-3) return null;
  const fCmd = aCmd * m * 1000;
  const forceN = Math.min(fCmd, SHIP_ASCENT_THRUST_N);
  const aKmS2 = forceN / m / 1000;
  if (forceN < 1e-3 || aKmS2 < 1e-9) return null;
  return { a: scale(_aShip, _steer, aKmS2), forceN };
}

function combineThrust(
  boost: TankThrust | null,
  ship: TankThrust | null,
): { a: V3 | null; forceN: number; boostN: number; shipN: number } {
  const boostN = boost?.forceN ?? 0;
  const shipN = ship?.forceN ?? 0;
  const forceN = boostN + shipN;
  if (!boost && !ship) return { a: null, forceN: 0, boostN: 0, shipN: 0 };
  set(_aSum, 0, 0, 0);
  if (boost) {
    _aSum.x += boost.a.x;
    _aSum.y += boost.a.y;
    _aSum.z += boost.a.z;
  }
  if (ship) {
    _aSum.x += ship.a.x;
    _aSum.y += ship.a.y;
    _aSum.z += ship.a.z;
  }
  return { a: _aSum, forceN, boostN, shipN };
}

/**
 * Stable circular-ish parking above the sensible atmosphere.
 * Target LEO_ALTITUDE is preferred but any ~100–250 km circular orbit is
 * accepted so the upper stage does not waste ship prop climbing after
 * already reaching orbital speed (saves fuel for dogleg + TLI).
 */
function insertionOk(t: number, pos: V3, vel: V3): boolean {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  const alt = r - R_EARTH;
  if (alt < 90 || alt > LEO_ALTITUDE + 50) return false;
  sub(_relV, vel, b.earthVel);
  normalize(_up, _relP);
  const vRad = Math.abs(dot(_relV, _up));
  const v = len(_relV);
  const vCirc = Math.sqrt(MU_EARTH / r);
  return vRad < 0.12 && Math.abs(v - vCirc) < 0.25;
}

/** Near-circular enough to accept as theater LEO (slightly looser). */
function insertionNear(t: number, pos: V3, vel: V3): boolean {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  const alt = r - R_EARTH;
  if (alt < 85 || alt > LEO_ALTITUDE + 60) return false;
  sub(_relV, vel, b.earthVel);
  normalize(_up, _relP);
  const vRad = Math.abs(dot(_relV, _up));
  const v = len(_relV);
  const vCirc = Math.sqrt(MU_EARTH / r);
  return vRad < 0.2 && Math.abs(v - vCirc) < 0.4;
}

/** Good enough to cut engines early and save ship prop for dogleg + TLI. */
function insertionGood(t: number, pos: V3, vel: V3): boolean {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP);
  const alt = r - R_EARTH;
  if (alt < 90 || alt > LEO_ALTITUDE + 55) return false;
  sub(_relV, vel, b.earthVel);
  normalize(_up, _relP);
  const vRad = Math.abs(dot(_relV, _up));
  const v = len(_relV);
  const vCirc = Math.sqrt(MU_EARTH / r);
  return vRad < 0.15 && Math.abs(v - vCirc) < 0.3;
}

function shouldArmHotStage(
  alt: number,
  prop: PropState,
  mode: AscentBurnMode,
): boolean {
  if (mode !== "boost" || prop.staged) return false;
  if (alt < STAGE_ALT_MIN_KM) return false;
  if (!hasPropellant(prop, "booster")) return true;
  return fuelBoosterFrac(prop) <= STAGE_PROP_ARM;
}

function successResult(
  state: CraftState,
  samples: AscentSample[],
  prop: PropState,
  message: string,
): AscentResult {
  const b = getBodies(state.t);
  sub(_relV, state.vel, b.earthVel);
  return {
    state,
    samples,
    ok: true,
    message,
    insertionAlt: altitudeEarth(state.t, state.pos),
    insertionSpeed: len(_relV),
    prop,
  };
}

/**
 * Theater residual circularization after the integrated upper-stage burn.
 *
 * - Books up to CIRC_DV_CAP_KM_S of ship Δv via pure rocket equation
 * - Smooths altitude toward LEO_RADIUS and velocity toward circular east
 *   over a few seconds (continuous trail; not a zero-dt teleport)
 *
 * Honest about propellant up to the cap; remaining energy gap is theater
 * guidance (full pure-RE insert from deep suborbital would empty tanks and
 * starve dogleg/TLI).
 */
function settleCircularize(
  state: CraftState,
  samples: AscentSample[],
  prop: PropState,
  lastSampleT: { t: number },
): void {
  if (!prop.staged) stageBooster(prop, state.t);

  const b0 = getBodies(state.t);
  sub(_relP, state.pos, b0.earth);
  sub(_relV, state.vel, b0.earthVel);
  enuAtPosition(state.t, state.pos, b0.earth, _up, _east, _north);
  const vE0 = dot(_relV, _east);
  const vN0 = dot(_relV, _north);
  const vR0 = dot(_relV, _up);
  const vCircTgt = Math.sqrt(MU_EARTH / LEO_RADIUS);
  const dvNeeded = Math.hypot(vCircTgt - vE0, vN0, vR0);
  const dvBook = Math.min(CIRC_DV_CAP_KM_S, dvNeeded);
  const settleS = 10;
  const thrustN =
    dvBook > 1e-6
      ? applyImpulsiveShipDv(prop, state.t, dvBook, settleS)
      : 0;

  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    // Smoothstep for continuous trail
    const s = u * u * (3 - 2 * u);
    state.t += settleS / steps;
    const b = getBodies(state.t);
    sub(_relP, state.pos, b.earth);
    // Use current radial direction from Earth (follow rotating frame gently)
    normalize(_up, _relP);
    enuAtPosition(state.t, state.pos, b.earth, _up, _east, _north);
    const rNow = len(_relP);
    const r = rNow + s * (LEO_RADIUS - rNow);
    state.pos.x = b.earth.x + _up.x * r;
    state.pos.y = b.earth.y + _up.y * r;
    state.pos.z = b.earth.z + _up.z * r;

    const vEu = vE0 + s * (vCircTgt - vE0);
    const vNu = vN0 * (1 - s);
    const vRu = vR0 * (1 - s);
    state.vel.x = b.earthVel.x + _east.x * vEu + _north.x * vNu + _up.x * vRu;
    state.vel.y = b.earthVel.y + _east.y * vEu + _north.y * vNu + _up.y * vRu;
    state.vel.z = b.earthVel.z + _east.z * vEu + _north.z * vNu + _up.z * vRu;

    const burning = i < steps && thrustN > 0;
    pushAscentSample(
      samples,
      state,
      i < steps ? "ascent" : "leo",
      burning,
      prop,
      burning ? thrustN : 0,
    );
    lastSampleT.t = state.t;
  }
}

/**
 * Integrate Starbase pad → circular LEO with staged hot-stage profile.
 */
export function flyAscent(): AscentResult {
  const samples: AscentSample[] = [];
  const prop = createPropState(0);
  const pad = starbasePadState(0);
  const state: CraftState = {
    t: 0,
    pos: clone(pad.pos),
    vel: clone(pad.vel),
  };
  // Small vertical hop so we leave the surface cleanly
  state.vel.x += pad.up.x * 0.01;
  state.vel.y += pad.up.y * 0.01;
  state.vel.z += pad.up.z * 0.01;

  let mode: AscentBurnMode = "boost";
  let hotStageT0 = -1;

  const th0 = combineThrust(
    boosterThrust(0, state.pos, state.vel, prop, mode, 0),
    null,
  );
  pushAscentSample(samples, state, "launch", th0.forceN > 0, prop, th0.forceN);

  const lastSampleT = { t: 0 };
  let phase: AscentPhase;
  const maxT = 20 * 60;
  let upperBurnT0 = -1;

  while (state.t < maxT) {
    const alt = altitudeEarth(state.t, state.pos);
    if (alt < 1.5) phase = "launch";
    else phase = "ascent";

    if (insertionOk(state.t, state.pos, state.vel)) {
      if (!prop.staged) stageBooster(prop, state.t);
      pushAscentSample(samples, state, "leo", false, prop, 0);
      return successResult(state, samples, prop, "LEO");
    }

    if (alt < -2) {
      return {
        state,
        samples,
        ok: false,
        message: "Ascent impact",
        insertionAlt: alt,
        insertionSpeed: 0,
        prop,
      };
    }

    // Mode transitions
    if (mode === "boost" && shouldArmHotStage(alt, prop, mode)) {
      mode = "hot_stage";
      hotStageT0 = state.t;
    }
    if (mode === "hot_stage" && state.t - hotStageT0 >= HOT_STAGE_S) {
      stageBooster(prop, state.t);
      mode = "upper";
      upperBurnT0 = state.t;
    }
    if (
      mode === "boost" &&
      !hasPropellant(prop, "booster") &&
      alt >= STAGE_ALT_MIN_KM * 0.7
    ) {
      stageBooster(prop, state.t);
      mode = "upper";
      upperBurnT0 = state.t;
    }
    if (
      mode === "boost" &&
      !hasPropellant(prop, "booster") &&
      alt < STAGE_ALT_MIN_KM * 0.7
    ) {
      return {
        state,
        samples,
        ok: false,
        message: "Booster propellant depleted",
        insertionAlt: alt,
        insertionSpeed: 0,
        prop,
      };
    }

    // Bounded upper burn, then propellant-honest residual settle
    if (mode === "upper") {
      const upperAge = state.t - upperBurnT0;
      const doneBurn =
        upperAge >= UPPER_BURN_MAX_S ||
        !hasPropellant(prop, "ship") ||
        insertionGood(state.t, state.pos, state.vel) ||
        insertionNear(state.t, state.pos, state.vel);
      if (doneBurn) {
        if (insertionOk(state.t, state.pos, state.vel)) {
          pushAscentSample(samples, state, "leo", false, prop, 0);
          return successResult(state, samples, prop, "LEO");
        }
        settleCircularize(state, samples, prop, lastSampleT);
        return successResult(
          state,
          samples,
          prop,
          "LEO (hot-stage + circularize)",
        );
      }
    }

    const hotAge = mode === "hot_stage" ? state.t - hotStageT0 : 0;
    const thrustFn: ThrustFn = (t, p, v) => {
      const bTh = boosterThrust(t, p, v, prop, mode, hotAge);
      const sTh = shipThrust(t, p, v, prop, mode);
      return combineThrust(bTh, sTh).a;
    };

    const dt =
      alt < 15 ? 0.15 : alt < 40 ? 0.25 : alt < 100 ? 0.4 : mode === "upper" ? 0.4 : 0.6;
    const tBefore = state.t;
    rk4Step(state, dt, thrustFn);

    const bNow = boosterThrust(
      state.t,
      state.pos,
      state.vel,
      prop,
      mode,
      mode === "hot_stage" ? state.t - hotStageT0 : 0,
    );
    const sNow = shipThrust(state.t, state.pos, state.vel, prop, mode);
    const lastBoostN = bNow?.forceN ?? 0;
    const lastShipN = sNow?.forceN ?? 0;
    const stepForceN = lastBoostN + lastShipN;

    if (lastBoostN > 0 || lastShipN > 0) {
      if (lastBoostN > 0) {
        prop.lastT = tBefore;
        burnForce(prop, state.t, lastBoostN, "booster");
      }
      if (lastShipN > 0) {
        prop.lastT = tBefore;
        burnForce(prop, state.t, lastShipN, "ship");
      }
    } else {
      prop.lastT = state.t;
    }

    if (mode === "hot_stage" && state.t - hotStageT0 >= HOT_STAGE_S) {
      stageBooster(prop, state.t);
      mode = "upper";
      upperBurnT0 = state.t;
    }

    const minDt = phase === "launch" ? 0.15 : 0.35;
    if (state.t - lastSampleT.t >= minDt - 1e-9) {
      lastSampleT.t = state.t;
      pushAscentSample(
        samples,
        state,
        phase,
        stepForceN > 0,
        prop,
        stepForceN,
      );
    }
  }

  // Timeout: settle if high enough after staging
  const alt = altitudeEarth(state.t, state.pos);
  if (!prop.staged && alt > STAGE_ALT_MIN_KM * 0.8) {
    stageBooster(prop, state.t);
  }
  if (prop.staged && alt > 50) {
    settleCircularize(state, samples, prop, lastSampleT);
    return successResult(state, samples, prop, "LEO (hot-stage + circularize)");
  }

  return {
    state,
    samples,
    ok: false,
    message: "Ascent timeout",
    insertionAlt: alt,
    insertionSpeed: 0,
    prop,
  };
}
