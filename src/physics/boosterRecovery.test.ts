import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bodyPositions } from "./bodies.ts";
import {
  BOOSTBACK_END_S,
  BOOSTBACK_FLASH_S,
  BOOSTBACK_START_S,
  BOOSTER_LOCATOR_FADE_IN_S,
  BOOSTER_LOCATOR_S,
  BOOSTER_VISIBLE_S,
  boostbackFlashStrength,
  boosterLocatorStrength,
  boosterVisibleS,
  bakeBoosterRecovery,
  buildBoosterKeyframes,
  boosterPhaseAt,
  CATCH_ALT_KM,
  GULF_LAND_LAT,
  GULF_LAND_LON,
  GULF_SCHEDULE,
  LANDING_CONTACT_FLASH_S,
  LANDING_END_S,
  LANDING_START_S,
  landingContactFlashStrength,
  sampleBoosterRecovery,
  type StageState,
} from "./boosterRecovery.ts";
import { R_EARTH } from "./constants.ts";
import {
  geodeticToMeshLocal,
  meshLocalToInertial,
  starbasePadState,
} from "./earthFrame.ts";
import { bodyPositions as bodyPos } from "./bodies.ts";
import { v3 } from "./vec3.ts";

/** Synthetic stage-out ~100 km above Starbase with eastward Earth-relative velocity. */
function syntheticStage(t = 140): StageState {
  const pad = starbasePadState(t);
  const b = bodyPositions(t);
  // 100 km AGL along pad up
  const pos = v3(
    pad.pos.x + pad.up.x * 100,
    pad.pos.y + pad.up.y * 100,
    pad.pos.z + pad.up.z * 100,
  );
  // ~2.2 km/s downrange (east) + small climb, plus Earth velocity
  const vel = v3(
    b.earthVel.x + pad.east.x * 2.2 + pad.up.x * 0.3,
    b.earthVel.y + pad.east.y * 2.2 + pad.up.y * 0.3,
    b.earthVel.z + pad.east.z * 2.2 + pad.up.z * 0.3,
  );
  return { t, pos, vel };
}

function earthAlt(t: number, pos: { x: number; y: number; z: number }): number {
  const b = bodyPositions(t);
  return (
    Math.hypot(pos.x - b.earth.x, pos.y - b.earth.y, pos.z - b.earth.z) -
    R_EARTH
  );
}

function distToPad(t: number, pos: { x: number; y: number; z: number }): number {
  const pad = starbasePadState(t);
  return Math.hypot(pos.x - pad.pos.x, pos.y - pad.pos.y, pos.z - pad.pos.z);
}

describe("boosterPhaseAt", () => {
  it("walks sep → flip → boostback → coast → landing → caught → done", () => {
    assert.equal(boosterPhaseAt(-1), "done");
    assert.equal(boosterPhaseAt(0), "sep");
    assert.equal(boosterPhaseAt(3), "flip");
    assert.equal(boosterPhaseAt(BOOSTBACK_START_S + 1), "boostback");
    assert.equal(boosterPhaseAt(BOOSTBACK_END_S + 1), "coast");
    assert.equal(boosterPhaseAt(LANDING_START_S + 1), "landing");
    assert.equal(boosterPhaseAt(LANDING_END_S + 1), "caught");
    assert.equal(boosterPhaseAt(BOOSTER_VISIBLE_S + 1), "done");
  });
});

describe("buildBoosterKeyframes", () => {
  it("returns increasing ages and Earth-relative altitudes", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    assert.ok(kfs.length >= 5);
    for (let i = 1; i < kfs.length; i++) {
      assert.ok(kfs[i]!.age > kfs[i - 1]!.age);
    }
    for (const k of kfs) {
      const alt = Math.hypot(k.p.x, k.p.y, k.p.z) - R_EARTH;
      assert.ok(alt > -1, `alt ${alt} at age ${k.age}`);
      assert.ok(Number.isFinite(k.v.x) && Number.isFinite(k.v.y));
    }
  });

  it("bakes a dense force-model path, not a handful of hermite keys", () => {
    const kfs = buildBoosterKeyframes(syntheticStage());
    // ~0.25 s RK4 through landing (~280 s) → hundreds of samples
    assert.ok(kfs.length > 200, `expected dense bake, got ${kfs.length}`);
  });
});

describe("sampleBoosterRecovery", () => {
  it("is finite and stays above the surface for the full window", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    for (let age = 0; age <= BOOSTER_VISIBLE_S; age += 5) {
      const s = sampleBoosterRecovery(stage, age, kfs);
      assert.ok(Number.isFinite(s.pos.x), `pos at ${age}`);
      assert.ok(Number.isFinite(s.vel.x), `vel at ${age}`);
      if (s.fade > 0.02) {
        const alt = earthAlt(stage.t + age, s.pos);
        assert.ok(alt > -0.5, `below surface alt=${alt} age=${age}`);
      }
    }
  });

  it("burns during boostback and landing windows", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const midBB = sampleBoosterRecovery(
      stage,
      (BOOSTBACK_START_S + BOOSTBACK_END_S) / 2,
      kfs,
    );
    assert.equal(midBB.phase, "boostback");
    assert.ok(midBB.burning);
    assert.ok(midBB.throttle > 0.3);

    const midLand = sampleBoosterRecovery(
      stage,
      (LANDING_START_S + LANDING_END_S) / 2,
      kfs,
    );
    assert.equal(midLand.phase, "landing");
    assert.ok(midLand.burning);
    assert.ok(midLand.throttle > 0.3);

    const coast = sampleBoosterRecovery(stage, 100, kfs);
    assert.equal(coast.phase, "coast");
    assert.equal(coast.burning, false);
  });

  it("ends near the Starbase chopsticks after the landing burn", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const caught = sampleBoosterRecovery(stage, LANDING_END_S, kfs);
    assert.equal(caught.phase, "caught");
    const d = distToPad(stage.t + LANDING_END_S, caught.pos);
    // Catch is CATCH_ALT_KM above pad; allow a few hundred meters of theater slop
    assert.ok(
      d < CATCH_ALT_KM + 0.15,
      `catch dist to pad ${d} km (want ~${CATCH_ALT_KM})`,
    );
    const alt = earthAlt(stage.t + LANDING_END_S, caught.pos);
    assert.ok(alt > 0 && alt < 0.5, `catch alt ${alt}`);
  });

  it("fades out after the catch hold", () => {
    const stage = syntheticStage();
    const mid = sampleBoosterRecovery(stage, LANDING_END_S + 10);
    assert.ok(mid.fade > 0.99);
    const end = sampleBoosterRecovery(stage, BOOSTER_VISIBLE_S);
    assert.ok(end.fade < 0.05);
    const after = sampleBoosterRecovery(stage, BOOSTER_VISIBLE_S + 10);
    assert.equal(after.phase, "done");
    assert.equal(after.fade, 0);
  });

  it("coasts under force-model accel after boostback (no hermite snap)", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const a0 = BOOSTBACK_END_S + 12;
    const a1 = a0 + 2;
    const s0 = sampleBoosterRecovery(stage, a0, kfs);
    const v0 = { x: s0.vel.x, y: s0.vel.y, z: s0.vel.z };
    const s1 = sampleBoosterRecovery(stage, a1, kfs);
    const ax = (s1.vel.x - v0.x) / (a1 - a0);
    const ay = (s1.vel.y - v0.y) / (a1 - a0);
    const az = (s1.vel.z - v0.z) / (a1 - a0);
    const aMag = Math.hypot(ax, ay, az);
    // Earth g ~ 0.009 km/s²; hermite keyframe snaps were often > 0.1
    assert.ok(aMag > 0.002, `coast |a| too small ${aMag}`);
    assert.ok(aMag < 0.05, `coast |a| too large for gravity+drag ${aMag}`);
  });

  it("starts the landing burn near 5 km AGL at the public mark", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const atGate = sampleBoosterRecovery(stage, LANDING_START_S, kfs);
    assert.equal(atGate.phase, "landing");
    const alt = earthAlt(stage.t + LANDING_START_S, atGate.pos);
    assert.ok(alt > 2 && alt < 12, `landing-start alt ${alt} km (want ~5)`);
    const lit = sampleBoosterRecovery(stage, LANDING_START_S + 2, kfs);
    assert.ok(lit.burning);
    assert.ok(lit.throttle > 0.3);
  });

  it("books leftover booster propellant on boostback and landing", () => {
    const bake = bakeBoosterRecovery(syntheticStage());
    assert.ok(bake.burnedPropKg > 5e4, `burned ${bake.burnedPropKg}`);
    assert.ok(bake.leftoverPropKg < bake.startPropKg);
    assert.ok(bake.leftoverPropKg > 0);
  });

  it("is scrub-stable: same age ⇒ same sample", () => {
    const stage = syntheticStage();
    const kfs = buildBoosterKeyframes(stage);
    const a = sampleBoosterRecovery(stage, 200, kfs);
    const b = sampleBoosterRecovery(stage, 200, kfs);
    assert.equal(a.pos.x, b.pos.x);
    assert.equal(a.pos.y, b.pos.y);
    assert.equal(a.throttle, b.throttle);
  });
});

describe("gulf recovery profile", () => {
  it("uses Flight 13 landing-burn ages", () => {
    assert.equal(GULF_SCHEDULE.boostbackStartS, 4);
    assert.equal(GULF_SCHEDULE.boostbackEndS, 42);
    assert.equal(GULF_SCHEDULE.landingStartS, 246);
    assert.equal(GULF_SCHEDULE.landingEndS, 272);
    assert.equal(GULF_SCHEDULE.gateAltKm, 5);
    assert.equal(GULF_SCHEDULE.hardSplash, true);
    assert.equal(boosterPhaseAt(GULF_SCHEDULE.landingStartS + 1, "gulf"), "landing");
    assert.equal(boosterPhaseAt(GULF_SCHEDULE.landingEndS + 1, "gulf"), "caught");
  });

  it("ends in the Gulf, not the chopsticks", () => {
    const stage = syntheticStage(141);
    const kfs = buildBoosterKeyframes(stage, "gulf");
    const land = sampleBoosterRecovery(
      stage,
      GULF_SCHEDULE.landingEndS,
      kfs,
      "gulf",
    );
    assert.equal(land.phase, "caught");
    const t = stage.t + GULF_SCHEDULE.landingEndS;
    // Gulf site: mesh-local → Earth-centered inertial → heliocentric
    const local = v3();
    geodeticToMeshLocal(
      GULF_LAND_LAT,
      GULF_LAND_LON,
      R_EARTH + GULF_SCHEDULE.landAltKm,
      local,
    );
    const siteRel = v3();
    meshLocalToInertial(local, t, siteRel);
    const b = bodyPos(t);
    const dGulf = Math.hypot(
      land.pos.x - (b.earth.x + siteRel.x),
      land.pos.y - (b.earth.y + siteRel.y),
      land.pos.z - (b.earth.z + siteRel.z),
    );
    assert.ok(dGulf < 5, `gulf land dist ${dGulf} km`);
    // Farther from Starbase pad than chopsticks catch (~0.1 km)
    const dPad = distToPad(t, land.pos);
    assert.ok(dPad > 30, `should be offshore, pad dist ${dPad} km`);
  });

  it("lights the Flight 13 landing burn near 5 km AGL", () => {
    const stage = syntheticStage(141);
    const kfs = buildBoosterKeyframes(stage, "gulf");
    const lit = sampleBoosterRecovery(
      stage,
      GULF_SCHEDULE.landingStartS + 0.5,
      kfs,
      "gulf",
    );
    assert.equal(lit.phase, "landing");
    assert.ok(lit.burning);
    const alt = earthAlt(stage.t + GULF_SCHEDULE.landingStartS + 0.5, lit.pos);
    assert.ok(alt > 2 && alt < 12, `gulf landing-start alt ${alt} km`);
  });

  it("falls into the ocean — landing burn is too weak to hoverslam", () => {
    const stage = syntheticStage(141);
    const kfs = buildBoosterKeyframes(stage, "gulf");
    const midAge = GULF_SCHEDULE.landingStartS + 2;
    const mid = sampleBoosterRecovery(stage, midAge, kfs, "gulf");
    assert.equal(mid.phase, "landing");
    assert.ok(mid.burning);
    assert.ok(mid.throttle > 0.05 && mid.throttle < 0.4, `gulf throttle ${mid.throttle}`);
    const b = bodyPos(stage.t + midAge);
    const upx = mid.pos.x - b.earth.x;
    const upy = mid.pos.y - b.earth.y;
    const upz = mid.pos.z - b.earth.z;
    const r = Math.hypot(upx, upy, upz) || 1;
    const vRad =
      ((mid.vel.x - b.earthVel.x) * upx +
        (mid.vel.y - b.earthVel.y) * upy +
        (mid.vel.z - b.earthVel.z) * upz) /
      r;
    assert.ok(vRad < -0.2, `expected a real fall, vRad=${vRad} km/s`);
    const hit = sampleBoosterRecovery(stage, GULF_SCHEDULE.landingStartS + 6, kfs, "gulf");
    const hitAlt = earthAlt(stage.t + GULF_SCHEDULE.landingStartS + 6, hit.pos);
    assert.ok(hitAlt < 0.2, `should already be in the water, alt=${hitAlt}`);
  });

  it("stays above the surface for the gulf visible window", () => {
    const stage = syntheticStage(141);
    const kfs = buildBoosterKeyframes(stage, "gulf");
    const vis = boosterVisibleS(GULF_SCHEDULE);
    for (let age = 0; age <= vis; age += 5) {
      const s = sampleBoosterRecovery(stage, age, kfs, "gulf");
      if (s.fade > 0.02) {
        const alt = earthAlt(stage.t + age, s.pos);
        assert.ok(alt > -0.5, `below surface alt=${alt} age=${age}`);
      }
    }
  });
});

describe("boosterLocatorStrength", () => {
  it("is off before stage and after the ~30 s window", () => {
    assert.equal(boosterLocatorStrength(-0.1), 0);
    assert.equal(boosterLocatorStrength(BOOSTER_LOCATOR_S + 0.01), 0);
    assert.equal(boosterLocatorStrength(60), 0);
  });

  it("fades in, holds, then fades out", () => {
    const early = boosterLocatorStrength(BOOSTER_LOCATOR_FADE_IN_S * 0.5);
    assert.ok(early > 0 && early < 1);
    assert.ok(boosterLocatorStrength(10) > 0.99);
    const late = boosterLocatorStrength(BOOSTER_LOCATOR_S - 2);
    assert.ok(late > 0 && late < 1);
    assert.ok(late < boosterLocatorStrength(10));
  });
});

describe("boostbackFlashStrength", () => {
  it("is zero outside the boostback ignition window", () => {
    assert.equal(boostbackFlashStrength(0), 0);
    assert.equal(boostbackFlashStrength(BOOSTBACK_START_S - 0.01), 0);
    assert.equal(
      boostbackFlashStrength(BOOSTBACK_START_S + BOOSTBACK_FLASH_S + 0.01),
      0,
    );
  });

  it("peaks early after boostback start then decays", () => {
    const peak = boostbackFlashStrength(BOOSTBACK_START_S + 0.3);
    const mid = boostbackFlashStrength(BOOSTBACK_START_S + BOOSTBACK_FLASH_S * 0.5);
    const end = boostbackFlashStrength(BOOSTBACK_START_S + BOOSTBACK_FLASH_S * 0.9);
    assert.ok(peak > 0.5);
    assert.ok(mid < peak);
    assert.ok(end < mid);
    assert.ok(end > 0);
  });
});

describe("landingContactFlashStrength", () => {
  it("is zero outside the catch window", () => {
    assert.equal(landingContactFlashStrength(0), 0);
    assert.equal(landingContactFlashStrength(LANDING_END_S - 1), 0);
    assert.equal(
      landingContactFlashStrength(LANDING_END_S + LANDING_CONTACT_FLASH_S + 0.05),
      0,
    );
  });

  it("peaks near landingEnd then decays, gulf uses gulf schedule", () => {
    const peak = landingContactFlashStrength(LANDING_END_S);
    const late = landingContactFlashStrength(LANDING_END_S + 1.5);
    assert.ok(peak > 0.5);
    assert.ok(late < peak);
    const gulfPeak = landingContactFlashStrength(GULF_SCHEDULE.landingEndS, GULF_SCHEDULE);
    assert.ok(gulfPeak > 0.5);
    assert.equal(landingContactFlashStrength(GULF_SCHEDULE.landingEndS), 0);
  });
});
