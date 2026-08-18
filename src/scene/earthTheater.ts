/** Re-export facade — implementation lives in `earthTheater/`. */
export type { LaunchPadFxState } from "./earthTheater/earthTheater";
export {
  createStarbasePad,
  createAscentGroundTrack,
  pulsePadBeacon,
  updateMechazillaRecovery,
  updateStarbaseLaunchFx,
} from "./earthTheater/earthTheater";
