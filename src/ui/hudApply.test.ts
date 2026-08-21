import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toggleIsOnLabel } from "./hudApply.ts";

describe("toggleIsOnLabel", () => {
  it("names Autocam and Labels on/off", () => {
    assert.equal(toggleIsOnLabel("Autocam", true), "Autocam is on");
    assert.equal(toggleIsOnLabel("Autocam", false), "Autocam is off");
    assert.equal(toggleIsOnLabel("Labels", true), "Labels is on");
    assert.equal(toggleIsOnLabel("Labels", false), "Labels is off");
  });
});
