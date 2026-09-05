# Ordinary-game capture diagnostic

Status: measured-filter-specific-diagnostic. 54/54 fixed sample locations remain after geometry exclusions. Source time: 2.0166667739550275 seconds (unique dense original-ray registration among recorded post-request game frames). Sequence remains playing through screenshot readback. Raw pixels independently identify saved time; other arms use matching observed camera and readback-phase metadata. One moving frame does not establish temporal quality over a trajectory.

| Arm | Linear RGB RMSE | Maximum | RMSE after display allowance |
| --- | ---: | ---: | ---: |
| raw | 2.79080e-1 | 4.90390e-1 | 2.74302e-1 |
| tsr | 9.61393e-2 | 2.30107e-1 | 9.13660e-2 |
| analytic | 4.33559e-3 | 1.13700e-2 | 2.58366e-4 |

- A failed transfer or source-matching gate withholds linear quality scores. Three source colors can validate these calibration anchors but do not prove an arbitrary continuous display transform; no curve is fitted.
- TSR uses its own reconstruction filter and history. The Gaussian target supplies a filter-specific diagnostic, not an overall winner.
- Native 8-bit or 16-bit PNG samples are preserved. Calibration and the ±1.5-code allowance use an explicitly normalized 0–255 display scale, not one 16-bit PNG code. The allowance follows ±1 display code relative to rounded palette anchors; applying it to intermediate colors is not a certified transfer bound or pure shader error.
- Capture uses the existing ordinary game view but this image analysis establishes no GPU/frame-time performance.
- 64 warmup frames warm temporal history; convergence is not demonstrated.
- Geometric horizon/finite-plane edges are excluded. Recorded preparation and shader hashes do not replace a measured native transform; raw phase checks independently test registration at retained stable samples.
- Motion time is sourced from metadata or explicit --time; output frame number alone does not establish animation time for fixed-pose sequences.

Reproduce with explicit `--raw`, `--tsr`, and `--analytic` report paths: `node native/tools/compare_game_capture.mjs --raw raw/report.json --tsr tsr/report.json --analytic analytic/report.json`. Optional `--time seconds` must agree with sample-time metadata; optional `--out` must name a new directory. PNGs resolve from each report's `frames/` directory; an adjacent `preparation.json` is verified when present. This tool never opens captured absolute provenance paths or runs Unreal. Details: [report.json](report.json).
