import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PAYLOAD_END_S,
  PAYLOAD_SAT_COUNT,
  PAYLOAD_START_S,
  payloadDeployStrength,
  payloadHatchOpen,
  payloadSatPose,
  payloadSatReleaseT,
} from "./payloadDeploy.ts";

describe("payloadDeployStrength", () => {
  it("is zero before the public window", () => {
    assert.equal(payloadDeployStrength(PAYLOAD_START_S - 1), 0);
    assert.equal(payloadDeployStrength(0), 0);
  });

  it("is full inside the deploy window", () => {
    assert.equal(payloadDeployStrength(PAYLOAD_START_S + 10), 1);
    assert.equal(payloadDeployStrength((PAYLOAD_START_S + PAYLOAD_END_S) / 2), 1);
  });

  it("fades after PAYLOAD_END then goes to zero", () => {
    const mid = payloadDeployStrength(PAYLOAD_END_S + 20);
    assert.ok(mid > 0 && mid < 1);
    assert.equal(payloadDeployStrength(PAYLOAD_END_S + 120), 0);
  });

  it("treats non-finite as 0", () => {
    assert.equal(payloadDeployStrength(Number.NaN), 0);
  });
});

describe("payloadHatchOpen", () => {
  it("opens after PAYLOAD_START and is full mid-window", () => {
    assert.equal(payloadHatchOpen(PAYLOAD_START_S - 1), 0);
    const early = payloadHatchOpen(PAYLOAD_START_S + 10);
    assert.ok(early > 0 && early < 1);
    assert.equal(payloadHatchOpen(PAYLOAD_START_S + 200), 1);
  });

  it("closes after PAYLOAD_END", () => {
    assert.ok(payloadHatchOpen(PAYLOAD_END_S + 20) < 1);
    assert.equal(payloadHatchOpen(PAYLOAD_END_S + 60), 0);
  });
});

describe("payloadSatPose", () => {
  it("hides sats before release and shows them after", () => {
    const t0 = payloadSatReleaseT(0);
    assert.equal(payloadSatPose(0, t0 - 1).visible, false);
    const mid = payloadSatPose(0, t0 + 30);
    assert.equal(mid.visible, true);
    assert.ok(mid.opacity > 0);
    assert.ok(mid.scale > 0);
  });

  it("staggers release times across the window", () => {
    const first = payloadSatReleaseT(0);
    const last = payloadSatReleaseT(PAYLOAD_SAT_COUNT - 1);
    assert.ok(first >= PAYLOAD_START_S);
    assert.ok(last <= PAYLOAD_END_S);
    assert.ok(last > first);
  });

  it("fades sats after the public deploy window", () => {
    const t0 = payloadSatReleaseT(5);
    const hot = payloadSatPose(5, t0 + 40);
    const late = payloadSatPose(5, PAYLOAD_END_S + 200);
    assert.ok(hot.visible);
    assert.equal(late.visible, false);
  });

  it("covers all twenty sats", () => {
    assert.equal(PAYLOAD_SAT_COUNT, 20);
    // Just after the last sat releases — earlier sats still held through the window.
    const t = payloadSatReleaseT(PAYLOAD_SAT_COUNT - 1) + 20;
    let visible = 0;
    for (let i = 0; i < PAYLOAD_SAT_COUNT; i++) {
      if (payloadSatPose(i, t).visible) visible++;
    }
    assert.equal(visible, PAYLOAD_SAT_COUNT);
  });
});
