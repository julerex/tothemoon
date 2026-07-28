import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phaseLabel, type PhaseId } from "./missionTypes.ts";

const ALL_PHASES: PhaseId[] = [
  "launch",
  "ascent",
  "leo",
  "tli",
  "coast",
  "approach",
  "braking",
  "descent",
  "landed",
  "impact",
];

describe("phaseLabel", () => {
  it("returns a non-empty label for every PhaseId", () => {
    for (const id of ALL_PHASES) {
      const label = phaseLabel(id);
      assert.equal(typeof label, "string");
      assert.ok(label.length > 0, id);
    }
  });

  it("uses distinctive labels for launch and impact", () => {
    assert.match(phaseLabel("launch"), /Liftoff|Starbase/i);
    assert.match(phaseLabel("impact"), /impact/i);
    assert.match(phaseLabel("tli"), /lunar|inject/i);
  });
});
