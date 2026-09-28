# Flight 14 webcast stills

Catalog of **left-pane** camera cuts for Starship Flight 14. Capture SOP:
[`docs/STARSHIP_14.md`](../../docs/STARSHIP_14.md) (2160p, player fullscreen,
mission HUD kept, X chrome gone). **Do not ship these as runtime textures.**

Working replay: https://x.com/i/broadcasts/1qxvvenMPMQxB

Until HUD stills are dropped in this folder, Auto-cam uses the **official
SpaceX T+ table** with analog cameras from the Flight 13 language
(`src/camera/flight14WebcastShots.ts`). When a still lands, the still wins
over this table and over the filename.

## Analog column (until stills)

| Mission time | Event (official table) | Analog camera | Auto-cam key |
| --- | --- | --- | --- |
| T−5:00 | Pad hold | Launchpad Drone wide | `pad-wide` |
| T−2:00 | Full stack | Ground Camera One | `ground-cam-1` |
| T−1:46 | Engines up | Flame trench | `trench-engines-up` |
| T−0:30 → T+0:02 | Ignition / liftoff | Ground Camera One telephoto | `ground-cam-1-hold` |
| T+0:03 | Tower down | Tower Two Cam | `tower-two-down` |
| T+0:08 | Liftoff aerial | Launchpad Drone | `pad-drone-ascent` |
| T+0:18 | Ascent track | Pad long lens | `ascent-track` |
| T+0:29 | Ship hull | Hull-cam (S41) | `ascent-ship-hull` |
| T+0:58 | Max Q | Engines down | `maxq-engines-down` |
| T+2:04 | Hot-stage | Engine bay | `hotstage-engines` |
| T+2:37 | Post-sep hull | Ship hull-cam | `postsep-ship-hull` |
| T+3:00 | Boostback | Engines down | `boostback-engines-down` |
| T+4:10 | Booster hull | Booster hull / gridfin mount | `booster-hull` |
| T+6:35 | SH landing burn | Booster hull-down | `sh-descent` |
| T+6:50 → SECO | Ship coast | Ship hull-cam | `ship-hull` |
| T+25:28 | Insertion | Ship hull-cam | `insert-hull` |
| T+34:18 | Pez deploy (26) | Payload-bay | `payload-bay` |
| T+1:04:50 | Deploy complete | Ship hull-cam | `orbit-hull` |
| T+8:52:18 | Deorbit | Ship hull-cam | `deorbit-hull` |
| T+9:28:52 | Entry | Forward flap | `entry-flap` |
| T+9:47:30 | Transonic / landing | Ship hull-cam | `landing-hull` |
| T+9:50:30 | Splash | Chase, then sea-level drone | `splash-chase` / `splash-drone` |

Hull marking expected: **S41**. Booster: **B21**.

Webcast-clock offset (stream timer vs mission `T+`): not yet pinned from a
still. Write it here when a frame shows both.

Blogs claiming an early northern-Pacific deorbit are **not** the contract
until a still or SpaceX recap disagrees with the official table.
