/**
 * Shared THREE applicators for terminal landing / splashdown sites.
 *
 * The three terminal sites (Indian Ocean splash, Gulf booster land, lunar south
 * pole) differ only in placement, colors, and which gate decides visibility, so
 * their geometry is described by spec records here and the pure poses come from
 * {@link ./terminalFx.ts}. This module mutates THREE objects and allocates only
 * at build time.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see splashWeather.ts — sea swell + weather deck
 * @see splashFx.ts, gulfLandFx.ts, landingFx.ts — per-site factories
 */

import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM } from "../physics/constants";
import { geodeticToEllipsoidMeshLocal } from "../physics/wgs84";
import { createNameLabel } from "./zoomLabels";
import {
  createSplashOcean,
  createWeatherClouds,
} from "./splashWeather";
import {
  beaconPulseOpacity,
  type ContactCuePose,
  type TerminalLayerPose,
} from "./terminalFx";

/** Additive-ish transparent material used by every terminal cue. */
export function makeBasicMat(
  color: number,
  opacity: number,
  doubleSide = false,
): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    ...(doubleSide ? { side: THREE.DoubleSide } : {}),
  });
}

/** Flat ring marking the site footprint. */
export type SiteRingSpec = Readonly<{
  innerRadius: number;
  outerRadius: number;
  color: number;
  opacity: number;
}>;

export function createSiteRing(spec: SiteRingSpec): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(spec.innerRadius, spec.outerRadius, 48),
    makeBasicMat(spec.color, spec.opacity, true),
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

/** Vertical pillar that pulses when the craft is close. */
export type SiteBeaconSpec = Readonly<{
  topRadius: number;
  bottomRadius: number;
  height: number;
  color: number;
  opacity: number;
  /** Pulse only inside this range (km). */
  nearKm: number;
  /** Steady opacity when the craft is far away. */
  idleOpacity: number;
}>;

export function createSiteBeacon(spec: SiteBeaconSpec): THREE.Mesh {
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.topRadius, spec.bottomRadius, spec.height, 10),
    makeBasicMat(spec.color, spec.opacity),
  );
  beacon.position.y = spec.height / 2;
  return beacon;
}

/** Tinted pad disc under the beacon. */
export type SiteDiscSpec = Readonly<{
  radius: number;
  color: number;
  opacity: number;
}>;

export function createSiteDisc(spec: SiteDiscSpec): THREE.Mesh {
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(spec.radius, 32),
    makeBasicMat(spec.color, spec.opacity, true),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.05;
  return disc;
}

/** Zoom-scaled site name plate. */
export type SiteLabelSpec = Readonly<{
  /** Object name, e.g. `"splash-site-label"`. */
  name: string;
  text: string;
  /** CSS color for the label text. */
  color: string;
  /** Sub-caption surfaced through `userData.detail`. */
  detail: string;
  /** Local height above the site (km). */
  height: number;
}>;

export function createSiteLabel(spec: SiteLabelSpec): THREE.Object3D {
  const label = createNameLabel(spec.text, spec.color, {
    targetPx: 15, aspect: 256 / 64, minH: 0.6,
  });
  label.name = spec.name;
  label.position.set(0, spec.height, 0);
  label.userData.detail = spec.detail;
  return label;
}

/** Colors / mesh detail for one site's spray or dust stack. */
export type TerminalLayersSpec = Readonly<{
  /** Mesh name prefix, e.g. `"splash-spray"`. */
  name: string;
  /** Radial segments on the disc layers. */
  segments: number;
  innerColor: number;
  outerColor: number;
  contactColor: number;
  sheetColor: number;
}>;

/** The subset of a derived terminal bundle these layers consume. */
export type TerminalLayersDerived = Readonly<{
  active: boolean;
  inner: TerminalLayerPose;
  outer: TerminalLayerPose;
  sheet: TerminalLayerPose;
  contact: ContactCuePose;
}>;

/**
 * Spray / dust stack: outer mist, inner spray, vertical sheet, contact disc.
 * `objects` is in draw order and must be parented in that order.
 */
export type TerminalLayers = Readonly<{
  objects: readonly THREE.Object3D[];
  /** Write derived poses; hides every layer when the bundle is inactive. */
  apply: (derived: TerminalLayersDerived) => void;
  hide: () => void;
  /** Multiply inner + outer opacity (lunar engine wash brightening). */
  boostOpacity: (mul: number) => void;
}>;

function makeLayerDisc(
  mat: THREE.MeshBasicMaterial,
  name: string,
  segments: number,
): THREE.Mesh {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, segments), mat);
  disc.name = name;
  disc.rotation.x = -Math.PI / 2;
  disc.visible = false;
  return disc;
}

/** Three crossed vertical planes for the brief contact sheet. */
function makeSheetGroup(
  name: string,
  color: number,
): { group: THREE.Group; mats: THREE.MeshBasicMaterial[] } {
  const group = new THREE.Group();
  group.name = name;
  const mats = Array.from({ length: 3 }, (_unused, i) => {
    const mat = makeBasicMat(color, 0, true);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    plane.rotation.y = (i * Math.PI) / 3;
    plane.position.y = 0.5;
    group.add(plane);
    return mat;
  });
  group.visible = false;
  return { group, mats };
}

function applyDiscPose(
  mesh: THREE.Mesh,
  mat: THREE.MeshBasicMaterial,
  pose: TerminalLayerPose | ContactCuePose,
): void {
  mesh.visible = pose.visible;
  if (!pose.visible) return;
  mesh.scale.setScalar(pose.expand);
  mat.opacity = pose.opacity;
}

function applySheetPose(
  group: THREE.Group,
  mats: readonly THREE.MeshBasicMaterial[],
  pose: TerminalLayerPose,
): void {
  group.visible = pose.visible;
  if (!pose.visible) return;
  group.scale.set(pose.expand, pose.height, pose.expand);
  for (const mat of mats) mat.opacity = pose.opacity;
}

export function createTerminalLayers(spec: TerminalLayersSpec): TerminalLayers {
  const innerMat = makeBasicMat(spec.innerColor, 0, true);
  const outerMat = makeBasicMat(spec.outerColor, 0, true);
  const contactMat = makeBasicMat(spec.contactColor, 0, true);
  const inner = makeLayerDisc(innerMat, `${spec.name}-inner`, spec.segments);
  const outer = makeLayerDisc(outerMat, `${spec.name}-outer`, spec.segments);
  const contact = makeLayerDisc(contactMat, `${spec.name}-contact`, spec.segments);
  contact.position.y = 0.02;
  const sheet = makeSheetGroup(`${spec.name}-sheet`, spec.sheetColor);

  const hide = (): void => {
    inner.visible = false;
    outer.visible = false;
    sheet.group.visible = false;
    contact.visible = false;
  };

  return Object.freeze({
    objects: Object.freeze([outer, inner, sheet.group, contact]),
    hide,
    apply(derived) {
      if (!derived.active) {
        hide();
        return;
      }
      applyDiscPose(inner, innerMat, derived.inner);
      applyDiscPose(outer, outerMat, derived.outer);
      applySheetPose(sheet.group, sheet.mats, derived.sheet);
      applyDiscPose(contact, contactMat, derived.contact);
    },
    boostOpacity(mul) {
      innerMat.opacity *= mul;
      outerMat.opacity *= mul;
    },
  });
}

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
