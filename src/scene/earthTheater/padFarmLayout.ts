/**
 * Shared orbital tank farm — between OLP-2 and OLP-1, south of SH 4.
 *
 * Pad-local km: +X west (inland), −X gulf/east, +Z north (SH 4), +Y up.
 * Live origin is the OLP-2 OLM. Banks are packed along −X in this file;
 * {@link surveyedFarmXz} yaws that axis onto the surveyed west→east GPS
 * line so the farm is not due east–west. Live Mechazilla sits north-west of
 * the OLM so trench / webcast cameras keep their mounts.
 */
import { PAD1_X_KM } from "./mechazillaDims";
import {
  farmAxisYawRad,
  farmEastFromOlp2,
  farmWestFromOlp2,
} from "./starbaseSurvey";

/** Long-axis of a horizontal shell. */
export type CryoAxis = "ns" | "ew";

/** One packed bank of identical horizontal tanks. */
export type CryoBankSpec = {
  readonly id: string;
  /** West-most tank centre (pad-local x, km). */
  readonly x0: number;
  /** Tank-centre northing (km). */
  readonly z0: number;
  readonly count: number;
  readonly axis: CryoAxis;
  /** Centre-to-centre spacing toward −X / east (km). */
  readonly pitch: number;
  readonly d?: number;
  readonly len?: number;
};

export type CryoPlacement = {
  readonly x: number;
  readonly z: number;
  readonly axis: CryoAxis;
  readonly d: number;
  readonly len: number;
};

/** Default 12 ft-class farm shells (Pad 2 west-bank diameter). */
export const CRYO_TANK_D_KM = 0.0038;
/** Fallback N–S length when a bank omits `len`. */
export const CRYO_TANK_LEN_KM = 0.032;

/** Far-west Pad 2 apron: five thin 39 m N–S shells. */
export const PAD2_WEST_A_LEN_KM = 0.039;
/** Six shorter shells just east of that west-a bank. */
export const PAD2_WEST_B_LEN_KM = 0.026;

/** Main (middle) bank: 6 m diameter × 49 m N–S shells. */
export const MAIN_CRYO_D_KM = 0.006;
export const MAIN_CRYO_LEN_KM = 0.049;

/** Four offload shells west of the far-east pair: 5.5 m × 48 m. */
export const OFFLOAD_W_CRYO_D_KM = 0.0055;
export const OFFLOAD_W_CRYO_LEN_KM = 0.048;

/** Far-east offload pair: 8 m diameter × 30 m N–S shells. */
export const OFFLOAD_E_CRYO_D_KM = 0.008;
export const OFFLOAD_E_CRYO_LEN_KM = 0.03;

/**
 * Horizontal banks west → east from the ~640 m north-up aerial.
 * West pair sits on the Pad 2 apron; main + offload sit between / east of the pads.
 */
export const CRYO_BANKS: readonly CryoBankSpec[] = [
  {
    id: "pad2-west-a", x0: -0.0541, z0: 0.073, count: 5, axis: "ns", pitch: 0.0038,
    len: PAD2_WEST_A_LEN_KM,
  },
  {
    id: "pad2-west-b", x0: -0.0816, z0: 0.073, count: 6, axis: "ns", pitch: 0.0038,
    len: PAD2_WEST_B_LEN_KM,
  },
  {
    id: "main", x0: -0.2286, z0: 0.05, count: 12, axis: "ns", pitch: 0.0068,
    d: MAIN_CRYO_D_KM, len: MAIN_CRYO_LEN_KM,
  },
  {
    id: "offload-w", x0: -0.3874, z0: 0.028, count: 4, axis: "ns", pitch: 0.0062,
    d: OFFLOAD_W_CRYO_D_KM, len: OFFLOAD_W_CRYO_LEN_KM,
  },
  {
    id: "offload-e", x0: -0.4243, z0: 0.028, count: 2, axis: "ns", pitch: 0.009,
    d: OFFLOAD_E_CRYO_D_KM, len: OFFLOAD_E_CRYO_LEN_KM,
  },
];

/** Short verticals in the pipe corridor between the Pad 2 west banks and the main farm. */
export const VERTICAL_TANK_D_KM = 0.004;
export const VERTICAL_TANK_H_KM = 0.011;
export const VERTICAL_TANK_XZ: ReadonlyArray<readonly [number, number]> = [
  [-0.155, 0.1], [-0.161, 0.1], [-0.167, 0.1],
  [-0.155, 0.09], [-0.161, 0.09], [-0.167, 0.09],
];

/** Boca Chica Blvd / SH 4 northing (km) — just north of the Pad 2 apron NW corner. */
export const SH4_Z_KM = 0.158;

/** E–W pipe header along the north edge of the farm (parallel to SH 4). */
export const PIPE_NORTH_Z_KM = 0.098;
/** E–W header just south of the 49 m main-bank caps, between tanks and the pad line. */
export const PIPE_SOUTH_Z_KM = 0.02;

/** Blast wall south of the Pad 2 / main banks (not the offload). */
export const BLAST_WALL_Z_KM = 0.016;
export const BLAST_WALL_X_KM = -0.17;

export { PAD1_X_KM };

/** Expand packed banks into per-tank centres. */
export function cryoTankPlacements(): CryoPlacement[] {
  const out: CryoPlacement[] = [];
  for (const b of CRYO_BANKS) {
    const d = b.d ?? CRYO_TANK_D_KM;
    const len = b.len ?? CRYO_TANK_LEN_KM;
    for (let i = 0; i < b.count; i++) {
      out.push({ x: b.x0 - i * b.pitch, z: b.z0, axis: b.axis, d, len });
    }
  }
  return out;
}

export const CRYO_TANK_COUNT = CRYO_BANKS.reduce((n, b) => n + b.count, 0);

/** Axis-aligned envelope of one packed bank (pad-local km). */
export type PlanBounds = {
  xWest: number;
  xEast: number;
  zSouth: number;
  zNorth: number;
};

/** Concrete-slab footprint around a cryo bank. */
export function bankFootprint(b: CryoBankSpec, pad = 0.006): PlanBounds {
  const d = b.d ?? CRYO_TANK_D_KM;
  const len = b.len ?? CRYO_TANK_LEN_KM;
  const lastX = b.x0 - (b.count - 1) * b.pitch;
  const hx = b.axis === "ew" ? len * 0.5 : d * 0.5;
  const hz = b.axis === "ns" ? len * 0.5 : d * 0.5;
  const xHi = Math.max(b.x0, lastX) + hx;
  const xLo = Math.min(b.x0, lastX) - hx;
  return {
    xWest: xHi + pad,
    xEast: xLo - pad,
    zSouth: b.z0 - hz - pad,
    zNorth: b.z0 + hz + pad,
  };
}

/** One slab per cryo bank (separate yards, not one farm rectangle). */
export function farmBankSlabs(): Array<{ id: string } & PlanBounds> {
  return CRYO_BANKS.map((b) => ({ id: b.id, ...bankFootprint(b) }));
}

function unionBounds(parts: PlanBounds[]): PlanBounds {
  return {
    xWest: Math.max(...parts.map((p) => p.xWest)),
    xEast: Math.min(...parts.map((p) => p.xEast)),
    zSouth: Math.min(...parts.map((p) => p.zSouth)),
    zNorth: Math.max(...parts.map((p) => p.zNorth)),
  };
}

/** Union envelope of every cryo bank (pipe-header span). */
export function farmPlanBounds(): PlanBounds {
  const pad = 0.008;
  const u = unionBounds(farmBankSlabs());
  return {
    xWest: u.xWest + pad,
    xEast: u.xEast - pad,
    zSouth: u.zSouth - pad,
    zNorth: u.zNorth + pad,
  };
}

/**
 * Mean of the un-yawed tank centres — pivot for {@link surveyedFarmXz}.
 */
export function farmLayoutCentroid(): { x: number; z: number } {
  const pts = cryoTankPlacements();
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    z: pts.reduce((s, p) => s + p.z, 0) / n,
  };
}

/** Midpoint of the surveyed west→east GPS segment (pad-local km). */
export function farmSurveyMidpoint(): { x: number; z: number } {
  return {
    x: (farmWestFromOlp2.x + farmEastFromOlp2.x) * 0.5,
    z: (farmWestFromOlp2.z + farmEastFromOlp2.z) * 0.5,
  };
}

/**
 * Map un-yawed farm-layout xz onto pad-local xz: rotate about the layout
 * centroid so −X follows the surveyed GPS axis, then sit that centroid on
 * the GPS midpoint.
 */
export function surveyedFarmXz(x: number, z: number): { x: number; z: number } {
  const c = farmLayoutCentroid();
  const mid = farmSurveyMidpoint();
  const yaw = farmAxisYawRad();
  const lx = x - c.x;
  const lz = z - c.z;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return {
    x: lx * cos + lz * sin + mid.x,
    z: -lx * sin + lz * cos + mid.z,
  };
}

/**
 * Vent stacks at the SW / SE / NW / NE corners of the occupied farm.
 * World Y is a typical tank diameter (horizontal shells sit on the pad).
 */
export function tankFarmVentAnchors(): Array<readonly [number, number, number]> {
  const y = CRYO_TANK_D_KM;
  const pts = cryoTankPlacements();
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const west = Math.max(...xs);
  const east = Math.min(...xs);
  const south = Math.min(...zs);
  const north = Math.max(...zs);
  return [
    [west, y, south],
    [east, y, south],
    [west, y, north],
    [east, y, north],
  ].map(([x, yy, z]) => {
    const p = surveyedFarmXz(x, z);
    return [p.x, yy, p.z] as const;
  });
}
