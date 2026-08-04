/**
 * Low-opacity Kepler reference path for the TLI coast corridor.
 * Toggled with orbit overlays (O). Scrub-static (built once from pack).
 */

import * as THREE from "three";
import type { CoastCorridor } from "../physics/coastCorridor";
import { createFatLine } from "./fatLines";

/**
 * Dashed amber Kepler reference + dimmer n-body ghost (already have main trail;
 * this pair reads as a corridor of free-coast divergence).
 */
export function createCoastCorridorOverlay(
  corridor: CoastCorridor,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "coast-corridor";

  const keplerVecs = corridor.keplerPts.map(
    (p) => new THREE.Vector3(p.x, p.y, p.z),
  );
  // Path length is cislunar (1e5–1e6 km) — dash sizes in km
  const keplerLine = createFatLine(keplerVecs, {
    color: 0xf0a060,
    opacity: 0.42,
    linewidth: 2.0,
    dashed: true,
    dashSize: 8_000,
    gapSize: 6_000,
  });
  keplerLine.name = "kepler-coast-ref";
  group.add(keplerLine);

  // Sparse whiskers at ~8 samples so max |Δr| is visible without clutter
  const whiskerGeom = new THREE.BufferGeometry();
  const nWhisk = Math.min(12, corridor.nbodyPts.length);
  const step = (corridor.nbodyPts.length - 1) / Math.max(1, nWhisk - 1);
  const wPos: number[] = [];
  for (let i = 0; i < nWhisk; i++) {
    const idx = Math.round(i * step);
    const a = corridor.nbodyPts[idx]!;
    const b = corridor.keplerPts[idx]!;
    wPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  whiskerGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(wPos, 3),
  );
  const whiskers = new THREE.LineSegments(
    whiskerGeom,
    new THREE.LineBasicMaterial({
      color: 0xf0a060,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  whiskers.name = "kepler-corridor-whiskers";
  group.add(whiskers);

  group.userData.maxDevKm = corridor.maxDevKm;
  return group;
}
