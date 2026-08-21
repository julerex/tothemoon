/**
 * V23.1 tank farm: named group, berm, primary bank present.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTankFarm } from "./earthTheater/padTankFarm.ts";
import { makePadSurroundMats } from "./earthTheater/padSurroundMats.ts";

describe("padTankFarm V23.1", () => {
  it("names the farm and berm, keeps primary bank meshes", () => {
    const farm = buildTankFarm(makePadSurroundMats());
    assert.equal(farm.name, "pad-tank-farm");
    const berm = farm.getObjectByName("pad-tank-farm-berm");
    assert.ok(berm, "berm enclosure missing");
    // 12 primary tanks + caps + bands + secondary + pipes + equip → dozens of meshes.
    let meshCount = 0;
    farm.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) meshCount++;
    });
    assert.ok(meshCount >= 40, `expected dense farm, got ${meshCount}`);
  });
});
