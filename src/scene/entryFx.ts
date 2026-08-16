/**
 * Atmospheric entry plasma / heat-glow theater FX.
 *
 * Scrub-deterministic: every scalar comes from the pure
 * {@link deriveEntryPlasma} in `entryPlasma.ts`. This module only builds the
 * additive sprites (which ride the craft transform) and writes poses onto them.
 *
 * V15: magenta / violet belly envelope + flap leading-edge sprites parented
 * to fwd-flap / aft-elevon pivots so they ride V7 hinge throw.
 */

import * as THREE from "three";
import type { PhaseId } from "../physics/missionTypes";
import {
  deriveEntryPlasma,
  FLAP_EDGE_PIVOTS,
  FLAP_EDGE_REST,
  PLASMA_SPRITE_BUILD,
  PLASMA_SPRITE_REST,
  type FlapEdgePose,
  type PlasmaLayerPose,
} from "./entryPlasma";

/** White → pale magenta → violet → transparent dark magenta (not orange). */
const PLASMA_STOPS: [number, string][] = [
  [0, "rgba(255,255,255,1)"],
  [0.22, "rgba(255,210,255,0.92)"],
  [0.55, "rgba(170,80,255,0.5)"],
  [1, "rgba(60,0,80,0)"],
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

/** Write one derived pose onto a belly sprite; no allocation. */
function applyPlasmaPose(s: THREE.Sprite, pose: PlasmaLayerPose): void {
  s.visible = pose.visible;
  (s.material as THREE.SpriteMaterial).opacity = pose.opacity;
  if (!pose.visible) return;
  s.scale.setScalar(pose.scale);
  s.position.x = pose.offsetX;
}

function applyFlapEdgePose(s: THREE.Sprite, pose: FlapEdgePose, baseSize: number): void {
  s.visible = pose.visible;
  (s.material as THREE.SpriteMaterial).opacity = pose.opacity;
  if (!pose.visible) return;
  s.scale.setScalar(baseSize * pose.scale);
}

function attachFlapEdgeSprites(craft: THREE.Object3D | undefined): THREE.Sprite[] {
  if (!craft) return [];
  const build = PLASMA_SPRITE_BUILD.flapEdge;
  const out: THREE.Sprite[] = [];
  for (const pivot of FLAP_EDGE_PIVOTS) {
    const host = craft.getObjectByName(pivot.name);
    if (!host) continue;
    const rest = FLAP_EDGE_REST[pivot.kind];
    const sprite = new THREE.Sprite(makePlasmaMat(build.color));
    sprite.name = `plasma-edge-${pivot.name}`;
    sprite.scale.setScalar(build.size);
    sprite.position.set(rest.x, rest.y, rest.z);
    sprite.visible = false;
    host.add(sprite);
    out.push(sprite);
  }
  return out;
}

/**
 * Plasma envelope attached under the ship (windward / belly side).
 * Parent {@link EntryFx.group} to the craft group so it follows attitude.
 * Pass `craft` so flap-edge sprites can parent to hinge pivots.
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

export function createEntryFx(craft?: THREE.Object3D): EntryFx {
  const group = new THREE.Group();
  group.name = "entry-plasma";
  const core = makePlasmaSprite(PLASMA_SPRITE_BUILD.core, PLASMA_SPRITE_REST.core);
  const sheath = makePlasmaSprite(PLASMA_SPRITE_BUILD.sheath, PLASMA_SPRITE_REST.sheath);
  const trail = makePlasmaSprite(PLASMA_SPRITE_BUILD.trail, PLASMA_SPRITE_REST.trail);
  group.add(core, sheath, trail);
  const flapEdges = attachFlapEdgeSprites(craft);
  const flapBase = PLASMA_SPRITE_BUILD.flapEdge.size;

  return Object.freeze({
    group,
    update(missionT, phase, altKm, speedKmS, bank = 0) {
      const fx = deriveEntryPlasma(missionT, phase, altKm, speedKmS, bank);
      group.visible = fx.visible;
      applyPlasmaPose(core, fx.core);
      applyPlasmaPose(sheath, fx.sheath);
      applyPlasmaPose(trail, fx.trail);
      for (const s of flapEdges) applyFlapEdgePose(s, fx.flapEdge, flapBase);
    },
  });
}
