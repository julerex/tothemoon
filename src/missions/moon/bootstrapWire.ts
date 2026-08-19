/** Moon bootstrap HUD wiring. */
import * as THREE from "three";
import {createLandingBeatState} from "../../mission/landingBeatHold";
import type {Trajectory} from "../../physics/trajectoryCache";
import type { CameraDirector } from "../../camera/modes";
import {bindHud} from "../../ui/hud";
import {makeTheaterHudHandlers,type TheaterHudWire} from "../theaterHandlers";
import type { MoonAutoCam, MoonCinemaState, MoonCtx, MoonFlags } from "./bootstrap";
import type { MissionClock } from "../../mission/clock";
import type { assembleWorld} from "./bootstrapMount";
import { makeClock, makeOrient } from "./bootstrapMount";

export function makeDisableAutoCam(autoCam: MoonAutoCam, getSetUi: () => (e: boolean) => void) {
  return (): void => {
    if (!autoCam.enabled) return;
    autoCam.enabled = false;
    autoCam.finaleNudged = false;
    getSetUi()(false);
  };
}

export function makeSetOrbitsVisible(
  flags: MoonFlags,
  orbitGroup: THREE.Group,
  orbitExtras: THREE.Object3D[],
) {
  return (visible: boolean): void => {
    flags.orbitsVisible = visible;
    orbitGroup.visible = visible;
    for (const obj of orbitExtras) obj.visible = visible;
  };
}

export function makeMoonHudWire(
  clock: MissionClock,
  director: CameraDirector,
  autoCam: MoonAutoCam,
  cache: Trajectory,
  disableAutoCam: () => void,
  toggleOrbits: () => boolean,
): TheaterHudWire {
  return { clock, director, autoCam, cache, disableAutoCam, toggleOrbits };
}

export function bindHudPack(
  world: ReturnType<typeof assembleWorld>,
  clockPack: ReturnType<typeof makeClock>,
  cache: Trajectory,
  autoCam: MoonAutoCam,
  flags: MoonFlags,
) {
  let setAutoCamUi: (e: boolean) => void = () => {};
  const disableAutoCam = makeDisableAutoCam(autoCam, () => setAutoCamUi);
  const setOrbits = makeSetOrbitsVisible(flags, world.sceneParts.orbitGroup, world.orbits.orbitExtras);
  const wire = makeMoonHudWire(clockPack.clock, world.director, autoCam, cache, disableAutoCam, () => {
    const next = !flags.orbitsVisible;
    setOrbits(next);
    return next;
  });
  const hud = bindHud(clockPack.clock, clockPack.timeline, makeTheaterHudHandlers(wire), cache.samples, "chopsticks", cache.epoch);
  setAutoCamUi = hud.setAutoCamEnabled;
  world.director.setOnUserControl(() => disableAutoCam());
  return { hud, notifyAutoCamera: hud.notifyAutoCamera };
}

export function fillVecsA(craftPos: THREE.Vector3) {
  return {
    craftPos,
    craftVel: new THREE.Vector3(),
    earthPos: new THREE.Vector3(),
    earthVel: new THREE.Vector3(),
    padWorld: new THREE.Vector3(),
    craftHeading: new THREE.Vector3(0, 0, 1),
  };
}

export function fillVecsB(craft: THREE.Group, craftPos: THREE.Vector3) {
  return {
    earthVelV: new THREE.Vector3(),
    moonPosV: new THREE.Vector3(),
    moonVelV: new THREE.Vector3(),
    skyEarth: new THREE.Vector3(),
    skySun: new THREE.Vector3(),
    orient: makeOrient(craft, craftPos),
  };
}

export function fillVecs(craft: THREE.Group, craftPos: THREE.Vector3) {
  return { ...fillVecsA(craftPos), ...fillVecsB(craft, craftPos) };
}

export function worldFieldsA(world: ReturnType<typeof assembleWorld>) {
  return {
    renderer: world.renderer,
    camera: world.camera,
    director: world.director,
    scene: world.sceneParts.scene,
    sunLight: world.sceneParts.sunLight,
  };
}

export function worldFieldsB(world: ReturnType<typeof assembleWorld>) {
  return {
    fillLight: world.sceneParts.fillLight,
    earthshine: world.sceneParts.earthshine,
    orbitGroup: world.sceneParts.orbitGroup,
    bodies: world.bodies,
    groundSky: world.groundSky,
  };
}

export function craftFieldsA(world: ReturnType<typeof assembleWorld>) {
  return {
    starbasePad: world.pad.starbasePad,
    craftTrail: world.pad.craftTrail,
    moonRelOrbit: world.orbits.moonRelOrbit,
    orbitExtras: world.orbits.orbitExtras,
    craft: world.craft,
  };
}

export function craftFieldsB(world: ReturnType<typeof assembleWorld>) {
  return {
    cinema: world.cinema,
    cinemaState: { burning: false, phase: "launch" } satisfies MoonCinemaState,
    vectorArrows: world.vectorArrows,
    stagingFx: world.fx.stagingFx,
    stageT: world.fx.stageT,
    landingFx: world.fx.landingFx,
  };
}

export function runtimeFields(
  clockPack: ReturnType<typeof makeClock>,
  autoCam: MoonAutoCam,
  flags: MoonFlags,
  hudPack: ReturnType<typeof bindHudPack>,
) {
  return {
    clock: clockPack.clock, physicsDurationS: clockPack.physicsDurationS,
    transportS: clockPack.transportS, autoCam, landingBeat: createLandingBeatState(),
    flags, notifyAutoCamera: hudPack.notifyAutoCamera, hud: hudPack.hud, wall: new THREE.Clock(),
  };
}

export function finishMoon(
  canvas: HTMLCanvasElement,
  cache: Trajectory,
  world: ReturnType<typeof assembleWorld>,
  clockPack: ReturnType<typeof makeClock>,
  autoCam: MoonAutoCam,
  flags: MoonFlags,
  hudPack: ReturnType<typeof bindHudPack>,
): MoonCtx {
  return {
    canvas, cache, epoch: cache.epoch, ...worldFieldsA(world), ...worldFieldsB(world),
    ...craftFieldsA(world), ...craftFieldsB(world), ...fillVecs(world.craft, new THREE.Vector3()),
    ...runtimeFields(clockPack, autoCam, flags, hudPack),
  };
}

export function runtimePack(world: ReturnType<typeof assembleWorld>, cache: Trajectory) {
  const clockPack = makeClock(cache);
  const autoCam: MoonAutoCam = { enabled: true, phase: null, staged: false, finaleNudged: false };
  const flags: MoonFlags = { orbitsVisible: true };
  const hudPack = bindHudPack(world, clockPack, cache, autoCam, flags);
  return { clockPack, autoCam, flags, hudPack };
}

