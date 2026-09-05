# Fire controls: a local win, not a general fallback

The requested source-exact controls win decisively at `(100,120)` with four harmonics, but lose at `(300,12)` and `(400,60)` after their cost is counted. The tested boundary-masked construction loses at every pixel. This is a CPU, red-channel experiment on `fireBumps`, published amplitude, time zero; it is not an RGB frame, a GPU benchmark, or a comparison against the compiler's analytic mean.

## Results

Each cell below gives the range over two independent pilot/final seeds. A value above one means lower estimated variance at equal total computation. The ratio is `plain variance × plain cost per sample / (residual variance × controlled total cost per final sample)`; controlled cost includes the pilot and fit.

| Controls | `(300,12)` | `(400,60)` | `(100,120)` |
| --- | ---: | ---: | ---: |
| K = 1 | 0.50–0.52× | 0.69–0.71× | 1.24× |
| K = 4 | 0.49–0.51× | 0.81–0.83× | 14.44–15.74× |
| K = 8 | 0.48–0.49× | 0.81–0.84× | 14.51–15.80× |
| K = 16 | 0.46–0.47× | 0.80–0.81× | 13.29–15.05× |
| Boundary-masked, K = 16 | 0.44–0.45× | 0.44× | 0.46–0.47× |

The unmasked K = 4 arm reduces per-sample variance by 31.45–34.07× at `(100,120)`. Eight harmonics add little; sixteen add cost and slightly worsen the fitted residual. At `(400,60)`, the best per-sample reduction is about 1.75×, insufficient to pay for evaluating derivatives. At `(300,12)`, these features barely predict the source.

These results do **not** meet a requirement for a 3× gain across all three pixels. They do demonstrate that the useful order can be small and that fallback choice must depend on the actual source and total cost. The compiler's existing fast mean at `(100,120)` remains a separate competitor; a 15× sampling win here does not establish that sampling should replace it.

## Construction and unbiasedness

The controls use two smooth phases extracted from the actual shader evaluation: `2π × paletteBase / 6`, and the argument of the sine immediately inside the fire modulation's `sign`. Source values come from the original shader, including discontinuities. The derivative backend evaluates the phases at **every sampled point**, not just at the pixel center.

For each phase `q`, harmonic `k = 1..K`, and Gaussian offset `z` with σ = 1/2, form the vector fields

```
Fcos = w(z) k∇q(z) sin(kq(z)) / (k²|∇q(z)|² + σ⁻²)
Fsin = −w(z) k∇q(z) cos(kq(z)) / (k²|∇q(z)|² + σ⁻²).
```

The scalar control is `div F − z·F/σ²`. `w = χ` for the unmasked arm, where χ is one inside 4σ, a C² quintic transition, and zero outside 5σ. This support stays away from the perspective pole at every tested pixel. Integrating the divergence of `F` times the Gaussian density gives zero; discontinuities in the *target source* do not invalidate this identity, because the control field itself is smooth and compactly supported.

For the masked arm,

```
w = χ × η(sin(6 × palettePhase)) × η(sin(modulationPhase))
η(r) = r² / (r² + 0.15²).
```

The palette mask vanishes at every half-integer palette count, conservatively covering both modulation branches' palette boundaries. The field is split into two controls restricted to the positive and negative modulation branches. Both the mask and its first derivative vanish at a branch boundary, so this restriction introduces no missing boundary flux. All mask derivatives enter `div F`. This is one concrete masked family, with one fixed width; its failure does not rule out every possible mask or branch basis. The high gradient of a narrow mask can add considerable variance, while suppressing useful correlation.

The two phases give 4K controls, or 8K with the two branch restrictions. A 4,096-sample independent pilot fits their standardized covariance with ridge 0.001. Pilot and final samples use separate seeds. Conditional on that pilot, subtracting its fixed linear combination preserves the source expectation. Regularization changes efficiency, not this expectation identity.

## Cost and validation contract

The target budget was 750 ms per arm. Independent calibration chooses a fixed final sample count before drawing the evaluation samples, avoiding sample-dependent wall-clock stopping. Reported cost includes random-number generation, source evaluation, phase derivatives, all controls, pilot, covariance construction, and fitting. Module loading, JIT warmup, and benchmark calibration are excluded. Final counts were 114,146–141,158; pilot/fit costs were 21–54 ms. Actual controlled/plain total-time ratios were 0.888–1.031. The table normalizes by measured cost; exact same-duration execution is not claimed. It is an estimated variance-efficiency metric with two seeds, not a confidence interval or a hardware-independent speedup.

Each pixel has an independent 500,000-sample reference, with standard errors approximately 0.000421, 0.000493, and 0.000203 respectively. Both successful K = 4 estimates at `(100,120)` lie below their shared reference by 2.31 and 2.75 combined standard errors. Since the reference is shared, these are correlated comparisons, not two independent bias findings. They are also **not** a high-precision certification of the mean. The promised ten-million-sample references and held-out parameter tests remain outstanding.

Recorded numerical gates:

- Source values agree with the original numeric evaluator within 2.33e−13 at 120 fresh positions; phase gradients agree with finite differences within 2.81e−6 after scaling by `1 + |gradient|`.
- An independent vector-field finite-difference test checks 3,564 divergences, including both phases, harmonics 1/4/16, both branch restrictions, and the radial transition. Maximum scaled discrepancy is 1.34e−6 (gate 1e−4). This tests the implementation; the zero-mean justification is the divergence identity above.

Run from the repository root:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/gpu-followup/fire-controls-test.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/gpu-followup/fire-controls.mjs --budget=750 --reference=500000
```

The benchmark accepts `--scale=2` and `--out=NEW_FILE.jsonl`. It requires σ = 0.5 and rejects `MOIRE_REPO` overrides so the sampled source and recorded hashes always refer to the same local repo. Default output is a unique timestamped file under `runs/`; an existing output path is refused. The checked-in [41-record run](runs/fire-controls-2026-09-05T16-05-36.154Z-e3d87079.jsonl) includes source hashes, coefficients, sample counts, measured costs, source and residual variances, and mean diagnostics. The [divergence result](fire-controls-validation.json) records the additional implementation gate. Compiler files are imported read-only.

## Decision this supports

Use the transport/conditioning path where it has a source-valid fast mean. For residual sampling, price a small set of controls on the actual source, and always keep plain sampling as a candidate. Test K = 4 before paying for K = 16. If a selector is trained on sampled residuals, evaluate its choice on fresh samples and account for selection/setup cost; these per-arm fits do not yet implement or validate such a selector. A rejected control family should cost the renderer a bounded pilot, not every sample of every pixel.
