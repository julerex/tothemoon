/**
 * Indian Ocean splashdown site + multi-layer water spray theater FX for Flight 13.
 *
 * Earth-fixed site (lat/lon → mesh-local on the Earth body) so the beacon
 * co-rotates. Spray expands near terminal splash — scrub-deterministic.
 *
 * V17: white volumetric contact steam + warm core + ocean glitter (not cyan discs).
 * Sunlit sea plate: globe PBR ocean goes black at the winter-morning splash.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see terminalSiteFx.ts — shared site + layer applicators
 * @see docs/VISUAL_REALISM.md — V17 splash steam
 */

import type * as THREE from "three";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../physics/flight13Mission";
import { deriveSplashSpray } from "./terminalFx";
import {
  createEarthTerminalSite,
  type EarthTerminalSiteSpec,
} from "./terminalSiteFx";

export const SPLASH_SITE_LABEL = "Indian Ocean";
export const SPLASH_SITE_DETAIL = "Theater splash · west of Western Australia";

const SPLASH_SITE: EarthTerminalSiteSpec = {
  name: "splash-fx",
  lat: FLIGHT13_SPLASH_LAT,
  lon: FLIGHT13_SPLASH_LON,
  ring: { innerRadius: 1.5, outerRadius: 3.2, color: 0x6a90a8, opacity: 0.45 },
  beacon: {
    topRadius: 0.2, bottomRadius: 0.4, height: 10, color: 0xa8c8e0,
    opacity: 0.55, nearKm: 800, idleOpacity: 0.3,
  },
  disc: { radius: 1.2, color: 0x7aadc4, opacity: 0.16 },
  label: {
    name: "splash-site-label", text: SPLASH_SITE_LABEL, color: "#c8dce8",
    detail: SPLASH_SITE_DETAIL, height: 12,
  },
  layers: {
    // Warm-white core + pale mist (engine glow in the steam).
    name: "splash-spray", segments: 48, innerColor: 0xffe8d8,
    outerColor: 0xf0f4f8, contactColor: 0x081018, sheetColor: 0xffffff,
  },
  oceanGlitter: true,
  sunlitOcean: true,
};

/**
 * Splashdown site beacon + spray layers, parented under the Earth mesh so it
 * co-rotates with the ground track.
 */
export type SplashFx = Readonly<{
  group: THREE.Group;
  /** Mission time of terminal splash (for spray age). */
  setSplashTime: (landT: number) => void;
  update: (
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { phase: string; altEarth: number },
  ) => void;
}>;

export function createSplashFx(): SplashFx {
  const site = createEarthTerminalSite(SPLASH_SITE);
  let landT = 0;
  let hasLand = false;

  return Object.freeze({
    group: site.group,
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
        return;
      }
      site.pulseBeacon(craftPos);
      site.layers.apply(derived);
      site.setGlitter(derived.glitter);
      site.setOceanPlate(derived.ocean);
    },
  });
}
