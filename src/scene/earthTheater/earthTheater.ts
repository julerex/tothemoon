/**
 * Starbase pad (Earth-fixed mesh-local) + helpers for ascent ground-track.
 *
 * Facade over `earthTheater/*` builders. Named nodes and userData contracts
 * are documented on {@link createStarbasePad}.
 *
 * @see padLaunchFx.derivePadFx
 */
import * as THREE from "three";
import { placePadOnEarth, populateStarbasePad } from "./padLaunchMeshes";

export type { LaunchPadFxState } from "../padLaunchFx";
export { updateStarbaseLaunchFx, pulsePadBeacon } from "./padLaunchFxApply";
export { updateMechazillaRecovery } from "./mechazillaTower";
export { createAscentGroundTrack } from "./ascentGroundTrack";

/** @returns Root group named `starbase-pad`, already oriented on the globe */
export function createStarbasePad(): THREE.Group {
  const pad = new THREE.Group();
  pad.name = "starbase-pad";
  placePadOnEarth(pad);
  populateStarbasePad(pad);
  return pad;
}
