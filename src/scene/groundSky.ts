import * as THREE from "three";
import { R_EARTH } from "../physics/constants";

/**
 * In-atmosphere sky shell for pad / low-altitude camera views.
 *
 * A sphere slightly larger than Earth is drawn from the inside with a zenith–
 * horizon gradient tinted by sun elevation. Opacity falls off with camera
 * altitude so deep-space and globe views stay starfield-black.
 *
 * V5: optional entry brownout tint (plasma / high-speed entry theater).
 *
 * Scene unit = 1 km. Scrub-safe (no wall-clock state).
 */

/** Full sky below this camera altitude (km above mean surface). */
const SKY_FULL_ALT_KM = 8;
/** Sky fully faded by this altitude (km). */
const SKY_FADE_ALT_KM = 140;
/**
 * Shell radius multiplier. Camera at the pad sits inside; large enough that
 * looking toward the horizon still hits the dome before the starfield.
 */
const SHELL_R = R_EARTH * 1.14;

const _camRel = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _localUp = new THREE.Vector3();

export type GroundSky = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
};

const GROUND_SKY_VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

const GROUND_SKY_FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uEarthPos;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  uniform float uDay;
  uniform float uBrownout;
  varying vec3 vWorldPos;

  void main() {
    if (uOpacity < 0.004) discard;

    // View direction from camera through this sky point
    vec3 viewDir = normalize(vWorldPos - cameraPosition);
    // Local vertical at the camera (geocentric)
    vec3 up = normalize(cameraPosition - uEarthPos);
    float elev = clamp(dot(viewDir, up), -1.0, 1.0);
    // 0 at horizon, 1 at zenith
    float zenith = clamp(elev, 0.0, 1.0);
    // Soft horizon band for haze
    float horizon = 1.0 - smoothstep(-0.05, 0.35, elev);

    // Day palette
    vec3 zenithDay = vec3(0.25, 0.52, 0.92);
    vec3 midDay = vec3(0.45, 0.68, 0.95);
    vec3 horizonDay = vec3(0.72, 0.82, 0.95);
    // Warm haze toward the sun
    float sunFacing = clamp(dot(viewDir, uSunDir), 0.0, 1.0);
    sunFacing = pow(sunFacing, 4.0);
    vec3 sunHaze = vec3(1.0, 0.82, 0.55) * sunFacing * 0.55;

    vec3 dayCol = mix(horizonDay, midDay, smoothstep(0.0, 0.45, zenith));
    dayCol = mix(dayCol, zenithDay, smoothstep(0.35, 1.0, zenith));
    dayCol += sunHaze * (0.35 + 0.65 * horizon);

    // Night / twilight (deep blue + faint horizon glow)
    vec3 zenithNight = vec3(0.02, 0.04, 0.10);
    vec3 horizonNight = vec3(0.06, 0.09, 0.16);
    vec3 nightCol = mix(horizonNight, zenithNight, smoothstep(0.0, 0.8, zenith));
    float twilight = (1.0 - abs(uDay * 2.0 - 1.0));
    twilight *= twilight;
    nightCol += vec3(0.35, 0.18, 0.08) * twilight * horizon * 0.45;

    vec3 col = mix(nightCol, dayCol, clamp(uDay, 0.0, 1.0));

    // Entry brownout: warm orange-brown, strongest near horizon (V5)
    float bo = clamp(uBrownout, 0.0, 1.0);
    if (bo > 0.001) {
      vec3 brown = vec3(0.55, 0.22, 0.06);
      vec3 amber = vec3(0.75, 0.35, 0.1);
      vec3 boCol = mix(brown, amber, sunFacing * 0.6);
      float boMix = bo * (0.35 + 0.65 * horizon);
      col = mix(col, boCol, boMix);
      // Slightly denser haze so stars drop out behind the shell
      // (alpha boost applied below)
    }

    // Stronger near the horizon; slightly thinner at zenith
    float density = mix(0.92, 0.72, zenith) + horizon * 0.12;
    density += bo * horizon * 0.18;
    float alpha = uOpacity * density;
    // Fade fragments looking into the ground (below local horizon)
    alpha *= smoothstep(-0.12, 0.02, elev);

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
    #include <logdepthbuf_fragment>
  }
`;

/** Shader uniforms for the ground-sky shell. */
function groundSkyUniforms(): THREE.ShaderMaterialParameters["uniforms"] {
  return {
    uEarthPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uOpacity: { value: 0 },
    uDay: { value: 1 },
    uBrownout: { value: 0 },
  };
}

/** Shared transparent shell flags (no depth write). */
const SHELL_MAT = {
  transparent: true,
  depthWrite: false,
  depthTest: true,
  toneMapped: true,
} as const;

/** Build the ground-sky ShaderMaterial (uniforms + BackSide shell). */
function makeGroundSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: groundSkyUniforms(),
    vertexShader: GROUND_SKY_VERTEX,
    fragmentShader: GROUND_SKY_FRAGMENT,
    side: THREE.BackSide,
    blending: THREE.NormalBlending,
    ...SHELL_MAT,
  });
}

/** Configure shell mesh draw flags (after stars, before opaque pad). */
function configureGroundSkyMesh(mesh: THREE.Mesh): void {
  mesh.name = "ground-sky";
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
}

export function createGroundSky(): GroundSky {
  const material = makeGroundSkyMaterial();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(SHELL_R, 64, 48),
    material,
  );
  configureGroundSkyMesh(mesh);
  return { mesh, material };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Hide sky shell and zero opacity / brownout uniforms. */
function hideGroundSky(sky: GroundSky): void {
  sky.mesh.visible = false;
  sky.material.uniforms.uOpacity!.value = 0;
  sky.material.uniforms.uBrownout!.value = 0;
}

/** Normalize sun direction into `_sunDir` (fallback +X). */
function normalizeSunDir(sunWorldDir: THREE.Vector3): void {
  _sunDir.copy(sunWorldDir);
  if (_sunDir.lengthSq() < 1e-12) _sunDir.set(1, 0, 0);
  else _sunDir.normalize();
}

/** Write frame uniforms and show the shell. */
function applyGroundSkyUniforms(
  sky: GroundSky,
  earthPos: THREE.Vector3,
  opacity: number,
  day: number,
  brownout: number,
): void {
  sky.material.uniforms.uEarthPos!.value.copy(earthPos);
  sky.material.uniforms.uSunDir!.value.copy(_sunDir);
  sky.material.uniforms.uOpacity!.value = opacity;
  sky.material.uniforms.uDay!.value = day;
  sky.material.uniforms.uBrownout!.value = Math.max(0, Math.min(1, brownout));
  sky.mesh.visible = true;
}

/** Opacity from geocentric radius: height fade × inside-shell gate. */
function groundSkyOpacity(r: number): number {
  const alt = r - R_EARTH;
  const heightFade = 1 - smoothstep(SKY_FULL_ALT_KM, SKY_FADE_ALT_KM, alt);
  const insideShell = r < SHELL_R * 0.995 ? 1 : 0;
  return heightFade * insideShell;
}

/**
 * Place the shell on Earth and set opacity / day factor from camera height
 * and sun elevation at the camera.
 *
 * @param sunWorldDir unit vector roughly Earth → Sun (or light direction)
 * @param brownout entry brownout 0..1 (visual V5; optional)
 */
/** Day factor from sun elevation at camera (after normalizeSunDir). */
function groundSkyDayFactor(r: number): number {
  _localUp.copy(_camRel).multiplyScalar(1 / r);
  return smoothstep(-0.12, 0.28, _sunDir.dot(_localUp));
}

export function updateGroundSky(
  sky: GroundSky,
  camera: THREE.Camera,
  earthPos: THREE.Vector3,
  sunWorldDir: THREE.Vector3,
  brownout = 0,
): void {
  sky.mesh.position.copy(earthPos);
  _camRel.copy(camera.position).sub(earthPos);
  const r = _camRel.length();
  if (r < R_EARTH * 0.5 || groundSkyOpacity(r) < 0.01) {
    hideGroundSky(sky);
    return;
  }
  normalizeSunDir(sunWorldDir);
  applyGroundSkyUniforms(sky, earthPos, groundSkyOpacity(r), groundSkyDayFactor(r), brownout);
}
