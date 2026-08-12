/**
 * Visual V5 cinema pure helpers (exposure, bloom, shadows, brownout, stars).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  altitudeFade,
  atmosphereBrownout,
  cameraAltitudeEarthKm,
  cinemaBloomStrength,
  cinemaBloomThreshold,
  cinemaExposure,
  EXPOSURE_LEO,
  EXPOSURE_PAD,
  EXPOSURE_SPACE,
  markPadShadowMeshes,
  shadowHalfExtentKm,
  shadowsActive,
  SHADOW_FADE_ALT_KM,
  starDomeOpacity,
} from "./cinema.ts";
import { R_EARTH } from "../physics/constants.ts";

describe("altitudeFade", () => {
  it("is 1 below full and 0 above fade", () => {
    assert.equal(altitudeFade(0, 10, 50), 1);
    assert.equal(altitudeFade(10, 10, 50), 1);
    assert.equal(altitudeFade(50, 10, 50), 0);
    assert.equal(altitudeFade(100, 10, 50), 0);
  });

  it("is mid-range between full and fade", () => {
    const mid = altitudeFade(30, 10, 50);
    assert.ok(mid > 0.2 && mid < 0.8);
  });

  it("handles non-finite as 0", () => {
    assert.equal(altitudeFade(Number.NaN, 0, 1), 0);
  });
});

describe("cinemaExposure", () => {
  it("is brightest on the pad", () => {
    assert.ok(Math.abs(cinemaExposure(0) - EXPOSURE_PAD) < 0.02);
    assert.ok(cinemaExposure(0) > cinemaExposure(200));
  });

  it("approaches space exposure at high altitude", () => {
    assert.ok(Math.abs(cinemaExposure(50_000) - EXPOSURE_SPACE) < 0.02);
  });

  it("is near LEO mid exposure around a few hundred km", () => {
    const e = cinemaExposure(250);
    assert.ok(e > EXPOSURE_SPACE && e < EXPOSURE_PAD);
    assert.ok(Math.abs(e - EXPOSURE_LEO) < 0.08);
  });
});

describe("cinemaBloom", () => {
  it("strength is mild and higher when burning near pad", () => {
    const idle = cinemaBloomStrength(2, false);
    const burn = cinemaBloomStrength(2, true);
    assert.ok(idle > 0.15 && idle < 0.5);
    assert.ok(burn > idle);
  });

  it("threshold stays high so only bright cores bloom", () => {
    assert.ok(cinemaBloomThreshold(5) > 0.75);
    assert.ok(cinemaBloomThreshold(10_000) > cinemaBloomThreshold(5));
  });
});

describe("starDomeOpacity", () => {
  it("is lower near the pad than in space", () => {
    assert.ok(starDomeOpacity(1) < starDomeOpacity(500));
  });

  it("dims further under brownout", () => {
    assert.ok(starDomeOpacity(50, 0.8) < starDomeOpacity(50, 0));
  });
});

describe("atmosphereBrownout", () => {
  it("is zero on launch / coast without plasma", () => {
    assert.equal(atmosphereBrownout("launch", 10), 0);
    assert.equal(atmosphereBrownout("coast", 200), 0);
  });

  it("tracks plasma strength when provided", () => {
    assert.ok(atmosphereBrownout("entry", 60, 0.8) > 0.5);
    assert.equal(atmosphereBrownout("entry", 60, 0), atmosphereBrownout("entry", 60));
  });

  it("has a mid-entry band without plasma", () => {
    const mid = atmosphereBrownout("entry", 50);
    assert.ok(mid > 0.1 && mid <= 1);
    assert.equal(atmosphereBrownout("entry", 200), 0);
  });
});

describe("shadow helpers", () => {
  it("is active only at low altitude", () => {
    assert.equal(shadowsActive(5), true);
    assert.equal(shadowsActive(SHADOW_FADE_ALT_KM + 10), false);
  });

  it("widens half-extent with altitude", () => {
    assert.ok(shadowHalfExtentKm(1) < shadowHalfExtentKm(20));
    assert.ok(shadowHalfExtentKm(0) > 0.1);
  });
});

describe("cameraAltitudeEarthKm", () => {
  it("returns altitude above R_EARTH", () => {
    const earth = { x: 0, y: 0, z: 0 };
    const cam = { x: R_EARTH + 10, y: 0, z: 0 };
    assert.ok(Math.abs(cameraAltitudeEarthKm(cam, earth) - 10) < 1e-9);
  });
});

describe("markPadShadowMeshes", () => {
  it("keeps hardstand receiving; large scrub discs neither cast nor receive", () => {
    const pad = new THREE.Group();
    pad.name = "starbase-pad";

    const scrub = new THREE.Mesh(
      new THREE.CircleGeometry(1, 8),
      new THREE.MeshStandardMaterial(),
    );
    scrub.name = "pad-landmark-scrub";
    pad.add(scrub);

    const terrain = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 8),
      new THREE.MeshStandardMaterial(),
    );
    terrain.name = "pad-scrub-terrain";
    pad.add(terrain);

    const plate = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 8, 8),
      new THREE.MeshStandardMaterial(),
    );
    plate.name = "pad-satellite-plate";
    pad.add(plate);

    const tower = new THREE.Group();
    tower.name = "mechazilla";
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.2, 0.02),
      new THREE.MeshStandardMaterial(),
    );
    tower.add(shaft);
    pad.add(tower);

    const surroundings = new THREE.Group();
    surroundings.name = "pad-surroundings";
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.002, 0.2),
      new THREE.MeshStandardMaterial(),
    );
    surroundings.add(slab);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 8),
      new THREE.MeshStandardMaterial(),
    );
    surroundings.add(disc);
    pad.add(surroundings);

    markPadShadowMeshes(pad);

    assert.equal(scrub.receiveShadow, false);
    assert.equal(scrub.castShadow, false);
    assert.equal(terrain.receiveShadow, false);
    assert.equal(terrain.castShadow, false);
    assert.equal(plate.receiveShadow, false);
    assert.equal(plate.castShadow, false);
    assert.equal(slab.receiveShadow, true);
    assert.equal(slab.castShadow, false);
    assert.equal(disc.receiveShadow, false);
    assert.equal(disc.castShadow, false);
    assert.equal(shaft.castShadow, true);
    assert.equal(shaft.receiveShadow, true);
  });
});
