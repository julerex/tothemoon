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
| **Bodies** | Canvas Earth (clouds, atmo limb) + Moon (albedo/roughness); true radii |
| **Sky** | NASA SVS star map, ecliptic-aligned dome |
| **Lighting** | Ephemeris directional sun (`sunLight.ts`); Flight 13 daytime pad fill; ground-sky shell for low altitude |
| **Pad** | OLP-2-inspired hardstand, tanks, Mechazilla, trench, deluge/vent steam, flood logic |
| **Craft** | Near-true Super Heavy + Ship, tiles, Raptors, multi-layer plumes, hot-stage, condensation |
| **FX** | Staging fallaway/flash, boostback flash, entry plasma, lunar dust, ocean splash |
| **Cameras** | Trench, pad, chase (look-ahead/bank), fin/gridfin, Auto-cam profiles (lunar + Flight 13) |
| **Overlays** | Trails, orbit grids, Kepler corridor, locators |

**Shipped (V0):** soft anti-sun fill, stronger Earth/Moon limb, night-led pad floods, Earthshine on Moon, procedural Earth night lights.

**Not yet:** soft shadows, post/bloom stack, strong regime-specific plumes, dense pad close-up wear.

Key modules: `src/scene/{bodies,craft,earthTheater,textures,sunLight,groundSky,stagingFx,entryFx,landingFx,splashFx}.ts`.

---

## Working agreements

- **Theater vs ops:** document approximations in README or short code comments when adding “realistic-looking” FX.
- **Procedural first:** prefer canvas / GPU-cheap materials over huge DEM/satellite assets unless an explicit asset pipeline is accepted.
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

## V1 — Plume and engine realism by phase

Raise credibility of burns without claiming CFD.

| Regime | Look |
|--------|------|
| Atmosphere ascent | Tighter, denser plume; max-Q condensation already exists |
| Vacuum / coast relight | Wider, sparser, more translucent |
| Hot-stage | Dual plumes more distinct (booster residual + ship) |
| LOI / landing | Different color/opacity/scale than ascent; optional engine light |

Also:

- Brief **gimbal** or slight plume lag so burns feel mechanical
- Stronger **LOI visual beat** now that capture is in the pack (plume + trail emphasis during `approach`)

**Likely files:** `craft.ts` (`updateCraftVisuals`), `stagingFx.ts`, mission phase flags from HUD/sample.

---

## V2 — Body atmosphere and surface

### Earth

- Soft **Rayleigh-ish limb** + thicker blue band near horizon
- Softer day/night **terminator** (scatter, not a hard cut)
- Cloud deck: increase contrast only where it helps LEO

### Moon

- Stronger **crater / highland contrast** at low sun (landing is waning gibbous)
- Slight roughness variation (maps already present)
- Landing: dust exists — pair later with craft shadow if shadows land

**Likely files:** `textures.ts`, `bodies.ts`, `landingFx.ts`.

---

## V3 — Starbase pad close-up

Pad massing reads from altitude; trench + pad cams need density up close.

- Scorch / water stains on OLM and apron
- Deluge sheets more volumetric (still scrub-driven)
- Chopsticks / QD arm silhouette during prelaunch
- Heat haze over trench at ignition

**Likely files:** `earthTheater.ts`, launch FX update path.

---

## V4 — Craft materials (fin / gridfin cams)

- Stainless **anisotropy / weld rings** more readable at fin cam
- Heat-shield edge wear only on windward side
- Grid fins: clearer silhouette against sky for gridfin cam

**Likely files:** `craft.ts`.

---

## V5 — Cinema (do later)

### Soft shadows

Directional sun shadows for **pad + craft only** (tight shadow camera around focus). Huge for trench/pad realism; careful with AU-scale + logarithmic depth.

### Light post stack

Mild bloom on engines/Sun; slight exposure adaptation pad → space. Stay subtle.

### Atmospheric haze by altitude

Extend `groundSky`: fade stars near horizon, brownout on entry, blue sky only in atmosphere.

---

## Suggested sequencing (concrete)

1. ~~**V0.1 + V0.2** — lighting fill/limb + Earth night lights~~ **done**  
2. **V1** — plume atmosphere vs vacuum + LOI/landing variants  
3. **V3** — pad close-up (trench cam payoff)  
4. **V2** — terminator / Moon low-sun polish  
5. **V4** — craft materials as needed for fin/gridfin  
6. **V5** — shadows / post only when the above is stable  

---

## Out of scope (unless explicitly requested)

- Full PBR satellite Earth/Moon phototextures and DEM
- Real-time volumetric clouds or full atmospheric scattering path
- Ops-grade plume CFD tables
- Non-deterministic particle systems that break scrubbing

---

## Changelog of this plan

| Date | Note |
|------|------|
| 2026-08-11 | Initial visual realism backlog for agents (from product discussion after LOI + watchability pass) |
| 2026-08-11 | V0.1 + V0.2 shipped: anti-sun fill, limbs, night pad floods, Earthshine, Earth night lights |
