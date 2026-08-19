/**
 * Earth / Moon / Sun scene graph (facade + placement).
 */

import type * as THREE from "three";
import { R_EARTH, R_MOON } from "../physics/constants";
import { bodyPositions } from "../physics/bodies";
import type { EphemerisEpoch } from "../physics/ephemerisEpoch";
import { DEFAULT_EPHEMERIS } from "../physics/ephemerisEpoch";
import { earthSpinAngle } from "../physics/earthFrame";
import { updateEarthAtmosphere } from "./earthAtmosphere";
import { createLocatorSprite } from "./craft";
import { createNameLabel } from "./zoomLabels";
import { buildEarthBundle } from "./earthBody";
import { buildMoonBundle, orientMoonAxis } from "./moonBody";
import { createSun } from "./sunBody";
import type { Bodies } from "./bodiesShared";

export type { Bodies } from "./bodiesShared";

const BODY_LABEL_OPTS = {
  targetPx: 18,
  aspect: 256 / 64,
} as const;

/** Name plate floating outside a body disc. */
function addBodyNameLabel(
  group: THREE.Group,
  text: string,
  color: string,
  minH: number,
  z: number,
): void {
  const label = createNameLabel(text, color, { ...BODY_LABEL_OPTS, minH });
  label.position.set(0, 0, z);
  group.add(label);
}

/** Earth far locator + name label. */
function addEarthLocatorLabel(earthGroup: THREE.Group): THREE.Sprite {
  const earthLocator = createLocatorSprite(
    "#22c55e",
    "34, 197, 94",
    "earth-locator",
  );
  earthGroup.add(earthLocator);
  addBodyNameLabel(earthGroup, "EARTH", "#7ec8ff", 80, R_EARTH * 1.18);
  return earthLocator;
}

/** Moon far locator + name label. */
function addMoonLocatorLabel(moonGroup: THREE.Group): THREE.Sprite {
  const moonLocator = createLocatorSprite(
    "#93c5fd",
    "147, 197, 253",
    "moon-locator",
  );
  moonGroup.add(moonLocator);
  addBodyNameLabel(moonGroup, "MOON", "#c8d4e8", 25, R_MOON * 1.35);
  return moonLocator;
}

/** Earth-side fields of the Bodies record. */
function earthBodyFields(
  earth: ReturnType<typeof buildEarthBundle>,
  earthLocator: THREE.Sprite,
): Pick<
  Bodies,
  "earth" | "earthGroup" | "earthAtmo" | "leoClouds" | "earthLocator"
> {
  return {
    earth: earth.earth,
    earthGroup: earth.earthGroup,
    earthAtmo: earth.earthAtmo,
    leoClouds: earth.leoClouds,
    earthLocator,
  };
}

/** Moon + sun fields of the Bodies record. */
function moonSunBodyFields(
  moon: ReturnType<typeof buildMoonBundle>,
  sun: { sun: THREE.Mesh; sunGroup: THREE.Group },
  moonLocator: THREE.Sprite,
): Pick<Bodies, "moon" | "moonAxis" | "moonGroup" | "sun" | "sunGroup" | "moonLocator"> {
  return {
    moon: moon.moon,
    moonAxis: moon.moonAxis,
    moonGroup: moon.moonGroup,
    sun: sun.sun,
    sunGroup: sun.sunGroup,
    moonLocator,
  };
}

/** Pack assembled meshes into a Bodies record. */
function packBodies(
  earth: ReturnType<typeof buildEarthBundle>,
  moon: ReturnType<typeof buildMoonBundle>,
  sun: { sun: THREE.Mesh; sunGroup: THREE.Group },
  earthLocator: THREE.Sprite,
  moonLocator: THREE.Sprite,
): Bodies {
  return {
    ...earthBodyFields(earth, earthLocator),
    ...moonSunBodyFields(moon, sun, moonLocator),
  };
}

export function createBodies(): Bodies {
  const earth = buildEarthBundle();
  const moon = buildMoonBundle();
  const sun = createSun();
  const earthLocator = addEarthLocatorLabel(earth.earthGroup);
  const moonLocator = addMoonLocatorLabel(moon.moonGroup);
  const bodies = packBodies(earth, moon, sun, earthLocator, moonLocator);
  updateBodies(0, bodies);
  return bodies;
}
/** Unit Earth→Sun direction from body positions. */
function earthToSunUnit(b: {
  sun: { x: number; y: number; z: number };
  earth: { x: number; y: number; z: number };
}): { x: number; y: number; z: number } {
  const sx = b.sun.x - b.earth.x;
  const sy = b.sun.y - b.earth.y;
  const sz = b.sun.z - b.earth.z;
  const slen = Math.hypot(sx, sy, sz) || 1;
  return { x: sx / slen, y: sy / slen, z: sz / slen };
}

/** Place body groups from ephemeris sample. */
function placeBodyGroups(
  bodies: Bodies,
  b: ReturnType<typeof bodyPositions>,
): void {
  bodies.earthGroup.position.set(b.earth.x, b.earth.y, b.earth.z);
  bodies.moonGroup.position.set(b.moon.x, b.moon.y, b.moon.z);
  bodies.sunGroup.position.set(b.sun.x, b.sun.y, b.sun.z);
}

/** Apply Earth spin (clouds drift slightly; glitter stays ocean-locked). */
function spinEarthSurface(bodies: Bodies, spin: number): void {
  bodies.earth.rotation.y = spin;
  bodies.leoClouds.group.rotation.y = spin;
  bodies.leoClouds.clouds.rotation.y = spin * 0.03 + 0.35;
}

export function updateBodies(
  t: number,
  bodies: Bodies,
  epoch: EphemerisEpoch = DEFAULT_EPHEMERIS,
): void {
  const b = bodyPositions(t, epoch);
  placeBodyGroups(bodies, b);
  spinEarthSurface(bodies, earthSpinAngle(t, epoch));
  orientMoonAxis(bodies.moonAxis, b.moon, b.earth);
  updateEarthAtmosphere(bodies.earthAtmo, earthToSunUnit(b));
}

/** Visual spin for the Sun only (Earth/Moon driven by mission time). */
export function spinBodies(bodies: Bodies, dt: number): void {
  bodies.sun.rotation.y += dt * 2.9e-6;
}
