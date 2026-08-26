/**
 * Fetch a north-up USDA NAIP JPEG for the nested Starbase pad plate.
 *
 * Usage: npx tsx scripts/fetch-starbase-naip.ts
 *
 * Source: USGS The National Map NAIP ImageServer (USDA NAIP, public domain /
 * CC0). Writes `public/textures/starbase_pad_naip.jpg` covering the km-square
 * in `STARBASE_PAD_PLATE_HALF_KM` (full rectangle — not a circular crop).
 *
 * Downloads a 3×3 mosaic at the service max (4000 px) so the 8 km plate keeps
 * ~0.7 m/px (native NAIP is 0.6 m) and the pad sits inside the center tile,
 * then JPEG-encodes an 8192² plate for WebGL.
 *
 * Texas 2024 NAIP county mosaics exist at TNRIS, but only as ~3 GB MrSID CCMs
 * with no ImageServer. This script uses the USGS mosaic (Cameron County is
 * 2022-06-10 until that service updates).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STARBASE_PAD_PLATE_HALF_KM,
  starbasePlateWmsBboxDeg,
} from "../src/scene/starbasePlate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../public/textures/starbase_pad_naip.jpg");

/** Tiles per side. Odd grid keeps Starbase inside the center tile. */
const TILES = 3;
/** USGS ImageServer maxImageWidth / maxImageHeight. */
const TILE_PX = 4000;
/** Nested pad plate — 8 km / 8192 ≈ 1 m/px, ~20× the 80 km Sentinel-2 plate. */
const OUT_PX = 8192;
const NAIP =
  "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage";

const CONCURRENCY = 3;
const TILE_ATTEMPTS = 4;

type Bbox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

function exportUrl(bbox: Bbox, width: number, height: number): string {
  const q = new URLSearchParams({
    bbox: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
    bboxSR: "4326",
    imageSR: "4326",
    size: `${width},${height}`,
    format: "jpg",
    f: "image",
  });
  return `${NAIP}?${q.toString()}`;
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

async function fetchJpeg(url: string): Promise<Buffer> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= TILE_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`NAIP HTTP ${res.status} ${res.statusText}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf[0] !== 0xff || buf[1] !== 0xd8) {
        throw new Error(`NAIP did not return JPEG: ${buf.subarray(0, 240).toString()}`);
      }
      return buf;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < TILE_ATTEMPTS) {
        const waitMs = 4000 * 2 ** (attempt - 1);
        console.warn(`retry ${attempt}/${TILE_ATTEMPTS} in ${waitMs} ms: ${lastErr.message}`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr ?? new Error("NAIP fetch failed");
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const pending = new Set<Promise<void>>();
  for (const item of items) {
    const p = fn(item).then(() => {
      pending.delete(p);
    });
    pending.add(p);
    if (pending.size >= limit) await Promise.race(pending);
  }
  await Promise.all(pending);
}

/** Pillow stitch + Lanczos downsample. Export row 0 is south; image row 0 is north. */
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
mosaic.save(${JSON.stringify(outPath)}, "JPEG", quality=88, optimize=True, subsampling=1)
print(mosaic.size[0], os.path.getsize(${JSON.stringify(outPath)}))
`;
  const r = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`Pillow stitch failed: ${r.stderr || r.stdout}`);
  }
  console.log(`stitched ${r.stdout.trim()}`);
}

async function main(): Promise<void> {
  const bbox = starbasePlateWmsBboxDeg(STARBASE_PAD_PLATE_HALF_KM);
  console.log(
    `Fetching NAIP ${TILES}×${TILES} @ ${TILE_PX}px  ±${STARBASE_PAD_PLATE_HALF_KM} km`,
  );
  console.log(
    `bbox lon ${bbox.minLon.toFixed(5)}…${bbox.maxLon.toFixed(5)}, ` +
      `lat ${bbox.minLat.toFixed(5)}…${bbox.maxLat.toFixed(5)}`,
  );
  const tileDir = fs.mkdtempSync(path.join(os.tmpdir(), "starbase-naip-"));
  const jobs: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < TILES; row++) {
    for (let col = 0; col < TILES; col++) jobs.push({ col, row });
  }
  try {
    await mapPool(jobs, CONCURRENCY, async ({ col, row }) => {
      const tb = tileBbox(bbox, col, row);
      const url = exportUrl(tb, TILE_PX, TILE_PX);
      console.log(`tile ${col},${row}`);
      const jpeg = await fetchJpeg(url);
      fs.writeFileSync(path.join(tileDir, `${col}_${row}.jpg`), jpeg);
    });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    stitchTiles(tileDir, OUT);
    console.log(`Wrote ${OUT} (${fs.statSync(OUT).size} bytes)`);
  } finally {
    fs.rmSync(tileDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
