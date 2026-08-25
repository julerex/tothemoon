import * as THREE from "three";
import {
  plumeLook,
  plumeRegimeFor,
  plumeThrustLag,
  thrustFlicker,
  type PlumeLook,
  type PlumeRegimeId,
} from "../plumeRegime";
import { applyPlumeLayers } from "./plumes";
import type { CraftVisualState } from "./visualsTypes";

/** Reference thrust (N) for plume size normalization. */
const BOOSTER_THRUST_REF = 1.4e8;
export const SHIP_THRUST_REF = 8e6;
const HOT_STAGE_PRE_S = 4.0;
const HOT_STAGE_POST_S = 1.2;

/** Hot-stage pre/post fractions from stage epoch. */
export function hotStageFractions(
  missionT: number,
  stageT: number | null,
  staged: boolean,
): { hotPre: number; hotPost: number } {
  if (stageT == null || !Number.isFinite(stageT)) return { hotPre: 0, hotPost: 0 };
  return {
    hotPre: hotPreFraction(missionT, stageT, staged),
    hotPost: hotPostFraction(missionT, stageT, staged),
  };
}

function hotPreFraction(missionT: number, stageT: number, staged: boolean): number {
  if (staged || missionT < stageT - HOT_STAGE_PRE_S || missionT >= stageT) return 0;
  const hotPre = THREE.MathUtils.clamp(
    (missionT - (stageT - HOT_STAGE_PRE_S)) / HOT_STAGE_PRE_S,
    0,
    1,
  );
  return hotPre * hotPre;
}

function hotPostFraction(missionT: number, stageT: number, staged: boolean): number {
  if (!staged || missionT >= stageT + HOT_STAGE_POST_S) return 0;
  return 1 - THREE.MathUtils.clamp((missionT - stageT) / HOT_STAGE_POST_S, 0, 1);
}

function boostThrustTarget(
  state: CraftVisualState,
  showBoost: boolean,
  hotPre: number,
  hotPost: number,
): number {
  if (showBoost) {
    const mecoFade = hotPre > 0.7 ? 1 - ((hotPre - 0.7) / 0.3) * 0.4 : 1;
    return Math.min(1, state.thrustN / BOOSTER_THRUST_REF) * mecoFade;
  }
  if (hotPost > 0.05) return 0.25 * hotPost;
  return 0;
}

function shipThrustTarget(
  state: CraftVisualState,
  showShip: boolean,
  hotPre: number,
): number {
  if (!showShip) return 0;
  if (state.staged) {
    const engN =
      state.shipEngineCount != null && state.shipEngineCount > 0
        ? state.shipEngineCount
        : 3;
    return Math.min(1, state.thrustN / SHIP_THRUST_REF) * Math.max(0.25, engN / 3);
  }
  return 0.35 + 0.55 * hotPre;
}

function lagPlumeThrust(
  group: THREE.Group,
  missionT: number,
  uBoostTarget: number,
  uShipTarget: number,
): { uBoost: number; uShip: number } {
  const prevT = (group.userData.plumeLagT as number | undefined) ?? missionT;
  const prevBoost = (group.userData.plumeLagBoost as number | undefined) ?? uBoostTarget;
  const prevShip = (group.userData.plumeLagShip as number | undefined) ?? uShipTarget;
  const uBoost = plumeThrustLag(prevBoost, uBoostTarget, prevT, missionT);
  const uShip = plumeThrustLag(prevShip, uShipTarget, prevT, missionT);
  group.userData.plumeLagT = missionT;
  group.userData.plumeLagBoost = uBoost;
  group.userData.plumeLagShip = uShip;
  return { uBoost, uShip };
}

function applyStagePlume(
  plume: THREE.Object3D | undefined,
  u: number,
  look: PlumeLook,
  flicker: number,
  missionT: number,
  opts: { regime?: PlumeRegimeId; altEarthKm?: number } = {},
): void {
  if (!plume) return;
  if (u > 0.02) applyPlumeLayers(plume, u, look, flicker, missionT, opts);
  else {
    plume.visible = false;
    for (const c of plume.children) c.visible = false;
  }
}

function applyExhaustLight(
  light: THREE.PointLight | undefined,
  u: number,
  look: PlumeLook,
  flicker: number,
  baseI: number,
  gainI: number,
  baseD: number,
  gainD: number,
  z: number,
): void {
  if (!light) return;
  if (u <= 0.02) {
    light.intensity = 0;
    return;
  }
  light.intensity = (baseI + gainI * u) * look.lightI * flicker;
  light.color.setRGB(look.light[0]!, look.light[1]!, look.light[2]!);
  light.distance = (baseD + gainD * u) * look.lightDist;
  light.position.set(0, 0, z);
}

export function dimShipBells(group: THREE.Group, state: CraftVisualState): void {
  const shipBells = group.getObjectByName("ship-engines");
  if (!shipBells || !state.staged) return;
  const n =
    state.shipEngineCount != null && state.shipEngineCount > 0
      ? state.shipEngineCount
      : 3;
  for (let i = 0; i < Math.min(3, shipBells.children.length); i++) {
    setBellOpacity(shipBells.children[i]!, !state.burning || i < n);
  }
}

function setBellOpacity(child: THREE.Object3D, active: boolean): void {
  child.visible = true;
  child.traverse((obj) => {
    if (obj instanceof THREE.Mesh) dimMeshMaterials(obj, active ? 1 : 0.22);
  });
}

function dimMeshMaterials(obj: THREE.Mesh, opacity: number): void {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  for (const m of mats) {
    if (m && "opacity" in m) {
      const mat = m as THREE.Material & { opacity: number };
      mat.transparent = true;
      mat.opacity = opacity;
    }
  }
}

export function craftShowFlags(state: CraftVisualState, hotPre: number): {
  showBoost: boolean;
  showShip: boolean;
} {
  return {
    showBoost: state.burning && !state.staged,
    showShip: (state.burning && state.staged) || (state.burning && hotPre > 0.02),
  };
}

export function driveCraftPlumes(
  group: THREE.Group,
  state: CraftVisualState,
  missionT: number,
  hotPre: number,
  hotPost: number,
  showBoost: boolean,
  showShip: boolean,
): void {
  const flicker = thrustFlicker(missionT);
  const uBoostTarget = boostThrustTarget(state, showBoost, hotPre, hotPost);
  const uShipTarget = shipThrustTarget(state, showShip, hotPre);
  const { uBoost, uShip } = lagPlumeThrust(group, missionT, uBoostTarget, uShipTarget);
  applyCraftPlumePair(group, state, missionT, hotPre, uBoost, uShip, flicker);
}

function boosterRegime(state: CraftVisualState): PlumeRegimeId {
  return plumeRegimeFor(state.phase, "booster", {
    staged: state.staged,
    altEarthKm: state.altEarth,
  });
}

function shipRegime(state: CraftVisualState, hotPre: number): PlumeRegimeId {
  return plumeRegimeFor(state.phase, "ship", {
    hotPre,
    staged: state.staged,
    altEarthKm: state.altEarth,
  });
}

function applyCraftPlumePair(
  group: THREE.Group,
  state: CraftVisualState,
  missionT: number,
  hotPre: number,
  uBoost: number,
  uShip: number,
  flicker: number,
): void {
  const boostReg = boosterRegime(state);
  const shipReg = shipRegime(state, hotPre);
  const boostLook = plumeLook(boostReg, "booster");
  const shipLook = plumeLook(shipReg, "ship");
  const streamOpts = { altEarthKm: state.altEarth };
  applyStagePlume(
    group.getObjectByName("plume-booster"), uBoost, boostLook, flicker, missionT,
    { regime: boostReg, ...streamOpts },
  );
  applyStagePlume(
    group.getObjectByName("plume-ship"), uShip, shipLook, flicker, missionT,
    { regime: shipReg, ...streamOpts },
  );
  applyCraftLights(group, uBoost, uShip, boostLook, shipLook, flicker);
}

function applyCraftLights(
  group: THREE.Group,
  uBoost: number,
  uShip: number,
  boostLook: PlumeLook,
  shipLook: PlumeLook,
  flicker: number,
): void {
  applyExhaustLight(
    group.getObjectByName("exhaust-light") as THREE.PointLight | undefined,
    uBoost, boostLook, flicker, 1.6, 2.2, 0.16, 0.2, -0.05,
  );
  applyExhaustLight(
    group.getObjectByName("ship-exhaust-light") as THREE.PointLight | undefined,
    uShip, shipLook, flicker, 0.55, 1.35, 0.1, 0.14, -0.04,
  );
}
