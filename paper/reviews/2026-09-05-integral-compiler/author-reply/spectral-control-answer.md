# Answer to §3: the pilot can vanish, with an explicit source and sampler contract

The useful unification is **closure under products**. A primitive that evaluates the mean of a phase expression can also evaluate its covariance with another expression, provided their product remains in the same tractable family. Optimal finite-dimensional controls then require a small Gram solve, not a new theory of sampling.

There are three distinct claims to keep separate:

1. **Exact source, tractable product moments:** the best control and its residual variance can be computed without a pilot.
2. **Tractable centre model, original source evaluated at samples:** a model-chosen Stein control can be pilot-free and unbiased, but its predicted variance is a model prediction. It need not improve the source's variance.
3. **The original normalized-gradient/cutoff Stein fields:** their products are not generally in the finite polynomial–phase family. The unweighted multipliers alone do not close this calculation; additional moments, quadrature, tables, or a pilot are needed.

Two demo-contract corrections follow immediately. A four- or eight-point displacement probe can expose omitted geometry; it cannot certify mean accuracy for an arbitrary source. Your own §7 example is evidence against treating pointwise agreement as the acceptance criterion for an integral. Also, a three-dimensional Gaussian window provides a space–time integral; it does not itself establish continuity of a changing retained recipe set or the absence of shimmer in motion.

## 1. The exact projection formula

Let the actual filtered quantity be \(\mu=\mathbb E S(Z)\), with \(S\in L^2\). Use real controls \(h=(h_1,\ldots,h_K)^T\), each with exactly zero mean, and define

\[
G=\mathbb E[hh^T],\qquad b=\mathbb E[hS],\qquad V=\operatorname{Var}S.
\]

For \(r_\beta=S-\beta^Th\), direct expansion gives

\[
V_\beta=V-2\beta^Tb+\beta^TG\beta,
\qquad
\boxed{\beta_*=G^+b,\quad V_*=V-b^TG^+b.}
\]

Here \(G^+\) is the Moore–Penrose inverse. For a true covariance matrix, \(b\) is in the range of \(G\): a null direction is a control that is zero almost surely, so its covariance with \(S\) is zero. Redundant controls therefore do not invalidate the formula. The residual is the part of \(S-\mu\) orthogonal to the chosen control span.

For complex controls, use \(r=S-\beta^Hh\), \(G=\mathbb E[hh^H]\), and \(b=\mathbb E[h\overline S]\). Replace transposes by conjugate transposes and the cross term by \(-2\operatorname{Re}(\beta^Hb)\). In implementation, splitting phases into real and imaginary parts avoids ambiguous complex coefficient conventions.

For characters \(\chi_k=e^{ik\cdot\theta(Z)}\), let \(m_k=\mathbb E\chi_k\). Then

\[
\mathbb E[(\chi_k-m_k)\overline{(\chi_\ell-m_\ell)}]
=m_{k-\ell}-m_k\overline{m_\ell}.
\]

Thus the kernel already written in §3 supplies \(V,G,b\) for any source and controls represented in that character span. This needs the relevant **difference moments**, not merely the moments used in the retained mean. For infinite expansions, justify these manipulations by the appropriate \(L^2\) convergence or stronger summability; for finite expansions there is no exchange-of-limits issue.

One limit on the sales pitch: if every exact moment of a finite exact source expansion has already been evaluated, its mean is already known and Monte Carlo is unnecessary. Controls become useful when only a cheap subset is integrated, moments are amortized in a table, or a tractable model supplies controls for a more expensive source. Access to all source–control cross moments must not be silently assumed in that last case.

## 2. A Stein family that closes under the same Gaussian primitive

Let \(Z\sim\mathcal N(0,\Sigma)\), with \(\Sigma\) positive definite. The Gaussian Stein operator is

\[
\mathcal T_\Sigma F=\nabla\cdot F-z^T\Sigma^{-1}F.
\]

Its mean is zero when the required derivatives are integrable and the Gaussian-weighted boundary flux vanishes. This follows by integrating \(\nabla\cdot(Fp)\). Polynomial amplitudes times unit-modulus quadratic phases satisfy these conditions. More general gradient-based control functionals built from Stein identities are established prior work; the project opportunity is the particular phase algebra and its rendering implementation. [Oates, Girolami and Chopin, *Control functionals for Monte Carlo integration*](https://arxiv.org/abs/1410.2392).

Choose a polynomial vector amplitude \(P\) and a quadratic phase, all in radians:

\[
F(z)=P(z)e^{i\theta(z)},\qquad
\theta(z)=a+b^Tz+\tfrac12z^TQz,\qquad Q=Q^T.
\]

Then

\[
\boxed{\mathcal T_\Sigma F=
\left[\nabla\cdot P+iP\cdot(b+Qz)-z^T\Sigma^{-1}P\right]e^{i\theta}.}
\]

This is again polynomial times quadratic phase. If \(P\) has degree \(p\), the control has degree at most \(p+1\); products for its Gram matrix have degree at most \(2p+2\). With source amplitude degree \(q\), source–control products have degree at most \(q+p+1\). Conjugated products subtract the phases, including their quadratic parts.

All these moments follow from one kernel and its derivatives:

\[
\mathcal K(a,b,Q)=
e^{ia}\det(I-i\Sigma Q)^{-1/2}
\exp\!\left[-\tfrac12b^T(\Sigma^{-1}-iQ)^{-1}b\right],
\]

\[
\mathbb E[Z^\alpha e^{i\theta(Z)}]
=i^{-|\alpha|}\partial_b^\alpha\mathcal K(a,b,Q).
\]

Use the determinant branch continued from \(Q=0\); a whitened symmetric representation makes this choice straightforward. The attached one-dimensional test evaluates these polynomial moments through a recurrence, not numerical differentiation.

That is the affirmative answer for Stein controls: **the same Gaussian phase primitive, extended to polynomial moments, closes the whole projection problem.** A list of unweighted integer-indexed \(m_k\) is not by itself sufficient for arbitrary derivative controls; their amplitudes and the requisite polynomial moments must also be represented.

The earlier probe used a field proportional to

\[
\chi(z)\,a(z)\,\frac{\nabla\theta(z)}{|\nabla\theta(z)|^2+\lambda}\sin\theta(z).
\]

Its rational denominator and compact cutoff are outside this finite polynomial family. Do not claim its exact Gram follows from the current multiplier table. Constant or low-degree polynomial vector fields are an implementable alternative worth measuring; they may trade some cancellation strength for much cheaper evaluation and a closed oracle.

The source itself may be discontinuous: the zero-mean identity requires regularity of the control field, not differentiability of every source being integrated. Conversely, differentiating a discontinuous control while ignoring its boundary contribution breaks that identity.

## 3. One analytic example gives a useful scale law

Take \(Z\sim\mathcal N(0,\sigma^2)\), \(S=\cos(\omega Z)\), and \(q=\sigma^2\omega^2>0\). With \(F=\sin(\omega z)/\omega\),

\[
h=\mathcal T_{\sigma^2}F
=\cos(\omega Z)-\frac{\omega Z}{q}\sin(\omega Z).
\]

Gaussian characteristic-function differentiation yields

\[
V=\tfrac12(1+e^{-2q})-e^{-q},\qquad
b=\tfrac12(1-e^{-2q}),
\]

\[
G=\tfrac12\left[(1+q^{-1})+(1-q^{-1})e^{-2q}\right].
\]

Therefore \(\beta_*=b/G\) and \(V_*=V-b^2/G\). At high frequency,

\[
\beta_*\sim\frac q{q+1},\qquad V_*\sim\frac1{2(q+1)},
\]

so the variance reduction approaches \(q+1\). This is a concrete control worth testing, not a claim about all warped phases. Treat \(q\approx0\) with stable limits or a rescaled basis; do not implement the displayed cancellation-prone formulas literally near zero.

It also exposes an oracle trap: \(\mathbb E\cos(\omega Z)\to0\), but its raw variance tends to \(1/2\). **Recipes negligible for the mean are not necessarily negligible for the variance.** In the covariance expansion, a high-frequency mode still has its diagonal \(m_0=1\). A mean-based cutoff cannot automatically certify an omitted variance tail; use an \(L^2\) tail argument or measure the residual.

## 4. Source truth versus the centre model

Write \(S=f+e\), where \(f\) is the compiler's centre model. For fixed zero-mean controls,

\[
b_S=b_f+\operatorname{Cov}(h,e),\qquad
V_S=V_f+2\operatorname{Cov}(f,e)+\operatorname{Var}e.
\]

The model oracle does not know the added quantities. Small \(|\mathbb Ee|\) bounds none of them. A coefficient selected from the model still yields \(\mathbb E[S-\beta^Th]=\mathbb ES\) when the actual source and an actual zero-mean Stein control are evaluated at the samples. It can nevertheless increase variance.

The attached counterexample uses \(f(z)=\cos(5z)\) and \(S(z)=\cos(5z+4z^3)\) under a standard Gaussian. Both phase and source agree through the centre's second derivatives. The model selects \(\beta=25/26\) for the affine Stein control above. It predicts residual variance **0.0192308**. Direct source quadrature instead gives **0.588234**, worse than the raw source's **0.500244**. Monte Carlo verifies this discrepancy while remaining consistent with the true source mean. This is a failure of the model's efficiency prediction, not a bias in the Stein correction.

The proposed displacement selector should therefore be described as a **rejection heuristic / witness of omitted geometry**, not a mean-validity certificate. Large pointwise errors can cancel in the integral, as your §7 example already shows. Conversely, a smooth perturbation can vanish at any finite set of probe locations and still change the integral elsewhere. Four or eight probes cannot overcome that information limit for an unrestricted source class.

A sampled mean residual targets the relevant quantity, but its uncertainty depends on residual variance and sampling design; there is no universal four- or eight-sample threshold. If the demo promises source accuracy without a model remainder bound, retain a source-evaluated unbiased correction or clearly label the empirically validated approximation. Discrete route selection based on a few probes is also a possible temporal discontinuity.

## 5. Fitting, singularity, and the actual sampler

For an independent pilot, conditioning on the fitted coefficients leaves the final estimate unbiased. Regressing and estimating the mean on the same samples is generally biased at finite sample count. Honest cross-fitting can recover unbiasedness when each evaluation sample is independent of the data used to fit its coefficient; dependencies between folds need care when reporting uncertainty. These distinctions are standard control-variate practice. [Owen, *Monte Carlo theory, methods and examples*, §8.9](https://artowen.su.domains/mc/Ch-var-basic.pdf).

For the closed oracle, use this bounded numerical procedure:

1. Standardize controls by their computed standard deviations; remove zero directions.
2. Symmetrize the Gram matrix. Treat materially negative eigenvalues as a moment-evaluation failure, not useful negative variance.
3. Drop unresolved eigenvalues or apply ridge regularization in the standardized basis. Avoid an unguarded inverse near coincident phase directions.
4. Evaluate the full quadratic \(V-2\beta^Tb+\beta^TG\beta\) for the chosen coefficient. The shortcut \(V-b^T\beta\) is generally wrong for a ridge solution.

For exact moments, the excess variance from an imperfect coefficient is exactly

\[
V_\beta-V_*=(\beta-\beta_*)^TG(\beta-\beta_*).
\]

Regularization changes efficiency, not unbiasedness, for fixed truly zero-mean controls. Approximate phase centering is different: if a control is formed as \(\chi-\widetilde m\), its residual estimator has bias \(\beta^T(\widetilde m-m)\) in real notation. An exactly differentiated Stein field avoids this centering error, but omitted derivative terms and numerical arithmetic still require validation.

Finally, \(V_\beta/N\) is the variance of an **iid** sample average. The existing stratified Gaussian probe must not inherit that formula as an exact shader-cost oracle. Under stratification or randomized QMC, optimize covariance of the complete randomized estimates, not merely pointwise function covariance. The best coefficient can differ from the iid optimum. [Hickernell, Lemieux and Owen, *Control variates for quasi-Monte Carlo*](https://artowen.su.domains/reports/qmccv.pdf).

If several terms share samples, their residual cross-covariances also enter the final pixel variance. Independent streams make the variances additive; shared streams require the combined covariance problem. A per-term target budget is not automatically a pixel target budget.

## 6. What to build next

Compile a small list of polynomial–phase expressions for \(S\), \(h_i\), \(S h_i\), and \(h_i h_j\). Canonicalize equal phases, reuse their Gaussian moments, and return \(V,G,b\), a rank/conditioning diagnostic, the chosen coefficient, and its predicted residual variance. Tag this explicitly as either **source-exact** or **centre-model**. Benchmark the oracle's own cost: coefficient construction, pair differences, moment evaluation, and the small solve are work too. General dense assembly is quadratic in the expression count; a \(K\)-control solve is cubic unless structure is used.

Do not broaden the claim to all controls immediately. Start with the polynomial family and the actual sampler, compare equal GPU time, and expose whether the variance prediction concerns the source or its model. That makes the attractive idea testable without hiding its hardest assumption.

For time, keep the extension but narrow the claim: a chosen Gaussian space–time window is handled by the same integral machinery when its source representation is valid. It represents that exposure filter, not every physical shutter model. No history is required for the analytic result. Static determinism can prevent frame-to-frame randomness at rest. Moving stability additionally requires controlled recipe truncation, table interpolation, route changes, and model error. A frame-varying random residual can shimmer even if its expectation is exact.

## 7. Reproducible result

Run from this directory:

```sh
node spectral-control-probe.mjs
```

The script has no dependencies and imports no compiler or app code. It computes Gaussian moments algebraically, forms six polynomial–phase Stein controls plus a deliberately redundant seventh, solves the rank-six projection, and compares with independent direct-function quadrature and seeded Monte Carlo. It also checks a regularized solve and the centre-model counterexample above. Stored output is `spectral-control-results.json`.

| Quantity | Closed calculation | Direct quadrature |
|---|---:|---:|
| Polynomial–phase source variance | 0.252018580433289 | 0.252018580433289 within tolerance |
| Optimal residual variance | 0.011562996376972 | 0.011562996376933 |
| Ridge residual variance | 0.011772922146284 | 0.011772922146246 |

The exact-family variance reduction is **21.795×**. Two independent seeded runs of 300,000 samples produce residual variances 0.0116076 and 0.0115871, consistent with the prediction. These are CPU mathematical validation results, not a GPU speedup or a demonstration of general source validity. Quadrature uses 80,000 and 160,000 Simpson panels on \([-10,10]\); convergence is checked, but the omitted Gaussian tail and discretization are not certified by a formal bound. All scripted gates pass.
