/**
 * Indian Ocean splashdown site + multi-layer water spray theater FX for Flight 13.
 *
 * Earth-fixed site (lat/lon → mesh-local on the Earth body) so the beacon
 * co-rotates. Spray expands near terminal splash — scrub-deterministic.
 *
 * Layers follow the pad-deluge tier pattern: inner spray, outer mist, brief
 * vertical sheet. Theater-grade, not CFD.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see terminalSiteFx.ts — shared site + layer applicators
 * @see docs/VISUAL_REALISM.md — V6 terminal FX
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
export const SPLASH_SITE_DETAIL = "Theater splash · west of Australia";

const SPLASH_SITE: EarthTerminalSiteSpec = {
  name: "splash-fx",
  lat: FLIGHT13_SPLASH_LAT,
  lon: FLIGHT13_SPLASH_LON,
  ring: { innerRadius: 1.5, outerRadius: 3.2, color: 0x4ec4ff, opacity: 0.5 },
  beacon: {
    topRadius: 0.2, bottomRadius: 0.4, height: 10, color: 0x66ddff,
    opacity: 0.7, nearKm: 800, idleOpacity: 0.4,
  },
  disc: { radius: 1.2, color: 0x88e0ff, opacity: 0.3 },
  label: {
    name: "splash-site-label", text: SPLASH_SITE_LABEL, color: "#88e0ff",
    detail: SPLASH_SITE_DETAIL, height: 12,
  },
  layers: {
    name: "splash-spray", segments: 48, innerColor: 0xc8eefc,
    outerColor: 0xa8d8f0, contactColor: 0x0a2030, sheetColor: 0xe8f6ff,
  },
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
      if (!derived.siteVisible) return;
      site.pulseBeacon(craftPos);
      site.layers.apply(derived);
    },
  });
}
