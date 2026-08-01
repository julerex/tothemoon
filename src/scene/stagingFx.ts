import * as THREE from "three";
import {
  BOOSTER_VISIBLE_S,
  buildBoosterKeyframes,
  sampleBoosterRecovery,
  type StageState,
} from "../physics/boosterRecovery";
import { CRAFT_MESH_SCALE } from "./craft";

/** Staging flash lifetime (mission s). */
const FLASH_S = 3.5;

/** Reference thrust (N) for detached-booster plume sizing. */
const BOOSTBACK_THRUST_REF = 7e7; // ~half of ascent field, multi-engine boostback
const LANDING_THRUST_REF = 2.5e7; // fewer engines into the catch

export type StageEvent = {
  t: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
};

/**
 * Detached Super Heavy after stage-out: flip → boostback → coast → landing burn
 * → tower catch at Starbase. Fully deterministic in mission time so scrubbing works.
 *
 * Path is kinematic theater (see `boosterRecovery.ts`), not the mission integrator.
 */
export class StagingFx {
  readonly group = new THREE.Group();
  private readonly booster: THREE.Group;
  /** Detached Super Heavy mesh (grid-fin cam host after stage-out). */
  get detachedBooster(): THREE.Group {
    return this.booster;
  }
  private readonly flash: THREE.Mesh;
  private readonly flashMat: THREE.MeshBasicMaterial;
  private readonly exhaustGlow: THREE.Object3D | null = null;
  private readonly exhaustLight: THREE.PointLight;
  private readonly look = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly lookTarget = new THREE.Vector3();
  private readonly nose = new THREE.Vector3();
  private stage: StageEvent | null = null;
  private stageState: StageState | null = null;
  private keyframes: ReturnType<typeof buildBoosterKeyframes> | null = null;

  constructor(boosterPrototype: THREE.Object3D, meshScale = CRAFT_MESH_SCALE) {
    this.booster = boosterPrototype.clone(true) as THREE.Group;
    this.booster.name = "booster-detached";
    this.booster.visible = false;
    this.booster.scale.setScalar(meshScale);
    this.booster.userData.baseScale = meshScale;

    // Soft glow on free flyer (clone may already have one)
    const glow = this.booster.getObjectByName("exhaust-glow");
    this.exhaustGlow = glow ?? null;
    if (this.exhaustGlow) this.exhaustGlow.visible = false;

    // Local plume light (world km; parent scale does not apply to PointLight distance)
    this.exhaustLight = new THREE.PointLight(0xff9a58, 0, 0.28, 2);
    this.exhaustLight.name = "booster-recovery-light";
    this.exhaustLight.position.set(0, 0, -0.06);
    this.booster.add(this.exhaustLight);

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
    if (!ev) {
      this.stageState = null;
      this.keyframes = null;
      return;
    }
    this.stageState = {
      t: ev.t,
      pos: { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z },
      vel: { x: ev.vel.x, y: ev.vel.y, z: ev.vel.z },
    };
    this.keyframes = buildBoosterKeyframes(this.stageState);
  }

  /**
   * @param craftPos ship position (flash sticks near craft at t=0+)
   * @param craftQuat unused (kept for call-site compatibility)
   */
  update(
    missionT: number,
    craftPos: THREE.Vector3,
    _craftQuat: THREE.Quaternion,
  ): void {
    if (!this.stage || !this.stageState || !this.keyframes) {
      this.booster.visible = false;
      this.flash.visible = false;
      this.exhaustLight.intensity = 0;
      return;
    }

    const age = missionT - this.stage.t;
    if (age < 0 || age > BOOSTER_VISIBLE_S) {
      this.booster.visible = false;
      this.flash.visible = false;
      this.exhaustLight.intensity = 0;
      return;
    }

    const sample = sampleBoosterRecovery(
      this.stageState,
      age,
      this.keyframes,
    );

    if (sample.fade < 0.02 || sample.phase === "done") {
      this.booster.visible = false;
      this.flash.visible = age >= 0 && age <= FLASH_S;
      this.exhaustLight.intensity = 0;
      if (this.flash.visible) this.updateFlash(age, craftPos);
      return;
    }

    this.booster.visible = true;
    this.booster.position.set(sample.pos.x, sample.pos.y, sample.pos.z);

    // Nose (+Z) along sample.nose — same Matrix4.lookAt convention as main craft
    this.nose.set(sample.nose.x, sample.nose.y, sample.nose.z);
    if (this.nose.lengthSq() > 1e-12) {
      this.nose.normalize();
      this.lookTarget.copy(this.booster.position).add(this.nose);
      this.up.set(0, 1, 0);
      if (Math.abs(this.nose.dot(this.up)) > 0.95) this.up.set(1, 0, 0);
      this.look.lookAt(this.lookTarget, this.booster.position, this.up);
      this.quat.setFromRotationMatrix(this.look);
      this.booster.quaternion.copy(this.quat);
    }

    const baseScale = this.booster.userData.baseScale as number;
    this.booster.scale.setScalar(baseScale * Math.max(sample.fade, 0.001));

    this.updatePlume(missionT, sample.burning, sample.throttle, sample.phase);
    this.updateFlash(age, craftPos);
  }

  private updatePlume(
    missionT: number,
    burning: boolean,
    throttle: number,
    phase: string,
  ): void {
    if (!burning || throttle < 0.02) {
      if (this.exhaustGlow) this.exhaustGlow.visible = false;
      this.exhaustLight.intensity = 0;
      return;
    }

    const flicker =
      0.9 +
      0.06 * Math.sin(missionT * 53.1) +
      0.04 * Math.sin(missionT * 91.7 + 1.3) +
      0.03 * Math.sin(missionT * 137.2 + 0.4);

    const isLanding = phase === "landing";
    const thrN = throttle * (isLanding ? LANDING_THRUST_REF : BOOSTBACK_THRUST_REF);
    const ref = isLanding ? LANDING_THRUST_REF : BOOSTBACK_THRUST_REF;
    const u = Math.min(1, thrN / ref) * throttle;

    if (this.exhaustGlow) {
      this.exhaustGlow.visible = true;
      const s = (0.3 + 0.4 * u) * flicker;
      this.exhaustGlow.scale.set(s, s, 1);
      const mat = (this.exhaustGlow as THREE.Sprite).material as THREE.SpriteMaterial;
      mat.opacity = (0.3 + 0.35 * u) * flicker;
      this.exhaustGlow.position.z = -0.1 - 0.05 * u;
    }

    this.exhaustLight.intensity = (1.2 + 2.0 * u) * flicker;
    this.exhaustLight.color.setHex(isLanding ? 0xffa060 : 0xff9a58);
    this.exhaustLight.distance = 0.14 + 0.16 * u;
    this.exhaustLight.position.set(0, 0, -0.05);
  }

  private updateFlash(age: number, craftPos: THREE.Vector3): void {
    if (!this.stage || age < 0 || age > FLASH_S) {
      this.flash.visible = false;
      return;
    }
    const u = age / FLASH_S;
    this.flash.visible = true;
    this.flash.position.copy(this.stage.pos);
    if (age < 0.05) this.flash.position.copy(craftPos);
    const s = 0.15 + u * 2.2;
    this.flash.scale.setScalar(s);
    this.flashMat.opacity = 0.9 * (1 - u) * (1 - u);
  }
}

/** Find first staged sample → stage event. */
export function findStageEvent(
  samples: Array<{
    t: number;
    pos: { x: number; y: number; z: number };
    vel: { x: number; y: number; z: number };
    staged: boolean;
  }>,
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
