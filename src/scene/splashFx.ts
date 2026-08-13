/**
 * Indian Ocean splashdown site + multi-layer water spray theater FX for Flight 13.
 *
 * Earth-fixed site (lat/lon → mesh-local on the Earth body) so the beacon
 * co-rotates. Spray expands near terminal splash — scrub-deterministic.
 *
 * Layers follow the pad-deluge tier pattern: inner spray, outer mist, brief
 * vertical sheet. Theater-grade, not CFD.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see docs/VISUAL_REALISM.md — V6 terminal FX
 */

import * as THREE from "three";
import { EARTH_SURFACE_RADIUS_KM } from "../physics/constants";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../physics/flight13Mission";
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { createNameLabel } from "./zoomLabels";
import {
  deriveSplashSpray,
  type ContactCuePose,
  type TerminalLayerPose,
} from "./terminalFx";

export const SPLASH_SITE_LABEL = "Indian Ocean";
export const SPLASH_SITE_DETAIL = "Theater splash · west of Australia";

function makeBasicMat(color: number, opacity: number, doubleSide = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    ...(doubleSide ? { side: THREE.DoubleSide } : {}),
  });
}

function makeRingMesh(): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 3.2, 48), makeBasicMat(0x4ec4ff, 0.5, true));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function makeBeaconMesh(): THREE.Mesh {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.4, 10, 10),
    makeBasicMat(0x66ddff, 0.7),
  );
  beacon.position.y = 5;
  return beacon;
}

function makeDiscMesh(): THREE.Mesh {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32), makeBasicMat(0x88e0ff, 0.3, true));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  return disc;
}

function makeSiteLabel(): THREE.Object3D {
  const siteLabel = createNameLabel(SPLASH_SITE_LABEL, "#88e0ff", {
    targetPx: 15, aspect: 256 / 64, minH: 0.6,
  });
  siteLabel.name = "splash-site-label";
  siteLabel.position.set(0, 12, 0);
  siteLabel.userData.detail = SPLASH_SITE_DETAIL;
  return siteLabel;
}

function makeSprayDisc(mat: THREE.MeshBasicMaterial, name: string): THREE.Mesh {
  const spray = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  spray.name = name;
  spray.rotation.x = -Math.PI / 2;
  spray.visible = false;
  return spray;
}

function makeSheetGroup(color: number): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  group.name = "splash-spray-sheet";
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
  geodeticToMeshLocal(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, EARTH_SURFACE_RADIUS_KM, local);
  site.position.set(local.x, local.y, local.z);
  const radial = new THREE.Vector3(local.x, local.y, local.z).normalize();
  site.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
}

/**
 * Splashdown site beacon + spray layers, parented under the Earth mesh so it
 * co-rotates with the ground track.
 */
export class SplashFx {
  readonly group = new THREE.Group();
  private readonly site = new THREE.Group();
  private readonly beacon: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly innerMat: THREE.MeshBasicMaterial;
  private readonly outerMat: THREE.MeshBasicMaterial;
  private readonly contactMat: THREE.MeshBasicMaterial;
  private readonly inner: THREE.Mesh;
  private readonly outer: THREE.Mesh;
  private readonly contact: THREE.Mesh;
  private readonly sheet: THREE.Group;
  private readonly sheetMats: THREE.MeshBasicMaterial[];
  private landT = 0;
  private hasLand = false;

  constructor() {
    this.group.name = "splash-fx";
    this.ring = makeRingMesh();
    this.beacon = makeBeaconMesh();
    this.innerMat = makeBasicMat(0xc8eefc, 0, true);
    this.outerMat = makeBasicMat(0xa8d8f0, 0, true);
    this.contactMat = makeBasicMat(0x0a2030, 0, true);
    this.inner = makeSprayDisc(this.innerMat, "splash-spray-inner");
    this.outer = makeSprayDisc(this.outerMat, "splash-spray-outer");
    this.contact = makeSprayDisc(this.contactMat, "splash-spray-contact");
    this.contact.position.y = 0.02;
    const sheet = makeSheetGroup(0xe8f6ff);
    this.sheet = sheet.group;
    this.sheetMats = sheet.mats;
    this.assembleSite();
  }

  private assembleSite(): void {
    this.site.add(
      this.ring,
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

  /** Mission time of terminal splash (for spray age). */
  setSplashTime(landT: number): void {
    this.landT = landT;
    this.hasLand = true;
  }

  private pulseBeacon(craftPos: THREE.Vector3): void {
    const world = new THREE.Vector3();
    this.site.getWorldPosition(world);
    const dist = craftPos.distanceTo(world);
    const pulse = 0.55 + 0.35 * Math.sin(performance.now() * 0.004);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = dist < 800 ? pulse : 0.4;
  }

  private hideSpray(): void {
    this.inner.visible = false;
    this.outer.visible = false;
    this.sheet.visible = false;
    this.contact.visible = false;
  }

  private updateSpray(missionT: number, phase: string, altEarth: number): void {
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

  update(
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { phase: string; altEarth: number },
  ): void {
    if (!this.hasLand) {
      this.site.visible = false;
      return;
    }
    const derived = deriveSplashSpray({
      missionT, landT: this.landT, phase: opts.phase, altEarth: opts.altEarth,
    });
    this.site.visible = derived.siteVisible;
    if (!derived.siteVisible) return;
    this.pulseBeacon(craftPos);
    this.updateSpray(missionT, opts.phase, opts.altEarth);
  }
}
