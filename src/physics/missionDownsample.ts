/**
 * Thin long coasts for packed trajectory size, preserving near-Earth detail.
 */

import type { MissionResult, PhaseId, Sample } from "./missionTypes";

const PRIORITY_PHASES = new Set<PhaseId>([
  "launch", "ascent", "lowEarthOrbit", "translunarInjection",
  "approach", "braking", "descent", "impact", "landed", "entry", "splashdown",
]);

function isPrioritySample(
  sample: Sample, phaseChange: boolean, i: number, n: number,
): boolean {
  return (
    sample.burning || PRIORITY_PHASES.has(sample.phase) ||
    phaseChange || i === 0 || i === n - 1
  );
}

function gapTooLarge(out: Sample[], sample: Sample, maxStepKm: number): boolean {
  if (out.length === 0) return false;
  const prev = out[out.length - 1]!;
  const dr = Math.hypot(
    sample.pos.x - prev.pos.x, sample.pos.y - prev.pos.y, sample.pos.z - prev.pos.z,
  );
  return dr > maxStepKm;
}

function advanceNext(next: number, i: number, step: number, forceGap: boolean, phaseChange: boolean): number {
  if (i >= next || forceGap) return i + step;
  if (phaseChange) return i + step;
  return next;
}

function considerSample(
  out: Sample[], sample: Sample, i: number, n: number, next: number, step: number, prevPhase: PhaseId | null,
): number {
  const phaseChange = prevPhase !== null && sample.phase !== prevPhase;
  const priority = isPrioritySample(sample, phaseChange, i, n);
  const forceGap = !priority && i < next && gapTooLarge(out, sample, 6_000);
  if (i >= next || priority || forceGap) {
    out.push(sample);
    return advanceNext(next, i, step, forceGap, phaseChange);
  }
  return next;
}

function downsampleSamples(s: Sample[], maxPoints: number): Sample[] {
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  let prevPhase: PhaseId | null = null;
  for (let i = 0; i < s.length; i++) {
    next = considerSample(out, s[i]!, i, s.length, next, step, prevPhase);
    prevPhase = s[i]!.phase;
  }
  return out;
}

/**
 * Downsample a mission result to at most `maxPoints` samples.
 * Never drops phase edges, burns, or early ascent / translunar injection / impact beats.
 */
export function downsampleTrajectory(
  result: MissionResult,
  maxPoints = 8_000,
): MissionResult {
  if (result.samples.length <= maxPoints) return result;
  return { ...result, samples: downsampleSamples(result.samples, maxPoints) };
}
