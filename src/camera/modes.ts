import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { A_EM, AU, R_EARTH, R_MOON, R_SUN } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";

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

const FAR_CISLUNAR = AU * 2.5;
/** Far enough for a north-pole view that frames Sun + Earth (~1 AU span). */
const FAR_SOLAR = AU * 4;
/** Height above the ecliptic so both Sun and Earth sit in a 50° FOV with margin. */
const SOLAR_VIEW_HEIGHT = AU * 1.35;

export class CameraDirector {
  readonly controls: OrbitControls;
  private mode: CameraMode = "free";
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = R_EARTH * 1.5;
    this.controls.maxDistance = A_EM * 3;
    this.controls.target.set(0, 0, 0);
    // System overview: EM barycenter region
    this.camera.position.set(-A_EM * 0.15, A_EM * 0.55, A_EM * 1.1);
    this.camera.near = 0.1;
    this.camera.far = FAR_CISLUNAR;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  getMode(): CameraMode {
    return this.mode;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.controls.enabled = mode === "free";

    if (mode === "chase") {
      this.camera.near = 0.001;
      this.camera.far = FAR_CISLUNAR;
    } else if (mode === "solar" || mode === "sun") {
      this.camera.near = AU * 0.01;
      this.camera.far = FAR_SOLAR;
    } else {
      this.camera.near = 1;
      this.camera.far = FAR_CISLUNAR;
    }
    this.camera.updateProjectionMatrix();
  }

  /**
   * Reorient so ecliptic north (+Z) is screen-up, keep current target, and
   * return to free orbit with that up axis.
   */
  resetNorthUp(): void {
    this.camera.up.copy(ECLIPTIC_NORTH);
    // If looking nearly along the pole, nudge so lookAt has a stable up.
    this.tmp.copy(this.controls.target).sub(this.camera.position);
    const dist = this.tmp.length();
    if (dist > 1e-9) {
      this.tmp.multiplyScalar(1 / dist);
      if (Math.abs(this.tmp.dot(ECLIPTIC_NORTH)) > 0.995) {
        this.camera.position.x += dist * 0.02;
      }
    }
    this.camera.lookAt(this.controls.target);
    this.setMode("free");
    this.controls.update();
  }

  /** Cycle focus: Sun → Earth → Moon → Starship. */
  cycleFocus(): CameraMode {
    const i = FOCUS_CYCLE.indexOf(this.mode);
    const next =
      i < 0 ? FOCUS_CYCLE[0]! : FOCUS_CYCLE[(i + 1) % FOCUS_CYCLE.length]!;
    this.setMode(next);
    return next;
  }

  update(
    dt: number,
    simTime: number,
    craftPos: THREE.Vector3,
    craftVel: THREE.Vector3,
  ): void {
    const lerp = 1 - Math.exp(-3.5 * dt);
    const b = bodyPositions(simTime);

    switch (this.mode) {
      case "free":
        this.controls.update();
        return;

      case "sun": {
        this.desiredTarget.set(b.sun.x, b.sun.y, b.sun.z);
        const R = R_SUN * 4.5;
        const t = performance.now() * 0.00003;
        this.desiredPos.set(
          b.sun.x + R * Math.cos(t),
          b.sun.y + R * 0.45,
          b.sun.z + R * Math.sin(t),
        );
        break;
      }

      case "earth": {
        this.desiredTarget.set(b.earth.x, b.earth.y, b.earth.z);
        const t = performance.now() * 0.00004;
        const R = R_EARTH * 4.5;
        this.desiredPos.set(
          b.earth.x + R * Math.cos(t),
          b.earth.y + R_EARTH * 1.8,
          b.earth.z + R * Math.sin(t),
        );
        break;
      }

      case "chase": {
        const speed = craftVel.length() || 1;
        this.tmp.copy(craftVel).normalize();
        // Offset behind and above — scale with a floor so tiny craft is framed
        const back = THREE.MathUtils.clamp(speed * 0.4, 0.08, 8);
        const up = THREE.MathUtils.clamp(back * 0.35, 0.03, 3);
        this.desiredPos.copy(craftPos).addScaledVector(this.tmp, -back);
        this.desiredPos.y += up;
        this.desiredTarget.copy(craftPos).addScaledVector(this.tmp, back * 0.5);
        break;
      }

      case "moon": {
        this.desiredTarget.set(b.moon.x, b.moon.y, b.moon.z);
        const distCraft = craftPos.distanceTo(this.desiredTarget);
        const pull = THREE.MathUtils.clamp(
          distCraft * 0.4 + R_MOON * 3,
          R_MOON * 3,
          A_EM * 0.6,
        );
        this.desiredPos.set(
          b.moon.x - pull * 0.7,
          b.moon.y + pull * 0.35,
          b.moon.z + pull * 0.5,
        );
        break;
      }

      case "solar": {
        // Top-down Sun–Earth system: look from ecliptic north (+Z) at the
        // Sun–Earth midpoint so both bodies sit in frame.
        const midX = (b.sun.x + b.earth.x) * 0.5;
        const midY = (b.sun.y + b.earth.y) * 0.5;
        const midZ = (b.sun.z + b.earth.z) * 0.5;
        this.desiredTarget.set(midX, midY, midZ);
        this.desiredPos.set(midX, midY, midZ + SOLAR_VIEW_HEIGHT);
        break;
      }
    }

    this.camera.position.lerp(this.desiredPos, lerp);
    this.controls.target.lerp(this.desiredTarget, lerp);
    this.camera.lookAt(this.controls.target);
  }
}
