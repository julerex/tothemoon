/**
 * Flight 13 ship + booster vs official webcast HUD (still pack).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  buildBoosterKeyframes,
  sampleBoosterRecovery,
} from "./boosterRecovery.ts";
import { groundRelativeSpeedKmS } from "./earthFrame.ts";
import { makeFlight13Epoch } from "./flight13Epoch.ts";
import { runFlight13Mission } from "./flight13Mission.ts";
import {
  FLIGHT13_WEBCAST_HUD,
  kmSToKmh,
  webcastShipHudAt,
} from "./flight13Webcast.ts";
import { altitudeEarth } from "./integrator.ts";
import { makeTrajectory, sampleAtTime } from "./trajectoryCache.ts";

describe("Flight 13 webcast HUD telemetry", () => {
  const epoch = makeFlight13Epoch(0, 0);
  const result = runFlight13Mission({ epoch });
  const traj = makeTrajectory(result);
  const stageT = traj.stageT ?? 141;
  const stageFrame = sampleAtTime(traj, stageT);
  const stage = { t: stageT, pos: stageFrame.pos, vel: stageFrame.vel };
  const kfs = buildBoosterKeyframes(stage, "gulf", traj.epoch);

  it("matches captured Starship altitude and ground-relative speed", () => {
    const misses: string[] = [];
    for (const p of FLIGHT13_WEBCAST_HUD) {
      if (p.shipAltKm == null && p.shipKmh == null) continue;
      const f = sampleAtTime(traj, p.t);
      const b = bodyPositions(p.t, traj.epoch);
      const kmh = kmSToKmh(groundRelativeSpeedKmS(f.pos, f.vel, b.earth, b.earthVel));
      if (p.shipAltKm != null && Math.abs(f.altEarth - p.shipAltKm) > p.altTolKm) {
        misses.push(
          `${p.label} alt ${f.altEarth.toFixed(2)} km vs webcast ${p.shipAltKm} ±${p.altTolKm}`,
        );
      }
      if (p.shipKmh != null && Math.abs(kmh - p.shipKmh) > p.speedTolKmh) {
        misses.push(
          `${p.label} speed ${kmh.toFixed(0)} km/h vs webcast ${p.shipKmh} ±${p.speedTolKmh}`,
        );
      }
    }
    assert.equal(misses.join("; "), "");
  });

  it("matches captured Super Heavy landing altitudes", () => {
    const misses: string[] = [];
    for (const p of FLIGHT13_WEBCAST_HUD) {
      if (p.boosterAltKm == null) continue;
      const rec = sampleBoosterRecovery(stage, p.t - stageT, kfs, "gulf", traj.epoch);
      const alt = altitudeEarth(p.t, rec.pos, traj.epoch);
      if (Math.abs(alt - p.boosterAltKm) > p.altTolKm) {
        misses.push(
          `${p.label} booster alt ${alt.toFixed(2)} km vs webcast ${p.boosterAltKm} ±${p.altTolKm}`,
        );
      }
    }
    assert.equal(misses.join("; "), "");
  });
});

describe("webcastShipHudAt", () => {
  it("returns captured knots and interpolates between them", () => {
    const seco = webcastShipHudAt(487);
    assert.equal(seco.altKm, 148);
    assert.equal(seco.kmh, 26496);
    const mid = webcastShipHudAt((2845 + 3739) / 2);
    assert.ok(mid.altKm < 83 && mid.altKm > 28.1);
    assert.ok(mid.kmh < 26775 && mid.kmh > 2748);
  });
});
