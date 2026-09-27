/**
 * Webcast bottom-bar model (Auto-cam).
 *
 * Look reference: `assets/flight13-webcast/tplus-000110-engines-down-broadcast-hud.jpg`
 * (Flight 13 T+00:01:10, engines-down). No DOM.
 */

import { formatWebcastMissionTime } from "./hudFormat";

/** Short labels for the three-beat timeline, in catalog order. */
const MILESTONE_LABEL: Readonly<Record<string, string>> = {
  liftoff: "LIFTOFF",
  "max-q": "MAX Q",
  staging: "STAGE SEP",
  boostback: "BOOSTBACK",
  "landing-burn": "LANDING",
  "booster-catch": "CATCH",
  seco: "SECO",
  relight: "RELIGHT",
  entry: "ENTRY",
  "land-flip": "FLIP",
  splashdown: "SPLASHDOWN",
  translunarInjection: "TLI",
  lunarOrbitInsertion: "LOI",
  poweredDescentInitiation: "PDI",
  touchdown: "TOUCHDOWN",
  impact: "IMPACT",
};

export type BroadcastMarker = {
  id: string;
  label: string;
  /** Position along the timeline, 0–1. */
  u: number;
  passed: boolean;
  /** Label sits above the line; otherwise below. */
  above: boolean;
};

export type EngineDot = {
  /** -1…1, center of the cluster. */
  x: number;
  y: number;
  lit: boolean;
};

export type BroadcastHudModel = {
  clockSign: string;
  clockBody: string;
  caption: string;
  speed: string;
  altitude: string;
  altitudeUnit: string;
  markers: BroadcastMarker[];
  playheadU: number;
  engines: EngineDot[];
  /** Propellant remaining on the engine rose, 0–1. */
  fuel: number;
  /** Degrees clockwise from nose-up. 0 = vertical. */
  tiltDeg: number;
};

export type BroadcastEvent = {
  id: string;
  t: number;
};

export type BroadcastHudInput = {
  /** Mission seconds. Negative is the T− hold. */
  t: number;
  /** Ground-relative or inertial speed, km/s. */
  speedKmS: number;
  altKm: number;
  events: readonly BroadcastEvent[];
  staged: boolean;
  /** Engines firing (thrust or burn flag). */
  lit: boolean;
  /** Propellant remaining for the cluster on the rose, 0–1. */
  fuel: number;
  tiltDeg: number;
};

/**
 * Open-bottom webcast gauge, measured off
 * `assets/flight13-webcast/tplus-000110-engines-down-broadcast-hud.jpg`.
 * Degrees are y-down (0 = east, 90 = south). The stroke runs clockwise
 * from 8 o'clock over the top to 4 o'clock. Speed, altitude, and the
 * engine-rose fuel arc share it. The bright fuel portion starts at 8 o'clock.
 */
export const GAUGE_ARC_START_DEG = 150;
export const GAUGE_ARC_END_DEG = 30;
export const GAUGE_ARC_SWEEP_DEG = 240;
/** Radius inside the 100×100 dial viewBox. Attitude uses the same radius. */
export const GAUGE_R = 46;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function gaugeXY(deg: number, r: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: 50 + r * Math.cos(t), y: 50 + r * Math.sin(t) };
}

function num(v: number): string {
  return v.toFixed(2);
}

/** Centerline point on the gauge arc. */
export function gaugePoint(deg: number, r = GAUGE_R): { x: number; y: number } {
  return gaugeXY(deg, r);
}

/** SVG path for the open gauge. Large arc, sweep clockwise (y-down). */
export function gaugeArcPath(r = GAUGE_R): string {
  const a = gaugeXY(GAUGE_ARC_START_DEG, r);
  const b = gaugeXY(GAUGE_ARC_END_DEG, r);
  return `M ${num(a.x)} ${num(a.y)} A ${r} ${r} 0 1 1 ${num(b.x)} ${num(b.y)}`;
}

/**
 * Dash for a fuel fraction along {@link gaugeArcPath} when the path's
 * `pathLength` is 100. Fill grows clockwise from 8 o'clock.
 */
export function gaugeFuelDasharray(fuel: number): string {
  return `${(clamp01(fuel) * 100).toFixed(2)} 100`;
}

/**
 * Chevron at an arc end. The tip sits just outside the stroke and the
 * wings sit back on the circle, so it reads as the hook in the still.
 */
export function gaugeChevronPath(deg: number, r = GAUGE_R): string {
  const t = (deg * Math.PI) / 180;
  const ox = Math.cos(t);
  const oy = Math.sin(t);
  const tx = -Math.sin(t);
  const ty = Math.cos(t);
  const px = 50 + ox * r;
  const py = 50 + oy * r;
  const tipX = px + ox * 5.4;
  const tipY = py + oy * 5.4;
  const wing = 3.6;
  const x1 = px - tx * wing;
  const y1 = py - ty * wing;
  const x2 = px + tx * wing;
  const y2 = py + ty * wing;
  return `M ${num(x1)} ${num(y1)} L ${num(tipX)} ${num(tipY)} L ${num(x2)} ${num(y2)}`;
}

type Milestone = { id: string; t: number; label: string };

/**
 * Clockwise tilt from vertical for the attitude rocket.
 * `verticalKmS` > 0 is climb; `horizontalKmS` ≥ 0 is ground-relative speed across.
 */
export function velocityTiltDeg(verticalKmS: number, horizontalKmS: number): number {
  const horiz = Math.max(0, horizontalKmS);
  const deg = (Math.atan2(horiz, verticalKmS) * 180) / Math.PI;
  if (!Number.isFinite(deg)) return 0;
  return Math.min(90, Math.max(0, deg));
}

/** `T+` / `T−` plus `HH:MM:SS`, matching the webcast clock. */
export function broadcastClock(seconds: number): { sign: string; body: string } {
  const full = formatWebcastMissionTime(seconds);
  return { sign: full.slice(0, 2), body: full.slice(2) };
}

/** Integer km/h, no thousands separator (fits the dial). */
export function broadcastSpeedKmh(kmPerS: number): string {
  const kmh = Math.max(0, kmPerS) * 3600;
  if (!Number.isFinite(kmh)) return "0";
  return String(Math.round(kmh));
}

/** Altitude dial: one decimal under 100 km, then km, then thousands of km. */
export function broadcastAltitude(km: number): { value: string; unit: string } {
  const v = Math.max(0, km);
  if (!Number.isFinite(v)) return { value: "0.0", unit: "KM" };
  if (v >= 10_000) {
    const thousands = v / 1000;
    const text = v >= 100_000 ? String(Math.round(thousands)) : thousands.toFixed(1);
    return { value: text, unit: "×10³ KM" };
  }
  if (v >= 100) return { value: String(Math.round(v)), unit: "KM" };
  return { value: v.toFixed(1), unit: "KM" };
}

/** Flight-test missions use the webcast caption; the lunar arc names the route. */
export function broadcastCaption(events: readonly BroadcastEvent[]): string {
  const flightTest = events.some((e) => e.id === "entry" || e.id === "splashdown");
  return flightTest ? "STARSHIP FLIGHT TEST" : "STARBASE → MOON";
}

function ring(count: number, radius: number, phase: number): { x: number; y: number }[] {
  const dots: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    dots.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return dots;
}

/** Super Heavy 3 / 10 / 20, or the ship's six Raptors after staging. */
export function engineDots(cluster: "booster" | "ship", lit: boolean): EngineDot[] {
  const layout = cluster === "ship"
    ? [...ring(3, 0.32, -Math.PI / 2), ...ring(3, 0.78, Math.PI / 6)]
    : [
        ...ring(3, 0.22, -Math.PI / 2),
        ...ring(10, 0.58, Math.PI / 10),
        ...ring(20, 0.92, 0),
      ];
  return layout.map((p) => ({ x: p.x, y: p.y, lit }));
}

function milestones(events: readonly BroadcastEvent[]): Milestone[] {
  const out: Milestone[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const label = MILESTONE_LABEL[e.id];
    if (!label || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push({ id: e.id, t: e.t, label });
  }
  out.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  if (!seen.has("liftoff")) out.unshift({ id: "liftoff", t: 0, label: "LIFTOFF" });
  return out;
}

/** Three beats that contain `t`. Slides forward once the third beat is past. */
function windowOfThree(marks: readonly Milestone[], t: number): Milestone[] {
  if (marks.length <= 3) return [...marks];
  for (let s = 0; s <= marks.length - 3; s++) {
    const last = marks[s + 2]!;
    if (t <= last.t) return marks.slice(s, s + 3);
  }
  return marks.slice(marks.length - 3);
}

function layoutTimeline(
  marks: readonly Milestone[],
  t: number,
): { markers: BroadcastMarker[]; playheadU: number } {
  if (marks.length === 0) return { markers: [], playheadU: 0 };
  const t0 = marks[0]!.t;
  const t1 = marks[marks.length - 1]!.t;
  const span = Math.max(t1 - t0, 1e-6);
  const pad = marks.length === 1 ? 0 : 0.08;
  const uOf = (time: number): number => {
    if (marks.length === 1) return 0.5;
    const raw = (time - t0) / span;
    const clamped = Math.min(1, Math.max(0, raw));
    return pad + (1 - 2 * pad) * clamped;
  };
  const markers = marks.map((m, i) => ({
    id: m.id,
    label: m.label,
    u: uOf(m.t),
    passed: m.t <= t + 1e-6,
    above: i % 2 === 0,
  }));
  return { markers, playheadU: uOf(t) };
}

/** Full bottom-bar model for one frame. */
export function buildBroadcastHud(input: BroadcastHudInput): BroadcastHudModel {
  const clock = broadcastClock(input.t);
  const alt = broadcastAltitude(input.altKm);
  const timeline = layoutTimeline(windowOfThree(milestones(input.events), input.t), input.t);
  const cluster = input.staged ? "ship" : "booster";
  return {
    clockSign: clock.sign,
    clockBody: clock.body,
    caption: broadcastCaption(input.events),
    speed: broadcastSpeedKmh(input.speedKmS),
    altitude: alt.value,
    altitudeUnit: alt.unit,
    markers: timeline.markers,
    playheadU: timeline.playheadU,
    engines: engineDots(cluster, input.lit),
    fuel: clamp01(input.fuel),
    tiltDeg: input.tiltDeg,
  };
}
