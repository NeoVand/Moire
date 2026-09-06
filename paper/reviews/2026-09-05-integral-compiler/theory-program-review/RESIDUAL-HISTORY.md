# Put temporal history on the unresolved residual

2026-09-06. Theory review of collaboration messages 219–225. No new
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
