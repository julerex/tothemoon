# AGENTS

Instructions for LLM agents working in this repository.

## Git: commit and push to main (no pull requests)

**Always commit and push directly to `main` when you finish a unit of work** — after implementing a feature, fix, or other requested change that leaves a meaningful git diff. Do not leave completed work uncommitted unless the user explicitly says not to commit, or the change is only exploratory/scratch.

**Do not open a pull request.** Do not create a feature branch, draft PR, or review request unless the user explicitly asks for one. Land the change on `main` and push it.

When committing and pushing:

1. Work on `main`. If you are on another branch, check out `main` and bring it up to date before committing.
2. Follow the usual safety rules: never update git config; never force-push; never skip hooks; never push secrets.
3. Use a clear commit message (why the change exists, complete sentences).
4. Prefer a single logical commit per finished task; push to `origin main` (`git push origin HEAD:main` or `git push origin main`).
5. If the working tree is clean (nothing to commit), say so briefly and do not create an empty commit.
6. After push, mention the commit hash (and that it was pushed to `main`) in the final reply. Do not open or update a pull request.

## Project notes

- Interactive Three.js mission theater: Starbase → low Earth orbit → translunar injection → lunar landing.
- Trajectory is baked at build time (`npm run precompute` / `npm run build`).
- Scene unit = 1 km. Prefer small, focused diffs over drive-by refactors. Keep non-test `src/` files under ~400 LOC; extract along domain seams into prefixed siblings or subdirs and leave the old path as a re-export facade (see P3.16 in `docs/NEXT.md`).
- Hygiene: `npm run typecheck`, `npm run lint` (ESLint), `npm test` (or `npm run ci` for all three).
- Prefer JSDoc on exported pure helpers and module headers; extend unit tests when changing physics or timeline contracts.
- **Do not verify in the browser unless the user asks.** Tests and typecheck are the default. When they do ask, follow [`docs/AGENT_BROWSER.md`](docs/AGENT_BROWSER.md).

## Cursor Cloud specific instructions

- Single frontend service; no backend/database/external services. Standard commands live in `package.json` and `README.md` (`npm run dev`, `npm run ci`, `npm run build`, etc.). Node 22 is available and matches the toolchain.
- The dev server runs at `http://localhost:5173/tothemoon/` — the `/tothemoon/` base path is required; the bare root `http://localhost:5173/` will not load the app.
- Starship / Super Heavy / Raptor and the Starbase pads (OLP-1 vs OLP-2, Mechazilla, production site): [`docs/STARSHIP.md`](docs/STARSHIP.md).
- Official Starship Flight 13 page recap and **fullscreen X-replay screenshot SOP** (skip the broken spacex.com embed; use the direct broadcast URL): [`docs/STARSHIP_13.md`](docs/STARSHIP_13.md). Landing/splash **highlight clips** for later visual refinement: https://x.com/SpaceX/status/2082186658162626898 (same file).
- Super Heavy V3 **look-reference**: Ijsz23 Sketchfab mesh, CC BY 4.0 — [`assets/sketchfab/`](assets/sketchfab/), credit in `docs/STARSHIP.md`. `npm run measure-sketchfab` walks named nodes in `scene.gltf`. Do **not** load `scene.bin` (gitignored, render-only, 3.8M tris). Runtime bells are **procedural** (`makeBell`, `RAPTOR_BELL_RADIAL_SEGMENTS` ≥ 48) — a lathe stays round; CAD triangles on a cone do not. Sketchfab’s two primitives per Raptor are a 65 532-vert split of the **whole** engine, not bell vs powerhead. Booster-only download — it does not inform ship flaps / TPS.
- **Sketchfab / procedural-booster gotchas:**
  - Named nodes: `RAPTOR inner|middle|outer` (3 / 10 / 20) and `Gridfin Y+|Y-|Z-`.
  - Root is **not** booster-local. `Superheavy v3_36` is translated **(0, 50, 20)** after Sketchfab’s axis conversion; world-space `hypot(x,z)` reads **~20 m for every ring**. `measureSketchfabBooster` inverts that world matrix. Do not write a one-off walker that skips the invert.
  - Do **not** copy download meters onto `dimensions.ts`. Outer ring **4.24 m** + 0.65 m bell hangs outside the 9 m barrel. Flight 13 T+5:50 (`assets/flight13-webcast/tplus-000550-split-gridfin-engines.jpg`): outer lips on the skirt → `BOOST_RING_OUTER` **3.85 m** (`BOOST_RING_OUTER + SL_BELL_R < R * 1.02`).
  - `GRID_FIN_FROM_TOP_M` is **meters**. `BOOST_H - 0.48` was 19.2 m down the barrel (mesh-unit mixup). Use `gridFinZ()`. Keep `GRID_FIN_AZIMUTHS[0] === π/2` so gridfin-cam does not jump. Keep `GRID_FIN_CHORD_M` ~0.9 (factory diamond lattice); Sketchfab’s 0.33 m chord is a sheet.
  - Eyeball: Flight 13 T− hold, `setCamera("engines")` / `"gridfin"`, HUD off (**H**). Webcast stills in `assets/flight13-webcast/` beat the CAD-like download when they disagree.
- **Browser theater debug (Chrome DevTools MCP / CDP):** [`docs/AGENT_BROWSER.md`](docs/AGENT_BROWSER.md). After a mission boots, `window.__theater.snapshot()` / `.seek()` / `.setCamera()` / `.getCamera()` / `.setCameraPose()` is the handle — do not scrape the HUD first. Force a **document load** when switching missions (`?agent=<nonce>` on the URL); a hash-only change will not reboot a live theater. CLI: `scripts/theater-devtools.sh`. Evaluate snippets: `src/debug/cdpCommands.ts`.
- **Gotchas found while verifying visuals in the live theater:**
  - `#theater-loading` covers the canvas until Earth / Moon / star / pad JPEGs finish. `__theater.ready` stays false until that overlay hides — wait for it before screenshots.
  - Mesh, material, and scene-graph edits need a **full document load** (`?agent=<nonce>`). Vite HMR and `seek()` reuse the already-built craft; a hash-only change will not rebuild it.
  - `setCamera()` / `frameCamera()` **turn Auto-cam off**. **Free** cameras (sun, earth, moon, booster, tower, chase) allow WASD / mouse; **Fixed** livestream mounts (aerial, ground1, tower1cam, tower2cam, starbase, trench, hull, engines, gridfin, fin, drone) reject movement (`frameCamera` is a no-op there). `setCamera("gridfin")` is the grid-fin mount, not booster-hull-cam. `setCamera("booster")` looks at Super Heavy from outside. `setCamera("tower")` looks at Mechazilla (WASD along the ground). `setCamera("tower1cam")` is Tower One Cam (OLP-1 peak looking at the stack). `setCamera("tower2cam")` is Tower Two Cam (OLP-2 peak looking at the stack). `setCamera("chase")` is Starship. `setCamera("aerial")` is the pad flying drone (T− hold wide). `setCamera("ground1")` is Ground Camera One (T−2 full stack and tower). `setCamera("drone")` is the sea-level recovery drone (post-splash orbit of the floating ship), not Ship chase. Webcast mounts (`boosterHull`, `engines`, `flap`) are applied by Auto-cam at shot times — press **G** to re-enable Auto-cam, then `seek()` to the shot (e.g. Flight 13 T+4:53 for booster hull; T+1:05:26 for the drone).
  - `seek()` writes the hash and can **destroy the CDP execution context**. After a seek that navigates, wait for `__theater.ready` again (`EVAL_WAIT_READY` / `afterFrame()`). A `?t=` URL **pauses**.
  - Hide the HUD with **H** (`#hud.hud-hidden`) before visual screenshots. T+0 pad is washed out by deluge steam — use T− hold for pad/tower, T+4:53 Auto-cam for booster hull, T+1:02:19 fin-cam for ship flaps.
  - **Flight 13 splash:** there is no splash aim point. The corridor is the Starbase–Gauteng great circle; the ship meets the water where that plane and the force model put it. Do not reintroduce a 19°S 107°E buoy (that was a Flight 11 analog). Seat the hull with `splashSeatRadiusAlong(earthSurfaceRadiusAlong(ship ray), t, wave)`. A radius taken at another latitude is hundreds of meters off — WGS84 changes ~270 m per degree here — and the hull hangs above the sea. `wave` is `oceanSwellHeightKm(0, 0, t) + oceanChopHeightKm(0, 0, t)` once `seatSea` has followed the craft. `SPLASH_WATERLINE_ALT_KM` (0.0014 km) is the chop mesh's local Y; keep them the same. The splash site has sea and spray only — no beacon, ring, or label (a 10 km pillar fills the recovery drone). HUD "Range" is distance to the flown splash sample. HUD altitude stays the trajectory sample (~0.05 km). Check: `?t=1:08:00`, `setCamera("drone")`, HUD off; the hull bottom should meet blue water. A free camera dropped under the plate looks into a black void (the 50 m shell sits above the globe) — that is not a missing ship.
- WebGL gotcha for manual/browser testing: the 3D theater needs a WebGL context, which the cloud VM lacks a GPU for. Modern Chrome (v140+) gates software rendering, so you must launch Chrome with `--enable-unsafe-swiftshader` (together with `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`) or the canvas stays black with a `THREE.WebGLRenderer: A WebGL context could not be created` error. The UI, routing, and `window.__theater` still work — only the 3D render fails. The Flight 13 X webcast does not need those flags.
- `npm run build`/`npm run precompute` regenerate the committed `src/data/*trajectory.json` packs; they usually produce a tiny diff (metadata) — revert those files unless a trajectory/physics change intentionally updates them.
