/**
 * V24 hex OLM: frustum shell, catwalk, open trench hole (not a 24-seg cylinder on legs).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { TRENCH_CAM_LOCAL } from "../camera/trenchCam.ts";
import { addOlm, OLM_HEX_SEGMENTS } from "./earthTheater/padOlm.ts";
import { makeTowerMats } from "./earthTheater/mechazillaMats.ts";

function buildOlm(): THREE.Group {
  const g = new THREE.Group();
  addOlm(g, makeTowerMats());
  return g;
}

describe("padOlm V24", () => {
  it("names pad-olm as a group with a 6-segment frustum shell", () => {
    const g = buildOlm();
    const olm = g.getObjectByName("pad-olm");
    assert.ok(olm, "pad-olm missing");
    assert.ok((olm as THREE.Group).isGroup, "pad-olm should be a group, not a single mesh");
    const shell = g.getObjectByName("pad-olm-shell") as THREE.Mesh | undefined;
    assert.ok(shell?.isMesh);
    assert.ok(shell!.geometry instanceof THREE.CylinderGeometry);
    const segs = (shell!.geometry as THREE.CylinderGeometry).parameters.radialSegments;
    assert.equal(segs, OLM_HEX_SEGMENTS);
    assert.equal(segs, 6);
    assert.ok((shell!.geometry as THREE.CylinderGeometry).parameters.openEnded);
  });

  it("keeps catwalk + deflector names and drops the 8 box legs", () => {
    const g = buildOlm();
    assert.ok(g.getObjectByName("pad-olm-catwalk"));
    assert.ok(g.getObjectByName("pad-olm-deflector"));
    assert.ok(g.getObjectByName("pad-olm-underside"));
    assert.ok(g.getObjectByName("pad-olm-under-chamber"));
    let boxLegs = 0;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BoxGeometry)) return;
      const p = mesh.geometry.parameters;
      // Old V23.3 legs were 2.6 × 11 × 2.6 m boxes on a 12 m ring.
      const looksLikeLeg =
        Math.abs(p.height - 0.011) < 1e-6 &&
        Math.abs(p.width - 0.0026) < 1e-6 &&
        Math.abs(p.depth - 0.0026) < 1e-6;
      if (looksLikeLeg) boxLegs++;
    });
    assert.equal(boxLegs, 0, "V23.3 box legs should be gone");
  });

  it("leaves the trench-cam keep-out cylinder empty", () => {
    const g = buildOlm();
    g.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute("position");
      assert.ok(pos, `missing position attr on ${mesh.name || mesh.type}`);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const r = Math.hypot(v.x, v.z);
        const nearCam =
          Math.hypot(v.x - TRENCH_CAM_LOCAL.x, v.y - TRENCH_CAM_LOCAL.y, v.z - TRENCH_CAM_LOCAL.z) < 0.001;
        const inHole = r < 0.0046 && v.y > -0.001 && v.y < 0.004;
        assert.ok(!nearCam, `vertex at cam ${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`);
        assert.ok(!inHole, `vertex in trench hole r=${r.toFixed(4)} y=${v.y.toFixed(4)}`);
      }
    });
  });
});
