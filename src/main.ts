import * as THREE from "three";
import { MissionClock } from "./mission/clock";
import { TrajectoryCache } from "./physics/trajectoryCache";
import { bodyPositions, setMoonPhase0 } from "./physics/bodies";
import { R_MOON } from "./physics/constants";
import { createScene } from "./scene/createScene";
import { createBodies, spinBodies, updateBodies } from "./scene/bodies";
import {
  createCraft,
  setPlumeVisible,
  updateLocatorVisibility,
} from "./scene/craft";
import { createTrailFromPoints, createPathGlowFromPoints } from "./scene/trail";
import { CameraDirector, type CameraMode } from "./camera/modes";
import { bindHud } from "./ui/hud";
import "./style.css";

const canvasEl = document.querySelector<HTMLCanvasElement>("#c");
if (!canvasEl) throw new Error("Canvas #c not found");
const canvas = canvasEl;

// Trajectory is baked at build time (scripts/precompute-trajectory.ts).
// Pass ?recompute=1 to re-run RK4 in the browser (slow, for physics debugging).
const recompute =
  typeof location !== "undefined" &&
  new URLSearchParams(location.search).has("recompute");
if (recompute) {
  const phaseBoot = document.querySelector("#phase");
  if (phaseBoot) phaseBoot.textContent = "Recomputing trajectory…";
}
const cache = recompute
  ? TrajectoryCache.compute()
  : TrajectoryCache.loadPrecomputed();
setMoonPhase0(cache.moonPhase0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  logarithmicDepthBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const camera = new THREE.PerspectiveCamera(50, 1, 1, 2_000_000);
const director = new CameraDirector(camera, canvas);

const { scene, sunLight } = createScene();
const bodies = createBodies();
scene.add(bodies.earthGroup, bodies.moonGroup, bodies.sunGroup);

const trailPts = cache.trailPoints(1500);
scene.add(createTrailFromPoints(trailPts));
scene.add(createPathGlowFromPoints(trailPts));

const { group: craft, locator } = createCraft();
scene.add(craft);

const clock = new MissionClock();
// Mission duration drives scrub; default faster for multi-day flight
clock.setSpeed(100);

const craftPos = new THREE.Vector3();
const craftVel = new THREE.Vector3();
const craftTan = new THREE.Vector3();
const _look = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

const hud = bindHud(clock, {
  onPlayToggle: () => clock.toggle(),
  onSpeed: (s) => clock.setSpeed(s),
  onScrub: (t) => clock.seek(t),
  onCamera: (mode: CameraMode) => director.setMode(mode),
});

// Prefer 100× selected in UI if present
const speedSel = document.querySelector<HTMLSelectElement>("#speed");
if (speedSel) {
  speedSel.value = "100";
  // ensure option exists
  if (![...speedSel.options].some((o) => o.value === "100")) {
    const opt = document.createElement("option");
    opt.value = "100";
    opt.textContent = "100×";
    speedSel.appendChild(opt);
    speedSel.value = "100";
  }
}

function orientCraft(vel: THREE.Vector3): void {
  if (vel.lengthSq() < 1e-12) return;
  craftTan.copy(vel).normalize();
  const lookTarget = craftPos.clone().add(craftTan);
  _look.lookAt(craftPos, lookTarget, _up);
  _quat.setFromRotationMatrix(_look);
  craft.quaternion.copy(_quat);
}

function applyMissionState(u: number): void {
  const frame = cache.sampleAtProgress(u);
  craftPos.set(frame.pos.x, frame.pos.y, frame.pos.z);
  craftVel.set(frame.vel.x, frame.vel.y, frame.vel.z);
  craft.position.copy(craftPos);
  orientCraft(craftVel);

  setPlumeVisible(craft, frame.burning);
  updateBodies(frame.t, bodies);

  // Sun light from ephemeris (direction only — avoid AU-scale light positions)
  const b = bodyPositions(frame.t);
  sunLight.position.set(
    b.sun.x - b.earth.x,
    b.sun.y - b.earth.y,
    b.sun.z - b.earth.z,
  );
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();

  const mode = director.getMode();
  updateLocatorVisibility(locator, camera, craftPos, {
    forceShow: mode !== "chase",
    craftLenKm: 0.04,
  });

  // Altitude relative to nearest body of interest
  const altitude =
    frame.phase === "leo" || frame.phase === "tli" || frame.phase === "coast"
      ? frame.distMoon > 100_000
        ? frame.altEarth
        : frame.altMoon
      : frame.altMoon;

  hud.update({
    phase: frame.phaseLabel,
    t: frame.t,
    durationS: cache.durationS,
    distanceToMoon: Math.max(0, frame.distMoon - R_MOON),
    altitude,
    speed: frame.speed,
    playing: clock.playing,
  });

  // Auto-pause on landing at end
  if (u >= 1 && clock.playing) {
    clock.pause();
  }
}

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }
}

// Patch clock.tick to use real mission duration
const wall = new THREE.Clock();
applyMissionState(0);

function frame(): void {
  requestAnimationFrame(frame);
  resize();

  const dt = Math.min(wall.getDelta(), 0.05);
  clock.tick(dt, cache.durationS);
  applyMissionState(clock.t);

  spinBodies(bodies, dt);
  director.update(dt, cache.sampleAtProgress(clock.t).t, craftPos, craftVel);

  renderer.render(scene, camera);
}

frame();
