/**
 * Analytic Earth atmosphere for theater drag (US76-ish piecewise exponential).
 *
 * Density is C0 between published knots — not a single scale height, not a
 * live NRLMSISE table. Entry Cd·A/m and L/D vary with altitude so the
 * belly-flop is denser in the continuum and a bit higher-Cd in rarefied
 * flow; L/D stays theater-bounded.
 *
 * Scene unit = 1 km. Density is kg/km³ (1.225 kg/m³ = 1.225e9 kg/km³).
 */

import { ATM_H_MAX_KM, ATM_RHO0_KG_KM3 } from "./constants";

/**
 * US Standard Atmosphere 1976 geometric-altitude knots (kg/m³).
 * Piecewise exponential between rows; zero above {@link ATM_H_MAX_KM}.
 */
const US76_H_KM = [
  0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150,
] as const;

const US76_RHO_KG_M3 = [
  1.225, 0.7364, 0.4135, 0.1948, 0.08891, 0.04008, 0.01841, 0.003996, 0.001027,
  3.097e-4, 8.283e-5, 1.846e-5, 3.416e-6, 5.604e-7, 9.708e-8, 2.247e-8, 8.152e-9,
  3.831e-9, 2.076e-9,
] as const;

/** kg/m³ → kg/km³. */
const RHO_SI_TO_KM = 1e9;

/** High-AoA belly Cd·A/m (km²/kg) in continuum flow. Theater, not CFD. */
export const ENTRY_BELLY_CD_A_OVER_M = 1.6e-10;

/**
 * Rarefied / high-alt entry Cd·A/m (km²/kg). Free-molecular Cd is higher
 * than continuum; density is tiny so this is a small extra bleed.
 */
const ENTRY_RAREFIED_CD_A_OVER_M = 1.85e-10;

/** Low-alt landing-config CdA (still well above the stack). */
const ENTRY_LOW_CD_A_OVER_M = 1.4e-10;

/** Altitude (km) where entry CdA reaches continuum belly. */
const BELLY_FULL_ALT_KM = 70;

/** Altitude (km) above which entry CdA stays rarefied. */
const RAREFIED_ALT_KM = 95;

/**
 * Piecewise US76-ish density (kg/km³) at geometric altitude h (km).
 * Surface value matches {@link ATM_RHO0_KG_KM3}; zero above cutoff.
 */
export function atmDensity(hKm: number): number {
  if (hKm < 0) return ATM_RHO0_KG_KM3;
  if (hKm > ATM_H_MAX_KM) return 0;
  const last = US76_H_KM.length - 1;
  if (hKm >= US76_H_KM[last]!) {
    return US76_RHO_KG_M3[last]! * RHO_SI_TO_KM;
  }
  let i = 0;
  while (i + 1 < last && hKm > US76_H_KM[i + 1]!) i++;
  const h0 = US76_H_KM[i]!;
  const h1 = US76_H_KM[i + 1]!;
  const r0 = US76_RHO_KG_M3[i]!;
  const r1 = US76_RHO_KG_M3[i + 1]!;
  const H = (h1 - h0) / Math.log(r0 / r1);
  return r0 * Math.exp(-(hKm - h0) / H) * RHO_SI_TO_KM;
}

/**
 * Entry ballistic factor Cd·A/m (km²/kg) vs altitude.
 * Ascent still uses the stack factor; this is the belly-flop table.
 * Cd is a bit higher in rarefied flow and settles to continuum belly below
 * ~70 km.
 */
export function entryCdAOverM(altKm: number): number {
  if (altKm >= RAREFIED_ALT_KM) return ENTRY_RAREFIED_CD_A_OVER_M;
  if (altKm <= 25) return ENTRY_LOW_CD_A_OVER_M;
  if (altKm <= BELLY_FULL_ALT_KM) return ENTRY_BELLY_CD_A_OVER_M;
  const u = (RAREFIED_ALT_KM - altKm) / (RAREFIED_ALT_KM - BELLY_FULL_ALT_KM);
  return ENTRY_RAREFIED_CD_A_OVER_M +
    u * (ENTRY_BELLY_CD_A_OVER_M - ENTRY_RAREFIED_CD_A_OVER_M);
}

/**
 * Theater lift-to-drag vs altitude. Peaks in the hypersonic continuum
 * (~0.42 near 50 km); thinner at the edges so the skip stays bounded.
 */
export function entryLiftToDrag(altKm: number): number {
  if (altKm >= 90) return 0.12;
  if (altKm <= 20) return 0.22;
  const x = (altKm - 20) / 70;
  return 0.22 + 0.38 * Math.sin(Math.PI * x);
}
