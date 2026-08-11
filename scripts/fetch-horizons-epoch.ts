/**
 * Sample JPL Horizons (DE441) for the July 2027 mission window and write
 * `src/data/horizons-epoch.json` for runtime interpolation.
 *
 * Usage: npx tsx scripts/fetch-horizons-epoch.ts
 *
 * Frame: heliocentric ecliptic J2000, km / km/s.
 * Landing epoch: 2027-07-20 12:00 TDB (JD 2461607.0).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../src/data/horizons-epoch.json");

const JD_LANDING = 2_461_607.0; // 2027-07-20 12:00 TDB
// Wide enough for free-coast time of flight (~7 d) + epoch search (±10 d) + margin
const START = "2027-06-20";
const STOP = "2027-08-10";
const STEP = "6%20h";

const HORIZONS_FIXED = [
  "format=json", "OBJ_DATA='NO'", "MAKE_EPHEM='YES'", "EPHEM_TYPE='VECTORS'",
  "OUT_UNITS='KM-S'", "REF_PLANE='ECLIPTIC'", "REF_SYSTEM='J2000'",
  "VEC_TABLE='2'", "CSV_FORMAT='YES'",
];

function horizonsQuery(cmd: string, center: string): string {
  return [
    ...HORIZONS_FIXED,
    `COMMAND='${cmd}'`, `CENTER='${center}'`,
    `START_TIME='${START}'`, `STOP_TIME='${STOP}'`, `STEP_SIZE='${STEP}'`,
  ].join("&");
}

async function fetchHorizons(cmd: string, center: string): Promise<string> {
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${horizonsQuery(cmd, center)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${cmd}`);
  const data = (await res.json()) as { result?: string };
  if (!data.result?.includes("$$SOE")) {
    throw new Error(`Horizons error for ${cmd}:\n${data.result?.slice(0, 500)}`);
  }
  return data.result;
}

type State = {
  jd: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};

function parseStateLine(line: string): State {
  const p = line.split(",").map((s) => s.trim());
  return {
    jd: Number(p[0]),
    x: Number(p[2]), y: Number(p[3]), z: Number(p[4]),
    vx: Number(p[5]), vy: Number(p[6]), vz: Number(p[7]),
  };
}

function parseCsv(result: string): State[] {
  const soe = result.indexOf("$$SOE");
  const eoe = result.indexOf("$$EOE");
  return result
    .slice(soe + 5, eoe)
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(parseStateLine);
}

type SampleRow = {
  dtS: number;
  earth: number[];
  moonRel: number[];
};

function stateToVec6(s: State): number[] {
  return [s.x, s.y, s.z, s.vx, s.vy, s.vz];
}

function buildSamples(earth: State[], moon: State[]): SampleRow[] {
  return earth.map((e, i) => ({
    dtS: Math.round((e.jd - JD_LANDING) * 86400),
    earth: stateToVec6(e),
    moonRel: stateToVec6(moon[i]!),
  }));
}

function nearestLanding(samples: SampleRow[]): SampleRow {
  return samples.reduce((a, b) => (Math.abs(b.dtS) < Math.abs(a.dtS) ? b : a));
}

function logHorizonsSummary(samples: SampleRow[]): void {
  const nearest = nearestLanding(samples);
  const er = Math.hypot(nearest.earth[0]!, nearest.earth[1]!, nearest.earth[2]!);
  const mr = Math.hypot(nearest.moonRel[0]!, nearest.moonRel[1]!, nearest.moonRel[2]!);
  console.info(
    `[horizons] ${samples.length} samples · landing dtS=${nearest.dtS} · ` +
      `Earth r=${(er / 149_597_870.7).toFixed(6)} AU · Moon r=${mr.toFixed(0)} km`,
  );
}

function horizonsSource(earthTxt: string): string {
  return earthTxt.includes("DE441") ? "JPL Horizons API (DE441)" : "JPL Horizons API";
}

function horizonsMeta(earthTxt: string) {
  return {
    version: 1 as const, source: horizonsSource(earthTxt),
    url: "https://ssd.jpl.nasa.gov/api/horizons.api",
    generatedAt: new Date().toISOString(),
    refPlane: "ECLIPTIC", refSystem: "J2000", outUnits: "KM-S",
    landingUtc: "2027-07-20T12:00:00Z", landingJdTdb: JD_LANDING, stepHours: 6,
    startUtc: "2027-07-06T00:00:00Z", stopUtc: "2027-07-22T00:00:00Z",
  };
}

function horizonsBodies() {
  return {
    earth: { command: "399", center: "@10", name: "Earth heliocentric" },
    moon: { command: "301", center: "@399", name: "Moon geocentric" },
    sun: { note: "Fixed at origin in theater (heliocentric)" },
  };
}

function buildHorizonsOut(earthTxt: string, samples: SampleRow[]) {
  return { ...horizonsMeta(earthTxt), bodies: horizonsBodies(), samples };
}

async function fetchEarthMoon(): Promise<{ earthTxt: string; earth: State[]; moon: State[] }> {
  console.info("[horizons] fetching Earth @ Sun …");
  const earthTxt = await fetchHorizons("399", "@10");
  console.info("[horizons] fetching Moon @ Earth …");
  const moonTxt = await fetchHorizons("301", "@399");
  return { earthTxt, earth: parseCsv(earthTxt), moon: parseCsv(moonTxt) };
}

async function main(): Promise<void> {
  const { earthTxt, earth, moon } = await fetchEarthMoon();
  if (earth.length !== moon.length) {
    throw new Error(`sample count mismatch earth=${earth.length} moon=${moon.length}`);
  }
  const samples = buildSamples(earth, moon);
  logHorizonsSummary(samples);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(buildHorizonsOut(earthTxt, samples)));
  console.info(`[horizons] wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
