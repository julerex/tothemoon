/**
 * Shared THREE applicators for terminal landing / splashdown sites.
 *
 * The three terminal sites (Indian Ocean splash, Gulf booster land, lunar south
 * pole) differ only in placement, colors, and which gate decides visibility, so
 * their geometry is described by spec records here and the pure poses come from
 * {@link ./terminalFx.ts}. This module mutates THREE objects and allocates only
 * at build time.
 *
 * @see terminalFx.ts — pure strength / pose helpers
 * @see splashWeather.ts — sea swell + weather deck
 * @see splashFx.ts, gulfLandFx.ts, landingFx.ts — per-site factories
 */

export {
  createSiteBeacon,
  createSiteDisc,
  createSiteLabel,
  createSiteRing,
  createTerminalLayers,
  makeBasicMat,
  type SiteBeaconSpec,
  type SiteDiscSpec,
  type SiteLabelSpec,
  type SiteRingSpec,
  type TerminalLayers,
  type TerminalLayersDerived,
  type TerminalLayersSpec,
} from "./terminalSiteParts";
export {
  createEarthTerminalSite,
  placeSiteOnEarth,
  type EarthTerminalSite,
  type EarthTerminalSiteSpec,
} from "./terminalEarthSite";
