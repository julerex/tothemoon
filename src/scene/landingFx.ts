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

/**
 * Landing site beacon + soft dust puff for powered descent / touchdown.
 * Positions are deterministic from mission time and the final land state.
 *
 * Site plate uses the theater selenographic name (Malapert Massif / south pole).
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

function makeDust(mat: THREE.MeshBasicMaterial): THREE.Mesh {
  const dust = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  dust.rotation.x = -Math.PI / 2;
  dust.visible = false;
  return dust;
}

function descentDust(altMoon: number): { expand: number; opacity: number } {
  return {
    expand: THREE.MathUtils.clamp(8 + (25 - altMoon) * 0.8, 4, 35),
    opacity: THREE.MathUtils.clamp(0.15 + (20 - altMoon) * 0.02, 0.1, 0.55),
  };
}

function landedDust(missionT: number, landT: number): { expand: number; opacity: number } {
  const age = Math.max(0, missionT - landT);
  const u = Math.min(1, age / 120);
  return { expand: 18 + u * 40, opacity: 0.5 * Math.exp(-age / 200) };
}

function dustExpandOpacity(
  missionT: number,
  landT: number,
  phase: string,
  burning: boolean,
  altMoon: number,
): { expand: number; opacity: number } {
  if (phase === "descent" && burning) return descentDust(altMoon);
  if (phase === "landed") return landedDust(missionT, landT);
  return { expand: 6, opacity: 0.12 };
}

function nearMoonPhase(phase: string, missionT: number, landT: number): boolean {
  return (
    phase === "approach" || phase === "braking" || phase === "descent" ||
    phase === "landed" || missionT >= landT - 3600
  );
}

function dustActive(phase: string, altMoon: number): boolean {
  const low = (phase === "descent" || phase === "landed") && altMoon < 40;
  return low || phase === "landed";
}

export class LandingFx {
  readonly group = new THREE.Group();
  private readonly site = new THREE.Group();
  private readonly beacon: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly dust: THREE.Mesh;
  private readonly dustMat: THREE.MeshBasicMaterial;
  private readonly landPos = new THREE.Vector3();
  private readonly moonPos = new THREE.Vector3();
  private readonly radial = new THREE.Vector3();
  private landT = 0;
  private hasLand = false;
  private epoch: EphemerisEpoch = DEFAULT_EPHEMERIS;

  constructor() {
    this.ring = makeRingMesh();
    this.beacon = makeBeaconMesh();
    this.site.add(this.ring, this.beacon, makeDiscMesh(), makeSiteLabel());
    this.group.add(this.site);
    this.dustMat = makeBasicMat(0xc8b89a, 0, true);
    this.dust = makeDust(this.dustMat);
    this.group.add(this.dust);
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

  private applyDustLook(
    missionT: number,
    surface: THREE.Vector3,
    opts: { phase: string; burning: boolean; altMoon: number },
  ): void {
    this.dust.visible = true;
    this.dust.position.copy(surface);
    this.dust.quaternion.copy(this.site.quaternion);
    const { expand, opacity } = dustExpandOpacity(
      missionT, this.landT, opts.phase, opts.burning, opts.altMoon,
    );
    this.dust.scale.setScalar(expand);
    this.dustMat.opacity = opacity;
  }

  private updateDust(
    missionT: number,
    surface: THREE.Vector3,
    opts: { phase: string; burning: boolean; altMoon: number },
  ): void {
    if (!dustActive(opts.phase, opts.altMoon)) {
      this.dust.visible = false;
      return;
    }
    this.applyDustLook(missionT, surface, opts);
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
      this.dust.visible = false;
      return;
    }
    const surface = this.placeSiteOnMoon();
    this.site.visible = nearMoonPhase(opts.phase, missionT, this.landT);
    this.updateDust(missionT, surface, opts);
    this.pulseBeacon(craftPos, surface);
  }
}
