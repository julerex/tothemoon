/**
 * Gulf of America booster hard-splash site plate for Flight 13.
 *
 * Earth-fixed (lat/lon → mesh-local) so the beacon co-rotates. Spray uses the
 * shared terminal FX curves. Theater-grade — not a barge or CFD splash.
 * V17: ocean glitter + warmer white steam on the Gulf plate.
 *
 * @see padRecoveryFx.ts — visibility / AGL helpers
 * @see terminalSiteFx.ts — shared site + layer applicators
 * @see docs/VISUAL_REALISM.md — V8 recovery catch / V17 splash steam
 */

import type * as THREE from "three";
import {
  GULF_LAND_LAT,
  GULF_LAND_LON,
  GULF_SCHEDULE,
  type BoosterRecoveryPhase,
} from "../physics/boosterRecovery";
import {
  gulfLandingAltKm,
  gulfSiteVisible,
  gulfSprayPhase,
} from "./padRecoveryFx";
import { deriveSplashSpray } from "./terminalFx";
import {
  createEarthTerminalSite,
  type EarthTerminalSiteSpec,
} from "./terminalSiteFx";

export const GULF_SITE_LABEL = "Gulf of America";
export const GULF_SITE_DETAIL = "Hard splash · offshore";

const GULF_SITE: EarthTerminalSiteSpec = {
  name: "gulf-land-fx",
  lat: GULF_LAND_LAT,
  lon: GULF_LAND_LON,
  ring: { innerRadius: 1.2, outerRadius: 2.6, color: 0x6ec8a8, opacity: 0.5 },
  beacon: {
    topRadius: 0.18, bottomRadius: 0.38, height: 8, color: 0x88e0b0,
    opacity: 0.7, nearKm: 400, idleOpacity: 0.4,
  },
  disc: { radius: 1.1, color: 0x7ad0b0, opacity: 0.28 },
  label: {
    name: "gulf-site-label", text: GULF_SITE_LABEL, color: "#88e0b0",
    detail: GULF_SITE_DETAIL, height: 10,
  },
  layers: {
    name: "gulf-spray", segments: 40, innerColor: 0xffe8d0,
    outerColor: 0xe8f4f0, contactColor: 0x0a1814, sheetColor: 0xffffff,
  },
  oceanGlitter: true,
};

/** Gulf booster landing beacon + spray, parented under the Earth mesh. */
export type GulfLandFx = Readonly<{
  group: THREE.Group;
  /**
   * @param stageT - Stage-out mission time (s)
   * @param landT - Splash mission time (s); defaults to gulf schedule
   */
  setLandTime: (stageT: number, landT?: number) => void;
  update: (
    missionT: number,
    craftPos: THREE.Vector3,
    opts: { recoveryPhase: BoosterRecoveryPhase | string },
  ) => void;
}>;

export function createGulfLandFx(): GulfLandFx {
  const site = createEarthTerminalSite(GULF_SITE);
  let stageT = 0;
  let landT = 0;
  let hasLand = false;

  return Object.freeze({
    group: site.group,
    setLandTime(stageOutT, landAtT) {
      stageT = stageOutT;
      landT = landAtT ?? stageOutT + GULF_SCHEDULE.landingEndS;
      hasLand = true;
    },
    update(missionT, craftPos, opts) {
      if (!hasLand) {
        site.setVisible(false);
        return;
      }
      const age = missionT - stageT;
      const show = gulfSiteVisible(opts.recoveryPhase, age);
      site.setVisible(show);
      if (!show) return;
      site.pulseBeacon(craftPos);
      const derived = deriveSplashSpray({
        missionT,
        landT,
        phase: gulfSprayPhase(opts.recoveryPhase),
        altEarth: gulfLandingAltKm(age),
      });
      site.layers.apply(derived);
      site.setGlitter(derived.glitter);
    },
  });
}
