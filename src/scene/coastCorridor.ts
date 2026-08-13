/**
 * Low-opacity Kepler reference path for the Translunar injection coast corridor,
 * plus live Earth–Moon / sun-craft whiskers for cislunar watchability (V10).
 * Toggled with orbit overlays (O). Corridor is scrub-static (built once from pack);
 * beat whiskers follow body/craft positions from mission `t`.
 *
 * Theater-grade: the chords are orientation cues, not ephemeris overlays.
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

type Xyz = { x: number; y: number; z: number };

/** Hide the terminator tick inside Earth's neighborhood (LEO / ascent clutter). */
export const SUN_CRAFT_TICK_MIN_DIST_KM = 50_000;

/** Default sun-craft tick length (km) — readable in cislunar views, not AU-scale. */
export const SUN_CRAFT_TICK_LENGTH_KM = 12_000;

/** Earth–Moon chord endpoints (6 floats) for the live angle whisker. */
export function earthMoonWhisker(earth: Xyz, moon: Xyz): number[] {
  return [earth.x, earth.y, earth.z, moon.x, moon.y, moon.z];
}

/**
 * Short sun-craft tick (km) so the terminator plane reads at the ship.
 * Points from craft toward the Sun. Theater cue — not a lighting probe.
 */
export function sunCraftTick(
  craft: Xyz,
  sun: Xyz,
  lengthKm = SUN_CRAFT_TICK_LENGTH_KM,
): number[] {
  const dx = sun.x - craft.x;
  const dy = sun.y - craft.y;
  const dz = sun.z - craft.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const s = lengthKm / len;
  return [craft.x, craft.y, craft.z, craft.x + dx * s, craft.y + dy * s, craft.z + dz * s];
}

/**
 * Whether the sun-craft terminator tick should draw.
 * Hidden while the craft is still near Earth so pad/LEO views stay uncluttered.
 */
export function sunCraftTickVisible(
  craft: Xyz,
  earth: Xyz,
  minDistKm = SUN_CRAFT_TICK_MIN_DIST_KM,
): boolean {
  const d = Math.hypot(craft.x - earth.x, craft.y - earth.y, craft.z - earth.z);
  return d >= minDistKm;
}

function makeBeatLine(name: string, color: number, opacity: number): THREE.Line {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
  const line = new THREE.Line(
    geom,
    new THREE.LineBasicMaterial({
      color, transparent: true, opacity, depthWrite: false,
    }),
  );
  line.name = name;
  line.frustumCulled = false;
  return line;
}

function writeLineEndpoints(line: THREE.Object3D, pts: number[]): void {
  const geom = (line as THREE.Line).geometry;
  const attr = geom.getAttribute("position");
  attr.setXYZ(0, pts[0]!, pts[1]!, pts[2]!);
  attr.setXYZ(1, pts[3]!, pts[4]!, pts[5]!);
  attr.needsUpdate = true;
}

/**
 * Live Earth–Moon chord + sun-craft terminator tick. Toggled with orbit overlay.
 */
export function createCoastBeatsOverlay(): THREE.Group {
  const group = new THREE.Group();
  group.name = "coast-beats";
  group.add(makeBeatLine("earth-moon-whisker", 0xa8c8ff, 0.28));
  group.add(makeBeatLine("sun-craft-tick", 0xffe08a, 0.32));
  return group;
}

/**
 * Update coast-beat whiskers from current body / craft positions (scrub-safe).
 */
export function updateCoastBeatsOverlay(
  group: THREE.Object3D,
  earth: Xyz,
  moon: Xyz,
  sun: Xyz,
  craft: Xyz,
): void {
  const em = group.getObjectByName("earth-moon-whisker");
  const sc = group.getObjectByName("sun-craft-tick");
  if (em) writeLineEndpoints(em, earthMoonWhisker(earth, moon));
  if (sc) {
    const show = sunCraftTickVisible(craft, earth);
    sc.visible = show;
    if (show) writeLineEndpoints(sc, sunCraftTick(craft, sun));
  }
}
