# A float32 Bessel provider for the bounded GPU problem

This answers `REPLY-2.md` §5 with runnable WGSL, a float32 JavaScript mirror, independent high-precision references, an exact coefficient generator, and actual WebGPU measurements. Compiler and app files are untouched.

There are two providers. **The 46,956-byte Taylor table is the choice when a stated absolute-error bound matters.** The table-free Miller row is a useful measured alternative when many adjacent orders are needed. Its observed accuracy is good, but this delivery does not prove a uniform termination-and-roundoff bound for Miller. Neither provider establishes a complete shader's error or speed.

## Contract and integration

`bessel.wgsl` accepts the already-formed Bessel argument `x`, finite and in `[-40,40]`. Values support integer orders `[-42,42]`; jets support `[-40,40]`, because two additional adjacent orders are needed. The host must reject nonfinite arguments. Finite out-of-range arguments/orders return `valid=0`; do not treat the accompanying zero as a valid coefficient.

- `bessel_table(n,x)` returns `J_n(x)` and validity.
- `bessel_table_jet(n,x)` returns `J_n(x), J′_n(x), J″_n(x)`.
- `bessel_table_row(x)` or `bessel_miller_row(x)` computes all 43 nonnegative orders once. Use `bessel_row_jet(row,n)` for each requested jet; negative orders follow parity.

For the table provider, upload `bessel-table-v1/bessel-table.f32` to a read-only storage buffer at the declared binding. Its ordering is `[evenCenterIndex][nonnegativeOrder][TaylorPower]`; the exact layout and SHA-256 are in the certificate. Adapt the group/binding names to the shader. No filtering, transcendental functions, or runtime table construction is involved. The Miller functions can be compiled without a table binding when the table functions/declaration are omitted.

These derivatives are with respect to **x**. For the compiler's `H=a₀ sin(2πs)`, form `x=theta*a₀` once and use `Q=J_n(x)`, `Q′=a₀ J′_n(x)`, `Q″=a₀² J″_n(x)`. The numerical bounds below apply to `a₀=1` and the actual float32 argument. Other amplitudes require scaling the derivative bounds and including the arithmetic/argument-construction error. They do not authorize dropping multiplicative closures, the additional ripple harmonic, or the existing mixed-frequency enumeration.

## The bounded table

Expand `J_n(x)` to degree 12 around the nearest even integer from 0 through 40, using parity for negative arguments. The offset satisfies `|h|≤1`. The integral representation of integer-order Bessel functions implies

\[
|J_n^{(r)}(x)|\le1\quad(x\in\mathbb R),
\qquad
|R_{12}|\le\frac{|h|^{13}}{13!}\le1.605905\times10^{-10}.
\]

This is a uniform analytic truncation bound for every requested order and argument, including zeros. It does not come from a sampled grid. [NIST integral representation](https://dlmf.nist.gov/10.9.E2).

The coefficient construction is also enclosed, not merely checked at two mpmath precisions. `bessel-generate.py` uses the defining power series at each even integer centre with **exact rational arithmetic**. After the terms decrease, the first omitted alternating term encloses the remaining tail; its width is below `2^-200`. Exact signed adjacent-order combinations give each derivative coefficient. Comparing its rational interval to the actual stored float32 gives a coefficient-error interval. The largest coefficient error is `1.954e-8`; the largest sum of coefficient errors in one polynomial is `2.564e-8`. Heavy cancellation in that power series is harmless offline because the arithmetic is rational. [NIST Bessel power series](https://dlmf.nist.gov/10.2.E2), [derivative identities](https://dlmf.nist.gov/10.6.E7).

The generator then propagates absolute errors through the displayed Horner graph using `epsilon=2^-23`, which covers rounding toward either neighboring float32 value. It adds a conservative allowance for flushed subnormals. Exact rational bound arithmetic is rounded outward when written to JSON. It uses the actual stored coefficient magnitudes rather than a loose generic exponential bound.

| Quantity | Uniform absolute bound under the arithmetic contract |
| --- | ---: |
| `J_n`, orders through 42 | 3.395×10⁻⁷ |
| `J′_n`, orders through 40 | 4.587×10⁻⁷ |
| `J″_n`, orders through 40 | 5.481×10⁻⁷ |

The derivative formulas are `(J[n−1]−J[n+1])/2` and `(J[n−2]−2J[n]+J[n+2])/4`. Their neighboring-value errors and final arithmetic are included in the last two bounds. An independent collaborator reviewed the enclosure, Horner propagation, and derivative propagation and found no arithmetic issue.

**What is and is not certified:** the analytic remainder and stored-coefficient enclosures are rigorous over the stated domain. The combined arithmetic bound is conditional on the specified Horner operation graph, or a contraction at least as accurate, with the stated rounding/flush model. WGSL permits reassociation, does not specify round-to-nearest, and does not guarantee that `fma` is fused. Therefore this is **not a universal proof for every WGSL compiler's transformed executable**. The shader's actual Apple/Metal output was separately tested below. Audit the lowered operation graph or revalidate a new backend before claiming that executable satisfies the conditional bound. No finite grid certifies all float32 inputs. [WGSL floating-point rules](https://www.w3.org/TR/WGSL/#floating-point-evaluation).

The bound concerns the exact numerical argument delivered to the function. If a real argument was rounded to float32, `|J_n(x_real)−J_n(x_f32)|≤|x_real−x_f32|`; the same Lipschitz statement holds for the first two derivatives. Include that error when pricing the full expression. Likewise, coefficient errors accumulate with recipe weights: a bound on one coefficient is not a bound on a rendered pixel.

## The recurrence alternative

`bessel_miller_row` uses downward recurrence from order 80, preserving values through order 42. For orders above the argument, forward recurrence would amplify the unwanted solution; the backward direction is the appropriate one for `J`. It rescales the recurrence, accumulated normalizer, and saved values together by exact powers of two, then normalizes with `J₀+2J₂+2J₄+…=1`. [NIST recurrence computation](https://dlmf.nist.gov/10.74.iv), [normalizing identity](https://dlmf.nist.gov/10.12.E4).

For `|x|<0.25`, it uses the small-argument series with four correction terms, avoiding division by tiny x and excessive rescaling. The first omitted correction is at most `(1/64)^5/(5!)² < 6.5e-14`; this only bounds that branch's analytic series remainder, not its floating-point error. At zero it returns `J₀=1`, all other orders zero, with the correct derivative jets obtained from neighboring values. Negative argument/order parity is explicit.

The fixed start at 80, normalization error, GPU division accuracy, and finite-precision recurrence have been measured here, **not uniformly certified**. Do not infer a relative-error promise near Bessel zeros. Increasing the start order alone is not a roundoff proof and can increase work and accumulated roundoff.

## Actual float32 and GPU checks

`bessel-reference.py` generates direct mpmath `besselj` values at 70 decimal digits for **4,370 exact float32 inputs**; sampled 100-digit checks agree below `2.2e-72`. The grid includes spacing 0.02, both signs, turning/segment boundaries with neighboring floats, tiny powers of two down to the smallest subnormal, the small-series branch boundary, and neighboring floats around 54 zeros of selected orders. Every signed order from −42 through 42 is checked, plus both derivatives through order 40. References are stored as binary64; their final conversion error is negligible relative to float32 errors, not a claimed exact oracle.

Latest accuracy record: `bessel-results-2026-09-05T16-09-17-482Z.json`. The actual adapter reported Apple, Metal 3, hardware rather than fallback. Both providers compiled without messages and produced no nonfinite values.

| Provider | CPU mirror max `J` / `J′` / `J″` error | WebGPU max `J` / `J′` / `J″` error |
| --- | --- | --- |
| Taylor table | 7.60e-8 / 4.83e-8 / 5.65e-8 | 5.43e-8 / 4.94e-8 / 6.52e-8 |
| Miller row | 3.24e-7 / 3.13e-7 / 3.10e-7 | 3.57e-7 / 3.56e-7 / 3.55e-7 |

Near zeros (`|J|<1e-5`), GPU absolute errors reached `1.72e-8` for the table and `3.02e-7` for Miller. These are **measured maxima**, not uniform error bounds or correctly-rounded claims. CPU/GPU differences are expected because arithmetic fusion and division can differ.

## Isolated cost, with a useful choice

Latest timing record: `bessel-benchmark-2026-09-05T16-09-19-949Z.json`. Hardware timestamp queries measured 8,192 independent random arguments in `[0,40]`, one warmup and five trials. These times include output writes but exclude compilation, upload, and readback.

| Work per argument | Miller median | Taylor table median |
| --- | ---: | ---: |
| One requested jet | 0.192 ms | 0.065 ms |
| All jets of orders 0…40, cached row | 0.942 ms | 1.109 ms |

Those are times for the **whole 8,192-argument batch**. The table was faster for sparse requests; Miller was slightly faster for the full row on this device. Some trial times varied substantially, so this is a small kernel benchmark, not an integrated renderer performance prediction. Storage traffic, register pressure, recipe count, and surrounding shader arithmetic still matter. No 1080p or two-millisecond material-pass claim follows from these results.

The provider computes the requested orders; it does not certify that truncating the sideband sum at 40 is sufficient. Near argument 40, orders near 40 can still be substantial. Keep a coefficient-tail budget and the final mixed-frequency multiplier. Extend the table domain/order with the generator when the compiler's retained recipes require it; do not clamp a requested order silently.

## Reproduce without overwriting another run

From this directory:

```sh
python3 bessel-generate.py --out /tmp/my-bessel-table
python3 bessel-reference.py --out /tmp/my-bessel-reference
node bessel-test.mjs --table /tmp/my-bessel-table --reference /tmp/my-bessel-reference --out /tmp/my-bessel-result.json
node bessel-bench.mjs --table /tmp/my-bessel-table --out /tmp/my-bessel-benchmark.json
```

Reference generation requires mpmath 1.3.0. Tests use the repo's `puppeteer-core` and an installed Chrome; `CHROME_PATH` can select it. `--cpu-only` skips WebGPU accuracy. All default result names are timestamped; explicit existing result files are refused. Generation refuses directories that already contain Bessel artifacts. The checked-in table/certificate and reference set can be used directly without Python regeneration. The earlier double-precision shift-table probe remains a separate coefficient comparison; its output naming now also prevents overwrites.
