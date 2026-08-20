/**
 * Low-poly white cryo clouds for the T− hold (OLM wrap + tank farm).
 */

import * as THREE from "three";
import { VENT_CLOUD_SPECS, type VentCloudSpec } from "../padLaunchFx";
import { makeRng } from "../splashOceanPaint";

export const PAD_VENT_STEAM = "pad-vent-steam";

function makeCloudMat(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: 0xf4f7fa,
    flatShading: true,
    transparent: true,
    opacity: 0,
    depthWrite: true,
  });
}

function lobeScale(rng: () => number): [number, number, number] {
  const s = 0.46 + rng() * 0.5;
  return [
    s * (0.9 + rng() * 0.35),
    s * (0.1 + rng() * 0.08),
    s * (0.9 + rng() * 0.35),
  ];
}

function addCloudLobe(
  cluster: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  rng: () => number,
): void {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((rng() - 0.5) * 1.2, (rng() - 0.55) * 0.12, (rng() - 0.5) * 1.2);
  mesh.scale.set(...lobeScale(rng));
  mesh.rotation.set(rng() * 0.2, rng() * Math.PI, rng() * 0.2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  cluster.add(mesh);
}

function makeCloudCluster(
  spec: VentCloudSpec,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  i: number,
): THREE.Group {
  const cluster = new THREE.Group();
  cluster.name = `vent-cloud-${i}`;
  cluster.userData.cloud = true;
  cluster.userData.baseX = spec.x;
  cluster.userData.baseY = spec.y;
  cluster.userData.baseZ = spec.z;
  cluster.userData.baseScale = spec.scale;
  cluster.userData.phase = spec.phase;
  const rng = makeRng(0xc10d100 + i * 97);
  for (let n = 0; n < spec.lobes; n++) addCloudLobe(cluster, geo, mat, rng);
  cluster.position.set(spec.x, spec.y, spec.z);
  cluster.scale.setScalar(spec.scale);
  return cluster;
}

/** Named `pad-vent-steam` group of faceted icosahedron clusters. */
export function createPadVentClouds(): THREE.Group {
  const group = new THREE.Group();
  group.name = PAD_VENT_STEAM;
  group.visible = false;
  const mat = makeCloudMat();
  group.userData.mat = mat;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  VENT_CLOUD_SPECS.forEach((spec, i) => group.add(makeCloudCluster(spec, geo, mat, i)));
  return group;
}
