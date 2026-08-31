/**
 * Unit tests for Flight 13 mission integration.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARTH_SPIN_RATE,
  earthNorthPole,
  enuAtPosition,
  inertialRelToMeshLocal,
  sunElevAtGeodetic,
} from "./earthFrame.ts";
import { makeFlight13Epoch } from "./flight13Epoch.ts";
import { altitudeEarth, getBodies } from "./integrator.ts";
import { R_EARTH, STARBASE_LON } from "./constants.ts";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LAT_DEG,
  FLIGHT13_SPLASH_LON_DEG,
} from "./flight13Corridor.ts";
import { F13, firstSplashdownT, runFlight13Mission } from "./flight13Mission.ts";
import { cross, dot, len, set, sub, v3 } from "./vec3.ts";

const _geoLocal = v3();

/** Geodetic lat/lon (deg) and radius from an inertial sample. */
function sampleGeodetic(
  t: number,
  pos: { x: number; y: number; z: number },
  epoch: ReturnType<typeof makeFlight13Epoch>,
): { lat: number; lon: number; r: number } {
  const b = getBodies(t, epoch);
  inertialRelToMeshLocal(
    v3(pos.x - b.earth.x, pos.y - b.earth.y, pos.z - b.earth.z),
    t,
    _geoLocal,
    epoch,
  );
  const r = len(_geoLocal) || 1;
  const lat = (Math.asin(Math.max(-1, Math.min(1, _geoLocal.y / r))) * 180) / Math.PI;
  let lon = ((Math.atan2(_geoLocal.z, -_geoLocal.x) - Math.PI) * 180) / Math.PI;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return { lat, lon, r };
}

/** Geodetic longitude (deg, east-positive) from an inertial sample position. */
function sampleLonDeg(
  t: number,
  pos: { x: number; y: number; z: number },
  epoch: ReturnType<typeof makeFlight13Epoch>,
): number {
  return sampleGeodetic(t, pos, epoch).lon;
}

function wrap180(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function gcKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a1 = (lat1 * Math.PI) / 180;
  const a2 = (lat2 * Math.PI) / 180;
  const dLat = a2 - a1;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a1) * Math.cos(a2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

function headingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

describe("runFlight13Mission", () => {
  const epoch = makeFlight13Epoch(0, 0);
  const result = runFlight13Mission({ epoch });
  const _tmp = v3();

  it("completes successfully with splashdown", () => {
    assert.equal(result.ok, true);
    assert.ok(result.samples.length > 100);
    assert.equal(result.samples[result.samples.length - 1]!.phase, "splashdown");
    // Natural early splash is OK (dynamics-driven); pack holds through T+1:10
    assert.ok(result.durationS > 35 * 60, `duration ${result.durationS}s too short`);
    assert.ok(
      Math.abs(result.durationS - F13.END) < 3,
      `duration ${result.durationS}s expected ~${F13.END}s (T+1:10)`,
    );
  });

  it("holds the floating ship on the ocean through T+1:10", () => {
    const splash0 = result.samples.find((s) => s.phase === "splashdown");
    assert.ok(splash0, "expected a splashdown sample");
    assert.ok(splash0!.t < F13.SPLASH + 30, `first splash ${splash0!.t}`);
    assert.ok(
      splash0!.t > F13.SPLASH - 45,
      `first splash ${splash0!.t} — expected near webcast T+1:05:21, not an early slam`,
    );
    assert.equal(firstSplashdownT(result.samples), splash0!.t);
    const last = result.samples[result.samples.length - 1]!;
    assert.equal(last.phase, "splashdown");
    const alt = altitudeEarth(last.t, last.pos, epoch);
    assert.ok(alt < 0.5, `float alt ${alt} km`);
    const lon = sampleLonDeg(last.t, last.pos, epoch);
    assert.ok(
      Math.abs(lon - FLIGHT13_SPLASH_LON_DEG) < 12,
      `float lon ${lon}° — expected Indian Ocean ~${FLIGHT13_SPLASH_LON_DEG}°E`,
    );
    const splashSamples = result.samples.filter((s) => s.phase === "splashdown");
    assert.ok(splashSamples.length > 20, `float samples ${splashSamples.length}`);
    assert.ok(last.t - splash0!.t > 200, `float hold ${last.t - splash0!.t}s`);
  });

  it("plays the landing sequence over the sunlit splash site", () => {
    const land = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - F13.LAND_BURN) < Math.abs(best.t - F13.LAND_BURN)
        ? cur
        : best,
    );
    const lon = sampleLonDeg(land.t, land.pos, epoch);
    assert.ok(
      Math.abs(lon - FLIGHT13_SPLASH_LON_DEG) < 12,
      `landing lon ${lon}° — expected splash site ~${FLIGHT13_SPLASH_LON_DEG}°E, not a night-side hover`,
    );
    const sun = sunElevAtGeodetic(
      land.t,
      FLIGHT13_SPLASH_LAT,
      (lon * Math.PI) / 180,
      epoch,
    );
    assert.ok(
      sun > 0,
      `landing should be in daylight, sin(el)=${sun.toFixed(3)}`,
    );
  });

  it("does not teleport onto the splash fix", () => {
    let maxLonJump = 0;
    for (let i = 1; i < result.samples.length; i++) {
      const a = result.samples[i - 1]!;
      const b = result.samples[i]!;
      if (a.t < F13.ENTRY) continue;
      let dLon = sampleLonDeg(b.t, b.pos, epoch) - sampleLonDeg(a.t, a.pos, epoch);
      while (dLon > 180) dLon -= 360;
      while (dLon < -180) dLon += 360;
      if (Math.abs(dLon) > maxLonJump) maxLonJump = Math.abs(dLon);
    }
    assert.ok(
      maxLonJump < 8,
      `max post-entry Δlon ${maxLonJump.toFixed(1)}° — expected a flyable arc, not a 30° seat`,
    );
  });

  it("splashes in the Indian Ocean near 19°S 107°E (WGS84 theater miss)", () => {
    const splash = result.samples.find((s) => s.phase === "splashdown");
    assert.ok(splash, "expected a splashdown sample");
    const g = sampleGeodetic(splash!.t, splash!.pos, epoch);
    const missKm = gcKm(
      g.lat,
      g.lon,
      FLIGHT13_SPLASH_LAT_DEG,
      FLIGHT13_SPLASH_LON_DEG,
    );
    assert.ok(
      missKm < 280,
      `splash ${g.lat.toFixed(2)}°, ${g.lon.toFixed(2)}° is ${missKm.toFixed(0)} km from ` +
        `${FLIGHT13_SPLASH_LAT_DEG}°, ${FLIGHT13_SPLASH_LON_DEG}°E — expected the IO zone NW of Australia`,
    );
    // Open ocean west of the WA coast (~114°E at this latitude), south of Christmas Island.
    assert.ok(g.lat < -15 && g.lat > -24, `splash lat ${g.lat}° — expected south IO, not 14°S`);
    assert.ok(g.lon > 100 && g.lon < 112, `splash lon ${g.lon}° — expected west of Australia`);
  });

  it("does not hook the ground track through a sharp landing-burn divert", () => {
    // Regression: landing burn used to yank ~500 km south (83° → 199° heading
    // in ~20 s) after a north-of-corridor overshoot. A belly bank is fine;
    // a right-angle hook on the Earth-fixed trail is not.
    // Heading uses a ~12 s chord so a slow-but-tight hook still shows up
    // (consecutive 0.15 s samples move metres and hide the turn).
    type Geo = { t: number; lat: number; lon: number; alt: number };
    const geos: Geo[] = [];
    for (const s of result.samples) {
      if (s.t < 45 * 60) continue;
      const g = sampleGeodetic(s.t, s.pos, epoch);
      geos.push({ t: s.t, lat: g.lat, lon: g.lon, alt: altitudeEarth(s.t, s.pos, epoch) });
    }
    function atLeast(tMin: number, from: number): Geo | null {
      for (let j = from; j < geos.length; j++) {
        if (geos[j]!.t >= tMin) return geos[j]!;
      }
      return null;
    }
    let maxDHead = 0;
    let atT = 0;
    for (let i = 0; i < geos.length; i++) {
      const a = geos[i]!;
      const b = atLeast(a.t + 10, i);
      const c = atLeast(a.t + 20, i);
      if (!b || !c) continue;
      const d = atLeast(c.t + 10, i);
      if (!d) continue;
      if (Math.min(a.alt, b.alt, c.alt, d.alt) < 1.2) continue;
      if (gcKm(a.lat, a.lon, b.lat, b.lon) < 4) continue;
      if (gcKm(c.lat, c.lon, d.lat, d.lon) < 4) continue;
      const h0 = headingDeg(a.lat, a.lon, b.lat, b.lon);
      const h1 = headingDeg(c.lat, c.lon, d.lat, d.lon);
      const dHead = Math.abs(wrap180(h1 - h0));
      if (dHead > maxDHead) {
        maxDHead = dHead;
        atT = a.t;
      }
    }
    assert.ok(
      maxDHead < 50,
      `ground-track heading changed ${maxDHead.toFixed(0)}° over ~20 s at T+${(atT / 60).toFixed(1)} ` +
        `— expected a smooth entry, not a landing-burn hook`,
    );
  });

  it("stages near the public hot-stage mark", () => {
    assert.ok(result.stageT != null);
    assert.ok(
      Math.abs((result.stageT as number) - F13.HOT_STAGE) < 15,
      `stageT ${result.stageT}`,
    );
  });

  it("follows launch → ascent → coast → entry → descent → splashdown", () => {
    const phases: string[] = [];
    for (const s of result.samples) {
      if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
    }
    assert.deepEqual(phases, [
      "launch",
      "ascent",
      "coast",
      "entry",
      "descent",
      "splashdown",
    ]);
  });

  it("stays suborbital (peak altitude tens–hundreds of km, not escape)", () => {
    let maxAlt = 0;
    for (const s of result.samples) {
      const a = altitudeEarth(s.t, s.pos, epoch);
      if (a > maxAlt) maxAlt = a;
    }
    assert.ok(maxAlt > 80, `maxAlt too low ${maxAlt}`);
    assert.ok(maxAlt < 2000, `maxAlt too high ${maxAlt}`);
    assert.ok(
      Number.isFinite(result.peakSpeedKmS) && (result.peakSpeedKmS ?? 0) > 20,
      `heliocentric peak ${result.peakSpeedKmS}`,
    );
  });

  it("burns on ascent and is coasting after SECO", () => {
    const early = result.samples.find((s) => s.t > 30 && s.t < 100);
    assert.ok(early?.burning);
    const coast = result.samples.find((s) => s.phase === "coast");
    assert.ok(coast);
    assert.equal(coast!.burning, false);
  });

  it("coasts at high altitude through mid-mission (not surface hover)", () => {
    const mid = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 1200) < Math.abs(best.t - 1200) ? cur : best,
    );
    const a = altitudeEarth(mid.t, mid.pos, epoch);
    assert.ok(a > 100, `mid-coast alt ${a} km — expected lofted suborbital`);
  });

  it("has a lofted free coast (no multi-minute surface skid before entry)", () => {
    // Count consecutive samples with alt < 3 km during coast — should be none
    let maxIdle = 0;
    let cur = 0;
    for (const s of result.samples) {
      if (s.phase !== "coast" && s.phase !== "entry") {
        maxIdle = Math.max(maxIdle, cur);
        cur = 0;
        continue;
      }
      const a = altitudeEarth(s.t, s.pos, epoch);
      const b = getBodies(s.t, epoch);
      sub(_tmp, s.vel, b.earthVel);
      if (a < 3 && len(_tmp) < 0.3) cur += 1;
      else {
        maxIdle = Math.max(maxIdle, cur);
        cur = 0;
      }
    }
    maxIdle = Math.max(maxIdle, cur);
    assert.ok(
      maxIdle < 40,
      `surface-idle streak ${maxIdle} samples — approach glide / hover regress`,
    );
  });

  it("fires an in-space relight demo near the public mark", () => {
    const relight = result.samples.filter(
      (s) =>
        s.burning &&
        s.t >= F13.RELIGHT - 1 &&
        s.t <= F13.RELIGHT_END + 2 &&
        s.thrustN > 1e3,
    );
    assert.ok(relight.length > 5, "expected relight burn samples");
  });

  it("fires a landing burn before splashdown", () => {
    const land = result.samples.find(
      (s) => s.phase === "descent" && s.burning && s.thrustN > 1e3,
    );
    assert.ok(land, "expected descent burn sample");
    // Public T+1:05:01; aero should have bled speed by then
    assert.ok(land!.t >= F13.LAND_BURN - 40, `land burn t=${land!.t}`);
  });

  it("SECO is near-circular at insert altitude (low radial rate)", () => {
    let seco = result.samples[0]!;
    for (const s of result.samples) {
      if (s.phase === "ascent" && s.burning) seco = s;
    }
    const a = altitudeEarth(seco.t, seco.pos, epoch);
    const b = getBodies(seco.t, epoch);
    sub(_tmp, seco.vel, b.earthVel);
    const v = len(_tmp);
    // Radial rate from pos·vel
    const rx = seco.pos.x - b.earth.x;
    const ry = seco.pos.y - b.earth.y;
    const rz = seco.pos.z - b.earth.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    const vr = (seco.vel.x - b.earthVel.x) * (rx / r) +
      (seco.vel.y - b.earthVel.y) * (ry / r) +
      (seco.vel.z - b.earthVel.z) * (rz / r);
    assert.ok(a > 120, `SECO alt ${a}`);
    assert.ok(v > 7.0 && v < 8.2, `SECO v ${v}`);
    assert.ok(Math.abs(vr) < 0.45, `SECO vr ${vr}`);
  });

  it("ascends eastward along the Flight 13 corridor (not west across the Pacific)", () => {
    // Regression: short geodetic path Starbase → Indian Ocean splash is westward; steering
    // must follow the Earth GC plane (Starbase → Gauteng → Indian Ocean) instead.
    const padLonDeg = (STARBASE_LON * 180) / Math.PI;
    const s = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 120) < Math.abs(best.t - 120) ? cur : best,
    );
    const lonAt120 = sampleLonDeg(s.t, s.pos, epoch);
    assert.ok(
      lonAt120 > padLonDeg + 0.15,
      `lon@~120s ${lonAt120}° — expected east of Starbase (Gulf), not Pacific`,
    );
    const s300 = result.samples.reduce((best, cur) =>
      Math.abs(cur.t - 300) < Math.abs(best.t - 300) ? cur : best,
    );
    const lonAt300 = sampleLonDeg(s300.t, s300.pos, epoch);
    assert.ok(
      lonAt300 > padLonDeg + 2,
      `lon@~300s ${lonAt300}° — expected further east over the Gulf`,
    );
    assert.ok(lonAt300 < 0, `lon@~300s ${lonAt300}° — still western hemisphere`);
  });

  it("liftoff stays near-vertical (no pad-frame west kick from surface clamp)", () => {
    // Regression: surfaceClamp used to damp vs Earth COM and strip ω×r,
    // injecting ~17 m/s ground-relative west and curving the pad trail sideways.
    const up = v3(), east = v3(), north = v3();
    const omega = v3(), rRel = v3(), vAtm = v3(), vRel = v3();
    earthNorthPole(omega);
    set(omega, omega.x * EARTH_SPIN_RATE, omega.y * EARTH_SPIN_RATE, omega.z * EARTH_SPIN_RATE);
    let maxAbsEast = 0;
    for (const s of result.samples) {
      if (s.t > 20) break;
      const b = getBodies(s.t, epoch);
      set(rRel, s.pos.x - b.earth.x, s.pos.y - b.earth.y, s.pos.z - b.earth.z);
      cross(vAtm, omega, rRel);
      set(
        vRel,
        s.vel.x - b.earthVel.x - vAtm.x,
        s.vel.y - b.earthVel.y - vAtm.y,
        s.vel.z - b.earthVel.z - vAtm.z,
      );
      enuAtPosition(s.t, s.pos, b.earth, up, east, north);
      maxAbsEast = Math.max(maxAbsEast, Math.abs(dot(vRel, east)));
    }
    assert.ok(
      maxAbsEast < 0.005,
      `early |v_east| ${maxAbsEast} km/s — expected near-zero before gravity turn`,
    );
  });
});
