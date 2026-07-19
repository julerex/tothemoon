# tothemoon

Interactive **Three.js** mission theater: a spacecraft launching from **Starbase (Boca Chica, Texas)** to a **lunar landing**.

**Live:** [https://julerex.github.io/tothemoon/](https://julerex.github.io/tothemoon/)

## Physics

- **True scale** — scene unit = 1 km; real Earth/Moon radii and ~384 400 km semi-major axis
- **Restricted 4-body** — craft integrated with RK4 under gravity of **Sun + Earth + Moon**
- Keplerian lunar orbit about the barycenter: **e ≈ 0.055**, **i ≈ 5.15°** to the ecliptic (XY), with ascending node and argument of perigee fixed for the theater; Sun on a far 1 AU ecliptic path
- Mission: **Starbase pad** → powered ascent (due-east, *i* ≈ 26°) → LEO coast → impulsive TLI onto a **Hohmann-class ellipse** (Moon meets the craft near **Earth apogee**) → guided braking / powered descent → **landed**
- Trajectory is **baked at build time** into `src/data/trajectory.json` (instant load; no RK4 on the main thread)

The craft mesh is near true size (tens of meters). In system views it is invisible — a **red marker** shows its location. Use the **Ship** camera to see the vehicle up close.

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
npm run build        # precompute → typecheck → vite
npm run preview
```

Runtime recompute (slow, for physics debugging): open the site with `?recompute=1`.

Base path is `/tothemoon/` (GitHub project Pages).

## Deploy

Pushes to `main` deploy via `.github/workflows/pages.yml`.

## Stack

- [Vite](https://vite.dev/) + TypeScript
- [three.js](https://threejs.org/)

## License

MIT — see [LICENSE](./LICENSE).
