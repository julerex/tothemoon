/**
 * Theater propellant / thrust bookkeeping for HUD telemetry.
 * Does not affect guidance — samples only.
 */

import {
  BOOSTER_DRY_KG,
  BOOSTER_MDOT_SCALE,
  BOOSTER_PROP_KG,
  G0,
  ISP_BOOSTER,
  ISP_SHIP,
  SHIP_DRY_KG,
  SHIP_MDOT_SCALE,
  SHIP_PROP_KG,
} from "./constants";

export type Tank = "booster" | "ship";

export type PropState = {
  /** Remaining booster propellant (kg) */
  boosterPropKg: number;
  /** Remaining ship propellant (kg) */
  shipPropKg: number;
  /** Last sample / burn-account time (s) */
  lastT: number;
  /** After LEO insert the booster is staged off */
  staged: boolean;
};

export function createPropState(t0 = 0): PropState {
  return {
    boosterPropKg: BOOSTER_PROP_KG,
    shipPropKg: SHIP_PROP_KG,
    lastT: t0,
    staged: false,
  };
}

export function cloneProp(p: PropState): PropState {
  return {
    boosterPropKg: p.boosterPropKg,
    shipPropKg: p.shipPropKg,
    lastT: p.lastT,
    staged: p.staged,
  };
}

/** Current wet mass (kg). After staging, booster mass is gone. */
export function wetMassKg(p: PropState): number {
  if (p.staged) return SHIP_DRY_KG + p.shipPropKg;
  return BOOSTER_DRY_KG + p.boosterPropKg + SHIP_DRY_KG + p.shipPropKg;
}

/** Instantaneous thrust force (N) for accel a (km/s²) at current wet mass. */
export function thrustForceN(p: PropState, aKmS2: number): number {
  if (aKmS2 < 1e-12) return 0;
  return wetMassKg(p) * aKmS2 * 1000;
}

export function fuelBoosterFrac(p: PropState): number {
  return Math.max(0, Math.min(1, p.boosterPropKg / BOOSTER_PROP_KG));
}

export function fuelShipFrac(p: PropState): number {
  return Math.max(0, Math.min(1, p.shipPropKg / SHIP_PROP_KG));
}

/**
 * Advance propellant for interval [lastT, t] under constant accel magnitude.
 * `aKmS2` is thrust acceleration (km/s²). Returns thrust force (N) at end state mass.
 */
export function burnProp(
  p: PropState,
  t: number,
  aKmS2: number,
  tank: Tank,
): number {
  const dt = Math.max(0, t - p.lastT);
  p.lastT = t;
  if (aKmS2 < 1e-12) return 0;

  const m = wetMassKg(p);
  // a is km/s² → m/s² for SI force
  const F = m * aKmS2 * 1000; // N
  if (dt <= 0) return F; // still report thrust at sample epoch

  const isp = tank === "booster" ? ISP_BOOSTER : ISP_SHIP;
  const scale = tank === "booster" ? BOOSTER_MDOT_SCALE : SHIP_MDOT_SCALE;
  const dm = (F / (isp * G0)) * scale * dt;

  if (tank === "booster") {
    p.boosterPropKg = Math.max(0, p.boosterPropKg - dm);
  } else {
    p.shipPropKg = Math.max(0, p.shipPropKg - dm);
  }
  return F;
}

/** Sync clock without burning (coasts). */
export function coastProp(p: PropState, t: number): void {
  p.lastT = t;
}

/** Stage-out: drop booster, zero its remaining prop for display. */
export function stageBooster(p: PropState, t: number): void {
  p.staged = true;
  p.boosterPropKg = 0;
  p.lastT = t;
}

/**
 * Impulsive Δv (km/s) as a finite ship burn for fuel accounting + display thrust.
 * Returns mean thrust (N) over the synthetic burn window (F = m · Δv/Δt).
 */
export function applyImpulsiveShipDv(
  p: PropState,
  t: number,
  dvKmS: number,
  burnS = 180,
): number {
  p.lastT = t;
  if (dvKmS < 1e-9) return 0;
  const m0 = wetMassKg(p);
  // Display thrust as if Δv is delivered over burnS
  const F = m0 * (dvKmS / Math.max(burnS, 1)) * 1000; // N
  // Rocket equation propellant, lightly scaled so TLI is a clear but partial draw
  const ve = (ISP_SHIP * G0) / 1000; // km/s
  const frac = 1 - Math.exp(-dvKmS / ve);
  const dm = Math.min(p.shipPropKg, m0 * frac * 0.12);
  p.shipPropKg = Math.max(0, p.shipPropKg - dm);
  return F;
}

export function remainingBoosterKg(p: PropState): number {
  return p.boosterPropKg;
}

export function remainingShipKg(p: PropState): number {
  return p.shipPropKg;
}
