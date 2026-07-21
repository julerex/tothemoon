# Recommended next steps

Living plan for **tothemoon** after the core mission theater, mission UX, engineering hygiene, and pad/staging/landing polish. Prefer small, focused diffs; scene unit remains **1 km**.

**Live:** https://julerex.github.io/tothemoon/

---

## Current baseline (done)

| Area | What’s in place |
|------|------------------|
| **Mission arc** | Starbase → ascent → LEO → TLI → N-body coast (Kepler ref) → LOI-style capture → soft landing; trajectory baked at build |
| **Mission UX** | Scrubber phase marks, event callouts, Auto speed by phase |
| **Staging / craft** | Super Heavy + Ship mesh, thrust-scaled plumes, booster fallaway + flash, fuel bars |
| **Earth theater** | Starbase pad, ascent ground track, atmosphere limb |
| **Landing theater** | Site beacon, dust puff, mission-complete card (duration, TLI Δv, min lunar alt) |
| **Hygiene** | `npm test` (Kepler, propellant, timeline, trajectory invariants), CI, precompute invariant gate |

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

---

## P0 — Watchability polish

### 1. Guided phase cameras (recommended next)

When a phase starts (or a callout fires), optionally ease the camera to a sensible default:

| Phase | Suggested framing |
|-------|-------------------|
| Launch / ascent | Earth or Ship chase |
| Staging | Ship (close) |
| Coast | Free / cislunar overview |
| Approach / LOI | Moon |
| Descent / land | Ship or Moon close-in |

- Toggle: **Auto-cam** on/off (default on for first-time viewers, off once user picks a camera manually).
- Reuse `CameraDirector`; do not fight Free orbit while the user is dragging.

### 2. Callout ↔ scrubber coupling

- Scrubber ticks for **events** (not only phases), or a subtle event tick under the phase mark.
- Clicking a callout title (or an events list) seeks to that mission time.
- Optional: dim telemetry during callout so the toast is the focus.

### 3. Booster fallaway readability

- Short free-flyer **locator** (dimmer than the ship) for ~30 s of mission time after stage-out.
- Optional tiny boostback plume flash (theater-only, non-physical).

### 4. Landing beat

- On touchdown: brief camera settle on Ship or Moon, hold Auto speed at 1× for a few wall-clock seconds before the complete card fully steals focus.
- Site label (“landing site”) or selenographic name (fictional is fine if documented as theater).

---

## P1 — Camera & storytelling

### 5. Cinematic bookmarks

Preset jumps (buttons or keys): **Pad**, **Staging**, **TLI**, **Halfway**, **LOI**, **Touchdown** — seek + set camera mode in one action. Build from `timeline.events` / phase segments so bookmarks stay aligned with the baked trajectory.

### 6. Chase camera quality

- Bank slightly with lateral acceleration during ascent.
- Widen framing when `craftLengthKm` is tiny at high speed multipliers.
- Optional look-ahead along the trail for coast.

### 7. Narration strip (optional)

A single-line subtitle under the callout for longer beats (“Parking orbit, lunar plane · coast ~1.25 revs”) driven by the same event table as `timeline.ts`. Keep copy short; avoid wall-of-text.

---

## P2 — Physics / fidelity (still theater)

Stay honest: theater values, not flight-ops ephemerides.

### 8. LOI / capture readability

- Make LOI burn duration and plume more distinct in samples / HUD (phase already exists; ensure thrust and fuel draw read clearly).
- Optional Kepler-vs-N-body corridor ribbon on the TLI coast (debug or low-opacity path) using precompute’s max |Δr| story.

### 9. Booster recovery silhouette (optional)

After fallaway, a simplified **boostback / entry** arc (kinematic theater, not full integration) that disappears near the Gulf. High visual payoff; keep it clearly non-authoritative.

### 10. Epoch & lighting polish

- Landing illumination already targets July 2027 waning gibbous — expose “Sun / Earth / Moon phase” one-liner in telemetry or complete card.
- Soft Earth night lights or city glints only if they stay cheap (canvas texture already exists for Earth).

### 11. Packed trajectory metadata

- Persist real `minMoonAlt` (and maybe peak speed, stage time) in `trajectory.json` at precompute so the complete card doesn’t re-scan samples at load.
- Version the pack if fields grow; keep `trajectoryInvariants` in sync.

---

## P3 — Architecture & maintainability

### 12. Split `mission.ts`

`src/physics/mission.ts` is large (~1.3k lines). Extract without behavior change:

- `ascent` (already partly separate)
- `tli` / transfer design
- `coast` + midcourse
- `capture` / descent / land
- thin `runMission()` orchestrator

Add golden tests: phase order, duration band, stage time window, TLI Δv band against the current bake.

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
| **Multi-mission select** | Alternate epochs or landing sites via query param + alternate precomputes |
| **Audio** | Ambient pad rumble / callout stingers; keep mute default |
| **Mobile layout** | Telemetry + transport already constrained; test pad label / complete card on narrow viewports |
| **WebGPU / post** | Only if WebGL path stays first-class |
| **i18n** | Unlikely unless audience needs it |

---

## Suggested sequencing (concrete)

A practical order for the next few sessions:

1. **Auto-cam by phase** (P0.1) + manual override  
2. **Cinematic bookmarks** (P1.5)  
3. **Persist mission stats in precompute pack** (P2.11)  
4. **Split mission physics modules** (P3.12) with golden tests  
5. **LOI / coast visual corridor** (P2.8) or **booster recovery silhouette** (P2.9) — pick one visual track  

Stop and reassess after (1)–(3); watchability gains compound more than deep physics until the theater is effortless to follow.

---

## Working agreements

- **Commit and push** finished units of work (see `AGENTS.md`).
- **Prefer small diffs**; no drive-by refactors outside the task.
- **Trajectory changes** → `npm run precompute` + invariants must pass; don’t hand-edit `trajectory.json` unless intentional.
- **Theater vs ops:** document approximations in README or code comments when adding “realistic-looking” guidance.
- **Tests:** extend unit/invariant coverage when locking new phase boundaries, pack fields, or Kepler helpers.

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

## Changelog of this plan

| Date | Note |
|------|------|
| 2026-07-21 | Initial plan after mission UX, hygiene, staging/landing/pad theater |
