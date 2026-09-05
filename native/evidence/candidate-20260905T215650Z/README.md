# Candidate 6eddded: correctness gates

This package tests `demo/ours-kernel-next.wgsl.js` from commit `6eddded0ef1f04479a9b0560ddda881307e4eece`. The candidate is isolated from the working file and has **not been promoted** into the production kernel. The numerical gates pass. The timing observations below do not establish a reliable intrinsic speed factor; native candidate rendering remains untested.

| Gate | Recorded result |
| --- | --- |
| [Direct homography fixtures](homography.json) | 122 pass, including 22 additional independent halfplane/disc quadrature cases |
| [Scene material probes](materials.json) | 120 checkerboard probes in three poses; actual RGBA32Float output |
| [Loop watchdog](watchdog.json) | All 8 expectations pass: 7 bounded real cases and an intentionally infinite negative control that exhausts the test budget |
| [Standalone HLSL compilation](../compile-20260905T215656.380252Z/report.json) | 8 DXC jobs pass: checker/circle, pixel/compute, DXIL/SPIR-V |
| [Candidate versus frozen values](numerical-comparison.json) | Both filtered arms pass the `1e-4` maximum sampled intensity-difference gate |

Against the [frozen 1612267 material report](../../../docs/compare-evidence/bounded-materials-2026-09-05T20-20-28.274Z.json), the largest absolute float differences are **1.1920928955078125e-7** for the lattice arm and **1.4901161193847656e-7** for the homography arm. Respectively 16 and 18 of 120 sampled values differ. Every reference value, reference-sequence disagreement, raw value, and original spectral control value is exactly identical. Both author arms' 8-bit sampled values are also identical. The JSON retains every changed float value and all gate failures, if any; this run has none.

The scene, shader adapters, browser capture implementation, reference implementation, and frozen production module have matching hashes in the two reports. The material runner changed only to add candidate selection and provenance checks. Each GPU report records stable before/after harness hashes; the candidate snapshots and production file also stayed unchanged during execution.

The selected export is **`OURS_KERNEL_CORE`**, excluding the ripple extension. The exact raw module SHA-256 is `f3d1cf46906a06f3780a32da3acc2bcab30a0fedeaf94aed6d13b0d5a790316f`. Its extracted core WGSL SHA-256 is `d0c52245280bc4e2bc9bd24e148c0c3095f09622b7073d1a8ff80448aff1737e`. The material/direct reports record the raw module hash plus selected export; [provenance](provenance.json) and the watchdog record the core hash separately. The CPU comparison independently extracts that same core from the archived module. This is source attribution, not an additional device-code readback.

The selector serves the committed bytes through a private Vite module and replaces only the resolved production module import. No working candidate file, external module dependency, or generated production artifact supplies the candidate shader. The production file still exists for normal import resolution and integrity hashing, and the common scene/adapters remain explicit harness dependencies. No `WORK` counter or other repair is injected. Raw source and adapter snapshots are retained beside each material/direct report.

These are bounded correctness observations: 120 selected checkerboard pixels are not an image-wide guarantee, and the separate circle fixtures are not full-scene circle rendering. Gaussian reference-sequence disagreement is not an error bound. Watchdog non-exhaustion is not a speed measurement. DXC compilation is not execution in Unreal's material environment or on Metal. Ripple validation, real-time cost, native candidate execution, and promotion remain separate steps.

Reproduce the numerical comparison using only the checked-in evidence, with no browser or Unreal launch:

```sh
node native/evidence/candidate-20260905T215650Z/compare-numerical.mjs --out=/tmp/moire-candidate-numerical-new.json
```

The output path must be fresh. GPU gates use the [candidate selector options](../../../tests/compare/candidate-source.md) and require coordinated GPU ownership.

[CPU controls](numerical-controls.json) also pass: a relocated evidence-only copy reproduces the comparison without a production source tree or native project, and a synthetic `+0.001` change to one lattice sample is rejected. The synthetic control is not rendering evidence.

## Bracketed homography timing

The performance runner now measures the actual homography entry, with a selectable method list. A stable/candidate/stable sequence, each at two resolutions and two fixed poses, retained 360 valid timestamp samples. Each case used five warm frames and 15 measured frames. The [comparison JSON](performance-comparison.json) links and hashes all three original reports.

| 1080p homography pose | Stable before | Candidate | Stable after |
| --- | ---: | ---: | ---: |
| t=0, GPU span / completed wall ms | 12.41 / 15.20 | 8.44 / 9.10 | 9.17 / 10.30 |
| t=8, GPU span / completed wall ms | 15.73 / 19.20 | 6.34 / 8.20 | 8.87 / 10.60 |

Candidate medians are lower in all four cases, but the unchanged raw control is nonstationary: its 640×360 t=0 completed-wall medians are 9.8 / 1.1 / 1.7 ms. Desktop activity and these short runs prevent a reliable intrinsic speed factor. GPU spans and completed queue times exclude presentation and the rest of a game; pass sums can overlap and are not elapsed time. Circle cost, native candidate execution and sustained gaming performance remain unmeasured. This batch does not accept production promotion from the timing results alone.
