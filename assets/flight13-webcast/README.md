# Flight 13 webcast stills

Development **reference frames** from the official SpaceX Flight 13 replay. Not runtime theater textures (keep them out of `public/` / `src/`).

| Field | Value |
| --- | --- |
| Source | https://x.com/i/broadcasts/1AJEmmYdMDnJL |
| Capture | 2026-08-15, player fullscreen, stream quality 2160p (display 1920×1200) |
| Copyright | © SpaceX. Stills from the archived webcast for in-repo visual reference only. |
| HUD | Grey mission overlay (speed, altitude, `T+`) is **burned into the stream** — keep it. |

Capture SOP: [docs/STARSHIP_13.md](../../docs/STARSHIP_13.md). Filenames use the on-screen HUD clock when readable (`tplus-HHMMSS` / `tminus-HHMMSS`).

Motion source for later landing/splash refinement (not captured into this folder yet): https://x.com/SpaceX/status/2082186658162626898 — see [Motion sources](#motion-sources-not-captured-yet).

Theater camera analogs match [`src/ui/hudCameraLabels.ts`](../../src/ui/hudCameraLabels.ts) / Flight 13 Auto-cam in [`src/camera/autoCam.ts`](../../src/camera/autoCam.ts): **Starbase**, **Launchpad / trench**, **Booster / gridfin**, **Starship / chase**, **Ship fin**.

## Catalog

| File | HUD `T+` | Event | Camera | Theater analog |
| --- | --- | --- | --- | --- |
| `tminus-000042-pad-hold-wide.jpg` | T−00:00:42 | Pad hold, Mechazilla + stack, cryo vent | Aerial wide pad / coastline | Starbase |
| `tminus-000002-ignition-chopsticks.jpg` | T−00:00:02 | Ignition, chopsticks open, steam at OLM | Ground-level full stack | Starbase / trench |
| `tplus-000000-liftoff-pad.jpg` | T+00:00:00 | Liftoff, 33 engines lit, orange glow in steam | Pad tracking | Starbase |
| `tplus-000016-ascent-tracking.jpg` | T+00:00:16 | Tower-clear, pink plume, ice shed, Boca Chica | Ground tracking | Chase |
| `tplus-000016-ascent-engines-down.jpg` | T+00:00:16 | Looking down engines at pad smoke + Gulf | Onboard engines-down | Trench |
| `tplus-000056-maxq-hull-plumes.jpg` | T+00:00:56 | Max Q, hull tiles + pink plumes over coast | Onboard hull / down | Chase / fin |
| `tplus-000216-prestage-split.jpg` | ~T+00:02:16 | Pre hot-stage, engine bay + S40 hull | Split engine / hull | Gridfin + fin |
| `tplus-000221-hotstage-split.jpg` | T+00:02:21 | Hot-staging, engine glow + S40 over Earth | Split engine / hull | Gridfin + fin |
| `tplus-000238-postsep-hull-s40.jpg` | ~T+00:02:38 | Post-sep stainless hull, Earth limb | Ship hull-cam | Fin |
| `tplus-000255-postsep-ice.jpg` | T+00:02:55 | Ice crystals / vent sparkle, S40 | Ship hull-cam | Fin |
| `tplus-000312-split-postsep.jpg` | T+00:03:12 | Booster looking at ship engines + S40 hull | Split booster / ship | Gridfin + fin |
| `tplus-000355-split-booster-engines.jpg` | T+00:03:55 | Booster aft engines over Earth + S40 | Split engine / hull | Gridfin |
| `tplus-000416-booster-hull-earth.jpg` | T+00:04:16 | Booster hull over ocean/clouds | Booster onboard | Gridfin |
| `tplus-000432-split-enginebay-hull.jpg` | T+00:04:32 | Raptor bells (IDs) + reflective hull / Earth | Split engine bay / hull | Gridfin |
| `tplus-000450-split-enginebay.jpg` | T+00:04:50 | Engine bay + tiled hull over Earth | Split | Gridfin + fin |
| `tplus-000514-booster-gridfin-earth.jpg` | T+00:05:14 | Grid-fin hardware, coast + exhaust trail | Booster onboard | Gridfin |
| `tplus-000537-split-enginebay-ship.jpg` | T+00:05:37 | Engine bay numbers + iridescent steel | Split | Gridfin + fin |
| `tplus-000550-split-gridfin-engines.jpg` | T+00:05:50 | Looking up Raptor bells + TPS / steel | Split | Gridfin + fin |
| `tplus-000626-sh-descent-clouds.jpg` | T+00:06:26 | Super Heavy 3 km, shadow on cloud deck | Booster hull-down | Chase (booster) |
| `tplus-000640-sh-landingburn-ocean.jpg` | T+00:06:40 | Super Heavy 0.1 km, ocean sun-glint | Booster hull-down | Chase (booster) |
| `tplus-000652-ship-hull-engines.jpg` | T+00:06:52 | S40 tiles/steel, ship engines still lit | Ship hull-cam | Fin |
| `tplus-000810-seco-hull-s40.jpg` | T+00:08:10 | SECO, tiles + steel, flap, Earth | Ship hull-cam | Fin |
| `tplus-000821-coast-hull-s40.jpg` | T+00:08:21 | Coast material ref: S40, TPS, Earth limb | Ship hull-cam | Fin |
| `tplus-001646-payload-deploy-start.jpg` | T+00:16:46 | Payload-bay door / hardware departing | Payload bay | Chase |
| `tplus-001826-payload-bay-door.jpg` | T+00:18:26 | Open payload-bay door in darkness | Payload bay | Chase |
| `tplus-002009-payload-satellite.jpg` | T+00:20:09 | Starlink V3 receding, ship belly/tiles | External / chase | Chase |
| `tplus-002739-payload-complete.jpg` | T+00:27:39 | Deploy complete, tiles + steel, flaps | Ship hull-cam | Fin |
| `tplus-003903-raptor-relight.jpg` | T+00:39:03 | In-space relight, flap + glow | Ship hull-cam | Fin |
| `tplus-004725-entry-plasma-split.jpg` | T+00:47:25 | Entry plasma on tiles + leading-edge glow | Split flap / hull | Chase / fin |
| `tplus-004853-entry-plasma-flaps.jpg` | T+00:48:53 | Plasma envelope on flap + fuselage | Split | Chase / fin |
| `tplus-010219-transonic-flap-earth.jpg` | T+01:02:19 | Transonic, flap + tiles over cloud deck | Hull / flap | Fin / chase |
| `tplus-010255-subsonic-hull-s40.jpg` | T+01:02:55 | Subsonic, S40, heat-tint steel, clouds | Hull / flap | Fin / chase |
| `tplus-010455-landing-approach.jpg` | T+01:04:55 | Belly-flop 1.9 km, tiles + iridescent steel | Hull-down over ocean | Chase |
| `tplus-010502-landing-burn.jpg` | T+01:05:02 | Landing burn start, 1.2 km, 3 engines | Hull-down | Chase |
| `tplus-010509-landing-low.jpg` | T+01:05:09 | 0.5 km, scorch, S40, engines | Hull-down | Chase |
| `tplus-010512-landing-plume.jpg` | T+01:05:12 | Pink landing plume, 0.3 km, missing tiles | Hull-down | Chase |
| `tplus-010520-splashdown.jpg` | T+01:05:20 | Soft splash, steam cloud, charred hull | External aerial | Chase |
| `tplus-010524-splash-steam.jpg` | T+01:05:24 | Intact ship in steam, engines-down on water | External aerial | Chase |
| `heatshield-tiles-post-splash.jpg` | post-splash (~1:45 webcast) | Intact hexagonal TPS, missing-tile targets, flap, ocean spray | Hull close-up | Fin |

## Notes for 3D work

- Ship hull marking is **S40**. Stainless is anisotropic with oil-canning; TPS is hexagonal, matte, with a few missing/white target tiles on the belly.
- Ascent plumes are **pink-white** in atmosphere, not a simple orange cone. Pad steam is dense and opaque.
- Hot-stage is a **split** beat: engine-bay glow + hull-cam over the Earth limb (matches Auto-cam gridfin cut).
- Entry plasma is magenta/violet on flaps and tiles, not a uniform orange shell.
- Landing is belly-flop until ~1 km, then engines-down with a pink plume and missing-tile wear before Indian Ocean splash.

## Motion sources (not captured yet)

Official @SpaceX highlight clips for later visual refinement. Watch on X; do **not** copy into `public/` / `src/` or treat as runtime theater video.

| Field | Value |
| --- | --- |
| Post | https://x.com/SpaceX/status/2082186658162626898 |
| Caption | Landing burn and splashdown of Starship on Flight 13 |
| Posted | 2026-07-28 |
| Media | Two 4K (3840×2160) videos (~51 s, ~59 s) plus a still |
| Theater use | [VISUAL_REALISM.md](../../docs/VISUAL_REALISM.md) **V17** splash steam / ocean glitter; landing-plume motion |

The stills catalog above is from the full webcast. Use this post when you need **motion** of the Indian Ocean landing burn, flip, and splash steam — the webcast stills already cover single frames of the same beat (`tplus-010502` through `tplus-010524` and `heatshield-tiles-post-splash`).
