/**
 * Thin long coasts for packed trajectory size, preserving near-Earth detail.
 */

import type { MissionResult, PhaseId, Sample } from "./missionTypes";

/**
 * Downsample a mission result to at most `maxPoints` samples.
 * Never drops phase edges, burns, or early ascent / translunar injection / impact beats.
 */
export function downsampleTrajectory(
  result: MissionResult,
  maxPoints = 8_000,
): MissionResult {
  const s = result.samples;
  if (s.length <= maxPoints) return result;
  const out: Sample[] = [];
  const step = s.length / maxPoints;
  let next = 0;
  let prevPhase: PhaseId | null = null;
  const maxStepKm = 6_000;
  for (let i = 0; i < s.length; i++) {
    const sample = s[i]!;
    const phaseChange = prevPhase !== null && sample.phase !== prevPhase;
    const priority =
      sample.burning ||
      sample.phase === "launch" ||
      sample.phase === "ascent" ||
      sample.phase === "lowEarthOrbit" ||
      sample.phase === "translunarInjection" ||
      sample.phase === "impact" ||
      sample.phase === "landed" ||
      phaseChange ||
      i === 0 ||
      i === s.length - 1;
    let forceGap = false;
    if (out.length > 0 && !priority && i < next) {
      const prev = out[out.length - 1]!;
      const dr = Math.hypot(
        sample.pos.x - prev.pos.x,
        sample.pos.y - prev.pos.y,
        sample.pos.z - prev.pos.z,
      );
      if (dr > maxStepKm) forceGap = true;
    }
    if (i >= next || priority || forceGap) {
      out.push(sample);
      if (i >= next || forceGap) next = i + step;
      else if (phaseChange) next = i + step;
    }
    prevPhase = sample.phase;
  }
  return { ...result, samples: out };
}
