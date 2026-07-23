import * as THREE from "three";
import { MU_EARTH, R_EARTH } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";

/** Mission seconds the free-flying booster remains visible. */
const FALLAWAY_S = 90;
/** Separation kick magnitude (km/s) aft along −velocity. */
const SEP_DV = 0.04;
/** Extra radial kick outward from Earth (km/s) for readable fallaway. */
const SEP_RADIAL = 0.015;
/** Staging flash lifetime (mission s). */
const FLASH_S = 3.5;

export type StageEvent = {
  t: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
};

/**
 * Detached Super Heavy after stage-out: short ballistic coast + separation flash.
 * Fully deterministic in mission time so scrubbing works.
 */
export class StagingFx {
  readonly group = new THREE.Group();
  private readonly booster: THREE.Group;
  private readonly flash: THREE.Mesh;
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly sepPos = new THREE.Vector3();
  private readonly sepVel = new THREE.Vector3();
  private readonly earthPos = new THREE.Vector3();
  private readonly rel = new THREE.Vector3();
  private readonly acc = new THREE.Vector3();
  private readonly look = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private stage: StageEvent | null = null;

  constructor(boosterPrototype: THREE.Object3D, meshScale = 0.04) {
    this.booster = boosterPrototype.clone(true) as THREE.Group;
    this.booster.name = "booster-detached";
    this.booster.visible = false;
    // Stacked booster sits under craft mesh scale; apply the same here
    this.booster.scale.setScalar(meshScale);
    this.booster.userData.baseScale = meshScale;
    // Kill plumes / exhaust glow on the free flyer
    for (const name of ["plume-booster", "exhaust-glow"]) {
      const obj = this.booster.getObjectByName(name);
      if (obj) obj.visible = false;
    }
    this.group.add(this.booster);

    this.flashMat = new THREE.MeshBasicMaterial({
      color: 0xffcc88,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      this.flashMat,
    );
    this.flash.name = "stage-flash";
    this.flash.visible = false;
    this.group.add(this.flash);
  }

  setStageEvent(ev: StageEvent | null): void {
    this.stage = ev;
  }

  /**
   * @param meshScale craft mesh scale (same as stacked booster)
   * @param craftQuat orientation of the ship at this frame (for pre-stage hide only)
   */
  update(missionT: number, craftPos: THREE.Vector3, craftQuat: THREE.Quaternion): void {
    if (!this.stage) {
      this.booster.visible = false;
      this.flash.visible = false;
      return;
    }

    const age = missionT - this.stage.t;
    if (age < 0) {
      this.booster.visible = false;
      this.flash.visible = false;
      return;
    }

    // Separation state at stage epoch
    this.sepPos.copy(this.stage.pos);
    this.sepVel.copy(this.stage.vel);
    const speed = this.sepVel.length() || 1;
    // Aft kick (−v) + slight Earth-radial
    this.rel.copy(this.sepVel).multiplyScalar(-SEP_DV / speed);
    this.sepVel.add(this.rel);
    const b = bodyPositions(this.stage.t);
    this.earthPos.set(b.earth.x, b.earth.y, b.earth.z);
    this.rel.copy(this.sepPos).sub(this.earthPos);
    const r0 = this.rel.length() || 1;
    this.sepVel.addScaledVector(this.rel, SEP_RADIAL / r0);

    // Constant-g ballistic (Earth gravity at stage epoch) — theater, short window
    const g = MU_EARTH / (r0 * r0);
    this.acc.copy(this.rel).multiplyScalar(-g / r0);

    const tVis = Math.min(age, FALLAWAY_S);
    // p = p0 + v t + ½ a t²
    this.booster.position
      .copy(this.sepPos)
      .addScaledVector(this.sepVel, tVis)
      .addScaledVector(this.acc, 0.5 * tVis * tVis);

    // Orient along free-fall velocity
    const vNow = this.sepVel.clone().addScaledVector(this.acc, tVis);
    if (vNow.lengthSq() > 1e-12) {
      const lookTarget = this.booster.position.clone().add(vNow.normalize());
      this.look.lookAt(this.booster.position, lookTarget, this.up);
      this.quat.setFromRotationMatrix(this.look);
      this.booster.quaternion.copy(this.quat);
    } else {
      this.booster.quaternion.copy(craftQuat);
    }

    const fade =
      age >= FALLAWAY_S
        ? 0
        : age > FALLAWAY_S - 15
          ? 1 - (age - (FALLAWAY_S - 15)) / 15
          : 1;
    this.booster.visible = fade > 0.02;
    // Dim via uniform scale (materials stay shared with the stack)
    const baseScale = this.booster.userData.baseScale as number;
    this.booster.scale.setScalar(baseScale * Math.max(fade, 0.001));

    // Flash at separation point
    if (age <= FLASH_S) {
      const u = age / FLASH_S;
      this.flash.visible = true;
      this.flash.position.copy(this.stage.pos);
      // Stay near craft at t=0+
      if (age < 0.05) this.flash.position.copy(craftPos);
      const s = 0.15 + u * 2.2;
      this.flash.scale.setScalar(s);
      this.flashMat.opacity = 0.9 * (1 - u) * (1 - u);
    } else {
      this.flash.visible = false;
    }

    // Hide if below Earth surface
    const bt = bodyPositions(missionT);
    this.earthPos.set(bt.earth.x, bt.earth.y, bt.earth.z);
    if (this.booster.position.distanceTo(this.earthPos) < R_EARTH + 20) {
      this.booster.visible = false;
    }
  }
}

/** Find first staged sample → stage event. */
export function findStageEvent(
  samples: Array<{ t: number; pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number }; staged: boolean }>,
): StageEvent | null {
  for (const s of samples) {
    if (!s.staged) continue;
    return {
      t: s.t,
      pos: new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z),
      vel: new THREE.Vector3(s.vel.x, s.vel.y, s.vel.z),
    };
  }
  return null;
}
