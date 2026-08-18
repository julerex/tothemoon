/**
 * Theater-grade Earth atmosphere limb + soft terminator helpers (visual V2).
 *
 * Multi-shell Fresnel atmosphere (Rayleigh-ish blue limb, thicker near the
 * horizon band) and a soft day/night terminator remap for MeshStandardMaterial.
 * Not a full atmospheric scattering path — scrub-safe, GPU-cheap.
 *
 * Scene unit = 1 km.
 */

import * as THREE from "three";
import { R_EARTH } from "../physics/constants";
import { geodeticToMeshLocal } from "../physics/earthFrame";
import { applyWgs84ToGeometry } from "./wgs84Mesh";
import {
  FLIGHT13_SPLASH_LAT,
  FLIGHT13_SPLASH_LON,
} from "../physics/flight13Corridor";

export type EarthAtmosphere = {
  group: THREE.Group;
  /** Inner dense limb + outer halo materials (share sun dir each frame). */
  materials: THREE.ShaderMaterial[];
};

export type Vec3Like = { x: number; y: number; z: number };

/**
 * Soft terminator: map raw N·L into [0, 1] with a night-side shoulder.
 * Matches the GLSL injected into Earth's MeshStandardMaterial (V2).
 *
 * @param nDotL - Cosine of angle between surface normal and light direction
 * @param softStart - Where light begins (negative = wraps past geometric night)
 * @param softEnd - Full daylight irradiance
 */
export function softTerminatorNl(
  nDotL: number,
  softStart = -0.18,
  softEnd = 0.42,
): number {
  if (softEnd <= softStart) return nDotL >= softEnd ? 1 : 0;
  const t = Math.max(0, Math.min(1, (nDotL - softStart) / (softEnd - softStart)));
  return t * t * (3 - 2 * t);
}

/**
 * Angular half-width of the Flight 13 splash sea-brighten cap (km on the
 * surface). Covers the recovery-drone horizon (~110 km from 1 km AGL).
 */
export const SPLASH_OCEAN_CAP_KM = 260;

/** Cosine of the cap's outer angle (smoothstep start). */
export function splashOceanCapCos(
  radiusKm: number,
  rEarth = R_EARTH,
): number {
  if (!(radiusKm > 0) || !(rEarth > 0)) return 1;
  return Math.cos(radiusKm / rEarth);
}

/**
 * 0…1 weight for the splash-zone ocean lift.
 * `nDotSplash` is mesh-local `dot(normalize(position), splashDir)`.
 */
export function splashOceanWeight(
  nDotSplash: number,
  cosOuter: number,
  cosInner: number,
): number {
  if (cosInner <= cosOuter) return nDotSplash >= cosInner ? 1 : 0;
  const t = Math.max(
    0,
    Math.min(1, (nDotSplash - cosOuter) / (cosInner - cosOuter)),
  );
  return t * t * (3 - 2 * t);
}

function splashDirMeshLocal(): THREE.Vector3 {
  const p = geodeticToMeshLocal(FLIGHT13_SPLASH_LAT, FLIGHT13_SPLASH_LON, 1);
  return new THREE.Vector3(p.x, p.y, p.z).normalize();
}

/**
 * Inject a soft day/night terminator into MeshStandardMaterial's direct light
 * and lift the Flight 13 splash-zone ocean so winter-morning water is not
 * a black PBR mirror. Call once after constructing the material.
 */
export function applySoftTerminator(material: THREE.MeshStandardMaterial): void {
  material.customProgramCacheKey = () => "earth-soft-terminator-splash-ocean-v1";
  material.onBeforeCompile = injectEarthSurface;
}

/** onBeforeCompile hook: soft N·L + splash-zone sea lift. */
function injectEarthSurface(shader: THREE.WebGLProgramParametersWithUniforms): void {
  const cosOuter = splashOceanCapCos(SPLASH_OCEAN_CAP_KM);
  const cosInner = splashOceanCapCos(SPLASH_OCEAN_CAP_KM * 0.35);
  shader.uniforms.uSplashDir = { value: splashDirMeshLocal() };
  shader.uniforms.uSplashCosOuter = { value: cosOuter };
  shader.uniforms.uSplashCosInner = { value: cosInner };
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
       varying vec3 vSplashObj;`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       vSplashObj = normalize(transformed);`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      `#include <common>
       uniform vec3 uSplashDir;
       uniform float uSplashCosOuter;
       uniform float uSplashCosInner;
       varying vec3 vSplashObj;
       float splashOceanW() {
         float d = dot(normalize(vSplashObj), uSplashDir);
         return smoothstep(uSplashCosOuter, uSplashCosInner, d);
       }`,
    )
    .replace(
      "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
      "float dotNL = smoothstep( -0.18, 0.42, dot( geometryNormal, directLight.direction ) );",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       {
         float sw = splashOceanW();
         vec3 splashSea = vec3(0.28, 0.46, 0.56);
         diffuseColor.rgb = mix(diffuseColor.rgb, splashSea, sw * 0.7);
       }`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
       roughnessFactor = mix(roughnessFactor, 0.68, splashOceanW());`,
    )
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += vec3(0.12, 0.22, 0.28) * splashOceanW() * 0.06;`,
    );
}

type AtmoShellOpts = {
  radius: number;
  segments: number;
  /** Fresnel power — higher = tighter limb. */
  power: number;
  /** Overall density scale. */
  density: number;
  dayColor: THREE.Color;
  nightColor: THREE.Color;
  dayAlpha: number;
  nightAlpha: number;
  additive: boolean;
};

/** Dense inner band — thick blue near horizon / LEO limb drama. */
const INNER_ATMO: AtmoShellOpts = {
  radius: R_EARTH * 1.018,
  segments: 64,
  power: 3.2,
  density: 0.72,
  dayColor: new THREE.Color(0xa8d8ff),
  nightColor: new THREE.Color(0x1a3a6a),
  dayAlpha: 0.55,
  nightAlpha: 0.1,
  additive: true,
};

/** Mid Rayleigh shell — softer blue wrap. */
const MID_ATMO: AtmoShellOpts = {
  radius: R_EARTH * 1.035,
  segments: 56,
  power: 2.4,
  density: 0.55,
  dayColor: new THREE.Color(0x5aa0e8),
  nightColor: new THREE.Color(0x0c2040),
  dayAlpha: 0.38,
  nightAlpha: 0.08,
  additive: false,
};

/** Outer faint halo — extended scatter. */
const OUTER_ATMO: AtmoShellOpts = {
  radius: R_EARTH * 1.065,
  segments: 48,
  power: 1.8,
  density: 0.4,
  dayColor: new THREE.Color(0x3a78c8),
  nightColor: new THREE.Color(0x081828),
  dayAlpha: 0.18,
  nightAlpha: 0.04,
  additive: false,
};

/** Add one atmosphere shell mesh + material to the group. */
function addAtmoShell(
  group: THREE.Group,
  materials: THREE.ShaderMaterial[],
  opts: AtmoShellOpts,
): void {
  const shell = makeAtmoShell(opts);
  group.add(shell.mesh);
  materials.push(shell.material);
}

/**
 * Fresnel Rayleigh-ish atmosphere shells (BackSide — limb ring outside Earth).
 * Day-weighted: bright cyan limb on the sunlit edge, faint night airglow.
 */
export function createEarthAtmosphere(): EarthAtmosphere {
  const group = new THREE.Group();
  group.name = "earth-atmosphere";
  const materials: THREE.ShaderMaterial[] = [];
  addAtmoShell(group, materials, INNER_ATMO);
  addAtmoShell(group, materials, MID_ATMO);
  addAtmoShell(group, materials, OUTER_ATMO);
  return { group, materials };
}

/**
 * Point atmosphere day/night toward the sun (unit Earth→Sun in world space).
 * Call each frame after body placement (uniforms are world-space).
 */
export function updateEarthAtmosphere(
  atmo: EarthAtmosphere,
  sunUnit: Vec3Like,
): void {
  for (const mat of atmo.materials) {
    const u = mat.uniforms.uSunDir.value as THREE.Vector3;
    u.set(sunUnit.x, sunUnit.y, sunUnit.z);
  }
}

const ATMO_VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  void main() {
    // Object-space normal → world (sphere centered on Earth group)
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const ATMO_FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSunDir;
  uniform float uPower;
  uniform float uDensity;
  uniform vec3 uDayColor;
  uniform vec3 uNightColor;
  uniform float uDayAlpha;
  uniform float uNightAlpha;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    // Grazing angle → bright limb (works with BackSide shell)
    float ndv = abs(dot(n, viewDir));
    float fresnel = pow(clamp(1.0 - ndv, 0.0, 1.0), uPower);

    // Soft day weighting: limb brighter on sunlit edge, faint night airglow
    float sun = dot(n, normalize(uSunDir));
    float day = smoothstep(-0.25, 0.45, sun);

    vec3 col = mix(uNightColor, uDayColor, day);
    // Slight horizon thickening: more alpha where fresnel is high
    float alpha = fresnel * uDensity * mix(uNightAlpha, uDayAlpha, day);
    // Soft terminator scatter band (blue airlight wraps the edge)
    float termBand = 1.0 - abs(smoothstep(-0.2, 0.35, sun) * 2.0 - 1.0);
    alpha += fresnel * termBand * 0.12 * uDensity;
    col = mix(col, uDayColor * 1.15, termBand * 0.25 * day);

    if (alpha < 0.002) discard;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
    #include <logdepthbuf_fragment>
  }
`;

/** Uniforms for one Fresnel atmosphere shell. */
function makeAtmoUniforms(opts: AtmoShellOpts) {
  return {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uPower: { value: opts.power },
    uDensity: { value: opts.density },
    uDayColor: { value: opts.dayColor },
    uNightColor: { value: opts.nightColor },
    uDayAlpha: { value: opts.dayAlpha },
    uNightAlpha: { value: opts.nightAlpha },
  };
}

/** Configure BackSide transparent shell draw flags. */
function configureAtmoMesh(mesh: THREE.Mesh): void {
  mesh.name = "earth-atmo-shell";
  mesh.renderOrder = 2;
  mesh.frustumCulled = true;
}

/** Sphere geometry for one atmosphere shell, then WGS84 so the limb hugs the globe. */
function makeAtmoGeometry(opts: AtmoShellOpts): THREE.SphereGeometry {
  const segs = opts.segments;
  const geo = new THREE.SphereGeometry(
    opts.radius,
    segs,
    Math.max(24, (segs * 3) / 4),
  );
  applyWgs84ToGeometry(geo);
  return geo;
}

/** Build sphere mesh + shader for one atmosphere shell. */
function makeAtmoShell(opts: AtmoShellOpts): {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
} {
  const material = makeAtmoMaterial(opts);
  const mesh = new THREE.Mesh(makeAtmoGeometry(opts), material);
  configureAtmoMesh(mesh);
  return { mesh, material };
}

/** Shared transparent shell flags (no depth write). */
const SHELL_MAT = {
  transparent: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: true,
} as const;

/** ShaderMaterial for one Fresnel atmosphere shell. */
function makeAtmoMaterial(opts: AtmoShellOpts): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: makeAtmoUniforms(opts),
    vertexShader: ATMO_VERTEX,
    fragmentShader: ATMO_FRAGMENT,
    side: THREE.BackSide,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    ...SHELL_MAT,
  });
}
