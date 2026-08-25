# tothemoon

Interactive **Three.js** mission theaters. Open the site to a **main menu**, then **Mission Menu** to pick a flight:

| Mission | Status |
|---------|--------|
| **Starbase → Moon** | Full theater (ascent → low Earth orbit → translunar coast → ballistic lunar flyby) |
| **Starship Flight 13** | Full theater (staged ascent → suborbital coast → entry → Indian Ocean splashdown → sea-level drone hold through T+1:10); craft trail is **Earth-fixed** (co-rotates / revolves with the globe) |

**Live:** [https://julerex.github.io/tothemoon/](https://julerex.github.io/tothemoon/)

Deep links: `#/` main · `#/missions` Mission Menu · `#/glossary` Glossary · `#/mission/to-the-moon` · `#/mission/flight-13`

**Time-seek URLs** (every mission): append `?t=` on the hash to open at that mission clock. Liftoff is `t=0`. Examples: `#/mission/flight-13?t=1:05:21` (official splash), `#/mission/flight-13?t=-0:05:00` (T− hold), `#/mission/to-the-moon?t=T+50:00:00`. Accepts `T+`/`T−` clocks, `H:MM:SS`, `M:SS`, raw seconds, and `1h5m21s`. The address bar stays in sync as you scrub or play so you can copy a shareable URL.

## Physics

- **True scale** — scene unit = 1 km; real Earth/Moon radii and ~384 400 km semi-major axis
- **Restricted n-body + Earth J₂** — craft integrated with **RK4** under **Earth + Moon** point-mass gravity, **solar tide** (residual about Earth), Earth **J₂** (WGS84 equatorial radius), and a **US76-ish piecewise atmosphere / quadratic drag** below ~150 km geodetic height. Flight 13 entry Cd·A/m and L/D vary with altitude (theater-bounded). Pad, splash, and low-altitude floors sit on the **WGS84 ellipsoid** (same figure as the visual globe). Coast steps tighten near the Moon (0.5 s inside 8_000 km); the pack stores a step-doubling |Δr| / Moon-relative energy residual.
- **Staged ascent (A5)** — booster throttle schedule (Maximum dynamic pressure dip + main engine cutoff ramp), **hot-stage** (booster throttle-down → ship ignition → separation), then an **integrated ship circularize** on RK4 (no residual path blend / Δv cap). Not flight-ops tables
- **Translunar coast → capture** — after a **hot super-Hohmann translunar injection** the craft coasts **ballistically** under restricted n-body gravity. Transfer search aims a **design perilune + south-pole B-plane** (not closest-approach-anywhere). LOI is a finite burn; if it does not bind, the pack is a **flyby** (no polar LLO teleport). Bound capture then coasts **low lunar orbit** (~¾ rev), **powered descent**, and a **sub-km surface floor** at the landing radial (no great-circle taxi). A low-opacity **Kepler 2-body corridor** (dashed amber + sparse whiskers, toggle **O**) shows how the n-body path diverges from the inject osculating ellipse; max |Δr| is in metrics (**M**)
- Heliocentric theater (Sun ≈ origin): **JPL Horizons DE441** samples for Earth/Moon over the July 2027 lunar window (`npm run horizons`); Flight 13 launch-window table is packed (`horizons:flight13`) while the F13 bake stays analytic so the pad frame matches. Analytic circular Earth + Keplerian Moon (mean Ω̇ / ω̇) as fallback.
- Mission: **Starbase pad** → staged ascent → **integrated** low Earth orbit dogleg (out-of-plane thrust on RK4, paid ship Δv) → finite translunar injection (no end-of-burn velocity snap) → **n-body coast** → **LOI** → **LLO** → **powered descent** → land
- **Mass-coupled thrust** — peak engine force F, acceleration a = F/m(t), pure rocket-equation ṁ (Isp) through translunar injection; empty tanks cut engines
- **Super Heavy recovery** — detached booster is RK4-integrated on Earth μ + J₂ + drag after stage-out (boostback + landing burn booked on leftover prop). Landing burn starts ~5 km AGL at the public T+ mark. Lunar chopsticks seats on the tower; Flight 13 gulf is a hard splash after a partial relight
- Trajectory is **baked at build time** into `src/data/trajectory.json` (instant load; no RK4 on the main thread). Pack **v2** also stores `minMoonAlt`, peak inertial speed, and stage-out time so the complete card never re-scans samples at load

The craft mesh is a near-true-size Super Heavy + Starship stack (tens of meters): ring welds, denser heat-shield tiles, Raptor field, multi-layer additive plumes that change by regime (**pink–magenta** in atmosphere / landing vs cooler vacuum / LOI looks) plus an **axial exhaust stream** on pad/ascent, dual exhaust lights in hot-stage, Super Heavy cryo frost + ice shed, maximum dynamic pressure condensation, and scrub-safe thrust lag. The booster stages off at low Earth orbit insert with fallaway + flash, a dim amber free-flyer locator (~30 s), and a brief boostback ignition flash; plumes scale with thrust. Starbase pad (flame trench, denser deluge steam, open Mechazilla lattice) sits on a **Sentinel-2 surrounds plate** (~80 km square, Copernicus / EOX cloudless) with procedural scrub as fallback. Earth uses a NASA **Blue Marble** albedo (procedural night-lights, stronger atmospheric limb, soft anti-sun fill); the Moon uses an **LRO WAC** color mosaic (procedural fallback) plus dim **Earthshine**. Lunar landing site beacon + dust puff mark touchdown. In system views the vehicle is tiny — **STARSHIP** and **SUPER HEAVY** name plates mark each stage. Use the **Ship** camera to see liftoff up close.

Texture credits (NASA Blue Marble, LRO WAC Moon, Sentinel-2 cloudless, NASA star map) live in [`public/textures/ATTRIBUTION.txt`](public/textures/ATTRIBUTION.txt).

## Features

- Loading overlay while Earth / Moon / star-field / Starbase textures fetch (theater is revealed when they are ready)
- Play / pause, **Auto** speed by phase (or fixed up to 2000×), mission scrubber with phase marks + **event ticks**
- **Cinematic bookmarks** (Pad · Stage · translunar injection · Half · lunar orbit insertion · Land) — seek + camera; **1…6**
- Event ticks on the scrubber (liftoff, staging, translunar injection, lunar orbit insertion, touchdown) — click a tick to seek
- **Ascent / return to launch site cross-section** (**Tab** cycle or button) — true-scale black & white launch-plane diagram (Earth surface + 150 km atmosphere, booster path liftoff → chopsticks); mission clock keeps running
- **Earth great-circle section** (**Earth GC** / **Tab**) — whole-Earth B&W slice on the Flight 13 corridor (Starbase · Gauteng · Indian Ocean landing · Australia); also from the Flight 13 briefing
- **Polar trajectories** (**Polar** / **Tab**) — Earth-centric 2-D map looking along ecliptic +Z (perpendicular to Earth's orbital plane): ship path + Moon path, true scale
- **KeyMap** (**K**, **Tab** cycle, or button) — white-outline keyboard on black with the action under each key
- Landing beat on terminal complete (camera settle + 1× hold, then mission-complete card); theater site **Malapert Massif** (south pole)
- Mission-complete card
- Cameras: **Auto-cam** (toggle **G**; Flight 13 follows the official webcast left-pane cuts: pad aerial drone → ground track → hull / engine-bay → splash chase → sea-level drone orbit of the floating ship) · Free orbit · rail buttons (**Aerial** = pad flying drone, **Drone** = recovery drone around the floating ship) or **−** / **=** cycle · **C**/**V** roll · **T**/**B** pan up/down (Earth-perpendicular at Starbase) · mouse / WASD / T/B leave a locked mount (same on both missions)
- HUD: phase, mission time, **Sky** (Moon phase % lit + Sun λ), distance, altitude, speed, fuel bars + thrust
- Metrics (**M**): full telemetry; Flight 13 also shows **Force check** (n-body vs Earth-only coast |Δr|)
- Logarithmic depth buffer for near craft + far Moon

## Develop

```bash
npm install
npm run precompute   # regenerate trajectory JSON (also runs before build)
npm run dev
```

```bash
npm test             # unit + baked-trajectory invariants (node:test via tsx)
npm run lint         # ESLint (src/ + scripts/)
npm run typecheck
npm run ci           # typecheck + lint + test
npm run build        # precompute (with invariant check) → typecheck → vite
npm run preview
```

Tests cover Kepler helpers, propellant bookkeeping, mission clock/timeline,
epoch calendar helpers, Earth-frame geometry, capture period helpers, vec3,
and structural invariants on `src/data/trajectory.json` (phase order, fuel
monotonicity, no trail teleport jumps) plus synthetic failure cases.
Precompute re-runs those invariants so a bad pack fails the build.
Linting uses ESLint flat config (`eslint.config.js`) with `typescript-eslint`.

Runtime recompute (slow, for physics debugging): open the site with `?recompute=1`.

Browser agents (Chrome DevTools MCP / CDP): [`docs/AGENT_BROWSER.md`](docs/AGENT_BROWSER.md) — `window.__theater` snapshot/seek/camera pose, plus `scripts/theater-devtools.sh`.

Base path is `/tothemoon/` (GitHub project Pages).

## Roadmap

Recommended next work (prioritized): [docs/NEXT.md](./docs/NEXT.md).  
Visual realism backlog (for agents): [docs/VISUAL_REALISM.md](./docs/VISUAL_REALISM.md) (V0–V21 shipped; no next visual slice is queued).

## Deploy

Pushes to `main` deploy via `.github/workflows/pages.yml`.

## Stack

- [Vite](https://vite.dev/) + TypeScript
- [three.js](https://threejs.org/)

## License

MIT — see [LICENSE](./LICENSE).
