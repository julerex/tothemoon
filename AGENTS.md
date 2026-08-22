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
- Official Starship Flight 13 page recap and **fullscreen X-replay screenshot SOP** (skip the broken spacex.com embed; use the direct broadcast URL): [`docs/STARSHIP_13.md`](docs/STARSHIP_13.md). Landing/splash **highlight clips** for later visual refinement: https://x.com/SpaceX/status/2082186658162626898 (same file).
- **Browser theater debug (Chrome DevTools MCP / CDP):** [`docs/AGENT_BROWSER.md`](docs/AGENT_BROWSER.md). After a mission boots, `window.__theater.snapshot()` / `.seek()` / `.setCamera()` / `.getCamera()` / `.setCameraPose()` is the handle — do not scrape the HUD first. Force a **document load** when switching missions (`?agent=<nonce>` on the URL); a hash-only change will not reboot a live theater. CLI: `scripts/theater-devtools.sh`. Evaluate snippets: `src/debug/cdpCommands.ts`.
- **Gotchas found while verifying visuals in the live theater:**
  - `#theater-loading` covers the canvas until Earth / Moon / star / pad JPEGs finish. `__theater.ready` stays false until that overlay hides — wait for it before screenshots.
  - Mesh, material, and scene-graph edits need a **full document load** (`?agent=<nonce>`). Vite HMR and `seek()` reuse the already-built craft; a hash-only change will not rebuild it.
  - `setCamera()` / `frameCamera()` **turn Auto-cam off**. `setCamera("gridfin")` is the grid-fin mount, not booster-hull-cam. `setCamera("aerial")` is the pad flying drone (T− hold wide). `setCamera("drone")` is the sea-level recovery drone (post-splash orbit of the floating ship), not Ship chase. Webcast mounts (`boosterHull`, `engines`, `flap`) are applied by Auto-cam at shot times — press **G** to re-enable Auto-cam, then `seek()` to the shot (e.g. Flight 13 T+4:16 for booster hull; T+1:05:26 for the drone).
  - `seek()` writes the hash and can **destroy the CDP execution context**. After a seek that navigates, wait for `__theater.ready` again (`EVAL_WAIT_READY` / `afterFrame()`). A `?t=` URL **pauses**.
  - Hide the HUD with **H** (`#hud.hud-hidden`) before visual screenshots. T+0 pad is washed out by deluge steam — use T− hold for pad/tower, T+4:16 Auto-cam for booster hull, T+1:02:19 fin-cam for ship flaps.
- WebGL gotcha for manual/browser testing: the 3D theater needs a WebGL context, which the cloud VM lacks a GPU for. Modern Chrome (v140+) gates software rendering, so you must launch Chrome with `--enable-unsafe-swiftshader` (together with `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`) or the canvas stays black with a `THREE.WebGLRenderer: A WebGL context could not be created` error. The UI, routing, and `window.__theater` still work — only the 3D render fails. The Flight 13 X webcast does not need those flags.
- `npm run build`/`npm run precompute` regenerate the committed `src/data/*trajectory.json` packs; they usually produce a tiny diff (metadata) — revert those files unless a trajectory/physics change intentionally updates them.
