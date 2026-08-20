/**
 * Scrubber phase / event ticks on the range track, plus bookmark buttons.
 */

import type { CinematicBookmark } from "../mission/bookmarks";
import type { MissionEvent, PhaseSegment } from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import { formatMissionTime } from "./hudFormat";
import { scrubInfoView, type ScrubInfoView } from "./hudScrubInfo";

const MAJOR_PHASES = new Set<PhaseId>([
  "launch",
  "ascent",
  "lowEarthOrbit",
  "translunarInjection",
  "coast",
  "approach",
  "braking",
  "descent",
  "landed",
  "impact",
]);

function seekScrubToU(u: number): void {
  const scrub = document.querySelector<HTMLInputElement>("#scrub");
  if (!scrub) return;
  scrub.value = String(Math.round(u * 1000));
  scrub.dispatchEvent(new Event("input", { bubbles: true }));
}

function bindScrubInfoHover(
  btn: HTMLButtonElement,
  view: ScrubInfoView,
  onHover?: (view: ScrubInfoView | null) => void,
): void {
  if (!onHover) return;
  btn.addEventListener("pointerenter", () => onHover(view));
  btn.addEventListener("pointerleave", () => onHover(null));
  btn.addEventListener("focus", () => onHover(view));
  btn.addEventListener("blur", () => onHover(null));
}

function stylePhaseMark(mark: HTMLButtonElement, seg: PhaseSegment): void {
  mark.type = "button";
  mark.className = "scrub-mark";
  mark.dataset.phase = seg.phase;
  mark.style.left = `${(seg.u0 * 100).toFixed(3)}%`;
  mark.setAttribute("aria-label", `Jump to ${seg.label}`);
}

function buildPhaseMark(
  seg: PhaseSegment,
  onHover?: (view: ScrubInfoView | null) => void,
): HTMLButtonElement {
  const mark = document.createElement("button");
  stylePhaseMark(mark, seg);
  bindScrubInfoHover(mark, scrubInfoView(seg.label, seg.t0), onHover);
  mark.addEventListener("click", (e) => {
    e.preventDefault();
    seekScrubToU(seg.u0);
  });
  return mark;
}

/** One track tick per major phase start. */
export function renderPhaseMarkers(
  root: HTMLElement,
  segments: readonly PhaseSegment[],
  onHover?: (view: ScrubInfoView | null) => void,
): void {
  root.replaceChildren();
  for (const seg of segments) {
    if (!MAJOR_PHASES.has(seg.phase)) continue;
    root.appendChild(buildPhaseMark(seg, onHover));
  }
}

type ScrubEventTick = {
  event: MissionEvent;
  secondary?: boolean;
};

function styleEventTickPos(btn: HTMLButtonElement, tick: ScrubEventTick): void {
  const ev = tick.event;
  btn.type = "button";
  btn.className = tick.secondary
    ? "scrub-event scrub-event-secondary"
    : "scrub-event";
  btn.dataset.event = ev.id;
  btn.style.left = `${(ev.u * 100).toFixed(3)}%`;
}

function styleEventTickLabels(btn: HTMLButtonElement, ev: MissionEvent): void {
  btn.setAttribute(
    "aria-label",
    `Jump to ${ev.title} at ${formatMissionTime(ev.t)}`,
  );
}

function onEventTickClick(e: MouseEvent, onSeek: (ev: MissionEvent) => void, ev: MissionEvent): void {
  e.preventDefault();
  e.stopPropagation();
  onSeek(ev);
}

function buildEventTickButton(
  tick: ScrubEventTick,
  onSeek: (ev: MissionEvent) => void,
  onHover?: (view: ScrubInfoView | null) => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  styleEventTickPos(btn, tick);
  styleEventTickLabels(btn, tick.event);
  bindScrubInfoHover(
    btn,
    scrubInfoView(tick.event.title, tick.event.t, tick.event.detail),
    onHover,
  );
  btn.addEventListener("click", (e) => onEventTickClick(e, onSeek, tick.event));
  return btn;
}

/** Event ticks on the scrubber track (click → seek). */
export function renderEventTicks(
  root: HTMLElement,
  ticks: ScrubEventTick[],
  onSeek: (ev: MissionEvent) => void,
  onHover?: (view: ScrubInfoView | null) => void,
): void {
  root.replaceChildren();
  for (const tick of ticks) {
    root.appendChild(buildEventTickButton(tick, onSeek, onHover));
  }
}

function bookmarkTitle(bm: CinematicBookmark, index: number): string {
  const keyHint = index < 9 ? String(index + 1) : "";
  const base = `${bm.label} · ${formatMissionTime(bm.t)}`;
  return keyHint ? `${base} · ${keyHint}` : base;
}

function styleBookmarkButton(btn: HTMLButtonElement, bm: CinematicBookmark, index: number): void {
  btn.type = "button";
  btn.className = "bookmark-btn";
  btn.dataset.bookmark = bm.id;
  btn.textContent = bm.shortLabel;
  btn.title = bookmarkTitle(bm, index);
  btn.setAttribute("aria-label", `Bookmark ${bm.label} at ${formatMissionTime(bm.t)}`);
}

function buildBookmarkButton(
  bm: CinematicBookmark,
  index: number,
  onJump: (bm: CinematicBookmark) => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  styleBookmarkButton(btn, bm, index);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    onJump(bm);
  });
  return btn;
}

/** Compact seek+camera buttons under the scrubber. */
export function renderBookmarks(
  root: HTMLElement,
  bookmarks: CinematicBookmark[],
  onJump: (bm: CinematicBookmark) => void,
): void {
  root.replaceChildren();
  if (bookmarks.length === 0) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  bookmarks.forEach((bm, i) => {
    root.appendChild(buildBookmarkButton(bm, i, onJump));
  });
}
