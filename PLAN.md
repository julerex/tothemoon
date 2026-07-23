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

Raise dynamical and guidance fidelity so ascent → LEO → TLI → coast → LOI →
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
| **Ascent** | ~2.8 g continuous gravity turn; optional circularize snap | No atmosphere/drag/Max-Q; no staged MECO/SECO; accel-based, not thrust/mass |
| **LEO** | Kinematic plane-change into lunar plane | Real plane changes cost Δv; due-east parking i ≈ 26° is not free |
| **TLI** | Near-Hohmann, mostly impulsive | Real TLI is a finite burn with gravity losses |
| **Coast** | Soft PD “Kepler track” midcourse | Real TCMs are discrete, low-Δv, event-driven |
| **LOI / land** | Continuous PD velocity matching → soft land | Real LOI is discrete capture into LLO, then PDI |
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

1. **A3 — Honest LEO plane (dogleg)** — replace free plane slerp with paid Δv  
2. **A1 — Finite TLI burn** — integrate prograde burn; no position teleport  
3. **A2 — Discrete TCMs** — ballistic coast + evented corrections  

Then reassess. Remaining backlog (not reordered yet):

4. **Mass-coupled thrust** + remove / retune mdot fudge scales  
5. **J2 + simple drag on ascent**  
6. **Discrete LOI → LLO coast → PDI**  
7. **Better lunar ephemeris** (mean rates, then optional DE table)

Ephemeris and J2 are the next tier after 1–3; full free-body n-body and
engine-out tables stay deferred.

---

## Phase A — High leverage (still theater-honest)

### A1. Finite TLI burn (sequence item 1)

**Today:** `applyTli` sets velocity (and sometimes position); HUD accounts via
`applyImpulsiveShipDv`.

**Target:**
- Prograde finite burn under capped ship acceleration for **~2–4 minutes**
  (locked 2026-07-23); theater a ≈ 0.3–0.5 g so Δv ~ Hohmann class fits that window.
- Integrate through the burn with RK4 (gravity + thrust).
- Prefer velocity-only inject when LEO coast already aims at periapsis; avoid position teleports.
- Sample burn densely enough for HUD thrust/plume and scrubber readability.
- Invariants: TLI phase duration band (~2–4 min), Δv band, continuous trail (no jumps).

### A2. Discrete midcourse corrections (sequence item 2)

**Today:** `keplerTrackThrust` applies continuous soft PD so the path stays
near the design Earth-centered ellipse.

**Target:**
- Pure ballistic restricted 4-body coast after TLI.
- **2–3 discrete TCMs** (locked 2026-07-23), e.g. ~+12 h, mid-coast / ~+48 h,
  and approach — small impulsive or short finite burns toward perilune / B-plane.
- Log TCM Δv and emit mission events (timeline + callouts).
- Keep max |Δr| vs Kepler as a **debug / low-opacity corridor**, not continuous thrust.
- Precompute logs: TCM count, total TCM Δv, max |Δr| (existing field OK).

### A3. Honest LEO → lunar-plane story (sequence item 3)

**Today:** `runLunarPlaneLeoCoast` slerps the orbital plane and snaps circular LEO.

**Decision (2026-07-23): Option B — dogleg / combined burn.**

| Option | Behavior | Status |
|--------|----------|--------|
| **A** | Stay at ~26° parking; out-of-plane transfer | Deferred (harder targeting) |
| **B** | Lunar-plane LEO via short dogleg / combined burn | **Chosen** |
| **C** | Dedicated plane-change burn at a node | Deferred |

**Target:**
- No free plane slerp; plane change spends ship Δv and is visible (thrust + fuel).
- Ascent remains due-east (~i ≈ site lat); LEO coast combines in-plane phasing
  toward TLI periapsis with a continuous out-of-plane dogleg into the lunar
  plane (theater guidance, not ops-optimal).
- **UX (locked):** stay on phaseId `leo`; samples show `burning` + ship
  `thrustN` + ship fuel drain during the dogleg; add a timeline **event**
  (e.g. “Dogleg into lunar plane”) — no new PhaseId.
- End state: circular-ish LEO in the lunar plane at transfer periapsis, with
  plane-change Δv booked on ship propellant.
- **Δv honesty (locked): most realistic for Option B** — aim for total
  plane-change class Δv near \(2 v \sin(\Delta i/2)\) (~3–3.5 km/s for
  \(\Delta i \approx 26^\circ\)), via combined in-plane + out-of-plane guidance
  that is not deliberately softened. Prefer burns when efficient (near nodes)
  over a wasteful always-on PD. Expect ship propellant / Isp theater numbers
  may need retune so TLI+capture still close; do **not** silently scale Δv
  down to hide cost.
- Document in README Physics: “LEO dogleg into lunar plane (paid Δv).”

### A4. Mass-coupled dynamics (sequence item 4)

**Today:** guidance is acceleration-based; `propellant.ts` is HUD-only with
`BOOSTER_MDOT_SCALE` / `SHIP_MDOT_SCALE`.

**Target:**
- State includes dry + propellant mass (or wet mass derived from tanks).
- Engine model: thrust force → a = F / m(t).
- Rocket-equation ṁ without fudge scales, or retune only after F/Isp are consistent.
- Empty tanks cut engines (hard stop) so LOI/landing budgets constrain the mission.
- HUD fuel bars remain authoritative for the same state used by dynamics.

### A5. Ascent atmosphere + staged profile

**Today:** continuous ~2.8 g gravity turn; forced circularize snap if close.

**Target:**
- Simple exponential density + drag (theater Cd·A/m) so Max-Q is meaningful.
- Hot-staging shape: booster throttle-down / MECO → ship ignition → separation
  (times approximate is fine).
- Narrow or remove forced circularize snap; finish with a real circularization
  burn on a slightly elliptical insert when possible.
- Peak / average accel closer to ~1.2–1.5 g average with a throttle schedule.

---

## Phase B — Capture, targeting, numerics

### B1. Discrete LOI → LLO → PDI (sequence item 6)

**Today:** continuous PD approach → braking → descent → soft land.

**Target (Apollo / LRO-like arc):**
1. LOI1 into elliptical lunar orbit  
2. Optional LOI2 / circularize  
3. Coast ≥ ~½–1 rev (visible on scrubber)  
4. Powered descent initiation with site-relative guidance  
5. Touchdown with residual fuel that *can* go empty  

Align phase IDs / labels with existing timeline events; extend invariants for
phase order and LOI burn readability (thrust + fuel draw).

### B2. B-plane / perilune targeting

**Today:** probe search on min Moon altitude + Δv ladder.

**Target:**
- Design targets: perilune altitude (+ optional inclination / node).
- Converge TLI Δv, departure epoch, and TCM deltas (even single-variable
  golden-section is a step up).
- Golden tests on duration, TLI Δv band, min lunar alt, stage time.

### B3. Integrator quality for multi-day coasts

**Today:** fixed RK4, `DT_COAST = 20` s (and similar near-body steps).

**Target (as needed after ballistic coast + discrete TCM):**
- Adaptive step or smaller steps near the Moon.
- Precompute diagnostics: energy / relative Jacobi-ish residual, max step error proxy.
- Optional higher-order or adaptive scheme only if fixed RK4 fails golden bands.

---

## Phase C — Ephemeris & Earth model

### C1. Earth gravity (sequence item 5)

- Add **J2** (optionally J3/J4) for LEO; parking orbit precession matters for
  multi-rev coast and ground track.
- Simple atmospheric density below ~120 km for ascent (and any future reentry).

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
| `leoCoast.ts` | LEO plane slerp coast, LeoRel — **A3 lands here** |
| `tli.ts` | LRO transfer + `applyTli` — **A1 lands here** |
| `coast.ts` | Kepler-track midcourse — **A2 lands here** |
| `capture.ts` | `landingThrust`, `finishLanding` |
| `mission.ts` | thin `runMission` / `flyMission` orchestrator, probe search, downsample |

**Rules (met):**
- No intentional physics change (same bake within golden tolerance).
- Public API unchanged: `runMission`, `phaseLabel`, `PhaseId`, `Sample`, `MissionResult` re-exported from `mission.ts`.
- Golden tests: `mission.golden.test.ts` pins duration, TLI Δv, stage time, phase order, sample count.

### D2. Golden tests & pack metadata

- Phase order, duration band, stage time window, TLI Δv band vs current bake.
- After physics changes: finite-burn durations, TCM count / total Δv, max midcourse |a| ≈ 0 when ballistic.
- Persist stats in `trajectory.json` where useful (`minMoonAlt`, peak speed,
  stage time, TCM totals); version pack fields; keep `trajectoryInvariants` in sync.

### D3. README honesty

When fidelity rises, update Physics bullets, e.g.:

- “Restricted 4-body + J2”
- “LEO dogleg into lunar plane (paid Δv)”
- “Finite TLI / LOI burns; discrete TCMs”
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

They compose: discrete TCMs and finite TLI also improve storytelling if events
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
1. A3  LEO dogleg (paid Δv, phase stays leo, timeline event)
2. A1  Finite TLI ~2–4 min
3. A2  2–3 discrete TCMs; remove continuous Kepler-track PD
— reassess —
4+   Mass-coupled thrust, J2/drag, discrete LOI, ephemeris
```

### A3 implementation sketch (after D1)

1. Replace free normal slerp in `leoCoast.ts` with guidance that applies ship
   thrust (out-of-plane + in-plane phasing) toward lunar-plane circular LEO
   at TLI periapsis.
2. Book Δv via existing `burnProp` / `thrustForceN` (still accel-based until A4).
3. Timeline: event when dogleg thrust becomes significant (or at LEO start).
4. Invariants/goldens: LEO segment has some `burning` samples; ship fuel
   drops by a plane-change-class amount; trail continuous; TLI still succeeds.
5. README Physics bullet.

### Definition of done for each slice

See “Definition of done (per slice)” below — precompute + tests + README + push.

## Decisions log

| Date | Decision |
|------|----------|
| 2026-07-23 | **A3 = Option B** (dogleg / combined burn into lunar-plane LEO; paid ship Δv) |
| 2026-07-23 | **Implement order: D1 → A3 → A1 → A2** |
| 2026-07-23 | **A3 UX:** keep phase `leo`; dogleg = burning samples + timeline event (no new PhaseId) |
| 2026-07-23 | **A3 Δv:** most realistic — full plane-change class cost, not theater-softened |
| 2026-07-23 | **A1 burn:** ~2–4 min finite TLI at ~0.3–0.5 g theater ship accel |
| 2026-07-23 | **A2:** 2–3 discrete TCMs; ballistic coast between |
| 2026-07-23 | **D1 first:** full `mission.ts` split + golden tests before A3 physics |
| 2026-07-23 | **D1 complete:** modules extracted; `mission.golden.test.ts` pins bake |

## Changelog

| Date | Note |
|------|------|
| 2026-07-23 | Initial plan: baseline gaps, A–D phases, sequence 1–7, deferred work |
| 2026-07-23 | Locked A3=B, order D1→A3→A1→A2, dogleg UX/Δv, TLI 2–4 min, 2–3 TCMs |
