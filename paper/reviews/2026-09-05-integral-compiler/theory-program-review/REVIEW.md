# Adversarial review of the theory program

Reviewed source: `paper/notes/theory-program.md` at immutable commit `b04f36b5769e44a17ec785ee804b8793721ef189`, SHA-256 `1d3513297f49928bf5db8b1aed893c73948a6db5b5ca48a7ef6761e9a14ad79a`. This reviews that complete blob, not subsequent corrections. These are mathematical counterexamples and proposed contracts, not new benchmark results.

The ledger and promotion gates are useful. The principal correction is to distinguish an approximation of a picture from an approximation of its pixel integral, and accuracy from evaluation cost. A representation can have a rigorous error bound and still require too much work. Neither a finite test family nor an error budget establishes a complexity theorem.

## A1: Gaussian closure requires an affine envelope map

The claimed closure is false for a quadratic pullback. Take the Gaussian atom and exactly quadratic map

\[
a(u)=e^{-u^2/2},\qquad T(x)=x^2.
\]

Then \(a(T(x))=e^{-x^4/2}\). Including a linear count-space phase gives \(e^{-x^4/2+ikx^2}\), with a quartic envelope. In general, substituting \(T(x)=c+Jx+\tfrac12H[x,x]\) into a Gaussian's quadratic exponent creates cubic and quartic terms. The quadratic multiplier does not integrate them.

The exact statement is affine pullback of a Gaussian envelope, with a quadratic pixel-space phase. A useful approximation keeps this form but certifies the omitted envelope and phase terms separately. For example,

\[
|Ae^{i\phi}-\widetilde A e^{i\widetilde\phi}|
\le |A-\widetilde A|+
|\widetilde A|\min(2,|\phi-\widetilde\phi|).
\]

Integrate this bound over the certified pixel ball and add its outside mass with an amplitude bound. Phase error grows with frequency. If the envelope itself is approximated by a quadratic exponent, require an integrable resulting Gaussian, or explicitly retain the bounded integration domain. Do not silently integrate an indefinite approximation over the entire plane. A generic two-dimensional curvature tensor also has no single curvature direction along which one-dimensional quadrature automatically becomes exact.

## A3: the proposed bound is not independent of scale

Footprint area divided by atom area grows as the pattern becomes finer. Additional counterexamples prevent area alone from controlling the active count:

- Gaussian atoms have infinite support; finite support must mean a certified truncation.
- A footprint of length \(L\) and width \(1/L\) has fixed area but meets order \(L\) unit-scale atoms.
- A rank-one map has zero footprint area while crossing many cells.
- A multiscale frame can place many scales and frequencies at the same position.
- A perspective footprint crossing its denominator zero has unbounded count-space extent, even when the screen-space region is bounded.

A corrected cost statement must expose tolerance, footprint anisotropy, mapping rank and distortion, coefficient bounds, branch count, and the preprocessing/storage that makes aggregation possible. Frame stability does not imply sparse evaluation. “Under 64 atoms at error 0.002 on this mask family” is a useful experimental target, not a consequence of A3. Proving that a hierarchy meets it remains work.

## B1: an interval for the mean cannot certify composition

Let \(f\) take values \(-1,+1\) with equal pixel mass. Replacing it by zero has exactly zero mean error, but \(E[f^2]=1\). A component harmless to one filtered mean can become the entire answer after multiplication. Marginal means, even exact ones, do not preserve correlation.

Keeping aligned atoms and edges in the same latent pixel coordinates can preserve it, but products then generate cross terms. Repeated edge products form general intersections, not just the bivariate-normal problem for two half-planes. Thresholds of atom sums can have arbitrarily many components; locating roots on lines does not bound their number.

The tuple must state whether its remainder bounds pointwise error, an \(L^2\) norm under the relevant joint pixel measure, or only the final integral. With \(f=\tilde f+r_f\), \(g=\tilde g+r_g\), Cauchy–Schwarz gives the valid product contract

\[
|E[fg]-E[\tilde f\tilde g]|
\le \|r_f\|_2\|\tilde g\|_2+
\|r_g\|_2\|\tilde f\|_2+
\|r_f\|_2\|r_g\|_2.
\]

For a threshold at \(t\), a uniform field error \(\delta\) leaves ambiguity in \(P(|\tilde f-t|\le\delta)\), plus the outside-window allowance. This can be order one on a plateau, however small \(\delta\) becomes. The shifted-conic enclosure addresses this correctly; a generic smooth-field error interval does not. Warping also changes the measure under which an error norm must hold.

## C1: distinguish absolute coefficient mass from energy

For the periodic indicator \(f(u)=1_{[0,1/2]}(u)\),

\[
|c_n|=\frac{1}{\pi|n|}\quad(n\text{ odd}),
\qquad c_n=0\quad(n\ne0\text{ even}).
\]

Its absolute coefficient tail diverges despite finite perimeter. Making the function independent of the second coordinate gives a two-dimensional counterexample. A perimeter-over-\(M\) estimate can bound squared \(L^2\) tail energy under suitable normalization and finite-perimeter assumptions. Its corresponding norm error is order \(\sqrt{P/M}\), not \(P/M\).

The relevant filtered error is instead

\[
\left|\sum_{k\notin K}c_k\widehat\mu_p(-k)\right|,
\]

where \(\mu_p\) is the joint pushforward of the pixel window. A full-rank affine Gaussian map provides strong multiplier decay; a rank-deficient map can leave resonant directions undamped. Nonlinear maps introduce stationary-phase and degeneracy cases. An ordinary picture-space \(L^2\) bound does not control integration against a singular pushforward.

Certify this weighted integral tail, with stated map assumptions. Individual dropped-term bounds must be summed into a total allowance. Smoothness-class decay and frame bounds likewise require explicit coefficient constants and tail summation, not just a class name.

## E1: rational conditioning is not a cubic integral

For independent standard Gaussian coordinates \(X,Y\), the rational-linear phase

\[
\theta(X,Y)=\frac{aX+bY+c}{d+eY}
\]

does permit exact transverse integration:

\[
E[e^{i\theta}]=\int\varphi(y)
\exp\!\left(i\frac{by+c}{d+ey}
-\frac{a^2}{2(d+ey)^2}\right)dy.
\]

This remaining rational integrand is not a Gaussian times a cubic phase. Physical clipping or visibility must also remain in the source domain. An Airy formula for a cubic surrogate cannot replace this integral exactly.

A third-order jet does not determine a map: \(x\) and \(x+Kx^4\) have identical jets through order three at zero and different filtered values. A rational Taylor model needs an explicit remainder tied to pole distance; a ball crossing the pole cannot have such a uniform polynomial error bound.

A one-dimensional Gaussian cubic integral has an Airy-type representation, but its small-cubic limit has severe exponential cancellation. A stable GPU implementation still needs limiting regimes and numerical error bounds. Generic two-dimensional cubic phases include mixed terms and do not reduce automatically to one ordinary Airy evaluation. Rank-one or separable cubic structure is a productive restricted first target. Preserve exact rational conditioning until a replacement proves both its scope and its cost advantage.

## A constructive organizing principle

**Bound the work needed to approximate the joint pixel integral, rather than assuming uniformly sparse pictures.** A conditional-expectation hierarchy supplies useful accounting. For a partition into regions \(C\),

\[
E[f]=\sum_C P(C)E[f\mid C].
\]

Conditional intervals combine with the same weights. Products require

\[
E[fg\mid C]=E[f\mid C]E[g\mid C]
+\operatorname{Cov}(f,g\mid C).
\]

That covariance identifies what a representation change may not discard. Atoms, explicit boundaries, spectral terms, and depth conditioning become alternative evaluators of these conditional contributions. Aggregation handles fine regions collectively; refinement targets unresolved boundaries and correlations.

This is an organizing contract, **not a solved complexity theorem**. Conditional means may themselves be expensive. A theorem must bound the unresolved contributions for a specified function/mapping class and tolerance, including preprocessing and storage. Enforce a separate work cap; if the error remains unresolved, carry that interval and use the declared fallback. Accuracy budgets and representation costs remain distinct.

The same contract gives a limited temporal guarantee: two representations within \(\varepsilon\) of the same instantaneous integral disagree by at most \(2\varepsilon\) at a handover. Determinism alone gives no such guarantee and does not establish stability under TSR.

## First probes

Run a small CPU family before selecting atom counts:

1. Affine Gaussian-envelope/quadratic-phase positive control, sweeping anisotropy and complex precision conditioning.
2. Quadratic-envelope counterexample above, sweeping curvature and phase frequency; compare the claimed enclosure with direct integration.
3. Equal-area thin footprints, rank-one maps, and approaching-rank-one maps; record active work and certified tail separately.
4. Aligned and opposite oscillatory products with identical marginal means; ensure resonant cross terms survive.
5. Threshold plateaus \(f=\delta h\) as \(\delta\to0\); require a wide uncertainty interval when justified.
6. Rational versus cubic models across pole-distance sweeps, including balls approaching or crossing the pole; require explicit rejection of unsupported polynomial bounds.

Record error, enclosure width, terms attempted/retained, and work-cap exits independently. No favorable average should conceal a failed enclosure or an unbounded worst case.
