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

async function fetchHorizons(cmd: string, center: string): Promise<string> {
  const q = [
    "format=json",
    `COMMAND='${cmd}'`,
    "OBJ_DATA='NO'",
    "MAKE_EPHEM='YES'",
    "EPHEM_TYPE='VECTORS'",
    `CENTER='${center}'`,
    `START_TIME='${START}'`,
    `STOP_TIME='${STOP}'`,
    `STEP_SIZE='${STEP}'`,
    "OUT_UNITS='KM-S'",
    "REF_PLANE='ECLIPTIC'",
    "REF_SYSTEM='J2000'",
    "VEC_TABLE='2'",
    "CSV_FORMAT='YES'",
  ].join("&");
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${q}`;
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

function parseCsv(result: string): State[] {
  const soe = result.indexOf("$$SOE");
  const eoe = result.indexOf("$$EOE");
  const lines = result
    .slice(soe + 5, eoe)
    .trim()
    .split("\n")
    .filter(Boolean);
  return lines.map((line) => {
    const p = line.split(",").map((s) => s.trim());
    return {
      jd: Number(p[0]),
      x: Number(p[2]),
      y: Number(p[3]),
      z: Number(p[4]),
      vx: Number(p[5]),
      vy: Number(p[6]),
      vz: Number(p[7]),
    };
  });
}

async function main(): Promise<void> {
  console.info("[horizons] fetching Earth @ Sun …");
  const earthTxt = await fetchHorizons("399", "@10");
  console.info("[horizons] fetching Moon @ Earth …");
  const moonTxt = await fetchHorizons("301", "@399");

  const earth = parseCsv(earthTxt);
  const moon = parseCsv(moonTxt);
  if (earth.length !== moon.length) {
    throw new Error(`sample count mismatch earth=${earth.length} moon=${moon.length}`);
  }

  const samples = earth.map((e, i) => {
    const m = moon[i]!;
    return {
      dtS: Math.round((e.jd - JD_LANDING) * 86400),
      earth: [e.x, e.y, e.z, e.vx, e.vy, e.vz] as number[],
      moonRel: [m.x, m.y, m.z, m.vx, m.vy, m.vz] as number[],
    };
  });

  const nearest = samples.reduce((a, b) =>
    Math.abs(b.dtS) < Math.abs(a.dtS) ? b : a,
  );
  const er = Math.hypot(nearest.earth[0]!, nearest.earth[1]!, nearest.earth[2]!);
  const mr = Math.hypot(
    nearest.moonRel[0]!,
    nearest.moonRel[1]!,
    nearest.moonRel[2]!,
  );
  console.info(
    `[horizons] ${samples.length} samples · landing dtS=${nearest.dtS} · ` +
      `Earth r=${(er / 149_597_870.7).toFixed(6)} AU · Moon r=${mr.toFixed(0)} km`,
  );

  const out = {
    version: 1,
    source: earthTxt.includes("DE441")
      ? "JPL Horizons API (DE441)"
      : "JPL Horizons API",
    url: "https://ssd.jpl.nasa.gov/api/horizons.api",
    generatedAt: new Date().toISOString(),
    refPlane: "ECLIPTIC",
    refSystem: "J2000",
    outUnits: "KM-S",
    landingUtc: "2027-07-20T12:00:00Z",
    landingJdTdb: JD_LANDING,
    stepHours: 6,
    startUtc: "2027-07-06T00:00:00Z",
    stopUtc: "2027-07-22T00:00:00Z",
    bodies: {
      earth: { command: "399", center: "@10", name: "Earth heliocentric" },
      moon: { command: "301", center: "@399", name: "Moon geocentric" },
      sun: { note: "Fixed at origin in theater (heliocentric)" },
    },
    samples,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.info(`[horizons] wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
