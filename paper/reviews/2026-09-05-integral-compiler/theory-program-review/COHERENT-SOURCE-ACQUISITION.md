# Resolve the source once at response accuracy

September 6, 2026. Theory only. This specializes the coherent-source
construction in [IMPLICIT-POLYNOMIAL-SOURCE.md](IMPLICIT-POLYNOMIAL-SOURCE.md),
section 7, to repeated bounded prototypes. Gaussian semigroup contraction,
Bessel's inequality and rectangle integration are classical facts.
The contribution here is the explicit separation of costs in our contract.

Increasing the order of a response state need not force finer source
geometry. Construct one bounded approximate material, charge its error
against the actual positive queries, and acquire a response state of that
same material. Independent moment-entry error bounds are a different issue.

## 1. A finest-footprint certificate controls coarser queries

Write \(G_\Sigma\) for centered Gaussian probability measure with covariance
\(\Sigma\), allowing a singular measure when necessary. If
\(\Sigma\succeq\Sigma_0>0\), then
\[
 G_\Sigma=G_{\Sigma-\Sigma_0}*G_{\Sigma_0}.
\]
Convolution by a probability measure contracts the sup norm, so
\[
 \|G_\Sigma*(F-\widehat F)\|_\infty
 \le\|G_{\Sigma_0}*(F-\widehat F)\|_\infty.                \tag{1}
\]
This is uniform in the query mean. A certificate at one smallest admitted
covariance applies to all larger covariances in the positive-semidefinite
order. It does not apply to footprints with a narrower direction, or to
a changed source produced by multiplying by a new unresolved factor.

Suppose the source uses one of \(S\) bounded prototypes on each physical
unit cell, and each prototype has one fixed approximation satisfying
\[
 \int_{[0,1]^2}|f_s-\widehat f_s|\le\eta,\qquad
 0\le\widehat f_s\le1.                                  \tag{2}
\]
Use the same approximation on every occurrence of \(s\). This instantiates
one whole source \(\widehat F\); it is not chosen separately for each
moment or query.

For a univariate Gaussian of width \(\sigma\), the unit-cell upper sums obey
\[
 \sum_i\sup_{[i,i+1]}q_{\mu,\sigma}
 \le\int q+\int|q'|
 =1+\sqrt{2/\pi}/\sigma.                                \tag{3}
\]
This follows cell by cell from
\(\sup_C q\le\int_Cq+\int_C|q'|\).
For \(\Sigma_0=I\), (2)--(3) and then (1) give
\[
 |E_{N(\mu,\Sigma)}(F-\widehat F)|
 \le C_0\eta,\qquad
 C_0=(1+\sqrt{2/\pi})^2<4,\quad\Sigma\succeq I.           \tag{4}
\]
There is no response-degree, state-size or number-of-references factor.
For a different positive diagonal base covariance, replace \(C_0\) by
the product of the two factors in (3).

The physical covariance condition is essential: a reference \(C\succeq I\)
does not imply that its entire relative covariance band lies above \(I\).
For example, \(C=I\) and a negative relative perturbation produce a narrower
query. Check the actual query or choose a smaller base covariance explicitly.

## 2. An explicit shared source for polynomial predicates

Consider a bounded rational-valued response circuit of rational polynomial
sign predicates on a unit cell. Resolve constant predicates, including
identically zero ones, first. For the remaining predicates let \(D\ge1\)
be their total degree and \(C_D=2D^2+7D\).

Use the quadtree and exact box decisions in the implicit-source and prototype
notes. A box on which no predicate can vanish has a fixed exact circuit
value. Keep that value. At the chosen terminal depth, assign zero to the
remaining unresolved boxes. This defines a bounded piecewise-constant
\(\widehat f_s\), with error confined to the unresolved area.

Choose the smallest dyadic integer \(k\) satisfying
\[
 k\ge\max\{1,20D/\eta,\sqrt{2C_D/\eta}\}.                 \tag{5}
\]
The previously proved grid count gives unresolved area at most
\[
 10D/k+C_D/k^2\le\eta,
\]
and visited nodes at most
\[
 1+40D(k-1)+4C_D\log_2k.                                \tag{6}
\]
Thus the per-prototype node count is
\(O(D^2/\eta+D^2\log(D/\eta))\), for \(0<\eta\le1\).
Multiply by the actual prototype count, and include exact predicate
decisions, circuit evaluation, input degree/bit complexity and storage.
Constant sources are handled exactly.

This geometry is fixed by the source-response allowance \(\eta\), independently
of Hermite order \(N\) or local polynomial degree \(J\). Increasing those
orders requires further integration work on the same rectangles.

For \(R_s\) retained rectangles, all tensor Bernstein moments through degree
\(J\) can be acquired in \(O(R_s(J+1)^2)\) rational arithmetic using rectangle
Beta integrals. The orthogonal alternative is described in
[ORTHOGONAL-KERNEL-STATE.md](ORTHOGONAL-KERNEL-STATE.md).
Finite arithmetic and storage errors remain separate from (4).

## 3. Direct state acquisition from the explicit rectangles

Fix a reference \(X=\mu_0+D_0 Z\), with diagonal positive \(D_0\), and let
\(h_n=\operatorname{He}_n/\sqrt{n!}\) be the orthonormal probabilists'
Hermite polynomial. There are
\(K_N=(N+1)(N+2)/2\) two-dimensional indices of total degree at most \(N\).

For a standardized interval,
\[
 I_0(a,b)=\Phi(b)-\Phi(a),\qquad
 I_n(a,b)=
 \frac{\phi(a)h_{n-1}(a)-\phi(b)h_{n-1}(b)}{\sqrt n}
 \quad(n\ge1).                                         \tag{7}
\]
A source rectangle of value \(c\), with standardized bounds
\([a,b]\times[d,e]\), contributes exactly
\[
 c\,I_{\alpha_x}(a,b)I_{\alpha_y}(d,e)                   \tag{8}
\]
to the Hermite state. This uses the explicit source geometry. It infers
no partial-cell information from a finite table of full-cell moments.

Keep all physical unit cells intersecting the reference box
\(\mu_{0i}\pm R(D_0)_{ii}\); call their union \(W\).
Its standardized image \(W_z=D_0^{-1}(W-\mu_0)\) contains
\([-R,R]^2\), whose complement lies outside the disk of radius \(R\).
Thus \(\Pr_{\rm ref}(W^c)=\Pr_\gamma(W_z^c)\), and
\[
 \Pr_{\rm ref}(W^c)\le e^{-R^2/2},\qquad
 \|H_{\le N}(\widehat F)-H_{\le N}(\widehat F1_W)\|_2
 \le e^{-R^2/4}.                                       \tag{9}
\]
The second bound is Bessel applied to the single discarded source.
It has no \(K_N\) factor.

Alternatively, if all whitened queries in the reference patch obey
\(|m|\le L\), \(Q\preceq q_+I\), and \(R>L\), then
\[
 \Pr_q(W^c)\le
 \exp\!\left[-(R-L)^2/(2q_+)\right].                     \tag{10}
\]
To see this, a standardized query \(Y=m+Q^{1/2}Z\) outside \(W_z\)
has \(|Y|>R\), hence \(|Z|>(R-L)/\sqrt{q_+}\).
One can treat \(\widehat F1_W\) as the bounded source for this reference,
charge (10) directly, and apply its own bounded-source state truncation.
This avoids multiplying the window error by the density-ratio norm.

There are at most
\[
 M\le(2R(D_0)_{xx}+2)(2R(D_0)_{yy}+2)
\]
retained cells. Let \(A=\sum_{\text{retained cells}}R_{\text{prototype(cell)}}\),
and let \(E_x,E_y\) count distinct standardized rectangle endpoints.
A conservative per-reference cost is
\[
 O\!\left(M+(N+1)(E_x+E_y)+A K_N\right),                 \tag{11}
\]
plus certified Gaussian CDF/exponential evaluations, coordinate conversion,
and arithmetic precision. Endpoint vectors can be cached or streamed.
Periodic reuse shares the prototype geometry; it does not remove the
retained-cell count from (11).

For a fixed state index, the exact rectangle contributions satisfy
\[
 \sum_R\left|c_R\int_R h_\alpha\,d\gamma\right|
 \le\int\widehat F1_W|h_\alpha|\,d\gamma\le1.             \tag{12}
\]
Thus the disjoint positive source representation introduces no large
coefficient-sum amplification. This does not certify fixed-float evaluation
of the endpoint differences in (7), which may involve cancellation.

For example, \(|I_n|\le1\). Absolute interval error \(\delta\le1\) gives
product error at most \(3\delta\); over \(A\) rectangles the resulting
state-vector error is at most \(3A\sqrt{K_N}\delta\), before coefficient,
coordinate and accumulation errors. This is a conservative explicit
precision contract, not a claim that such endpoint accuracy is free.

## 4. The composed budget and its limits

Let \(E_N\) be the bounded-source Hermite truncation allowance from
[GAUSSIAN-QUERY-STATE.md](GAUSSIAN-QUERY-STATE.md), let \(\kappa\) bound
the query density ratio in \(L^2\), and let \(\eta_H\) measure acquisition
error relative to the exact state of \(\widehat F1_W\).
With query coefficient-vector error \(\eta_c\), one sufficient budget is
\[
 C_0\eta+\epsilon_{\rm window}+E_N+
 \kappa\eta_H+(1+\eta_H)\eta_c+
 \epsilon_{\rm accumulation}.                         \tag{13}
\]
Use (10) for the direct window allowance, or the state-tail route (9)
with its \(\kappa\) factor. The exact bounded source has state norm at most
one, which gives the coefficient-error term in (13).
The state truncation and finite \(\kappa\) require the relative-reference
Gaussian admission in that note; the physical condition \(\Sigma\succeq I\)
alone supplies only the source allowance (4).

The separation is precise: the geometric source error is charged once
under positive physical queries; kernel/state approximation and numerical
errors are measured relative to the resulting fixed source. Arbitrary
rounded moment entries cannot be declared to be a bounded coherent source.

Source edits can require rebuilding the prototype geometry and the states.
Changing the viewing parameters reuses a state only within its stated
admission region. Direct rectangle acquisition can still be expensive for
many broad references. The smaller geometric accuracy requirement is a
better sufficient contract, not a game-performance measurement.
