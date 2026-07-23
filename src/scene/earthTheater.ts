import * as THREE from "three";
import {
  R_EARTH,
  STARBASE_ALT,
  STARBASE_LAT,
  STARBASE_LON,
} from "../physics/constants";
import {
  geodeticToMeshLocal,
  inertialRelToMeshLocal,
} from "../physics/earthFrame";
import { bodyPositions } from "../physics/bodies";
import type { Sample } from "../physics/mission";
import { v3 } from "../physics/vec3";
import { markZoomLabel } from "./zoomLabels";

/**
 * Starbase pad (Earth-fixed mesh-local) + ascent ground-track on the globe.
 * Pad is parented under the spinning Earth mesh so it co-rotates correctly.
 *
 * Liftoff FX (flame trench, deluge steam, pad light) update from mission time
 * so scrubbing stays deterministic.
 */
export function createStarbasePad(): THREE.Group {
  const pad = new THREE.Group();
  pad.name = "starbase-pad";

  const local = geodeticToMeshLocal(
    STARBASE_LAT,
    STARBASE_LON,
    R_EARTH + STARBASE_ALT + 0.4,
  );
  pad.position.set(local.x, local.y, local.z);

  const outward = new THREE.Vector3(local.x, local.y, local.z).normalize();
  pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);

  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(2.8, 3.2, 0.35, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3a3f48,
      metalness: 0.4,
      roughness: 0.65,
    }),
  );
  pad.add(deck);

  // Flame trench / water deluge channel
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.22, 5.2),
    new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      metalness: 0.3,
      roughness: 0.8,
    }),
  );
  trench.position.y = 0.15;
  pad.add(trench);

  // Flame sheet inside the trench (additive; opacity driven by update)
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff7a30,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const flame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 4.6), flameMat);
  flame.position.y = 0.55;
  flame.name = "pad-flame";
  flame.visible = false;
  flame.userData.mat = flameMat;
  pad.add(flame);

  // Secondary taller flame tongues (read from Earth cam)
  const tongueMat = new THREE.MeshBasicMaterial({
    color: 0xffcc66,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const tongues = new THREE.Group();
  tongues.name = "pad-flame-tongues";
  tongues.visible = false;
  for (const z of [-1.4, -0.4, 0.5, 1.4]) {
    const tongue = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 2.2, 10, 1, true),
      tongueMat,
    );
    tongue.position.set(0, 1.3, z);
    tongues.add(tongue);
  }
  tongues.userData.mat = tongueMat;
  pad.add(tongues);

  // Deluge steam billows (sprites)
  const steamGroup = new THREE.Group();
  steamGroup.name = "pad-steam";
  steamGroup.visible = false;
  const steamTex = makeSteamTexture();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: steamTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.position.set(Math.cos(ang) * 2.2, 1.2, Math.sin(ang) * 2.2);
    sprite.scale.setScalar(4);
    sprite.userData.baseAng = ang;
    sprite.userData.phase = i * 0.9;
    steamGroup.add(sprite);
  }
  pad.add(steamGroup);

  // Pad exhaust illumination (mesh-local km scale for theater landmark)
  const padLight = new THREE.PointLight(0xff8844, 0, 40, 2);
  padLight.name = "pad-light";
  padLight.position.set(0, 3, 0);
  pad.add(padLight);

  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 12, 0.55),
    new THREE.MeshStandardMaterial({
      color: 0xb8bcc4,
      metalness: 0.7,
      roughness: 0.35,
    }),
  );
  tower.position.set(2.2, 6.2, 0);
  pad.add(tower);

  // Tower cross-members (readability in Ship cam near pad)
  for (const h of [3, 6, 9]) {
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.12, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x9aa0a8,
        metalness: 0.65,
        roughness: 0.4,
      }),
    );
    cross.position.set(2.2, h, 0);
    pad.add(cross);
  }

  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(3.5, 0.35, 0.35),
    new THREE.MeshStandardMaterial({
      color: 0x9aa0a8,
      metalness: 0.65,
      roughness: 0.4,
    }),
  );
  arm.position.set(0.6, 10.5, 0);
  pad.add(arm);

  // Chopsticks (paired arms) — theater silhouettes
  for (const side of [-1, 1]) {
    const stick = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.22, 4.5),
      new THREE.MeshStandardMaterial({
        color: 0xa8aeb6,
        metalness: 0.7,
        roughness: 0.38,
      }),
    );
    stick.position.set(0.4, 8.5, side * 1.1);
    stick.rotation.x = side * 0.08;
    pad.add(stick);
  }

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xff5533,
      transparent: true,
      opacity: 0.95,
    }),
  );
  beacon.position.set(0, 0.6, 0);
  beacon.name = "pad-beacon";
  pad.add(beacon);

  const glow = makePadGlowSprite();
  glow.name = "pad-glow";
  glow.position.set(0, 1.5, 0);
  glow.scale.setScalar(80);
  pad.add(glow);

  const label = makeTextSprite("STARBASE", "#7ec8ff");
  label.position.set(0, 18, 0);
  markZoomLabel(label, {
    targetPx: 22,
    aspect: 256 / 64,
    minH: 0.6,
    maxH: 28,
  });
  label.scale.set(12, 3, 1);
  pad.add(label);

  return pad;
}

export type LaunchPadFxState = {
  missionT: number;
  phase: string;
  burning: boolean;
  /** Altitude above Earth surface (km) */
  altEarth: number;
};

/**
 * Drive flame trench, deluge steam, and pad light from mission state.
 * Active mainly during launch / early ascent under thrust; scrub-safe.
 */
export function updateStarbaseLaunchFx(
  pad: THREE.Object3D,
  state: LaunchPadFxState,
): void {
  const onPadPhase =
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 25);
  const active = state.burning && onPadPhase && state.missionT >= 0;

  // Intensity falls with altitude and fades after leaving thick atmosphere theater
  const altFade = THREE.MathUtils.clamp(1 - state.altEarth / 18, 0, 1);
  const t = state.missionT;
  const flicker =
    0.88 +
    0.08 * Math.sin(t * 41.2) +
    0.04 * Math.sin(t * 77.5 + 0.7);
  const strength = active ? altFade * flicker : 0;

  const flame = pad.getObjectByName("pad-flame") as THREE.Mesh | undefined;
  if (flame) {
    const mat = (flame.userData.mat as THREE.MeshBasicMaterial) ??
      (flame.material as THREE.MeshBasicMaterial);
    flame.visible = strength > 0.02;
    mat.opacity = 0.55 * strength;
    flame.scale.set(1, 0.7 + 0.6 * strength, 1);
  }

  const tongues = pad.getObjectByName("pad-flame-tongues");
  if (tongues) {
    tongues.visible = strength > 0.04;
    const mat = tongues.userData.mat as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.4 * strength;
    tongues.scale.set(1, 0.6 + 0.9 * strength, 1);
  }

  const steam = pad.getObjectByName("pad-steam");
  if (steam) {
    // Steam hangs a bit longer than hard flame
    const steamStr =
      state.burning && state.altEarth < 35 && state.missionT < 180
        ? THREE.MathUtils.clamp(1 - state.altEarth / 30, 0, 1) *
          (state.phase === "launch" || state.phase === "ascent" ? 1 : 0)
        : 0;
    steam.visible = steamStr > 0.03;
    let i = 0;
    steam.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      const mat = obj.material as THREE.SpriteMaterial;
      const phase = (obj.userData.phase as number) ?? 0;
      const wobble = 0.85 + 0.15 * Math.sin(t * 3.1 + phase);
      mat.opacity = 0.22 * steamStr * wobble;
      const grow = 3.5 + steamStr * 5 + 0.8 * Math.sin(t * 2.2 + phase);
      obj.scale.setScalar(grow);
      const ang = (obj.userData.baseAng as number) ?? 0;
      const r = 2.0 + steamStr * 1.5 + 0.3 * Math.sin(t * 1.7 + phase);
      obj.position.set(
        Math.cos(ang + t * 0.05) * r,
        1.0 + steamStr * 2.5 + 0.4 * Math.sin(t * 2.5 + phase),
        Math.sin(ang + t * 0.05) * r,
      );
      i++;
    });
    void i;
  }

  const light = pad.getObjectByName("pad-light") as THREE.PointLight | undefined;
  if (light) {
    light.intensity = 12 * strength;
    light.distance = 25 + 20 * strength;
  }

  const glow = pad.getObjectByName("pad-glow") as THREE.Sprite | undefined;
  if (glow) {
    const mat = glow.material as THREE.SpriteMaterial;
    // Keep a dim always-on landmark; bloom when engines light
    const base = 0.35;
    mat.opacity = base + 0.65 * strength;
    const s = 70 + 50 * strength;
    glow.scale.setScalar(s);
  }
}

/**
 * Sub-satellite ground track for launch → early LEO, in Earth mesh-local coords
 * so it co-rotates with the surface.
 */
export function createAscentGroundTrack(samples: Sample[]): THREE.Line | null {
  const pts: THREE.Vector3[] = [];
  const rel = v3();
  const local = v3();

  for (const s of samples) {
    if (s.phase !== "launch" && s.phase !== "ascent" && s.phase !== "leo") {
      if (pts.length > 10) break;
      continue;
    }
    if (s.phase === "leo" && s.t > 6000) break;

    const b = bodyPositions(s.t);
    const rx = s.pos.x - b.earth.x;
    const ry = s.pos.y - b.earth.y;
    const rz = s.pos.z - b.earth.z;
    const r = Math.hypot(rx, ry, rz) || 1;
    rel.x = (rx / r) * (R_EARTH + 1.5);
    rel.y = (ry / r) * (R_EARTH + 1.5);
    rel.z = (rz / r) * (R_EARTH + 1.5);
    inertialRelToMeshLocal(rel, s.t, local);
    pts.push(new THREE.Vector3(local.x, local.y, local.z));
  }

  if (pts.length < 4) return null;

  const maxPts = 400;
  const used =
    pts.length <= maxPts
      ? pts
      : Array.from({ length: maxPts }, (_, i) => {
          const u = i / (maxPts - 1);
          return pts[Math.round(u * (pts.length - 1))]!;
        });

  const geom = new THREE.BufferGeometry().setFromPoints(used);
  const mat = new THREE.LineBasicMaterial({
    color: 0xff8866,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const line = new THREE.Line(geom, mat);
  line.name = "ascent-ground-track";
  line.frustumCulled = false;
  return line;
}

function makePadGlowSprite(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 120, 60, 1)");
  g.addColorStop(0.35, "rgba(255, 80, 40, 0.55)");
  g.addColorStop(1, "rgba(255, 60, 30, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

function makeSteamTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, "rgba(230, 235, 240, 0.85)");
  g.addColorStop(0.4, "rgba(200, 210, 220, 0.35)");
  g.addColorStop(1, "rgba(180, 190, 200, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function makeTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "bold 36px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(20, 12, 216, 40);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
}

/** Pulse pad beacon (wall-clock). */
export function pulsePadBeacon(pad: THREE.Object3D, wallT: number): void {
  const beacon = pad.getObjectByName("pad-beacon") as THREE.Mesh | undefined;
  if (!beacon) return;
  const mat = beacon.material as THREE.MeshBasicMaterial;
  mat.opacity = 0.55 + 0.4 * Math.sin(wallT * 4);
}
