/**
 * Detached Super Heavy after stage-out: flip → boostback → coast → landing burn
 * → tower catch at Starbase. Fully deterministic in mission time so scrubbing works.
 *
 * Path is kinematic theater (see `boosterRecovery.ts`), not the mission integrator.
 * Far-range dim locator (~30 s) + brief boostback ignition flash for readability.
 *
 * Every scalar comes from the pure helpers in `stagingVisual.ts`; this module
 * only builds the mesh graph and writes poses onto it.
 */

import * as THREE from "three";
import {
  sampleBoosterRecovery,
  buildBoosterKeyframes,
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
import {
  plumeLook,
  plumeRegimeFor,
  plumeThrustLag,
  thrustFlicker,
  type PlumeLook,
} from "./plumeRegime";
import {
  boosterFadeScale,
  boosterMeshVisible,
  boosterUpAxis,
  deriveStagingVisual,
  legacyPlumePose,
  LOCATOR_OPACITY,
  recoveryAge,
  recoveryLightPose,
  recoveryPlumeTarget,
  stageFlashPose,
  type FlashPose,
  type StageFlashPose,
} from "./stagingVisual";

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

/** One additive flash sphere plus its material, ready for a {@link FlashPose}. */
type FlashMesh = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };

function makeFlash(
  name: string,
  radius: number,
  widthSeg: number,
  heightSeg: number,
  color: number,
  opacity: number,
): FlashMesh {
  const mat = makeStageFlashMat(color, opacity);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSeg, heightSeg), mat);
  mesh.name = name;
  mesh.visible = false;
  return { mesh, mat };
}

function applyFlashPose(flash: FlashMesh, pose: FlashPose): void {
  flash.mesh.visible = pose.visible;
  if (!pose.visible) return;
  flash.mesh.scale.setScalar(pose.scale);
  flash.mat.opacity = pose.opacity;
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

export type StagingFx = Readonly<{
  group: THREE.Group;
  /** Detached Super Heavy mesh (grid-fin cam host after stage-out). */
  detachedBooster: THREE.Group;
  /**
   * @param recovery chopsticks (RTLS / tower) or gulf (Flight 13 offshore)
   */
  setStageEvent: (ev: StageEvent | null, recovery?: RecoveryProfile) => void;
  /**
   * @param craftPos ship position (flash sticks near craft at t=0+)
   * @param craftQuat unused (kept for call-site compatibility)
   * @param camera optional — when set, drives far-range free-flyer locator
   */
  update: (
    missionT: number,
    craftPos: THREE.Vector3,
    craftQuat: THREE.Quaternion,
    camera?: THREE.Camera,
  ) => void;
}>;

export function createStagingFx(
  boosterPrototype: THREE.Object3D,
  meshScale = CRAFT_MESH_SCALE,
): StagingFx {
  const group = new THREE.Group();
  const booster = initDetachedBooster(boosterPrototype, meshScale);
  const boostPlume = findBoostPlume(booster);
  const exhaustLight = makeBoosterExhaustLight();
  booster.add(exhaustLight);
  const flash = makeFlash("stage-flash", 0.08, 12, 10, 0xffcc88, 0.85);
  const boostbackFlash = makeFlash("boostback-flash", 0.05, 10, 8, 0xffa060, 0);
  const landingFlash = makeFlash("landing-flash", 0.06, 10, 8, 0xffe0a0, 0);
  const { sprite: locator, mat: locatorMat } = makeBoosterLocator();
  group.add(booster, flash.mesh, boostbackFlash.mesh, landingFlash.mesh, locator);

  const look = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const lookTarget = new THREE.Vector3();
  const nose = new THREE.Vector3();

  let stage: StageEvent | null = null;
  let stageState: StageState | null = null;
  let keyframes: ReturnType<typeof buildBoosterKeyframes> | null = null;
  let recoveryProfile: RecoveryProfile = "chopsticks";
  // Frame-to-frame plume lag: mechanical spin-up that survives scrub jumps.
  let plumeLagU = 0;
  let plumeLagT = 0;

  function hidePlume(): void {
    if (boostPlume) {
      boostPlume.visible = false;
      for (const c of boostPlume.children) c.visible = false;
    }
    plumeLagU = 0;
  }

  function hideAllFx(): void {
    booster.visible = false;
    flash.mesh.visible = false;
    boostbackFlash.mesh.visible = false;
    landingFlash.mesh.visible = false;
    locator.visible = false;
    exhaustLight.intensity = 0;
    hidePlume();
  }

  /** Pin the separation flash to the ship for the first frames, then the pad-side booster. */
  function applyStageFlash(pose: StageFlashPose, craftPos: THREE.Vector3): void {
    if (!stage) {
      flash.mesh.visible = false;
      return;
    }
    applyFlashPose(flash, pose);
    if (!pose.visible) return;
    flash.mesh.position.copy(pose.atCraft ? craftPos : stage.pos);
  }

  function applyLegacyPlumeSprite(
    plume: THREE.Object3D, u: number, plumeLookNow: PlumeLook, flicker: number,
  ): void {
    const pose = legacyPlumePose(u, plumeLookNow, flicker);
    plume.visible = true;
    plume.scale.set(pose.scaleX, pose.scaleY, 1);
    ((plume as THREE.Sprite).material as THREE.SpriteMaterial).opacity = pose.opacity;
    plume.position.z = pose.z;
  }

  function applyExhaustLight(u: number, plumeLookNow: PlumeLook, flicker: number): void {
    const light = recoveryLightPose(u, plumeLookNow, flicker);
    exhaustLight.intensity = light.intensity;
    exhaustLight.color.setRGB(plumeLookNow.light[0]!, plumeLookNow.light[1]!, plumeLookNow.light[2]!);
    exhaustLight.distance = light.distance;
    exhaustLight.position.set(0, 0, -0.05);
  }

  function updatePlume(
    missionT: number, burning: boolean, throttle: number, phase: string,
  ): void {
    if (!burning || throttle < 0.02) {
      hidePlume();
      exhaustLight.intensity = 0;
      plumeLagT = missionT;
      return;
    }
    const u = plumeThrustLag(plumeLagU, recoveryPlumeTarget(throttle), plumeLagT, missionT);
    plumeLagU = u;
    plumeLagT = missionT;
    const flicker = thrustFlicker(missionT);
    const plumeLookNow = plumeLook(
      plumeRegimeFor(undefined, "booster", { recoveryPhase: phase }),
      "booster",
    );
    if (boostPlume?.name === "plume-booster") {
      applyPlumeLayers(boostPlume, u, plumeLookNow, flicker, missionT);
    } else if (boostPlume) {
      applyLegacyPlumeSprite(boostPlume, u, plumeLookNow, flicker);
    }
    applyExhaustLight(u, plumeLookNow, flicker);
  }

  function orientBooster(sample: ReturnType<typeof sampleBoosterRecovery>): void {
    nose.set(sample.nose.x, sample.nose.y, sample.nose.z);
    if (nose.lengthSq() <= 1e-12) return;
    nose.normalize();
    lookTarget.copy(booster.position).add(nose);
    const axis = boosterUpAxis(nose);
    up.set(axis.x, axis.y, axis.z);
    look.lookAt(lookTarget, booster.position, up);
    quat.setFromRotationMatrix(look);
    booster.quaternion.copy(quat);
  }

  function applyBoostbackFlash(pose: ReturnType<typeof deriveStagingVisual>["boostbackFlash"]): void {
    applyFlashPose(boostbackFlash, pose);
    if (!pose.visible) return;
    boostbackFlash.mesh.position.copy(booster.position);
    nose.set(0, 0, -1).applyQuaternion(booster.quaternion);
    boostbackFlash.mesh.position.addScaledVector(nose, pose.noseOffset);
  }

  function applyLandingFlash(pose: FlashPose): void {
    applyFlashPose(landingFlash, pose);
    if (pose.visible) landingFlash.mesh.position.copy(booster.position);
  }

  /** Pixel sizing matches the ship red locator so both read the same on screen. */
  function applyLocator(opacity: number, camera?: THREE.Camera): void {
    if (opacity <= 0 || !camera) {
      locator.visible = false;
      return;
    }
    locator.position.copy(booster.position);
    updateLocatorVisibility(locator, camera, booster.position, { sizeKm: boosterLengthKm() });
    if (locator.visible) locatorMat.opacity = opacity;
  }

  function applyRecoverySample(
    missionT: number,
    craftPos: THREE.Vector3,
    age: number,
    sample: ReturnType<typeof sampleBoosterRecovery>,
    camera?: THREE.Camera,
  ): void {
    booster.visible = true;
    booster.position.set(sample.pos.x, sample.pos.y, sample.pos.z);
    orientBooster(sample);
    const baseScale = booster.userData.baseScale as number;
    booster.scale.setScalar(baseScale * boosterFadeScale(sample.fade));
    updatePlume(missionT, sample.burning, sample.throttle, sample.phase);
    const visual = deriveStagingVisual(age, recoveryProfile);
    applyStageFlash(visual.flash, craftPos);
    applyBoostbackFlash(visual.boostbackFlash);
    applyLandingFlash(visual.landingFlash);
    applyLocator(visual.locatorOpacity, camera);
  }

  /** Past fade-out only the separation flash may linger. */
  function fadeOut(age: number, craftPos: THREE.Vector3): void {
    hideAllFx();
    applyStageFlash(stageFlashPose(age), craftPos);
  }

  return Object.freeze({
    group,
    detachedBooster: booster,
    setStageEvent(ev, recovery: RecoveryProfile = "chopsticks") {
      stage = ev;
      recoveryProfile = recovery;
      if (!ev) {
        stageState = null;
        keyframes = null;
        return;
      }
      stageState = {
        t: ev.t,
        pos: { x: ev.pos.x, y: ev.pos.y, z: ev.pos.z },
        vel: { x: ev.vel.x, y: ev.vel.y, z: ev.vel.z },
      };
      keyframes = buildBoosterKeyframes(stageState, recovery);
    },
    update(missionT, craftPos, _craftQuat, camera) {
      if (!stage || !stageState || !keyframes) {
        hideAllFx();
        return;
      }
      const age = recoveryAge(missionT, stage.t, recoveryProfile);
      if (age == null) {
        hideAllFx();
        return;
      }
      const sample = sampleBoosterRecovery(stageState, age, keyframes, recoveryProfile);
      if (!boosterMeshVisible(sample)) {
        fadeOut(age, craftPos);
        return;
      }
      applyRecoverySample(missionT, craftPos, age, sample, camera);
    },
  });
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
