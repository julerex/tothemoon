# Recommended next steps

Living plan for **tothemoon** after the core mission theater, mission UX, engineering hygiene, and pad/staging/landing polish. Prefer small, focused diffs; scene unit remains **1 km**.

**Live:** https://julerex.github.io/tothemoon/

---

## Current baseline (done)

| Area | What’s in place |
|------|------------------|
| **Mission arc** | Starbase → ascent → low Earth orbit → translunar injection → N-body coast (Kepler ref) → lunar orbit insertion-style capture → soft landing; trajectory baked at build |
| **Mission UX** | Scrubber phase marks, event callouts, Auto speed by phase |
| **Staging / craft** | Super Heavy + Ship mesh, thrust-scaled plumes, booster fallaway + flash, fuel bars |
| **Earth theater** | Starbase pad, ascent ground track, atmosphere limb |
| **Landing theater** | Site beacon + Malapert Massif label, dust puff, landing beat (1× hold + settle) then mission-complete card |
| **Hygiene** | `npm test` (Kepler, propellant, clock/timeline, epoch, earthFrame, capture, invariants), `npm run lint` (ESLint), CI, precompute invariant gate |

Key modules: `src/physics/mission.ts`, `src/mission/timeline.ts`, `src/scene/{craft,stagingFx,landingFx,earthTheater}.ts`, `src/ui/hud.ts`.

---

## Priority guide

Use this order unless a bug or production issue supersedes it.

| Priority | Theme | Why now |
|----------|--------|---------|
| **P0** | Watchability polish | Highest ROI on time already spent watching the mission |
| **P1** | Camera & storytelling | Multi-day flight needs guided framing |
| **P2** | Physics / fidelity (theater-grade) | Deepens credibility without ops-grade claims |
| **P3** | Architecture & scale | Keeps `mission.ts` and scene code maintainable |
| **P4** | Stretch / optional | Nice if motivated; easy to defer |
| **P1+** | Multi-mission shell | **Done** — main menu → Mission Menu; lunar + Flight 13 full theaters |

---

## P0 — Watchability polish

### 1. Guided phase cameras — **done**

When a phase starts (or staging fires), ease the camera to a sensible default:

| Phase | Framing |
|-------|---------|
| Launch | Starbase pad |
| Ascent / low Earth orbit / translunar injection | Ship chase |
| Staging | Ship (close reframe) |
| Coast | Wide Earth (cislunar overview) |
| Approach / Lunar orbit insertion / low lunar orbit | Moon |
| Descent / land | Ship chase |
| Impact | Moon |

- Toggle: **Auto-cam** button + **G** (default on; off on manual focus keys, WASD pan, or mouse orbit).
- `CameraDirector.easeToMode` eases orbit radius; does not fight Free orbit mid-drag.
- Pure map: `src/camera/autoCam.ts` (+ unit tests).

### 2. Callout ↔ scrubber coupling — **done**

- Subtle **event ticks** under the scrubber (phase marks stay above); secondary beats (staging, dogleg, return to launch site) use a taller tick.
- Click a tick → seek + show callout; click the callout (or Enter/Space) → re-seek that beat.
- Telemetry dims while a callout is visible (`tel-dimmed`).
- Pure helper: `src/mission/scrubEvents.ts` (+ unit tests).

### 3. Booster fallaway readability — **done**

- Short free-flyer **locator** (dim amber, dimmer than ship red) for ~30 s of mission time after stage-out; pixel-size heuristic matches the ship locator.
- Tiny boostback ignition flash (theater-only, non-physical) when reverse burn lights.
- Pure helpers: `boosterLocatorStrength` / `boostbackFlashStrength` in `boosterRecovery.ts` (+ unit tests); rendered by `StagingFx`.

### 4. Landing beat — **done**

- On terminal complete (landed / impact / flyby end) while playing: settle camera (Ship chase on soft land, Moon otherwise), pin playback to **1×**, hold ~3.2 s wall-clock, then reveal the complete card and auto-pause at end.
- Scrub / pause-to-end shows the card immediately (no hold).
- Theater site plate: **Malapert Massif** (lunar south pole) on `LandingFx`; complete-card subtitle adapts to beat kind.
- Pure helpers: `src/mission/landingBeat.ts` (+ unit tests).

---

## P1 — Camera & storytelling

### 5. Cinematic bookmarks — **done**

Preset jumps (buttons + **Shift+1…**): **Pad**, **Staging**, **Translunar injection**, **Halfway**, **Lunar orbit insertion**, **Touchdown** (or **Impact**). Seek + `easeToMode` in one action; Auto-cam stays on. Built from `timeline.events` / phase segments (`src/mission/bookmarks.ts`).

### 6. Chase camera quality

- Bank slightly with lateral acceleration during ascent.
- Widen framing when `craftLengthKm` is tiny at high speed multipliers.
- Optional look-ahead along the trail for coast.

### 7. Narration strip / news ticker — **done** (mission-time LIVE crawl)

Scrolling **LIVE** news ticker above the transport bar. Beats from
`buildNewsBeats(timeline)` (`src/mission/newsTicker.ts`); active line is
`newsAtMissionTime` at the mission clock (scrub-safe). Wire tags + expanded
copy for lunar and Flight 13; mid-phase ambient on long coasts. Marquee
pauses when playback is paused; `prefers-reduced-motion` shows a static line.

---

## P2 — Physics / fidelity (still theater)

Stay honest: theater values, not flight-ops ephemerides.

### 8. Lunar orbit insertion / coast visual corridor — **done** (corridor track)

Ballistic free-coast packs have no Lunar orbit insertion burn; readability work focuses on the Kepler-vs-n-body story:

- **Coast corridor** (toggle **O** with orbits): dashed amber Kepler inject ellipse vs n-body trail, sparse |Δr| whiskers.
- Pure helpers: `coastCorridor.ts` (+ tests); bake tracks `keplerRefMaxDevKm` during coast; metrics **Kepler max |Δr|**.
- lunar orbit insertion plume/HUD distinctness remains deferred until a capture pack returns (phases/helpers already in `capture.ts`).

### 9. Booster recovery silhouette — done (theater)

Kinematic return to launch site path after stage-out: flip → boostback plume → coast/entry → landing burn → chopsticks catch at Starbase (`boosterRecovery.ts` + `StagingFx`). Non-authoritative; scrub-stable. Optional follow-ups: dim free-flyer locator, chopsticks close animation.

### 10. Epoch & lighting polish — **partial**

- ~~Landing illumination already targets July 2027 waning gibbous — expose “Sun / Earth / Moon phase” one-liner~~ **done** (`skyPhase.ts`: telemetry **Sky**, Metrics Epoch, complete-card Sky row).
- Soft Earth night lights or city glints only if they stay cheap (canvas texture already exists for Earth).

### 11. Packed trajectory metadata — **done**

- Pack **v2** persists `minMoonAlt`, `peakSpeedKmS`, and `stageT` in `trajectory.json` at precompute; load uses packed values (no sample re-scan when finite).
- Pure helpers: `src/physics/trajectoryMeta.ts` (+ unit tests). Fallback derive for v1 packs.
- Complete card + metrics (M) show peak |v| and stage-out; invariants require v2 meta fields.

---

## P3 — Architecture & maintainability

### 12. Split `mission.ts` — **done**

Thin orchestrator in `mission.ts`; flight / search / coast / downsample extracted:

| Module | Role |
|--------|------|
| `mission.ts` | `runMission()` only + re-exports |
| `missionFly.ts` | ascent → dogleg → translunar injection → coast compose |
| `missionSearch.ts` | epoch / phase / Δv ballistic search |
| `ballisticCoast.ts` | free-coast integrate + `probePerilune` |
| `missionDownsample.ts` | pack thinning |
| `missionEpoch.ts` | Moon/Sun phase map |

Ascent / translunar injection / capture / low Earth orbit dogleg were already separate. Golden tests pin phase order, duration, stage window, Translunar injection Δv, and pack v2 meta against the bake.

### 13. Scene FX module boundary

Keep `stagingFx`, `landingFx`, `earthTheater` as the pattern: **deterministic in mission time**, scrub-safe, no wall-clock physics. New FX should follow that rule.

### 14. HUD composition

`hud.ts` is becoming the kitchen sink. Optional split:

- `hud/transport.ts` (play, speed, scrub)
- `hud/telemetry.ts`
- `hud/callouts.ts` + complete card

Only worth it when the next UX feature would otherwise bloat a single file further.

### 15. Bundle size

Main chunk is large (Three + baked JSON). Low urgency on GH Pages, but if needed:

- Dynamic-import Three addons only where required
- Slim or gzip-friendly trajectory (already packed; consider quantize further only with invariant tests)

---

## P4 — Stretch / later

| Idea | Notes |
|------|--------|
| **Return to Earth** | Full second half of a free-return or reentry theater — large scope; design mission phases first |
| **Multi-mission select** | **Done** (main → Mission Menu, hash routes; lunar + Flight 13 full theaters). More packs as needed |
| **Audio** | Ambient pad rumble / callout stingers; keep mute default |
| **Mobile layout** | Telemetry + transport already constrained; test pad label / complete card on narrow viewports |
| **WebGPU / post** | Only if WebGL path stays first-class |
| **i18n** | Unlikely unless audience needs it |

---

## Suggested sequencing (concrete)

A practical order for the next few sessions:

1. ~~**Auto-cam by phase** (P0.1) + manual override~~ **done**  
2. ~~**Cinematic bookmarks** (P1.5)~~ **done**  
3. ~~**Callout ↔ scrubber coupling** (P0.2)~~ **done**  
4. ~~**Booster fallaway locator** (P0.3)~~ **done**  
5. ~~**Landing beat** (P0.4)~~ **done**  
6. ~~**Persist mission stats in precompute pack** (P2.11)~~ **done**  
7. ~~**Split mission physics modules** (P3.12)~~ **done**  
8. ~~**Lunar orbit insertion / coast visual corridor** (P2.8)~~ **done** (Kepler corridor)  
9. ~~**Flight 13 full theater**~~ **done** (baked pack, staging, coast, entry, splash, trench cam, Earth-only force check)  
10. ~~**Sky phase one-liner** (P2.10 partial)~~ **done** (telemetry + Metrics + complete card)  

Core arc is modular and watchable. **Both missions** ship full theaters (`to-the-moon` | `flight-13`).

**Good next slices:**
1. **Flight 13 Auto-cam story** — trench/pad at countdown → ship on ascent → booster at sep → entry chase  
2. **Chase camera quality** (P1.6) — bank, look-ahead, high-speed framing  
3. **Lunar LOI / soft landing pack** (if a capture ending is wanted again)  
4. **HUD split** (P3.14) when the next UX feature would bloat `hud.ts` further

---

## Working agreements

- **Commit and push** finished units of work (see `AGENTS.md`).
- **Prefer small diffs**; no drive-by refactors outside the task.
- **Trajectory changes** → `npm run precompute` + invariants must pass; don’t hand-edit `trajectory.json` unless intentional.
- **Theater vs ops:** document approximations in README or code comments when adding “realistic-looking” guidance.
- **Tests:** extend unit/invariant coverage when locking new phase boundaries, pack fields, or Kepler helpers.
- **Lint:** `npm run lint` must stay clean; fix with `npm run lint:fix` when safe.

---

## Quick reference — commands

```bash
npm run dev          # local theater
npm test             # unit + trajectory invariants
npm run lint         # ESLint
npm run ci           # typecheck + lint + test
npm run precompute   # regenerate trajectory.json (+ invariant check)
npm run build        # precompute → typecheck → vite
```

Runtime RK4 (slow): `?recompute=1` on the site.

---

## Changelog of this plan

| Date | Note |
|------|------|
| 2026-07-21 | Initial plan after mission UX, hygiene, staging/landing/pad theater |
| 2026-07-28 | ESLint + expanded unit tests (clock, epoch, earthFrame, capture, synthetic invariants) + JSDoc on pure modules |
| 2026-07-29 | Auto-cam by phase (P0.1): guided framing, C / button toggle, ease distance, unit tests |
| 2026-08-02 | Cinematic bookmarks (P1.5): Pad·Stage·translunar injection·Half·lunar orbit insertion·Land buttons + Shift+1…, pure builder + tests |
| 2026-08-02 | Callout ↔ scrubber (P0.2): event ticks, click callout to seek, dim telemetry |
| 2026-08-04 | Booster fallaway (P0.3): dim free-flyer locator ~30 s + boostback ignition flash |
| 2026-08-04 | Landing beat (P0.4): 1× hold + camera settle + delayed complete card; Malapert site label |
| 2026-08-04 | Pack meta v2 (P2.11): minMoonAlt + peakSpeedKmS + stageT baked; no load-time re-scan |
| 2026-08-04 | Split mission.ts (P3.12): fly / search / ballistic coast / downsample modules + golden bands |
| 2026-08-04 | Coast corridor (P2.8): Kepler-vs-n-body path + max |Δr| meta / metrics |
| 2026-08-08 | Multi-mission shell: main menu → Mission Menu; lunar theater + Flight 13 briefing; hash routes |
| 2026-08-08 | Earth great-circle section (Flight 13 corridor: Starbase · Gauteng · splash · Australia) |
| 2026-08-08 | Earth-centric ecliptic-plane trajectory map (ship + Moon; look along +Z) |
| 2026-08-08 | Flight 13 full theater: RK4 pack, staging, coast, entry, splashdown |
| 2026-08-10 | Flight 13 entry/landing realism: lofted ballistic arc, belly-flop aero, plasma, ocean splash, 3→2→1, attitude flip |
| 2026-08-10 | Flight 13 physics honesty: remove approach glide, SECO circularize, relight deorbit, entry bank, natural early splash |
| 2026-08-10 | Mission-time LIVE news ticker (scrub-safe beats from timeline; lunar + Flight 13 copy) |
| 2026-08-11 | Flight 13 Earth-only force model + coast agreement tests vs restricted n-body |
| 2026-08-11 | Sky phase one-liner (Moon % lit + Sun λ) on telemetry / Metrics / complete card; Flight 13 Metrics force-check row |
| 2026-08-11 | Cameras reordered 1–8; flame-trench under-pad cam; prelaunch pad-cam epoch fix |
