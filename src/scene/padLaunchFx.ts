/**
 * Pure pad launch FX — strengths and sprite poses from mission state.
 *
 * ## Architecture
 *
 * ```
 * LaunchPadFxState  →  derivePadFx()  →  *SpritePose() / *Visual()
 *                                              ↓
 *                         earthTheater.updateStarbaseLaunchFx  (THREE only)
 * ```
 *
 * **No THREE** in this module: scrub-safe, unit-testable, shared by both
 * mission theaters (lunar + Flight 13). Scene unit = **1 km**.
 *
 * ## Scrub safety
 *
 * All time dependence uses **mission** `t` (may be negative during the T−
 * countdown hold). Do not call `performance.now()` here — wall-clock is only
 * allowed for the tower beacon pulse (`padBeaconOpacity`), which is UI chrome.
 *
 * ## Theater grade
 *
 * Looks are tuned for trench / pad cameras, not CFD or ops imagery. Opacity
 * and scale tables favor watchability over physical fidelity.
 *
 * @see earthTheater.updateStarbaseLaunchFx — impure applicator
 * @see docs/VISUAL_REALISM.md — V3 pad close-up; V14 steam punch
 */

export * from "./padLaunchFxMath";
export * from "./padLaunchFxSpecs";
export * from "./padLaunchFxDerive";
export * from "./padLaunchFxPoses";
