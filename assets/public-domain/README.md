# NASA / FAA look-reference stills

Development **reference frames** from U.S. government sources. Not runtime theater
textures (keep them out of `public/` / `src/`). Same role as
[`assets/flight13-webcast/`](../flight13-webcast/): pad layout, engine-bay
massing, HLS silhouette, and ascent-plume color.

U.S. government works from NASA and the FAA are generally not subject to
copyright in the United States (17 U.S.C. § 105). Retain credit when
redistributing. NASA logos and emblems stay restricted (14 CFR 1221).
SpaceX-originated HLS concept art remains credited to SpaceX even when NASA
republished it with the HLS award.

## Catalog

| File | What | Source |
| --- | --- | --- |
| `faa-boca-chica-launch-site-2024.jpg` | Starbase orbital site plan: OLM-1 / OLM-2, shared tank farm, SH 4, flame-diverter ponds. North is up. | FAA, 18 July 2024. [faa.gov/media/82786](https://www.faa.gov/media/82786). Wikimedia [BocaChicaLaunchSiteFaaGov2024](https://commons.wikimedia.org/wiki/File:BocaChicaLaunchSiteFaaGov2024.jpg). |
| `nasa-ship-20-suborbital-pad-2021.jpg` | Ship 20 on the suborbital pad: hexagonal TPS, stainless windward, aft flaps, people at the mount for scale. | NASA, 21 Dec 2021. [@NASAArtemis](https://twitter.com/NASAArtemis/status/1473409582341017606). Wikimedia [Ship 20 on suborbital pad](https://commons.wikimedia.org/wiki/File:Ship_20_on_suborbital_pad.jpg). |
| `nasa-super-heavy-engine-bay-2021.jpg` | Super Heavy aft in the high bay: engine section, COPVs, plumbing, visitors at the skirt (engines not yet fitted). | NASA Marshall, 21 Dec 2021. [@NASA_Marshall](https://twitter.com/NASA_Marshall/status/1473684792973705223). Wikimedia [NASA Marshall visit to Super Heavy booster](https://commons.wikimedia.org/wiki/File:NASA_Marshall_visit_to_Super_Heavy_booster.jpg). |
| `nasa-iss-starship-flight-6-plume-2024.jpg` | Flight 6 Super Heavy plume over the Gulf of Mexico, photographed from ISS. | NASA/Don Pettit, 19 Nov 2024. Photo ID [iss072e220043](https://commons.wikimedia.org/wiki/File:The_launch_of_the_SpaceX_Starship_6_rocket_seen_from_the_space_station_(iss072e220043).jpg). |
| `nasa-artemis-iii-mission-profile.png` | Artemis III CONOPS: depot + tanker + HLS launches, SLS/Orion, NRHO rendezvous, south-pole landing. | NASA HLS program infographic (Kent Chojnacki / NASA SE&I; NTRS 20220003725 family). |
| `nasa-hls-starship-rendering.jpg` | HLS Starship on the lunar surface: white lander, landing legs, astronauts at the base, Earth on the limb, Artemis mark. | NASA 2021 Artemis banner (Patricia Moore). Wikimedia [HLS Starship rendering](https://commons.wikimedia.org/wiki/File:HLS_Starship_rendering.jpg). |
| `nasa-starship-artemis-proposal.jpg` | HLS proposal render: elevator cage mid-stack, two crew, Earth crescent. Early bid art — not current flight hardware. | SpaceX concept art released with NASA HLS materials. Credit SpaceX. |

## Notes for 3D work

- The FAA plan is **Pad 1–era** (OLM-1 live, OLM-2 future). Flight 13 is the reverse: live OLP-2, empty OLP-1. Use it for farm / SH 4 / pond topology, not for which pad has the stack.
- Ship 20 tiles and Super Heavy engine-bay plumbing are the closest public-domain stills of real hardware. Webcast stills in `flight13-webcast/` are later V3 / Flight 13 and © SpaceX.
- Flight 6’s ISS plume is a **grey-white** Gulf trail, not the pink-magenta Raptor core the webcast hull-cams show. Use it for high-altitude trail color against ocean, not pad/ascent lighting.
- HLS renders omit flaps and heat shield (no Earth entry). Do not copy the white paint or elevator onto the Flight 13 stack mesh.
