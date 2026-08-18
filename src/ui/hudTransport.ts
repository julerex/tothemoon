/**
 * Play/pause, speed, news ticker, and timeline scrub.
 */

import type { CinematicBookmark } from "../mission/bookmarks";
import type { MissionEvent } from "../mission/timeline";
import {
  formatTickerCrawl,
  newsAtMissionTime,
  newsTickerPeriodS,
} from "../mission/newsTicker";
import { parseSpeedMode } from "./hudFormat";
import {
  renderBookmarks,
  renderEventTicks,
  renderPhaseMarkers,
} from "./hudScrubRender";
import type { TelemetryView } from "./telemetryView";
import type { HudRuntime } from "./hudTypes";

function setNewsTickerCss(track: HTMLElement, rate: number, playing: boolean): void {
  track.style.setProperty("--news-ticker-dur", `${newsTickerPeriodS(rate)}s`);
  track.style.setProperty("--news-ticker-dir", rate < 0 ? "reverse" : "normal");
  track.classList.toggle("news-ticker-pause", !playing || Math.abs(rate) < 1e-6);
}

function applyNewsTickerRate(
  rt: HudRuntime,
  playbackRate: number,
  playing: boolean,
): void {
  if (!rt.dom.newsTrackEl) return;
  const rate = Number.isFinite(playbackRate) ? playbackRate : 1;
  setNewsTickerCss(rt.dom.newsTrackEl, rate, playing);
  rt.flags.lastNewsRate = rate;
}

function rebindNewsAnimation(rt: HudRuntime): void {
  if (!rt.dom.newsTrackEl) return;
  rt.dom.newsTrackEl.style.animation = "none";
  void rt.dom.newsTrackEl.offsetWidth;
  rt.dom.newsTrackEl.style.animation = "";
}

function setNewsLine(rt: HudRuntime, beatId: string, line: string): void {
  rt.flags.lastNewsId = beatId;
  rt.dom.newsTextEl!.textContent = line;
  if (rt.dom.newsTextDupEl) rt.dom.newsTextDupEl.textContent = line;
}

function newsLineFor(rt: HudRuntime, missionT: number, beatLine: string): string {
  return formatTickerCrawl(rt.data.newsBeats, missionT, 2) || beatLine;
}

function applyNewsBeat(
  rt: HudRuntime,
  missionT: number,
  beatId: string,
  beatLine: string,
): boolean {
  const line = newsLineFor(rt, missionT, beatLine);
  const changed =
    beatId !== rt.flags.lastNewsId || rt.dom.newsTextEl!.textContent !== line;
  if (changed) setNewsLine(rt, beatId, line);
  return changed;
}

function updateNewsTickerText(rt: HudRuntime, missionT: number): boolean {
  if (!rt.dom.newsTickerEl || !rt.dom.newsTextEl) return false;
  const beat = newsAtMissionTime(rt.data.newsBeats, missionT);
  if (!beat) {
    rt.dom.newsTickerEl.hidden = true;
    return false;
  }
  rt.dom.newsTickerEl.hidden = false;
  return applyNewsBeat(rt, missionT, beat.id, beat.line);
}

export function updateNewsTicker(
  rt: HudRuntime,
  missionT: number,
  playing: boolean,
  playbackRate: number,
): void {
  if (!rt.dom.newsTickerEl || !rt.dom.newsTextEl) return;
  const textChanged = updateNewsTickerText(rt, missionT);
  if (rt.dom.newsTickerEl.hidden) return;
  const rateChanged =
    !Number.isFinite(rt.flags.lastNewsRate) ||
    Math.abs(rt.flags.lastNewsRate - playbackRate) > 1e-9;
  if (textChanged || rateChanged) rebindNewsAnimation(rt);
  applyNewsTickerRate(rt, playbackRate, playing);
}

export function syncSpeedSelect(rt: HudRuntime, view: TelemetryView): void {
  const rateStr = String(view.main.playbackSpeed);
  if (
    rt.dom.speed.value !== rateStr &&
    rt.dom.speed.querySelector(`option[value="${rateStr}"]`)
  ) {
    rt.dom.speed.value = rateStr;
  }
}

export function setActiveEventTick(rt: HudRuntime, id: string | null): void {
  if (!rt.dom.eventsEl) return;
  for (const node of rt.dom.eventsEl.querySelectorAll<HTMLElement>("[data-event]")) {
    node.classList.toggle("active", node.dataset.event === id);
  }
}

export function setActiveBookmark(rt: HudRuntime, id: string | null): void {
  if (!rt.dom.bookmarksEl) return;
  for (const node of rt.dom.bookmarksEl.querySelectorAll<HTMLElement>(
    "[data-bookmark]",
  )) {
    node.classList.toggle("active", node.dataset.bookmark === id);
  }
}

/** Seek scrubber to a narrative event and highlight the tick. */
export function seekToEvent(rt: HudRuntime, ev: MissionEvent): void {
  setActiveBookmark(rt, null);
  rt.dom.scrub.value = String(Math.round(ev.u * 1000));
  rt.data.handlers.onScrub(ev.u);
  setActiveEventTick(rt, ev.id);
}

export function jumpToBookmark(rt: HudRuntime, bm: CinematicBookmark): void {
  setActiveBookmark(rt, bm.id);
  setActiveEventTick(rt, null);
  rt.dom.scrub.value = String(Math.round(bm.u * 1000));
  if (rt.data.handlers.onBookmark) rt.data.handlers.onBookmark(bm);
  else rt.data.handlers.onScrub(bm.u);
}

export function wireTransportControls(rt: HudRuntime): void {
  rt.dom.btnPlay?.addEventListener("click", () => rt.data.handlers.onPlayToggle());
  rt.dom.speed.addEventListener("change", () => {
    rt.data.handlers.onSpeedMode(parseSpeedMode(rt.dom.speed.value));
  });
}

function onScrubInput(rt: HudRuntime): void {
  setActiveBookmark(rt, null);
  setActiveEventTick(rt, null);
  rt.data.handlers.onScrub(Number(rt.dom.scrub.value) / 1000);
}

export function wireScrubber(rt: HudRuntime): void {
  rt.dom.scrub.addEventListener("pointerdown", () => {
    rt.flags.scrubbing = true;
  });
  rt.dom.scrub.addEventListener("pointerup", () => {
    rt.flags.scrubbing = false;
  });
  rt.dom.scrub.addEventListener("input", () => onScrubInput(rt));
}

function onReplayClick(rt: HudRuntime): void {
  rt.data.handlers.onScrub(0);
  if (!rt.flags.lastPlaying) rt.data.handlers.onPlayToggle();
  if (rt.dom.completeEl) rt.dom.completeEl.hidden = true;
  rt.flags.completeShown = false;
}

export function wireReplay(rt: HudRuntime): void {
  rt.dom.mcReplay?.addEventListener("click", () => onReplayClick(rt));
}

export function wireScrubChrome(rt: HudRuntime): void {
  const { dom, data } = rt;
  if (dom.markersEl) renderPhaseMarkers(dom.markersEl, data.timeline.segments);
  if (dom.eventsEl) {
    renderEventTicks(dom.eventsEl, data.scrubEventTicks, (ev) => seekToEvent(rt, ev));
  }
  if (dom.bookmarksEl) {
    renderBookmarks(dom.bookmarksEl, data.bookmarks, (bm) => jumpToBookmark(rt, bm));
  }
}
