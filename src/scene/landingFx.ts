/**
 * Landing site beacon + multi-layer dust (inner spray, outer mist, vertical
 * sheet) for powered descent / touchdown. Poses are scrub-deterministic from
 * mission time and the final land state.
 *
 * Site plate uses the theater selenographic name (Malapert Massif / south pole)
 * plus a local canvas massif (V9) — not DEM. Dust layers are theater-grade.
 *
 * Unlike the Earth sites this one is Moon-fixed, so the plate is re-placed from
 * the lunar ephemeris each frame and the dust rides a sibling group.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see terminalSiteFx.ts — shared site + layer applicators
 * @see docs/VISUAL_REALISM.md — V6 terminal FX, V9 lunar site
 */

import * as THREE from "three";
import {
  LANDING_SITE_DETAIL,
  LANDING_SITE_LABEL,
} from "../mission/landingBeat";
import { R_MOON } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import {
  beaconPulseOpacity,
  deriveLunarDust,
  landingWashStrength,
} from "./terminalFx";
import {
  createSiteBeacon,
  createSiteDisc,
  createSiteLabel,
  createSiteRing,
  createTerminalLayers,
  type SiteBeaconSpec,
  type TerminalLayersSpec,
} from "./terminalSiteFx";

/** Beacon pulses inside this range (km). */
const BEACON: SiteBeaconSpec = {
  topRadius: 0.15, bottomRadius: 0.35, height: 8, color: 0xff8866,
  opacity: 0.75, nearKm: 500, idleOpacity: 0.45,
};

const DUST: TerminalLayersSpec = {
  name: "landing-dust", segments: 48, innerColor: 0xc8b89a,
  outerColor: 0xb8a888, contactColor: 0x1a1610, sheetColor: 0xd4c4a8,
};

/** Dust brightening at full engine wash. */
const WASH_OPACITY_BOOST = 0.45;
/** Wash point-light intensity at full strength. */
const WASH_LIGHT_INTENSITY = 2.4;

function paintMalapertPlate(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#6a6358";
  ctx.fillRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.52;
  // Polar shadow wedge (south-ish)
  ctx.fillStyle = "rgba(12, 14, 22, 0.55)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, size * 0.48, 0.35 * Math.PI, 0.95 * Math.PI);
  ctx.closePath();
  ctx.fill();
  // Massif rim rings
  ctx.strokeStyle = "rgba(210, 200, 180, 0.45)";
  ctx.lineWidth = size * 0.018;
  ctx.beginPath();
  ctx.arc(cx, cy * 0.92, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(40, 36, 30, 0.55)";
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.arc(cx * 0.72, cy * 1.08, size * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  // Darker floors
  ctx.fillStyle = "rgba(28, 26, 22, 0.5)";
  ctx.beginPath();
  ctx.ellipse(cx * 0.72, cy * 1.08, size * 0.12, size * 0.09, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx * 1.22, cy * 0.78, size * 0.08, size * 0.06, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Highland shoulder
  ctx.fillStyle = "rgba(180, 170, 150, 0.28)";
  ctx.beginPath();
  ctx.ellipse(cx * 1.15, cy * 0.42, size * 0.22, size * 0.1, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function makeMalapertPlate(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  paintMalapertPlate(canvas.getContext("2d")!, 256);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.96,
    metalness: 0,
    color: 0x9a9488,
  });
  const plate = new THREE.Mesh(new THREE.CircleGeometry(6.5, 48), mat);
  plate.name = "malapert-plate";
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = 0.04;
  plate.receiveShadow = true;
  plate.castShadow = false;
  return plate;
}

function makeWashLight(): THREE.PointLight {
  const light = new THREE.PointLight(0xffc898, 0, 12, 2);
  light.name = "landing-wash-light";
  light.position.set(0, 0.55, 0);
  return light;
}

export type LandingFx = Readonly<{
  group: THREE.Group;
  /** Ephemeris used to place the Moon-fixed site. */
  setEpoch: (epoch: EphemerisEpoch) => void;
  /** Call once with the final landing sample (inertial). */
  setLanding: (pos: { x: number; y: number; z: number }, landT: number) => void;
  update: (
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { phase: string; burning: boolean; altMoon: number },
  ) => void;
}>;

export function createLandingFx(): LandingFx {
  const group = new THREE.Group();
  group.name = "landing-fx";
  const site = new THREE.Group();
  const beacon = createSiteBeacon(BEACON);
  const beaconMat = beacon.material as THREE.MeshBasicMaterial;
  const washLight = makeWashLight();
  site.add(
    makeMalapertPlate(),
    createSiteRing({ innerRadius: 1.2, outerRadius: 2.4, color: 0x7ec8ff, opacity: 0.55 }),
    beacon,
    createSiteDisc({ radius: 1.0, color: 0xffaa77, opacity: 0.35 }),
    createSiteLabel({
      name: "landing-site-label", text: LANDING_SITE_LABEL, color: "#ffaa77",
      detail: LANDING_SITE_DETAIL, height: 10,
    }),
    washLight,
  );
  group.add(site);

  const dust = createTerminalLayers(DUST);
  const dustGroup = new THREE.Group();
  dustGroup.name = "landing-dust";
  dustGroup.add(...dust.objects);
  group.add(dustGroup);
  site.visible = false;

  const landPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();
  const radial = new THREE.Vector3();
  // Reused every frame: the surface point is consumed within one update.
  const surface = new THREE.Vector3();
  const meshUp = new THREE.Vector3(0, 1, 0);
  let landT = 0;
  let hasLand = false;
  let epoch: EphemerisEpoch = DEFAULT_EPHEMERIS;

  /** Re-place the plate on the lunar surface under the landing point. */
  function placeSiteOnMoon(): void {
    const bl = bodyPositions(landT, epoch);
    moonPos.set(bl.moon.x, bl.moon.y, bl.moon.z);
    radial.copy(landPos).sub(moonPos);
    radial.multiplyScalar(1 / (radial.length() || 1));
    surface.copy(moonPos).addScaledVector(radial, R_MOON + 0.3);
    site.position.copy(surface);
    site.quaternion.setFromUnitVectors(meshUp, radial);
  }

  function applyWashLight(wash: number): void {
    washLight.intensity = WASH_LIGHT_INTENSITY * wash;
    washLight.visible = wash > 0.02;
  }

  function applyDust(derived: ReturnType<typeof deriveLunarDust>, wash: number): void {
    dustGroup.position.copy(surface);
    dustGroup.quaternion.copy(site.quaternion);
    dust.apply(derived);
    if (derived.active) dust.boostOpacity(1 + WASH_OPACITY_BOOST * wash);
  }

  return Object.freeze({
    group,
    setEpoch(next) {
      epoch = next;
    },
    setLanding(pos, t) {
      landPos.set(pos.x, pos.y, pos.z);
      landT = t;
      hasLand = true;
    },
    update(missionT, craftPos, opts) {
      if (!hasLand) {
        site.visible = false;
        dust.hide();
        applyWashLight(0);
        return;
      }
      placeSiteOnMoon();
      const derived = deriveLunarDust({
        missionT, landT, phase: opts.phase, burning: opts.burning, altMoon: opts.altMoon,
      });
      const wash = landingWashStrength(opts.phase, opts.burning, opts.altMoon);
      site.visible = derived.siteVisible;
      applyDust(derived, wash);
      applyWashLight(derived.siteVisible ? wash : 0);
      beaconMat.opacity = beaconPulseOpacity(
        performance.now(), craftPos.distanceTo(surface), BEACON.nearKm, BEACON.idleOpacity,
      );
    },
  });
}
