# tothemoon

Interactive **Three.js** mission theater: a spacecraft launching from **Starbase (Boca Chica, Texas)** to a **lunar landing**.

**Live:** [https://julerex.github.io/tothemoon/](https://julerex.github.io/tothemoon/)

## Physics

- **True scale** — scene unit = 1 km; real Earth/Moon radii and ~384 400 km semi-major axis
- **Restricted n-body + Earth J₂** — craft integrated with **RK4** under **Earth + Moon** point-mass gravity, **solar tide** (residual about Earth), Earth **J₂**, and simple **exponential atmosphere / quadratic drag** below ~120 km
- **Staged ascent (A5)** — booster throttle schedule (Maximum dynamic pressure dip + main engine cutoff ramp), **hot-stage** (booster throttle-down → ship ignition → separation), short ship upper burn, then **residual circularize** (path-smoothed low Earth orbit insert with capped rocket-equation Δv — theater, not a free teleport). Not flight-ops tables
- **Translunar coast** — after a **hot super-Hohmann translunar injection** the craft is **pure ballistic** (zero thrust, zero trajectory corrections) under that force model; outcome is **lunar impact** or **flyby** (no powered lunar orbit insertion/landing). A low-opacity **Kepler 2-body corridor** (dashed amber + sparse whiskers, toggle **O**) shows how the n-body path diverges from the inject osculating ellipse; max |Δr| is in metrics (**M**)
- Heliocentric theater (Sun ≈ origin): **JPL Horizons DE441** samples for Earth/Moon over July 2027 (`npm run horizons`); analytic circular Earth + Keplerian Moon as fallback
- Mission: **Starbase pad** → staged ascent → low Earth orbit dogleg → finite translunar injection → **ballistic n-body coast** → impact or flyby
- **Mass-coupled thrust** — peak engine force F, acceleration a = F/m(t), pure rocket-equation ṁ (Isp) through translunar injection; empty tanks cut engines
- Trajectory is **baked at build time** into `src/data/trajectory.json` (instant load; no RK4 on the main thread). Pack **v2** also stores `minMoonAlt`, peak inertial speed, and stage-out time so the complete card never re-scans samples at load

The craft mesh is a near-true-size Super Heavy + Starship stack (tens of meters): ring welds, denser heat-shield tiles, Raptor field, multi-layer additive plumes, exhaust light, maximum dynamic pressure condensation, and hot-staging dual plumes. The booster stages off at low Earth orbit insert with fallaway + flash, a dim amber free-flyer locator (~30 s), and a brief boostback ignition flash; plumes scale with thrust. Starbase pad (flame trench, deluge steam, chopsticks silhouette) and ascent ground track sit on the spinning Earth. Lunar landing site beacon + dust puff mark touchdown. In system views the vehicle is tiny — a **red marker** shows its location. Use the **Ship** camera to see liftoff up close.

## Features

- Play / pause, **Auto** speed by phase (or fixed up to 2000×), mission scrubber with phase marks + **event ticks**
- **Cinematic bookmarks** (Pad · Stage · translunar injection · Half · lunar orbit insertion · Land) — seek + camera; **Shift+1…**
- Event callouts (liftoff, staging, translunar injection, lunar orbit insertion, touchdown) — click callout or tick to seek; telemetry dims during toast
- **Ascent / return to launch site cross-section** (**Tab** or button) — true-scale black & white launch-plane diagram (Earth surface + 120 km atmosphere, booster path liftoff → chopsticks); mission clock keeps running
- Landing beat on terminal complete (camera settle + 1× hold, then mission-complete card); theater site **Malapert Massif** (south pole)
- Mission-complete card
- Cameras: **Auto-cam** by phase (toggle **G**) · Free orbit · Earth · Ship chase · Moon · Solar · Starbase · Ship fin (**6**) · Booster grid fin (**7**) · **C**/**V** roll
- HUD: phase, mission time, distance, altitude, speed, fuel bars + thrust
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

Base path is `/tothemoon/` (GitHub project Pages).

## Roadmap

Recommended next work (prioritized): [docs/NEXT.md](./docs/NEXT.md).

## Deploy

Pushes to `main` deploy via `.github/workflows/pages.yml`.

## Stack

- [Vite](https://vite.dev/) + TypeScript
- [three.js](https://threejs.org/)

## License

MIT — see [LICENSE](./LICENSE).
