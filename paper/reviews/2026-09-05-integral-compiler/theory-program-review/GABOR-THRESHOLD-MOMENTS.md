# True Gabor moments and certified threshold queries

2026-09-06. Theory only; no implementation or benchmark. The moment,
quadrature, envelope and cost arguments below were independently reviewed.
The constructions use classical Gaussian quadrature and moment bounds;
novelty is not established.

This closes a specific gap between
[GABOR-WEIGHTED-MOMENTS.md](GABOR-WEIGHTED-MOMENTS.md) and thresholded
materials. True higher intensity moments have a finite evaluation price
without enumerating atom tuples. They support explicit global polynomial
bounds on a threshold, including a certified error interval. The remaining
unknown is the approximation degree needed for a useful final accuracy.

Geometry and material integration remain separate. The bounded-observable
results in [PROJECTIVE-DENSITY.md](PROJECTIVE-DENSITY.md) already cover
indicators under their shared-coordinate contract. This note prices the
material query under the surrogate Gaussian or polynomially weighted
Gaussian. It does not re-prove the geometry approximation.

## 1. Source, range and target

Let

\[
 F(x)=\sum_{j=1}^J a_j
 e^{-\frac12(x-c_j)^TA(x-c_j)}e^{i\omega_j^Tx},
 \qquad A\succ0,\qquad X=\mu+DZ,\quad Z\sim N(0,I_r).
\]

The list is finite, all atoms share the positive-definite envelope A, and
centers and frequencies are real. Amplitudes may be complex. Define

\[
 h(Z)=|F(\mu+DZ)|^2,\qquad
 S=\sum_j|a_j|,\qquad W=S^2.
 \tag{1}
\]

Then 0 <= h <= W globally. These are original peak amplitudes, not tilted
coefficients. An unbounded periodic image sum is outside this contract.
When W=0, classify the constant field directly. Otherwise write x=h/W.
The main target is E H, H=1_{h>=tau}; a corrected surrogate also queries
E[w(Z)H]. Preserve all latent dimensions when w depends on them, including
directions in the nullspace of D.

A local intensity bound cannot replace W without also controlling the
polynomial outside that region. Normalization by (1) is useful for the
cost proof even when a sharper global range bound is available.

## 2. Each true moment has its own Gaussian tilt

For integer m>=1, choose reference center c_0 and frequency omega_0. Set

\[
 u=\mu-c_0,\quad d_j=c_j-c_0,\quad \nu_j=\omega_j-\omega_0,
 \quad G=D^TAD,
\]

\[
 H_m=(I+2mG)^{-1},\quad C_m=DH_mD^T,\quad L_m=DH_m^{1/2},
 \quad \mu_m=\mu-2mC_mAu.
\]

Absorbing the reference envelope to power 2m gives the normalization

\[
 W_m=\det(I+2mG)^{-1/2}
 \exp[-m u^TAu+2m^2u^TAC_mAu]
 \tag{2}
\]

and the exact latent change

\[
 Z=\zeta_m+H_m^{1/2}Y,\qquad
 \zeta_m=-2mH_mD^TAu,\qquad Y\sim N(0,I_r).
 \tag{3}
\]

Define

\[
 \beta_j^{(m)}=a_j\exp\left[
 d_j^TA(\mu_m-c_0)-\tfrac12d_j^TAd_j+i\nu_j^T\mu_m\right],
 \qquad b_j^{(m)}=L_m^T(Ad_j+i\nu_j).
 \tag{4}
\]

Then

\[
 E h^m=W_m E\left|\sum_j\beta_j^{(m)}e^{b_j^{(m)}\cdot Y}\right|^{2m}.
 \tag{5}
\]

The coefficients in (4) have no extra m factor and no Hermite-normalization
factor. The power is outside the sum. For a weight w(Z), insert
w(zeta_m+H_m^{1/2}Y) in (5).

In particular, h^(m-1) is not a finite polynomial just because a previous
intensity calculation retained finitely many Hermite features. Replacing
the true source by that truncation would require another error proof.
Different m generally use different tilts and evaluations.

## 3. Positive Gauss-Hermite rules give a source-class tail

Let Q_q be the normalized q-node Gauss-Hermite rule for N(0,1), with
positive weights and symmetric nodes. Define

\[
 T_k(\lambda)=P\{\operatorname{Pois}(\lambda)>k\},\qquad
 T_k=1\text{ for }k<0.
\]

For each even monomial,

\[
 0\le Q_qY^{2n}\le EY^{2n},
\]

with equality when n<q. To see the upper bound, interpolate y^(2n) and its
first derivative at the q nodes. The Hermite interpolation remainder has
the sign of its nonnegative 2q-th derivative. Integrating the interpolant
is exact. Odd moments vanish by symmetry.

For the tensor rule, every coordinatewise-even monomial deficit is
nonnegative. A nonzero deficit requires total degree at least 2q. Summing
absolute Taylor coefficients, using Gaussian exponential integrability,
therefore gives, for complex c,

\[
 \left|(E-Q_q^{\otimes r})e^{c\cdot Y}\right|
 \le \sum_{n\ge q}\frac{(\|c\|^2/2)^n}{n!}
 =e^\lambda T_{q-1}(\lambda),\quad \lambda=\|c\|^2/2.
 \tag{6}
\]

There is no extra factor r. Complex norms here use conjugation; the dot
product in the exponential is the ordinary bilinear sum.

In the implicit expansion of (5), every combined exponential rate has
norm at most C=2m max_j ||b_j^(m)||. The absolute coefficient sum is

\[
 A_m=W_m\left(\sum_j|\beta_j^{(m)}|\right)^{2m}.
\]

Consequently the quadrature approximation to the true moment obeys

\[
 |E h^m-\widehat I_{m,q}|
 \le A_m e^{\Lambda_m}T_{q-1}(\Lambda_m),
 \qquad \Lambda_m=2m^2\max_j\|b_j^{(m)}\|^2.
 \tag{7}
\]

The atom tuple expansion appears only in this proof. Evaluation computes
the original J-term sum at q^r nodes and raises its squared magnitude to
m. At fixed latent dimension r, given prepared rules and parameters, the arithmetic work is
O(q^r[J+log(m+1)]). This does not include certified rule construction,
transcendental evaluation error or floating-point error.

## 4. Positive envelopes improve the dependence on moment order

Put u_j=D^TAd_j and v_j=D^Tnu_j. Because A is positive definite,
ker G=ker D and both vectors lie in range G. The spectral decomposition of
G gives, including rank-deficient D,

\[
 \|b_j^{(m)}\|^2
 \le\frac{u_j^TG^+u_j+v_j^TG^+v_j}{2m}.
\]

Thus

\[
 \Lambda_m\le mL,\qquad
 L=\max_j(u_j^TG^+u_j+v_j^TG^+v_j)
 \le\max_j(d_j^TAd_j+\nu_j^TA^{-1}\nu_j).
 \tag{8}
\]

The sharper L is the sum of squared center and frequency offsets projected
onto range(A^(1/2)D), in the corresponding A-scaled coordinates. D=0 can
simply be evaluated as a constant source. Positive definiteness matters:
an unregularized envelope direction can retain quadratic growth in m.

The amplitude prefactor also has a useful bound. For one original atom,

\[
 W_m|\beta_j^{(m)}|^{2m}
 e^{2m^2\|\operatorname{Re}b_j^{(m)}\|^2}
 =E|f_j(X)|^{2m}\le |a_j|^{2m}.
\]

Take 2m-th roots and sum to obtain A_m <= S^(2m). Therefore the
normalized moments E x^m have the prefactor A_m/W^m <= 1.

Using e^lambda T_(q-1)(lambda) <= (e lambda/q)^q for q>=lambda,
a sufficient node count for absolute normalized-moment error epsilon is

\[
 q\ge\left\lceil\max\{1,\ 2e mL,\ \log_2(1/\epsilon)\}\right\rceil.
 \tag{9}
\]

This is a cost depending on phase and envelope spread, with no atom-tuple
factor. It is not uniform over arbitrarily broad spectra. Normalizing a
strongly cancelling source by W can also make its relevant threshold
interval extremely small.

## 5. Fixed polynomial weights

After the moment-dependent change (3), let
w(Y)=sum_beta w_beta Y^beta have degree s. Differentiate the positive
Taylor majorant in (6). For a_i=|c_i| and lambda=||c||^2/2,

\[
 |(E-Q_q^{\otimes r})Y^\beta e^{c\cdot Y}|
 \le e^\lambda\sum_{\ell\le\beta/2}
 \frac{\beta!a^{\beta-2\ell}}
 {(\beta-2\ell)!\ell!2^{|\ell|}}
 T_{q-1-|\beta|+|\ell|}(\lambda).
 \tag{10}
\]

Use the convention 0^0=1. A convenient uniform bound replaces this sum by
K_w(C) T_(q-1-s)(Lambda), where

\[
 K_w(C)=\sum_\beta|w_\beta|
 \sum_{\ell\le\beta/2}
 \frac{\beta!C^{|\beta|-2|\ell|}}
 {(\beta-2\ell)!\ell!2^{|\ell|}}.
\]

The weighted error is at most

\[
 A_m e^{\Lambda_m}K_w(C)T_{q-1-s}(\Lambda_m).
 \tag{11}
\]

A sufficient choice is q=s+n with integer
n>=max{1,2e Lambda_m,log2(A_m K_w(C)/epsilon)}. Zero prefactors are handled
directly. Divide A_m by W^m for normalized moments. Moment zero is a
Gaussian polynomial expectation and can be handled separately. The weight
coefficients and their conditioning depend on (3); their cost is not
silently absorbed into the unweighted price.

## 6. An explicit global threshold sandwich

For a=tau/W in (0,1), choose 0<delta<min(a,1-a), integer n>=1, and set

\[
 \eta=e^{-2n\delta^2},\qquad
 S_b(x)=\sum_{j=\lceil nb\rceil}^{n}\binom nj x^j(1-x)^{n-j}.
\]

Then globally on [0,1], including the equality convention at the threshold,

\[
 p^-=S_{a+\delta}-\eta\ \le H\le
 p^+=S_{a-\delta}+\eta.
 \tag{12}
\]

For completeness, the centered Bernoulli log moment-generating function
has second derivative at most 1/4, so it is at most lambda^2/8. Applying
the resulting binomial Chernoff bound at distance delta proves (12).
The ceiling convention preserves the one-sided margins.

Let q_mid=(p^++p^-)/2 and Delta=p^+-p^-. The gap has the positive form

\[
 \Delta=2\eta+
 \sum_{j=\lceil n(a-\delta)\rceil}^{\lceil n(a+\delta)\rceil-1}
 \binom nj x^j(1-x)^{n-j}.
 \tag{13}
\]

It obeys 0<=Delta<=1+2eta everywhere and Delta<=3eta outside
|h-tau|<=2Wdelta. For B denoting that band and p_B=P(B),

\[
 E\Delta\le p_B+3\eta,\qquad
 E\Delta^2\le(1+2\eta)^2p_B+9\eta^2(1-p_B).
 \tag{14}
\]

More directly, certified true moments of x compute E p^-, E p^+, or
E Delta^2 without assuming a band-mass bound. This is a certificate from
the computed moments only when their error bounds and the global
polynomial feasibility have also been certified.

At an interior threshold, continuity forces every global continuous
lower polynomial to be <=0 at a and every upper polynomial to be >=1
there. Thus E Delta cannot drop below P(h=tau). For an atom-free law,
delta_n -> 0 and n delta_n^2 -> infinity give convergence; they provide
no uniform rate over all such laws.

For the particular pure Gabor source here, D!=0 implies every positive
level is atom-free. Condition on all but a Gaussian direction v with
Dv!=0: h along that line is real analytic and decays to zero at infinity.
Its roots at a positive level are discrete, so the conditional level
probability is zero. A quantitative bound on the nearby band mass remains
missing. Clipping, plateaus and more general materials can restore atoms.

Endpoint cases are separate: tau<=0 gives H=1, tau>W gives H=0, and
tau=W gives the endpoint event h=W. Without a non-atomicity argument,
0<=1_{h>=W}<=x^n is valid and its expectation tends to the endpoint atom.
For D=0, evaluate the constant, including equality, directly.

## 7. Signed corrections and numerical intervals

For the first projective correction in two latent dimensions,

\[
 w(Z)=1+(k\cdot Z)(3-|Z|^2),\qquad Ew^2=1+9|k|^2.
\]

Multiplication by this signed w does not preserve (12). The valid form is

\[
 |EwH-Ewq_{mid}|\le\tfrac12E|w|\Delta
 \le\tfrac12\sqrt{(1+9|k|^2)E\Delta^2},
 \tag{15}
\]

or, using |w|<=(1+w^2)/2,

\[
 |EwH-Ewq_{mid}|\le\tfrac14E[(1+w^2)\Delta].
 \tag{16}
\]

The first uses unweighted moments through degree 2n plus cubic weighted
moments through degree n. The second uses intensity degree n and latent
polynomial weights through degree six. Keep their correlations.

If |m_j-hat m_j|<=epsilon_j simultaneously, a polynomial with coefficients
c_j has expectation error at most sum_j |c_j| epsilon_j, plus coefficient
and evaluation error. For signed queries, first enclose E[w q_mid] by
[L_q,U_q], then enlarge this interval by either certified radius (15) or
(16). The smaller of two valid radii is valid. A negative upper bound for
a provably nonnegative gap quantity signals a failed enclosure; silently
replacing it by zero does not repair the certificate.

E[wH] need not be in [0,1]. Only after adding the geometry-error bound to
enclose the original positive-measure probability may one intersect the
result with [0,1]. All floating-point, quadrature and geometry allowances
must remain visible.

## 8. What the degree costs, and what remains unknown

For any subset sum of degree-n Bernstein basis functions, its monomial
coefficient l1 norm is at most

\[
 \sum_{j=0}^n\binom nj2^{n-j}=3^n.
\]

The nested subsets in (13) therefore give
||coeff Delta||_1 <= 3^n+2eta and
||coeff Delta^2||_1 <= (3^n+2eta)^2. The midpoint has norm <=3^n.
Uniform normalized-moment error t/K suffices to evaluate a polynomial
mean to error t when K bounds its coefficient norm; no further factor
2n is necessary.

It follows that all the unweighted means through degree 2n used above
require log(1/epsilon_m)=O(n+log(1/t)) and
q_m=O(n(L+1)+log(1/t)). Given prepared rules and atom parameters, their
total real-arithmetic evaluation work is

\[
 O\left(n[J+\log(n+1)]
 [n(L+1)+\log(1/t)]^r\right).
 \tag{17}
\]

Here t is a tolerance for the evaluated polynomial means, not automatically
the final threshold error. Equation (17) excludes rule construction,
polynomial construction and certified numerical arithmetic. It describes
the unweighted part; (11) prices the extra signed-weight queries separately.

Three limits are essential. First, this is polynomial in a supplied
degree, not yet in the desired threshold accuracy: the measured or bounded
gap decides that accuracy. Second, linearity in J holds with spread L and
degree n fixed; adding atoms can change both. Third, exponentially small
moment errors require increasing numerical precision. A real-arithmetic
bound is not a fixed-float GPU implementation or a frame-time guarantee.

The next theoretical question is quantitative: which authored source
conditions control mass near a threshold, or permit a better envelope,
with a small enough degree? Generic atom-free convergence does not answer
it. Nor does this single-intensity result supply closure for arbitrary
correlated material graphs.

Critical values do not always have divergent intensity density. For the
single atom F(z)=exp(-|z|^2/4) under a two-dimensional standard Gaussian,
h=exp(-|Z|^2/2) is uniform on (0,1). Its critical maximum at z=0 has a
bounded one-sided density. The local geometry of the level, not merely
the presence of a critical point, matters.

## 9. Prior art and interpretation

[Bertsimas and Popescu (2005)](https://www.mit.edu/~dbertsim/papers/MomentProblems/Optimal-inequalities-in-probability-theory-A-convex-optimization-approach-SIAM15.pdf)
develop probability bounds from moments using polynomial inequalities
and optimization duality. That establishes direct prior art for the
moment-sandwich principle; weak-duality bounds need feasible polynomials,
whereas claims of sharpness or strong duality need further hypotheses.

[Huerlimann (2015)](https://link.springer.com/article/10.1186/s13660-015-0709-1)
gives explicit Chebyshev-Markov-Stieltjes probability bounds. Canonical
quadrature and orthogonal-polynomial bounds are alternatives to the
constructive binomial envelope and deserve consideration when their
moment assumptions and numerical conditioning can be certified.

A Christoffel function at one point is not automatically a band-mass
bound. For a uniform variable on [-1,1], the degree-two Christoffel
function at zero is 1/(1+5/4)=4/9, while P(|X|<=1/2)=1/2. The point
normalization of its extremal polynomial does not majorize the band.
For a valid constructive alternative, certify inf_B p^2 >= a>0 and use
P(X in B)<=E p(X)^2/a. More general moment optimization must certify a
polynomial that majorizes the entire event on the stated support, with
moment and numerical error intervals.

The potential contribution here is the explicit connection from a finite
authored Gabor source to true moment cost, and from those moments to a
nonlinear material query with a visible error interval. Geometry changes
the measure; material queries act on the same shared state. Cost depends
on the state spread and the requested approximation order. This is a
specific extension beyond linear count filtering, with a remaining
degree-versus-accuracy problem, not a general graphics breakthrough claim.
