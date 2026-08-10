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
import { createFatLine } from "./fatLines";

/**
 * Starbase pad (Earth-fixed mesh-local) + ascent ground-track on the globe.
 * Pad is parented under the spinning Earth mesh so it co-rotates correctly.
 *
 * Dual scale:
 *  - True-scale OLM + Mechazilla + concrete apron / GSE / wetlands for Ship cam
 *    (stack is 9 m / ~123 m; apron ~200 m; marsh out to ~1–2 km)
 *  - Large thin annular landmark for Earth cam (never a solid disc through the rocket)
 *
 * Pad origin matches craft engines at t≈0 (R_EARTH + pad altitude). Local +Y = up.
 * Liftoff FX update from mission time so scrubbing stays deterministic.
 */
export function createStarbasePad(): THREE.Group {
  const pad = new THREE.Group();
  pad.name = "starbase-pad";

  // Match main.ts near-Earth surface clamp (R_EARTH + 0.05) so the stack sits
  // on the OLM rather than under a floating deck.
  const padAlt = Math.max(STARBASE_ALT, 0.05);
  const local = geodeticToMeshLocal(
    STARBASE_LAT,
    STARBASE_LON,
    R_EARTH + padAlt,
  );
  pad.position.set(local.x, local.y, local.z);

  const outward = new THREE.Vector3(local.x, local.y, local.z).normalize();
  pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);

  // Ground plane, wetlands, lagoons, roads, tank farm (true-scale + mid-field)
  pad.add(createPadSurroundings());

  // --- Earth-cam landmark: marsh annulus + concrete inner (hole for stack) ---
  const groundOffset = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  } as const;
  // Outer wetland band (reads green from LEO)
  const landmarkMarsh = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 2.7, 64, 1),
    new THREE.MeshStandardMaterial({
      color: 0x3d5a3a,
      metalness: 0.08,
      roughness: 0.95,
      ...groundOffset,
    }),
  );
  landmarkMarsh.rotation.x = -Math.PI / 2;
  landmarkMarsh.position.y = -0.01;
  landmarkMarsh.name = "pad-landmark-marsh";
  pad.add(landmarkMarsh);

  // Inner concrete / industrial band
  const landmarkConcrete = new THREE.Mesh(
    new THREE.RingGeometry(0.12, 0.55, 48, 1),
    new THREE.MeshStandardMaterial({
      color: 0x6a6e72,
      metalness: 0.25,
      roughness: 0.82,
      ...groundOffset,
    }),
  );
  landmarkConcrete.rotation.x = -Math.PI / 2;
  landmarkConcrete.position.y = -0.008;
  landmarkConcrete.name = "pad-landmark-ring";
  pad.add(landmarkConcrete);

  // Soft outer coast rim
  const landmarkRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.65, 0.03, 8, 64),
    new THREE.MeshStandardMaterial({
      color: 0x4a6a78,
      metalness: 0.15,
      roughness: 0.85,
    }),
  );
  landmarkRim.rotation.x = Math.PI / 2;
  landmarkRim.position.y = -0.005;
  pad.add(landmarkRim);

  // Flame trench / water deluge channel (true-scale-ish under OLM)
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.006, 0.055),
    new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      metalness: 0.3,
      roughness: 0.8,
    }),
  );
  trench.position.y = -0.006;
  pad.add(trench);

  // Flame sheet in the trench — cool methane/orange, not pure yellow
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff8a48,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.028, 0.05), flameMat);
  flame.position.y = 0.006;
  flame.name = "pad-flame";
  flame.visible = false;
  flame.userData.mat = flameMat;
  pad.add(flame);

  // Secondary flame tongues (stack-scale, muted)
  const tongueMat = new THREE.MeshBasicMaterial({
    color: 0xffa060,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const tongues = new THREE.Group();
  tongues.name = "pad-flame-tongues";
  tongues.visible = false;
  for (const z of [-0.016, -0.005, 0.005, 0.016]) {
    const tongue = new THREE.Mesh(
      new THREE.ConeGeometry(0.007, 0.05, 10, 1, true),
      tongueMat,
    );
    tongue.position.set(0, 0.02, z);
    tongues.add(tongue);
  }
  tongues.userData.mat = tongueMat;
  pad.add(tongues);

  const steamTex = makeSteamTexture();

  // Deluge steam around OLM (liftoff)
  const steamGroup = new THREE.Group();
  steamGroup.name = "pad-steam";
  steamGroup.visible = false;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: steamTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
        color: 0xd8dde4,
      }),
    );
    sprite.position.set(Math.cos(ang) * 0.04, 0.02, Math.sin(ang) * 0.04);
    sprite.scale.setScalar(0.1);
    sprite.userData.baseAng = ang;
    sprite.userData.phase = i * 0.9;
    steamGroup.add(sprite);
  }
  pad.add(steamGroup);

  // Tank-farm / GSE vent steam (prelaunch hold + early flight) — larger plumes
  const ventSteam = new THREE.Group();
  ventSteam.name = "pad-vent-steam";
  ventSteam.visible = false;
  // Cluster over tank farm (+X / +Z of pad, clear of tower at +X)
  const ventAnchors: [number, number, number][] = [
    [0.055, 0.012, 0.04],
    [0.07, 0.014, 0.055],
    [0.048, 0.01, 0.07],
    [0.08, 0.016, 0.03],
    [0.062, 0.013, 0.09],
    [0.09, 0.015, 0.06],
    [0.04, 0.011, 0.05],
    [0.075, 0.018, 0.08],
  ];
  for (let i = 0; i < ventAnchors.length; i++) {
    const [x, y, z] = ventAnchors[i]!;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: steamTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
        color: 0xe8ecf0,
      }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.12);
    sprite.userData.baseX = x;
    sprite.userData.baseY = y;
    sprite.userData.baseZ = z;
    sprite.userData.phase = i * 1.1;
    ventSteam.add(sprite);
  }
  pad.add(ventSteam);

  // True-scale Mechazilla + OLM (engines sit on OLM at y≈0)
  pad.add(createMechazillaTower());

  // --- Pad lighting (floods + plume fill) ---
  // Cool metal-halide floodlights for night ops; warm plume fill when burning.
  const lights = createPadLights();
  pad.add(lights);

  // Beacon on tower peak
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.003, 10, 8),
    new THREE.MeshBasicMaterial({
      color: 0xff5533,
      transparent: true,
      opacity: 0.95,
    }),
  );
  beacon.position.set(0.022, 0.152, 0);
  beacon.name = "pad-beacon";
  pad.add(beacon);

  // Tight ground bloom only while engines fire (no always-on yellow landmark)
  const groundBloom = makeGroundBloomSprite();
  groundBloom.name = "pad-ground-bloom";
  groundBloom.position.set(0, 0.01, 0);
  groundBloom.scale.setScalar(0.12);
  groundBloom.visible = false;
  pad.add(groundBloom);

  return pad;
}

/**
 * True-scale pad deck, roads, wetlands, lagoons, and tank-farm silhouette.
 * Scene units = km. Keeps a hole under the stack so OLM / engines stay clear.
 */
function createPadSurroundings(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-surroundings";

  const groundOff = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  } as const;

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x8a8e94,
    metalness: 0.22,
    roughness: 0.88,
    ...groundOff,
  });
  const concreteDark = new THREE.MeshStandardMaterial({
    color: 0x5c6066,
    metalness: 0.28,
    roughness: 0.82,
    ...groundOff,
  });
  const gravel = new THREE.MeshStandardMaterial({
    color: 0x6e6458,
    metalness: 0.1,
    roughness: 0.95,
    ...groundOff,
  });
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x3a3c40,
    metalness: 0.15,
    roughness: 0.9,
    ...groundOff,
  });
  const marsh = new THREE.MeshStandardMaterial({
    color: 0x4a6b3e,
    metalness: 0.05,
    roughness: 0.97,
    ...groundOff,
  });
  const marshDry = new THREE.MeshStandardMaterial({
    color: 0x6a6a48,
    metalness: 0.05,
    roughness: 0.96,
    ...groundOff,
  });
  const water = new THREE.MeshStandardMaterial({
    color: 0x3a6a78,
    metalness: 0.45,
    roughness: 0.35,
    ...groundOff,
  });
  const waterDark = new THREE.MeshStandardMaterial({
    color: 0x2a4a58,
    metalness: 0.5,
    roughness: 0.4,
    ...groundOff,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x9aa0a8,
    metalness: 0.7,
    roughness: 0.4,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x5a6068,
    metalness: 0.65,
    roughness: 0.5,
  });
  const tankWhite = new THREE.MeshStandardMaterial({
    color: 0xc8ccd0,
    metalness: 0.55,
    roughness: 0.45,
  });

  // --- Main concrete apron (~200 m radius; top near y=0) ---
  const apron = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.115, 0.003, 40),
    concrete,
  );
  apron.position.y = -0.0025;
  apron.name = "pad-apron";
  g.add(apron);

  // Scorched / stained ring under OLM
  const scorch = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.035, 28, 1),
    new THREE.MeshStandardMaterial({
      color: 0x3a3834,
      metalness: 0.2,
      roughness: 0.92,
      ...groundOff,
    }),
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = -0.0006;
  g.add(scorch);

  // Outer gravel / fill shoulder
  const shoulder = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.22, 48, 1),
    gravel,
  );
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.y = -0.0035;
  g.add(shoulder);

  // Secondary industrial hardstand (tank farm side, +X/+Z)
  const hardstand = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.0025, 0.14),
    concreteDark,
  );
  hardstand.position.set(0.07, -0.003, 0.06);
  g.add(hardstand);

  // Access roads (asphalt strips)
  const roadSpecs: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [0.012, 0.002, 0.55], pos: [-0.08, -0.0038, 0.05] }, // inland approach
    { size: [0.45, 0.002, 0.01], pos: [0.05, -0.0038, -0.1] }, // cross road
    { size: [0.01, 0.002, 0.28], pos: [0.14, -0.0038, 0.08] }, // tank farm service
  ];
  for (const r of roadSpecs) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(...r.size), asphalt);
    road.position.set(...r.pos);
    g.add(road);
  }

  // --- Wetland / marsh patches (mid-field, reads in pad cam) ---
  const marshPatches: {
    r: number;
    pos: [number, number];
    mat: THREE.MeshStandardMaterial;
    y?: number;
  }[] = [
    { r: 0.35, pos: [-0.45, 0.25], mat: marsh },
    { r: 0.28, pos: [-0.55, -0.35], mat: marshDry },
    { r: 0.42, pos: [0.35, -0.55], mat: marsh },
    { r: 0.22, pos: [0.55, 0.4], mat: marshDry },
    { r: 0.5, pos: [-0.2, 0.7], mat: marsh },
    { r: 0.38, pos: [0.7, -0.15], mat: marsh },
    { r: 0.3, pos: [-0.75, 0.1], mat: marshDry },
    { r: 0.25, pos: [0.15, 0.55], mat: marsh },
    { r: 0.6, pos: [-0.4, -0.85], mat: marsh },
    { r: 0.33, pos: [0.9, 0.35], mat: marshDry },
  ];
  for (const p of marshPatches) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(p.r, 28),
      p.mat,
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.pos[0], p.y ?? -0.006, p.pos[1]);
    g.add(disc);
  }

  // Lagoons / tidal channels (elongated water)
  const lagoons: {
    size: [number, number];
    pos: [number, number];
    rot: number;
    mat: THREE.MeshStandardMaterial;
  }[] = [
    { size: [0.55, 0.12], pos: [-0.35, 0.4], rot: 0.4, mat: water },
    { size: [0.4, 0.09], pos: [0.45, -0.4], rot: -0.55, mat: waterDark },
    { size: [0.7, 0.14], pos: [-0.15, -0.65], rot: 0.15, mat: water },
    { size: [0.3, 0.08], pos: [0.65, 0.2], rot: 1.1, mat: waterDark },
    { size: [0.48, 0.1], pos: [-0.7, -0.2], rot: -0.3, mat: water },
  ];
  for (const L of lagoons) {
    const pond = new THREE.Mesh(
      new THREE.PlaneGeometry(L.size[0], L.size[1], 1, 1),
      L.mat,
    );
    pond.rotation.x = -Math.PI / 2;
    pond.rotation.z = L.rot;
    pond.position.set(L.pos[0], -0.0055, L.pos[1]);
    g.add(pond);
  }

  // --- Tank farm / GSE block (simplified industrial massing) ---
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  farm.position.set(0.065, 0, 0.055);

  // Horizontal LOX / CH4 tanks
  const tankSpecs: { r: number; len: number; pos: [number, number, number]; yaw: number }[] = [
    { r: 0.0045, len: 0.028, pos: [0.02, 0.005, 0.01], yaw: 0.2 },
    { r: 0.0045, len: 0.028, pos: [0.02, 0.005, 0.022], yaw: 0.2 },
    { r: 0.0055, len: 0.035, pos: [0.035, 0.006, 0.035], yaw: -0.4 },
    { r: 0.0035, len: 0.02, pos: [0.01, 0.004, 0.038], yaw: 1.2 },
    { r: 0.004, len: 0.024, pos: [0.045, 0.005, 0.012], yaw: 0.8 },
  ];
  for (const t of tankSpecs) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(t.r, t.r, t.len, 12),
      tankWhite,
    );
    tank.rotation.z = Math.PI / 2;
    tank.rotation.y = t.yaw;
    tank.position.set(...t.pos);
    farm.add(tank);
  }

  // Vertical bullet tanks / vents
  for (let i = 0; i < 5; i++) {
    const h = 0.012 + (i % 3) * 0.004;
    const bullet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0022, h, 10),
      steel,
    );
    bullet.position.set(0.008 + i * 0.007, h * 0.5, 0.048);
    farm.add(bullet);
    // Cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.0022, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      tankWhite,
    );
    cap.position.set(0.008 + i * 0.007, h, 0.048);
    farm.add(cap);
  }

  // Equipment blocks / pipe racks
  const equip: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [0.03, 0.006, 0.018], pos: [0.03, 0.004, -0.005] },
    { size: [0.018, 0.01, 0.014], pos: [0.05, 0.006, 0.05] },
    { size: [0.012, 0.008, 0.022], pos: [-0.005, 0.005, 0.02] },
    { size: [0.04, 0.003, 0.008], pos: [0.025, 0.008, 0.028] }, // pipe rack
  ];
  for (const e of equip) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(...e.size), steelDark);
    box.position.set(...e.pos);
    farm.add(box);
  }

  // Vent / flare stacks (tall thin)
  for (const [sx, sz, h] of [
    [0.055, 0.04, 0.028],
    [0.042, 0.055, 0.022],
    [0.06, 0.02, 0.018],
  ] as const) {
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0008, 0.001, h, 8),
      steelDark,
    );
    stack.position.set(sx, h * 0.5, sz);
    farm.add(stack);
  }

  // Low retaining wall around farm
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.004, 0.002),
    concreteDark,
  );
  wall.position.set(0.03, 0.001, -0.02);
  farm.add(wall);
  const wall2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.002, 0.004, 0.09),
    concreteDark,
  );
  wall2.position.set(-0.015, 0.001, 0.025);
  farm.add(wall2);

  g.add(farm);

  // Small support building / trailers near apron edge
  const trailer = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.004, 0.006),
    new THREE.MeshStandardMaterial({
      color: 0xb0b4b8,
      metalness: 0.35,
      roughness: 0.65,
    }),
  );
  trailer.position.set(-0.09, 0.001, 0.04);
  g.add(trailer);

  return g;
}

/** Cool-white flood + warm plume fill under the stack. */
function createPadLights(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-lights";

  // Tower floodlights aimed at the stack (cool white)
  const floodTargets: { pos: [number, number, number]; look: [number, number, number] }[] = [
    { pos: [0.018, 0.09, 0.012], look: [0, 0.055, 0] }, // mid tower → stack mid
    { pos: [0.018, 0.055, -0.012], look: [0, 0.04, 0] }, // lower tower → booster
    { pos: [0.012, 0.12, 0], look: [0, 0.09, 0] }, // upper → ship
  ];
  for (let i = 0; i < floodTargets.length; i++) {
    const f = floodTargets[i]!;
    const spot = new THREE.SpotLight(
      0xe8f0ff,
      0,
      0.35, // ~350 m reach
      Math.PI / 5.5,
      0.45,
      1.6,
    );
    spot.name = `pad-flood-${i}`;
    spot.position.set(f.pos[0], f.pos[1], f.pos[2]);
    spot.target.position.set(f.look[0], f.look[1], f.look[2]);
    g.add(spot);
    g.add(spot.target);

    // Small emissive fixture so floods read as real lamps
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, 0.0015, 0.002),
      new THREE.MeshStandardMaterial({
        color: 0x8890a0,
        emissive: 0xc8d4e8,
        emissiveIntensity: 0.35,
        metalness: 0.6,
        roughness: 0.4,
      }),
    );
    fixture.position.copy(spot.position);
    fixture.name = `pad-flood-fixture-${i}`;
    g.add(fixture);
  }

  // Soft fill under / around the stack (cool at night, warm when burning)
  const fill = new THREE.PointLight(0xdde6f4, 0, 0.28, 1.8);
  fill.name = "pad-fill";
  fill.position.set(0, 0.03, 0);
  g.add(fill);

  // Plume-only warm fill at engine plane (tight, no multi-km wash)
  const plume = new THREE.PointLight(0xff9a58, 0, 0.22, 2);
  plume.name = "pad-plume-light";
  plume.position.set(0, 0.008, 0);
  g.add(plume);

  // OLM ring of tiny work lights (emissive dots)
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.0006, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xf0f4ff }),
    );
    lamp.position.set(Math.cos(ang) * 0.013, 0.003, Math.sin(ang) * 0.013);
    lamp.name = `pad-olm-lamp-${i}`;
    g.add(lamp);
  }

  return g;
}

export type LaunchPadFxState = {
  /**
   * Mission time in seconds. Liftoff = 0; negative = pre-liftoff countdown
   * (tank-farm vent steam / pad-ops lights).
   */
  missionT: number;
  phase: string;
  burning: boolean;
  /** Altitude above Earth surface (km) */
  altEarth: number;
  /**
   * Sun elevation factor at Starbase: 1 = high day, 0 = civil twilight,
   * negative ≈ night. From sun·localUp.
   */
  sunElev?: number;
};

/**
 * Drive flame trench, deluge steam, vent plumes, and pad lighting from mission
 * state. Day/night flood balance uses `sunElev`; scrub-safe.
 *
 * `missionT` may be negative (pre-liftoff countdown) so tank-farm vent steam
 * reads during the T− hold like the webcast.
 */
export function updateStarbaseLaunchFx(
  pad: THREE.Object3D,
  state: LaunchPadFxState,
): void {
  const onPadPhase =
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 25);
  const nearPad =
    state.phase === "launch" ||
    (state.phase === "ascent" && state.altEarth < 8) ||
    state.missionT < 30;
  const active = state.burning && onPadPhase && state.missionT >= 0;

  // Intensity falls with altitude and fades after leaving thick atmosphere theater
  const altFade = THREE.MathUtils.clamp(1 - state.altEarth / 18, 0, 1);
  const t = state.missionT;
  // Animation clock: keep prelaunch steam drifting (t is negative on hold)
  const animT = t;
  const flicker =
    0.9 +
    0.06 * Math.sin(Math.max(0, t) * 41.2) +
    0.04 * Math.sin(Math.max(0, t) * 77.5 + 0.7);
  const strength = active ? altFade * flicker : 0;

  // Day factor: 1 midday, 0 deep night (soft twilight band)
  const elev = state.sunElev ?? 0.4;
  const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.22);
  const night = 1 - day;

  const flame = pad.getObjectByName("pad-flame") as THREE.Mesh | undefined;
  if (flame) {
    const mat = (flame.userData.mat as THREE.MeshBasicMaterial) ??
      (flame.material as THREE.MeshBasicMaterial);
    flame.visible = strength > 0.02;
    mat.opacity = 0.4 * strength;
    flame.scale.set(1, 0.7 + 0.5 * strength, 1);
  }

  const tongues = pad.getObjectByName("pad-flame-tongues");
  if (tongues) {
    tongues.visible = strength > 0.05;
    const mat = tongues.userData.mat as THREE.MeshBasicMaterial | undefined;
    if (mat) mat.opacity = 0.28 * strength;
    tongues.scale.set(1, 0.6 + 0.7 * strength, 1);
  }

  const steam = pad.getObjectByName("pad-steam");
  if (steam) {
    // Steam hangs a bit longer than hard flame (true-scale around OLM)
    const steamStr =
      state.burning && state.altEarth < 35 && state.missionT < 180
        ? THREE.MathUtils.clamp(1 - state.altEarth / 30, 0, 1) *
          (state.phase === "launch" || state.phase === "ascent" ? 1 : 0)
        : 0;
    steam.visible = steamStr > 0.03;
    steam.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      const mat = obj.material as THREE.SpriteMaterial;
      const phase = (obj.userData.phase as number) ?? 0;
      const wobble = 0.85 + 0.15 * Math.sin(animT * 3.1 + phase);
      // Slightly brighter steam at night (backlit by floods / plume)
      mat.opacity = (0.28 + 0.14 * night) * steamStr * wobble;
      const grow = 0.06 + steamStr * 0.12 + 0.02 * Math.sin(animT * 2.2 + phase);
      obj.scale.setScalar(grow);
      const ang = (obj.userData.baseAng as number) ?? 0;
      const r = 0.04 + steamStr * 0.06 + 0.01 * Math.sin(animT * 1.7 + phase);
      obj.position.set(
        Math.cos(ang + animT * 0.05) * r,
        0.02 + steamStr * 0.06 + 0.01 * Math.sin(animT * 2.5 + phase),
        Math.sin(ang + animT * 0.05) * r,
      );
    });
  }

  // Tank-farm vent steam: strong on countdown hold, eases after liftoff
  const vent = pad.getObjectByName("pad-vent-steam");
  if (vent) {
    let ventStr = 0;
    if (state.missionT < 0) {
      // Full hold plume (SpaceX webcast look)
      ventStr = 0.85 + 0.15 * Math.sin(animT * 0.7);
    } else if (state.missionT < 90 && state.altEarth < 12) {
      ventStr = THREE.MathUtils.clamp(1 - state.missionT / 90, 0, 1) * 0.75;
    }
    // Dim slightly once engines light (deluge takes visual priority)
    if (strength > 0.2) ventStr *= 0.55;
    vent.visible = ventStr > 0.04;
    vent.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      const mat = obj.material as THREE.SpriteMaterial;
      const phase = (obj.userData.phase as number) ?? 0;
      const wobble = 0.8 + 0.2 * Math.sin(animT * 1.8 + phase);
      mat.opacity = (0.35 + 0.2 * night) * ventStr * wobble;
      const grow =
        0.08 + ventStr * 0.18 + 0.03 * Math.sin(animT * 1.4 + phase);
      obj.scale.set(grow * 1.15, grow * 1.4, 1);
      const bx = (obj.userData.baseX as number) ?? 0;
      const by = (obj.userData.baseY as number) ?? 0;
      const bz = (obj.userData.baseZ as number) ?? 0;
      obj.position.set(
        bx + 0.012 * Math.sin(animT * 0.4 + phase),
        by + ventStr * 0.08 + 0.02 * Math.sin(animT * 1.1 + phase),
        bz + 0.01 * Math.cos(animT * 0.35 + phase),
      );
    });
  }

  // Floodlights: strong at night on pad, dim day fill; drop once stack is gone
  const padOps =
    nearPad ||
    state.missionT < 0 ||
    (state.phase === "launch" && state.missionT < 120);
  const floodBase = padOps ? 0.15 * day + 1.15 * night : 0;
  for (let i = 0; i < 3; i++) {
    const spot = pad.getObjectByName(`pad-flood-${i}`) as
      | THREE.SpotLight
      | undefined;
    if (!spot) continue;
    // Dim slightly while plume is roaring (avoid double-wash)
    const plumeDim = 1 - 0.35 * strength;
    spot.intensity = floodBase * plumeDim * (0.85 + 0.15 * (i === 0 ? 1 : 0.75));
    spot.distance = 0.28 + 0.1 * night;
  }

  // Cool ambient fill around the complex
  const fill = pad.getObjectByName("pad-fill") as THREE.PointLight | undefined;
  if (fill) {
    fill.intensity = padOps ? 0.08 * day + 0.55 * night * (1 - 0.4 * strength) : 0;
    fill.color.setHex(strength > 0.1 ? 0xffe0c8 : 0xdde6f4);
    fill.distance = 0.22 + 0.08 * night;
  }

  // Warm plume light — tight under engines only while burning
  const plume = pad.getObjectByName("pad-plume-light") as
    | THREE.PointLight
    | undefined;
  if (plume) {
    plume.intensity = 2.2 * strength;
    plume.distance = 0.14 + 0.1 * strength;
    plume.color.setRGB(1, 0.55 + 0.1 * flicker, 0.28);
  }

  // Fixture emissives track flood intensity
  for (let i = 0; i < 3; i++) {
    const fixture = pad.getObjectByName(`pad-flood-fixture-${i}`) as
      | THREE.Mesh
      | undefined;
    if (!fixture) continue;
    const mat = fixture.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.15 + floodBase * 1.4;
  }

  // OLM lamps: on for pad ops, brighter at night
  for (let i = 0; i < 8; i++) {
    const lamp = pad.getObjectByName(`pad-olm-lamp-${i}`) as
      | THREE.Mesh
      | undefined;
    if (!lamp) continue;
    lamp.visible = padOps;
    const mat = lamp.material as THREE.MeshBasicMaterial;
    mat.opacity = 1;
    mat.color.setHex(padOps ? (night > 0.5 ? 0xf4f8ff : 0xc8d0dc) : 0x444444);
  }

  // Tight ground bloom only under plume (no multi-km yellow disc)
  const bloom = pad.getObjectByName("pad-ground-bloom") as
    | THREE.Sprite
    | undefined;
  if (bloom) {
    const show = strength > 0.04;
    bloom.visible = show;
    if (show) {
      const mat = bloom.material as THREE.SpriteMaterial;
      mat.opacity = 0.35 * strength * flicker;
      const s = 0.08 + 0.1 * strength;
      bloom.scale.set(s, s, 1);
    }
  }
}

/**
 * Sub-satellite ground track for launch → early low Earth orbit, in Earth mesh-local coords
 * so it co-rotates with the surface.
 */
export function createAscentGroundTrack(
  samples: Sample[],
): THREE.Object3D | null {
  const pts: THREE.Vector3[] = [];
  const rel = v3();
  const local = v3();

  for (const s of samples) {
    if (s.phase !== "launch" && s.phase !== "ascent" && s.phase !== "lowEarthOrbit") {
      if (pts.length > 10) break;
      continue;
    }
    if (s.phase === "lowEarthOrbit" && s.t > 6000) break;

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

  const line = createFatLine(used, {
    color: 0xff8866,
    opacity: 0.85,
    linewidth: 2.75,
    depthTest: true,
  });
  line.name = "ascent-ground-track";
  return line;
}

/** Tight warm bloom under the plume (true-scale; only while burning). */
function makeGroundBloomSprite(): THREE.Sprite {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, "rgba(255, 200, 140, 0.9)");
  g.addColorStop(0.3, "rgba(255, 120, 60, 0.35)");
  g.addColorStop(0.65, "rgba(255, 80, 40, 0.08)");
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
      depthTest: true,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/**
 * True-scale Orbital Launch Integration Tower (Mechazilla).
 * Scene units = km. ~146 m tall, ~14 m face, chopsticks + QD arm silhouette.
 * Stack is 9 m diameter / ~123 m tall — tower stands just clear of the OLM.
 */
function createMechazillaTower(): THREE.Group {
  const g = new THREE.Group();
  g.name = "mechazilla";

  // Real-ish meters → km
  const H = 0.146; // tower height
  const FACE = 0.014; // ~14 m square face
  const COL = 0.0016; // column thickness ~1.6 m
  // Offset from pad center: clear of 9 m stack + OLM lip (~22 m)
  const OX = 0.022;
  // Apron top is y≈0; tower base sits on the steel deck
  const OY0 = 0.0;

  const steel = new THREE.MeshStandardMaterial({
    color: 0xb4b8c0,
    metalness: 0.72,
    roughness: 0.38,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x7a8088,
    metalness: 0.65,
    roughness: 0.45,
  });
  const steelBright = new THREE.MeshStandardMaterial({
    color: 0xc8ccd2,
    metalness: 0.78,
    roughness: 0.32,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x5a6068,
    metalness: 0.55,
    roughness: 0.5,
  });

  // Four corner columns (lattice spine)
  const half = FACE * 0.5;
  const corners: [number, number][] = [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ];
  for (const [cx, cz] of corners) {
    const col = new THREE.Mesh(
      new THREE.BoxGeometry(COL, H, COL),
      steel,
    );
    col.position.set(OX + cx, OY0 + H * 0.5, cz);
    g.add(col);
  }

  // Horizontal ring beams every ~12 m
  const nRings = 12;
  for (let i = 1; i <= nRings; i++) {
    const y = OY0 + (i / nRings) * H * 0.96;
    // X-facing faces
    for (const z of [-half, half]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(FACE, COL * 0.7, COL * 0.65),
        steelDark,
      );
      beam.position.set(OX, y, z);
      g.add(beam);
    }
    // Z-facing faces
    for (const x of [-half, half]) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(COL * 0.65, COL * 0.7, FACE),
        steelDark,
      );
      beam.position.set(OX + x, y, 0);
      g.add(beam);
    }
  }

  // Diagonal X-bracing on pad-facing and flank faces
  addTowerBracing(g, OX, OY0, H, FACE, COL, nRings, accent);

  // Elevator / rail trunk on pad-facing side
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(COL * 1.2, H * 0.92, COL * 2.2),
    steelBright,
  );
  rail.position.set(OX - half - COL * 0.4, OY0 + H * 0.48, 0);
  g.add(rail);

  // Peak sheave / crane head
  const peak = new THREE.Mesh(
    new THREE.BoxGeometry(FACE * 1.15, 0.008, FACE * 1.15),
    steelBright,
  );
  peak.position.set(OX, OY0 + H + 0.002, 0);
  g.add(peak);
  const sheave = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, FACE * 0.7, 10),
    steelDark,
  );
  sheave.rotation.z = Math.PI / 2;
  sheave.position.set(OX - half * 0.3, OY0 + H + 0.006, 0);
  g.add(sheave);

  // Chopstick carriage (rides rails) — open for stacked vehicle
  // Catch height ~ mid-upper booster when returning (~70–85 m); prelaunch open beside stack
  const carryY = OY0 + 0.078; // ~78 m
  const carriage = new THREE.Mesh(
    new THREE.BoxGeometry(FACE * 1.25, 0.01, FACE * 1.4),
    steelDark,
  );
  carriage.position.set(OX, carryY, 0);
  g.add(carriage);

  // Chopsticks: two long arms reaching toward / around the stack (open)
  // Arm length ~22 m each side; stacked open width clears 9 m vehicle
  const armLen = 0.024;
  const armSq = 0.0022;
  for (const side of [-1, 1] as const) {
    const stick = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(armLen, armSq, armSq * 1.4),
      steelBright,
    );
    // Extend from tower toward −X (pad center / stack)
    beam.position.set(-armLen * 0.5, 0, 0);
    stick.add(beam);
    // Inner "finger" / rack
    const finger = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, armSq * 1.3, armSq * 2.2),
      steel,
    );
    finger.position.set(-armLen + 0.002, 0, 0);
    stick.add(finger);
    // Cross tooth near tip
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.003, armSq * 0.9, 0.01),
      accent,
    );
    tooth.position.set(-armLen + 0.005, 0, 0);
    stick.add(tooth);

    stick.position.set(
      OX - half,
      carryY + 0.004,
      side * 0.012, // ~12 m half-gap when open
    );
    // Slight inward angle (open but ready)
    stick.rotation.y = side * 0.04;
    g.add(stick);
  }

  // Ship QD / propellant transfer boom (higher, reaches ship mid-barrel)
  // Ship mid ~ 71 + 26 ≈ 97 m
  const qdY = OY0 + 0.098;
  const qd = new THREE.Group();
  const qdBoom = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.0018, 0.0018),
    steel,
  );
  qdBoom.position.set(-0.01, 0, 0);
  qd.add(qdBoom);
  const qdHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.004, 0.004),
    steelDark,
  );
  qdHead.position.set(-0.021, 0, 0);
  qd.add(qdHead);
  qd.position.set(OX - half, qdY, 0.004);
  g.add(qd);

  // OLM lip / hold-down ring under the stack (true-scale cue)
  const olm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.004, 20),
    steelDark,
  );
  olm.position.set(0, OY0 + 0.002, 0);
  g.add(olm);

  // Six OLM legs (stubby)
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.0025, 0.008, 0.0025),
      accent,
    );
    leg.position.set(Math.cos(ang) * 0.011, OY0 + 0.004, Math.sin(ang) * 0.011);
    g.add(leg);
  }

  return g;
}

/** X-brace panels on Mechazilla faces (skips over-dense mid rings). */
function addTowerBracing(
  g: THREE.Group,
  ox: number,
  y0: number,
  h: number,
  face: number,
  col: number,
  nRings: number,
  mat: THREE.Material,
): void {
  const half = face * 0.5;
  for (let i = 0; i < nRings - 1; i += 1) {
    if (i % 2 === 1) continue; // every other bay
    const ya = y0 + ((i + 0.12) / nRings) * h * 0.96;
    const yb = y0 + ((i + 0.88) / nRings) * h * 0.96;
    const midY = (ya + yb) * 0.5;
    const segH = yb - ya;
    const len = Math.hypot(face, segH);
    const tilt = Math.atan2(face, segH);

    // Pad-facing face (constant x = ox - half): braces in YZ
    for (const flip of [-1, 1]) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(col * 0.35, len, col * 0.35),
        mat,
      );
      b.position.set(ox - half, midY, 0);
      b.rotation.x = flip * tilt;
      g.add(b);
    }

    // Side faces (constant z = ±half): braces in XY
    for (const z of [-half, half]) {
      for (const flip of [-1, 1]) {
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(col * 0.35, len, col * 0.35),
          mat,
        );
        b.position.set(ox, midY, z);
        b.rotation.z = flip * tilt;
        g.add(b);
      }
    }
  }
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

/** Pulse pad beacon (wall-clock). */
export function pulsePadBeacon(pad: THREE.Object3D, wallT: number): void {
  const beacon = pad.getObjectByName("pad-beacon") as THREE.Mesh | undefined;
  if (!beacon) return;
  const mat = beacon.material as THREE.MeshBasicMaterial;
  mat.opacity = 0.55 + 0.4 * Math.sin(wallT * 4);
}
