/**
 * Flash the HUD camera name when the view cuts so the change is readable.
 */

/** CSS class that retriggers the name-flash animation. */
export const CAM_NAME_FLASH_CLASS = "cam-name-flash";

/** Minimal node that can restart a CSS animation class. */
export type FlashTarget = {
  classList: {
    add: (name: string) => void;
    remove: (name: string) => void;
  };
  offsetWidth: number;
  textContent: string | null;
};

/**
 * Drop and re-add a CSS animation class. Reading {@link FlashTarget.offsetWidth}
 * forces a reflow so a cut mid-flash starts again.
 */
export function restartClassAnimation(
  el: FlashTarget | null,
  className: string,
): void {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

/**
 * Write the new camera title and restart the flash on the rail name and the
 * on-canvas ident. No-op when both nodes are missing.
 */
export function flashCameraViewName(
  camModeEl: FlashTarget | null,
  identEl: FlashTarget | null,
  title: string,
): void {
  if (camModeEl) camModeEl.textContent = title;
  restartClassAnimation(camModeEl, CAM_NAME_FLASH_CLASS);
  if (identEl) identEl.textContent = title;
  restartClassAnimation(identEl, CAM_NAME_FLASH_CLASS);
}
