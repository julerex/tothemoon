import * as THREE from "three";
import {
  entryFlapDeflectionRad,
  shipAttitudeMode,
} from "../../physics/flight13Attitude";
import type { PhaseId } from "../../physics/missionTypes";
import {
  frostPatchOpacity,
  frostStrength,
  ICE_FLAKES,
  iceFlakePose,
  iceShedStrength,
} from "../craftFrost";
import { tileGroutGlow } from "../craftHullMaps";
import { entryHeatEmissiveRgb } from "../entryPlasma";
import { hullWetStrength } from "../terminalFx";
import type { CraftVisualState } from "./visualsTypes";

/**
 * Theater maximum dynamic pressure condensation strength in [0,1].
 */
function condensationStrength(
  phase: string | undefined,
  missionT: number,
  burning: boolean,
): number {
  if (!burning) return 0;
  if (phase !== "launch" && phase !== "ascent") return 0;
  if (missionT < 8 || missionT > 140) return 0;
  return condensationBell(missionT);
}

function condensationBell(missionT: number): number {
  const d = (missionT - 55) / 22;
  const bell = Math.exp(-0.5 * d * d);
  const padGate = THREE.MathUtils.smoothstep(missionT, 12, 28);
  return THREE.MathUtils.clamp(bell * padGate * 1.2, 0, 1);
}

export function updateCondensation(
  condense: THREE.Object3D | undefined,
  phase: string | undefined,
  missionT: number,
  burning: boolean,
): void {
  if (!condense) return;
  const str = condensationStrength(phase, missionT, burning);
  condense.visible = str > 0.03;
  if (str > 0.03) applyCondensationVisual(condense, str, missionT);
}

function applyCondensationVisual(
  condense: THREE.Object3D,
  str: number,
  missionT: number,
): void {
  const wobble =
    0.92 + 0.08 * Math.sin(missionT * 7.3) + 0.04 * Math.sin(missionT * 13.1 + 0.5);
  condense.traverse((obj) => updateCondenseChild(obj, str, missionT, wobble));
}

function updateCondenseChild(
  obj: THREE.Object3D,
  str: number,
  missionT: number,
  wobble: number,
): void {
  if (obj instanceof THREE.Sprite) updateCondenseSprite(obj, str, missionT, wobble);
  else if (obj.name === "condense-sheath") updateCondenseSheath(obj, str, wobble);
}

function updateCondenseSprite(
  obj: THREE.Sprite,
  str: number,
  missionT: number,
  wobble: number,
): void {
  const mat = obj.material as THREE.SpriteMaterial;
  const phase = (obj.userData.phase as number) ?? 0;
  const local = str * (0.75 + 0.25 * Math.sin(missionT * 5.1 + phase)) * wobble;
  mat.opacity = 0.35 * local;
  const base = (obj.userData.baseScale as number) ?? 1;
  const grow = base * (0.85 + 0.55 * str) * (0.95 + 0.08 * Math.sin(missionT * 4 + phase));
  obj.scale.setScalar(grow);
}

function updateCondenseSheath(obj: THREE.Object3D, str: number, wobble: number): void {
  const mat =
    (obj.userData.mat as THREE.MeshBasicMaterial | undefined) ??
    ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial);
  mat.opacity = 0.12 * str * wobble;
  obj.scale.set(1 + 0.15 * str, 1 + 0.15 * str, 1);
}

function frostFxInput(state: CraftVisualState, missionT: number) {
  return {
    missionT,
    phase: state.phase,
    burning: state.burning,
    altEarth: state.altEarth ?? 0,
  };
}

export function updateFrostAndIce(
  group: THREE.Group,
  state: CraftVisualState,
  missionT: number,
): void {
  const fx = frostFxInput(state, missionT);
  updateFrostPatches(group.getObjectByName("frost-patches"), frostStrength(fx), missionT);
  updateIceFlakes(group.getObjectByName("ice-flakes"), iceShedStrength(fx), missionT);
}

function updateFrostPatches(
  patches: THREE.Object3D | undefined,
  frostStr: number,
  missionT: number,
): void {
  if (!patches) return;
  patches.visible = frostStr > 0.04;
  if (frostStr <= 0.04) return;
  patches.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const phase = (obj.userData.phase as number) ?? 0;
    const mat =
      (obj.userData.mat as THREE.MeshStandardMaterial | undefined) ??
      (obj.material as THREE.MeshStandardMaterial);
    mat.opacity = frostPatchOpacity(frostStr, phase, missionT);
  });
}

function iceFlakeSpecFromUserData(obj: THREE.Sprite): (typeof ICE_FLAKES)[number] {
  return {
    ang: (obj.userData.ang as number) ?? 0,
    r0: (obj.userData.r0 as number) ?? 0.13,
    z0: (obj.userData.z0 as number) ?? 0.5,
    scale: (obj.userData.scale as number) ?? 0.03,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updateIceFlakes(
  flakes: THREE.Object3D | undefined,
  iceStr: number,
  missionT: number,
): void {
  if (!flakes) return;
  flakes.visible = iceStr > 0.03;
  if (iceStr <= 0.03) return;
  flakes.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    const pose = iceFlakePose(iceFlakeSpecFromUserData(obj), iceStr, missionT);
    const mat = obj.material as THREE.SpriteMaterial;
    mat.opacity = pose.opacity;
    obj.position.set(pose.position.x, pose.position.y, pose.position.z);
    obj.scale.set(pose.scale.x, pose.scale.y, 1);
  });
}

type HeatMats = {
  tile: THREE.MeshStandardMaterial;
  tileWear: THREE.MeshStandardMaterial;
  tileRough0: number;
  wearRough0: number;
};

/**
 * Windward tile glow / char from entry plasma. Theater-grade — not a heat map.
 * Intensity is scrub-safe via {@link CraftVisualState.plasmaStrength}.
 * V15: violet plasma fill; residual grout into descent stays warm.
 */
export function updateEntryHeat(group: THREE.Group, plasma: number, phase?: string): void {
  const ship = group.getObjectByName("ship");
  const mats = ship?.userData.heatMats as HeatMats | undefined;
  if (!mats) return;
  const p = Number.isFinite(plasma) ? Math.max(0, Math.min(1, plasma)) : 0;
  const u = tileGroutGlow(p, phase);
  const heat = entryHeatEmissiveRgb(p, u);
  mats.tile.emissive.setRGB(heat.tile.r, heat.tile.g, heat.tile.b);
  mats.tile.emissiveIntensity = heat.tileIntensity;
  mats.tileWear.emissive.setRGB(heat.tileWear.r, heat.tileWear.g, heat.tileWear.b);
  mats.tileWear.emissiveIntensity = heat.wearIntensity;
}

/** Post-contact wet / charred hull (V17) — roughness punch, no new mesh. */
export function updateHullWet(
  group: THREE.Group,
  phase: string | undefined,
  altEarth: number | undefined,
): void {
  const ship = group.getObjectByName("ship");
  const mats = ship?.userData.heatMats as HeatMats | undefined;
  if (!mats) return;
  const wet = hullWetStrength(phase, altEarth);
  mats.tile.roughness = mats.tileRough0 + 0.18 * wet;
  mats.tileWear.roughness = mats.wearRough0 + 0.22 * wet;
}

const FWD_FLAP_NAMES = ["fwd-flap-L", "fwd-flap-R"] as const;
const AFT_ELEVON_NAMES = ["aft-elevon-L", "aft-elevon-R"] as const;

function setPivotPitch(group: THREE.Group, name: string, pitch: number): void {
  const pivot = group.getObjectByName(name);
  if (pivot) pivot.rotation.x = pitch;
}

/**
 * Belly-flop flap / elevon angles from mission phase (Flight 13 window only).
 */
export function updateControlSurfaces(group: THREE.Group, state: CraftVisualState): void {
  const t = state.missionT ?? 0;
  const phase = (state.phase ?? "launch") as PhaseId;
  const alt = state.altEarth ?? 200;
  const mode = shipAttitudeMode(t, phase, alt, state.burning);
  const def = entryFlapDeflectionRad(t, phase, alt, mode);
  for (const name of FWD_FLAP_NAMES) setPivotPitch(group, name, def.fwd);
  for (const name of AFT_ELEVON_NAMES) setPivotPitch(group, name, def.aft);
}
