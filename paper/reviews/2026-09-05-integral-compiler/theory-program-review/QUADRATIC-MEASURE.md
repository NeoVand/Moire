# Quadratic maps: a shared-chart Gaussian measure certificate

2026-09-06. Theory only; no implementation, experiment or timing result.
The bounds below concern the actual quadratic map, including its possible
folds outside a controlled ball. They do not replace that map by a complete
flow. Density transport, Gaussian integration by parts and polynomial
density corrections are established mechanisms; no novelty claim is made.

This extends the measure-first question in [PROJECTIVE-DENSITY.md](PROJECTIVE-DENSITY.md).
The projective result exploits a special group and has better constants.
Here a local Euler interpolation supplies explicit, conservative constants
for a general homogeneous quadratic perturbation in two screen dimensions.

## 1. Actual map and common state

Let Z have the standard Gaussian law gamma on R^2, with density
phi(z)=(2 pi)^(-1) exp(-|z|^2/2). Assume

\[
 Q(z)=z+u(z),\qquad u(z)=\tfrac12 H[z,z],\qquad
 \eta=\sup_{|v|=|w|=1}|H[v,w]|,
 \tag{1}
\]

where H is a symmetric bilinear map from R^2 x R^2 to R^2. Constant and
linear terms belong in the affine chart, not in u. The compared states are
T(z)=m+BQ(z) and T_0(z)=m+Bz, for the same matrix B and offset m. B may be
rectangular or singular. For a fixed measurable material F taking values
in an interval [c,c+W], put

\[
 \Psi(z)=F(m+Bz),\qquad I=\mathbb E\Psi(Q(Z)),\qquad
 I_0=\mathbb E\Psi(Z).
\]

All correlated nonlinear responses must remain inside the same F. The
theorem does not compare states with additional untransported variables.
When eta=0, Q is the identity and every mean below is exact; no radius
choice or division by eta is needed.

Choose R>0 with eta R<=1/2, and write E={|z|<R}, tau=exp(-R^2/2). Define

\[
 A(z)=z\cdot u(z)-\operatorname{div}u(z),\qquad
 \rho_1(z)=(1+A(z))\phi(z),\qquad
 I_1=\mathbb E[\Psi(Z)(1+A(Z))].
 \tag{2}
\]

The correction is -div(u phi). Its integral is zero, so rho_1 has mass
one, but it can be negative. I_1 is a signed mean formula, not a positive
footprint or replacement point predictor.

## 2. Two explicit certificates

Use TV(mu,nu)=1/2 ||mu-nu||_var for probability measures, where ||.||_var
is the total mass of the absolute signed measure. For densities this
variation norm is the L1 norm. The first certificate is

\[
 \boxed{\operatorname{TV}(Q_\#\gamma,\gamma)
 \le\min\left(1,\tfrac12\mathbb E|A(Z)|+6\eta^2
       +\tau[1+\eta R^3/2]\right).}
 \tag{3}
\]

Multiply its right side by W to bound |I-I_0|. A simpler leading bound is
(1/2) E|A(Z)| <= (7/4) sqrt(pi/2) eta. The first term in (3), however,
retains the actual Gaussian-weighted divergence instead of this envelope.

The signed correction has the second-order certificate

\[
 \boxed{\|Q_\#\gamma-\rho_1\,dz\|_{\rm var}
 \le64\eta^2+\tau\left[
 2+\eta\left(\tfrac32R^3+\tfrac72R+\tfrac7{2R}\right)
 +\eta^2\left(\tfrac14R^6+R^4\right)\right].}
 \tag{4}
\]

Both measures have mass one. Centering Psi at c+W/2 therefore gives
|I-I_1| <= W/2 times the right side of (4). No positivity of rho_1 is used.
For eta>0, choosing R=1/(2 eta) gives an explicit O(eta^2) remainder plus
exp(-1/(8 eta^2)) times a polynomial in eta and eta^(-1). This is an
asymptotic statement with the displayed constants, not a useful-error
claim at every curvature. Integrating I_0 or I_1 remains separate work.

## 3. A local transport identity, not a quadratic flow

For 0<=s<=1 let Q_s(z)=z+s u(z), J_s=I+s Du(z), and w_s=J_s^(-1)u(z).
On the convex ball E, ||Du||<=eta R<=1/2. Consequently Q_s is injective
there, its derivative is invertible, and ||J_s^(-1)||<=2. This follows
directly from |Q_s(x)-Q_s(y)| >= (1-eta R)|x-y|. No assertion is made
about global injectivity of Q_s.

For a smooth density b restricted to E and f in C_c^infinity, the chain
rule and integration by parts yield

\[
 \frac d{ds}\int_E f(Q_s z)b(z)\,dz
 =-\int_E f(Q_s z)\operatorname{div}(b w_s)\,dz
   +\int_{\partial E}f(Q_s z)b\,w_s\cdot n\,dS.
 \tag{5}
\]

Indeed grad_z f(Q_s z)=J_s^T grad f(Q_s z), so its dot product with w_s
is grad f(Q_s z) dot u. Integrating (5) gives the corresponding signed
measure identity. All time integrals are weak integrals, equivalently
pushforwards of finite measures on time x space. A moving boundary is
not asserted to be strongly differentiable in variation norm.

The resulting inequalities for smooth tests bound the variation norm of
a finite Radon measure: compact smooth tests suffice by regularity and
uniform density in C_0. The variation-norm inequality then applies to
every bounded Borel test, including discontinuous material graphs.

## 4. The interior constants 24 and 104

For r=|z|<=R, the bilinear norm gives

\[
 |u|\le\tfrac12\eta r^2,\quad \|Du\|\le\eta r,\quad
 \|D^2u(v,\cdot)\|\le\eta|v|,\quad |w_s|\le\eta r^2.
\]

Also w_s-u=-s J_s^(-1)Du u, hence |w_s-u|<=s eta^2 r^3. Differentiating,

\[
 Dw_s=J_s^{-1}Du-sJ_s^{-1}D^2u(w_s,\cdot).
\]

Since |tr M|<=2 ||M|| and ||J_s^(-1)-I||<=2s eta r,

\[
 |\operatorname{div}(w_s-u)|
 \le4s\eta^2r^2+4s\eta^2r^2=8s\eta^2r^2.
\]

It follows that

\[
 |\operatorname{div}[\phi(w_s-u)]|
 \le s\eta^2(8r^2+r^4)\phi,\qquad
 \int_E|\operatorname{div}[\phi(w_s-u)]|\le24s\eta^2.
 \tag{6}
\]

The last step uses E r^2=2 and E r^4=8. Similarly,
|div w_s|<=4 eta r+4s eta^2r^2<=6 eta r, so
|div(phi w_s)|<=eta(6r+r^3)phi. The scalar A in (2) obeys

\[
 |A|\le\eta(\tfrac12r^3+2r),\qquad
 |\nabla A|\le\eta(\tfrac32r^2+2).
\]

Here grad A=u+(Du)^T z-grad div u and |grad div u|<=2 eta. Write a=A phi.
Using div(a w_s)=phi grad A dot w_s+A div(phi w_s),

\[
 |\operatorname{div}(a w_s)|
 \le\eta^2\phi\left[\tfrac12r^6+\tfrac{13}2r^4+14r^2\right],
 \qquad \int_E|\operatorname{div}(a w_s)|\le104\eta^2.
 \tag{7}
\]

The contributions are 24+52+28, using E r^6=48. Integrating (6) over
s in [0,1] gives 12 eta^2. Integrating (7) over 0<=t<=s<=1 gives
52 eta^2. These are the two interior terms in the 64 eta^2 remainder.

## 5. Remainder assembly and every boundary term

Let mu=phi 1_E dz, a_E=a 1_E dz, and a_s=-div(phi w_s). Formula (5)
with b=phi, followed by subtraction of a_E, splits the interior into

\[
 \int_0^1(Q_s)_\#[(a_s-a)1_E\,dz]ds
 +\int_0^1[(Q_s)_\#a_E-a_E]ds.
 \tag{8}
\]

There is also the boundary flux from (5). The first integral in (8) is
bounded by 12 eta^2 using (6). Apply (5) again with b=a to the second;
its interior is bounded by 52 eta^2 using (7). Pushforward never
increases the variation norm, so no further Jacobian factor is needed.

On the circle, int_(boundary E) phi dS=R tau. Uniformly in s,

\[
 B_\phi:=\int_{\partial E}\phi|w_s\cdot n|\,dS
 \le\eta R^3\tau,
\]
\[
 B_a:=\int_{\partial E}|a|\,|w_s\cdot n|\,dS
 \le\eta^2(\tfrac12R^6+2R^4)\tau.
 \tag{9}
\]

The first boundary term is integrated once, contributing at most B_phi.
The second is integrated over the time triangle, contributing B_a/2.

The full-space remainder additionally contains
Q_#(gamma restricted to E^c)-gamma restricted to E^c-a 1_(E^c) dz.
Its variation norm is at most 2 tau+int_(E^c)|a|. For the Rayleigh radius,
put T_j=E[r^j 1_(r>R)]. Integration by parts and the Gaussian tail bound give

\[
 T_1\le(R+R^{-1})\tau,\qquad
 T_3=R^3\tau+3T_1\le(R^3+3R+3R^{-1})\tau.
\]

Therefore

\[
 \int_{E^c}|a|\le\eta(\tfrac12T_3+2T_1)
 \le\eta(\tfrac12R^3+\tfrac72R+\tfrac7{2R})\tau.
 \tag{10}
\]

Adding 64 eta^2, B_phi, B_a/2, 2 tau and (10) proves (4). The correction
has zero total mass because a=-div(u phi) and the Gaussian dominates
the polynomial at infinity. Thus the midpoint-centering step is valid.

For (3), use (5) only once with b=phi. Formula (6) bounds the interior by
int_E|a|+12 eta^2; add B_phi and 2 tau, then divide by two. Finally,
E r=sqrt(pi/2), E r^3=3 sqrt(pi/2) give the simpler leading bound in section 2.

## 6. What the shared-chart assumption excludes

Arbitrarily small curvature in a new state direction defeats any such
material-uniform continuity statement. For example,

\[
 T_\epsilon(z)=(z_1,z_2,\epsilon z_1^2),\qquad T_0(z)=(z_1,z_2,0).
\]

Their laws have TV distance one for every epsilon nonzero. The bounded
material 1{third coordinate is nonzero} separates them almost surely;
for epsilon positive, 1{third coordinate>0} also does. Small geometric
distance does not imply small TV between different supporting surfaces.

For a source m+M z+C[z,z]/2, factoring it as m+BQ(z) requires the quadratic
term to lie in the chosen affine chart's range. When M is invertible,
one may take B=M and H=M^(-1)C. The certified eta is then affine-relative
curvature, not the size of C alone; ill-conditioning of M can enlarge it.
A general curved embedding cannot be put into this form by ignoring its
normal components or appending unchanged screen-dependent variables.

These certificates apply to the specified actual quadratic map under
the specified Gaussian. Higher source terms, physical visibility,
additional state, source-versus-model disagreement and floating-point
evaluation require separate allowances. Real-arithmetic constants do not
certify a numerical implementation. No source-validity or runtime result
for a general material compiler follows.

The remaining computational question is whether a useful material family
admits cheap, stable queries E[Psi(Z)] and E[Psi(Z)A(Z)]. See the separate
[Gabor weighted-moment analysis](GABOR-WEIGHTED-MOMENTS.md) for a proposed
restricted family; it is not needed for this proof. Weighted integration
cost, representation size and numerical error are not eliminated by a
material-uniform geometry certificate.

## 7. Related mathematical and imaging work

Total-variation stability of Gaussian pushforwards is established under
quantitative regularity and nondegeneracy assumptions. For a recent
vector-valued treatment, see [Kosov and Zhukova, Estimates of the total
variation distance between laws of Sobolev mappings on Gaussian spaces,
theorems 6.3-6.4](https://arxiv.org/html/2607.25645v1). Its general estimates
carry Sobolev and Jacobian small-ball data. Those constants and rates are
not imported into the local near-identity argument above.

Gaussian-times-polynomial signed approximations with total-variation
remainders, and moving derivatives onto Hermite weights, also appear in
[Bally and Caramellino, Asymptotic development for the CLT in total
variation distance, theorem 2.7 and section 4.3](https://arxiv.org/html/1407.0896v2).
That result concerns normalized sums of random vectors, rather than this
deterministic quadratic map. The common mechanism is established; the
explicit geometry-specific bounds here require their own proof.

The relation between Hermite image coefficients and derivatives of a
Gaussian-blurred response is classical in imaging as well; see
[Makram-Ebeid and Mory, Scale-Space Image Analysis Based on Hermite
Polynomials Theory, equation 5](https://dev.ipol.im/~reyotero/bib/bib_all/2005_Ebeid_Mory_scalespace_anal_Hermite_polynomial_ijcv.pdf).
An inexpensive material representation for those queries is a separate
computational question. This limited review establishes no priority claim.
