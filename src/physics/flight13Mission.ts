/**
 * Starship Flight 13 theater mission (suborbital flight test).
 *
 * Timeline anchors match docs/STARSHIP_13.md (SpaceX public profile, approx).
 * Dynamics: restricted RK4 under Earth gravity + J₂ + atmosphere/drag with
 * mass-coupled thrust. Steering aims along the Starbase → Indian Ocean
 * great-circle corridor (same plane as the Earth GC view).
 *
 * Theater-grade: event times follow the public table; splash coordinates are
 * theater (west of Australia), not a surveyed fix.
 */

import {
  BOOSTER_THRUST_N,
  HOT_STAGE_S,
  R_EARTH,
  SHIP_THRUST_N,
} from "./constants";

/** Indian Ocean splash (theater — west of Australia; not a surveyed fix). */
export const FLIGHT13_SPLASH_LAT = (-31.5 * Math.PI) / 180;
export const FLIGHT13_SPLASH_LON = (95.0 * Math.PI) / 180;
import {
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
  enuAtPosition,
} from "./earthFrame";
import {
  altitudeEarth,
  getBodies,
  rk4Step,
  type CraftState,
  type ThrustFn,
} from "./integrator";
import { downsampleTrajectory } from "./missionDownsample";
import type { MissionResult, PhaseId, Sample } from "./missionTypes";
import {
  burnForce,
  coastProp,
  createPropState,
  fuelBoosterFrac,
  fuelShipFrac,
  hasPropellant,
  limitAccelByThrust,
  stageBooster,
  wetMassKg,
  type PropState,
  type Tank,
} from "./propellant";
import { deriveTrajectoryMeta } from "./trajectoryMeta";
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

/** Official approximate T+ anchors (s) from Flight 13 profile. */
export const F13 = {
  LIFTOFF: 0,
  MAX_Q: 58,
  MECO: 138,
  HOT_STAGE: 141,
  SECO: 485,
  PAYLOAD_START: 1000,
  PAYLOAD_END: 1659,
  RELIGHT: 2338,
  RELIGHT_END: 2350,
  ENTRY: 2850,
  LAND_BURN: 3901,
  LAND_2TO1: 3919,
  SPLASH: 3921,
} as const;

const _up = v3();
const _east = v3();
const _north = v3();
const _relP = v3();
const _relV = v3();
const _steer = v3();
const _tmp = v3();
const _tmp2 = v3();
const _tmp3 = v3();
const _splashLocal = v3();

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Unit surface radial at splash site (inertial) at mission time t. */
export function splashSurfaceInertial(t: number, out: V3 = v3()): V3 {
  geodeticToMeshLocal(
    FLIGHT13_SPLASH_LAT,
    FLIGHT13_SPLASH_LON,
    1,
    _splashLocal,
  );
  meshLocalToInertial(_splashLocal, t, out);
  return normalize(out, out);
}

function padRadialInertial(t: number, out: V3 = v3()): V3 {
  const pad = starbasePadState(t);
  return set(out, pad.up.x, pad.up.y, pad.up.z);
}

/** Horizontal unit at pad toward splash (Flight 13 corridor). */
function corridorAlongAtPad(t: number, out: V3 = v3()): V3 {
  const padUp = padRadialInertial(t, _tmp);
  const splash = splashSurfaceInertial(t, _tmp2);
  const d = dot(splash, padUp);
  set(
    _tmp3,
    splash.x - padUp.x * d,
    splash.y - padUp.y * d,
    splash.z - padUp.z * d,
  );
  if (len(_tmp3) < 1e-8) {
    const b = getBodies(t);
    const pad = starbasePadState(t);
    enuAtPosition(t, pad.pos, b.earth, _up, _east, _north);
    return set(out, _east.x, _east.y, _east.z);
  }
  return normalize(out, _tmp3);
}

function pushSample(
  samples: Sample[],
  state: CraftState,
  phase: PhaseId,
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

type BurnMode = "boost" | "hot_stage" | "upper" | "relight" | "land" | "idle";

function steer(
  t: number,
  pos: V3,
  vel: V3,
  mode: BurnMode,
  out: V3,
): void {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP) || 1;
  set(_up, _relP.x / r, _relP.y / r, _relP.z / r);
  sub(_relV, vel, b.earthVel);
  const alt = r - R_EARTH;
  const along = corridorAlongAtPad(t, _east);

  if (mode === "idle") {
    set(out, 0, 0, 0);
    return;
  }

  if (mode === "land") {
    const v = len(_relV);
    if (v < 1e-6) {
      set(out, _up.x, _up.y, _up.z);
      return;
    }
    set(out, -_relV.x, -_relV.y, -_relV.z);
    normalize(out, out);
    if (alt < 8) {
      const u = smoothstep(0, 8, alt);
      out.x = out.x * u + _up.x * (1 - u);
      out.y = out.y * u + _up.y * (1 - u);
      out.z = out.z * u + _up.z * (1 - u);
      normalize(out, out);
    }
    return;
  }

  if (mode === "relight") {
    set(out, -along.x * 0.85 - _up.x * 0.15, -along.y * 0.85 - _up.y * 0.15, -along.z * 0.85 - _up.z * 0.15);
    normalize(out, out);
    return;
  }

  // Gravity turn along corridor
  let pitch: number;
  if (alt < 0.8) pitch = 0;
  else if (alt < 55) pitch = smoothstep(0.8, 55, alt) * (Math.PI / 2) * 0.9;
  else pitch = (Math.PI / 2) * 0.88;

  if (mode === "upper" || mode === "hot_stage") {
    // Lofted suborbital: pitch down from pure radial toward corridor
    pitch = Math.min(pitch, (Math.PI / 2) * 0.78);
  }

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  set(
    out,
    _up.x * cosP + along.x * sinP,
    _up.y * cosP + along.y * sinP,
    _up.z * cosP + along.z * sinP,
  );
  normalize(out, out);
}

function throttleFor(t: number, alt: number, mode: BurnMode): number {
  if (mode === "idle") return 0;
  if (mode === "hot_stage") return 0.55;
  if (mode === "relight") return 0.4;
  if (mode === "land") {
    if (t < F13.LAND_BURN) return 0;
    if (t < F13.LAND_BURN + 2) return 0.95;
    if (t < F13.LAND_2TO1) return 0.55;
    return 0.35;
  }
  if (mode === "boost") {
    let thr = 0.9;
    if (alt > 5 && alt < 30) thr *= 0.78; // max-Q dip
    if (alt < 2) thr = 0.98;
    // MECO ramp into hot-stage
    if (t > F13.MECO - 8) thr *= Math.max(0.15, (F13.HOT_STAGE - t) / 12);
    return Math.max(0, Math.min(1, thr));
  }
  // upper — ship burn after hot-stage until SECO (suborbital energy cut)
  if (t >= F13.SECO - 8) return Math.max(0, (F13.SECO - t) / 8) * 0.7;
  return 0.78;
}

function peakForceN(mode: BurnMode, thr: number): number {
  if (mode === "boost") return BOOSTER_THRUST_N * thr;
  if (mode === "hot_stage") return BOOSTER_THRUST_N * 0.18 * thr + SHIP_THRUST_N * 0.9;
  if (mode === "upper") return SHIP_THRUST_N * thr;
  if (mode === "relight") return SHIP_THRUST_N * 0.33 * thr;
  if (mode === "land") return SHIP_THRUST_N * thr;
  return 0;
}

function tankFor(mode: BurnMode, staged: boolean): Tank {
  if (!staged && (mode === "boost" || mode === "hot_stage")) return "booster";
  return "ship";
}

/**
 * Integrate Flight 13 from liftoff through Indian Ocean splashdown.
 */
export function runFlight13Mission(): MissionResult {
  const samples: Sample[] = [];
  const prop = createPropState(0);
  const pad = starbasePadState(0);
  const state: CraftState = {
    t: 0,
    pos: clone(pad.pos),
    vel: clone(pad.vel),
  };
  // Clear tower
  state.vel.x += pad.up.x * 0.015;
  state.vel.y += pad.up.y * 0.015;
  state.vel.z += pad.up.z * 0.015;

  let mode: BurnMode = "boost";
  let hotStageT0 = -1;
  let lastThrustN = 0;
  let lastBoostN = 0;
  let lastShipN = 0;

  const thrAcc = v3();
  /** Acceleration only — propellant is drained once after each RK4 step. */
  const thrustFn: ThrustFn = (t, pos, vel) => {
    const alt = altitudeEarth(t, pos);
    const thr = throttleFor(t, alt, mode);
    if (mode === "idle" || thr < 1e-4) {
      lastThrustN = 0;
      lastBoostN = 0;
      lastShipN = 0;
      return null;
    }
    steer(t, pos, vel, mode, _steer);
    const tank = tankFor(mode, prop.staged);
    const fCmd = peakForceN(mode, thr);
    const m = wetMassKg(prop);
    const aCmd = fCmd / Math.max(m, 1) / 1000;
    const lim = limitAccelByThrust(prop, aCmd, tank);
    let aTot = lim.aKmS2;
    lastBoostN = tank === "booster" ? lim.forceN : 0;
    lastShipN = tank === "ship" ? lim.forceN : 0;
    if (mode === "hot_stage" && hasPropellant(prop, "ship")) {
      const shipA =
        (SHIP_THRUST_N * 0.85) / Math.max(wetMassKg(prop), 1) / 1000;
      const shipLim = limitAccelByThrust(prop, shipA, "ship");
      aTot += shipLim.aKmS2;
      lastShipN += shipLim.forceN;
      lastBoostN = lim.forceN;
    }
    lastThrustN = lastBoostN + lastShipN;
    if (aTot < 1e-9) return null;
    scale(thrAcc, _steer, aTot);
    return thrAcc;
  };

  pushSample(samples, state, "launch", true, prop, peakForceN("boost", 0.98));

  const maxT = F13.SPLASH + 2;
  while (state.t < maxT) {
    const alt = altitudeEarth(state.t, state.pos);
    const t = state.t;

    // ── Mode / phase machine (timeline-forced where possible) ──
    if (mode === "boost" && t >= F13.MECO) {
      mode = "hot_stage";
      hotStageT0 = t;
    }
    if (mode === "hot_stage" && (t - hotStageT0 >= HOT_STAGE_S || t >= F13.HOT_STAGE + HOT_STAGE_S)) {
      stageBooster(prop, t);
      mode = "upper";
    }
    // Force stage at public hot-stage mark if still stacked
    if (!prop.staged && t >= F13.HOT_STAGE + 1) {
      stageBooster(prop, t);
      mode = "upper";
    }
    if (mode === "upper") {
      // Energy cut: suborbital SECO (~6.5–7.2 km/s inertial surface-relative)
      const bCut = getBodies(t);
      sub(_relV, state.vel, bCut.earthVel);
      const vRel = len(_relV);
      if (t >= F13.SECO || (alt > 80 && vRel > 6.9)) {
        mode = "idle";
      }
    }
    if (mode === "idle" && t >= F13.RELIGHT && t < F13.RELIGHT_END) {
      mode = "relight";
    }
    if (mode === "relight" && t >= F13.RELIGHT_END) {
      mode = "idle";
    }
    if (t >= F13.LAND_BURN && t < F13.SPLASH) {
      mode = "land";
    }
    if (t >= F13.SPLASH) {
      mode = "idle";
    }

    // Phase id for HUD — monotonic in mission time (matches public timeline)
    let phase: PhaseId;
    if (t < 12) phase = "launch";
    else if (t < F13.SECO) phase = "ascent";
    else if (t < F13.ENTRY) phase = "coast";
    else if (t < F13.LAND_BURN) phase = "entry";
    else if (t < F13.SPLASH) phase = "descent";
    else phase = "splashdown";

    // Step size
    let dt = 1.0;
    if (mode === "boost" || mode === "hot_stage" || mode === "upper") dt = 0.25;
    else if (mode === "land" || mode === "relight") dt = 0.2;
    else if (phase === "entry" || alt < 120) dt = 0.5;
    else if (phase === "coast") dt = 2.5;
    dt = Math.min(dt, maxT - state.t);
    if (dt < 1e-4) break;

    rk4Step(state, dt, thrustFn);

    // Keep craft above the surface; hover theater until scheduled landing burn
    {
      const b = getBodies(state.t);
      sub(_relP, state.pos, b.earth);
      const L = len(_relP) || 1;
      const curAlt = L - R_EARTH;
      if (curAlt < 2 && state.t < F13.LAND_BURN) {
        const holdR = R_EARTH + Math.max(2, curAlt);
        state.pos.x = b.earth.x + (_relP.x / L) * holdR;
        state.pos.y = b.earth.y + (_relP.y / L) * holdR;
        state.pos.z = b.earth.z + (_relP.z / L) * holdR;
        // Damp surface-relative velocity (skip along Earth rotation)
        sub(_relV, state.vel, b.earthVel);
        state.vel.x = b.earthVel.x + _relV.x * 0.85;
        state.vel.y = b.earthVel.y + _relV.y * 0.85;
        state.vel.z = b.earthVel.z + _relV.z * 0.85;
      }
    }

    // Book propellant once per step (matches ascent accounting)
    if (lastBoostN > 1e-3 && !prop.staged) {
      burnForce(prop, state.t, lastBoostN, "booster");
    } else if (lastBoostN > 1e-3) {
      burnForce(prop, state.t, lastBoostN, "ship");
    }
    if (lastShipN > 1e-3) {
      burnForce(prop, state.t, lastShipN, "ship");
    }
    if (lastThrustN < 1e-3) {
      coastProp(prop, state.t);
    }

    // Soft touchdown settle near splash
    if (t >= F13.SPLASH - 0.5) {
      const b = getBodies(state.t);
      const surf = splashSurfaceInertial(state.t, _tmp);
      const targetR = R_EARTH + 0.02;
      state.pos.x = b.earth.x + surf.x * targetR;
      state.pos.y = b.earth.y + surf.y * targetR;
      state.pos.z = b.earth.z + surf.z * targetR;
      // Kill relative velocity
      state.vel.x = b.earthVel.x;
      state.vel.y = b.earthVel.y;
      state.vel.z = b.earthVel.z;
      pushSample(samples, state, "splashdown", false, prop, 0);
      break;
    }

    const burning = lastThrustN > 1e3;
    // Sample cadence
    const last = samples[samples.length - 1]!;
    const minDt =
      phase === "launch" || mode === "boost" || mode === "hot_stage"
        ? 0.2
        : phase === "coast"
          ? 5
          : 0.5;
    if (state.t - last.t >= minDt || phase !== last.phase || burning !== last.burning) {
      pushSample(samples, state, phase, burning, prop, lastThrustN);
    }
  }

  // Ensure terminal splash sample
  const last = samples[samples.length - 1]!;
  if (last.phase !== "splashdown") {
    pushSample(samples, state, "splashdown", false, prop, 0);
  }

  const durationS = samples[samples.length - 1]!.t;
  const meta = deriveTrajectoryMeta(samples);
  const raw: MissionResult = {
    samples,
    durationS,
    moonPhase0: 0,
    translunarInjectionDeltaV: 0,
    minMoonAlt: Infinity,
    ok: true,
    message:
      "Flight 13 · suborbital · Indian Ocean splashdown (theater timeline)",
    peakSpeedKmS: meta.peakSpeedKmS,
    stageT: meta.stageT,
    horizonsLandingT: durationS,
  };

  const out = downsampleTrajectory(raw);
  out.horizonsLandingT = durationS;
  out.peakSpeedKmS = meta.peakSpeedKmS;
  out.stageT = meta.stageT ?? F13.HOT_STAGE;
  out.minMoonAlt = Infinity;
  console.info(
    `[flight13] ${out.message} · duration=${(out.durationS / 60).toFixed(1)} min · samples=${out.samples.length} · stageT=${out.stageT?.toFixed(0)}s`,
  );
  return out;
}
