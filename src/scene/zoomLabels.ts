import * as THREE from "three";

export type ZoomLabelSpec = {
  /** Desired on-screen height in CSS pixels */
  targetPx: number;
  /** Sprite width / height */
  aspect: number;
  /** Floor world height (km) so labels stay readable when very close */
  minH: number;
  /**
   * Optional soft cap on world height (km). Prefer omitting this so labels
   * keep a constant pixel size at any zoom; a low maxH makes them vanish
   * when the camera is far away.
   */
  maxH?: number;
};

const _worldPos = new THREE.Vector3();

/** Global visibility for all marked zoom labels (toggled with L). */
let labelsVisible = true;

export function getZoomLabelsVisible(): boolean {
  return labelsVisible;
}

export function setZoomLabelsVisible(visible: boolean): void {
  labelsVisible = visible;
}

/** Toggle scene labels; returns the new visibility. */
export function toggleZoomLabels(): boolean {
  labelsVisible = !labelsVisible;
  return labelsVisible;
}

/** Mark a sprite so `updateZoomLabels` can keep its screen size stable. */
export function markZoomLabel(
  sprite: THREE.Sprite,
  spec: ZoomLabelSpec,
): void {
  sprite.userData.zoomLabel = spec;
  // Draw on top of nearby geometry so far/close labels stay readable
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.depthTest = false;
  mat.depthWrite = false;
  sprite.renderOrder = 20;
}

/**
 * Scale marked sprites from camera distance so they keep ~targetPx on screen
 * at any zoom, and apply the L-key visibility flag.
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

    obj.visible = labelsVisible;
    if (!labelsVisible) return;

    obj.getWorldPosition(_worldPos);
    const dist = Math.max(1e-3, camera.position.distanceTo(_worldPos));
    const worldHeight = 2 * tanHalf * dist;
    // Constant screen size; minH only floors when extremely close
    let h = Math.max(spec.minH, (spec.targetPx / viewH) * worldHeight);
    if (spec.maxH != null && Number.isFinite(spec.maxH)) {
      h = Math.min(h, spec.maxH);
    }
    obj.scale.set(h * spec.aspect, h, 1);
  });
}
