/** OLP-2-style pad complex: hardstand, tank farm, warehouse (theater massing). */
import * as THREE from "three";
import { makeScorchTexture, makeWaterStainTexture } from "./padTextures";
import {
  GROUND_OFFSET, addGroundDisc, addGroundRing, makePadSurroundMats,
  makeScrubTerrainMat, type PadSurroundMats,
} from "./padSurroundMats";
import { SH4_Z_KM } from "./padFarmLayout";
import { buildTankFarm } from "./padTankFarm";
import { addPadHardstand } from "./padHardstand";

function populatePadSurroundings(g: THREE.Group, mats: PadSurroundMats): void {
  addPadScrubAndPond(g, mats);
  addPadHardstand(g, mats);
  addPadApronDecals(g);
  addPadRoadsAndCars(g, mats);
  g.add(buildTankFarm(mats));
  addPadWarehouseAndYards(g, mats);
  addPadHopperAndCrane(g, mats);
}

export function createPadSurroundings(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-surroundings";
  populatePadSurroundings(g, makePadSurroundMats());
  return g;
}

function addPadScrubAndPond(g: THREE.Group, mats: PadSurroundMats): void {
  // Ring (not a disc) so the OLM / trench opening is not roofed from below.
  addGroundRing(g, 0.08, 1.55, makeScrubTerrainMat(), 0, -0.007, 0, 48, "pad-scrub-terrain");
  addGroundDisc(g, 0.08, mats.water, 0.05, -0.0058, 0.42, 20, "pad-pond");
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
  fence2.position.set(0.18, -0.001, 0.04);
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
  addNamedBox(g, [0.72, 0.002, 0.012], mats.asphalt, [-0.16, -0.0035, SH4_Z_KM], "pad-boca-chica-blvd");
  addNamedBox(g, [0.76, 0.0015, 0.028], mats.dirt, [-0.16, -0.004, SH4_Z_KM]);
  addNamedBox(g, [0.22, 0.002, 0.036], mats.concreteDark, [0.04, -0.003, SH4_Z_KM - 0.055]);
}

function addParkingCars(g: THREE.Group, mats: PadSurroundMats): void {
  for (let i = 0; i < 14; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0016, 0.0022), mats.carPaint);
    const side = i < 8 ? 1 : -1;
    car.position.set(-0.08 + (i % 8) * 0.028, -0.0015, SH4_Z_KM + 0.022 + side * 0.012 + (i % 3) * 0.002);
    g.add(car);
  }
}

function addPadWarehouseAndYards(g: THREE.Group, mats: PadSurroundMats): void {
  g.add(buildWarehouse(mats));
  addEastYard(g, mats);
  addGseForegroundShed(g, mats);
}

/** Low beige GSE shed — T−2 ground-cam lower-right massing. */
function addGseForegroundShed(g: THREE.Group, mats: PadSurroundMats): void {
  const shed = new THREE.Group();
  shed.name = "pad-gse-shed";
  shed.position.set(-0.06, 0, -0.095);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.0075, 0.018),
    mats.warehouseWall,
  );
  body.position.y = 0.0036;
  shed.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.0014, 0.02),
    mats.warehouseRoof,
  );
  roof.position.y = 0.008;
  shed.add(roof);
  g.add(shed);
}

function buildWarehouse(mats: PadSurroundMats): THREE.Group {
  const warehouse = new THREE.Group();
  warehouse.name = "pad-warehouse";
  warehouse.position.set(0.26, 0, 0.08);
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
  eastYard.position.set(0.30, 0, 0.02);
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
  hopperPad.position.set(0.04, -0.0035, SH4_Z_KM + 0.055);
  g.add(hopperPad);
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.012, 10), mats.steel);
  hopper.position.set(0.04, 0.005, SH4_Z_KM + 0.055);
  g.add(hopper);
}

function addCrane(g: THREE.Group, mats: PadSurroundMats): void {
  const craneBase = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, 0.008), mats.steelDark);
  craneBase.position.set(-0.312, 0.002, 0.018);
  g.add(craneBase);
  const craneBoom = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.0012, 0.0012), mats.steel);
  craneBoom.position.set(-0.292, 0.012, 0.018);
  craneBoom.rotation.z = -0.35;
  g.add(craneBoom);
}

function addTrailers(g: THREE.Group): void {
  for (let i = 0; i < 4; i++) {
    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.0035, 0.005),
      new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.3, roughness: 0.7 }),
    );
    trailer.position.set(0.1 + i * 0.02, 0.001, SH4_Z_KM - 0.028);
    g.add(trailer);
  }
}
