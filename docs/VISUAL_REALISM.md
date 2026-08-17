# Visual realism backlog

Living plan for **visual** improvements that raise credibility and watchability
while staying **theater-grade** (not flight-ops imagery or ops-grade CFD).

Scene unit remains **1 km**. Prefer small, focused diffs. FX must stay
**scrub-deterministic** (driven by mission time / state, not wall-clock only).

Related:

- [NEXT.md](./NEXT.md) — overall product roadmap (watchability, physics, architecture)
- [PLAN.md](../PLAN.md) — physics fidelity track
- [STARSHIP_13.md](./STARSHIP_13.md) — Flight 13 recap + webcast still SOP + highlight-clip sources (photorealism look target)
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

**Shipped (V14):** pink-magenta atmosphere / landing plumes, Super Heavy cryo frost + ice shed, denser ground-hugging pad steam with engine-warm core.

**Shipped (V13):** hexagonal TPS (grout + experiment / missing tiles), **S40** stencil, stainless oil-canning + heat tint, residual grout glow, wide onboard fin/gridfin FOV.

**Shipped (V15):** magenta/violet entry plasma (belly + flap leading edges), violet tile fill; residual grout into descent stays warm.

**Shipped (V16):** Pez hatch + ~20 Starlink V3 silhouettes + payload ticker/scrub beats.

**Shipped (V17):** white splash steam + warm core, ocean glitter on splash/Gulf plates, wet hull roughness punch.

**Shipped (V18):** engine-bay MLI / plumbing / skirt ribs / bell stencil IDs; mild fisheye + grain on fin/gridfin only.

**Shipped (V19):** altitude-gated LEO cloud shell + ocean sun-glint; Earth-cam stays cloudless Blue Marble (#14).

**Next (photorealism):** optional Moon albedo. See **V20**.

Key modules: `src/scene/{bodies,craft,craftFrost,earthTheater,starbasePlate,earthAtmosphere,cinema,textures,sunLight,groundSky,stagingFx,entryFx,landingFx,splashFx,terminalFx,gulfLandFx,padRecoveryFx,padLaunchFx,plumeRegime,coastCorridor,engineBay,onboardPost,leoClouds}.ts`.

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
| **V13** | Hull-cam materials | **Done** — hex TPS, S40, oil-canning, wide fin-cam FOV |
| **V14** | Ascent plume / frost / steam | **Done** — pink-magenta atmo plumes, Super Heavy frost, denser pad steam |
| **V15** | Entry plasma palette | **Done** — magenta/violet flap wrap + violet tile fill |
| **V16** | Payload Pez deploy | **Done** — hatch + sat silhouettes + ticker beats |
| **V17** | Splash / ocean steam | **Done** — white contact cloud + glitter + wet hull |
| **V18** | Engine-bay / onboard | **Done** — MLI, stencil IDs, mild fisheye on fin/gridfin |
| **V19** | LEO Earth from hull-cam | **Done** — gated cloud shell + ocean glitter (does not undo #14) |
| **V20** | Moon photo albedo | Later / optional — lunar V11 analogue |

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
- Ship silhouette pass: lathe tangent ogive (tip +Z), flush cylinder weld bands (no hovering tori on the nose), Block 2 trapezoid flaps at public span/chord.
- ~~Heat-shield edge wear only on windward side~~ **done**
  (edge-biased TPS texture + char gradients; windward trim/wear strips; flap tile wear)
- ~~Grid fins: clearer silhouette against sky for gridfin cam~~ **done**
  (dark outer frame, denser 6×6 lattice, thicker frame members)

**Files:** `craft.ts` (+ `craftMaterials.test.ts`, `craftGeometry.test.ts`).

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

**Next (photorealism vs Flight 13 stills):**

14. ~~**V13** — hex TPS / S40 / oil-canning / experiment tiles (every fin/hull cam)~~ **done**  
15. ~~**V14** — pink-magenta atmosphere plumes + cryo frost/ice + denser pad steam~~ **done**  
16. ~~**V15** — magenta/violet entry plasma on flap leading edges~~ **done**  
17. ~~**V16** — Flight 13 Pez / Starlink V3 deploy theater~~ **done**  
18. ~~**V17** — splash steam + ocean glitter (ship + Super Heavy gulf)~~ **done**  
19. ~~**V18** — engine-bay interior + onboard-cam post (fin/gridfin)~~ **done**  
20. ~~**V19** — altitude-gated LEO cloud shell + glitter (not a globe cloud deck)~~ **done**  
21. **V20** — optional Moon albedo JPEG (after V9 plate; not Flight 13)

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
- **Gulf splash site plate** (beacon/ring like splash) at gulf lat/lon so the hard splash isn’t “vanish into ocean.”
- Brief catch/land contact flash on booster (reuse staging flash vocabulary).
- Cross-section legend follows the HUD recovery profile (`liftoff → Gulf splash` vs chopsticks).

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

- Flight 13: brief aerial splash chase, then a low sea-level **recovery drone** orbit of the floating ship through T+1:10 (webcast analog).
- Lunar: last ~30 s of descent (same phase) nudges `frameScale` ~1.35–1.6 once via `lunarFinaleShouldCut`.

**Files:** `autoCam.ts` (+ tests), `camera/modes.ts` (`setChaseBias`), mission `applyState`.

---

## Photorealism track (V13+) — Flight 13 webcast stills

V0–V12 made the theater **watchable**. These slices raise **photorealism** against
the official Flight 13 X-replay stills, still theater-grade (sprites, canvas
maps, scrub-safe curves — not CFD, DEM, or a second renderer).

**Reference pack:** `assets/flight13-webcast/` (catalog + theater-camera mapping
in that folder’s README). Development reference only — **not** runtime textures;
do not copy frames into `public/` or `src/`. Capture SOP:
[STARSHIP_13.md](./STARSHIP_13.md). If the pack is not in the tree yet, use the
replay URL in that SOP.

**Motion source (landing / splash):** official @SpaceX highlight post
https://x.com/SpaceX/status/2082186658162626898 — two 4K clips of landing
burn and splashdown (posted 2026-07-28). Recorded for later refinement
(especially **V17**); do not ship as runtime video.

Hull-cam / fin-cam stills are the majority of the broadcast. **V13 first** so
later FX sit on a hull that already reads as S40.

### Still → gap → slice

| Stills (HUD `T+`) | What the frame shows | Theater today | Slice |
|---|---|---|---|
| T−42 pad wide, T−2 ignition, T+0 liftoff | Opaque ground-hugging cryo/deluge steam, engine orange in the cloud, chopsticks open | V3 multi-tier steam sprites — thinner, less self-shadowed | V14 |
| T+16 tracking + engines-down, T+56 max-Q hull | **Pink-magenta** atmospheric plume, ice/frost shed, Boca Chica under haze | `BOOSTER_ATMO` rim is orange `[1, 0.45, 0.18]`; condensation cloud only | V14 |
| T+2:38–8:21 hull / SECO / coast (`S40`) | Hexagonal TPS, oil-canning stainless, **S40** stencil, Earth limb | **V13** hex TPS + S40 + oil-canning; Earth limb is V2 / V19 | V13 |
| T+2:21 hot-stage split, T+4:32–5:50 engine bay | Raptor bells + MLI foil, stencil IDs, fisheye, lens dirt/flare | Exterior bells only; no bay interior or onboard post | V18 |
| T+5:14 gridfin-Earth, T+6:26–6:40 SH over ocean | Craft shadow on clouds, ocean **sun-glint** glitter path | **V19** gated LEO clouds + glitter (Earth-cam stays cloudless); Gulf plate glitter is V17 | V17 / V19 |
| T+16:46–27:39 payload | Pez door + Starlink V3 receding, then empty bay | No payload event, hatch, or sat meshes | V16 |
| T+39:03 relight, T+47:25–48:53 entry | Magenta/violet plasma on **flap leading edges**, grain, bloom | Orange sprites (`0xffcc88` / `0xff6622` / `0xff4400`) + orange tile emissive | V15 |
| T+1:02:19 transonic, T+1:04:55–1:05:12 landing | Heat-tint steel, tile-gap glow, missing/white tiles, pink landing plume | **V13** heat-tint / hex / missing+white tiles; **V14** pink landing plume | V13 / V14 / V15 |
| T+1:05:20–24 splash + post-splash TPS | Volumetric steam/spray, intact hexagonal heatshield in the water | Cyan spray discs + site beacon (`splashFx.ts`) | V17 |

### Working agreements (photorealism)

Same as the top of this file, plus:

- Compare the slice against the **named stills** in the table, not a generic “more detail” instinct.
- Procedural / GPU-cheap first. Stills are a look target, not an asset to drape.
- Do not clone the SpaceX webcast HUD (engine-dot grid, attitude bug, `VIEWS BY STARLINK`).
- Keep WebGL first-class; onboard grain/fisheye only on fin/gridfin (V18), not every camera.

---

## V13 — Hull-cam materials (hex TPS, S40, oil-canning) — **done 2026-08-15**

Highest ROI: almost every still after tower-clear is a hull or flap close-up.
V4 already had anisotropy + weld rings + edge wear; the stills still beat the
mesh on **tile shape**, **hull identity**, and **panel ripple**.

### V13.1 Hexagonal TPS — **done**

`paintTileField` was a brick-offset rectangle field labeled “hex-ish.” Webcast
TPS is a clear **hex grid** (coast `S40`, transonic flap, post-splash close-up).

- Canvas pointy-top hex cells with per-tile albedo/roughness jitter and grout.
- Windward-only coverage (existing TPS arc); stainless leeward stays metal.
- Readable at fin cam without a geometry explosion (texture, not 20k meshes).

### V13.2 Hull identity + oil-canning — **done**

- **S40** decal on the stainless barrel (Flight 13 stills). Lunar stack shares
  the same ship mesh / mark.
- Stainless maps: low-frequency **panel oil-canning** bump + heat-tint bands
  that break cylindrical reflections. Still `MeshPhysicalMaterial` anisotropy.
- Fin / gridfin mounts use a wider onboard FOV (`onboardFov.ts`) so the hull +
  Earth limb match the webcast crop.

### V13.3 Experiment / missing tiles — **done**

- High-contrast white hexes on the windward belly + a `00` stencil.
- Missing-tile holes (dark underlayer, not gray boxes).
- Small tile patches on the stainless side of aft flaps.
- Residual **grout glow** into descent (`tileGroutGlow`) so T+1:04:55 keeps
  warm tile-gap light without extra sprites.

**Done when:** fin-cam at SECO/coast reads as hexagonal TPS + S40 + rippled
steel vs the T+8:21 still; experiment tiles visible at landing-approach
(T+1:04:55). Unit tests on tile-layout / marker counts. No bake.

**Files:** `craftHullMaps.ts` (+ tests), `craft.ts`, `onboardFov.ts` (+ tests).

---

## V14 — Ascent plume, frost, pad steam — **done 2026-08-15**

V1 plumes are multi-layer sprites with the **wrong atmospheric color**. Stills
at T+16 and T+56 are pink-white cores with magenta rims, not orange cones.
Pad stills at T−42 / T+0 are a dense, opaque steam volume with engine glow
inside.

### V14.1 Atmosphere / landing palette — **done**

Retune `BOOSTER_ATMO`, `BOOSTER_LANDING`, ship-in-atmosphere, hot-stage, and
boostback looks in `plumeRegime.ts`: core near-white, rim **pink–magenta**.
Keep vacuum / LOI cooler. Landing-burn stills (T+1:05:02–12, Super Heavy
T+6:40) use the same pink family. Tests on `plumeLook` RGB bands so the
palette cannot silently regress to orange.

### V14.2 Cryo frost + ice shed — **done**

Webcast: frost sheets on the booster at T+0; flakes and mist peeling at T+16.

- Prelaunch/ascent frost patches on Super Heavy (albedo/roughness, scrub from
  `t` / phase — gone by vacuum).
- Sparse ice-flake sprites during dense-atmosphere burn (mission-`t` seeded,
  not `performance.now()`). Same sprite vocabulary as `condense-cloud`.

### V14.3 Pad steam punch — **done**

V3 deluge is the right *structure* (tiers + sheets). Stills want **more
opacity**, ground-hug, and a warm core where 33 engines light the cloud
(T+0). Tightened `padLaunchFx` scales/opacity; extra ground-hugging sheets;
steam tints orange-pink with flame strength. Not a particle sim.

**Done when:** trench/chase at T+16 is pink, not orange; pad at T+0 steam
reads opaque; frost/ice visible on scrub through liftoff→max-Q. No bake.

**Files:** `plumeRegime.ts` (+ tests), `craftFrost.ts` (+ tests), `craft.ts`,
`padLaunchFx.ts` (+ tests), `earthTheater.ts`.

---

## V15 — Entry plasma (magenta / violet, flap wrap) — **done 2026-08-16**

V7 already drove tile emissive from `entryPlasmaStrength` and banked the
trail. Stills at T+47:25 / T+48:53 are **purple-white leading-edge
envelopes**, not an orange belly shell.

### V15.1 Palette — **done**

- `PLASMA_SPRITE_BUILD` + canvas stops: hot core near-white, sheath violet,
  trail deep magenta (`B > G`, not orange).
- Tile fill via `entryHeatEmissiveRgb`: violet while plasma is hot; residual
  `tileGroutGlow` into descent stays warm (T+1:04:55).
- Relight (T+39:03) stays off — gated by `entryPlasmaStrength` before entry.

### V15.2 Flap leading-edge wrap — **done**

- Shared `flapEdge` pose from strength × flicker.
- One additive sprite per `fwd-flap-L/R` and `aft-elevon-L/R` pivot so edges
  ride V7 hinge throw. Belly bank skew unchanged.

**Done when:** entry chase/fin at ~80 km matches the magenta stills; tile
emissive is violet not orange; `entryPlasma` tests cover color + flap-edge
visibility. No bake.

**Files:** `entryPlasma.ts` (+ tests), `entryFx.ts`, `craft.ts`, Flight 13
`bootstrap.ts`.

---

## V16 — Flight 13 payload deploy theater — **done 2026-08-16**

Public timeline: Pez deploy **T+16:40–27:39**, 20 Starlink V3. Theater had no
hatch, sats, or ticker beat.

- Timeline + ticker: `payload-start` / `payload-complete` at `F13.PAYLOAD_*`
- Named Pez door on the leeward mid-barrel; open during the window
- 20 sat silhouettes peeling on a delayed craft-local trail, then fade
- Pure `payloadDeployStrength` / hatch / sat pose tests

**Files:** `payloadDeploy.ts` (+ tests), `payloadFx.ts`, `timeline.ts`,
`newsTicker.ts`, `scrubEvents.ts`, Flight 13 `bootstrap` / `applyState`.

---

## V17 — Splash steam and ocean glitter — **done 2026-08-16**

V6 splash was cyan discs + site beacon. Stills at T+1:05:20–24 are a **white
volumetric contact cloud**; Super Heavy T+6:40 is an ocean glitter path.

- Denser/whiter splash layers + warm inner core; Gulf plate shares glitter
- Altitude-gated sun-glint sprites on splash / Gulf sites
- Post-contact wet/charred hull roughness punch (`hullWetStrength`)

**Files:** `terminalFx.ts` (+ tests), `terminalSiteFx.ts`, `splashFx.ts`,
`gulfLandFx.ts`, `craft.ts`.

---

## V18 — Engine-bay and onboard-cam look — **done 2026-08-16**

Hot-stage and booster stills are **split engine-bay / hull**. Theater gridfin
cam previously saw exterior bells and a 6×6 lattice, not the bay.

### V18.1 Engine-bay interior — **done**

- Thrust puck + open sleeve above the bells; plumbing between rings
- Crinkled gold/amber MLI foil canvas on cavity patches
- Inner-skirt ribs; outer-ring stencil IDs including `142` / `150` / `158`
- Group `engine-bay` parented on the booster (survives StagingFx detach)

### V18.2 Onboard post — **done**

- Mild barrel + UV-hashed grain + static dirt `ShaderPass`
- Gated to **fin + gridfin only** (`onboardPostEnabled`); hull keeps wide FOV
- Off for trench / pad / chase / Earth / Sun / Free

**Done when:** gridfin at hot-stage / boostback shows bay structure vs empty
skirt; fin-cam has a slight onboard character without breaking pad/Earth
cams. No bake.

**Files:** `engineBay.ts` (+ tests), `onboardPost.ts` (+ tests), `craft.ts`,
`cinema.ts`, Flight 13 / lunar `loop.ts`.

---

## V19 — LEO Earth from hull-cam (gated clouds + glitter) — **done 2026-08-16**

#14 removed the procedural **globe** cloud deck so Blue Marble land/ocean stay
visible from Earth-cam. Hull-cam stills (T+2:38, T+8:21, T+1:02:19) still need
**cloud depth** and a bright limb; Super Heavy over water needs glitter (pairs
with V17).

- Thin high-altitude cloud **shell**, visible from LEO hull/fin/chase, **hidden**
  for Earth-cam / low pad so #14 stands.
- Cheap sun-path glitter on a slightly lower shell from those same cameras.
- Not a tile-server, not real-time volumetric Mie, not a full-sphere overlay.

**Done when:** coast hull-cam shows broken cloud over ocean; Earth-cam globe
stays cloudless Blue Marble. Tests on the visibility gate. No bake.

**Files:** `leoClouds.ts` (+ tests), `bodies.ts`, Flight 13 / lunar `loop.ts`.

---

## V20 — Moon photo albedo (later, optional)

Earth has NASA Blue Marble; the Moon is still a procedural canvas. A single
theater-grade JPEG (Clementine / LRO WAC, procedural fallback) is the V11
analogue — **not** a tile server or DEM.

Do after V9 so the local Malapert plate sits on photo terrain. Same asset
rules as Blue Marble: modest JPEG, credit in `public/textures/ATTRIBUTION.txt`.
Not driven by the Flight 13 stills.

**Files:** `bodies.ts`, `textures.ts`, `public/textures/`.

---

## Out of scope (unless explicitly requested)

- Full PBR / DEM / tile-server Earth or Moon (committed theater-grade JPEGs
  are the exception: Blue Marble + Starbase plate now; optional Clementine/LRO
  Moon albedo is V20)
- Draping webcast stills as runtime textures (copyright; keep them in
  `assets/` as look reference)
- Cloning the SpaceX webcast HUD
- Real-time volumetric clouds or a full atmospheric scattering path (V19 is a
  cheap gated shell only — do not reverse #14’s globe cloud deck)
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
| 2026-08-16 | Ship silhouette: lathe ogive, flush barrel weld bands, Block 2 trapezoid flaps |
| 2026-08-11 | V5 shipped: pad/craft shadows, mild bloom + exposure, star fade, entry brownout |
| 2026-08-12 | Post-V5 backlog: V6 terminal FX → V7 entry craft → V8 recovery catch → V9 lunar site; V10 coast, V12 finale cams |
| 2026-08-12 | V11 shipped: NASA Blue Marble Earth albedo + Sentinel-2 Starbase surrounds plate |
| 2026-08-13 | Starbase plate: wider ~80 km square (full JPEG, not a circular crop) |
| 2026-08-13 | V6–V10 + V12 shipped: terminal dust/splash, F13 entry craft, recovery catch, Malapert plate, finale Auto-cam, coast whiskers/LOI bloom |
| 2026-08-15 | Photorealism track V13–V20 from Flight 13 webcast stills: hex TPS/S40, pink plumes, magenta plasma, Pez deploy, splash steam, engine-bay, gated LEO clouds |
| 2026-08-15 | V14 shipped (launch scene): pink-magenta atmo/landing plumes, Super Heavy frost + ice shed, denser pad steam with engine-warm core |
| 2026-08-15 | V13 shipped (fin / hull cam): hex TPS, S40, oil-canning + heat tint, experiment / missing tiles, wide onboard FOV |
| 2026-08-15 | Recorded official Flight 13 landing/splash highlight videos (X post 2082186658162626898) as a future visual-refinement source |
| 2026-08-16 | V15 shipped: magenta/violet entry plasma (belly + flap edges), violet tile fill, warm residual grout |
| 2026-08-16 | V16 shipped: Pez hatch + 20 Starlink V3 silhouettes + payload ticker/scrub beats |
| 2026-08-16 | V17 shipped: white splash steam, ocean glitter, wet hull roughness |
| 2026-08-16 | V18 shipped: engine-bay MLI/plumbing/ribs/stencil IDs; mild fisheye+grain on fin/gridfin |
| 2026-08-16 | V19 shipped: altitude-gated LEO cloud shell + ocean glitter; Earth-cam stays cloudless Blue Marble |
