import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scrubInfoView } from "./hudScrubInfo.ts";

describe("scrubInfoView", () => {
  it("uses the webcast T+ clock and trims copy", () => {
    const v = scrubInfoView("  Liftoff ", 0, " Starbase · Boca Chica ");
    assert.equal(v.clock, "T+00:00:00");
    assert.equal(v.title, "Liftoff");
    assert.equal(v.detail, "Starbase · Boca Chica");
  });

  it("formats countdown and omits empty detail", () => {
    const v = scrubInfoView("Hold", -42);
    assert.equal(v.clock, "T−00:00:42");
    assert.equal(v.detail, "");
  });
});
