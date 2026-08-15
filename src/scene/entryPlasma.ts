/**
 * Entry-plasma sprite poses (pure).
 *
 * No THREE: {@link deriveEntryPlasma} turns mission state into per-layer
 * opacity / scale / offset numbers that `entryFx.ts` writes onto sprites.
 * Scrub-deterministic — every term comes from mission time, phase, altitude,
 * speed, and bank.
 */

import {
  entryPlasmaStrength,
  plasmaBankOffset,
  type PlasmaBankOffset,
} from "../physics/flight13Attitude";
import type { PhaseId } from "../physics/missionTypes";

/** Below this strength the plasma envelope is fully hidden. */
export const PLASMA_VISIBLE_MIN = 0.02;

/** Additive plasma layers, innermost first. */
export type PlasmaLayer = "core" | "sheath" | "trail";

/** Pose for one plasma sprite. `scale` / `offsetX` are unset when hidden. */
export type PlasmaLayerPose = Readonly<{
  visible: boolean;
  opacity: number;
  /** Uniform sprite scale (mesh units). */
  scale: number;
  /** Craft-local X offset (mesh units) from the bank skew. */
  offsetX: number;
}>;

export type EntryPlasmaFx = Readonly<{
  /** Envelope gate: false hides every layer. */
  visible: boolean;
  /** Plasma strength in [0, 1] driving the whole envelope. */
  strength: number;
  core: PlasmaLayerPose;
  sheath: PlasmaLayerPose;
  trail: PlasmaLayerPose;
}>;

/**
 * Per-layer look. `offsetX` / `opacityMul` select from the bank skew so the
 * layers stay a table rather than three near-identical call sites.
 */
type PlasmaLayerSpec = Readonly<{
  baseOpacity: number;
  baseScale: number;
  offsetX: (off: PlasmaBankOffset) => number;
  opacityMul: (off: PlasmaBankOffset) => number;
}>;

const PLASMA_LAYERS: Readonly<Record<PlasmaLayer, PlasmaLayerSpec>> = {
  core: {
    baseOpacity: 0.85,
    baseScale: 0.5,
    offsetX: (off) => off.sheathX * 0.35,
    opacityMul: () => 1,
  },
  sheath: {
    baseOpacity: 0.45,
    baseScale: 1.0,
    offsetX: (off) => off.sheathX,
    opacityMul: (off) => off.sheathOpMul,
  },
  trail: {
    baseOpacity: 0.3,
    baseScale: 1.5,
    offsetX: (off) => off.trailX,
    opacityMul: (off) => off.trailOpMul,
  },
};

/** Build-time sprite sizes (the envelope is scaled from these on update). */
export const PLASMA_SPRITE_BUILD = Object.freeze({
  core: Object.freeze({ color: 0xffcc88, size: 0.55 }),
  sheath: Object.freeze({ color: 0xff6622, size: 1.1 }),
  trail: Object.freeze({ color: 0xff4400, size: 1.6 }),
});

/** Craft-local rest positions: belly is +Y, nose +Z (mesh units). */
export const PLASMA_SPRITE_REST = Object.freeze({
  core: Object.freeze({ y: 0.12, z: 0.55 }),
  sheath: Object.freeze({ y: 0.18, z: 0.4 }),
  trail: Object.freeze({ y: 0.08, z: -0.2 }),
});

/** High-frequency shimmer in ~[0.7, 1.0]; deterministic in mission time. */
export function plasmaFlicker(missionT: number): number {
  return 0.85 + 0.1 * Math.sin(missionT * 41.3) + 0.05 * Math.sin(missionT * 73.7 + 1.1);
}

const HIDDEN_POSE: PlasmaLayerPose = Object.freeze({
  visible: false,
  opacity: 0,
  scale: 0,
  offsetX: 0,
});

const HIDDEN_FX: EntryPlasmaFx = Object.freeze({
  visible: false,
  strength: 0,
  core: HIDDEN_POSE,
  sheath: HIDDEN_POSE,
  trail: HIDDEN_POSE,
});

function layerPose(
  spec: PlasmaLayerSpec,
  strength: number,
  flicker: number,
  off: PlasmaBankOffset,
): PlasmaLayerPose {
  return Object.freeze({
    visible: true,
    opacity: spec.baseOpacity * strength * flicker * spec.opacityMul(off),
    scale: spec.baseScale * (0.75 + 0.5 * strength) * (0.95 + 0.08 * flicker),
    offsetX: spec.offsetX(off),
  });
}

/**
 * Plasma envelope poses from mission state.
 *
 * @param missionT Mission time (s)
 * @param altKm Earth altitude (km)
 * @param speedKmS Surface- or inertial-relative speed (theater)
 * @param bank Signed visual bank in [−1, 1] (starboard positive)
 */
export function deriveEntryPlasma(
  missionT: number,
  phase: PhaseId,
  altKm: number,
  speedKmS: number,
  bank = 0,
): EntryPlasmaFx {
  const strength = entryPlasmaStrength(missionT, phase, altKm, speedKmS);
  if (strength <= PLASMA_VISIBLE_MIN) return HIDDEN_FX;
  const flicker = plasmaFlicker(missionT);
  const off = plasmaBankOffset(bank);
  return Object.freeze({
    visible: true,
    strength,
    core: layerPose(PLASMA_LAYERS.core, strength, flicker, off),
    sheath: layerPose(PLASMA_LAYERS.sheath, strength, flicker, off),
    trail: layerPose(PLASMA_LAYERS.trail, strength, flicker, off),
  });
}
