/**
 * Scrubber phase markers, event ticks, and bookmark buttons (pure DOM builders).
 */

import type { CinematicBookmark } from "../mission/bookmarks";
import type { MissionEvent, PhaseSegment } from "../mission/timeline";
import type { PhaseId } from "../physics/mission";
import { formatMissionTime } from "./hudFormat";

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

/** Whether a phase segment gets a text label (not just a tick). */
function phaseMarkHasLabel(seg: PhaseSegment, widthPct: number): boolean {
  return widthPct >= 2.2 || seg.phase === "coast" || seg.phase === "ascent";
}

function appendScrubTick(mark: HTMLElement): void {
  const tick = document.createElement("span");
  tick.className = "scrub-tick";
  mark.appendChild(tick);
}

function appendScrubLabel(mark: HTMLElement, text: string): void {
  const lab = document.createElement("span");
  lab.className = "scrub-lab";
  lab.textContent = text;
  mark.appendChild(lab);
}

function seekScrubToU(u: number): void {
  const scrub = document.querySelector<HTMLInputElement>("#scrub");
  if (!scrub) return;
  scrub.value = String(Math.round(u * 1000));
  scrub.dispatchEvent(new Event("input", { bubbles: true }));
}

function stylePhaseMark(mark: HTMLButtonElement, seg: PhaseSegment): void {
  mark.type = "button";
  mark.className = "scrub-mark";
  mark.dataset.phase = seg.phase;
  mark.style.left = `${(seg.u0 * 100).toFixed(3)}%`;
  mark.title = `${seg.label} · ${formatMissionTime(seg.t0)}`;
  mark.setAttribute("aria-label", `Jump to ${seg.label}`);
}

function fillPhaseMark(mark: HTMLButtonElement, seg: PhaseSegment): void {
  stylePhaseMark(mark, seg);
  appendScrubTick(mark);
  if (phaseMarkHasLabel(seg, (seg.u1 - seg.u0) * 100)) {
    appendScrubLabel(mark, seg.shortLabel);
  }
}

function buildPhaseMark(seg: PhaseSegment): HTMLButtonElement {
  const mark = document.createElement("button");
  fillPhaseMark(mark, seg);
  mark.addEventListener("click", (e) => {
    e.preventDefault();
    seekScrubToU(seg.u0);
  });
  return mark;
}

/** One marker per major phase start on the scrubber track. */
export function renderPhaseMarkers(
  root: HTMLElement,
  segments: readonly PhaseSegment[],
): void {
  root.replaceChildren();
  for (const seg of segments) {
    if (!MAJOR_PHASES.has(seg.phase)) continue;
    root.appendChild(buildPhaseMark(seg));
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
  btn.title = `${ev.title}${ev.detail ? ` · ${ev.detail}` : ""} · ${formatMissionTime(ev.t)}`;
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
): HTMLButtonElement {
  const btn = document.createElement("button");
  styleEventTickPos(btn, tick);
  styleEventTickLabels(btn, tick.event);
  const dot = document.createElement("span");
  dot.className = "scrub-event-tick";
  btn.appendChild(dot);
  btn.addEventListener("click", (e) => onEventTickClick(e, onSeek, tick.event));
  return btn;
}

/** Subtle event ticks under the scrubber range (click → seek + callout). */
export function renderEventTicks(
  root: HTMLElement,
  ticks: ScrubEventTick[],
  onSeek: (ev: MissionEvent) => void,
): void {
  root.replaceChildren();
  for (const tick of ticks) {
    root.appendChild(buildEventTickButton(tick, onSeek));
  }
}

function bookmarkTitle(bm: CinematicBookmark, index: number): string {
  const keyHint = index < 9 ? `Shift+${index + 1}` : "";
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
