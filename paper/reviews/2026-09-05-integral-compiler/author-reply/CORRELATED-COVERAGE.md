# A callable correlated-coverage primitive

`gaussian-chirp.mjs` supplies the interval integral and polynomial amplitude
moments requested in RESPONSE §8.2 / THEORY-NOTE §3. It is a **CPU reference
primitive**, implemented with bounded local series. It is **not** the requested
optimized scaled-Faddeeva implementation, a GPU implementation, or an integrated
fix to `coverageExpect`. No compiler or application file is changed.

The useful immediate step is to integrate a complete **region × amplitude ×
phase** term using this primitive, and make that the oracle for a faster backend.
Its mathematical object already has the correlation we need; treating its three
factors as separate means would discard that benefit.

## API

```js
import { gaussianChirpMoments } from './gaussian-chirp.mjs';

const result = gaussianChirpMoments({
  a: 1, b: Infinity, sigma: 1, beta: 0, q: 2,
  normalized: true, absTol: 1e-10, maxPanels: 262144,
});
if (result.status !== 'estimated-tolerance-met') {
  // Explicitly choose higher precision, a different backend, or a looser target.
  throw new Error('Requested numerical accuracy was not established');
}
const [M0, M1, M2] = result.moments; // each is [real, imaginary]
```

For `W ~ N(0,sigma²)`, the returned value is

`Mj = E[W^j 1{a <= W <= b} exp(i (beta W + q W²/2))]`, for `j=0,1,2`.

With `normalized:false`, it instead returns the requested integral with weight
`exp(-W²/(2sigma²))`; all moments are multiplied by `sqrt(2*pi)*sigma`.
Infinite bounds are accepted; reversing bounds negates the result. Equal bounds
return zero. `q=0` and arbitrarily small signed `q` use the same continuous formula.

`absTol` targets each **standardized** moment `(W/sigma)^j` under the normalized
density. Returned `tolerance[j]`, error arrays and moments all use the requested
output units. Thus the target for normalized `M2` is `absTol*sigma²`. To demand a
particular physical error in a weighted sum, allocate tolerances using the
amplitude coefficients; do not interpret the unweighted tolerance as its error.

The result separates:

- `analyticErrorBound`: omitted Gaussian tails plus omitted series terms, using
  valid mathematical bounds **evaluated in binary64**. They are not rounded
  outward and are not machine-certified bounds.
- `roundoffEstimate`: an engineering allowance for arithmetic, phase formation,
  trigonometric evaluation, coefficient recurrence and summation. It is explicitly
  **not a proved floating-point error bound**.
- `estimatedError`: their sum. `status` is `estimated-tolerance-met` only when that
  sum meets every target; otherwise it is `roundoff-limited` and the approximation
  is returned for inspection. Never silently relabel that result as successful.
- `panels`, `coefficients`, `cutoff`, `method`: actual work and algorithm used.

Invalid inputs and exceeded work/range limits throw before returning a purported
answer. The stated parameter scope is `|beta*sigma|, |q*sigma²| <= 1e6`; this is
not a promise that every such interval is affordable. Output scales and `sigma²`
must be finite and positive. A standardized nonempty interval whose width
underflows binary64 is rejected. This is an absolute-error API: a tiny tail may
return zero with its tail bound, and highly cancelled answers carry no relative
accuracy guarantee. Extreme scaling/underflow deserves a higher-precision backend.

## How the reference works

Set `t=W/sigma`, `B=beta*sigma`, `Q=q*sigma²`. On a panel `t=c+h*x`, `x in [-1,1]`,
factor the integrand into its center value and

`exp(alpha*x + gamma*x²)`, where
`alpha=h*(-c+i*(B+Q*c))`, `gamma=h²*(-1+i*Q)/2`.

For its Taylor coefficients, `d0=1` and

`d_n = (alpha*d_(n-1) + 2*gamma*d_(n-2))/n`, with `d_-1=0`.

Integrate the resulting polynomial, multiplied by `(c+h*x)^j`, exactly term by
term. On the complex circle `|x|=2`, Cauchy's coefficient estimate gives

`sum_(n>N) |d_n| <= exp(2|alpha|+4|gamma|)*2^-N` on `[-1,1]`.

Multiplying this by `2*h*phi(c)*(|c|+h)^j` bounds the omitted contribution of that
panel in exact arithmetic. The code chooses a degree from this estimate and the
allocated tolerance. Panel widths bound `|alpha|+|gamma| <= 0.75`, resolving phase
variation before testing accuracy. It cannot accidentally accept an oscillatory
interval because two undersampled quadratures both returned zero. This assurance
costs work proportional to a bound on local phase variation.

For each omitted tail beyond `L>0`, absolute moment bounds are

`T0 <= phi(L)/L`, `T1 = phi(L)`, `T2 <= (L+1/L)*phi(L)`.

The first follows directly from `t/L >= 1` on the tail; the others follow by
integration by parts. The oscillatory factor has modulus one, so these bounds
remain valid for every real `beta,q`. The cutoff starts at eight sigma and grows
with the requested tolerance; it is not silently fixed to the compiler's six
sigma reach. These are bounds for this one-dimensional integral only.

Full-line integrals use `D=1-iQ`, with the square-root branch of positive real part:

`M0 = exp(-B²/(2D))/sqrt(D)`

`M1 = (iB/D)*M0`, `M2 = (1/D-B²/D²)*M0`.

Physical moment scales are applied afterward. Logarithmic magnitudes avoid
premature underflow of `M0` before forming a larger polynomial moment.
`method:'series'` bypasses this shortcut for a useful independent check. Finite
intervals are integrated directly instead of subtracting almost equal erf values.
Their original endpoint gap is preserved before dividing by sigma, including
one-ulp intervals with nonunit sigma.

The complex-erf identity in our earlier answer remains correct; the numerical
replacement here avoids needing a new, unvalidated implementation of that special
function. Definitions: [NIST DLMF §7.2](https://dlmf.nist.gov/7.2). Our series and
tail derivation above are the actual algorithm; no third-party implementation was
copied.

## Connecting it to `coverageExpect`

The present compiler already conditions its quadratic boundary in an eigenframe.
At a fixed first coordinate `u`, retain the **complete term's** conditional phase

`theta(u) + beta(u)*w + q*w²/2`.

For a general quadratic phase, `theta(u)=phi0+b1*u+Q11*u²/2`,
`beta(u)=b2+Q12*u`, and `q=Q22`, in that same boundary eigenframe. Transform the
phase Hessian and gradient as well as the amplitude; diagonality of the boundary
does not imply diagonality of another factor's phase.

Find the intervals satisfying the boundary at `u`. For multiple masks, intersect
their interval sets first. On each surviving interval call this primitive, then
replace the current real-valued `weigh` with complex arithmetic:

`exp(i*theta(u)) * (A(u)*M0 + B(u)*M1 + C*M2/2)`.

Here `A=c0+c1*u+c11*u²/2`, `B=c2+c12*u`, `C=c22`, matching the current quadratic
amplitude convention. These coefficients may themselves be complex. Add the
interval contributions, then integrate the remaining Gaussian coordinate. For a
small complement, evaluate the two outside intervals directly; subtracting a
large inside integral from the full integral can destroy relative accuracy.

This requires a joint-term lowering/API; merely replacing the CDF helper inside
the existing scalar `Fof` cannot recover phase factors that were already averaged
independently. Keep the compiler's discriminant splits for the outer integral,
and separately bound its tail/quadrature error and any coefficient/profile
truncation. Multiple phase factors combine their phase jets **before** integration.

The fixture `1{Z²>1}*(1+cos(Z²))/2` demonstrates the specified correlation:

- joint mean: **0.1286152683516455**;
- product of separate means: **0.2489085926180152**;
- bias from that factorization: **0.1202933242663697**.

This proves that the supplied primitive can retain correlation for that complete
model term. It does not prove that the current compiler now lowers all mixed terms
jointly, or that a quadratic count model equals the original perspective shader.

## Reproduce the checks and cost

From the repository root:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/test-coverage.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/bench-coverage.mjs
```

There are **38 high-precision fixtures and 233 assertions**. The fixtures use
complex erf plus endpoint moment identities at 80 and 100 decimal digits. Seven
also use independent 60-digit, phase-resolved Gauss-Legendre quadrature. The
generator preserves the exact binary64 input values, including narrow endpoints.
It checks agreement across precisions and against quadrature before writing data.
The largest observed absolute moment discrepancy was **2.45e-14**; every fixture
was below its reported estimate. That is evidence on these cases, not a uniform
accuracy theorem. The suite also checks partitioning, conjugation, reversal,
correlated coverage, overflowed standardized tails, and explicit failure paths.

Rebuild the fixtures with Python and `mpmath==1.3.0` installed in a separate
environment, then run `generate-coverage-reference.py`. Python is needed only to
regenerate fixtures, not to use the module or run its tests. See the
[mpmath quadrature documentation](https://mpmath.org/doc/current/calculus/integration.html)
for its methods and the danger of unresolved oscillations; the generator splits
the reference panels using a phase-slope bound. Data are in
`coverage-reference.json`, `coverage-test-results.json`, and `coverage-benchmark.json`.

On this Apple M4 / Node 24 run, 11-repeat warm medians were approximately:

| Integral | Panels | Median CPU time |
|---|---:|---:|
| Quadratic masked halfline, `q=2` | 84 | 0.032 ms |
| Finite oscillatory interval, `beta=512,q=128` | 1,537 | 0.75 ms |
| Finite interval, `beta=q=1000` | 13,334 | 3.5 ms |
| Halfline, `beta=q=1000` | 54,001 | 12.2 ms |
| Same phase, entire line | 0 | 0.0026 ms |

The `beta=q=100000`, `[-3,3]` request needs 1,600,001 panels and is rejected by the
default 262,144-panel budget. This is useful as an oracle and integration scaffold,
not remotely a demonstrated two-millisecond-per-material GPU path. An optimized
scaled-Faddeeva backend, stable narrow-interval/tail handling, region reuse and an
outer-integration budget remain the production work. The reference and error
contract give that work a concrete target.
