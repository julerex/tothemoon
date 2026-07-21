# tothemoon

Interactive **Three.js** mission theater: a spacecraft launching from **Starbase (Boca Chica, Texas)** to a **lunar landing**.

**Live:** [https://julerex.github.io/tothemoon/](https://julerex.github.io/tothemoon/)

## Physics

- **True scale** — scene unit = 1 km; real Earth/Moon radii and ~384 400 km semi-major axis
- **Restricted 4-body** — craft integrated with **RK4** under gravity of **Sun + Earth + Moon** (ascent, TLI coast, capture, landing)
- **Kepler reference** — after TLI, an Earth-centered 2-body ellipse is the design track; soft midcourse keeps N-body within that corridor and precompute logs max |Δr|
- Keplerian lunar orbit about the barycenter: **e ≈ 0.055**, **i ≈ 5.15°** to the ecliptic (XY); Sun on a far 1 AU ecliptic path
- Mission: **Starbase pad** → powered ascent (fine samples) → lunar-plane LEO → TLI → **N-body coast with Kepler track** → LOI-style capture → soft landing
- Trajectory is **baked at build time** into `src/data/trajectory.json` (instant load; no RK4 on the main thread)

The craft mesh is a near-true-size Super Heavy + Starship stack (tens of meters). The booster stages off at LEO insert; ship/booster plumes scale with thrust. In system views the vehicle is tiny — a **red marker** shows its location. Use the **Ship** camera to see it up close.

## Features

- Play / pause, speed (up to 2000×), mission scrubber
- Cameras: Free orbit · Earth · Ship chase · Moon
- HUD: phase, mission time, distance to Moon, altitude, speed
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

## Deploy

Pushes to `main` deploy via `.github/workflows/pages.yml`.

## Stack

- [Vite](https://vite.dev/) + TypeScript
- [three.js](https://threejs.org/)

## License

MIT — see [LICENSE](./LICENSE).
