# Sketchfab Super Heavy V3 look-reference

"SpaceX Starship Superheavy V3" (https://skfb.ly/pyZBo) by Ijsz23 is licensed
under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).
Author: https://sketchfab.com/Ijsz23
Canonical: https://sketchfab.com/3d-models/spacex-starship-superheavy-v3-12c91924d743465aac22f29ad8ba2e45

Booster-only render mesh (3.8M triangles). **Not** imported whole.
Author notes it is not optimized for real-time use. Do not load `scene.bin`.
Runtime Super Heavy engines use one extracted inner Raptor, simplified to
~13k triangles and cloned 33 times (`public/models/raptor-sl.glb`). Rebuild:
`npm run raptor-sl` (needs the Sketchfab zip). Ship vacuum bells stay procedural.

Committed here: `scene.gltf` (node names, 4×4 matrices, accessor min/max) and
`license.txt`. Drop the full Sketchfab zip next to this file if you need
textures; `*.bin` / `textures/` stay gitignored.

```bash
npm run measure-sketchfab
```

Prints Raptor ring radii and grid-fin pose in the **Superheavy local frame**
versus `src/scene/craft/dimensions.ts`. Flight 13 webcast stills in
`assets/flight13-webcast/` remain the flown-hardware check (outer bells sit on
the skirt wall; fins sit just under the hot-stage).

Agent traps (also in `AGENTS.md`):

- The Sketchfab root translates `Superheavy v3_36` by **(0, 50, 20)**. World-space
  `hypot(x, z)` is ~20 m for every ring. Always invert that node’s world matrix
  (`measureSketchfabBooster`); do not measure in file world space.
- Do not copy outer radius **4.24 m** onto the theater — the 1.3 m bells would
  hang outside the 9 m barrel. Theater outer is **3.85 m** (lip on the skirt;
  `BOOST_RING_OUTER + SL_BELL_R < R * 1.02`). T+5:50 stills win over the download.
- `GRID_FIN_FROM_TOP_M` is meters (`gridFinZ()`). Subtracting `0.48` from
  `BOOST_H` is 19 m of mesh units, not “a bit below the hot-stage.”
- Keep fin chord ~0.9 m (factory diamond lattice). This file’s 0.33 m chord is a
  sheet. Keep `GRID_FIN_AZIMUTHS[0] === π/2` (gridfin-cam).
