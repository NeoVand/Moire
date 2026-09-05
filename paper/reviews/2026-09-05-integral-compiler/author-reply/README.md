# Follow-up package

The latest package answers `REPLY-2.md`: start with [our third reply](REPLY-3.md) and [the GPU and row prototypes](gpu-followup/README.md). The earlier package below addresses the author's `THEORY-NOTE.md`: Bessel field transforms, spectral control variance, and correlated coverage. Our implementation stays in this review folder; compiler source is untouched.

| Request | Deliverable | Scope |
| --- | --- | --- |
| Bessel check | [Validation](bessel-validation.md), `bessel-shift-probe.mjs`, `bessel-shift-results.jsonl` | Actual private shift-table routine and extracted ripple factors; coefficient tests, not full-shader/GPU performance. |
| Spectral control oracle | [Derivation](spectral-control-answer.md), `spectral-control-probe.mjs`, `spectral-control-results.json` | Exact polynomial–phase products, singular/ridge cases, and a source/model counterexample. |
| Correlated coverage | [API and integration](CORRELATED-COVERAGE.md), `gaussian-chirp.mjs`, reference fixtures and tests | Callable CPU interval moments; optimized scaled-Faddeeva, compiler integration, and GPU backend remain open. |
| Recheck existing repairs | `regression-results.jsonl` | Nine original measurements rerun; repaired cases reproduce and the cubic retains the stated model/source discrepancy. |

Run from the repository root:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/bessel-shift-probe.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/spectral-control-probe.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/test-coverage.mjs
```

All three checks pass. The Bessel probe records source hashes and writes a unique timestamped JSONL file under `runs/`; `--out NEW_FILE.jsonl` chooses another path. It refuses to overwrite existing files. The checked-in `bessel-shift-results.jsonl` is the historical result. The spectral probe writes JSON to standard output. Coverage tests use checked-in high-precision fixtures; Python/mpmath is only needed to regenerate them. Each detailed note states the numerical assumptions and untested scope.
