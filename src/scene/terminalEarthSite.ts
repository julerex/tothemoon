/** Earth-fixed terminal site factory. */
import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM } from "../physics/constants";
import { geodeticToEllipsoidMeshLocal } from "../physics/wgs84";
import {
  createSiteBeacon,
  createSiteDisc,
  createSiteLabel,
  createSiteRing,
  createTerminalLayers,
  type SiteBeaconSpec,
  type SiteDiscSpec,
  type SiteLabelSpec,
  type SiteRingSpec,
  type TerminalLayers,
  type TerminalLayersSpec,
} from "./terminalSiteParts";
import { createSplashOcean, createWeatherClouds } from "./splashWeather";
import { beaconPulseOpacity } from "./terminalFx";

const MESH_UP = new THREE.Vector3(0, 1, 0);

/**
 * Position and orient a site group at a geodetic point on the Earth mesh, with
 * local +Y along the surface radial. Earth-fixed, so the site co-rotates.
 */
export function placeSiteOnEarth(site: THREE.Object3D, lat: number, lon: number): void {
  const local = { x: 0, y: 0, z: 0 };
  geodeticToEllipsoidMeshLocal(lat, lon, EARTH_SURFACE_ALT_KM, local);
  site.position.set(local.x, local.y, local.z);
  site.quaternion.setFromUnitVectors(
    MESH_UP,
    new THREE.Vector3(local.x, local.y, local.z).normalize(),
  );
}

/** Everything needed to build one Earth-fixed terminal site. */
export type EarthTerminalSiteSpec = Readonly<{
  /** Root group name, e.g. `"splash-fx"`. */
  name: string;
  lat: number;
  lon: number;
  ring: SiteRingSpec;
  beacon: SiteBeaconSpec;
  disc: SiteDiscSpec;
  label: SiteLabelSpec;
  layers: TerminalLayersSpec;
  /** Cheap ocean sun-glint sprites (V17 splash / Gulf). */
  oceanGlitter?: boolean;
  /**
   * Local sunlit sea plate (splash zone). Globe PBR ocean goes black at dawn;
   * this plate is sky-reflected morning water for the recovery-drone view.
   */
  sunlitOcean?: boolean;
  /**
   * Puffy cumulus at weather altitude around the splash site (ship falls
   * through on descent). Local only — not a globe cloud deck.
   */
  weatherClouds?: boolean;
}>;

export type EarthTerminalSite = Readonly<{
  /** Parent this under the Earth mesh. */
  group: THREE.Group;
  layers: TerminalLayers;
  /** Show or hide the whole site plate. */
  setVisible: (visible: boolean) => void;
  /** Breathe the beacon from the craft's distance to the site. */
  pulseBeacon: (craftPos: THREE.Vector3) => void;
  /** Set ocean glitter opacity [0, 1] (no-op when glitter was not requested). */
  setGlitter: (opacity: number) => void;
  /**
   * Set sunlit sea-plate opacity [0, 1] and scrub-safe swell time
   * (no-op when the plate was not requested).
   */
  setOceanPlate: (opacity: number, missionT?: number) => void;
  /** Set weather-deck opacity [0, 1] (no-op when clouds were not requested). */
  setWeatherClouds: (opacity: number) => void;
}>;

function paintGlitterCanvas(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 28);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(200,230,255,0.55)");
  g.addColorStop(1, "rgba(40,80,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sparse anisotropic sparkle sprites on the water plate. */
function createOceanGlitterSprites(): {
  group: THREE.Group;
  mats: THREE.SpriteMaterial[];
} {
  const group = new THREE.Group();
  group.name = "ocean-glitter";
  const map = paintGlitterCanvas();
  const mats: THREE.SpriteMaterial[] = [];
  const spots = [
    { x: 0.8, z: 0.2, s: 2.4 },
    { x: -0.5, z: 1.1, s: 1.8 },
    { x: 1.4, z: -0.7, s: 2.1 },
    { x: -1.2, z: -0.4, s: 1.6 },
    { x: 0.2, z: -1.5, s: 2.8 },
    { x: -0.9, z: 0.6, s: 1.5 },
  ];
  for (const spot of spots) {
    const mat = new THREE.SpriteMaterial({
      map, color: 0xddeeff, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(spot.x, 0.08, spot.z);
    sprite.scale.set(spot.s, spot.s * 0.35, 1);
    group.add(sprite);
    mats.push(mat);
  }
  group.visible = false;
  return { group, mats };
}

/**
 * Build an Earth-fixed site plate (ring, beacon, disc, label) with its spray
 * stack already parented in draw order.
 */
export function createEarthTerminalSite(spec: EarthTerminalSiteSpec): EarthTerminalSite {
  const group = new THREE.Group();
  group.name = spec.name;
  const site = new THREE.Group();
  const beacon = createSiteBeacon(spec.beacon);
  const beaconMat = beacon.material as THREE.MeshBasicMaterial;
  const layers = createTerminalLayers(spec.layers);
  const glitter = spec.oceanGlitter ? createOceanGlitterSprites() : null;
  const ocean = spec.sunlitOcean ? createSplashOcean() : null;
  const clouds = spec.weatherClouds ? createWeatherClouds() : null;
  if (ocean) site.add(ocean.group);
  if (clouds) site.add(clouds.group);
  site.add(
    createSiteRing(spec.ring),
    beacon,
    createSiteDisc(spec.disc),
    createSiteLabel(spec.label),
    ...layers.objects,
  );
  if (glitter) site.add(glitter.group);
  placeSiteOnEarth(site, spec.lat, spec.lon);
  group.add(site);
  site.visible = false;

  const world = new THREE.Vector3();
  return Object.freeze({
    group,
    layers,
    setVisible(visible) {
      site.visible = visible;
    },
    pulseBeacon(craftPos) {
      site.getWorldPosition(world);
      beaconMat.opacity = beaconPulseOpacity(
        performance.now(),
        craftPos.distanceTo(world),
        spec.beacon.nearKm,
        spec.beacon.idleOpacity,
      );
    },
    setGlitter(opacity) {
      if (!glitter) return;
      const on = opacity > 0.02;
      glitter.group.visible = on;
      if (!on) return;
      for (const mat of glitter.mats) mat.opacity = opacity;
    },
    setOceanPlate(opacity, missionT = 0) {
      if (!ocean) return;
      ocean.setFrame(opacity, missionT);
    },
    setWeatherClouds(opacity) {
      if (!clouds) return;
      clouds.setOpacity(opacity);
    },
  });
}
