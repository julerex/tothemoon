/**
 * Procedural canvas textures — no external assets required.
 * Facade re-exporting body-specific texture builders.
 */

export {
  makeEarthTexture,
  makeEarthRoughnessMap,
} from "./earthTexture";
export {
  makeMoonTexture,
  makeMoonRoughnessMap,
} from "./moonTexture";
export {
  makeSunGlowTexture,
  makeStarTexture,
} from "./skyTextures";
