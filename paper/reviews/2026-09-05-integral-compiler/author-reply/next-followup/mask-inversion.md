# One-dimensional inversion of the correlated quadratic mask

2026-09-05. Bounded CPU experiment answering REPLY-4. No compiler changes.

**The reduction works on all three adapter terms, including their complex weights. This implementation does not win on speed.** It removes nested interval integration, but replaces it with a slowly converging Fourier tail in the two saddle cases. A second useful result is that the adapter's fixed outer quadrature has an error floor of about 2.5e-6 in those cases; its accurate inner interval primitive does not certify the entire nested integral.

## Results

Errors below are complex absolute errors against a separate original-coordinate, high-precision conditional integral. `F calls` counts full two-dimensional Gaussian transforms, evaluating both signs; it is not an interval-primitive count.

| Adapter term | Endpoint T | F calls | Actual error | Mathematical tail bound | CPU time |
|---|---:|---:|---:|---:|---:|
| Saddle, aligned slow phase | 4096 | 101,184 | 4.586e-8 | 4.747e-7 | 41.32 ms warm median |
| Saddle, quadratic amplitude and fast phase | 4096 | 101,184 | 3.710e-8 | 3.820e-7 | 42.40 ms warm median |
| Ridge, phase along ridge | 64 | 8,640 | 4.261e-14 | 8.854e-8 | 3.82 ms single run |

Apple M4, Node v24.20.0. Warm timings use two warmups and five repetitions; the ridge's separately warmed T=128 run takes 5.94 ms. The original nested adapter took 9.59 / 6.96 / 1.68 ms and 256 / 256 / 192 interval calls in the report's initial, un-warmed run. These timings do not establish a fair optimized speed ratio; they do establish that this inversion implementation offers no demonstrated speed advantage.

The original nested answers differ from the independent reference by **2.456e-6 / 2.618e-6 / 3.505e-8**. Refining the inversion's finite panels at fixed T changes the result by less than 1e-12; enlarging T systematically removes the larger saddle error:

| T | Slow saddle error | Fast saddle error |
|---:|---:|---:|
| 64 | 4.995e-4 | 3.752e-4 |
| 256 | 2.557e-5 | 2.149e-5 |
| 1024 | 1.745e-6 | 1.380e-6 |
| 4096 | 4.586e-8 | 3.710e-8 |

The reference uses mpmath 1.3.0 at 40 and 55 digits, conditions in the original x/y frame, evaluates the y intervals through complex erf and moment recurrences, and splits the x integral at mask-discriminant zeros. The two precisions agree within 1.5e-42. The x cutoff is 12 standard deviations, with a polynomial-amplitude Gaussian tail bound below 3.72e-32. This is strong independent numerical evidence, not a machine-certified quadrature enclosure. Full-line F values and the removable limit are checked separately at 75 digits; maximum discrepancies are 8.87e-17 and 1.11e-17.

## Callable interface and exact reduction

`mask-inversion.mjs` exports `quadratic`, `compileMaskTerm`, `invertMask`, `gaussianPolynomialPhase`, and `gaussianQuadraticState`. Complex numbers are `[real, imaginary]`. A quadratic is

\[
q(x,y)=v+g_xx+g_yy+\tfrac12(h_{xx}x^2+2h_{xy}xy+h_{yy}y^2).
\]

Input phase is in **radians**. `sigma` is the original isotropic Gaussian standard deviation; the implementation whitens internally and positively normalizes the mask. Thus multiplying a mask by a positive number preserves both the region and the normalized integrand.

```js
import { quadratic as Q, compileMaskTerm, invertMask } from './mask-inversion.mjs';
const term = compileMaskTerm({
  mask: Q(-1, 0, 0, 2, 0, 2), // x²+y² > 1
  amplitude: Q(1),
  phase: Q(0.2, 1.3, -0.7, 0.4, 0.1, 0.8),
  sigma: 1,
  zeroWeight: 0, // source convention: strict > 0
});
const result = invertMask(term, { T: 4096, absTol: 1e-6, maxEvaluations: 500000 });
// Inspect status and toleranceMetByEstimate before using result.value.
// This acceptance flag includes an estimated finite quadrature error.
```

For standard Gaussian Z, a quadratic mask ξ, quadratic phase ψ, and polynomial amplitude A of degree at most two, define

\[
F(t)=E[A(Z)e^{i(\psi(Z)+t\xi(Z))}].
\]

Then, with symmetric boundary convention,

\[
J=\tfrac12F(0)+\lim_{\epsilon\downarrow0}\int_0^\infty
e^{-\epsilon t}\frac{F(t)-F(-t)}{2\pi i t}\,dt.
\]

This follows by inserting the Abel-regularized sign inversion inside the expectation. The implemented tail bounds allow removal of the Abel factor for their supported cases. **Do not replace F(-t) by conjugate(F(t)).** The existing phase and amplitude weight make F complex before the mask transform; the three supplied cases violate that shortcut by 0.5803, 0.002511, and 0.1386 at t=1.

If ψ=φ+bᵀZ+ZᵀRZ/2, put D=I−iR, V=D⁻¹, μ=iVb. The Gaussian transform is

\[
G=e^{i\phi}\det(D)^{-1/2}\exp(-b^TVb/2),\qquad
F=G\{a_0+a^T\mu+\tfrac12\operatorname{tr}(CV)+\tfrac12\mu^TC\mu\}.
\]

The determinant root follows the Gaussian branch; for this real symmetric 2×2 R, the implemented principal root is continuous from R=0. No incomplete complex-erf call appears inside F. At t=0 the removable integrand is E[Aξe^{iψ}]/π, obtained through Gaussian moments up to degree four. For |t|<1e-7 the code uses that limit; the exact-arithmetic pointwise remainder is at most t²E[|A||ξ|³]/(6π), bounded by absolute polynomial coefficients and Gaussian moments through degree eight.

## Tail bounds, acceptance, and refusal

The returned `tailBound` is a mathematical inequality **evaluated in binary64**. `quadratureEstimate` compares GL16 and GL32 with optional panel subdivision; `roundoffEstimate` is an allowance, not a proof of outward rounding. Their sum is `estimatedError`. Consequently `toleranceMetByEstimate` is deliberately not named a certificate. The observed errors obey the reported estimates in the validation set.

- **Full-rank definite or indefinite mask:** a coordinate shift isolates the scalar phase κ=v−gᵀH⁻¹g/2. The absolute tail decays at least as O(T⁻¹); when κ≠0, integration by parts gives an O(T⁻²) option. The implementation takes the smaller bound. Definite masks whose range is wholly positive or negative use the exact full/empty-region shortcut.
- **Rank-one, axis-aligned mask with no null-direction linear term:** a conservative O(T⁻¹ᐟ²) absolute tail is implemented. At T=1024 the plain rank-one test has actual error 1.257e-5 and bound 0.01990. It correctly refuses the 1e-6 target. Symmetry can make an individual case much easier than its uniform bound.
- **Linear mask:** the full transform is a Gaussian in t times a degree-two polynomial; a shifted Gaussian tail bound is used. Constant positive, negative, and zero masks are handled directly.
- **Other singular or numerically ill-conditioned masks:** the finite integral remains inspectable, but the unestablished tail returns Infinity and cannot be accepted. A rank-one mask with null-direction drift is tested explicitly. Whitening/normalization overflow or coefficient underflow is rejected. This prototype is validated on the supplied moderate coefficients and fixtures, not every representable double.
- The evaluation budget is enforced by throwing before further work. Quadrature depth exhaustion is reported. T is an explicit experiment parameter, not a silently guessed infinite endpoint.

For the zero-mask atom, `zeroWeight` is 0, 0.5, or 1. Symmetric inversion gives H(0)=1/2; a source strict comparison needs 0, and an inclusive comparison needs 1. A nonconstant polynomial's zero set has zero mass under a nondegenerate Gaussian, including a definite form that touches zero only at a point. No atom adjustment is needed there.

### Full-rank bound derivation

This records the bound used by the code so its provenance is reviewable. After whitening, write the mask Hessian H, phase Hessian R, amplitude Hessian C, and set h=H⁻¹g, d=h+i(b−Rh), a₀′=A(−h), a′=a−Ch. Let m be the smallest absolute eigenvalue of H, Hₙ=‖H‖, Cₙ=‖C‖, dₙ=‖d‖, and δ=m−‖R‖/T>0. For both signs s and t≥T,

\[
\|(I-i(R+stH))^{-1}\|\le(\delta t)^{-1},\quad
|\det(I-i(R+stH))|^{-1/2}\le(\delta t)^{-1}.
\]

Define K=exp(−‖h‖²/2+dₙ²/(2δT))/δ, p₀=|a₀′|, p₁=(‖a′‖dₙ+Cₙ)/δ, p₂=Cₙdₙ²/(2δ²). After removing e^{isκt}, the magnitude of F(st)/t is at most K(p₀/t²+p₁/t³+p₂/t⁴). Integrating gives

\[
B_{abs}=\frac K\pi\left(\frac{p_0}T+\frac{p_1}{2T^2}+\frac{p_2}{3T^3}\right).
\]

For the oscillatory bound define ℓ₁=Hₙ/δ, ℓ₂=Hₙdₙ²/(2δ²), r₂=Hₙ(‖a′‖dₙ+Cₙ)/δ², r₃=CₙHₙdₙ²/δ³. Differentiating the resolvent and the determinant/exponential factor, then integrating their absolute envelopes, yields

\[
B_{osc}=\frac K{\pi|\kappa|}\left[
\frac{p_0}{T^2}+\frac{p_1}{T^3}+\frac{p_2}{T^4}
+\frac{(\ell_1+1)p_0}{2T^2}
+\frac{(\ell_1+1)p_1+\ell_2p_0+r_2}{3T^3}
+\frac{(\ell_1+1)p_2+\ell_2p_1+r_3}{4T^4}
+\frac{\ell_2p_2}{5T^5}\right].
\]

This bounds the entire omitted complex tail, not only its real part. The implementation uses min(B_abs,B_osc); κ=0 uses B_abs alone.

## What this changes about the next experiment

The algebra is smaller: a quadratic mask now adds one scalar transform variable while keeping all amplitude/phase correlation. The numerical work is not automatically smaller. The two saddle terms still require about 100,000 transforms to reach a conservative 1e-6 estimated target with this simple finite rule. The previous GPU interval throughput cannot be applied to these F evaluations or converted into whole-pixel throughput.

A bounded next experiment would integrate the known e^{±iκt} oscillation with a Filon/Levin rule or subtract an analytic asymptotic tail. Neither is implemented or claimed here. Meanwhile the conditioned-interval path remains a useful fallback, provided its outer endpoint behavior is resolved and its accuracy is measured independently. This delivery establishes the reduction, its tail mechanism, and a reference contract; it does not establish a real-time shader or a complete compiler lowering.

## Reproduction and files

- `mask-inversion.mjs`: callable CPU prototype and explicit tail formulas.
- `mask-adapter.mjs`: reads the three existing author fixtures and runs their unchanged nested term; no author-file edits.
- `mask-probe.mjs`: convergence ladder, halved-panel checks, 16 analytic/separable fixtures, atoms, wrong-conjugation witnesses, positive scaling, and budget/refusal gates.
- `mask-reference.py`: independently conditioned high-precision integral and full-transform/limit checks.
- `mask-results-2026-09-05T16-54-39.569Z.json` and `mask-reference-2026-09-05T16-54-39.569Z.json`: paired outputs. The first records source/module hashes and environment.

From the repository root:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/mask-probe.mjs --out /tmp/mask-new.json
python3 -m pip install --target /tmp/moire-reference-deps mpmath==1.3.0
PYTHONPATH=/tmp/moire-reference-deps python3 paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/mask-reference.py --input /tmp/mask-new.json --out /tmp/mask-reference-new.json
```

Both writers refuse to overwrite an existing output. The default probe output is timestamped. The Python dependency is isolated and is not a repository runtime dependency.
