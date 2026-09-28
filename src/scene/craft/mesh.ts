import * as THREE from "three";
import { BOOST_H, CRAFT_MESH_SCALE, R, SHIP_H } from "./dimensions";
import { makeCraftMaterials, type CraftMats } from "./materials";
import { makeCondensationCloud, makeIceFlakeGroup } from "./plumes";
import { buildBooster } from "./meshBooster";
import { buildShip } from "./meshShip";
import { createNameLabel } from "../zoomLabels";
import type { HullMarkSpec } from "../hexTileLayout";
import { BOOSTER_HULL_MARK, SHIP_HULL_MARK } from "../hexTileLayout";

function addExhaustLight(mesh: THREE.Group): void {
  const exhaustLight = new THREE.PointLight(0xff9a58, 0, 0.35, 2);
  exhaustLight.name = "exhaust-light";
  exhaustLight.position.set(0, 0, -0.08);
  mesh.add(exhaustLight);
}

const CRAFT_LABEL_OPTS = { targetPx: 16, aspect: 256 / 64, minH: 0.015 } as const;

function addShipNameLabel(group: THREE.Group): void {
  const shipLabel = createNameLabel("STARSHIP", "#ff8a7a", CRAFT_LABEL_OPTS);
  shipLabel.position.set(0, 0, (BOOST_H + SHIP_H) * CRAFT_MESH_SCALE * 0.92);
  group.add(shipLabel);
}

export type CraftHullMarks = {
  ship?: HullMarkSpec;
  booster?: HullMarkSpec;
};

function buildCraftMesh(mats: CraftMats, marks?: CraftHullMarks): THREE.Group {
  const mesh = new THREE.Group();
  mesh.add(buildShip(mats, marks?.ship ?? SHIP_HULL_MARK));
  mesh.add(buildBooster(mats, marks?.booster ?? BOOSTER_HULL_MARK));
  addExhaustLight(mesh);
  mesh.add(makeCondensationCloud(BOOST_H + SHIP_H, R));
  mesh.add(makeIceFlakeGroup());
  mesh.scale.setScalar(CRAFT_MESH_SCALE);
  return mesh;
}

/** Root group with mesh and STARSHIP name plate. */
function assembleCraftRoot(mesh: THREE.Group): {
  group: THREE.Group;
  mesh: THREE.Group;
} {
  const group = new THREE.Group();
  group.add(mesh);
  addShipNameLabel(group);
  return { group, mesh };
}

export function createCraft(marks?: CraftHullMarks): {
  group: THREE.Group;
  mesh: THREE.Group;
} {
  return assembleCraftRoot(buildCraftMesh(makeCraftMaterials(), marks));
}
