# tothemoon

Interactive **Three.js** mission theater: a spacecraft launching from **Starbase (Boca Chica, Texas)** to a **lunar landing**.

**Live:** [https://julerex.github.io/tothemoon/](https://julerex.github.io/tothemoon/)

## Physics

- **True scale** — scene unit = 1 km; real Earth/Moon radii and ~384 400 km semi-major axis
- **Restricted 4-body + Earth J₂** — ascent / LEO / near-Moon segments use **RK4** under **Sun + Earth + Moon**, plus Earth **J₂** and a simple **exponential atmosphere / quadratic drag** below ~120 km
- **Translunar coast** — after a **super-Hohmann TLI** the free coast follows the **Earth-centered Kepler** ellipse set by inject (so Δv actually reaches cislunar distance), then **4-body** near the Moon; **zero thrust / TCMs**; outcome is **lunar impact** or **flyby** (no powered LOI/landing)
- Keplerian lunar orbit about the barycenter: **e ≈ 0.055**, **i ≈ 5.15°** to the ecliptic (XY); Sun on a far 1 AU ecliptic path
- Mission: **Starbase pad** → powered ascent → LEO dogleg → finite TLI → **ballistic free coast** → impact or flyby
- **Mass-coupled thrust** — peak engine force F, acceleration a = F/m(t), pure rocket-equation ṁ (Isp) through TLI; empty tanks cut engines
- Trajectory is **baked at build time** into `src/data/trajectory.json` (instant load; no RK4 on the main thread)

The craft mesh is a near-true-size Super Heavy + Starship stack (tens of meters): ring welds, denser heat-shield tiles, Raptor field, multi-layer additive plumes, exhaust light, Max-Q condensation, and hot-staging dual plumes. The booster stages off at LEO insert with a short fallaway + flash; plumes scale with thrust. Starbase pad (flame trench, deluge steam, chopsticks silhouette) and ascent ground track sit on the spinning Earth. Lunar landing site beacon + dust puff mark touchdown. In system views the vehicle is tiny — a **red marker** shows its location. Use the **Ship** camera to see liftoff up close.

## Features

- Play / pause, **Auto** speed by phase (or fixed up to 2000×), mission scrubber with phase marks
- Event callouts (liftoff, staging, TLI, LOI, touchdown) + mission-complete card
- Cameras: Free orbit · Earth · Ship chase · Moon · Solar
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
npm run typecheck
npm run ci           # typecheck + test
npm run build        # precompute (with invariant check) → typecheck → vite
npm run preview
```

Tests cover Kepler helpers, propellant bookkeeping, mission timeline UX data,
and structural invariants on `src/data/trajectory.json` (phase order, fuel
monotonicity, no trail teleport jumps). Precompute re-runs those invariants
so a bad pack fails the build.

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
