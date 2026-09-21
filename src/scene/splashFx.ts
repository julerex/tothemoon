/**
 * Indian Ocean splashdown sea + multi-layer water spray for Flight 13.
 *
 * The site sits on the flown splash geodetic (from the baked trajectory), not
 * a published buoy. No ring, beacon, or label — those fill the recovery drone.
 * Spray expands near terminal splash — scrub-deterministic.
 *
 * V17: white volumetric contact steam + warm core + ocean glitter (not cyan discs).
 * Sunlit sea plate: globe PBR ocean goes black at the winter-morning splash.
 * V21: swell + water texture on the sea plate; puffy cumulus at ~2 km AGL.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see terminalSiteFx.ts — shared site + layer applicators
 * @see docs/VISUAL_REALISM.md — V17 splash steam / V21 sea + weather deck
 */

import type * as THREE from "three";
import { deriveSplashSpray } from "./terminalFx";
import {
  createEarthTerminalSite,
  type EarthTerminalSiteSpec,
} from "./terminalSiteFx";

function splashSite(lat: number, lon: number): EarthTerminalSiteSpec {
  return {
    name: "splash-fx",
    lat,
    lon,
    layers: {
      // Warm-white core + pale mist (engine glow in the steam).
      name: "splash-spray", segments: 48, innerColor: 0xffe8d8,
      outerColor: 0xf0f4f8, contactColor: 0x081018, sheetColor: 0xffffff,
    },
    oceanGlitter: true,
    sunlitOcean: true,
    weatherClouds: true,
  };
}

/**
 * Splashdown sea and spray, parented under the Earth mesh so they co-rotate
 * with the ground track. Placed at the flown splash geodetic.
 */
export type SplashFx = Readonly<{
  group: THREE.Group;
  /** Flown splash geodetic (rad). HUD range and the dawn ocean cap use this. */
  lat: number;
  lon: number;
  /** Mission time of terminal splash (for spray age). */
  setSplashTime: (landT: number) => void;
  update: (
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { phase: string; altEarth: number },
  ) => void;
}>;

export function createSplashFx(lat: number, lon: number): SplashFx {
  const site = createEarthTerminalSite(splashSite(lat, lon));
  let landT = 0;
  let hasLand = false;

  return Object.freeze({
    group: site.group,
    lat,
    lon,
    setSplashTime(t) {
      landT = t;
      hasLand = true;
    },
    update(missionT, craftPos, opts) {
      if (!hasLand) {
        site.setVisible(false);
        return;
      }
      const derived = deriveSplashSpray({
        missionT, landT, phase: opts.phase, altEarth: opts.altEarth,
      });
      site.setVisible(derived.siteVisible);
      if (!derived.siteVisible) {
        site.setGlitter(0);
        site.setOceanPlate(0);
        site.setWeatherClouds(0);
        return;
      }
      site.pulseBeacon(craftPos);
      site.seatSea(craftPos);
      site.layers.apply(derived);
      site.setGlitter(derived.glitter);
      site.setOceanPlate(derived.ocean, missionT);
      site.setWeatherClouds(derived.clouds);
    },
  });
}
