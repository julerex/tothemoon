/** Sentinel-2 surrounds square, landward neighbors, and nested NAIP pad plate. */
import * as THREE from "three";
import { EARTH_SURFACE_ALT_KM, STARBASE_LAT } from "../../physics/constants";
import { geocentricRadiusAt } from "../../physics/wgs84";
import {
  STARBASE_CENTER_PLATE_FADE,
  STARBASE_LAND_PLATES,
  STARBASE_PAD_PLATE_HALF_KM, STARBASE_PAD_PLATE_Y_KM,
  STARBASE_PLATE_HALF_KM, STARBASE_PLATE_INNER_KM, STARBASE_PLATE_SEGS,
  STARBASE_PLATE_Y_KM, drapePlatePoint, starbasePlatePadLocalOffset,
  starbasePlateUv,
} from "../starbasePlate";
import type { PlateEdgeFade } from "../starbasePlate";
import { loadTextureAsset } from "../assetLoad";
import { makePlateAlphaTexture } from "./padTextures";
import { GROUND_OFFSET } from "./padSurroundMats";
import { starbasePlatePinFromOlp2 } from "./starbaseSurvey";

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

function offsetPlateVerts(geo: THREE.BufferGeometry, ox: number, oz: number): void {
  if (ox === 0 && oz === 0) return;
  const pos = geo.getAttribute("position");
  if (!pos) return;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + ox);
    pos.setZ(i, pos.getZ(i) + oz);
  }
}

function makeStarbasePlateGeometry(
  halfKm: number,
  ox = 0,
  oz = 0,
): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(
    halfKm * 2,
    halfKm * 2,
    STARBASE_PLATE_SEGS,
    STARBASE_PLATE_SEGS,
  );
  geo.rotateX(-Math.PI / 2);
  applyStarbasePlateUvs(geo, halfKm);
  offsetPlateVerts(geo, ox, oz);
  drapeStarbasePlate(geo, geocentricRadiusAt(STARBASE_LAT, EARTH_SURFACE_ALT_KM));
  return geo;
}

/**
 * Discard the OLM hole. JPEG UVs are centered on the committed WMS pin;
 * the hole is at the OLP-2 origin in that map (east, north) km.
 * NAIP also drops near-black Gulf nodata so Sentinel-2 water shows through.
 */
function punchPlateOlmHole(
  mat: THREE.MeshStandardMaterial,
  halfKm: number,
  dropNodata: boolean,
): void {
  const half = halfKm.toFixed(4);
  const inner2 = (STARBASE_PLATE_INNER_KM * STARBASE_PLATE_INNER_KM).toFixed(6);
  const pin = starbasePlatePinFromOlp2;
  const olmE = pin.x.toFixed(8);
  const olmN = (-pin.z).toFixed(8);
  const nodata = dropNodata
    ? "if (max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) < 0.05) discard;"
    : "";
  mat.customProgramCacheKey = () =>
    `starbase-plate-olm-hole-${half}-${dropNodata ? "n" : "s"}-${olmE}-${olmN}`;
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       vec2 plateKm = (vMapUv - 0.5) * (2.0 * ${half});
       vec2 olmKm = vec2(${olmE}, ${olmN});
       vec2 olmDelta = plateKm - olmKm;
       if (dot(olmDelta, olmDelta) < ${inner2}) discard;
       ${nodata}
      `,
    );
  };
}

function makeStarbasePlateMaterial(opts: {
  halfKm: number;
  fade: PlateEdgeFade;
  dropNodata?: boolean;
  punchOlm?: boolean;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.04,
    roughness: 0.95,
    transparent: true,
    depthWrite: false,
    alphaMap: makePlateAlphaTexture(opts.fade),
    ...GROUND_OFFSET,
  });
  if (opts.punchOlm !== false) {
    punchPlateOlmHole(mat, opts.halfKm, opts.dropNodata === true);
  }
  return mat;
}

function applyStarbasePlateTexture(plate: THREE.Mesh, tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const mat = plate.material as THREE.MeshStandardMaterial;
  mat.map = tex;
  mat.needsUpdate = true;
  plate.visible = true;
}

function onStarbasePlateMissing(kind: "surrounds" | "naip"): void {
  const label = kind === "naip" ? "NAIP pad plate" : "surrounds texture";
  console.warn(
    `[tothemoon] Starbase ${label} missing; using ${kind === "naip" ? "Sentinel-2 / globe albedo" : "globe albedo"}`,
  );
}

function loadStarbasePlateTexture(
  plate: THREE.Mesh,
  file: string,
  kind: "surrounds" | "naip",
): void {
  const url = `${import.meta.env.BASE_URL}textures/${file}`;
  void loadTextureAsset(url).then((tex) => {
    if (tex) applyStarbasePlateTexture(plate, tex);
    else onStarbasePlateMissing(kind);
  });
}

function addPlate(
  pad: THREE.Group,
  opts: {
    name: string; halfKm: number; yKm: number; file: string;
    kind: "surrounds" | "naip"; fade: PlateEdgeFade;
    dropNodata?: boolean; punchOlm?: boolean; ox?: number; oz?: number;
  },
): void {
  const plate = new THREE.Mesh(
    makeStarbasePlateGeometry(opts.halfKm, opts.ox ?? 0, opts.oz ?? 0),
    makeStarbasePlateMaterial({
      halfKm: opts.halfKm,
      fade: opts.fade,
      dropNodata: opts.dropNodata,
      punchOlm: opts.punchOlm,
    }),
  );
  plate.name = opts.name;
  const pin = starbasePlatePinFromOlp2;
  plate.position.set(pin.x, opts.yKm, pin.z);
  plate.visible = false;
  plate.renderOrder = -1;
  pad.add(plate);
  loadStarbasePlateTexture(plate, opts.file, opts.kind);
}

function addLandNeighborPlates(pad: THREE.Group): void {
  for (const land of STARBASE_LAND_PLATES) {
    const off = starbasePlatePadLocalOffset(land.eastSteps, land.northSteps);
    addPlate(pad, {
      name: land.name,
      halfKm: STARBASE_PLATE_HALF_KM,
      yKm: STARBASE_PLATE_Y_KM,
      file: land.file,
      kind: "surrounds",
      fade: land.fade,
      punchOlm: false,
      ox: off.x,
      oz: off.z,
    });
  }
}

/**
 * North-up Sentinel-2 square around the pad, five landward 80 km neighbors
 * (N / NW / W / SW / S — the Gulf stays Blue Marble), plus a nested USDA
 * NAIP plate over the launch/production site. Meshes sit on the committed
 * JPEG pin (`starbasePlatePinFromOlp2`), not the OLP-2 origin. Hidden until
 * each JPEG loads.
 */
export function addStarbaseSatellitePlate(pad: THREE.Group): void {
  addPlate(pad, {
    name: "pad-satellite-plate",
    halfKm: STARBASE_PLATE_HALF_KM,
    yKm: STARBASE_PLATE_Y_KM,
    file: "starbase_surrounds.jpg",
    kind: "surrounds",
    fade: STARBASE_CENTER_PLATE_FADE,
  });
  addLandNeighborPlates(pad);
  addPlate(pad, {
    name: "pad-naip-plate",
    halfKm: STARBASE_PAD_PLATE_HALF_KM,
    yKm: STARBASE_PAD_PLATE_Y_KM,
    file: "starbase_pad_naip.jpg",
    kind: "naip",
    fade: { n: true, e: true, s: true, w: true },
    dropNodata: true,
  });
}
