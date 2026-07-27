import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AU, R_EARTH, R_MOON, R_SUN } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import { starbasePadState } from "../physics/earthFrame";
import { craftLengthKm } from "../scene/craft";

/**
 * Focus preset — camera stays free; these only choose what to track.
 * `"free"` is internal (WASD pan drops tracking); not shown in the UI.
 * `"fin"` is a locked mount on the Starship forward fin (aft-looking).
 */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "starbase"
  | "fin";

/** Ecliptic / orbital north in this theater. */
const ECLIPTIC_NORTH = new THREE.Vector3(0, 0, 1);
/** OrbitControls maps camera.up → +Y internally. */
const ORBIT_Y_UP = new THREE.Vector3(0, 1, 0);

/** Q/E orbit and R/F pitch rates around the focus (rad/s). */
const ORBIT_RAD_PER_S = 1.15;
/** WASD pan rate as a fraction of focus distance per second. */
const PAN_DIST_PER_S = 0.9;
/** Floor so pan still moves when nearly on top of the target (km/s). */
const PAN_MIN_SPEED = R_EARTH * 0.4;
/** Z/X zoom rate (exponential distance scale per second). */
const ZOOM_RATE = 1.4;

const FAR_SOLAR = AU * 4;
/** Opening shot: distance from Earth center (km). */
const EARTH_OPENING_DIST = R_EARTH * 8;
/** Opening shot: elevation above the ecliptic. */
const EARTH_OPENING_TILT = Math.PI / 4;
/** Closest comfortable orbit around the Sun (outside outer corona). */
const SUN_MIN_DIST = R_SUN * 2.5;
/** Default framing distance when switching to Sun from a much closer zoom. */
const SUN_DEFAULT_DIST = R_SUN * 8;

export class CameraDirector {
  readonly controls: OrbitControls;
  /** What we track; OrbitControls stay enabled in every focus. */
  private focus: CameraMode = "earth";
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
  private craft: THREE.Object3D | null = null;
  private simTime = 0;
  private readonly finPos = new THREE.Vector3();
  private readonly finLook = new THREE.Vector3();
  private readonly finUp = new THREE.Vector3();

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
    // Spherical mouse orbit uses camera.up as the pole (no view-axis roll).
    // R/F may tumble that up; keep a tiny gap at the poles to avoid flips.
    this.controls.minPolarAngle = 1e-3;
    this.controls.maxPolarAngle = Math.PI - 1e-3;
    this.camera.up.copy(ECLIPTIC_NORTH);
    this.syncOrbitControlsUp();

    this.applyEarthOpeningShot();
    this.applyClipPlanes();
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Craft root (for fin-cam attachment). Call once after createCraft. */
  setCraft(craft: THREE.Object3D): void {
    this.craft = craft;
  }

  /**
   * Earth-centered opening: 45° above the ecliptic on the night side so the
   * Sun sits behind Earth in the background.
   */
  private applyEarthOpeningShot(): void {
    const b = bodyPositions(0);
    this.desiredTarget.set(b.earth.x, b.earth.y, b.earth.z);

    // Anti-sunward in the ecliptic (Sun → Earth → camera)
    this.orbitOffset.set(
      b.earth.x - b.sun.x,
      b.earth.y - b.sun.y,
      b.earth.z - b.sun.z,
    );
    this.orbitOffset.addScaledVector(
      ECLIPTIC_NORTH,
      -this.orbitOffset.dot(ECLIPTIC_NORTH),
    );
    if (this.orbitOffset.lengthSq() < 1e-12) {
      this.orbitOffset.set(1, 0, 0);
    }
    this.orbitOffset.normalize();

    // Tilt 45° toward ecliptic north
    this.tmp
      .copy(this.orbitOffset)
      .multiplyScalar(Math.cos(EARTH_OPENING_TILT));
    this.tmp.addScaledVector(
      ECLIPTIC_NORTH,
      Math.sin(EARTH_OPENING_TILT),
    );
    this.tmp.normalize();

    this.camera.position
      .copy(this.desiredTarget)
      .addScaledVector(this.tmp, EARTH_OPENING_DIST);
    this.controls.target.copy(this.desiredTarget);
    this.camera.up.copy(ECLIPTIC_NORTH);
    this.syncOrbitControlsUp();
    this.camera.lookAt(this.controls.target);
  }

  getMode(): CameraMode {
    return this.focus;
  }

  /** Distance from camera to OrbitControls focus target (km). */
  getFocusDistance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  /**
   * Switch focus target while preserving current zoom (distance to target)
   * and view direction. Fin mode snaps to the Starship forward-fin mount.
   */
  setMode(mode: CameraMode): void {
    this.applyFocus(mode, /* frame */ false);
  }

  /**
   * Focus on a body/object and zoom so it fills a comfortable fraction of the
   * view (distance scales with object size). Double-tap number keys use this.
   */
  frameMode(mode: CameraMode): void {
    this.applyFocus(mode, /* frame */ true);
  }

  /**
   * @param frame when true, set distance from characteristic size; when false,
   *   keep the current camera–target distance (with a Sun minimum pull-back).
   */
  private applyFocus(mode: CameraMode, frame: boolean): void {
    if (mode === "free") {
      this.focus = "free";
      this.controls.enabled = true;
      this.applyClipPlanes();
      return;
    }

    if (mode === "fin") {
      this.focus = "fin";
      this.controls.enabled = false;
      this.applyClipPlanes();
      this.applyFinCam();
      return;
    }

    this.controls.enabled = true;

    const prevDist = Math.max(
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

    let dist: number;
    if (frame) {
      dist = this.frameDistanceFor(mode);
    } else if (mode === "sun") {
      // Cislunar zooms are tiny next to the Sun — pull back so the disc frames.
      dist = Math.max(prevDist, SUN_DEFAULT_DIST);
    } else {
      dist = prevDist;
    }

    dist = Math.max(
      this.controls.minDistance,
      Math.min(this.controls.maxDistance, dist),
    );
    this.camera.position
      .copy(this.desiredTarget)
      .addScaledVector(this.tmp, dist);
    // Keep current up (may be tumbled) so focus switch does not reset pitch
    this.camera.lookAt(this.controls.target);
    this.syncOrbitControlsUp();
    this.controls.update();
  }

  /**
   * Orbit distance so a sphere of `radiusKm` fills ~`fill` of the vertical FOV
   * (diameter). Works for bodies and for half-length of elongated craft.
   */
  private distanceForRadius(radiusKm: number, fill = 0.62): number {
    const halfAngle =
      THREE.MathUtils.degToRad(this.camera.fov) * fill * 0.5;
    return radiusKm / Math.tan(Math.max(halfAngle, 1e-4));
  }

  /** Characteristic framing distance (km) for each focus target. */
  private frameDistanceFor(mode: CameraMode): number {
    switch (mode) {
      case "sun":
        return this.distanceForRadius(R_SUN, 0.7);
      case "earth":
        return this.distanceForRadius(R_EARTH, 0.65);
      case "moon":
        return this.distanceForRadius(R_MOON, 0.65);
      case "chase": {
        // Full stack length as “diameter”; slightly longer lens for readability
        const len = craftLengthKm(false);
        return this.distanceForRadius(len * 0.5, 0.45);
      }
      case "starbase":
        // Tower ~146 m + stack — frame the pad complex, not the whole Earth
        return this.distanceForRadius(0.12, 0.5);
      case "fin":
      case "free":
      default:
        return this.getFocusDistance();
    }
  }

  /**
   * Orbit hold keys around the focus:
   * - Q/E — azimuth about ecliptic north (fixed elevation to orbital plane);
   *   tumbles up with the same rotation so pitch attitude is kept
   * - R/F — pitch about camera-right, tumbling up (allows upside-down)
   */
  setOrbitKey(key: "q" | "e" | "r" | "f", down: boolean): CameraMode {
    if (key === "q") this.orbitQ = down;
    else if (key === "e") this.orbitE = down;
    else if (key === "r") this.orbitR = down;
    else this.orbitF = down;
    return this.focus;
  }

  /** WASD pan; drops body tracking so the slide sticks. */
  setPanKey(key: "w" | "a" | "s" | "d", down: boolean): CameraMode {
    if (key === "w") this.panW = down;
    else if (key === "a") this.panA = down;
    else if (key === "s") this.panS = down;
    else this.panD = down;
    if (down && this.focus !== "free") {
      this.focus = "free";
      this.controls.enabled = true;
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
    this.controls.minDistance = this.focus === "sun" ? SUN_MIN_DIST : 0.05;
    this.camera.near =
      this.focus === "chase" ||
      this.focus === "starbase" ||
      this.focus === "fin"
        ? 0.0002
        : 0.1;
    this.camera.far = FAR_SOLAR;
    this.camera.updateProjectionMatrix();
  }

  private computeTarget(mode: CameraMode, outTarget: THREE.Vector3): void {
    const b = bodyPositions(this.simTime);

    switch (mode) {
      case "free":
      case "fin":
        break;

      case "sun":
        outTarget.set(b.sun.x, b.sun.y, b.sun.z);
        break;

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

  /**
   * Lock camera to the Starship starboard forward flap, looking aft at the
   * engine bells (craft +Z = nose, −Z = engines).
   */
  private applyFinCam(): void {
    if (!this.craft) return;
    const mount = this.craft.getObjectByName("fin-cam");
    const look = this.craft.getObjectByName("fin-cam-look");
    if (!mount || !look) return;

    this.craft.updateMatrixWorld(true);
    mount.getWorldPosition(this.finPos);
    look.getWorldPosition(this.finLook);
    // Craft local +Y as camera up (flap plane / radial-ish when upright)
    this.finUp.set(0, 1, 0).transformDirection(this.craft.matrixWorld);
    if (this.finUp.lengthSq() < 1e-12) this.finUp.copy(ECLIPTIC_NORTH);

    this.camera.position.copy(this.finPos);
    this.camera.up.copy(this.finUp);
    this.camera.lookAt(this.finLook);
    this.controls.target.copy(this.finLook);
    this.syncOrbitControlsUp();
  }

  /** Keep target on the focused body; slide the camera with it. */
  private trackFocus(): void {
    if (this.focus === "free" || this.focus === "fin") return;

    this.prevTarget.copy(this.controls.target);
    this.computeTarget(this.focus, this.desiredTarget);
    this.tmp.copy(this.desiredTarget).sub(this.prevTarget);
    this.controls.target.copy(this.desiredTarget);
    this.camera.position.add(this.tmp);
  }

  private applyOrbit(dt: number): void {
    // Q/E: azimuth about ecliptic north; R/F: pitch about camera-right (tumble)
    const camYaw = (this.orbitE ? 1 : 0) - (this.orbitQ ? 1 : 0);
    const pitch = (this.orbitR ? 1 : 0) - (this.orbitF ? 1 : 0);
    if ((camYaw === 0 && pitch === 0) || dt <= 0) return;

    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);

    if (camYaw !== 0) {
      // Revolve about ecliptic north — elevation to the orbital plane fixed.
      // Carry camera.up with the same spin so any R/F tumble is preserved
      // (without that, Q/E would bank the horizon).
      this.orbitQuat.setFromAxisAngle(
        ECLIPTIC_NORTH,
        camYaw * ORBIT_RAD_PER_S * dt,
      );
      this.orbitOffset.applyQuaternion(this.orbitQuat);
      this.camera.up.applyQuaternion(this.orbitQuat).normalize();
      this.syncOrbitControlsUp();
    }

    if (pitch !== 0) {
      // Pitch about camera right and tumble `up` with it so R/F can go
      // smoothly over the poles without OrbitControls' polar snap.
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

    // Fin mount is fully locked to the craft; skip free orbit / pan / zoom.
    if (this.focus === "fin") {
      this.applyFinCam();
      return;
    }

    this.trackFocus();
    this.applyPan(dt);
    this.applyZoom(dt);
    // OrbitControls first (mouse / damping), then Q/E/R/F so keyboard
    // orbit is not overwritten by damping. Mouse uses spherical coords about
    // camera.up (no view-axis roll); R/F may tumble that up.
    this.controls.update();
    this.applyOrbit(dt);
  }
}
