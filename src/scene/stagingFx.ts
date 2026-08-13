import * as THREE from "three";
import {
  boosterLocatorStrength,
  boostbackFlashStrength,
  boosterVisibleS,
  buildBoosterKeyframes,
  landingContactFlashStrength,
  recoverySchedule,
  sampleBoosterRecovery,
  type RecoveryProfile,
  type StageState,
} from "../physics/boosterRecovery";
import {
  applyPlumeLayers,
  boosterLengthKm,
  CRAFT_MESH_SCALE,
  createLocatorSprite,
  updateLocatorVisibility,
} from "./craft";
import { plumeLook, plumeRegimeFor, plumeThrustLag } from "./plumeRegime";

/** Staging flash lifetime (mission s). */
const FLASH_S = 3.5;

/**
 * Peak material opacity for the free-flyer locator vs ship red (~1.0).
 * Dimmer so the ship remains the primary subject in system views.
 */
const LOCATOR_OPACITY = 0.55;

/** Reference thrust (N) for detached-booster plume sizing. */
const BOOSTBACK_THRUST_REF = 7e7; // ~half of ascent field, multi-engine boostback
const LANDING_THRUST_REF = 2.5e7; // fewer engines into the catch

/** Clone Super Heavy mesh for free-flyer recovery path. */
function initDetachedBooster(proto: THREE.Object3D, meshScale: number): THREE.Group {
  const booster = proto.clone(true) as THREE.Group;
  booster.name = "booster-detached";
  booster.visible = false;
  booster.scale.setScalar(meshScale);
  booster.userData.baseScale = meshScale;
  return booster;
}

/** Multi-layer plume or legacy exhaust-glow from craft clone. */
function findBoostPlume(booster: THREE.Group): THREE.Object3D | null {
  const plume =
    booster.getObjectByName("plume-booster") ??
    booster.getObjectByName("exhaust-glow") ??
    null;
  if (plume) plume.visible = false;
  return plume;
}

/** Local recovery plume light (world-km distance). */
function makeBoosterExhaustLight(): THREE.PointLight {
  const light = new THREE.PointLight(0xff9a58, 0, 0.28, 2);
  light.name = "booster-recovery-light";
  light.position.set(0, 0, -0.06);
  return light;
}

function makeStageFlashMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makeStageFlashMesh(
  r: number,
  w: number,
  h: number,
  mat: THREE.MeshBasicMaterial,
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat);
  mesh.name = name;
  mesh.visible = false;
  return mesh;
}

function makeStageFlashPair() {
  const flashMat = makeStageFlashMat(0xffcc88, 0.85);
  const boostbackFlashMat = makeStageFlashMat(0xffa060, 0);
  const landingFlashMat = makeStageFlashMat(0xffe0a0, 0);
  return {
    flashMat,
    flash: makeStageFlashMesh(0.08, 12, 10, flashMat, "stage-flash"),
    boostbackFlashMat,
    boostbackFlash: makeStageFlashMesh(0.05, 10, 8, boostbackFlashMat, "boostback-flash"),
    landingFlashMat,
    landingFlash: makeStageFlashMesh(0.06, 10, 8, landingFlashMat, "landing-flash"),
  };
}

function makeBoosterLocator() {
  const sprite = createLocatorSprite("#d4944a", "180, 120, 55", "booster-locator");
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.opacity = LOCATOR_OPACITY;
  return { sprite, mat };
}

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
 * Far-range dim locator (~30 s) + brief boostback ignition flash for readability.
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
  private readonly boostbackFlash: THREE.Mesh;
  private readonly boostbackFlashMat: THREE.MeshBasicMaterial;
  private readonly landingFlash: THREE.Mesh;
  private readonly landingFlashMat: THREE.MeshBasicMaterial;
  /** Dim free-flyer locator (amber; dimmer than ship red). */
  private readonly locator: THREE.Sprite;
  private readonly locatorMat: THREE.SpriteMaterial;
  private readonly boostPlume: THREE.Object3D | null = null;
  private readonly exhaustLight: THREE.PointLight;
  private readonly look = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly lookTarget = new THREE.Vector3();
  private readonly nose = new THREE.Vector3();
  private stage: StageEvent | null = null;
  private stageState: StageState | null = null;
  private keyframes: ReturnType<typeof buildBoosterKeyframes> | null = null;
  private recoveryProfile: RecoveryProfile = "chopsticks";
  private plumeLagU = 0;
  private plumeLagT = 0;

  constructor(boosterPrototype: THREE.Object3D, meshScale = CRAFT_MESH_SCALE) {
    this.booster = initDetachedBooster(boosterPrototype, meshScale);
    this.boostPlume = findBoostPlume(this.booster);
    this.exhaustLight = makeBoosterExhaustLight();
    this.booster.add(this.exhaustLight);
    ({ flashMat: this.flashMat, flash: this.flash,
      boostbackFlashMat: this.boostbackFlashMat, boostbackFlash: this.boostbackFlash,
      landingFlashMat: this.landingFlashMat, landingFlash: this.landingFlash } = makeStageFlashPair());
    ({ sprite: this.locator, mat: this.locatorMat } = makeBoosterLocator());
    this.group.add(this.booster, this.flash, this.boostbackFlash, this.landingFlash, this.locator);
  }

  /**
   * @param recovery chopsticks (RTLS / tower) or gulf (Flight 13 offshore)
   */
  setStageEvent(
    ev: StageEvent | null,
    recovery: RecoveryProfile = "chopsticks",
  ): void {
    this.stage = ev;
    this.recoveryProfile = recovery;
    if (!ev) {
      this.stageState = null;
      this.keyframes = null;
      return;
    }
    this.applyStageEvent(ev, recovery);
  }

  private applyStageEvent(ev: StageEvent, recovery: RecoveryProfile): void {
    this.stageState = {
      t: ev.t,
      pos: { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z },
      vel: { x: ev.vel.x, y: ev.vel.y, z: ev.vel.z },
    };
    this.keyframes = buildBoosterKeyframes(this.stageState, recovery);
  }

  /**
   * @param craftPos ship position (flash sticks near craft at t=0+)
   * @param craftQuat unused (kept for call-site compatibility)
   * @param camera optional — when set, drives far-range free-flyer locator
   */
  private hideAllFx(): void {
    this.booster.visible = false;
    this.flash.visible = false;
    this.boostbackFlash.visible = false;
    this.landingFlash.visible = false;
    this.locator.visible = false;
    this.exhaustLight.intensity = 0;
    this.hidePlume();
  }

  private orientBooster(sample: ReturnType<typeof sampleBoosterRecovery>): void {
    this.nose.set(sample.nose.x, sample.nose.y, sample.nose.z);
    if (this.nose.lengthSq() <= 1e-12) return;
    this.nose.normalize();
    this.lookTarget.copy(this.booster.position).add(this.nose);
    this.up.set(0, 1, 0);
    if (Math.abs(this.nose.dot(this.up)) > 0.95) this.up.set(1, 0, 0);
    this.look.lookAt(this.lookTarget, this.booster.position, this.up);
    this.quat.setFromRotationMatrix(this.look);
    this.booster.quaternion.copy(this.quat);
  }

  private applyRecoverySample(
    missionT: number,
    craftPos: THREE.Vector3,
    age: number,
    sample: ReturnType<typeof sampleBoosterRecovery>,
    camera?: THREE.Camera,
  ): void {
    this.booster.visible = true;
    this.booster.position.set(sample.pos.x, sample.pos.y, sample.pos.z);
    this.orientBooster(sample);
    const baseScale = this.booster.userData.baseScale as number;
    this.booster.scale.setScalar(baseScale * Math.max(sample.fade, 0.001));
    this.updatePlume(missionT, sample.burning, sample.throttle, sample.phase);
    this.updateFlash(age, craftPos);
    this.updateBoostbackFlash(age);
    this.updateLandingFlash(age);
    this.updateLocator(age, camera);
  }

  private recoveryAge(missionT: number): number | null {
    if (!this.stage || !this.stageState || !this.keyframes) return null;
    const age = missionT - this.stage.t;
    if (age < 0 || age > boosterVisibleS(recoverySchedule(this.recoveryProfile))) return null;
    return age;
  }

  private finishOrHide(
    age: number, craftPos: THREE.Vector3, sample: ReturnType<typeof sampleBoosterRecovery>,
  ): boolean {
    if (sample.fade >= 0.02 && sample.phase !== "done") return false;
    this.hideAllFx();
    this.flash.visible = age >= 0 && age <= FLASH_S;
    if (this.flash.visible) this.updateFlash(age, craftPos);
    return true;
  }

  update(
    missionT: number, craftPos: THREE.Vector3, _craftQuat: THREE.Quaternion, camera?: THREE.Camera,
  ): void {
    const age = this.recoveryAge(missionT);
    if (age == null) { this.hideAllFx(); return; }
    const sample = sampleBoosterRecovery(this.stageState!, age, this.keyframes!, this.recoveryProfile);
    if (this.finishOrHide(age, craftPos, sample)) return;
    this.applyRecoverySample(missionT, craftPos, age, sample, camera);
  }

  private hidePlume(): void {
    if (this.boostPlume) {
      this.boostPlume.visible = false;
      for (const c of this.boostPlume.children) c.visible = false;
    }
    this.plumeLagU = 0;
  }

  private recoveryFlicker(missionT: number): number {
    return (
      0.9 +
      0.06 * Math.sin(missionT * 53.1) +
      0.04 * Math.sin(missionT * 91.7 + 1.3) +
      0.03 * Math.sin(missionT * 137.2 + 0.4)
    );
  }

  private lagRecoveryThrust(
    missionT: number, throttle: number, phase: string,
  ): number {
    const isLanding = phase === "landing";
    const thrN = throttle * (isLanding ? LANDING_THRUST_REF : BOOSTBACK_THRUST_REF);
    const ref = isLanding ? LANDING_THRUST_REF : BOOSTBACK_THRUST_REF;
    const uTarget = Math.min(1, thrN / ref) * throttle;
    const u = plumeThrustLag(this.plumeLagU, uTarget, this.plumeLagT, missionT);
    this.plumeLagU = u;
    this.plumeLagT = missionT;
    return u;
  }

  private applyRecoveryPlumeVisual(
    u: number, look: ReturnType<typeof plumeLook>, flicker: number, missionT: number,
  ): void {
    if (this.boostPlume && this.boostPlume.name === "plume-booster") {
      applyPlumeLayers(this.boostPlume, u, look, flicker, missionT);
    } else if (this.boostPlume) {
      this.applyLegacyPlumeSprite(u, look, flicker);
    }
    this.exhaustLight.intensity = (1.2 + 2.0 * u) * look.lightI * flicker;
    this.exhaustLight.color.setRGB(look.light[0]!, look.light[1]!, look.light[2]!);
    this.exhaustLight.distance = (0.14 + 0.16 * u) * look.lightDist;
    this.exhaustLight.position.set(0, 0, -0.05);
  }

  private applyLegacyPlumeSprite(
    u: number, look: ReturnType<typeof plumeLook>, flicker: number,
  ): void {
    if (!this.boostPlume) return;
    this.boostPlume.visible = true;
    const s = (0.3 + 0.4 * u) * look.radial * flicker;
    this.boostPlume.scale.set(s, s * look.length, 1);
    const mat = (this.boostPlume as THREE.Sprite).material as THREE.SpriteMaterial;
    mat.opacity = (0.3 + 0.35 * u) * look.opacity * flicker;
    this.boostPlume.position.z = -0.1 - 0.05 * u;
  }

  private updatePlume(
    missionT: number, burning: boolean, throttle: number, phase: string,
  ): void {
    if (!burning || throttle < 0.02) {
      this.hidePlume();
      this.exhaustLight.intensity = 0;
      this.plumeLagT = missionT;
      return;
    }
    const u = this.lagRecoveryThrust(missionT, throttle, phase);
    const look = plumeLook(plumeRegimeFor(undefined, "booster", { recoveryPhase: phase }), "booster");
    this.applyRecoveryPlumeVisual(u, look, this.recoveryFlicker(missionT), missionT);
  }

  private updateFlash(age: number, craftPos: THREE.Vector3): void {
    if (!this.stage || age < 0 || age > FLASH_S) {
      this.flash.visible = false;
      return;
    }
    const u = age / FLASH_S;
    this.flash.visible = true;
    this.flash.position.copy(age < 0.05 ? craftPos : this.stage.pos);
    this.flash.scale.setScalar(0.15 + u * 2.2);
    this.flashMat.opacity = 0.9 * (1 - u) * (1 - u);
  }

  /** Tiny theater flash when boostback lights — readable at ship/Earth range. */
  private placeBoostbackFlash(strength: number): void {
    this.boostbackFlash.visible = true;
    this.boostbackFlash.position.copy(this.booster.position);
    this.nose.set(0, 0, -1).applyQuaternion(this.booster.quaternion);
    this.boostbackFlash.position.addScaledVector(this.nose, 0.04);
    this.boostbackFlash.scale.setScalar(0.06 + strength * 0.55);
    this.boostbackFlashMat.opacity = 0.75 * strength;
  }

  private updateBoostbackFlash(age: number): void {
    const strength = boostbackFlashStrength(age);
    if (strength < 0.02) {
      this.boostbackFlash.visible = false;
      return;
    }
    this.placeBoostbackFlash(strength);
  }

  /** Brief contact flash at chopsticks catch / gulf soft-land. */
  private updateLandingFlash(age: number): void {
    const strength = landingContactFlashStrength(age, recoverySchedule(this.recoveryProfile));
    if (strength < 0.02) {
      this.landingFlash.visible = false;
      return;
    }
    this.landingFlash.visible = true;
    this.landingFlash.position.copy(this.booster.position);
    this.landingFlash.scale.setScalar(0.07 + strength * 0.7);
    this.landingFlashMat.opacity = 0.8 * strength;
  }

  /**
   * Dim amber locator for ~30 s after stage when the mesh is sub-pixel.
   * Strength from pure age helper; pixel sizing matches ship red locator.
   */
  private updateLocator(age: number, camera?: THREE.Camera): void {
    const strength = boosterLocatorStrength(age);
    if (strength < 0.02 || !camera) {
      this.locator.visible = false;
      return;
    }
    this.locator.position.copy(this.booster.position);
    updateLocatorVisibility(this.locator, camera, this.booster.position, { sizeKm: boosterLengthKm() });
    if (this.locator.visible) this.locatorMat.opacity = LOCATOR_OPACITY * strength;
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
