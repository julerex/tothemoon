/** Flight 13 burn mode machine, SECO, landing start, phase + dt. */
import { ATM_H_MAX_KM, HOT_STAGE_S, MU_EARTH, R_EARTH } from "./constants";
import { getBodies } from "./integrator";
import type { PhaseId } from "./missionTypes";
import { fuelShipFrac, stageBooster } from "./propellant";
import { dot, len, normalize, set, sub } from "./vec3";
import {
  F13,
  SECO_ALT_MIN_KM,
  SECO_VCIRC_FRAC,
  SECO_VRAD_MAX,
  SHIP_PROP_RESERVE,
  splashSurfaceInertial,
} from "./flight13Timeline";
import { _horiz, _relP, _relV, _tmp2, _tmp3 } from "./flight13Scratch";
import type { F13Loop } from "./flight13Types";

function hotStageDone(loop: F13Loop): boolean {
  const t = loop.state.t;
  return (
    loop.mode === "hot_stage" &&
    (t - loop.hotStageT0 >= HOT_STAGE_S || t >= F13.HOT_STAGE + HOT_STAGE_S)
  );
}

function advanceBoostHot(loop: F13Loop): void {
  const t = loop.state.t;
  if (loop.mode === "boost" && t >= F13.MECO) {
    loop.mode = "hot_stage";
    loop.hotStageT0 = t;
  }
  if (hotStageDone(loop) || (!loop.prop.staged && t >= F13.HOT_STAGE + 1)) {
    stageBooster(loop.prop, t);
    loop.mode = "upper";
  }
}

function advanceRelightWindow(loop: F13Loop): void {
  const t = loop.state.t;
  if (loop.mode === "idle" && t >= F13.RELIGHT && t < F13.RELIGHT_END) {
    loop.mode = "relight";
  }
  if (loop.mode === "relight" && t >= F13.RELIGHT_END) loop.mode = "idle";
}

/** Boost / hot-stage / SECO / relight / land mode machine. */
export function advanceFlight13Mode(loop: F13Loop, alt: number): void {
  advanceBoostHot(loop);
  if (loop.mode === "upper") maybeSeco(loop, alt);
  advanceRelightWindow(loop);
  maybeStartLand(loop, alt);
  if (loop.state.t >= F13.SPLASH + 5) loop.mode = "idle";
}

type SecoGeom = { vRad: number; vHoriz: number; vCirc: number };

function fillHorizFromRel(r: number, vRad: number): number {
  set(
    _horiz,
    _relV.x - (_relP.x / r) * vRad,
    _relV.y - (_relP.y / r) * vRad,
    _relV.z - (_relP.z / r) * vRad,
  );
  return len(_horiz);
}

function secoGeom(loop: F13Loop): SecoGeom {
  const bCut = getBodies(loop.state.t, loop.epoch);
  sub(_relV, loop.state.vel, bCut.earthVel);
  sub(_relP, loop.state.pos, bCut.earth);
  const r = len(_relP) || 1;
  const vRad = dot(_relV, _relP) / r;
  const vHoriz = fillHorizFromRel(r, vRad);
  const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));
  return { vRad, vHoriz, vCirc };
}

function secoShouldCut(loop: F13Loop, alt: number, g: SecoGeom): boolean {
  const t = loop.state.t; const vNeed = SECO_VCIRC_FRAC * g.vCirc;
  const energyOk =
    alt >= SECO_ALT_MIN_KM && g.vHoriz >= vNeed * 0.998 && Math.abs(g.vRad) <= SECO_VRAD_MAX;
  // Cut at 0.998 circular even if radial rate is still a bit lofted — a 0.1 s
  // step in a thin mesosphere otherwise jumps ~15 m/s and skips Australia.
  const speedCap = alt >= SECO_ALT_MIN_KM && g.vHoriz >= vNeed * 0.998;
  const propLow = fuelShipFrac(loop.prop) <= SHIP_PROP_RESERVE;
  const clockCut =
    t >= F13.SECO && (Math.abs(g.vRad) <= SECO_VRAD_MAX * 1.5 || propLow || alt < 100);
  return energyOk || speedCap || propLow || clockCut;
}

/** SECO energy / clock cut for upper stage. */
function maybeSeco(loop: F13Loop, alt: number): void {
  if (secoShouldCut(loop, alt, secoGeom(loop))) loop.mode = "idle";
}

function landStartRangeKm(loop: F13Loop): { vRel: number; rangeKm: number } {
  const t = loop.state.t;
  const bL = getBodies(t, loop.epoch);
  sub(_relV, loop.state.vel, bL.earthVel);
  const splash = splashSurfaceInertial(t, _tmp2, loop.epoch);
  sub(_relP, loop.state.pos, bL.earth);
  normalize(_tmp3, _relP);
  const ang = Math.acos(Math.min(1, Math.max(-1, dot(_tmp3, splash))));
  return { vRel: len(_relV), rangeKm: ang * R_EARTH };
}

function shouldStartLand(t: number, alt: number, vRel: number, rangeKm: number): boolean {
  if (rangeKm > 280) return false;
  if (t >= F13.LAND_BURN && alt < 40) return true;
  if (alt < 12 && vRel < 0.9 && t >= F13.ENTRY - 60) return true;
  return alt < 4 && vRel < 0.55 && t >= F13.ENTRY;
}

/** Light landing burn when aero has bled speed or public mark. */
function maybeStartLand(loop: F13Loop, alt: number): void {
  const t = loop.state.t;
  if (loop.mode === "land" || loop.mode === "relight") return;
  if (t < F13.ENTRY - 90) return;
  const g = landStartRangeKm(loop);
  if (shouldStartLand(t, alt, g.vRel, g.rangeKm)) loop.mode = "land";
}

/** HUD phase id from time / mode / altitude. */
export function flight13Phase(loop: F13Loop, alt: number): PhaseId {
  if (loop.splashed) return "splashdown";
  const t = loop.state.t;
  if (t < 12) return "launch";
  if (t < F13.SECO) return "ascent";
  if (loop.mode === "land") return "descent";
  if (loop.prop.staged && t >= F13.RELIGHT && alt < ATM_H_MAX_KM) return "entry";
  return "coast";
}

/** Integrator step size. */
export function flight13Dt(loop: F13Loop, phase: PhaseId, alt: number, maxT: number): number {
  let dt = 1.0;
  if (loop.mode === "boost" || loop.mode === "hot_stage") {
    dt = 0.25;
  } else if (loop.mode === "upper") {
    // Fine steps near circular so a thin mesosphere cannot jump 30 m/s over SECO.
    dt = loop.state.t > 400 ? 0.1 : 0.25;
  } else if (loop.mode === "land" || loop.mode === "relight") dt = 0.15;
  else if (phase === "entry" || alt < ATM_H_MAX_KM) dt = alt < 80 ? 0.25 : 0.4;
  else if (phase === "coast") dt = 2.0;
  return Math.min(dt, maxT - loop.state.t);
}

