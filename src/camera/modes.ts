import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { A_EM, AU, R_EARTH, R_MOON, R_SUN } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";

/** Focus preset — camera stays free; these only choose what to frame/track. */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "solar";

/** F-key cycle: Sun → Earth → Moon → Starship. */
const FOCUS_CYCLE: readonly CameraMode[] = [
  "sun",
  "earth",
  "moon",
  "chase",
];

/** Ecliptic / orbital north in this theater. */
const ECLIPTIC_NORTH = new THREE.Vector3(0, 0, 1);

/** Q/E orbit rate around the focus (rad/s). */
const ORBIT_RAD_PER_S = 1.15;
/** WASD pan rate as a fraction of focus distance per second. */
const PAN_DIST_PER_S = 0.9;
/** Floor so pan still moves when nearly on top of the target (km/s). */
const PAN_MIN_SPEED = R_EARTH * 0.4;

const FAR_CISLUNAR = AU * 2.5;
/** Far enough for a north-pole view that frames Sun + Earth (~1 AU span). */
const FAR_SOLAR = AU * 4;
/** Height above the ecliptic so both Sun and Earth sit in a 50° FOV with margin. */
const SOLAR_VIEW_HEIGHT = AU * 1.35;

export class CameraDirector {
  readonly controls: OrbitControls;
  /** What we frame/track; OrbitControls stay enabled in every focus. */
  private focus: CameraMode = "free";
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly prevTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly panRight = new THREE.Vector3();
  private readonly panOffset = new THREE.Vector3();
  private readonly orbitQuat = new THREE.Quaternion();
  private orbitQ = false;
  private orbitE = false;
  private panW = false;
  private panA = false;
  private panS = false;
  private panD = false;
  /** Craft state for framing Ship focus (set each update). */
  private readonly craftPos = new THREE.Vector3();
  private readonly craftVel = new THREE.Vector3();
  private simTime = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = A_EM * 3;
    this.controls.target.set(0, 0, 0);
    // System overview: EM barycenter region
    this.camera.position.set(-A_EM * 0.15, A_EM * 0.55, A_EM * 1.1);
    this.camera.near = 0.1;
    this.camera.far = FAR_CISLUNAR;
    this.camera.updateProjectionMatrix();
    this.controls.enabled = true;
    this.controls.update();
  }

  getMode(): CameraMode {
    return this.focus;
  }

  /**
   * Jump to a focus preset and frame it. Camera stays freely controllable;
   * body focuses keep the target locked while you orbit/zoom.
   */
  setMode(mode: CameraMode): void {
    this.focus = mode;
    this.applyClipPlanes(mode);
    this.computeFrame(mode, this.desiredPos, this.desiredTarget);
    this.controls.target.copy(this.desiredTarget);
    this.camera.position.copy(this.desiredPos);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  /**
   * Reorient so ecliptic north (+Z) is screen-up; keep current focus/target.
   */
  resetNorthUp(): void {
    this.camera.up.copy(ECLIPTIC_NORTH);
    this.tmp.copy(this.controls.target).sub(this.camera.position);
    const dist = this.tmp.length();
    if (dist > 1e-9) {
      this.tmp.multiplyScalar(1 / dist);
      if (Math.abs(this.tmp.dot(ECLIPTIC_NORTH)) > 0.995) {
        this.camera.position.x += dist * 0.02;
      }
    }
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  /** Cycle focus: Sun → Earth → Moon → Starship. */
  cycleFocus(): CameraMode {
    const i = FOCUS_CYCLE.indexOf(this.focus);
    const next =
      i < 0 ? FOCUS_CYCLE[0]! : FOCUS_CYCLE[(i + 1) % FOCUS_CYCLE.length]!;
    this.setMode(next);
    return next;
  }

  /** Q/E hold state — orbit left (Q) / right (E) around the focus. */
  setOrbitKey(key: "q" | "e", down: boolean): CameraMode {
    if (key === "q") this.orbitQ = down;
    else this.orbitE = down;
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
      this.applyClipPlanes("free");
    }
    return this.focus;
  }

  private applyClipPlanes(mode: CameraMode): void {
    if (mode === "chase") {
      this.camera.near = 0.001;
      this.camera.far = FAR_CISLUNAR;
      this.controls.maxDistance = A_EM * 3;
    } else if (mode === "solar" || mode === "sun") {
      this.camera.near = AU * 0.01;
      this.camera.far = FAR_SOLAR;
      this.controls.maxDistance = AU * 3;
    } else {
      this.camera.near = 0.1;
      this.camera.far = FAR_CISLUNAR;
      this.controls.maxDistance = A_EM * 3;
    }
    this.camera.updateProjectionMatrix();
  }

  private computeFrame(
    mode: CameraMode,
    outPos: THREE.Vector3,
    outTarget: THREE.Vector3,
  ): void {
    const b = bodyPositions(this.simTime);

    switch (mode) {
      case "free":
        outTarget.set(0, 0, 0);
        outPos.set(-A_EM * 0.15, A_EM * 0.55, A_EM * 1.1);
        break;

      case "sun": {
        outTarget.set(b.sun.x, b.sun.y, b.sun.z);
        const R = R_SUN * 4.5;
        outPos.set(b.sun.x + R * 0.8, b.sun.y + R * 0.45, b.sun.z + R * 0.6);
        break;
      }

      case "earth": {
        outTarget.set(b.earth.x, b.earth.y, b.earth.z);
        const R = R_EARTH * 4.5;
        outPos.set(
          b.earth.x + R,
          b.earth.y + R_EARTH * 1.8,
          b.earth.z + R * 0.35,
        );
        break;
      }

      case "chase": {
        const speed = this.craftVel.length() || 1;
        this.tmp.copy(this.craftVel).normalize();
        const back = THREE.MathUtils.clamp(speed * 0.4, 0.08, 8);
        const up = THREE.MathUtils.clamp(back * 0.35, 0.03, 3);
        outPos.copy(this.craftPos).addScaledVector(this.tmp, -back);
        outPos.y += up;
        outTarget.copy(this.craftPos).addScaledVector(this.tmp, back * 0.5);
        break;
      }

      case "moon": {
        outTarget.set(b.moon.x, b.moon.y, b.moon.z);
        const pull = R_MOON * 6;
        outPos.set(
          b.moon.x - pull * 0.7,
          b.moon.y + pull * 0.35,
          b.moon.z + pull * 0.5,
        );
        break;
      }

      case "solar": {
        const midX = (b.sun.x + b.earth.x) * 0.5;
        const midY = (b.sun.y + b.earth.y) * 0.5;
        const midZ = (b.sun.z + b.earth.z) * 0.5;
        outTarget.set(midX, midY, midZ);
        outPos.set(midX, midY, midZ + SOLAR_VIEW_HEIGHT);
        break;
      }
    }
  }

  /** Keep target on the focused body; slide the camera with it. */
  private trackFocus(): void {
    if (this.focus === "free") return;

    this.prevTarget.copy(this.controls.target);
    this.computeFrame(this.focus, this.desiredPos, this.desiredTarget);
    // Only pull the target (and camera by the same delta) — keep user's orbit offset
    this.tmp.copy(this.desiredTarget).sub(this.prevTarget);
    this.controls.target.copy(this.desiredTarget);
    this.camera.position.add(this.tmp);
  }

  private applyOrbit(dt: number): void {
    const dir = (this.orbitE ? 1 : 0) - (this.orbitQ ? 1 : 0);
    if (dir === 0 || dt <= 0) return;

    const angle = dir * ORBIT_RAD_PER_S * dt;
    this.orbitQuat.setFromAxisAngle(this.camera.up, angle);
    this.tmp.copy(this.camera.position).sub(this.controls.target);
    this.tmp.applyQuaternion(this.orbitQuat);
    this.camera.position.copy(this.controls.target).add(this.tmp);
    this.camera.lookAt(this.controls.target);
  }

  private applyPan(dt: number): void {
    const fwd = (this.panW ? 1 : 0) - (this.panS ? 1 : 0);
    const right = (this.panD ? 1 : 0) - (this.panA ? 1 : 0);
    if ((fwd === 0 && right === 0) || dt <= 0) return;

    const dist = this.camera.position.distanceTo(this.controls.target);
    const speed = Math.max(dist * PAN_DIST_PER_S, PAN_MIN_SPEED);

    this.tmp.copy(this.controls.target).sub(this.camera.position);
    this.tmp.addScaledVector(this.camera.up, -this.tmp.dot(this.camera.up));
    if (this.tmp.lengthSq() < 1e-12) {
      this.tmp.set(1, 0, 0);
      this.tmp.addScaledVector(this.camera.up, -this.tmp.dot(this.camera.up));
      if (this.tmp.lengthSq() < 1e-12) this.tmp.set(0, 1, 0);
    }
    this.tmp.normalize();
    this.panRight.crossVectors(this.camera.up, this.tmp).normalize();

    this.panOffset.set(0, 0, 0);
    this.panOffset.addScaledVector(this.tmp, fwd * speed * dt);
    this.panOffset.addScaledVector(this.panRight, right * speed * dt);
    this.camera.position.add(this.panOffset);
    this.controls.target.add(this.panOffset);
  }

  update(
    dt: number,
    simTime: number,
    craftPos: THREE.Vector3,
    craftVel: THREE.Vector3,
  ): void {
    this.simTime = simTime;
    this.craftPos.copy(craftPos);
    this.craftVel.copy(craftVel);

    this.trackFocus();
    this.applyPan(dt);
    this.applyOrbit(dt);
    this.controls.update();
  }
}
