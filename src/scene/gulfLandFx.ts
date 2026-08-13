/**
 * Gulf of America booster soft-land site plate for Flight 13.
 *
 * Earth-fixed (lat/lon → mesh-local) so the beacon co-rotates. Spray uses the
 * shared terminal FX curves. Theater-grade — not a barge or CFD splash.
 *
 * @see padRecoveryFx.ts — visibility / AGL helpers
 * @see docs/VISUAL_REALISM.md — V8 recovery catch
 */

import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM } from "../physics/constants";
import {
  GULF_LAND_LAT,
  GULF_LAND_LON,
  GULF_SCHEDULE,
  type BoosterRecoveryPhase,
} from "../physics/boosterRecovery";
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { createNameLabel } from "./zoomLabels";
import {
  gulfLandingAltKm,
  gulfSiteVisible,
  gulfSprayPhase,
} from "./padRecoveryFx";
import {
  deriveSplashSpray,
  type ContactCuePose,
  type TerminalLayerPose,
} from "./terminalFx";

export const GULF_SITE_LABEL = "Gulf of America";
export const GULF_SITE_DETAIL = "Theater booster landing · offshore";

function makeBasicMat(color: number, opacity: number, doubleSide = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    ...(doubleSide ? { side: THREE.DoubleSide } : {}),
  });
}

function makeRingMesh(): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.6, 48), makeBasicMat(0x6ec8a8, 0.5, true));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function makeBeaconMesh(): THREE.Mesh {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.38, 8, 10),
    makeBasicMat(0x88e0b0, 0.7),
  );
  beacon.position.y = 4;
  return beacon;
}

function makeDiscMesh(): THREE.Mesh {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), makeBasicMat(0x7ad0b0, 0.28, true));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  return disc;
}

function makeSiteLabel(): THREE.Object3D {
  const siteLabel = createNameLabel(GULF_SITE_LABEL, "#88e0b0", {
    targetPx: 15, aspect: 256 / 64, minH: 0.6,
  });
  siteLabel.name = "gulf-site-label";
  siteLabel.position.set(0, 10, 0);
  siteLabel.userData.detail = GULF_SITE_DETAIL;
  return siteLabel;
}

function makeSprayDisc(mat: THREE.MeshBasicMaterial, name: string): THREE.Mesh {
  const spray = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat);
  spray.name = name;
  spray.rotation.x = -Math.PI / 2;
  spray.visible = false;
  return spray;
}

function makeSheetGroup(color: number): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  group.name = "gulf-spray-sheet";
  const mats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 3; i++) {
    const mat = makeBasicMat(color, 0, true);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    plane.rotation.y = (i * Math.PI) / 3;
    plane.position.y = 0.5;
    group.add(plane);
    mats.push(mat);
  }
  group.visible = false;
  return { group, mats };
}

function applyDiscPose(mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, pose: TerminalLayerPose): void {
  mesh.visible = pose.visible;
  if (!pose.visible) return;
  mesh.scale.setScalar(pose.expand);
  mat.opacity = pose.opacity;
}

function applySheetPose(
  group: THREE.Group,
  mats: THREE.MeshBasicMaterial[],
  pose: TerminalLayerPose,
): void {
  group.visible = pose.visible;
  if (!pose.visible) return;
  group.scale.set(pose.expand, pose.height, pose.expand);
  for (const mat of mats) mat.opacity = pose.opacity;
}

function applyContactPose(mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial, pose: ContactCuePose): void {
  mesh.visible = pose.visible;
  if (!pose.visible) return;
  mesh.scale.setScalar(pose.expand);
  mat.opacity = pose.opacity;
}

function placeSiteOnEarth(site: THREE.Group): void {
  const local = { x: 0, y: 0, z: 0 };
  geodeticToMeshLocal(GULF_LAND_LAT, GULF_LAND_LON, EARTH_SURFACE_ALT_KM, local);
  site.position.set(local.x, local.y, local.z);
  const radial = new THREE.Vector3(local.x, local.y, local.z).normalize();
  site.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
}

/**
 * Gulf booster landing beacon + spray, parented under the Earth mesh.
 */
export class GulfLandFx {
  readonly group = new THREE.Group();
  private readonly site = new THREE.Group();
  private readonly beacon: THREE.Mesh;
  private readonly innerMat: THREE.MeshBasicMaterial;
  private readonly outerMat: THREE.MeshBasicMaterial;
  private readonly contactMat: THREE.MeshBasicMaterial;
  private readonly inner: THREE.Mesh;
  private readonly outer: THREE.Mesh;
  private readonly contact: THREE.Mesh;
  private readonly sheet: THREE.Group;
  private readonly sheetMats: THREE.MeshBasicMaterial[];
  private landT = 0;
  private stageT = 0;
  private hasLand = false;

  constructor() {
    this.group.name = "gulf-land-fx";
    this.beacon = makeBeaconMesh();
    this.innerMat = makeBasicMat(0xc8f0dc, 0, true);
    this.outerMat = makeBasicMat(0xa8dcc8, 0, true);
    this.contactMat = makeBasicMat(0x0a2418, 0, true);
    this.inner = makeSprayDisc(this.innerMat, "gulf-spray-inner");
    this.outer = makeSprayDisc(this.outerMat, "gulf-spray-outer");
    this.contact = makeSprayDisc(this.contactMat, "gulf-spray-contact");
    this.contact.position.y = 0.02;
    const sheet = makeSheetGroup(0xe8fff4);
    this.sheet = sheet.group;
    this.sheetMats = sheet.mats;
    this.site.add(
      makeRingMesh(),
      this.beacon,
      makeDiscMesh(),
      makeSiteLabel(),
      this.outer,
      this.inner,
      this.sheet,
      this.contact,
    );
    placeSiteOnEarth(this.site);
    this.group.add(this.site);
    this.site.visible = false;
  }

  /**
   * @param stageT - Stage-out mission time (s)
   * @param landT - Soft-land mission time (s); defaults to gulf schedule
   */
  setLandTime(stageT: number, landT?: number): void {
    this.stageT = stageT;
    this.landT = landT ?? stageT + GULF_SCHEDULE.landingEndS;
    this.hasLand = true;
  }

  private pulseBeacon(craftPos: THREE.Vector3): void {
    const world = new THREE.Vector3();
    this.site.getWorldPosition(world);
    const dist = craftPos.distanceTo(world);
    const pulse = 0.55 + 0.35 * Math.sin(performance.now() * 0.004);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = dist < 400 ? pulse : 0.4;
  }

  private hideSpray(): void {
    this.inner.visible = false;
    this.outer.visible = false;
    this.sheet.visible = false;
    this.contact.visible = false;
  }

  update(
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { recoveryPhase: BoosterRecoveryPhase | string },
  ): void {
    if (!this.hasLand) {
      this.site.visible = false;
      return;
    }
    const age = missionT - this.stageT;
    const show = gulfSiteVisible(opts.recoveryPhase, age);
    this.site.visible = show;
    if (!show) return;
    this.pulseBeacon(craftPos);
    const phase = gulfSprayPhase(opts.recoveryPhase);
    const altEarth = gulfLandingAltKm(age);
    const derived = deriveSplashSpray({
      missionT, landT: this.landT, phase, altEarth,
    });
    if (!derived.active) {
      this.hideSpray();
      return;
    }
    applyDiscPose(this.inner, this.innerMat, derived.inner);
    applyDiscPose(this.outer, this.outerMat, derived.outer);
    applySheetPose(this.sheet, this.sheetMats, derived.sheet);
    applyContactPose(this.contact, this.contactMat, derived.contact);
  }
}
