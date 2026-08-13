# Visual realism backlog

Living plan for **visual** improvements that raise credibility and watchability
while staying **theater-grade** (not flight-ops imagery or ops-grade CFD).

Scene unit remains **1 km**. Prefer small, focused diffs. FX must stay
**scrub-deterministic** (driven by mission time / state, not wall-clock only).

Related:

- [NEXT.md](./NEXT.md) — overall product roadmap (watchability, physics, architecture)
- [PLAN.md](../PLAN.md) — physics fidelity track
- [AGENTS.md](../AGENTS.md) — agent commit/hygiene rules

**Live:** https://julerex.github.io/tothemoon/

---

## Current baseline (what we already have)

| Area | In place |
|------|----------|
| **Bodies** | NASA Blue Marble albedo (procedural fallback) + atmo limb + Moon (albedo/roughness); true radii |
| **Sky** | NASA SVS star map, ecliptic-aligned dome |
| **Lighting** | Ephemeris directional sun (`sunLight.ts`); Flight 13 daytime pad fill; ground-sky shell for low altitude |
| **Pad** | OLP-2-inspired hardstand, tanks, Mechazilla, trench, deluge/vent steam, flood logic; Sentinel-2 surrounds plate |
| **Craft** | Near-true Super Heavy + Ship, tiles, Raptors, multi-layer plumes, hot-stage, condensation |
| **FX** | Staging fallaway/flash, boostback flash, entry plasma, lunar dust, ocean splash |
| **Cameras** | Trench, pad, chase (look-ahead/bank), fin/gridfin, Auto-cam profiles (lunar + Flight 13) |
| **Overlays** | Trails, orbit grids, Kepler corridor, locators |

**Shipped (V0):** soft anti-sun fill, stronger Earth/Moon limb, night-led pad floods, Earthshine on Moon, procedural Earth night lights.

**Shipped (V1):** regime-specific multi-layer plumes (atmosphere denser/tighter, vacuum wider/sparser, LOI + landing ship looks), dual hot-stage lights, scrub-safe thrust lag + gimbal wobble.

**Shipped (V2):** Fresnel Rayleigh-ish multi-shell Earth limb, soft surface terminator, Moon mare/highland + crater-rim contrast for low sun, continuous lunar roughness. (Procedural cloud deck was later **removed** so Blue Marble land/ocean stay unobscured.)

**Shipped (V3):** pad close-up — scorch/water stains, multi-tier deluge + sheets, chopsticks/QD silhouette, trench heat haze.

**Shipped (V4):** stainless anisotropy + weld rings, windward heat-shield edge wear, denser high-contrast grid fins for fin/gridfin cams.

**Shipped (V5):** tight pad+craft sun shadows, mild bloom + altitude exposure, star-dome fade, entry brownout haze.

**Shipped (V11):** NASA Blue Marble Earth albedo + Sentinel-2 Starbase surrounds plate (procedural fallback).

**Next (locked):** V6 terminal FX → V7 entry craft → V8 recovery catch → V9 lunar site → V12 finale cams → V13 payload deploy → V10 coast. See **Next steps** below.

Key modules: `src/scene/{bodies,craft,earthTheater,starbasePlate,earthAtmosphere,cinema,textures,sunLight,groundSky,stagingFx,entryFx,landingFx,splashFx}.ts`.

---

## Working agreements

- **Theater vs ops:** document approximations in README or short code comments when adding “realistic-looking” FX.
- **Procedural first:** prefer canvas / GPU-cheap materials over huge DEM/satellite assets unless an explicit asset pipeline is accepted. Committed theater-grade JPEGs (NASA Blue Marble globe + Sentinel-2 Starbase plate, with procedural fallback) are the accepted exception; an optional Moon albedo JPEG is V15 — not a tile server or DEM.
- **Scrub-safe:** opacity/scale/position from mission `t`, phase, alt, burn flags — not `performance.now()` alone (wall-clock OK only for toast/UI animation).
- **Scale honesty:** scene unit = 1 km; craft/pad true-scale; do not inflate the stack for “cinematics.”
- **Performance:** pad/chase cameras are the hot path; avoid full-scene real-time shadows without a tight focus frustum.
- **Hygiene:** `npm run typecheck`, `npm run lint`, `npm test`; commit + push finished units (`AGENTS.md`).

---

## Priority guide

| Priority | Theme | Why now |
|----------|--------|---------|
| **V0** | Lighting + Earth night | Helps every Earth shot on both missions |
| **V1** | Engines / burns by regime | Matches LOI + landing physics story |
| **V2** | Body atmosphere / surface | Limb, terminator, Moon low-sun |
| **V3** | Pad close-up | Trench + pad cams are first-class now |
| **V4** | Craft materials | Fin/gridfin cams need readable metal/tile |
| **V5** | Cinema (shadows / post) | Biggest jump; do after V0–V3 or risk thrash |
| **V6** | Terminal FX (dust / splash) | Both finales still thin vs pad/ascent |
| **V7** | Entry / belly-flop craft | Flight 13’s unique act; attitude already exists |
| **V8** | Recovery catch theater | Completes booster story Auto-cam sells |
| **V9** | Lunar site plate | Smooth Moon + label → place that reads |
| **V10** | Coast / LOI watchability | Longest scrub stretch; cheap overlays |
| **V11** | Pad horizon depth | **Done** — Sentinel-2 plate + Blue Marble |
| **V12** | Finale camera beats | Pair with V6/V7; multiplies FX |
| **V13** | Payload deploy theater | Flight 13’s unique mid-coast act; currently invisible |
| **V14** | Heat-shield experiment tiles | Flight 13 white / flap-metal tiles; fin-cam payoff |
| **V15** | Moon photo albedo | Optional V11 analogue (Clementine / LRO JPEG) |

---

## V0 — Lighting and Earth night — **done 2026-08-11**

### V0.1 Phase-aware lighting / fill / limb — **done**

- Soft **anti-sun fill** (`applyFillLight`) so night sides keep a readable silhouette.
- Stronger **Earth limb** shells + subtle **Moon limb** edge.
- Pad: **floods night-led**, restrained daytime fill (`earthTheater` floodBase).
- Cheap **Earthshine** on the Moon (`applyEarthshine`, dim bluish directional).

**Files:** `sunLight.ts`, `createScene.ts`, `bodies.ts`, mission theaters, `earthTheater.ts`.

### V0.2 Earth night lights / city glints — **done**

Procedural equirectangular city lights as `emissiveMap` (`makeEarthNightLightsTexture`). Metro clusters + corridor scatter; day side washed by sun.

**Files:** `textures.ts`, `bodies.ts`.

---

## V1 — Plume and engine realism by phase — **done 2026-08-11**

Raise credibility of burns without claiming CFD. Soft multi-layer **sprites**
(not geometric cones — those washed out pad/ship cams).

| Regime | Look |
|--------|------|
| Atmosphere ascent | Tighter, denser plume; max-Q condensation already exists |
| Vacuum / coast relight | Wider, sparser, more translucent |
| Hot-stage | Dual plumes more distinct (booster orange + ship blue lights) |
| LOI / landing | Stronger LOI scale/light; tighter cooler landing ship look |

Also shipped:

- Brief **gimbal** wobble + scrub-safe **thrust lag** (`plumeThrustLag`)
- **LOI visual beat**: ship LOI regime + trail linewidth/opacity during `approach` burn
- Detached-booster boostback vs landing regimes in `StagingFx`

**Files:** `plumeRegime.ts` (+ tests), `craft.ts`, `stagingFx.ts`, `toTheMoon.ts`.

---

## V2 — Body atmosphere and surface — **done 2026-08-11**

### Earth — **done**

- Soft **Rayleigh-ish limb** + thicker blue band near horizon — multi-shell Fresnel (`earthAtmosphere.ts`), day-weighted sun dir each frame
- Softer day/night **terminator** — `smoothstep` N·L in `MeshStandardMaterial` via `applySoftTerminator`
- Procedural **cloud deck later removed** (2026-08-13, #14) so Blue Marble land/ocean stay unobscured in LEO and system views. Do not re-add a drifting translucent shell unless explicitly requested.

### Moon — **done**

- Stronger **crater / highland / mare contrast** at low sun (deeper floors, rim + ejecta strokes, south-polar cues)
- Continuous **roughness** gradient (maria smoother → highlands rougher)
- Landing dust already present — pair later with craft shadow when V5 shadows land

**Files:** `earthAtmosphere.ts` (+ tests), `bodies.ts`, `textures.ts`.

---

## V3 — Starbase pad close-up — **done 2026-08-11**

Pad massing reads from altitude; trench + pad cams need density up close.

- ~~Scorch / water stains on OLM and apron~~ **done** (procedural scorch map, water decals, runoff trails, darkened OLM top)
- ~~Deluge sheets more volumetric (still scrub-driven)~~ **done** (3-tier steam ring + sheet curtains along trench)
- ~~Chopsticks / QD arm silhouette during prelaunch~~ **done** (thicker arms, carriage cheeks, QD bellows/face)
- ~~Heat haze over trench at ignition~~ **done** (additive shimmer sprites, peak early burn, scrub-safe)

**Files:** `earthTheater.ts` (`createStarbasePad`, `createPadSurroundings`, `createMechazillaTower`, `updateStarbaseLaunchFx`).

---

## V4 — Craft materials (fin / gridfin cams) — **done 2026-08-11**

- ~~Stainless **anisotropy / weld rings** more readable at fin cam~~ **done**
  (`MeshPhysicalMaterial` circumferential anisotropy + brush/weld maps; denser shiny torus weld rings with shadow companions)
- ~~Heat-shield edge wear only on windward side~~ **done**
  (edge-biased TPS texture + char gradients; windward trim/wear strips; flap tile wear)
- ~~Grid fins: clearer silhouette against sky for gridfin cam~~ **done**
  (dark outer frame, denser 6×6 lattice, thicker frame members)

**Files:** `craft.ts` (+ `craftMaterials.test.ts` layout contracts).

---

## V5 — Cinema — **done 2026-08-11**

### Soft shadows — **done**

Directional sun shadows for **pad + craft only** (tight ortho frustum re-centered on craft each frame via `updateSunShadowFocus`). Off above ~80 km so AU-scale views stay cheap. Log-depth friendly (light sits sunward of focus, not AU-scale).

### Light post stack — **done**

`EffectComposer` + mild `UnrealBloomPass` (high threshold → engines/Sun/floods) + `OutputPass`. Exposure adapts pad → LEO → deep space (`cinemaExposure`).

### Atmospheric haze by altitude — **done**

`groundSky` brownout tint on entry; star-dome opacity fades near pad and under brownout; blue sky shell still altitude-gated.

---

## Suggested sequencing (shipped)

1. ~~**V0.1 + V0.2** — lighting fill/limb + Earth night lights~~ **done**  
2. ~~**V1** — plume atmosphere vs vacuum + LOI/landing variants~~ **done**  
3. ~~**V3** — pad close-up (trench cam payoff)~~ **done**  
4. ~~**V2** — terminator / Moon low-sun polish~~ **done**  
5. ~~**V4** — craft materials as needed for fin/gridfin~~ **done**  
6. ~~**V5** — shadows / post only when the above is stable~~ **done**  
7. ~~**V11** — pad horizon / satellite surrounds plate~~ **done**

Shipped sequence (do not reopen unless a later slice regresses them):
V0 lighting/night → V1 plumes → V3 pad close-up → V2 limb/Moon → V4 craft materials → V5 cinema → V11 Blue Marble + Starbase plate.

---

## Next steps (locked 2026-08-13)

V0–V5 and V11 are **shipped**. Remaining work is the thin finales, Flight 13’s unique acts, recovery theater, then coast punctuation.

**Locked order for the next slices:**

1. **V6 — Terminal FX** — multi-layer lunar dust + ocean splash; fix scrub-unsafe site beacons  
2. **V7 — Entry / belly-flop craft** — tile heat, flap angles, bank-linked plasma  
3. **V8 — Recovery catch theater** — chopsticks close + Gulf site plate + contact flash  
4. **V9 — Lunar Malapert site plate** — local massif cues + engine wash + Moon-local shadows  
5. **V12 — Finale camera beats** — splash-horizon chase + wider lunar dust frame (may land alongside V6/V7)  
6. **V13 — Payload deploy theater** — Flight 13 Pez / Starlink V3 demo (currently no visual or timeline event)  
7. **V10 — Coast / LOI watchability** — trail punctuation, not new physics  

Then reassess. Heat-shield experiment tiles (V14) and a Moon photo albedo (V15) stay later unless a slice already in the craft/Moon files wants a small add-on.

---

## Remaining-code inventory (2026-08-13)

What the remaining items actually look like in the tree today — use this instead of re-discovering gaps.

| Slice | In place now | Gap |
|-------|--------------|-----|
| **V6 dust / splash** | One expanding `CircleGeometry` disc + site beacon/ring/label (`landingFx.ts`, `splashFx.ts`). Private `descentDust` / `landedDust` / `splashdownSpray` curves. **No unit tests.** | Single disc vs pad-deluge tiers. Site beacons pulse with `performance.now()` (breaks scrub). |
| **V7 entry craft** | Belly-flop attitude (`flight13Attitude` + `orientCraft`). Three additive plasma sprites, fixed local offsets (`entryFx.ts`). Flaps are static boxes, not named groups. Three generic tile-marker boxes. | No tile emissive from plasma. No AoA-driven flap angle. No bank-linked plasma trail. |
| **V8 recovery** | Kinematic gulf / chopsticks path (`boosterRecovery.ts`). Static `pad-chopstick-L/R` + carriage. Landing-burn plume + fade on detached booster. | Arms never close. No Gulf site plate. No catch contact flash. Grid fins stay deployed. |
| **V9 lunar site** | Beacon + Malapert label + the V6 dust disc on a smooth procedural Moon. | No local massif mesh. No engine wash. V5 shadows use `cameraAltitudeEarthKm`, so lunar landing has **no** craft shadow. |
| **V10 coast** | Kepler corridor overlay. `craftTrailStyle` is idle vs LOI-approach-burn only. | No perilune pulse, no Earth–Moon whisker, no mid-coast framing nudge. |
| **V12 finale cams** | Auto-cam splashdown / descent / landed are plain `CHASE`. Lunar descent is also `CHASE` with no `frameScale`. | No ocean-horizon ease. No wider dust-plate chase in the last ~30 s. |
| **V13 payload** | Public T+16:40–27:39 demo in `STARSHIP_13.md`. News ticker / timeline have **no** payload events. | Zero hatch, sats, or deploy trail. ~11 min of Flight 13 coast with no visual beat. |
| **V14 tiles** | Windward TPS wear (V4) + three `addOneTileMarker` spots. | No white “missing tile” paints, no metallic-side aft-flap tiles from the Flight 13 notes. |
| **V15 Moon photo** | Procedural canvas mare/crater albedo (`makeMoonTexture`). Earth already has Blue Marble. | Globe still reads “painted” next to photo Earth; optional theater JPEG only. |

Pattern to copy: `padLaunchFx.ts` / `plumeRegime.ts` — **pure helpers, no THREE**, unit-tested curves, impure `update*` applicator.

---

## V6 — Terminal FX: lunar dust + ocean splash

Both finales are still a beacon + one expanding disc after a strong pad/ascent stack. Highest dual-mission ROI.

### V6.0 Scrub-safe site chrome (do first in this slice)

`LandingFx.pulseBeacon` and `SplashFx.pulseBeacon` use `Math.sin(performance.now() * 0.004)`. That violates the scrub-safe agreement (wall-clock OK only for toast/UI). Drive opacity from `missionT` (same frequency is fine).

### V6.1 Multi-layer terminal look

Same tier idea as pad deluge (`padLaunchFx` 3-tier steam + sheets), not a particle system:

| Layer | Lunar dust | Ocean splash |
|-------|------------|--------------|
| Inner core | Warm tan disc, small, high opacity at contact | White spray disc, tight |
| Outer mist | Larger, lower opacity, slower expand | Cooler cyan mist ring |
| Vertical sheet | Brief additive column on touchdown (engine wash kicking regolith) | Brief water sheet / rooster-tail on splash |

Keyed to `alt` while descending and `missionT − landT` after contact. Touchdown **settle**: opacity spike at `landT` then exponential fade (extend existing `landedDust` / `splashdownSpray`).

Optional: a tiny local **water specular patch** at splash lat/lon (canvas disc, not an ocean sim) so the Indian Ocean site is not dry Blue Marble.

Craft-parented **shadow contact cue** only when V5 shadows are already on (Earth splash / pad). Lunar contact shadow waits for V9’s nearest-body cinema gate.

### V6.2 Extract pure look helpers

Move expand/opacity curves out of the THREE classes, matching `padLaunchFx`:

- `landingFxLook.ts` — `descentDust`, `landedDust`, `dustExpandOpacity`, `dustActive`, beacon pulse  
- `splashFxLook.ts` — `descentSpray`, `splashdownSpray`, `sprayExpandOpacity`, `nearSplash`, beacon pulse  

**Done when:**

- Three visible layers at contact on both missions; settle spike then fade.  
- Scrubbing across `landT` replays the same look (no wall-clock pulse).  
- Unit tests cover strength curves (pre-contact vs post-contact, alt gates, spike-then-fade).  
- No trajectory bake.

**Files:** `landingFx.ts`, `splashFx.ts`, new `*Look.ts` + tests, mission `applyState` if signatures change.

---

## V7 — Entry / belly-flop craft readability (Flight 13)

Physics and attitude already exist (`shipAttitudeMode`, `landingFlipBlend`, `entryPlasmaStrength`). Chase shots still read as a rigid prop with three additive plasma sprites.

### V7.1 Windward tile heat

Drive existing tile / `tileWear` **emissive** (and a char mix) from `entryPlasmaStrength`. Do **not** add more plasma sprites. Peak during entry, fall through descent, off after flip. Scrub-safe.

### V7.2 Flap / elevon articulation

Today `addFwdFlap` / `addAftFlap` parent meshes directly on the ship with baked rotations — they cannot animate.

- Name groups (`fwd-flap-L/R`, `aft-flap-L/R`) and rotate locally.  
- Pure `flapAngleFromAoA(aoaRad, phase, attitudeMode)` → hinge radians (forward vs aft may differ).  
- Belly-flop → flaps out; landing flip → trail toward engines-first; splash settle → modest droop.

### V7.3 Plasma corridor

`placeEntrySprites` uses fixed local offsets. Offset the trail sprite with entry **bank** (already in attitude) so chase matches news-ticker “plasma corridor” copy. Keep flicker on `missionT` (already scrub-safe).

**Done when:**

- Fin/chase cams show glowing windward tiles during entry without extra sprites.  
- Flaps move with phase/AoA; unit tests on the angle helper.  
- Plasma trail leans with bank.  
- No trajectory bake.

**Files:** `craft.ts`, `entryFx.ts`, `missions/flight13/orientCraft.ts`, `flight13Attitude.ts` (+ tests). White experiment tiles are **V14**, not this slice.

---

## V8 — Recovery catch theater (chopsticks + Gulf)

Completes the booster story Auto-cam already sells (gridfin → recovery). NEXT.md still flags chopsticks close as optional. Path is kinematic (`boosterRecovery.ts`); this slice is visual only — do not wait on physics F1.

### V8.1 Chopsticks close (lunar RTLS)

`pad-chopstick-L` / `pad-chopstick-R` / `pad-chopstick-carriage` exist and never move.

- Pure `chopstickCloseU(age, schedule)` → 0…1 as recovery phase → `caught` (`landingEndS`).  
- Rotate arms toward the booster; slight carriage settle.  
- Grid-fin **fold** on the detached booster in the last seconds of landing burn (optional, same slice if small).

### V8.2 Gulf site plate (Flight 13)

Reuse splash-site vocabulary at `GULF_LAND_LAT` / `GULF_LAND_LON` (~25.55°N, 96.15°W) so the offshore landing is not “vanish into ocean.” Beacon + ring + short label (“Gulf of America”); parent under Earth so it co-rotates. Procedural water/wake disc — not a new Sentinel plate.

### V8.3 Catch / land contact flash

Brief additive flash + landing-plume punch at `landingEndS` (reuse `boostbackFlash` vocabulary in `StagingFx`). Hold/fade already exist.

**Done when:**

- Lunar mission: arms visibly close around the booster at catch; scrub-stable.  
- Flight 13: gulf site is findable from Earth-cam / chase before booster fade.  
- Unit tests on `chopstickCloseU` / gulf site visibility gates.  
- No force-model recovery (that is PLAN.md F1).

**Files:** `earthTheater.ts`, `padLaunchFx.ts` or a small `recoveryFxLook.ts`, `stagingFx.ts`, `boosterRecovery.ts` (read-only schedule), Flight 13 bootstrap.

---

## V9 — Lunar site plate (Malapert close-up)

Lunar finale is still a smooth globe + HUD label. Do **after V6** so dust and plate compose.

### V9.1 Local massif (not DEM)

Small local mesh / canvas decals around the land point: darker floors, rim rings, polar shadow wedges. Same class as the Starbase procedural fallback — not LRO tiles. Keep the Malapert label.

### V9.2 Engine wash

Point light + dust brightening during descent burn (`burning && phase === "descent"`). Intensity from existing landing plume look; off after settle.

### V9.3 Nearest-body cinema (required for craft shadow)

V5 shadows and exposure use `cameraAltitudeEarthKm` in **both** mission loops. On lunar descent the camera is ~384_000 km from Earth, so `shadowsActive` is false and there is no craft contact shadow.

- Add `cameraAltitudeNearestKm` (Earth vs Moon, whichever body the camera is near).  
- Gate pad/craft sun shadows on **that** altitude (still off in deep space; on within ~80 km of a surface).  
- Re-center the ortho frustum on the craft at the Moon the same way as the pad.

**Done when:**

- Malapert reads as a place from chase in the last kilometer.  
- Descent burn lights the surface; dust (V6) sits on the plate.  
- Craft casts a shadow on the local plate near touchdown.  
- Cinema tests cover nearest-body altitude vs Earth-only.

**Files:** `landingFx.ts`, `textures.ts` or local canvas, `cinema.ts` (+ tests), lunar `loop.ts` / `applyState`.

---

## V10 — Coast / LOI / cislunar watchability

Longest scrub stretch; corridor already exists — add punctuation, not new physics. Do **after** finales so empty-coast work does not preempt splash/dust.

- `craftTrailStyle` today is idle vs LOI-approach-burn only (`frameDerive.ts`). Add a dimmer free-coast style and a **perilune approach pulse** (near-Moon, pre-`approach` burn).  
- Sparse mid-coast beats: Earth–Moon angle whisker on the corridor, Sun–craft terminator cue, optional bookmark-aligned Auto-cam nudge (do not fight Free orbit).  
- Keep deep-space bloom/exposure restrained so LOI plume/trail pops (`cinema.ts` already altitude-gates).

**Files:** `coastCorridor.ts`, `frameDerive.ts` (+ tests), lunar `applyState`, `autoCam.ts` / bookmarks, `cinema.ts`.

---

## V11 — Pad horizon / coastal depth — **done 2026-08-12**

Photo plate instead of procedural coastline glints:

- **Sentinel-2 cloudless** square (~40 km half-extent, inner hole at the OLM) parented under the pad, yawed so photo-north = geographic north, draped onto the globe. Soft square-rim alpha vs the globe; corners of the JPEG are used. Later widened to a full ~80 km square (2026-08-13).
- Procedural scrub + Earth-cam landmark rings remain the fallback if the JPEG is missing.
- **NASA Blue Marble** 4k equirectangular albedo on the globe (roughness derived from the photo; night lights stay procedural).

**Files:** `starbasePlate.ts` (+ tests), `earthTheater.ts`, `bodies.ts`, `public/textures/{earth_bluemarble_4k,starbase_surrounds}.jpg`.

---

## V12 — Chase / finale camera beats (pair with V6 / V7)

Multiplies terminal FX; alone does not fix thin discs. Safe to land in the same session as V6 or V7.

- Flight 13: `splashdown` / late `descent` Auto-cam stays chase but **lowers** the mount / favors ocean horizon (new `frameScale` or chase-height ease — not a new camera mode).  
- Lunar: slightly **wider** chase in the final ~30 s (`frameScale` ~1.4) so dust plate + ship share frame.  
- Do not disable Auto-cam; do not fight manual orbit.

**Files:** `autoCam.ts` (+ tests), `camera/modes.ts` if chase height needs a hook, mission loops.

---

## V13 — Flight 13 payload deploy theater

Public Flight 13 notes: **20 Starlink V3** sats, Pez-style deploy ~T+16:40–27:39, then demise on reentry ~20 min later. The theater has **no** payload event, ticker line, or mesh — the unique mid-coast act is a dead stretch.

Theater-grade only (not a constellation sim):

- Timeline + ticker beats (`payload-start` / `payload-complete`) from the public T+ table (or packed sample times if those land in the bake).  
- Hatch / Pez door on the ship (named group; open during the window).  
- ~20 small sat silhouettes peeling on a delayed trail, then fade before entry (scrub from `missionT` vs event times). Same suborbital path as the ship — no extra integrator.  
- Optional: six “camera sats” slightly distinct (white tile-imaging story in `STARSHIP_13.md`) if the hatch work is already open.

**Done when:**

- Scrubbing through the deploy window shows hatch + sats; outside it they are gone.  
- Unit tests on deploy strength / visibility vs `t`.  
- No new trajectory physics; do not wait on a pack change unless event times need baking.

**Files:** `timeline.ts`, `newsTicker.ts`, `craft.ts` or `payloadFx.ts`, Flight 13 `applyState`.

---

## V14 — Heat-shield experiment tiles (later)

Flight 13 notes: several tiles **painted white** (missing-tile imaging targets), tiles on the **metallic side of aft flaps**, modified aft-skirt attachments, load-sensing tiles. V4 wear is generic; `addOneTileMarker` is three gray boxes.

- A few high-contrast white TPS rectangles on the windward belly (fin-cam readable).  
- Tile patches on the stainless face of aft flaps.  
- Keep counts small; do not model load cells.

Fold into V7 only if that slice is already editing flap meshes; otherwise a follow-up after V7.

**Files:** `craft.ts`, `craftMaterials.test.ts`.

---

## V15 — Moon photo albedo (later, optional)

Earth has NASA Blue Marble; the Moon is still a procedural canvas. A single theater-grade JPEG (Clementine / LRO WAC, with procedural fallback) would be the V11 analogue — **not** a tile server or DEM.

Do after V9 so the local Malapert plate sits on photo terrain. Same asset rules as Blue Marble: commit a modest JPEG, document credit in `public/textures/ATTRIBUTION.txt`.

**Files:** `bodies.ts`, `textures.ts`, `public/textures/`.

---

## Definition of done (per visual slice)

For each merged unit of work:

1. Looks stay **theater-grade**; short comments (or README) note approximations.  
2. FX strength/pose from mission `t` / phase / alt / burn — **no** `performance.now()` in look helpers.  
3. Pure helpers + unit tests for new curves (same bar as `padLaunchFx` / `plumeRegime`).  
4. `npm run typecheck`, `npm run lint`, `npm test` (or `npm run ci`).  
5. Do **not** regenerate `src/data/*trajectory.json` unless the slice intentionally changes physics.  
6. Do not inflate craft/pad scale. Scene unit remains **1 km**.

---

## Out of scope (unless explicitly requested)

- Full PBR / DEM / tile-server Earth or Moon (committed theater-grade JPEGs are the exception: Blue Marble + Starbase plate now; optional Clementine/LRO Moon albedo is V15)
- Real-time volumetric clouds or full atmospheric scattering path
- Ops-grade plume CFD tables
- Non-deterministic particle systems that break scrubbing
- WebGPU-only post path (keep WebGL first-class)
- Inflating craft/pad scale for “cinematics”
- Full-scene shadows beyond the existing pad/craft frustum

---

## Changelog of this plan

| Date | Note |
|------|------|
| 2026-08-11 | Initial visual realism backlog for agents (from product discussion after LOI + watchability pass) |
| 2026-08-11 | V0.1 + V0.2 shipped: anti-sun fill, limbs, night pad floods, Earthshine, Earth night lights |
| 2026-08-11 | V1 shipped: regime multi-layer plumes, dual hot-stage lights, lag/gimbal, LOI trail beat |
| 2026-08-11 | V3 shipped: pad scorch/stains, volumetric deluge, chopsticks/QD silhouette, trench heat haze |
| 2026-08-11 | V2 shipped: Fresnel Earth limb, soft terminator, cloud contrast, Moon low-sun albedo/roughness |
| 2026-08-11 | V4 shipped: stainless anisotropy + weld rings, windward tile edge wear, denser grid fins |
| 2026-08-11 | V5 shipped: pad/craft shadows, mild bloom + exposure, star fade, entry brownout |
| 2026-08-12 | Post-V5 backlog: V6 terminal FX → V7 entry craft → V8 recovery catch → V9 lunar site; V10 coast, V12 finale cams |
| 2026-08-12 | V11 shipped: NASA Blue Marble Earth albedo + Sentinel-2 Starbase surrounds plate |
| 2026-08-13 | Starbase plate: wider ~80 km square (full JPEG, not a circular crop) |
| 2026-08-13 | Earth procedural cloud deck removed (#14); Blue Marble land/ocean unobscured |
| 2026-08-13 | Locked next visual slices: V6→V7→V8→V9→V12→V13→V10; inventory current-code gaps; add V13 payload, V14 experiment tiles, V15 Moon albedo |
