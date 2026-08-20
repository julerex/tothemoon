/**
 * Timeline hover info bar: clock + title + detail for a scrubber tick.
 */

import { formatWebcastMissionTime } from "./hudFormat";

/** Idle copy when no tick is hovered. */
export const SCRUB_INFO_IDLE = "Hover an event on the timeline";

/** One-line event readout for the bar between ticker and scrubber. */
export type ScrubInfoView = {
  clock: string;
  title: string;
  detail: string;
};

/**
 * Format a timeline event (or phase mark) for the scrubber info bar.
 *
 * @param title - Event or phase name
 * @param t - Mission time (s); negative is countdown
 * @param detail - Optional secondary line
 */
export function scrubInfoView(
  title: string,
  t: number,
  detail?: string,
): ScrubInfoView {
  return {
    clock: formatWebcastMissionTime(t),
    title: title.trim(),
    detail: detail?.trim() ?? "",
  };
}

function setText(root: HTMLElement, sel: string, text: string): void {
  const el = root.querySelector(sel);
  if (el) el.textContent = text;
}

/**
 * Show `view` on the info bar, or the idle hint when `view` is null.
 *
 * @param root - `#scrub-info` element
 * @param view - Hovered tick, or null to clear
 */
export function applyScrubInfoBar(
  root: HTMLElement | null,
  view: ScrubInfoView | null,
): void {
  if (!root) return;
  const idle = root.querySelector<HTMLElement>(".scrub-info-idle");
  const active = root.querySelector<HTMLElement>(".scrub-info-active");
  const detailEl = root.querySelector<HTMLElement>(".scrub-info-detail");
  if (!view) {
    if (idle) idle.hidden = false;
    if (active) active.hidden = true;
    return;
  }
  if (idle) idle.hidden = true;
  if (active) active.hidden = false;
  setText(root, ".scrub-info-clock", view.clock);
  setText(root, ".scrub-info-title", view.title);
  setText(root, ".scrub-info-detail", view.detail);
  if (detailEl) detailEl.hidden = view.detail.length === 0;
}
