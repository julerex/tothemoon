/**
 * Mechazilla vs Super Heavy / Starship stack: published pad dimensions.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { craftLengthKm } from "./craft.ts";
import {
  CHOPSTICK_CATCH_M,
  CHOPSTICK_LEN_M,
  CHOPSTICK_REST_M,
  OLT_HEIGHT_M,
  OLT_TRUSS_M,
  PAD1_X_KM,
  PAD1_Z_KM,
  PAD1_TOWER_DX_KM,
  PAD1_TOWER_DZ_KM,
  TOWER_BEACON_Y,
  TOWER_H,
  createMechazillaTower,
} from "./earthTheater/mechazillaTower.ts";
import { makeTowerMats } from "./earthTheater/mechazillaMats.ts";
import { addMechazillaTruss } from "./earthTheater/mechazillaTruss.ts";
import { addChopstickCarriage } from "./earthTheater/mechazillaChopsticks.ts";
import { createPad1Tower } from "./earthTheater/padSecondTower.ts";

const STACK_H_M = craftLengthKm(false) * 1000;

describe("Mechazilla vs stacked Starship", () => {
  it("uses the 146 m OLT and 36 m chopsticks", () => {
    assert.equal(OLT_HEIGHT_M, 146);
    assert.equal(CHOPSTICK_LEN_M, 36);
  });

  it("keeps the main truss just above the 123 m stack", () => {
    assert.equal(STACK_H_M, 123);
    assert.ok(OLT_TRUSS_M > STACK_H_M);
    assert.ok(OLT_TRUSS_M < OLT_HEIGHT_M);
    assert.ok(STACK_H_M / OLT_TRUSS_M > 0.9);
    assert.ok(STACK_H_M / OLT_TRUSS_M < 0.98);
  });

  it("places the pad beacon at the lightning-rod height", () => {
    assert.equal(TOWER_H, OLT_TRUSS_M / 1000);
    assert.equal(TOWER_BEACON_Y, OLT_HEIGHT_M / 1000);
  });

  it("parks chopsticks at the ship nose for launch and drops to grid fins for catch", () => {
    assert.equal(CHOPSTICK_REST_M, 122);
    assert.equal(CHOPSTICK_CATCH_M, 72);
    assert.ok(Math.abs(CHOPSTICK_REST_M - STACK_H_M) < 8);
    assert.ok(CHOPSTICK_REST_M < OLT_TRUSS_M);
    assert.ok(CHOPSTICK_CATCH_M < 75 && CHOPSTICK_CATCH_M > 65);
  });

  it("builds tubular corner columns for the open truss (V23.2)", () => {
    const g = new THREE.Group();
    g.name = "mechazilla";
    addMechazillaTruss(g, makeTowerMats());
    const col = g.getObjectByName("pad-tower-column") as THREE.Mesh | undefined;
    assert.ok(col?.isMesh);
    assert.ok(col!.geometry instanceof THREE.CylinderGeometry);
  });

  it("builds an open elevator cage and a named peak deck (V25)", () => {
    const g = new THREE.Group();
    addMechazillaTruss(g, makeTowerMats());
    assert.ok(g.getObjectByName("pad-tower-rail"));
    const peak = g.getObjectByName("pad-tower-peak") as THREE.Mesh | undefined;
    assert.ok(peak?.isMesh);
    assert.ok(peak!.geometry instanceof THREE.BoxGeometry);
  });
});

describe("Mechazilla chopsticks / QD names (V23.4)", () => {
  it("keeps chopstick and QD node names for recovery + shadows", () => {
    const g = new THREE.Group();
    addChopstickCarriage(g, makeTowerMats());
    assert.ok(g.getObjectByName("pad-chopstick-carriage"));
    assert.ok(g.getObjectByName("pad-chopstick-L"));
    assert.ok(g.getObjectByName("pad-chopstick-R"));
  });
});

describe("OLP-1 second tower (V26)", () => {
  it("sits east of the live OLP-2 origin toward the gulf", () => {
    assert.ok(PAD1_X_KM < -0.2);
    assert.ok(PAD1_X_KM > -0.45);
    assert.ok(PAD1_Z_KM < -0.05, "OLP-1 sits south of the OLP-2 OLM");
    assert.ok(PAD1_Z_KM > -0.09);
    const dist = Math.hypot(PAD1_X_KM, PAD1_Z_KM);
    assert.ok(dist > 0.36 && dist < 0.38, `OLP-1 is ~369 m from OLP-2, got ${dist} km`);
  });

  it("keeps the Pad 1 link road out of the live OLM / trench-cam hole", () => {
    const g = createPad1Tower();
    const road = g.getObjectByName("pad1-link-road") as THREE.Mesh | undefined;
    assert.ok(road?.isMesh);
    const geo = road!.geometry as THREE.BoxGeometry;
    const len = geo.parameters.width;
    const localX = g.position.x + road!.position.x;
    const liveEnd = localX + len * 0.5;
    assert.ok(liveEnd < -0.04, `road reaches x=${liveEnd}, must stop short of the live OLM`);
  });

  it("builds a named Pad 1 tower without an OLM, prefixed chopsticks", () => {
    const g = createPad1Tower();
    assert.equal(g.name, "mechazilla-pad1");
    assert.equal(g.position.x, PAD1_X_KM);
    const tower = g.getObjectByName("pad1-mechazilla");
    assert.ok(tower);
    assert.equal(tower!.position.x, PAD1_TOWER_DX_KM);
    assert.equal(tower!.position.z, PAD1_TOWER_DZ_KM);
    assert.ok(g.getObjectByName("pad1-stripped-mount"));
    assert.ok(g.getObjectByName("pad1-apron"));
    assert.equal(g.getObjectByName("pad-olm"), undefined);
    assert.ok(g.getObjectByName("pad1-pad-chopstick-L"));
    assert.equal(g.getObjectByName("pad-chopstick-L"), undefined);
  });

  it("keeps the live tower OLM and unprefixed chopstick names", () => {
    const live = createMechazillaTower();
    assert.equal(live.name, "mechazilla");
    assert.ok(live.getObjectByName("pad-olm"));
    assert.ok(live.getObjectByName("pad-chopstick-L"));
    assert.ok(live.getObjectByName("pad-tower-base"));
  });
});
