# Ordinary-game comparison: scope and remaining precision

Both triplets passed source/settings/preparation matching, observed-camera checks, documented power gamma 2.2 palette calibration, and independent original-ray registration. The fixed raw image passes 885/885; the time 2 image passes 879/879. Both retain all 54 fixed Gaussian-quality probes.

| Arm | Fixed-camera RGB RMSE | After motion history at 2 s RGB RMSE |
| --- | ---: | ---: |
| raw | 0.267730 | 0.279330 |
| tsr | 0.113363 | 0.098215 |
| analytic | 0.004138 | 0.004817 |

These errors use a Gaussian with sigma 0.5 pixels. TSR uses its own reconstruction filter, so this is a chosen-target diagnostic. The time 2 sequence played continuously from frame 55 to 120, then paused for one additional stationary readback frame. It is not an uninterrupted-motion measurement. Neither image test measures frame rate or full GPU cost.

After the unchanged ±1.5 display-code allowance, the fixed analytic residual remains in 3 channel samples, all blue; the largest is 0.003510806 linear at (137, 148), whose observed RGB is (216, 216, 215). The shader emits grayscale, so channel-dependent output precision/dither contributes. This observation does not establish the cause of the complete remaining error; the allowance was not widened. The time 2 report similarly retains nonzero residuals (maximum 0.004268814).

The maximum two-sequence reference disagreements are 1.5649e-3 fixed and 2.9356e-3 after motion history; these are convergence diagnostics, not confidence or error bounds. Full channel residuals and report hashes are in [residual-notes.json](residual-notes.json). The corresponding time 2 result is [here](../game-quality-20260905T212756753Z/README.md).
