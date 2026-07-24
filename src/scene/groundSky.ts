import * as THREE from "three";
import { R_EARTH } from "../physics/constants";

/**
 * In-atmosphere sky shell for pad / low-altitude camera views.
 *
 * A sphere slightly larger than Earth is drawn from the inside with a zenith–
 * horizon gradient tinted by sun elevation. Opacity falls off with camera
 * altitude so deep-space and globe views stay starfield-black.
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

export function createGroundSky(): GroundSky {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uEarthPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 0 },
      uDay: { value: 1 },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 uEarthPos;
      uniform vec3 uSunDir;
      uniform float uOpacity;
      uniform float uDay;
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

        // Stronger near the horizon; slightly thinner at zenith
        float density = mix(0.92, 0.72, zenith) + horizon * 0.12;
        float alpha = uOpacity * density;
        // Fade fragments looking into the ground (below local horizon)
        alpha *= smoothstep(-0.12, 0.02, elev);

        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96));
        #include <logdepthbuf_fragment>
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(SHELL_R, 64, 48),
    material,
  );
  mesh.name = "ground-sky";
  mesh.frustumCulled = false;
  // After star dome (default 0) so the atmosphere covers stars near the pad;
  // still under typical opaque craft/pad draws via depth test.
  mesh.renderOrder = 1;
  mesh.visible = false;

  return { mesh, material };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Place the shell on Earth and set opacity / day factor from camera height
 * and sun elevation at the camera.
 *
 * @param sunWorldDir unit vector roughly Earth → Sun (or light direction)
 */
export function updateGroundSky(
  sky: GroundSky,
  camera: THREE.Camera,
  earthPos: THREE.Vector3,
  sunWorldDir: THREE.Vector3,
): void {
  sky.mesh.position.copy(earthPos);

  _camRel.copy(camera.position).sub(earthPos);
  const r = _camRel.length();
  if (r < R_EARTH * 0.5) {
    // Degenerate (inside core) — hide
    sky.mesh.visible = false;
    sky.material.uniforms.uOpacity!.value = 0;
    return;
  }

  const alt = r - R_EARTH;
  // 1 at surface / low pad cams, 0 above fade altitude
  const heightFade = 1 - smoothstep(SKY_FULL_ALT_KM, SKY_FADE_ALT_KM, alt);
  // Only when camera is inside the shell (otherwise BackSide is wrong)
  const insideShell = r < SHELL_R * 0.995 ? 1 : 0;
  const opacity = heightFade * insideShell;

  if (opacity < 0.01) {
    sky.mesh.visible = false;
    sky.material.uniforms.uOpacity!.value = 0;
    return;
  }

  _localUp.copy(_camRel).multiplyScalar(1 / r);
  _sunDir.copy(sunWorldDir);
  if (_sunDir.lengthSq() < 1e-12) {
    _sunDir.set(1, 0, 0);
  } else {
    _sunDir.normalize();
  }

  // Sun elevation at camera: 1 = overhead day, 0 = horizon, <0 night
  const sunElev = _sunDir.dot(_localUp);
  // Map elev −0.15..0.35 → 0..1 day factor (soft twilight)
  const day = smoothstep(-0.12, 0.28, sunElev);

  sky.material.uniforms.uEarthPos!.value.copy(earthPos);
  sky.material.uniforms.uSunDir!.value.copy(_sunDir);
  sky.material.uniforms.uOpacity!.value = opacity;
  sky.material.uniforms.uDay!.value = day;
  sky.mesh.visible = true;
}
