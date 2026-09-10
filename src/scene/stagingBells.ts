/**
 * Detached Super Heavy bell opacity for recovery burns.
 * Materials are cloned so dimming does not leak onto the stacked booster.
 */
import * as THREE from "three";
import {
  BOOSTER_LANDING_ENGINES,
  boosterEngineLit,
  gulfLandingEngineCount,
} from "../physics/boosterLandingEngines";
import type { RecoveryProfile, RecoverySchedule } from "../physics/boosterRecovery";

/** Clone booster-engine materials on the free-flyer so opacity is local. */
export function uniquifyBellMaterials(root: THREE.Object3D): void {
  const bells = root.getObjectByName("booster-engines");
  if (!bells) return;
  bells.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map((m) => m.clone())
      : obj.material.clone();
  });
}

function setChildBellOpacity(child: THREE.Object3D, active: boolean): void {
  child.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (m && "opacity" in m) {
        const mat = m as THREE.Material & { opacity: number };
        mat.transparent = true;
        mat.opacity = active ? 1 : 0.22;
      }
    }
  });
}

/** Dim failed / outer-ring bells on the detached clone (scrub-deterministic). */
export function applyDetachedBoosterBells(
  booster: THREE.Object3D,
  opts: {
    burning: boolean;
    phase: string;
    age: number;
    profile: RecoveryProfile;
    sched: RecoverySchedule;
  },
): void {
  const bells = booster.getObjectByName("booster-engines");
  if (!bells) return;
  const litCount = opts.profile === "gulf" && opts.phase === "landing"
    ? gulfLandingEngineCount(opts.age, opts.sched)
    : BOOSTER_LANDING_ENGINES;
  for (let i = 0; i < bells.children.length; i++) {
    setChildBellOpacity(
      bells.children[i]!,
      boosterEngineLit(i, {
        burning: opts.burning,
        phase: opts.phase,
        litCount,
      }),
    );
  }
}
