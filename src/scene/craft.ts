import * as THREE from "three";

/**
 * Near-true-scale Super Heavy + Starship stack plus a red locator for system views.
 * Scene unit = 1 km. Mesh units × scale ≈ real meters / 1000.
 *
 * Local +Z = nose, −Z = engines (matches velocity look-at in main).
 *
 * Takeoff/ascent fidelity: ring welds, denser Raptor field, multi-layer additive
 * plumes, and an exhaust point light — all procedural, no external meshes.
 */
export function createCraft(): {
  group: THREE.Group;
  mesh: THREE.Group;
  locator: THREE.Sprite;
} {
  const group = new THREE.Group();
  const mesh = new THREE.Group();
  // 1 mesh unit ≈ 40 m at this scale → stack ~120 m
  const scale = 0.04;

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

  // --- Ship (upper stage) — nose at +Z ---
  const ship = new THREE.Group();
  ship.name = "ship";

  // Ogive-ish nose: stacked taper cones (~20 m)
  const noseTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.28, 20),
    steelBright,
  );
  noseTip.rotation.x = -Math.PI / 2;
  noseTip.position.z = 1.05;
  ship.add(noseTip);

  const noseBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.2, 0.28, 20),
    steel,
  );
  noseBase.rotation.x = Math.PI / 2;
  noseBase.position.z = 0.82;
  ship.add(noseBase);

  // Payload / forward barrel
  const shipFwd = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.48, 20),
    steel,
  );
  shipFwd.rotation.x = Math.PI / 2;
  shipFwd.position.z = 0.52;
  ship.add(shipFwd);

  // Main tank barrel
  const shipMain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.72, 20),
    steel,
  );
  shipMain.rotation.x = Math.PI / 2;
  shipMain.position.z = -0.02;
  ship.add(shipMain);

  // Windward heat-shield tiles (partial cylinder + dense canvas tile map)
  const heatStrip = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.223,
      0.223,
      1.05,
      32,
      12,
      true,
      -Math.PI * 0.3,
      Math.PI * 0.6,
    ),
    tile,
  );
  heatStrip.rotation.x = Math.PI / 2;
  heatStrip.position.z = 0.1;
  ship.add(heatStrip);

  // Secondary tile band on nose / forward barrel (theater cue)
  const heatFwd = new THREE.Mesh(
    new THREE.CylinderGeometry(
      0.201,
      0.221,
      0.42,
      28,
      6,
      true,
      -Math.PI * 0.28,
      Math.PI * 0.56,
    ),
    tile,
  );
  heatFwd.rotation.x = Math.PI / 2;
  heatFwd.position.z = 0.55;
  ship.add(heatFwd);

  // Tile edge trim
  for (const side of [-1, 1]) {
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.02, 1.05),
      tileEdge,
    );
    const ang = side * Math.PI * 0.3;
    trim.position.set(Math.sin(ang) * 0.222, Math.cos(ang) * 0.222, 0.1);
    trim.rotation.z = -ang;
    ship.add(trim);
  }

  // A few "missing tile" / white target tiles (Flight-test style markers)
  for (const [u, v] of [
    [0.12, 0.25],
    [-0.08, -0.1],
    [0.05, -0.35],
  ] as [number, number][]) {
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.008, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xe8eaf0,
        metalness: 0.1,
        roughness: 0.65,
      }),
    );
    const ang = u;
    marker.position.set(
      Math.sin(ang) * 0.226,
      Math.cos(ang) * 0.226,
      v,
    );
    marker.lookAt(0, 0, v);
    ship.add(marker);
  }

  // Barrel ring welds (visual stringers)
  for (const z of [0.7, 0.35, 0.05, -0.25]) {
    ship.add(makeBarrelRing(0.221, 0.006, z, steelDark));
  }

  // Aft skirt / engine bay
  const shipAft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.245, 0.24, 20),
    steelDark,
  );
  shipAft.rotation.x = Math.PI / 2;
  shipAft.position.z = -0.44;
  ship.add(shipAft);

  // Forward flaps
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.3, 0.38),
      steelDark,
    );
    flap.position.set(side * 0.245, 0, 0.52);
    flap.rotation.z = side * 0.18;
    ship.add(flap);
    // Hinge fairing
    const hinge = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.08, 0.1),
      accent,
    );
    hinge.position.set(side * 0.22, 0, 0.65);
    ship.add(hinge);
  }
  // Aft flaps (larger)
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.34, 0.42),
      steelDark,
    );
    flap.position.set(side * 0.265, 0, -0.18);
    flap.rotation.z = side * 0.22;
    ship.add(flap);
  }

  // Ship engines: 3 SL (center) + 3 Vac (outer, larger bells)
  const shipBells = new THREE.Group();
  shipBells.name = "ship-engines";
  const shipSl: [number, number][] = [
    [0, 0],
    [0.075, 0.045],
    [-0.075, 0.045],
  ];
  for (const [x, y] of shipSl) {
    shipBells.add(makeBell(0.032, 0.062, 0.16, x, y, -0.62, engine, engineRim));
  }
  const shipVac: [number, number][] = [
    [0.12, -0.02],
    [-0.12, -0.02],
    [0, -0.11],
  ];
  for (const [x, y] of shipVac) {
    shipBells.add(makeBell(0.04, 0.095, 0.22, x, y, -0.65, engine, engineRim));
  }
  ship.add(shipBells);

  // Multi-layer ship plume (blue-white Raptor vacuum look)
  const shipPlume = makePlumeGroup("plume-ship", [
    {
      r: 0.22,
      h: 0.85,
      z: -1.05,
      color: 0x4a9fff,
      opacity: 0.22,
      name: "outer",
    },
    {
      r: 0.13,
      h: 0.7,
      z: -0.98,
      color: 0x9ad4ff,
      opacity: 0.4,
      name: "mid",
    },
    {
      r: 0.055,
      h: 0.45,
      z: -0.88,
      color: 0xe8f4ff,
      opacity: 0.7,
      name: "core",
    },
  ]);
  ship.add(shipPlume);

  // Ship sits atop booster when stacked
  ship.position.z = 0.55;
  mesh.add(ship);

  // --- Booster (Super Heavy) — below ship ---
  const booster = new THREE.Group();
  booster.name = "booster";

  const boostBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.255, 1.55, 24),
    steel,
  );
  boostBody.rotation.x = Math.PI / 2;
  boostBody.position.z = -0.85;
  booster.add(boostBody);

  // Longitudinal chines (4 soft ridges)
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const chine = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.035, 1.4),
      steelBright,
    );
    chine.position.set(
      Math.cos(ang) * 0.248,
      Math.sin(ang) * 0.248,
      -0.85,
    );
    chine.rotation.z = ang;
    booster.add(chine);
  }

  // Barrel ring welds
  for (const z of [-0.2, -0.5, -0.85, -1.2, -1.45]) {
    booster.add(makeBarrelRing(0.246, 0.008, z, steelDark));
  }

  // Interstage ring + hot-stage vents (theater)
  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.248, 0.248, 0.14, 24),
    steelDark,
  );
  interstage.rotation.x = Math.PI / 2;
  interstage.position.z = -0.05;
  booster.add(interstage);

  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.04, 0.05),
      accent,
    );
    vent.position.set(Math.cos(ang) * 0.25, Math.sin(ang) * 0.25, -0.05);
    vent.rotation.z = ang;
    booster.add(vent);
  }

  // Grid fins (4) — frame + simple lattice
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.018, 0.24),
      steelDark,
    );
    fin.add(plate);
    // Cross bars
    for (const u of [-0.08, 0, 0.08]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.01, 0.02),
        accent,
      );
      bar.position.z = u;
      fin.add(bar);
    }
    for (const u of [-0.1, 0, 0.1]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.01, 0.22),
        accent,
      );
      bar.position.x = u;
      fin.add(bar);
    }
    fin.position.set(Math.cos(ang) * 0.29, Math.sin(ang) * 0.29, -0.25);
    fin.rotation.z = ang;
    booster.add(fin);
  }

  // Aft octoweb / engine skirt
  const boostSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.255, 0.29, 0.22, 24),
    steelDark,
  );
  boostSkirt.rotation.x = Math.PI / 2;
  boostSkirt.position.z = -1.72;
  booster.add(boostSkirt);

  // COPV / raceway bump
  const raceway = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.05, 1.2),
    steelDark,
  );
  raceway.position.set(0.26, 0, -0.9);
  booster.add(raceway);

  // Booster engines: theater 33-Raptor field (10 + 10 + 13 rings)
  const boostBells = new THREE.Group();
  boostBells.name = "booster-engines";
  const rings: { n: number; r: number; br: number; h: number; z: number }[] = [
    { n: 10, r: 0.055, br: 0.028, h: 0.17, z: -1.9 },
    { n: 10, r: 0.12, br: 0.03, h: 0.16, z: -1.88 },
    { n: 13, r: 0.185, br: 0.032, h: 0.15, z: -1.86 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.n; i++) {
      const ang = (i / ring.n) * Math.PI * 2 + (ring.n === 13 ? 0 : 0.1);
      const x = Math.cos(ang) * ring.r;
      const y = Math.sin(ang) * ring.r;
      boostBells.add(
        makeBell(
          ring.br * 0.55,
          ring.br,
          ring.h,
          x,
          y,
          ring.z,
          engine,
          engineRim,
        ),
      );
    }
  }
  booster.add(boostBells);

  // Multi-layer booster plume (sea-level Raptor: orange/white core)
  const boostPlume = makePlumeGroup("plume-booster", [
    {
      r: 0.48,
      h: 1.55,
      z: -2.75,
      color: 0xff6a28,
      opacity: 0.28,
      name: "outer",
    },
    {
      r: 0.32,
      h: 1.25,
      z: -2.55,
      color: 0xffb060,
      opacity: 0.45,
      name: "mid",
    },
    {
      r: 0.14,
      h: 0.85,
      z: -2.35,
      color: 0xfff0d0,
      opacity: 0.75,
      name: "core",
    },
  ]);
  booster.add(boostPlume);

  // Soft exhaust glow sprite under the stack
  const exhaustGlow = makeExhaustGlowSprite();
  exhaustGlow.name = "exhaust-glow";
  exhaustGlow.position.z = -2.2;
  exhaustGlow.scale.set(1.8, 1.8, 1);
  exhaustGlow.visible = false;
  booster.add(exhaustGlow);

  mesh.add(booster);

  // Exhaust point light (mesh-local; scaled with stack → reaches pad close-in)
  const exhaustLight = new THREE.PointLight(0xffa050, 0, 18, 2);
  exhaustLight.name = "exhaust-light";
  exhaustLight.position.set(0, 0, -2.0);
  mesh.add(exhaustLight);

  // Max-Q condensation / vapor sheath (mission-time driven)
  const condense = makeCondensationCloud();
  mesh.add(condense);

  mesh.scale.setScalar(scale);
  group.add(mesh);

  const locator = createLocatorSprite();
  group.add(locator);

  return { group, mesh, locator };
}

function makeBarrelRing(
  radius: number,
  tube: number,
  z: number,
  mat: THREE.Material,
): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, 6, 32),
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

type PlumeLayerSpec = {
  r: number;
  h: number;
  z: number;
  color: number;
  opacity: number;
  name: string;
};

function makePlumeGroup(name: string, layers: PlumeLayerSpec[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.visible = false;
  for (const L of layers) {
    const mat = new THREE.MeshBasicMaterial({
      color: L.color,
      transparent: true,
      opacity: L.opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    // Cone tip at origin by default; point aft (−Z) with base near engines
    const cone = new THREE.Mesh(new THREE.ConeGeometry(L.r, L.h, 16, 1, true), mat);
    cone.rotation.x = Math.PI / 2;
    // After rot.x=π/2, cone axis → −Z; center of cone is at local origin of mesh
    cone.position.z = L.z;
    cone.name = `${name}-${L.name}`;
    cone.userData.baseOpacity = L.opacity;
    g.add(cone);
  }
  return g;
}

function makeExhaustGlowSprite(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 240, 200, 1)");
  g.addColorStop(0.25, "rgba(255, 160, 60, 0.7)");
  g.addColorStop(0.55, "rgba(255, 80, 30, 0.25)");
  g.addColorStop(1, "rgba(255, 40, 10, 0)");
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
function makeCondensationCloud(): THREE.Group {
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
    { z: 1.3, s: 0.9, phase: 0.2 },
    { z: 0.85, s: 1.15, phase: 1.1 },
    { z: 0.35, s: 1.35, phase: 2.0 },
    { z: -0.15, s: 1.5, phase: 0.7 },
    { z: -0.7, s: 1.65, phase: 1.6 },
    { z: -1.2, s: 1.4, phase: 2.4 },
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
    new THREE.CylinderGeometry(0.42, 0.55, 2.4, 20, 1, true),
    sheathMat,
  );
  sheath.rotation.x = Math.PI / 2;
  sheath.position.z = -0.1;
  sheath.name = "condense-sheath";
  sheath.userData.mat = sheathMat;
  g.add(sheath);

  return g;
}

function createLocatorSprite(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 70, 80, 1)");
  g.addColorStop(0.25, "rgba(255, 40, 55, 0.9)");
  g.addColorStop(0.55, "rgba(255, 40, 55, 0.25)");
  g.addColorStop(1, "rgba(255, 40, 55, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(32, 32, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ff2233";
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
  sprite.name = "locator";
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

function setPlumeScale(
  plume: THREE.Object3D,
  u: number,
  flicker: number,
  zScaleBase: number,
  zScaleGain: number,
): void {
  const s = (0.45 + 0.7 * Math.sqrt(Math.max(u, 0.05))) * flicker;
  const z = (zScaleBase + zScaleGain * u) * (0.92 + 0.08 * flicker);
  plume.scale.set(s, s, z);
  plume.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mat = obj.material as THREE.MeshBasicMaterial;
    if (!mat || mat.opacity === undefined) return;
    const base = (obj.userData.baseOpacity as number | undefined) ?? mat.opacity;
    mat.opacity = base * (0.75 + 0.35 * u) * (0.85 + 0.15 * flicker);
  });
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
 * show the active plume and scale it with thrust.
 * Hot-staging: ship plume ramps on shortly before stage while booster still burns.
 */
export function updateCraftVisuals(
  group: THREE.Group,
  state: CraftVisualState,
): void {
  const booster = group.getObjectByName("booster");
  // Stacked booster only while unstaged; free-flyer lives in StagingFx
  if (booster) booster.visible = !state.staged;

  const shipPlume = group.getObjectByName("plume-ship");
  const boostPlume = group.getObjectByName("plume-booster");
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

  if (boostPlume) {
    boostPlume.visible = showBoost;
    if (showBoost) {
      // Slight visual MECO fade in the last second of hot-stage pre
      const mecoFade = hotPre > 0.7 ? 1 - (hotPre - 0.7) / 0.3 * 0.35 : 1;
      const u = Math.min(1, state.thrustN / BOOSTER_THRUST_REF) * mecoFade;
      setPlumeScale(boostPlume, u, flicker, 0.55, 0.95);
    }
  }
  if (shipPlume) {
    shipPlume.visible = showShip;
    if (showShip) {
      let u: number;
      if (state.staged) {
        u = Math.min(1, state.thrustN / SHIP_THRUST_REF);
      } else {
        // Hot-stage ignition — synthetic ship thrust (physics still on booster)
        u = 0.35 + 0.55 * hotPre;
      }
      setPlumeScale(shipPlume, u, flicker, 0.55, 0.8);
    }
  }

  if (exhaustGlow) {
    exhaustGlow.visible = showBoost || hotPost > 0.05;
    if (showBoost) {
      const u = Math.min(1, state.thrustN / BOOSTER_THRUST_REF);
      const s = (1.2 + 1.4 * u) * flicker;
      exhaustGlow.scale.set(s, s, 1);
      const mat = (exhaustGlow as THREE.Sprite).material as THREE.SpriteMaterial;
      mat.opacity = (0.55 + 0.4 * u) * flicker;
      exhaustGlow.position.z = -2.15 - 0.2 * u;
    }
  }

  if (exhaustLight) {
    if (showBoost && hotPre < 0.85) {
      const u = Math.min(1, state.thrustN / BOOSTER_THRUST_REF);
      // Blend toward ship-blue as hot-stage ship lights
      const mix = hotPre;
      exhaustLight.intensity = (4.5 + 8 * u) * flicker * (1 + 0.25 * mix);
      exhaustLight.color.setRGB(
        THREE.MathUtils.lerp(1, 0.53, mix),
        THREE.MathUtils.lerp(0.63, 0.8, mix),
        THREE.MathUtils.lerp(0.31, 1, mix),
      );
      exhaustLight.distance = 14 + 10 * u;
      exhaustLight.position.set(0, 0, -2.0 + mix * 0.8);
    } else if (showShip || hotPre > 0) {
      const u = state.staged
        ? Math.min(1, state.thrustN / SHIP_THRUST_REF)
        : 0.35 + 0.55 * hotPre;
      exhaustLight.intensity = (1.2 + 3.5 * u) * flicker;
      exhaustLight.color.setHex(0x88ccff);
      exhaustLight.distance = 8 + 6 * u;
      exhaustLight.position.set(0, 0, 0.55 - 0.9);
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
 * Full stack ~120 m; ship alone ~50 m.
 */
export function craftLengthKm(staged: boolean): number {
  return staged ? 0.05 : 0.12;
}

/**
 * Show the red locator only when the craft is effectively invisible on screen.
 * craftLenKm ≈ mesh scale length.
 */
export function updateLocatorVisibility(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  craftPos: THREE.Vector3,
  opts: { craftLenKm: number },
): void {
  const dist = Math.max(1e-6, camera.position.distanceTo(craftPos));
  const len = Math.max(opts.craftLenKm, 0.01);

  // Hard hide once close enough that the mesh is clearly the subject
  if (dist < len * 40) {
    locator.visible = false;
    return;
  }

  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const viewH = window.innerHeight || 800;
  const px = (len / worldHeight) * viewH;

  // Only mark the craft when it's a sub-pixel / 1px speck — not when the mesh
  // is already readable (old 8px threshold left a huge red blob over it).
  const tooSmall = px < 1.5;
  locator.visible = tooSmall;
  if (!tooSmall) return;

  // ~8 px on screen, but never larger than a small multiple of the craft
  const fromPixels = (8 / viewH) * worldHeight;
  const s = THREE.MathUtils.clamp(
    fromPixels,
    len * 2,
    Math.min(dist * 0.02, len * 60),
  );
  locator.scale.set(s, s, 1);
}
