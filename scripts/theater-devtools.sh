#!/usr/bin/env bash
# Drive the mission theater through chrome-devtools CLI (Chrome DevTools Protocol).
# Requires: npm run dev, chrome-devtools on PATH (or CHROME_DEVTOOLS set).
# Usage: scripts/theater-devtools.sh <command> [args]
set -euo pipefail

BASE="${THEATER_BASE:-http://localhost:5173/tothemoon}"
CLI="${CHROME_DEVTOOLS:-chrome-devtools}"

usage() {
  cat <<'EOF'
Usage: scripts/theater-devtools.sh <command> [args]

Commands:
  open [flight-13|to-the-moon] [t]   Full-document navigate (nonce query)
  wait                               Poll window.__theater.ready
  snapshot                           JSON clock / camera / WebGL / HUD
  seek <t>                           Physics seek (1:05:21, T+…, seconds)
  play | pause | toggle
  speed <n>                          Playback rate
  camera <mode>                      sun moon earth starbase trench gridfin chase fin hull free
  frame <mode>                       Same + frame-to-subject
  webgl                              WebGL probe only
  hud                                DOM scrape (works before the hook)
  screenshot [path]                  PNG of the current page
  errors                             Console errors since last navigation
  pages                              list_pages

Env: THEATER_BASE  CHROME_DEVTOOLS
EOF
}

need_cli() {
  if ! command -v "$CLI" >/dev/null 2>&1; then
    echo "error: $CLI not on PATH. Use chrome-devtools MCP evaluate_script instead." >&2
    echo "See docs/AGENT_BROWSER.md" >&2
    exit 1
  fi
}

json_str() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"
}

eval_fn() {
  need_cli
  "$CLI" evaluate_script "$1" --output-format=json
}

mission_url() {
  local mission="${1:-flight-13}"
  local t="${2:-}"
  local nonce
  nonce="agent=$(date +%s)"
  if [[ -n "$t" ]]; then
    printf '%s/?%s#/mission/%s?t=%s' "$BASE" "$nonce" "$mission" "$t"
  else
    printf '%s/?%s#/mission/%s' "$BASE" "$nonce" "$mission"
  fi
}

cmd="${1:-}"
shift || true

case "$cmd" in
  ""|-h|--help|help) usage ;;
  open)
    need_cli
    "$CLI" navigate_page --url "$(mission_url "${1:-flight-13}" "${2:-}")"
    ;;
  wait)
    eval_fn 'async () => {
      for (let i = 0; i < 40; i++) {
        const api = window.__theater;
        if (api?.ready) return api.snapshot();
        await new Promise((r) => setTimeout(r, 250));
      }
      return { ready: false, timedOut: true, hash: location.hash, href: location.href };
    }'
    ;;
  snapshot)
    eval_fn '() => window.__theater?.snapshot() ?? { ready: false, hash: location.hash, href: location.href }'
    ;;
  seek)
    [[ -n "${1:-}" ]] || { echo "usage: seek <t>" >&2; exit 2; }
    eval_fn "async () => {
      const api = window.__theater;
      if (!api?.ready) return { ready: false, error: \"theater not started\" };
      api.seek($(json_str "$1"));
      return api.afterFrame();
    }"
    ;;
  play) eval_fn '() => window.__theater?.play() ?? { ready: false }' ;;
  pause) eval_fn '() => window.__theater?.pause() ?? { ready: false }' ;;
  toggle) eval_fn '() => window.__theater?.toggle() ?? { ready: false }' ;;
  speed)
    [[ -n "${1:-}" ]] || { echo "usage: speed <n>" >&2; exit 2; }
    eval_fn "() => window.__theater?.setSpeed(Number(${1})) ?? { ready: false }"
    ;;
  camera)
    [[ -n "${1:-}" ]] || { echo "usage: camera <mode>" >&2; exit 2; }
    eval_fn "() => window.__theater?.setCamera($(json_str "$1")) ?? { ready: false }"
    ;;
  frame)
    [[ -n "${1:-}" ]] || { echo "usage: frame <mode>" >&2; exit 2; }
    eval_fn "() => window.__theater?.frameCamera($(json_str "$1")) ?? { ready: false }"
    ;;
  webgl)
    eval_fn '() => window.__theater?.snapshot().webgl ?? { ok: false, lost: true }'
    ;;
  hud)
    eval_fn '() => ({
      clock: document.getElementById("mission-clock-value")?.textContent ?? null,
      phase: document.getElementById("phase")?.textContent ?? null,
      cam: document.getElementById("tel-cam-mode")?.textContent ?? null,
      altitude: document.getElementById("tel-altitude")?.textContent ?? null,
      speed: document.getElementById("tel-speed")?.textContent ?? null,
      autoCam: document.getElementById("tel-auto-cam")?.textContent ?? null,
      hash: location.hash,
      title: document.title,
    })'
    ;;
  screenshot)
    need_cli
    if [[ -n "${1:-}" ]]; then
      "$CLI" take_screenshot --filePath "$1"
    else
      "$CLI" take_screenshot
    fi
    ;;
  errors)
    need_cli
    "$CLI" list_console_messages --types error --output-format=json
    ;;
  pages)
    need_cli
    "$CLI" list_pages --output-format=json
    ;;
  *)
    echo "unknown command: $cmd" >&2
    usage >&2
    exit 2
    ;;
esac
