# Finite-state subdivision under partially resolved footprints

2026-09-06. Independently checked derivations; no implementation, benchmark,
fixed-float result, or novelty claim. This extends
[PHASE-QUOTIENT-AND-COMPOSITION.md](PHASE-QUOTIENT-AND-COMPOSITION.md).

The admitted source is a supplied finite-state digit generator, not every
recursive texture. The useful duality is to keep that source exact while
approximating the smooth pixel or shading weight with an explicit integral
error. Conditioning the Gaussian on a prefix cell does not make its
remaining digits uniformly distributed.

## 1. Source and exact uniform-cell queries

Fix integer base b>=2, finite depth m>=1, S states, deterministic transitions
T_d for digits d=0,...,b-1, initial state s_0, and a terminal payoff
g(s) in [0,1]. Each T_d has one unit entry per row. For x mod 1, read its
first m base-b digits from most to least significant. This defines a
periodic, piecewise-constant material F(x).

Writing A=(1/b)sum_d T_d, a depth-k cell with prefix d_1,...,d_k,
k<=m, has exact uniform-Lebesgue mean

\[
 \bar F_C=e_{s_0}^T T_{d_1}\cdots T_{d_k}A^{m-k}g.
 \tag{1}
\]

An initial probability distribution can replace s_0, charging its
application cost. Layer-dependent transitions use the appropriate ordered
suffix product, not a repeated power. The state bound is part of the input
contract and must remain controlled over the source family.

Equation (1) is generally NOT the conditional Gaussian mean. For example,
let b=2,m=2,k=1, F(x)=1_[0,1/2)({2x}), and
X~N(1/8,(1/16)^2). Every half-unit prefix cell has uniform suffix mean 1/2.
Their Gaussian-mass-weighted mixture is therefore 1/2. But F=1 throughout
[0,1/4], which contains at least 3/4 of this Gaussian by Chebyshev's
inequality. A smooth shading factor can also depend on the unresolved
digits through the same x; its correlation cannot be discarded.

## 2. Approximate the weight, with a bound uniform over the material

Let kappa be a real, possibly signed W^{1,1} kernel on R, and let cells C
have length h. Use exact weights m_C=integral_C kappa and exact uniform
source means bar F_C. Then

\[
 \left|\int\kappa F-\sum_C m_C\bar F_C\right|
 \le\frac h4\|\kappa'\|_1.
 \tag{2}
\]

Proof: let bar kappa_C=m_C/h. The cell error equals
integral_C(kappa-bar kappa_C)F. Its density factor has zero integral, so
subtract 1/2 from F and bound by half the L1 density difference. For an
absolutely continuous f on an interval of length h,

\[
 \int_C|f-\bar f_C|
 \le\frac1h\int_C\int_C|f(x)-f(y)|\,dx\,dy
 \le\frac h2\int_C|f'|.
\]

The last step follows by integrating |f'| over the segment between x,y;
the coefficient at location t is 2t(h-t)/h<=h/2. Sum the cell errors.
This is the interval L1 Poincare estimate; the sharp convex-domain
generalization is classical.
[Acosta and Duran 2004](https://mate.dm.uba.ar/~rduran/papers/ad3.pdf)

For rectangles in R^r the same argument gives

\[
 \left|\int\kappa F-\sum_Cm_C\bar F_C\right|
 \le\frac14\sum_C\sum_{i=1}^r
 h_{i,C}\int_C|\partial_i\kappa|.
 \tag{3}
\]

Inside each cell, telescope the successive uniform coordinate averages.
They are L1 contractions; apply the interval inequality on each fiber.
No product-density assumption is used. A certified oscillation
osc_C(F) can multiply the cell's contribution. Constant-output source
leaves have exactly zero replacement error.

For a uniform grid and Gaussian p=N(mu,Sigma), Sigma positive definite,

\[
 \|\partial_i p\|_1
 =\sqrt{2/\pi}\sqrt{(\Sigma^{-1})_{ii}},
\]
\[
 |I-I_h|\le\frac14\sqrt{2/\pi}
 \sum_i h_i\sqrt{(\Sigma^{-1})_{ii}}.
 \tag{4}
\]

The score -Sigma^{-1}(X-mu) has component variance (Sigma^{-1})_ii,
which proves the norm identity. Correlated rectangular cell masses must
remain joint Gaussian probabilities, not products of marginal masses.
Singular covariance needs a different intrinsic partition or measure
argument; (4) cannot use a nonexistent inverse.

For correlated smooth shading L, use kappa=pL. Then

\[
 \|\partial_i\kappa\|_1
 =E\left|\partial_iL(X)-L(X)[\Sigma^{-1}(X-\mu)]_i\right|.
 \tag{5}
\]

Its Gaussian L2 norm is a sufficient upper bound. Polynomial L gives
explicit finite Gaussian moments for that square. The cell weights are
integral_C pL, not P(C)L evaluated at a point. Their computation is a
separate obligation. If F has range W rather than one, multiply the
replacement bound by W; subtracting a constant is valid when the same
kernel mass is preserved.

## 3. A complete one-dimensional resolved-cell count

Let X~N(mu,sigma^2), sigma>0, tolerance 0<eta<1, and c=sqrt(2/pi).
Choose

\[
 k_*=\max\left(0,\left\lceil\log_b\frac{c}{2\sigma\eta}\right\rceil\right),
 \qquad k=\min(m,k_*),\qquad h=b^{-k}.
 \tag{6}
\]

If k_*=0, use the full Haar mean from (1): every unit cell has the same
source mean, and (2) gives error at most eta/2 after summing their total
Gaussian mass one. The wrapped-Gaussian certificate of the preceding note
can alternatively admit this case at smaller sigma.

Otherwise retain all whole grid cells intersecting
[mu-R sigma,mu+R sigma], with

\[
 R=\sqrt{2\log(4/\eta)}.
\]

The omitted Gaussian mass is at most 2Phi(-R)<=2exp(-R^2/2)=eta/2.
The retained-cell error is at most eta/2 by (2), or exactly zero if k=m
before the bound asks for full refinement. Therefore total error is at
most eta, before numerical allowances.

Since h>=2 sigma eta/(bc), the number K of retained cells satisfies

\[
 K\le 2R\sigma/h+2\le bcR/\eta+2.
 \tag{7}
\]

This is a count independent of source depth m and repeated windings.
It does not remove prefix-depth or state costs. Preparing the single
suffix vector costs O(bS(m-k)) sparse arithmetic, or
O(S^3 log(m-k+1)) dense powering plus initialization. Straightforward
prefix evaluation costs O(Kk) deterministic state transitions, followed
by one lookup per cell. Normal CDF differences supply the cell masses.
Digit extraction, phase reduction, transcendental evaluation, memory and
bit precision are outside these exact-arithmetic counts.

For multiple initial states, dense transitions, or layer-dependent rules,
use their actual preparation and query costs. At source depth m the
material is constant on every leaf; continued spatial refinement buys
nothing for the density-replacement error.

## 4. Two-dimensional subdivision and geometry costs

A supplied joint S-state machine may read digit pairs (d,e), giving b^2
transitions per level and

\[
 v_0=g,\qquad v_{n+1}=\frac1{b^2}\sum_{d,e}T_{de}v_n.
\]

All suffix vectors cost O(b^2 S m) arithmetic to prepare. Depth-k prefixes
then query v_{m-k}. Building this joint machine from separate material
graphs may enlarge S; it is not free composition.

For a Gaussian retain every cell intersecting
B_R={|x_i-mu_i|<=R sqrt(Sigma_ii), i=1,2}. The omitted mass is at most
4Phi(-R)<=2exp(-R^2/2), and a uniform rectangular grid has at most

\[
 \prod_{i=1}^2(2R\sqrt{\Sigma_{ii}}/h_i+2)
 \tag{8}
\]

retained cells. Formula (4) supplies the replacement allowance.
For independently available axis sizes, choosing
h_i=eta/[sqrt(2/pi)sqrt((Sigma^{-1})_ii)] and
R=sqrt(2log(4/eta)) gives eta/2 to each error and a count
O(eta^{-2}log(1/eta)/(1-rho^2)), where rho is the Gaussian correlation.
This conditional grid count exposes the cost of strong correlation.

Ordinary level-synchronized quadtree prefixes instead have
h_i=ell_i b^{-k}, fixed by the authored aspect ratio. Use these actual
sizes in (4) and (8). Independent axis refinement or rotation can change
the source's digit representation and requires a separately priced
decomposition. The displayed free-axis count is not automatically the
quadtree algorithm's cost.

For a signed shading kernel pL, omitted absolute mass can be bounded by
sqrt(E L^2)sqrt(P(X outside B_R)), with its own tail allocation.
If certified cell-weight errors are epsilon_C, their contribution is at
most sum_C epsilon_C. Source-mean error at most nu contributes
nu integral|kappa| when weights are exact; using inexact weights requires
the corresponding interval or product error as well.

## 5. Exact polynomial-weighted source queries

The first-order bound need not dictate the only approximation method.
Let f_{s,n} be the source starting in state s with n remaining digits.
Define vectors of moments

\[
 M_j^{(n)}(s)=\int_0^1x^j f_{s,n}(x)\,dx.
\]

Substitution x=(d+t)/b on each child gives the exact recurrence

\[
 M_j^{(n)}
 =b^{-(j+1)}\sum_{d=0}^{b-1}\sum_{\ell=0}^j
 \binom j\ell d^{j-\ell}T_dM_\ell^{(n-1)},
 \qquad M_j^{(0)}=g/(j+1).
 \tag{9}
\]

Moments through degree J cost O(m b S(J+1)^2) arithmetic with deterministic
transitions. A homogeneous augmented operator can be powered, with its
dimension, preparation and bit complexity charged.

For C=c+h[0,1], with prefix state s and remaining depth n, express a local
kernel polynomial as P_C(c+ht)=sum_j alpha_j t^j. Then

\[
 \int_C P_CF=h\sum_j\alpha_j M_j^{(n)}(s),\qquad
 \left|\int_C(\kappa-P_C)F\right|
 \le\|\kappa-P_C\|_{L^1(C)}.
 \tag{10}
\]

If P_C also preserves the exact kernel mass of C, the bound is half that
L1 error. The finite material is unchanged throughout.

There is a positive Bernstein formulation. At fixed degree J let
N_j^{(n)}=integral_0^1 B_j^J(x)f_n(x)dx and use subdivision coefficients

\[
 B_j^J((d+t)/b)=\sum_{\ell=0}^J R_{d;j\ell}B_\ell^J(t).
\]

The coefficients have the elementary positive form

\[
 R_{d;j\ell}
 =P\{\operatorname{Bin}(\ell,(d+1)/b)
       +\operatorname{Bin}(J-\ell,d/b)=j\},
\]

with independent binomials. To derive it, choose each of J Bernoulli
probabilities to be the upper endpoint with probability t and the lower
endpoint otherwise, then condition on the number of upper endpoints.
The total success count is Bin(J,(d+t)/b). This proves the subdivision
identity and R>=0 directly. Integrating it over all children
and using integral B_j^J=1/(J+1) gives
(1/b)sum_{d,ell}R_{d;jell}=1. Thus

\[
 N_j^{(n)}=\frac1b\sum_{d,\ell}R_{d;j\ell}T_dN_\ell^{(n-1)},
 \qquad N_j^{(0)}=g/(J+1).
 \tag{11}
\]

The augmented recurrence is row-stochastic and preserves
0<=N_j<=1/(J+1). Equivalently, (J+1)N is a bounded state vector with
the original g as its initial value. This is an exact finite closure for
polynomial-weighted queries of the supplied digit generator. Positive
kernel coefficients avoid cancellation in the final contraction; general
signed coefficients, subdivision-table construction and rounding need
their own analysis.

In two dimensions, apply the affine substitution to each coordinate.
Monomials of total degree at most J remain closed, with base
M_{ij}^{(0)}=g/[(i+1)(j+1)] and direct work
O(m b^2 S binom(J+4,4)). This still requires the joint source machine.
The accuracy and cost of approximating a Gaussian, BRDF or other kernel
by these local polynomials are additional obligations; no logarithmic
degree law or fixed GPU cost is asserted here.

## 6. Admission conditions and remaining research

Fixed-ratio recursion alone does not guarantee a uniformly bounded
state machine. A sufficient source contract is a fixed finite set of
cell types with child type and output determined by parent type and
child address. An arbitrary finite quadtree may only have a large trie.
A recursive rule recognizing addresses 0^n1^n across all depths cannot
use one fixed finite transition table. Depth-dependent schedules change
that statement: at a supplied even depth m, two states can check zeros
through m/2 and ones afterward. The schedule's description and application
cost must then be included; complexity need not appear solely in S.

Noninteger subdivision needs a source-preserving coding and its measure.
For instance {beta{beta u}} need not equal {beta^2u}; a theorem about
greedy beta digits cannot silently replace raw octave phases. A finite
digit language also does not make its symbols independent.

The practical research question is which authored pattern and shading
families admit small joint transition and polynomial-query representations.
Equations (2)-(8) price one partial-footprint route. Equations (9)-(11)
identify a higher-order route that approximates the smooth weight while
retaining every material transition. Neither claims that arbitrary
visibility graphs, hash noise, or game materials have such a small
representation.
