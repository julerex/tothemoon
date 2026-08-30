# Starship and the Starbase launch complex

Public-hardware reference for agents working on the theater. **Not** ops data and
**not** a substitute for the Flight 13 recap.

Related:

- [STARSHIP_13.md](./STARSHIP_13.md) — flown Flight 13 timeline, webcast SOP, theater mapping
- [VISUAL_REALISM.md](./VISUAL_REALISM.md) — what the 3D pad/craft currently draw
- [NEXT.md](./NEXT.md) — product roadmap
- Mesh numbers in `src/scene/craft/dimensions.ts` and `src/scene/earthTheater/mechazillaDims.ts`

**Honesty:** figures below are from public sources (Wikipedia, NSF, FAA notices,
SpaceX vehicle page / updates) as of **2026-08**. Where the theater uses a
simpler number, that is called out. Do not treat this file as a flight-ops
manual.

---

## What “Starship” means

SpaceX uses **Starship** for both the whole stack and the upper stage.

| Name | Role |
|------|------|
| **Starship** (stack) | Two-stage, fully reusable super-heavy launcher |
| **Super Heavy** | First stage / booster |
| **Starship** (ship) | Second stage and spacecraft |
| **Raptor** | Methalox full-flow staged-combustion engines on both stages |

The stack is 9 m in diameter. Stainless barrels are welded from ~1.83 m-tall
rings (~4 mm 304L). Both stages burn **subcooled liquid methane + liquid
oxygen** (mixture ratio about 3.6:1, fuel-rich of stoichiometric 4:1).

Stacked height (Wikipedia, Musk 2025 chart):

| Block | Stack height | Notes |
|-------|--------------|--------|
| 1 | 121.3 m | Flights 1–6 class |
| 2 | 123.1 m | Flights 7–11 class |
| 3 (V3) | 124.4 m | Flights 12–13 class; Raptor 3 |
| 4 (est.) | ~142 m | Not flown as of Flight 13 |

This theater’s craft mesh is a **123 m** stack (71 m booster + 52 m ship) —
Block 2 envelope, labeled as Flight 13 **B20 / S40** V3 hardware. Do not
silently stretch the mesh to 124.4 m without updating `craftLengthKm` tests.

---

## Super Heavy (booster)

Public Block 1/2: **71 m** tall with the vented interstage, **9 m** wide,
~3,400 t propellant (about 2,700 t LOX / 700 t CH₄). Empty mass quoted ~275 t.
Block 3 Super Heavy is **72.3 m** with an integrated hot-stage section.

### Engines

**33 Raptor** sea-level engines: **3** inner + **10** mid + **20** outer
(gimbal on the inner rings; outer 20 were originally ground-start-only on
Raptor 2). On **Raptor 3**, all 33 can relight (Flight 13 boostback used all
33 — first V3 Super Heavy to do that).

Block 1 sea-level thrust ~73.5 MN; Block 3 ~80.8 MN (NSF / Wikipedia). The
cluster makes visible **shock diamonds** in the plume (ascent and landing).

Landing LOX for the inner engines comes from a **header tank** in the aft
dome / thrust puck. After Flight 1, booster gimbal went from hydraulic to
electric (HPUs deleted).

### Structure (bottom → top)

1. Engine bay / thrust puck (inner 13 on the puck, outer 20 on a ring)
2. Liquid oxygen tank
3. Common bulkhead (more elliptical after Flight 2)
4. Liquid methane tank (methane is forward — a large **downcomer** feeds the
   engines; Block 3’s tube is Falcon-9-first-stage class, ~3.7 m)
5. Interstage / hot-stage vent + grid fins

Four **chines** on the LOX barrel (from B7 on) add lift on descent and hide
batteries / COPVs / fire-suppression bottles.

### Grid fins and catch (V3)

| | Block 1 / 2 | Block 3 (V3, Flight 12+) |
|---|-------------|---------------------------|
| Count | 4 at ~90° | **3** at **90° / 90° / 180°** |
| Size | ~3 t each, stainless | ~1.5× larger, lower on the barrel |
| Catch | Separate hardpoints between fins | **Catch pins integrated with the fins** |
| Fold | Do not retract on ascent | Same (saves hinge mass) |

The unpaired fin’s lattice is slightly canted to offset the missing opposite.
SpaceX’s stated reason for the new azimuths: less heating at hot-stage.

### Hot-staging

After Flight 1, Super Heavy keeps a **~1.8 m vented interstage** so the ship
can light while still attached. The booster throttles to the three center
engines; the ship “pushes off.” Musk (2023) claimed ~10% more LEO payload.
On Block 1/2 the vented ring was **jettisoned after boostback** (from B11).
Block 3 **integrates** that section into the methane tank — not jettisoned.

---

## Starship (upper stage / ship)

Block 2 ship: **52.1 m** tall, 9 m wide, ~1,500 t propellant (~1,170 t LOX /
330 t CH₄). Block 1 was 50.3 m / ~1,200 t propellant. Dry mass quotes wander
(~100 t Block 1, ~85 t Block 2).

### Engines

**6 Raptors:** 3 sea-level (center, gimbal, used for landing / relight) +
**3 vacuum (RVac)** with larger bells. Ascent uses all six. Flight 13’s
in-space demo was a **single sea-level** relight. Landing burn is the three
sea-level engines, then 3→2→1 as in the Flight 13 public table.

### Heat shield

Windward **hexagonal silica tiles** (~18,000), pin-mounted, gaps for expansion,
rated ~1,400 °C. After Flight 4 an ablative underlayer appeared (flaps on
Flight 6). After Flight 10, **“crunch wrap”** felt in the grout to stop
plasma leaking between tiles. Leeward barrel stays **stainless** (oil-canning,
heat tint). Flight 13 stills: **S40** stencil, experiment / missing / white
tiles as imaging targets.

### Flaps

Four control surfaces for the belly-flop:

- **Forward** (canards) on the payload / nose — Block 2 are smaller, thinner,
  more leeward (~18 m² class in this theater)
- **Aft** (elevons) on the engine bay / LOX tank (~40 m² class; ~17 m span
  with the 9 m barrel)

Entry attitude is a ~60° “belly-flop”; a landing flip puts engines down just
above the water or tower.

### Payload (Pez)

Reusable ships do not drop a fairing. A **leeward Pez door** dispenses
Starlink stacks. Flight 13 was the first flight to deploy **live Starlink V3**
(20 sats); earlier flights used mass simulators. Sats on that trajectory were
expected to demise ~20 minutes after deploy. Six Flight 13 sats carried
cameras to image the heat shield.

---

## Raptor 3 (what Flight 13 actually flew)

- Cycle: **full-flow staged combustion**, CH₄ + LOX
- Why methane: higher Isp than RP-1, no coking in the channels, and it can be
  made from CO₂ + H₂ (Sabatier) for Mars
- Raptor 3 **deletes the external engine heat shield / shroud** by moving
  plumbing and sensors into the regeneratively cooled body (May 2026 SpaceX
  update: ~250 tf sea-level / ~275 tf vacuum nominal; ground tests have run
  higher)
- First orbital Raptor 3 flight was **Flight 12** (May 22, 2026, B19 / S39);
  Flight 13 is the second V3 stack (B20 / S40)

Atmospheric plumes are **pink–white** (CH\* / C₂ Swan bands), not orange RP-1
soot. Vacuum plumes are wider, paler, more translucent.

---

## How a catch flight is supposed to work

Public profile (not this theater’s Flight 13 gulf path):

1. Load via **booster QD** (on the OLM) and **ship QD arm** (on the tower).
2. Engine chill ~T−20 min (SpaceX Flight 13 table is T−21:30).
3. 33-engine liftoff; Max Q ~T+1 min.
4. MECO to three center engines, **hot-stage**, ship six-engine ascent.
5. Booster flip → **boostback** (Raptor 3: attempt all 33) → grid-fin glide
   back to the tower.
6. Landing burn (inner 13, then a few) → **chopsticks catch**.
7. Ship continues to insertion / coast / (for Earth return) plasma entry,
   flap control, landing flip, splash or future tower catch.

Flight 13 **did not** catch the booster: boostback succeeded on 33, landing
burn was a **partial relight**, then a **hard splash** in the Gulf. The ship
did splash intact in the Indian Ocean.

---

## Starbase launch complex

Three clusters along **Texas State Highway 4** (Boca Chica Blvd), east of
Brownsville, at the Gulf:

| Cluster | What | Rough place |
|---------|------|-------------|
| **Launch site** | OLP-1 + OLP-2, tank farm, GSE | Beach end of SH 4 (~25.997°N, 97.156°W in this repo) |
| **Production / build site** | Starfactory, Mega Bays, Gigabay | ~few km west, Boca Chica village |
| **Massey’s** | Cryo proofs, ship static fires | ~6.5 mi from the pads (former gun range) |

Raptor **acceptance** firing is at **McGregor**, not Massey’s. Tile slurry is
processed in Florida (Cocoa / Cape).

The City of **Starbase, Texas** incorporated **2025-05-03**.

### Orbital pads

| | **OLP-1 / Pad A** | **OLP-2 / Pad 2 / Pad B / Pad West** |
|--|-------------------|--------------------------------------|
| First orbital flight | Flight 1 (2023-04-20) | **Flight 13 (2026-07-24)** |
| Status at Flight 13 | Decommissioned **2025-10-14** for V3 rebuild (OLM removed; new table built at Sanchez) | **Active** — stack + live Mechazilla |
| Tower | OLIT-1, ~146 m to lightning rod (FAA) | OLIT-3, similar height; stainless-fill base, larger GSE house |
| OLM | Original “donut” / legs (gone at F13) | Cuboid table, circular bore, **hex outer** in F13 stills; **two BQDs** (LOX and CH₄, opposite side vs Pad 1) |
| Flame management | Steel deluge plate added after Flight 1 cratered the soil | Designed-in **water-cooled flame trench / W-diverter** |
| Chopsticks | Originally ~36 m; later shortened toward Pad 2 | NSF (2025): **~10 m shorter** than original Pad 1 |
| Facing | Vehicle / OLM **east** of the tower (gulf) | NSF: pad **faces south** (tower north of the mount) |
| Where | Closer to the **Gulf**, ~69 m south of Pad 2 | **West** of Pad 1 (inland); tank farm sits **between** the pads |

Pads share a **tank farm** of large **horizontal** cryo cylinders **between**
the two pads, north of the OLM line and south of SH 4. The live farm is
**N–S** shells packed east–west (Pad 2 west banks on the apron, a main bank
of **6 m × 49 m** shells between the pads, two **8 m × 30 m** offload tanks
east of OLP-1) with an E–W
pipe header along the north edge, parallel to SH 4. Each pad has
its own pumps / subcoolers so they can load independently (NSF). Deluge water
is a separate high-pressure farm. The 2022 NAIP tile still shows Pad 1–era
verticals west of one tower — that is **not** the live Flight 13 farm; prefer
a current north-up aerial over that USDA plate.

This theater: live stack is **OLP-2**. **OLP-1** is the second tower ~**363 m
east and ~69 m south** (pad-local −X = gulf, +Z = north) with a stripped mount
and no vehicle. The tower base is a surveyed pin ~32 m west of that mount.
Chopstick length in mesh stays the published **36 m** (not the shorter Pad 2 arms).
Pad-local **+X is west**. See V26 in [VISUAL_REALISM.md](./VISUAL_REALISM.md).

### Mechazilla (OLIT)

Integration **and** catch tower. Roles:

- Stack Super Heavy onto the OLM and the ship onto the booster (**chopsticks**)
- **Ship QD** arm ~mid-ship; **booster QD** is on the mount
- Catch returning Super Heavy (and, later, ships) on the same arms
- Elevator / carriage on the vehicle face; peak sheave + lightning rod

Chopsticks ride a **carriage** on vertical rails. Launch-park in Flight 13
stills is at the **ship nose / rail top**, not the grid-fin band. Catch drops
the carriage to the grid-fin / catch-pin height.

First booster lift onto an OLM: B7, 2022-08-23. First catch: **B12, Flight 5,
2024-10-13**. Later catches include B14 (Flight 7, reused on Flight 9) and B15.

### Production site (not in the pad mesh)

- **Starfactory** — rings, barrels, stringers; goal quoted as one ship/day
- **Mega Bay 1** — Super Heavy stacking + engine install
- **Mega Bay 2** — ship stacking
- **Gigabay** — under construction 2026 for more stations / taller vehicles
- Older High Bay / STARGATE tents were demolished for the above

Vehicles roll on SPMTs: build site ↔ Massey’s (LN₂ proofs) ↔ pad (static fire
/ launch).

---

## Other Starship pads (not in this theater)

| Site | Status (2026) |
|------|----------------|
| **KSC LC-39A** | Starship pad + tower under construction (Falcon also flies here) |
| **CCSFS SLC-37** | Second Florida Starship pad, under construction (Space Force) |
| Roberts Road / Hangar X | Florida production expansion |

---

## Theater vs public hardware (quick)

| Topic | Public | This repo |
|-------|--------|-----------|
| Flight 13 vehicles | B20 + S40, V3 / Block 3 | Same labels; 123 m mesh |
| Flight 13 pad | OLP-2 | Origin of `starbase-pad` |
| OLP-1 at F13 | Tower up, OLM gone | Second tower ~363 m east / ~69 m south, no hex OLM |
| Booster recovery F13 | Hard splash, Gulf of America | Same; ~25.55°N 96.15°W theater, not a surveyed buoy |
| Chopstick length | Pad 2 shorter than original Pad 1 | 36 m both towers |
| Pad 2 yaw (south-facing) | NSF | Live pad still uses tower-west-of-OLM (Pad A-like) so cameras/trench stay put |
| Raptor bells | ~1.3 m SL / ~2.4 m vac exit | `dimensions.ts` |

---

## Sources (start here)

- Wikipedia: [Starship](https://en.wikipedia.org/wiki/SpaceX_Starship),
  [Super Heavy](https://en.wikipedia.org/wiki/SpaceX_Super_Heavy),
  [Raptor](https://en.wikipedia.org/wiki/SpaceX_Raptor),
  [Starbase](https://en.wikipedia.org/wiki/SpaceX_Starbase)
- NSF: [Pad 2 vs Pad 1](https://www.nasaspaceflight.com/2025/08/starbase-pad-2-advancements-pad-1/)
  (2025-08-19); Block 3 / Mars update (2025-05-30)
- SpaceX: [Starship vehicle](https://www.spacex.com/vehicles/starship/),
  [Flight 13](https://www.spacex.com/launches/starship-flight-13)
- FAA 2021 no-hazard notice: OLIT **146 m**
- Ars Technica V3 wet dress (2026-05): ~124 m / 408 ft stack, 33× Raptor 3 static fire
