import type { V3 } from "./vec3";

export type PhaseId =
  | "launch"
  | "ascent"
  | "leo"
  | "tli"
  | "coast"
  | "approach"
  | "braking"
  | "descent"
  | "landed";

export type Sample = {
  t: number;
  pos: V3;
  vel: V3;
  phase: PhaseId;
  burning: boolean;
  /** Booster propellant remaining (0–1) */
  fuelBooster: number;
  /** Ship propellant remaining (0–1) */
  fuelShip: number;
  /** Thrust force (N); 0 when idle */
  thrustN: number;
  /** True after booster stage-out at LEO insert */
  staged: boolean;
};

export type MissionResult = {
  samples: Sample[];
  durationS: number;
  moonPhase0: number;
  tliDv: number;
  minMoonAlt: number;
  ok: boolean;
  message: string;
  /** Max |r_N-body − r_Kepler| (km) on the TLI coast, if computed */
  keplerRefMaxDevKm?: number;
  /** Discrete midcourse corrections executed during coast */
  tcmCount?: number;
  /** Total TCM |Δv| (km/s) */
  tcmTotalDv?: number;
};

const PHASE_LABELS: Record<PhaseId, string> = {
  launch: "Liftoff · Starbase",
  ascent: "Ascent to LEO",
  leo: "LEO",
  tli: "Trans-lunar injection",
  coast: "Trans-lunar coast",
  approach: "Lunar approach",
  braking: "Braking",
  descent: "Powered descent",
  landed: "Landed · south pole",
};

export function phaseLabel(id: PhaseId): string {
  return PHASE_LABELS[id];
}
