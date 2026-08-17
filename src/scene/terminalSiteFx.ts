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
 * @see splashFx.ts, gulfLandFx.ts, landingFx.ts — per-site factories
 */

import * as THREE from "three";
import { EARTH_SURFACE_RADIUS_KM } from "../physics/constants";
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { drapePlatePoint } from "./starbasePlate";
import { createNameLabel } from "./zoomLabels";
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
  geodeticToMeshLocal(lat, lon, EARTH_SURFACE_RADIUS_KM, local);
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
  /** Set sunlit sea-plate opacity [0, 1] (no-op when the plate was not requested). */
  setOceanPlate: (opacity: number) => void;
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
 * Splash-zone plate radius (km). Horizon from a 1 km recovery drone is
 * ~110 km; this fills the near field and fades before Earth-cam notices.
 */
export const SPLASH_OCEAN_RADIUS_KM = 80;
const SPLASH_OCEAN_SEGS = 36;

function paintSunlitOcean(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.5;
  const g = ctx.createRadialGradient(cx, cy, r * 0.06, cx, cy, r);
  g.addColorStop(0, "rgba(92, 148, 172, 1)");
  g.addColorStop(0.28, "rgba(72, 128, 154, 0.98)");
  g.addColorStop(0.58, "rgba(52, 108, 136, 0.9)");
  g.addColorStop(0.82, "rgba(36, 84, 112, 0.5)");
  g.addColorStop(1, "rgba(24, 60, 84, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "soft-light";
  for (let i = 0; i < 16; i++) {
    const y = (i + 0.35) * (size / 16);
    ctx.strokeStyle = i % 2 === 0 ? "rgba(236, 248, 255, 0.22)" : "rgba(30, 64, 84, 0.14)";
    ctx.lineWidth = size * 0.011;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 8) {
      ctx.lineTo(x, y + Math.sin(x * 0.07 + i * 0.9) * size * 0.011);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "destination-in";
  const a = ctx.createRadialGradient(cx, cy, r * 0.22, cx, cy, r);
  a.addColorStop(0, "rgba(0,0,0,1)");
  a.addColorStop(0.62, "rgba(0,0,0,0.92)");
  a.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
}

function drapeOceanPlate(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    const p = drapePlatePoint(pos.getX(i), pos.getZ(i), EARTH_SURFACE_RADIUS_KM);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/** Sky-reflected morning sea; unlit so a 5° winter sun cannot crush it. */
function createSunlitOceanPlate(): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  paintSunlitOcean(canvas.getContext("2d")!, 256);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(
    SPLASH_OCEAN_RADIUS_KM * 2,
    SPLASH_OCEAN_RADIUS_KM * 2,
    SPLASH_OCEAN_SEGS,
    SPLASH_OCEAN_SEGS,
  );
  geo.rotateX(-Math.PI / 2);
  drapeOceanPlate(geo);
  const mat = new THREE.MeshBasicMaterial({
    map,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
    side: THREE.DoubleSide,
  });
  mat.userData.noShadow = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "splash-ocean-plate";
  mesh.position.y = 0.001;
  mesh.renderOrder = 1;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return { mesh, mat };
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
  const ocean = spec.sunlitOcean ? createSunlitOceanPlate() : null;
  if (ocean) site.add(ocean.mesh);
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
    setOceanPlate(opacity) {
      if (!ocean) return;
      const on = opacity > 0.02;
      ocean.mesh.visible = on;
      if (!on) return;
      ocean.mat.opacity = opacity;
    },
  });
}
