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
| **FX** | Staging fallaway/flash, boostback flash, entry plasma, multi-layer lunar dust, ocean splash, Gulf catch plate |
| **Cameras** | Trench, pad, chase (look-ahead/bank/finale bias), fin/gridfin, Auto-cam profiles (lunar + Flight 13) |
| **Overlays** | Trails (phase-reactive), orbit grids, Kepler corridor, cislunar beat whiskers, locators |

**Shipped (V0):** soft anti-sun fill, stronger Earth/Moon limb, night-led pad floods, Earthshine on Moon, procedural Earth night lights.

**Shipped (V1):** regime-specific multi-layer plumes (atmosphere denser/tighter, vacuum wider/sparser, LOI + landing ship looks), dual hot-stage lights, scrub-safe thrust lag + gimbal wobble.

**Shipped (V2):** Fresnel Rayleigh-ish multi-shell Earth limb, soft surface terminator, higher-contrast cloud deck, Moon mare/highland + crater-rim contrast for low sun, continuous lunar roughness.

**Shipped (V3):** pad close-up — scorch/water stains, multi-tier deluge + sheets, chopsticks/QD silhouette, trench heat haze.

**Shipped (V4):** stainless anisotropy + weld rings, windward heat-shield edge wear, denser high-contrast grid fins for fin/gridfin cams.

**Shipped (V5):** tight pad+craft sun shadows, mild bloom + altitude exposure, star-dome fade, entry brownout haze.

**Shipped (V11):** NASA Blue Marble Earth albedo + Sentinel-2 Starbase surrounds plate.

**Shipped (V6–V10, V12):** terminal dust/splash, Flight 13 entry craft, recovery catch, lunar Malapert plate, finale Auto-cam beats, coast watchability.

Key modules: `src/scene/{bodies,craft,earthTheater,starbasePlate,earthAtmosphere,cinema,textures,sunLight,groundSky,stagingFx,entryFx,landingFx,splashFx,terminalFx,gulfLandFx,padRecoveryFx,coastCorridor}.ts`.

---

## Working agreements

- **Theater vs ops:** document approximations in README or short code comments when adding “realistic-looking” FX.
- **Procedural first:** prefer canvas / GPU-cheap materials over huge DEM/satellite assets unless an explicit asset pipeline is accepted. Committed theater-grade JPEGs (NASA Blue Marble globe + Sentinel-2 Starbase plate, with procedural fallback) are the accepted exception — not a tile server or DEM.
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
| **V6** | Terminal FX (dust / splash) | **Done** — both finales denser than a single disc |
| **V7** | Entry / belly-flop craft | **Done** — tile glow, hinged flaps, banked plasma |
| **V8** | Recovery catch theater | **Done** — Gulf plate, catch flash, chopsticks close |
| **V9** | Lunar site plate | **Done** — local Malapert mesh, wash, Moon-near shadows |
| **V10** | Coast / LOI watchability | **Done** — trail dim/pulse, whiskers, LOI bloom |
| **V11** | Pad horizon depth | **Done** — Sentinel-2 plate + Blue Marble |
| **V12** | Finale camera beats | **Done** — Auto-cam splash + last-30s lunar widen |

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
- Cloud deck: higher core/edge contrast + opacity for LEO

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

## Suggested sequencing (concrete)

1. ~~**V0.1 + V0.2** — lighting fill/limb + Earth night lights~~ **done**  
2. ~~**V1** — plume atmosphere vs vacuum + LOI/landing variants~~ **done**  
3. ~~**V3** — pad close-up (trench cam payoff)~~ **done**  
4. ~~**V2** — terminator / Moon low-sun polish~~ **done**  
5. ~~**V4** — craft materials as needed for fin/gridfin~~ **done**  
6. ~~**V5** — shadows / post only when the above is stable~~ **done**  

**Next (post-V5):**

7. ~~**V6** — terminal dust + splash (both missions)~~ **done**  
8. ~~**V7** — Flight 13 entry / belly-flop craft readability~~ **done**  
9. ~~**V8** — chopsticks catch + Gulf site plate~~ **done**  
10. ~~**V9** — lunar Malapert site plate (after V6 dust)~~ **done**  
11. ~~**V12** — finale camera beats alongside V6/V7~~ **done**  
12. ~~**V10** — coast watchability when long scrub feels empty~~ **done**  
13. ~~**V11** — pad horizon / satellite surrounds plate~~ **done** (see below)

---

## V6 — Terminal FX: lunar dust + ocean splash — **done 2026-08-13**

Both finales were a beacon + expanding disc (`landingFx.ts`, `splashFx.ts`) after a strong pad/ascent stack.

- Multi-layer scrub-safe rings/sprites (inner spray, outer mist, brief vertical sheet) keyed to `alt` / `missionT − landT` — same tier pattern as pad deluge (`terminalFx.ts`).
- Touchdown settle: brief opacity spike then exponential fade.
- Cheap dark contact disc under the craft at very low altitude (not a new shadow frustum).

**Files:** `terminalFx.ts` (+ tests), `landingFx.ts`, `splashFx.ts`.

---

## V7 — Entry / belly-flop craft readability (Flight 13) — **done 2026-08-13**

Physics and attitude already existed; chase shots still read as a rigid prop with additive plasma sprites.

- Windward tile **emissive / char** intensity driven by `entryPlasmaStrength` (scrub-safe), not more plasma sprites.
- Flap / elevon angle from AoA / phase so belly-flop reads as control surfaces (`fwd-flap-L/R`, `aft-elevon-L/R`).
- Slight plasma trail asymmetry + bank-linked offset so chase matches news-ticker “plasma corridor” copy.

**Files:** `craft.ts`, `entryFx.ts`, `flight13Attitude.ts`, Flight 13 `applyState`.

---

## V8 — Recovery catch theater (chopsticks + Gulf) — **done 2026-08-13**

Completes the booster story Auto-cam already sells (gridfin → recovery).

- Scrub-driven **chopsticks close** + carriage settle when recovery phase → `caught` (chopsticks profile only; Flight 13 gulf stays open).
- **Gulf soft-land site plate** (beacon/ring like splash) at gulf lat/lon so offshore landing isn’t “vanish into ocean.”
- Brief catch/land contact flash on booster (reuse staging flash vocabulary).
- Cross-section legend follows the HUD recovery profile (`liftoff → Gulf soft-land` vs chopsticks).

**Files:** `padRecoveryFx.ts`, `gulfLandFx.ts`, `earthTheater.ts`, `stagingFx.ts`, Flight 13 bootstrap.

---

## V9 — Lunar site plate (Malapert close-up) — **done 2026-08-13**

Lunar finale was a smooth globe + HUD label. Done after V6 so dust and plate compose.

- Local procedural “massif” cues: darker floors, rim rings, polar shadow wedges around land point (canvas/decals on a small local mesh — not DEM).
- Landing-light / engine wash on surface during descent burn (point light + dust brightening).
- Cinema shadow focus uses the nearer of Earth/Moon altitude; the local plate (not the whole Moon sphere) receives shadows.

**Files:** `landingFx.ts`, lunar `loop.ts` / `applyState`, `cinema.ts` (`cameraAltitudeMoonKm`, `shadowAltitudeKm`).

---

## V10 — Coast / LOI / cislunar watchability — **done 2026-08-13**

Longest scrub stretch; corridor already existed — punctuation, not new physics.

- Phase-reactive trail: coast dim, LOI/`approach` burn punch, perilune approach pulse (`craftTrailStyle`).
- Sparse mid-coast beats: Earth–Moon angle whisker + sun-craft terminator tick (hidden near Earth), toggled with orbit overlay (O).
- Restrained deep-space bloom with a small LOI punch when `phase === "approach"` and burning.

**Files:** `coastCorridor.ts` (+ tests), `frameDerive.ts`, lunar `applyState` / `bootstrap`, `cinema.ts`.

---

## V11 — Pad horizon / coastal depth — **done 2026-08-12**

Photo plate instead of procedural coastline glints:

- **Sentinel-2 cloudless** square (~40 km half-extent, inner hole at the OLM) parented under the pad, yawed so photo-north = geographic north, draped onto the globe. Soft square-rim alpha vs the globe; corners of the JPEG are used.
- Procedural scrub + Earth-cam landmark rings remain the fallback if the JPEG is missing.
- **NASA Blue Marble** 4k equirectangular albedo on the globe (roughness derived from the photo; night lights stay procedural).

**Files:** `starbasePlate.ts` (+ tests), `earthTheater.ts`, `bodies.ts`, `public/textures/{earth_bluemarble_4k,starbase_surrounds}.jpg`.

---

## V12 — Chase / finale camera beats (pair with V6 / V7) — **done 2026-08-13**

Multiplies terminal FX; Auto-cam only (does not fight Free orbit).

- Flight 13: slightly larger splashdown `frameScale` plus a modest chase look-down / look-ahead bias so the ocean horizon reads.
- Lunar: last ~30 s of descent (same phase) nudges `frameScale` ~1.35–1.6 once via `lunarFinaleShouldCut`.

**Files:** `autoCam.ts` (+ tests), `camera/modes.ts` (`setChaseBias`), mission `applyState`.

---

## Out of scope (unless explicitly requested)

- Full PBR / DEM / tile-server Earth or Moon (the committed Blue Marble + Starbase JPEGs are the theater-grade exception)
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
| 2026-08-13 | V6–V10 + V12 shipped: terminal dust/splash, F13 entry craft, recovery catch, Malapert plate, finale Auto-cam, coast whiskers/LOI bloom |
