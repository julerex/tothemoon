import type * as THREE from "three";
import { BOOST_H } from "./dimensions";
import {
  craftShowFlags,
  dimShipBells,
  driveCraftPlumes,
  hotStageFractions,
  SHIP_THRUST_REF,
} from "./visualsPlumes";
import {
  updateCondensation,
  updateControlSurfaces,
  updateEntryHeat,
  updateFrostAndIce,
  updateHullWet,
} from "./visualsFx";
import type { CraftVisualState } from "./visualsTypes";

export type { CraftVisualState } from "./visualsTypes";

function setStackLayout(group: THREE.Group, staged: boolean): void {
  const booster = group.getObjectByName("booster");
  if (booster) booster.visible = !staged;
  const ship = group.getObjectByName("ship");
  if (ship) {
    const stackedZ = (ship.userData.stackedZ as number | undefined) ?? BOOST_H;
    const stagedZ = (ship.userData.stagedZ as number | undefined) ?? 0;
    ship.position.z = staged ? stagedZ : stackedZ;
  }
}

export function updateCraftVisuals(
  group: THREE.Group,
  state: CraftVisualState,
): void {
  setStackLayout(group, state.staged);
  const missionT = state.missionT ?? 0;
  const { hotPre, hotPost } = hotStageFractions(missionT, state.stageT ?? null, state.staged);
  const { showBoost, showShip } = craftShowFlags(state, hotPre);
  driveCraftPlumes(group, state, missionT, hotPre, hotPost, showBoost, showShip);
  dimShipBells(group, state);
  updateCondensation(group.getObjectByName("condense-cloud"), state.phase, missionT, state.burning);
  updateFrostAndIce(group, state, missionT);
  updateEntryHeat(group, state.plasmaStrength ?? 0, state.phase);
  updateHullWet(group, state.phase, state.altEarth);
  updateControlSurfaces(group, state);
}

/** @deprecated Prefer updateCraftVisuals */
export function setPlumeVisible(group: THREE.Group, visible: boolean): void {
  updateCraftVisuals(group, {
    staged: true,
    burning: visible,
    thrustN: visible ? SHIP_THRUST_REF : 0,
  });
}
