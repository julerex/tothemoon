import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AU, R_EARTH, R_MOON, R_SUN } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { starbasePadState } from "../physics/earthFrame";
import { craftLengthKm } from "../scene/craft";
import {
  pushOutsideSpheres,
  solarSystemExclusionSpheres,
  SURFACE_CLEARANCE_KM,
} from "./surfaceClamp";

/**
 * Focus preset — camera stays free; these only choose what to track.
 * `"free"` is internal (no subject co-motion); not shown in the UI.
 * Pan / orbit / zoom keep the current focus and ride along with it, preserving
 * any look-target offset from the subject center.
 * `"fin"` is a locked mount on the Starship forward fin (aft-looking).
 * `"gridfin"` is a locked mount on a Super Heavy top grid fin (aft-looking).
 * `"trench"` is a locked under-pad / flame-trench angle on the booster engines.
 */
export type CameraMode =
  | "free"
  | "sun"
  | "earth"
  | "chase"
  | "moon"
  | "starbase"
  | "fin"
  | "gridfin"
  | "trench";

/**
 * Flame-trench cam (km, pad ENU): stand north of the OLM, slightly below the
 * deck, a little west so the engine bells read as a side cluster rather than
 * head-on under the stack.
 */
const TRENCH_NORTH_KM = 0.032;
const TRENCH_EAST_KM = -0.016;
const TRENCH_UP_KM = -0.011;
/** Look a few meters above the engine plane so Raptors fill the frame. */
const TRENCH_LOOK_UP_KM = 0.006;

/** Ecliptic / orbital north in this theater. */
const ECLIPTIC_NORTH = new THREE.Vector3(0, 0, 1);
/** OrbitControls maps camera.up → +Y internally. */
const ORBIT_Y_UP = new THREE.Vector3(0, 1, 0);

/** Q/E orbit and R/F pitch rates around the focus (rad/s). */
const ORBIT_RAD_PER_S = 1.15;
/**
 * WASD pan rate as a fraction of focus distance per second.
 * Kept modest so pad / craft framing (~0.5 km) does not fly off in one key hold.
 */
const PAN_DIST_PER_S = 0.28;
/**
 * Floor so pan still moves when nearly on top of the target (km/s).
 * ~8 m/s — enough to crawl around the OLM without skipping the pad.
 */
const PAN_MIN_SPEED = 0.008;
/** Cap so deep-space pan does not become unusable after the rate cut. */
const PAN_MAX_SPEED = 80_000;
/** Z/X zoom rate (exponential distance scale per second). */
const ZOOM_RATE = 1.4;
/** Wall-clock seconds for Auto-cam / guided distance ease. */
const DIST_EASE_S = 0.7;
/**
 * Chase look-ahead time (s): target sits this far along velocity so coast
 * reads as “going somewhere” rather than pinned on the mesh.
 */
const CHASE_LOOKAHEAD_S = 1.6;
/** Min / max look-ahead distance (km). */
const CHASE_LOOKAHEAD_MIN_KM = 0.03;
const CHASE_LOOKAHEAD_MAX_FRAC = 5; // × craft length
/**
 * Max bank angle (rad) from lateral velocity — gentle, not a fighter jet.
 * Applied only in chase focus.
 */
const CHASE_BANK_MAX = 0.22;
/** Bank blend rate (1/s) toward the desired bank. */
const CHASE_BANK_RATE = 2.2;
/**
 * Widen chase framing when Earth-relative speed is high so the ship doesn’t
 * become a sub-pixel streak at orbital class |v|.
 */
const CHASE_SPEED_WIDEN_V0 = 1.5; // km/s
const CHASE_SPEED_WIDEN_MAX = 2.4; // frame distance multiplier

const FAR_SOLAR = AU * 4;
/**
 * Opening shot: elevation above the local horizon at Starbase (45°).
 * Camera sits on a surface-relative ray so the pad reads as ground, not
 * ecliptic-tilted space.
 */
const PAD_OPENING_ELEV = Math.PI / 4;
/** Closest comfortable orbit around the Sun (outside outer corona). */
const SUN_MIN_DIST = R_SUN * 2.5;
/** Default framing distance when switching to Sun from a much closer zoom. */
const SUN_DEFAULT_DIST = R_SUN * 8;

export class CameraDirector {
  readonly controls: OrbitControls;
  /** What we track; OrbitControls stay enabled in every focus. */
  private focus: CameraMode = "starbase";
  private readonly desiredTarget = new THREE.Vector3();
  /**
   * World position of the tracked subject last frame. Used so pan/orbit offsets
   * stick while the camera still co-moves with Earth / craft / Moon / pad.
   */
  private readonly trackAnchor = new THREE.Vector3();
  private trackAnchorValid = false;
  private readonly tmp = new THREE.Vector3();
  private readonly orbitOffset = new THREE.Vector3();
  private readonly panRight = new THREE.Vector3();
  private readonly panOffset = new THREE.Vector3();
  private readonly orbitQuat = new THREE.Quaternion();
  /** Local surface up / east at the pad (opening shot + upright framing). */
  private readonly padUp = new THREE.Vector3();
  private readonly padEast = new THREE.Vector3();
  /** Scratch for body-surface exclusion after orbit / pan / zoom. */
  private readonly surfaceClampPos = new THREE.Vector3();
  private orbitQ = false;
  private orbitE = false;
  private orbitR = false;
  private orbitF = false;
  /** View-axis roll (C / V). */
  private orbitC = false;
  private orbitV = false;
  private panW = false;
  private panA = false;
  private panS = false;
  private panD = false;
  private zoomZ = false;
  private zoomX = false;
  private readonly craftPos = new THREE.Vector3();
  private readonly craftVel = new THREE.Vector3();
  private craft: THREE.Object3D | null = null;
  /** Detached Super Heavy (StagingFx); preferred host for grid-fin cam after stage-out. */
  private detachedBooster: THREE.Object3D | null = null;
  private simTime = 0;
  private epoch: EphemerisEpoch = DEFAULT_EPHEMERIS;
  private readonly finPos = new THREE.Vector3();
  private readonly finLook = new THREE.Vector3();
  private readonly finUp = new THREE.Vector3();
  /** Scratch for chase bank (look / right / desired up). */
  private readonly chaseLook = new THREE.Vector3();
  private readonly chaseRight = new THREE.Vector3();
  private readonly chaseUpDesired = new THREE.Vector3();
  /** 0…1 distance ease; 1 = idle. */
  private distEaseU = 1;
  private distEaseFrom = 0;
  private distEaseTo = 0;
  /** Fired when the user starts mouse orbit / pan / zoom on the canvas. */
  private onUserControl: (() => void) | null = null;

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

    // Slightly calmer mouse pan at all ranges (still scales with distance).
    this.controls.panSpeed = 0.55;
    this.controls.screenSpacePanning = true;

    this.controls.addEventListener("start", () => {
      this.cancelDistanceEase();
      // Keep subject tracking (co-motion with offset). Only cancel guided
      // distance ease so mouse pan/orbit is not fought by a radius lerp.
      this.onUserControl?.();
    });

    this.applyPadOpeningShot();
    this.applyClipPlanes();
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /**
   * Register a callback for intentional mouse control (orbit / pan / zoom).
   * Used to turn Auto-cam off so guided cuts do not fight user framing.
   */
  setOnUserControl(cb: (() => void) | null): void {
    this.onUserControl = cb;
  }

  /** Abort an in-progress framed-distance ease. */
  cancelDistanceEase(): void {
    this.distEaseU = 1;
  }

  /** Mission ephemeris for bodyPositions / pad state (must match theater bake). */
  setEpoch(epoch: EphemerisEpoch): void {
    this.epoch = epoch;
  }

  /**
   * Re-seat the pad opening shot at mission time `t` (may be negative during
   * the T− countdown). Call after the first prelaunch state apply so the
   * camera and stack share the same Earth-fixed epoch.
   */
  snapPadOpening(t: number): void {
    this.simTime = t;
    this.cancelDistanceEase();
    this.applyPadOpeningShot();
    this.applyClipPlanes();
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  /** Craft root (for fin-cam attachment). Call once after createCraft. */
  setCraft(craft: THREE.Object3D): void {
    this.craft = craft;
  }

  /**
   * Detached Super Heavy free-flyer (StagingFx). Grid-fin cam prefers this
   * while visible after stage-out; falls back to the stack booster otherwise.
   */
  setDetachedBooster(booster: THREE.Object3D | null): void {
    this.detachedBooster = booster;
  }

  /**
   * Starbase pad opening: look at the launch complex from 45° above the local
   * horizon, with camera.up = surface normal so the ground reads level.
   * Azimuth is from the west (inland) so the Gulf sits behind the stack.
   *
   * Uses {@link simTime} so prelaunch (t < 0) seats the camera on the same
   * pad epoch as the stack — Earth moves ~30 km/s, so a T−2:00 craft at
   * pad(t) is thousands of km from pad(0).
   */
  private applyPadOpeningShot(): void {
    this.focus = "starbase";
    const pad = starbasePadState(this.simTime, this.epoch);
    this.desiredTarget.set(pad.pos.x, pad.pos.y, pad.pos.z);
    this.padUp.set(pad.up.x, pad.up.y, pad.up.z).normalize();
    this.padEast.set(pad.east.x, pad.east.y, pad.east.z).normalize();

    // Horizontal look-from: west of the pad (−east). Projected east is already
    // tangent; flip for inland → seaward framing of Starbase.
    this.orbitOffset.copy(this.padEast).multiplyScalar(-1);
    if (this.orbitOffset.lengthSq() < 1e-12) {
      // Degenerate east (pole) — any horizontal basis
      this.orbitOffset.set(1, 0, 0);
      this.orbitOffset.addScaledVector(
        this.padUp,
        -this.orbitOffset.dot(this.padUp),
      );
      if (this.orbitOffset.lengthSq() < 1e-12) this.orbitOffset.set(0, 1, 0);
      this.orbitOffset.normalize();
    }

    // 45° elevation: cos·horizon + sin·up
    this.tmp
      .copy(this.orbitOffset)
      .multiplyScalar(Math.cos(PAD_OPENING_ELEV));
    this.tmp.addScaledVector(this.padUp, Math.sin(PAD_OPENING_ELEV));
    this.tmp.normalize();

    const dist = this.frameDistanceFor("starbase");
    this.camera.position
      .copy(this.desiredTarget)
      .addScaledVector(this.tmp, dist);
    this.controls.target.copy(this.desiredTarget);
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
    // Upright vs local ground (not ecliptic north)
    this.camera.up.copy(this.padUp);
    this.syncOrbitControlsUp();
    this.camera.lookAt(this.controls.target);
    this.clampOutsideBodies();
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
    this.cancelDistanceEase();
    this.applyFocus(mode, /* frame */ false);
  }

  /**
   * Focus on a body/object and zoom so it fills a comfortable fraction of the
   * view (distance scales with object size). Double-tap number keys use this.
   */
  frameMode(mode: CameraMode, frameScale = 1): void {
    this.cancelDistanceEase();
    this.applyFocus(mode, /* frame */ true, frameScale);
  }

  /**
   * Auto-cam cut: switch focus immediately (tracking stays live) and ease the
   * camera–target distance to the framed size over ~0.7 s wall-clock.
   */
  easeToMode(
    mode: CameraMode,
    opts?: { frame?: boolean; frameScale?: number },
  ): void {
    const frame = opts?.frame ?? true;
    const frameScale = opts?.frameScale ?? 1;

    if (
      mode === "fin" ||
      mode === "gridfin" ||
      mode === "trench" ||
      mode === "free" ||
      !frame
    ) {
      this.cancelDistanceEase();
      this.applyFocus(mode, frame, frameScale);
      return;
    }

    // Track the new subject now; only the orbit radius eases.
    this.applyFocus(mode, /* frame */ false);
    const from = Math.max(
      this.controls.minDistance,
      this.camera.position.distanceTo(this.controls.target),
    );
    const to = Math.max(
      this.controls.minDistance,
      Math.min(
        this.controls.maxDistance,
        this.frameDistanceFor(mode) * frameScale,
      ),
    );
    this.distEaseFrom = from;
    this.distEaseTo = to;
    this.distEaseU = from === to ? 1 : 0;
  }

  /**
   * @param frame when true, set distance from characteristic size; when false,
   *   keep the current camera–target distance (with a Sun minimum pull-back).
   * @param frameScale multiplies framed distance (wide cislunar overview, etc.).
   */
  private applyFocus(
    mode: CameraMode,
    frame: boolean,
    frameScale = 1,
  ): void {
    if (mode === "free") {
      this.focus = "free";
      this.trackAnchorValid = false;
      this.controls.enabled = true;
      this.applyClipPlanes();
      return;
    }

    if (mode === "fin") {
      this.focus = "fin";
      this.trackAnchorValid = false;
      this.controls.enabled = false;
      this.applyClipPlanes();
      this.applyFinCam();
      return;
    }

    if (mode === "gridfin") {
      this.focus = "gridfin";
      this.trackAnchorValid = false;
      this.controls.enabled = false;
      this.applyClipPlanes();
      this.applyGridFinCam();
      return;
    }

    if (mode === "trench") {
      this.focus = "trench";
      this.trackAnchorValid = false;
      this.controls.enabled = false;
      this.applyClipPlanes();
      this.applyTrenchCam();
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
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;

    let dist: number;
    if (frame) {
      dist = this.frameDistanceFor(mode) * frameScale;
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
    this.clampOutsideBodies();
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
        // Full stack length as “diameter”; slightly longer lens for readability.
        // Widen when |v| is high so Auto-cam cuts stay readable at orbital speed.
        const len = craftLengthKm(false);
        const speed = this.craftVel.length();
        const widen =
          speed <= CHASE_SPEED_WIDEN_V0
            ? 1
            : THREE.MathUtils.clamp(
                1 + (speed - CHASE_SPEED_WIDEN_V0) * 0.12,
                1,
                CHASE_SPEED_WIDEN_MAX,
              );
        return this.distanceForRadius(len * 0.5 * widen, 0.45);
      }
      case "starbase":
        // Tower ~146 m + stack — frame the pad complex, not the whole Earth
        return this.distanceForRadius(0.12, 0.5);
      case "trench":
        // ~40 m standoff under the OLM
        return this.distanceForRadius(0.02, 0.55);
      case "fin":
      case "gridfin":
      case "free":
      default:
        return this.getFocusDistance();
    }
  }

  /**
   * Orbit hold keys around the focus:
   * - Q/E — yaw about camera.up (view-relative; elevation vs local up fixed)
   * - R/F — pitch about camera-right, tumbling up (allows upside-down)
   * - C/V — roll about the view axis (camera → focus), tumbling up
   */
  setOrbitKey(
    key: "q" | "e" | "r" | "f" | "c" | "v",
    down: boolean,
  ): CameraMode {
    if (key === "q") this.orbitQ = down;
    else if (key === "e") this.orbitE = down;
    else if (key === "r") this.orbitR = down;
    else if (key === "f") this.orbitF = down;
    else if (key === "c") this.orbitC = down;
    else this.orbitV = down;
    return this.focus;
  }

  /**
   * WASD pan in the view plane. Keeps the current focus so the camera still
   * co-moves with Earth / craft / Moon / pad; the pan is a sticky offset.
   */
  setPanKey(key: "w" | "a" | "s" | "d", down: boolean): CameraMode {
    if (key === "w") this.panW = down;
    else if (key === "a") this.panA = down;
    else if (key === "s") this.panS = down;
    else this.panD = down;
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
    // Body-centered focuses: OrbitControls radius is distance to center, so a
    // surface floor stops zoom-through. Pad / chase / free use a small floor
    // and rely on {@link clampOutsideBodies} for mesh exclusion.
    if (this.focus === "sun") {
      this.controls.minDistance = SUN_MIN_DIST;
    } else if (this.focus === "earth") {
      this.controls.minDistance = R_EARTH + SURFACE_CLEARANCE_KM;
    } else if (this.focus === "moon") {
      this.controls.minDistance = R_MOON + SURFACE_CLEARANCE_KM;
    } else {
      this.controls.minDistance = 0.05;
    }
    this.camera.near =
      this.focus === "chase" ||
      this.focus === "starbase" ||
      this.focus === "fin" ||
      this.focus === "gridfin" ||
      this.focus === "trench"
        ? 0.0002
        : 0.1;
    this.camera.far = FAR_SOLAR;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Push the camera outside Sun / Earth / Moon meshes. Call after any free
   * orbit, pan, zoom, or track step. Fin mounts stay on the craft and skip this.
   */
  private clampOutsideBodies(): void {
    const b = bodyPositions(this.simTime, this.epoch);
    const spheres = solarSystemExclusionSpheres(b.sun, b.earth, b.moon, {
      sun: R_SUN,
      earth: R_EARTH,
      moon: R_MOON,
    });
    this.surfaceClampPos.copy(this.camera.position);
    const moved = pushOutsideSpheres(
      this.surfaceClampPos,
      spheres,
      this.surfaceClampPos,
    );
    if (!moved) return;
    this.camera.position.copy(this.surfaceClampPos);
    // Keep the focus under the crosshair after a radial push
    this.camera.lookAt(this.controls.target);
  }

  private computeTarget(mode: CameraMode, outTarget: THREE.Vector3): void {
    const b = bodyPositions(this.simTime, this.epoch);

    switch (mode) {
      case "free":
      case "fin":
      case "gridfin":
        break;

      case "sun":
        outTarget.set(b.sun.x, b.sun.y, b.sun.z);
        break;

      case "earth":
        outTarget.set(b.earth.x, b.earth.y, b.earth.z);
        break;

      case "chase":
        this.chaseTarget(outTarget);
        break;

      case "moon":
        outTarget.set(b.moon.x, b.moon.y, b.moon.z);
        break;

      case "starbase": {
        const pad = starbasePadState(this.simTime, this.epoch);
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

  /**
   * Lock camera to a Super Heavy top grid fin, looking aft at the Raptors.
   * Prefers the detached free-flyer after stage-out when it is visible.
   */
  private applyGridFinCam(): void {
    const host = this.resolveGridFinHost();
    if (!host) return;

    const mount = host.getObjectByName("grid-fin-cam");
    const look = host.getObjectByName("grid-fin-cam-look");
    if (!mount || !look) return;

    // Refresh stack + free-flyer world matrices (director runs before render)
    this.craft?.updateMatrixWorld(true);
    this.detachedBooster?.updateMatrixWorld(true);
    mount.getWorldPosition(this.finPos);
    look.getWorldPosition(this.finLook);
    // Booster local +Y = outboard through the +Y grid fin (radial up when upright)
    this.finUp.set(0, 1, 0).transformDirection(host.matrixWorld);
    if (this.finUp.lengthSq() < 1e-12) this.finUp.copy(ECLIPTIC_NORTH);

    this.camera.position.copy(this.finPos);
    this.camera.up.copy(this.finUp);
    this.camera.lookAt(this.finLook);
    this.controls.target.copy(this.finLook);
    this.syncOrbitControlsUp();
  }

  /**
   * Flame-trench angle: under the OLM deck, offset to the side, looking at
   * the Super Heavy engine bells. Pad-fixed mount so the stack rises out of
   * frame on liftoff (classic webcast under-pad shot).
   */
  private applyTrenchCam(): void {
    const pad = starbasePadState(this.simTime, this.epoch);
    this.padUp.set(pad.up.x, pad.up.y, pad.up.z).normalize();
    this.padEast.set(pad.east.x, pad.east.y, pad.east.z).normalize();
    // Geographic north = up × east (right-handed ENU)
    this.tmp.crossVectors(this.padUp, this.padEast);
    if (this.tmp.lengthSq() < 1e-12) {
      this.tmp.set(0, 1, 0).addScaledVector(this.padUp, -this.padUp.y);
      if (this.tmp.lengthSq() < 1e-12) this.tmp.set(1, 0, 0);
    }
    this.tmp.normalize();

    // Mount under the deck, north + slightly west of the stack centerline
    this.finPos
      .set(pad.pos.x, pad.pos.y, pad.pos.z)
      .addScaledVector(this.tmp, TRENCH_NORTH_KM)
      .addScaledVector(this.padEast, TRENCH_EAST_KM)
      .addScaledVector(this.padUp, TRENCH_UP_KM);

    // Look at engine plane (craft origin) a little above the bells
    this.finLook.copy(this.craftPos).addScaledVector(this.padUp, TRENCH_LOOK_UP_KM);

    // Prefer pad-up so the deck reads level; fall back if degenerate
    this.finUp.copy(this.padUp);
    // If looking nearly along up (stack high above), keep a stable roll from north
    this.camera.position.copy(this.finPos);
    this.camera.up.copy(this.finUp);
    this.camera.lookAt(this.finLook);
    this.controls.target.copy(this.finLook);
    this.syncOrbitControlsUp();
  }

  /**
   * Chase focus: craft position with a short look-ahead along velocity so the
   * path reads as motion (especially free coast).
   */
  private chaseTarget(out: THREE.Vector3): void {
    out.copy(this.craftPos);
    const sp = this.craftVel.length();
    if (sp < 0.02) return;
    const len = craftLengthKm(false);
    const ahead = THREE.MathUtils.clamp(
      sp * CHASE_LOOKAHEAD_S,
      CHASE_LOOKAHEAD_MIN_KM,
      Math.max(CHASE_LOOKAHEAD_MIN_KM, len * CHASE_LOOKAHEAD_MAX_FRAC),
    );
    out.addScaledVector(this.craftVel, ahead / sp);
  }

  /**
   * Gentle bank in chase: roll toward lateral velocity about the look axis so
   * ascent turns and loft don’t stay perfectly level (webcast feel). Desired
   * up is absolute (ecliptic north ⟂ look + bank), so it does not accumulate
   * frame-to-frame. C/V still work; this only blends toward the bank target.
   */
  private applyChaseBank(dt: number): void {
    if (this.focus !== "chase" || dt <= 0) return;
    const sp = this.craftVel.length();
    if (sp < 0.05) return;

    this.chaseLook.copy(this.controls.target).sub(this.camera.position);
    if (this.chaseLook.lengthSq() < 1e-12) return;
    this.chaseLook.normalize();

    // Level reference: ecliptic north projected ⟂ look
    this.chaseUpDesired.copy(ECLIPTIC_NORTH);
    this.chaseUpDesired.addScaledVector(
      this.chaseLook,
      -this.chaseUpDesired.dot(this.chaseLook),
    );
    if (this.chaseUpDesired.lengthSq() < 1e-12) {
      this.chaseUpDesired.set(0, 1, 0);
      this.chaseUpDesired.addScaledVector(
        this.chaseLook,
        -this.chaseUpDesired.dot(this.chaseLook),
      );
    }
    if (this.chaseUpDesired.lengthSq() < 1e-12) return;
    this.chaseUpDesired.normalize();

    // Right from level frame
    this.chaseRight.crossVectors(this.chaseLook, this.chaseUpDesired);
    if (this.chaseRight.lengthSq() < 1e-12) return;
    this.chaseRight.normalize();

    // Lateral speed along level-right (km/s) → bank angle (absolute)
    const lateral = this.craftVel.dot(this.chaseRight);
    const bank = THREE.MathUtils.clamp(
      lateral * 0.08,
      -CHASE_BANK_MAX,
      CHASE_BANK_MAX,
    );
    if (Math.abs(bank) > 1e-4) {
      this.orbitQuat.setFromAxisAngle(this.chaseLook, bank);
      this.chaseUpDesired.applyQuaternion(this.orbitQuat).normalize();
    }

    const u = 1 - Math.exp(-CHASE_BANK_RATE * dt);
    this.camera.up.lerp(this.chaseUpDesired, u).normalize();
    this.syncOrbitControlsUp();
  }

  /**
   * Pick the active Super Heavy mesh for the grid-fin mount:
   * visible free-flyer → stack booster if visible → free-flyer → stack.
   */
  private resolveGridFinHost(): THREE.Object3D | null {
    const detached = this.detachedBooster;
    if (detached?.visible) return detached;

    const stackBooster = this.craft?.getObjectByName("booster") ?? null;
    if (stackBooster?.visible) return stackBooster;

    if (detached) return detached;
    return stackBooster ?? this.craft;
  }

  /**
   * Co-move camera + OrbitControls target with the focused subject.
   * Applies only the subject’s motion delta so a pan/orbit offset from the
   * subject center is preserved (no snap back to body/craft origin).
   */
  private trackFocus(): void {
    if (
      this.focus === "free" ||
      this.focus === "fin" ||
      this.focus === "gridfin" ||
      this.focus === "trench"
    )
      return;

    this.computeTarget(this.focus, this.desiredTarget);
    if (this.trackAnchorValid) {
      this.tmp.copy(this.desiredTarget).sub(this.trackAnchor);
      this.controls.target.add(this.tmp);
      this.camera.position.add(this.tmp);
    } else {
      // First track after a non-tracked mode: seat look target on the subject.
      this.controls.target.copy(this.desiredTarget);
    }
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
  }

  private applyOrbit(dt: number): void {
    // Q/E: yaw about camera.up; R/F: pitch about camera-right;
    // C/V: roll about the view axis (camera → target).
    const camYaw = (this.orbitE ? 1 : 0) - (this.orbitQ ? 1 : 0);
    const pitch = (this.orbitR ? 1 : 0) - (this.orbitF ? 1 : 0);
    // C = roll left (CCW on screen), V = roll right
    const roll = (this.orbitC ? 1 : 0) - (this.orbitV ? 1 : 0);
    if ((camYaw === 0 && pitch === 0 && roll === 0) || dt <= 0) return;
    // Keyboard orbit is fine with Auto-cam; only cancel the radius ease so
    // Q/E/R/F/C/V are not fighting a distance lerp.
    this.cancelDistanceEase();

    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);

    if (camYaw !== 0) {
      // Yaw about current camera.up — same pole as mouse orbit / after C/V roll.
      // Axis is fixed for this step (not spun with the offset); elev vs up stays.
      this.tmp.copy(this.camera.up);
      if (this.tmp.lengthSq() > 1e-12) {
        this.tmp.normalize();
        this.orbitQuat.setFromAxisAngle(
          this.tmp,
          camYaw * ORBIT_RAD_PER_S * dt,
        );
        this.orbitOffset.applyQuaternion(this.orbitQuat);
        // up is the rotation axis — direction unchanged; still normalize for safety
        this.camera.up.applyQuaternion(this.orbitQuat).normalize();
        this.syncOrbitControlsUp();
      }
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

    if (roll !== 0) {
      // Roll: spin camera.up about the look axis (target ← camera).
      // Position stays fixed; only the horizon banks.
      this.tmp.copy(this.controls.target).sub(this.camera.position);
      if (this.tmp.lengthSq() > 1e-12) {
        this.tmp.normalize();
        // Positive angle = CCW when looking along the view (C = left bank)
        this.orbitQuat.setFromAxisAngle(
          this.tmp,
          roll * ORBIT_RAD_PER_S * dt,
        );
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
   * Slide camera + target in the camera's view plane (screen-space style).
   * W/S along look projected ⟂ camera.up; A/D along camera-right.
   * Matches what you see at Starbase (pad-up) rather than the ecliptic plane.
   */
  private applyPan(dt: number): void {
    const fwd = (this.panW ? 1 : 0) - (this.panS ? 1 : 0);
    // D = screen-right, A = screen-left (standard)
    const right = (this.panD ? 1 : 0) - (this.panA ? 1 : 0);
    if ((fwd === 0 && right === 0) || dt <= 0) return;
    this.cancelDistanceEase();

    const dist = this.camera.position.distanceTo(this.controls.target);
    const speed = Math.min(
      Math.max(dist * PAN_DIST_PER_S, PAN_MIN_SPEED),
      PAN_MAX_SPEED,
    );

    // Forward = look direction flattened onto the camera's horizon (⟂ up)
    this.tmp.copy(this.controls.target).sub(this.camera.position);
    this.tmp.addScaledVector(
      this.camera.up,
      -this.tmp.dot(this.camera.up),
    );
    if (this.tmp.lengthSq() < 1e-12) {
      // Looking along up — use world axis least aligned with up
      this.tmp.set(1, 0, 0);
      this.tmp.addScaledVector(
        this.camera.up,
        -this.tmp.dot(this.camera.up),
      );
      if (this.tmp.lengthSq() < 1e-12) this.tmp.set(0, 1, 0);
    }
    this.tmp.normalize();
    // Screen-right = up × forward (RH, matches camera.matrixWorld column 0 sense)
    this.panRight.crossVectors(this.camera.up, this.tmp);
    if (this.panRight.lengthSq() < 1e-12) {
      this.panRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    }
    this.panRight.normalize();

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
    this.cancelDistanceEase();

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
    craftVel: THREE.Vector3,
  ): void {
    this.simTime = simTime;
    this.craftPos.copy(craftPos);
    this.craftVel.copy(craftVel);

    // Locked mounts: skip free orbit / pan / zoom / surface clamp.
    if (this.focus === "fin") {
      this.applyFinCam();
      return;
    }
    if (this.focus === "gridfin") {
      this.applyGridFinCam();
      return;
    }
    if (this.focus === "trench") {
      this.applyTrenchCam();
      return;
    }

    this.trackFocus();
    this.applyDistanceEase(dt);
    this.applyPan(dt);
    this.applyZoom(dt);
    // OrbitControls first (mouse / damping), then Q/E/R/F so keyboard
    // orbit is not overwritten by damping. Mouse uses spherical coords about
    // camera.up (no view-axis roll); R/F may tumble that up.
    this.controls.update();
    this.applyOrbit(dt);
    // Soft chase bank after orbit so C/V still win for a frame, then blend.
    this.applyChaseBank(dt);
    // After all free motion: never sit under a planet/star mesh.
    // Next OrbitControls.update() re-reads position → spherical, so the clamp sticks.
    this.clampOutsideBodies();
  }

  /** Ease orbit radius toward Auto-cam / guided frame distance (wall-clock). */
  private applyDistanceEase(dt: number): void {
    if (this.distEaseU >= 1 || dt <= 0) return;

    this.distEaseU = Math.min(1, this.distEaseU + dt / DIST_EASE_S);
    // Ease-out cubic
    const t = 1 - (1 - this.distEaseU) ** 3;
    const dist = THREE.MathUtils.lerp(this.distEaseFrom, this.distEaseTo, t);

    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);
    if (this.orbitOffset.lengthSq() < 1e-12) {
      this.orbitOffset.copy(ECLIPTIC_NORTH).multiplyScalar(dist);
    } else {
      this.orbitOffset.setLength(dist);
    }
    this.camera.position.copy(this.controls.target).add(this.orbitOffset);
    this.camera.lookAt(this.controls.target);
  }
}
