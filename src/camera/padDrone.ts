/**
 * Launchpad Drone flight path (pure).
 *
 * The Flight 13 webcast drone does not hover in one place: it holds the wide
 * T− tableau south of the OLM, repositions while the broadcast is on other
 * cameras, and is perched high above the pad by T+8 — looking straight down
 * at the stack, then tilting up as Super Heavy climbs past it
 * (`tplus-000008-liftoff-aerial.jpg` → `tplus-000017-ascent-plume-sky.jpg`).
 *
 * Keyframes are **pad-local km**: `+X` west, `+Y` up, `+Z` north (the frame
 * `placePadOnEarth` seats on Earth). Poses are a pure function of mission
 * time so scrubbing is deterministic.
 *
 * @see webcastShotPoses.ts — the T− hover this path starts from
 * @see assets/flight13-webcast/README.md — still catalog
 */

import { TOWER_H, TOWER_OX, TOWER_OZ } from "../scene/earthTheater/mechazillaDims";
import { padAerialFromOlp2 } from "../scene/earthTheater/starbaseSurvey";
import {
  PAD_AERIAL_EL_DEG,
  PAD_AERIAL_LOOK_NORTH_KM,
  PAD_AERIAL_LOOK_UP_KM,
  PAD_AERIAL_LOOK_WEST_KM,
} from "./webcastShotPoses";

/** What the lens is pointed at during a leg of the flight. */
export type PadDroneAim = "tower" | "craft";

/** Pad-local eye (km) plus the aim for one keyframe. */
export type PadDroneKey = Readonly<{
  /** Mission time (s); negative = countdown. */
  t: number;
  /** Pad-local west (km). */
  west: number;
  /** Height above the OLM deck (km). */
  up: number;
  /** Pad-local north (km). */
  north: number;
  aim: PadDroneAim;
}>;

/** Interpolated drone pose at a mission time. */
export type PadDronePose = Readonly<{
  west: number;
  up: number;
  north: number;
  aim: PadDroneAim;
}>;

/** Hover height (km) that puts the T− nadir on the surveyed drone pin. */
function hoverUpKm(): number {
  const horiz = Math.hypot(
    padAerialFromOlp2.x - PAD_AERIAL_LOOK_WEST_KM,
    padAerialFromOlp2.z - PAD_AERIAL_LOOK_NORTH_KM,
  );
  return PAD_AERIAL_LOOK_UP_KM + horiz * Math.tan((PAD_AERIAL_EL_DEG * Math.PI) / 180);
}

/** T− tableau: ~164 m south of the OLM, looking NNW at Mechazilla mid-truss. */
export const PAD_DRONE_HOVER: PadDroneKey = Object.freeze({
  t: -300,
  west: padAerialFromOlp2.x,
  up: hoverUpKm(),
  north: padAerialFromOlp2.z,
  aim: "tower",
});

/**
 * Liftoff perch: ~120 m south of the OLM at ~600 m. The lens is near-nadir on
 * the stack at T+8 (`tplus-000008-liftoff-aerial.jpg`), still looking down at
 * T+12, and level with it around T+16 where the stills tilt up past the
 * coastline (`tplus-000016-ascent-plume-coast.jpg`). Height is set from the
 * theater ascent profile, which climbs a little faster than the webcast HUD.
 */
export const PAD_DRONE_PERCH_UP_KM = 0.6;
/** South offset of the perch (km) — off the plume column, stack in frame. */
export const PAD_DRONE_PERCH_NORTH_KM = -0.12;

/**
 * Drone legs. Between T−45 and T+6 the broadcast is on Ground Camera One and
 * the pad tracker, so the transit up to the perch is off air. After the
 * ascent hand-off the drone sinks back to the establishing hover.
 */
export const PAD_DRONE_KEYS: readonly PadDroneKey[] = Object.freeze([
  PAD_DRONE_HOVER,
  { ...PAD_DRONE_HOVER, t: -45 },
  // Climbing out of the tableau toward the pad, already on the stack.
  {
    t: -6,
    west: padAerialFromOlp2.x * 0.5,
    up: (hoverUpKm() + PAD_DRONE_PERCH_UP_KM) * 0.5,
    north: (padAerialFromOlp2.z + PAD_DRONE_PERCH_NORTH_KM) * 0.5,
    aim: "craft",
  },
  {
    t: 6,
    west: 0,
    up: PAD_DRONE_PERCH_UP_KM,
    north: PAD_DRONE_PERCH_NORTH_KM,
    aim: "craft",
  },
  // Easing up and away while the stack climbs past the lens.
  {
    t: 24,
    west: 0,
    up: PAD_DRONE_PERCH_UP_KM + 0.04,
    north: PAD_DRONE_PERCH_NORTH_KM - 0.025,
    aim: "craft",
  },
  { ...PAD_DRONE_HOVER, t: 120 },
]);

/** Farthest the drone will chase the stack (km) before it re-frames the pad. */
export const PAD_DRONE_TRACK_MAX_KM = 6;

/** Smoothstep so leg joins have no velocity step. */
function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
}

/**
 * Drone pose at mission time `t` (s). Holds the first / last keyframe
 * outside the path. Aim comes from the leg that is starting (step), position
 * eases between legs.
 */
export function padDronePoseAt(t: number): PadDronePose {
  const keys = PAD_DRONE_KEYS;
  const first = keys[0]!;
  if (!Number.isFinite(t) || t <= first.t) return freezePose(first);
  const last = keys[keys.length - 1]!;
  if (t >= last.t) return freezePose(last);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]!;
    if (t > b.t) continue;
    const a = keys[i - 1]!;
    const u = ease((t - a.t) / (b.t - a.t));
    return Object.freeze({
      west: a.west + (b.west - a.west) * u,
      up: a.up + (b.up - a.up) * u,
      north: a.north + (b.north - a.north) * u,
      aim: a.aim,
    });
  }
  return freezePose(last);
}

function freezePose(k: PadDroneKey): PadDronePose {
  return Object.freeze({ west: k.west, up: k.up, north: k.north, aim: k.aim });
}

/**
 * True when the drone should look at the craft rather than the tower.
 * Past {@link PAD_DRONE_TRACK_MAX_KM} the stack is a dot in the sky, so a
 * late rail pick re-frames Mechazilla instead of staring at empty sky.
 *
 * @param aim - Leg aim from {@link padDronePoseAt}
 * @param craftDistKm - Craft distance from the pad (km)
 */
export function padDroneTracksCraft(aim: PadDroneAim, craftDistKm: number): boolean {
  if (aim !== "craft") return false;
  return Number.isFinite(craftDistKm) && craftDistKm <= PAD_DRONE_TRACK_MAX_KM;
}

/** Pad-local look-at when the drone frames the launch complex (km). */
export const PAD_DRONE_TOWER_LOOK = Object.freeze({
  west: TOWER_OX,
  up: TOWER_H * 0.5,
  north: TOWER_OZ,
});

type V3 = { x: number; y: number; z: number };

function dot(a: V3, b: V3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function rejectFrom(v: V3, dirUnit: V3): V3 {
  const k = dot(v, dirUnit);
  return { x: v.x - dirUnit.x * k, y: v.y - dirUnit.y * k, z: v.z - dirUnit.z * k };
}

function normalizeOrNull(v: V3): V3 | null {
  const len = Math.hypot(v.x, v.y, v.z);
  if (!(len > 1e-9)) return null;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Screen-up axis for a camera looking along `dirUnit` with local vertical
 * `up`. The component of `up` across the view stays continuous as the lens
 * tilts through the zenith — a bare `up` degenerates the moment the stack
 * passes straight overhead, which flips the drone frame on its side.
 *
 * @param dirUnit - Unit eye → look-at direction
 * @param up - Local vertical (pad surface normal)
 * @param fallback - Horizontal axis used when the view is vertical (north)
 */
export function padDroneUpAxis(dirUnit: V3, up: V3, fallback: V3): V3 {
  return (
    normalizeOrNull(rejectFrom(up, dirUnit)) ??
    normalizeOrNull(rejectFrom(fallback, dirUnit)) ??
    up
  );
}
