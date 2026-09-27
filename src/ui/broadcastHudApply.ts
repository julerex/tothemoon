/**
 * Paint the webcast bottom bar while Auto-cam is on.
 * Side rails and the transport strip stay in the DOM for manual camera mode.
 */

import { bodyPositions } from "../physics/bodies";
import { enuAtPosition, groundRelativeVelocity } from "../physics/earthFrame";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import type { ReadonlySample } from "../physics/missionTypes";
import { dot, v3 } from "../physics/vec3";
import {
  buildBroadcastHud,
  gaugeArcPath,
  gaugeChevronPath,
  gaugeFuelDasharray,
  GAUGE_ARC_END_DEG,
  GAUGE_ARC_START_DEG,
  GAUGE_R,
  velocityTiltDeg,
  type BroadcastHudModel,
  type EngineDot,
} from "./broadcastHud";
import type { HudRuntime } from "./hudTypes";
import type { Telemetry } from "./telemetryView";

const SVG_NS = "http://www.w3.org/2000/svg";

const _up = v3();
const _east = v3();
const _north = v3();
const _rel = v3();

type Nodes = {
  engines: SVGSVGElement;
  rocket: SVGGElement;
  dots: SVGElement[];
  fuel: SVGPathElement | null;
  cluster: string;
  timeline: HTMLElement;
  sign: HTMLElement;
  time: HTMLElement;
  caption: HTMLElement;
  speed: HTMLElement;
  alt: HTMLElement;
  altUnit: HTMLElement;
};

let nodes: Nodes | null = null;

function svg(name: string): SVGElement {
  return document.createElementNS(SVG_NS, name);
}

/** Open speed/altitude gauge: gray track plus the two end chevrons. */
function appendGauge(root: SVGSVGElement): void {
  if (root.childElementCount > 0) return;
  const arc = svg("path");
  arc.setAttribute("d", gaugeArcPath());
  arc.setAttribute("class", "bcast-gauge-arc");
  const head = svg("path");
  head.setAttribute("d", gaugeChevronPath(GAUGE_ARC_START_DEG));
  head.setAttribute("class", "bcast-chevron is-head");
  const tail = svg("path");
  tail.setAttribute("d", gaugeChevronPath(GAUGE_ARC_END_DEG));
  tail.setAttribute("class", "bcast-chevron");
  root.append(arc, head, tail);
}

/** Same open arc, drawn over the engine rose. `pathLength` makes the dash a percent. */
function fuelArc(): SVGPathElement {
  const fuel = svg("path");
  fuel.setAttribute("d", gaugeArcPath());
  fuel.setAttribute("pathLength", "100");
  fuel.setAttribute("class", "bcast-fuel");
  return fuel as SVGPathElement;
}

function buildAttitude(root: SVGSVGElement): SVGGElement {
  const existing = root.querySelector<SVGGElement>("#bcast-rocket");
  if (existing) return existing;
  const ring = svg("circle");
  ring.setAttribute("cx", "50");
  ring.setAttribute("cy", "50");
  ring.setAttribute("r", String(GAUGE_R));
  ring.setAttribute("class", "bcast-ring");
  const cross = svg("path");
  cross.setAttribute("d", "M50 8 V92 M8 50 H92 M50 50 m-28 0 a28 18 0 1 0 56 0 a28 18 0 1 0 -56 0");
  cross.setAttribute("class", "bcast-cross");
  const north = svg("text");
  north.setAttribute("x", "50");
  north.setAttribute("y", "20");
  north.setAttribute("text-anchor", "middle");
  north.setAttribute("class", "bcast-n");
  north.textContent = "N";
  const rocket = svg("g");
  rocket.setAttribute("id", "bcast-rocket");
  const body = svg("path");
  body.setAttribute("d", "M50 18 L57 46 L53 44 L53 68 L58 74 L50 66 L42 74 L47 68 L47 44 L43 46 Z");
  body.setAttribute("class", "bcast-rocket");
  rocket.append(body);
  root.append(ring, cross, north, rocket);
  return rocket as SVGGElement;
}

function nearestSample(samples: readonly ReadonlySample[], t: number): ReadonlySample | null {
  if (samples.length === 0) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  const cur = samples[lo]!;
  const prev = samples[lo - 1];
  if (prev && Math.abs(prev.t - t) < Math.abs(cur.t - t)) return prev;
  return cur;
}

function tiltAt(
  samples: readonly ReadonlySample[],
  t: number,
  epoch: EphemerisEpoch,
): number {
  const sample = nearestSample(samples, t);
  if (!sample) return 0;
  const bodies = bodyPositions(sample.t, epoch);
  enuAtPosition(sample.t, sample.pos, bodies.earth, _up, _east, _north);
  groundRelativeVelocity(sample.pos, sample.vel, bodies.earth, bodies.earthVel, _rel);
  const vert = dot(_rel, _up);
  const horiz = Math.hypot(
    _rel.x - _up.x * vert,
    _rel.y - _up.y * vert,
    _rel.z - _up.z * vert,
  );
  return velocityTiltDeg(vert, horiz);
}

function ensureNodes(): Nodes | null {
  if (nodes) return nodes;
  const engines = document.getElementById("bcast-engines");
  const attitude = document.getElementById("bcast-attitude");
  const speedRing = document.getElementById("bcast-speed-ring");
  const altRing = document.getElementById("bcast-alt-ring");
  const timeline = document.getElementById("bcast-timeline");
  const sign = document.getElementById("bcast-sign");
  const time = document.getElementById("bcast-time");
  const caption = document.getElementById("bcast-caption");
  const speed = document.getElementById("bcast-speed");
  const alt = document.getElementById("bcast-alt");
  const altUnit = document.getElementById("bcast-alt-unit");
  if (
    !(engines instanceof SVGSVGElement) ||
    !(attitude instanceof SVGSVGElement) ||
    !(speedRing instanceof SVGSVGElement) ||
    !(altRing instanceof SVGSVGElement) ||
    !timeline || !sign || !time || !caption || !speed || !alt || !altUnit
  ) {
    return null;
  }
  appendGauge(speedRing);
  appendGauge(altRing);
  const rocket = buildAttitude(attitude);
  nodes = {
    engines, rocket, dots: [], fuel: null, cluster: "",
    timeline, sign, time, caption, speed, alt, altUnit,
  };
  return nodes;
}

const ENGINE_DOT_SCALE = 33;

function paintEngines(
  gfx: Nodes,
  dots: readonly EngineDot[],
  cluster: string,
  fuel: number,
): void {
  if (gfx.cluster !== cluster || gfx.dots.length !== dots.length) {
    const inner = svg("circle");
    inner.setAttribute("cx", "50");
    inner.setAttribute("cy", "50");
    inner.setAttribute("r", "40");
    inner.setAttribute("class", "bcast-ring bcast-ring-inner");
    const circles = dots.map((d) => {
      const c = svg("circle");
      c.setAttribute("cx", String(50 + d.x * ENGINE_DOT_SCALE));
      c.setAttribute("cy", String(50 + d.y * ENGINE_DOT_SCALE));
      c.setAttribute("r", "2.45");
      c.setAttribute("class", d.lit ? "bcast-dot is-lit" : "bcast-dot");
      return c;
    });
    const track = svg("path");
    track.setAttribute("d", gaugeArcPath());
    track.setAttribute("class", "bcast-gauge-arc");
    const fuelPath = fuelArc();
    const head = svg("path");
    head.setAttribute("d", gaugeChevronPath(GAUGE_ARC_START_DEG));
    head.setAttribute("class", "bcast-chevron is-head");
    const tail = svg("path");
    tail.setAttribute("d", gaugeChevronPath(GAUGE_ARC_END_DEG));
    tail.setAttribute("class", "bcast-chevron");
    gfx.engines.replaceChildren(inner, ...circles, track, fuelPath, head, tail);
    gfx.dots = circles;
    gfx.fuel = fuelPath;
    gfx.cluster = cluster;
  } else {
    gfx.dots.forEach((node, i) => node.classList.toggle("is-lit", dots[i]?.lit === true));
  }
  if (gfx.fuel) {
    gfx.fuel.setAttribute("stroke-dasharray", gaugeFuelDasharray(fuel));
    gfx.fuel.setAttribute("visibility", fuel <= 0.004 ? "hidden" : "visible");
  }
}

function markerNode(m: BroadcastHudModel["markers"][number]): HTMLElement {
  const el = document.createElement("div");
  el.className = `bcast-mark${m.passed ? " is-passed" : ""}${m.above ? " is-above" : " is-below"}`;
  el.style.left = `${m.u * 100}%`;
  const label = document.createElement("span");
  label.className = "bcast-mark-label";
  label.textContent = m.label;
  const dot = document.createElement("span");
  dot.className = "bcast-mark-dot";
  el.append(label, dot);
  return el;
}

function paintTimeline(timeline: HTMLElement, model: BroadcastHudModel): void {
  const key = model.markers.map((m) => `${m.id}:${m.u.toFixed(3)}:${m.above ? "a" : "b"}`).join("|");
  if (timeline.dataset.key !== key) {
    timeline.dataset.key = key;
    const head = document.createElement("span");
    head.className = "bcast-playhead";
    head.style.left = `${model.playheadU * 100}%`;
    timeline.replaceChildren(...model.markers.map(markerNode), head);
    return;
  }
  const head = timeline.querySelector<HTMLElement>(".bcast-playhead");
  if (head) head.style.left = `${model.playheadU * 100}%`;
  const marks = timeline.querySelectorAll<HTMLElement>(".bcast-mark");
  model.markers.forEach((m, i) => marks[i]?.classList.toggle("is-passed", m.passed));
}

function paint(gfx: Nodes, model: BroadcastHudModel): void {
  const cluster = model.engines.length > 10 ? "booster" : "ship";
  paintEngines(gfx, model.engines, cluster, model.fuel);
  gfx.rocket.setAttribute("transform", `rotate(${model.tiltDeg.toFixed(1)} 50 50)`);
  paintTimeline(gfx.timeline, model);
  gfx.sign.textContent = model.clockSign;
  gfx.time.textContent = model.clockBody;
  gfx.caption.textContent = model.caption;
  gfx.speed.textContent = model.speed;
  gfx.speed.classList.toggle("is-long", model.speed.length >= 5);
  gfx.alt.textContent = model.altitude;
  gfx.alt.classList.toggle("is-long", model.altitude.length >= 4);
  gfx.altUnit.textContent = model.altitudeUnit;
  const clock = gfx.time.parentElement;
  if (clock) clock.setAttribute("aria-label", `${model.clockSign} ${model.clockBody}`);
}

/** Update the webcast bar. No-op while Auto-cam is off (side rails stay up). */
export function applyBroadcastHud(rt: HudRuntime, tel: Telemetry): void {
  if (!rt.flags.autoCamEnabled) return;
  const gfx = ensureNodes();
  if (!gfx) return;
  paint(gfx, buildBroadcastHud({
    t: tel.t,
    speedKmS: tel.speed,
    altKm: tel.altitude,
    events: rt.data.timeline.events,
    staged: tel.staged,
    lit: tel.burning || tel.thrustN > 0,
    fuel: tel.staged ? tel.fuelShip : tel.fuelBooster,
    tiltDeg: tiltAt(rt.data.samples, tel.t, rt.data.epoch),
  }));
}
