/** Flight 14 burn mode machine, SECO, insertion, deorbit, landing, phase + dt. */
import { ATM_H_MAX_KM, HOT_STAGE_S, MU_EARTH, R_EARTH } from "./constants";
import { getBodies } from "./integrator";
import type { PhaseId } from "./missionTypes";
import { fuelShipFrac, stageBooster } from "./propellant";
import { dot, len, set, sub } from "./vec3";
import {
  F14,
  SECO_VCIRC_FRAC,
  SHIP_PROP_RESERVE,
} from "./flight14Timeline";
import { _horiz, _relP, _relV } from "./flight13Scratch";
import type { F14Loop } from "./flight14Types";

function hotStageDone(loop: F14Loop): boolean {
  const t = loop.state.t;
  return (
    loop.mode === "hot_stage" &&
    (t - loop.hotStageT0 >= HOT_STAGE_S || t >= F14.HOT_STAGE + HOT_STAGE_S)
  );
}

function advanceBoostHot(loop: F14Loop): void {
  const t = loop.state.t;
  if (loop.mode === "boost" && t >= F14.MECO) {
    loop.mode = "hot_stage";
    loop.hotStageT0 = t;
  }
  if (hotStageDone(loop) || (!loop.prop.staged && t >= F14.HOT_STAGE + 1)) {
    stageBooster(loop.prop, t);
    loop.mode = "upper";
  }
}

function perigeeAltKm(g: SecoGeom): number {
  const v2 = g.vHoriz * g.vHoriz + g.vRad * g.vRad;
  const eps = 0.5 * v2 - MU_EARTH / g.r;
  if (!(eps < 0)) return -1e3;
  const a = -MU_EARTH / (2 * eps);
  const h = g.r * g.vHoriz;
  const e = Math.sqrt(Math.max(0, 1 - (h * h) / (MU_EARTH * a)));
  return a * (1 - e) - R_EARTH;
}

function advanceInsertWindow(loop: F14Loop): void {
  const t = loop.state.t;
  if (loop.mode === "idle" && t >= F14.INSERT && t < F14.INSERT_END + 90) {
    loop.mode = "insert";
  }
  if (loop.mode === "insert" && t >= F14.INSERT) {
    const g = secoGeom(loop);
    const bound = perigeeAltKm(g) >= 175 && Math.abs(g.vRad) <= 0.02 && g.vHoriz >= g.vCirc * 1.002;
    if (bound || t >= F14.INSERT_END + 90) loop.mode = "idle";
  }
}

function advanceDeorbitWindow(loop: F14Loop): void {
  const t = loop.state.t;
  if (loop.mode === "idle" && t >= F14.DEORBIT && t < F14.DEORBIT + 90) {
    loop.mode = "deorbit";
  }
  if (loop.mode === "deorbit" && t >= F14.DEORBIT + 8) {
    const g = secoGeom(loop);
    if (perigeeAltKm(g) < 80 || t >= F14.DEORBIT + 90) loop.mode = "idle";
  }
}

/** Boost / hot-stage / SECO / insert / deorbit / land mode machine. */
export function advanceFlight14Mode(loop: F14Loop, alt: number): void {
  advanceBoostHot(loop);
  if (loop.mode === "upper") maybeSeco(loop, alt);
  advanceInsertWindow(loop);
  advanceDeorbitWindow(loop);
  maybeStartLand(loop, alt);
}

type SecoGeom = { r: number; vRad: number; vHoriz: number; vCirc: number };

function fillHorizFromRel(r: number, vRad: number): number {
  set(
    _horiz,
    _relV.x - (_relP.x / r) * vRad,
    _relV.y - (_relP.y / r) * vRad,
    _relV.z - (_relP.z / r) * vRad,
  );
  return len(_horiz);
}

function secoGeom(loop: F14Loop): SecoGeom {
  const bCut = getBodies(loop.state.t, loop.epoch);
  sub(_relV, loop.state.vel, bCut.earthVel);
  sub(_relP, loop.state.pos, bCut.earth);
  const r = len(_relP) || 1;
  const vRad = dot(_relV, _relP) / r;
  const vHoriz = fillHorizFromRel(r, vRad);
  const vCirc = Math.sqrt(MU_EARTH / Math.max(r, R_EARTH + 50));
  return { r, vRad, vHoriz, vCirc };
}

function secoShouldCut(loop: F14Loop, alt: number, g: SecoGeom): boolean {
  const t = loop.state.t;
  const vNeed = SECO_VCIRC_FRAC * g.vCirc;
  const energyOk =
    alt >= 175 &&
    g.vHoriz >= vNeed * 0.997 &&
    Math.abs(g.vRad) <= 0.08;
  const propLow = fuelShipFrac(loop.prop) <= SHIP_PROP_RESERVE;
  const clockCut = t >= F14.SECO + 8;
  return energyOk || propLow || clockCut;
}

function maybeSeco(loop: F14Loop, alt: number): void {
  if (secoShouldCut(loop, alt, secoGeom(loop))) loop.mode = "idle";
}

function landStartSpeed(loop: F14Loop): number {
  const bL = getBodies(loop.state.t, loop.epoch);
  sub(_relV, loop.state.vel, bL.earthVel);
  return len(_relV);
}

function shouldStartLand(t: number, alt: number, vRel: number): boolean {
  if (t >= F14.LAND_BURN && alt < 3.5) return true;
  if (alt < 0.9 && vRel < 0.28 && t >= F14.LAND_BURN - 40) return true;
  return false;
}

function maybeStartLand(loop: F14Loop, alt: number): void {
  const t = loop.state.t;
  if (loop.mode === "land" || loop.mode === "insert" || loop.mode === "deorbit") return;
  if (t < F14.ENTRY - 90) return;
  if (shouldStartLand(t, alt, landStartSpeed(loop))) loop.mode = "land";
}

/** HUD phase id from time / mode / altitude. */
export function flight14Phase(loop: F14Loop, alt: number): PhaseId {
  if (loop.splashed) return "splashdown";
  const t = loop.state.t;
  if (t < 12) return "launch";
  if (t < F14.SECO) return "ascent";
  if (loop.mode === "land") return "descent";
  if (loop.prop.staged && alt < ATM_H_MAX_KM && t >= F14.DEORBIT) {
    if (loop.mode === "land") return "descent";
    return "entry";
  }
  if (t >= F14.INSERT_END) return "lowEarthOrbit";
  return "coast";
}

/** Integrator step size. */
export function flight14Dt(loop: F14Loop, phase: PhaseId, alt: number, maxT: number): number {
  let dt = 1.0;
  if (loop.mode === "boost" || loop.mode === "hot_stage") {
    dt = 0.25;
  } else if (loop.mode === "upper") {
    dt = loop.state.t > 400 ? 0.1 : 0.25;
  } else if (loop.mode === "land" || loop.mode === "insert" || loop.mode === "deorbit") {
    dt = 0.15;
  } else if (phase === "entry" || alt < ATM_H_MAX_KM) {
    dt = alt < 80 ? 0.25 : 0.4;
  } else if (phase === "lowEarthOrbit" || phase === "coast") {
    dt = phase === "lowEarthOrbit" ? 0.8 : 4.0;
  }
  return Math.min(dt, maxT - loop.state.t);
}
