/**
 * Propellant / thrust model shared by HUD and dynamics (A4 mass-coupled).
 *
 * - Wet mass from dry + tank propellant
 * - Commanded thrust force F (N) → acceleration a = F / m (km/s²)
 * - Mass flow from rocket equation: ṁ = F / (Isp · g0) (no mdot fudge scales)
 * - Empty tanks return zero force (hard engine cutout)
 */

import {
  BOOSTER_DRY_KG,
  BOOSTER_PROP_KG,
  BOOSTER_THRUST_N,
  G0,
  ISP_BOOSTER,
  ISP_SHIP,
  SHIP_DRY_KG,
  SHIP_PROP_KG,
  SHIP_THRUST_N,
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

export function fuelBoosterFrac(p: PropState): number {
  return Math.max(0, Math.min(1, p.boosterPropKg / BOOSTER_PROP_KG));
}

export function fuelShipFrac(p: PropState): number {
  return Math.max(0, Math.min(1, p.shipPropKg / SHIP_PROP_KG));
}

export function remainingBoosterKg(p: PropState): number {
  return p.boosterPropKg;
}

export function remainingShipKg(p: PropState): number {
  return p.shipPropKg;
}

/** True if the selected tank still has burnable propellant. */
export function hasPropellant(p: PropState, tank: Tank): boolean {
  if (tank === "booster") {
    if (p.staged) return false;
    return p.boosterPropKg > 1e-3;
  }
  return p.shipPropKg > 1e-3;
}

/** Peak available thrust (N) for the tank, or 0 if empty / staged off. */
export function maxThrustN(p: PropState, tank: Tank): number {
  if (!hasPropellant(p, tank)) return 0;
  return tank === "booster" ? BOOSTER_THRUST_N : SHIP_THRUST_N;
}

/** Acceleration (km/s²) from force (N) at current wet mass. */
export function accelFromForceN(p: PropState, forceN: number): number {
  if (forceN < 1e-6) return 0;
  const m = wetMassKg(p);
  if (m < 1e-3) return 0;
  return forceN / m / 1000; // N/kg → m/s² → km/s²
}

/**
 * Cap a commanded acceleration by peak thrust and propellant.
 * Returns the realized accel (km/s²) and force (N).
 */
export function limitAccelByThrust(
  p: PropState,
  aCmdKmS2: number,
  tank: Tank,
): { aKmS2: number; forceN: number } {
  const aCmd = Math.max(0, aCmdKmS2);
  if (aCmd < 1e-12) return { aKmS2: 0, forceN: 0 };
  const fMax = maxThrustN(p, tank);
  if (fMax < 1e-6) return { aKmS2: 0, forceN: 0 };
  const m = wetMassKg(p);
  const fCmd = aCmd * m * 1000;
  const forceN = Math.min(fCmd, fMax);
  return { aKmS2: forceN / m / 1000, forceN };
}

/**
 * Instantaneous thrust force (N) for accel a (km/s²) at current wet mass.
 * Does not drain propellant.
 */
export function thrustForceN(p: PropState, aKmS2: number): number {
  if (aKmS2 < 1e-12) return 0;
  return wetMassKg(p) * aKmS2 * 1000;
}

/**
 * Drain propellant under constant force (N) for [lastT, t] via rocket equation.
 * Returns the force used (0 if tank empty). Hard-stops when prop runs out mid-step.
 */
export function burnForce(
  p: PropState,
  t: number,
  forceN: number,
  tank: Tank,
): number {
  const dt = Math.max(0, t - p.lastT);
  p.lastT = t;
  if (forceN < 1e-6) return 0;
  if (!hasPropellant(p, tank)) return 0;

  if (dt <= 0) return forceN;

  const isp = tank === "booster" ? ISP_BOOSTER : ISP_SHIP;
  // ṁ = F / (Isp g0)  [kg/s] — pure rocket equation
  let dm = (forceN / (isp * G0)) * dt;
  const available = tank === "booster" ? p.boosterPropKg : p.shipPropKg;
  if (dm > available) {
    // Partial step until dry; report force but tank empties
    dm = available;
  }

  if (tank === "booster") {
    p.boosterPropKg = Math.max(0, p.boosterPropKg - dm);
  } else {
    p.shipPropKg = Math.max(0, p.shipPropKg - dm);
  }
  return forceN;
}

/**
 * Drain under constant thrust acceleration (km/s²): F = m·a, pure RE.
 * Prefer limitAccelByThrust + burnForce for mass-coupled burns.
 */
export function burnProp(
  p: PropState,
  t: number,
  aKmS2: number,
  tank: Tank,
): number {
  if (aKmS2 < 1e-12) {
    p.lastT = t;
    return 0;
  }
  const { forceN } = limitAccelByThrust(p, aKmS2, tank);
  return burnForce(p, t, forceN, tank);
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
 * Impulsive Δv (km/s) as rocket-equation ship propellant use + display thrust.
 * Pure RE (no scale fudge).
 */
export function applyImpulsiveShipDv(
  p: PropState,
  t: number,
  dvKmS: number,
  burnS = 180,
): number {
  p.lastT = t;
  if (dvKmS < 1e-9) return 0;
  if (!hasPropellant(p, "ship")) return 0;
  const m0 = wetMassKg(p);
  const F = m0 * (dvKmS / Math.max(burnS, 1)) * 1000; // N display
  const ve = (ISP_SHIP * G0) / 1000; // km/s
  const frac = 1 - Math.exp(-dvKmS / ve);
  const dm = Math.min(p.shipPropKg, m0 * frac);
  p.shipPropKg = Math.max(0, p.shipPropKg - dm);
  return F;
}
