# UICrowd
dynamic use of HTML in canvas and audio to generate unique results

## Opening sequence

`index.html` + `main.js` + `style.css` — a Three.js hero (no build step; three is vendored in `vendor/`).

- **Hover:** the hero type is painted to a canvas and sliced across a grid of tiles. Tiles near the pointer lift, tilt and drift apart (spring physics, instanced mesh).
- **Scroll:** tiles peel away from one special tile (the "held" one) which has a hole cut through it. The camera dollies into the hole until it fills the view, then the video behind recedes to full frame. The clip (`assets/reveal.mp4`, WebM fallback) is scrubbed by scroll, so the paper drops and the person is revealed.
- Tune the look in the `CONFIG` block at the top of `main.js` (copy, tile count, hole position/size). Scroll length is `#stage { height }` in `style.css`.

Run locally with any static server that supports HTTP Range requests (needed for video seeking), e.g. `npx http-server -c-1`. Python's `http.server` does not support Range, so the video won't scrub there.
