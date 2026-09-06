# Projective footprint transport with a material-independent error bound

2026-09-06. Theory only; no implementation or benchmark was run for this
note. The group/domain argument and the first two constants were reviewed
independently. Bridge messages 244 and 246 carry the initial exchange.

The useful change is to approximate the **filtering measure** while keeping
the entire composed material as one observable. A small pointwise error in
a count can cross many thresholds. A small total-variation error in its
joint measure instead controls every bounded material of that state,
including discontinuous and highly oscillatory ones.

Local affine perspective filtering and density transport are established
ideas. This note specializes them to a projective Gaussian group with an
explicit uniform remainder and a compact finite correction family. It
does not establish priority or inexpensive integration of arbitrary
material graphs.

## 1. The shared projective state

Whiten the actual Gaussian screen footprint so that Z is standard normal
in d dimensions. A vector of linear-fractional coordinates with a common
denominator can be written

\[
 T(Z)=m+B\frac{Z}{1+k\cdot Z},\qquad T_0(Z)=m+BZ.
 \tag{1}
\]

For original numerators N_0+NZ and denominator D_0+d_0\cdot Z, with
D_0 nonzero, m=N_0/D_0, k=d_0/D_0 and B=N/D_0-mk^T. B can be rectangular
or singular. All nonlinear responses of these coordinates belong inside
the same measurable material F. Its scalar output lies in an interval of
width W. RGB channels can be bounded separately.

The target and affine mean are

\[
 I=\mathbb E F(T(Z)),\qquad I_0=\mathbb E F(T_0(Z)).
\]

This is a statement about the algebraic projective map, defined outside a
Gaussian-null denominator hyperplane. Physical visibility is addressed
separately in section 8.

## 2. A frequency-independent affine certificate

Let phi be the standard Gaussian density and define

\[
 P_s(z)=\frac{z}{1+s k\cdot z},\qquad U_sp=(P_s)_\#p.
\]

These maps form an almost-everywhere group. Their density action is

\[
 (U_sp)(y)=p\!\left(\frac{y}{1-s k\cdot y}\right)
              |1-s k\cdot y|^{-(d+1)}.
 \tag{2}
\]

Every U_s preserves integrals and the L1 norm, including for signed
densities. Its generator is

\[
 Lp=\operatorname{div}[z(k\cdot z)p],\qquad
 L\phi=(k\cdot z)(d+1-|z|^2)\phi.
 \tag{3}
\]

Consequently

\[
 \operatorname{TV}((P_1)_\#\gamma,\gamma)
 \le\min(1,C_d|k|),\qquad
 C_d=\tfrac12\mathbb E[|Z_1|\,|d+1-|Z|^2|].
 \tag{4}
\]

In a two-dimensional footprint,

\[
 \boxed{C_2=\frac{6\sqrt3}{\pi}e^{-3/2}\simeq0.7381,\qquad
 |I-I_0|\le W\min(1,C_2|k|).}
 \tag{5}
\]

Data processing through y -> m+By proves (5) for every B. There is no
factor for carrier frequency, anisotropy of B, number of count maps,
number of primitive thresholds, or material graph depth. This does not
bound the work required to evaluate I_0.

For the underlying projective measure, C_d is asymptotically sharp as
|k| tends to zero: differentiability in L1 makes the difference quotient
converge to Lphi. The affine certificate is generally first order; a
uniform second-order guarantee requires a correction or additional
observable structure.

## 3. Why the pole does not invalidate the proof

For compact smooth p and sufficiently small |s|, the support avoids the
pole. Differentiation in L1 gives (3). Such functions are dense in L1;
their strong continuity and the isometry establish strong continuity of
U_s on all L1.

Let chi_R be a smooth cutoff, one on the radius-R ball, zero outside the
radius-2R ball, with gradient O(1/R). Then chi_R phi -> phi in L1 and

\[
 L(\chi_R\phi)=\chi_R L\phi
       +z(k\cdot z)\cdot\nabla\chi_R\,\phi\longrightarrow L\phi
\]

in L1. The additional term is a polynomial times a vanishing Gaussian
annular tail. Closedness of the generator therefore puts phi in its
domain. The same argument works for every polynomial times phi.

The integral identity

\[
 U_1\phi-\phi=\int_0^1 U_sL\phi\,ds
\]

and the L1 isometry prove (4). In d=2, polar integration gives

\[
 C_2=\frac1\pi\int_0^\infty r^2|3-r^2|e^{-r^2/2}\,dr
     =\frac{6\sqrt3}{\pi}e^{-3/2},
\]

using the derivative of r^3 exp(-r^2/2).

No Gaussian support cutoff or finite KL divergence is assumed. In fact,
the untruncated projective law generally has divergent first absolute
moments; its denominator singularity rules out treating this derivation
as ordinary exact mean/covariance matching of that law.

## 4. One signed correction gives a quadratic error bound

Approximate U_1 phi by phi+Lphi, and define

\[
 I_1=\mathbb E\left[F(m+BZ)
       \{1+(k\cdot Z)(d+1-|Z|^2)\}\right].
 \tag{6}
\]

The weighted density has mass one but can be negative. It is a mean
integration formula, not a positive footprint, probability sampler or
replacement point predictor.

Direct differentiation gives

\[
 L^2\phi=(k\cdot z)^2
 [|z|^4-(2d+5)|z|^2+(d+1)(d+2)]\phi.
 \tag{7}
\]

The second-order integral remainder gives

\[
 \|U_1\phi-\phi-L\phi\|_1\le\tfrac12\|L^2\phi\|_1.
\]

Both densities have total mass one. Centering F at its range midpoint
therefore yields

\[
 \boxed{|I-I_1|\le\frac W4\|L^2\phi\|_1.}
 \tag{8}
\]

In d=2, put a=(9-sqrt(33))/2 and b=(9+sqrt(33))/2. Then

\[
 |I-I_1|\le W K_2 |k|^2,\qquad
K_2=\frac14[u^2(u-3)e^{-u/2}]_a^b\simeq1.8920950773.
 \tag{9}
\]

Indeed the expectation in (7), after factoring out |k|^2, is
(1/4) int_0^infinity u |u^2-9u+12| exp(-u/2) du. Its signed integral
vanishes. Splitting at a,b and using the antiderivative
-2u^2(u-3)exp(-u/2) gives the bracket in (9).

This result does **not** establish the same bound for the different
positive surrogate Q(Z)=Z(1-k\cdot Z). That map folds; section 5 provides
a separate proof with a different constant. Expanding a density and
expanding point coordinates are distinct approximations.

## 5. The actual quadratic coordinate surrogate has a global bound too

For d=2, define Q_k(z)=z(1-k dot z). Then

\[
 \boxed{\operatorname{TV}((P_k)_\#\gamma,(Q_k)_\#\gamma)
       \le\min(1,5|k|^2).}
 \tag{10}
\]

Here P_k means P_1 with parameter k. Data processing gives, for the
whole bounded shared-state material,

\[
 \left|\mathbb E F(m+BP_k(Z))-
              \mathbb E F(m+BQ_k(Z))\right|
       \le W\min(1,5|k|^2).
 \tag{11}
\]

This is the positive pushforward of the actual quadratic coordinate
model, with F evaluated on that model without further approximation.
It is distinct from the signed density in (6). Constant 5 is conservative.

Proof: k=0 is exact. Otherwise apply the almost-everywhere bijection
P_{-k} to both measures. Its denominator at Q_k(z) is
1-t+t^2>=3/4, with t=k dot z, so that composition has no pole. We obtain
the equivalent comparison of gamma with R_#gamma, where

\[
 R(z)=z\frac{1-t}{f(t)},\qquad f(t)=1-t+t^2.
\]

Restrict first to E={t<1/2}. The transverse scaling
a(t)=(1-t)/f(t) lies in (0,1], and the axial coordinate transforms by

\[
 h(t)=\frac{t(1-t)}{f(t)},\qquad h'(t)=\frac{1-2t}{f(t)^2}>0.
\]

Thus R is a diffeomorphism of E onto the slab
{-1<k dot y<1/3}, contained in E. It contracts Euclidean radii. Also
h'<=1, because f(t)^2-(1-2t)=t^2[(t-1)^2+2]>=0. Its Jacobian is

\[
 0<J(t)=a(t)h'(t)=\frac{(1-t)(1-2t)}{f(t)^3}\le1.
\]

For the equal-mass subprobabilities mu=gamma restricted to E and
nu=R_#mu, integrate the positive part of nu-mu and change variables:

\[
 \operatorname{TV}(\mu,\nu)
 =\int_E[\phi(z)-J(t)\phi(Rz)]_+\,dz
 \le\int_E(1-J(t))\phi(z)\,dz.
\]

The last inequality uses the radial contraction phi(Rz)>=phi(z).
The required algebraic bound is

\[
 5t^2-(1-J(t))=
 \frac{t^2}{f(t)^3}
 \left[(1-2t)^4+t^4(5t^2-15t+13)\right]\ge0,
\]

since 5t^2-15t+13=5(t-3/2)^2+7/4. The remainder of the measure has
mass P(t>=1/2), so the triangle inequality gives

\[
 \operatorname{TV}(\gamma,R_\#\gamma)
 \le5\mathbb E[t^2\mathbf1_E]+\Pr(E^c)
 \le5\mathbb E t^2=5|k|^2.
\]

On E^c we used 1<=4t^2<=5t^2. The folding region is therefore charged
without leaving an additional Gaussian tail term in (10). Physical
visibility remains a separate issue. This proof gives no claim that the
quadratic material mean is inexpensive, and it does not certify a further
Taylor expansion of nonlinear F inside that mean.

## 6. A compact finite hierarchy

Set t=|z|^2. For every integer j>=0,

\[
 L^j\phi=(k\cdot z)^j p_j(t)\phi,\qquad p_0(t)=1,
\]
\[
 p_{j+1}(t)=(d+1+j-t)p_j(t)+2t p'_j(t).
 \tag{12}
\]

Thus p_j has degree j, and each generator image remains a polynomial
times the Gaussian. The cutoff proof puts phi in the domain of every
finite power needed below. Define

\[
 \rho_p=\sum_{j=0}^p\frac{L^j\phi}{j!},\qquad
 I_p=\int F(m+Bz)\rho_p(z)\,dz.
\]

The semigroup Taylor formula gives

\[
 U_1\phi-\rho_p=
 \frac1{p!}\int_0^1(1-s)^pU_sL^{p+1}\phi\,ds,
\]

and hence

\[
 \boxed{|I-I_p|\le
 \frac{W}{2(p+1)!}\|L^{p+1}\phi\|_1
 =\frac{W|k|^{p+1}}{2(p+1)!}
 \mathbb E[|Z_1|^{p+1}|p_{p+1}(|Z|^2)|].}
 \tag{13}
\]

The constants depend on d and p, not on F or B. This is a finite-order
remainder; convergence of an infinite series or improvement at every
successive order is not asserted.

When k=0, I=I_0 exactly and no corrections are needed. For k nonzero,
with e=k/|k|, a direct implementation would request weighted material
moments

\[
 \mathbb E[F(m+BZ)(e\cdot Z)^j|Z|^{2l}],
 \qquad 0\le l\le j\le p.
\]

There are at most (p+1)(p+2)/2 such queries. They are moments of the
material against the ordinary Gaussian, not moments of the exact
projective law. Their formation, conditioning and numerical errors are
paid separately. Expanding into unrestricted multivariate polynomial
tensors is unnecessary for this geometry.

For the first correction, an equivalent response-derivative formula is
available. Define G(v)=E F(m+B(v+Z)). Gaussian convolution makes G smooth
even for bounded discontinuous F. Gaussian integration by parts yields

\[
 I_1=G(0)-(k\cdot\nabla_v)(1+\Delta_v)G(0).
 \tag{14}
\]

This differentiates the filtered response, not the discontinuous source.
It requires derivatives with B and the footprint fixed; ordinary
neighboring screen pixels generally do not supply those derivatives.
For an affine Fourier character with whitened rate q, the correction
multiplies its Gaussian response by

\[
 1+i(k\cdot q)(|q|^2-1).
\]

This illustrates finite per-character algebra. It gives neither a bound
on retained characters nor a free numerical differentiation scheme.
In particular, a spectral tail certificate must include this cubic
polynomial factor; a cutoff proved only for the affine Gaussian does not
automatically certify the corrected sum.

For a single unit-normal half-plane n dot Z <= c, integrating out the
orthogonal coordinates gives the first corrected mean

\[
 \Phi(c)+(k\cdot n)c^2\phi_1(c),
\]

where phi_1 is the one-dimensional standard Gaussian density. The
correction follows from integrating (2u-u^3)phi_1(u), the derivative of
u^2 phi_1(u). Joint masks still need their joint integral; products of
these individual means are not generally valid.

For a torus material with period 2pi in each coordinate and B of full
row rank, let q_n=B^T n. Retain a symmetric finite set N containing zero.
Parseval and Cauchy-Schwarz on the periodized signed density give the
complete first-correction truncation bound

\[
 |I_1-I_{1,N}|\le\frac W2
 \sqrt{\sum_{n\notin N}e^{-|q_n|^2}
 [1+(k\cdot q_n)^2(|q_n|^2-1)^2]}.
 \tag{15}
\]

Normalized Haar measure is used. Centering F at its range midpoint
gives the factor W/2. Full row rank makes the density and this squared
series integrable; a singular torus measure needs its own quotient or
trace analysis. Small individual multipliers alone do not certify (15).

A conservative transfer to a Gaussian lattice-tail theorem is available.
For 0<alpha<1, gamma=1-alpha, put

\[
 A=1+|k|\left[\left(\frac3{\gamma e}\right)^{3/2}
                  +\left(\frac1{\gamma e}\right)^{1/2}\right].
\]

The corrected multiplier obeys |chi_1(q)|<=A exp(-alpha |q|^2/2).
To see this, use sqrt(u)|u-1|<=u^(3/2)+u^(1/2), and maximize each power
times exp(-gamma u/2). Thus the squared tail in (15) is bounded by
A^2 sum_{n outside N} exp(-alpha |q_n|^2), with the same omitted set.
Any already proved bound for that full Gaussian lattice sum can be used.
This does not turn a per-term cutoff radius or its ellipse area into a
certified error or lattice-count ratio.

## 7. How this fits the exact predictor and temporal residual

Keep the original point predictor a in the sampled residual f-a. Only
its mean is approximated by I_p. If the numerical mean evaluation has
error epsilon_num, the mean-model contribution is bounded by (13) plus
epsilon_num and any separately required visibility/geometry allowances.
The residual's correlation with f is unchanged by this choice of mean
oracle.

Nonlinear material composition is covered by applying the formula to the
whole bounded F. Separately evaluating two means and multiplying them
still discards correlation. A nonlinear response applied after averaging
is not automatically the same target as including it inside F.

Signed intermediate integrals can exceed the material range. Clamping
the final scalar answer to a known interval containing the true mean
cannot increase its absolute error. Such clamping does not turn the
internal signed density into a composable positive probability law.

## 8. Shared state, visibility, and numerical scope

- F must be the same function of the transported state in both means.
  Noise, thresholds and arbitrary bounded nonlinear composition within
  that state are allowed. An unchanged independent screen-space lighting
  or visibility variable cannot silently be appended: the two enlarged
  joint laws may lie on different graphs and have TV distance one.
  Shading that is a genuine function of the same surface state and fixed
  uniforms may be included, provided the mean query evaluates it that way.
- With a positive center denominator, the physical negative-denominator
  event has Gaussian probability Phi(-1/|k|). If the algebraic continuation
  differs from the physical source by at most B_vis there, charge
  B_vis Phi(-1/|k|) separately (zero when k=0). Other silhouettes or depth layers need
  their actual correlated treatment. D_0=0 is outside normalization (1).
- B singular is allowed by data processing. If B=0, the material state
  is constant and the algebraic mean is exact, regardless of the
  conservative bound. Physical visibility may still vary.
- The theorem uses the specified Gaussian footprint in linear output
  units. Other reconstruction filters, nonlinear display transforms and
  temporal histories require their own stated contracts.
- The bounds are in real arithmetic. Constructing k and B, evaluating
  polynomial moments and special functions, coefficient cancellation,
  truncating any spectral representation and transporting any additional
  state all require separate numerical allowances. Large range W can
  make a uniform HDR bound uninformative.

## 9. Prior art and the remaining computational question

[Ren, Pfister and Zwicker, Object Space EWA Surface Splatting (2002),
section 3](https://www.cs.umd.edu/~zwicker/publications/ObjectSpaceEWASplatting-CGF02.pdf)
explicitly uses the center-Jacobian affine approximation of a projective
map and Gaussian closure. This note does not introduce that approximation.

[Zwicker et al., Perspective Accurate Splatting (2004), sections 1 and
4.4](https://www.cs.umd.edu/~zwicker/publications/PerspectiveAccurateSplatting-GI04.pdf)
matches the projected cutoff contour while retaining an affine Gaussian
interior kernel. Exact conic support and exact transported density are
different obligations.

Density pushforward and the Liouville generator are classical; see
[Buzhardt and Tallapragada, Controlled density transport using Perron
Frobenius generators, section II](https://jbuzhar.github.io/files/cdc2023_bt.pdf).
The integral identity and Taylor remainder follow from standard semigroup
differentiation, as in [Engel and Nagel, A Short Course on Operator
Semigroups, chapter II, lemma 1.3](https://www.math.uni-tuebingen.de/de/forschung/agfa/members/a_short_course_on_operator_semigroups-1.pdf).
The projective pole/domain argument, explicit constants and axial/radial
specialization are the derivations recorded here. This limited review
does not establish novelty against all density-approximation literature.

The organizing question is now concrete: **which material representations
make these few weighted affine-Gaussian queries inexpensive, with stable
error bounds?** The geometry certificate is shared across the composed
material. The cost of material integration has not disappeared. A useful
next theory result would bound that cost for an expressive family, or
show how a common prepared material representation answers all of these
queries with small additional work. This note supplies no measured GPU
speedup and no general real-time algorithm.
