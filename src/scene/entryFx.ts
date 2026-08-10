/**
 * Atmospheric entry plasma / heat-glow theater FX.
 *
 * Scrub-deterministic: strength from mission time + altitude + speed via
 * {@link entryPlasmaStrength}. Additive sprites ride the craft transform.
 */

import * as THREE from "three";
import { entryPlasmaStrength } from "../physics/flight13Attitude";
import type { PhaseId } from "../physics/missionTypes";

function makePlasmaSprite(color: number, size: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,200,120,0.9)");
  g.addColorStop(0.55, "rgba(255,80,30,0.45)");
  g.addColorStop(1, "rgba(40,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(size);
  sprite.visible = false;
  return sprite;
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
    // Mesh units (craft local): belly is +Y, nose +Z
    this.core = makePlasmaSprite(0xffcc88, 0.55);
    this.core.position.set(0, 0.12, 0.55);
    this.sheath = makePlasmaSprite(0xff6622, 1.1);
    this.sheath.position.set(0, 0.18, 0.4);
    this.trail = makePlasmaSprite(0xff4400, 1.6);
    this.trail.position.set(0, 0.08, -0.2);
    this.group.add(this.core, this.sheath, this.trail);
  }

  /**
   * Update plasma opacity/scale from mission state.
   * @param speedKmS surface- or inertial-relative speed (theater)
   */
  update(
    missionT: number,
    phase: PhaseId,
    altKm: number,
    speedKmS: number,
  ): void {
    const str = entryPlasmaStrength(missionT, phase, altKm, speedKmS);
    const on = str > 0.02;
    this.group.visible = on;
    if (!on) {
      for (const s of [this.core, this.sheath, this.trail]) {
        s.visible = false;
        (s.material as THREE.SpriteMaterial).opacity = 0;
      }
      return;
    }

    // Flicker (scrub-stable)
    const flick =
      0.85 +
      0.1 * Math.sin(missionT * 41.3) +
      0.05 * Math.sin(missionT * 73.7 + 1.1);

    const setSprite = (s: THREE.Sprite, baseOp: number, baseScale: number) => {
      s.visible = true;
      const mat = s.material as THREE.SpriteMaterial;
      mat.opacity = baseOp * str * flick;
      const sc = baseScale * (0.75 + 0.5 * str) * (0.95 + 0.08 * flick);
      s.scale.setScalar(sc);
    };

    setSprite(this.core, 0.85, 0.5);
    setSprite(this.sheath, 0.45, 1.0);
    setSprite(this.trail, 0.3, 1.5);
  }
}
