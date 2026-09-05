/**
 * L-key name plates for distinct Starbase pad objects.
 *
 * Scene unit = 1 km. World height is capped so plates stay readable at the
 * pad and vanish from Earth view. Identical cryo shells in one bank share a
 * label; OLP-1 reuses the live tower mesh so only the tower / mount / crane
 * are tagged there.
 */
import type * as THREE from "three";
import { createNameLabel } from "../zoomLabels";
import { TOWER_H } from "./mechazillaDims";
import { OLM_H } from "./padOlm";
import {
  CRYO_BANKS,
  CRYO_TANK_D_KM,
  VERTICAL_TANK_H_KM,
  VERTICAL_TANK_XZ,
  cryoBankCentroid,
  type CryoBankSpec,
} from "./padFarmLayout";

/** Pad plates are smaller than body / craft names and fade with distance. */
export const PAD_LABEL_OPTS = {
  targetPx: 14,
  aspect: 256 / 64,
  minH: 0.003,
  maxH: 0.025,
} as const;

const TOWER = "#f0c878";
const MOUNT = "#efe4d0";
const TANK = "#d4eaf6";
const BUILDING = "#e8d4a8";
const ROAD = "#c8c8c0";

/** One name plate parented onto an existing pad node. */
export type LaunchSiteLabelSpec = Readonly<{
  /** `getObjectByName` target on the pad graph. */
  parent: string;
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
}>;

function nodeLabel(
  parent: string,
  text: string,
  y: number,
  color: string,
  xz: { x: number; z: number } = { x: 0, z: 0 },
): LaunchSiteLabelSpec {
  return { parent, text, color, x: xz.x, y, z: xz.z };
}

function meanXz(pts: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } {
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    z: pts.reduce((s, p) => s + p.z, 0) / n,
  };
}

function banksById(ids: readonly string[]): CryoBankSpec[] {
  return ids.map((id) => {
    const b = CRYO_BANKS.find((bank) => bank.id === id);
    if (!b) throw new Error(`unknown cryo bank ${id}`);
    return b;
  });
}

function tankBankLabel(ids: readonly string[], text: string): LaunchSiteLabelSpec {
  const banks = banksById(ids);
  const c = meanXz(banks.map(cryoBankCentroid));
  const d = Math.max(...banks.map((b) => b.d ?? CRYO_TANK_D_KM));
  return nodeLabel("pad-tank-farm-layout", text, d + 0.008, TANK, c);
}

function verticalTankLabel(): LaunchSiteLabelSpec {
  const c = meanXz(VERTICAL_TANK_XZ.map(([x, z]) => ({ x, z })));
  return nodeLabel("pad-tank-farm-layout", "Vertical tanks", VERTICAL_TANK_H_KM + 0.008, TANK, c);
}

function structureLabels(): LaunchSiteLabelSpec[] {
  return [
    nodeLabel("pad-olm", "OLM", OLM_H + 0.006, MOUNT, { x: 0, z: -0.024 }),
    nodeLabel("pad-tower", "Mechazilla", TOWER_H * 0.55, TOWER),
    nodeLabel("pad-chopstick-carriage", "Chopsticks", 0.016, TOWER),
    nodeLabel("pad-qd-arm", "Ship QD", 0.008, TOWER, { x: -0.01, z: 0 }),
    nodeLabel("pad-boost-qd-arm", "Booster QD", 0.008, TOWER, { x: -0.01, z: 0 }),
    nodeLabel("pad-gse-house", "GSE house", 0.006, BUILDING),
    nodeLabel("pad-trench", "Flame trench", 0.006, MOUNT, { x: 0, z: -0.04 }),
    nodeLabel("pad-beacon", "Lightning rod", 0.008, TOWER),
  ];
}

function farmLabels(): LaunchSiteLabelSpec[] {
  return [
    tankBankLabel(["pad2-west-a", "pad2-west-b"], "Pad 2 tanks"),
    tankBankLabel(["main"], "Main tanks"),
    tankBankLabel(["offload-w"], "Offload tanks"),
    tankBankLabel(["offload-e"], "East tanks"),
    verticalTankLabel(),
    nodeLabel("pad-pipe-rack-north", "Pipe rack", 0.01, TANK),
    nodeLabel("pad-blast-wall", "Blast wall", 0.01, MOUNT),
  ];
}

function siteLabels(): LaunchSiteLabelSpec[] {
  return [
    nodeLabel("pad-warehouse", "Warehouse", 0.02, BUILDING),
    nodeLabel("pad-gse-shed", "GSE shed", 0.014, BUILDING),
    nodeLabel("pad-east-yard", "East yard", 0.012, BUILDING),
    nodeLabel("pad-starhopper", "Starhopper", 0.014, BUILDING),
    nodeLabel("pad-crane", "Crane", 0.018, BUILDING),
    nodeLabel("pad-boca-chica-blvd", "SH 4", 0.01, ROAD),
    nodeLabel("pad1-pad-tower", "OLP-1", TOWER_H * 0.55, TOWER),
    nodeLabel("pad1-stripped-mount", "OLP-1 mount", 0.012, MOUNT),
    nodeLabel("pad1-crane", "Crawler crane", 0.034, BUILDING),
  ];
}

/** Every distinct launch-site plate (OLP-2, farm, surroundings, OLP-1). */
export function launchSiteLabels(): LaunchSiteLabelSpec[] {
  return [...structureLabels(), ...farmLabels(), ...siteLabels()];
}

function addPadLabel(parent: THREE.Object3D, spec: LaunchSiteLabelSpec): THREE.Sprite {
  const spr = createNameLabel(spec.text, spec.color, PAD_LABEL_OPTS);
  spr.position.set(spec.x, spec.y, spec.z);
  parent.add(spr);
  return spr;
}

/**
 * Parent a name plate onto each known pad node.
 * @returns Number of plates attached (skips missing parents).
 */
export function addLaunchSiteLabels(root: THREE.Object3D): number {
  let n = 0;
  for (const spec of launchSiteLabels()) {
    const parent = root.getObjectByName(spec.parent);
    if (!parent) continue;
    addPadLabel(parent, spec);
    n++;
  }
  return n;
}
