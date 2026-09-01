/**
 * Fetch north-up Sentinel-2 cloudless JPEGs for the Starbase ground plates.
 *
 * Usage:
 *   npx tsx scripts/fetch-starbase-surrounds.ts
 *   npx tsx scripts/fetch-starbase-surrounds.ts --land
 *
 * Source: EOX s2cloudless-2024 WMS (Copernicus / CC BY 4.0). Default writes
 * `public/textures/starbase_surrounds.jpg` covering the km-square in
 * `starbasePlate.ts`. `--land` writes the five landward neighbors
 * (`starbase_surrounds_{n,nw,w,sw,s}.jpg`). Full rectangles — not crops.
 *
 * Downloads a 3×3 WMS mosaic so each 80 km plate keeps ~10 m/px, then
 * JPEG-encodes a 4096² plate for WebGL.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STARBASE_LAND_PLATES,
  STARBASE_PLATE_HALF_KM,
  starbaseNeighborPlateWmsBboxDeg,
  starbasePlateWmsBboxDeg,
} from "../src/scene/starbasePlate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../public/textures/starbase_surrounds.jpg");

/** Tiles per side. Odd grid keeps Starbase inside the center tile. */
const TILES = 3;
const TILE_PX = 4096;
/** Committed texture size (WebGL2-safe; matches the previous plate). */
const OUT_PX = 4096;
const WMS = "https://tiles.maps.eox.at/";
const LAYER = "s2cloudless-2024";

type Bbox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

function wmsUrl(bbox: Bbox, width: number, height: number): string {
  const q = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.1.1",
    LAYERS: LAYER,
    STYLES: "",
    SRS: "EPSG:4326",
    BBOX: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
    WIDTH: String(width),
    HEIGHT: String(height),
    FORMAT: "image/jpeg",
  });
  return `${WMS}?${q.toString()}`;
}

function tileBbox(full: Bbox, col: number, rowFromSouth: number): Bbox {
  const lonSpan = (full.maxLon - full.minLon) / TILES;
  const latSpan = (full.maxLat - full.minLat) / TILES;
  return {
    minLon: full.minLon + col * lonSpan,
    maxLon: full.minLon + (col + 1) * lonSpan,
    minLat: full.minLat + rowFromSouth * latSpan,
    maxLat: full.minLat + (rowFromSouth + 1) * latSpan,
  };
}

const TILE_ATTEMPTS = 4;

async function fetchJpeg(url: string): Promise<Buffer> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= TILE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`WMS HTTP ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf[0] !== 0xff || buf[1] !== 0xd8) {
        throw new Error(`WMS did not return JPEG: ${buf.subarray(0, 240).toString()}`);
      }
      return buf;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`  attempt ${attempt}/${TILE_ATTEMPTS}: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("WMS fetch failed");
}

/** Pillow stitch + Lanczos downsample. WMS row 0 is south; image row 0 is north. */
function stitchTiles(tileDir: string, outPath: string): void {
  const py = `
from PIL import Image
import os
tiles = ${TILES}
px = ${TILE_PX}
out_px = ${OUT_PX}
mosaic = Image.new("RGB", (px * tiles, px * tiles))
for row_s in range(tiles):
    img_row = tiles - 1 - row_s
    for col in range(tiles):
        im = Image.open(os.path.join(${JSON.stringify(tileDir)}, f"{col}_{row_s}.jpg"))
        mosaic.paste(im, (col * px, img_row * px))
if mosaic.size[0] != out_px:
    mosaic = mosaic.resize((out_px, out_px), Image.Resampling.LANCZOS)
mosaic.save(${JSON.stringify(outPath)}, "JPEG", quality=86, optimize=True, subsampling=1)
print(mosaic.size[0], os.path.getsize(${JSON.stringify(outPath)}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`Pillow stitch failed: ${r.stderr || r.stdout}`);
  }
  console.log(`stitched ${r.stdout.trim()}`);
}

async function fetchMosaic(bbox: Bbox, outPath: string, label: string): Promise<void> {
  console.log(
    `Fetching ${LAYER} ${label} ${TILES}×${TILES} @ ${TILE_PX}px  ±${STARBASE_PLATE_HALF_KM} km`,
  );
  console.log(
    `bbox lon ${bbox.minLon.toFixed(5)}…${bbox.maxLon.toFixed(5)}, ` +
      `lat ${bbox.minLat.toFixed(5)}…${bbox.maxLat.toFixed(5)}`,
  );
  const tileDir = fs.mkdtempSync(path.join(os.tmpdir(), "starbase-s2-"));
  try {
    for (let row = 0; row < TILES; row++) {
      for (let col = 0; col < TILES; col++) {
        const tb = tileBbox(bbox, col, row);
        const url = wmsUrl(tb, TILE_PX, TILE_PX);
        console.log(`tile ${label} ${col},${row}`);
        const jpeg = await fetchJpeg(url);
        fs.writeFileSync(path.join(tileDir, `${col}_${row}.jpg`), jpeg);
      }
    }
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    stitchTiles(tileDir, outPath);
    console.log(`Wrote ${outPath} (${fs.statSync(outPath).size} bytes)`);
  } finally {
    fs.rmSync(tileDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--land")) {
    const texDir = path.resolve(__dirname, "../public/textures");
    for (const plate of STARBASE_LAND_PLATES) {
      const bbox = starbaseNeighborPlateWmsBboxDeg(plate.eastSteps, plate.northSteps);
      await fetchMosaic(bbox, path.join(texDir, plate.file), plate.id);
    }
    return;
  }
  await fetchMosaic(starbasePlateWmsBboxDeg(), OUT, "center");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
