# Starship's Thirteenth Flight Test

Captured from the official mission page on **2026-08-15** (post-flight recap).

- Page: https://www.spacex.com/launches/starship-flight-13
- Official replay (use this, not the page embed): https://x.com/i/broadcasts/1AJEmmYdMDnJL
- Official landing/splash highlight clips (motion look target): https://x.com/SpaceX/status/2082186658162626898

SpaceX page copy below is transcribed for reference. Theater notes at the end are this repo’s Flight 13 mission, not SpaceX ops data.

---

## Page chrome (what loads)

Site-wide header: **SPACEX** logo; **VEHICLES · HUMAN SPACEFLIGHT · STARLINK · STARSHIELD · SPACEXAI · TERAFAB · COMPANY · SHOP**. Top right: **UPCOMING LAUNCHES** plus a site-wide countdown (not the Flight 13 clock; observed values such as `T−07:07:57` are for a later launch).

Hero: date **JULY 24, 2026**, title **STARSHIP'S THIRTEENTH FLIGHT TEST**, **WATCH →** button. Background still is Starship on the Starbase pad (Mechazilla tower) at sunset.

Footer: X icon; **CAREERS · UPDATES · PRIVACY POLICY · SUPPLIERS · INVESTORS**; **© 2026 SPACEX**.

The **WATCH** control opens an **X / Twitter embed** of the webcast. On 2026-08-15 that embed failed with **“Livestream temporarily unavailable.”** The same replay plays from the direct X broadcast URL (see [Official replay](#official-replay-for-agents)).

---

## Post-flight recap (verbatim)

On Friday, July 24, 2026, at 5:51 p.m. CT, Starship lifted off from Starbase, Texas on its thirteenth flight test. This was the second flight of the Starship and Super Heavy V3 vehicles and the first Starship flight to deploy the next generation Starlink V3 satellites.

The flight test began with Super Heavy igniting all 33 Raptor 3 engines and ascending over the Gulf of America. The successful first-stage ascent was followed by a hot-staging maneuver, with Starship's upper stage igniting its six Raptor engines to continue its flight to space.

Following stage separation, the Super Heavy booster performed a directional flip maneuver. The startup sequence was modified for this flight to be more robust to timing variability in engine startup and flip in the desired direction, which is done to increase overall performance. The booster successfully completed the high thrust portion of the boostback burn with all 33 engines, the first time with a Super Heavy V3, before ending the burn early. It attempted to relight its engines for the landing burn, with a subset successfully igniting before experiencing a hard splashdown in the Gulf.

After completing a full-duration ascent burn on all six Raptor engines, Starship achieved its planned velocity and trajectory. Starship then successfully deployed all 20 Starlink V3 satellites. SpaceX engineers were able to successfully communicate with every satellite using radio frequency and laser links and downloaded key telemetry from the satellites. The Starlink satellites were deployed on the pre-planned trajectory and are expected to have demised upon reentry approximately 20 minutes after deployment.

The vehicle also reignited a single Raptor engine in an in-space demonstration of a core capability for future orbital missions.

Starship re-entered the Earth's atmosphere and was able to gather critical data on the performance of its heatshield before executing a dynamic banking move to mimic the trajectory that future missions returning to Starbase will fly. Starship then guided itself using its four flaps to the pre-planned splashdown zone in the Indian Ocean. After relighting all three Raptor engines, Starship executed a landing flip, landing burn, and soft splashdown, coming to rest intact in the Indian Ocean and providing critical views of an intact heatshield for the first time.

---

## Countdown

**Starship's Thirteenth Flight Test** — *All Times Approximate*

| HR/MIN/SEC | EVENT |
| --- | --- |
| 00:50:00 | SpaceX Flight Director conducts poll and verifies GO for propellant load |
| 00:37:30 | Ship LOX (liquid oxygen) load underway |
| 00:37:00 | Booster LOX load underway |
| 00:35:25 | Booster fuel (liquid methane) load underway |
| 00:34:48 | Ship fuel load underway |
| 00:21:30 | Raptor begins engine chill on booster and ship |
| 00:02:50 | Booster propellant load complete |
| 00:02:10 | Ship propellant load complete |
| 00:00:30 | SpaceX flight director verifies GO for launch |
| 00:00:17 | Flame diverter activation |
| 00:00:03 | Booster engine startup command |
| 00:00:00 | Excitement guaranteed |

---

## Flight trajectory diagram

The page includes a mission-profile graphic (also referenced historically as `docs/starship-flight-mission-profile.jpg`, not currently in the tree). Labels on the live page:

- Launch
- Super Heavy engine start
- Ascent
- Boostback burn
- Flip maneuver
- Hot staging
- Starship ascent
- Starship engine cutoff
- Coast phase
- Starship entry
- Super Heavy descent
- Water landing (Gulf of America)
- Landing burn and splashdown

---

## Flight test timeline

*All Times Approximate*

| HR/MIN/SEC | EVENT |
| --- | --- |
| 00:00:00 | Liftoff |
| 00:00:58 | Max Q (moment of peak aerodynamic stress on the rocket) |
| 00:02:18 | Super Heavy MECO (most engines cut off) |
| 00:02:21 | Hot-staging (Starship Raptor ignition and stage separation) |
| 00:02:25 | Super Heavy boostback burn start |
| 00:03:03 | Super Heavy boostback burn shutdown |
| 00:06:27 | Super Heavy landing burn start |
| 00:06:53 | Super Heavy landing burn shutdown |
| 00:08:05 | Starship engine cutoff |
| 00:16:40 | Payload deploy demo start |
| 00:27:39 | Payload deploy demo complete |
| 00:38:58 | Raptor in-space relight demo |
| 00:47:30 | Starship entry |
| 01:02:23 | Starship is transonic |
| 01:03:01 | Starship is subsonic |
| 01:05:01 | Landing burn start |
| 01:05:03 | Landing flip |
| 01:05:12 | Landing burn 3 to 2 engines |
| 01:05:19 | Landing burn 2 to 1 engine |
| 01:05:21 | An exciting landing! |

---

## Official replay (for agents)

Use this section to watch the **archived** SpaceX webcast and capture **clean, high-quality frames of the video itself** (not the surrounding X UI).

The live event is over. The replay is a recorded X broadcast:

| Field | Value |
| --- | --- |
| Title | Starship's Thirteenth Flight Test |
| Account | @SpaceX (verified) |
| **Working URL** | https://x.com/i/broadcasts/1AJEmmYdMDnJL |
| Duration | 01:52:16 |
| Views (2026-08-15) | ~1.6M |
| Older id in this file | `2077785645645209727` — keep as a fallback; prefer `1AJEmmYdMDnJL` |

Ship hull marking visible in coast shots: **S40**.

Captured stills (major events + camera angles, for 3D visual reference): [`assets/flight13-webcast/`](../assets/flight13-webcast/). Catalog and theater-camera mapping live in that folder’s README. Do **not** ship these as runtime textures.

### Do not use the spacex.com embed for screenshots

1. Open https://www.spacex.com/launches/starship-flight-13
2. Click **WATCH →**
3. The X embed often errors with **“Livestream temporarily unavailable.”** Even when it starts, it is a small player with site chrome around it.

Skip the embed. Open the **direct X broadcast URL** in its own tab.

### Fullscreen screenshot SOP

Goal: the monitor is filled with the **stream picture** (mission HUD is part of the video; X chat / QR / browser chrome are not).

1. **Maximize Chrome** so the window already fills the desktop. SwiftShader / WebGL flags from `AGENTS.md` are **not** required for this X replay (they are only for the Three.js theater).
2. Navigate to https://x.com/i/broadcasts/1AJEmmYdMDnJL
3. Wait until the player shows the video (not a black poster). There is no login wall for playback. Ignore **Chat** (“Log in to chat”) and the **Scan to get the app** QR — both go away in player fullscreen.
4. Hover the player to show the bottom control bar.
5. Click the **gear** (settings). Open **Quality**. Choose **2160p** (options observed: Auto, 480p, 720p, 1080p, **2160p**). The VM display may be lower than 4K; still pick 2160p so the decoder is not stuck on 480p/720p.
6. Hover the **rightmost** control (four corners). Tooltip: **Full screen**. Click it.
   - Chrome may toast: `x.com — To exit full screen, press Esc`.
   - This is **player** fullscreen: video fills the monitor; browser tabs, address bar, X chat, and the QR overlay disappear. Prefer this over F11 (F11 alone leaves chat/QR on screen).
7. Seek with the progress bar, or use the mapping below. **Pause** (`Space` or click the video) on the frame you want so the shot is sharp.
8. **Hide X player chrome before capturing:**
   - Park the mouse at the **very top-center** of the screen (or off the video), then wait several seconds without moving it.
   - The Esc toast fades. X play/pause, view count, and the seek bar should fade; if they stay, they are a thin bottom strip — wait longer or move the cursor again rather than leaving it on the control bar.
   - **Do not** try to hide the grey **mission HUD** (speed, altitude, `T+` clock, phase ticks, attitude/map bugs). That overlay is **burned into the webcast**, not X UI.
9. Capture the screen (system screenshot). In player fullscreen the capture is the video frame, not the desktop dock.
10. Exit with **Esc** (or click the fullscreen control again).

### Failure modes

| Symptom | What to do |
| --- | --- |
| spacex.com WATCH: “Livestream temporarily unavailable” | Leave the embed. Open https://x.com/i/broadcasts/1AJEmmYdMDnJL |
| Small player, chat + QR still visible | You are not in **player** fullscreen. Click the player’s four-corner **Full screen** control, not only F11. |
| Muddy / blocky video | Quality is still Auto/480p. Gear → Quality → **2160p**, then fullscreen. |
| Screenshot includes dock, tabs, or QR | Maximize Chrome, then player fullscreen, then capture. |
| Autoplay muted | Unmute with the volume control before fullscreen if audio matters; mute does not affect stills. |
| Cursor or control bar in the shot | Pause, park the mouse at the top edge, wait, recapture. |

### Webcast time vs mission `T+`

Liftoff in this replay is about **35:04** (pad at `T−00:00:42` was at **34:22**). Coast hull-cam at webcast **43:30** showed stream HUD **T+ 00:08:25** (speed ~26,506 km/h, altitude ~150 km, past Super Heavy landing / at SECO). Approximate seeks:

| Mission event (page timeline) | Seek replay to (~) |
| --- | --- |
| Webcast open / intro (SpaceX Mars bumper) | 00:00 |
| Host desk | 28:00 |
| Pad, `T−00:00:42` | 34:22 |
| Liftoff (`T+0`) | 35:04 |
| Hot-staging (`T+00:02:21`) | 37:25 |
| Starship engine cutoff (`T+00:08:05`) | 43:09 |
| Payload deploy start (`T+00:16:40`) | 51:44 |
| Payload deploy complete (`T+00:27:39`) | 1:02:43 |
| Raptor relight demo (`T+00:38:58`) | 1:14:02 |
| Entry (`T+00:47:30`) | 1:22:34 |
| Landing (`T+01:05:21`) | 1:40:25 |

Formula used: webcast seconds ≈ mission `T+` seconds + **2104** (35:04). Treat as approximate; the stream HUD `T+` is the ground truth on a given frame.

---

## Official highlight clips (for later visual refinement)

Posted **2026-07-28** by @SpaceX. These are **4K highlight videos** of the Indian Ocean landing sequence, not the full webcast. Recorded here so later photorealism work can use **motion** (plume flicker, flip, steam evolution) when the stills in [`assets/flight13-webcast/`](../assets/flight13-webcast/) are not enough. Do **not** ship the clips as runtime textures or theater video.

| Field | Value |
| --- | --- |
| Post | https://x.com/SpaceX/status/2082186658162626898 |
| Account | @SpaceX (verified) |
| Caption | Landing burn and splashdown of Starship on Flight 13 |
| Posted | 2026-07-28 |
| Media | Two 3840×2160 clips (~51 s and ~59 s) plus a still |
| Theater use | [VISUAL_REALISM.md](./VISUAL_REALISM.md) **V17** (splash steam / ocean glitter); landing-plume motion in **V14** |

Prefer this post over the long webcast when you only need the landing burn → flip → 3→2→1 → soft splash → intact hull in steam. The archived broadcast remains the source for pad, ascent, staging, payload, relight, and entry.

Watch on X (same player-fullscreen habit as the replay SOP if you grab frames). Do not download the MP4s into `public/` or `src/`.

---

## Earlier page copy (pre-launch)

The same URL previously carried a **pre-launch** briefing (window as early as Thursday, July 23, 90 minutes opening 5:45 p.m. CT; webcast ~30 minutes before liftoff). Kept for history. The theater epoch is the **flown** Friday liftoff, not that window-open time.

The thirteenth flight test of Starship (https://www.spacex.com/vehicles/starship/) is preparing to launch as early as Thursday, July 23. The 90-minute launch window will open at 5:45 p.m. CT.

A live webcast of the flight test will begin about 30 minutes before liftoff, which you can watch here and on X @SpaceX. (https://twitter.com/SpaceX) As is the case with all developmental testing, the schedule is dynamic and likely to change, so be sure to check in here and stay tuned to our X account for updates.

The upcoming flight will aim to complete similar objectives targeted on the previous flight test (https://www.spacex.com/launches/starship-flight-12), which debuted the Starship and Super Heavy V3 vehicles (https://www.spacex.com/updates#starship-v3), while also carrying next-generation Starlink V3 satellites for the first time.

Watch “Critical Path”, (https://www.spacex.com/content/starship/critical-path) the latest episode in the ongoing Starship series that followed SpaceX engineers and technicians through the final days before launch of the first Starship V3.

The booster’s primary test objective will be executing a successful launch, ascent, stage separation, boostback burn, and landing burn at an offshore landing point in the Gulf of America. There have been several modifications to hardware and software to address issues seen on the previous flight.

At stage separation on Flight 12, slight differences in engine startup on the ship caused the directional flip of the booster to be off by approximately 90 degrees. The startup sequence has been modified to be more robust to timing variability and more reliably flip in the desired direction, which is done to increase overall performance. After stage separation and the flip, the Super Heavy booster attempted its boostback burn. Five of its 33 engines experienced issues when attempting to re-light causing the boostback burn to end early. The Super Heavy on this upcoming flight has hardware modifications to improve re-light reliability along with updates to engine alarms and aborts to match the conditions seen in the multi-engine flight environment.

The Starship upper stage’s primary objectives include the deployment of 20 Starlink V3 satellites, a relight of a single Raptor engine while in space, and another controlled entry, descent, and splashdown in the Indian Ocean. There have also been several modifications to Starship’s propulsion system to address the engine out issue experienced on the previous flight.

Approximately 40 seconds after stage separation, Starship lost one of its three Raptor vacuum optimized engines. The vehicle was able to demonstrate its engine out capability and reach its planned suborbital trajectory. Several hardware and operational modifications have been made to address the interconnected causes with additional reliability improvements planned in upcoming versions of the Raptor engine.

For the first time, Starship will carry V3 Starlink satellites to space, which aim to greatly expand the network's capacity and user speeds. As part of this initial test, Starship is planned to deploy 20 satellites which will extend solar arrays and antennas and will attempt to connect with the larger Starlink constellation via high-capacity lasers. The Starlink satellites will be on the same suborbital trajectory as Starship and are expected to demise upon reentry approximately 20 minutes after deployment.

Six of the satellites have been modified with a suite of cameras to scan Starship’s heat shield and transmit imagery down to operators to continue testing methods of analyzing Starship’s heat shield readiness for return to launch site on future missions. Several tiles on Starship have been painted white to simulate missing tiles and serve as imaging targets in the test.

Several upgrades and experiments related to Starship’s heatshield will also be tested to continue iteration towards a fully and rapidly reusable design. Multiple tiles will be attached to the metallic side of Starship’s aft flaps along with modified tiles and attachment mechanisms in the heatshield covering the aft skirt to gather flight data on different attachment options. Finally, Starship’s heatshield will have load sensing tiles to take measurements as the vehicle experiences higher dynamic pressure on ascent than previous flights, putting added stress on the tile attachments in exchange for increased payload to orbit capability.

---

## App theater (this repository)

Not SpaceX page copy. Full interactive theater (same class as Starbase → Moon): baked RK4 pack `src/data/flight13-trajectory.json`, pad/craft/staging FX, cameras, HUD scrubber. Phases: launch → ascent → coast → entry → descent → splashdown (float hold). Rebuild with `npm run precompute:flight13`.

**Ship path (theater-grade, ballistic-first):** near-circular upper-stage insert along the Starbase → Indian Ocean corridor; pure free coast (no altitude-hold glide); single-engine **relight demo** (~10 s; public table ~12 s); high-AoA belly drag/lift + bank toward splash; landing burn only after aero has bled speed; splash when dynamics arrive near 19°S 107°E (no longitude teleport). After splash the ship stays **Earth-fixed on the ocean** through **T+1:10:00**, watched by a low sea-level **recovery drone** (webcast analog). Not ops ephemerides.

**Epoch / lighting:** mission t = 0 is the flown liftoff **2026-07-24 22:51 UTC** (5:51 p.m. CDT). Analytic Earth/Sun (not the July 2027 Horizons table); `sunPhase0` is the USNO solar longitude at that UTC — no theater sun-phase offset. Splash at T+1:05:21 is **2026-07-24 23:56 UTC**, a southern-winter morning at the Indian Ocean site (sun a few degrees up). Starbase is in afternoon sun. Sun directional light is unit-scale aimed at Earth each frame (`applySunLight`).

**Visuals:** entry plasma glow, belly-flop → engines-first attitude, Indian Ocean site beacon + spray (not lunar dust), Super Heavy Gulf recovery. Hull-cam (hex TPS / S40 / oil-canning) and pink launch plumes shipped; remaining photorealism vs the webcast stills: [VISUAL_REALISM.md](./VISUAL_REALISM.md) V15+.

**Booster recovery:** force-model **Gulf of America** hard splash (`recovery: "gulf"`) — Earth μ + J₂ + drag RK4 after stage-out; boostback ~T+2:25–3:03 and a **partial** landing burn ~T+6:27–6:53 from ~5 km AGL (webcast “Landing startup”; subset of engines, as flown). The booster falls into the water near ~25.55°N 96.15°W (theater, not a surveyed buoy) — no chopsticks seat. Chopsticks RTLS on the same force model is the default for the lunar mission.

### Earth great-circle section (app)

Theater whole-Earth cross-section plane is a **best-fit great circle** through:

| Site | Approx. coordinates (theater) |
|------|-------------------------------|
| Starbase | 25.997°N, 97.156°W |
| Gauteng (Johannesburg) | 26.20°S, 28.05°E |
| Indian Ocean splashdown | 19°S, 107°E (NW of Western Australia; Flight 11 McDowell analog, not a surveyed Flight 13 buoy) |
| Australia (label) | 25.27°S, 133.78°E |

Open from Flight 13 briefing (**Earth great circle**) or the theater **Earth GC** button / **Tab** cycle.

---

© 2026 SpaceX. Recap, countdown, and timeline sourced from https://www.spacex.com/launches/starship-flight-13 for reference.
