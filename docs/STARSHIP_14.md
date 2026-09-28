# Starship's Fourteenth Flight Test

Captured from the official mission page on **2026-09-28** (launch day). The page
still carried **pre-flight** briefing copy at capture; flown T0 below is from
launch catalogs, not a SpaceX recap rewrite.

- Page: https://www.spacex.com/launches/starship-flight-14
- Official webcast: https://x.com/i/broadcasts/1qxvvenMPMQxB

SpaceX page copy below is transcribed for reference. Theater notes at the end
are this repo’s Flight 14 mission, not SpaceX ops data. Vehicle, Raptor, and
Starbase pad/production facts: [STARSHIP.md](./STARSHIP.md). Flight 13 recap /
webcast SOP: [STARSHIP_13.md](./STARSHIP_13.md).

---

## Page chrome (what loads)

Site-wide header: **SPACEX** logo; **VEHICLES · HUMAN SPACEFLIGHT · STARLINK ·
STARSHIELD · SPACEXAI · TERAFAB · COMPANY · SHOP**. Top right: **UPCOMING
LAUNCHES**.

Hero: title **STARSHIP'S FOURTEENTH FLIGHT TEST**, **WATCH →** button. The
**WATCH** control opens an **X / Twitter embed** of the webcast. Skip the embed
when it fails; use the direct broadcast URL (see [Official replay](#official-replay-for-agents)).

Footer: X icon; **CAREERS · UPDATES · PRIVACY POLICY · SUPPLIERS · INVESTORS**.

---

## Pre-flight briefing (verbatim / close paraphrase)

The 14th flight of Starship is preparing to launch as soon as Tuesday,
September 22, pending regulatory approval. The 75-minute launch window will
open at 7:15 a.m. CT. (The flown attempt used a later window on **Monday,
September 28, 2026**; see [Flown T0](#flown-t0).)

A live webcast of the flight will begin about 30 minutes before liftoff, which
you can watch here and on X @SpaceX. Coverage is planned to continue through
splashdown, with the potential for hours of live views from Starship as it
orbits Earth. As is the case with all developmental testing, the schedule is
dynamic and likely to change, so be sure to check in here and stay tuned to
our X account for updates.

Starship’s initial orbital mission is expected to fly at an altitude
approximately 275 km above Earth and complete approximately six orbits around
the planet over the course of a nearly 10-hour flight, with splashdown targeted
in the Pacific Ocean to the west of Chile.

The booster’s primary test objective on Flight 14 will be executing a
successful launch, ascent, stage separation, boostback burn, and landing burn
at an offshore landing point in the Gulf of America. There have been several
modifications to hardware and software to address issues seen on the previous
flight.

The Starship upper stage’s primary objectives include the first orbital
insertion maneuver, the deployment of 26 Starlink V3 satellites, a deorbit
burn using a single Raptor engine while in space, and a controlled reentry,
descent, and splashdown in the Pacific Ocean. Starship will only execute a
burn to enter orbit after the flight control team has ensured there is
sufficient redundancy on hardware critical to doing the subsequent deorbit
burn at the end of the mission.

After the initial ascent burn, Starship will be on the same passively safe
suborbital trajectory to the Indian Ocean as its initial flight tests. This
will enable flight controllers to assess the health of the vehicle during a
coast phase and make the determination to either proceed to orbit or let
Starship reenter and splash down in the Indian Ocean. Assuming the vehicle is
healthy, Starship will execute a circularization burn using a single Raptor
sea-level engine that will place the vehicle in orbit around Earth.

Several upgrades and experiments related to Starship’s heatshield will also be
tested, with some improvements derived directly from data gathered from the
Flight 13 Starship as it floated in the Indian Ocean. They include additional
retention mechanisms added to tiles in areas deemed to be at highest risk of
falling off during ascent, addressing recently discovered areas that offer
flow paths behind tiles for plasma, and flying multiple areas with a curved
tile design that has shown the ability to reduce heating in the gaps between
tiles. And finally, two tiles recovered from Ship 40 are planned to be
reflown on Ship 41, marking the first tile reuse for Starship.

A pair of health checkout waypoints are expected during the orbital coast
phase and after payload deployment. If the ship is not deemed safe enough to
continue in orbit, Mission Control could decide to shorten the mission down
to two or five orbits, depending on when in the orbital coast this decision
happens.

---

## Flown T0

The SpaceX page still listed the **window open** (7:15 a.m. CT), not the flown
liftoff. Launch catalogs (Next Spaceflight: **12:48:59 GMT**) and contemporaneous
reporting put liftoff at **8:48–8:49 a.m. EDT**.

| Field | Value |
| --- | --- |
| Date | Monday, 28 September 2026 |
| Theater T0 | **2026-09-28 12:48:59 UTC** (7:48:59 a.m. CDT) |
| Pad | Starbase **OLP-2** |
| Stack | **Ship 41** + **Booster 21** (Block 3 / V3) |
| Payload | 26 Starlink V3 (Starlink Group 31-1); three with heat-shield cameras |

Window open is **not** T0. If SpaceX publishes a recap with a different flown
second, update this table and `FLIGHT14_LIFTOFF_UTC_MS`.

---

## Countdown

**Starship's Fourteenth Flight Test** — *All Times Approximate*

The live page’s countdown table was not fully extractable from the SPA at
capture. Propellant load is the same family as Flight 13 (poll ~T−50:00). Treat
the Flight 13 countdown in [STARSHIP_13.md](./STARSHIP_13.md) as the analog
until a recap table lands.

---

## Flight test timeline

*All Times Approximate* — official SpaceX page table (planned 6-orbit /
Chile-splash profile).

| HR/MIN/SEC | EVENT |
| --- | --- |
| 00:00:00 | Liftoff |
| 00:00:58 | Max Q (moment of peak aerodynamic stress on the rocket) |
| 00:02:20 | Super Heavy MECO (most engines cut off) |
| 00:02:22 | Hot-staging (Starship Raptor ignition and stage separation) |
| 00:02:27 | Super Heavy boostback burn start |
| 00:03:07 | Super Heavy boostback burn shutdown |
| 00:06:35 | Super Heavy landing burn start |
| 00:07:01 | Super Heavy landing burn shutdown |
| 00:08:11 | Starship engine cutoff |
| 00:25:28 | Starship orbital insertion burn start |
| 00:25:47 | Starship orbital insertion burn shutdown |
| 00:34:18 | Payload deploy start |
| 01:04:50 | Payload deploy complete |
| 08:52:18 | Deorbit burn start |
| 08:52:29 | Deorbit burn shutdown |
| 09:28:52 | Starship entry |
| 09:47:30 | Starship is transonic |
| 09:48:07 | Starship is subsonic |
| 09:50:11 | Landing burn start |
| 09:50:13 | Landing flip |
| 09:50:21 | Landing burn 3 to 2 engines |
| 09:50:22 | Landing burn 2 to 1 engine |
| 09:50:30 | An exciting landing! |

---

## What is not the contract

Secondary writeups (Next Spaceflight launch notes, live blogs) reported a
**Raptor Vacuum early shutdown** on ascent, a **go for orbit** anyway, then a
**shortened** mission (~3 hours / ~1–2 revs) with splash in the **northern
Pacific** instead of west of Chile. Those sources are recorded here so agents
do not treat them as secret knowledge — they are **not** the theater contract.

Same rule as Flight 13: the **SpaceX page** and the **X broadcast HUD** win.
Until SpaceX rewrites the recap or a still catalog pins different T+ marks,
the theater bakes the **official table** above (six-orbit clock, Chile-target
deorbit time). Splash is wherever that deorbit and the force model meet the
sea — **no buoy, no longitude teleport**. If a later recap or HUD stills
disagree, update this file and the bake.

---

## Official replay (for agents)

Use this section to watch the **archived** SpaceX webcast and capture **clean,
high-quality frames of the video itself** (not the surrounding X UI).

| Field | Value |
| --- | --- |
| Title | Starship's Fourteenth Flight Test |
| Account | @SpaceX (verified) |
| **Working URL** | https://x.com/i/broadcasts/1qxvvenMPMQxB |
| Date | 2026-09-28 |

Ship hull marking expected in coast shots: **S41**. Booster: **B21**.

Captured stills (major events + camera angles): [`assets/flight14-webcast/`](../assets/flight14-webcast/).
Do **not** ship these as runtime textures.

### Do not use the spacex.com embed for screenshots

1. Open https://www.spacex.com/launches/starship-flight-14
2. Click **WATCH →**
3. The X embed often errors with **“Livestream temporarily unavailable.”**

Skip the embed. Open the **direct X broadcast URL** in its own tab.

### Fullscreen screenshot SOP

Goal: the monitor is filled with the **stream picture** (mission HUD is part of
the video; X chat / QR / browser chrome are not). Same habit as Flight 13.

1. **Maximize Chrome** so the window already fills the desktop. SwiftShader /
   WebGL flags from `AGENTS.md` are **not** required for this X replay.
2. Navigate to https://x.com/i/broadcasts/1qxvvenMPMQxB
3. Wait until the player shows the video (not a black poster).
4. Hover the player → **gear** → **Quality** → **2160p** (or the highest listed).
5. Click the player’s **Full screen** control (four corners), not only F11.
6. Seek, **pause** on the frame, park the mouse at the top edge until X chrome
   fades. Keep the grey **mission HUD** (it is burned into the webcast).
7. Capture the screen. Exit with **Esc**.

Record the webcast-clock offset once a still shows both the stream timer and
the mission `T+` HUD (Flight 13 liftoff was ~35:04 into that replay). Not yet
pinned from a captured still — leave blank until a frame shows both clocks.
Write it here when captured.

---

## App theater (this repository)

Not SpaceX page copy. Full interactive theater (same class as Flight 13): baked
RK4 pack `src/data/flight14-trajectory.json`, pad/craft/staging FX, cameras,
HUD scrubber. Phases: launch → ascent → coast (passively safe) → low Earth
orbit → entry → descent → splashdown (float hold). Rebuild with
`npm run precompute:flight14`.

**Ship path (theater-grade):** eastward ascent on the same passively safe
Indian Ocean corridor as Flight 13 until SECO; **do not** circularize at SECO.
Single-Raptor **insertion** at the public T+ window to ~275 km; free n-body
coast; 26 Starlink V3 silhouettes in the public deploy window; single-Raptor
**deorbit** at the public T+ window; high-AoA belly entry; landing burn
3→2→1; splash where the force model meets the sea. After splash the ship stays
**Earth-fixed on the ocean** for a short recovery-drone hold. No Chile buoy.

**Splash miss (honest):** the bake meets the water near **22°S 132°W** (central
South Pacific) at ~T+9:50:11, within seconds of the public landing call. That
is **west of the Chile-west briefing target** (~30°S 80°W) — documented, not
teleported.

**Epoch / lighting:** mission t = 0 is **2026-09-28 12:48:59 UTC**. Analytic
Earth/Sun (`useHorizons: false`). Starbase is in **morning** sun (not Flight
13’s afternoon).

**Launch complex:** OLP-2, same pad/craft photorealism as Flight 13 (do not
rebuild V13–V27). Hull stencils **S41 / B21**. Super Heavy gulf recovery on
the Flight 14 public boostback / landing-burn marks; full inner-13 landing
set (not Flight 13’s 10→8→5 hard splash) unless a still shows that failure.

**Auto-cam:** Flight 14 cut list in `src/camera/flight14WebcastShots.ts`.
Stills in `assets/flight14-webcast/` win over filenames and over this table
when they disagree.

---

© 2026 SpaceX. Briefing and timeline sourced from
https://www.spacex.com/launches/starship-flight-14 for reference.
