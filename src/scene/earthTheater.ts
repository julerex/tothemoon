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

/**
 * Starbase pad (Earth-fixed mesh-local) + ascent ground-track on the globe.
 * Pad is parented under the spinning Earth mesh so it co-rotates correctly.
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

  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.2, 4.5),
    new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      metalness: 0.3,
      roughness: 0.8,
    }),
  );
  trench.position.y = 0.15;
  pad.add(trench);

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
  glow.position.set(0, 1.5, 0);
  glow.scale.setScalar(80);
  pad.add(glow);

  const label = makeTextSprite("STARBASE", "#7ec8ff");
  label.position.set(0, 18, 0);
  label.scale.set(40, 14, 1);
  pad.add(label);

  return pad;
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
