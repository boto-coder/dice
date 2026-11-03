# Performance check (milestone 8)

Measured with `node scripts/perf.mjs http://localhost:4173` against a production build
(`npm run build && npm run preview`), rolling a full tray of 20 mixed dice
(d4 … d100, repeated) three times per setup.

**Caveat:** headless Chromium renders WebGL in software (SwiftShader). That is slower than
a phone's GPU, so these numbers are pessimistic for drawing; the CPU slowdown stands in for
a mid-range phone's slower processor. A check on a real phone is still worth doing.

## Results

| Setup                  |       Mean frame |  Median | 95th percentile | Frames below 30 fps | Longest frame (first roll / later) |
| ---------------------- | ---------------: | ------: | --------------: | ------------------: | ---------------------------------- |
| Desktop 1280×860       | 16.9 ms (59 fps) | 16.7 ms |         16.8 ms |                  0% | 117 ms / 17–33 ms                  |
| Pixel 7 emulation      | 17.0 ms (59 fps) | 16.7 ms |         16.7 ms |                  0% | 117 ms / 17–33 ms                  |
| Pixel 7, 4× slower CPU | 19.0 ms (53 fps) | 16.7 ms |         33.3 ms |                  5% | 150 ms / 33 ms                     |

Physics for 20 mixed dice costs about 0.2 ms per step in Node (one step per frame).

## What changed to get there

| Problem                                                                                | Before                                                           | Fix                                                                             | After           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------- |
| The d100's 100-face hull colliding with other dice                                     | 4.1 ms per physics step for 20 mixed dice (494 ms with 20 d100s) | The d100 touches the table with its real hull but other dice with a ball shape  | 0.2 ms per step |
| Shaders recompiled on every roll (old materials were disposed, freeing their programs) | 70–120 ms stall when a roll starts                               | Materials are cached and shared; glow uses a cached variant                     | 17–33 ms        |
| First roll drew and uploaded every label texture and compiled shaders                  | 450–720 ms stall                                                 | Textures are built and shaders compiled while the browser is idle after loading | 117–150 ms      |
| Every roll reallocated the WebGL drawing buffer to update the zoom                     | part of the stall above                                          | Only resize the canvas when its size really changes                             | —               |
| Shader error checks read compile logs synchronously                                    | part of the stall above                                          | Disabled in production builds (as three.js recommends)                          | —               |

## Dice looks (milestone 11)

Measured with `node scripts/perf.mjs --styled` (every die type a different look: solid,
marble, speckled, gradient, swirl and stripes, in matte, glossy and metallic), production build,
headless Chromium with software WebGL.

| Run                    | Mean frame       | Median  | Worst frame, first roll (before → after) |
| ---------------------- | ---------------- | ------- | ---------------------------------------- |
| Desktop 1280×860       | 16.7 ms (60 fps) | 16.7 ms | 733 ms → 33 ms                           |
| Pixel 7 emulation      | 17.6 ms (57 fps) | 16.7 ms | 650 ms → 33 ms                           |
| Pixel 7, 4× slower CPU | 22.0 ms (45 fps) | 16.7 ms | 733 ms → 67 ms                           |

Patterns are drawn once per look into the label texture, so they cost nothing per frame.
The first-roll stall came from shaders the warm-up did not build: the reflective
(glossy/metallic) shader with its reflection map, and the shadow-map shader (also missing for
plain dice, the 117–150 ms above). The warm-up now draws one hidden frame with one sample die per
finish in use, which builds all of them; the default look's first roll is now 33–100 ms too.

## Settling

See [fairness-report.md](fairness-report.md): single dice settle in 1.0–1.8 s on average and a
full tray of 20 dice in about 2.5 s, with about 1.4% of full-tray throws hitting the 5 s
timeout (the roll is still valid; the dice are frozen and read as usual).
