# Source geometry controls threshold cost

2026-09-06. Theory only. The explicit coherent-mixture bound and the
conditional elimination rule were independently derived and reviewed.
No implementation, benchmark, fixed-float certificate or GPU timing.
The tools used here are classical; novelty of these combinations is not
established.

[GABOR-THRESHOLD-MOMENTS.md](GABOR-THRESHOLD-MOMENTS.md) prices true
intensity moments and a polynomial threshold sandwich at a supplied
degree. This note connects degree to source parameters for one subclass,
and eliminates a threshold coordinate exactly for another. Both depend
on the geometry of shared source variables, rather than the number of
material expressions alone.

## 1. Contract and the three different questions

Use the finite common-envelope source

\[
 F(X)=\sum_{j=1}^J a_j
 e^{-\frac12(X-c_j)^TA(X-c_j)}e^{i\omega_j^TX},
 \quad A\succ0,\quad X=\mu+DZ,\quad Z\sim N(0,I_2),
 \qquad h(Z)=|F(X)|^2.
\]

The global authored bound is W=(sum_j |a_j|)^2. Zero sources and constant
footprints are evaluated directly. Geometry approximation remains subject
to the common-coordinate contract in
[PROJECTIVE-DENSITY.md](PROJECTIVE-DENSITY.md).

Three questions must stay separate: how much probability lies near a
threshold; how efficiently a polynomial envelope represents its indicator;
and how that envelope is integrated with certified numerical error. A
result for one question does not discharge the other two.

## 2. Positive coherent mixtures have a covariance Hessian

First restrict amplitudes to positive real values after removal of a
single common phase, and require all carriers omega_j to be equal. Atom
centers may differ. Choose c_0 and write

\[
 q(Z)=(\mu+DZ-c_0)^TA(\mu+DZ-c_0),\qquad G=D^TAD,
\]

\[
 d_j=c_j-c_0,\quad v_j=D^TAd_j,\quad
 \beta_j=a_j e^{d_j^TA(\mu-c_0)-\frac12d_j^TAd_j}>0.
\]

The carrier cancels from intensity:

\[
 h(Z)=e^{-q(Z)}\left(\sum_j\beta_j e^{v_j\cdot Z}\right)^2.
\]

For the softmax probabilities pi_j proportional to beta_j exp(v_j dot Z),
the exact identity is

\[
 \nabla^2s(Z)=2G-2\operatorname{Cov}_{\pi(Z)}(v_j),
 \qquad s=-\log h.
 \tag{1}
\]

No atom-pair enumeration is needed to certify a global upper bound on
this covariance. Suppose G is positive definite and all G^(-1/2)v_j fit
inside a ball of radius R_c<1. For every unit direction, variance is at
most the mean square displacement from the containing ball's center,
which is at most R_c^2. Therefore

\[
 \operatorname{Cov}_{\pi}(v_j)\preceq R_c^2G,\qquad
 \nabla^2s\succeq2B,\quad B=(1-R_c^2)G\succ0.
 \tag{2}
\]

Any stronger certified matrix B may replace this sufficient choice.

The center-spread check can be performed once in source coordinates. If
the A^(1/2)c_j lie in a supplied ball of radius R_c<1, every full-column-rank
footprint inherits the bound: G^(-1/2)D^TA^(1/2) has orthonormal rows and
is a contraction. Verifying a supplied ball costs O(J) at fixed dimension;
it need not be the smallest enclosing ball. Per-footprint evaluation then
uses only G and the certified radius.

## 3. Strong convexity gives an explicit intensity-band bound

The following argument applies to any smooth s on R^2 with Hessian at
least 2B for a fixed B positive definite. Strong convexity gives coercivity
and a unique attained minimum z_*. Let y=B^(1/2)(z-z_*). On every ray,

\[
 \frac{d}{dr}s(B^{-1/2}r\theta+z_*)\ge2r.
\]

Between two levels separated by Delta, this implies
r_2(theta)^2-r_1(theta)^2 <= Delta. If the lower level lies below the
minimum, take r_1=0; the same inequality holds. Integrating polar area and
undoing the linear change shows that the log-level shell has area at most

\[
 \frac{\pi\Delta}{\sqrt{\det B}}.
 \tag{3}
\]

Among sets of fixed area, the standard Gaussian gives greatest mass to
the disk centered at zero: exchanging outer points for inner points can
only increase its radially decreasing density integral. A disk of area V
has Gaussian mass 1-exp(-V/(2pi)). Thus, for 0<b<tau,

\[
 P(|h-\tau|\le b)
 \le 1-\exp\left[
 -\frac{\log((\tau+b)/(\tau-b))}{2\sqrt{\det B}}\right].
 \tag{4}
\]

Neither the minimizing point nor its value needs to be computed to use
this conservative bound. Bands crossing the attainable maximum can be
clipped for improvement, but need not be for validity. Bands containing
zero are outside the finite logarithmic-width argument.

For b<=tau/2, a simpler consequence is

\[
 P(|h-\tau|\le b)\le\frac{2b}{\tau\sqrt{\det B}}.
 \tag{5}
\]

This comes from 1-exp(-x)<=x and
log((tau+b)/(tau-b))<=2b/(tau-b).

## 4. A source-parameter-to-degree statement

For the binomial sandwich in the preceding note, the normalized threshold
is a=tau/W in (0,1), the band half-width is b=2Wdelta, and

\[
 E\Delta_{poly}\le P(|h-\tau|\le2W\delta)+3e^{-2n\delta^2}.
\]

Let 0<rho<1 be the desired unweighted sandwich gap, d_B=sqrt(det B), and
choose

\[
 \delta=\min\left\{\frac a4,\frac{1-a}{2},
 \frac{\rho a d_B}{8}\right\},\qquad
 n\ge\left\lceil\frac{\log(6/\rho)}{2\delta^2}\right\rceil.
 \tag{6}
\]

Then b<=tau/2, equation (5) bounds the band by rho/2, and the exponential
term is at most rho/2. Hence E Delta_poly<=rho. The unweighted midpoint
error is at most rho/2 before adding moment and numerical error.

This supplies the missing degree law for this subclass. It can be
combined with the real-arithmetic moment price in the preceding note.
It does not guarantee a small degree: a weak convexity margin, a small
threshold relative to W, or a nearly singular footprint can make (6)
large. Signed correction queries require their separate weighted-gap
bound; (6) is not automatically a signed-error budget.

This is a local positive-threshold law, not a global density supremum
after a change of variable. For the one-atom source h=exp(-a|Z|^2),
f_h(t)=(1/(2a))t^(1/(2a)-1) on (0,1). Under t=sin^2(pi x), the symmetric
circle density behaves like x^(1/a-1) near zero, which is unbounded when
a>1. This source satisfies the coherent-mixture condition with radius
zero. A periodic envelope theorem requiring a global bounded circle
density therefore needs an additional hypothesis or localized tail bound.

## 4a. A localized Selberg bracket improves the degree law

The needed localization follows from the classical finite Selberg/Vaaler
construction. The normalizations are given in
[Akiyama and Tanigawa, equations (4)-(7)](https://publi.math.unideb.hu/paper/940/download/10_5486_PMD_2004_2888.pdf),
and the Vaaler pointwise bound is restated in
[Morgenbesser, equation (4.5)](https://www.impan.pl/shop/en/publication/transaction/download/product/82751).
The following finite formula and localization were independently checked.

Use circle measure dx of total mass one, n=N+1, and

\[
 K_N(x)=\frac1n\left(\frac{\sin(\pi nx)}{\sin(\pi x)}\right)^2,
 \qquad \int K_N=1.
\]

For one arc with endpoints a,b, the Selberg upper and lower polynomials
have one-sided uniform excess 1/n and exact gap

\[
 S^+-S^-=\frac{K_N(x-a)+K_N(x-b)}n.
 \tag{6a}
\]

Continuity makes the bracket cover both interior and exterior endpoint
limits, so open and closed thresholds, including atoms, are bracketed.
For m disjoint arcs, sum the constructions. If a probability density is
at most M within circle distance d of every endpoint, integration of
(6a) there and the bound K_N(x)/n<=1/[n^2 sin^2(pi d)] elsewhere give

\[
 E(S^+-S^-)\le\frac{2mM}{n}
 +\frac{2m}{n^2\sin^2(\pi d)}.
 \tag{6b}
\]

Each one-sided expected error is bounded by mM/n plus the same tail term.
No density bound is required outside those endpoint neighborhoods.

For intensity t=W sin^2(pi x), the threshold t>=tau is the single
symmetric arc [a_tau,1-a_tau], where
a_tau=arcsin(sqrt(tau/W))/pi. The symmetric lifted density is
rho_x(x)=f_h(t(x))|t'(x)|/2. Equation (4), by differentiation of interval
mass, gives f_h(t)<=1/[2t sqrt(det B)] almost everywhere. Hence for
0<d<min(a_tau,1/2-a_tau), one may use

\[
 M=\frac{\pi}{2\sqrt{\det B}}\cot(\pi(a_\tau-d)).
\]

A sufficient choice for unweighted bracket gap at most rho_gap is

\[
 n\ge\left\lceil\max\left\{
 \frac{4M}{\rho_{gap}},
 \frac{2}{\sqrt{\rho_{gap}}\sin(\pi d)}\right\}\right\rceil.
 \tag{6c}
\]

This has linear leading dependence on inverse gap at fixed source
parameters and endpoint distance. An interior intensity band maps to two
reflected arcs and uses m=2. Evenness is necessary for conversion to an
ordinary polynomial in intensity.

For the single threshold arc, that conversion can be written explicitly.
For 1<=k<=N let

\[
 v_k=\pi\frac{k}{n}\left(1-\frac{k}{n}\right)
 \cot(\pi k/n)+\frac{k}{n}.
\]

The finite degree-N algebraic bracket is

\[
 p_N^\pm(t)=1-2a_\tau\ \pm\frac1n
 +\sum_{k=1}^N\left[
 -\frac{2v_k\sin(2\pi k a_\tau)}{\pi k}
 \ \pm\frac2n\left(1-\frac{k}{n}\right)\cos(2\pi k a_\tau)
 \right]T_k(1-2t/W).
 \tag{6d}
\]

This follows by combining the two odd Vaaler terms and the even Fejer
terms for reflected endpoints. It avoids truncating an infinite Beurling
series or a periodization. If the certified sum of absolute coefficient
errors is epsilon_c, |T_k|<=1 on this intensity range gives uniform
polynomial error at most epsilon_c; lower the computed minorant and
raise the majorant accordingly. Expectation errors still need separate
certificates. Stable Chebyshev evaluation is not a substitute for the
missing common-rule quadrature proof. The signed correction remains
subject to its separate midpoint/weighted-gap bound.

## 5. The margin has an exact failure family

Two positive unit-width atoms with amplitudes 1/2 centered at +/-a e_1
give

\[
 h(x,y)=e^{-x^2-y^2-a^2}\cosh^2(ax).
\]

At a=1,

\[
 -\log h=1+y^2+x^4/6+O(x^6).
 \tag{7}
\]

Near the positive maximum, the accepted shell contains a region scaling
like y^2+x^4/6<=constant*b. Its Gaussian probability is Theta(b^(3/4)),
because y scales as b^(1/2), x as b^(1/4), and the Gaussian density is
positive and smooth there. A uniform linear-in-b bound fails.

For a>1 the origin is a nondegenerate saddle of log-intensity. The local
band has b log(1/b) behavior. Conversely, the single atom
h=exp(-|Z|^2/2) has a uniform intensity distribution on (0,1), including
a bounded density at its critical maximum. Critical values need
classification by local geometry; their mere presence implies neither
divergence nor a small degree.

## 6. An exact shared-direction elimination rule

Return to arbitrary complex amplitudes and different frequencies, with
the original common positive-definite envelope. Relative to c_0,omega_0,
the latent relative-rate vectors are

\[
 b_j=D^T[A(c_j-c_0)+i(\omega_j-\omega_0)].
\]

Assume all Re b_j and Im b_j lie in the same real subspace of dimension
at most one. This is a real rank condition; one-dimensional complex span
alone does not imply it. Rotate the original standard Gaussian so its
coordinates (u,v) are independent and all relative rates depend only on u.
Then

\[
 h(u,v)=e^{-[g_{11}u^2+2g_{12}uv+av^2+2\ell_1u+2\ell_2v+c]}
 |S(u)|^2.
\]

Here the real quadratic is the common envelope, with a=G_vv. For a>0,
complete its square in v:

\[
 d(u)=\frac{g_{12}u+\ell_2}{a},\qquad
 A_u=h(u,-d(u)),\qquad
 h(u,v)=A_u e^{-a[v+d(u)]^2}.
 \tag{8}
\]

Evaluating A_u with the original atoms at the ridge costs O(J) and avoids
overflow from separately forming a large relative exponential and a tiny
common envelope. This observation does not itself certify rounding error.

For tau>0, the conditional threshold probability is zero if A_u<tau.
Otherwise put

\[
 s_u=\sqrt{\log(A_u/\tau)/a},\qquad
 l=-d(u)-s_u,\quad r=-d(u)+s_u.
\]

Then

\[
 E_v[1_{h\ge\tau}\mid u]=\Phi(r)-\Phi(l).
 \tag{9}
\]

At equality A_u=tau the interval is a single point, of zero conditional
Gaussian measure. Equation (9) reduces the original two-dimensional mean
exactly to one Gaussian integral in u, without intensity moment expansion
or atom tuples.

The cubic signed projective correction closes as well. Rotate k with the
coordinates and write w=1+(k_u u+k_v v)(3-u^2-v^2). Define truncated moments

\[
 M_0=\Phi(r)-\Phi(l),\quad M_1=\phi(l)-\phi(r),
\]

\[
 M_j=l^{j-1}\phi(l)-r^{j-1}\phi(r)+(j-1)M_{j-2},\quad j\ge2.
\]

Direct integration gives

\[
 E_v[w1_{h\ge\tau}\mid u]
 =[1+k_u u(3-u^2)]M_0+k_v(3-u^2)M_1-k_u uM_2-k_vM_3.
 \tag{10}
\]

If a=0, positive definiteness of the authored A implies De_v=0, hence
g_12=ell_2=0. The source is independent of v. Use its indicator directly,
including ties, and the conditional signed weight 1+k_u u(2-u^2).
Thresholds tau<=0 give the constant-one indicator and are handled directly.

The eliminated coordinate has a fixed analytic cost, but the outer
integral does not automatically do so. A simple A_u=tau crossing produces
a square-root cusp. Two atoms with increasing relative frequency can
create arbitrarily many crossings. No analytic Gauss-Hermite rate for
the outer response follows from the smoothness of the original atoms.

## 7. Exact-source fallbacks and the cost they expose

A finite-order directional certificate is available beyond the preceding
subclasses. In a radius-R_0 Gaussian ball, suppose every slice along a
unit direction e has a cover by at most K intervals, each with
|partial_e^k h|>=lambda>0 for a fixed integer k>=1. Then

\[
 P(|h-\tau|\le b)\le\min\left\{1,
 2\Phi\left(kK(b/\lambda)^{1/k}\right)-1+e^{-R_0^2/2}\right\}.
 \tag{11}
\]

On one interval, k+1 points spaced equally in sublevel-set measure have
ordinary separation at least that spacing. The divided-difference formula
and the derivative lower bound give sublevel length at most
2k(b/lambda)^(1/k). Add lengths across intervals. Among subsets of a line
of that total length, the centered interval maximizes standard Gaussian
mass. Condition on the orthogonal coordinate and add the exact
two-dimensional Gaussian-ball tail.

Checking a supplied certificate can use the true field without atom-pair
enumeration. For f_j restricted to a line, let
ell_j=-(De)^TA(X-c_j)+i(omega_j-omega_0)^TDe and
a_e=(De)^TADe, after removing the common carrier. The derivative factors
obey P_0=1, P_1=ell_j and

\[
 P_{l+1}=\ell_jP_l-l a_eP_{l-1}.
\]

Aggregate F and its derivatives first, then use
h^(k)=sum_l binom(k,l) F^(l) conjugate(F^(k-l)). Certified interval
enclosures over a supplied N-cell cover cost O(N[Jk+k^2]) arithmetic at
fixed dimension. Finding a successful cover, derivative order and lower
bound has no uniform price here. Checking a derivative only at the
center of a cell is insufficient.

For the broader analytic family,
[Brudnyi's 1999 ball theorem](https://arxiv.org/pdf/math/9903199) provides
a Remez bound from complex growth and an interior witness. Apply it to
the true holomorphic H=F Fsharp-tau, Fsharp(z)=conjugate(F(conjugate z)),
not to the non-holomorphic modulus off the real domain. For a real witness
|H(z_*)|>=m>0 in B_R and complex bound sup_{B_C(0,4R)}|H|<=M, its
two-dimensional Gaussian corollary is

\[
 P(|H|\le b)\le e^{-R^2/2}
 +\frac{d(2)R^2}{2}(b/m)^{1/[c(3/2,2)\max(1,\log(M/m))]},
 \quad 0<b<m,
 \tag{12}
\]

capped at one. This uses the theorem's fixed radius ratios, a real-ball
volume bound, and the Gaussian density maximum. The source gives finite
complex-growth bounds, but the paper states c,d through their dependence,
not numerical values ready for a certificate. Equation (12) is a valid
theoretical route, not a priced numerical selector.

The ordinary Turan-Nazarov exponential-polynomial inequality does not
directly handle a positive threshold after dividing out the envelope:
the resulting expression includes tau*exp(quadratic). Applying that
theorem unchanged would alter its source class.

## 8. Numerical obligations and the next organizing question

The separate moment rules in the preceding note use different Gaussian
tilts. Stable evaluation of a Bernstein polynomial at one common node set
does not identify those different quadrature functionals. One atom
x=exp(-aZ^2) makes the distinction exact: every individually tilted moment
is a constant integrand and is exact with one node, yet a common one-node
original-Gaussian rule returns p(1), wrong already for p=x. A common rule
needs its own error proof.

Likewise, a Jackson-kernel tail allowance proportional to 1/(n^3 w^3)
does not vanish if widening is fixed at w=c/n. That construction has a
tail floor even if a short sweep initially resembles a 1/n law. Envelope
feasibility, shrinking integrated gap and numerical evaluation are three
different claims.

The constructive choice is therefore structural: a curvature certificate
can price an envelope, while a shared-direction condition can remove a
threshold coordinate altogether. In both cases, the required assumptions
and the remaining integration cost are visible. The open problem is to
find comparably useful conditions for broader oscillatory mixtures and
correlated material graphs, with source recognition and numerical work
included in the cost.
