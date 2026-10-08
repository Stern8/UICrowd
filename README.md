# UICrowd
Dynamic use of HTML in canvas and audio to generate unique results.

## Opening sequence (`artifact.src.html`)

A wall of tiles over a dark underlayer (three.js, r128).

- **Hover:** tiles never leave their grid centre. They tilt toward the pointer through a smooth falloff, so neighbours turn almost together. Light and shadow (plus a faint sheen) show each tile's orientation, and thin dark seams open between tiles as they foreshorten. There are no outlines.
- **The held tile:** one tile on the right is held from behind by a character who is fully hidden. Hover it (it lifts and a tag appears), then **click or scroll**.
- **Sequence:** the hands let go, the tile drops out of the wall, the character looks up, and the camera dives through the gap to a close-up. Scroll is locked while it plays and released at the end. `Replay` resets it.
- **Rig:** the stand-in is the Mixamo "Xbot" mannequin from the three.js examples (`assets/Xbot.glb`), with a full finger rig. Arms use analytic two-bone IK, the palms are oriented from the bone geometry with the wrist twist shared into the forearm, and fingers are posed by curl plus CCD for the thumb. Swap in your own Mixamo-named rig by replacing the GLB.

Tune the look in the `CONFIG` block at the top of the script (copy, tile count, held-tile position, attractor reach/pull).

## Build

`artifact.html` is a single file with the model inlined as base64:

```
python3 tools/build_artifact.py
```

For local development open `artifact.src.html` through a static server (it loads `assets/Xbot.glb` over HTTP), e.g. `npx http-server -c-1`.
