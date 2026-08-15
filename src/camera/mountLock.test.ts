import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isHardLockedMount,
  isMountFocus,
  mountLockAfterUserControl,
  mountLockOnEnter,
} from "./mountLock.ts";

const MOUNTS = ["fin", "gridfin", "trench", "hull"] as const;
const TRACKED = ["sun", "moon", "earth", "starbase", "chase", "free"] as const;

describe("mount lock contract", () => {
  it("treats fin / gridfin / trench / hull as mount focuses", () => {
    for (const mode of MOUNTS) assert.equal(isMountFocus(mode), true);
    for (const mode of TRACKED) assert.equal(isMountFocus(mode), false);
  });

  it("hard-locks on enter and leaves the lock on first user control", () => {
    const entered = mountLockOnEnter();
    assert.equal(entered, "hard");
    for (const mode of MOUNTS) {
      assert.equal(isHardLockedMount(mode, entered), true);
    }
    const unlocked = mountLockAfterUserControl(entered);
    assert.equal(unlocked, "orbit");
    for (const mode of MOUNTS) {
      assert.equal(isHardLockedMount(mode, unlocked), false);
    }
  });

  it("stays in orbit if the user keeps controlling after unlock", () => {
    const again = mountLockAfterUserControl("orbit");
    assert.equal(again, "orbit");
    assert.equal(isHardLockedMount("trench", again), false);
  });

  it("re-locks when the mount is entered again (digit key / Auto-cam)", () => {
    const relocked = mountLockOnEnter();
    assert.equal(relocked, "hard");
    assert.equal(isHardLockedMount("gridfin", relocked), true);
  });

  it("never hard-locks a non-mount focus even if the lock flag is hard", () => {
    for (const mode of TRACKED) {
      assert.equal(isHardLockedMount(mode, "hard"), false);
    }
  });
});
