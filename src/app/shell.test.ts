import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRoute } from "./shell";
import { missionByPath, MISSIONS } from "./missionCatalog";

describe("parseRoute", () => {
  it("maps empty and root to main", () => {
    assert.equal(parseRoute("").kind, "main");
    assert.equal(parseRoute("#").kind, "main");
    assert.equal(parseRoute("#/").kind, "main");
  });

  it("maps missions path", () => {
    assert.equal(parseRoute("#/missions").kind, "missions");
    assert.equal(parseRoute("#missions").kind, "missions");
  });

  it("maps mission paths", () => {
    const r = parseRoute("#/mission/to-the-moon");
    assert.equal(r.kind, "mission");
    assert.equal(r.missionPath, "to-the-moon");
    const r2 = parseRoute("#/mission/flight-13");
    assert.equal(r2.missionPath, "flight-13");
  });

  it("unknown falls back to main", () => {
    assert.equal(parseRoute("#/nope").kind, "main");
  });
});

describe("missionCatalog", () => {
  it("lists lunar and flight-13", () => {
    assert.ok(MISSIONS.some((m) => m.id === "to-the-moon"));
    assert.ok(MISSIONS.some((m) => m.id === "flight-13"));
  });

  it("resolves by path", () => {
    assert.equal(missionByPath("to-the-moon")?.id, "to-the-moon");
    assert.equal(missionByPath("flight-13")?.status, "preview");
  });
});
