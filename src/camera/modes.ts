import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AU, R_EARTH, R_MOON, R_SUN } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { earthNorthPole, starbasePadState } from "../physics/earthFrame";
import { craftLengthKm } from "../scene/craft";
import {
  pushOutsideSpheres,
  solarSystemExclusionSpheres,
  SURFACE_CLEARANCE_KM,
} from "./surfaceClamp";
import {
  isHardLockedMount,
  isMountFocus,
  mountLockAfterUserControl,
  mountLockOnEnter,
  type MountFocus,
  type MountLock,
} from "./mountLock";
import { panAxesFromHeld } from "./panAxes";
import { trenchCamWorldPose } from "./trenchCam";
import { yawAxisForMode } from "./yawAxis";
import { eastFromNorthUp, enuOffsetKm, northFromEastUp } from "./enuPose";
import { THEATER_DEFAULT_FOV, type WebcastMount } from "./webcastShots";

/**
 * Focus preset — camera stays free; these only choose what to track.
 * `"free"` is internal (no subject co-motion); not shown in the UI.
 * Pan / orbit / zoom keep the current focus and ride along with it, preserving
 * any look-target offset from the subject center.
 * `"fin"` / `"gridfin"` / `"trench"` / `"hull"` start as locked mounts
 * (onboard / webcast). The first mouse or orbit/pan/zoom key leaves the lock
 * and tracks the look-at like other focuses, so Flight 13 and the lunar
 * mission share the same controls.
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
  | "trench"
  | "hull";

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
  /** Starbase pad group; trench-cam mounts are children of this. */
  private pad: THREE.Object3D | null = null;
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
  /** Extra chase look-ahead multiplier (finale ocean / dust framing). */
  private chaseLookAheadScale = 1;
  /** Extra chase look-down (km) along {@link chaseLookDownDir}. */
  private chaseLookDownKm = 0;
  private readonly chaseLookDownDir = new THREE.Vector3(0, -1, 0);
  /** Earth-fixed pad camera looking at the stack (Flight 13 ground track). */
  private padTrack = false;
  private padTrackAz = 180;
  private padTrackEl = PAD_OPENING_ELEV * (180 / Math.PI);
  private padTrackDist = 0.5;
  /** Gridfin/hull mount override for webcast engine-bay / hull-down shots. */
  private mountVariant: WebcastMount | "default" = "default";
  private chaseSubject: "ship" | "booster" = "ship";
  private readonly earthUp = new THREE.Vector3();
  private readonly earthEast = new THREE.Vector3();
  private readonly earthNorth = new THREE.Vector3();
  private readonly boosterChasePos = new THREE.Vector3();
  /** 0…1 distance ease; 1 = idle. */
  private distEaseU = 1;
  private distEaseFrom = 0;
  private distEaseTo = 0;
  /**
   * Onboard / webcast mounts reseat every frame while `"hard"`.
   * First mouse or orbit/pan/zoom key switches to `"orbit"` tracking.
   */
  private mountLock: MountLock = "orbit";
  /** Fired when the user starts mouse orbit / pan / zoom on the canvas. */
  private onUserControl: (() => void) | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, domElement);
    this.initOrbitControls();
    this.bindControlsStart();
    this.finishCameraInit();
  }

  private initOrbitControls(): void {
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.05;
    this.controls.maxDistance = AU * 3;
    this.controls.enabled = true;
    this.controls.minPolarAngle = 1e-3;
    this.controls.maxPolarAngle = Math.PI - 1e-3;
    this.controls.panSpeed = 0.55;
    this.controls.screenSpacePanning = true;
  }

  private bindControlsStart(): void {
    this.camera.up.copy(ECLIPTIC_NORTH);
    this.syncOrbitControlsUp();
    this.controls.addEventListener("start", () => {
      this.cancelDistanceEase();
      this.unlockMount();
      this.onUserControl?.();
    });
  }

  private finishCameraInit(): void {
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
   * Starbase pad group (for flame-trench cam). Call once after createStarbasePad.
   * Mounts `trench-cam` / `trench-cam-look` live on the pad group (physics pad
   * = visual pad = `STARBASE_ALT`).
   */
  setPad(pad: THREE.Object3D): void {
    this.pad = pad;
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
    this.seatPadTargetAndAxes();
    this.buildPadOpeningDirection();
    this.placePadOpeningCamera();
    this.clampOutsideBodies();
  }

  private seatPadTargetAndAxes(): void {
    const pad = starbasePadState(this.simTime, this.epoch);
    this.desiredTarget.set(pad.pos.x, pad.pos.y, pad.pos.z);
    this.padUp.set(pad.up.x, pad.up.y, pad.up.z).normalize();
    this.padEast.set(pad.east.x, pad.east.y, pad.east.z).normalize();
  }

  private buildPadOpeningDirection(): void {
    this.orbitOffset.copy(this.padEast).multiplyScalar(-1);
    this.ensureHorizontalOrbitOffset();
    this.tmp
      .copy(this.orbitOffset)
      .multiplyScalar(Math.cos(PAD_OPENING_ELEV));
    this.tmp.addScaledVector(this.padUp, Math.sin(PAD_OPENING_ELEV));
    this.tmp.normalize();
  }

  private ensureHorizontalOrbitOffset(): void {
    if (this.orbitOffset.lengthSq() >= 1e-12) return;
    this.orbitOffset.set(1, 0, 0);
    this.orbitOffset.addScaledVector(
      this.padUp,
      -this.orbitOffset.dot(this.padUp),
    );
    if (this.orbitOffset.lengthSq() < 1e-12) this.orbitOffset.set(0, 1, 0);
    this.orbitOffset.normalize();
  }

  private placePadOpeningCamera(): void {
    const dist = this.frameDistanceFor("starbase");
    this.camera.position.copy(this.desiredTarget).addScaledVector(this.tmp, dist);
    this.seatPadTrack();
    this.camera.up.copy(this.padUp);
    this.syncOrbitControlsUp();
    this.camera.lookAt(this.controls.target);
  }

  private seatPadTrack(): void {
    this.controls.target.copy(this.desiredTarget);
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
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
  /**
   * Theater chase bias (Auto-cam finales). Identity when Auto-cam is off.
   * Look-down is a world-space offset of the chase target (typically toward
   * Earth or the Moon so the horizon reads).
   */
  setChaseBias(opts: {
    lookAheadScale?: number;
    lookDownKm?: number;
    lookDownDir?: { x: number; y: number; z: number };
  }): void {
    this.chaseLookAheadScale = opts.lookAheadScale ?? 1;
    this.chaseLookDownKm = opts.lookDownKm ?? 0;
    if (opts.lookDownDir) {
      this.chaseLookDownDir.set(opts.lookDownDir.x, opts.lookDownDir.y, opts.lookDownDir.z);
      if (this.chaseLookDownDir.lengthSq() > 1e-12) this.chaseLookDownDir.normalize();
    }
  }

  setMode(mode: CameraMode): void {
    this.clearGuidedPose();
    this.cancelDistanceEase();
    this.applyFocus(mode, /* frame */ false);
  }

  /**
   * Focus on a body/object and zoom so it fills a comfortable fraction of the
   * view (distance scales with object size). Double-tap number keys use this.
   */
  frameMode(mode: CameraMode, frameScale = 1): void {
    this.clearGuidedPose();
    this.cancelDistanceEase();
    this.applyFocus(mode, /* frame */ true, frameScale);
  }

  /**
   * Auto-cam cut: switch focus immediately (tracking stays live) and ease the
   * camera–target distance to the framed size over ~0.7 s wall-clock.
   * Webcast pose cuts (azimuth / pad-track / onboard mounts) snap instantly.
   */
  private isInstantEaseMode(mode: CameraMode): boolean {
    return mode === "fin" || mode === "gridfin" || mode === "trench" ||
      mode === "hull" || mode === "free";
  }

  private beginDistanceEase(mode: CameraMode, frameScale: number): void {
    this.applyFocus(mode, /* frame */ false);
    const minD = this.controls.minDistance;
    const from = Math.max(minD, this.camera.position.distanceTo(this.controls.target));
    const to = Math.max(minD, Math.min(this.controls.maxDistance, this.frameDistanceFor(mode) * frameScale));
    this.distEaseFrom = from;
    this.distEaseTo = to;
    this.distEaseU = from === to ? 1 : 0;
  }

  /** Options for Auto-cam / bookmark guided cuts. */
  easeToMode(
    mode: CameraMode,
    opts?: {
      frame?: boolean;
      frameScale?: number;
      azimuthDeg?: number;
      elevationDeg?: number;
      padTrack?: boolean;
      mount?: WebcastMount;
      chaseSubject?: "ship" | "booster";
      fov?: number;
    },
  ): void {
    this.applyGuidedPose(opts);
    const frame = opts?.frame ?? true;
    const frameScale = opts?.frameScale ?? 1;
    const posed = this.hasSphericalPose(opts) || this.padTrack;
    if (this.isInstantEaseMode(mode) || !frame || posed) {
      this.cancelDistanceEase();
      this.applyFocus(mode, frame, frameScale, opts);
      return;
    }
    this.beginDistanceEase(mode, frameScale);
  }

  private applyGuidedPose(opts?: {
    padTrack?: boolean;
    mount?: WebcastMount;
    chaseSubject?: "ship" | "booster";
    fov?: number;
    azimuthDeg?: number;
    elevationDeg?: number;
  }): void {
    this.padTrack = !!opts?.padTrack;
    this.mountVariant = opts?.mount ?? "default";
    this.chaseSubject = opts?.chaseSubject ?? "ship";
    if (opts?.azimuthDeg != null) this.padTrackAz = opts.azimuthDeg;
    if (opts?.elevationDeg != null) this.padTrackEl = opts.elevationDeg;
    this.setVerticalFov(opts?.fov ?? THEATER_DEFAULT_FOV);
  }

  private clearGuidedPose(): void {
    this.padTrack = false;
    this.mountVariant = "default";
    this.chaseSubject = "ship";
    this.setVerticalFov(THEATER_DEFAULT_FOV);
  }

  private hasSphericalPose(opts?: { azimuthDeg?: number; elevationDeg?: number }): boolean {
    return opts?.azimuthDeg != null || opts?.elevationDeg != null;
  }

  private setVerticalFov(fov: number): void {
    const next = Number.isFinite(fov) ? fov : THEATER_DEFAULT_FOV;
    if (Math.abs(this.camera.fov - next) < 1e-6) return;
    this.camera.fov = next;
    this.camera.updateProjectionMatrix();
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
    pose?: { azimuthDeg?: number; elevationDeg?: number; frameScale?: number },
  ): void {
    if (this.applyLockedOrFreeFocus(mode, frame, frameScale)) return;
    this.controls.enabled = true;
    this.applyTrackedFocus(mode, frame, frameScale, pose);
  }

  private applyTrackedFocus(
    mode: CameraMode,
    frame: boolean,
    frameScale: number,
    pose?: { azimuthDeg?: number; elevationDeg?: number },
  ): void {
    const prevDist = this.clampedFocusDistance();
    this.captureViewDirection();
    this.seatTrackedFocus(mode);
    const dist = this.resolveFocusDistance(mode, frame, frameScale, prevDist);
    if (this.padTrack && mode === "starbase") {
      this.padTrackDist = dist;
      this.applyPadTrack();
      return;
    }
    if (this.placeWithSphericalPose(mode, dist, pose)) {
      this.snapYawUpIfNeeded();
      this.syncOrbitControlsUp();
      this.controls.update();
      this.clampOutsideBodies();
      return;
    }
    this.placeCameraAlongView(dist);
    this.snapYawUpIfNeeded();
    this.syncOrbitControlsUp();
    this.controls.update();
    this.clampOutsideBodies();
  }

  private applyLockedOrFreeFocus(
    mode: CameraMode,
    _frame: boolean,
    _frameScale: number,
  ): boolean {
    if (mode === "free") {
      this.enterFreeFocus();
      return true;
    }
    if (isMountFocus(mode)) {
      this.enterLockedMount(mode);
      return true;
    }
    return false;
  }

  private enterFreeFocus(): void {
    this.focus = "free";
    this.trackAnchorValid = false;
    this.controls.enabled = true;
    this.applyClipPlanes();
  }

  private enterLockedMount(mode: MountFocus): void {
    this.focus = mode;
    this.mountLock = mountLockOnEnter();
    this.trackAnchorValid = false;
    this.controls.enabled = true;
    this.applyClipPlanes();
    this.applyLockedMountPose();
  }

  private clampedFocusDistance(): number {
    return Math.max(
      this.controls.minDistance,
      Math.min(
        this.controls.maxDistance,
        this.camera.position.distanceTo(this.controls.target),
      ),
    );
  }

  private captureViewDirection(): void {
    this.tmp.copy(this.camera.position).sub(this.controls.target);
    if (this.tmp.lengthSq() < 1e-12) this.tmp.copy(ECLIPTIC_NORTH);
    else this.tmp.normalize();
  }

  private seatTrackedFocus(mode: CameraMode): void {
    this.focus = mode;
    this.applyClipPlanes();
    this.computeTarget(mode, this.desiredTarget);
    this.controls.target.copy(this.desiredTarget);
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
  }

  private resolveFocusDistance(
    mode: CameraMode,
    frame: boolean,
    frameScale: number,
    prevDist: number,
  ): number {
    let dist: number;
    if (frame) dist = this.frameDistanceFor(mode) * frameScale;
    else if (mode === "sun") dist = Math.max(prevDist, SUN_DEFAULT_DIST);
    else dist = prevDist;
    return Math.max(
      this.controls.minDistance,
      Math.min(this.controls.maxDistance, dist),
    );
  }

  private placeCameraAlongView(dist: number): void {
    this.camera.position
      .copy(this.desiredTarget)
      .addScaledVector(this.tmp, dist);
    this.camera.lookAt(this.controls.target);
  }

  /**
   * Place the camera on an ENU bearing around the current focus.
   * Starbase uses pad ENU; chase uses local vertical at the ship (Earth radial).
   */
  private placeWithSphericalPose(
    mode: CameraMode,
    dist: number,
    pose?: { azimuthDeg?: number; elevationDeg?: number },
  ): boolean {
    if (!this.buildEnuForMode(mode)) return false;
    const az = pose?.azimuthDeg ?? this.padTrackAz;
    const el = pose?.elevationDeg ?? this.padTrackEl;
    if (pose?.azimuthDeg == null && pose?.elevationDeg == null && !this.padTrack) {
      return false;
    }
    const off = enuOffsetKm(
      { x: this.earthEast.x, y: this.earthEast.y, z: this.earthEast.z },
      { x: this.earthNorth.x, y: this.earthNorth.y, z: this.earthNorth.z },
      { x: this.earthUp.x, y: this.earthUp.y, z: this.earthUp.z },
      az,
      el,
      dist,
    );
    this.camera.position.set(
      this.desiredTarget.x + off.x,
      this.desiredTarget.y + off.y,
      this.desiredTarget.z + off.z,
    );
    this.camera.up.copy(this.earthUp);
    this.camera.lookAt(this.controls.target);
    return true;
  }

  private buildEnuForMode(mode: CameraMode): boolean {
    if (mode === "starbase") return this.buildPadEnu();
    if (mode === "chase") return this.buildCraftEnu();
    return false;
  }

  private buildPadEnu(): boolean {
    const pad = starbasePadState(this.simTime, this.epoch);
    this.earthUp.set(pad.up.x, pad.up.y, pad.up.z).normalize();
    this.earthEast.set(pad.east.x, pad.east.y, pad.east.z).normalize();
    const n = northFromEastUp(
      { x: this.earthEast.x, y: this.earthEast.y, z: this.earthEast.z },
      { x: this.earthUp.x, y: this.earthUp.y, z: this.earthUp.z },
    );
    this.earthNorth.set(n.x, n.y, n.z);
    return true;
  }

  private buildCraftEnu(): boolean {
    const b = bodyPositions(this.simTime, this.epoch);
    this.earthUp.set(
      this.craftPos.x - b.earth.x,
      this.craftPos.y - b.earth.y,
      this.craftPos.z - b.earth.z,
    );
    if (this.earthUp.lengthSq() < 1e-12) return false;
    this.earthUp.normalize();
    const pole = earthNorthPole();
    const e = eastFromNorthUp(pole, {
      x: this.earthUp.x, y: this.earthUp.y, z: this.earthUp.z,
    });
    this.earthEast.set(e.x, e.y, e.z);
    const n = northFromEastUp(
      { x: this.earthEast.x, y: this.earthEast.y, z: this.earthEast.z },
      { x: this.earthUp.x, y: this.earthUp.y, z: this.earthUp.z },
    );
    this.earthNorth.set(n.x, n.y, n.z);
    return true;
  }

  /**
   * Ground-tracking shot: camera stays in the pad ENU frame and looks at the
   * craft so the stack climbs out of a fixed webcast-style pad camera.
   */
  private applyPadTrack(): void {
    if (!this.buildPadEnu()) return;
    const pad = starbasePadState(this.simTime, this.epoch);
    const dist = this.padTrackDist;
    const off = enuOffsetKm(
      { x: this.earthEast.x, y: this.earthEast.y, z: this.earthEast.z },
      { x: this.earthNorth.x, y: this.earthNorth.y, z: this.earthNorth.z },
      { x: this.earthUp.x, y: this.earthUp.y, z: this.earthUp.z },
      this.padTrackAz,
      this.padTrackEl,
      dist,
    );
    this.camera.position.set(pad.pos.x + off.x, pad.pos.y + off.y, pad.pos.z + off.z);
    this.desiredTarget.copy(this.craftPos);
    this.controls.target.copy(this.desiredTarget);
    this.camera.up.copy(this.earthUp);
    this.camera.lookAt(this.controls.target);
    this.syncOrbitControlsUp();
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
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
    if (mode === "sun") return this.distanceForRadius(R_SUN, 0.7);
    if (mode === "earth") return this.distanceForRadius(R_EARTH, 0.65);
    if (mode === "moon") return this.distanceForRadius(R_MOON, 0.65);
    if (mode === "chase") return this.chaseFrameDistance();
    if (mode === "starbase") return this.distanceForRadius(0.12, 0.5);
    if (mode === "trench" || mode === "hull") return this.distanceForRadius(0.02, 0.55);
    return this.getFocusDistance();
  }

  private chaseFrameDistance(): number {
    const len = craftLengthKm(false);
    const widen = this.chaseSpeedWiden();
    return this.distanceForRadius(len * 0.5 * widen, 0.45);
  }

  private chaseSpeedWiden(): number {
    const speed = this.craftVel.length();
    if (speed <= CHASE_SPEED_WIDEN_V0) return 1;
    return THREE.MathUtils.clamp(
      1 + (speed - CHASE_SPEED_WIDEN_V0) * 0.12,
      1,
      CHASE_SPEED_WIDEN_MAX,
    );
  }

  /**
   * Orbit hold keys around the focus:
   * - Q/E — yaw about the mode axis (ecliptic / Earth pole / pad up; else camera.up)
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
    if (down) this.unlockMount();
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
    if (down) this.unlockMount();
    return this.focus;
  }

  /** Z/X hold state — zoom in / out toward the focus. */
  setZoomKey(key: "z" | "x", down: boolean): CameraMode {
    if (key === "z") this.zoomZ = down;
    else this.zoomX = down;
    if (down) this.unlockMount();
    return this.focus;
  }

  private applyClipPlanes(): void {
    this.controls.maxDistance = AU * 3;
    this.controls.minDistance = this.minDistanceForFocus();
    this.camera.near = this.nearForFocus();
    this.camera.far = FAR_SOLAR;
    this.camera.updateProjectionMatrix();
  }

  private minDistanceForFocus(): number {
    if (this.focus === "sun") return SUN_MIN_DIST;
    if (this.focus === "earth") return R_EARTH + SURFACE_CLEARANCE_KM;
    if (this.focus === "moon") return R_MOON + SURFACE_CLEARANCE_KM;
    return 0.05;
  }

  private nearForFocus(): number {
    const close =
      this.focus === "chase" ||
      this.focus === "starbase" ||
      this.focus === "fin" ||
      this.focus === "gridfin" ||
      this.focus === "trench" ||
      this.focus === "hull";
    return close ? 0.0002 : 0.1;
  }

  /**
   * Push the camera outside Sun / Earth / Moon meshes. Call after any free
   * orbit, pan, zoom, or track step. Hard-locked mounts skip this (they reseat
   * on the craft / pad); unlocked mounts clamp like other focuses.
   */
  private clampOutsideBodies(): void {
    this.surfaceClampPos.copy(this.camera.position);
    const moved = pushOutsideSpheres(
      this.surfaceClampPos,
      this.exclusionSpheres(),
      this.surfaceClampPos,
    );
    if (!moved) return;
    this.camera.position.copy(this.surfaceClampPos);
    this.camera.lookAt(this.controls.target);
  }

  private exclusionSpheres() {
    const b = bodyPositions(this.simTime, this.epoch);
    return solarSystemExclusionSpheres(b.sun, b.earth, b.moon, {
      sun: R_SUN,
      earth: R_EARTH,
      moon: R_MOON,
    });
  }

  private computeTarget(mode: CameraMode, outTarget: THREE.Vector3): void {
    if (mode === "free") return;
    if (isMountFocus(mode)) { this.copyMountLook(mode, outTarget); return; }
    if (mode === "chase") { this.chaseTarget(outTarget); return; }
    if (mode === "starbase") { this.starbaseTarget(outTarget); return; }
    this.bodyTarget(mode, outTarget);
  }

  private starbaseTarget(outTarget: THREE.Vector3): void {
    const pad = starbasePadState(this.simTime, this.epoch);
    outTarget.set(pad.pos.x, pad.pos.y, pad.pos.z);
  }

  /** Look-at for an unlocked mount so tracking co-moves with pad / craft. */
  private copyMountLook(mode: MountFocus, out: THREE.Vector3): boolean {
    if (mode === "fin") return this.copyFinLook(out);
    if (mode === "hull") return this.copyNamedLook(this.craft, "hull-cam-look", out);
    if (mode === "gridfin") return this.copyGridFinVariantLook(out);
    return this.copyTrenchLook(out);
  }

  private copyGridFinVariantLook(out: THREE.Vector3): boolean {
    const host = this.resolveGridFinHost();
    const lookName = this.gridFinLookName();
    return this.copyNamedLook(host, lookName, out);
  }

  private gridFinLookName(): string {
    if (this.mountVariant === "engines") return "engines-cam-look";
    if (this.mountVariant === "enginesDown") return "engines-down-cam-look";
    if (this.mountVariant === "boosterHull") return "booster-hull-cam-look";
    return "grid-fin-cam-look";
  }

  private gridFinMountName(): string {
    if (this.mountVariant === "engines") return "engines-cam";
    if (this.mountVariant === "enginesDown") return "engines-down-cam";
    if (this.mountVariant === "boosterHull") return "booster-hull-cam";
    return "grid-fin-cam";
  }

  private copyNamedLook(
    host: THREE.Object3D | null | undefined,
    lookName: string,
    out: THREE.Vector3,
  ): boolean {
    const look = host?.getObjectByName(lookName);
    if (!host || !look) return false;
    this.craft?.updateMatrixWorld(true);
    this.detachedBooster?.updateMatrixWorld(true);
    look.getWorldPosition(out);
    return true;
  }

  private copyFinLook(out: THREE.Vector3): boolean {
    const look = this.craft?.getObjectByName("fin-cam-look");
    if (!this.craft || !look) return false;
    this.craft.updateMatrixWorld(true);
    look.getWorldPosition(out);
    return true;
  }

  private copyTrenchLook(out: THREE.Vector3): boolean {
    if (this.copyTrenchLookFromPad(out)) return true;
    return this.copyTrenchLookFromEnu(out);
  }

  private copyTrenchLookFromPad(out: THREE.Vector3): boolean {
    const look = this.pad?.getObjectByName("trench-cam-look");
    if (!this.pad || !look) return false;
    this.pad.updateMatrixWorld(true);
    look.getWorldPosition(out);
    return true;
  }

  private copyTrenchLookFromEnu(out: THREE.Vector3): boolean {
    const pad = starbasePadState(this.simTime, this.epoch);
    this.padUp.set(pad.up.x, pad.up.y, pad.up.z).normalize();
    this.padEast.set(pad.east.x, pad.east.y, pad.east.z).normalize();
    this.buildTrenchNorth();
    const pose = trenchCamWorldPose(pad.pos, this.padEast, this.padUp, this.tmp);
    out.set(pose.look.x, pose.look.y, pose.look.z);
    return true;
  }

  private bodyTarget(mode: CameraMode, outTarget: THREE.Vector3): void {
    const b = bodyPositions(this.simTime, this.epoch);
    if (mode === "sun") outTarget.set(b.sun.x, b.sun.y, b.sun.z);
    else if (mode === "earth") outTarget.set(b.earth.x, b.earth.y, b.earth.z);
    else if (mode === "moon") outTarget.set(b.moon.x, b.moon.y, b.moon.z);
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
    this.seatMountCam(mount, look, this.craft);
  }

  private seatMountCam(
    mount: THREE.Object3D,
    look: THREE.Object3D,
    upHost: THREE.Object3D,
  ): void {
    mount.getWorldPosition(this.finPos);
    look.getWorldPosition(this.finLook);
    this.finUp.set(0, 1, 0).transformDirection(upHost.matrixWorld);
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
    this.craft?.updateMatrixWorld(true);
    this.detachedBooster?.updateMatrixWorld(true);
    this.seatMountCam(mount, look, host);
  }

  /**
   * Flame-trench angle: under the OLM deck, offset to the side, looking at
   * the Super Heavy engine bells. Pad-fixed mount so the stack rises out of
   * frame on liftoff (classic webcast under-pad shot).
   *
   * Prefers named mounts on the pad group; falls back to an ENU pose on
   * `starbasePadState` (physics pad = visual pad = `STARBASE_ALT`).
   */
  private applyTrenchCam(): void {
    if (this.applyTrenchCamFromPad()) return;
    this.applyTrenchCamFromEnu();
  }

  private applyTrenchCamFromPad(): boolean {
    if (!this.pad) return false;
    const mount = this.pad.getObjectByName("trench-cam");
    const look = this.pad.getObjectByName("trench-cam-look");
    if (!mount || !look) return false;
    this.pad.updateMatrixWorld(true);
    this.seatMountCam(mount, look, this.pad);
    return true;
  }

  private applyTrenchCamFromEnu(): void {
    const pad = starbasePadState(this.simTime, this.epoch);
    this.padUp.set(pad.up.x, pad.up.y, pad.up.z).normalize();
    this.padEast.set(pad.east.x, pad.east.y, pad.east.z).normalize();
    this.buildTrenchNorth();
    const pose = trenchCamWorldPose(pad.pos, this.padEast, this.padUp, this.tmp);
    this.finPos.set(pose.position.x, pose.position.y, pose.position.z);
    this.finLook.set(pose.look.x, pose.look.y, pose.look.z);
    this.finUp.copy(this.padUp);
    this.camera.position.copy(this.finPos);
    this.camera.up.copy(this.finUp);
    this.camera.lookAt(this.finLook);
    this.controls.target.copy(this.finLook);
    this.syncOrbitControlsUp();
  }

  private buildTrenchNorth(): void {
    this.tmp.crossVectors(this.padUp, this.padEast);
    if (this.tmp.lengthSq() < 1e-12) {
      this.tmp.set(0, 1, 0).addScaledVector(this.padUp, -this.padUp.y);
      if (this.tmp.lengthSq() < 1e-12) this.tmp.set(1, 0, 0);
    }
    this.tmp.normalize();
  }

  /**
   * Chase focus: craft position with a short look-ahead along velocity so the
   * path reads as motion (especially free coast).
   */
  private chaseTarget(out: THREE.Vector3): void {
    if (this.copyBoosterChaseTarget(out)) return;
    out.copy(this.craftPos);
    const sp = this.craftVel.length();
    if (sp >= 0.02) {
      out.addScaledVector(this.craftVel, this.chaseLookaheadKm(sp) / sp);
    }
    if (this.chaseLookDownKm > 1e-6) {
      out.addScaledVector(this.chaseLookDownDir, this.chaseLookDownKm);
    }
  }

  private copyBoosterChaseTarget(out: THREE.Vector3): boolean {
    if (this.chaseSubject !== "booster") return false;
    const host = this.detachedBooster;
    if (!host?.visible) return false;
    host.updateMatrixWorld(true);
    host.getWorldPosition(this.boosterChasePos);
    out.copy(this.boosterChasePos);
    return true;
  }

  private chaseLookaheadKm(sp: number): number {
    const len = craftLengthKm(false);
    const scale = Number.isFinite(this.chaseLookAheadScale) ? this.chaseLookAheadScale : 1;
    return THREE.MathUtils.clamp(
      sp * CHASE_LOOKAHEAD_S * scale,
      CHASE_LOOKAHEAD_MIN_KM,
      Math.max(CHASE_LOOKAHEAD_MIN_KM, len * CHASE_LOOKAHEAD_MAX_FRAC * scale),
    );
  }

  /**
   * Gentle bank in chase: roll toward lateral velocity about the look axis so
   * ascent turns and loft don’t stay perfectly level (webcast feel). Desired
   * up is absolute (ecliptic north ⟂ look + bank), so it does not accumulate
   * frame-to-frame. C/V still work; this only blends toward the bank target.
   */
  private applyChaseBank(dt: number): void {
    if (this.focus !== "chase" || dt <= 0) return;
    if (this.craftVel.length() < 0.05) return;
    if (!this.buildChaseLevelFrame()) return;
    this.applyChaseBankAngle();
    const u = 1 - Math.exp(-CHASE_BANK_RATE * dt);
    this.camera.up.lerp(this.chaseUpDesired, u).normalize();
    this.syncOrbitControlsUp();
  }

  private buildChaseLevelFrame(): boolean {
    this.chaseLook.copy(this.controls.target).sub(this.camera.position);
    if (this.chaseLook.lengthSq() < 1e-12) return false;
    this.chaseLook.normalize();
    if (!this.projectLevelUp()) return false;
    this.chaseRight.crossVectors(this.chaseLook, this.chaseUpDesired);
    if (this.chaseRight.lengthSq() < 1e-12) return false;
    this.chaseRight.normalize();
    return true;
  }

  private projectLevelUp(): boolean {
    this.projectVectorOntoLookPerp(this.chaseUpDesired, ECLIPTIC_NORTH);
    if (this.chaseUpDesired.lengthSq() < 1e-12) this.fallbackLevelUp();
    if (this.chaseUpDesired.lengthSq() < 1e-12) return false;
    this.chaseUpDesired.normalize();
    return true;
  }

  private fallbackLevelUp(): void {
    this.chaseUpDesired.set(0, 1, 0);
    this.chaseUpDesired.addScaledVector(
      this.chaseLook,
      -this.chaseUpDesired.dot(this.chaseLook),
    );
  }

  private projectVectorOntoLookPerp(
    out: THREE.Vector3,
    src: THREE.Vector3,
  ): void {
    out.copy(src);
    out.addScaledVector(this.chaseLook, -out.dot(this.chaseLook));
  }

  private applyChaseBankAngle(): void {
    const lateral = this.craftVel.dot(this.chaseRight);
    const bank = THREE.MathUtils.clamp(
      lateral * 0.08,
      -CHASE_BANK_MAX,
      CHASE_BANK_MAX,
    );
    if (Math.abs(bank) <= 1e-4) return;
    this.orbitQuat.setFromAxisAngle(this.chaseLook, bank);
    this.chaseUpDesired.applyQuaternion(this.orbitQuat).normalize();
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
    if (this.isNonTrackingFocus()) return;
    this.computeTarget(this.focus, this.desiredTarget);
    this.applyTrackDelta();
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
  }

  private isNonTrackingFocus(): boolean {
    return this.focus === "free" || isHardLockedMount(this.focus, this.mountLock);
  }

  private applyTrackDelta(): void {
    if (this.trackAnchorValid) {
      this.tmp.copy(this.desiredTarget).sub(this.trackAnchor);
      this.controls.target.add(this.tmp);
      this.camera.position.add(this.tmp);
    } else {
      this.controls.target.copy(this.desiredTarget);
    }
  }

  private applyOrbit(dt: number): void {
    const camYaw = (this.orbitE ? 1 : 0) - (this.orbitQ ? 1 : 0);
    const pitch = (this.orbitR ? 1 : 0) - (this.orbitF ? 1 : 0);
    const roll = (this.orbitC ? 1 : 0) - (this.orbitV ? 1 : 0);
    if ((camYaw === 0 && pitch === 0 && roll === 0) || dt <= 0) return;
    this.cancelDistanceEase();
    this.applyOrbitAxes(camYaw, pitch, roll, dt);
  }

  private applyOrbitAxes(
    camYaw: number,
    pitch: number,
    roll: number,
    dt: number,
  ): void {
    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);
    if (camYaw !== 0) this.applyOrbitYaw(camYaw, dt);
    if (pitch !== 0) this.applyOrbitPitch(pitch, dt);
    if (roll !== 0) this.applyOrbitRoll(roll, dt);
    this.camera.position.copy(this.controls.target).add(this.orbitOffset);
    this.camera.lookAt(this.controls.target);
  }

  private applyOrbitYaw(camYaw: number, dt: number): void {
    if (!yawAxisForMode(this.focus, this.simTime, this.tmp, this.epoch)) {
      this.tmp.copy(this.camera.up);
    }
    if (this.tmp.lengthSq() <= 1e-12) return;
    this.tmp.normalize();
    this.orbitQuat.setFromAxisAngle(this.tmp, camYaw * ORBIT_RAD_PER_S * dt);
    this.orbitOffset.applyQuaternion(this.orbitQuat);
    this.camera.up.applyQuaternion(this.orbitQuat).normalize();
    this.syncOrbitControlsUp();
  }

  /**
   * Level the horizon to the mode yaw axis on sun / earth / starbase focus
   * so a switch from pad-up does not leave a tilted view. Projects off the
   * look axis when the two are nearly parallel so lookAt does not flip.
   */
  private snapYawUpIfNeeded(): void {
    if (!yawAxisForMode(this.focus, this.simTime, this.tmp, this.epoch)) return;
    if (this.tmp.lengthSq() <= 1e-12) return;
    this.tmp.normalize();
    this.chaseLook.copy(this.controls.target).sub(this.camera.position);
    if (this.chaseLook.lengthSq() > 1e-12) {
      this.chaseLook.normalize();
      if (Math.abs(this.tmp.dot(this.chaseLook)) > 0.999) {
        this.projectVectorOntoLookPerp(this.tmp, this.tmp);
        if (this.tmp.lengthSq() <= 1e-12) return;
        this.tmp.normalize();
      }
    }
    this.camera.up.copy(this.tmp);
    this.camera.lookAt(this.controls.target);
  }

  private applyOrbitPitch(pitch: number, dt: number): void {
    this.camera.updateMatrixWorld();
    this.panRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    if (this.panRight.lengthSq() <= 1e-12) return;
    this.panRight.normalize();
    this.rotateOrbitAbout(this.panRight, -pitch * ORBIT_RAD_PER_S * dt);
  }

  private rotateOrbitAbout(axis: THREE.Vector3, angle: number): void {
    this.orbitQuat.setFromAxisAngle(axis, angle);
    this.orbitOffset.applyQuaternion(this.orbitQuat);
    this.camera.up.applyQuaternion(this.orbitQuat).normalize();
    this.syncOrbitControlsUp();
  }

  private applyOrbitRoll(roll: number, dt: number): void {
    this.tmp.copy(this.controls.target).sub(this.camera.position);
    if (this.tmp.lengthSq() <= 1e-12) return;
    this.tmp.normalize();
    this.orbitQuat.setFromAxisAngle(this.tmp, roll * ORBIT_RAD_PER_S * dt);
    this.camera.up.applyQuaternion(this.orbitQuat).normalize();
    this.syncOrbitControlsUp();
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
   * W/S along look projected ⟂ camera.up; A pans screen-right, D pans screen-left.
   * Matches what you see at Starbase (pad-up) rather than the ecliptic plane.
   */
  private applyPan(dt: number): void {
    const { fwd, right } = panAxesFromHeld({
      w: this.panW,
      a: this.panA,
      s: this.panS,
      d: this.panD,
    });
    if ((fwd === 0 && right === 0) || dt <= 0) return;
    this.cancelDistanceEase();
    this.buildPanAxes();
    this.applyPanOffset(fwd, right, this.panSpeed() * dt);
  }

  private applyPanOffset(fwd: number, right: number, step: number): void {
    this.panOffset.set(0, 0, 0);
    this.panOffset.addScaledVector(this.tmp, fwd * step);
    this.panOffset.addScaledVector(this.panRight, right * step);
    this.camera.position.add(this.panOffset);
    this.controls.target.add(this.panOffset);
  }

  private panSpeed(): number {
    const dist = this.camera.position.distanceTo(this.controls.target);
    return Math.min(
      Math.max(dist * PAN_DIST_PER_S, PAN_MIN_SPEED),
      PAN_MAX_SPEED,
    );
  }

  private buildPanAxes(): void {
    this.tmp.copy(this.controls.target).sub(this.camera.position);
    this.tmp.addScaledVector(this.camera.up, -this.tmp.dot(this.camera.up));
    this.ensurePanForward();
    this.tmp.normalize();
    this.buildPanRight();
  }

  private buildPanRight(): void {
    this.panRight.crossVectors(this.camera.up, this.tmp);
    if (this.panRight.lengthSq() < 1e-12) {
      this.panRight.setFromMatrixColumn(this.camera.matrixWorld, 0);
    }
    this.panRight.normalize();
  }

  private ensurePanForward(): void {
    if (this.tmp.lengthSq() >= 1e-12) return;
    this.tmp.set(1, 0, 0);
    this.tmp.addScaledVector(
      this.camera.up,
      -this.tmp.dot(this.camera.up),
    );
    if (this.tmp.lengthSq() < 1e-12) this.tmp.set(0, 1, 0);
  }

  /** Scale distance to the focus; Z zooms in, X zooms out. */
  private applyZoom(dt: number): void {
    const dir = (this.zoomZ ? 1 : 0) - (this.zoomX ? 1 : 0);
    if (dir === 0 || dt <= 0) return;
    this.cancelDistanceEase();
    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);
    const dist = this.orbitOffset.length();
    if (dist < 1e-12) return;
    const next = this.nextZoomDistance(dist, dir, dt);
    this.orbitOffset.multiplyScalar(next / dist);
    this.camera.position.copy(this.controls.target).add(this.orbitOffset);
  }

  private nextZoomDistance(dist: number, dir: number, dt: number): number {
    return THREE.MathUtils.clamp(
      dist * Math.exp(-dir * ZOOM_RATE * dt),
      this.controls.minDistance,
      this.controls.maxDistance,
    );
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
    if (this.holdPadTrack()) return;
    if (this.holdHardLockMount()) return;
    this.updateFreeCamera(dt);
  }

  /** Reseat a hard-locked mount, or unlock if orbit/pan/zoom keys are held. */
  private holdHardLockMount(): boolean {
    if (!isHardLockedMount(this.focus, this.mountLock)) return false;
    if (this.hasCameraHold()) {
      this.unlockMount();
      return false;
    }
    this.applyLockedMountPose();
    return true;
  }

  /** Earth-fixed pad camera: reseat every frame until the user grabs it. */
  private holdPadTrack(): boolean {
    if (!this.padTrack || this.focus !== "starbase") return false;
    if (this.hasCameraHold()) {
      this.padTrack = false;
      this.unlockMount();
      return false;
    }
    this.applyPadTrack();
    return true;
  }

  private applyLockedMountPose(): void {
    if (this.focus === "fin") { this.applyFinCam(); return; }
    if (this.focus === "hull") { this.applyHullCam(); return; }
    if (this.focus === "gridfin") { this.applyGridFinVariant(); return; }
    if (this.focus === "trench") this.applyTrenchCam();
  }

  private applyHullCam(): void {
    if (!this.craft) return;
    const mount = this.craft.getObjectByName("hull-cam");
    const look = this.craft.getObjectByName("hull-cam-look");
    if (!mount || !look) return;
    this.craft.updateMatrixWorld(true);
    this.seatMountCam(mount, look, this.craft);
  }

  private applyGridFinVariant(): void {
    const host = this.resolveGridFinHost();
    if (!host) return;
    const mount = host.getObjectByName(this.gridFinMountName());
    const look = host.getObjectByName(this.gridFinLookName());
    if (!mount || !look) {
      this.applyGridFinCam();
      return;
    }
    this.craft?.updateMatrixWorld(true);
    this.detachedBooster?.updateMatrixWorld(true);
    this.seatMountCam(mount, look, host);
  }

  /**
   * Leave a hard lock: keep the current view as a sticky offset around the
   * mount look-at so WASD / QERF / mouse match Starbase / chase.
   */
  private unlockMount(): void {
    if (this.padTrack) this.padTrack = false;
    if (!isHardLockedMount(this.focus, this.mountLock)) return;
    this.mountLock = mountLockAfterUserControl(this.mountLock);
    this.seedMountTrackAnchor();
  }

  private seedMountTrackAnchor(): void {
    if (!this.trySeedMountLook()) this.desiredTarget.copy(this.controls.target);
    this.trackAnchor.copy(this.desiredTarget);
    this.trackAnchorValid = true;
  }

  private trySeedMountLook(): boolean {
    return isMountFocus(this.focus) &&
      this.copyMountLook(this.focus, this.desiredTarget);
  }

  private hasCameraHold(): boolean {
    return this.orbitHeld() || this.panHeld() || this.zoomHeld();
  }

  private orbitHeld(): boolean {
    return this.orbitQ || this.orbitE || this.orbitR || this.orbitF ||
      this.orbitC || this.orbitV;
  }

  private panHeld(): boolean {
    return this.panW || this.panA || this.panS || this.panD;
  }

  private zoomHeld(): boolean {
    return this.zoomZ || this.zoomX;
  }

  private updateFreeCamera(dt: number): void {
    this.trackFocus();
    this.applyDistanceEase(dt);
    this.applyPan(dt);
    this.applyZoom(dt);
    this.controls.update();
    this.applyOrbit(dt);
    this.applyChaseBank(dt);
    this.clampOutsideBodies();
  }

  /** Ease orbit radius toward Auto-cam / guided frame distance (wall-clock). */
  private applyDistanceEase(dt: number): void {
    if (this.distEaseU >= 1 || dt <= 0) return;
    this.distEaseU = Math.min(1, this.distEaseU + dt / DIST_EASE_S);
    const t = 1 - (1 - this.distEaseU) ** 3;
    const dist = THREE.MathUtils.lerp(this.distEaseFrom, this.distEaseTo, t);
    this.setOrbitRadius(dist);
    this.camera.lookAt(this.controls.target);
  }

  private setOrbitRadius(dist: number): void {
    this.orbitOffset.copy(this.camera.position).sub(this.controls.target);
    if (this.orbitOffset.lengthSq() < 1e-12) {
      this.orbitOffset.copy(ECLIPTIC_NORTH).multiplyScalar(dist);
    } else {
      this.orbitOffset.setLength(dist);
    }
    this.camera.position.copy(this.controls.target).add(this.orbitOffset);
  }
}
