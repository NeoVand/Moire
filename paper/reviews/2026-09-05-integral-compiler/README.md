# Integral compiler review — September 5, 2026

Start with [the message to the author](MESSAGE.md), then read [the technical note](moire-next-theory.md). This folder contains the review, reproducible correctness probes, and exploratory Gaussian Stein-control experiments discussed with Neo.

## Contents

| File | Purpose |
|---|---|
| [moire-next-theory.md](moire-next-theory.md) | Findings, proposed mathematical architecture, answers to the five reviewer questions, and three questions for the author. |
| [moire-regression-probe.mjs](moire-regression-probe.mjs) | Nine deterministic measurements covering four correctness or source/model issues. |
| [stein-control-probe/README.md](stein-control-probe/README.md) | Experimental method, observed wins and failures, limitations, and run instructions. |
| [stein-control-probe/stein-phase-probe.mjs](stein-control-probe/stein-phase-probe.mjs) | Smooth components extracted from the actual shader definitions. |
| [stein-control-probe/stein-full-shader-probe.mjs](stein-control-probe/stein-full-shader-probe.mjs) | The original `sinQuadratic` shader's first RGB channel, with smooth controls. |
| `stein-control-probe/*-results.jsonl` | Original recorded experimental results, preserved unchanged. |
| [source-manifest.json](source-manifest.json) | Git revision and hashes of the relevant source files at packaging. |

## Reproduce

From the repository root, using Node.js:

```sh
node paper/reviews/2026-09-05-integral-compiler/moire-regression-probe.mjs
node paper/reviews/2026-09-05-integral-compiler/stein-control-probe/stein-phase-probe.mjs
node paper/reviews/2026-09-05-integral-compiler/stein-control-probe/stein-full-shader-probe.mjs
```

The scripts locate this checkout relative to their own files, regardless of the current working directory. Set `MOIRE_REPO=/path/to/another/checkout` to test another checkout. They import the experimental compiler and shader library, print JSON Lines, and do not write images or benchmark data. For the recorded setup, use a clean shell without other `FJET_*` or `STEIN_LIB` overrides; the scripts set library mode internally.

The regression script is a diagnostic reporter: it prints actual and expected values and exits normally even when discrepancies are present. A successful process exit does **not** mean all correctness checks passed. The cubic case intentionally distinguishes original-source semantics from the identically zero quadratic model; the other listed failures are within the represented model.

## Investigation order

1. Reproduce the varying-field identity collision and separate semantic equality from approximate cache reuse.
2. Preserve correlation when integrating curved masks with other varying factors; retain the positive-scaling test for hard events.
3. Specify when a finite jet represents a model and when the compiler claims correctness for the original source.
4. Evaluate Stein controls against ordinary sampling and the existing analytic-model residual approach at equal total cost, on parameters frozen before tuning. Include unsuccessful cases and method-selection cost.

The full-shader probe observed about 7.4× variance reduction at roughly 3× evaluation cost, suggesting 2.4–2.6× better sampling efficiency. It covers one channel at one pixel on a CPU. It is not a frame-speed result or a comparison against the existing analytic compiler. The smooth-feature result near 1,210× does not describe full-shader performance.

The technical note describes the earlier read-only investigation. Adding this review folder is a subsequent packaging step; compiler source, application code, and existing benchmark data were not changed. Results and line references should be rechecked as the source evolves.
