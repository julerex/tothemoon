import * as THREE from "three";

export type ZoomLabelSpec = {
  /** Desired on-screen height in CSS pixels */
  targetPx: number;
  /** Sprite width / height */
  aspect: number;
  /** Clamp world height (km) */
  minH: number;
  maxH: number;
};

const _worldPos = new THREE.Vector3();

/** Mark a sprite so `updateZoomLabels` can keep its screen size stable. */
export function markZoomLabel(
  sprite: THREE.Sprite,
  spec: ZoomLabelSpec,
): void {
  sprite.userData.zoomLabel = spec;
}

/**
 * Scale marked sprites from camera distance so they read smaller when zoomed
 * in and don't dominate close-up views (while staying legible far away).
 */
export function updateZoomLabels(
  root: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
): void {
  const viewH = window.innerHeight || 800;
  const fov = (camera.fov * Math.PI) / 180;
  const tanHalf = Math.tan(fov / 2);

  root.traverse((obj) => {
    const spec = obj.userData.zoomLabel as ZoomLabelSpec | undefined;
    if (!spec || !(obj instanceof THREE.Sprite)) return;

    obj.getWorldPosition(_worldPos);
    const dist = Math.max(1e-3, camera.position.distanceTo(_worldPos));
    const worldHeight = 2 * tanHalf * dist;
    const h = THREE.MathUtils.clamp(
      (spec.targetPx / viewH) * worldHeight,
      spec.minH,
      spec.maxH,
    );
    obj.scale.set(h * spec.aspect, h, 1);
  });
}
