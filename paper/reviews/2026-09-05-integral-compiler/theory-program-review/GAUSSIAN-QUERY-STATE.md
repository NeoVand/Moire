# A bounded-source state for a fixed family of Gaussian queries

September 6, 2026. Theory only: no implementation, benchmark, fixed-float
certificate or GPU-performance claim. Source acquisition and numerical
precision are separate from the query arithmetic proved below.

## 1. Prior identity and the application considered here

Jae Wan Shim's July 2026 preprint, [Parameter-Space Heat Flow, Gaussian
Density Ratios, and Sharp Hermite Truncation Rates](https://arxiv.org/html/2607.07712v1),
gives the exact Gaussian density-ratio norm in [Theorem 6.1](https://arxiv.org/html/2607.07712v1#S6)
and its degree-weighted Hermite energy identity in [Theorem 7.1](https://arxiv.org/html/2607.07712v1#S7).
These are direct prior art for the identities used here. His covariance
defect is our D, mean is our m, and scaling parameter is sqrt(w). No
novelty is claimed for those identities or Hermite expansion. The
application below pairs that known Gaussian query expansion with the
Hermite moments of one fixed bounded material response.

The following bounded-source error, acquisition and numerical contracts
are stated and derived for this application, separately from that paper
summary. They do not identify an arbitrary material's moments for free.

## 2. Whiten one reference, then declare the query patch

Let the fixed measurable source be F_phys:R^d -> [0,1], d>=1. Choose
a reference center mu_ref and covariance Sigma_ref=A A^T>0, with A
invertible. Set

\[
 F(z)=F_{\rm phys}(\mu_{\rm ref}+Az),\qquad \gamma=N(0,I),
 \quad m=A^{-1}(\mu-\mu_{\rm ref}),\quad
 Q=A^{-1}\Sigma A^{-T}=I+D. \tag{1}
\]

Thus E_{N(mu,Sigma)} F_phys equals E_{N(m,Q)} F exactly. Admit only

\[
 D=D^T,\quad \|D\|_{\rm op}\le r<1,\quad \|m\|\le L<\infty;
 \qquad (1-r)I\preceq Q\preceq(1+r)I. \tag{2}
\]

These are relative covariance and center bounds, not world-coordinate
Euclidean bounds independent of the reference. Equivalently,
(1-r)Sigma_ref <= Sigma <= (1+r)Sigma_ref in Loewner order.

For a supplied band 0<Sigma_- <= Sigma <= Sigma_+, one possible
reference is Sigma_ref=(Sigma_-+Sigma_+)/2. In its whitened coordinates,
E=A^{-1}(Sigma_+-Sigma_-)A^{-T}/2 satisfies E>=0 and I-E>0.
Consequently r=||E||_op<1 certifies the covariance part of (2). This is an admissible choice,
not a claim of universal optimality; the center range still needs L.
Changing the reference changes F and its state, with acquisition or
conversion work to be charged. A family approaching singular covariance
or unbounded whitened mean has no uniform constants from (2).

## 3. The fixed source state and exact query pairing

Define moments for all multi-indices using orthonormal probabilists'
Hermites, and store only total degrees through an integer N>=0:

\[
 h_\alpha(z)=\frac{\operatorname{He}_\alpha(z)}{\sqrt{\alpha!}},
 \quad H_\alpha=E_\gamma[Fh_\alpha],\quad
 |\alpha|\le N,\quad K_N=\binom{N+d}{d}. \tag{3}
\]

The state consists of K_N real entries. Bessel's inequality gives the
collective bound

\[
 \sum_{|\alpha|\le N}|H_\alpha|^2\le E_\gamma F^2\le1. \tag{4}
\]

Let R_{m,D}=dN(m,I+D)/d gamma. It is in L2(gamma) under (2).
Its Hermite coefficients and their generating function are

\[
 c_\alpha(m,D)=E_{N(m,I+D)}h_\alpha,\qquad
 e^{m\cdot t+t^TDt/2}
 =\sum_\alpha c_\alpha(m,D)\frac{t^\alpha}{\sqrt{\alpha!}}. \tag{5}
\]

The normalization in (5) matters: these are not unnormalized monomial
coefficients. L2 expansion and Cauchy--Schwarz justify

\[
 I=E_{N(m,I+D)}F=\sum_\alpha H_\alpha c_\alpha,
 \qquad I_N=\sum_{|\alpha|\le N}H_\alpha c_\alpha. \tag{6}
\]

No source smoothness or Fourier bandwidth is assumed. All dependence
already present inside F, including a fixed product, is preserved.

## 4. Exact Gaussian energy and a finite degree selector

Completing the square in R_{m,D}^2 d gamma gives

\[
 S(1;m,D):=\sum_\alpha|c_\alpha|^2
 =\det(I-D^2)^{-1/2}
   \exp\{m^T(I-D)^{-1}m\}. \tag{7}
\]

Indeed the precision of that integral is 2(I+D)^{-1}-I>0;
its determinant factor is det[(I+D)(I-D)]^{-1/2}.
Equation (7) is the norm identity credited in section 1.

Replacing t by sqrt(w)t in (5) shows
c_alpha(sqrt(w)m,wD)=w^{|alpha|/2}c_alpha(m,D). Therefore, for
w>1 with wr<1, the same norm identity gives

\[
 S(w;m,D):=\sum_\alpha w^{|\alpha|}|c_\alpha|^2
 =\det(I-w^2D^2)^{-1/2}
   \exp\{w m^T(I-wD)^{-1}m\}. \tag{8}
\]

This is Shim's Theorem 7.1 with his scaling parameter sqrt(w).
On the whole admitted patch,

\[
 S(w;m,D)\le e^{B_w},\qquad
 B_w=-\frac d2\log(1-w^2r^2)+\frac{wL^2}{1-wr}. \tag{9}
\]

Since omitted degrees are at least N+1,

\[
 |I-I_N|\le\beta\sqrt{S(w;m,D)}\,w^{-(N+1)/2}
 \le\beta\exp\{[B_w-(N+1)\log w]/2\}. \tag{10}
\]

One may take beta=1 using (4). For this real [0,1]-valued source and
N>=0, beta=1/2 is also valid: the omitted source-state energy is at most
Var_gamma(F)<=1/4, because the constant Hermite is retained. This is a
bound on the final scalar pairing, not a claim that the density-ratio
tail itself has acquired an extra factor one half.

For any error allowance epsilon_T>0 and either stated beta, a complete
sufficient selector is

\[
 N=\max\left(0,
 \left\lceil\frac{B_w+2\log(\beta/\epsilon_T)}{\log w}\right\rceil-1
 \right). \tag{11}
\]

The maximum also covers large tolerances. An explicit admissible choice
for every 0<=r<1 is

\[
 w=\frac2{1+r},\qquad
 B_w=-\frac d2\log\frac{(1-r)(1+3r)}{(1+r)^2}
       +\frac{2L^2}{1-r}. \tag{12}
\]

The determinant and mean terms must remain in (11). A root rate alone
does not certify a finite degree. As wr approaches one the prefactor
diverges, and as r approaches one this chosen w approaches one too.
No fixed small coefficient count or fixed bit depth follows.

At fixed d,r,L, the sufficient degree is O(1+log(1/epsilon_T)). If
r=0, (12) remains valid for pure mean shifts. If the query is exactly
m=0,D=0, c_0=1 and all other coefficients vanish: H_0 is exact.
For a known constant source, its constant state also suffices throughout.

## 5. Constructing query coefficients has a priced recurrence

Differentiating (5) yields the normalized recurrence

\[
 c_{\alpha+e_i}=
 \frac{m_i c_\alpha+
       \sum_{j=1}^d D_{ij}\sqrt{\alpha_j}\,c_{\alpha-e_j}}
      {\sqrt{\alpha_i+1}},\qquad c_0=1. \tag{13}
\]

Terms with negative indices are zero. For each nonzero target index,
choose one coordinate with positive entry and use its predecessor;
the right side only needs lower total degrees. Do not compute every
target separately through all its possible predecessors.

Given m,D and indexed multi-indices, (13) costs O(d K_N) arithmetic,
O(K_N) storage, and square roots of integers through N; the final
contraction costs O(K_N). Square-root values can be prepared once.
Enumeration/indexing, input reading and admission are part of setup.
Dense physical-coordinate whitening adds ordinary matrix work, up to
O(d^3) per covariance transformation by direct methods. These counts
describe exact-real arithmetic, not certified floating-point work.

## 6. Numerical error is controlled collectively

Suppose the stored and computed vectors differ from the true retained
vectors by ||delta H||_2<=eta_H and ||delta c||_2<=eta_c. Expanding the
two errors and applying Cauchy--Schwarz gives

\[
 E_{\rm numerical}\le
 \eta_H\sqrt{S(1;m,D)}+\eta_c+\eta_H\eta_c
 +E_{\rm accumulation}. \tag{14}
\]

The patch-wide state amplification is at most

\[
 \kappa_*=(1-r^2)^{-d/4}
          \exp\{L^2/[2(1-r)]\}. \tag{15}
\]

An entrywise allowance eta/sqrt(K_N) suffices for a vector allowance
eta; an allowance eta per entry does not. Bounded vector norms do not
by themselves certify stability of recurrence (13). Cancellation,
roundoff, parameter representation and the final accumulation need
actual error budgets. Coefficient error must be relative to the true
admitted m,D; inaccurate geometry is not covered merely by evaluating
the recurrence accurately at different parameters. Small means have no
relative-error guarantee from this absolute contract.

## 7. Spatial truncation has an N-independent vector bound

Suppose acquisition integrates F only on |z|<=R in reference coordinates,
giving H_alpha^(R)=E_gamma[F 1_{|Z|<=R}h_alpha]. Bessel gives

\[
 \sum_{|\alpha|\le N}|H_\alpha-H_\alpha^{(R)}|^2
 \le E_\gamma[F^2\mathbf1_{|Z|>R}]
 \le P_\gamma(|Z|>R). \tag{16}
\]

In dimension two this probability is e^{-R^2/2}, so the entire vector
error is at most e^{-R^2/4}, independently of N. Its query contribution
is at most kappa_* e^{-R^2/4}. This is a collective Hilbert-space bound,
not separate sup-norm estimates for growing Hermite polynomials.

If finite-domain acquisition adds vector error eta_acq, use
eta_H<=e^{-R^2/4}+eta_acq in (14) for d=2. In other dimensions use
the square root of the corresponding Gaussian radial tail. The physical
cutoff is the reference ellipsoid |A^{-1}(x-mu_ref)|<=R. Quadrature
and source evaluation inside it remain unpriced; (16) does not make
their integrands uniformly bounded independently of degree.
The total response error adds (10) and (14), charging spatial truncation
once through eta_H rather than adding the same contribution twice.

## 8. An explicit polygonal-boundary acquisition oracle

For a specified finite polygonal source, acquisition has a direct price.
This is a Hermite-basis formulation of classical Gaussian boundary
integration. [Formery (1963), sections I--II, V and VII](https://www.numdam.org/item/RSA_1963__11_2_39_0.pdf)
treats polygon probabilities through oriented boundary contributions and
polynomial-weighted moments through integration by parts. The identities
below are derived directly with our normalization; no priority or
floating-point stability claim is made for this formulation.

Work in the whitened plane. Let the compact piecewise-constant source
\(F_W\) have a supplied, finite collection of actual jump segments:

\[
 DF_W=\sum_e J_e n_e\,\mathcal H^1|_e,\qquad
 J_e=F_+-F_-,\quad n_e\text{ points from minus to plus}. \tag{17}
\]

Split segments where their jump changes and combine coincident boundaries
using their net jump. Vertices give no additional atoms in this first
distributional derivative. The boundary of the truncation window is
included as a jump to zero. A whitened square \([-R,R]^2\) contains the
radius-\(R\) disk, has polygonal boundary, and preserves the upper bound
\(e^{-R^2/4}\) in section 7.

For one edge write \(z(u)=a n+u t\), with \(n,t\) orthonormal and
\(u_0\le u\le u_1\), so \(ds=du\). Define

\[
 I_\alpha=\int_{u_0}^{u_1}\gamma(z(u))h_\alpha(z(u))\,du,\qquad
 B_\alpha=[\gamma(z(u))h_\alpha(z(u))]_{u_0}^{u_1}.
\]

The seed is

\[
 I_0=\varphi(a)[\Phi(u_1)-\Phi(u_0)]. \tag{18}
\]

Here \(\gamma(z)=\varphi(z_1)\varphi(z_2)\), and \(\varphi,\Phi\) are the
one-dimensional standard Gaussian density and CDF. The normalized
Hermite identities are

\[
 z_i h_\alpha=\sqrt{\alpha_i+1}h_{\alpha+e_i}
                  +\sqrt{\alpha_i}h_{\alpha-e_i},\qquad
 \partial_i(\gamma h_\alpha)
       =-\sqrt{\alpha_i+1}\gamma h_{\alpha+e_i}.
\]

Put \(v_i=\sqrt{\alpha_i+1}I_{\alpha+e_i}\). Normal multiplication and
tangential differentiation give respectively

\[
 n\cdot v=aI_\alpha-\sum_j n_j\sqrt{\alpha_j}I_{\alpha-e_j}
          =:\mathcal R_\alpha,\qquad
 t\cdot v=-B_\alpha.
\]

Since \(n,t\) form an orthonormal frame,

\[
 I_{\alpha+e_i}
 =\frac{n_i\mathcal R_\alpha-t_iB_\alpha}{\sqrt{\alpha_i+1}}. \tag{19}
\]

Use increasing total degree, choosing one predecessor per target
\(\beta\). Choosing a largest \(\beta_i\) ensures
\(\sqrt{\beta_i}\ge\sqrt{|\beta|/2}\). Endpoint \(\gamma h_\alpha\)
values are also generated by the normalized Hermite recurrence.
Thus all edge integrals through degree \(N\) cost \(O((N+1)^2)\)
arithmetic per edge, including endpoint values; no small tangent component
is a divisor. Exact agreement of different predecessor paths is not a
numerical stability guarantee.

For a nonzero state index, choose any \(i\) with \(\alpha_i>0\).
Distributional integration by parts gives the **positive** jump formula

\[
 H_\alpha(F_W)
 =\frac1{\sqrt{\alpha_i}}\sum_e J_e n_{e,i}I^{(e)}_{\alpha-e_i}.
 \tag{20}
\]

For a single indicator with outward normals, the jump is \(-1\), recovering
the negative outward-normal boundary formula.

The constant state \(H_0\) has a separate probability seed. With
\(V(z)=(\Phi(z_1)\varphi(z_2),0)\), \(\operatorname{div}V=\gamma\);
compact support gives \(H_0=-\sum_eJ_e\int_e n_e\cdot V\,ds\).
Let an edge lie on \(n_1z_1+n_2z_2=a\). For \(n_1\ne0\), put
\(s=\operatorname{sign}(n_1)\), and let \(v_0,v_1\) be the ordered
endpoint \(z_2\) coordinates. Its contribution is

\[
 -J_e s\,[\Phi_2(v_1,sa;sn_2)-\Phi_2(v_0,sa;sn_2)]. \tag{21}
\]

For \(n_1=0\) that contribution is zero. Here \(\Phi_2(x,y;\rho)\)
is the standard bivariate Gaussian CDF of correlation \(\rho\).
To check (21), note \(n_1ds=s\,dz_2\) with coordinates ordered, and use
\(\partial_v\Phi_2(v,sa;sn_2)
=\varphi(v)\Phi((a-n_2v)/n_1)\). This avoids dividing the final edge
contribution by a small \(n_1\). The CDF still approaches a degenerate
correlation when \(n_1\) approaches zero; accurate limiting evaluation
and cancellation of nearby CDF values remain oracle obligations.

With \(E\) supplied net-jump segments, the arithmetic price of (18)--(21)
is \(O(E(N+1)^2)\), plus \(O(E)\) density, univariate-CDF and bivariate-CDF
calls at specified accuracy. The persistent final state has \(K_N\)
entries; edge work can stream. This is an explicit special-function
arithmetic model, not a timing result.

There is a usable error propagation contract. For one edge with exact
geometry, let \(\delta_q\) majorize errors in degree-\(q\) edge integrals,
\(\delta B_{q-1}\) majorize endpoint-difference errors, and \(\tau_q\)
majorize local recurrence arithmetic error. The largest-index rule gives

\[
 \delta_q\le |a|\sqrt{2/q}\,\delta_{q-1}
 +\sqrt{2(q-1)/q}\,\delta_{q-2}
 +\sqrt{2/q}\,\delta B_{q-1}+\tau_q,\qquad q\ge1. \tag{22}
\]

Missing negative orders are zero; seed error supplies \(\delta_0\).
The bound follows from
\(\sum_j|n_j|\sqrt{\alpha_j}\le\sqrt{q-1}\).
It can grow with order and edge distance; there is no fixed-float claim.
Equation (20) then propagates errors with absolute jump weights.
If each \(\Phi_2\) call has absolute error at most \(\xi\), (21)'s total
base-oracle contribution is at most \(2\xi\sum_e|J_e|\), before arithmetic.
Convert the resulting component bounds into an \(\ell^2\) allowance for
section 6. Input geometry, topology, normals and jump uncertainty need
their own certificates; (22) assumes those inputs are exact.

This family is not restricted to two material factors. \(F_W\) may already
be any bounded graph of polygonal masks whose actual cell values and
net-jump segments have been obtained. The cost includes that arrangement
and graph evaluation. A periodic source requires every relevant translated
edge copy in the window, not just its authored-cell edge count. A density
heuristic is not a bound on copies, crossings or patch counts.
Three or more factors are admissible here when they provide this explicit
finite boundary; the general implicit-source acquisition problem remains.

## 9. What the state does and does not replace

[REUSABLE-PAIR-RESPONSE.md](REUSABLE-PAIR-RESPONSE.md), sections 4--5,
aggregates a certified finite output-frequency list into normalized
monomial moments. Its finite band supplies the Taylor remainder and its
coefficient l1 allowance prices amplification. The state here instead
projects the actual fixed bounded source in L2 of a Gaussian reference;
the query density has the explicit L2 norm (7). It requires no output
frequency cutoff, but does not supply a cheaper way to acquire H.

A finite-band source approximation does not automatically provide this
state with the same error allowance. One needs a collective moment
certificate, or a source L2(gamma) error certificate, before using (14).
Accurate means at a few footprints do not supply that certificate.

The source may already contain arbitrary fixed nonlinear composition,
but evaluating its moments is still a potentially difficult integral.
The finite state is not closed under later multiplication, thresholds,
independent layer motion or changes of material controls. Those change
F and require new acquisition or separately proved update machinery.
See the relative-control example in the preceding note's section 7.

Center and covariance queries are reusable only inside the declared
patch. Multiple patches multiply state/acquisition work. Non-Gaussian
footprints and geometry approximations need separate error contracts.
The result is a conditional query representation with explicit error
and arithmetic costs, not a general cheap material compiler.
