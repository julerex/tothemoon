import * as THREE from "three";
import {
  LANDING_SITE_DETAIL,
  LANDING_SITE_LABEL,
} from "../mission/landingBeat";
import { R_MOON } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { createNameLabel } from "./zoomLabels";
import {
  deriveLunarDust,
  type ContactCuePose,
  type TerminalLayerPose,
} from "./terminalFx";

/**
 * Landing site beacon + multi-layer dust (inner spray, outer mist, vertical
 * sheet) for powered descent / touchdown. Poses are scrub-deterministic from
 * mission time and the final land state.
 *
 * Site plate uses the theater selenographic name (Malapert Massif / south pole).
 * Dust layers are theater-grade sprites/discs — not CFD.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see docs/VISUAL_REALISM.md — V6 terminal FX
 */

function makeBasicMat(color: number, opacity: number, doubleSide = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    ...(doubleSide ? { side: THREE.DoubleSide } : {}),
  });
}

function makeRingMesh(): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.4, 48), makeBasicMat(0x7ec8ff, 0.55, true));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function makeBeaconMesh(): THREE.Mesh {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.35, 8, 10),
    makeBasicMat(0xff8866, 0.75),
  );
  beacon.position.y = 4;
  return beacon;
}

function makeDiscMesh(): THREE.Mesh {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), makeBasicMat(0xffaa77, 0.35, true));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  return disc;
}

function makeSiteLabel(): THREE.Object3D {
  const siteLabel = createNameLabel(LANDING_SITE_LABEL, "#ffaa77", {
    targetPx: 15, aspect: 256 / 64, minH: 0.6,
  });
  siteLabel.name = "landing-site-label";
  siteLabel.position.set(0, 10, 0);
  siteLabel.userData.detail = LANDING_SITE_DETAIL;
  return siteLabel;
}

function makeDustDisc(mat: THREE.MeshBasicMaterial, name: string): THREE.Mesh {
  const dust = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  dust.name = name;
  dust.rotation.x = -Math.PI / 2;
  dust.visible = false;
  return dust;
}

/** Three crossed vertical planes for the brief contact sheet. */
function makeSheetGroup(color: number): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  group.name = "landing-dust-sheet";
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

export class LandingFx {
  readonly group = new THREE.Group();
  private readonly site = new THREE.Group();
  private readonly dustGroup = new THREE.Group();
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
  private readonly landPos = new THREE.Vector3();
  private readonly moonPos = new THREE.Vector3();
  private readonly radial = new THREE.Vector3();
  private landT = 0;
  private hasLand = false;
  private epoch: EphemerisEpoch = DEFAULT_EPHEMERIS;

  constructor() {
    this.group.name = "landing-fx";
    this.ring = makeRingMesh();
    this.beacon = makeBeaconMesh();
    this.site.add(this.ring, this.beacon, makeDiscMesh(), makeSiteLabel());
    this.group.add(this.site);

    this.innerMat = makeBasicMat(0xc8b89a, 0, true);
    this.outerMat = makeBasicMat(0xb8a888, 0, true);
    this.contactMat = makeBasicMat(0x1a1610, 0, true);
    this.inner = makeDustDisc(this.innerMat, "landing-dust-inner");
    this.outer = makeDustDisc(this.outerMat, "landing-dust-outer");
    this.contact = makeDustDisc(this.contactMat, "landing-dust-contact");
    this.contact.position.y = 0.02;
    const sheet = makeSheetGroup(0xd4c4a8);
    this.sheet = sheet.group;
    this.sheetMats = sheet.mats;
    this.dustGroup.name = "landing-dust";
    this.dustGroup.add(this.outer, this.inner, this.sheet, this.contact);
    this.group.add(this.dustGroup);
    this.site.visible = false;
  }

  /** Call once with final landing sample (inertial). */
  setEpoch(epoch: EphemerisEpoch): void {
    this.epoch = epoch;
  }

  setLanding(pos: { x: number; y: number; z: number }, landT: number): void {
    this.landPos.set(pos.x, pos.y, pos.z);
    this.landT = landT;
    this.hasLand = true;
  }

  private placeSiteOnMoon(): THREE.Vector3 {
    const bl = bodyPositions(this.landT, this.epoch);
    this.moonPos.set(bl.moon.x, bl.moon.y, bl.moon.z);
    this.radial.copy(this.landPos).sub(this.moonPos);
    const rLen = this.radial.length() || 1;
    this.radial.multiplyScalar(1 / rLen);
    const surface = this.moonPos.clone().addScaledVector(this.radial, R_MOON + 0.3);
    this.site.position.copy(surface);
    this.site.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.radial);
    return surface;
  }

  private hideDust(): void {
    this.inner.visible = false;
    this.outer.visible = false;
    this.sheet.visible = false;
    this.contact.visible = false;
  }

  private applyDustLook(
    surface: THREE.Vector3,
    derived: ReturnType<typeof deriveLunarDust>,
  ): void {
    this.dustGroup.position.copy(surface);
    this.dustGroup.quaternion.copy(this.site.quaternion);
    if (!derived.active) {
      this.hideDust();
      return;
    }
    applyDiscPose(this.inner, this.innerMat, derived.inner);
    applyDiscPose(this.outer, this.outerMat, derived.outer);
    applySheetPose(this.sheet, this.sheetMats, derived.sheet);
    applyContactPose(this.contact, this.contactMat, derived.contact);
  }

  private pulseBeacon(craftPos: THREE.Vector3, surface: THREE.Vector3): void {
    const dist = craftPos.distanceTo(surface);
    const pulse = 0.55 + 0.35 * Math.sin(performance.now() * 0.004);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity = dist < 500 ? pulse : 0.45;
  }

  update(
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { phase: string; burning: boolean; altMoon: number },
  ): void {
    if (!this.hasLand) {
      this.site.visible = false;
      this.hideDust();
      return;
    }
    const surface = this.placeSiteOnMoon();
    const derived = deriveLunarDust({
      missionT,
      landT: this.landT,
      phase: opts.phase,
      burning: opts.burning,
      altMoon: opts.altMoon,
    });
    this.site.visible = derived.siteVisible;
    this.applyDustLook(surface, derived);
    this.pulseBeacon(craftPos, surface);
  }
}
