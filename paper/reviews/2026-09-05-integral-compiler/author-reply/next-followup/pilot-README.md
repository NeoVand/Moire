# Fire pilot: price the fit and test its generalization

The useful K4 controls remain useful with much smaller pilots at `(100,120)`. But a selector that trusts training residual variance chooses overfit controls and often loses even there. Pilot sample count is therefore a cost–reliability choice, not just a setup-time knob.

This is a **CPU experiment**, using the same source-exact fire-with-bumps construction as the previous package: amplitude 1, time 0, red channel, Gaussian sigma 0.5. No compiler, app, or older probe was changed.

## Cost versus independent fit quality

At `(100,120)`, for the preselected K4 arm (16 real controls):

| Pilot samples | Setup, ms | Heldout variance reduction | Asymptotic equal-cost gain | Break-even budget, ms | Gain at 1 ms total | Seeds winning at 1 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 32 | 0.181 | 9.69× | 4.65× | 0.233 | 3.78× | 8/8 |
| 64 | 0.352 | 13.90× | 6.66× | 0.426 | 4.03× | 7/8 |
| 128 | 0.697 | 21.63× | 10.37× | 0.819 | 2.51× | 8/8 |
| 256 | 1.401 | 25.71× | 12.33× | 1.526 | infeasible | — |
| 512 | 2.756 | 29.48× | 14.14× | 2.971 | infeasible | — |
| 1,024 | 5.569 | 31.08× | 14.91× | 5.964 | infeasible | — |
| 4,096 | 22.276 | 32.34× | 15.51× | 23.875 | infeasible | — |

Entries are medians over eight independently seeded pilots. These are not guarantees: at 1 ms, NP32 gains range **1.59–6.01×**, NP64 **0.90–8.16×**, and NP128 **1.55–3.71×**. More pilot samples do not monotonically improve every individual fit or its gain after setup cost.

The two other target pixels reject these controls on cost even before setup: across every tested sample count, arm, and seed, asymptotic equal-cost gains are at most **0.503×** at `(300,12)` and **0.852×** at `(400,60)`. At `(100,120)`, masked16 also loses at every tested count/seed; at NP4096 its median gain is only about 0.51×.

Warm final-sample costs are about **2.49–2.62 microseconds** for the numeric source and **5.03–5.79 microseconds** for source plus derivatives, controls, and subtraction. Small nonmonotonic differences between harmonic counts are timing noise, not evidence that a larger arm is intrinsically cheaper.

## What setup costs

Representative median stage timings at `(100,120)`, in milliseconds:

| Arm, pilot | RNG | Source + derivatives | Controls | Gram + covariance | Solve | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| K4, 32 | .0010 | .1562 | .0071 | .0096 | .0052 | .1811 |
| K4, 4,096 | .1506 | 20.5853 | .8376 | .6511 | .0074 | 22.2763 |
| Masked16, 32 | .0010 | .1584 | .0113 | .1258 | .2693 | .5704 |
| Masked16, 4,096 | .1561 | 20.7012 | 1.3375 | 9.4586 | .2772 | 31.8341 |

Total also includes allocation/bookkeeping; separately reported stage medians need not sum to the median total. K4's price is mostly obtaining source derivatives. The 128-dimensional masked fit also pays substantial Gram and solve costs. Fitting all five arms separately repeats source work; this deliberately unoptimized search price is recorded, not proposed as the implementation.

## Why training loss cannot be the selector

K1/K4/K8/K16 have 4/16/32/64 real coordinates; masked16 has 128. The centered covariance rank is at most `NP−1`. Ridge makes an undersampled system solvable; it does not make its training residual a reliable forecast.

At `(300,12)`, NP32 K16 has a median heldout variance **550,712 times** its training residual variance. Even at the favorable pixel, NP32 K4's ratio is 26.0. All 840 numerical fits completed without a failed pivot, so a solver-success test would miss this failure.

The results include an actual selection diagnostic: fit all five arms, pay their measured setup sum, then choose by **training residual variance / affordable final samples**, with an explicit plain-source candidate. At NP32 and a 10 ms budget, median gains against plain sampling without any pilot are:

| Pixel | Training-selected gain | Winning seeds |
| --- | ---: | ---: |
| `(300,12)` | 0.062× | 0/8 |
| `(400,60)` | 0.245× | 0/8 |
| `(100,120)` | 0.709× | 2/8 |

Heldout samples only audit the selection; they never choose it. At a 1 ms budget the five-fit search is already infeasible. These failures do not prove every small-pilot selector fails. They show why reporting a favorable arm chosen after inspecting heldout results would not price a usable selector.

## Budget model and frame implications

Let `T` be setup time, `c0,c1` final-sample costs, and `v0,v1` independently measured source/residual variances. The model uses fixed integer final counts:

```
N0 = floor(B/c0), N1 = floor((B−T)/c1)
gain = (v0/N0) / (v1/N1)
A = (v0/v1) (c0/c1)
continuous break-even B* = T/(1−1/A), only when A > 1
```

Infeasible counts are reported explicitly. Pilot samples are not recycled into the final estimate, and this is not a wall-clock stopping estimator. Validation/search costs beyond the measured setup must be added to `T` for any future selector.

At 1080p/60 Hz, giving the entire frame to fallback leaves only 0.804, 8.04, or 80.4 microseconds per fallback pixel when 1%, 0.1%, or 0.01% of pixels use it. Even the NP32 K4 CPU pilot exceeds all three. With no rendering or final samples, 16.67 ms buys only about 92 such pilots. This arithmetic rules out naively paying these **CPU** setup costs independently at those densities; it does not predict GPU performance.

A bounded next experiment is to fit once per tile/material/cache entry and reuse the coefficient vector with fresh final samples, while testing nearby pixels and later frames on separate validation samples. The zero-mean control identity permits fixed coefficients to remain unbiased at each pixel if they are independent of that pixel's final samples. Useful variance reduction need not transfer. Amortization and a validation/rejection policy are **not tested here**; their costs and failures belong in the next comparison.

## Reproduce and inspect

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/pilot-sweep.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/pilot-check.mjs
```

The sweep accepts `--seeds=8`, `--holdout=65536`, and `--out=NEW.jsonl`; the check accepts `--results=RESULTS.jsonl` and `--out=NEW.json`. Both refuse overwrites. The sweep's final warm run is [the 1,074-record JSONL](pilot-results-2026-09-05T16-50-24.702Z-967bf3a4.jsonl). It contains every coefficient vector, timing replicate, heldout diagnostic, modeled budget, and selection decision. The [independent check](pilot-check-results-2026-09-05T16-53-50.635Z-3bb947bb.json) reconstructs 90 saved fits: feature slicing agrees exactly, direct residual variance differs by at most `4.11e−15`, and normalized ridge normal-equation residual is at most `3.91e−15`.

Protocol: Node 24.20.0 on Apple M4; five warm 4,096-sample cost calibrations per arm; eight pilot seeds; seven sample counts; five arms; three pixels. A separate 65,536-sample heldout set per pixel supplies eight batch variance estimates. Pilot sample prefixes are nested across counts, and all fits share that pixel's heldout set, so comparisons are paired rather than independent. Conditional heldout variance standard errors for favorable K4 are roughly 2–6% at the counts above; unstable fits at the difficult pixels can be noisier. Eight seeds and three pixels do not certify population-wide reliability.

The source and probe SHA256 hashes are embedded in the run. Compiler hashes match at start/end. Imported derivative-source values agreed with the numeric source to `2.05e−13` on the explicit spot checks. The standardized ridge policy and control construction are preserved from [fire-controls.mjs](../gpu-followup/fire-controls.mjs); the new solver/residual checks supplement its existing divergence tests. Heldout fit quality, floating-point numerical checks, and the mathematical zero-mean identity are distinct evidence.
