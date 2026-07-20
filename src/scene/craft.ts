import * as THREE from "three";

/**
 * Near-true-scale Super Heavy + Starship stack plus a red locator for system views.
 * Scene unit = 1 km. Mesh units × scale ≈ real meters / 1000.
 *
 * Local +Z = nose, −Z = engines (matches velocity look-at in main).
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
    color: 0xc5c8cc,
    metalness: 0.78,
    roughness: 0.32,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x8a9098,
    metalness: 0.7,
    roughness: 0.4,
  });
  const tile = new THREE.MeshStandardMaterial({
    color: 0x1a1c1e,
    metalness: 0.2,
    roughness: 0.75,
  });
  const engine = new THREE.MeshStandardMaterial({
    color: 0x15171a,
    metalness: 0.55,
    roughness: 0.4,
  });
  const plumeBoosterMat = new THREE.MeshBasicMaterial({
    color: 0xffb060,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const plumeShipMat = new THREE.MeshBasicMaterial({
    color: 0x7ec8ff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // --- Ship (upper stage) — nose at +Z ---
  const ship = new THREE.Group();
  ship.name = "ship";

  // Nose cone (~20 m)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), steel);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 0.95;
  ship.add(nose);

  // Payload / forward barrel
  const shipFwd = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.22, 0.55, 16),
    steel,
  );
  shipFwd.rotation.x = Math.PI / 2;
  shipFwd.position.z = 0.55;
  ship.add(shipFwd);

  // Main tank barrel with dark heat-shield strip (windward theater cue)
  const shipMain = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.7, 16),
    steel,
  );
  shipMain.rotation.x = Math.PI / 2;
  shipMain.position.z = 0.0;
  ship.add(shipMain);

  const heatStrip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.222, 0.222, 0.55, 16, 1, true, 0, Math.PI * 0.55),
    tile,
  );
  heatStrip.rotation.x = Math.PI / 2;
  heatStrip.position.z = 0.05;
  ship.add(heatStrip);

  // Aft skirt / engine bay
  const shipAft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.22, 16),
    steelDark,
  );
  shipAft.rotation.x = Math.PI / 2;
  shipAft.position.z = -0.42;
  ship.add(shipAft);

  // Forward flaps (simple plates)
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.28, 0.35),
      steelDark,
    );
    flap.position.set(side * 0.24, 0, 0.55);
    flap.rotation.z = side * 0.15;
    ship.add(flap);
  }
  // Aft flaps
  for (const side of [-1, 1]) {
    const flap = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.32, 0.4),
      steelDark,
    );
    flap.position.set(side * 0.26, 0, -0.15);
    flap.rotation.z = side * 0.2;
    ship.add(flap);
  }

  // 3 center Raptors under the ship
  const shipBells = new THREE.Group();
  shipBells.name = "ship-engines";
  const shipBellOffsets: [number, number][] = [
    [0, 0],
    [0.09, 0.05],
    [-0.09, 0.05],
  ];
  for (const [x, y] of shipBellOffsets) {
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.07, 0.18, 10, 1, true),
      engine,
    );
    bell.rotation.x = Math.PI / 2;
    bell.position.set(x, y, -0.62);
    shipBells.add(bell);
  }
  ship.add(shipBells);

  const shipPlume = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.55, 12, 1, true),
    plumeShipMat,
  );
  shipPlume.rotation.x = Math.PI / 2;
  shipPlume.position.z = -0.95;
  shipPlume.name = "plume-ship";
  shipPlume.visible = false;
  ship.add(shipPlume);

  // Ship sits atop booster when stacked: ship aft at z≈0, nose +Z
  // Stack joint: ship base at z≈0 relative to mesh origin (mid-stack)
  ship.position.z = 0.55;
  mesh.add(ship);

  // --- Booster (Super Heavy) — below ship ---
  const booster = new THREE.Group();
  booster.name = "booster";

  const boostBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.25, 1.55, 18),
    steel,
  );
  boostBody.rotation.x = Math.PI / 2;
  boostBody.position.z = -0.85;
  booster.add(boostBody);

  // Interstage ring
  const interstage = new THREE.Mesh(
    new THREE.CylinderGeometry(0.245, 0.245, 0.12, 18),
    steelDark,
  );
  interstage.rotation.x = Math.PI / 2;
  interstage.position.z = -0.05;
  booster.add(interstage);

  // Grid fins (4)
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.02, 0.22),
      steelDark,
    );
    fin.position.set(Math.cos(ang) * 0.28, Math.sin(ang) * 0.28, -0.25);
    fin.rotation.z = ang;
    booster.add(fin);
  }

  // Aft octoweb / engine skirt
  const boostSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.28, 0.2, 18),
    steelDark,
  );
  boostSkirt.rotation.x = Math.PI / 2;
  boostSkirt.position.z = -1.7;
  booster.add(boostSkirt);

  // Booster engine ring (theater: 13 bells, not full 33)
  const boostBells = new THREE.Group();
  boostBells.name = "booster-engines";
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const r = i < 3 ? 0.05 : 0.14;
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.055, 0.16, 8, 1, true),
      engine,
    );
    bell.rotation.x = Math.PI / 2;
    bell.position.set(Math.cos(ang) * r, Math.sin(ang) * r, -1.88);
    boostBells.add(bell);
  }
  // Center engine
  const centerBell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.06, 0.18, 8, 1, true),
    engine,
  );
  centerBell.rotation.x = Math.PI / 2;
  centerBell.position.z = -1.9;
  boostBells.add(centerBell);
  booster.add(boostBells);

  const boostPlume = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 1.1, 14, 1, true),
    plumeBoosterMat,
  );
  boostPlume.rotation.x = Math.PI / 2;
  boostPlume.position.z = -2.55;
  boostPlume.name = "plume-booster";
  boostPlume.visible = false;
  booster.add(boostPlume);

  mesh.add(booster);

  mesh.scale.setScalar(scale);
  group.add(mesh);

  const locator = createLocatorSprite();
  group.add(locator);

  return { group, mesh, locator };
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
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999;
  sprite.scale.set(800, 800, 1);
  sprite.name = "locator";
  return sprite;
}

export type CraftVisualState = {
  staged: boolean;
  burning: boolean;
  /** Thrust force (N); scales plume size */
  thrustN: number;
};

/** Reference thrust (N) for plume size normalization. */
const BOOSTER_THRUST_REF = 1.4e8; // ~140 MN theater ascent
const SHIP_THRUST_REF = 8e6; // ~8 MN TLI / landing theater

/**
 * Hide booster after stage-out; show the active plume and scale it with thrust.
 */
export function updateCraftVisuals(
  group: THREE.Group,
  state: CraftVisualState,
): void {
  const booster = group.getObjectByName("booster");
  if (booster) booster.visible = !state.staged;

  const shipPlume = group.getObjectByName("plume-ship");
  const boostPlume = group.getObjectByName("plume-booster");

  const showBoost = state.burning && !state.staged;
  const showShip = state.burning && state.staged;

  if (boostPlume) {
    boostPlume.visible = showBoost;
    if (showBoost) {
      const u = Math.min(1, state.thrustN / BOOSTER_THRUST_REF);
      const s = 0.45 + 0.7 * Math.sqrt(Math.max(u, 0.05));
      boostPlume.scale.set(s, s, 0.5 + 0.9 * u);
    }
  }
  if (shipPlume) {
    shipPlume.visible = showShip;
    if (showShip) {
      const u = Math.min(1, state.thrustN / SHIP_THRUST_REF);
      const s = 0.5 + 0.65 * Math.sqrt(Math.max(u, 0.05));
      shipPlume.scale.set(s, s, 0.55 + 0.75 * u);
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
 * Show red locator when craft is too small on screen or not in chase mode.
 * craftLenKm ≈ mesh scale length.
 */
export function updateLocatorVisibility(
  locator: THREE.Sprite,
  camera: THREE.Camera,
  craftPos: THREE.Vector3,
  opts: { forceShow: boolean; craftLenKm: number },
): void {
  if (opts.forceShow) {
    locator.visible = true;
    const dist = camera.position.distanceTo(craftPos);
    const s = Math.max(200, Math.min(4000, dist * 0.02));
    locator.scale.set(s, s, 1);
    return;
  }

  const dist = camera.position.distanceTo(craftPos);
  const persp = camera as THREE.PerspectiveCamera;
  const fov = (persp.fov ?? 50) * (Math.PI / 180);
  const worldHeight = 2 * Math.tan(fov / 2) * dist;
  const px = (opts.craftLenKm / worldHeight) * (window.innerHeight || 800);
  const tooSmall = px < 6;
  locator.visible = tooSmall;
  if (tooSmall) {
    const s = Math.max(150, Math.min(3000, dist * 0.015));
    locator.scale.set(s, s, 1);
  }
}
