/**
 * Launch-site name plates: unique specs, named parents, attach onto a live pad.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { createMechazillaTower } from "./earthTheater/mechazillaTower.ts";
import { addLaunchSiteLabels, launchSiteLabels } from "./earthTheater/padLabels.ts";
import { createPad1Tower } from "./earthTheater/padSecondTower.ts";
import { createPadSurroundings } from "./earthTheater/padSurroundings.ts";
import { zoomLabelName } from "./zoomLabels.ts";

function requiredTexts(): string[] {
  return [
    "OLM",
    "Mechazilla",
    "Chopsticks",
    "Pad 2 tanks",
    "Main tanks",
    "Offload tanks",
    "East tanks",
    "Vertical tanks",
    "Warehouse",
    "GSE shed",
    "OLP-1",
    "Flame trench",
    "SH 4",
  ];
}

describe("launchSiteLabels", () => {
  it("covers tanks, OLM, Mechazilla, and buildings with unique sprite names", () => {
    const specs = launchSiteLabels();
    const texts = new Set(specs.map((s) => s.text));
    for (const t of requiredTexts()) assert.ok(texts.has(t), `missing ${t}`);
    const names = specs.map((s) => zoomLabelName(s.text));
    assert.equal(new Set(names).size, names.length);
    assert.ok(specs.length >= 20);
  });
});

describe("addLaunchSiteLabels", () => {
  it("parents a plate onto every spec when the pad graph is stubbed", () => {
    const pad = new THREE.Group();
    for (const spec of launchSiteLabels()) {
      if (pad.getObjectByName(spec.parent)) continue;
      const g = new THREE.Group();
      g.name = spec.parent;
      pad.add(g);
    }
    const n = addLaunchSiteLabels(pad);
    assert.equal(n, launchSiteLabels().length);
    for (const spec of launchSiteLabels()) {
      assert.ok(pad.getObjectByName(zoomLabelName(spec.text)), spec.text);
    }
  });

  it("attaches plates onto the live pad builders", () => {
    const pad = new THREE.Group();
    pad.add(createPadSurroundings());
    pad.add(createMechazillaTower());
    pad.add(createPad1Tower());
    const trench = new THREE.Group();
    trench.name = "pad-trench";
    pad.add(trench);
    const beacon = new THREE.Group();
    beacon.name = "pad-beacon";
    pad.add(beacon);
    const n = addLaunchSiteLabels(pad);
    assert.equal(n, launchSiteLabels().length);
    assert.ok(pad.getObjectByName("label-olm"));
    assert.ok(pad.getObjectByName("label-mechazilla"));
    assert.ok(pad.getObjectByName("label-main-tanks"));
    assert.ok(pad.getObjectByName("label-warehouse"));
    assert.ok(pad.getObjectByName("label-olp-1"));
    const olm = pad.getObjectByName("label-olm")!;
    assert.ok(olm.parent?.name === "pad-olm");
  });
});
