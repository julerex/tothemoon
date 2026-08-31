/**
 * Hard-lock vs user-orbit for onboard / webcast mounts (fin, gridfin,
 * engine-bay, trench, hull).
 *
 * Entering a mount snaps the camera to that pose every frame (`"hard"`).
 * These mounts are fixed livestream cameras: pan / orbit / zoom is rejected
 * and the pose stays hard-locked. (Free-look cameras such as chase / tower
 * still accept sticky offsets.)
 * Re-entering the mount (rail pick, Auto-cam cut) restores `"hard"`.
 */

export type MountFocus =
  | "fin"
  | "gridfin"
  | "trench"
  | "hull"
  | "engines"
  | "enginesDown";

/** Snap pose every frame until the user grabs the camera. */
export type MountLock = "hard" | "orbit";

/** True for onboard / webcast mount focuses. */
export function isMountFocus(mode: string): mode is MountFocus {
  return (
    mode === "fin" ||
    mode === "gridfin" ||
    mode === "trench" ||
    mode === "hull" ||
    mode === "engines" ||
    mode === "enginesDown"
  );
}

/** Snap to the mount pose until the user orbits, pans, or zooms. */
export function mountLockOnEnter(): MountLock {
  return "hard";
}

/**
 * First orbit / pan / zoom (mouse or hold keys) leaves the hard lock.
 * Already-orbiting stays orbiting.
 */
export function mountLockAfterUserControl(_prev: MountLock): MountLock {
  return "orbit";
}

/** True while a mount should reseat the camera and ignore sticky offsets. */
export function isHardLockedMount(mode: string, lock: MountLock): boolean {
  return isMountFocus(mode) && lock === "hard";
}
