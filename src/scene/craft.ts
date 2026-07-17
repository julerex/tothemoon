import * as THREE from "three";

/**
 * Near-true-scale craft (~tens of meters) plus a red locator for system views.
 * Scene unit = 1 km, so 40 m craft ≈ 0.04.
 */
export function createCraft(): {
  group: THREE.Group;
  mesh: THREE.Group;
  locator: THREE.Sprite;
} {
  const group = new THREE.Group();

  const mesh = new THREE.Group();
  // Dimensions in km (40 m long stack)
  const scale = 0.04;

  const metal = new THREE.MeshStandardMaterial({
    color: 0xc8ccd0,
    metalness: 0.65,
    roughness: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x2a2e32,
    metalness: 0.4,
    roughness: 0.5,
  });
  const gold = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.7,
    roughness: 0.35,
  });
  const engine = new THREE.MeshStandardMaterial({
    color: 0x1a1c1e,
    metalness: 0.5,
    roughness: 0.4,
  });
  const thrusterGlow = new THREE.MeshBasicMaterial({
    color: 0x6ec8ff,
    transparent: true,
    opacity: 0.55,
  });

  const sm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 12), metal);
  sm.rotation.x = Math.PI / 2;
  sm.position.z = -0.15;
  mesh.add(sm);

  const foil = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.18, 12), gold);
  foil.rotation.x = Math.PI / 2;
  foil.position.z = -0.05;
  mesh.add(foil);

  const cm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12), metal);
  cm.rotation.x = -Math.PI / 2;
  cm.position.z = 0.42;
  mesh.add(cm);

  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 12), dark);
  shield.rotation.x = Math.PI / 2;
  shield.position.z = 0.18;
  mesh.add(shield);

  const bell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.18, 0.28, 12, 1, true),
    engine,
  );
  bell.rotation.x = Math.PI / 2;
  bell.position.z = -0.62;
  mesh.add(bell);

  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.35, 10, 1, true),
    thrusterGlow,
  );
  plume.rotation.x = Math.PI / 2;
  plume.position.z = -0.9;
  plume.name = "plume";
  mesh.add(plume);

  mesh.scale.setScalar(scale);
  group.add(mesh);

  // Red locator sprite (screen-space-ish via sizeAttenuation)
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

  // Soft glow
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 70, 80, 1)");
  g.addColorStop(0.25, "rgba(255, 40, 55, 0.9)");
  g.addColorStop(0.55, "rgba(255, 40, 55, 0.25)");
  g.addColorStop(1, "rgba(255, 40, 55, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Hard core
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
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  // ~800 km apparent blob at system scale so free camera can find craft
  sprite.scale.set(800, 800, 1);
  sprite.name = "locator";
  return sprite;
}

export function setPlumeVisible(group: THREE.Group, visible: boolean): void {
  const plume = group.getObjectByName("plume");
  if (plume) plume.visible = visible;
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
    // Scale locator with distance so it stays ~constant pixel size-ish
    const dist = camera.position.distanceTo(craftPos);
    const s = Math.max(200, Math.min(4000, dist * 0.02));
    locator.scale.set(s, s, 1);
    return;
  }

  // Estimate projected size of craft in pixels (rough)
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
