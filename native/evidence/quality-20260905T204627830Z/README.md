# Native fixed-pose quality diagnostic

Status: measured-no-integration-alarm. Sources, camera metadata, size, and common settings match; native AA modes are 0 / 4 / 0. The raw point check matches at 47/47 stable fixtures; 7 boundary fixtures are retained in quality statistics but omitted from that parity check.

The 54 fixed off-axis pixels use an independent original ray/plane checker reference, Gaussian sigma 0.5 pixels, two 65,536-sample sequences. Maximum sequence disagreement is 1.5649e-3 linear RGB; this is a convergence diagnostic, not a bound.

| Arm | Linear RGB RMSE | Maximum error | RMSE after display allowance | Maximum after allowance |
| --- | ---: | ---: | ---: | ---: |
| raw | 2.7128e-1 | 4.0171e-1 | 2.6653e-1 | 3.9724e-1 |
| tsr | 1.1312e-1 | 3.4017e-1 | 1.0905e-1 | 3.3702e-1 |
| analytic | 2.1502e-3 | 5.4581e-3 | 0.0000e+0 | 0.0000e+0 |

The display allowance uses the inverse-sRGB interval corresponding to each readback byte plus or minus 1.5 codes. The complete raw image is within one integer code of the **rounded** expected palette (maximum 1.050277 codes from the unrounded value). Half a code accounts for rounding. Extending this allowance from those palette anchors to intermediate colors is a diagnostic, not a certified continuous transfer bound or a measurement of pure shader error. The sample-sequence disagreement is reported separately and is not added as an error bound.

TSR uses a different reconstruction filter. This table measures deviation from the chosen Gaussian and does not declare an overall winner. PNG readback has quantization and dithering.

- One fixed Glide0 pose, 640 by 360, unlit plane only; these measurements do not establish motion quality, disocclusion, scene-general accuracy, or real-time frame cost.
- MRQ uses the native deferred renderer and TSR but bIsOfflineRender=true. The 64 discarded fixed-pose samples warm history; convergence has not been demonstrated. This is a quality capture, not a live gameplay timing measurement.
- TSR reconstructs with its own history/filter/sharpening. Error against the selected sigma=0.5 Gaussian is a target-specific diagnostic, not an overall AA ranking.
- PNG is 8-bit with observed dithering. One local display-code step and two-sequence differences are reported separately; neither is a certified total error bound. No float-render-target accuracy claim.
- Matching camera metadata and independent raw phase checks support registration at tested pixels. Analytic and raw maps necessarily differ in material; metadata equality alone is not full scene identity proof.
- The fixed family excludes geometric horizon and plane edges; it does not measure filtering across geometry boundaries.

Reproduce: `node native/tools/compare_mrq.mjs`. Explicit `--raw`, `--tsr`, `--analytic` report paths, an optional `--preparation preparation.json` archive path, and a fresh `--out` directory are also accepted. This performs CPU image analysis only and needs no Unreal installation or generated assets. PNGs resolve from each report directory’s `frames/` folder; the exact preparation JSON defaults to the sibling `mrq-prepare-20260905T203352.265013Z/preparation.json`. For a new capture batch, pass its exact archived preparation JSON with `--preparation`; its hash must match every input report. Captured absolute paths remain provenance only. Full per-pixel data, capture hashes, configuration, and actual queried cvars are in [report.json](report.json).

The optional preparation path was tested using an archive copied outside the repository, a relative argument, and a different working directory. The default and explicit-path runs produced identical per-pixel values and summaries. See [preparation-option-proof.json](preparation-option-proof.json).
