import * as THREE from "three";
import { A_EM, AU } from "../physics/constants";
import { makeStarTexture } from "./textures";

export type SceneBundle = {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
};

export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x03050c);

  const starMap = new THREE.CanvasTexture(makeStarTexture(1024));
  starMap.colorSpace = THREE.SRGBColorSpace;
  // Large enough that solar-camera (near 1 AU) still sits inside the sky dome
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(AU * 2.2, 48, 32),
    new THREE.MeshBasicMaterial({
      map: starMap,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  scene.add(stars);

  scene.add(new THREE.AmbientLight(0x334466, 0.22));
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x080810, 0.28));

  // Sun light — direction updated each frame from ephemeris (unit-scale offset)
  const sunLight = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sunLight.position.set(-1, 0.2, 0.3);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const rim = new THREE.DirectionalLight(0x6688cc, 0.2);
  rim.position.set(A_EM, -A_EM * 0.3, -A_EM * 0.5);
  scene.add(rim);

  return { scene, sunLight };
}
