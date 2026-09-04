import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { earthNorthPole } from "../physics/earthFrame.ts";
import {
  COMPASS_CSS_IDENTITY,
  COMPASS_MAX_TILT_DEG,
  cameraCompassBasis,
  compassCssMatrix3d,
  earthEnuAt,
} from "./hudCameraCompass.ts";

const earth = { x: 0, y: 0, z: 0 };
const cam = { x: 10_000, y: 0, z: 0 };

function col(
  basis: NonNullable<ReturnType<typeof cameraCompassBasis>>,
  i: 0 | 1 | 2,
) {
  const m = basis.columns;
  return { x: m[i * 3]!, y: m[i * 3 + 1]!, z: m[i * 3 + 2]! };
}

function hypot3(v: { x: number; y: number; z: number }): number {
  return Math.hypot(v.x, v.y, v.z);
}

describe("earthEnuAt", () => {
  it("puts up along the Earth radial and north toward the pole", () => {
    const enu = earthEnuAt(cam, earth);
    assert.ok(enu);
    assert.ok(Math.abs(enu!.up.x - 1) < 1e-9);
    const pole = earthNorthPole();
    assert.ok(Math.abs(enu!.north.x - pole.x) < 1e-6);
    assert.ok(Math.abs(enu!.north.y - pole.y) < 1e-6);
    assert.ok(Math.abs(enu!.north.z - pole.z) < 1e-6);
  });

  it("is null at Earth's center and when inputs are missing", () => {
    assert.equal(earthEnuAt(earth, earth), null);
    assert.equal(earthEnuAt(null, earth), null);
    assert.equal(earthEnuAt(cam, null), null);
  });
});

describe("cameraCompassBasis", () => {
  it("is face-on when looking nadir (local up toward the viewer)", () => {
    const look = { x: -1, y: 0, z: 0 };
    const basis = cameraCompassBasis(look, cam, earth, { x: 0, y: 1, z: 0 });
    assert.ok(basis);
    const up = col(basis!, 2);
    assert.ok(Math.abs(up.x) < 1e-6, `up.x=${up.x}`);
    assert.ok(Math.abs(up.y) < 1e-6, `up.y=${up.y}`);
    assert.ok(Math.abs(up.z - 1) < 1e-6, `up.z=${up.z}`);
    assert.ok(Math.abs(hypot3(col(basis!, 0)) - 1) < 1e-6);
    assert.ok(Math.abs(hypot3(col(basis!, 1)) - 1) < 1e-6);
  });

  it("puts N toward the pole on screen when looking nadir", () => {
    const look = { x: -1, y: 0, z: 0 };
    const basis = cameraCompassBasis(look, cam, earth, { x: 0, y: 1, z: 0 });
    assert.ok(basis);
    const south = col(basis!, 1);
    const towardN = { x: -south.x, y: -south.y, z: -south.z };
    assert.ok(towardN.x < -0.5, `N x=${towardN.x} (pole is screen-left from +X)`);
    assert.ok(towardN.y < 0, `N y=${towardN.y} (CSS up is negative Y)`);
    assert.ok(Math.abs(towardN.z) < 1e-6);
  });

  it("tilts the far edge away when looking north along the horizon", () => {
    const enu = earthEnuAt(cam, earth)!;
    const basis = cameraCompassBasis(enu.north, cam, earth, enu.up);
    assert.ok(basis);
    const up = col(basis!, 2);
    const maxRad = (COMPASS_MAX_TILT_DEG * Math.PI) / 180;
    assert.ok(Math.abs(up.x) < 1e-5, `up.x=${up.x}`);
    assert.ok(up.y < -0.7, `up.y=${up.y} (normal should lean screen-up)`);
    assert.ok(
      Math.abs(up.z - Math.cos(maxRad)) < 1e-5,
      `up.z=${up.z} expected ${Math.cos(maxRad)}`,
    );
    assert.ok(
      Math.abs(Math.hypot(up.y, up.z) - 1) < 1e-5,
      "tilt stays in the north/up plane",
    );
  });

  it("does not go fully edge-on at the horizon", () => {
    const enu = earthEnuAt(cam, earth)!;
    const basis = cameraCompassBasis(enu.east, cam, earth, enu.up);
    assert.ok(basis);
    const up = col(basis!, 2);
    const minZ = Math.cos((COMPASS_MAX_TILT_DEG * Math.PI) / 180);
    assert.ok(up.z >= minZ - 1e-5, `up.z=${up.z} < ${minZ}`);
  });

  it("is null when the eye sits on Earth's center", () => {
    assert.equal(
      cameraCompassBasis({ x: 0, y: 1, z: 0 }, earth, earth, { x: 0, y: 0, z: 1 }),
      null,
    );
  });
});

describe("compassCssMatrix3d", () => {
  it("writes the face-on identity when the basis is missing", () => {
    assert.equal(compassCssMatrix3d(null), COMPASS_CSS_IDENTITY);
  });

  it("writes a matrix3d from the 3×3 columns", () => {
    const look = { x: -1, y: 0, z: 0 };
    const basis = cameraCompassBasis(look, cam, earth, { x: 0, y: 1, z: 0 });
    const css = compassCssMatrix3d(basis);
    assert.match(css, /^matrix3d\(/);
    assert.match(css, /1\)$/);
  });
});
