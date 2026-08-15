/**
 * Atmospheric entry plasma / heat-glow theater FX.
 *
 * Scrub-deterministic: every scalar comes from the pure
 * {@link deriveEntryPlasma} in `entryPlasma.ts`. This module only builds the
 * additive sprites (which ride the craft transform) and writes poses onto them.
 */

import * as THREE from "three";
import type { PhaseId } from "../physics/missionTypes";
import {
  deriveEntryPlasma,
  PLASMA_SPRITE_BUILD,
  PLASMA_SPRITE_REST,
  type PlasmaLayerPose,
} from "./entryPlasma";

const PLASMA_STOPS: [number, string][] = [
  [0, "rgba(255,255,255,1)"],
  [0.25, "rgba(255,200,120,0.9)"],
  [0.55, "rgba(255,80,30,0.45)"],
  [1, "rgba(40,0,0,0)"],
];

function fillPlasmaGradient(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  for (const [t, c] of PLASMA_STOPS) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
}

function paintPlasmaCanvas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  fillPlasmaGradient(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePlasmaMat(color: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: paintPlasmaCanvas(), color, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

function makePlasmaSprite(
  build: { color: number; size: number },
  rest: { y: number; z: number },
): THREE.Sprite {
  const sprite = new THREE.Sprite(makePlasmaMat(build.color));
  sprite.scale.setScalar(build.size);
  sprite.position.set(0, rest.y, rest.z);
  sprite.visible = false;
  return sprite;
}

/** Write one derived pose onto a sprite; no allocation. */
function applyPlasmaPose(s: THREE.Sprite, pose: PlasmaLayerPose): void {
  s.visible = pose.visible;
  (s.material as THREE.SpriteMaterial).opacity = pose.opacity;
  if (!pose.visible) return;
  s.scale.setScalar(pose.scale);
  s.position.x = pose.offsetX;
}

/**
 * Plasma envelope attached under the ship (windward / belly side).
 * Parent {@link EntryFx.group} to the craft group so it follows attitude.
 */
export type EntryFx = Readonly<{
  group: THREE.Group;
  /**
   * Update plasma opacity / scale from mission state.
   * @param speedKmS surface- or inertial-relative speed (theater)
   * @param bank signed visual bank in [−1, 1] (starboard positive)
   */
  update: (
    missionT: number,
    phase: PhaseId,
    altKm: number,
    speedKmS: number,
    bank?: number,
  ) => void;
}>;

export function createEntryFx(): EntryFx {
  const group = new THREE.Group();
  group.name = "entry-plasma";
  const core = makePlasmaSprite(PLASMA_SPRITE_BUILD.core, PLASMA_SPRITE_REST.core);
  const sheath = makePlasmaSprite(PLASMA_SPRITE_BUILD.sheath, PLASMA_SPRITE_REST.sheath);
  const trail = makePlasmaSprite(PLASMA_SPRITE_BUILD.trail, PLASMA_SPRITE_REST.trail);
  group.add(core, sheath, trail);

  return Object.freeze({
    group,
    update(missionT, phase, altKm, speedKmS, bank = 0) {
      const fx = deriveEntryPlasma(missionT, phase, altKm, speedKmS, bank);
      group.visible = fx.visible;
      applyPlasmaPose(core, fx.core);
      applyPlasmaPose(sheath, fx.sheath);
      applyPlasmaPose(trail, fx.trail);
    },
  });
}
