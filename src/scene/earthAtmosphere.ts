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
 * Inject a soft day/night terminator into MeshStandardMaterial's direct light.
 * Call once after constructing the material; sets customProgramCacheKey.
 */
export function applySoftTerminator(material: THREE.MeshStandardMaterial): void {
  material.customProgramCacheKey = () => "earth-soft-terminator-v2";
  material.onBeforeCompile = (shader) => {
    // Only RE_Direct_Physical's irradiance gate — leave BRDF specular N·L alone.
    shader.fragmentShader = shader.fragmentShader.replace(
      "float dotNL = saturate( dot( geometryNormal, directLight.direction ) );",
      // Soft scatter wraps slightly past the geometric night side (theater).
      "float dotNL = smoothstep( -0.18, 0.42, dot( geometryNormal, directLight.direction ) );",
    );
  };
}

/**
 * Fresnel Rayleigh-ish atmosphere shells (BackSide — limb ring outside Earth).
 * Day-weighted: bright cyan limb on the sunlit edge, faint night airglow.
 */
export function createEarthAtmosphere(): EarthAtmosphere {
  const group = new THREE.Group();
  group.name = "earth-atmosphere";

  const materials: THREE.ShaderMaterial[] = [];

  // Dense inner band — thick blue near horizon / LEO limb drama
  const inner = makeAtmoShell({
    radius: R_EARTH * 1.018,
    segments: 64,
    power: 3.2,
    density: 0.72,
    dayColor: new THREE.Color(0xa8d8ff),
    nightColor: new THREE.Color(0x1a3a6a),
    dayAlpha: 0.55,
    nightAlpha: 0.1,
    additive: true,
  });
  group.add(inner.mesh);
  materials.push(inner.material);

  // Mid Rayleigh shell — softer blue wrap
  const mid = makeAtmoShell({
    radius: R_EARTH * 1.035,
    segments: 56,
    power: 2.4,
    density: 0.55,
    dayColor: new THREE.Color(0x5aa0e8),
    nightColor: new THREE.Color(0x0c2040),
    dayAlpha: 0.38,
    nightAlpha: 0.08,
    additive: false,
  });
  group.add(mid.mesh);
  materials.push(mid.material);

  // Outer faint halo — extended scatter
  const outer = makeAtmoShell({
    radius: R_EARTH * 1.065,
    segments: 48,
    power: 1.8,
    density: 0.4,
    dayColor: new THREE.Color(0x3a78c8),
    nightColor: new THREE.Color(0x081828),
    dayAlpha: 0.18,
    nightAlpha: 0.04,
    additive: false,
  });
  group.add(outer.mesh);
  materials.push(outer.material);

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

function makeAtmoShell(opts: AtmoShellOpts): {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
} {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uPower: { value: opts.power },
      uDensity: { value: opts.density },
      uDayColor: { value: opts.dayColor },
      uNightColor: { value: opts.nightColor },
      uDayAlpha: { value: opts.dayAlpha },
      uNightAlpha: { value: opts.nightAlpha },
    },
    vertexShader: /* glsl */ `
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
    `,
    fragmentShader: /* glsl */ `
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
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(opts.radius, opts.segments, Math.max(24, (opts.segments * 3) / 4)),
    material,
  );
  mesh.name = "earth-atmo-shell";
  mesh.renderOrder = 2;
  mesh.frustumCulled = true;

  return { mesh, material };
}
