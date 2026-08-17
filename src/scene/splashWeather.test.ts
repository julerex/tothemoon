/**
 * Visual V21: splash-zone sea state + weather-deck contracts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { R_EARTH } from "../physics/constants.ts";
import { LEO_CLOUD_RADIUS } from "./leoClouds.ts";
import {
  SPLASH_OCEAN_CHOP_MESH,
  SPLASH_OCEAN_CHOP_RADIUS_KM,
  SPLASH_OCEAN_MESH,
  SPLASH_OCEAN_RADIUS_KM,
  SPLASH_WEATHER_CLOUDS,
} from "./splashWeather.ts";
import { WEATHER_CLOUD_ALT_KM } from "./terminalFx.ts";

describe("splash ocean plates", () => {
  it("keeps the inner chop plate inside the sunlit disc", () => {
    assert.ok(SPLASH_OCEAN_CHOP_RADIUS_KM < SPLASH_OCEAN_RADIUS_KM);
    assert.ok(SPLASH_OCEAN_RADIUS_KM > 60);
    assert.equal(SPLASH_OCEAN_MESH, "splash-ocean-plate");
    assert.equal(SPLASH_OCEAN_CHOP_MESH, "splash-ocean-chop");
  });
});

describe("splash weather clouds", () => {
  it("sits at cumulus altitude, well below the LEO shell", () => {
    assert.equal(SPLASH_WEATHER_CLOUDS, "splash-weather-clouds");
    const weatherR = R_EARTH + WEATHER_CLOUD_ALT_KM;
    assert.ok(weatherR < LEO_CLOUD_RADIUS);
    assert.ok(LEO_CLOUD_RADIUS - weatherR > 30);
  });
});
