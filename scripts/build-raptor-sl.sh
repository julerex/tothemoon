#!/usr/bin/env bash
# Rebuild public/models/raptor-sl.glb from the Sketchfab Super Heavy zip.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="${1:-$HOME/Downloads/spacex_starship_superheavy_v3.zip}"
RAW="/tmp/raptor-sl-raw.glb"
OUT="$ROOT/public/models/raptor-sl.glb"
python3 "$ROOT/scripts/extract-sketchfab-raptor.py" "$ZIP" "$RAW"
npx --yes @gltf-transform/cli weld "$RAW" /tmp/raptor-sl-weld.glb
npx --yes @gltf-transform/cli simplify /tmp/raptor-sl-weld.glb /tmp/raptor-sl-simp.glb --ratio 0.018 --error 1
npx --yes @gltf-transform/cli resize /tmp/raptor-sl-simp.glb /tmp/raptor-sl-resz.glb --width 1024 --height 1024
npx --yes @gltf-transform/cli jpeg /tmp/raptor-sl-resz.glb /tmp/raptor-sl-jpeg.glb --formats png --quality 78 --slots "{baseColorTexture,emissiveTexture,metallicRoughnessTexture}"
npx --yes @gltf-transform/cli tangents /tmp/raptor-sl-jpeg.glb /tmp/raptor-sl-tan.glb
npx --yes @gltf-transform/cli prune /tmp/raptor-sl-tan.glb "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
