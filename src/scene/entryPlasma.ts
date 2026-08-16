/**
 * Entry-plasma sprite poses (pure).
 *
 * No THREE: {@link deriveEntryPlasma} turns mission state into per-layer
 * opacity / scale / offset numbers that `entryFx.ts` writes onto sprites.
 * Scrub-deterministic — every term comes from mission time, phase, altitude,
 * speed, and bank.
 *
 * V15: magenta / violet palette + flap leading-edge wrap (Flight 13 stills
 * T+47:25 / T+48:53). Relight (T+39:03) stays off — gated by
 * {@link entryPlasmaStrength}.
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

/** Shared pose for all four flap leading-edge sprites. */
export type FlapEdgePose = Readonly<{
  visible: boolean;
  opacity: number;
  /** Uniform sprite scale (mesh units). */
  scale: number;
}>;

export type EntryPlasmaFx = Readonly<{
  /** Envelope gate: false hides every layer. */
  visible: boolean;
  /** Plasma strength in [0, 1] driving the whole envelope. */
  strength: number;
  core: PlasmaLayerPose;
  sheath: PlasmaLayerPose;
  trail: PlasmaLayerPose;
  /** Leading-edge wrap on fwd flaps + aft elevons. */
  flapEdge: FlapEdgePose;
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

/**
 * Build-time sprite sizes / tint (envelope scaled on update).
 * Hot core near-white, sheath violet, trail deep magenta — not orange.
 */
export const PLASMA_SPRITE_BUILD = Object.freeze({
  core: Object.freeze({ color: 0xfff0ff, size: 0.55 }),
  sheath: Object.freeze({ color: 0xbb66ff, size: 1.1 }),
  trail: Object.freeze({ color: 0x9900aa, size: 1.6 }),
  /** Flap leading-edge wrap (magenta-violet). */
  flapEdge: Object.freeze({ color: 0xdd88ff, size: 0.28 }),
});

/** Craft-local rest positions: belly is +Y, nose +Z (mesh units). */
export const PLASMA_SPRITE_REST = Object.freeze({
  core: Object.freeze({ y: 0.12, z: 0.55 }),
  sheath: Object.freeze({ y: 0.18, z: 0.4 }),
  trail: Object.freeze({ y: 0.08, z: -0.2 }),
});

/**
 * Flap-local rest for leading-edge plasma (parented to hinge pivots).
 * Mid-span, windward (+Y tile face), slightly nose-ward (+Z chord).
 * Mesh units match craft.ts `U = 1/40`.
 */
export const FLAP_EDGE_REST = Object.freeze({
  fwd: Object.freeze({ x: 0.044, y: 0.004, z: 0.04 }),
  aft: Object.freeze({ x: 0.05, y: 0.005, z: 0.05 }),
});

/** Named hinges that receive a leading-edge plasma sprite. */
export const FLAP_EDGE_PIVOTS = [
  { name: "fwd-flap-L", kind: "fwd" as const },
  { name: "fwd-flap-R", kind: "fwd" as const },
  { name: "aft-elevon-L", kind: "aft" as const },
  { name: "aft-elevon-R", kind: "aft" as const },
] as const;

/** High-frequency shimmer in ~[0.7, 1.0]; deterministic in mission time. */
export function plasmaFlicker(missionT: number): number {
  return 0.85 + 0.1 * Math.sin(missionT * 41.3) + 0.05 * Math.sin(missionT * 73.7 + 1.1);
}

export type Rgb01 = Readonly<{ r: number; g: number; b: number }>;

export type EntryHeatEmissive = Readonly<{
  tile: Rgb01;
  tileWear: Rgb01;
  tileIntensity: number;
  wearIntensity: number;
}>;

/**
 * Windward tile / wear emissive from plasma + residual grout.
 * Hot plasma → violet fill (`B > G`); residual grout into descent stays warm.
 */
export function entryHeatEmissiveRgb(
  plasma: number,
  groutU: number,
): EntryHeatEmissive {
  const p = Number.isFinite(plasma) ? Math.max(0, Math.min(1, plasma)) : 0;
  const u = Number.isFinite(groutU) ? Math.max(0, Math.min(1, groutU)) : 0;
  // Warm residual (landing-approach stills) + violet plasma fill.
  return Object.freeze({
    tile: Object.freeze({
      r: 0.72 * u + 0.42 * p,
      g: 0.22 * u + 0.08 * p,
      b: 0.07 * u + 0.58 * p,
    }),
    tileWear: Object.freeze({
      r: 0.7 * u + 0.35 * p,
      g: 0.16 * u + 0.06 * p,
      b: 0.03 * u + 0.48 * p,
    }),
    tileIntensity: 0.4 + 1.55 * p,
    wearIntensity: 0.25 + 1.05 * p,
  });
}

const HIDDEN_POSE: PlasmaLayerPose = Object.freeze({
  visible: false,
  opacity: 0,
  scale: 0,
  offsetX: 0,
});

const HIDDEN_FLAP: FlapEdgePose = Object.freeze({
  visible: false,
  opacity: 0,
  scale: 0,
});

const HIDDEN_FX: EntryPlasmaFx = Object.freeze({
  visible: false,
  strength: 0,
  core: HIDDEN_POSE,
  sheath: HIDDEN_POSE,
  trail: HIDDEN_POSE,
  flapEdge: HIDDEN_FLAP,
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

function flapEdgePose(strength: number, flicker: number): FlapEdgePose {
  return Object.freeze({
    visible: true,
    opacity: 0.7 * strength * flicker,
    scale: 0.85 + 0.55 * strength,
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
    flapEdge: flapEdgePose(strength, flicker),
  });
}
