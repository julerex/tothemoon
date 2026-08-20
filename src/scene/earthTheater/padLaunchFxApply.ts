/** Apply pad launch FX poses and lighting from mission state. */
import * as THREE from "three";
import {
  bloomVisual, derivePadFx, flameVisual, floodFixtureEmissive,
  floodSpotDistance, floodSpotIntensity, groundSheetPose, hazeSpritePose,
  olmLampColorHex, padBeaconOpacity, padFillColorHex, padFillDistance,
  padFillIntensity, plumeLightDistance, plumeLightIntensity, plumeLightRgb,
  sheetSpritePose, steamSpritePose, steamTintRgb, steamWarmth, tongueVisual,
  ventCloudOpacity, ventCloudPose, VENT_CLOUD_VISIBLE_EPS, type LaunchPadFxState,
} from "../padLaunchFx";

function applySpritePose(
  obj: THREE.Sprite,
  pose: { opacity: number; position: { x: number; y: number; z: number }; scale: { x: number; y: number } },
): void {
  const mat = obj.material as THREE.SpriteMaterial;
  mat.opacity = pose.opacity;
  obj.position.set(pose.position.x, pose.position.y, pose.position.z);
  obj.scale.set(pose.scale.x, pose.scale.y, 1);
}

function updatePadFlame(pad: THREE.Object3D, strength: number): void {
  const flameMesh = pad.getObjectByName("pad-flame") as THREE.Mesh | undefined;
  if (flameMesh) {
    const fv = flameVisual(strength);
    const mat = (flameMesh.userData.mat as THREE.MeshBasicMaterial) ?? (flameMesh.material as THREE.MeshBasicMaterial);
    flameMesh.visible = fv.visible;
    mat.opacity = fv.opacity;
    flameMesh.scale.set(1, fv.scaleY, 1);
  }
  updatePadTongues(pad, strength);
}

function updatePadTongues(pad: THREE.Object3D, strength: number): void {
  const tongues = pad.getObjectByName("pad-flame-tongues");
  if (!tongues) return;
  const tv = tongueVisual(strength);
  tongues.visible = tv.visible;
  const mat = tongues.userData.mat as THREE.MeshBasicMaterial | undefined;
  if (mat) mat.opacity = tv.opacity;
  tongues.scale.set(1, tv.scaleY, 1);
}

function steamBaseFromUserData(obj: THREE.Sprite) {
  return {
    baseAng: (obj.userData.baseAng as number) ?? 0,
    baseR: (obj.userData.baseR as number) ?? 0.04,
    baseY: (obj.userData.baseY as number) ?? 0.02,
    baseScale: (obj.userData.baseScale as number) ?? 0.1,
    phase: (obj.userData.phase as number) ?? 0,
    tier: (obj.userData.tier as number) ?? 0,
  };
}

function tintSteamSprite(obj: THREE.Sprite, warmth: number, night: number): void {
  const [r, g, b] = steamTintRgb(warmth, night);
  (obj.material as THREE.SpriteMaterial).color.setRGB(r, g, b);
}

function updatePadSteam(
  pad: THREE.Object3D,
  steamStr: number,
  night: number,
  animT: number,
  warmth: number,
): void {
  const steam = pad.getObjectByName("pad-steam");
  if (!steam) return;
  steam.visible = steamStr > 0.03;
  steam.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    applySpritePose(obj, steamSpritePose(steamBaseFromUserData(obj), steamStr, night, animT));
    tintSteamSprite(obj, warmth * 0.55, night);
  });
}

function sheetBaseFromUserData(obj: THREE.Sprite) {
  return {
    baseX: (obj.userData.baseX as number) ?? 0,
    baseY: (obj.userData.baseY as number) ?? 0,
    baseZ: (obj.userData.baseZ as number) ?? 0,
    baseSx: (obj.userData.baseSx as number) ?? 0.05,
    baseSy: (obj.userData.baseSy as number) ?? 0.04,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updatePadSheets(
  pad: THREE.Object3D,
  steamStr: number,
  night: number,
  animT: number,
  warmth: number,
): void {
  const sheets = pad.getObjectByName("pad-deluge-sheets");
  if (!sheets) return;
  sheets.visible = steamStr > 0.04;
  sheets.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    applySpritePose(obj, sheetSpritePose(sheetBaseFromUserData(obj), steamStr, night, animT));
    tintSteamSprite(obj, warmth * 0.85, night);
  });
}

function updatePadGroundSteam(
  pad: THREE.Object3D,
  steamStr: number,
  night: number,
  animT: number,
  warmth: number,
): void {
  const ground = pad.getObjectByName("pad-ground-steam");
  if (!ground) return;
  ground.visible = steamStr > 0.04;
  ground.traverse((obj) => {
    if (!(obj instanceof THREE.Sprite)) return;
    applySpritePose(obj, groundSheetPose(sheetBaseFromUserData(obj), steamStr, night, animT));
    tintSteamSprite(obj, warmth, night);
  });
}

function hazeBaseFromUserData(obj: THREE.Object3D) {
  return {
    baseZ: (obj.userData.baseZ as number) ?? 0,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updatePadHaze(pad: THREE.Object3D, hazePeak: number, animT: number): void {
  const haze = pad.getObjectByName("pad-heat-haze");
  if (!haze) return;
  haze.visible = hazePeak > 0.04;
  haze.traverse((obj) => {
    if (obj instanceof THREE.Sprite) applySpritePose(obj, hazeSpritePose(hazeBaseFromUserData(obj), hazePeak, animT));
  });
}

function ventCloudSpecFromUserData(obj: THREE.Object3D) {
  return {
    x: (obj.userData.baseX as number) ?? 0,
    y: (obj.userData.baseY as number) ?? 0,
    z: (obj.userData.baseZ as number) ?? 0,
    scale: (obj.userData.baseScale as number) ?? 0.02,
    phase: (obj.userData.phase as number) ?? 0,
  };
}

function updatePadVent(pad: THREE.Object3D, ventStr: number, night: number, animT: number): void {
  const vent = pad.getObjectByName("pad-vent-steam");
  if (!vent) return;
  const on = ventStr > VENT_CLOUD_VISIBLE_EPS;
  vent.visible = on;
  if (!on) return;
  const mat = vent.userData.mat as THREE.MeshLambertMaterial | undefined;
  if (mat) mat.opacity = ventCloudOpacity(ventStr, night);
  for (const child of vent.children) {
    if (!child.userData.cloud) continue;
    const pose = ventCloudPose(ventCloudSpecFromUserData(child), ventStr, animT);
    child.position.set(pose.x, pose.y, pose.z);
    child.scale.setScalar(pose.scale);
  }
}

function updatePadFloods(
  pad: THREE.Object3D,
  floodBase: number,
  strength: number,
  night: number,
): void {
  for (let i = 0; i < 3; i++) {
    const spot = pad.getObjectByName(`pad-flood-${i}`) as THREE.SpotLight | undefined;
    if (!spot) continue;
    spot.intensity = floodSpotIntensity(floodBase, strength, i);
    spot.distance = floodSpotDistance(night);
  }
}

function updatePadFillLight(
  pad: THREE.Object3D,
  padOps: boolean,
  day: number,
  night: number,
  strength: number,
): void {
  const fill = pad.getObjectByName("pad-fill") as THREE.PointLight | undefined;
  if (!fill) return;
  fill.intensity = padFillIntensity(padOps, day, night, strength);
  fill.color.setHex(padFillColorHex(strength));
  fill.distance = padFillDistance(night);
}

function updatePadPlumeLight(pad: THREE.Object3D, strength: number, flicker: number): void {
  const plume = pad.getObjectByName("pad-plume-light") as THREE.PointLight | undefined;
  if (!plume) return;
  plume.intensity = plumeLightIntensity(strength);
  plume.distance = plumeLightDistance(strength);
  const [r, g, b] = plumeLightRgb(flicker);
  plume.color.setRGB(r, g, b);
}

function updatePadFixtures(pad: THREE.Object3D, floodBase: number): void {
  for (let i = 0; i < 3; i++) {
    const fixture = pad.getObjectByName(`pad-flood-fixture-${i}`) as THREE.Mesh | undefined;
    if (!fixture) continue;
    (fixture.material as THREE.MeshStandardMaterial).emissiveIntensity = floodFixtureEmissive(floodBase);
  }
}

function updatePadOlmLamps(pad: THREE.Object3D, padOps: boolean, night: number): void {
  for (let i = 0; i < 8; i++) {
    const lamp = pad.getObjectByName(`pad-olm-lamp-${i}`) as THREE.Mesh | undefined;
    if (!lamp) continue;
    lamp.visible = padOps;
    const mat = lamp.material as THREE.MeshBasicMaterial;
    mat.opacity = 1;
    mat.color.setHex(olmLampColorHex(padOps, night));
  }
}

function updatePadBloom(pad: THREE.Object3D, strength: number, flicker: number): void {
  const bloom = pad.getObjectByName("pad-ground-bloom") as THREE.Sprite | undefined;
  if (!bloom) return;
  const bv = bloomVisual(strength, flicker);
  bloom.visible = bv.visible;
  if (bv.visible) {
    (bloom.material as THREE.SpriteMaterial).opacity = bv.opacity;
    bloom.scale.set(bv.scale, bv.scale, 1);
  }
}

function updatePadSpriteFx(
  pad: THREE.Object3D,
  steamStr: number,
  hazePeak: number,
  ventStr: number,
  night: number,
  animT: number,
  flameStrength: number,
): void {
  const warmth = steamWarmth(flameStrength);
  updatePadSteam(pad, steamStr, night, animT, warmth);
  updatePadSheets(pad, steamStr, night, animT, warmth);
  updatePadGroundSteam(pad, steamStr, night, animT, warmth);
  updatePadHaze(pad, hazePeak, animT);
  updatePadVent(pad, ventStr, night, animT);
}

function updatePadLightingFx(
  pad: THREE.Object3D,
  fx: ReturnType<typeof derivePadFx>,
): void {
  const { day, night, flame, padOps, floodBase } = fx;
  const { strength, flicker } = flame;
  updatePadFloods(pad, floodBase, strength, night);
  updatePadFillLight(pad, padOps, day, night, strength);
  updatePadPlumeLight(pad, strength, flicker);
  updatePadFixtures(pad, floodBase);
  updatePadOlmLamps(pad, padOps, night);
  updatePadBloom(pad, strength, flicker);
}

/**
 * Drive flame trench, deluge steam / sheets, heat haze, vent plumes, and pad
 * lighting from mission state.
 *
 * **Scrub-safe:** scalars and poses come only from pure helpers in
 * `padLaunchFx.ts` (`derivePadFx`, `*SpritePose`, `*Visual`). This function
 * mutates THREE objects and does not allocate new meshes.
 *
 * @param pad - Root from {@link createStarbasePad}
 * @param state - Mission sample fields + optional `sunElev`
 */
export function updateStarbaseLaunchFx(
  pad: THREE.Object3D,
  state: LaunchPadFxState,
): void {
  const fx = derivePadFx(state);
  const { animT, night, flame, steamStr, hazePeak, ventStr } = fx;
  updatePadFlame(pad, flame.strength);
  updatePadSpriteFx(pad, steamStr, hazePeak, ventStr, night, animT, flame.strength);
  updatePadLightingFx(pad, fx);
}
/**
 * Pulse the tower beacon opacity from **wall-clock** time.
 *
 * UI chrome only — not scrub-critical. Opacity comes from pure
 * {@link padBeaconOpacity}; do not drive this from mission `t`.
 *
 * @param pad - Starbase pad root
 * @param wallT - Seconds of wall time (e.g. `performance.now() / 1000`)
 */
export function pulsePadBeacon(pad: THREE.Object3D, wallT: number): void {
  const beacon = pad.getObjectByName("pad-beacon") as THREE.Mesh | undefined;
  if (!beacon) return;
  const mat = beacon.material as THREE.MeshBasicMaterial;
  mat.opacity = padBeaconOpacity(wallT);
}