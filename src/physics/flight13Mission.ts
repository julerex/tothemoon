/**
 * Starship Flight 13 theater mission (suborbital flight test).
 *
 * Timeline anchors match docs/STARSHIP_13.md (SpaceX public profile, approx).
 * Dynamics: restricted RK4 with mass-coupled thrust + atmosphere. Default
 * force model is full restricted n-body (Earth + Moon + solar tide + J₂ +
 * drag). Pass `{ gravity: "earth" }` for Earth-only mechanics (μ + J₂ + drag,
 * no Moon/Sun) — used to cross-check that third-body terms stay small on a
 * ~1 h suborbital arc.
 *
 * Steering aims along the Starbase → Indian Ocean great-circle corridor
 * (same plane as the Earth GC view).
 *
 * Profile (theater-grade, not ops — but intentionally more ballistic):
 * - Gravity-turn ascent + hot-stage along the corridor
 * - Upper burn builds near-circular horizontal speed (low radial rate at SECO)
 * - Free coast is pure ballistic (no midcourse PD / altitude-hold glide)
 * - In-space relight is a real retrograde deorbit burn (theater-lengthened
 *   vs the public ~12 s demo so periapsis drops before the entry mark)
 * - Entry: high-AoA belly drag (+ modest lift) only — no powered cruise
 * - Landing burn brakes near the splash fix; soft snap only in the last ~1 s
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
  type AccelOptions,
  type CraftState,
  type GravityModel,
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
  /** Public table ~T+38:58; burn window theater-lengthened for deorbit Δv. */
  RELIGHT: 2338,
  /**
   * End of single-engine deorbit. Public demo is ~12 s; theater uses ~20 s
   * for a modest periapsis drop (~0.15–0.3 km/s) without killing the coast.
   */
  RELIGHT_END: 2358,
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
const SHIP_PROP_RESERVE = 0.07;

/**
 * Target horizontal speed fraction of local circular at SECO.
 * Near-circular for a long coast; deorbit is the relight's job.
 */
const SECO_VCIRC_FRAC = 0.985;

/**
 * Max |v_radial| (km/s) at SECO energy cut — keep loft modest without
 * forcing a shallow low-altitude ellipse that reenters halfway to splash.
 */
const SECO_VRAD_MAX = 0.18;

/** Prefer not to declare SECO energy until this altitude (km). */
const SECO_ALT_MIN_KM = 165;

/**
 * Belly-flop Cd·A/m (km²/kg) — high-AoA entry (ascent stack factor is much
 * smaller). Theater only; not a CFD table.
 */
const BELLY_CD_A_OVER_M = 1.6e-10;

/**
 * Lift-to-drag fraction of belly drag (outward). Tuned so the hypersonic
 * corridor covers the last ~1–2e3 km to splash without a powered altitude-hold.
 */
const BELLY_L_OVER_D = 0.42;

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
    // Pure retrograde deorbit — anti-horizontal velocity (drop periapsis)
    if (vHoriz > 0.05) {
      set(out, -_horiz.x / vHoriz, -_horiz.y / vHoriz, -_horiz.z / vHoriz);
    } else {
      set(out, -along.x, -along.y, -along.z);
    }
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

  // ── Hot-stage / upper: climb to ~170–200 km then near-circular ──
  // Pitch 0 = vertical, π/2 = pure corridor-horizontal.
  const vTarget = SECO_VCIRC_FRAC * vCirc;
  const speedFrac = Math.min(1, vHoriz / Math.max(vTarget, 1));

  // While below insert altitude, keep a loft component so SECO is not at 100 km
  if (alt < SECO_ALT_MIN_KM) {
    let pitch = (Math.PI / 2) * (0.5 + 0.4 * smoothstep(1.0, 5.5, vHoriz));
    // Climb bias if not rising
    if (vRad < 0.05) pitch = Math.max(0.35, pitch - 0.25);
    // Don't loft forever if already fast
    if (speedFrac > 0.9) pitch = Math.min((Math.PI / 2) * 0.92, pitch + 0.12);
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

  // Above insert altitude: kill radial hard, then push horizontal to vTarget
  const tgtRad = -1.1 * vRad; // strong radial damp
  const needH = Math.max(0, vTarget - vHoriz);
  // Weight radial fix higher when |vr| is large
  const radW = Math.min(0.55, 0.2 + Math.abs(vRad) * 1.2);
  const horizW = 1 - radW;
  // Prefer more horizontal once radial is calm
  const hBoost = needH > 0.05 ? 0.15 : 0;
  set(
    out,
    along.x * (horizW + hBoost) + _up.x * tgtRad,
    along.y * (horizW + hBoost) + _up.y * tgtRad,
    along.z * (horizW + hBoost) + _up.z * tgtRad,
  );
  if (len(out) < 1e-8) set(out, along.x, along.y, along.z);
  normalize(out, out);
}

function throttleFor(t: number, alt: number, mode: BurnMode): number {
  if (mode === "idle") return 0;
  if (mode === "hot_stage") return 0.55;
  // Single-engine deorbit: moderate throttle (Δv ~0.2–0.3 km/s over ~20 s)
  if (mode === "relight") return 0.5;
  if (mode === "land") {
    // 3 → 2 → 1 cadence (public marks; early light still uses same steps)
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
  // ~1 of 3 Raptors (theater single-engine deorbit)
  if (mode === "relight") return SHIP_THRUST_N * 0.34 * thr;
  if (mode === "land") return SHIP_THRUST_N * thr;
  return 0;
}

function tankFor(mode: BurnMode, staged: boolean): Tank {
  if (!staged && (mode === "boost" || mode === "hot_stage")) return "booster";
  return "ship";
}

/** Options for {@link runFlight13Mission}. */
export type Flight13MissionOptions = {
  /**
   * Force model. Default `"nbody"` (Earth + Moon + solar tide + J₂ + drag).
   * `"earth"` drops Moon / Sun for an independent Earth-mechanics check.
   */
  gravity?: GravityModel;
};

/**
 * Integrate Flight 13 from liftoff through Indian Ocean splashdown.
 */
export function runFlight13Mission(
  opts?: Flight13MissionOptions,
): MissionResult {
  const accelOpts: AccelOptions = { gravity: opts?.gravity ?? "nbody" };
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
    // High-AoA belly aero while hypersonic/supersonic in the atmosphere.
    // No powered altitude-hold glide — ballistic + aero (+ bank toward splash).
    if (
      prop.staged &&
      mode === "idle" &&
      t >= F13.RELIGHT_END &&
      alt > 8 &&
      alt < 120 &&
      vRel > 0.8
    ) {
      const rho = atmDensity(alt);
      // a_drag = ½ (CdA/m) ρ |v|  along −v  (km/s²)
      const aDrag = Math.min(
        0.04,
        0.5 * BELLY_CD_A_OVER_M * rho * vRel,
      );
      if (aDrag > 1e-9) {
        aeroAx -= (_relV.x / vRel) * aDrag;
        aeroAy -= (_relV.y / vRel) * aDrag;
        aeroAz -= (_relV.z / vRel) * aDrag;
      }
      // Lift while descending: stretches the corridor at mid-altitudes
      if (vRad < 0 && vRel > 1.5 && alt > 12 && alt < 95) {
        const band =
          alt > 25 && alt < 65 ? 1.1 : alt < 25 ? 0.65 : 1.0;
        const aLift = Math.min(0.015, aDrag * BELLY_L_OVER_D * band);
        aeroAx += _up.x * aLift;
        aeroAy += _up.y * aLift;
        aeroAz += _up.z * aLift;
      }
      // Bank toward splash (theater entry guidance — not RCS)
      if (vRel > 1.0 && alt > 12 && alt < 90) {
        const splash = splashSurfaceInertial(t, _tmp2);
        const bG = getBodies(t);
        set(
          _tmp3,
          bG.earth.x + splash.x * (R_EARTH + alt) - pos.x,
          bG.earth.y + splash.y * (R_EARTH + alt) - pos.y,
          bG.earth.z + splash.z * (R_EARTH + alt) - pos.z,
        );
        // Horizontal desired heading
        const rd = dot(_tmp3, _up);
        set(
          _horiz,
          _tmp3.x - _up.x * rd,
          _tmp3.y - _up.y * rd,
          _tmp3.z - _up.z * rd,
        );
        const hLen = len(_horiz);
        if (hLen > 1e-6) {
          normalize(_horiz, _horiz);
          // Current horizontal velocity unit
          set(
            _tmp3,
            _relV.x - _up.x * vRad,
            _relV.y - _up.y * vRad,
            _relV.z - _up.z * vRad,
          );
          const vh = len(_tmp3);
          if (vh > 0.3) {
            normalize(_tmp3, _tmp3);
            // Lateral = desired × current (turn direction), magnitude from misalignment
            const align = dot(_horiz, _tmp3);
            if (align < 0.98) {
              // Sideways unit in horizontal plane: horiz − proj onto v_h
              set(
                _tmp2,
                _horiz.x - _tmp3.x * align,
                _horiz.y - _tmp3.y * align,
                _horiz.z - _tmp3.z * align,
              );
              if (len(_tmp2) > 1e-8) {
                normalize(_tmp2, _tmp2);
                const aBank = Math.min(0.008, aDrag * 0.45 * (1 - align));
                aeroAx += _tmp2.x * aBank;
                aeroAy += _tmp2.y * aBank;
                aeroAz += _tmp2.z * aBank;
              }
            }
          }
        }
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
      // Cut when near-circular at insert altitude (or public SECO / prop floor).
      // Prefer waiting a few seconds past energy to kill residual radial rate.
      const energyOk =
        alt >= SECO_ALT_MIN_KM &&
        vHoriz >= SECO_VCIRC_FRAC * vCirc * 0.998 &&
        Math.abs(vRad) <= SECO_VRAD_MAX;
      const speedCap =
        alt >= SECO_ALT_MIN_KM &&
        vHoriz >= SECO_VCIRC_FRAC * vCirc * 1.025;
      const propLow = fuelShipFrac(prop) <= SHIP_PROP_RESERVE;
      // Don't cut solely on the clock if still deeply lofted and have prop
      const clockCut =
        t >= F13.SECO &&
        (Math.abs(vRad) <= SECO_VRAD_MAX * 1.5 || propLow || alt < 100);
      if (energyOk || speedCap || propLow || clockCut) {
        mode = "idle";
      }
    }
    if (mode === "idle" && t >= F13.RELIGHT && t < F13.RELIGHT_END) {
      mode = "relight";
    }
    if (mode === "relight" && t >= F13.RELIGHT_END) {
      mode = "idle";
    }
    // Landing burn only after aero has bled most of the speed (or public mark).
    // Lighting at hypersonic would empty the tank and leave a surface skid.
    if (mode !== "land" && mode !== "relight" && t >= F13.ENTRY - 90) {
      const bL = getBodies(t);
      sub(_relV, state.vel, bL.earthVel);
      const vRel = len(_relV);
      const splash = splashSurfaceInertial(t, _tmp2);
      sub(_relP, state.pos, bL.earth);
      normalize(_tmp3, _relP);
      const rangeKm =
        Math.acos(Math.min(1, Math.max(-1, dot(_tmp3, splash)))) * R_EARTH;
      if (
        t >= F13.LAND_BURN ||
        (alt < 12 && vRel < 0.9 && rangeKm < 600 && t >= F13.ENTRY - 60) ||
        (alt < 4 && vRel < 0.55 && t >= F13.ENTRY)
      ) {
        mode = "land";
      }
    }
    if (t >= F13.SPLASH + 5) {
      mode = "idle";
    }

    // Phase id for HUD — dynamics-driven after SECO (not only public clock)
    let phase: PhaseId;
    if (t < 12) phase = "launch";
    else if (t < F13.SECO) phase = "ascent";
    else if (mode === "land") phase = "descent";
    else if (
      prop.staged &&
      t >= F13.RELIGHT &&
      alt < 120
    ) {
      // Atmospheric interface by altitude after deorbit window opens
      phase = "entry";
    } else phase = "coast";

    // Step size
    let dt = 1.0;
    if (mode === "boost" || mode === "hot_stage" || mode === "upper") dt = 0.25;
    else if (mode === "land" || mode === "relight") dt = 0.15;
    else if (phase === "entry" || alt < 120) dt = 0.4;
    else if (phase === "coast") dt = 2.0;
    dt = Math.min(dt, maxT - state.t);
    if (dt < 1e-4) break;

    rk4Step(state, dt, thrustFn, accelOpts);

    // Surface clamp only: never tunnel underground (no altitude-hold floor)
    {
      const b = getBodies(state.t);
      sub(_relP, state.pos, b.earth);
      const L = len(_relP) || 1;
      const curAlt = L - R_EARTH;
      if (curAlt < 0.02 && state.t < F13.SPLASH - 1) {
        const holdR = R_EARTH + 0.02;
        state.pos.x = b.earth.x + (_relP.x / L) * holdR;
        state.pos.y = b.earth.y + (_relP.y / L) * holdR;
        state.pos.z = b.earth.z + (_relP.z / L) * holdR;
        sub(_relV, state.vel, b.earthVel);
        const vr = dot(_relV, _relP) / L;
        if (vr < 0) {
          state.vel.x -= (_relP.x / L) * vr;
          state.vel.y -= (_relP.y / L) * vr;
          state.vel.z -= (_relP.z / L) * vr;
        }
        // Surface friction once decked (skid, not powered cruise)
        state.vel.x = b.earthVel.x + (state.vel.x - b.earthVel.x) * 0.96;
        state.vel.y = b.earthVel.y + (state.vel.y - b.earthVel.y) * 0.96;
        state.vel.z = b.earthVel.z + (state.vel.z - b.earthVel.z) * 0.96;
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

    // Natural splashdown: low, slow, and near the theater fix — or public clock
    {
      const b = getBodies(state.t);
      const surf = splashSurfaceInertial(state.t, _tmp);
      sub(_relP, state.pos, b.earth);
      const L = len(_relP) || 1;
      const curAlt = L - R_EARTH;
      sub(_relV, state.vel, b.earthVel);
      const vRel = len(_relV);
      const ang = Math.acos(
        Math.min(1, Math.max(-1, dot(normalize(_tmp3, _relP), surf))),
      );
      const rangeKm = ang * R_EARTH;
      const naturalDone =
        mode === "land" &&
        curAlt < 2.5 &&
        vRel < 0.35 &&
        rangeKm < 180 &&
        t >= F13.ENTRY;
      const clockDone = t >= F13.SPLASH - 0.1;
      if (naturalDone || clockDone) {
        const targetR = R_EARTH + 0.02;
        if (rangeKm < 200) {
          state.pos.x = b.earth.x + surf.x * targetR;
          state.pos.y = b.earth.y + surf.y * targetR;
          state.pos.z = b.earth.z + surf.z * targetR;
        } else {
          // Dynamics miss: land under the craft, not a multi-Mm teleport
          state.pos.x = b.earth.x + (_relP.x / L) * targetR;
          state.pos.y = b.earth.y + (_relP.y / L) * targetR;
          state.pos.z = b.earth.z + (_relP.z / L) * targetR;
        }
        state.vel.x = b.earthVel.x;
        state.vel.y = b.earthVel.y;
        state.vel.z = b.earthVel.z;
        pushSample(samples, state, "splashdown", false, prop, 0);
        break;
      }
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
  const gLabel = accelOpts.gravity === "earth" ? "earth-only" : "n-body";
  console.info(
    `[flight13] ${out.message} · ${gLabel} · duration=${(out.durationS / 60).toFixed(1)} min · samples=${out.samples.length} · stageT=${out.stageT?.toFixed(0)}s`,
  );
  return out;
}
