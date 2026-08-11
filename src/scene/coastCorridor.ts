/**
 * Low-opacity Kepler reference path for the Translunar injection coast corridor.
 * Toggled with orbit overlays (O). Scrub-static (built once from pack).
 */

import * as THREE from "three";
import type { CoastCorridor } from "../physics/coastCorridor";
import { createFatLine } from "./fatLines";

function keplerPtsToVecs(corridor: CoastCorridor): THREE.Vector3[] {
  return corridor.keplerPts.map((p) => new THREE.Vector3(p.x, p.y, p.z));
}

const KEPLER_COAST_OPTS = {
  color: 0xf0a060,
  opacity: 0.42,
  linewidth: 2.0,
  dashed: true,
  // Path length is cislunar (1e5–1e6 km) — dash sizes in km
  dashSize: 8_000,
  gapSize: 6_000,
} as const;

function makeKeplerCoastLine(corridor: CoastCorridor): THREE.Object3D {
  const line = createFatLine(keplerPtsToVecs(corridor), { ...KEPLER_COAST_OPTS });
  line.name = "kepler-coast-ref";
  return line;
}

function pushWhiskerPair(wPos: number[], corridor: CoastCorridor, idx: number): void {
  const a = corridor.nbodyPts[idx]!;
  const b = corridor.keplerPts[idx]!;
  wPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

function whiskerPositions(corridor: CoastCorridor): number[] {
  const nWhisk = Math.min(12, corridor.nbodyPts.length);
  const step = (corridor.nbodyPts.length - 1) / Math.max(1, nWhisk - 1);
  const wPos: number[] = [];
  for (let i = 0; i < nWhisk; i++) pushWhiskerPair(wPos, corridor, Math.round(i * step));
  return wPos;
}

function makeWhiskerMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: 0xf0a060, transparent: true, opacity: 0.22, depthWrite: false,
  });
}

/** Sparse whiskers so max |Δr| is visible without clutter. */
function makeCorridorWhiskers(corridor: CoastCorridor): THREE.LineSegments {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(whiskerPositions(corridor), 3));
  const whiskers = new THREE.LineSegments(geom, makeWhiskerMaterial());
  whiskers.name = "kepler-corridor-whiskers";
  return whiskers;
}

/**
 * Dashed amber Kepler reference + dimmer n-body ghost (already have main trail;
 * this pair reads as a corridor of free-coast divergence).
 */
export function createCoastCorridorOverlay(
  corridor: CoastCorridor,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "coast-corridor";
  group.add(makeKeplerCoastLine(corridor));
  group.add(makeCorridorWhiskers(corridor));
  group.userData.maxDevKm = corridor.maxDevKm;
  return group;
}
