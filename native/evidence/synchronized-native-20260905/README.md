# Synchronized Unreal comparison

All four ordinary-game runs pass shared-camera, AA, separate-history, actual-raster and independent raw-pixel registration checks. The single native window contains three 640×360 panes: point shading without AA, the same point source with Unreal TSR, and the analytic material with optional TSR. The source shader remains the validated production kernel; the candidate compiler check is separate.

| Capture | Saved source time (seconds) | Stable original-source points | Evidence |
| --- | ---: | ---: | --- |
| At rest | 0 | 878/878 | [Validation](../synchronized-render-20260905T232023.396211Z/validation-1788650796444.json) |
| Moving | 4.321043 | 873/873 | [Validation](../synchronized-render-20260905T232105.896347Z/validation-1788650796465.json) |
| Moving + combined TSR | 4.908064 | 871/871 | [Validation](../synchronized-render-20260905T232228.937444Z/validation-1788650796465.json) |
| Deliberate cuts + combined TSR | 0.992063 | 870/870 | [Validation](../synchronized-render-20260905T232319.229573Z/validation-1788650796476.json) |

Each run records 120 game frames, 121 real render families and 363 view observations, including the extra startup draw. Both render families at game frame zero are retained. The original implementation stopped one game frame early; its failed report and first native PNG remain archived. Every accepted run exits cleanly with no shader errors or ensures. Preparation preserves all 51 existing content assets.

The static image verifies a fixed pose, not a unique equal-pose frame. Moving images independently identify game frame 91/render family 93 within the observed screenshot interval. The combined-TSR pane has its own persistent history. The cut run records synchronized initial/cut flags at game frames 0, 22, 40, 59, 75, 92, 106; it establishes that cuts reach all views, not how quickly TSR visually recovers afterward.

The gallery uses lossless per-pane crops of the static and moving whole-window PNGs. No resizing or color conversion is applied. Crop hashes and rectangles are recorded beside each capture; the analytic gallery crops contain no visible red invalid-input or magenta declined-work sentinels.

## A corrected registration check

The old guard sampled parity at nine offsets within ±0.01 pixel. At sufficiently high frequency, those samples can skip whole pattern periods and agree even though the field changes between them. In the cut capture, the witness at pixel 472, 93 does exactly this; an interior point has the opposite source color. The original failed validation is preserved.

Version 2 keeps the same predetermined pixel grid but bounds both rational count coordinates throughout that neighborhood. A linear-fractional coordinate with fixed-sign denominator reaches its extrema at corners. A sample is accepted only when each count stays in a single half-cell throughout the rectangle. This selection uses source geometry only; output colors never choose exclusions. Every exclusion and all legacy results are retained. The additional expanded grid also remains visible, including nominal near-horizon source mismatches. Registration does not establish full-image or arbitrary subpixel correctness.

## Scope and reproduction

The actual primary raster sizes come from Unreal's public CPU uniform-buffer diagnostic map. It adds copying overhead and is disabled by default; these runs do not measure performance. The plugin uses the real game renderer with ordinary Shot, not an offline movie view or an offscreen capture. Motion continues through readback.

Run the [synchronized workflow](../../tools/synchronized-comparison.md). The plugin, project JSON and preparation script pass the real native build and commandlet. The launcher has 14 focused CPU tests; the independent validator has 18, including the actual old-guard witness and duplicate startup-family accounting. The two earlier C++ compiler errors and the first collision-profile preparation failure are retained alongside the fixes.

Still pending: representative material graphs, continuous temporal-error curves, post-cut recovery quality, isolated 1080p whole-frame and material cost, and a usable live-demo interaction layer. A checker stress scene and registered native stills are not a finished game benchmark. The analytic Gaussian filter differs from TSR's reconstruction filter; no overall winner or 60 FPS claim follows from these captures.
