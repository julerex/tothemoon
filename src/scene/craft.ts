/**
 * Near-true-scale Super Heavy + Starship stack (facade).
 * Implementation lives under `craft/`; scene unit = 1 km.
 */
export {
  CRAFT_MESH_SCALE,
  SHIP_WELD_RING_FRACTIONS,
  BOOSTER_WELD_RING_COUNT,
  GRID_FIN_LATTICE_N,
  SHIP_OGIVE_H_M,
  SHIP_OGIVE_BASE_FRAC,
  FWD_FLAP_CHORD_M,
  FWD_FLAP_SPAN_M,
  AFT_FLAP_CHORD_M,
  AFT_FLAP_SPAN_M,
  FLAP_THICKNESS_M,
  FWD_FLAP_INCLUDED_DEG,
  shipOgiveRadiusM,
  FIN_CAM_LOCAL,
  FIN_CAM_LOOK_LOCAL,
  craftLengthKm,
  boosterLengthKm,
  CRAFT_CAM_MOUNT_NAMES,
} from "./craft/dimensions";

export {
  createLocatorSprite,
  LOCATOR_HIDE_ABOVE_PX,
  locatorShouldShow,
  updateLocatorVisibility,
} from "./craft/locator";

export { applyPlumeLayers } from "./craft/plumes";

export { createCraft } from "./craft/mesh";

export {
  type CraftVisualState,
  updateCraftVisuals,
  setPlumeVisible,
} from "./craft/visuals";

