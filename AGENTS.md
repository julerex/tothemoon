# AGENTS

Instructions for LLM agents working in this repository.

## Git: commit and push when finished

**Always commit and push when you finish a unit of work** — after implementing a feature, fix, or other requested change that leaves a meaningful git diff. Do not leave completed work uncommitted unless the user explicitly says not to commit, or the change is only exploratory/scratch.

When committing and pushing:

1. Follow the usual safety rules: never update git config; never force-push to `main`/`master`; never skip hooks; never push secrets.
2. Use a clear commit message (why the change exists, complete sentences).
3. Prefer a single logical commit per finished task; push to the current branch’s remote (`origin HEAD` is fine when tracking is set).
4. If the working tree is clean (nothing to commit), say so briefly and do not create an empty commit.
5. After push, mention the commit hash (and that it was pushed) in the final reply.

## Project notes

- Interactive Three.js mission theater: Starbase → low Earth orbit → translunar injection → lunar landing.
- Trajectory is baked at build time (`npm run precompute` / `npm run build`).
- Scene unit = 1 km. Prefer small, focused diffs over drive-by refactors.
- Hygiene: `npm run typecheck`, `npm run lint` (ESLint), `npm test` (or `npm run ci` for all three).
- Prefer JSDoc on exported pure helpers and module headers; extend unit tests when changing physics or timeline contracts.

## Cursor Cloud specific instructions

- Single frontend service; no backend/database/external services. Standard commands live in `package.json` and `README.md` (`npm run dev`, `npm run ci`, `npm run build`, etc.). Node 22 is available and matches the toolchain.
- The dev server runs at `http://localhost:5173/tothemoon/` — the `/tothemoon/` base path is required; the bare root `http://localhost:5173/` will not load the app.
- WebGL gotcha for manual/browser testing: the 3D theater needs a WebGL context, which the cloud VM lacks a GPU for. Modern Chrome (v140+) gates software rendering, so you must launch Chrome with `--enable-unsafe-swiftshader` (together with `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`) or the canvas stays black with a `THREE.WebGLRenderer: A WebGL context could not be created` error. The UI, routing, and trajectory data load fine without it — only the 3D render fails.
- `npm run build`/`npm run precompute` regenerate the committed `src/data/*trajectory.json` packs; they usually produce a tiny diff (metadata) — revert those files unless a trajectory/physics change intentionally updates them.
