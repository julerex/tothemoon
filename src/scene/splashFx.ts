/**
 * Indian Ocean splashdown site + water spray theater FX for Flight 13.
 *
 * Earth-fixed site (lat/lon → mesh-local on the Earth body) so the beacon
 * co-rotates. Spray expands near terminal splash — scrub-deterministic.
 */

import * as THREE from "three";
import { EARTH_SURFACE_RADIUS_KM } from "../physics/constants";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../physics/flight13Mission";
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { createNameLabel } from "./zoomLabels";

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

function makeSpray(mat: THREE.MeshBasicMaterial): THREE.Mesh {
  const spray = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
  spray.rotation.x = -Math.PI / 2;
  spray.visible = false;
  return spray;
}

function placeSiteOnEarth(site: THREE.Group): void {
  const local = { x: 0, y: 0, z: 0 };
  geodeticToMeshLocal(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, EARTH_SURFACE_RADIUS_KM, local);
  site.position.set(local.x, local.y, local.z);
  const radial = new THREE.Vector3(local.x, local.y, local.z).normalize();
  site.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
}

function splashdownSpray(missionT: number, landT: number): { expand: number; opacity: number } {
  const age = Math.max(0, missionT - landT);
  const u = Math.min(1, age / 80);
  return { expand: 12 + u * 50, opacity: 0.55 * Math.exp(-age / 150) };
}

function descentSpray(altEarth: number): { expand: number; opacity: number } {
  return {
    expand: THREE.MathUtils.clamp(6 + (20 - altEarth) * 1.2, 4, 30),
    opacity: THREE.MathUtils.clamp(0.12 + (15 - altEarth) * 0.025, 0.08, 0.5),
  };
}

function sprayExpandOpacity(
  missionT: number,
  landT: number,
  phase: string,
  altEarth: number,
): { expand: number; opacity: number } {
  if (phase === "splashdown" || missionT >= landT) return splashdownSpray(missionT, landT);
  if (phase === "descent") return descentSpray(altEarth);
  return { expand: 5, opacity: 0.1 };
}

function shouldShowSite(phase: string, missionT: number, landT: number): boolean {
  return (
    phase === "entry" || phase === "descent" || phase === "splashdown" ||
    missionT >= landT - 2400
  );
}

function nearSplash(phase: string, altEarth: number): boolean {
  return (
    phase === "descent" || phase === "splashdown" ||
    (phase === "entry" && altEarth < 25)
  );
}

/**
 * Splashdown site beacon + spray ring, parented under the Earth mesh so it
 * co-rotates with the ground track.
 */
export class SplashFx {
  readonly group = new THREE.Group();
  private readonly site = new THREE.Group();
  private readonly beacon: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly spray: THREE.Mesh;
  private readonly sprayMat: THREE.MeshBasicMaterial;
  private landT = 0;
  private hasLand = false;

  constructor() {
    this.group.name = "splash-fx";
    this.ring = makeRingMesh();
    this.beacon = makeBeaconMesh();
    this.sprayMat = makeBasicMat(0xc8eefc, 0, true);
    this.spray = makeSpray(this.sprayMat);
    this.assembleSite();
  }

  private assembleSite(): void {
    this.site.add(this.ring, this.beacon, makeDiscMesh(), makeSiteLabel(), this.spray);
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

  private updateSpray(missionT: number, phase: string, altEarth: number): void {
    if (!(nearSplash(phase, altEarth) && altEarth < 40)) {
      this.spray.visible = false;
      return;
    }
    this.spray.visible = true;
    const { expand, opacity } = sprayExpandOpacity(missionT, this.landT, phase, altEarth);
    this.spray.scale.setScalar(expand);
    this.sprayMat.opacity = opacity;
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
    const show = shouldShowSite(opts.phase, missionT, this.landT);
    this.site.visible = show;
    if (!show) return;
    this.pulseBeacon(craftPos);
    this.updateSpray(missionT, opts.phase, opts.altEarth);
  }
}
