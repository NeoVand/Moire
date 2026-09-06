# Gaussian subdivision on the original two-dimensional source axes

2026-09-06. Independently derived and checked theory only. Gaussian square
completion, Bernstein subdivision, midpoint error identities and Gaussian
moments are classical tools; no novelty claim is made. No implementation,
experiment, GPU cost, or complete numerical arithmetic certificate follows.

This extends the kernel bounds in
[GAUSSIAN-SUBDIVISION-COST.md](GAUSSIAN-SUBDIVISION-COST.md).
The source axes remain fixed. Diagonalizing a covariance for analysis does
not authorize rotating the source's digit cells or replacing its automaton.

## 1. Source, cells and the two polynomial dimensions

Let F:R^2->[0,1] be a supplied finite-depth deterministic S-state pattern.
Its authored rectangular periods are ell_1,ell_2, with a fixed grid origin.
At each of m levels, the machine reads one pair of base-b digits, b>=2,
of the two normalized fractional coordinates. The transition T_de(s) is
supplied for each state and digit pair, and the terminal value is g_s in
[0,1]. The source is constant on its depth-m leaves; no infinite-depth
limit, random ensemble, or material-state compression is assumed.

A depth-k prefix cell has sides h_i=ell_i b^(-k). In its local coordinates
u in [0,1]^2, its source is the exact suffix function f_{s,m-k}(u).
The geometric estimates below hold for arbitrary disjoint axis-aligned
rectangles; the paired-digit moment recurrence applies directly only to
source-compatible prefix cells. Other rectangles need an additional source
representation or decomposition, not an assumed identical suffix state.

Let X~N(mu,Sigma), Sigma positive definite, with density p and precision
P=Sigma^(-1). The target is I=E F(X). For a cell centered at c, write
x=c+D t, D=diag(h_1,h_2), |t_i|<=1/2. Put

\[
 K=DPD,\qquad a=DP(c-\mu),\qquad
 p(x)=p(c)e^{z(t)},\quad z(t)=-a\cdot t-\tfrac12t^TKt.
 \tag{1}
\]

An order-n exponential Taylor polynomial has TOTAL degree J=2n. We may
represent it in the tensor Bernstein basis B_i^J(u_1)B_j^J(u_2), which has
(J+1)^2 entries, versus (J+1)(J+2)/2 monomials of total degree at most J.
Do not discard tensor entries with i+j>J: control indices are not monomial
degrees. Individual tensor basis functions have total degree 2J, even when
their combination represents a polynomial of total degree only J.

## 2. Local coefficient and remainder bounds

With u_i=t_i+1/2, each diagonal contribution -a_i t_i-K_ii t_i^2/2 has
degree-two Bernstein coefficients
(a_i/2-K_ii/8, K_ii/8, -a_i/2-K_ii/8).
The mixed term -K_12 t_1 t_2 has maximum coefficient magnitude |K_12|/4;
degree elevation preserves that bound. Therefore every tensor coefficient
of z has absolute value at most

\[
 M_C=\tfrac12(|a_1|+|a_2|)
 +\tfrac18(K_{11}+K_{22}+2|K_{12}|).
 \tag{2}
\]

Bernstein multiplication coefficients are convex combinations of products,
and degree elevation is a convex combination. For
P_C=p(c)sum_{l=0}^n z^l/l!, with tensor coefficients beta_C,ij, this gives

\[
 \max_{i,j}|\beta_{C,ij}|\le B_C:=p(c)e^{M_C},\qquad
 |p(x)-P_C(x)|\le B_C\frac{M_C^{n+1}}{(n+1)!}\quad(x\in C).
 \tag{3}
\]

The first bound is a maximum-coefficient norm, not an l1 coefficient sum.
The coefficients may have either sign. Choosing even n makes the Taylor
polynomial positive on real arguments, but does not by itself make all
of its Bernstein coefficients positive or certify their computation.

## 3. Four fixed shifts and an adaptive midpoint bound

Assume every cell satisfies h_i sqrt(P_ii)<=alpha for a fixed alpha>0.
Define rho=P_12/sqrt(P_11 P_22), fixed maximum sides
bar h_i=alpha/sqrt(P_ii), and bar D=diag(bar h_i). For each sign pair
epsilon in {-1,1}^2 put delta_epsilon=bar D epsilon/2. Square completion gives

\[
 p(c)e^{M_C}\le
 e^{\alpha^2(1+|\rho|)/2}
 \sum_{\varepsilon\in\{-1,1\}^2}p_{\mu+\delta_\varepsilon,\Sigma}(c).
 \tag{4}
\]

Indeed the linear part in (2) is at most
sum_i bar h_i |[P(c-mu)]_i|/2, whose exponential is bounded by the sum
over four signs. The quadratic part is at most
q_*=alpha^2(1+|rho|)/4. Shifting a Gaussian by delta_epsilon contributes
the additional exponent epsilon^T bar D P bar D epsilon/8<=q_*.
Thus the total exponent is 2q_*. Fixed maximum sides make the four shifted
means identical for all cells, even when the actual rectangles vary.

For any smooth Gaussian density f, the midpoint identity on one rectangle
implies

\[
 |C|f(c)\le\int_C f+
 \frac{h_1}{2}\int_C|\partial_1f|
 +\frac{h_2}{2}\int_C|\partial_2f|
 +\frac{h_1h_2}{4}\int_C|\partial_{12}f|.
 \tag{5}
\]

To prove it, write each one-dimensional midpoint functional as integral
plus error. Its error is integral of f' against a kernel bounded by h_i/2.
Expanding the product gives the two first derivatives and the mixed
derivative with their displayed factors. Summing over disjoint rectangles
and replacing h_i by bar h_i bounds these integrals by their global norms.

For every shifted Gaussian appearing in (4),

\[
 \|\partial_i f\|_1=\sqrt{2/\pi}\sqrt{P_{ii}},\qquad
 \|\partial_{12}f\|_1\le\sqrt{P_{11}P_{22}+P_{12}^2}.
\]

For the second bound, Y=P(X-mean) is centered Gaussian with covariance P;
the derivative factor is Y_1Y_2-P_12, whose second moment is
P_11 P_22+P_12^2. Cauchy-Schwarz supplies its first absolute moment.
Combining (4)-(5) proves the global amplification bound

\[
 \mathcal A:=\sum_C|C|B_C\le C_{\alpha,\rho}:=
 4e^{\alpha^2(1+|\rho|)/2}
 \left[1+\alpha\sqrt{2/\pi}
 +\frac{\alpha^2}{4}\sqrt{1+\rho^2}\right].
 \tag{6}
\]

In particular C_1,rho<24, uniformly over all nonsingular correlations.
This constant is independent of degree, reach and the number of cells.
It does not imply that their required side lengths or count are uniform.

## 4. Reach, exact Gaussian tail and polynomial degree

Retain whole cells covering the Mahalanobis ball
E_R={(x-mu)^T P(x-mu)<=R^2}. For a retained cell intersecting E_R, put
r_C=sqrt(K_11+K_22+2|K_12|)/2, its largest center-to-corner Mahalanobis
radius. Then ||c-mu||_P<=R+r_C. The linear term in (2) is at most
r_C ||c-mu||_P, and its quadratic term is r_C^2/2. Consequently

\[
 M_C\le Rr_C+\tfrac32r_C^2\le M_*:=\alpha R+\tfrac32\alpha^2.
 \tag{7}
\]

Here r_C<=alpha follows from the side constraints and |rho|<1. The
two-dimensional Gaussian tail outside E_R is exactly exp(-R^2/2).
Since F lies in [0,1], integrating it against the local polynomials and
zero outside the retained cells has analytic error at most

\[
 e^{-R^2/2}+C_{\alpha,\rho}\frac{M_*^N}{N!},\qquad N=n+1.
 \tag{8}
\]

For 0<epsilon<1, choose R=sqrt(2 log(2/epsilon)) and integer
N>=ceil max{1,2eM_*,log_2(2C_alpha,rho/epsilon)}. The inequality
N!>=(N/e)^N makes (8) at most epsilon. This is an analytic allowance;
source-moment, coefficient and final arithmetic errors must be added.
No cell violating the side constraints inherits this polynomial bound.

## 5. Exact source moments and maximum-norm propagation

For a source-compatible cell with suffix depth l, define

\[
 V_{ij}^{(l)}(s)=(J+1)^2\int_{[0,1]^2}
 B_i^J(u_1)B_j^J(u_2)f_{s,l}(u)\,du,\qquad 0\le V_{ij}^{(l)}\le1.
\]

Let R_d;iq be the nonnegative Bernstein coefficients of
B_i^J((d+t)/b). The exact recurrence is

\[
 V_{ij}^{(l)}(s)=b^{-2}\sum_{d,e=0}^{b-1}\sum_{q,r=0}^J
 R_{d;iq}R_{e;jr}V_{qr}^{(l-1)}(T_{de}(s)),\qquad V_{ij}^{(0)}(s)=g_s.
 \tag{9}
\]

Because b^(-1)sum_d,q R_d;iq=1, this augmented recurrence is row-stochastic.
It has S(J+1)^2 components. Applying it directly costs
O(b^2 S(J+1)^4) arithmetic per level with supplied subdivision coefficients;
coefficient preparation, depth handling and numerical precision are extra.

The polynomial cell integral is exactly
|C| sum_i,j beta_C,ij V_ij(s_C)/(J+1)^2. If all queried V values have
certified absolute error at most eta, (3) and (6) bound the GLOBAL moment
error by C_alpha,rho eta, without a factor of J or cell count. If also
max_i,j |beta_hat-beta|<=zeta B_C on each cell, their combined contribution
is at most C_alpha,rho[eta+zeta(1+eta)]. Keeping approximate moments in
[0,1] improves this to C_alpha,rho(eta+zeta); clipping to that known range
does not increase their error. Neither statement certifies a floating
implementation, subdivision table, source recognition or final reduction.

## 6. Cell count and the fixed-aspect limitation

The following count is for a UNIFORM rectangular grid of sides h_1,h_2.
Let sigma_i=sqrt(Sigma_ii) and count cells intersecting E_R. Their disjoint
union is contained in E_R+[-h_1,h_1]x[-h_2,h_2]. Adding a horizontal
segment increases a convex set's area by its vertical width times the
segment length; adding a vertical segment then does the analogous thing.
The ellipse has area pi R^2 sqrt(det Sigma) and widths 2R sigma_i. Thus

\[
 K_{\rm cells}\le
 \frac{\pi R^2\sqrt{\det\Sigma}}{h_1h_2}
 +4R\left(\frac{\sigma_1}{h_1}+\frac{\sigma_2}{h_2}\right)+4.
 \tag{10}
\]

Adaptive rectangles have the amplification bound (6), but do not inherit
this uniform-grid count without a separate counting argument. A fixed-aspect
b-adic source also cannot independently maximize both allowable side lengths.
For square cells and Sigma=diag(L^2,1), L>=1, the side condition forces
h<=alpha. Any such cells covering E_R require at least
pi R^2 L/alpha^2 cells, by area alone: this covering can retain a square-root
condition-number dependence. This is not a lower bound for every filtering
algorithm; periodic aggregation or another structural reduction may help.

At source leaves the pattern is constant, so Gaussian rectangle masses
give an alternative exact source query. For correlated Sigma those masses
are generally bivariate normal CDF queries, not products of marginal masses.
Their computation and the number of leaves must be priced. A constant
depth-zero source is handled directly. General visibility, shading factors,
continuous-output machines and nonlinear geometry are outside this note's
source contract. The result is a two-dimensional kernel and error-propagation
lemma, not a complete 2-D arithmetic certificate or a GPU performance claim.
