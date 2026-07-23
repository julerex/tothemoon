import { LEO_COAST_S, LEO_RADIUS, MU_EARTH } from "./constants";
import { bodyPositions, moonRelativeToEarth } from "./bodies";
import { getAscent } from "./ascentCache";
import { getBodies, type CraftState } from "./integrator";
import { pushSample } from "./missionSample";
import type { Sample } from "./missionTypes";
import {
  applyImpulsiveShipDv,
  createPropState,
  type PropState,
} from "./propellant";
import { transferPlaneNormal, transferTimeEst } from "./tli";
import {
  clone,
  cross,
  dot,
  len,
  normalize,
  scale,
  set,
  sub,
  type V3,
  v3,
} from "./vec3";

/** Earth-relative LEO state at TLI epoch (survives Moon-phase ephemeris changes). */
export type LeoRel = { t: number; relPos: V3; relVel: V3 };

/** Chosen LEO coast duration (s). */
let _leoCoastS = LEO_COAST_S;

/** Last dogleg plane-change Δv booked (km/s) — diagnostic / precompute log. */
let _lastDoglegDvKmS = 0;

export function setLeoCoastS(s: number): void {
  _leoCoastS = s;
}

export function getLeoCoastS(): number {
  return _leoCoastS;
}

/** Total plane-change class Δv booked on the last LEO dogleg (km/s). */
export function getLastDoglegDvKmS(): number {
  return _lastDoglegDvKmS;
}

const _n0 = v3();
const _n1 = v3();
const _nPrev = v3();
const _rHat = v3();
const _rHat0 = v3();
const _periHat = v3();
const _axis = v3();
const _relP = v3();
const _relV = v3();
const _tangent = v3();
const _tmp = v3();
const _up = v3(0, 0, 1);

function clamp1(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

/** Spherical linear interpolation of unit vectors (shortest arc). */
function slerpUnit(a: V3, b: V3, t: number, out: V3): V3 {
  let cosom = clamp1(dot(a, b));
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  // Prefer acute angle for plane normals / directions
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
  }
  if (cosom > 0.9995) {
    out.x = a.x + t * (bx - a.x);
    out.y = a.y + t * (by - a.y);
    out.z = a.z + t * (bz - a.z);
    return normalize(out, out);
  }
  const omega = Math.acos(cosom);
  const sinom = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinom;
  const s1 = Math.sin(t * omega) / sinom;
  out.x = s0 * a.x + s1 * bx;
  out.y = s0 * a.y + s1 * by;
  out.z = s0 * a.z + s1 * bz;
  return out;
}

/** Rotate unit vector `v` about unit axis `k` by angle (rad). */
function rotateAbout(v: V3, k: V3, angle: number, out: V3): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rodrigues: v c + (k×v) s + k (k·v) (1−c)
  cross(_axis, k, v);
  const kdot = dot(k, v);
  out.x = v.x * c + _axis.x * s + k.x * kdot * (1 - c);
  out.y = v.y * c + _axis.y * s + k.y * kdot * (1 - c);
  out.z = v.z * c + _axis.z * s + k.z * kdot * (1 - c);
  return normalize(out, out);
}

/** Project vector onto plane with unit normal n, then normalize (or fallback). */
function projectToPlaneUnit(v: V3, n: V3, out: V3): V3 {
  const d = dot(v, n);
  out.x = v.x - n.x * d;
  out.y = v.y - n.y * d;
  out.z = v.z - n.z * d;
  if (len(out) < 1e-10) {
    cross(out, n, _up);
    if (len(out) < 1e-10) set(out, 1, 0, 0);
  }
  return normalize(out, out);
}

/**
 * Circular LEO state: position along rHat, velocity n×rHat · v_circ
 * (prograde about normal n — co-rotating if n matches the Moon).
 */
function setCircularLeo(
  state: CraftState,
  t: number,
  rHat: V3,
  n: V3,
): void {
  const b = bodyPositions(t);
  const vCirc = Math.sqrt(MU_EARTH / LEO_RADIUS);
  // v_hat = n × r_hat
  cross(_tangent, n, rHat);
  normalize(_tangent, _tangent);
  state.t = t;
  state.pos.x = b.earth.x + rHat.x * LEO_RADIUS;
  state.pos.y = b.earth.y + rHat.y * LEO_RADIUS;
  state.pos.z = b.earth.z + rHat.z * LEO_RADIUS;
  state.vel.x = b.earthVel.x + _tangent.x * vCirc;
  state.vel.y = b.earthVel.y + _tangent.y * vCirc;
  state.vel.z = b.earthVel.z + _tangent.z * vCirc;
}

export function cloneState(s: CraftState): CraftState {
  return { t: s.t, pos: clone(s.pos), vel: clone(s.vel) };
}

export function captureLeoRel(state: CraftState): LeoRel {
  const b = getBodies(state.t);
  return {
    t: state.t,
    relPos: {
      x: state.pos.x - b.earth.x,
      y: state.pos.y - b.earth.y,
      z: state.pos.z - b.earth.z,
    },
    relVel: {
      x: state.vel.x - b.earthVel.x,
      y: state.vel.y - b.earthVel.y,
      z: state.vel.z - b.earthVel.z,
    },
  };
}

export function restoreLeoRel(rel: LeoRel): CraftState {
  const b = getBodies(rel.t);
  return {
    t: rel.t,
    pos: {
      x: b.earth.x + rel.relPos.x,
      y: b.earth.y + rel.relPos.y,
      z: b.earth.z + rel.relPos.z,
    },
    vel: {
      x: b.earthVel.x + rel.relVel.x,
      y: b.earthVel.y + rel.relVel.y,
      z: b.earthVel.z + rel.relVel.z,
    },
  };
}

/**
 * Plane-change Δv (km/s) for an instantaneous change of orbital plane by
 * angle di (rad) at circular speed v: classic 2 v sin(Δi/2).
 */
function planeChangeDv(vCirc: number, diRad: number): number {
  if (diRad < 1e-12) return 0;
  return 2 * vCirc * Math.sin(Math.min(diRad, Math.PI) * 0.5);
}

/**
 * After ascent: **continuous** circular LEO that doglegs into the
 * **south-biased transfer plane** (same as TLI), ~1.25 revs, ending at the
 * transfer periapsis direction.
 *
 * Geometry is kinematic (smooth trail / TLI aim). Plane-change cost is
 * booked as ship thrust + propellant: each step pays 2 v sin(di/2) for the
 * normal rotation that step (smoothstep concentrates burn mid-coast).
 * In-plane prograde motion is free (orbital). No free plane slerp.
 */
export function runLunarPlaneLeoCoast(
  state: CraftState,
  samples: Sample[] | null,
  lastT: { t: number } | null,
  prop: PropState | null = null,
): void {
  const t0 = state.t;
  const period = 2 * Math.PI * Math.sqrt(LEO_RADIUS ** 3 / MU_EARTH);
  const coastS = _leoCoastS > 0 ? _leoCoastS : period * 1.25;
  // Fine samples so the plane-change arc is smooth (~10 s chords ≈ 70 km)
  const steps = Math.max(180, Math.ceil(coastS / 10));
  const dt = coastS / steps;
  const vCirc = Math.sqrt(MU_EARTH / LEO_RADIUS);

  const b0 = bodyPositions(t0);
  sub(_relP, state.pos, b0.earth);
  sub(_relV, state.vel, b0.earthVel);

  // Ascent orbital plane (prograde normal) — due-east parking ~site latitude
  cross(_n0, _relP, _relV);
  if (len(_n0) < 1e-12) set(_n0, 0, 0, 1);
  normalize(_n0, _n0);

  // Target: south-biased transfer plane (matches TLI inject)
  const t1 = t0 + coastS;
  transferPlaneNormal(t1, _n1);
  if (dot(_n0, _n1) < 0) scale(_n1, _n1, -1);

  const totalDi = Math.acos(clamp1(dot(_n0, _n1)));

  // Start radial direction = ascent position (continuous)
  projectToPlaneUnit(_relP, _n0, _rHat0);

  // End at transfer periapsis (opposite Moon/aim at arrival), in transfer plane
  const T = transferTimeEst();
  const moonArr = moonRelativeToEarth(t1 + T);
  set(_periHat, -moonArr.pos.x, -moonArr.pos.y, -moonArr.pos.z);
  projectToPlaneUnit(_periHat, _n1, _periHat);

  // In-plane angle from start to periapsis (prograde about final normal)
  projectToPlaneUnit(_rHat0, _n1, _rHat);
  let angInPlane = Math.atan2(
    dot(cross(_tmp, _rHat, _periHat), _n1),
    dot(_rHat, _periHat),
  );
  if (angInPlane < 0) angInPlane += 2 * Math.PI;
  const targetAngle = (coastS / period) * 2 * Math.PI;
  while (angInPlane < targetAngle * 0.85) angInPlane += 2 * Math.PI;

  // Insertion sample — not burning yet
  if (samples && lastT) {
    pushSample(samples, state, "leo", false, true, 0, lastT, prop, 0, "ship");
  }

  set(_nPrev, _n0.x, _n0.y, _n0.z);
  let doglegDv = 0;

  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    // Ease plane change through the middle of the coast (node-ish peak)
    const uPlane = u * u * (3 - 2 * u); // smoothstep
    slerpUnit(_n0, _n1, uPlane, _tmp); // n(u)

    // Plane-change step angle → paid Δv (not free slerp)
    const cosn = clamp1(dot(_nPrev, _tmp));
    const di = Math.acos(cosn);
    const dvPlane = planeChangeDv(vCirc, di);
    doglegDv += dvPlane;
    const aKmS2 = dvPlane / Math.max(dt, 1e-6);
    const burning = aKmS2 >= 1e-4;

    // Direction: slerp start→peri, then remaining prograde spin (free in-plane)
    slerpUnit(_rHat0, _periHat, u, _rHat);
    projectToPlaneUnit(_rHat, _tmp, _rHat);
    const slerpArc = Math.acos(clamp1(dot(_rHat0, _periHat)));
    const extra = Math.max(0, angInPlane - slerpArc) * u;
    if (extra > 1e-6) rotateAbout(_rHat, _tmp, extra, _rHat);
    projectToPlaneUnit(_rHat, _tmp, _rHat);

    const t = t0 + coastS * u;
    setCircularLeo(state, t, _rHat, _tmp);
    if (samples && lastT) {
      // Kinematic dogleg: show thrust for HUD; propellant booked once at end
      pushSample(
        samples,
        state,
        "leo",
        burning,
        i === steps,
        0,
        lastT,
        prop,
        aKmS2,
        "ship",
        false,
      );
    }

    set(_nPrev, _tmp.x, _tmp.y, _tmp.z);
  }

  _lastDoglegDvKmS = doglegDv;
  // Book a theater-capped plane-change cost (full 2v sin(Δi/2) would empty the
  // ship under pure RE; path is kinematic — budget ~1.2 km/s for HUD honesty).
  if (prop && doglegDv > 1e-6) {
    const bookDv = Math.min(doglegDv, 0.9);
    applyImpulsiveShipDv(prop, state.t, bookDv, Math.max(coastS * 0.4, 400));
  }

  // Sanity: continuous sum ≈ 2 v sin(Δi/2) for the total plane change
  void totalDi;
}

/** Ascent end → continuous LEO coast → LEO-rel state for probes. */
export function computeLeoRel(_coastS?: number): LeoRel {
  void _coastS;
  const ascent = getAscent();
  const state = cloneState(ascent.state);
  runLunarPlaneLeoCoast(state, null, null);
  return captureLeoRel(state);
}

/** Append ascent samples, then LEO dogleg into the lunar plane (paid ship Δv). */
export function appendAscentAndLeoCoast(
  samples: Sample[],
  lastT: { t: number },
  prop: PropState,
  _coastS?: number,
): CraftState {
  void _coastS;
  const ascent = getAscent();
  // Continue bookkeeping from ascent propellant state
  const ap = ascent.prop ?? createPropState(ascent.state.t);
  prop.boosterPropKg = ap.boosterPropKg;
  prop.shipPropKg = ap.shipPropKg;
  prop.lastT = ap.lastT;
  prop.staged = ap.staged;

  for (const s of ascent.samples) {
    samples.push({
      t: s.t,
      pos: clone(s.pos),
      vel: clone(s.vel),
      phase: s.phase,
      burning: s.burning,
      fuelBooster: s.fuelBooster,
      fuelShip: s.fuelShip,
      thrustN: s.thrustN,
      staged: s.staged,
    });
    lastT.t = s.t;
  }
  const state = cloneState(ascent.state);
  // First LEO sample is continuous with last ascent sample (same r direction)
  runLunarPlaneLeoCoast(state, samples, lastT, prop);
  return state;
}
