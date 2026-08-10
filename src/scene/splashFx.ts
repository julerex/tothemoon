/**
 * Indian Ocean splashdown site + water spray theater FX for Flight 13.
 *
 * Earth-fixed site (lat/lon → mesh-local on the Earth body) so the beacon
 * co-rotates. Spray expands near terminal splash — scrub-deterministic.
 */

import * as THREE from "three";
import { R_EARTH } from "../physics/constants";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../physics/flight13Mission";
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { createNameLabel } from "./zoomLabels";

export const SPLASH_SITE_LABEL = "Indian Ocean";
export const SPLASH_SITE_DETAIL = "Theater splash · west of Australia";

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

    const ringGeom = new THREE.RingGeometry(1.5, 3.2, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ec4ff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeom, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.site.add(this.ring);

    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.4, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0x66ddff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    this.beacon.position.y = 5;
    this.site.add(this.beacon);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({
        color: 0x88e0ff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    this.site.add(disc);

    const siteLabel = createNameLabel(SPLASH_SITE_LABEL, "#88e0ff", {
      targetPx: 15,
      aspect: 256 / 64,
      minH: 0.6,
    });
    siteLabel.name = "splash-site-label";
    siteLabel.position.set(0, 12, 0);
    siteLabel.userData.detail = SPLASH_SITE_DETAIL;
    this.site.add(siteLabel);

    this.sprayMat = new THREE.MeshBasicMaterial({
      color: 0xc8eefc,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.spray = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.sprayMat);
    this.spray.rotation.x = -Math.PI / 2;
    this.spray.visible = false;
    this.site.add(this.spray);

    // Place on Earth mesh-local surface
    const local = { x: 0, y: 0, z: 0 };
    geodeticToMeshLocal(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, R_EARTH, local);
    this.site.position.set(local.x, local.y, local.z);
    // Orient local +Y along geodetic radial (mesh-local ≈ ECEF-ish)
    const radial = new THREE.Vector3(local.x, local.y, local.z).normalize();
    this.site.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);

    this.group.add(this.site);
    this.site.visible = false;
  }

  /** Mission time of terminal splash (for spray age). */
  setSplashTime(landT: number): void {
    this.landT = landT;
    this.hasLand = true;
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

    // Show site from entry onward or last hour
    const show =
      opts.phase === "entry" ||
      opts.phase === "descent" ||
      opts.phase === "splashdown" ||
      missionT >= this.landT - 2400;
    this.site.visible = show;
    if (!show) return;

    // World position of site for distance pulse (group is under Earth mesh)
    const world = new THREE.Vector3();
    this.site.getWorldPosition(world);
    const dist = craftPos.distanceTo(world);
    const pulse = 0.55 + 0.35 * Math.sin(performance.now() * 0.004);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity =
      dist < 800 ? pulse : 0.4;

    // Water spray near splashdown
    const nearSplash =
      opts.phase === "descent" ||
      opts.phase === "splashdown" ||
      (opts.phase === "entry" && opts.altEarth < 25);
    if (nearSplash && opts.altEarth < 40) {
      this.spray.visible = true;
      let expand: number;
      let opacity: number;
      if (opts.phase === "splashdown" || missionT >= this.landT) {
        const age = Math.max(0, missionT - this.landT);
        const u = Math.min(1, age / 80);
        expand = 12 + u * 50;
        opacity = 0.55 * Math.exp(-age / 150);
      } else if (opts.phase === "descent") {
        expand = THREE.MathUtils.clamp(6 + (20 - opts.altEarth) * 1.2, 4, 30);
        opacity = THREE.MathUtils.clamp(
          0.12 + (15 - opts.altEarth) * 0.025,
          0.08,
          0.5,
        );
      } else {
        expand = 5;
        opacity = 0.1;
      }
      this.spray.scale.setScalar(expand);
      this.sprayMat.opacity = opacity;
    } else {
      this.spray.visible = false;
    }
  }
}
