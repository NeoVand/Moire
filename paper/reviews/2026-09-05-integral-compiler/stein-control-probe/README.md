# Phase-aware Gaussian Stein controls: bounded probe

These experiments read the original shaders in the Moire repository and do not modify that repository. They test whether automatically differentiated smooth phase features can cheaply produce zero-mean control variates. They are exploratory measurements, not a rendering-system benchmark or an accuracy guarantee.

Run with Node.js, from this directory:

```sh
MOIRE_REPO=/path/to/Moire node stein-phase-probe.mjs
MOIRE_REPO=/path/to/Moire node stein-full-shader-probe.mjs
```

Without the override, the scripts locate the repository relative to their own files, so they work from any current directory. The source imports use `FJET_LIB=1`, so the renderer's image-generation harness does not run. Output is JSON Lines to standard output; the included result files are the observed runs from September 5, 2026.

## What is tested

The smooth-feature experiment captures a phase from the actual shader evaluator using its existing backend interface. It tests the smooth palette feature `cos(sinArg/2)` from zigzag and the first Fourier feature `cos(2π arg)` from the expression immediately before `fract` in the quadratic shaders. It covers three pixels in each of three shaders, with two seeds.

The full-shader experiment samples the original first RGB output of `sinQuadratic` at `(300,12)`. Only its controls are smooth. It compares one harmonic (two cosine/sine controls) and four harmonics (eight controls) with jointly fitted coefficients.

All runs use Gaussian sigma 0.5, 10,000 independent pilot samples, 100,000 estimation samples, and a separate 500,000-sample numeric reference. Controls have a C2 radial cutoff, equal to one within four sigma and zero outside five sigma. All tested supports exclude the perspective horizon. The regularisation is fixed at lambda = 4.

For a smooth phase theta, the vector field is `F = chi grad(theta) sin(theta) / (|grad(theta)|² + lambda)`. Its Gaussian Stein operator is `div(F) - z·F / sigma²`, which has zero mean under the stated compact-support and smoothness conditions. Sine controls use `F = -chi grad(theta) cos(theta) / (|grad(theta)|² + lambda)`. Hard shader boundaries are never differentiated to make controls.

The numeric and derivative backends evaluate the same original source. Gradients of the captured phases are compared with finite differences in the smooth-feature result file.

## Main observations

- Smooth-feature results are mixed. The unperturbed quadratic far-field feature gives about 1,210 times lower variance; several other cases give no useful improvement after cost, and fixed coefficient one can severely increase variance. Independent pilot fitting mostly suppresses harmful controls.
- The large scalar improvement does not transfer wholesale to the full shader. One harmonic reduces full-shader variance about 2.56 times and loses after measured cost.
- Four harmonics reduce full-shader variance about 7.4 times, at roughly 2.9–3.1 times the measured cost including pilot fitting. The resulting estimated equal-time efficiency improvement is about 2.4–2.6 times.
- Both four-harmonic full-shader estimates are within 0.31 combined standard errors of the independent reference. This statistical agreement is a check, not a proof of numerical unbiasedness.

## Measurement limits

The equal-time figure is a variance ratio divided by a measured total-cost ratio; it is not a separately rendered fixed-budget comparison. Timings are single-machine JavaScript timings, include full source evaluation, exclude random-number generation, and are sensitive to warmup and scheduling. A specialised emitter evaluating only the required phase expressions may have different costs. The smooth-feature test is not the full shader, while the full-shader test covers only one pixel of one shader. No discontinuity-wide, horizon-crossing, animation, GPU, or unseen-material claim follows from these probes.

The next useful experiment is a fixed-budget comparison on a small held-out collection, including the observed failures, with coefficients either obtained structurally or fitted on an independent pilot. A phase's rate alone is insufficient to choose controls: derivatives of the normalised phase gradient can dominate the residual.
