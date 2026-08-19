/**
 * Velocity (v) and acceleration (a) arrows for craft, Earth, and Moon.
 * Visibility follows the O-key orbit overlays; number labels appear only
 * while the pointer hovers an arrow. Shaft length tracks camera zoom.
 *
 * Implementation lives in {@link ./vectorArrowCore} and {@link ./vectorArrowLabels}.
 */
export type {
  VectorArrowBodies,
  VectorArrowCraft,
  VectorArrows,
} from "./vectorArrowCore";
export { VECTOR_ARROWS_ENABLED, createVectorArrows } from "./vectorArrowCore";
