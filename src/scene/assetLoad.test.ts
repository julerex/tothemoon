import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assetLoadFraction,
  assetLoadStatus,
  beginAssetBatch,
  waitForAssets,
} from "./assetLoad.ts";

describe("assetLoadFraction", () => {
  it("is 1 when nothing is queued", () => {
    assert.equal(assetLoadFraction(0, 0), 1);
  });

  it("clamps loaded/total into 0…1", () => {
    assert.equal(assetLoadFraction(0, 4), 0);
    assert.equal(assetLoadFraction(2, 4), 0.5);
    assert.equal(assetLoadFraction(4, 4), 1);
    assert.equal(assetLoadFraction(9, 4), 1);
  });
});

describe("assetLoadStatus", () => {
  it("names in-flight JPEG loads", () => {
    assert.equal(assetLoadStatus(0, 0), "Loading mission…");
    assert.equal(assetLoadStatus(1, 4), "Loading textures… 1 of 4");
    assert.equal(assetLoadStatus(4, 4), "Ready");
  });
});

describe("waitForAssets", () => {
  it("resolves immediately on an empty batch", async () => {
    beginAssetBatch();
    await waitForAssets();
  });
});
