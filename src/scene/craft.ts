import * as THREE from "three";
import { createNameLabel } from "./zoomLabels";

/**
 * Near-true-scale Super Heavy + Starship stack plus a red locator for system views.
 * Scene unit = 1 km. Mesh units × CRAFT_MESH_SCALE ≈ real meters / 1000.
 *
 * Local +Z = nose, −Z = engines (matches velocity look-at in main).
 *
 * Dimensions (Flight-test / Block-2–3 class, theater-rounded):
 *   diameter 9 m · ship ~52 m · Super Heavy ~71 m · stack ~123 m
 * V3 cues: three oversized grid fins, stainless barrel, windward tiles.
 */

/** World km = mesh units × this. 1 mesh unit ≈ 40 m. */
export const CRAFT_MESH_SCALE = 0.04;

/** Mesh units per real meter (before CRAFT_MESH_SCALE). */
const U = 1 / 40;

/** Vehicle diameter (m) → radius in mesh units. */
const DIA_M = 9;
const R = (DIA_M / 2) * U; // 0.1125

const SHIP_H_M = 52;
const BOOST_H_M = 71;
const SHIP_H = SHIP_H_M * U; // 1.3
const BOOST_H = BOOST_H_M * U; // 1.775

export function createCraft(): {
  group: THREE.Group;
  mesh: THREE.Group;
  locator: THREE.Sprite;
} {
  const group = new THREE.Group();
  const mesh = new THREE.Group();

  const steel = new THREE.MeshStandardMaterial({
    color: 0xc8ccd0,
    metalness: 0.82,
    roughness: 0.28,
  });
  const steelBright = new THREE.MeshStandardMaterial({
    color: 0xd8e0e4,
    metalness: 0.88,
    roughness: 0.22,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x7a8088,
    metalness: 0.72,
    roughness: 0.42,
  });
  const steelMatte = new THREE.MeshStandardMaterial({
    color: 0xa8adb4,
    metalness: 0.7,
    roughness: 0.38,
  });
  const tileMap = makeHeatTileTexture();
  const tile = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tileMap,
    metalness: 0.12,
    roughness: 0.88,
  });
  const tileEdge = new THREE.MeshStandardMaterial({
    color: 0x2a2e32,
    metalness: 0.25,
    roughness: 0.7,
  });
  const engine = new THREE.MeshStandardMaterial({
    color: 0x12141a,
    metalness: 0.6,
    roughness: 0.38,
  });
  const engineRim = new THREE.MeshStandardMaterial({
    color: 0x2a3038,
    metalness: 0.75,
    roughness: 0.35,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x4a5560,
    metalness: 0.55,
    roughness: 0.45,
  });

  // Stage local frames: engines at z≈0, nose/top at +height.
  // Stacked: ship.position.z = BOOST_H (sits on interstage).
  // Staged: ship.position.z → 0 so free-flying ship stays on craftPos.

  // --- Ship (upper stage) ---
  const ship = new THREE.Group();
  ship.name = "ship";

  // Ogive nose (~14 m): tip + two taper barrels at forward end
  const noseTip = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.42, 0.22, 24),
    steelBright,
  );
  noseTip.rotation.x = -Math.PI / 2;
  noseTip.position.z = SHIP_H - 0.08;
  ship.add(noseTip);

  const noseMid = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.42, R * 0.78, 0.2, 24),
    steel,
  );
  noseMid.rotation.x = Math.PI / 2;
  noseMid.position.z = SHIP_H - 0.26;
  ship.add(noseMid);

  const noseBase = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.78, R, 0.18, 24),
    steel,
  );
  noseBase.rotation.x = Math.PI / 2;
  noseBase.position.z = SHIP_H - 0.44;
  ship.add(noseBase);

  // Payload bay / forward barrel
  const shipFwd = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.28, 28),
    steel,
  );
  shipFwd.rotation.x = Math.PI / 2;
  shipFwd.position.z = SHIP_H - 0.66;
  ship.add(shipFwd);

  // Main tank barrel (~constant 9 m)
  const shipMain = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, 0.55, 28),
    steel,
  );
  shipMain.rotation.x = Math.PI / 2;
  shipMain.position.z = SHIP_H * 0.42;
  ship.add(shipMain);

  // Aft common dome / engine bay flare
  const shipAft = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 1.06, 0.16, 28),
    steelDark,
  );
  shipAft.rotation.x = Math.PI / 2;
  shipAft.position.z = 0.12;
  ship.add(shipAft);

  // Windward heat-shield tiles (~120° arc)
  const heatMain = new THREE.Mesh(
    new THREE.CylinderGeometry(
      R * 1.012,
      R * 1.012,
      0.72,
      36,
      10,
      true,
      -Math.PI * 0.32,
      Math.PI * 0.64,
    ),
    tile,
  );
  heatMain.rotation.x = Math.PI / 2;
  heatMain.position.z = SHIP_H * 0.45;
  ship.add(heatMain);

  const heatFwd = new THREE.Mesh(
    new THREE.CylinderGeometry(
      R * 0.8,
      R * 1.01,
      0.36,
      28,
      6,
      true,
      -Math.PI * 0.3,
      Math.PI * 0.6,
    ),
    tile,
  );
  heatFwd.rotation.x = Math.PI / 2;
  heatFwd.position.z = SHIP_H - 0.52;
  ship.add(heatFwd);

  // Tile edge leeward trim
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.014, 0.72),
      tileEdge,
    );
    const ang = side * Math.PI * 0.32;
    trim.position.set(
      Math.sin(ang) * R * 1.01,
      Math.cos(ang) * R * 1.01,
      SHIP_H * 0.45,
    );
    trim.rotation.z = -ang;
    ship.add(trim);
  }

  // Flight-test white / missing-tile markers
  for (const [u, v] of [
    [0.1, SHIP_H * 0.55],
    [-0.06, SHIP_H * 0.4],
    [0.04, SHIP_H * 0.28],
  ] as [number, number][]) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.006, 0.032),
      new THREE.MeshStandardMaterial({
        color: 0xe8eaf0,
        metalness: 0.1,
        roughness: 0.65,
      }),
    );
    marker.position.set(Math.sin(u) * R * 1.02, Math.cos(u) * R * 1.02, v);
    marker.lookAt(0, 0, v);
    ship.add(marker);
  }

  // Barrel ring welds
  for (const z of [0.95, 0.75, 0.55, 0.35, 0.18].map((f) => f * SHIP_H)) {
    ship.add(makeBarrelRing(R * 1.005, 0.004, z, steelDark));
  }

  // Forward flaps (Block-2: smaller, higher, slightly leeward)
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.2, 0.26),
      steelDark,
    );
    flap.position.set(side * (R + 0.02), -0.02, SHIP_H - 0.62);
    flap.rotation.z = side * 0.12;
    flap.rotation.x = 0.08;
    ship.add(flap);
    const hinge = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.05, 0.07),
      accent,
    );
    hinge.position.set(side * (R + 0.005), -0.01, SHIP_H - 0.52);
    ship.add(hinge);
  }

  // Fin-cam mount: starboard forward flap, looking aft (−Z).
  const finCam = new THREE.Object3D();
  finCam.name = "fin-cam";
  finCam.position.set(R + 0.08, 0.03, SHIP_H - 0.58);
  ship.add(finCam);
  const finLook = new THREE.Object3D();
  finLook.name = "fin-cam-look";
  finLook.position.set(0, 0, -0.05);
  ship.add(finLook);

  // Aft flaps (larger elevons)
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, 0.24, 0.32),
      steelDark,
    );
    flap.position.set(side * (R + 0.028), 0, 0.32);
    flap.rotation.z = side * 0.16;
    ship.add(flap);
    const flapTile = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.2, 0.28),
      tile,
    );
    flapTile.position.set(side * (R + 0.04), 0.02, 0.32);
    ship.add(flapTile);
  }

  // Ship engines: 3 SL (center triad) + 3 Vac (outer, larger bells)
  const shipBells = new THREE.Group();
  shipBells.name = "ship-engines";
  const engZ = -0.02;
  // Raptor SL exit ~1.3 m; Vac ~2.3 m — slight theater enlarge for close-up
  const slR = 0.65 * U * 1.35;
  const vacR = 1.15 * U * 1.35;
  const shipSl: [number, number][] = [
    [0, 0.028],
    [0.024, -0.014],
    [-0.024, -0.014],
  ];
  for (const [x, y] of shipSl) {
    shipBells.add(
      makeBell(slR * 0.55, slR, 0.1, x, y, engZ, engine, engineRim),
    );
  }
  const shipVac: [number, number][] = [
    [0.07, 0.02],
    [-0.07, 0.02],
    [0, -0.075],
  ];
  for (const [x, y] of shipVac) {
    shipBells.add(
      makeBell(vacR * 0.45, vacR, 0.14, x, y, engZ - 0.02, engine, engineRim),
    );
  }
  ship.add(shipBells);

  // Stacked default: ship engines on booster interstage
  ship.position.z = BOOST_H;
  ship.userData.stackedZ = BOOST_H;
  ship.userData.stagedZ = 0;
  mesh.add(ship);

  // --- Booster (Super Heavy) — engines at z≈0, top at +BOOST_H ---
  const booster = new THREE.Group();
  booster.name = "booster";

  const boostBody = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, BOOST_H * 0.88, 28),
    steel,
  );
  boostBody.rotation.x = Math.PI / 2;
  boostBody.position.z = BOOST_H * 0.5;
  booster.add(boostBody);

  // Longitudinal chines (4 soft ridges)
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const chine = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.02, BOOST_H * 0.78),
      steelBright,
    );
    chine.position.set(
      Math.cos(ang) * R * 1.02,
      Math.sin(ang) * R * 1.02,
      BOOST_H * 0.5,
    );
    chine.rotation.z = ang;
    booster.add(chine);
  }

  // Barrel ring welds
  for (let i = 0; i < 7; i++) {
    const z = BOOST_H * 0.88 - (i / 6) * BOOST_H * 0.78;
    booster.add(makeBarrelRing(R * 1.008, 0.005, z, steelDark));
  }

  // Hot-staging interstage ring + vents
  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.02, R * 1.02, 0.08, 28),
    steelDark,
  );
  interstage.rotation.x = Math.PI / 2;
  interstage.position.z = BOOST_H - 0.02;
  booster.add(interstage);

  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.022, 0.035),
      accent,
    );
    vent.position.set(
      Math.cos(ang) * R * 1.04,
      Math.sin(ang) * R * 1.04,
      BOOST_H - 0.02,
    );
    vent.rotation.z = ang;
    booster.add(vent);
  }

  // V3 grid fins: three larger fins, gap toward +X (tower)
  const finW = 3.75 * U;
  const finH = 7.5 * U;
  const finT = 0.35 * U;
  const finZ = BOOST_H - 0.35;
  // First fin sits at +Y (ang = π/2) — host for the grid-fin cam
  let gridFinCamAng = Math.PI / 2;
  let gridFinCamR = R + finH * 0.5;
  for (let i = 0; i < 3; i++) {
    const ang = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const fin = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(finH, finT, finW),
      steelMatte,
    );
    fin.add(plate);
    for (const u of [-0.35, -0.12, 0.12, 0.35].map((f) => f * finW)) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(finH * 0.92, finT * 1.2, finT * 0.9),
        accent,
      );
      bar.position.z = u;
      fin.add(bar);
    }
    for (const u of [-0.35, -0.12, 0.12, 0.35].map((f) => f * finH)) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(finT * 0.9, finT * 1.2, finW * 0.92),
        accent,
      );
      bar.position.x = u;
      fin.add(bar);
    }
    const pivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.04, 8),
      steelDark,
    );
    pivot.rotation.z = Math.PI / 2;
    pivot.position.x = -finH * 0.45;
    fin.add(pivot);

    const attachR = R + finH * 0.42;
    fin.position.set(Math.cos(ang) * attachR, Math.sin(ang) * attachR, finZ);
    fin.rotation.z = ang;
    fin.rotation.y = 0.05;
    booster.add(fin);

    if (i === 0) {
      gridFinCamAng = ang;
      // Slightly outboard of the plate tip for a clear look down the stack
      gridFinCamR = attachR + finH * 0.12;
    }
  }

  // Grid-fin cam: +Y fin tip, looking aft toward the Raptor field (−Z).
  // Cloned onto the free-flyer in StagingFx so recovery keeps the mount.
  const gridFinCam = new THREE.Object3D();
  gridFinCam.name = "grid-fin-cam";
  gridFinCam.position.set(
    Math.cos(gridFinCamAng) * gridFinCamR,
    Math.sin(gridFinCamAng) * gridFinCamR,
    finZ + finW * 0.12,
  );
  booster.add(gridFinCam);
  const gridFinLook = new THREE.Object3D();
  gridFinLook.name = "grid-fin-cam-look";
  // Engine bells at z≈0; slight radial bias so the barrel stays in frame
  gridFinLook.position.set(
    Math.cos(gridFinCamAng) * R * 0.25,
    Math.sin(gridFinCamAng) * R * 0.25,
    0.04,
  );
  booster.add(gridFinLook);

  // Aft engine skirt
  const boostSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R * 1.12, 0.14, 28),
    steelDark,
  );
  boostSkirt.rotation.x = Math.PI / 2;
  boostSkirt.position.z = 0.08;
  booster.add(boostSkirt);

  // Raceway cable tray
  const raceway = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.028, BOOST_H * 0.72),
    steelDark,
  );
  raceway.position.set(R * 1.05, 0, BOOST_H * 0.48);
  booster.add(raceway);

  // 33 Raptors: 3 + 10 + 20
  const boostBells = new THREE.Group();
  boostBells.name = "booster-engines";
  const bellZ = -0.02;
  const br = 0.65 * U * 1.2;
  const rings: { n: number; r: number; br: number; h: number }[] = [
    { n: 3, r: 0.9 * U, br: br * 0.95, h: 0.11 },
    { n: 10, r: 2.05 * U, br: br, h: 0.105 },
    { n: 20, r: 3.25 * U, br: br * 1.02, h: 0.1 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const ang = (i / ring.n) * Math.PI * 2 + (ring.n === 3 ? 0 : 0.08);
      const x = Math.cos(ang) * ring.r;
      const y = Math.sin(ang) * ring.r;
      boostBells.add(
        makeBell(
          ring.br * 0.55,
          ring.br,
          ring.h,
          x,
          y,
          bellZ,
          engine,
          engineRim,
        ),
      );
    }
  }
  booster.add(boostBells);

  // No geometric exhaust cones — burn state is read via light / soft glow only.
  const exhaustGlow = makeExhaustGlowSprite();
  exhaustGlow.name = "exhaust-glow";
  exhaustGlow.position.z = bellZ - 0.25;
  exhaustGlow.scale.set(1.1, 1.1, 1);
  exhaustGlow.visible = false;
  booster.add(exhaustGlow);

  mesh.add(booster);

  // Exhaust point light — distance is world km (parent scale does not apply).
  // Tight plume fill for pad/ship cam; not a multi-km yellow wash.
  const exhaustLight = new THREE.PointLight(0xff9a58, 0, 0.35, 2);
  exhaustLight.name = "exhaust-light";
  exhaustLight.position.set(0, 0, -0.08);
  mesh.add(exhaustLight);

  // Max-Q condensation / vapor sheath (mission-time driven)
  const condense = makeCondensationCloud(BOOST_H + SHIP_H, R);
  mesh.add(condense);

  mesh.scale.setScalar(CRAFT_MESH_SCALE);
  group.add(mesh);

  const locator = createLocatorSprite();
  group.add(locator);

  // Name plate near the nose (L toggle); world height floors for close-up
  const shipLabel = createNameLabel("STARSHIP", "#ff8a7a", {
    targetPx: 16,
    aspect: 256 / 64,
    minH: 0.015,
  });
  // Nose in stack frame ≈ BOOST_H + SHIP_H, after scale → km
  shipLabel.position.set(0, 0, (BOOST_H + SHIP_H) * CRAFT_MESH_SCALE * 0.92);
  group.add(shipLabel);

  return { group, mesh, locator };
}

function makeBarrelRing(
  radius: number,
  tube: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 6, 36),
    mat,
  );
  ring.position.z = z;
  // Torus lies in XY by default — correct for barrel bands around Z
  return ring;
}

function makeBell(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  bodyMat: THREE.Material,
  rimMat: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 10, 1, true),
    bodyMat,
  );
  bell.rotation.x = Math.PI / 2;
  g.add(bell);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(rBot * 0.92, rBot * 0.08, 4, 12),
    rimMat,
  );
  rim.position.z = -h * 0.5;
  g.add(rim);
  g.position.set(x, y, z);
  return g;
}

function makeExhaustGlowSprite(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Soft core, muted orange rim — avoid pure yellow wash
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 220, 180, 0.85)");
  g.addColorStop(0.22, "rgba(255, 140, 70, 0.45)");
  g.addColorStop(0.5, "rgba(255, 90, 40, 0.12)");
  g.addColorStop(1, "rgba(255, 50, 20, 0)");
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
      depthTest: true,
    }),
  );
}

/** Dense hex-ish TPS tile map for the windward heat shield. */
function makeHeatTileTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Base carbon / dark tile field
  ctx.fillStyle = "#16181b";
  ctx.fillRect(0, 0, w, h);

  const cols = 14;
  const rows = 48;
  const tw = w / cols;
  const th = h / rows;

  for (let row = 0; row < rows; row++) {
    const xOff = (row % 2) * (tw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * tw + xOff;
      const y = row * th;
      // Slight per-tile brightness variation
      const n =
        14 +
        ((row * 17 + col * 31) % 11) +
        ((row * 3 + col * 7) % 5);
      ctx.fillStyle = `rgb(${n},${n + 1},${n + 2})`;
      ctx.fillRect(x + 0.6, y + 0.5, tw - 1.2, th - 1.0);
      // Grout
      ctx.strokeStyle = "rgba(48,52,58,0.85)";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(x + 0.6, y + 0.5, tw - 1.2, th - 1.0);
    }
  }

  // Occasional lighter / damaged tiles
  for (let i = 0; i < 18; i++) {
    const col = (i * 5 + 3) % cols;
    const row = (i * 11 + 7) % rows;
    const xOff = (row % 2) * (tw * 0.5);
    const x = col * tw + xOff;
    const y = row * th;
    ctx.fillStyle = i % 4 === 0 ? "#c8ccd2" : "#2a3036";
    ctx.fillRect(x + 1, y + 0.8, tw - 2, th - 1.4);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

/**
 * Soft vapor / condensation sheath around the stack (Max-Q theater cue).
 * Sprites face the camera; opacity driven by altitude in updateCraftVisuals.
 */
function makeCondensationCloud(stackH: number, radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "condense-cloud";
  g.visible = false;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(230, 235, 240, 0.9)");
  grad.addColorStop(0.35, "rgba(200, 210, 220, 0.4)");
  grad.addColorStop(1, "rgba(180, 190, 200, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  // Stack of soft puffs along the body (nose → mid-stack)
  const puffs: { z: number; s: number; phase: number }[] = [
    { z: stackH * 0.92, s: 0.55, phase: 0.2 },
    { z: stackH * 0.72, s: 0.7, phase: 1.1 },
    { z: stackH * 0.52, s: 0.85, phase: 2.0 },
    { z: stackH * 0.35, s: 0.95, phase: 0.7 },
    { z: stackH * 0.2, s: 1.05, phase: 1.6 },
    { z: stackH * 0.08, s: 0.9, phase: 2.4 },
  ];
  for (const p of puffs) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
      }),
    );
    sprite.position.set(0, 0, p.z);
    sprite.scale.setScalar(p.s);
    sprite.userData.baseScale = p.s;
    sprite.userData.phase = p.phase;
    g.add(sprite);
  }

  // Thin translucent sheath body (reads better edge-on)
  const sheathMat = new THREE.MeshBasicMaterial({
    color: 0xc8d0d8,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const sheath = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 2.2, radius * 2.8, stackH * 0.85, 20, 1, true),
    sheathMat,
  );
  sheath.rotation.x = Math.PI / 2;
  sheath.position.z = stackH * 0.45;
  sheath.name = "condense-sheath";
  sheath.userData.mat = sheathMat;
  g.add(sheath);

  return g;
}

/**
 * Soft glowing locator dot (constant on-screen size via updateLocatorVisibility).
 * @param coreCss solid disc color
 * @param glowRgb "r, g, b" for the outer halo
 */
export function createLocatorSprite(
  coreCss = "#ff2233",
  glowRgb = "255, 40, 55",
  name = "locator",
): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, `rgba(${glowRgb}, 1)`);
  g.addColorStop(0.25, `rgba(${glowRgb}, 0.9)`);
  g.addColorStop(0.55, `rgba(${glowRgb}, 0.25)`);
  g.addColorStop(1, `rgba(${glowRgb}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(32, 32, 5, 0, Math.PI * 2);
  ctx.fillStyle = coreCss;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 5;
  sprite.scale.set(1, 1, 1);
  sprite.name = name;
  sprite.visible = false;
  return sprite;
}

export type CraftVisualState = {
  staged: boolean;
  burning: boolean;
  /** Thrust force (N); scales plume size */
  thrustN: number;
  /** Mission time (s) — deterministic plume flicker when scrubbing */
  missionT?: number;
  /** Stage-out epoch (s); enables hot-staging dual-plume window */
  stageT?: number | null;
  /** Altitude above Earth (km) — Max-Q condensation envelope */
  altEarth?: number;
  phase?: string;
};

/** Reference thrust (N) for plume size normalization. */
const BOOSTER_THRUST_REF = 1.4e8; // ~140 MN theater ascent
const SHIP_THRUST_REF = 8e6; // ~8 MN TLI / landing theater
/** Ship Raptors light this many seconds before stage-out (hot-stage theater). */
const HOT_STAGE_PRE_S = 4.0;
/** Brief dual-plume hang after stage while flash is still readable. */
const HOT_STAGE_POST_S = 1.2;

function thrustFlicker(missionT: number): number {
  // Fast, non-periodic-looking envelope (scrub-stable)
  const t = missionT;
  return (
    0.9 +
    0.06 * Math.sin(t * 53.1) +
    0.04 * Math.sin(t * 91.7 + 1.3) +
    0.03 * Math.sin(t * 137.2 + 0.4)
  );
}

/**
 * Theater Max-Q condensation strength in [0,1].
 *
 * Absolute altEarth in this mission pack is barycenter-frame noisy for
 * low-altitude cues, so we use a mission-time envelope peaking near real
 * Starship Max-Q (~T+55 s) during powered launch/ascent. Scrub-safe.
 */
function condensationStrength(
  phase: string | undefined,
  missionT: number,
  burning: boolean,
): number {
  if (!burning) return 0;
  if (phase !== "launch" && phase !== "ascent") return 0;
  if (missionT < 8 || missionT > 140) return 0;
  const peakT = 55; // s after liftoff
  const widthT = 22;
  const d = (missionT - peakT) / widthT;
  const bell = Math.exp(-0.5 * d * d);
  // Soft pad gate so deluge steam owns the first seconds
  const padGate = THREE.MathUtils.smoothstep(missionT, 12, 28);
  return THREE.MathUtils.clamp(bell * padGate * 1.2, 0, 1);
}

/**
 * Hide stacked booster after stage-out (detached mesh is handled by StagingFx);
 * drive exhaust light / soft glow from thrust (no geometric plume cones).
 * Hot-staging: ship light ramps on shortly before stage while booster still burns.
 */
export function updateCraftVisuals(
  group: THREE.Group,
  state: CraftVisualState,
): void {
  const booster = group.getObjectByName("booster");
  // Stacked booster only while unstaged; free-flyer lives in StagingFx
  if (booster) booster.visible = !state.staged;

  // Keep free-flying ship on craftPos (engines at local z≈0)
  const ship = group.getObjectByName("ship");
  if (ship) {
    const stackedZ = (ship.userData.stackedZ as number | undefined) ?? BOOST_H;
    const stagedZ = (ship.userData.stagedZ as number | undefined) ?? 0;
    ship.position.z = state.staged ? stagedZ : stackedZ;
  }

  const exhaustGlow = group.getObjectByName("exhaust-glow");
  const exhaustLight = group.getObjectByName("exhaust-light") as
    | THREE.PointLight
    | undefined;
  const condense = group.getObjectByName("condense-cloud");

  const missionT = state.missionT ?? 0;
  const stageT = state.stageT ?? null;
  const flicker = thrustFlicker(missionT);

  // Hot-stage window: ship lights before sep while still stacked
  let hotPre = 0;
  let hotPost = 0;
  if (stageT != null && Number.isFinite(stageT)) {
    if (!state.staged && missionT >= stageT - HOT_STAGE_PRE_S && missionT < stageT) {
      hotPre = THREE.MathUtils.clamp(
        (missionT - (stageT - HOT_STAGE_PRE_S)) / HOT_STAGE_PRE_S,
        0,
        1,
      );
      // Ease-in so ignition reads
      hotPre = hotPre * hotPre;
    }
    if (state.staged && missionT < stageT + HOT_STAGE_POST_S) {
      hotPost = 1 - THREE.MathUtils.clamp((missionT - stageT) / HOT_STAGE_POST_S, 0, 1);
    }
  }

  const showBoost = state.burning && !state.staged;
  const showShip =
    (state.burning && state.staged) ||
    (state.burning && hotPre > 0.02);

  if (exhaustGlow) {
    exhaustGlow.visible = showBoost || hotPost > 0.05;
    if (showBoost) {
      const u = Math.min(1, state.thrustN / BOOSTER_THRUST_REF);
      // Mesh units × CRAFT_MESH_SCALE → keep bloom ~engine-bell scale
      const s = (0.35 + 0.45 * u) * flicker;
      exhaustGlow.scale.set(s, s, 1);
      const mat = (exhaustGlow as THREE.Sprite).material as THREE.SpriteMaterial;
      mat.opacity = (0.35 + 0.3 * u) * flicker;
      // Booster-local: engines at z≈0
      exhaustGlow.position.z = -0.1 - 0.06 * u;
    }
  }

  if (exhaustLight) {
    // Distance is world km (not mesh units). Keep plume fill local to the stack.
    if (showBoost && hotPre < 0.85) {
      const u = Math.min(1, state.thrustN / BOOSTER_THRUST_REF);
      // Blend toward ship-blue as hot-stage ship lights
      const mix = hotPre;
      exhaustLight.intensity = (1.8 + 2.4 * u) * flicker * (1 + 0.2 * mix);
      exhaustLight.color.setRGB(
        THREE.MathUtils.lerp(1, 0.53, mix),
        THREE.MathUtils.lerp(0.58, 0.8, mix),
        THREE.MathUtils.lerp(0.32, 1, mix),
      );
      exhaustLight.distance = 0.18 + 0.22 * u;
      // Mesh stack frame: booster engines at 0, ship engines at BOOST_H
      exhaustLight.position.set(0, 0, -0.05 + mix * BOOST_H * 0.5);
    } else if (showShip || hotPre > 0) {
      const u = state.staged
        ? Math.min(1, state.thrustN / SHIP_THRUST_REF)
        : 0.35 + 0.55 * hotPre;
      exhaustLight.intensity = (0.6 + 1.4 * u) * flicker;
      exhaustLight.color.setHex(0x88ccff);
      exhaustLight.distance = 0.12 + 0.15 * u;
      // After stage ship is re-centered to z=0; while stacked engines at BOOST_H
      exhaustLight.position.set(0, 0, state.staged ? -0.02 : BOOST_H - 0.02);
    } else {
      exhaustLight.intensity = 0;
    }
  }

  // Max-Q condensation cloud
  if (condense) {
    const str = condensationStrength(state.phase, missionT, state.burning);
    condense.visible = str > 0.03;
    if (str > 0.03) {
      const wobble =
        0.92 +
        0.08 * Math.sin(missionT * 7.3) +
        0.04 * Math.sin(missionT * 13.1 + 0.5);
      condense.traverse((obj) => {
        if (obj instanceof THREE.Sprite) {
          const mat = obj.material as THREE.SpriteMaterial;
          const phase = (obj.userData.phase as number) ?? 0;
          const local =
            str *
            (0.75 + 0.25 * Math.sin(missionT * 5.1 + phase)) *
            wobble;
          mat.opacity = 0.35 * local;
          const base = (obj.userData.baseScale as number) ?? 1;
          const grow = base * (0.85 + 0.55 * str) * (0.95 + 0.08 * Math.sin(missionT * 4 + phase));
          obj.scale.setScalar(grow);
        } else if (obj.name === "condense-sheath") {
          const mat =
            (obj.userData.mat as THREE.MeshBasicMaterial | undefined) ??
            ((obj as THREE.Mesh).material as THREE.MeshBasicMaterial);
          mat.opacity = 0.12 * str * wobble;
          obj.scale.set(1 + 0.15 * str, 1 + 0.15 * str, 1);
        }
      });
    }
  }
}

/** @deprecated Prefer updateCraftVisuals */
export function setPlumeVisible(group: THREE.Group, visible: boolean): void {
  updateCraftVisuals(group, {
    staged: true,
    burning: visible,
    thrustN: visible ? SHIP_THRUST_REF : 0,
  });
}

/**
 * Approximate craft length (km) for locator pixel-size heuristic.
 * Full stack ~123 m; ship alone ~52 m.
 */
export function craftLengthKm(staged: boolean): number {
  return staged ? SHIP_H_M / 1000 : (SHIP_H_M + BOOST_H_M) / 1000;
}

/** Super Heavy alone (~71 m) for free-flyer locator sizing after stage-out. */
export function boosterLengthKm(): number {
  return BOOST_H_M / 1000;
}

/**
 * Locator dot: constant on-screen marker whenever the body/craft is too small
 * to read. Hide once the real geometry subtends enough pixels.
 *
 * `sizeKm` — characteristic size in scene units (craft length, body diameter).
 */
export function updateLocatorVisibility(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  worldPos: THREE.Vector3,
  opts: { sizeKm: number },
): void {
  const dist = Math.max(1e-6, camera.position.distanceTo(worldPos));
  const len = Math.max(opts.sizeKm, 0.01);

  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const viewH = window.innerHeight || 800;
  const bodyPx = (len / worldHeight) * viewH;

  // Real mesh is the subject once it's a few pixels tall — drop the marker.
  const MESH_READABLE_PX = 5;
  if (bodyPx >= MESH_READABLE_PX) {
    locator.visible = false;
    return;
  }

  locator.visible = true;

  // Constant ~10 px on screen at any range (same as craft red dot).
  const TARGET_PX = 10;
  const fromPixels = (TARGET_PX / viewH) * worldHeight;

  // Cap as a fraction of distance so the marker stays a "dot". Floor is tiny
  // so large bodies (Earth diameter) don't force a planet-sized sprite.
  const minS = Math.min(len * 1.5, fromPixels * 0.5, dist * 0.001);
  const s = THREE.MathUtils.clamp(fromPixels, Math.max(minS, 1e-6), dist * 0.05);
  locator.scale.set(s, s, 1);
}
