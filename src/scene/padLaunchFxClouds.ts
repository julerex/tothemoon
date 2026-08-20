/**
 * Prelaunch cryo-cloud poses — low-poly mesh banks, not vent sprites.
 *
 * Scene unit = 1 km. Scrub-safe (mission `t` only).
 */

import { clamp01 } from "./padLaunchFxMath";
import type { VentCloudSpec } from "./padLaunchFxSpecs";

/** Hide the bank below this vent envelope. */
export const VENT_CLOUD_VISIBLE_EPS = 0.04;

/**
 * Shared material opacity for the cryo bank.
 * Hold steam is dense white (T−42 still), not a translucent fog wall.
 */
export function ventCloudOpacity(ventStr: number, night: number): number {
  if (!(ventStr > VENT_CLOUD_VISIBLE_EPS)) return 0;
  return clamp01((0.84 + 0.08 * night) * ventStr);
}

export type VentCloudPose = Readonly<{
  x: number;
  y: number;
  z: number;
  scale: number;
}>;

/**
 * Rest pose plus a few metres of breath — does not loft tens of metres
 * the way {@link ventSpritePose} used to.
 */
export function ventCloudPose(
  spec: Pick<VentCloudSpec, "x" | "y" | "z" | "scale" | "phase">,
  ventStr: number,
  animT: number,
): VentCloudPose {
  const v = clamp01(ventStr);
  const breathe = 0.94 + 0.06 * Math.sin(animT * 0.85 + spec.phase);
  return {
    x: spec.x + 0.0025 * Math.sin(animT * 0.32 + spec.phase),
    y: spec.y + 0.0028 * Math.sin(animT * 0.9 + spec.phase * 1.15),
    z: spec.z + 0.002 * Math.cos(animT * 0.28 + spec.phase),
    scale: spec.scale * (0.9 + 0.12 * v) * breathe,
  };
}
