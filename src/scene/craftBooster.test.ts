/**
 * Super Heavy V3 booster layout: 90/90/180 grid fins, B20, 33-engine rings.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  BOOST_H,
  BOOST_RING_INNER,
  BOOST_RING_MID,
  BOOST_RING_OUTER,
  GRID_FIN_AZIMUTHS,
  GRID_FIN_CHORD_M,
  GRID_FIN_FROM_TOP_M,
  GRID_FIN_LATTICE_ANGLE,
  GRID_FIN_LATTICE_N,
  GRID_FIN_LAUNCH_TILT,
  GRID_FIN_SPAN_M,
  GRID_FIN_WIDTH_M,
  gridFinZ,
  HOT_STAGE_BAYS,
  HOT_STAGE_H,
  HOT_STAGE_H_M,
  R,
  SL_BELL_R,
  U,
} from "./craft/dimensions.ts";
import { addHotStageRing, hotStageAFrame } from "./craft/hotStageRing.ts";
import { makeGridFin, setGridFinLaunchPose } from "./craft/gridFin.ts";
import { BOOSTER_STEEL } from "./craft/materials.ts";
import { BOOSTER_HULL_MARK } from "./craftHullMaps.ts";

describe("V3 grid fins", () => {
  it("uses a 90/90/180 azimuth set, not equal 120° thirds", () => {
    assert.equal(GRID_FIN_AZIMUTHS.length, 3);
    const sorted = [...GRID_FIN_AZIMUTHS].sort((a, b) => a - b);
    const span = Math.PI * 2;
    const gaps = [
      sorted[1]! - sorted[0]!,
      sorted[2]! - sorted[1]!,
      sorted[0]! + span - sorted[2]!,
    ].sort((a, b) => a - b);
    assert.ok(Math.abs(gaps[0]! - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(gaps[1]! - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(gaps[2]! - Math.PI) < 1e-9);
  });

  it("keeps the first fin on +Y so gridfin-cam does not jump", () => {
    assert.equal(GRID_FIN_AZIMUTHS[0], Math.PI / 2);
  });

  it("keeps a denser lattice than the pre-V4 4-bar set", () => {
    assert.ok(GRID_FIN_LATTICE_N >= 6);
  });

  it("uses a 45° diamond lattice rather than an axis-aligned waffle", () => {
    assert.equal(GRID_FIN_LATTICE_ANGLE, Math.PI / 4);
    const fin = makeGridFin(1, 1, 0.1, dummyGridFinMats());
    const bars = latticeBars(fin);
    assert.ok(bars.length >= GRID_FIN_LATTICE_N * 2);
    for (const bar of bars) {
      assert.ok(
        diamondAngle(bar.rotation.y),
        `lattice bar rotation.y=${bar.rotation.y} is not ±45°`,
      );
    }
  });

  it("is smaller than the V22 8.2 m × 4.4 m paddle", () => {
    assert.ok(GRID_FIN_SPAN_M < 5.5, `span ${GRID_FIN_SPAN_M} m`);
    assert.ok(GRID_FIN_WIDTH_M < 4.2, `width ${GRID_FIN_WIDTH_M} m`);
    assert.ok(GRID_FIN_CHORD_M > 0.5 && GRID_FIN_CHORD_M < 1.4);
  });

  it("uses a Sketchfab-class V3 shelf, not the 4.0 × 3.6 m paddle", () => {
    assert.ok(GRID_FIN_SPAN_M >= 3.0 && GRID_FIN_SPAN_M <= 3.4, `span ${GRID_FIN_SPAN_M}`);
    assert.ok(GRID_FIN_WIDTH_M >= 2.4 && GRID_FIN_WIDTH_M <= 2.8, `width ${GRID_FIN_WIDTH_M}`);
  });

  it("sits just under the hot-stage, not 19 m down the barrel", () => {
    assert.ok(GRID_FIN_FROM_TOP_M > HOT_STAGE_H_M + 2);
    assert.ok(GRID_FIN_FROM_TOP_M < 8, `fromTop ${GRID_FIN_FROM_TOP_M}`);
    assert.ok(Math.abs(gridFinZ() - (BOOST_H - GRID_FIN_FROM_TOP_M * U)) < 1e-12);
  });

  it("lies horizontal at launch (lattice plane ⊥ booster axis)", () => {
    assert.equal(GRID_FIN_LAUNCH_TILT, Math.PI / 2);
    const fin = new THREE.Group();
    setGridFinLaunchPose(fin, Math.PI / 2, R + 0.1, gridFinZ());
    assert.ok(Math.abs(fin.rotation.x - Math.PI / 2) < 1e-9);
    assert.ok(Math.abs(fin.rotation.y) < 1e-9);
    assert.ok(Math.abs(fin.rotation.z - Math.PI / 2) < 1e-9);
  });
});

function dummyGridFinMats() {
  const m = new THREE.MeshBasicMaterial();
  return { frame: m, lattice: m, pivot: m, housing: m };
}

function latticeBars(fin: THREE.Group): THREE.Object3D[] {
  const bars: THREE.Object3D[] = [];
  fin.traverse((o) => {
    if (o.name === "grid-fin-lattice") bars.push(o);
  });
  return bars;
}

function diamondAngle(rad: number): boolean {
  const a = ((rad % Math.PI) + Math.PI) % Math.PI;
  const d = Math.min(Math.abs(a - Math.PI / 4), Math.abs(a - (3 * Math.PI) / 4));
  return d < 1e-6;
}

describe("B20 hull identity", () => {
  it("stencils Flight 13 Booster 20 on the stainless leeward", () => {
    assert.equal(BOOSTER_HULL_MARK.text, "B20");
    assert.ok(BOOSTER_HULL_MARK.zFrac > 0.4 && BOOSTER_HULL_MARK.zFrac < 0.75);
    assert.ok(BOOSTER_HULL_MARK.width > 0.04);
    assert.ok(Math.abs(BOOSTER_HULL_MARK.ang) > Math.PI * 0.35);
  });
});

describe("booster hull stainless", () => {
  it("is rougher and less metallic than ship-grade steel so chines do not bloom", () => {
    assert.ok(BOOSTER_STEEL.roughness > 0.45);
    assert.ok(BOOSTER_STEEL.metalness < 0.75);
  });
});

describe("Super Heavy Raptor rings", () => {
  it("packs 3 / 10 / 20 sea-level bells inside the 9 m barrel", () => {
    assert.ok(BOOST_RING_INNER < BOOST_RING_MID);
    assert.ok(BOOST_RING_MID < BOOST_RING_OUTER);
    assert.ok(BOOST_RING_OUTER + SL_BELL_R < R * 1.02);
    assert.ok(BOOST_RING_INNER > SL_BELL_R * 0.6);
  });

  it("seats the outer 20 at the skirt wall (Flight 13 T+5:50)", () => {
    const lipM = (BOOST_RING_OUTER + SL_BELL_R) / U;
    assert.ok(lipM >= 4.4, `outer lip ${lipM} m`);
    assert.ok(lipM <= 4.59, `outer lip ${lipM} m`);
  });

  it("spreads the mid ring off the inner three", () => {
    assert.ok(BOOST_RING_MID / U >= 2.35, `mid ${BOOST_RING_MID / U} m`);
  });
});

describe("V3 hot-stage truss", () => {
  it("is a ~2 m open interstage, not a jettisonable Block 1/2 vent band", () => {
    assert.ok(HOT_STAGE_H_M >= 1.8 && HOT_STAGE_H_M <= 3.2);
    assert.ok(Math.abs(HOT_STAGE_H - HOT_STAGE_H_M * U) < 1e-12);
    assert.ok(HOT_STAGE_BAYS >= 16 && HOT_STAGE_BAYS <= 24);
    assert.equal(HOT_STAGE_BAYS % 2, 0);
  });

  it("places each A-frame as a downward triangle on the 9 m barrel", () => {
    const bay = hotStageAFrame(0);
    assert.ok(bay.bot.z < bay.topL.z);
    assert.ok(Math.abs(bay.topL.z - bay.topR.z) < 1e-12);
    assert.ok(Math.abs(bay.topL.z - BOOST_H) < 1e-9);
    assert.ok(Math.abs(bay.topL.z - bay.bot.z - HOT_STAGE_H) < 1e-9);
    const area = triangleArea(bay.topL, bay.topR, bay.bot);
    assert.ok(area > HOT_STAGE_H * R * 0.05, `degenerate A-frame area ${area}`);
    const r = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
    assert.ok(Math.abs(r(bay.topL) - r(bay.bot)) < 0.01);
  });

  it("walks A-frames around the full barrel with gaps between them", () => {
    const first = hotStageAFrame(0);
    const next = hotStageAFrame(1);
    const wrap = hotStageAFrame(HOT_STAGE_BAYS);
    assert.ok(Math.hypot(first.bot.x - next.bot.x, first.bot.y - next.bot.y) > 0.02);
    assert.ok(Math.hypot(first.bot.x - wrap.bot.x, first.bot.y - wrap.bot.y) < 1e-9);
    const chord = Math.hypot(first.topL.x - first.topR.x, first.topL.y - first.topR.y);
    const gap = Math.hypot(first.topR.x - next.topL.x, first.topR.y - next.topL.y);
    assert.ok(gap > chord * 0.15, "A-frames should not form a closed zigzag");
  });

  it("builds a named see-through lattice instead of a solid vent cylinder", () => {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    addHotStageRing(g, { strut: mat, ring: mat, dome: mat });
    const ring = g.getObjectByName("hot-stage-ring");
    assert.ok(ring, "hot-stage-ring missing");
    const struts = ring!.getObjectByName("hot-stage-struts") as THREE.InstancedMesh | undefined;
    assert.ok(struts?.isInstancedMesh);
    assert.equal(struts!.count, HOT_STAGE_BAYS * 2);
    assert.ok(ring!.getObjectByName("hot-stage-top-ring"));
    assert.ok(ring!.getObjectByName("hot-stage-dome"));
    const solid = ring!.children.some((c) => {
      if (!(c instanceof THREE.Mesh) || c instanceof THREE.InstancedMesh) return false;
      if (!(c.geometry instanceof THREE.CylinderGeometry)) return false;
      const p = c.geometry.parameters;
      return !p.openEnded && p.radiusTop >= R * 0.8 && p.height >= HOT_STAGE_H * 0.8;
    });
    assert.equal(solid, false, "interstage should not be a closed barrel cylinder");
  });
});

function triangleArea(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  c: { x: number; y: number; z: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const acz = c.z - a.z;
  return (
    0.5 *
    Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx)
  );
}
