# Physics realism plan

Living plan for making the mission theater’s physics more realistic while
staying **theater-grade** (credible, watchable), not flight-ops grade.

Scene unit remains **1 km**. Prefer small, focused diffs. Trajectory stays
**baked at build time** (`npm run precompute` / `npm run build`).

Related: [docs/NEXT.md](./docs/NEXT.md) (overall roadmap; watchability still
P0/P1 there). This document is the physics/fidelity track only — **both**
the lunar theater and Flight 13.

**Live:** https://julerex.github.io/tothemoon/

---

## Goal

Raise dynamical and guidance fidelity so the lunar arc (ascent → low Earth
orbit → translunar injection → coast → lunar orbit insertion → landing) and
Flight 13 (ascent → coast → entry → splash) *behave* more like the real
flights, without claiming ops-grade ephemerides or propellant budgets.

Document every new approximation in the README Physics section and short
code comments. HUD may label theater values explicitly when helpful.

---

## Current baseline

| Layer | Approach | Main realism gap |
|-------|----------|------------------|
| **Gravity** | Restricted n-body (Earth + Moon + solar tide) + Earth J₂ + exponential drag, RK4 | No lunar harmonics; analytic fallback still Kepler Moon; Sun is a tide, not a free body |
| **Ephemeris** | **JPL Horizons DE441** table for the July 2027 lunar window; analytic circular Earth + Kepler Moon fallback | Analytic Ω, ω still fixed; Flight 13 uses analytic Earth/Sun (table is lunar-window only) |
| **Ascent** | Staged A5: throttle, max-Q dip, hot-stage, integrated circularize | Not ops throttle tables; gravity losses on the ship insert are real |
| **Low Earth orbit** | Integrated dogleg into the transfer plane | Guidance is PD-to-circular-in-plane, not ops-optimal |
| **Translunar injection** | Finite prograde burn (~2–4 min, mass-coupled) | Gravity losses are theater; Δv search is 1-D golden-section after the grid |
| **Coast** | Ballistic restricted n-body after TLI (live bake); Kepler corridor is overlay only | Search scores design perilune + south-pole B-plane; discrete TCM helpers exist but are unused on the live path |
| **Lunar orbit insertion / land** | Discrete LOI → ~¾ rev LLO → PDI → surface floor | PDI is PD-to-site, not a gated descent profile; miss lands here (no taxi) |
| **Propellant** | Mass-coupled a = F/m(t), pure rocket-equation ṁ | Theater loads / Isp; empty tanks cut engines |
| **Flight 13** | RK4 n-body or Earth-only; belly-flop aero; corridor steering | Booster recovery is on the **Earth μ + J₂ + drag** force model (last few km seated); splash is a sub-km surface floor (no published-fix seat) |

Key modules: `src/physics/{mission,missionFly,ascent,integrator,bodies,kepler,propellant,constants,lunarCapture,flight13Mission,boosterRecovery}.ts`,
`scripts/precompute-trajectory.ts`, `src/physics/trajectoryInvariants.ts`.

---

## Working agreements

- **Commit and push** finished units (see `AGENTS.md`).
- **Prefer small diffs**; no drive-by refactors outside the task.
- **Trajectory changes** → `npm run precompute` + invariants must pass; do not hand-edit `trajectory.json` unless intentional.
- **Theater vs ops:** document approximations when adding “realistic-looking” guidance.
- **Tests:** extend unit/invariant/golden coverage when locking phase boundaries, burn durations, pack fields, or Kepler helpers.
- `mission.ts` is already split (D1 / NEXT.md P3.12); keep extracting rather than growing the orchestrator. Golden tests pin bake bands.

---

## Next steps (locked 2026-08-13)

Phase A–C1, D1, B2 targeting, H1 snaps, the Horizons July 2027 table, pack v2
meta, Flight 13 Earth-only force check, and F1 booster recovery on the force
model are **shipped**. Remaining work is Earth figure, Flight 13 entry aero,
then numerics.

**Locked order for the next slices:**

1. **C3 — Earth figure & pad frame** — **done** (WGS84 ellipsoid for pad / splash / low-alt guidance + visual globe)
2. **B3 — Integrator quality** — **done** (finer RK4 near the Moon / F13 entry; step-doubling residual in the pack)
3. **C2 leftover — Analytic rates + Flight 13 ephemeris** — **done** (Ω̇, ω̇ on Kepler fallback; Flight 13 Horizons launch window)
4. **F2 — Entry aero honesty** — better-than-single-exponential atmosphere; altitude-varying ballistic factor

Then reassess. Full free-body n-body, engine-out tables, and ops-grade DE430
+ RCS stay deferred (see below).

Shipped sequence (do not reopen unless a later slice regresses them):
A3 dogleg → A1 finite TLI → A2 discrete TCM helpers → A4 mass-coupled thrust →
C1 J₂/drag → B1 LOI/LLO/PDI → A5 staged ascent → Horizons DE441 lunar table.

---

## Phase A — High leverage (still theater-honest)

### A1. Finite Translunar injection burn (sequence item 1) — **done 2026-07-23**

**Was:** `applyTranslunarInjection` impulsive + `applyImpulsiveShipDv` HUD spike.

**Shipped:**
- `runFiniteTranslunarInjection`: prograde RK4 burn, **no position teleport**, duration clamped
  to **2–4 min** at `TRANSLUNAR_INJECTION_ACCEL` ≈ 1.8 g (0.3–0.5 g would not fit Hohmann Δv
  in that window — documented in constants).
- Dense `translunarInjection` samples with ship fuel burn; probes use the same finite inject.
- **Landing site:** lunar **south pole** (guidance + `finishLanding` snap);
  matches scene lunar north/south orientation.

### A2. Discrete midcourse corrections (sequence item 2) — **done 2026-07-23**

**Was:** continuous `keplerTrackThrust` PD on every coast step.

**Shipped:**
- Pure ballistic restricted 4-body coast after translunar injection (no continuous Kepler PD).
- Discrete trajectory corrections at **+12 h**, **+48 h**, and **approach** (~0.8× time of flight): short
  finite burns matching design-track velocity (cap 0.35 km/s), then a soft
  position rejoin chord so the trail stays continuous.
- Timeline events `tcm-1`…; precompute logs count + total Δv; max |Δr| still logged.
- Coast samples mostly idle (`burning` mainly during trajectory correction clusters).

**Later (live bake):** lunar coast is **ballistic** (`lunarCapture`); TCM helpers in
`coast.ts` remain but are unused unless B2 reintroduces a small evented burn.

### A3. Honest low Earth orbit → lunar-plane story (sequence item 3) — **done 2026-07-23**

**Was:** `runLunarPlaneLowEarthOrbitCoast` slerped the orbital plane and snapped circular low Earth orbit. H1 still owes an *integrated* out-of-plane burn (Δv is paid, path is kinematic).

**Decision (2026-07-23): Option B — dogleg / combined burn.**

| Option | Behavior | Status |
|--------|----------|--------|
| **A** | Stay at ~26° parking; out-of-plane transfer | Deferred (harder targeting) |
| **B** | Lunar-plane low Earth orbit via short dogleg / combined burn | **Chosen** |
| **C** | Dedicated plane-change burn at a node | Deferred |

**Target:**
- No free plane slerp; plane change spends ship Δv and is visible (thrust + fuel).
- Ascent remains due-east (~i ≈ site lat); low Earth orbit coast combines in-plane phasing
  toward translunar injection periapsis with a continuous out-of-plane dogleg into the lunar
  plane (theater guidance, not ops-optimal).
- **UX (locked):** stay on phaseId `lowEarthOrbit`; samples show `burning` + ship
  `thrustN` + ship fuel drain during the dogleg; add a timeline **event**
  (e.g. “Dogleg into lunar plane”) — no new PhaseId.
- End state: circular-ish low Earth orbit in the lunar plane at transfer periapsis, with
  plane-change Δv booked on ship propellant.
- **Δv honesty (locked): most realistic for Option B** — aim for total
  plane-change class Δv near \(2 v \sin(\Delta i/2)\) (~3–3.5 km/s for
  \(\Delta i \approx 26^\circ\)), via combined in-plane + out-of-plane guidance
  that is not deliberately softened. Prefer burns when efficient (near nodes)
  over a wasteful always-on PD. Expect ship propellant / Isp theater numbers
  may need retune so translunar injection+capture still close; do **not** silently scale Δv
  down to hide cost.
- Document in README Physics: “low Earth orbit dogleg into lunar plane (paid Δv).”

### A4. Mass-coupled dynamics (sequence item 4) — **done 2026-07-23**

**Was:** accel-based guidance; HUD-only propellant with mdot fudge scales.

**Shipped:**
- Peak thrust `BOOSTER_THRUST_N` / `SHIP_THRUST_N`; a = F/m(t) via `limitAccelByThrust`.
- Pure rocket-equation ṁ (`burnForce`); empty tanks return zero force.
- Ascent drains every integration step; translunar injection/trajectory correction/landing ship burns mass-coupled.
- Dogleg (kinematic) books plane-change Δv once via pure-RE impulsive helper.
- Propellant loads retuned for pure RE so the mission still closes.
- HUD fuel/thrust use the same `PropState` as dynamics.

### A5. Ascent atmosphere + staged profile — **done 2026-07-31**

**Was:** continuous ~2.8 g gravity turn; forced circularize snap when booster dry.

**Shipped:**
- Atmosphere/drag already from C1; maximum dynamic pressure still felt on ascent.
- Booster **throttle schedule** (`boosterThrottle`): liftoff full, maximum dynamic pressure dip,
  recovery, main engine cutoff ramp → average closer to ~1.2–1.5 g class.
- **Hot-stage** (`HOT_STAGE_S`): booster throttle-down + ship ignition while
  stacked, then `stageBooster` → short integrated ship upper burn
  (`UPPER_BURN_MAX_S`).
- **Residual circularize**: path-smoothed settle to circular low Earth orbit with capped
  rocket-equation Δv (`CIRC_DV_CAP_KM_S`) — not a free zero-dt teleport, and
  not a full pure-RE multi-km/s insert (would empty tanks / starve dogleg + translunar injection).
- Unit tests: `ascent.test.ts` (throttle, hot-stage fuel, low Earth orbit insert, prop left).

---

## Phase B — Capture, targeting, numerics

### B1. Discrete lunar orbit insertion → low lunar orbit → powered descent initiation (sequence item 6) — **done 2026-07-23**

**Was:** continuous PD approach → braking → descent.

**Shipped (phase IDs unchanged for timeline compatibility):**
1. **approach** = Lunar orbit insertion burn (`lunarOrbitInsertionThrust`) — circularize into ~120 km low lunar orbit  
2. **braking** = ballistic **Low lunar orbit coast** ~¾ rev (`LOW_LUNAR_ORBIT_COAST_REVS`)  
3. **descent** = **Powered descent initiation** (`poweredDescentThrust`) to south pole + taxi  
4. Touchdown via `finishLanding`  

Timeline: Lunar orbit insertion burn → Low lunar orbit coast → powered descent initiation callouts; auto-speed tuned per segment.

### B2. B-plane / perilune targeting — **done 2026-08-17**

**Shipped:** `bplane.ts` scores design perilune altitude (400 km) + south-pole
B-plane (`bT` / `southAlign`). `probePerilune` returns Moon-relative peri
state. Search still grids epoch/phase, then golden-section polishes TLI Δv.
Live bake stays ballistic after TLI; TCM helpers unused.

**Was:** `missionSearch` / `probePerilune` scored min Moon altitude vs an
8_000 km flyby + a TLI Δv / Moon-phase ladder.

**Target:**
- Design targets: perilune altitude (and optional inclination / node), not
  “closest approach anywhere.”
- Converge Translunar injection Δv, departure epoch, and (if TCMs return) a
  small midcourse Δv. Even single-variable golden-section / secant on Δv is a
  step up from the grid.
- Prefer a B-plane (or Moon-relative T, R, B-vector) miss parameterization so
  south-pole geometry is an explicit aim, not a post-hoc LOI snap.
- Golden tests on duration, Translunar injection Δv band, min lunar alt, stage
  time, and perilune vs design altitude.

### B3. Integrator quality for multi-day coasts — **done 2026-08-18**

**Shipped:** shared `nearBodyCoastDt` (0.5 s inside 8_000 km of the Moon, 1 s
inside 40_000 km, then 5 / 12 / 20 s). Ballistic coast and lunar capture use
it; Flight 13 entry drops to 0.25 s below 80 km. Pack meta stores peak RK4
step-doubling |Δr| and Moon-relative |ΔE/E| inside 250_000 km (`maxNearMoonStepErrKm`,
`maxMoonEnergyRelResidual`). Fixed RK4 stays; no higher-order scheme.

**Today (was):** fixed RK4, `DT_COAST = 20` s, `DT_NEAR = 2` s inside ~40_000 km.

---

## Phase C — Ephemeris & Earth model

### C1. Earth gravity (sequence item 5) — **done 2026-07-23**

**Shipped:**
- Earth **J₂** in `integrator.addEarthJ2` (pole-aligned to theater Earth axis).
- Exponential atmosphere + quadratic drag vs co-rotating air below ~120 km
  (`atmDensity`, `addEarthDrag`); fixed ballistic factor for the stack.
- Applied on every `rk4Step` (ascent feels maximum dynamic pressure drag; low Earth orbit gets mild J₂).

### C2. Lunar / solar ephemeris — **done 2026-08-18**

**Shipped:**
- JPL Horizons **DE441** for the July 2027 lunar window (`npm run horizons`)
- Analytic Kepler Moon now applies mean **Ω̇** (~18.6 yr retrograde) and **ω̇**
  (~8.85 yr prograde) from the 2027-07-20 element epoch
- Flight 13 launch window table (`npm run horizons:flight13` →
  `horizons-flight13-epoch.json`). The F13 bake stays analytic so the pad
  frame stays consistent; interpolate is wired when `useHorizons` is on.

Sun stays a ~1 AU circle / origin unless lighting needs more.

### C3. Earth figure & pad frame — **done 2026-08-18**

Pad, splash, booster floor, drag altitude, and the visual globe share a **WGS84
ellipsoid** (`wgs84.ts`). Lat/lon stay geodetic; height is above the ellipsoid
(radial stand-in near the surface). J₂ uses the equatorial radius `a`. Mean
`R_EARTH` remains the spherical HUD / overlay radius.

**Shipped:**
- WGS84 ECEF pad / gulf / splash (`geodeticToEllipsoidMeshLocal`)
- `altitudeEarth` / atmosphere drag vs ellipsoid height
- Earth / atmo / LEO-cloud meshes morphed to the same figure
- One surface contract (`earthSurface.test.ts`) — no second visual radius

---

## Leftover honesty (H) — snaps still in the bake

Position teleports and impulsive Δv books on the live path are **removed**
(2026-08-17). Super Heavy recovery is on the Earth force model (F1, 2026-08-17).

### H1. Remaining snaps and kinematic burns — **done 2026-08-17**

| Where | Shipped |
|-------|---------|
| **LOI** | Finite burn only; unbound leftover is a flyby (no polar LLO teleport) |
| **LEO dogleg** | RK4 + mass-coupled out-of-plane / circularize thrust |
| **Flight 13 splash** | Natural intercept after entry; sub-km floor at the flown lat/lon (no published-fix seat) |
| **Ascent circularize** | Integrated upper burn (no r/v blend, no `CIRC_DV_CAP`) |
| **Landing** | Sub-km radial floor; no great-circle taxi |
| **TLI** | Finite burn only (deleted impulsive `applyTranslunarInjection` / end-of-burn `tliSnapIdeal`) |

`coast.ts` discrete TCM machinery can stay; the live lunar path is ballistic
and should stay ballistic unless B2 reintroduces a small evented correction.

---

## Phase F — Flight 13 dynamics (still theater)

Flight 13 already integrates the stack under the shared RK4 force model
(n-body or Earth-only check). Remaining gaps are recovery, entry aero, and
timeline honesty — not a second gravity stack.

### F1. Booster recovery on the force model — **done 2026-08-17**

`boosterRecovery.ts` now RK4-integrates flip → boostback → coast → landing
burn on Earth μ + J₂ + drag (same `rk4Step` as the ship, `gravity: "earth"`).
Boostback / landing-burn Δv is mass-coupled on leftover Super Heavy
propellant. Landing burn lights at the public mark (~T+6:27 Flight 13 /
~T+6:30 Flight 5) from ~5 km AGL (Flight 13 webcast “Landing startup”).
Chopsticks: last few km seat onto the tower. Flight 13 gulf: partial
landing-burn relight then a hard ocean splash (as flown). Scrub-deterministic;
not wall-clocked.

### F2. Entry aero honesty

**Today:** single exponential atmosphere + fixed stack ballistic factor on
ascent; Flight 13 belly-flop uses a larger theater `BELLY_CD_A_OVER_M` and a
constant L/D. Relight is lengthened vs the public ~12 s so periapsis drops
before the entry mark. Splash coordinates are theater (west of Australia).

**Target:**
- Piecewise / US76-ish density vs a single scale height (still analytic).
- Altitude- or AoA-varying ballistic factor; keep L/D theater-bounded.
- Shorten in-space relight toward the public demo if B2-style targeting (or a
  simple periapsis search) still reaches the splash corridor.
- Soft-land / splash without a 200 km-class position snap (pairs with H1).

---

## Phase D — Architecture & verification (do early / alongside)

### D1. Split `mission.ts` (**do first**, before A3) — **done 2026-07-23**

**Decision (2026-07-23): full D1 split with no behavior change, then A3.**

Extracted from `src/physics/mission.ts` into:

| Module | Owns |
|--------|------|
| `missionTypes.ts` | `PhaseId`, `Sample`, `MissionResult`, `phaseLabel` |
| `missionSample.ts` | `pushSample` |
| `ascentCache.ts` | ascent cache / `ensureAscent` |
| `ascent.ts` | powered ascent (pre-existing) |
| `lowEarthOrbitCoast.ts` | low Earth orbit plane slerp coast, LowEarthOrbitRelative — **A3 lands here** |
| `translunarInjection.ts` | LRO transfer + `applyTranslunarInjection` — **A1 lands here** |
| `coast.ts` | Kepler-track midcourse — **A2 lands here** |
| `capture.ts` | `landingThrust`, `finishLanding` |
| `mission.ts` | thin `runMission` / `flyMission` orchestrator, probe search, downsample |

**Rules (met):**
- No intentional physics change (same bake within golden tolerance).
- Public API unchanged: `runMission`, `phaseLabel`, `PhaseId`, `Sample`, `MissionResult` re-exported from `mission.ts`.
- Golden tests: `mission.golden.test.ts` pins duration, Translunar injection Δv, stage time, phase order, sample count.

### D2. Golden tests & pack metadata — **partial**

**Shipped:** pack **v2** (`minMoonAlt`, `peakSpeedKmS`, `stageT`, Kepler max |Δr|);
`mission.golden.test.ts` + `trajectoryInvariants`; Flight 13 Earth-only force
check.

**Still do with each physics slice:**
- Phase order, duration band, stage time window, Translunar injection Δv band vs current bake.
- After targeting/snap changes: perilune vs design altitude, finite-burn durations, max midcourse |a| ≈ 0 when ballistic.
- New pack fields (energy residual, recovery Δv) only with invariant coverage.

### D3. README honesty

When fidelity rises, update Physics bullets. Already true: restricted n-body +
J₂, staged ascent, finite TLI, ballistic coast, LOI/LLO/PDI, mass-coupled
thrust, Horizons DE441. Next bullets as slices land:

- “B-plane / perilune targeting (theater)”
- “WGS84 pad / low-altitude figure”
- ~~“Flight 13 recovery on the force model”~~ **done 2026-08-17**
- “low Earth orbit dogleg as integrated burn” (when H1 lands)

---

## Explicitly deferred

| Idea | Why defer |
|------|-----------|
| Full free n-body Sun–Earth–Moon–craft | Bodies already prescribed; restricted 4-body is enough for theater |
| Real Starship engine-out / throttle tables | Huge scope; HUD can stay approximate |
| Free-return / Earth return | Redesigns whole mission arc (NEXT.md P4) |
| Ops-grade DE430 + RCS attitude dynamics | Horizons DE441 table is enough; RCS not needed for path realism |
| Continuous high-rate RCS / attitude dynamics | Not needed for path realism |
| Surveyed Flight 13 splash buoy / CFD aero tables | Theater corridor + bounded L/D is the honesty target |

---

## Priority vs NEXT.md

| Track | When |
|-------|------|
| **NEXT.md P0/P1** (auto-cam, bookmarks, callouts) | Best ROI for viewers who already watch the mission |
| **This plan (physics)** | When the goal is credibility of the *path* and burns |

They compose: discrete trajectory corrections and finite translunar injection also improve storytelling if events
and plumes read clearly. Prefer not to ship silent continuous midcourse
thrust that the HUD floors to zero.

---

## Definition of done (per slice)

For each merged unit of work:

1. Code + comments document theater vs real approximations.  
2. `npm run precompute` succeeds; invariants pass.  
3. `npm test` / `npm run ci` pass; new golden/invariant coverage for the slice.  
4. README Physics updated if user-visible model changed.  
5. Commit and push (see `AGENTS.md`).

---

## Quick reference — commands

```bash
npm run dev          # local theater
npm test             # unit + trajectory invariants
npm run lint         # ESLint
npm run ci           # typecheck + lint + test
npm run precompute   # regenerate trajectory.json (+ Flight 13 pack)
npm run horizons     # refresh DE441 Earth/Moon table (July 2027 window)
npm run build        # precompute → typecheck → vite
```

Runtime RK4 (slow): `?recompute=1` on the site.

---

## Execution roadmap

Shipped (2026-07 → 2026-08):

```
0. D1  Split mission.ts + golden tests
1. A3  low Earth orbit dogleg (paid Δv)
2. A1  Finite translunar injection ~2–4 min
3. A2  Discrete TCM helpers; live path later went ballistic (no TCM)
4. A4  Mass-coupled thrust
5. C1  Earth J₂ + drag
6. B1  LOI → LLO → PDI
7. A5  Staged ascent
8.     Horizons DE441 lunar table + pack v2 meta + Flight 13 theater
```

**Next (locked 2026-08-13):**

```
1. B2  B-plane / perilune targeting
2. H1  Remaining snaps (LOI circularize, dogleg integrated burn, F13 splash)
3. C3  WGS84 Earth figure (shared pad / entry)
4. F1  Flight 13 booster recovery on RK4 / Earth-relative ballistic
5. B3  Adaptive / smaller steps + energy residual — **done 2026-08-18**
6. C2  Analytic Ω̇, ω̇; optional Flight 13 Horizons window — **done 2026-08-18**
7. F2  Entry aero (atmosphere layers, Cd(h), shorter relight)
```

### A3 implementation sketch (after D1) — **done 2026-07-23**

1. Geometry still aims circular low Earth orbit in the lunar plane at translunar injection periapsis (smoothstep plane ease).
2. Each step books plane-change cost \(2 v \sin(\mathrm{d}i/2)\) as ship accel via `burnProp` (in-plane arc free).
3. Timeline event `dogleg` on first significant low Earth orbit burn; low Earth orbit insertion copy says due-east.
4. Goldens: low Earth orbit burning samples + ship fuel drop; duration/ translunar injection bands unchanged.
5. README Physics bullet for paid dogleg.

H1 is the follow-up: keep that Δv class, but integrate the out-of-plane burn
instead of booking it impulsively on a kinematic slerp.

### Definition of done for each slice

See “Definition of done (per slice)” above — precompute + tests + README + push.

## Decisions log

| Date | Decision |
|------|----------|
| 2026-07-23 | **A3 = Option B** (dogleg / combined burn into lunar-plane low Earth orbit; paid ship Δv) |
| 2026-07-23 | **Implement order: D1 → A3 → A1 → A2** |
| 2026-07-23 | **A3 UX:** keep phase `lowEarthOrbit`; dogleg = burning samples + timeline event (no new PhaseId) |
| 2026-07-23 | **A3 Δv:** most realistic — full plane-change class cost, not theater-softened |
| 2026-07-23 | **A1 burn:** ~2–4 min finite translunar injection at ~0.3–0.5 g theater ship accel |
| 2026-07-23 | **A2:** 2–3 discrete trajectory corrections; ballistic coast between |
| 2026-07-23 | **D1 first:** full `mission.ts` split + golden tests before A3 physics |
| 2026-07-23 | **D1 complete:** modules extracted; `mission.golden.test.ts` pins bake |
| 2026-07-23 | **A3 complete:** paid low Earth orbit dogleg (~plane-change class Δv, ship fuel, timeline event) |
| 2026-07-23 | **A1 complete:** finite translunar injection 2–4 min; land lunar south pole |
| 2026-07-23 | **A2 complete:** ballistic coast + discrete trajectory corrections (+12 h, +48 h, approach) |
| 2026-07-23 | **A4 complete:** mass-coupled a=F/m, pure rocket-equation ṁ, tank cutout |
| 2026-07-23 | **C1 complete:** Earth J₂ + exponential atmosphere / quadratic drag |
| 2026-07-23 | **B1 complete:** Lunar orbit insertion burn → Low lunar orbit coast (~¾ rev) → powered descent initiation south pole |
| 2026-07-23 | **South-pole geometry:** transfer plane south-biased (`TRANSFER_SOUTH_AIM_KM`); lunar orbit insertion → polar low lunar orbit (not northern flyby above lunar plane) |
| 2026-07-23 | **LRO free coast:** design ellipse **apogee = south-pole rendezvous**; smooth Kepler coast (no trajectory corrections); short lunar orbit insertion + land from apo |
| 2026-07-23 | **Ballistic free coast:** no post-Translunar injection burns; restricted 4-body RK4; outcome impact or flyby (landing not required) |
| 2026-07-31 | **A5 complete:** throttle schedule, hot-stage, powered circularize (no force-snap) |
| 2026-08-13 | **Reassess:** next slices B2 → H1 snaps → C3 WGS84 → F1 F13 recovery → B3 integrator → C2 leftover → F2 entry aero |
| 2026-08-13 | **Horizons DE441** July 2027 table is the lunar ephemeris; analytic Ω/ω rates and Flight 13 Horizons remain leftover |
| 2026-08-13 | **Live lunar coast** stays ballistic (A2 TCM helpers unused unless B2 reintroduces a small evented burn) |
| 2026-08-17 | **B2 + H1:** design perilune / B-plane search; delete polar LLO snap, LEO slerp, circularize blend, landing taxi, F13 splash seat, impulsive TLI |

## Changelog

| Date | Note |
|------|------|
| 2026-08-18 | C3: WGS84 ellipsoid for pad / splash / drag altitude / visual Earth (one surface contract) |
| 2026-08-17 | F1: Super Heavy recovery on RK4 Earth μ + J₂ + drag; landing burn ~5 km AGL; last few km seat onto chopsticks / gulf |
| 2026-08-17 | B2 targeting + H1 honesty: no live-path teleports |
| 2026-08-13 | Next-steps reassess: B-plane targeting, leftover snaps, WGS84, Flight 13 recovery/aero; baseline table brought current |
| 2026-07-31 | A5 staged ascent shipped; golden stage/duration bands retuned |
| 2026-07-23 | Initial plan: baseline gaps, A–D phases, sequence 1–7, deferred work |
| 2026-07-23 | Locked A3=B, order D1→A3→A1→A2, dogleg UX/Δv, translunar injection 2–4 min, 2–3 trajectory corrections |
