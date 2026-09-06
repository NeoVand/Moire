# Put temporal history on the unresolved residual

2026-09-06. Theory review of collaboration messages 219–235. No new
implementation or benchmark. The formulas below are elementary filtering
and control-variate results; no novelty or real-time performance is claimed.

The proposed direction is to evaluate a source-valid predictable material
contribution under the current footprint, and accumulate only its pointwise
residual. The open problem is obtaining a cheap predictor with a small,
certified residual for useful composed materials.

## 1. Optimal stationary compensation is not covariance subtraction

For one actual Fourier character in a fixed linear temporal model, let T be
its complex response, m=E[T], v=E|T−m|², and K the intended reconstruction.
For a fixed complex input multiplier P,

\[
 E|PT-K|^2=|Pm-K|^2+|P|^2v.
\]

When D=|m|²+v>0, completing the square gives

\[
 P_*={K\overline m\over D},\qquad
 \min_P E|PT-K|^2={|K|^2v\over D}.
\]

When D=0, T=0 almost surely and the error is |K|² for every P. This case
must not be implemented by division by zero.

The mean output is K|m|²/D. Thus small phase variation is not exact target
recovery; for nonzero K, exact recovery requires v=0 and m≠0. Also, P_* is
a shrinkage of the inverse K/m, not a unit-gain bound. If T is the
deterministic scalar η>0, then P_*=K/η can be arbitrarily large.
Expected output energy nevertheless obeys E|P_*T|²≤|K|². These are different
statements. Signed or amplified multipliers can invalidate certificates
that assumed a positive normalized footprint.

For independent unit-modulus jitter characters c_t with mean χ, consider
the stationary recurrence

\[
 T_t=zT_{t-1}+\alpha c_t,\qquad
 z=(1-\alpha)\widehat B(k),\qquad |z|<1.
\]

Geometric summation and independence give

\[
 m={\alpha\chi\over1-z},\qquad
 v={\alpha^2(1-|\chi|^2)\over1-|z|^2}.
\]

In particular, with no history resampling (Bhat=1), Gaussian jitter gives
χ=h=exp(−kᵀΣ_j k/2) and

\[
 m=h,\quad v={\alpha\over2-\alpha}(1-h^2),\quad
 P_*={Kh\over h^2+\alpha(1-h^2)/(2-\alpha)}.
\]

This is generally not a Gaussian multiplier. At α=1 it equals Kh, which
adds the jitter covariance if K is Gaussian. Inverse mean compensation
instead uses K/h and subtracts covariance. The two rules have opposite
behavior even in this simple case.

There is a separate problem with treating accumulated resampling as one
Gaussian. Suppose both jitter and each resampling kernel really are
Gaussian. The exact mean kernel is

\[
 \alpha\sum_{n=0}^{\infty}(1-\alpha)^n
 \mathcal N(0,\Sigma_j+n\Sigma_B).
\]

It is a geometric mixture. Its covariance is
Σ_j+((1−α)/α)Σ_B, but this second moment does not determine its transfer.

For a counterexample with no negative covariance, take α=1/2, zero jitter,
and choose a frequency where Bhat(k)=1/2. Let the target Gaussian have
covariance Σ_K=Σ_B. Subtracting the accumulated covariance produces P=1,
yet the actual mean response is (1/2)/(1−1/4)=2/3, rather than K=1/2.
The error is 1/6 per unit character. The exact deterministic compensator
at this frequency is P=3/4.

The Gaussian-mixture example is already idealized. Fractional-pixel
resampling has a discrete, offset-dependent transfer. A Box–Muller map of
a deterministic Halton sequence does not create independent samples;
ordering, temporal correlations, finite histories, rejection and changing
footprints cannot be inferred from the marginal jitter distribution.
Quadratic or more general phase functions are also not ordinary Fourier
eigenfunctions of spatial convolution. The appropriate response must be
derived for the actual source and coordinates.

[Amortized Supersampling](https://hhoppe.com/supersample.pdf) is direct prior
work on recursive reprojection and accumulated resampling blur. A useful
low-frequency blur-variance approximation is not an exact all-frequency
identity permitting covariance subtraction.

## 2. Separate the current predictable contribution from history

Let R_t be the intended positive normalized linear observation of the full current
integrand f_t. It must include the relevant source, geometry, visibility,
lighting and sampling measure. Select an explicit predictor a_t and write

\[
 f_t=a_t+b_t,\qquad A_t=R_t a_t.
\]

At each sampled state evaluate b_t=f_t−a_t using that same state. The
candidate output is the current A_t plus an estimate of R_t b_t from
residual samples. When a_t=f_t, the residual is zero and the predictable
contribution has no temporal-history blur. This avoids trying to invert
history's transfer on a contribution whose current mean is already known.

The predictor needs pointwise agreement, not merely a good mean. A model
can integrate accurately while correlating poorly with the source at
individual points. Multiplying independently filtered material and lighting
also fails in general: E[AL] is not E[A]E[L]. Their correlated difference
belongs in the residual unless integrated jointly.

For fixed history weights w_s summing to one, suppose historical residual
observations have means μ_s=R_s b_s and covariance matrix C. With an exact
current A_t, the bias against R_t f_t is

\[
 \sum_s w_s(\mu_s-\mu_t),
\]

and the variance is w* C w. Correctly reprojecting a material point does
not establish μ_s=μ_t: its footprint, visibility, source parameters or
lighting may have changed. Data-dependent clipping and weights require
their own expectation analysis.

For stationary independent residual noise of variance ρV, an EMA with
current-frame weight α has variance ρV α/(2−α). Assume 0<α_0≤1 and finite
ρ≥0. Relative to a baseline with weight α_0 and variance V>0, the largest
current-frame weight whose stationary variance does not exceed the baseline is

\[
 \alpha_{\rm new}=\min\left(1,
 {2\alpha_0\over\rho(2-\alpha_0)+\alpha_0}\right).
\]

If the expression exceeds one, α=1 already meets the variance bound.
Changing α_0=0.1 to α_new=0.5 requires ρ≤3/19, a variance reduction of at
least 19/3. This is an iid stationary yardstick, not a prediction of TAA:
coherent aliasing requires C, changes create bias, and all predictor and
history costs remain to be paid.

## 3. A pointwise residual envelope gives a stronger guarantee

Suppose the computed current predictor mean Atilde_t has error at most
ε_A. Let |b_t(x)|≤ε_t throughout the current footprint, and each historical
residual value y_s obey |y_s|≤ε_s. For any finite weights w_s, including
weights selected from the data, define

\[
 \widehat I_t=\widetilde A_t+\sum_s w_s y_s.
\]

The triangle inequality and positivity of R_t give the pathwise bound

\[
 \boxed{|\widehat I_t-R_t f_t|
 \le\epsilon_A+\epsilon_t+\sum_s|w_s|\epsilon_s.}
\]

No stationarity, independent jitter or correct reprojection is required
for this inequality. With one uniform residual envelope ε and normalized
nonnegative weights, the bound is ε_A+2ε. Signed reconstruction kernels
pay their actual absolute-weight sum. Convex spatial interpolation and
clamping to the certified residual interval preserve that interval.

This is a conditional numerical error bound in the specified radiance
space, not a perceptual or speed guarantee. Every retained residual must
satisfy its envelope. A few source probes do not establish a uniform
certificate. Infinite footprint tails need an explicit allowance. Correctly
integrating a_t over the current full source measure may itself be hard.
If a nonlinear display transform follows, its effect on this bound must
also be accounted for.

The useful research target is therefore a material representation for
which the compiler can cheaply construct both a current-footprint integral
and a small pointwise residual envelope. Count coordinates, conditional
phase averaging, and compressed interaction features are candidate means
to that end; none presently supplies this contract for general shaders.

## 4. Hard boundaries need a different residual certificate

A small displacement of a threshold boundary can still leave a unit
pointwise error. A small uniform envelope is then unavailable. Suppose
f=1{g≥0}, a=1{gtilde≥0}, and |g−gtilde|≤δ throughout the footprint. Then

\[
 |f-a|\le\mathbf1_{\{|\widetilde g|\le\delta\}}.
\]

Let p=R 1{|gtilde|≤δ} be this boundary band's mass under the actual
positive normalized pixel measure. It follows that R|b|≤p and R|b|²≤p.
The residual can have small integrated error and variance even though its
pointwise amplitude is one.

More generally, f=A 1{g≥0} and a=Atilde 1{gtilde≥0}, with |A|≤B and
|A−Atilde|≤η, satisfy

\[
 |b|\le\eta+B\mathbf1_{\{|\widetilde g|\le\delta\}},\qquad
 R|b|\le\eta+Bp,\qquad
 \|b\|_{L^2(R)}\le\eta+B\sqrt p.
\]

This connects source-versus-model error to correlated coverage: the
compiler must bound the footprint mass of the disagreement band, jointly
with amplitude where needed. It cannot substitute a count's marginal or
assume independence from another mask.

For fixed nonnegative normalized history weights and indicator residuals,
the mean history mismatch is at most p_t+Σ_s w_s p_s. Without independence,
residual covariance magnitudes are at most sqrt(p_s p_r); history does not
automatically obtain a 1/N variance reduction. Data-adaptive selection can
favor rare errors, so it needs a conditional analysis or the larger
pathwise amplitude bound from section 3.

Small boundary displacement need not imply small band mass. Grazing or
critical points, atoms in the count distribution, and concentrated
footprints require direct mass bounds. The proposed state should therefore
describe both residual amplitude and where that error occurs under the
pixel measure. Cheap certificates of this kind for composed materials are
an open target, not a consequence of the elementary inequalities alone.

### 4.1 A graph-level bound avoids enumerating branch combinations

Let F=Ψ(1{g_i≥0}) and A=Ψ(1{q_i≥0}) use the same finite decision graph Ψ,
whose final values lie in an interval of width W. On a common reach E,
suppose |g_i−q_i|≤δ_i. Outside the union of bands E_i={|q_i|≤δ_i}, every
predicate agrees, so the whole graph agrees. Therefore, if the reach has
omitted probability τ and B_i bounds R 1_(E_i intersect E),

\[
 p=\min(1,\tau+\sum_i B_i),\qquad
 R|F-A|\le Wp,\qquad R|F-A|^2\le W^2p.
\]

The common reach tail is charged once. Independence is unnecessary. Given
the per-count remainders and band bounds, this certificate needs no branch
enumeration and no factor for graph depth. It still needs the final range W;
unbounded arithmetic compositions are outside this statement. An integral
of A computed within ε_A then approximates RF within ε_A+Wp. Computing
that integral can remain expensive.

Pivotality tested only at the predictor is unsafe: AND at predictor (0,0)
has no individually influential bit, but changing both bits to (1,1) changes
the output. Exact telescoping instead uses hybrid contexts
h^(j)=(true first j bits, predictor remaining bits). The j-th difference
depends on whether bit j changes and on its influence at that hybrid
context. These events are correlated and cannot be replaced by independent
influence factors.

A conservative refinement evaluates the range of Ψ on the uncertainty
subcube: known bits are fixed; bits whose bands contain the current point
may vary. This can certify, for example, that AND remains zero when any
input is certainly zero. Exact range computation for arbitrary circuits
may be difficult. Cheap interval propagation can preserve uncertainty
rather than make an unsupported simplification.

### 4.2 Explicit bounds for a single Gaussian threshold band

Whiten the footprint with Z~N(0,I_d), and write the quadratic count model

\[
 q(Z)=m+b^T Z+\tfrac12 Z^T HZ,\qquad H=H^T.
\]

The source remainder δ must be certified on ||Z||≤R. The following bounds
apply to the band's mass on that reach; global bounds also bound the
restricted mass. Add the reach tail only when converting to a source
disagreement bound. In two whitened dimensions τ_R=exp(−R²/2).

For an affine count, s=||b||>0 gives the exact global band mass

\[
 B_{\rm aff}=\Phi((\delta-m)/s)-\Phi((-\delta-m)/s).
\]

For s=0, evaluate the constant event |m|≤δ. If δ=0 is a valid zero-error
certificate, the original predicate equals its model exactly, even when
this conservative band event includes a constant at the threshold.

For a unit direction e satisfying
λ=|bᵀe|−R||He||>0, the count is monotone along each e-parallel slice of the
reach. Its band slice has length at most 2δ/λ. The maximum standard-Gaussian
mass of an interval of that length is attained at the origin, yielding

\[
 B_{\rm direction}\le 2\Phi(\delta/\lambda)-1.
\]

This requires a reliable derivative only on the certified reach. Also,
if |m|>||b||R+||H||op R²/2+δ, the reach has no band at all.

At a critical point a nonzero curvature still supplies a bound. For
h=||H||op>0, condition along an eigenvector attaining that magnitude. The
one-variable quadratic preimage of [−δ,δ] has total interval length at
most 4 sqrt(δ/h). Among measurable sets of that length, a centered interval
has maximal Gaussian probability. Hence

\[
 B_{\rm curvature}\le2\Phi(2\sqrt{\delta/h})-1.
\]

This is sharp over offsets already for q=(h/2)Z_1²−δ. No global gradient
floor is assumed.

In two dimensions, definite H permits a sharper estimate. Completing the
square gives an elliptical disk or annulus of area at most
4πδ/sqrt(|det H|). Among sets of that area, a centered disk has maximal
standard-Gaussian mass, giving

\[
 B_{\rm definite}\le1-\exp[-2\delta/\sqrt{|\det H|}].
\]

If the extremum value of q is exactly zero, replace 2δ in the exponent by
δ. This concerns the single band around zero, not all thresholds of a
periodic material.

For a full-rank saddle with eigenvalues λ>0 and −ν<0, set
z_* = −H^(-1)b and L_*²=(λ+ν)(R+||z_*||)²/2. After completing the square,
a linear change of variables gives q=q_*+uv, with absolute Jacobian
sqrt(|det H|), and the reach lies inside |u|,|v|≤L_*. Each vertical band
slice has length at most min(2L_*,2δ/|u|). Integration gives

\[
 B_{\rm saddle}\le {2\over\pi\sqrt{|\det H|}}
 \begin{cases}
 \delta[1+\log(L_*^2/\delta)],&0<\delta\le L_*^2,\\
 L_*^2,&\delta>L_*^2.
 \end{cases}
\]

The result is capped at one; at δ=0 use the zero limit. Take the smallest
applicable certificate. Poor conditioning of H or a far-away critical
point may make the saddle bound loose.

These distinct rates reflect actual instability. For independent standard
normals, the band masses near zero are asymptotically:

| Count model | Probability of the threshold band as δ decreases to zero |
| --- | --- |
| Z_1 | sqrt(2/π) δ |
| Z_1² | sqrt(2/π) sqrt(δ) |
| Z_1²+Z_2² | δ/2 |
| Z_1 Z_2 | (2/π) δ log(1/δ) |
| Constant zero | 1 |

Small constant count perturbations attain these disagreement orders; for
the constant-zero model with the ≥0 convention, perturb negatively. Thus
there is no universal linear-in-δ mask error bound. The squared ridge can
produce an L2 indicator residual of order δ^(1/4).

### 4.3 Periodic predicates require wrapped bands

A stripe or checker predicate has repeated discontinuities. If its jump
set in count coordinates is a_0+L Z, a count approximation error δ can
change the predicate anywhere that dist(q−a_0,L Z)≤δ. A single band around
zero does not cover this event. Multiple jump families can be union-bounded.

For 0<δ<L/2, put a=δ/L. The L-periodic band indicator B has coefficients

\[
 \widehat B_0=2a,\qquad
 \widehat B_n=e^{-2\pi i n a_0/L}
 {\sin(2\pi n a)\over\pi n},\qquad
 |\widehat B_n|\le\min(2a,1/(\pi|n|)).
\]

The quadratic count's characteristic-function modulus is exactly

\[
 |\chi_q(\omega)|=
 \prod_j(1+\omega^2\lambda_j^2)^{-1/4}
 \exp\left[-{\omega^2\over2}
 b^T(I+\omega^2H^2)^{-1}b\right],
\]

where λ_j are the eigenvalues of H. For the global wrapped-band mass p_B,

\[
 |p_B-2a|\le
 2\sum_{n\ge1}\min(2a,1/(\pi n))
 |\chi_q(2\pi n/L)|.
\]

This identity can be justified with Fejér means: nonconstant Gaussian
quadratic or affine counts have no atoms, so the countable band-boundary
set has probability zero; the means stay in [0,1] and converge almost
surely. Dominated convergence then applies. The absolute bounds below
also make the weighted Fourier series summable. If H=b=0, evaluate the
constant band membership directly; a Fourier midpoint at a jump is not
the deterministic answer.

For affine spread s=||b||>0, the wrapped Gaussian density has maximum at
its mean modulo L. A sum-versus-integral Gaussian bound gives its maximum
at most 1/L+1/(sqrt(2π)s). Therefore

\[
 \boxed{p_B\le\min\left(1,
 {2\delta\over L}+{2\delta\over\sqrt{2\pi}s}\right).}
\]

The same bound applies when H≠0 and the exactly known nullspace component
b_0=Proj_(ker H)b is nonzero, with s=||b_0||. Conditioning on the curved
coordinates leaves an independent Gaussian shift of that variance.

For any nonzero curvature h=||H||op,
|χ_q(2πn/L)|≤sqrt(L/(2πhn)). The positive decreasing function
min(2a x^(-1/2),π^(-1)x^(-3/2)) has integral
8 sqrt(a)/sqrt(2π) over x>0. Bounding its sum by that integral gives

\[
 \boxed{p_B\le\min\left(1,
 {2\delta\over L}+{8\over\pi}\sqrt{\delta/h}\right).}
\]

For two nonzero eigenvalues, set d_H=sqrt(|λ_1 λ_2|), equal to
sqrt(|det H|) in two dimensions. The characteristic function instead
obeys |χ_q(2πn/L)|≤L/(2πn d_H). Let u=2πδ/L. For u≤1,

\[
 \sum_{n\ge1}\min(u/n,1/n^2)
 \le u[2+\log(1/u)],
\]

by a first-term-plus-integral bound. Consequently,

\[
 \boxed{p_B\le\min\left(1,{2\delta\over L}
 +{2\delta\over\pi d_H}
 [2+\log(L/(2\pi\delta))]\right),\quad u\le1.}
\]

For any u, the sum is also at most π²/6, giving
p_B≤min(1,2δ/L+L/(6d_H)). Use this when u>1, or take the smaller valid
bound when u≤1. These bounds are conservative and uniform in the count
offset. They pay no factor for the number of periods crossed by the
footprint. The constant 2δ/L is the uniform phase fraction, not a new
rendering target that permits averaging away resolved structure.

For δ≥L/2 the band covers the whole line. For δ=0 and a valid zero source
remainder, there is no predicate disagreement. Add the common reach tail
once when converting model band bounds to a source/material error bound.
Numerical use requires certified parameter bounds: a small computed
eigenvalue cannot silently be treated as an exact nullspace, and the
positive denominators require safe lower bounds. Certifying the source
remainder remains separate from these inexpensive band calculations.

## 5. The decomposition and temporal correction have close precedents

[Crespo, Jarabo and Muñoz, Primary-Space Adaptive Control Variates, 2021](https://graphics.unizar.es/papers/Crespo_primarySpaceQuadCV.pdf)
analytically integrates a piecewise-polynomial predictor and samples its
pointwise residual. Its offline space-time extension jointly treats video
frames; it does not establish that previously filtered residuals can simply
be reprojected into a new footprint.

[Rousselle, Jarosz and Novák, Image-Space Control Variates, 2016](https://cs.dartmouth.edu/~wjarosz/publications/rousselle16image.pdf)
uses correlated difference estimates to reuse previous renderings and
nearby pixels, including covariance-aware combinations. Its material-edit
application does not supply the general moving-footprint contract here.

The author project for
[Shi et al., ReSTCV, 2026](https://hercier.github.io/restcv/)
describes real-time spatial and temporal control variates that correct
accumulated estimates with reservoir-sampled pixel differences. This is a
direct prior-art warning against claiming temporal residual correction
itself new. The project page was inspected; the linked author PDF did not
load, so its precise shift/footprint assumptions remain to be reviewed.

The possible contribution is a useful source-derived predictor, its
integration and pointwise error certificate, and affordable correction of
the unresolved history. A familiar decomposition with a new name would
not establish that contribution.

[Audibert and Tsybakov, Fast Learning Rates for Plug-In Classifiers, 2007](https://arxiv.org/pdf/0708.2321)
is related prior art for turning approximation errors in a decision
function into probability bounds near its threshold. Its margin condition
excludes exact ties, whose contribution to excess classification risk is
zero. Rendering disagreement cannot generally discard that mass. The
classification risk weights and rates should not be copied into this
material error problem without deriving the appropriate observation.
