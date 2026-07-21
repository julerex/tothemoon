import * as THREE from "three";
import { R_MOON } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";

/**
 * Landing site beacon + soft dust puff for powered descent / touchdown.
 * Positions are deterministic from mission time and the final land state.
 */
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

  constructor() {
    // Surface ring (km-scale so it reads from ship/moon cams)
    const ringGeom = new THREE.RingGeometry(1.2, 2.4, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7ec8ff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeom, ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.site.add(this.ring);

    // Vertical beacon
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.35, 8, 10),
      new THREE.MeshBasicMaterial({
        color: 0xff8866,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.beacon.position.y = 4;
    this.site.add(this.beacon);

    // Soft marker disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffaa77,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    this.site.add(disc);

    this.group.add(this.site);

    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xc8b89a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.dust = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.dustMat);
    this.dust.rotation.x = -Math.PI / 2;
    this.dust.visible = false;
    this.group.add(this.dust);

    this.site.visible = false;
  }

  /** Call once with final landing sample (inertial). */
  setLanding(pos: { x: number; y: number; z: number }, landT: number): void {
    this.landPos.set(pos.x, pos.y, pos.z);
    this.landT = landT;
    this.hasLand = true;
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

    const b = bodyPositions(Math.min(missionT, this.landT));
    this.moonPos.set(b.moon.x, b.moon.y, b.moon.z);

    // Project landing point onto lunar surface along Earth-Moon geometry at land epoch
    const bl = bodyPositions(this.landT);
    this.moonPos.set(bl.moon.x, bl.moon.y, bl.moon.z);
    this.radial.copy(this.landPos).sub(this.moonPos);
    const rLen = this.radial.length() || 1;
    this.radial.multiplyScalar(1 / rLen);

    // Site sits on surface, slightly above to avoid z-fight
    const surface = this.moonPos
      .clone()
      .addScaledVector(this.radial, R_MOON + 0.3);
    this.site.position.copy(surface);
    // Orient local +Y along radial (out of surface)
    this.site.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      this.radial,
    );

    // Show site once near Moon (approach onward) or always after land epoch
    const nearMoon =
      opts.phase === "approach" ||
      opts.phase === "braking" ||
      opts.phase === "descent" ||
      opts.phase === "landed" ||
      missionT >= this.landT - 3600;
    this.site.visible = nearMoon;

    // Dust puff: expands during late descent / touchdown
    const low =
      (opts.phase === "descent" || opts.phase === "landed") &&
      opts.altMoon < 40;
    if (low || opts.phase === "landed") {
      this.dust.visible = true;
      this.dust.position.copy(surface);
      this.dust.quaternion.copy(this.site.quaternion);

      let expand = 1;
      let opacity = 0.2;
      if (opts.phase === "descent" && opts.burning) {
        // Grow as we get closer
        expand = THREE.MathUtils.clamp(8 + (25 - opts.altMoon) * 0.8, 4, 35);
        opacity = THREE.MathUtils.clamp(0.15 + (20 - opts.altMoon) * 0.02, 0.1, 0.55);
      } else if (opts.phase === "landed") {
        const age = Math.max(0, missionT - this.landT);
        // Peak at touchdown then settle
        const u = Math.min(1, age / 120);
        expand = 18 + u * 40;
        opacity = 0.5 * Math.exp(-age / 200);
      } else {
        expand = 6;
        opacity = 0.12;
      }
      this.dust.scale.setScalar(expand);
      this.dustMat.opacity = opacity;
    } else {
      this.dust.visible = false;
    }

    // Soft blink on beacon near craft
    const dist = craftPos.distanceTo(surface);
    const pulse = 0.55 + 0.35 * Math.sin(performance.now() * 0.004);
    (this.beacon.material as THREE.MeshBasicMaterial).opacity =
      dist < 500 ? pulse : 0.45;
  }
}
