/**
 * Starship Flight 13 theater mission (suborbital flight test).
 *
 * Timeline anchors match docs/STARSHIP_13.md (SpaceX public profile, approx).
 * Dynamics: restricted RK4 under Earth gravity + J₂ + atmosphere/drag with
 * mass-coupled thrust. Steering aims along the Starbase → Indian Ocean
 * great-circle corridor (same plane as the Earth GC view).
 *
 * Profile (theater-grade, not ops):
 * - Gravity-turn ascent + hot-stage along the corridor
 * - Upper burn builds near-circular horizontal speed so the free coast stays
 *   above the dense atmosphere until the public entry window (~T+47 min)
 * - In-space relight is a short retrograde deorbit demo
 * - Entry is ballistic (drag + J₂); landing burn brakes into splash
 * - Soft settle only in the final seconds at the theater splash fix
 *
 * Splash coordinates are theater (west of Australia), not a surveyed buoy.
 */

import {
  BOOSTER_THRUST_N,
  HOT_STAGE_S,
  MU_EARTH,
  R_EARTH,
  SHIP_THRUST_N,
} from "./constants";
import {
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
  enuAtPosition,
} from "./earthFrame";
import {
  altitudeEarth,
  atmDensity,
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

/** Indian Ocean splash (theater — west of Australia; not a surveyed fix). */
export const FLIGHT13_SPLASH_LAT = (-31.5 * Math.PI) / 180;
export const FLIGHT13_SPLASH_LON = (95.0 * Math.PI) / 180;

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
  TRANSONIC: 3743,
  SUBSONIC: 3781,
  LAND_BURN: 3901,
  LAND_FLIP: 3903,
  LAND_3TO2: 3912,
  LAND_2TO1: 3919,
  SPLASH: 3921,
} as const;

/** Keep this fraction of ship prop for relight + landing burn. */
const SHIP_PROP_RESERVE = 0.08;

/**
 * Target horizontal speed fraction of local circular at SECO.
 * Slightly subcircular so the free coast eventually reenters near the
 * public entry window without multi-rev orbit.
 */
const SECO_VCIRC_FRAC = 0.982;

/**
 * Belly-flop Cd·A/m (km²/kg) — ~20× the ascent stack factor so entry
 * actually bleeds hypersonic speed in the public T+47–65 min window.
 * Theater only; not a CFD table.
 */
const BELLY_CD_A_OVER_M = 2.5e-10;

/** Lift-to-drag theater fraction of the belly drag magnitude (outward). */
const BELLY_L_OVER_D = 0.35;

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
const _along = v3();
const _horiz = v3();

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

/**
 * Horizontal unit in the local sky plane from craft toward the splash great-circle.
 * Falls back to pad corridor if nearly radial.
 */
function corridorAlongAtCraft(t: number, pos: V3, out: V3 = v3()): V3 {
  const b = getBodies(t);
  sub(_relP, pos, b.earth);
  const r = len(_relP) || 1;
  set(_up, _relP.x / r, _relP.y / r, _relP.z / r);
  const splash = splashSurfaceInertial(t, _tmp2);
  const d = dot(splash, _up);
  set(
    _tmp3,
    splash.x - _up.x * d,
    splash.y - _up.y * d,
    splash.z - _up.z * d,
  );
  if (len(_tmp3) < 1e-8) {
    return corridorAlongAtPad(t, out);
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

type BurnMode =
  | "boost"
  | "hot_stage"
  | "upper"
  | "relight"
  | "land"
  | "idle";

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
  const along = corridorAlongAtCraft(t, pos, _along);

  // Horizontal component of surface-relative velocity
  const vRad = dot(_relV, _up);
  set(
    _horiz,
    _relV.x - _up.x * vRad,
    _relV.y - _up.y * vRad,
    _relV.z - _up.z * vRad,
  );
  const vHoriz = len(_horiz);
  const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));

  if (mode === "idle") {
    set(out, 0, 0, 0);
    return;
  }

  if (mode === "land") {
    // Engines fire anti-velocity (brake) with strong aim at splash site
    const v = len(_relV);
    const splash = splashSurfaceInertial(t, _tmp2);
    // Unit toward splash surface point from craft
    const bL = getBodies(t);
    set(
      _tmp3,
      bL.earth.x + splash.x * (R_EARTH + 0.05) - pos.x,
      bL.earth.y + splash.y * (R_EARTH + 0.05) - pos.y,
      bL.earth.z + splash.z * (R_EARTH + 0.05) - pos.z,
    );
    const distSplash = len(_tmp3);
    if (distSplash > 1e-6) normalize(_tmp3, _tmp3);

    if (v > 0.08) {
      // Brake anti-velocity
      set(out, -_relV.x / v, -_relV.y / v, -_relV.z / v);
      // Steer toward splash (lateral) while braking
      if (distSplash > 2) {
        const w = Math.min(0.55, distSplash / 80);
        out.x = out.x * (1 - w) + _tmp3.x * w;
        out.y = out.y * (1 - w) + _tmp3.y * w;
        out.z = out.z * (1 - w) + _tmp3.z * w;
        normalize(out, out);
      }
    } else if (alt > 0.4) {
      // Soft descent toward splash / local up
      set(out, _up.x * 0.35 + _tmp3.x * 0.65, _up.y * 0.35 + _tmp3.y * 0.65, _up.z * 0.35 + _tmp3.z * 0.65);
      normalize(out, out);
    } else {
      // Final hover: engines down (thrust along +up)
      set(out, _up.x, _up.y, _up.z);
    }
    return;
  }

  if (mode === "relight") {
    // Retrograde deorbit demo — kill horizontal speed slightly
    if (vHoriz > 0.05) {
      set(out, -_horiz.x / vHoriz, -_horiz.y / vHoriz, -_horiz.z / vHoriz);
    } else {
      set(out, -along.x, -along.y, -along.z);
    }
    // Slight downward component to drop periapsis
    out.x -= _up.x * 0.12;
    out.y -= _up.y * 0.12;
    out.z -= _up.z * 0.12;
    normalize(out, out);
    return;
  }

  // ── Boost: gravity turn along corridor (earlier pitch-over for range) ──
  if (mode === "boost") {
    let pitch: number;
    if (alt < 0.6) pitch = 0;
    else if (alt < 45) pitch = smoothstep(0.6, 45, alt) * (Math.PI / 2) * 0.93;
    else pitch = (Math.PI / 2) * 0.94;
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    set(
      out,
      _up.x * cosP + along.x * sinP,
      _up.y * cosP + along.y * sinP,
      _up.z * cosP + along.z * sinP,
    );
    normalize(out, out);
    return;
  }

  // ── Hot-stage / upper: lofted then flatten for long suborbital coast ──
  // Pitch 0 = vertical, π/2 = pure corridor-horizontal.
  const vTarget = SECO_VCIRC_FRAC * vCirc;
  const speedFrac = Math.min(1, vHoriz / Math.max(vTarget, 1));

  // Start lofted after stage (~40–50° from horizontal = pitch ~0.7–0.9 rad from vertical)
  // then flatten as speed builds so most late Δv is horizontal.
  let pitch = (Math.PI / 2) * (0.55 + 0.4 * smoothstep(1.5, 6.5, vHoriz));
  // Hold altitude if falling while still under target speed
  if (vRad < -0.05 && speedFrac < 0.95 && alt < 120) {
    pitch = Math.max(0.4, pitch - 0.35);
  }
  // Don't loft forever once above ~150 km
  if (alt > 150) {
    pitch = Math.min((Math.PI / 2) * 0.97, pitch + 0.1);
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
  if (mode === "relight") return 0.45;
  if (mode === "land") {
    if (t < F13.LAND_BURN) return 0;
    // 3-engine light → 2 → 1 (matches public cadence)
    if (t < F13.LAND_3TO2) return 0.95;
    if (t < F13.LAND_2TO1) return 0.62;
    return 0.38;
  }
  if (mode === "boost") {
    let thr = 0.9;
    if (alt > 5 && alt < 30) thr *= 0.78; // max-Q dip
    if (alt < 2) thr = 0.98;
    if (t > F13.MECO - 8) thr *= Math.max(0.15, (F13.HOT_STAGE - t) / 12);
    return Math.max(0, Math.min(1, thr));
  }
  // upper — steady ship burn until SECO energy / clock
  if (t >= F13.SECO - 8) return Math.max(0, (F13.SECO - t) / 8) * 0.8;
  return 0.88;
}

function peakForceN(mode: BurnMode, thr: number): number {
  if (mode === "boost") return BOOSTER_THRUST_N * thr;
  if (mode === "hot_stage")
    return BOOSTER_THRUST_N * 0.18 * thr + SHIP_THRUST_N * 0.95;
  // Sustained ship thrust through SECO (pure-RE Δv over ~5–6 min class)
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
  /**
   * Acceleration only — propellant is drained once after each RK4 step.
   * Idle entry still returns a small belly-flop lift accel (no propellant).
   */
  const thrustFn: ThrustFn = (t, pos, vel) => {
    const alt = altitudeEarth(t, pos);
    const thr = throttleFor(t, alt, mode);

    // Theater belly-flop lift during atmospheric entry / late coast
    const bLift = getBodies(t);
    sub(_relP, pos, bLift.earth);
    const rL = len(_relP) || 1;
    set(_up, _relP.x / rL, _relP.y / rL, _relP.z / rL);
    sub(_relV, vel, bLift.earthVel);
    const vRel = len(_relV);
    const vRad = dot(_relV, _up);
    let aeroAx = 0;
    let aeroAy = 0;
    let aeroAz = 0;
    // High-AoA aero only while still hypersonic / supersonic — not during
    // the low-speed approach glide (drag would pin the craft in place).
    if (
      prop.staged &&
      (mode === "idle" || mode === "land") &&
      t >= F13.ENTRY - 600 &&
      alt > 3 &&
      alt < 110 &&
      vRel > 1.2
    ) {
      const rho = atmDensity(alt);
      // a_drag = ½ (CdA/m) ρ |v|  along −v  (km/s²)
      const aDrag = Math.min(
        0.05,
        0.5 * BELLY_CD_A_OVER_M * rho * vRel,
      );
      if (aDrag > 1e-9) {
        aeroAx -= (_relV.x / vRel) * aDrag;
        aeroAy -= (_relV.y / vRel) * aDrag;
        aeroAz -= (_relV.z / vRel) * aDrag;
      }
      // Lift outward while descending — stretches the corridor (theater L/D)
      if (mode === "idle" && vRad < 0 && vRel > 1.5 && alt > 8) {
        const aLift = Math.min(0.02, aDrag * BELLY_L_OVER_D);
        aeroAx += _up.x * aLift;
        aeroAy += _up.y * aLift;
        aeroAz += _up.z * aLift;
      }
    }

    // Theater approach glide: after hypersonic energy is bled, cruise toward
    // splash at ~8–12 km rather than skidding on the surface for 15 min.
    if (
      prop.staged &&
      mode === "idle" &&
      t >= F13.ENTRY &&
      t < F13.LAND_BURN - 5 &&
      alt < 40 &&
      vRel < 2.5
    ) {
      const splash = splashSurfaceInertial(t, _tmp2);
      const bG = getBodies(t);
      set(
        _tmp3,
        bG.earth.x + splash.x * (R_EARTH + 10) - pos.x,
        bG.earth.y + splash.y * (R_EARTH + 10) - pos.y,
        bG.earth.z + splash.z * (R_EARTH + 10) - pos.z,
      );
      const dist = len(_tmp3);
      if (dist > 20) {
        normalize(_tmp3, _tmp3);
        const rd = dot(_tmp3, _up);
        set(
          _horiz,
          _tmp3.x - _up.x * rd,
          _tmp3.y - _up.y * rd,
          _tmp3.z - _up.z * rd,
        );
        if (len(_horiz) > 1e-8) {
          normalize(_horiz, _horiz);
          // Target cruise ~0.7 km/s along-track (covers ~600 km in ~15 min)
          const vAlong = dot(_relV, _horiz);
          const aH = Math.max(-0.008, Math.min(0.01, (0.7 - vAlong) * 0.6));
          aeroAx += _horiz.x * aH;
          aeroAy += _horiz.y * aH;
          aeroAz += _horiz.z * aH;
        }
        // Hold ~10 km altitude
        const tgtAlt = 10;
        const aV = Math.max(
          -0.01,
          Math.min(0.012, (tgtAlt - alt) * 0.004 - vRad * 0.8),
        );
        aeroAx += _up.x * aV;
        aeroAy += _up.y * aV;
        aeroAz += _up.z * aV;
      }
    }

    if (mode === "idle" || thr < 1e-4) {
      lastThrustN = 0;
      lastBoostN = 0;
      lastShipN = 0;
      if (aeroAx === 0 && aeroAy === 0 && aeroAz === 0) return null;
      set(thrAcc, aeroAx, aeroAy, aeroAz);
      return thrAcc;
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
        (SHIP_THRUST_N * 0.9) / Math.max(wetMassKg(prop), 1) / 1000;
      const shipLim = limitAccelByThrust(prop, shipA, "ship");
      aTot += shipLim.aKmS2;
      lastShipN += shipLim.forceN;
      lastBoostN = lim.forceN;
    }
    lastThrustN = lastBoostN + lastShipN;
    if (aTot < 1e-9 && aeroAx === 0 && aeroAy === 0 && aeroAz === 0) {
      return null;
    }
    scale(thrAcc, _steer, aTot);
    thrAcc.x += aeroAx;
    thrAcc.y += aeroAy;
    thrAcc.z += aeroAz;
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
    if (
      mode === "hot_stage" &&
      (t - hotStageT0 >= HOT_STAGE_S || t >= F13.HOT_STAGE + HOT_STAGE_S)
    ) {
      stageBooster(prop, t);
      mode = "upper";
    }
    if (!prop.staged && t >= F13.HOT_STAGE + 1) {
      stageBooster(prop, t);
      mode = "upper";
    }
    if (mode === "upper") {
      const bCut = getBodies(t);
      sub(_relV, state.vel, bCut.earthVel);
      sub(_relP, state.pos, bCut.earth);
      const r = len(_relP) || 1;
      const vRad = dot(_relV, _relP) / r;
      set(
        _horiz,
        _relV.x - (_relP.x / r) * vRad,
        _relV.y - (_relP.y / r) * vRad,
        _relV.z - (_relP.z / r) * vRad,
      );
      const vHoriz = len(_horiz);
      const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));
      // Cut when near-circular horizontal speed is reached (prevents escape burns)
      const vTot = len(_relV);
      const energyOk =
        vHoriz >= SECO_VCIRC_FRAC * vCirc * 0.995 ||
        vTot >= SECO_VCIRC_FRAC * vCirc * 1.02;
      // Also cut on the public SECO mark or prop reserve
      const propLow = fuelShipFrac(prop) <= SHIP_PROP_RESERVE;
      if (t >= F13.SECO || energyOk || propLow) {
        mode = "idle";
      }
    }
    if (mode === "idle" && t >= F13.RELIGHT && t < F13.RELIGHT_END) {
      mode = "relight";
    }
    if (mode === "relight" && t >= F13.RELIGHT_END) {
      mode = "idle";
    }
    // Landing burn: public mark, or early if low and near splash after entry
    if (mode !== "land" && t < F13.SPLASH && t >= F13.ENTRY) {
      const splash = splashSurfaceInertial(t, _tmp2);
      const bL = getBodies(t);
      sub(_relP, state.pos, bL.earth);
      normalize(_tmp3, _relP);
      const ang = Math.acos(Math.min(1, Math.max(-1, dot(_tmp3, splash))));
      const rangeKm = ang * R_EARTH;
      const nearSplash = rangeKm < 600;
      if (
        t >= F13.LAND_BURN ||
        (alt < 20 && nearSplash && t >= F13.LAND_BURN - 120)
      ) {
        mode = "land";
      }
    }
    if (t >= F13.SPLASH) {
      mode = "idle";
    }

    // Phase id for HUD — monotonic in mission time (matches public timeline)
    let phase: PhaseId;
    if (t < 12) phase = "launch";
    else if (t < F13.SECO) phase = "ascent";
    else if (t < F13.ENTRY) phase = "coast";
    else if (mode === "land" || t >= F13.LAND_BURN) {
      phase = t >= F13.SPLASH ? "splashdown" : "descent";
    } else if (t < F13.SPLASH) phase = "entry";
    else phase = "splashdown";

    // Step size
    let dt = 1.0;
    if (mode === "boost" || mode === "hot_stage" || mode === "upper") dt = 0.25;
    else if (mode === "land" || mode === "relight") dt = 0.15;
    else if (phase === "entry" || alt < 120) dt = 0.4;
    else if (phase === "coast") dt = 2.0;
    dt = Math.min(dt, maxT - state.t);
    if (dt < 1e-4) break;

    rk4Step(state, dt, thrustFn);

    // Surface clamp: never tunnel underground. During approach glide keep
    // horizontal speed so we can cruise toward splash at low altitude.
    {
      const b = getBodies(state.t);
      sub(_relP, state.pos, b.earth);
      const L = len(_relP) || 1;
      const curAlt = L - R_EARTH;
      const gliding =
        prop.staged &&
        mode === "idle" &&
        state.t >= F13.ENTRY &&
        state.t < F13.LAND_BURN;
      if (curAlt < (gliding ? 3 : 0.02) && state.t < F13.SPLASH - 1) {
        const floorAlt = gliding ? 8 : 0.02;
        const holdR = R_EARTH + floorAlt;
        state.pos.x = b.earth.x + (_relP.x / L) * holdR;
        state.pos.y = b.earth.y + (_relP.y / L) * holdR;
        state.pos.z = b.earth.z + (_relP.z / L) * holdR;
        sub(_relV, state.vel, b.earthVel);
        const vr = dot(_relV, _relP) / L;
        if (vr < 0) {
          // Kill inward radial only
          state.vel.x -= (_relP.x / L) * vr;
          state.vel.y -= (_relP.y / L) * vr;
          state.vel.z -= (_relP.z / L) * vr;
        }
        if (!gliding) {
          // Heavy horizontal damp only when truly decked (not gliding)
          state.vel.x = b.earthVel.x + (state.vel.x - b.earthVel.x) * 0.92;
          state.vel.y = b.earthVel.y + (state.vel.y - b.earthVel.y) * 0.92;
          state.vel.z = b.earthVel.z + (state.vel.z - b.earthVel.z) * 0.92;
        }
      }
    }

    // Book propellant once per step
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

    // Soft settle toward splash during late landing (theater terminal guidance)
    if (t >= F13.LAND_BURN - 5 && t < F13.SPLASH) {
      const b = getBodies(state.t);
      const surf = splashSurfaceInertial(state.t, _tmp);
      const targetR = R_EARTH + Math.max(0.02, Math.min(alt, 8));
      const tx = b.earth.x + surf.x * targetR;
      const ty = b.earth.y + surf.y * targetR;
      const tz = b.earth.z + surf.z * targetR;
      // Ease in: gentle from land burn, firm in last 2 s
      const blend =
        0.015 +
        0.08 * smoothstep(F13.LAND_BURN, F13.SPLASH - 2, state.t) +
        0.55 * smoothstep(F13.SPLASH - 2, F13.SPLASH, state.t);
      state.pos.x += (tx - state.pos.x) * blend;
      state.pos.y += (ty - state.pos.y) * blend;
      state.pos.z += (tz - state.pos.z) * blend;
      // Damp residual velocity near the end
      if (state.t >= F13.SPLASH - 3) {
        const damp = smoothstep(F13.SPLASH - 3, F13.SPLASH, state.t);
        state.vel.x = state.vel.x * (1 - damp) + b.earthVel.x * damp;
        state.vel.y = state.vel.y * (1 - damp) + b.earthVel.y * damp;
        state.vel.z = state.vel.z * (1 - damp) + b.earthVel.z * damp;
      }
    }
    if (t >= F13.SPLASH - 0.05) {
      const b = getBodies(state.t);
      const surf = splashSurfaceInertial(state.t, _tmp);
      const targetR = R_EARTH + 0.02;
      state.pos.x = b.earth.x + surf.x * targetR;
      state.pos.y = b.earth.y + surf.y * targetR;
      state.pos.z = b.earth.z + surf.z * targetR;
      state.vel.x = b.earthVel.x;
      state.vel.y = b.earthVel.y;
      state.vel.z = b.earthVel.z;
      pushSample(samples, state, "splashdown", false, prop, 0);
      break;
    }

    const burning = lastThrustN > 1e3;
    const last = samples[samples.length - 1]!;
    const minDt =
      phase === "launch" || mode === "boost" || mode === "hot_stage"
        ? 0.2
        : phase === "coast" && mode === "idle"
          ? 4
          : 0.4;
    if (
      state.t - last.t >= minDt ||
      phase !== last.phase ||
      burning !== last.burning
    ) {
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
