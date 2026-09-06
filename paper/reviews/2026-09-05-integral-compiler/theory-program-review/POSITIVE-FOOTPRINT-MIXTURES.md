# Positive mixtures for tilted Gaussian footprints

September 6, 2026. Theory only; independently audited. Gaussian lattice
mixture approximation is established mathematics, with direct prior below.
No implementation, fixed-float or game-performance claim is made.

A correlated Gaussian can be approximated by a positive finite mixture
of independent Gaussians. When each component fits the existing prototype
query contract, all components use the same material table and degree.
Their positive normalized weights preserve the component error allowance
without multiplying it by the number of components.

This gives a different cost/error tradeoff from the signed Mehler route
in Claude's orientation note, section 7k. It does not cover every covariance
that route admits, and does not prove that the resulting query is cheap.

## 1. Split the footprint covariance

In the native unit-cell coordinates of
[NOISE-PROTOTYPE-MOMENTS.md](NOISE-PROTOTYPE-MOMENTS.md), let
\[
 q=N(\mu,Q),\qquad Q=D+\ell\ell^T,\qquad
 D=\operatorname{diag}(d_x,d_y)>0.                       \tag{1}
\]
For independent standard normal variables \(Z,U_x,U_y\),
\[
 X=\mu+\ell Z+D^{1/2}U.
\]
Conditioned on \(Z=z\), the footprint is
\(g_z=N(\mu+\ell z,D)\), an independent-axis Gaussian.
Consequently
\[
 q(x)=\int_{\mathbb R}\phi(z)g_z(x)\,dz.                  \tag{2}
\]
The source is unchanged. Only its footprint query is decomposed.

The posterior law of \(Z\) given \(X=x\) has variance and mean
\[
 v=(1+\ell^TD^{-1}\ell)^{-1}
   =\frac{\det D}{\det Q},\qquad
 m(x)=v\ell^TD^{-1}(x-\mu).
                                                               \tag{3}
\]
Completing the square gives the exact identity
\[
 \phi(z)g_z(x)=q(x)\phi_{v}(z-m(x)),                     \tag{4}
\]
where \(\phi_v\) denotes a centered normal density of variance \(v\).
This posterior variance controls the grid spacing below.

For standardized marginal coordinates with correlation \(\rho\),
\(r=|\rho|\in(0,1)\), one simple split is
\[
 D=(1-r)I,\qquad
 \ell=\sqrt r(1,\operatorname{sign}\rho)^T,\qquad
 v=\frac{1-r}{1+r}.                                     \tag{5}
\]
Physical marginal scales multiply the corresponding rows of this split.
Section 4 supplies a less restrictive choice for the prototype engine.

## 2. Positive lattice quadrature and finite truncation

For spacing \(h>0\), form the infinite positive mixture
\[
 q_h(x)=\sum_{k\in\mathbb Z}h\phi(kh)g_{kh}(x).
                                                               \tag{6}
\]
By (4) and Poisson summation,
\[
 \frac{q_h(x)}{q(x)}
 =1+2\sum_{n\ge1}
 e^{-2\pi^2vn^2/h^2}\cos(2\pi n m(x)/h).
\]
Put \(A=2\pi^2v/h^2\). Its relative error is uniformly at most
\[
 d_h=2\sum_{n\ge1}e^{-An^2}
 \le\frac{2e^{-A}}{1-e^{-3A}},                           \tag{7}
\]
using \(n^2\ge1+3(n-1)\).
The total mass \(Z_h=h\sum_k\phi(kh)\) is at least one by the centered
Gaussian's Poisson formula. Normalizing (6) therefore gives
\[
 \operatorname{TV}(q,q_h/Z_h)\le d_h.
\]
For example, use
\(\|q_h-q\|_1\le d_h\), \(|Z_h-1|\le d_h\), and \(Z_h\ge1\).
Here \(\operatorname{TV}\) is half the density \(L^1\) distance.

Retain only \(|k|\le K\) and normalize the retained weights:
\[
 w_k=\frac{\phi(kh)}{\sum_{|j|\le K}\phi(jh)},\qquad
 \widetilde q=\sum_{|k|\le K}w_k g_{kh}.
                                                               \tag{8}
\]
All weights are positive and their sum is one.
The discarded unnormalized mass is
\[
 \tau=h\sum_{|k|>K}\phi(kh)
 \le2\int_{Kh}^{\infty}\phi(z)\,dz,                      \tag{9}
\]
by monotonicity of \(\phi\) on the positive half-line.
Conditioning the infinite mixing distribution on the retained nodes
changes its TV distance by \(\tau/Z_h\le\tau\); mixing cannot increase TV.
Thus
\[
 \operatorname{TV}(q,\widetilde q)\le d_h+\tau.           \tag{10}
\]
Every measurable \(F\in[0,1]\) has expectation error bounded by (10).
After finite truncation the certificate is TV/\(L^1\), not a uniform
relative-error statement in the far tails.

For \(0<\epsilon_{\rm mix}\le1\), use
\[
 A=\log(8/\epsilon_{\rm mix}),\quad
 h=\pi\sqrt{2v/A},\quad
 R=\sqrt{2\log(4/\epsilon_{\rm mix})},\quad
 K=\lceil R/h\rceil.                                    \tag{11}
\]
Equation (7) is at most \(\epsilon_{\rm mix}/2\);
(9) is at most \(2e^{-R^2/2}=\epsilon_{\rm mix}/2\).
The mixture therefore has TV error at most \(\epsilon_{\rm mix}\).
Its number of independent components satisfies
\[
 L=2K+1\le
 3+\frac{2}{\pi\sqrt v}
       \sqrt{\log(4/\epsilon_{\rm mix})
             \log(8/\epsilon_{\rm mix})}.                \tag{12}
\]
For the symmetric split (5), this is
\(O(\sqrt{(1+r)/(1-r)}\log(1/\epsilon_{\rm mix}))\).
At \(\rho=0\), use the exact single independent Gaussian instead.
A singular Gaussian is outside this density theorem.

## 3. Composition with the bounded prototype query

The existing prototype query requires independent component widths at
least one native cell. Here that means
\[
 d_x\ge1,\qquad d_y\ge1.                                 \tag{13}
\]
All component means are allowed. Every component uses the same
degree-\(J\) material table, with \(J\) selected only from its component
kernel allowance \(\epsilon_K\), for example the factorial selector in
the prototype note. There is no increase to \(J+L\).

Let \(\widetilde I_k\) approximate \(E_{g_{kh}}F\) with a uniform component
error bound \(e_{\rm component}\). Then
\[
 \left|E_qF-\sum_{|k|\le K}w_k\widetilde I_k\right|
 \le\epsilon_{\rm mix}+e_{\rm component}.               \tag{14}
\]
In particular, the existing table-acquisition allowance remains
\(16\eta_M\), not \(16L\eta_M\).
The convex mixture of folded tensor weights has coefficient norm at most
the convex mixture of their norms, which is less than sixteen.
This statement does not certify the individual Walsh computations.

For the coherent threshold controls in
[THRESHOLD-CONTROL-STATE.md](THRESHOLD-CONTROL-STATE.md), one sufficient
combined budget is
\[
 \epsilon_{\rm mix}+4\eta+\epsilon_K+16\eta_M
       +\epsilon_{\rm numerical}.                      \tag{15}
\]
The threshold source approximation costs at most \(4\eta\) for every
independent component under (13), and positivity preserves that allowance.
The same complete source table is used in all components.

Preparing nodes and weights costs \(O(L)\) elementary evaluations.
The sufficient per-footprint work is \(L\) independent queries:
\[
 O\!\left(
 L\,P(J+1)^2[b^2+1+\log(1/\delta_K)]
 \right),\qquad \delta_K=\epsilon_K/3,                  \tag{16}
\]
for the small-carry class \(D_x,D_y\le b\).
Use the original general class-count formula for arbitrary axis permutations.
Material-table preparation and storage stay as in the prototype note;
one can stream the component queries and their accumulation.
Neither positivity nor the rank bound removes this component work.

Nodes, covariance factorization, component means, exponentials, weight
normalization and accumulation require numerical allowances.
If approximate weights are certified nonnegative and normalized, with
\(l^1\) discrepancy at most \(\eta_w\) from the exact weights, then replacing
the weights on exact component means costs at most \(\eta_w/2\), because
the means lie in \([0,1]\) and the signed weight differences sum to zero.
Approximate component means contribute their separate uniform allowance.
Negative or unnormalized stored weights do not inherit this conclusion.

## 4. Choose the diagonal residual to admit \(Q\succeq I\)

The symmetric split (5) is not always the best fit to the source grid.
Suppose
\[
 Q=\begin{pmatrix}a&c\\c&b\end{pmatrix}\succeq I.
\]
If \(c=0\), it is already an admitted independent Gaussian.
If \(c\ne0\), then \(a,b>1\), and define
\[
 U=a-\frac{c^2}{b-1}\ge1,\qquad
 d_x\in[1,U],\qquad
 d_y=b-\frac{c^2}{a-d_x}.                               \tag{17}
\]
Here \(U<a\). These are exactly the diagonal residuals obeying (13)
for which \(Q-D\) is positive semidefinite of rank one. A factor is
\[
 \ell=\left(\sqrt{a-d_x},
               \frac{c}{\sqrt{a-d_x}}\right)^T.
\]
Maximizing \(v\) in (3) amounts to maximizing \(\det D\). As a function of
\(d_x\), that determinant is
\[
 f(d_x)=b\,d_x-\frac{c^2d_x}{a-d_x},\qquad
 f''(d_x)=-\frac{2ac^2}{(a-d_x)^3}<0.
\]
Its unique feasible maximizer is
\[
 d_x=\operatorname{clamp}
       \left(a-|c|\sqrt{a/b},\,1,\,U\right),\qquad
 d_y=b-\frac{c^2}{a-d_x}.                               \tag{18}
\]
Thus every \(Q\succeq I\) has an admitted split or the exact independent
branch. This maximizes the posterior variance and minimizes the sufficient
rank bound (12) within this family of diagonal residuals. It is not a
proof of minimum rendering cost or optimality over all approximations.

If \(\det(Q-I)=0\) with \(c\ne0\), the feasible interval collapses to
\(U=1\) and \(D=I\). The mathematical construction remains valid.
Numerical factorization must certify its feasibility and any parameter
perturbation; there may be no margin for rounding a residual downward.
Silently modifying an invalid covariance changes the query.

The condition \(Q\succeq I\) is stronger than having both marginal
variances at least one. The signed Mehler construction still admits
some covariances outside this positive-component engine's current class.
Narrower component queries need another source/query representation.

## 5. What is established and what remains a cost

This construction removes correlation-dependent signed-weight amplification
from this query route and keeps the original material degree. Correlation
still affects the number of component queries through \(v\).
Highly elongated footprints can require many components.

The degree, mixture rank, source-state size and material-update cost are
different quantities. A small mixture rank does not make a large prototype
table inexpensive. Conversely, inability to bound a signed representation
cheaply does not prove that the material's true filtered response is hard.
The positive construction is one explicit alternative with a complete
analytic error budget.

## Primary prior

- Ling and Belfiore (2014),
  [Achieving AWGN Channel Capacity With Lattice Gaussian
  Coding](https://arxiv.org/pdf/1302.5906), Lemma 9, p.5, adapts Regev's
  Gaussian convolution lemma: a lattice Gaussian convolved with a continuous
  Gaussian is controlled by a flatness factor at the posterior scale.
  This lemma is separate from the paper's channel-capacity SNR condition.
  Equations (4)--(12) give an explicit one-dimensional specialization and
  finite truncation for the footprint query.
- Wu and Verdú (2010),
  [The Impact of Constellation Cardinality on Gaussian Channel
  Capacity](https://www.stat.yale.edu/~yw562/reprints/capacity.gap.allerton10.pdf),
  Theorem 8 and equations (57)--(60), give a positive
  Gauss--Hermite construction with a density-level error bound.
- Ma, Wu and Yang,
  [On the best approximation by finite Gaussian
  mixtures](https://arxiv.org/html/2404.08913v2), section 1.2, Theorem 4
  and equation (23), analyze improved finite-mixture rates and lower bounds.
  Their lower bounds concern a specified fixed-component-variance mixture
  class, not every possible material-integration algorithm.

Positive Gaussian mixture approximation is not new. The claim here is the
stated specialization, residual choice and composition with the previously
audited bounded prototype query, with its source restrictions and costs.
