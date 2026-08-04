# Physics realism plan

Living plan for making the mission theater’s physics more realistic while
staying **theater-grade** (credible, watchable), not flight-ops grade.

Scene unit remains **1 km**. Prefer small, focused diffs. Trajectory stays
**baked at build time** (`npm run precompute` / `npm run build`).

Related: [docs/NEXT.md](./docs/NEXT.md) (overall roadmap; watchability still
P0/P1 there). This document is the physics/fidelity track only.

**Live:** https://julerex.github.io/tothemoon/

---

## Goal

Raise dynamical and guidance fidelity so ascent → low Earth orbit → translunar injection → coast → lunar orbit insertion →
landing *behaves* more like a real cislunar mission, without claiming DE
ephemerides or ops-grade propellant budgets.

Document every new approximation in the README Physics section and short
code comments. HUD may label theater values explicitly when helpful.

---

## Current baseline

| Layer | Approach | Main realism gap |
|-------|----------|------------------|
| **Gravity** | Point-mass Sun + Earth + Moon, RK4 | No J2/higher harmonics; Moon/Sun are prescribed Kepler, not mutual n-body |
| **Ephemeris** | Fixed lunar Ω, ω, mean elements | No nodal regression, apsidal precession, or real DE tables |
| **Ascent** | ~2.8 g continuous gravity turn; optional circularize snap | No atmosphere/drag/Maximum dynamic pressure; no staged main engine cutoff/SECO; accel-based, not thrust/mass |
| **Low Earth orbit** | Kinematic plane-change into lunar plane | Real plane changes cost Δv; due-east parking i ≈ 26° is not free |
| **Translunar injection** | Near-Hohmann, mostly impulsive | Real translunar injection is a finite burn with gravity losses |
| **Coast** | Soft PD “Kepler track” midcourse | Real trajectory corrections are discrete, low-Δv, event-driven |
| **Lunar orbit insertion / land** | Continuous PD velocity matching → soft land | Real lunar orbit insertion is discrete capture into low lunar orbit, then powered descent initiation |
| **Propellant** | HUD-only with `MDOT_SCALE` fudge | Mass does not feed back into acceleration |

Key modules: `src/physics/{mission,ascent,integrator,bodies,kepler,propellant,constants}.ts`,
`scripts/precompute-trajectory.ts`, `src/physics/trajectoryInvariants.ts`.

---

## Working agreements

- **Commit and push** finished units (see `AGENTS.md`).
- **Prefer small diffs**; no drive-by refactors outside the task.
- **Trajectory changes** → `npm run precompute` + invariants must pass; do not hand-edit `trajectory.json` unless intentional.
- **Theater vs ops:** document approximations when adding “realistic-looking” guidance.
- **Tests:** extend unit/invariant/golden coverage when locking phase boundaries, burn durations, pack fields, or Kepler helpers.
- Before large rewrites of `mission.ts`, prefer the split in [docs/NEXT.md](./docs/NEXT.md) P3.12 (ascent / tli / coast / capture) plus golden tests.

---

## Suggested sequence

**Locked order for the first three slices (2026-07-23):**

1. **A3 — Honest low Earth orbit plane (dogleg)** — replace free plane slerp with paid Δv  
2. **A1 — Finite Translunar injection burn** — integrate prograde burn; no position teleport  
3. **A2 — Discrete trajectory corrections** — ballistic coast + evented corrections  

Then reassess. Remaining backlog (not reordered yet):

4. **Mass-coupled thrust** + remove / retune mdot fudge scales  
5. **J2 + simple drag on ascent**  
6. **Discrete lunar orbit insertion → Low lunar orbit coast → powered descent initiation**  
7. **Better lunar ephemeris** (mean rates, then optional DE table)

Ephemeris and J2 are the next tier after 1–3; full free-body n-body and
engine-out tables stay deferred.

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

### A3. Honest low Earth orbit → lunar-plane story (sequence item 3)

**Today:** `runLunarPlaneLowEarthOrbitCoast` slerps the orbital plane and snaps circular low Earth orbit.

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

### B2. B-plane / perilune targeting

**Today:** probe search on min Moon altitude + Δv ladder.

**Target:**
- Design targets: perilune altitude (+ optional inclination / node).
- Converge Translunar injection Δv, departure epoch, and trajectory correction deltas (even single-variable
  golden-section is a step up).
- Golden tests on duration, Translunar injection Δv band, min lunar alt, stage time.

### B3. Integrator quality for multi-day coasts

**Today:** fixed RK4, `DT_COAST = 20` s (and similar near-body steps).

**Target (as needed after ballistic coast + discrete trajectory correction):**
- Adaptive step or smaller steps near the Moon.
- Precompute diagnostics: energy / relative Jacobi-ish residual, max step error proxy.
- Optional higher-order or adaptive scheme only if fixed RK4 fails golden bands.

---

## Phase C — Ephemeris & Earth model

### C1. Earth gravity (sequence item 5) — **done 2026-07-23**

**Shipped:**
- Earth **J₂** in `integrator.addEarthJ2` (pole-aligned to theater Earth axis).
- Exponential atmosphere + quadratic drag vs co-rotating air below ~120 km
  (`atmDensity`, `addEarthDrag`); fixed ballistic factor for the stack.
- Applied on every `rk4Step` (ascent feels maximum dynamic pressure drag; low Earth orbit gets mild J₂).

### C2. Lunar / solar ephemeris (sequence item 7)

Moon is Keplerian with fixed Ω and ω in `constants.ts`.

| Step | Work | Cost |
|------|------|------|
| 1 | Mean rates Ω̇, ω̇ (node ~18.6 yr, apsides ~8.85 yr) | Low |
| 2 | Small DE-lite / table for July 2027 only (precompute-time) | Medium |
| 3 | Keep Sun as ~1 AU circle unless lighting/precision demands more | — |

### C3. Earth figure & pad frame

- Optional WGS84 ellipsoid for pad height and low-altitude guidance.
- Keep sidereal rotation consistent with J2 if C1 lands.

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

### D2. Golden tests & pack metadata

- Phase order, duration band, stage time window, Translunar injection Δv band vs current bake.
- After physics changes: finite-burn durations, trajectory correction count / total Δv, max midcourse |a| ≈ 0 when ballistic.
- Persist stats in `trajectory.json` where useful (`minMoonAlt`, peak speed,
  stage time, trajectory correction totals); version pack fields; keep `trajectoryInvariants` in sync.

### D3. README honesty

When fidelity rises, update Physics bullets, e.g.:

- “Restricted 4-body + J2”
- “low Earth orbit dogleg into lunar plane (paid Δv)”
- “Finite translunar injection / Lunar orbit insertion burns; discrete trajectory corrections”
- “Theater propellant / Isp”
- Optional HUD one-liner for Sun / Earth / Moon phase at landing

---

## Explicitly deferred

| Idea | Why defer |
|------|-----------|
| Full free n-body Sun–Earth–Moon–craft | Bodies already prescribed; restricted 4-body is enough for theater |
| Real Starship engine-out / throttle tables | Huge scope; HUD can stay approximate |
| Free-return / Earth return | Redesigns whole mission arc (NEXT.md P4) |
| Ops-grade DE430 + RCS attitude dynamics | Diminishing returns for a Three.js theater |
| Continuous high-rate RCS / attitude dynamics | Not needed for path realism |

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
npm run ci           # typecheck + test
npm run precompute   # regenerate trajectory.json (+ invariant check)
npm run build        # precompute → typecheck → vite
```

Runtime RK4 (slow): `?recompute=1` on the site.

---

## Execution roadmap (locked)

```
0. D1  Split mission.ts + golden tests (no behavior change)
1. A3  low Earth orbit dogleg (paid Δv, phase stays lowEarthOrbit, timeline event)
2. A1  Finite translunar injection ~2–4 min
3. A2  2–3 discrete trajectory corrections; remove continuous Kepler-track PD
— reassess —
4+   Mass-coupled thrust, J2/drag, discrete lunar orbit insertion, ephemeris
```

### A3 implementation sketch (after D1) — **done 2026-07-23**

1. Geometry still aims circular low Earth orbit in the lunar plane at translunar injection periapsis (smoothstep plane ease).
2. Each step books plane-change cost \(2 v \sin(\mathrm{d}i/2)\) as ship accel via `burnProp` (in-plane arc free).
3. Timeline event `dogleg` on first significant low Earth orbit burn; low Earth orbit insertion copy says due-east.
4. Goldens: low Earth orbit burning samples + ship fuel drop; duration/ translunar injection bands unchanged.
5. README Physics bullet for paid dogleg.

### Definition of done for each slice

See “Definition of done (per slice)” below — precompute + tests + README + push.

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

## Changelog

| Date | Note |
|------|------|
| 2026-07-31 | A5 staged ascent shipped; golden stage/duration bands retuned |
| 2026-07-23 | Initial plan: baseline gaps, A–D phases, sequence 1–7, deferred work |
| 2026-07-23 | Locked A3=B, order D1→A3→A1→A2, dogleg UX/Δv, translunar injection 2–4 min, 2–3 trajectory corrections |
