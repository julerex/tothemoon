/**
 * Measure a Sketchfab Super Heavy V3 GLTF (named Raptor / grid-fin nodes).
 * Look-reference only — not a runtime mesh. Scene unit of the download is meters,
 * Y-up; theater craft stays the procedural booster.
 */

export type Vec3 = readonly [number, number, number];

export type GltfNode = {
  name?: string;
  children?: number[];
  matrix?: number[];
  mesh?: number;
};

export type GltfPrimitive = { attributes: { POSITION: number } };

export type GltfDoc = {
  nodes: GltfNode[];
  meshes?: { primitives: GltfPrimitive[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
};

export type Aabb = { min: Vec3; max: Vec3 };

export type RaptorRingMeasure = {
  count: number;
  /** Mean hypot(x, z) of world-space mesh centroids (Y-up meters). */
  radiusM: number;
};

export type GridFinMeasure = {
  name: string;
  radiusM: number;
  azimuthDeg: number;
  fromTopM: number;
  spanM: number;
  widthM: number;
  chordM: number;
};

export type BoosterMeasures = {
  heightM: number;
  raptorRings: {
    inner: RaptorRingMeasure;
    mid: RaptorRingMeasure;
    outer: RaptorRingMeasure;
  };
  gridFins: GridFinMeasure[];
};

const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

function ident(): number[] {
  return IDENT.slice();
}

/** Column-major 4×4 product `a * b` (apply b first). */
export function mulMat4(a: readonly number[], b: readonly number[]): number[] {
  const o = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      o[col * 4 + row] =
        a[row]! * b[col * 4]! +
        a[4 + row]! * b[col * 4 + 1]! +
        a[8 + row]! * b[col * 4 + 2]! +
        a[12 + row]! * b[col * 4 + 3]!;
    }
  }
  return o;
}

function localMatrix(node: GltfNode): number[] {
  const m = node.matrix;
  if (m && m.length === 16) return m.slice();
  return ident();
}

/**
 * World matrices for every node (parent × local). Roots are nodes that never
 * appear in another node's `children` list.
 */
export function nodeWorldMatrices(nodes: readonly GltfNode[]): number[][] {
  const worlds = nodes.map(() => ident());
  const isChild = new Set<number>();
  for (const n of nodes) {
    for (const c of n.children ?? []) isChild.add(c);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (!isChild.has(i)) applyWorld(nodes, worlds, i, ident());
  }
  return worlds;
}

function applyWorld(
  nodes: readonly GltfNode[],
  worlds: number[][],
  i: number,
  parent: readonly number[],
): void {
  const world = mulMat4(parent, localMatrix(nodes[i]!));
  worlds[i] = world;
  for (const c of nodes[i]!.children ?? []) {
    applyWorld(nodes, worlds, c, world);
  }
}

/**
 * Inverse of an affine 4×4 (orthonormal 3×3 + translation). Sketchfab roots
 * are axis conversions and a stage offset, not a general projective matrix.
 */
export function invertAffineMat4(m: readonly number[]): number[] {
  const o = ident();
  o[0] = m[0]!;
  o[1] = m[4]!;
  o[2] = m[8]!;
  o[4] = m[1]!;
  o[5] = m[5]!;
  o[6] = m[9]!;
  o[8] = m[2]!;
  o[9] = m[6]!;
  o[10] = m[10]!;
  const tx = m[12]!;
  const ty = m[13]!;
  const tz = m[14]!;
  o[12] = -(o[0]! * tx + o[4]! * ty + o[8]! * tz);
  o[13] = -(o[1]! * tx + o[5]! * ty + o[9]! * tz);
  o[14] = -(o[2]! * tx + o[6]! * ty + o[10]! * tz);
  return o;
}

function boosterRootIndex(nodes: readonly GltfNode[]): number {
  const i = nodes.findIndex((n) => /superheavy/i.test(n.name ?? ""));
  return i >= 0 ? i : 0;
}

function transformPoint(m: readonly number[], p: Vec3): Vec3 {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

export function aabbCenter(b: Aabb): Vec3 {
  return [
    (b.min[0] + b.max[0]) * 0.5,
    (b.min[1] + b.max[1]) * 0.5,
    (b.min[2] + b.max[2]) * 0.5,
  ];
}

export function transformAabb(b: Aabb, m: readonly number[]): Aabb {
  const corners: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) {
    for (const y of [b.min[1], b.max[1]]) {
      for (const z of [b.min[2], b.max[2]]) {
        corners.push(transformPoint(m, [x, y, z]));
      }
    }
  }
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of corners) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i]!, p[i]!);
      max[i] = Math.max(max[i]!, p[i]!);
    }
  }
  return { min, max };
}

function unionAabb(a: Aabb | null, b: Aabb): Aabb {
  if (!a) return b;
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

function accessorAabb(
  doc: GltfDoc,
  accessorIndex: number,
): Aabb | null {
  const acc = doc.accessors?.[accessorIndex];
  const mn = acc?.min;
  const mx = acc?.max;
  if (!mn || mn.length < 3 || !mx || mx.length < 3) return null;
  return { min: [mn[0]!, mn[1]!, mn[2]!], max: [mx[0]!, mx[1]!, mx[2]!] };
}

function meshAabb(doc: GltfDoc, meshIndex: number): Aabb | null {
  const mesh = doc.meshes?.[meshIndex];
  if (!mesh) return null;
  let box: Aabb | null = null;
  for (const prim of mesh.primitives) {
    const a = accessorAabb(doc, prim.attributes.POSITION);
    if (a) box = unionAabb(box, a);
  }
  return box;
}

function nodeMeshAabb(
  doc: GltfDoc,
  nodeIndex: number,
  worlds: number[][],
): Aabb | null {
  const node = doc.nodes[nodeIndex];
  if (!node) return null;
  let box: Aabb | null = null;
  if (node.mesh != null) {
    const local = meshAabb(doc, node.mesh);
    if (local) box = transformAabb(local, worlds[nodeIndex]!);
  }
  for (const c of node.children ?? []) {
    const child = nodeMeshAabb(doc, c, worlds);
    if (child) box = unionAabb(box, child);
  }
  return box;
}

function emptyRing(): RaptorRingMeasure {
  return { count: 0, radiusM: 0 };
}

function ringFromBoxes(boxes: Aabb[]): RaptorRingMeasure {
  if (boxes.length === 0) return emptyRing();
  let sum = 0;
  for (const b of boxes) {
    const c = aabbCenter(b);
    sum += Math.hypot(c[0], c[2]);
  }
  return { count: boxes.length, radiusM: sum / boxes.length };
}

function finMeasure(name: string, box: Aabb, topY: number): GridFinMeasure {
  const c = aabbCenter(box);
  const dx = box.max[0] - box.min[0];
  const dy = box.max[1] - box.min[1];
  const dz = box.max[2] - box.min[2];
  const sizes = [dx, dy, dz].sort((a, b) => a - b);
  return {
    name,
    radiusM: Math.hypot(c[0], c[2]),
    azimuthDeg: (Math.atan2(c[2], c[0]) * 180) / Math.PI,
    fromTopM: topY - c[1],
    chordM: sizes[0]!,
    widthM: sizes[1]!,
    spanM: sizes[2]!,
  };
}

/**
 * World-space booster measurements from a Sketchfab GLTF JSON document.
 * Uses accessor min/max (no `scene.bin` required).
 */
export function measureSketchfabBooster(doc: GltfDoc): BoosterMeasures {
  const worlds = nodeWorldMatrices(doc.nodes);
  const toLocal = invertAffineMat4(worlds[boosterRootIndex(doc.nodes)]!);
  const inner: Aabb[] = [];
  const mid: Aabb[] = [];
  const outer: Aabb[] = [];
  const fins: { name: string; box: Aabb }[] = [];
  let hull: Aabb | null = null;
  for (let i = 0; i < doc.nodes.length; i++) {
    const name = doc.nodes[i]?.name ?? "";
    const worldBox = nodeMeshAabb(doc, i, worlds);
    if (!worldBox) continue;
    const box = transformAabb(worldBox, toLocal);
    hull = unionAabb(hull, box);
    if (/^RAPTOR inner/i.test(name)) inner.push(box);
    else if (/^RAPTOR middle/i.test(name)) mid.push(box);
    else if (/^RAPTOR outer/i.test(name)) outer.push(box);
    else if (/^Gridfin/i.test(name)) fins.push({ name, box });
  }
  const topY = hull?.max[1] ?? 0;
  return {
    heightM: hull ? hull.max[1] - hull.min[1] : 0,
    raptorRings: {
      inner: ringFromBoxes(inner),
      mid: ringFromBoxes(mid),
      outer: ringFromBoxes(outer),
    },
    gridFins: fins.map((f) => finMeasure(f.name, f.box, topY)),
  };
}
