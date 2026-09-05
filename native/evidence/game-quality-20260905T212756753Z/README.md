# Ordinary-game capture diagnostic

Status: measured-filter-specific-diagnostic. 54/54 fixed sample locations remain after geometry exclusions. Source time: 2 seconds (prepared fixed-camera metadata at its recorded time). Continuous playback to target, then paused for one additional stationary readback frame; not an uninterrupted motion capture.

| Arm | Linear RGB RMSE | Maximum | RMSE after display allowance |
| --- | ---: | ---: | ---: |
| raw | 2.79330e-1 | 4.92998e-1 | 2.74321e-1 |
| tsr | 9.82149e-2 | 2.32051e-1 | 9.34632e-2 |
| analytic | 4.81658e-3 | 1.44472e-2 | 5.48314e-4 |

- A failed transfer or source-matching gate withholds linear quality scores. Three source colors can validate these calibration anchors but do not prove an arbitrary continuous display transform; no curve is fitted.
- TSR uses its own reconstruction filter and history. The Gaussian target supplies a filter-specific diagnostic, not an overall winner.
- Native 8-bit or 16-bit PNG samples are preserved. Calibration and the ±1.5-code allowance use an explicitly normalized 0–255 display scale, not one 16-bit PNG code. The allowance follows ±1 display code relative to rounded palette anchors; applying it to intermediate colors is not a certified transfer bound or pure shader error.
- Capture uses the existing ordinary game view but this image analysis establishes no GPU/frame-time performance.
- 64 warmup frames warm temporal history; convergence is not demonstrated.
- Geometric horizon/finite-plane edges are excluded. Recorded preparation and shader hashes do not replace a measured native transform; raw phase checks independently test registration at retained stable samples.
- Motion time is sourced from metadata or explicit --time; output frame number alone does not establish animation time for fixed-pose sequences.

Reproduce with explicit `--raw`, `--tsr`, and `--analytic` report paths: `node native/tools/compare_game_capture.mjs --raw raw/report.json --tsr tsr/report.json --analytic analytic/report.json`. Optional `--time seconds` must agree with sample-time metadata; optional `--out` must name a new directory. PNGs resolve from each report's `frames/` directory; an adjacent `preparation.json` is verified when present. This tool never opens captured absolute provenance paths or runs Unreal. Details: [report.json](report.json).
