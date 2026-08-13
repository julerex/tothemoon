/**
 * Atmospheric entry plasma / heat-glow theater FX.
 *
 * Scrub-deterministic: strength from mission time + altitude + speed via
 * {@link entryPlasmaStrength}. Additive sprites ride the craft transform.
 */

import * as THREE from "three";
import { entryPlasmaStrength, plasmaBankOffset } from "../physics/flight13Attitude";
import type { PhaseId } from "../physics/missionTypes";

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

function makePlasmaSprite(color: number, size: number): THREE.Sprite {
  const sprite = new THREE.Sprite(makePlasmaMat(color));
  sprite.scale.setScalar(size);
  sprite.visible = false;
  return sprite;
}

function hidePlasmaSprites(sprites: THREE.Sprite[]): void {
  for (const s of sprites) {
    s.visible = false;
    (s.material as THREE.SpriteMaterial).opacity = 0;
  }
}

function setPlasmaSprite(
  s: THREE.Sprite,
  baseOp: number,
  baseScale: number,
  str: number,
  flick: number,
  opMul = 1,
): void {
  s.visible = true;
  (s.material as THREE.SpriteMaterial).opacity = baseOp * str * flick * opMul;
  s.scale.setScalar(baseScale * (0.75 + 0.5 * str) * (0.95 + 0.08 * flick));
}

function plasmaFlicker(missionT: number): number {
  return 0.85 + 0.1 * Math.sin(missionT * 41.3) + 0.05 * Math.sin(missionT * 73.7 + 1.1);
}

function placeEntrySprites(core: THREE.Sprite, sheath: THREE.Sprite, trail: THREE.Sprite): void {
  // Mesh units (craft local): belly is +Y, nose +Z
  core.position.set(0, 0.12, 0.55);
  sheath.position.set(0, 0.18, 0.4);
  trail.position.set(0, 0.08, -0.2);
}

/**
 * Plasma envelope attached under the ship (windward / belly side).
 * Parent to the craft group so it follows position + attitude.
 */
export class EntryFx {
  readonly group = new THREE.Group();
  private readonly core: THREE.Sprite;
  private readonly sheath: THREE.Sprite;
  private readonly trail: THREE.Sprite;

  constructor() {
    this.group.name = "entry-plasma";
    this.core = makePlasmaSprite(0xffcc88, 0.55);
    this.sheath = makePlasmaSprite(0xff6622, 1.1);
    this.trail = makePlasmaSprite(0xff4400, 1.6);
    placeEntrySprites(this.core, this.sheath, this.trail);
    this.group.add(this.core, this.sheath, this.trail);
  }

  /**
   * Update plasma opacity/scale from mission state.
   * @param speedKmS surface- or inertial-relative speed (theater)
   * @param bank signed visual bank in [−1, 1] (starboard positive)
   */
  update(
    missionT: number,
    phase: PhaseId,
    altKm: number,
    speedKmS: number,
    bank = 0,
  ): void {
    const str = entryPlasmaStrength(missionT, phase, altKm, speedKmS);
    this.group.visible = str > 0.02;
    if (str <= 0.02) { hidePlasmaSprites([this.core, this.sheath, this.trail]); return; }
    const flick = plasmaFlicker(missionT);
    const off = plasmaBankOffset(bank);
    this.sheath.position.x = off.sheathX;
    this.trail.position.x = off.trailX;
    this.core.position.x = off.sheathX * 0.35;
    setPlasmaSprite(this.core, 0.85, 0.5, str, flick);
    setPlasmaSprite(this.sheath, 0.45, 1.0, str, flick, off.sheathOpMul);
    setPlasmaSprite(this.trail, 0.3, 1.5, str, flick, off.trailOpMul);
  }
}
