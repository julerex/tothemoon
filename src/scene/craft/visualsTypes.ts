/** Runtime craft visual inputs (plumes, frost, entry heat, flaps). */
export type CraftVisualState = {
  staged: boolean;
  burning: boolean;
  /** Thrust force (N); scales plume size */
  thrustN: number;
  /** Mission time (s) — deterministic plume flicker when scrubbing */
  missionT?: number;
  /** Stage-out epoch (s); enables hot-staging dual-plume window */
  stageT?: number | null;
  /** Altitude above Earth (km) — maximum dynamic pressure condensation envelope */
  altEarth?: number;
  phase?: string;
  /**
   * Active ship landing engines (1–3) for Flight 13 3→2→1 step-down.
   * Undefined / 0 → full ship plume when burning.
   */
  shipEngineCount?: number;
  /**
   * Entry plasma strength [0, 1] — drives windward tile emissive / char.
   * Omit on missions without atmospheric entry.
   */
  plasmaStrength?: number;
};
