# The interval primitive runs in WGSL; its surrounding schedule is the bottleneck

`coverage.wgsl` is a callable float32 implementation of the bounded local-series
method. It was compiled and executed on real WebGPU, then used to replay all
704 inner calls of your unchanged `correlated-coverage-adapter.mjs`. The resulting
three complex means differ from its CPU results by at most **9.94e-9**. The
remaining work is a faster integration schedule and a production error contract;
there is no general obstruction to running this primitive in a shader.

This is a bounded GPU reference, not an optimized Faddeeva backend or a completed
GPU material. It changes no compiler, adapter, renderer or application source.

## What is actually validated

The recorded run is `coverage-results-2026-09-05T16-11-56.408Z.json`; its shader and
author-adapter hashes identify the executed sources. It contains 842 requests:

| Requests | Accepted at the shader's target | Refused |
|---|---:|---:|
| Original 38 high-precision fixtures | 23 | 15 outside this shader's range |
| Actual author-adapter calls | 704 | 0 |
| Additional deterministic parameter grid | 96 | 0 |
| Explicit range/work/precision/invalid-mode probes | 0 | 4 |

The maximum discrepancy against original-input CPU/high-precision values was
**3.96e-7** per standardized moment. A second, independent check reconstructs
the **exact packed float32 inputs**, including center/half-width intervals, and
evaluates their complex-erf formula at 80 and 100 decimal digits. All 2,472
computed moments passed; their maximum discrepancy was **3.99e-7**. Seven also
passed independent 60-digit, phase-resolved Gauss-Legendre checks. Results and
the worst case are in `coverage-highprecision-2026-09-05T16-11-56.408Z.json`.

Those 824 computed calls comprise 823 accepted calls and the deliberately
too-strict precision request, which returns a value with failure status. The
other 18 requests return range/work refusal without a usable value. These tests
are evidence for these cases and this implementation, not a uniform certificate.

**The shader target is 1e-4 per standardized moment. Your adapter requested
1e-11 from its CPU primitive; the float32 error estimate does not meet that.**
The replay preserves that distinction: its `failed` counts are 256, 256 and 192
against the original target, even though every call meets the declared shader
target. The very small resulting mean differences do not establish a guaranteed
1e-11 inner error.

Your adapter asks for a modest conditional phase range:

`B=beta*sigma in [-4.247547,1.472943]`,
`Q=q*sigma² in [0.0100161,0.1181984]`.

Its calls use 1–94 panels, averaging 39.72, and 475,422 coefficient steps across
the three example terms. We measured the actual call trace, rather than assuming
the requested Bessel argument range was also the coverage phase range.

## Shader API and refusal behavior

`coverage_moments(input: CoverageInput) -> CoverageResult` returns

`Mj = E[T^j 1{T in interval} exp(i(B*T+Q*T²/2))]`, `j=0,1,2`, `T~N(0,1)`.

The input occupies eight float32 values (two `vec4f`s):

| Field | Meaning |
|---|---|
| `x.x` | Finite interval center, or finite halfline endpoint |
| `x.y` | Finite interval half-width; zero for halflines/full line |
| `x.z`, `x.w` | `B=beta*sigma`, `Q=q*sigma²` |
| `control.x` | 0 finite interval; 1 left halfline; 2 right halfline; 3 full line |
| `control.y` | Absolute target for each standardized moment |
| `control.z` | +1 or -1, for the original interval orientation |
| `control.w` | Reserved, zero |

`packCoverage()` in `coverage-adapter-trace.mjs` constructs this layout from the
CPU API's physical parameters. For finite intervals it forms the original endpoint
gap before standardizing and packing it separately from the center. Thus a narrow
interval is not erased merely because its endpoints would become the same f32.
This cannot recover precision already lost by an upstream f32 root computation.

The result's `m01` contains the two complex moments M0,M1; `m2_bounds.xy` contains
M2. Multiply moment j by `sigma^j` for physical normalized moments, and additionally
by `sqrt(2*pi)*sigma` for unnormalized integrals. Weight and combine these complex
moments with the conditional amplitude and constant phase, as in your adapter.

`diagnostics.x` is the status: 0 means the **estimate** meets the target, 1 invalid
or unsupported range, 2 too many panels, 4 insufficient estimated accuracy.
`diagnostics.yz` report required/used panels and coefficient steps. Status 1/2
has no usable moment value; status 4 exposes the approximation for inspection.
The supported real inputs satisfy `|B|<=64`, `|Q|<=16`, finite interval parameters
of magnitude at most 1e10, a nonnegative half-width, and positive finite tolerance.
The host packer rejects nonfinite/unrepresentable inputs; do not rely on shader
comparisons to give a portable NaN-validation contract.

The included storage bindings and compute entry point are a test wrapper. The
structs/helpers and `coverage_moments` can also be included in a shader library;
no textures or workgroup synchronization are required.

## Numerical method and limits

The outer loop has a hard cap of **128 panels**; the inner polynomial has fixed
degree **16**. For `t=c+h*x`, the same recurrence as the CPU reference integrates
`exp(alpha*x+gamma*x²)` times `(c+h*x)^j` exactly up to the retained degree.
Panel sizes enforce `|alpha|+|gamma|<=0.5` in exact arithmetic. Cauchy's estimate
on radius four bounds the omitted series by

`exp(4|alpha|+16|gamma|) * 4^-16 / 3` on `[-1,1]`.

The Gaussian domain is truncated at six sigma. The reported absolute tail terms
are the same Mills/integration-by-parts bounds as the CPU reference:
`phi(L)/L`, `phi(L)`, `(L+1/L)*phi(L)` per omitted tail. These are inner-integral
bounds; they do not certify the adapter's separate six-sigma outer cutoff.

The full-line branch uses the closed Gaussian transform and its first two
moments. It uses an algebraic complex square root, without `atan`. A bounded
range reduction and degree-11 sine / degree-10 cosine polynomials evaluate its
phase and the panel phases. This avoids depending on loose native trig accuracy:
WGSL only specifies its sin/cos error over a restricted input interval, and
permits reassociation. [WGSL floating-point accuracy](https://www.w3.org/TR/WGSL/#accuracy-of-concrete-and-override-expressions).

`m2_bounds.z` is the maximum analytic truncation bound; `.w` is the maximum
engineering roundoff allowance. `errors.xyz` contains their per-moment sums.
These bounds are evaluated in f32 without outward rounding, and the roundoff
allowance is **not a proved bound for all WGSL compilers/devices**. Input packing,
phase/region jet construction, amplitude weighting, outer quadrature and whole
pixel summation need their own error budgets. Severe cancellation has no relative
accuracy guarantee. Test every intended device family before promoting this to
a production route.

## Measured cost and the next useful reduction

On this Apple M4 / Chrome WebGPU run, GPU timestamp medians for 32,768 calls were:

| Workload | GPU time | Calls/second |
|---|---:|---:|
| Entire line | 0.042 ms | 776 million |
| Small finite interval | 0.338 ms | 97 million |
| Halfline, `Q=2` | 1.20 ms | 27.3 million |
| Repeated actual adapter call mixture | 1.05 ms | 31.1 million |

Each has two warmups and seven recorded dispatches; the JSON retains all samples
and submission-to-completion wall times. Earlier isolated runs of the mixed
workload ranged to 1.53 ms, so these figures should not be treated as stable peak
hardware limits. These are throughput measurements, not latency for an isolated
call, and not measurements of a complete 1080p shader.

At the recorded mixture throughput, naively scheduling 192–256 interval calls for
every 1080p pixel projects to roughly **13–17 seconds per term**, before the rest
of the material. This is a scheduling extrapolation, not a lower bound on a fused,
shared or otherwise optimized implementation. It says the current nested
quadrature schedule does not meet two milliseconds; it does not say correlated
coverage cannot be real time.

The next bounded experiment should remove an integration level. For a quadratic
mask `xi` and complete polynomial-amplitude/quadratic-phase term, define

`F(t)=E[A(Z)*exp(i*(psi(Z)+t*xi(Z)))]`.

Then, using an Abel limit,

`E[A exp(i*psi) 1{xi>0}] = F(0)/2 + lim_(epsilon->0+) (1/(2*pi*i))`

`                         * integral_0^infinity exp(-epsilon*t)*(F(t)-F(-t))/t dt`,

provided the boundary carries no weighted atom. Each F is already a **full
Gaussian quadratic-phase moment**, the compiler's existing closed-form object.
This is one scalar inversion integral instead of the adapter's outer quadrature
times many-panel interval integration. Classical quadratic-form inversion is
related work: [Imhof, 1961](https://academic.oup.com/biomet/article-abstract/48/3-4/419/315926).
The weighted complex formulation above follows directly by applying the damped
sign identity to the complete term; it is proposed here, not benchmarked here.

Do not replace `F(-t)` with `conj(F(t))` when the weight `A*exp(i*psi)` is complex.
Handle the removable limit at t=0, and derive a useful tail/quadrature rule before
calling a finite inversion accurate. Rank-deficient masks can have slower tails.
Symmetric inversion assigns half-weight at `xi=0`: a nonconstant quadratic under
a nondegenerate Gaussian has a zero-mass zero set, but an identically-zero count
must follow the source step convention directly. No finite-t certificate,
convergence speed or real-time result is claimed for this proposed route.

## Reproduce without overwriting anyone's run

From the repository root, with the existing Chrome / `puppeteer-core` setup:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/gpu-followup/coverage-gpu-probe.mjs
```

The default output name is timestamped. `--out /absolute/path/new.json` chooses a
specific fresh file; an existing path is rejected. The harness uses an isolated
headless profile and a minimal local page, not the user's browser or the app.
It reads the author's adapter, extracts its existing definitions in memory and
substitutes the primitive only; it does not edit that source or rerun its costly
midpoint reference. Its baseline and GPU replay share the same outer quadrature,
so their agreement measures the inner replacement only.

For the independent numerical check, use a separate Python environment with
`mpmath==1.3.0` and run `coverage-highprecision.py --input <new-run.json> --out
<new-check.json>`. This validates the exact packed inputs against high precision
and independently split quadrature; Python is not a runtime dependency.
