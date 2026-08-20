# Agent browser SOP — theater debug

How an LLM agent should drive and debug the 3D mission theater in Chrome.
Read this before clicking around the HUD.

Live functions live on **`window.__theater`** (`src/debug/theaterBridge.ts`).
Copy-paste evaluate strings live in `src/debug/cdpCommands.ts`.
A CLI wrapper is `scripts/theater-devtools.sh`.

## Boot

```bash
npm run dev
# http://localhost:5173/tothemoon/   ← /tothemoon/ is required
```

The 3D canvas needs a WebGL context. Cloud VMs have no GPU. Launch Chrome with
software rendering or the canvas stays black (`THREE.WebGLRenderer: A WebGL
context could not be created`):

```bash
google-chrome \
  --enable-unsafe-swiftshader \
  --use-gl=angle \
  --use-angle=swiftshader \
  --ignore-gpu-blocklist \
  --remote-debugging-port=9222
```

chrome-devtools MCP starts its own Chrome. If screenshots are black, add those
flags to the MCP server `args`. HUD, hash routing, and `__theater` still work
without WebGL — only the canvas fails.

**Do not** open `http://localhost:5173/` (no base path). **Do not** switch
missions by only changing the hash: a live theater ignores a different
`#/mission/…` and will not reboot. Force a document load with a search bump
(`?agent=<nonce>`), or go `#/missions` first (that reloads).

## First actions (chrome-devtools MCP)

1. `list_pages`
2. `navigate_page` to a **full-document** mission URL (see below)
3. `evaluate_script` `EVAL_WAIT_READY` until `ready: true` (pack load ~1–3 s)
4. `evaluate_script` `snapshot()` — do **not** treat one screenshot as proof
5. `take_screenshot` only after `webgl.ok === true` (or accept a black canvas)
6. `list_console_messages` with `types: ["error"]` if the canvas is black

`evaluate_script` takes a **function declaration string**, not an expression.

## URLs

| Goal | URL |
|------|-----|
| Main menu | `http://localhost:5173/tothemoon/#/` |
| Mission menu | `http://localhost:5173/tothemoon/#/missions` |
| Flight 13 splash | `http://localhost:5173/tothemoon/?agent=1#/mission/flight-13?t=1:05:21` |
| Flight 13 T− hold | `http://localhost:5173/tothemoon/?agent=1#/mission/flight-13?t=-0:02:00` |
| Lunar T+50 h | `http://localhost:5173/tothemoon/?agent=1#/mission/to-the-moon?t=T+50:00:00` |

`t=` accepts `T+`/`T−` clocks, `H:MM:SS`, `M:SS`, raw seconds, `1h5m21s`.
A seek URL **pauses**. Flight 13 without `t=` auto-plays from T−00:02:00.

`theaterUrl("flight-13", "1:05:21")` in `src/debug/cdpCommands.ts` builds a
nonce URL so the load is never a same-document hash change.

## `window.__theater`

| Call | What it does |
|------|----------------|
| `snapshot()` | Clock, physics T, camera, WebGL, HUD scrape, craft pose |
| `seek("1:05:21")` | Physics time (same parser as `?t=`); updates the hash |
| `play()` / `pause()` / `toggle()` | Transport |
| `setSpeed(50)` | Playback rate (mission-duration multiples) |
| `setCamera("hull")` | Rail mode; turns Auto-cam off |
| `frameCamera("chase")` | Same + frame-to-subject |
| `getCamera()` | World pose: `position`, OrbitControls `target`, unit `look`, `up`, `fov`, `distance` (km) |
| `setCameraPose({ position, target, look, up, fov })` | Seat that pose; Auto-cam off, mode `free`. Omitted fields keep the current value. `[x,y,z]` or `{x,y,z}` |
| `afterFrame()` | Promise: two rAFs so `applyState` has run |

On the menu, `ready` is `false` and mutators return `{ error: "theater not started" }`.

Camera modes: `sun` `moon` `earth` `starbase` `trench` `gridfin` `chase` `fin` `hull` `drone` `free`.

`setCamera("drone")` is the Flight 13 sea-level recovery drone (post-splash orbit of the floating ship). Auto-cam also cuts to it at T+1:05:26.

`craft.speed` is inertial (heliocentric). HUD speed is Earth-relative — they
will not match. Prefer `hud.phase` / `clock` / `phaseId` for “are we at splash?”.

## MCP `evaluate_script` (paste as `function`)

```js
() => window.__theater?.snapshot() ?? { ready: false, hash: location.hash, href: location.href }
```

```js
async () => {
  for (let i = 0; i < 40; i++) {
    const api = window.__theater;
    if (api?.ready) return api.snapshot();
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ready: false, timedOut: true, hash: location.hash, href: location.href };
}
```

```js
async () => {
  const api = window.__theater;
  if (!api?.ready) return { ready: false, error: "theater not started" };
  api.seek("1:05:21");
  return api.afterFrame();
}
```

```js
() => window.__theater?.getCamera() ?? { ready: false, cam: null }
```

```js
() => window.__theater?.setCamera("hull") ?? { ready: false }
```

```js
() => window.__theater?.setCameraPose({
  position: [1, 2, 3],
  target: [0, 0, 0],
  fov: 50,
}) ?? { ready: false }
```

```js
() => window.__theater?.setSpeed(50) ?? { ready: false }
```

```js
() => window.__theater?.play() ?? { ready: false }
```

HUD fallback if the hook is missing (old build):

```js
() => ({
  clock: document.getElementById("mission-clock-value")?.textContent ?? null,
  phase: document.getElementById("phase")?.textContent ?? null,
  cam: document.getElementById("tel-cam-mode")?.textContent ?? null,
  altitude: document.getElementById("tel-altitude")?.textContent ?? null,
  speed: document.getElementById("tel-speed")?.textContent ?? null,
  autoCam: document.getElementById("tel-auto-cam")?.textContent ?? null,
  hash: location.hash,
  title: document.title,
})
```

Keys via `press_key` (match the HUD keymap, not the old backtick):

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `-` / `=` | Cycle cameras |
| `1`…`6` | Bookmarks |
| `g` | Auto-cam |
| `m` | Metrics |
| `h` | Hide HUD |
| `k` | KeyMap |
| `Tab` | Cycle dashboards |

Event ticks on the scrubber have accessible names like
`Jump to Splashdown at 1h 05m`. Prefer `__theater.seek` over clicking ticks.

## Raw Chrome DevTools Protocol

Connect: `GET http://127.0.0.1:9222/json/list` then WebSocket `webSocketDebuggerUrl`.

```json
{ "id": 1, "method": "Page.navigate",
  "params": { "url": "http://localhost:5173/tothemoon/?agent=1#/mission/flight-13?t=1:05:21" } }
```

```json
{ "id": 2, "method": "Runtime.evaluate",
  "params": {
    "expression": "window.__theater.snapshot()",
    "returnByValue": true,
    "awaitPromise": false
  } }
```

```json
{ "id": 3, "method": "Runtime.evaluate",
  "params": {
    "expression": "(async () => { window.__theater.seek('1:05:21'); return window.__theater.afterFrame(); })()",
    "returnByValue": true,
    "awaitPromise": true
  } }
```

```json
{ "id": 4, "method": "Runtime.evaluate",
  "params": {
    "expression": "window.__theater.getCamera()",
    "returnByValue": true
  } }
```

```json
{ "id": 5, "method": "Runtime.evaluate",
  "params": {
    "expression": "window.__theater.setCameraPose({ position: [1,2,3], target: [0,0,0] })",
    "returnByValue": true
  } }
```

```json
{ "id": 6, "method": "Page.captureScreenshot",
  "params": { "format": "png" } }
```

```json
{ "id": 7, "method": "Input.dispatchKeyEvent",
  "params": { "type": "keyDown", "key": " ", "code": "Space" } }
```

```json
{ "id": 8, "method": "Input.dispatchKeyEvent",
  "params": { "type": "keyUp", "key": " ", "code": "Space" } }
```

```json
{ "id": 9, "method": "Runtime.evaluate",
  "params": {
    "expression": "document.querySelector('canvas#c') && ({ w: document.getElementById('c').width, h: document.getElementById('c').height })",
    "returnByValue": true
  } }
```

`Page.captureScreenshot` of a lost WebGL context is a black rectangle — check
`snapshot().webgl` first (`ok`, `vendor`, `renderer`, `width`/`height`).
SwiftShader usually reports a Google/SwiftShader renderer string. The menu
stub does **not** call `canvas.getContext` (that would steal the context
before Three.js mounts); `webgl.ok` is only meaningful after `ready: true`.

## chrome-devtools CLI

```bash
# from repo root; requires chrome-devtools on PATH
scripts/theater-devtools.sh open flight-13 1:05:21
scripts/theater-devtools.sh wait
scripts/theater-devtools.sh snapshot
scripts/theater-devtools.sh seek 0:02:21
scripts/theater-devtools.sh camera hull
scripts/theater-devtools.sh cam
scripts/theater-devtools.sh pose '{"position":[1,2,3],"target":[0,0,0]}'
scripts/theater-devtools.sh play
scripts/theater-devtools.sh screenshot /tmp/theater.png
scripts/theater-devtools.sh webgl
scripts/theater-devtools.sh errors
```

## Recipes

**Confirm a seek landed.** `snapshot().clock` and `hud.clock` should match
(e.g. `T+01:05:21`). `phaseId` for Flight 13 splash is `splashdown`; HUD phase
is `Splashdown · Indian Ocean`. Wait `afterFrame()` after `seek`.

**Black canvas.** `list_console_messages` for `WebGL context could not be
created`. `webgl.ok === false` or `width === 0`. Relaunch Chrome with the
SwiftShader flags. UI/routing still testable.

**Wrong mission after a hash change.** You reused the document. Navigate to a
URL with a new `?agent=` query (or `#/missions`, then the mission).

**Clock does not move.** Seek URLs pause. Call `play()` or press Space.

**Auto-cam fights a camera pick.** `setCamera` / `frameCamera` / `setCameraPose`
disable Auto-cam. `g` toggles it back on. `setCameraPose` also switches to
`free` so subject tracking does not overwrite the seated pose.

**Inspect / move the camera.** `getCamera()` (or `snapshot().cam`) is the live
eye, look-at target, unit look, up, and vertical FOV. `setCameraPose` accepts
any subset; `look` alone slides the target along that ray at the current
distance. `target` wins if both `target` and `look` are set.

**In-theater `t=` edit.** Changing only `?t=` on the same mission seeks via
`applyTheaterSeek` (no reload). Changing the mission path does **not**.

## HUD ids (fallback)

`#c` canvas · `#hud` root · `#mission-clock-value` · `#phase` · `#tel-cam-mode`
· `#tel-altitude` · `#tel-speed` · `#tel-auto-cam` · `#scrub` (0–1000) ·
`#btn-play` · `#btn-auto-cam` · `#date` · `#date-texas`
