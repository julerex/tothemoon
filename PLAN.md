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

Do these first; reassess after 1–3 (highest “feels real” ROI):

1. **Finite TLI burn** + no position teleport on inject  
2. **Discrete TCMs** instead of continuous Kepler track  
3. **Honest LEO plane story** (dogleg burn or out-of-plane transfer)  
4. **Mass-coupled thrust** + remove / retune mdot fudge scales  
5. **J2 + simple drag on ascent**  
6. **Discrete LOI → LLO coast → PDI**  
7. **Better lunar ephemeris** (mean rates, then optional DE table)

Stop after (1)–(3) and reassess. Ephemeris and J2 are the next tier; full
free-body n-body and engine-out tables are deferred.

---

## Phase A — High leverage (still theater-honest)

### A1. Finite TLI burn (sequence item 1)

**Today:** `applyTli` sets velocity (and sometimes position); HUD accounts via
`applyImpulsiveShipDv`.

**Target:**
- Prograde finite burn under capped ship acceleration for tens of seconds–minutes.
- Integrate through the burn with RK4 (gravity + thrust).
- Prefer velocity-only inject when LEO coast already aims at periapsis; avoid position teleports.
- Sample burn densely enough for HUD thrust/plume and scrubber readability.
- Invariants: TLI phase duration band, Δv band, continuous trail (no jumps).

### A2. Discrete midcourse corrections (sequence item 2)

**Today:** `keplerTrackThrust` applies continuous soft PD so the path stays
near the design Earth-centered ellipse.

**Target:**
- Pure ballistic restricted 4-body coast after TLI.
- At fixed epochs (e.g. +12 h, +48 h, approach), compute a small impulsive or
  short finite TCM toward a B-plane / perilune target.
- Log TCM Δv and emit mission events (timeline + callouts).
- Keep max |Δr| vs Kepler as a **debug / low-opacity corridor**, not continuous thrust.
- Precompute logs: TCM count, total TCM Δv, max |Δr| (existing field OK).

### A3. Honest LEO → lunar-plane story (sequence item 3)

**Today:** `runLunarPlaneLeoCoast` slerps the orbital plane and snaps circular LEO.

**Pick one design (document the choice in README):**

| Option | Behavior | Notes |
|--------|----------|--------|
| **A** | Stay at ~26° parking; out-of-plane transfer | Closest to real due-east Starbase launch |
| **B** | Lunar-plane LEO via short dogleg / combined burn | Shows plane-change Δv and ship propellant |
| **C** | Dedicated plane-change burn at a node | Cost ~2 v sin(Δi/2); clearest pedagogy |

**Target:** no free plane slerp; any plane change spends Δv and is visible as
a burn phase or event.

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

### D1. Split `mission.ts`

Extract without behavior change first (see NEXT.md P3.12):

- `ascent` (already partly separate)
- `tli` / transfer design
- `coast` + midcourse
- `capture` / descent / land
- thin `runMission()` orchestrator

### D2. Golden tests & pack metadata

- Phase order, duration band, stage time window, TLI Δv band vs current bake.
- After physics changes: finite-burn durations, TCM count / total Δv, max midcourse |a| ≈ 0 when ballistic.
- Persist stats in `trajectory.json` where useful (`minMoonAlt`, peak speed,
  stage time, TCM totals); version pack fields; keep `trajectoryInvariants` in sync.

### D3. README honesty

When fidelity rises, update Physics bullets, e.g.:

- “Restricted 4-body + J2”
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

## Changelog

| Date | Note |
|------|------|
| 2026-07-23 | Initial plan: baseline gaps, A–D phases, sequence 1–7, deferred work |
