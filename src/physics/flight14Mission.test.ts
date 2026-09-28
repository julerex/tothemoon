/**
 * Flight 14 timeline + mission shape.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeFlight14Epoch } from "./flight14Epoch.ts";
import { altitudeEarth } from "./integrator.ts";
import { F14, firstSplashdownT, runFlight14Mission } from "./flight14Mission.ts";
import { inertialGeodetic } from "./flight14Splash.ts";
import { GAUTENG_LAT, GAUTENG_LON } from "./flight13Corridor.ts";

function phaseSequence(samples: Array<{ phase: string }>): string[] {
  const out: string[] = [];
  let prev: string | null = null;
  for (const s of samples) {
    if (s.phase !== prev) {
      out.push(s.phase);
      prev = s.phase;
    }
  }
  return out;
}

describe("F14 timeline anchors", () => {
  it("matches the official SpaceX T+ table", () => {
    assert.equal(F14.MAX_Q, 58);
    assert.equal(F14.MECO, 140);
    assert.equal(F14.HOT_STAGE, 142);
    assert.equal(F14.SECO, 491);
    assert.equal(F14.INSERT, 25 * 60 + 28);
    assert.equal(F14.INSERT_END, 25 * 60 + 47);
    assert.equal(F14.PAYLOAD_START, 34 * 60 + 18);
    assert.equal(F14.PAYLOAD_END, 1 * 3600 + 4 * 60 + 50);
    assert.equal(F14.DEORBIT, 8 * 3600 + 52 * 60 + 18);
    assert.equal(F14.SPLASH, 9 * 3600 + 50 * 60 + 30);
    assert.ok(F14.END > F14.SPLASH);
  });
});

describe("runFlight14Mission", { timeout: 180_000 }, () => {
  const epoch = makeFlight14Epoch(0, 0);
  const result = runFlight14Mission({ epoch });

  it("completes an orbital pack with splash", () => {
    assert.equal(result.ok, true);
    assert.match(result.message, /Flight 14/i);
    assert.ok(result.durationS >= F14.END - 5);
    const seq = phaseSequence(result.samples);
    assert.ok(seq.includes("launch"));
    assert.ok(seq.includes("ascent"));
    assert.ok(seq.includes("coast"));
    assert.ok(seq.includes("lowEarthOrbit"));
    assert.ok(seq.includes("entry"));
    assert.ok(seq.includes("splashdown"));
    assert.equal(seq[seq.length - 1], "splashdown");
  });

  it("does not circularize at SECO; inserts near 275 km", () => {
    const seco = result.samples.find((s) => s.t >= F14.SECO && s.phase === "coast");
    assert.ok(seco, "expected a coast sample at/after SECO");
    const secoAlt = altitudeEarth(seco.t, seco.pos, epoch);
    assert.ok(secoAlt > 120 && secoAlt < 400, `SECO alt ${secoAlt} km`);

    const onOrbit = result.samples.find(
      (s) => s.phase === "lowEarthOrbit" && s.t > F14.INSERT_END + 30 && !s.burning,
    );
    assert.ok(onOrbit, "expected on-orbit coast after insertion");
    const insertAlt = altitudeEarth(onOrbit.t, onOrbit.pos, epoch);
    assert.ok(
      insertAlt > 180 && insertAlt < 400,
      `insertion alt ${insertAlt} km (want ~275)`,
    );
  });

  it("splashes near the public landing call, not at Gauteng", () => {
    const splashT = firstSplashdownT(result.samples);
    assert.ok(
      Math.abs(splashT - F14.SPLASH) < 180,
      `splashT ${splashT} far from public ${F14.SPLASH}`,
    );
    const splash = result.samples.find((s) => s.phase === "splashdown");
    assert.ok(splash);
    const geo = inertialGeodetic(splash.t, splash.pos, epoch);
    const dLat = Math.abs(geo.lat - GAUTENG_LAT);
    const dLon = Math.abs(geo.lon - GAUTENG_LON);
    assert.ok(dLat > 0.15 || dLon > 0.15, "splash must not sit on Gauteng");
  });
});
