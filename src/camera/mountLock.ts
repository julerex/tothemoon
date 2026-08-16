/**
 * Hard-lock vs user-orbit for onboard / webcast mounts (fin, gridfin, trench).
 *
 * Entering a mount snaps the camera to that pose every frame (`"hard"`).
 * The first mouse or orbit/pan/zoom key switches to `"orbit"`: the look-at
 * still tracks the mount, but pan / orbit / zoom offsets stick — same as
 * Starbase / chase on either mission.
 * Re-entering the mount (digit key, Auto-cam cut) restores `"hard"`.
 */

export type MountFocus = "fin" | "gridfin" | "trench" | "hull";

/** Snap pose every frame until the user grabs the camera. */
export type MountLock = "hard" | "orbit";

/** True for onboard / webcast mount focuses. */
export function isMountFocus(mode: string): mode is MountFocus {
  return mode === "fin" || mode === "gridfin" || mode === "trench" || mode === "hull";
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
