import * as THREE from "three";
import {
  EARTH_SURFACE_ALT_KM,
  STARBASE_LAT,
  STARBASE_LON,
} from "../physics/constants";
import {
  geodeticToMeshLocal,
  inertialRelToMeshLocal,
} from "../physics/earthFrame";
import { earthSurfaceRadiusAlong, geocentricRadiusAt, geodeticToEllipsoidMeshLocal } from "../physics/wgs84";
import {
  STARBASE_PLATE_HALF_KM,
  STARBASE_PLATE_INNER_KM,
  STARBASE_PLATE_SEGS,
  STARBASE_PLATE_Y_KM,
  drapePlatePoint,
  starbasePlateUv,
  starbasePlateYawRad,
} from "./starbasePlate";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import type { Sample } from "../physics/mission";
import { v3 } from "../physics/vec3";
import { TRENCH_CAM_LOCAL, TRENCH_CAM_LOOK_LOCAL } from "../camera/trenchCam";
import { createFatLine } from "./fatLines";
import {
  bloomVisual,
  DELUGE_SHEETS,
  derivePadFx,
  expandSteamSprites,
  flameVisual,
  floodFixtureEmissive,
  floodSpotDistance,
  floodSpotIntensity,
  GROUND_SHEETS,
  groundSheetPose,
  hazeBaseZs,
  hazeSpritePose,
  olmLampColorHex,
  padBeaconOpacity,
  padFillColorHex,
  padFillDistance,
  padFillIntensity,
  plumeLightDistance,
  plumeLightIntensity,
  plumeLightRgb,
  sheetSpritePose,
  steamSpritePose,
  steamTintRgb,
  steamWarmth,
  tongueVisual,
  VENT_ANCHORS,
  ventSpritePose,
  type LaunchPadFxState,
} from "./padLaunchFx";

/**
 * Re-export pure pad FX state type for mission theaters.
 * Definition and docs live in `padLaunchFx.ts`.
 */
export type { LaunchPadFxState } from "./padLaunchFx";

/**
 * Starbase pad (Earth-fixed mesh-local) + helpers for ascent ground-track.
 *
 * ## Parenting
 *
 * The returned group is parented under the spinning Earth mesh so it co-rotates.
 * Pad origin matches craft engines at t≈0 (WGS84 ellipsoid + `EARTH_SURFACE_ALT_KM`).
 * shared physics/visual shell). Local frame: **+Y up**, tower at **+X**,
 * scene unit = **1 km**.
 *
 * ## Dual scale
 *
 * - **True-scale** OLM + Mechazilla + OLP-2 hardstand / tank farm / GSE for
 *   Ship / pad / trench cams (satellite footprint: tower SW, tanks E/NE,
 *   warehouse + Boca Chica Blvd north). Sentinel-2 surrounds plate (~80 km
 *   square) replaces tan scrub when `starbase_surrounds.jpg` loads; procedural
 *   scrub remains the fallback.
 * - **Landmark rings** for Earth cam (thin annuli — never a solid disc that
 *   would z-fight the stack). Hidden once the photo plate is on.
 *
 * ## Visual V3 close-up + V14 steam punch
 *
 * Scorch + water stains, multi-tier deluge sheets, chopsticks/QD silhouette,
 * scrub-driven heat haze. V14 adds denser ground-hugging steam and an
 * engine-warm tint. Strengths/poses are pure (`padLaunchFx.ts`); this
 * module only builds meshes and applies poses each tick.
 *
 * ## Named objects (for `getObjectByName` / FX)
 *
 * | Name | Role |
 * |------|------|
 * | `pad-flame` / `pad-flame-tongues` | Trench flame sheet + cones |
 * | `pad-steam` | Multi-tier deluge ring sprites |
 * | `pad-deluge-sheets` | Volumetric sheet curtains |
 * | `pad-ground-steam` | Ground-hugging steam sheets (V14) |
 * | `pad-heat-haze` | Ignition shimmer over trench |
 * | `pad-vent-steam` | Tank-farm hold vents |
 * | `pad-flood-*` / `pad-fill` / `pad-plume-light` | Lighting |
 * | `pad-ground-bloom` | Tight under-plume bloom |
 * | `pad-beacon` | Tower peak (wall-clock pulse) |
 * | `pad-satellite-plate` | Sentinel-2 surrounds square (hidden until JPEG loads) |
 * | `mechazilla` / `pad-chopstick-*` / `pad-qd-arm` / `pad-olm` | Tower stack |
 * | `trench-cam` / `trench-cam-look` | Flame-trench camera mount (under OLM) |
 *
 * @returns Root group named `starbase-pad`, already oriented on the globe
 * @see updateStarbaseLaunchFx
 * @see padLaunchFx.derivePadFx
 */

const GROUND_OFFSET = {
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
} as const;

/** Place pad group at Starbase geodetic on the Earth mesh. */
function placePadOnEarth(pad: THREE.Group): void {
  const local = geodeticToEllipsoidMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
  pad.position.set(local.x, local.y, local.z);
  const up = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
  const outward = new THREE.Vector3(up.x, up.y, up.z).normalize();
  pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
}

/** Earth-cam landmark rings (scrub + concrete + coast rim). */
function addPadLandmarks(pad: THREE.Group): void {
  addLandmarkScrub(pad);
  addLandmarkConcrete(pad);
  addLandmarkRim(pad);
}

function addLandmarkScrub(pad: THREE.Group): void {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 2.7, 64, 1),
    new THREE.MeshStandardMaterial({ color: 0x8a7a5c, metalness: 0.05, roughness: 0.97, ...GROUND_OFFSET }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.01;
  mesh.name = "pad-landmark-scrub";
  pad.add(mesh);
}

function addLandmarkConcrete(pad: THREE.Group): void {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.48, 48, 1),
    new THREE.MeshStandardMaterial({ color: 0x7a7e84, metalness: 0.22, roughness: 0.85, ...GROUND_OFFSET }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.008;
  mesh.name = "pad-landmark-ring";
  pad.add(mesh);
}

function addLandmarkRim(pad: THREE.Group): void {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(2.65, 0.028, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x6a7a70, metalness: 0.12, roughness: 0.9 }),
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.position.y = -0.005;
  mesh.name = "pad-landmark-rim";
  pad.add(mesh);
}

function makeAdditiveBasic(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Flame trench + floor + flame sheet + tongues. */
function addPadTrenchAndFlame(pad: THREE.Group): void {
  addTrenchMeshes(pad);
  addFlameSheet(pad);
  addFlameTongues(pad);
}

function addTrenchMeshes(pad: THREE.Group): void {
  const trench = new THREE.Group();
  trench.name = "pad-trench";
  const trenchSteel = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.45, roughness: 0.72 });
  // Open U-channel along ±Z so trench cam can see engines / flame, not a solid plug.
  const wallH = 0.006;
  const wallT = 0.0015;
  const halfW = 0.009;
  for (const x of [-halfW, halfW]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 0.055), trenchSteel);
    wall.position.set(x, -0.006, 0);
    trench.add(wall);
  }
  pad.add(trench);
  addTrenchFloor(pad);
}

function addTrenchFloor(pad: THREE.Group): void {
  const trenchFloor = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.0012, 0.048),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.35, roughness: 0.9, map: makeScorchTexture() }),
  );
  trenchFloor.position.y = -0.0082;
  trenchFloor.name = "pad-trench-floor";
  pad.add(trenchFloor);
}

function addFlameSheet(pad: THREE.Group): void {
  const flameMat = makeAdditiveBasic(0xff8a48);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.028, 0.05), flameMat);
  flame.position.y = 0.006;
  flame.name = "pad-flame";
  flame.visible = false;
  flame.userData.mat = flameMat;
  pad.add(flame);
}

const FLAME_TONGUE_ZS = [-0.016, -0.005, 0.005, 0.016] as const;

function addOneFlameTongue(tongues: THREE.Group, mat: THREE.Material, z: number): void {
  const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.05, 10, 1, true), mat);
  tongue.position.set(0, 0.02, z);
  tongues.add(tongue);
}

function addFlameTongues(pad: THREE.Group): void {
  const tongueMat = makeAdditiveBasic(0xffa060);
  const tongues = new THREE.Group();
  tongues.name = "pad-flame-tongues";
  tongues.visible = false;
  for (const z of FLAME_TONGUE_ZS) addOneFlameTongue(tongues, tongueMat, z);
  tongues.userData.mat = tongueMat;
  pad.add(tongues);
}

function makeSteamSpriteMat(map: THREE.CanvasTexture, color: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.NormalBlending, color,
  });
}

function configureSteamSprite(sprite: THREE.Sprite, s: ReturnType<typeof expandSteamSprites>[number]): void {
  sprite.position.set(Math.cos(s.ang) * s.r0, s.y0, Math.sin(s.ang) * s.r0);
  sprite.scale.setScalar(s.scale);
  sprite.userData.baseAng = s.ang;
  sprite.userData.baseR = s.r0;
  sprite.userData.baseY = s.y0;
  sprite.userData.baseScale = s.scale;
  sprite.userData.phase = s.phase;
  sprite.userData.tier = s.tier;
}

function addPadSteamGroup(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const steamGroup = new THREE.Group();
  steamGroup.name = "pad-steam";
  steamGroup.visible = false;
  for (const s of expandSteamSprites()) {
    const sprite = new THREE.Sprite(makeSteamSpriteMat(steamTex, s.color));
    configureSteamSprite(sprite, s);
    steamGroup.add(sprite);
  }
  pad.add(steamGroup);
}

function configureSheetSprite(sprite: THREE.Sprite, a: (typeof DELUGE_SHEETS)[number]): void {
  sprite.position.set(a.pos[0], a.pos[1], a.pos[2]);
  sprite.scale.set(a.sx, a.sy, 1);
  sprite.userData.baseX = a.pos[0];
  sprite.userData.baseY = a.pos[1];
  sprite.userData.baseZ = a.pos[2];
  sprite.userData.baseSx = a.sx;
  sprite.userData.baseSy = a.sy;
  sprite.userData.phase = a.phase;
}

function addPadDelugeSheets(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const delugeSheets = new THREE.Group();
  delugeSheets.name = "pad-deluge-sheets";
  delugeSheets.visible = false;
  for (const a of DELUGE_SHEETS) {
    const sprite = new THREE.Sprite(makeSteamSpriteMat(steamTex, 0xd8e0e8));
    configureSheetSprite(sprite, a);
    delugeSheets.add(sprite);
  }
  pad.add(delugeSheets);
}

function addPadGroundSteam(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const ground = new THREE.Group();
  ground.name = "pad-ground-steam";
  ground.visible = false;
  for (const a of GROUND_SHEETS) {
    const sprite = new THREE.Sprite(makeSteamSpriteMat(steamTex, 0xe4eaf0));
    configureSheetSprite(sprite, a);
    ground.add(sprite);
  }
  pad.add(ground);
}

function makeHazeSpriteMat(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, color: 0xffc8a0,
  });
}

function addPadHeatHaze(pad: THREE.Group): void {
  const hazeTex = makeHeatHazeTexture();
  const heatHaze = new THREE.Group();
  heatHaze.name = "pad-heat-haze";
  heatHaze.visible = false;
  const hazeZs = hazeBaseZs();
  for (let i = 0; i < hazeZs.length; i++) addHazeSprite(heatHaze, hazeTex, hazeZs[i]!, i);
  pad.add(heatHaze);
}

function addHazeSprite(group: THREE.Group, map: THREE.CanvasTexture, z: number, i: number): void {
  const sprite = new THREE.Sprite(makeHazeSpriteMat(map));
  sprite.position.set(0, 0.014, z);
  sprite.scale.set(0.028, 0.022, 1);
  sprite.userData.baseZ = z;
  sprite.userData.phase = i * 1.3;
  group.add(sprite);
}

function addPadVentSteam(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const ventSteam = new THREE.Group();
  ventSteam.name = "pad-vent-steam";
  ventSteam.visible = false;
  for (let i = 0; i < VENT_ANCHORS.length; i++) addVentSprite(ventSteam, steamTex, i);
  pad.add(ventSteam);
}

function addVentSprite(group: THREE.Group, map: THREE.CanvasTexture, i: number): void {
  const [x, y, z] = VENT_ANCHORS[i]!;
  const sprite = new THREE.Sprite(makeSteamSpriteMat(map, 0xe8ecf0));
  sprite.position.set(x, y, z);
  sprite.scale.setScalar(0.12);
  sprite.userData.baseX = x;
  sprite.userData.baseY = y;
  sprite.userData.baseZ = z;
  sprite.userData.phase = i * 1.1;
  group.add(sprite);
}

function addPadBeacon(pad: THREE.Group): void {
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.003, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.95 }),
  );
  beacon.position.set(0.022, 0.152, 0);
  beacon.name = "pad-beacon";
  pad.add(beacon);
}

function addPadGroundBloom(pad: THREE.Group): void {
  const groundBloom = makeGroundBloomSprite();
  groundBloom.name = "pad-ground-bloom";
  groundBloom.position.set(0, 0.01, 0);
  groundBloom.scale.setScalar(0.12);
  groundBloom.visible = false;
  pad.add(groundBloom);
}

function addPadFxSprites(pad: THREE.Group): void {
  const steamTex = makeSteamTexture();
  addPadSteamGroup(pad, steamTex);
  addPadDelugeSheets(pad, steamTex);
  addPadGroundSteam(pad, steamTex);
  addPadHeatHaze(pad);
  addPadVentSteam(pad, steamTex);
}

function addTrenchCamMounts(pad: THREE.Group): void {
  const mount = new THREE.Object3D();
  mount.name = "trench-cam";
  mount.position.set(TRENCH_CAM_LOCAL.x, TRENCH_CAM_LOCAL.y, TRENCH_CAM_LOCAL.z);
  pad.add(mount);
  const look = new THREE.Object3D();
  look.name = "trench-cam-look";
  look.position.set(TRENCH_CAM_LOOK_LOCAL.x, TRENCH_CAM_LOOK_LOCAL.y, TRENCH_CAM_LOOK_LOCAL.z);
  pad.add(look);
}

function populateStarbasePad(pad: THREE.Group): void {
  pad.add(createPadSurroundings());
  addPadLandmarks(pad);
  addStarbaseSatellitePlate(pad);
  addPadTrenchAndFlame(pad);
  addTrenchCamMounts(pad);
  addPadFxSprites(pad);
  pad.add(createMechazillaTower());
  pad.add(createPadLights());
  addPadBeacon(pad);
  addPadGroundBloom(pad);
}

export function createStarbasePad(): THREE.Group {
  const pad = new THREE.Group();
  pad.name = "starbase-pad";
  placePadOnEarth(pad);
  populateStarbasePad(pad);
  return pad;
}

const STARBASE_PLATE_HIDE = [
  "pad-landmark-scrub",
  "pad-landmark-ring",
  "pad-landmark-rim",
  "pad-scrub-terrain",
] as const;

/** Square-rim alpha: full JPEG including corners, short fade at the edge. */
function paintPlateAlpha(ctx: CanvasRenderingContext2D, size: number): void {
  const img = ctx.createImageData(size, size);
  const fade = 0.08;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = Math.abs(x / (size - 1) - 0.5) * 2;
      const nz = Math.abs(y / (size - 1) - 0.5) * 2;
      const rim = Math.max(nx, nz);
      const a = rim <= 1 - fade ? 255 : Math.round(255 * (1 - rim) / fade);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function makePlateAlphaTexture(): THREE.CanvasTexture {
  const map = makeSizedCanvasTexture(256, paintPlateAlpha);
  map.colorSpace = THREE.NoColorSpace;
  return map;
}

/** Planar UVs on an XZ square: after yaw, +Z north / +X west; U grows toward −X (east). */
function applyStarbasePlateUvs(geo: THREE.BufferGeometry, halfKm: number): void {
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  if (!pos || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = starbasePlateUv(pos.getX(i), pos.getZ(i), halfKm);
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/** Sink tangent-plane verts onto the Earth sphere (pad-local, km). */
function drapeStarbasePlate(
  geo: THREE.BufferGeometry,
  radiusKm: number,
): void {
  const pos = geo.getAttribute("position");
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    const p = drapePlatePoint(pos.getX(i), pos.getZ(i), radiusKm);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function makeStarbasePlateGeometry(): THREE.PlaneGeometry {
  const half = STARBASE_PLATE_HALF_KM;
  const geo = new THREE.PlaneGeometry(
    half * 2,
    half * 2,
    STARBASE_PLATE_SEGS,
    STARBASE_PLATE_SEGS,
  );
  geo.rotateX(-Math.PI / 2);
  applyStarbasePlateUvs(geo, half);
  drapeStarbasePlate(geo, geocentricRadiusAt(STARBASE_LAT, EARTH_SURFACE_ALT_KM));
  return geo;
}

function punchPlateOlmHole(mat: THREE.MeshStandardMaterial): void {
  const half = STARBASE_PLATE_HALF_KM.toFixed(4);
  const inner2 = (STARBASE_PLATE_INNER_KM * STARBASE_PLATE_INNER_KM).toFixed(6);
  mat.customProgramCacheKey = () => "starbase-plate-olm-hole";
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec2 plateKm = (vMapUv - 0.5) * (2.0 * ${half});
       if (dot(plateKm, plateKm) < ${inner2}) discard;
      `,
    );
  };
}

function makeStarbasePlateMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.95,
    transparent: true,
    depthWrite: false,
    alphaMap: makePlateAlphaTexture(),
    ...GROUND_OFFSET,
  });
  punchPlateOlmHole(mat);
  return mat;
}

function hideProceduralPadGround(pad: THREE.Group): void {
  for (const name of STARBASE_PLATE_HIDE) {
    const node = pad.getObjectByName(name);
    if (node) node.visible = false;
  }
}

function applyStarbasePlateTexture(
  pad: THREE.Group,
  plate: THREE.Mesh,
  tex: THREE.Texture,
): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const mat = plate.material as THREE.MeshStandardMaterial;
  mat.map = tex;
  mat.needsUpdate = true;
  plate.visible = true;
  hideProceduralPadGround(pad);
}

function onStarbasePlateMissing(): void {
  console.warn(
    "[tothemoon] Starbase surrounds texture missing; using procedural scrub",
  );
}

function loadStarbasePlateTexture(pad: THREE.Group, plate: THREE.Mesh): void {
  const url = `${import.meta.env.BASE_URL}textures/starbase_surrounds.jpg`;
  new THREE.TextureLoader().load(
    url,
    (tex) => applyStarbasePlateTexture(pad, plate, tex),
    undefined,
    () => onStarbasePlateMissing(),
  );
}

/**
 * North-up Sentinel-2 square around the pad (full JPEG, draped on the globe).
 * Hidden until the JPEG loads so procedural scrub / landmark rings remain
 * the fallback.
 */
function addStarbaseSatellitePlate(pad: THREE.Group): void {
  const plate = new THREE.Mesh(makeStarbasePlateGeometry(), makeStarbasePlateMaterial());
  plate.name = "pad-satellite-plate";
  plate.position.y = STARBASE_PLATE_Y_KM;
  plate.rotation.y = starbasePlateYawRad();
  plate.visible = false;
  plate.renderOrder = -1;
  pad.add(plate);
  loadStarbasePlateTexture(pad, plate);
}

/**
 * OLP-2-style pad complex (theater massing from public satellite layout).
 *
 * Local frame (km): origin = stack / OLM, +Y up, tower at +X.
 * Group name: `pad-surroundings`.
 */
function populatePadSurroundings(g: THREE.Group, mats: PadSurroundMats): void {
  addPadScrubAndPond(g, mats);
  addPadHardstand(g, mats);
  addPadApronDecals(g);
  addPadRoadsAndCars(g, mats);
  g.add(buildTankFarm(mats));
  addPadWarehouseAndYards(g, mats);
  addPadHopperAndCrane(g, mats);
}

function createPadSurroundings(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-surroundings";
  populatePadSurroundings(g, makePadSurroundMats());
  return g;
}

type PadSurroundMats = {
  concrete: THREE.MeshStandardMaterial;
  concreteLight: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  dirt: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  tankWhite: THREE.MeshStandardMaterial;
  warehouseRoof: THREE.MeshStandardMaterial;
  warehouseWall: THREE.MeshStandardMaterial;
  carPaint: THREE.MeshStandardMaterial;
};

function groundStd(
  color: number,
  metalness: number,
  roughness: number,
  ground = true,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    ...(ground ? GROUND_OFFSET : {}),
  });
}

function makePadGroundMats(): Pick<
  PadSurroundMats,
  "concrete" | "concreteLight" | "concreteDark" | "dirt" | "asphalt" | "water"
> {
  return {
    concrete: groundStd(0x9a9ea4, 0.18, 0.9),
    concreteLight: groundStd(0xb0b4b8, 0.15, 0.88),
    concreteDark: groundStd(0x6a6e74, 0.22, 0.86),
    dirt: groundStd(0xb0a080, 0.05, 0.96),
    asphalt: groundStd(0x4a4c50, 0.12, 0.92),
    water: groundStd(0x4a6a62, 0.4, 0.4),
  };
}

function makePadStructureMats(): Pick<PadSurroundMats, "steel" | "steelDark" | "tankWhite" | "warehouseRoof" | "warehouseWall" | "carPaint"> {
  return {
    steel: groundStd(0x8a9098, 0.72, 0.42, false), steelDark: groundStd(0x4a5058, 0.65, 0.5, false),
    tankWhite: groundStd(0xd8dce0, 0.5, 0.4, false), warehouseRoof: groundStd(0xc4b8a0, 0.25, 0.75, false),
    warehouseWall: groundStd(0xb8b0a0, 0.2, 0.8, false), carPaint: groundStd(0x3a3e48, 0.4, 0.55, false),
  };
}

function makePadSurroundMats(): PadSurroundMats {
  return { ...makePadGroundMats(), ...makePadStructureMats() };
}

function addGroundDisc(
  g: THREE.Group,
  r: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  segs = 24,
  name?: string,
): void {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r, segs), mat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(x, y, z);
  if (name) disc.name = name;
  g.add(disc);
}

/**
 * One soft-edged terrain disc for coastal scrub — avoids stacked coplanar
 * CircleGeometry patches that z-fight into TV-snow at pad cams.
 */
function makeScrubTerrainMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: makeScrubTerrainTexture(),
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.98,
    ...GROUND_OFFSET,
  });
}

function addGroundRing(
  g: THREE.Group,
  innerR: number,
  outerR: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  segs = 24,
  name?: string,
): void {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(innerR, outerR, segs, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  g.add(mesh);
}

function addPadScrubAndPond(g: THREE.Group, mats: PadSurroundMats): void {
  // Ring (not a disc) so the OLM / trench opening is not roofed from below.
  addGroundRing(g, 0.08, 1.55, makeScrubTerrainMat(), 0, -0.007, 0, 48, "pad-scrub-terrain");
  addGroundDisc(g, 0.08, mats.water, 0.05, -0.0058, 0.42, 20, "pad-pond");
}

type PadSlab = { size: [number, number, number]; pos: [number, number, number]; kind: "concrete" | "concreteLight" | "concreteDark" };
const PAD_SLABS: PadSlab[] = [
  { size: [0.22, 0.0026, 0.2], pos: [0.14, -0.0026, 0.06], kind: "concrete" },
  { size: [0.18, 0.0025, 0.12], pos: [0.04, -0.0028, 0.14], kind: "concreteDark" },
  { size: [0.12, 0.0025, 0.1], pos: [0.12, -0.0028, -0.08], kind: "concrete" },
  { size: [0.14, 0.0025, 0.1], pos: [0.22, -0.0027, 0.12], kind: "concreteLight" },
];

function addPadSlab(g: THREE.Group, mats: PadSurroundMats, s: PadSlab): void {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(...s.size), mats[s.kind]);
  slab.position.set(...s.pos);
  g.add(slab);
}

function addOlmApronRing(g: THREE.Group, mats: PadSurroundMats): void {
  const apron = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.08, 40, 1),
    mats.concreteLight,
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.001;
  apron.name = "pad-olm-apron";
  g.add(apron);
}

function addPadHardstand(g: THREE.Group, mats: PadSurroundMats): void {
  addOlmApronRing(g, mats);
  for (const s of PAD_SLABS) addPadSlab(g, mats, s);
}

function makeScorchMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x4a4640, map: makeScorchTexture(), metalness: 0.18, roughness: 0.94,
    transparent: true, opacity: 0.92, ...GROUND_OFFSET,
  });
}

function addPadScorch(g: THREE.Group): void {
  const scorch = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.048, 40, 1), makeScorchMat());
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = -0.0004;
  scorch.name = "pad-scorch";
  g.add(scorch);
  addPadScorchCore(g);
}

function addPadScorchCore(g: THREE.Group): void {
  const scorchCore = new THREE.Mesh(
    new THREE.RingGeometry(0.01, 0.022, 32, 1),
    new THREE.MeshStandardMaterial({ color: 0x1c1a18, metalness: 0.28, roughness: 0.88, ...GROUND_OFFSET }),
  );
  scorchCore.rotation.x = -Math.PI / 2;
  scorchCore.position.y = -0.0003;
  g.add(scorchCore);
}

function stainMaterial(map: THREE.CanvasTexture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x5a6258, map, transparent: true, opacity: 0.55,
    metalness: 0.08, roughness: 0.95, depthWrite: false, ...GROUND_OFFSET,
  });
}

function addPadWaterStains(g: THREE.Group): void {
  const stainMap = makeWaterStainTexture();
  const stainSpecs: { size: [number, number]; pos: [number, number]; rot: number }[] = [
    { size: [0.055, 0.028], pos: [0.02, 0.03], rot: 0.35 },
    { size: [0.048, 0.024], pos: [-0.018, -0.028], rot: -0.5 },
    { size: [0.04, 0.02], pos: [0.032, -0.012], rot: 1.1 },
    { size: [0.036, 0.022], pos: [-0.03, 0.018], rot: -1.4 },
    { size: [0.03, 0.016], pos: [0.008, 0.045], rot: 0.15 },
  ];
  for (let i = 0; i < stainSpecs.length; i++) addOneWaterStain(g, stainMap, stainSpecs[i]!, i);
}

function addOneWaterStain(
  g: THREE.Group,
  map: THREE.CanvasTexture,
  s: { size: [number, number]; pos: [number, number]; rot: number },
  i: number,
): void {
  const stain = new THREE.Mesh(new THREE.PlaneGeometry(s.size[0], s.size[1]), stainMaterial(map));
  stain.rotation.x = -Math.PI / 2;
  stain.rotation.z = s.rot;
  stain.position.set(s.pos[0], -0.0002, s.pos[1]);
  stain.name = `pad-water-stain-${i}`;
  g.add(stain);
}

function trailMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x2a2c28, transparent: true, opacity: 0.4,
    metalness: 0.1, roughness: 0.96, depthWrite: false, ...GROUND_OFFSET,
  });
}

function addPadRunoffTrails(g: THREE.Group): void {
  for (const [x0, z0, len, ang] of [
    [0.02, 0.01, 0.06, 0.4], [0.015, -0.015, 0.045, -0.6], [-0.01, 0.025, 0.035, 1.2],
  ] as const) {
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.004, len), trailMaterial());
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = ang;
    trail.position.set(x0, -0.00015, z0);
    g.add(trail);
  }
}

function addPadFences(g: THREE.Group, mats: PadSurroundMats): void {
  const fence = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.0015, 0.004), mats.steelDark);
  fence.position.set(0.08, -0.001, -0.12);
  g.add(fence);
  const fence2 = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0015, 0.28), mats.steelDark);
  fence2.position.set(-0.08, -0.001, 0.04);
  g.add(fence2);
}

function addPadApronDecals(g: THREE.Group): void {
  addPadScorch(g);
  addPadWaterStains(g);
  addPadRunoffTrails(g);
}

function addPadRoadsAndCars(g: THREE.Group, mats: PadSurroundMats): void {
  addPadFences(g, mats);
  addBlvd(g, mats);
  addParkingCars(g, mats);
}

function addNamedBox(
  g: THREE.Group, size: [number, number, number], mat: THREE.Material,
  pos: [number, number, number], name?: string,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.position.set(...pos);
  if (name) mesh.name = name;
  g.add(mesh);
}

function addBlvd(g: THREE.Group, mats: PadSurroundMats): void {
  addNamedBox(g, [0.7, 0.002, 0.014], mats.asphalt, [0.1, -0.0035, 0.28], "pad-boca-chica-blvd");
  addNamedBox(g, [0.72, 0.0015, 0.03], mats.dirt, [0.1, -0.004, 0.28]);
  addNamedBox(g, [0.2, 0.002, 0.04], mats.concreteDark, [-0.05, -0.003, 0.22]);
}

function addParkingCars(g: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 14; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0016, 0.0022), mats.carPaint);
    const side = i < 8 ? 1 : -1;
    car.position.set(-0.12 + (i % 8) * 0.018, -0.0015, 0.22 + side * 0.012 + (i % 3) * 0.002);
    g.add(car);
  }
}

function addHorizontalTank(
  farm: THREE.Group,
  mats: PadSurroundMats,
  tankR: number,
  tankLen: number,
  x: number,
  z: number,
): void {
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR, tankLen, 14), mats.tankWhite);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(x, tankR + 0.001, z);
  farm.add(tank);
  for (const end of [-1, 1] as const) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(tankR * 1.02, 10, 8), mats.tankWhite);
    cap.position.set(x, tankR + 0.001, z + end * (tankLen * 0.5));
    farm.add(cap);
  }
}

function addPrimaryTankBank(farm: THREE.Group, mats: PadSurroundMats): void {
  const tankR = 0.0038;
  const tankLen = 0.03;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      addHorizontalTank(farm, mats, tankR, tankLen, 0.01 + col * 0.011, -0.02 + row * 0.012);
    }
  }
}

function addSecondaryHorizTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let col = 0; col < 3; col++) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.022, 12), mats.tankWhite);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0.055 + col * 0.01, 0.0042, 0.03);
    farm.add(tank);
  }
}

function addBulletTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 6; i++) {
    const h = 0.01 + (i % 3) * 0.003;
    const bullet = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, h, 10), mats.steel);
    bullet.position.set(-0.02 + i * 0.008, h * 0.5, 0.045);
    farm.add(bullet);
  }
}

function addSecondaryTanks(farm: THREE.Group, mats: PadSurroundMats): void {
  addSecondaryHorizTanks(farm, mats);
  addBulletTanks(farm, mats);
}

function addPipeRackBoxes(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 5; i++) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.006 + (i % 2) * 0.003, 0.01), mats.steelDark);
    rack.position.set(-0.02, 0.005, -0.025 + i * 0.012);
    farm.add(rack);
  }
}

function addPipeRuns(farm: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 4; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.05, 6), mats.steel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0.01, 0.008, -0.02 + i * 0.014);
    farm.add(pipe);
  }
}

function addPipeRacks(farm: THREE.Group, mats: PadSurroundMats): void {
  addPipeRackBoxes(farm, mats);
  addPipeRuns(farm, mats);
}

const FARM_EQUIP: { size: [number, number, number]; pos: [number, number, number] }[] = [
  { size: [0.022, 0.008, 0.016], pos: [0.07, 0.005, -0.01] },
  { size: [0.016, 0.01, 0.02], pos: [0.08, 0.006, 0.04] },
  { size: [0.03, 0.005, 0.012], pos: [0.04, 0.004, 0.055] },
  { size: [0.012, 0.012, 0.012], pos: [-0.03, 0.007, 0.02] },
  { size: [0.018, 0.004, 0.018], pos: [0.06, 0.003, -0.04] },
];
const FARM_STACKS: readonly (readonly [number, number, number])[] = [
  [0.05, 0.06, 0.03], [0.07, 0.05, 0.024], [0.03, 0.065, 0.02], [0.085, 0.03, 0.018],
];

function addFarmEquipBoxes(farm: THREE.Group, mats: PadSurroundMats): void {
  for (const e of FARM_EQUIP) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(...e.size), mats.steelDark);
    box.position.set(...e.pos);
    farm.add(box);
  }
}

function addFarmStacks(farm: THREE.Group, mats: PadSurroundMats): void {
  for (const [sx, sz, h] of FARM_STACKS) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0009, h, 8), mats.steelDark);
    stack.position.set(sx, h * 0.5, sz);
    farm.add(stack);
  }
}

function addFarmEquipment(farm: THREE.Group, mats: PadSurroundMats): void {
  addFarmEquipBoxes(farm, mats);
  addFarmStacks(farm, mats);
}

function buildTankFarm(mats: PadSurroundMats): THREE.Group {
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  farm.position.set(0.09, 0, 0.04);
  addPrimaryTankBank(farm, mats);
  addSecondaryTanks(farm, mats);
  addPipeRacks(farm, mats);
  addFarmEquipment(farm, mats);
  return farm;
}

function addPadWarehouseAndYards(g: THREE.Group, mats: PadSurroundMats): void {
  g.add(buildWarehouse(mats));
  addEastYard(g, mats);
}

function buildWarehouse(mats: PadSurroundMats): THREE.Group {
  const warehouse = new THREE.Group();
  warehouse.name = "pad-warehouse";
  warehouse.position.set(0.22, 0, 0.12);
  addWarehouseShell(warehouse, mats);
  return warehouse;
}

function addWarehouseShell(warehouse: THREE.Group, mats: PadSurroundMats): void {
  const whBody = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.012, 0.035), mats.warehouseWall);
  whBody.position.y = 0.006;
  warehouse.add(whBody);
  const whRoof = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.002, 0.038), mats.warehouseRoof);
  whRoof.position.y = 0.013;
  warehouse.add(whRoof);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.02), mats.steelDark);
  shed.position.set(-0.04, 0.004, -0.01);
  warehouse.add(shed);
}

function addEastYard(g: THREE.Group, mats: PadSurroundMats): void {
  const eastYard = new THREE.Group();
  eastYard.position.set(0.28, 0, 0.05);
  for (let i = 0; i < 8; i++) {
    const unit = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.008), i % 2 === 0 ? mats.steelDark : mats.steel);
    unit.position.set((i % 4) * 0.014, 0.003, Math.floor(i / 4) * 0.015);
    eastYard.add(unit);
  }
  g.add(eastYard);
}

function addPadHopperAndCrane(g: THREE.Group, mats: PadSurroundMats): void {
  addStarhopperSite(g, mats);
  addCrane(g, mats);
  addTrailers(g);
}

function addStarhopperSite(g: THREE.Group, mats: PadSurroundMats): void {
  const hopperPad = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.038, 0.002, 24), mats.concreteDark);
  hopperPad.position.set(0.05, -0.0035, 0.42);
  g.add(hopperPad);
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.012, 10), mats.steel);
  hopper.position.set(0.05, 0.005, 0.42);
  g.add(hopper);
}

function addCrane(g: THREE.Group, mats: PadSurroundMats): void {
  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.008), mats.steelDark);
  craneBase.position.set(-0.04, 0.002, -0.05);
  g.add(craneBase);
  const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0012, 0.0012), mats.steel);
  craneBoom.position.set(-0.02, 0.012, -0.05);
  craneBoom.rotation.z = -0.35;
  g.add(craneBoom);
}

function addTrailers(g: THREE.Group): void {
  for (let i = 0; i < 4; i++) {
    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.0035, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.3, roughness: 0.7 }),
    );
    trailer.position.set(-0.06 + i * 0.02, 0.001, 0.16);
    g.add(trailer);
  }
}

/**
 * Cool-white tower floods + warm plume fill under the stack.
 *
 * Intensities start at 0; {@link updateStarbaseLaunchFx} drives them from
 * `padOpsLights` / flame strength each tick (day/night aware).
 *
 * Named lights: `pad-flood-0..2`, `pad-fill`, `pad-plume-light`,
 * `pad-flood-fixture-*`, `pad-olm-lamp-*`.
 */
const FLOOD_TARGETS: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [0.018, 0.09, 0.012], look: [0, 0.055, 0] },
  { pos: [0.018, 0.055, -0.012], look: [0, 0.04, 0] },
  { pos: [0.012, 0.12, 0], look: [0, 0.09, 0] },
];

function makeFloodSpot(i: number, f: (typeof FLOOD_TARGETS)[number]): THREE.SpotLight {
  const spot = new THREE.SpotLight(0xe8f0ff, 0, 0.35, Math.PI / 5.5, 0.45, 1.6);
  spot.name = `pad-flood-${i}`;
  spot.position.set(f.pos[0], f.pos[1], f.pos[2]);
  spot.target.position.set(f.look[0], f.look[1], f.look[2]);
  return spot;
}

function makeFloodFixtureMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8890a0, emissive: 0xc8d4e8, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.4,
  });
}

function makeFloodFixture(i: number, pos: THREE.Vector3): THREE.Mesh {
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.002), makeFloodFixtureMat());
  fixture.position.copy(pos);
  fixture.name = `pad-flood-fixture-${i}`;
  return fixture;
}

function addFloodLights(g: THREE.Group): void {
  for (let i = 0; i < FLOOD_TARGETS.length; i++) {
    const f = FLOOD_TARGETS[i]!;
    const spot = makeFloodSpot(i, f);
    g.add(spot);
    g.add(spot.target);
    g.add(makeFloodFixture(i, spot.position));
  }
}

function addPadFillLights(g: THREE.Group): void {
  const fill = new THREE.PointLight(0xdde6f4, 0, 0.28, 1.8);
  fill.name = "pad-fill";
  fill.position.set(0, 0.03, 0);
  g.add(fill);
  const plume = new THREE.PointLight(0xff9a58, 0, 0.22, 2);
  plume.name = "pad-plume-light";
  plume.position.set(0, 0.008, 0);
  g.add(plume);
}

function addOlmLamp(g: THREE.Group, i: number): void {
  const ang = (i / 8) * Math.PI * 2;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.0006, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xf0f4ff }),
  );
  lamp.position.set(Math.cos(ang) * 0.013, 0.003, Math.sin(ang) * 0.013);
  lamp.name = `pad-olm-lamp-${i}`;
  g.add(lamp);
}

function addOlmLamps(g: THREE.Group): void {
  for (let i = 0; i < 8; i++) addOlmLamp(g, i);
}

/**
 * Cool-white tower floods + warm plume fill under the stack.
 */
function createPadLights(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-lights";
  addFloodLights(g);
  addPadFillLights(g);
  addOlmLamps(g);
  return g;
}

/**
 * Drive flame trench, deluge steam / sheets, heat haze, vent plumes, and pad
 * lighting from mission state.
 *
 * **Scrub-safe:** scalars and poses come only from pure helpers in
 * `padLaunchFx.ts` (`derivePadFx`, `*SpritePose`, `*Visual`). This function
 * mutates THREE objects and does not allocate new meshes.
 *
 * `state.missionT` may be negative (pre-liftoff countdown) so tank-farm vent
 * steam reads during the T− hold like the webcast.
 *
 * @param pad - Root from {@link createStarbasePad} (or any parent of the named FX nodes)
 * @param state - Mission sample fields + optional `sunElev`
 */
/** Map a pure SpritePose onto a billboard (opacity + transform). */
function applySpritePose(
  obj: THREE.Sprite,
  pose: { opacity: number; position: { x: number; y: number; z: number }; scale: { x: number; y: number } },
): void {
  const mat = obj.material as THREE.SpriteMaterial;
  mat.opacity = pose.opacity;
  obj.position.set(pose.position.x, pose.position.y, pose.position.z);
  obj.scale.set(pose.scale.x, pose.scale.y, 1);
}

function updatePadFlame(pad: THREE.Object3D, strength: number): void {
  const flameMesh = pad.getObjectByName("pad-flame") as THREE.Mesh | undefined;
  if (flameMesh) {
    const fv = flameVisual(strength);
    const mat = (flameMesh.userData.mat as THREE.MeshBasicMaterial) ?? (flameMesh.material as THREE.MeshBasicMaterial);
    flameMesh.visible = fv.visible;
    mat.opacity = fv.opacity;
    flameMesh.scale.set(1, fv.scaleY, 1);
  }
  updatePadTongues(pad, strength);
}

function updatePadTongues(pad: THREE.Object3D, strength: number): void {
  const tongues = pad.getObjectByName("pad-flame-tongues");
  if (!tongues) return;
  const tv = tongueVisual(strength);
  tongues.visible = tv.visible;
  const mat = tongues.userData.mat as THREE.MeshBasicMaterial | undefined;
  if (mat) mat.opacity = tv.opacity;
  tongues.scale.set(1, tv.scaleY, 1);
}

function steamBaseFromUserData(obj: THREE.Sprite) {
  return {
    baseAng: (obj.userData.baseAng as number) ?? 0,
    baseR: (obj.userData.baseR as number) ?? 0.04,
    baseY: (obj.userData.baseY as number) ?? 0.02,
    baseScale: (obj.userData.baseScale as number) ?? 0.1,
    phase: (obj.userData.phase as number) ?? 0,
    tier: (obj.userData.tier as number) ?? 0,
  };
}

function tintSteamSprite(obj: THREE.Sprite, warmth: number, night: number): void {
  const [r, g, b] = steamTintRgb(warmth, night);
  (obj.material as THREE.SpriteMaterial).color.setRGB(r, g, b);
}

function updatePadSteam(
  pad: THREE.Object3D,
  steamStr: number,
  night: number,
  animT: number,
  warmth: number,
): void {
  const steam = pad.getObjectByName("pad-steam");
  if (!steam) return;
  steam.visible = steamStr > 0.03;
  steam.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    applySpritePose(obj, steamSpritePose(steamBaseFromUserData(obj), steamStr, night, animT));
    tintSteamSprite(obj, warmth * 0.55, night);
  });
}

function sheetBaseFromUserData(obj: THREE.Sprite) {
  return {
    baseX: (obj.userData.baseX as number) ?? 0,
    baseY: (obj.userData.baseY as number) ?? 0,
    baseZ: (obj.userData.baseZ as number) ?? 0,
    baseSx: (obj.userData.baseSx as number) ?? 0.05,
    baseSy: (obj.userData.baseSy as number) ?? 0.04,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updatePadSheets(
  pad: THREE.Object3D,
  steamStr: number,
  night: number,
  animT: number,
  warmth: number,
): void {
  const sheets = pad.getObjectByName("pad-deluge-sheets");
  if (!sheets) return;
  sheets.visible = steamStr > 0.04;
  sheets.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    applySpritePose(obj, sheetSpritePose(sheetBaseFromUserData(obj), steamStr, night, animT));
    tintSteamSprite(obj, warmth * 0.85, night);
  });
}

function updatePadGroundSteam(
  pad: THREE.Object3D,
  steamStr: number,
  night: number,
  animT: number,
  warmth: number,
): void {
  const ground = pad.getObjectByName("pad-ground-steam");
  if (!ground) return;
  ground.visible = steamStr > 0.04;
  ground.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    applySpritePose(obj, groundSheetPose(sheetBaseFromUserData(obj), steamStr, night, animT));
    tintSteamSprite(obj, warmth, night);
  });
}

function hazeBaseFromUserData(obj: THREE.Object3D) {
  return {
    baseZ: (obj.userData.baseZ as number) ?? 0,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updatePadHaze(pad: THREE.Object3D, hazePeak: number, animT: number): void {
  const haze = pad.getObjectByName("pad-heat-haze");
  if (!haze) return;
  haze.visible = hazePeak > 0.04;
  haze.traverse((obj) => {
    if (obj instanceof THREE.Sprite) applySpritePose(obj, hazeSpritePose(hazeBaseFromUserData(obj), hazePeak, animT));
  });
}

function ventBaseFromUserData(obj: THREE.Object3D) {
  return {
    baseX: (obj.userData.baseX as number) ?? 0,
    baseY: (obj.userData.baseY as number) ?? 0,
    baseZ: (obj.userData.baseZ as number) ?? 0,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updatePadVent(pad: THREE.Object3D, ventStr: number, night: number, animT: number): void {
  const vent = pad.getObjectByName("pad-vent-steam");
  if (!vent) return;
  vent.visible = ventStr > 0.04;
  vent.traverse((obj) => {
    if (obj instanceof THREE.Sprite) {
      applySpritePose(obj, ventSpritePose(ventBaseFromUserData(obj), ventStr, night, animT));
    }
  });
}

function updatePadFloods(
  pad: THREE.Object3D,
  floodBase: number,
  strength: number,
  night: number,
): void {
  for (let i = 0; i < 3; i++) {
    const spot = pad.getObjectByName(`pad-flood-${i}`) as THREE.SpotLight | undefined;
    if (!spot) continue;
    spot.intensity = floodSpotIntensity(floodBase, strength, i);
    spot.distance = floodSpotDistance(night);
  }
}

function updatePadFillLight(
  pad: THREE.Object3D,
  padOps: boolean,
  day: number,
  night: number,
  strength: number,
): void {
  const fill = pad.getObjectByName("pad-fill") as THREE.PointLight | undefined;
  if (!fill) return;
  fill.intensity = padFillIntensity(padOps, day, night, strength);
  fill.color.setHex(padFillColorHex(strength));
  fill.distance = padFillDistance(night);
}

function updatePadPlumeLight(pad: THREE.Object3D, strength: number, flicker: number): void {
  const plume = pad.getObjectByName("pad-plume-light") as THREE.PointLight | undefined;
  if (!plume) return;
  plume.intensity = plumeLightIntensity(strength);
  plume.distance = plumeLightDistance(strength);
  const [r, g, b] = plumeLightRgb(flicker);
  plume.color.setRGB(r, g, b);
}

function updatePadFixtures(pad: THREE.Object3D, floodBase: number): void {
  for (let i = 0; i < 3; i++) {
    const fixture = pad.getObjectByName(`pad-flood-fixture-${i}`) as THREE.Mesh | undefined;
    if (!fixture) continue;
    (fixture.material as THREE.MeshStandardMaterial).emissiveIntensity = floodFixtureEmissive(floodBase);
  }
}

function updatePadOlmLamps(pad: THREE.Object3D, padOps: boolean, night: number): void {
  for (let i = 0; i < 8; i++) {
    const lamp = pad.getObjectByName(`pad-olm-lamp-${i}`) as THREE.Mesh | undefined;
    if (!lamp) continue;
    lamp.visible = padOps;
    const mat = lamp.material as THREE.MeshBasicMaterial;
    mat.opacity = 1;
    mat.color.setHex(olmLampColorHex(padOps, night));
  }
}

function updatePadBloom(pad: THREE.Object3D, strength: number, flicker: number): void {
  const bloom = pad.getObjectByName("pad-ground-bloom") as THREE.Sprite | undefined;
  if (!bloom) return;
  const bv = bloomVisual(strength, flicker);
  bloom.visible = bv.visible;
  if (bv.visible) {
    (bloom.material as THREE.SpriteMaterial).opacity = bv.opacity;
    bloom.scale.set(bv.scale, bv.scale, 1);
  }
}

function updatePadSpriteFx(
  pad: THREE.Object3D,
  steamStr: number,
  hazePeak: number,
  ventStr: number,
  night: number,
  animT: number,
  flameStrength: number,
): void {
  const warmth = steamWarmth(flameStrength);
  updatePadSteam(pad, steamStr, night, animT, warmth);
  updatePadSheets(pad, steamStr, night, animT, warmth);
  updatePadGroundSteam(pad, steamStr, night, animT, warmth);
  updatePadHaze(pad, hazePeak, animT);
  updatePadVent(pad, ventStr, night, animT);
}

function updatePadLightingFx(
  pad: THREE.Object3D,
  fx: ReturnType<typeof derivePadFx>,
): void {
  const { day, night, flame, padOps, floodBase } = fx;
  const { strength, flicker } = flame;
  updatePadFloods(pad, floodBase, strength, night);
  updatePadFillLight(pad, padOps, day, night, strength);
  updatePadPlumeLight(pad, strength, flicker);
  updatePadFixtures(pad, floodBase);
  updatePadOlmLamps(pad, padOps, night);
  updatePadBloom(pad, strength, flicker);
}

/**
 * Drive flame trench, deluge steam / sheets, heat haze, vent plumes, and pad
 * lighting from mission state.
 *
 * **Scrub-safe:** scalars and poses come only from pure helpers in
 * `padLaunchFx.ts` (`derivePadFx`, `*SpritePose`, `*Visual`). This function
 * mutates THREE objects and does not allocate new meshes.
 *
 * @param pad - Root from {@link createStarbasePad}
 * @param state - Mission sample fields + optional `sunElev`
 */
export function updateStarbaseLaunchFx(
  pad: THREE.Object3D,
  state: LaunchPadFxState,
): void {
  const fx = derivePadFx(state);
  const { animT, night, flame, steamStr, hazePeak, ventStr } = fx;
  updatePadFlame(pad, flame.strength);
  updatePadSpriteFx(pad, steamStr, hazePeak, ventStr, night, animT, flame.strength);
  updatePadLightingFx(pad, fx);
}

/**
 * Scrub-driven chopsticks close + carriage settle (visual V8).
 * Rest poses are stored on `userData` at build time. Gulf profile poses are
 * identity (close = 0) so Flight 13 leaves the arms open.
 *
 * @param pad - Root from {@link createStarbasePad}
 * @param pose - From `deriveChopstickPose`
 */
export function updateMechazillaRecovery(
  pad: THREE.Object3D,
  pose: { close: number; yawInRad: number; pitchRad: number; carriageDy: number },
): void {
  applyChopstickArm(pad.getObjectByName("pad-chopstick-L"), pose);
  applyChopstickArm(pad.getObjectByName("pad-chopstick-R"), pose);
  const carriage = pad.getObjectByName("pad-chopstick-carriage");
  if (carriage) {
    const restY = (carriage.userData.restY as number | undefined) ?? carriage.position.y;
    carriage.position.y = restY + pose.carriageDy;
  }
}

function applyChopstickArm(
  arm: THREE.Object3D | undefined,
  pose: { yawInRad: number; pitchRad: number },
): void {
  if (!arm) return;
  const restY = (arm.userData.restRotY as number | undefined) ?? arm.rotation.y;
  const restZ = (arm.userData.restRotZ as number | undefined) ?? arm.rotation.z;
  const sign = restY === 0 ? 1 : Math.sign(restY);
  arm.rotation.y = restY - sign * pose.yawInRad;
  arm.rotation.z = restZ + pose.pitchRad;
}

/**
 * Sub-satellite ground track for launch → early low Earth orbit.
 *
 * Built in **Earth mesh-local** coords so the line co-rotates with the surface
 * (same frame as the Starbase pad). Samples are projected to a thin shell just
 * above the WGS84 ellipsoid (+ 1.5 km) and downsampled to ≤400 points.
 *
 * @param samples - Baked trajectory samples (mission time ascending)
 * @returns Fat line named `ascent-ground-track`, or `null` if too few points
 */
function shouldKeepAscentSample(s: Sample, ptsLen: number): "keep" | "skip" | "stop" {
  if (s.phase !== "launch" && s.phase !== "ascent" && s.phase !== "lowEarthOrbit") {
    return ptsLen > 10 ? "stop" : "skip";
  }
  if (s.phase === "lowEarthOrbit" && s.t > 6000) return "stop";
  return "keep";
}

function projectOntoShell(
  s: Sample, epoch: EphemerisEpoch, rel: ReturnType<typeof v3>,
): void {
  const b = bodyPositions(s.t, epoch);
  rel.x = s.pos.x - b.earth.x;
  rel.y = s.pos.y - b.earth.y;
  rel.z = s.pos.z - b.earth.z;
}

const _meshNorth = { x: 0, y: 1, z: 0 };

function projectSampleToMeshLocal(
  s: Sample, epoch: EphemerisEpoch, rel: ReturnType<typeof v3>, local: ReturnType<typeof v3>,
): THREE.Vector3 {
  projectOntoShell(s, epoch, rel);
  inertialRelToMeshLocal(rel, s.t, local, epoch);
  const r = Math.hypot(local.x, local.y, local.z) || 1;
  const shell = earthSurfaceRadiusAlong(local, _meshNorth, 1.5);
  const sR = shell / r;
  return new THREE.Vector3(local.x * sR, local.y * sR, local.z * sR);
}

function tryPushAscentSample(
  pts: THREE.Vector3[], s: Sample, epoch: EphemerisEpoch,
  rel: ReturnType<typeof v3>, local: ReturnType<typeof v3>,
): "continue" | "stop" {
  const gate = shouldKeepAscentSample(s, pts.length);
  if (gate === "stop") return "stop";
  if (gate === "keep") pts.push(projectSampleToMeshLocal(s, epoch, rel, local));
  return "continue";
}

function collectAscentPoints(samples: Sample[], epoch: EphemerisEpoch): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const rel = v3();
  const local = v3();
  for (const s of samples) {
    if (tryPushAscentSample(pts, s, epoch, rel, local) === "stop") break;
  }
  return pts;
}

function downsamplePts(pts: THREE.Vector3[], maxPts: number): THREE.Vector3[] {
  if (pts.length <= maxPts) return pts;
  return Array.from({ length: maxPts }, (_, i) => {
    const u = i / (maxPts - 1);
    return pts[Math.round(u * (pts.length - 1))]!;
  });
}

export function createAscentGroundTrack(
  samples: Sample[],
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): THREE.Object3D | null {
  const pts = collectAscentPoints(samples, epoch);
  if (pts.length < 4) return null;
  const line = createFatLine(downsamplePts(pts, 400), {
    color: 0xff8866, opacity: 0.85, linewidth: 2.75, depthTest: true,
  });
  line.name = "ascent-ground-track";
  return line;
}

/**
 * Tight warm bloom sprite under the plume (true-scale; only while burning).
 * Procedural canvas radial; opacity driven each tick by {@link bloomVisual}.
 */
function paintGroundBloom(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 200, 140, 0.9)");
  g.addColorStop(0.3, "rgba(255, 120, 60, 0.35)");
  g.addColorStop(0.65, "rgba(255, 80, 40, 0.08)");
  g.addColorStop(1, "rgba(255, 60, 30, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function makeGroundBloomSprite(): THREE.Sprite {
  const map = makeSizedCanvasTexture(64, paintGroundBloom);
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  }));
}

/**
 * True-scale Orbital Launch Integration Tower (Mechazilla) + OLM.
 *
 * Scene units = km. ~146 m tall, ~14 m face. Stack is ~9 m diameter / ~123 m
 * tall — tower stands just clear of the OLM (~22 m offset on +X).
 *
 * V3 silhouette: thicker chopsticks, carriage cheeks, QD boom with umbilical
 * bellows, heat-darkened OLM top ring. Group name: `mechazilla`.
 */
type TowerMats = {
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  steelBright: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
};

function makeTowerMats(): TowerMats {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0xb4b8c0, metalness: 0.72, roughness: 0.38 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x7a8088, metalness: 0.65, roughness: 0.45 }),
    steelBright: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.78, roughness: 0.32 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x5a6068, metalness: 0.55, roughness: 0.5 }),
  };
}

const TOWER_H = 0.146;
const TOWER_FACE = 0.014;
const TOWER_COL = 0.0016;
const TOWER_OX = 0.022;
const TOWER_OY0 = 0.0;

function addTowerColumns(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const corners: [number, number][] = [[-half, -half], [half, -half], [-half, half], [half, half]];
  for (const [cx, cz] of corners) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL, TOWER_H, TOWER_COL), mats.steel);
    col.position.set(TOWER_OX + cx, TOWER_OY0 + TOWER_H * 0.5, cz);
    g.add(col);
  }
}

function addTowerRingBeamsZ(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  for (const z of [-half, half]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE, TOWER_COL * 0.7, TOWER_COL * 0.65), mats.steelDark);
    beam.position.set(TOWER_OX, y, z);
    g.add(beam);
  }
}

function addTowerRingBeamsX(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  for (const x of [-half, half]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL * 0.65, TOWER_COL * 0.7, TOWER_FACE), mats.steelDark);
    beam.position.set(TOWER_OX + x, y, 0);
    g.add(beam);
  }
}

function addTowerRingAtY(g: THREE.Group, mats: TowerMats, y: number, half: number): void {
  addTowerRingBeamsZ(g, mats, y, half);
  addTowerRingBeamsX(g, mats, y, half);
}

function addTowerRings(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const nRings = 12;
  for (let i = 1; i <= nRings; i++) {
    addTowerRingAtY(g, mats, TOWER_OY0 + (i / nRings) * TOWER_H * 0.96, half);
  }
}

function addTowerRail(g: THREE.Group, mats: TowerMats, half: number): void {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(TOWER_COL * 1.2, TOWER_H * 0.92, TOWER_COL * 2.2), mats.steelBright);
  rail.position.set(TOWER_OX - half - TOWER_COL * 0.4, TOWER_OY0 + TOWER_H * 0.48, 0);
  g.add(rail);
}

function addTowerPeakAndSheave(g: THREE.Group, mats: TowerMats, half: number): void {
  const peak = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE * 1.15, 0.008, TOWER_FACE * 1.15), mats.steelBright);
  peak.position.set(TOWER_OX, TOWER_OY0 + TOWER_H + 0.002, 0);
  g.add(peak);
  const sheave = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, TOWER_FACE * 0.7, 10), mats.steelDark);
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(TOWER_OX - half * 0.3, TOWER_OY0 + TOWER_H + 0.006, 0);
  g.add(sheave);
}

function addTowerRailAndPeak(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  addTowerRail(g, mats, half);
  addTowerPeakAndSheave(g, mats, half);
}

function addChopstickCheeks(g: THREE.Group, mats: TowerMats, carryY: number, half: number): void {
  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE * 0.55, 0.008, 0.004), mats.steelBright);
    cheek.position.set(TOWER_OX - half * 0.3, carryY + 0.002, side * (TOWER_FACE * 0.72));
    g.add(cheek);
  }
}

function addChopstickCarriage(g: THREE.Group, mats: TowerMats, carryY: number): void {
  const half = TOWER_FACE * 0.5;
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(TOWER_FACE * 1.35, 0.012, TOWER_FACE * 1.55), mats.steelDark);
  carriage.position.set(TOWER_OX, carryY, 0);
  carriage.name = "pad-chopstick-carriage";
  carriage.userData.restY = carryY;
  g.add(carriage);
  addChopstickCheeks(g, mats, carryY, half);
}

function buildChopstickArm(mats: TowerMats, side: number): THREE.Group {
  const armLen = 0.026;
  const armSq = 0.0028;
  const stick = new THREE.Group();
  stick.name = side < 0 ? "pad-chopstick-L" : "pad-chopstick-R";
  addChopstickParts(stick, mats, armLen, armSq);
  return stick;
}

function addChopstickParts(stick: THREE.Group, mats: TowerMats, armLen: number, armSq: number): void {
  const beam = new THREE.Mesh(new THREE.BoxGeometry(armLen, armSq, armSq * 1.6), mats.steelBright);
  beam.position.set(-armLen * 0.5, 0, 0);
  stick.add(beam);
  const railUnd = new THREE.Mesh(new THREE.BoxGeometry(armLen * 0.92, armSq * 0.45, armSq * 0.55), mats.accent);
  railUnd.position.set(-armLen * 0.5, -armSq * 0.55, 0);
  stick.add(railUnd);
  addChopstickTip(stick, mats, armLen, armSq);
}

function addChopstickTip(stick: THREE.Group, mats: TowerMats, armLen: number, armSq: number): void {
  const finger = new THREE.Mesh(new THREE.BoxGeometry(0.007, armSq * 1.5, armSq * 2.6), mats.steel);
  finger.position.set(-armLen + 0.002, 0, 0);
  stick.add(finger);
  const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.0035, armSq * 1.1, 0.012), mats.accent);
  tooth.position.set(-armLen + 0.005, 0, 0);
  stick.add(tooth);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.006, 8), mats.steelDark);
  pin.position.set(-armLen + 0.003, 0.001, 0);
  stick.add(pin);
}

function addChopsticks(g: THREE.Group, mats: TowerMats, carryY: number): void {
  const half = TOWER_FACE * 0.5;
  for (const side of [-1, 1] as const) {
    const stick = buildChopstickArm(mats, side);
    stick.position.set(TOWER_OX - half, carryY + 0.005, side * 0.013);
    stick.rotation.y = side * 0.05;
    stick.rotation.z = -0.03;
    stick.userData.restRotY = stick.rotation.y;
    stick.userData.restRotZ = stick.rotation.z;
    g.add(stick);
  }
}

function addQdArm(g: THREE.Group, mats: TowerMats): void {
  const half = TOWER_FACE * 0.5;
  const qdY = TOWER_OY0 + 0.098;
  const qd = new THREE.Group();
  qd.name = "pad-qd-arm";
  addQdBoom(qd, mats);
  addQdHead(qd, mats);
  qd.position.set(TOWER_OX - half, qdY, 0.004);
  qd.rotation.z = 0.08;
  g.add(qd);
}

function addQdBellows(qd: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < 4; i++) {
    const bellow = new THREE.Mesh(new THREE.CylinderGeometry(0.0014, 0.0016, 0.0018, 8), mats.steelDark);
    bellow.rotation.z = Math.PI / 2;
    bellow.position.set(-0.018 - i * 0.0016, -0.001, 0);
    qd.add(bellow);
  }
}

function addQdBoom(qd: THREE.Group, mats: TowerMats): void {
  const qdBoom = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0024, 0.0024), mats.steelBright);
  qdBoom.position.set(-0.011, 0, 0);
  qd.add(qdBoom);
  const qdTruss = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.001, 0.001), mats.accent);
  qdTruss.position.set(-0.01, -0.0022, 0);
  qd.add(qdTruss);
  addQdBellows(qd, mats);
}

function addQdHead(qd: THREE.Group, mats: TowerMats): void {
  const qdHead = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.0055, 0.0055), mats.steelDark);
  qdHead.position.set(-0.024, 0, 0);
  qd.add(qdHead);
  const qdFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.0012, 0.004, 0.004),
    new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.5, roughness: 0.55 }),
  );
  qdFace.position.set(-0.027, 0, 0);
  qd.add(qdFace);
}

function addOlm(g: THREE.Group, mats: TowerMats): void {
  const olmMat = new THREE.MeshStandardMaterial({
    color: 0x4a4844, metalness: 0.62, roughness: 0.55, side: THREE.DoubleSide,
  });
  // Open-ended ring (real OLM is a table with a hole) so trench cam sees Raptors.
  const olm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.004, 20, 1, true), olmMat);
  olm.position.set(0, TOWER_OY0 + 0.002, 0);
  olm.name = "pad-olm";
  g.add(olm);
  addOlmTopAndLegs(g, mats);
}

function addOlmTop(g: THREE.Group): void {
  const olmTop = new THREE.Mesh(
    new THREE.RingGeometry(0.006, 0.0115, 24, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a2824, metalness: 0.4, roughness: 0.75, map: makeScorchTexture() }),
  );
  olmTop.rotation.x = -Math.PI / 2;
  olmTop.position.set(0, TOWER_OY0 + 0.0042, 0);
  g.add(olmTop);
}

function addOlmLegs(g: THREE.Group, mats: TowerMats): void {
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.008, 0.0025), mats.accent);
    leg.position.set(Math.cos(ang) * 0.011, TOWER_OY0 + 0.004, Math.sin(ang) * 0.011);
    g.add(leg);
  }
}

function addOlmTopAndLegs(g: THREE.Group, mats: TowerMats): void {
  addOlmTop(g);
  addOlmLegs(g, mats);
}

function addTowerUpper(g: THREE.Group, mats: TowerMats): void {
  addTowerColumns(g, mats);
  addTowerRings(g, mats);
  addTowerBracing(g, TOWER_OX, TOWER_OY0, TOWER_H, TOWER_FACE, TOWER_COL, 12, mats.accent);
  addTowerRailAndPeak(g, mats);
}

function addTowerArmsAndOlm(g: THREE.Group, mats: TowerMats): void {
  const carryY = TOWER_OY0 + 0.078;
  addChopstickCarriage(g, mats, carryY);
  addChopsticks(g, mats, carryY);
  addQdArm(g, mats);
  addOlm(g, mats);
}

function createMechazillaTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = "mechazilla";
  const mats = makeTowerMats();
  addTowerUpper(g, mats);
  addTowerArmsAndOlm(g, mats);
  return g;
}

/**
 * Diagonal X-brace panels on Mechazilla faces.
 * Places braces every other ring bay to avoid an over-dense lattice from LEO.
 */
function addBracePairX(
  g: THREE.Group, ox: number, half: number, midY: number, len: number, tilt: number, col: number, mat: THREE.Material,
): void {
  for (const flip of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(col * 0.35, len, col * 0.35), mat);
    b.position.set(ox - half, midY, 0);
    b.rotation.x = flip * tilt;
    g.add(b);
  }
}

function addBracePairZ(
  g: THREE.Group, ox: number, half: number, midY: number, len: number, tilt: number, col: number, mat: THREE.Material,
): void {
  for (const z of [-half, half]) {
    for (const flip of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(col * 0.35, len, col * 0.35), mat);
      b.position.set(ox, midY, z);
      b.rotation.z = flip * tilt;
      g.add(b);
    }
  }
}

function addBraceBay(
  g: THREE.Group, ox: number, half: number, y0: number, h: number, face: number,
  col: number, nRings: number, i: number, mat: THREE.Material,
): void {
  const ya = y0 + ((i + 0.12) / nRings) * h * 0.96;
  const yb = y0 + ((i + 0.88) / nRings) * h * 0.96;
  const midY = (ya + yb) * 0.5;
  const len = Math.hypot(face, yb - ya);
  const tilt = Math.atan2(face, yb - ya);
  addBracePairX(g, ox, half, midY, len, tilt, col, mat);
  addBracePairZ(g, ox, half, midY, len, tilt, col, mat);
}

function addTowerBracing(
  g: THREE.Group, ox: number, y0: number, h: number, face: number, col: number, nRings: number, mat: THREE.Material,
): void {
  const half = face * 0.5;
  for (let i = 0; i < nRings - 1; i += 1) {
    if (i % 2 === 0) addBraceBay(g, ox, half, y0, h, face, col, nRings, i, mat);
  }
}

/**
 * Soft radial steam billboard texture (shared by deluge ring, sheets, vents).
 * Procedural canvas — no external assets.
 */
function makeSizedCanvasTexture(size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d")!, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function paintSteam(ctx: CanvasRenderingContext2D, size: number): void {
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, "rgba(230, 235, 240, 0.85)");
  g.addColorStop(0.4, "rgba(200, 210, 220, 0.35)");
  g.addColorStop(1, "rgba(180, 190, 200, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function makeSteamTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(64, paintSteam);
}

/**
 * Irregular radial scorch for OLM apron / trench floor / OLM top (visual V3).
 *
 * Theater-grade procedural map — fixed blotch positions so scrub/recreate is
 * stable. Not a photo texture; cheap and pipeline-free.
 */
const SCORCH_BLOTCHES: readonly (readonly [number, number, number, number])[] = [
  [0.35, 0.4, 0.14, 0.55], [0.62, 0.55, 0.12, 0.45], [0.48, 0.28, 0.1, 0.4],
  [0.55, 0.7, 0.11, 0.35], [0.28, 0.58, 0.09, 0.5], [0.7, 0.38, 0.1, 0.38],
];

function paintScorchBase(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const base = ctx.createRadialGradient(cx, cx, 4, cx, cx, size * 0.48);
  base.addColorStop(0, "rgba(18, 16, 14, 0.95)");
  base.addColorStop(0.35, "rgba(42, 36, 30, 0.75)");
  base.addColorStop(0.65, "rgba(70, 60, 48, 0.4)");
  base.addColorStop(1, "rgba(90, 80, 65, 0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
}

function fillRadialDisc(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function paintScorchBlotch(
  ctx: CanvasRenderingContext2D, size: number, ux: number, uy: number, ur: number, a: number,
): void {
  fillRadialDisc(
    ctx, ux * size, uy * size, ur * size,
    `rgba(12, 10, 8, ${a})`, "rgba(20, 18, 14, 0)",
  );
}

function paintScorch(ctx: CanvasRenderingContext2D, size: number): void {
  paintScorchBase(ctx, size);
  for (const [ux, uy, ur, a] of SCORCH_BLOTCHES) paintScorchBlotch(ctx, size, ux, uy, ur, a);
}

function makeScorchTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(128, paintScorch);
}

/** Soft coastal scrub blotches (fixed seeds — scrub-stable recreate). */
const SCRUB_TERRAIN_BLOTS: readonly (readonly [number, number, number, string])[] = [
  [0.32, 0.38, 0.28, "rgba(154, 138, 104, 0.95)"],
  [0.68, 0.28, 0.24, "rgba(122, 106, 78, 0.9)"],
  [0.28, 0.68, 0.26, "rgba(176, 160, 128, 0.88)"],
  [0.72, 0.62, 0.22, "rgba(154, 138, 104, 0.9)"],
  [0.5, 0.52, 0.3, "rgba(138, 122, 90, 0.75)"],
  [0.42, 0.22, 0.18, "rgba(122, 106, 78, 0.85)"],
  [0.78, 0.45, 0.2, "rgba(176, 160, 128, 0.8)"],
  [0.55, 0.78, 0.22, "rgba(122, 106, 78, 0.88)"],
];

function paintScrubTerrain(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#8a7a5c";
  ctx.fillRect(0, 0, size, size);
  for (const [ux, uy, ur, color] of SCRUB_TERRAIN_BLOTS) {
    const x = ux * size;
    const y = uy * size;
    const r = ur * size;
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(138, 122, 92, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function makeScrubTerrainTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(256, paintScrubTerrain);
}

/**
 * Soft green-gray water / deluge runoff stain for apron decals.
 * Used as a transparent map on thin ground planes around the OLM.
 */
function fillWaterBlob(
  ctx: CanvasRenderingContext2D, size: number,
  x0: number, y0: number, r0: number, x1: number, y1: number, r1: number,
  stops: [number, string][],
): void {
  const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function paintWaterStain(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  fillWaterBlob(ctx, size, 32, 28, 2, 32, 34, 28, [
    [0, "rgba(90, 110, 95, 0.7)"], [0.45, "rgba(70, 85, 75, 0.4)"], [1, "rgba(60, 70, 60, 0)"],
  ]);
  fillWaterBlob(ctx, size, 40, 40, 1, 38, 42, 18, [
    [0, "rgba(80, 95, 85, 0.45)"], [1, "rgba(60, 70, 60, 0)"],
  ]);
}

function makeWaterStainTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(64, paintWaterStain);
}

/**
 * Soft additive shimmer for trench heat haze.
 * No real refraction — a warm gradient billboard as a theater cue only.
 */
function paintHeatHaze(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(32, 40, 2, 32, 28, 28);
  g.addColorStop(0, "rgba(255, 220, 180, 0.55)");
  g.addColorStop(0.4, "rgba(255, 180, 120, 0.2)");
  g.addColorStop(0.75, "rgba(255, 140, 80, 0.06)");
  g.addColorStop(1, "rgba(255, 100, 40, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function makeHeatHazeTexture(): THREE.CanvasTexture {
  return makeSizedCanvasTexture(64, paintHeatHaze);
}

/**
 * Pulse the tower beacon opacity from **wall-clock** time.
 *
 * UI chrome only — not scrub-critical. Opacity comes from pure
 * {@link padBeaconOpacity}; do not drive this from mission `t`.
 *
 * @param pad - Starbase pad root
 * @param wallT - Seconds of wall time (e.g. `performance.now() / 1000`)
 */
export function pulsePadBeacon(pad: THREE.Object3D, wallT: number): void {
  const beacon = pad.getObjectByName("pad-beacon") as THREE.Mesh | undefined;
  if (!beacon) return;
  const mat = beacon.material as THREE.MeshBasicMaterial;
  mat.opacity = padBeaconOpacity(wallT);
}