import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AU, R_EARTH } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import { starbasePadState } from "../physics/earthFrame";

/**
 * Focus preset — camera stays free; these only choose what to track.
 * `"free"` is internal (WASD pan drops tracking); not shown in the UI.
 */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "starbase";

/** Ecliptic / orbital north in this theater. */
const ECLIPTIC_NORTH = new THREE.Vector3(0, 0, 1);
/** OrbitControls maps camera.up → +Y internally. */
const ORBIT_Y_UP = new THREE.Vector3(0, 1, 0);

/** Q/E yaw and R/F pitch rate around the focus (rad/s). */
const ORBIT_RAD_PER_S = 1.15;
/** WASD pan rate as a fraction of focus distance per second. */
const PAN_DIST_PER_S = 0.9;
/** Floor so pan still moves when nearly on top of the target (km/s). */
const PAN_MIN_SPEED = R_EARTH * 0.4;
/** Z/X zoom rate (exponential distance scale per second). */
const ZOOM_RATE = 1.4;

const FAR_SOLAR = AU * 4;
/** Height above the ecliptic so both Sun and Earth sit in a 50° FOV with margin. */
const SOLAR_VIEW_HEIGHT = AU * 1.35;

export class CameraDirector {
  readonly controls: OrbitControls;
  /** What we track; OrbitControls stay enabled in every focus. */
  private focus: CameraMode = "sun";
  private readonly desiredTarget = new THREE.Vector3();
  private readonly prevTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly orbitOffset = new THREE.Vector3();
  private readonly panRight = new THREE.Vector3();
  private readonly panOffset = new THREE.Vector3();
  private readonly orbitQuat = new THREE.Quaternion();
  private orbitQ = false;
  private orbitE = false;
  private orbitR = false;
  private orbitF = false;
  private panW = false;
  private panA = false;
  private panS = false;
  private panD = false;
  private zoomZ = false;
  private zoomX = false;
  private readonly craftPos = new THREE.Vector3();
  private simTime = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = AU * 3;
    this.controls.enabled = true;

    // Default: Sun (solar-system) overview from ecliptic north
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0, 0, SOLAR_VIEW_HEIGHT);
    this.applyClipPlanes();
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  getMode(): CameraMode {
    return this.focus;
  }

  /**
   * Switch focus target while preserving current zoom (distance to target)
   * and view direction.
   */
  setMode(mode: CameraMode): void {
    if (mode === "free") {
      this.focus = "free";
      this.applyClipPlanes();
      return;
    }

    const dist = Math.max(
      this.controls.minDistance,
      Math.min(
        this.controls.maxDistance,
        this.camera.position.distanceTo(this.controls.target),
      ),
    );

    this.tmp.copy(this.camera.position).sub(this.controls.target);
    if (this.tmp.lengthSq() < 1e-12) {
      this.tmp.copy(ECLIPTIC_NORTH);
    } else {
      this.tmp.normalize();
    }

    this.focus = mode;
    this.applyClipPlanes();
    this.computeTarget(mode, this.desiredTarget);
    this.controls.target.copy(this.desiredTarget);
    this.camera.position
      .copy(this.desiredTarget)
      .addScaledVector(this.tmp, dist);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  /**
   * Q/E yaw left/right, R/F pitch up/down around the focus (hold).
   */
  setOrbitKey(key: "q" | "e" | "r" | "f", down: boolean): CameraMode {
    if (key === "q") this.orbitQ = down;
    else if (key === "e") this.orbitE = down;
    else if (key === "r") this.orbitR = down;
    else this.orbitF = down;
    return this.focus;
  }

  /** WASD hold state — pan; drops body tracking so the slide sticks. */
  setPanKey(key: "w" | "a" | "s" | "d", down: boolean): CameraMode {
    if (key === "w") this.panW = down;
    else if (key === "a") this.panA = down;
    else if (key === "s") this.panS = down;
    else this.panD = down;
    if (down && this.focus !== "free") {
      this.focus = "free";
      this.applyClipPlanes();
    }
    return this.focus;
  }

  /** Z/X hold state — zoom in / out toward the focus. */
  setZoomKey(key: "z" | "x", down: boolean): CameraMode {
    if (key === "z") this.zoomZ = down;
    else this.zoomX = down;
    return this.focus;
  }

  private applyClipPlanes(): void {
    // Keep AU-scale max distance so focus switches never clamp a long zoom.
    this.controls.maxDistance = AU * 3;
    this.controls.minDistance = 0.05;
    this.camera.near =
      this.focus === "chase" || this.focus === "starbase" ? 0.001 : 0.1;
    this.camera.far = FAR_SOLAR;
    this.camera.updateProjectionMatrix();
  }

  private computeTarget(mode: CameraMode, outTarget: THREE.Vector3): void {
    const b = bodyPositions(this.simTime);

    switch (mode) {
      case "free":
        break;

      case "sun": {
        // Same as former Solar: Sun–Earth midpoint (system overview target)
        outTarget.set(
          (b.sun.x + b.earth.x) * 0.5,
          (b.sun.y + b.earth.y) * 0.5,
          (b.sun.z + b.earth.z) * 0.5,
        );
        break;
      }

      case "earth":
        outTarget.set(b.earth.x, b.earth.y, b.earth.z);
        break;

      case "chase":
        outTarget.copy(this.craftPos);
        break;

      case "moon":
        outTarget.set(b.moon.x, b.moon.y, b.moon.z);
        break;

      case "starbase": {
        const pad = starbasePadState(this.simTime);
        outTarget.set(pad.pos.x, pad.pos.y, pad.pos.z);
        break;
      }
    }
  }

  /** Keep target on the focused body; slide the camera with it. */
  private trackFocus(): void {
    if (this.focus === "free") return;

    this.prevTarget.copy(this.controls.target);
    this.computeTarget(this.focus, this.desiredTarget);
    this.tmp.copy(this.desiredTarget).sub(this.prevTarget);
    this.controls.target.copy(this.desiredTarget);
    this.camera.position.add(this.tmp);
  }

  private applyOrbit(dt: number): void {
    const yaw = (this.orbitE ? 1 : 0) - (this.orbitQ ? 1 : 0);
    const pitch = (this.orbitR ? 1 : 0) - (this.orbitF ? 1 : 0);
    if ((yaw === 0 && pitch === 0) || dt <= 0) return;

    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);

    if (yaw !== 0) {
      this.orbitQuat.setFromAxisAngle(
        this.camera.up,
        yaw * ORBIT_RAD_PER_S * dt,
      );
      this.orbitOffset.applyQuaternion(this.orbitQuat);
    }

    if (pitch !== 0) {
      // Pitch around camera right, and tumble `up` with it so we can go
      // smoothly upside-down without OrbitControls' polar singularity snap.
      this.camera.updateMatrixWorld();
      this.panRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
      if (this.panRight.lengthSq() > 1e-12) {
        this.panRight.normalize();
        // Negative so R (pitch +) lifts the camera toward +up
        this.orbitQuat.setFromAxisAngle(
          this.panRight,
          -pitch * ORBIT_RAD_PER_S * dt,
        );
        this.orbitOffset.applyQuaternion(this.orbitQuat);
        this.camera.up.applyQuaternion(this.orbitQuat).normalize();
        this.syncOrbitControlsUp();
      }
    }

    this.camera.position.copy(this.controls.target).add(this.orbitOffset);
    this.camera.lookAt(this.controls.target);
  }

  /** Keep OrbitControls' internal up-basis in sync after tumbling camera.up. */
  private syncOrbitControlsUp(): void {
    const c = this.controls as OrbitControls & {
      _quat: THREE.Quaternion;
      _quatInverse: THREE.Quaternion;
    };
    c._quat.setFromUnitVectors(this.camera.up, ORBIT_Y_UP);
    c._quatInverse.copy(c._quat).invert();
  }

  /**
   * Slide camera + target in the ecliptic / orbital plane (XY, ⊥ +Z).
   * W/S along look projected onto that plane; A/D along in-plane right.
   */
  private applyPan(dt: number): void {
    const fwd = (this.panW ? 1 : 0) - (this.panS ? 1 : 0);
    const right = (this.panA ? 1 : 0) - (this.panD ? 1 : 0);
    if ((fwd === 0 && right === 0) || dt <= 0) return;

    const dist = this.camera.position.distanceTo(this.controls.target);
    const speed = Math.max(dist * PAN_DIST_PER_S, PAN_MIN_SPEED);

    // Look direction projected onto the ecliptic (drop the +Z component)
    this.tmp.copy(this.controls.target).sub(this.camera.position);
    this.tmp.addScaledVector(
      ECLIPTIC_NORTH,
      -this.tmp.dot(ECLIPTIC_NORTH),
    );
    if (this.tmp.lengthSq() < 1e-12) {
      // Looking along the pole — use world +X in-plane as forward
      this.tmp.set(1, 0, 0);
    }
    this.tmp.normalize();
    // In-plane right = ecliptic north × forward
    this.panRight.crossVectors(ECLIPTIC_NORTH, this.tmp).normalize();

    this.panOffset.set(0, 0, 0);
    this.panOffset.addScaledVector(this.tmp, fwd * speed * dt);
    this.panOffset.addScaledVector(this.panRight, right * speed * dt);
    this.camera.position.add(this.panOffset);
    this.controls.target.add(this.panOffset);
  }

  /** Scale distance to the focus; Z zooms in, X zooms out. */
  private applyZoom(dt: number): void {
    const dir = (this.zoomZ ? 1 : 0) - (this.zoomX ? 1 : 0);
    if (dir === 0 || dt <= 0) return;

    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);
    const dist = this.orbitOffset.length();
    if (dist < 1e-12) return;

    const next = THREE.MathUtils.clamp(
      dist * Math.exp(-dir * ZOOM_RATE * dt),
      this.controls.minDistance,
      this.controls.maxDistance,
    );
    this.orbitOffset.multiplyScalar(next / dist);
    this.camera.position.copy(this.controls.target).add(this.orbitOffset);
  }

  update(
    dt: number,
    simTime: number,
    craftPos: THREE.Vector3,
    _craftVel: THREE.Vector3,
  ): void {
    this.simTime = simTime;
    this.craftPos.copy(craftPos);

    this.trackFocus();
    this.applyPan(dt);
    this.applyOrbit(dt);
    this.applyZoom(dt);
    this.controls.update();
  }
}
