/** F13 bootstrap HUD wiring. */
import * as THREE from "three";
import {createLandingBeatState} from "../../mission/landingBeatHold";
import type {Trajectory} from "../../physics/trajectoryCache";
import type { CameraDirector, CameraMode } from "../../camera/modes";
import {bindHud} from "../../ui/hud";
import {makeTheaterHudHandlers,wireCanvasPointer,type TheaterHudWire} from "../theaterHandlers";
import type {F13AutoCam,F13CinemaState,F13Ctx,F13Flags} from "./bootstrap";
import type {MissionClock} from "../../mission/clock";
import type {timelineWithPrelaunch} from "../../mission/prelaunch";
import type {assembleWorld,loadEpochBundle} from "./bootstrapMount";
import {makeClockAndTimeline,makeOrient} from "./bootstrapMount";
type RuntimeHudWire={clock:MissionClock;timeline:ReturnType<typeof timelineWithPrelaunch>;director:CameraDirector;autoCam:F13AutoCam;cache:Trajectory;orbitGroup:THREE.Group;orbitExtras:THREE.Object3D[];flags:F13Flags;};

export function makeDisableAutoCam(autoCam: F13AutoCam, getSetUi: () => (e: boolean) => void) {
  return (): void => {
    if (!autoCam.enabled) return;
    autoCam.enabled = false;
    getSetUi()(false);
  };
}

export function makeSetOrbitsVisible(w: RuntimeHudWire) {
  return (visible: boolean): void => {
    w.flags.orbitsVisible = visible;
    w.orbitGroup.visible = visible;
    for (const obj of w.orbitExtras) obj.visible = visible;
  };
}

export function makeHudWire(
  w: RuntimeHudWire,
  disableAutoCam: () => void,
  setOrbitsVisible: (v: boolean) => void,
): TheaterHudWire {
  return {
    clock: w.clock, director: w.director, autoCam: w.autoCam, cache: w.cache,
    disableAutoCam, toggleOrbits: () => {
      const next = !w.flags.orbitsVisible;
      setOrbitsVisible(next);
      return next;
    },
  };
}

export function bindRuntimeHud(w: RuntimeHudWire): {
  hud: ReturnType<typeof bindHud>;
  setAutoCamUi: (e: boolean) => void;
  notifyAutoCamera: (m: CameraMode) => void;
  disableAutoCam: () => void;
} {
  let setAutoCamUi: (e: boolean) => void = () => {};
  const disableAutoCam = makeDisableAutoCam(w.autoCam, () => setAutoCamUi);
  const wire = makeHudWire(w, disableAutoCam, makeSetOrbitsVisible(w));
  const hud = bindHud(w.clock, w.timeline, makeTheaterHudHandlers(wire), w.cache.samples, "gulf", w.cache.epoch);
  setAutoCamUi = hud.setAutoCamEnabled;
  w.director.setOnUserControl(() => disableAutoCam());
  return { hud, setAutoCamUi, notifyAutoCamera: hud.notifyAutoCamera, disableAutoCam };
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

export function fillVecsB(craft: THREE.Object3D, craftPos: THREE.Vector3) {
  return {
    earthVelV: new THREE.Vector3(),
    moonPosV: new THREE.Vector3(),
    moonVelV: new THREE.Vector3(),
    skyEarth: new THREE.Vector3(),
    skySun: new THREE.Vector3(),
    ...fillSplashScratch(),
    orient: makeOrient(craft, craftPos),
  };
}

export function fillSplashScratch() {
  return {
    splashMesh: { x: 0, y: 0, z: 0 },
    splashWorld: { x: 0, y: 0, z: 0 },
  };
}

export function fillVectors(craft: THREE.Object3D, craftPos: THREE.Vector3) {
  return { ...fillVecsA(craftPos), ...fillVecsB(craft, craftPos) };
}

export function worldSliceA(world: ReturnType<typeof assembleWorld>) {
  return {
    renderer: world.renderer,
    camera: world.camera,
    director: world.director,
    scene: world.sceneParts.scene,
    sunLight: world.sceneParts.sunLight,
  };
}

export function worldSliceB(world: ReturnType<typeof assembleWorld>) {
  return {
    fillLight: world.sceneParts.fillLight,
    earthshine: world.sceneParts.earthshine,
    orbitGroup: world.sceneParts.orbitGroup,
    bodies: world.bodies,
    groundSky: world.groundSky,
  };
}

export function craftSliceA(world: ReturnType<typeof assembleWorld>) {
  return {
    starbasePad: world.pad.starbasePad,
    moonRelOrbit: world.orbits.moonRelOrbit,
    orbitExtras: world.orbits.orbitExtras,
    craft: world.craft,
    cinema: world.cinema,
  };
}

export function initialCinemaState(): F13CinemaState {
  return { burning: false, phase: "launch", plasma: 0, altEarth: 0 };
}

export function craftSliceB(world: ReturnType<typeof assembleWorld>) {
  return {
    cinemaState: initialCinemaState(),
    vectorArrows: world.vectorArrows,
    stagingFx: world.fx.stagingFx,
    stageT: world.fx.stageT,
    splashFx: world.fx.splashFx,
    gulfLandFx: world.fx.gulfLandFx,
    entryFx: world.fx.entryFx,
    payloadFx: world.fx.payloadFx,
  };
}

export function hudSlice(p: {
  clockPack: ReturnType<typeof makeClockAndTimeline>;
  autoCam: F13AutoCam;
  flags: F13Flags;
  hudPack: ReturnType<typeof bindRuntimeHud>;
}) {
  return {
    clock: p.clockPack.clock, physicsDurationS: p.clockPack.physicsDurationS,
    transportS: p.clockPack.transportS, autoCam: p.autoCam,
    landingBeat: createLandingBeatState(), flags: p.flags,
    setAutoCamUi: p.hudPack.setAutoCamUi, notifyAutoCamera: p.hudPack.notifyAutoCamera,
    disableAutoCam: p.hudPack.disableAutoCam, hud: p.hudPack.hud, wall: new THREE.Clock(),
  };
}

export function metaSlice(p: {
  canvas: HTMLCanvasElement;
  cache: Trajectory;
  epoch: F13Ctx["epoch"];
  forceCompareLine: string;
}) {
  return {
    canvas: p.canvas,
    cache: p.cache,
    epoch: p.epoch,
    forceCompareLine: p.forceCompareLine,
  };
}

export function mergeWorld(w: ReturnType<typeof assembleWorld>) {
  return {
    ...worldSliceA(w),
    ...worldSliceB(w),
    ...craftSliceA(w),
    ...craftSliceB(w),
  };
}

type FinishParts = {
  canvas: HTMLCanvasElement;
  cache: Trajectory;
  epoch: F13Ctx["epoch"];
  forceCompareLine: string;
  world: ReturnType<typeof assembleWorld>;
  clockPack: ReturnType<typeof makeClockAndTimeline>;
  autoCam: F13AutoCam;
  flags: F13Flags;
  hudPack: ReturnType<typeof bindRuntimeHud>;
  vecs: ReturnType<typeof fillVectors>;
};

export function finishCtx(p: FinishParts): F13Ctx {
  return { ...metaSlice(p), ...mergeWorld(p.world), ...p.vecs, ...hudSlice(p) };
}

export function wireBootstrapHud(
  world: ReturnType<typeof assembleWorld>,
  clockPack: ReturnType<typeof makeClockAndTimeline>,
  cache: Trajectory,
  autoCam: F13AutoCam,
  flags: F13Flags,
) {
  return bindRuntimeHud({
    clock: clockPack.clock, timeline: clockPack.timeline, director: world.director,
    autoCam, cache, orbitGroup: world.sceneParts.orbitGroup,
    orbitExtras: world.orbits.orbitExtras, flags,
  });
}

export function runtimePack(world: ReturnType<typeof assembleWorld>, cache: Trajectory) {
  const clockPack = makeClockAndTimeline(cache);
  const autoCam: F13AutoCam = { enabled: true, phase: null, staged: false, shotKey: null };
  const flags: F13Flags = { orbitsVisible: true };
  const hudPack = wireBootstrapHud(world, clockPack, cache, autoCam, flags);
  return { clockPack, autoCam, flags, hudPack };
}

export function finishBootstrap(
  canvas: HTMLCanvasElement,
  bundle: ReturnType<typeof loadEpochBundle>,
  world: ReturnType<typeof assembleWorld>,
  rt: ReturnType<typeof runtimePack>,
): F13Ctx {
  wireCanvasPointer(canvas, world.camera, world.vectorArrows);
  return finishCtx({
    canvas,
    ...bundle,
    world,
    ...rt,
    vecs: fillVectors(world.craft, new THREE.Vector3()),
  });
}
