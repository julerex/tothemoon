# Sketchfab Super Heavy V3 look-reference

"SpaceX Starship Superheavy V3" (https://skfb.ly/pyZBo) by Ijsz23 is licensed
under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).
Author: https://sketchfab.com/Ijsz23
Canonical: https://sketchfab.com/3d-models/spacex-starship-superheavy-v3-12c91924d743465aac22f29ad8ba2e45

Booster-only render mesh (3.8M triangles). **Not** the runtime theater craft.
Author notes it is not optimized for real-time use. Do not import `scene.bin`
into the live scene.

Committed here: `scene.gltf` (node names, 4×4 matrices, accessor min/max) and
`license.txt`. Drop the full Sketchfab zip next to this file if you need
textures; `*.bin` / `textures/` stay gitignored.

```bash
npm run measure-sketchfab
```

Prints world-space Raptor ring radii and grid-fin pose versus the procedural
constants in `src/scene/craft/dimensions.ts`. Flight 13 webcast stills in
`assets/flight13-webcast/` remain the flown-hardware check (outer bells sit on
the skirt wall; fins sit just under the hot-stage).
