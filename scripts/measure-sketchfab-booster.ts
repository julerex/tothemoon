/**
 * Compare the Sketchfab Super Heavy V3 look-reference to theater constants.
 *
 * Usage:
 *   npx tsx scripts/measure-sketchfab-booster.ts
 *   npx tsx scripts/measure-sketchfab-booster.ts path/to/scene.gltf
 *   npx tsx scripts/measure-sketchfab-booster.ts path/to/model.zip
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOOST_H,
  BOOST_RING_INNER,
  BOOST_RING_MID,
  BOOST_RING_OUTER,
  GRID_FIN_CHORD_M,
  GRID_FIN_FROM_TOP_M,
  GRID_FIN_SPAN_M,
  GRID_FIN_WIDTH_M,
  HOT_STAGE_H_M,
  R,
  SL_BELL_R,
  U,
} from "../src/scene/craft/dimensions.ts";
import {
  measureSketchfabBooster,
  type BoosterMeasures,
  type GltfDoc,
} from "../src/scene/craft/sketchfabBooster.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_GLTF = path.join(ROOT, "assets/sketchfab/scene.gltf");

function loadGltfJson(file: string): GltfDoc {
  if (file.endsWith(".zip")) {
    const out = spawnSync("unzip", ["-p", file, "scene.gltf"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (out.status !== 0) {
      throw new Error(out.stderr || `unzip failed: ${file}`);
    }
    return JSON.parse(out.stdout) as GltfDoc;
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as GltfDoc;
}

function row(label: string, sketch: number, theater: number): string {
  const d = sketch - theater;
  return `${label.padEnd(22)} ${sketch.toFixed(3).padStart(8)} ${theater.toFixed(3).padStart(8)} ${d.toFixed(3).padStart(8)}`;
}

function printReport(m: BoosterMeasures): void {
  const innerM = BOOST_RING_INNER / U;
  const midM = BOOST_RING_MID / U;
  const outerM = BOOST_RING_OUTER / U;
  const barrelM = R / U;
  const bellM = SL_BELL_R / U;
  const fromTop = m.gridFins.length
    ? m.gridFins.reduce((s, f) => s + f.fromTopM, 0) / m.gridFins.length
    : 0;
  const span = m.gridFins.length
    ? m.gridFins.reduce((s, f) => s + f.spanM, 0) / m.gridFins.length
    : 0;
  const width = m.gridFins.length
    ? m.gridFins.reduce((s, f) => s + f.widthM, 0) / m.gridFins.length
    : 0;
  const chord = m.gridFins.length
    ? m.gridFins.reduce((s, f) => s + f.chordM, 0) / m.gridFins.length
    : 0;
  console.log("Sketchfab Super Heavy V3 vs theater (meters, Y-up download)");
  console.log(`${"feature".padEnd(22)} ${"sketch".padStart(8)} ${"theater".padStart(8)} ${"Δ".padStart(8)}`);
  console.log(row("height", m.heightM, BOOST_H / U));
  console.log(row("barrel R", barrelM, barrelM));
  console.log(row("ring inner", m.raptorRings.inner.radiusM, innerM));
  console.log(row("ring mid", m.raptorRings.mid.radiusM, midM));
  console.log(row("ring outer", m.raptorRings.outer.radiusM, outerM));
  console.log(row("outer + bell", m.raptorRings.outer.radiusM + bellM, outerM + bellM));
  console.log(row("grid-fin from top", fromTop, GRID_FIN_FROM_TOP_M));
  console.log(row("grid-fin span", span, GRID_FIN_SPAN_M));
  console.log(row("grid-fin width", width, GRID_FIN_WIDTH_M));
  console.log(row("grid-fin chord", chord, GRID_FIN_CHORD_M));
  console.log(
    `raptors ${m.raptorRings.inner.count}/${m.raptorRings.mid.count}/${m.raptorRings.outer.count}  fins ${m.gridFins.length}  hot-stage ${HOT_STAGE_H_M} m`,
  );
}

const file = path.resolve(process.argv[2] ?? DEFAULT_GLTF);
if (!fs.existsSync(file)) {
  console.error(`missing ${file}`);
  process.exit(1);
}
printReport(measureSketchfabBooster(loadGltfJson(file)));
