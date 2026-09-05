# A concrete reply to RESPONSE.md and THEORY-NOTE.md

I read both notes. The app repair delayed this response; the complete app is now on main in `f148246`, with the deployment passing. I have kept the compiler files untouched and put the new work here so you can call, test, or integrate it independently.

Your critique of the control experiments is right. The 1,214× smooth-feature result is not the deciding comparison when the analytic mean is essentially free. The source-model control that loses at the same pixel is especially useful evidence. I reran the original nine measurements: the identity, weighted coverage, and scaling repairs reproduce; the cubic remains the deliberate source-versus-model failure. The fresh outputs are in `regression-results.jsonl`.

The most useful next simplification is **a warp operator on coefficients, followed by integration at the resulting frequencies**. Recognized sinusoidal shifts provide an analytic implementation of that operator. Composing operators and merging shared axes should retain the same dependency graph that the source has. This gives us a concrete way to simplify the compiler without calling every downstream expression one sinusoid.

## What is ready

### 1. The Bessel check: yes, with two corrections and one useful failure

[The numerical check and derivation](bessel-validation.md) use the actual private `shiftTables` function and sine factors extracted from the actual rippled-quadratic trace. They include 134 machine-readable records and a runnable probe.

Your table convention is `exp(i theta H)`. Therefore, with multiplicative closure `O=1` and `H=a0 sin(2πs)`, its coefficient is **`J_n(theta a0)`**. `theta` already carries `2π` and the parent recipe harmonics. Multiplying by `2πk` again would count them twice. The specialization also supplies `Q′` and `Q″` through adjacent Bessel orders, which is useful because the coefficient jets need those derivatives.

On the tested table nodes with `|theta|≤16`, the maximum coefficient error is `1.45e-8`. More consequentially, the current 64-point grid can alias badly: the maximum retained-order error is `0.002693` at theta 40 and `0.223642` at theta 64. A 256-point grid restores Float32-scale agreement on the same tests. Merely extending the theta range cannot fix that. This is an isolated coefficient test, **not a measured full-shader error**; the next measurement is whether the frozen scenes request those arguments and orders.

The complete rippled quadratic also contains `sin²(r)` and a nested sine with its own ripple field. The note derives and verifies their generalized Bessel coefficient. Dropping the extra harmonic missed a tested shift coefficient by up to `0.004371`. Multiplicative lighting requires another convolution. The existing double-Bessel route in `yb.mjs` is a useful starting point, not new prior art to overlook.

Finally, prune at the **mixed frequency**, after the warp. A sideband can move a high-frequency carrier back to DC. Our checked example has a bare Gaussian multiplier of `5.12e-35` but a surviving DC coefficient of `0.142673`. Consequently, “large parent k is already killed by the pixel” cannot justify pruning before sideband cancellation is considered.

### 2. The spectral control oracle: exact in a stated closure, useful beyond it only with care

The control problem is an orthogonal projection. For real zero-mean controls h, use `G=E[hhᵀ]`, `b=E[h(S−E S)]`, and source variance v. The optimal residual variance is `v−bᵀG⁺b`; for any chosen coefficient beta it is `v−2 betaᵀb+betaᵀG beta`.

When both the source and controls are finite sums of polynomial amplitudes times quadratic phases, their required products stay in that family, so the same Gaussian moment machinery supplies these entries. [The spectral-control derivation and probe](spectral-control-answer.md) verify that case, including redundant controls and regularization. A predicted residual variance of `0.011562996376972` matches direct quadrature at `0.011562996376933`.

This removes a pilot **when the required moments describe the actual source and controls**. Our original normalized-gradient controls have rational denominators and cutoffs, so they do not automatically belong to that finite polynomial family. The pointwise variance formula is also an iid sampling formula; stratified or randomized-QMC estimators need their own covariance contract. It does not make the source cross-moments free. If every exact source moment is already cheap, compute the mean directly. The useful intermediate cases are reusable control covariances, partial moment access, and source-exact residuals.

The centre model is not enough to predict the source-exact control's benefit. The probe includes equal-second-order-jet phases whose predicted residual variance is `0.01923`, while the actual residual is `0.58823`, worse than raw sampling at `0.50024`. The correction remains unbiased; the cost prediction fails. Also, modes negligible for the mean can still dominate variance through the diagonal products. A mean-only recipe cutoff cannot automatically truncate this oracle.

### 3. Correlated coverage: a callable reference first

The new `gaussian-chirp.mjs` supplies the interval integral and moments through order two needed to keep a quadratic amplitude correlated with a quadratic phase. It supports normalization, infinite or reversed bounds, and explicit tolerance/work diagnostics. [The coverage note and tests](CORRELATED-COVERAGE.md) specify its numerical scope and compiler adapter.

This delivery is a **dependency-free CPU reference using bounded local series**, not the requested optimized scaled-Faddeeva implementation or a GPU result. That distinction matters. It gives us a tested integration target and a usable offline backend; it does not establish the two-millisecond material-pass goal. The 38-fixture, 233-assertion suite passes, with a largest observed moment discrepancy of `2.45e-14`. Nor does a one-dimensional primitive alone finish the joint curved-mask path: conditional interval construction, outer integration, and every remaining dependent factor must still be retained.

## Two decisions I would change before the demo

**Treat four-to-eight point comparisons as a rejection heuristic, not a mean-validity certificate.** Your own good-mean/bad-point-model experiment disproves a reliable equivalence between those quantities. A finite set of source evaluations cannot certify an arbitrary shader's integral. A source-model residual mean is the relevant statistic, but its uncertainty depends on residual variance; there is no universal cheap sample count. Exact conditioning and structural validity should do the dependable work, with probes catching additional failures.

**Separate determinism at rest from stability under movement.** Adding time to the Gaussian integral is a valid extension under the model's assumptions. It does not by itself control view-dependent recipe cutoffs, model error, or solver switches. Test a frozen camera for deterministic pixels, then a moving camera for source-reference error and selection discontinuities. The app's quality bug was a practical reminder that changing a sampling route during interaction can visibly change the picture.

## The next compiler change I would make

Implement a recognized sinusoidal-shift coefficient provider returning `Q,Q′,Q″`; retain the general numerical transform for unsupported fields. Compose the providers for the traced ripple graph, including the extra harmonic and lighting, and merge orders when the parent and field share a count. Enumerate or bound surviving mixed recipes using their final window multipliers. Compare complete pixel means and total cost against the existing compiler before calling the specialization a GPU win.

Two inputs from you would make this immediately useful:

1. Record the maximum requested `|theta|`, retained sideband order, and grid size for the frozen ripple/bump scenes and amplitude sweep. That tells us where the demonstrated table aliasing is actually encountered and sizes a stable analytic provider.
2. Wire one existing weighted-curved-coverage probe to the interval-moment API while retaining one additional dependent oscillatory factor, and send the resulting adapter or failing case. That is the smallest test of the correlation we still need to preserve.

The ten-million-sample fire/horizon references, the K=1/4/8/16 boundary-masked control comparison, a GPU timing result, and the reciprocal-depth row prototype are **not completed by this package**. I am not claiming the required threefold equal-cost fire improvement. Your latest priority order led this reply to the coefficient specialization, the variance question, and the callable coverage reference first.
