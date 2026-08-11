/**
 * Shared camera/auto-cam/bookmark toast enter + leave animation.
 * Scene unit is irrelevant here (DOM only).
 */

const OUT_MS = 300;

/**
 * Fill title/detail nodes for a toast. Detail is shown when non-empty.
 */
export function fillToastText(
  titleEl: HTMLElement,
  detailEl: HTMLElement | null,
  title: string,
  detail: string,
): void {
  titleEl.textContent = title;
  if (!detailEl) return;
  detailEl.textContent = detail;
  detailEl.hidden = !detail;
}

/** Reveal toast and re-trigger the CSS enter animation. */
export function revealToast(toast: HTMLElement): void {
  toast.hidden = false;
  toast.classList.remove("cam-toast-out");
  void toast.offsetWidth;
  toast.classList.add("cam-toast-in");
}

export type ToastTimer = ReturnType<typeof setTimeout> | null;

/**
 * Schedule fade-out then hide. Clears any previous timer via the bag.
 */
export function scheduleToastHide(
  toast: HTMLElement,
  bag: { timer: ToastTimer },
  holdMs: number,
): void {
  if (bag.timer) clearTimeout(bag.timer);
  bag.timer = setTimeout(() => beginToastOut(toast, bag), holdMs);
}

function beginToastOut(toast: HTMLElement, bag: { timer: ToastTimer }): void {
  toast.classList.remove("cam-toast-in");
  toast.classList.add("cam-toast-out");
  bag.timer = setTimeout(() => finishToastOut(toast, bag), OUT_MS);
}

function finishToastOut(toast: HTMLElement, bag: { timer: ToastTimer }): void {
  toast.hidden = true;
  toast.classList.remove("cam-toast-out");
  bag.timer = null;
}

/**
 * Show a toast with title/detail and auto-hide after `holdMs`.
 * No-op when toast or title nodes are missing.
 */
export function playCamToast(
  toast: HTMLElement | null,
  titleEl: HTMLElement | null,
  detailEl: HTMLElement | null,
  title: string,
  detail: string,
  bag: { timer: ToastTimer },
  holdMs: number,
): void {
  if (!toast || !titleEl) return;
  fillToastText(titleEl, detailEl, title, detail);
  revealToast(toast);
  scheduleToastHide(toast, bag, holdMs);
}
