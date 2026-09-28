/**
 * Flight 14 ship attitude (landing knots from the official T+ table).
 * Geometry helpers are shared with Flight 13; swap knots at theater boot.
 */
export {
  AFT_ELEVON_BELLY_RAD,
  FWD_FLAP_BELLY_RAD,
  FWD_FLAP_REST_RAD,
  SHIP_BARREL_RADIUS_KM,
  SPLASH_LIE_S,
  SPLASH_WATERLINE_ALT_KM,
  entryFlapDeflectionRad,
  entryFlapsActive,
  entryPlasmaStrength,
  entryVisualBank,
  landingEngineCount,
  landingFlipBlend,
  setAttitudeKnots,
  shipAttitudeMode,
  splashFloatBob,
  splashFloatLiftKm,
  splashLieBlend,
  splashSeatRadiusAlong,
  type AttitudeKnots,
  type FlapDeflection,
  type ShipAttitudeMode,
} from "./flight13Attitude";
