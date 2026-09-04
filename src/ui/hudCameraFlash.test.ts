import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAM_NAME_FLASH_CLASS,
  flashCameraViewName,
  restartClassAnimation,
} from "./hudCameraFlash.ts";

function fakeEl(text = ""): {
  textContent: string | null;
  offsetWidth: number;
  ops: string[];
  classList: { add: (name: string) => void; remove: (name: string) => void };
} {
  const ops: string[] = [];
  return {
    textContent: text,
    get offsetWidth() {
      ops.push("reflow");
      return 1;
    },
    ops,
    classList: {
      add: (name: string) => {
        ops.push(`add:${name}`);
      },
      remove: (name: string) => {
        ops.push(`remove:${name}`);
      },
    },
  };
}

describe("restartClassAnimation", () => {
  it("removes, reflows, then adds so a mid-play flash retriggers", () => {
    const el = fakeEl();
    restartClassAnimation(el, CAM_NAME_FLASH_CLASS);
    assert.deepEqual(el.ops, [
      `remove:${CAM_NAME_FLASH_CLASS}`,
      "reflow",
      `add:${CAM_NAME_FLASH_CLASS}`,
    ]);
  });

  it("is a no-op when the node is missing", () => {
    restartClassAnimation(null, CAM_NAME_FLASH_CLASS);
  });
});

describe("flashCameraViewName", () => {
  it("writes the title and flashes the rail name and ident", () => {
    const rail = fakeEl("Earth");
    const ident = fakeEl("");
    flashCameraViewName(rail, ident, "Tower One Cam");
    assert.equal(rail.textContent, "Tower One Cam");
    assert.equal(ident.textContent, "Tower One Cam");
    assert.deepEqual(rail.ops, [
      `remove:${CAM_NAME_FLASH_CLASS}`,
      "reflow",
      `add:${CAM_NAME_FLASH_CLASS}`,
    ]);
    assert.deepEqual(ident.ops, [
      `remove:${CAM_NAME_FLASH_CLASS}`,
      "reflow",
      `add:${CAM_NAME_FLASH_CLASS}`,
    ]);
  });

  it("still flashes the rail when the ident is missing", () => {
    const rail = fakeEl("Moon");
    flashCameraViewName(rail, null, "Starship");
    assert.equal(rail.textContent, "Starship");
    assert.ok(rail.ops.includes(`add:${CAM_NAME_FLASH_CLASS}`));
  });

  it("is a no-op when both nodes are missing", () => {
    flashCameraViewName(null, null, "Earth");
  });
});
