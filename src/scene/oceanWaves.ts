import {
  OCEAN_DAY_HI,
  OCEAN_DAY_LO,
  OCEAN_EDGE_HI,
  OCEAN_EDGE_LO,
} from "./terminalSplashFx";

export const OCEAN_SWELL_AMP_KM = 0.0045;
export const OCEAN_CHOP_AMP_KM = 0.0022;

export type OceanChop = 0 | 1;

export type CrestFoam = {
  readonly cover: number;
  readonly streak: number;
  readonly mix: number;
};

export type OceanProgram = {
  readonly vertex: string;
  readonly fragment: string;
};

type WaveTerm = {
  readonly kx: number;
  readonly kz: number;
  readonly omega: number;
  readonly weight: number;
};

type WaveAccum = {
  readonly height: number;
  readonly laplacian: number;
};

const SWELL: readonly WaveTerm[] = [
  { kx: 0.22, kz: 0.14, omega: 0.65, weight: 1 },
  { kx: -0.16, kz: 0.25, omega: 0.88, weight: 0.55 },
  { kx: 0.41, kz: -0.11, omega: 1.15, weight: 0.28 },
];

const CHOP: readonly WaveTerm[] = [
  { kx: 10.4, kz: 7.1, omega: 1.45, weight: 1 },
  { kx: -8.2, kz: 12.6, omega: 1.9, weight: 0.64 },
];

const COVER_LO_FRAC = 0.62;
const COVER_HI_FRAC = 0.86;
const STREAK_CROSS_KM = 0.04;
const STREAK_ALONG_KM = 0.08;
const STREAK_ADVECT_KM_S = 0.012;
const FOAM_BLEND = 0.85;

function glsl6(n: number): string {
  return n.toFixed(6);
}

function finiteSample(xKm: number, zKm: number, missionT: number): boolean {
  return Number.isFinite(xKm) && Number.isFinite(zKm) && Number.isFinite(missionT);
}

function windUnit(): { readonly x: number; readonly z: number } {
  const lead = SWELL[0];
  const mag = Math.hypot(lead.kx, lead.kz);
  return { x: -lead.kx / mag, z: -lead.kz / mag };
}

function accumulate(
  terms: readonly WaveTerm[],
  ampKm: number,
  xKm: number,
  zKm: number,
  missionT: number,
): WaveAccum {
  let height = 0;
  let laplacian = 0;
  for (const term of terms) {
    const phase = term.kx * xKm + term.kz * zKm + term.omega * missionT;
    const contrib = (Math.sin(phase) * ampKm) * term.weight;
    height += contrib;
    laplacian += -(term.kx * term.kx + term.kz * term.kz) * contrib;
  }
  return { height, laplacian };
}

function curvatureBound(terms: readonly WaveTerm[], ampKm: number): number {
  let sum = 0;
  for (const term of terms) {
    sum += ampKm * term.weight * (term.kx * term.kx + term.kz * term.kz);
  }
  return sum;
}

function assertSwellUnderGate(): void {
  const chopBound = curvatureBound(CHOP, OCEAN_CHOP_AMP_KM);
  const swellBound = curvatureBound(SWELL, OCEAN_SWELL_AMP_KM);
  if (!(COVER_LO_FRAC * chopBound > swellBound)) {
    throw new Error("swell reaches the foam gate");
  }
}

function hermiteSmoothstep(edge0: number, edge1: number, x: number): number {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Long-period swell height (km). Non-finite inputs return 0. */
export function oceanSwellHeightKm(
  xKm: number,
  zKm: number,
  missionT: number,
): number {
  if (!finiteSample(xKm, zKm, missionT)) return 0;
  return accumulate(SWELL, OCEAN_SWELL_AMP_KM, xKm, zKm, missionT).height;
}

/** Inner-plate chop height (km). Non-finite inputs return 0. */
export function oceanChopHeightKm(
  xKm: number,
  zKm: number,
  missionT: number,
): number {
  if (!finiteSample(xKm, zKm, missionT)) return 0;
  return accumulate(CHOP, OCEAN_CHOP_AMP_KM, xKm, zKm, missionT).height;
}

function streakAt(xKm: number, zKm: number, missionT: number): number {
  const wind = windUnit();
  const along = xKm * wind.x + zKm * wind.z;
  const cross = -xKm * wind.z + zKm * wind.x;
  const ribs = Math.max(0, Math.sin((cross * 2 * Math.PI) / STREAK_CROSS_KM));
  const dashes = Math.max(
    0,
    Math.sin(((along - STREAK_ADVECT_KM_S * missionT) * 2 * Math.PI) / STREAK_ALONG_KM),
  );
  return ribs * ribs * dashes;
}

export function oceanCrestFoam(
  xKm: number,
  zKm: number,
  missionT: number,
  chop: OceanChop,
): CrestFoam {
  if (!finiteSample(xKm, zKm, missionT) || !Number.isFinite(chop)) {
    return { cover: 0, streak: 0, mix: 0 };
  }
  const lap =
    accumulate(SWELL, OCEAN_SWELL_AMP_KM, xKm, zKm, missionT).laplacian +
    chop * accumulate(CHOP, OCEAN_CHOP_AMP_KM, xKm, zKm, missionT).laplacian;
  const sharpness = Math.max(0, -lap);
  const bound = curvatureBound(CHOP, OCEAN_CHOP_AMP_KM);
  const cover = hermiteSmoothstep(
    COVER_LO_FRAC * bound,
    COVER_HI_FRAC * bound,
    sharpness,
  );
  const streak = streakAt(xKm, zKm, missionT);
  return { cover, streak, mix: cover * streak };
}

function harmonic(term: WaveTerm, ampKm: number): string {
  return (
    `sin(p.x * ${glsl6(term.kx)} + p.y * ${glsl6(term.kz)} + t * ${glsl6(term.omega)})` +
    ` * (${glsl6(ampKm * term.weight)})`
  );
}

function heightFn(name: string, terms: readonly WaveTerm[], ampKm: number): string {
  const sum = terms.map((term) => harmonic(term, ampKm)).join("\n      + ");
  return `  float ${name}(vec2 p, float t) {\n    return ${sum};\n  }`;
}

function lapLine(term: WaveTerm, ampKm: number, scale: string): string {
  const kx = glsl6(term.kx);
  const kz = glsl6(term.kz);
  return (
    `    lap += ${scale}-(${kx} * ${kx} + ${kz} * ${kz}) * (${harmonic(term, ampKm)});`
  );
}

function crestLapFn(): string {
  const lines = [
    ...SWELL.map((term) => lapLine(term, OCEAN_SWELL_AMP_KM, "")),
    ...CHOP.map((term) => lapLine(term, OCEAN_CHOP_AMP_KM, "uChop * ")),
  ];
  return `  float crestLap(vec2 p, float t) {\n    float lap = 0.0;\n${lines.join("\n")}\n    return lap;\n  }`;
}

function foamMixGlsl(): string {
  const wind = windUnit();
  const bound = glsl6(curvatureBound(CHOP, OCEAN_CHOP_AMP_KM));
  const crossK = glsl6((2 * Math.PI) / STREAK_CROSS_KM);
  const alongK = glsl6((2 * Math.PI) / STREAK_ALONG_KM);
  return `    float sharpness = max(0.0, -crestLap(vRestXZ, uTime));
    float cover = smoothstep(${glsl6(COVER_LO_FRAC)} * ${bound}, ${glsl6(COVER_HI_FRAC)} * ${bound}, sharpness);
    float along = vRestXZ.x * ${glsl6(wind.x)} + vRestXZ.y * ${glsl6(wind.z)};
    float crossWind = -vRestXZ.x * ${glsl6(wind.z)} + vRestXZ.y * ${glsl6(wind.x)};
    float ribs = max(0.0, sin(crossWind * ${crossK}));
    float dashes = max(0.0, sin((along - ${glsl6(STREAK_ADVECT_KM_S)} * uTime) * ${alongK}));
    float streak = ribs * ribs * dashes;
    float foam = cover * streak;
    col = mix(col, vec3(0.94, 0.97, 1.0), foam * ${glsl6(FOAM_BLEND)});`;
}

export function splashOceanShaders(plateRadiusKm: number): OceanProgram {
  const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute vec2 restXZ;
  uniform float uTime;
  uniform float uChop;
  varying vec2 vRestXZ;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
${heightFn("swell", SWELL, OCEAN_SWELL_AMP_KM)}
${heightFn("chop", CHOP, OCEAN_CHOP_AMP_KM)}
  void main() {
    vRestXZ = restXZ;
    float h = swell(restXZ, uTime) + uChop * chop(restXZ, uTime);
    vec3 n = normalize(normal);
    vec3 pos = position + n * h;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    #include <logdepthbuf_vertex>
  }
`;

  const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uRipple;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uChop;
  uniform float uFeather;
  uniform vec3 uSunDir;
  uniform vec3 uUp;
  varying vec2 vRestXZ;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
${crestLapFn()}
  void main() {
    if (uOpacity < 0.004) discard;
    vec2 mapUv = vRestXZ / ${(plateRadiusKm * 2).toFixed(1)} + 0.5;
    vec4 sea = texture2D(uMap, mapUv);
    if (sea.a < 0.01) discard;
    vec2 ruv = vRestXZ * 12.5 + vec2(uTime * 0.035, -uTime * 0.022);
    float rip = texture2D(uRipple, ruv).r;
    vec2 ruv2 = vRestXZ * 7.4 + vec2(-uTime * 0.018, uTime * 0.028);
    float rip2 = texture2D(uRipple, ruv2).r;
    float chop = (rip - 0.5) * 0.55 + (rip2 - 0.5) * 0.35;
    vec3 n = normalize(vWorldNormal);
    n = normalize(n + vec3(chop * 0.45, 0.0, chop * 0.35));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float ndv = max(0.0, dot(n, viewDir));
    float fresnel = pow(1.0 - ndv, 3.2);
    vec3 sunDir = normalize(uSunDir);
    vec3 up = normalize(uUp);
    float sunNd = max(0.0, dot(reflect(-sunDir, n), viewDir));
    float path = pow(sunNd, 8.0);
    float spark = pow(sunNd, 56.0);
    float glitter = (path * 0.65 + spark) * fresnel;
    vec3 refl = reflect(-viewDir, n);
    float elev = clamp(dot(refl, up), -1.0, 1.0);
    float zenith = clamp(elev, 0.0, 1.0);
    float horizon = 1.0 - smoothstep(-0.02, 0.35, elev);
    vec3 zenithDay = vec3(0.25, 0.52, 0.92);
    vec3 horizonDay = vec3(0.72, 0.82, 0.95);
    vec3 dayCol = mix(horizonDay, zenithDay, smoothstep(0.0, 0.85, zenith));
    float sunFace = pow(max(dot(refl, sunDir), 0.0), 4.0);
    dayCol += vec3(1.0, 0.82, 0.55) * sunFace * 0.35 * horizon;
    float day = smoothstep(${OCEAN_DAY_LO.toFixed(2)}, ${OCEAN_DAY_HI.toFixed(2)}, dot(sunDir, up));
    vec3 zenithNight = vec3(0.02, 0.04, 0.10);
    vec3 horizonNight = vec3(0.06, 0.09, 0.16);
    vec3 nightCol = mix(horizonNight, zenithNight, smoothstep(0.0, 0.8, zenith));
    vec3 sky = mix(nightCol, dayCol, day);
    vec3 deep = sea.rgb * vec3(0.92, 0.96, 1.02);
    vec3 col = mix(deep, sky, fresnel * mix(0.22, 0.7, day));
    col += vec3(1.0, 0.97, 0.9) * glitter;
${foamMixGlsl()}

    float edge = 1.0;
    if (uFeather > 0.5) {
      float radial = length(vRestXZ) / ${plateRadiusKm.toFixed(1)};
      edge = 1.0 - smoothstep(${OCEAN_EDGE_LO.toFixed(2)}, ${OCEAN_EDGE_HI.toFixed(1)}, radial);
    }
    gl_FragColor = vec4(col, sea.a * uOpacity * edge);
    #include <logdepthbuf_fragment>
  }
`;

  return { vertex, fragment };
}

function waveLiterals(): readonly string[] {
  const out: string[] = [];
  const pushBank = (terms: readonly WaveTerm[], ampKm: number) => {
    for (const term of terms) {
      out.push(
        glsl6(term.kx),
        glsl6(term.kz),
        glsl6(term.omega),
        glsl6(ampKm * term.weight),
      );
    }
  };
  pushBank(SWELL, OCEAN_SWELL_AMP_KM);
  pushBank(CHOP, OCEAN_CHOP_AMP_KM);
  return out;
}

function foamLiterals(): readonly string[] {
  return [
    COVER_LO_FRAC,
    COVER_HI_FRAC,
    (2 * Math.PI) / STREAK_CROSS_KM,
    (2 * Math.PI) / STREAK_ALONG_KM,
    STREAK_ADVECT_KM_S,
    FOAM_BLEND,
  ].map(glsl6);
}

function hasBoundedLiteral(source: string, token: string): boolean {
  let from = 0;
  while (from < source.length) {
    const at = source.indexOf(token, from);
    if (at < 0) return false;
    const before = at > 0 ? source[at - 1] : "";
    const after = source[at + token.length] ?? "";
    const digit = (ch: string) => ch >= "0" && ch <= "9";
    if (!digit(before) && !digit(after)) return true;
    from = at + 1;
  }
  return false;
}

/** Empty when every wave literal is in both stages and every foam literal is fragment-only. */
export function oceanShaderGaps(): readonly string[] {
  const program = splashOceanShaders(80);
  const gaps: string[] = [];
  for (const token of waveLiterals()) {
    if (!hasBoundedLiteral(program.vertex, token)) gaps.push(`vertex missing wave ${token}`);
    if (!hasBoundedLiteral(program.fragment, token)) gaps.push(`fragment missing wave ${token}`);
  }
  for (const token of foamLiterals()) {
    if (!hasBoundedLiteral(program.fragment, token)) gaps.push(`fragment missing foam ${token}`);
    if (hasBoundedLiteral(program.vertex, token)) gaps.push(`vertex has foam ${token}`);
  }
  return gaps;
}

assertSwellUnderGate();
const gapsAtLoad = oceanShaderGaps();
if (gapsAtLoad.length > 0) throw new Error(gapsAtLoad.join("\n"));
