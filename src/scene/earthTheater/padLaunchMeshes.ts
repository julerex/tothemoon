/** Trench, deluge sprites, pad lights, beacon, bloom, trench cam mounts. */
import * as THREE from "three";
import {
  EARTH_SURFACE_ALT_KM, STARBASE_LAT, STARBASE_LON,
} from "../../physics/constants";
import { geodeticToMeshLocal } from "../../physics/earthFrame";
import { geodeticToEllipsoidMeshLocal } from "../../physics/wgs84";
import {
  DELUGE_SHEETS, GROUND_SHEETS, expandDelugeJets, expandSteamSprites, hazeBaseZs,
} from "../padLaunchFx";
import { TRENCH_CAM_LOCAL, TRENCH_CAM_LOOK_LOCAL } from "../../camera/trenchCam";
import {
  makeGroundBloomSprite, makeHeatHazeTexture, makeScorchTexture, makeSteamTexture,
} from "./padTextures";
import { createPadSurroundings } from "./padSurroundings";
import { createMechazillaTower, TOWER_BEACON_Y, TOWER_OX } from "./mechazillaTower";
import { addPadLandmarks, addStarbaseSatellitePlate } from "./padSatellitePlate";
import { createPadVentClouds } from "./padVentClouds";

/** Place pad group at Starbase geodetic on the Earth mesh. */
export function placePadOnEarth(pad: THREE.Group): void {
  const local = geodeticToEllipsoidMeshLocal(STARBASE_LAT, STARBASE_LON, EARTH_SURFACE_ALT_KM);
  pad.position.set(local.x, local.y, local.z);
  const up = geodeticToMeshLocal(STARBASE_LAT, STARBASE_LON, 1);
  const outward = new THREE.Vector3(up.x, up.y, up.z).normalize();
  pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
}

const FLOOD_TARGETS: { pos: [number, number, number]; look: [number, number, number] }[] = [
  { pos: [0.018, 0.09, 0.012], look: [0, 0.055, 0] },
  { pos: [0.018, 0.055, -0.012], look: [0, 0.04, 0] },
  { pos: [0.012, 0.12, 0], look: [0, 0.09, 0] },
];

function makeFloodSpot(i: number, f: (typeof FLOOD_TARGETS)[number]): THREE.SpotLight {
  const spot = new THREE.SpotLight(0xe8f0ff, 0, 0.35, Math.PI / 5.5, 0.45, 1.6);
  spot.name = `pad-flood-${i}`;
  spot.position.set(f.pos[0], f.pos[1], f.pos[2]);
  spot.target.position.set(f.look[0], f.look[1], f.look[2]);
  return spot;
}

function makeFloodFixtureMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x8890a0, emissive: 0xc8d4e8, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.4,
  });
}

function makeFloodFixture(i: number, pos: THREE.Vector3): THREE.Mesh {
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.0015, 0.002), makeFloodFixtureMat());
  fixture.position.copy(pos);
  fixture.name = `pad-flood-fixture-${i}`;
  return fixture;
}

function addFloodLights(g: THREE.Group): void {
  for (let i = 0; i < FLOOD_TARGETS.length; i++) {
    const f = FLOOD_TARGETS[i]!;
    const spot = makeFloodSpot(i, f);
    g.add(spot);
    g.add(spot.target);
    g.add(makeFloodFixture(i, spot.position));
  }
}

function addPadFillLights(g: THREE.Group): void {
  const fill = new THREE.PointLight(0xdde6f4, 0, 0.28, 1.8);
  fill.name = "pad-fill";
  fill.position.set(0, 0.03, 0);
  g.add(fill);
  const plume = new THREE.PointLight(0xff9a58, 0, 0.22, 2);
  plume.name = "pad-plume-light";
  plume.position.set(0, 0.008, 0);
  g.add(plume);
}

function addOlmLamp(g: THREE.Group, i: number): void {
  const ang = (i / 8) * Math.PI * 2;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.0006, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xf0f4ff }),
  );
  lamp.position.set(Math.cos(ang) * 0.013, 0.003, Math.sin(ang) * 0.013);
  lamp.name = `pad-olm-lamp-${i}`;
  g.add(lamp);
}

function addOlmLamps(g: THREE.Group): void {
  for (let i = 0; i < 8; i++) addOlmLamp(g, i);
}

function createPadLights(): THREE.Group {
  const g = new THREE.Group();
  g.name = "pad-lights";
  addFloodLights(g);
  addPadFillLights(g);
  addOlmLamps(g);
  return g;
}

function makeAdditiveBasic(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

/** Flame trench + floor + flame sheet + tongues. */
function addPadTrenchAndFlame(pad: THREE.Group): void {
  addTrenchMeshes(pad);
  addFlameSheet(pad);
  addFlameTongues(pad);
}

function addTrenchMeshes(pad: THREE.Group): void {
  const trench = new THREE.Group();
  trench.name = "pad-trench";
  const trenchSteel = new THREE.MeshStandardMaterial({ color: 0x1a1c20, metalness: 0.45, roughness: 0.72 });
  // Open U-channel along ±Z so trench cam can see engines / flame, not a solid plug.
  const wallH = 0.006;
  const wallT = 0.0015;
  const halfW = 0.009;
  for (const x of [-halfW, halfW]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, 0.055), trenchSteel);
    wall.position.set(x, -0.006, 0);
    trench.add(wall);
  }
  pad.add(trench);
  addTrenchFloor(pad);
}

function addTrenchFloor(pad: THREE.Group): void {
  const trenchFloor = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.0012, 0.048),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0e, metalness: 0.35, roughness: 0.9, map: makeScorchTexture() }),
  );
  trenchFloor.position.y = -0.0082;
  trenchFloor.name = "pad-trench-floor";
  pad.add(trenchFloor);
}

function addFlameSheet(pad: THREE.Group): void {
  const flameMat = makeAdditiveBasic(0xff8a48);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.028, 0.05), flameMat);
  flame.position.y = 0.006;
  flame.name = "pad-flame";
  flame.visible = false;
  flame.userData.mat = flameMat;
  pad.add(flame);
}

const FLAME_TONGUE_ZS = [-0.016, -0.005, 0.005, 0.016] as const;

function addOneFlameTongue(tongues: THREE.Group, mat: THREE.Material, z: number): void {
  const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.05, 10, 1, true), mat);
  tongue.position.set(0, 0.02, z);
  tongues.add(tongue);
}

function addFlameTongues(pad: THREE.Group): void {
  const tongueMat = makeAdditiveBasic(0xffa060);
  const tongues = new THREE.Group();
  tongues.name = "pad-flame-tongues";
  tongues.visible = false;
  for (const z of FLAME_TONGUE_ZS) addOneFlameTongue(tongues, tongueMat, z);
  tongues.userData.mat = tongueMat;
  pad.add(tongues);
}

function makeSteamSpriteMat(map: THREE.CanvasTexture, color: number): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.NormalBlending, color,
  });
}

function configureSteamSprite(sprite: THREE.Sprite, s: ReturnType<typeof expandSteamSprites>[number]): void {
  sprite.position.set(Math.cos(s.ang) * s.r0, s.y0, Math.sin(s.ang) * s.r0);
  sprite.scale.setScalar(s.scale);
  sprite.userData.baseAng = s.ang;
  sprite.userData.baseR = s.r0;
  sprite.userData.baseY = s.y0;
  sprite.userData.baseScale = s.scale;
  sprite.userData.phase = s.phase;
  sprite.userData.tier = s.tier;
}

function addPadSteamGroup(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const steamGroup = new THREE.Group();
  steamGroup.name = "pad-steam";
  steamGroup.visible = false;
  for (const s of expandSteamSprites()) {
    const sprite = new THREE.Sprite(makeSteamSpriteMat(steamTex, s.color));
    configureSteamSprite(sprite, s);
    steamGroup.add(sprite);
  }
  pad.add(steamGroup);
}

function configureSheetSprite(sprite: THREE.Sprite, a: (typeof DELUGE_SHEETS)[number]): void {
  sprite.position.set(a.pos[0], a.pos[1], a.pos[2]);
  sprite.scale.set(a.sx, a.sy, 1);
  sprite.userData.baseX = a.pos[0];
  sprite.userData.baseY = a.pos[1];
  sprite.userData.baseZ = a.pos[2];
  sprite.userData.baseSx = a.sx;
  sprite.userData.baseSy = a.sy;
  sprite.userData.phase = a.phase;
}

function addPadDelugeSheets(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const delugeSheets = new THREE.Group();
  delugeSheets.name = "pad-deluge-sheets";
  delugeSheets.visible = false;
  for (const a of DELUGE_SHEETS) {
    const sprite = new THREE.Sprite(makeSteamSpriteMat(steamTex, 0xd8e0e8));
    configureSheetSprite(sprite, a);
    delugeSheets.add(sprite);
  }
  pad.add(delugeSheets);
}

function addPadGroundSteam(pad: THREE.Group, steamTex: THREE.CanvasTexture): void {
  const ground = new THREE.Group();
  ground.name = "pad-ground-steam";
  ground.visible = false;
  for (const a of GROUND_SHEETS) {
    const sprite = new THREE.Sprite(makeSteamSpriteMat(steamTex, 0xe4eaf0));
    configureSheetSprite(sprite, a);
    ground.add(sprite);
  }
  pad.add(ground);
}

function makeHazeSpriteMat(map: THREE.CanvasTexture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, color: 0xffc8a0,
  });
}

function addPadHeatHaze(pad: THREE.Group): void {
  const hazeTex = makeHeatHazeTexture();
  const heatHaze = new THREE.Group();
  heatHaze.name = "pad-heat-haze";
  heatHaze.visible = false;
  const hazeZs = hazeBaseZs();
  for (let i = 0; i < hazeZs.length; i++) addHazeSprite(heatHaze, hazeTex, hazeZs[i]!, i);
  pad.add(heatHaze);
}

function addHazeSprite(group: THREE.Group, map: THREE.CanvasTexture, z: number, i: number): void {
  const sprite = new THREE.Sprite(makeHazeSpriteMat(map));
  sprite.position.set(0, 0.014, z);
  sprite.scale.set(0.028, 0.022, 1);
  sprite.userData.baseZ = z;
  sprite.userData.phase = i * 1.3;
  group.add(sprite);
}

function addPadVentSteam(pad: THREE.Group): void {
  pad.add(createPadVentClouds());
}

function makeDelugeJetMat(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xd8e8f2, transparent: true, opacity: 0, depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function addOneDelugeJet(
  group: THREE.Group, mat: THREE.Material, spec: ReturnType<typeof expandDelugeJets>[number],
): void {
  const jet = new THREE.Group();
  jet.position.set(Math.cos(spec.ang) * spec.r0, spec.y0, Math.sin(spec.ang) * spec.r0);
  const tangent = spec.ang + Math.PI / 2;
  jet.rotation.z = Math.sin(tangent) * spec.tilt;
  jet.rotation.x = -Math.cos(tangent) * spec.tilt;
  jet.userData.phase = spec.phase;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(spec.thick * 0.35, spec.thick, spec.h, 6, 1, true),
    mat,
  );
  mesh.position.y = spec.h * 0.5;
  jet.add(mesh);
  group.add(jet);
}

function addPadDelugeJets(pad: THREE.Group): void {
  const jets = new THREE.Group();
  jets.name = "pad-deluge-jets";
  jets.visible = false;
  const mat = makeDelugeJetMat();
  jets.userData.mat = mat;
  for (const spec of expandDelugeJets()) addOneDelugeJet(jets, mat, spec);
  pad.add(jets);
}

function addPadBeacon(pad: THREE.Group): void {
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.003, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5533, transparent: true, opacity: 0.95 }),
  );
  beacon.position.set(TOWER_OX, TOWER_BEACON_Y, 0);
  beacon.name = "pad-beacon";
  pad.add(beacon);
}

function addPadGroundBloom(pad: THREE.Group): void {
  const groundBloom = makeGroundBloomSprite();
  groundBloom.name = "pad-ground-bloom";
  groundBloom.position.set(0, 0.01, 0);
  groundBloom.scale.setScalar(0.12);
  groundBloom.visible = false;
  pad.add(groundBloom);
}

function addPadFxSprites(pad: THREE.Group): void {
  const steamTex = makeSteamTexture();
  addPadSteamGroup(pad, steamTex);
  addPadDelugeSheets(pad, steamTex);
  addPadGroundSteam(pad, steamTex);
  addPadDelugeJets(pad);
  addPadHeatHaze(pad);
  addPadVentSteam(pad);
}

function addTrenchCamMounts(pad: THREE.Group): void {
  const mount = new THREE.Object3D();
  mount.name = "trench-cam";
  mount.position.set(TRENCH_CAM_LOCAL.x, TRENCH_CAM_LOCAL.y, TRENCH_CAM_LOCAL.z);
  pad.add(mount);
  const look = new THREE.Object3D();
  look.name = "trench-cam-look";
  look.position.set(TRENCH_CAM_LOOK_LOCAL.x, TRENCH_CAM_LOOK_LOCAL.y, TRENCH_CAM_LOOK_LOCAL.z);
  pad.add(look);
}

export function populateStarbasePad(pad: THREE.Group): void {
  pad.add(createPadSurroundings());
  addPadLandmarks(pad);
  addStarbaseSatellitePlate(pad);
  addPadTrenchAndFlame(pad);
  addTrenchCamMounts(pad);
  addPadFxSprites(pad);
  pad.add(createMechazillaTower());
  pad.add(createPadLights());
  addPadBeacon(pad);
  addPadGroundBloom(pad);
}
