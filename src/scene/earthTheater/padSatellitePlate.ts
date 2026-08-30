/** Sentinel-2 surrounds square, nested NAIP pad plate, earth-cam landmark rings. */
import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM, STARBASE_LAT } from "../../physics/constants";
import { geocentricRadiusAt } from "../../physics/wgs84";
import {
  STARBASE_PAD_PLATE_HALF_KM, STARBASE_PAD_PLATE_Y_KM,
  STARBASE_PLATE_HALF_KM, STARBASE_PLATE_INNER_KM, STARBASE_PLATE_SEGS,
  STARBASE_PLATE_Y_KM, drapePlatePoint, starbasePlateUv,
} from "../starbasePlate";
import { loadTextureAsset } from "../assetLoad";
import { makePlateAlphaTexture } from "./padTextures";
import { GROUND_OFFSET } from "./padSurroundMats";

export function addPadLandmarks(pad: THREE.Group): void {
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

const STARBASE_PLATE_HIDE = [
  "pad-landmark-scrub",
  "pad-landmark-ring",
  "pad-landmark-rim",
  "pad-scrub-terrain",
] as const;

/** Planar UVs on an XZ square: pad +Z north / +X west after `placePadOnEarth`; U grows toward −X (east). */
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

function makeStarbasePlateGeometry(halfKm: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(
    halfKm * 2,
    halfKm * 2,
    STARBASE_PLATE_SEGS,
    STARBASE_PLATE_SEGS,
  );
  geo.rotateX(-Math.PI / 2);
  applyStarbasePlateUvs(geo, halfKm);
  drapeStarbasePlate(geo, geocentricRadiusAt(STARBASE_LAT, EARTH_SURFACE_ALT_KM));
  return geo;
}

/** Discard the OLM hole. NAIP also drops near-black Gulf nodata so Sentinel-2 water shows through. */
function punchPlateOlmHole(
  mat: THREE.MeshStandardMaterial,
  halfKm: number,
  dropNodata: boolean,
): void {
  const half = halfKm.toFixed(4);
  const inner2 = (STARBASE_PLATE_INNER_KM * STARBASE_PLATE_INNER_KM).toFixed(6);
  const nodata = dropNodata
    ? "if (max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) < 0.05) discard;"
    : "";
  mat.customProgramCacheKey = () => `starbase-plate-olm-hole-${half}-${dropNodata ? "n" : "s"}`;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec2 plateKm = (vMapUv - 0.5) * (2.0 * ${half});
       if (dot(plateKm, plateKm) < ${inner2}) discard;
       ${nodata}
      `,
    );
  };
}

function makeStarbasePlateMaterial(
  halfKm: number,
  dropNodata = false,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.95,
    transparent: true,
    depthWrite: false,
    alphaMap: makePlateAlphaTexture(),
    ...GROUND_OFFSET,
  });
  punchPlateOlmHole(mat, halfKm, dropNodata);
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

function onStarbasePlateMissing(kind: "surrounds" | "naip"): void {
  const label = kind === "naip" ? "NAIP pad plate" : "surrounds texture";
  console.warn(
    `[tothemoon] Starbase ${label} missing; using ${kind === "naip" ? "Sentinel-2 / procedural scrub" : "procedural scrub"}`,
  );
}

function loadStarbasePlateTexture(
  pad: THREE.Group,
  plate: THREE.Mesh,
  file: string,
  kind: "surrounds" | "naip",
): void {
  const url = `${import.meta.env.BASE_URL}textures/${file}`;
  void loadTextureAsset(url).then((tex) => {
    if (tex) applyStarbasePlateTexture(pad, plate, tex);
    else onStarbasePlateMissing(kind);
  });
}

function addPlate(
  pad: THREE.Group,
  opts: {
    name: string; halfKm: number; yKm: number; file: string;
    kind: "surrounds" | "naip"; dropNodata?: boolean;
  },
): void {
  const plate = new THREE.Mesh(
    makeStarbasePlateGeometry(opts.halfKm),
    makeStarbasePlateMaterial(opts.halfKm, opts.dropNodata === true),
  );
  plate.name = opts.name;
  plate.position.y = opts.yKm;
  plate.visible = false;
  plate.renderOrder = -1;
  pad.add(plate);
  loadStarbasePlateTexture(pad, plate, opts.file, opts.kind);
}

/**
 * North-up Sentinel-2 square around the pad, plus a nested USDA NAIP plate
 * over the launch/production site. Hidden until each JPEG loads so
 * procedural scrub / landmark rings remain the fallback.
 */
export function addStarbaseSatellitePlate(pad: THREE.Group): void {
  addPlate(pad, {
    name: "pad-satellite-plate",
    halfKm: STARBASE_PLATE_HALF_KM,
    yKm: STARBASE_PLATE_Y_KM,
    file: "starbase_surrounds.jpg",
    kind: "surrounds",
  });
  addPlate(pad, {
    name: "pad-naip-plate",
    halfKm: STARBASE_PAD_PLATE_HALF_KM,
    yKm: STARBASE_PAD_PLATE_Y_KM,
    file: "starbase_pad_naip.jpg",
    kind: "naip",
    dropNodata: true,
  });
}
