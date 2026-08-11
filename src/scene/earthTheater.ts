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
 *  - True-scale OLM + Mechazilla + OLP-2 hardstand / tank farm / GSE for Ship cam
 *    (layout loosely follows the public satellite footprint: tower SW, tanks E/NE,
 *    warehouse + Boca Chica Blvd north, tan coastal scrub outside the concrete)
 *  - Large thin annular landmark for Earth cam (never a solid disc through the rocket)
 *
 * V3 close-up (trench / pad cam): scorch + water stains, multi-tier deluge sheets,
 * thicker chopsticks/QD silhouette, scrub-driven heat haze over the trench.
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

  // Satellite-style hardstand, tank farm, road, scrub (true-scale + mid-field)
  pad.add(createPadSurroundings());

  // --- Earth-cam landmark: tan scrub + concrete industrial core ---
  const groundOffset = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  } as const;
  // Outer Boca Chica scrub (tan / olive, not marsh green)
  const landmarkScrub = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 2.7, 64, 1),
    new THREE.MeshStandardMaterial({
      color: 0x8a7a5c,
      metalness: 0.05,
      roughness: 0.97,
      ...groundOffset,
    }),
  );
  landmarkScrub.rotation.x = -Math.PI / 2;
  landmarkScrub.position.y = -0.01;
  landmarkScrub.name = "pad-landmark-scrub";
  pad.add(landmarkScrub);

  // Inner concrete / industrial band (reads gray from LEO)
  const landmarkConcrete = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.48, 48, 1),
    new THREE.MeshStandardMaterial({
      color: 0x7a7e84,
      metalness: 0.22,
      roughness: 0.85,
      ...groundOffset,
    }),
  );
  landmarkConcrete.rotation.x = -Math.PI / 2;
  landmarkConcrete.position.y = -0.008;
  landmarkConcrete.name = "pad-landmark-ring";
  pad.add(landmarkConcrete);

  // Soft outer coast rim
  const landmarkRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.65, 0.028, 8, 64),
    new THREE.MeshStandardMaterial({
      color: 0x6a7a70,
      metalness: 0.12,
      roughness: 0.9,
    }),
  );
  landmarkRim.rotation.x = Math.PI / 2;
  landmarkRim.position.y = -0.005;
  pad.add(landmarkRim);

  // Flame trench / water deluge channel (true-scale-ish under OLM)
  // Charred steel sides read under trench cam (V3 close-up)
  const trenchSteel = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    metalness: 0.45,
    roughness: 0.72,
  });
  const trench = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.006, 0.055),
    trenchSteel,
  );
  trench.position.y = -0.006;
  trench.name = "pad-trench";
  pad.add(trench);
  // Inner scorched floor of trench
  const trenchFloor = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.0012, 0.048),
    new THREE.MeshStandardMaterial({
      color: 0x0c0c0e,
      metalness: 0.35,
      roughness: 0.9,
      map: makeScorchTexture(),
    }),
  );
  trenchFloor.position.y = -0.0082;
  trenchFloor.name = "pad-trench-floor";
  pad.add(trenchFloor);

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

  // Deluge steam around OLM (liftoff) — multi-tier volume (V3)
  const steamGroup = new THREE.Group();
  steamGroup.name = "pad-steam";
  steamGroup.visible = false;
  // Tier 0: tight ring at OLM lip; tier 1: mid plume; tier 2: lofted cloud
  const steamTiers: { n: number; r0: number; y0: number; scale: number; color: number }[] = [
    { n: 10, r0: 0.028, y0: 0.012, scale: 0.07, color: 0xe0e6ec },
    { n: 8, r0: 0.045, y0: 0.028, scale: 0.11, color: 0xd0d6de },
    { n: 6, r0: 0.062, y0: 0.05, scale: 0.15, color: 0xc4cad2 },
  ];
  let steamIdx = 0;
  for (let ti = 0; ti < steamTiers.length; ti++) {
    const tier = steamTiers[ti]!;
    for (let i = 0; i < tier.n; i++) {
      const ang = (i / tier.n) * Math.PI * 2 + steamIdx * 0.17;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: steamTex,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.NormalBlending,
          color: tier.color,
        }),
      );
      sprite.position.set(Math.cos(ang) * tier.r0, tier.y0, Math.sin(ang) * tier.r0);
      sprite.scale.setScalar(tier.scale);
      sprite.userData.baseAng = ang;
      sprite.userData.baseR = tier.r0;
      sprite.userData.baseY = tier.y0;
      sprite.userData.baseScale = tier.scale;
      sprite.userData.phase = steamIdx * 0.85;
      sprite.userData.tier = ti;
      steamGroup.add(sprite);
      steamIdx++;
    }
  }
  pad.add(steamGroup);

  // Sheet-like deluge curtains along trench long axis (V3 volumetric read)
  const delugeSheets = new THREE.Group();
  delugeSheets.name = "pad-deluge-sheets";
  delugeSheets.visible = false;
  const sheetAnchors: { pos: [number, number, number]; sx: number; sy: number; phase: number }[] = [
    { pos: [0.012, 0.018, 0], sx: 0.055, sy: 0.04, phase: 0.2 },
    { pos: [-0.012, 0.016, 0], sx: 0.05, sy: 0.038, phase: 1.1 },
    { pos: [0, 0.022, 0.022], sx: 0.04, sy: 0.045, phase: 2.0 },
    { pos: [0, 0.02, -0.022], sx: 0.042, sy: 0.042, phase: 2.8 },
    { pos: [0.008, 0.03, 0.01], sx: 0.06, sy: 0.05, phase: 3.5 },
    { pos: [-0.006, 0.032, -0.008], sx: 0.058, sy: 0.048, phase: 4.2 },
  ];
  for (const a of sheetAnchors) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: steamTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
        color: 0xd8e0e8,
      }),
    );
    sprite.position.set(...a.pos);
    sprite.scale.set(a.sx, a.sy, 1);
    sprite.userData.baseX = a.pos[0];
    sprite.userData.baseY = a.pos[1];
    sprite.userData.baseZ = a.pos[2];
    sprite.userData.baseSx = a.sx;
    sprite.userData.baseSy = a.sy;
    sprite.userData.phase = a.phase;
    delugeSheets.add(sprite);
  }
  pad.add(delugeSheets);

  // Heat haze above trench at ignition (scrub-driven shimmer sprites, V3)
  const hazeTex = makeHeatHazeTexture();
  const heatHaze = new THREE.Group();
  heatHaze.name = "pad-heat-haze";
  heatHaze.visible = false;
  for (let i = 0; i < 5; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: hazeTex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        color: 0xffc8a0,
      }),
    );
    const z = -0.018 + i * 0.009;
    sprite.position.set(0, 0.014, z);
    sprite.scale.set(0.028, 0.022, 1);
    sprite.userData.baseZ = z;
    sprite.userData.phase = i * 1.3;
    heatHaze.add(sprite);
  }
  pad.add(heatHaze);

  // Tank-farm vent steam (prelaunch hold) — over the white tank rows (+X / +Z)
  const ventSteam = new THREE.Group();
  ventSteam.name = "pad-vent-steam";
  ventSteam.visible = false;
  const ventAnchors: [number, number, number][] = [
    [0.095, 0.014, 0.035],
    [0.11, 0.016, 0.05],
    [0.085, 0.013, 0.055],
    [0.12, 0.018, 0.04],
    [0.1, 0.015, 0.07],
    [0.13, 0.017, 0.055],
    [0.075, 0.012, 0.04],
    [0.115, 0.02, 0.065],
    [0.14, 0.015, 0.08],
    [0.09, 0.014, 0.085],
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
 * OLP-2-style pad complex (theater massing from public satellite layout).
 *
 * Local frame (km): origin = stack / OLM, +Y up, tower at +X.
 *  - Large gray concrete hardstand (angular, not a round disc)
 *  - Dense white horizontal tank rows E/NE of the tower
 *  - Pipe racks, warehouse, Boca Chica Blvd + parking to the north
 *  - Tan coastal scrub outside the fence line
 *
 * Scene units = km. Keeps clearance under the stack so OLM / engines stay clear.
 */
function createPadSurroundings(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-surroundings";

  const groundOff = {
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  } as const;

  // Satellite palette: light industrial concrete, darker service pads, tan dirt
  const concrete = new THREE.MeshStandardMaterial({
    color: 0x9a9ea4,
    metalness: 0.18,
    roughness: 0.9,
    ...groundOff,
  });
  const concreteLight = new THREE.MeshStandardMaterial({
    color: 0xb0b4b8,
    metalness: 0.15,
    roughness: 0.88,
    ...groundOff,
  });
  const concreteDark = new THREE.MeshStandardMaterial({
    color: 0x6a6e74,
    metalness: 0.22,
    roughness: 0.86,
    ...groundOff,
  });
  const scrub = new THREE.MeshStandardMaterial({
    color: 0x9a8a68,
    metalness: 0.04,
    roughness: 0.98,
    ...groundOff,
  });
  const scrubDark = new THREE.MeshStandardMaterial({
    color: 0x7a6a4e,
    metalness: 0.04,
    roughness: 0.97,
    ...groundOff,
  });
  const dirt = new THREE.MeshStandardMaterial({
    color: 0xb0a080,
    metalness: 0.05,
    roughness: 0.96,
    ...groundOff,
  });
  const asphalt = new THREE.MeshStandardMaterial({
    color: 0x4a4c50,
    metalness: 0.12,
    roughness: 0.92,
    ...groundOff,
  });
  const water = new THREE.MeshStandardMaterial({
    color: 0x4a6a62,
    metalness: 0.4,
    roughness: 0.4,
    ...groundOff,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x8a9098,
    metalness: 0.72,
    roughness: 0.42,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x4a5058,
    metalness: 0.65,
    roughness: 0.5,
  });
  const tankWhite = new THREE.MeshStandardMaterial({
    color: 0xd8dce0,
    metalness: 0.5,
    roughness: 0.4,
  });
  const warehouseRoof = new THREE.MeshStandardMaterial({
    color: 0xc4b8a0,
    metalness: 0.25,
    roughness: 0.75,
  });
  const warehouseWall = new THREE.MeshStandardMaterial({
    color: 0xb8b0a0,
    metalness: 0.2,
    roughness: 0.8,
  });
  const carPaint = new THREE.MeshStandardMaterial({
    color: 0x3a3e48,
    metalness: 0.4,
    roughness: 0.55,
  });

  // --- Tan scrub / dirt outside the complex (Boca Chica coastal plain) ---
  const scrubPatches: { r: number; pos: [number, number]; mat: THREE.MeshStandardMaterial }[] = [
    { r: 0.9, pos: [-0.55, -0.4], mat: scrub },
    { r: 0.7, pos: [0.55, -0.65], mat: scrubDark },
    { r: 0.85, pos: [-0.7, 0.35], mat: dirt },
    { r: 0.6, pos: [0.85, 0.15], mat: scrub },
    { r: 0.75, pos: [0.2, 0.85], mat: scrubDark },
    { r: 0.5, pos: [-0.3, -0.85], mat: dirt },
    { r: 0.55, pos: [0.95, -0.35], mat: scrub },
    { r: 0.45, pos: [-0.9, -0.1], mat: scrubDark },
  ];
  for (const p of scrubPatches) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), p.mat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(p.pos[0], -0.007, p.pos[1]);
    g.add(disc);
  }

  // Small green water / drainage pond (satellite N edge near Starhopper)
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), water);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(0.05, -0.0058, 0.42);
  g.add(pond);

  // --- Main OLP hardstand: angular concrete (satellite is a big irregular pad) ---
  // Layered boxes approximate the SW tower apron + NE industrial yard.
  // Dimensions in km: 0.001 = 1 m.
  const padSlabs: {
    size: [number, number, number];
    pos: [number, number, number];
    mat: THREE.MeshStandardMaterial;
  }[] = [
    // Tower apron around stack (light gray)
    { size: [0.16, 0.0028, 0.14], pos: [0.02, -0.0024, 0.0], mat: concreteLight },
    // Main industrial yard E of tower (tank farm sits here)
    { size: [0.22, 0.0026, 0.2], pos: [0.14, -0.0026, 0.06], mat: concrete },
    // NW service apron toward the road
    { size: [0.18, 0.0025, 0.12], pos: [0.04, -0.0028, 0.14], mat: concreteDark },
    // SE extension
    { size: [0.12, 0.0025, 0.1], pos: [0.12, -0.0028, -0.08], mat: concrete },
    // NE warehouse approach
    { size: [0.14, 0.0025, 0.1], pos: [0.22, -0.0027, 0.12], mat: concreteLight },
  ];
  for (const s of padSlabs) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(...s.size), s.mat);
    slab.position.set(...s.pos);
    g.add(slab);
  }

  // Scorch / stained apron under OLM (V3 close-up: textured rings + water)
  const scorchMap = makeScorchTexture();
  const scorch = new THREE.Mesh(
    new THREE.CircleGeometry(0.048, 40),
    new THREE.MeshStandardMaterial({
      color: 0x4a4640,
      map: scorchMap,
      metalness: 0.18,
      roughness: 0.94,
      transparent: true,
      opacity: 0.92,
      ...groundOff,
    }),
  );
  scorch.rotation.x = -Math.PI / 2;
  scorch.position.y = -0.0004;
  scorch.name = "pad-scorch";
  g.add(scorch);

  // Darker inner burn ring (hotter core under engines)
  const scorchCore = new THREE.Mesh(
    new THREE.RingGeometry(0.01, 0.022, 32, 1),
    new THREE.MeshStandardMaterial({
      color: 0x1c1a18,
      metalness: 0.28,
      roughness: 0.88,
      ...groundOff,
    }),
  );
  scorchCore.rotation.x = -Math.PI / 2;
  scorchCore.position.y = -0.0003;
  g.add(scorchCore);

  // Water / deluge runoff stains on apron (asymmetric streaks toward trench ends)
  const stainMap = makeWaterStainTexture();
  const stainSpecs: { size: [number, number]; pos: [number, number]; rot: number }[] = [
    { size: [0.055, 0.028], pos: [0.02, 0.03], rot: 0.35 },
    { size: [0.048, 0.024], pos: [-0.018, -0.028], rot: -0.5 },
    { size: [0.04, 0.02], pos: [0.032, -0.012], rot: 1.1 },
    { size: [0.036, 0.022], pos: [-0.03, 0.018], rot: -1.4 },
    { size: [0.03, 0.016], pos: [0.008, 0.045], rot: 0.15 },
  ];
  for (let i = 0; i < stainSpecs.length; i++) {
    const s = stainSpecs[i]!;
    const stain = new THREE.Mesh(
      new THREE.PlaneGeometry(s.size[0], s.size[1]),
      new THREE.MeshStandardMaterial({
        color: 0x5a6258,
        map: stainMap,
        transparent: true,
        opacity: 0.55,
        metalness: 0.08,
        roughness: 0.95,
        depthWrite: false,
        ...groundOff,
      }),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.rotation.z = s.rot;
    stain.position.set(s.pos[0], -0.0002, s.pos[1]);
    stain.name = `pad-water-stain-${i}`;
    g.add(stain);
  }

  // Thin dark oil / runoff trails from OLM toward tank farm
  for (const [x0, z0, len, ang] of [
    [0.02, 0.01, 0.06, 0.4],
    [0.015, -0.015, 0.045, -0.6],
    [-0.01, 0.025, 0.035, 1.2],
  ] as const) {
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(0.004, len),
      new THREE.MeshStandardMaterial({
        color: 0x2a2c28,
        transparent: true,
        opacity: 0.4,
        metalness: 0.1,
        roughness: 0.96,
        depthWrite: false,
        ...groundOff,
      }),
    );
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = ang;
    trail.position.set(x0, -0.00015, z0);
    g.add(trail);
  }

  // Perimeter fence-line shadow (dark strip along pad edge)
  const fence = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.0015, 0.004),
    steelDark,
  );
  fence.position.set(0.08, -0.001, -0.12);
  g.add(fence);
  const fence2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.004, 0.0015, 0.28),
    steelDark,
  );
  fence2.position.set(-0.08, -0.001, 0.04);
  g.add(fence2);

  // --- Boca Chica Blvd (E–W asphalt north of complex) ---
  const blvd = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.002, 0.014),
    asphalt,
  );
  blvd.position.set(0.1, -0.0035, 0.28);
  blvd.name = "pad-boca-chica-blvd";
  g.add(blvd);

  // Road shoulder / dirt verge
  const verge = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.0015, 0.03),
    dirt,
  );
  verge.position.set(0.1, -0.004, 0.28);
  g.add(verge);

  // Parking lot N of hardstand / S of road
  const parking = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.002, 0.04),
    concreteDark,
  );
  parking.position.set(-0.05, -0.003, 0.22);
  g.add(parking);

  // Cars along the road (tiny blocks)
  for (let i = 0; i < 14; i++) {
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(0.0045, 0.0016, 0.0022),
      carPaint,
    );
    const side = i < 8 ? 1 : -1;
    car.position.set(
      -0.12 + (i % 8) * 0.018,
      -0.0015,
      0.22 + side * 0.012 + (i % 3) * 0.002,
    );
    g.add(car);
  }

  // --- Tank farm + GSE (satellite: dense white tanks E of tower) ---
  const farm = new THREE.Group();
  farm.name = "pad-tank-farm";
  // Origin of farm ≈ center of tank rows relative to stack
  farm.position.set(0.09, 0, 0.04);

  // Primary white horizontal tank bank (rows like satellite)
  // Real-ish: ~3–4 m diameter, ~25–30 m long → 0.0035–0.004 r, 0.028 len
  const tankR = 0.0038;
  const tankLen = 0.03;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(tankR, tankR, tankLen, 14),
        tankWhite,
      );
      // Horizontal along +Z (N–S rows on satellite, slightly angled)
      tank.rotation.x = Math.PI / 2;
      tank.position.set(
        0.01 + col * 0.011,
        tankR + 0.001,
        -0.02 + row * 0.012,
      );
      farm.add(tank);
      // End caps (slightly larger)
      for (const end of [-1, 1] as const) {
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(tankR * 1.02, 10, 8),
          tankWhite,
        );
        cap.position.set(
          0.01 + col * 0.011,
          tankR + 0.001,
          -0.02 + row * 0.012 + end * (tankLen * 0.5),
        );
        farm.add(cap);
      }
    }
  }

  // Second bank of shorter tanks (satellite has staggered groups)
  for (let col = 0; col < 3; col++) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0032, 0.022, 12),
      tankWhite,
    );
    tank.rotation.x = Math.PI / 2;
    tank.position.set(0.055 + col * 0.01, 0.0042, 0.03);
    farm.add(tank);
  }

  // Vertical bullet / sphere tanks
  for (let i = 0; i < 6; i++) {
    const h = 0.01 + (i % 3) * 0.003;
    const bullet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.002, h, 10),
      steel,
    );
    bullet.position.set(-0.02 + i * 0.008, h * 0.5, 0.045);
    farm.add(bullet);
  }

  // Dark pipe-rack lattice (satellite: dense dark grid W of white tanks)
  for (let i = 0; i < 5; i++) {
    const rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.006 + (i % 2) * 0.003, 0.01),
      steelDark,
    );
    rack.position.set(-0.02, 0.005, -0.025 + i * 0.012);
    farm.add(rack);
  }
  // Cross pipes
  for (let i = 0; i < 4; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0006, 0.0006, 0.05, 6),
      steel,
    );
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0.01, 0.008, -0.02 + i * 0.014);
    farm.add(pipe);
  }

  // Equipment skids / electrical yards (dark rectangular pads of gear)
  const equip: { size: [number, number, number]; pos: [number, number, number] }[] = [
    { size: [0.022, 0.008, 0.016], pos: [0.07, 0.005, -0.01] },
    { size: [0.016, 0.01, 0.02], pos: [0.08, 0.006, 0.04] },
    { size: [0.03, 0.005, 0.012], pos: [0.04, 0.004, 0.055] },
    { size: [0.012, 0.012, 0.012], pos: [-0.03, 0.007, 0.02] },
    { size: [0.018, 0.004, 0.018], pos: [0.06, 0.003, -0.04] },
  ];
  for (const e of equip) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(...e.size), steelDark);
    box.position.set(...e.pos);
    farm.add(box);
  }

  // Vent / flare stacks
  for (const [sx, sz, h] of [
    [0.05, 0.06, 0.03],
    [0.07, 0.05, 0.024],
    [0.03, 0.065, 0.02],
    [0.085, 0.03, 0.018],
  ] as const) {
    const stack = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0007, 0.0009, h, 8),
      steelDark,
    );
    stack.position.set(sx, h * 0.5, sz);
    farm.add(stack);
  }

  g.add(farm);

  // --- Large warehouse / hangar (satellite NE of tank farm, pale roof) ---
  const warehouse = new THREE.Group();
  warehouse.name = "pad-warehouse";
  warehouse.position.set(0.22, 0, 0.12);
  const whBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.012, 0.035),
    warehouseWall,
  );
  whBody.position.y = 0.006;
  warehouse.add(whBody);
  const whRoof = new THREE.Mesh(
    new THREE.BoxGeometry(0.058, 0.002, 0.038),
    warehouseRoof,
  );
  whRoof.position.y = 0.013;
  warehouse.add(whRoof);
  // Adjacent smaller shed
  const shed = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.008, 0.02),
    steelDark,
  );
  shed.position.set(-0.04, 0.004, -0.01);
  warehouse.add(shed);
  g.add(warehouse);

  // Secondary equipment yard further east (satellite far-right dark blocks)
  const eastYard = new THREE.Group();
  eastYard.position.set(0.28, 0, 0.05);
  for (let i = 0; i < 8; i++) {
    const unit = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.006, 0.008),
      i % 2 === 0 ? steelDark : steel,
    );
    unit.position.set((i % 4) * 0.014, 0.003, Math.floor(i / 4) * 0.015);
    eastYard.add(unit);
  }
  g.add(eastYard);

  // --- Starhopper site silhouette (N of road) ---
  const hopperPad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.038, 0.002, 24),
    concreteDark,
  );
  hopperPad.position.set(0.05, -0.0035, 0.42);
  g.add(hopperPad);
  // Tiny Starhopper stand-in (cone + cylinder)
  const hopper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.005, 0.012, 10),
    steel,
  );
  hopper.position.set(0.05, 0.005, 0.42);
  g.add(hopper);

  // Construction / crane-ish boom near tower apron (satellite has clutter SW)
  const craneBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.008, 0.004, 0.008),
    steelDark,
  );
  craneBase.position.set(-0.04, 0.002, -0.05);
  g.add(craneBase);
  const craneBoom = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.0012, 0.0012),
    steel,
  );
  craneBoom.position.set(-0.02, 0.012, -0.05);
  craneBoom.rotation.z = -0.35;
  g.add(craneBoom);

  // Trailers / portable buildings along NW edge
  for (let i = 0; i < 4; i++) {
    const trailer = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.0035, 0.005),
      new THREE.MeshStandardMaterial({
        color: 0xc0c4c8,
        metalness: 0.3,
        roughness: 0.7,
      }),
    );
    trailer.position.set(-0.06 + i * 0.02, 0.001, 0.16);
    g.add(trailer);
  }

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
 * Drive flame trench, deluge steam / sheets, heat haze, vent plumes, and pad
 * lighting from mission state. Day/night flood balance uses `sunElev`; scrub-safe.
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

  // Deluge steam strength (hangs longer than hard flame; true-scale around OLM)
  const steamStr =
    state.burning && state.altEarth < 35 && state.missionT < 180
      ? THREE.MathUtils.clamp(1 - state.altEarth / 30, 0, 1) *
        (state.phase === "launch" || state.phase === "ascent" ? 1 : 0)
      : 0;

  const steam = pad.getObjectByName("pad-steam");
  if (steam) {
    steam.visible = steamStr > 0.03;
    steam.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      const mat = obj.material as THREE.SpriteMaterial;
      const phase = (obj.userData.phase as number) ?? 0;
      const baseR = (obj.userData.baseR as number) ?? 0.04;
      const baseY = (obj.userData.baseY as number) ?? 0.02;
      const baseScale = (obj.userData.baseScale as number) ?? 0.1;
      const tier = (obj.userData.tier as number) ?? 0;
      // Outer tiers are thinner / loft more
      const tierOp = 1 - tier * 0.18;
      const wobble = 0.85 + 0.15 * Math.sin(animT * 3.1 + phase);
      // Slightly brighter steam at night (backlit by floods / plume)
      mat.opacity = (0.26 + 0.14 * night) * steamStr * wobble * tierOp;
      const grow =
        baseScale * (0.85 + steamStr * 0.9) +
        0.015 * Math.sin(animT * 2.2 + phase);
      obj.scale.setScalar(grow);
      const ang = (obj.userData.baseAng as number) ?? 0;
      const r =
        baseR +
        steamStr * (0.04 + tier * 0.02) +
        0.008 * Math.sin(animT * 1.7 + phase);
      obj.position.set(
        Math.cos(ang + animT * 0.05) * r,
        baseY + steamStr * (0.04 + tier * 0.025) + 0.01 * Math.sin(animT * 2.5 + phase),
        Math.sin(ang + animT * 0.05) * r,
      );
    });
  }

  // Sheet curtains along trench (V3 volumetric deluge)
  const sheets = pad.getObjectByName("pad-deluge-sheets");
  if (sheets) {
    sheets.visible = steamStr > 0.04;
    sheets.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      const mat = obj.material as THREE.SpriteMaterial;
      const phase = (obj.userData.phase as number) ?? 0;
      const bx = (obj.userData.baseX as number) ?? 0;
      const by = (obj.userData.baseY as number) ?? 0;
      const bz = (obj.userData.baseZ as number) ?? 0;
      const bsx = (obj.userData.baseSx as number) ?? 0.05;
      const bsy = (obj.userData.baseSy as number) ?? 0.04;
      const wobble = 0.8 + 0.2 * Math.sin(animT * 4.2 + phase);
      mat.opacity = (0.32 + 0.12 * night) * steamStr * wobble;
      const sx = bsx * (0.9 + steamStr * 0.55);
      const sy = bsy * (0.85 + steamStr * 0.7 + 0.08 * Math.sin(animT * 3.3 + phase));
      obj.scale.set(sx, sy, 1);
      obj.position.set(
        bx + 0.004 * Math.sin(animT * 2.1 + phase),
        by + steamStr * 0.025 + 0.006 * Math.sin(animT * 2.8 + phase),
        bz + 0.003 * Math.cos(animT * 1.9 + phase),
      );
    });
  }

  // Heat haze over trench — strongest at ignition, scrub-safe (V3)
  const haze = pad.getObjectByName("pad-heat-haze");
  if (haze) {
    // Peak in first ~8 s after light, then fade with altitude / steam
    const hazePeak =
      strength *
      THREE.MathUtils.clamp(1 - Math.max(0, t) / 25, 0.15, 1) *
      THREE.MathUtils.clamp(1 - state.altEarth / 4, 0, 1);
    haze.visible = hazePeak > 0.04;
    haze.traverse((obj) => {
      if (!(obj instanceof THREE.Sprite)) return;
      const mat = obj.material as THREE.SpriteMaterial;
      const phase = (obj.userData.phase as number) ?? 0;
      const baseZ = (obj.userData.baseZ as number) ?? 0;
      const shimmer = 0.75 + 0.25 * Math.sin(animT * 18.5 + phase);
      mat.opacity = 0.22 * hazePeak * shimmer;
      const sx = 0.024 + 0.02 * hazePeak + 0.006 * Math.sin(animT * 11 + phase);
      const sy = 0.018 + 0.028 * hazePeak + 0.008 * Math.sin(animT * 14.2 + phase * 1.3);
      obj.scale.set(sx, sy, 1);
      obj.position.set(
        0.003 * Math.sin(animT * 9.1 + phase),
        0.012 + hazePeak * 0.018 + 0.004 * Math.sin(animT * 12.5 + phase),
        baseZ + 0.002 * Math.cos(animT * 8.3 + phase),
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

  // Floodlights: strong at night; very restrained daytime (sun + pad geometry).
  // Drop once stack is gone. V0.1 — floods mainly for night ops.
  const padOps =
    nearPad ||
    state.missionT < 0 ||
    (state.phase === "launch" && state.missionT < 120);
  const floodBase = padOps ? 0.04 * day + 1.2 * night : 0;
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

  // Cool ambient fill around the complex (night-led; tiny day residual)
  const fill = pad.getObjectByName("pad-fill") as THREE.PointLight | undefined;
  if (fill) {
    fill.intensity = padOps
      ? 0.03 * day + 0.55 * night * (1 - 0.4 * strength)
      : 0;
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
    new THREE.BoxGeometry(FACE * 1.35, 0.012, FACE * 1.55),
    steelDark,
  );
  carriage.position.set(OX, carryY, 0);
  carriage.name = "pad-chopstick-carriage";
  g.add(carriage);
  // Carriage side cheeks (reads as bulk against sky from pad/trench cam)
  for (const side of [-1, 1] as const) {
    const cheek = new THREE.Mesh(
      new THREE.BoxGeometry(FACE * 0.55, 0.008, 0.004),
      steelBright,
    );
    cheek.position.set(OX - half * 0.3, carryY + 0.002, side * (FACE * 0.72));
    g.add(cheek);
  }

  // Chopsticks: two long arms reaching toward / around the stack (open)
  // V3: thicker silhouette + rails so prelaunch pad cam reads Mechazilla arms
  // Arm length ~24 m each side; stacked open width clears 9 m vehicle
  const armLen = 0.026;
  const armSq = 0.0028;
  for (const side of [-1, 1] as const) {
    const stick = new THREE.Group();
    stick.name = side < 0 ? "pad-chopstick-L" : "pad-chopstick-R";
    // Main box beam (brighter for sky silhouette)
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(armLen, armSq, armSq * 1.6),
      steelBright,
    );
    // Extend from tower toward −X (pad center / stack)
    beam.position.set(-armLen * 0.5, 0, 0);
    stick.add(beam);
    // Underside rail / guide
    const railUnd = new THREE.Mesh(
      new THREE.BoxGeometry(armLen * 0.92, armSq * 0.45, armSq * 0.55),
      accent,
    );
    railUnd.position.set(-armLen * 0.5, -armSq * 0.55, 0);
    stick.add(railUnd);
    // Inner "finger" / rack pad
    const finger = new THREE.Mesh(
      new THREE.BoxGeometry(0.007, armSq * 1.5, armSq * 2.6),
      steel,
    );
    finger.position.set(-armLen + 0.002, 0, 0);
    stick.add(finger);
    // Cross tooth near tip (catch contact)
    const tooth = new THREE.Mesh(
      new THREE.BoxGeometry(0.0035, armSq * 1.1, 0.012),
      accent,
    );
    tooth.position.set(-armLen + 0.005, 0, 0);
    stick.add(tooth);
    // Vertical pin at tip (reads at distance)
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0007, 0.0007, 0.006, 8),
      steelDark,
    );
    pin.position.set(-armLen + 0.003, 0.001, 0);
    stick.add(pin);

    stick.position.set(
      OX - half,
      carryY + 0.005,
      side * 0.013, // ~13 m half-gap when open
    );
    // Slight inward angle (open but ready)
    stick.rotation.y = side * 0.05;
    // Tiny droop so arms aren't perfectly flat against sky
    stick.rotation.z = -0.03;
    g.add(stick);
  }

  // Ship QD / propellant transfer boom (higher, reaches ship mid-barrel)
  // V3: stronger silhouette — boom + umbilical bellows + head (prelaunch cue)
  // Ship mid ~ 71 + 26 ≈ 97 m
  const qdY = OY0 + 0.098;
  const qd = new THREE.Group();
  qd.name = "pad-qd-arm";
  const qdBoom = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.0024, 0.0024),
    steelBright,
  );
  qdBoom.position.set(-0.011, 0, 0);
  qd.add(qdBoom);
  // Secondary truss under boom
  const qdTruss = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.001, 0.001),
    accent,
  );
  qdTruss.position.set(-0.01, -0.0022, 0);
  qd.add(qdTruss);
  // Umbilical bellows stack (dark accordion near head)
  for (let i = 0; i < 4; i++) {
    const bellow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0014, 0.0016, 0.0018, 8),
      steelDark,
    );
    bellow.rotation.z = Math.PI / 2;
    bellow.position.set(-0.018 - i * 0.0016, -0.001, 0);
    qd.add(bellow);
  }
  const qdHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.005, 0.0055, 0.0055),
    steelDark,
  );
  qdHead.position.set(-0.024, 0, 0);
  qd.add(qdHead);
  // QD face plate toward ship
  const qdFace = new THREE.Mesh(
    new THREE.BoxGeometry(0.0012, 0.004, 0.004),
    new THREE.MeshStandardMaterial({
      color: 0x3a4048,
      metalness: 0.5,
      roughness: 0.55,
    }),
  );
  qdFace.position.set(-0.027, 0, 0);
  qd.add(qdFace);
  qd.position.set(OX - half, qdY, 0.004);
  // Slight hang toward stack
  qd.rotation.z = 0.08;
  g.add(qd);

  // OLM lip / hold-down ring under the stack (true-scale cue)
  // V3: heat-darkened steel + scorched top face
  const olmMat = new THREE.MeshStandardMaterial({
    color: 0x4a4844,
    metalness: 0.62,
    roughness: 0.55,
  });
  const olm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.004, 20),
    olmMat,
  );
  olm.position.set(0, OY0 + 0.002, 0);
  olm.name = "pad-olm";
  g.add(olm);
  // Scorched top ring on OLM deck
  const olmTop = new THREE.Mesh(
    new THREE.RingGeometry(0.006, 0.0115, 24, 1),
    new THREE.MeshStandardMaterial({
      color: 0x2a2824,
      metalness: 0.4,
      roughness: 0.75,
      map: makeScorchTexture(),
    }),
  );
  olmTop.rotation.x = -Math.PI / 2;
  olmTop.position.set(0, OY0 + 0.0042, 0);
  g.add(olmTop);

  // Six OLM legs (stubby) — slightly darker near ground (soot)
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

/**
 * Irregular radial scorch for OLM apron / trench floor (theater, not photo).
 * Shared canvas texture — cheap procedural, no asset pipeline.
 */
function makeScorchTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Transparent outside; dark mottled core
  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const base = ctx.createRadialGradient(cx, cy, 4, cx, cy, size * 0.48);
  base.addColorStop(0, "rgba(18, 16, 14, 0.95)");
  base.addColorStop(0.35, "rgba(42, 36, 30, 0.75)");
  base.addColorStop(0.65, "rgba(70, 60, 48, 0.4)");
  base.addColorStop(1, "rgba(90, 80, 65, 0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  // Seeded-looking soot blotches (fixed offsets = scrub-stable)
  const blotches: [number, number, number, number][] = [
    [0.35, 0.4, 0.14, 0.55],
    [0.62, 0.55, 0.12, 0.45],
    [0.48, 0.28, 0.1, 0.4],
    [0.55, 0.7, 0.11, 0.35],
    [0.28, 0.58, 0.09, 0.5],
    [0.7, 0.38, 0.1, 0.38],
  ];
  for (const [ux, uy, ur, a] of blotches) {
    const x = ux * size;
    const y = uy * size;
    const r = ur * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(12, 10, 8, ${a})`);
    g.addColorStop(1, "rgba(20, 18, 14, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** Soft green-gray water / deluge stain for apron decals. */
function makeWaterStainTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(32, 28, 2, 32, 34, 28);
  g.addColorStop(0, "rgba(90, 110, 95, 0.7)");
  g.addColorStop(0.45, "rgba(70, 85, 75, 0.4)");
  g.addColorStop(1, "rgba(60, 70, 60, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Secondary lobe
  const g2 = ctx.createRadialGradient(40, 40, 1, 38, 42, 18);
  g2.addColorStop(0, "rgba(80, 95, 85, 0.45)");
  g2.addColorStop(1, "rgba(60, 70, 60, 0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, size, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/**
 * Soft additive shimmer for trench heat haze (no real refraction — theater cue).
 */
function makeHeatHazeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(32, 40, 2, 32, 28, 28);
  g.addColorStop(0, "rgba(255, 220, 180, 0.55)");
  g.addColorStop(0.4, "rgba(255, 180, 120, 0.2)");
  g.addColorStop(0.75, "rgba(255, 140, 80, 0.06)");
  g.addColorStop(1, "rgba(255, 100, 40, 0)");
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
