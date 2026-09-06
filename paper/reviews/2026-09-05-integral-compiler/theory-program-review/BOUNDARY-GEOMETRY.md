# Boundary geometry, unresolved directions, and representation cost

2026-09-06. Theory only. This records the conditional route discussed in
bridge 127–135. No new probe or benchmark was run for this note.

The useful extension beyond independent arc masks is to a threshold
g=1_{F>t} on a phase torus. Boundary geometry can certify a Fourier tail,
but that tail is a property of a representation. It is not a lower bound
on rendering cost.

## 1. Conditional rank-two theorem

Let 0≤g≤1 on T³, with normalized Fourier coefficients. Write the Gaussian
phase covariance as KᵀK, where K has rank two. The proposed response is

\[
 V=\sum_{m\in\mathbb Z^3}\widehat g(m)
       e^{im\cdot\theta_0}e^{-|Km|^2/2}.
 \tag{1}
\]

For an indicator, equality to the source pixel also requires that the
Gaussian source measure give zero mass to the discontinuity set. This
trace condition is separate from summability.

Let v span ker K. Suppose, for a fixed double cone C of half-angle
0<θ₀<π/2 around both +v and −v, there are supplied constants C₀ and R₀
such that

\[
 |\widehat g(m)|\le C_0|m|^{-2}
 \quad(m\in C,\ |m|\ge R_0).
 \tag{2}
\]

Choose any two coordinate columns of K forming an invertible 2×2 matrix B.
Put

\[
 s_B=\sigma_{\min}(B),\quad
 L=\left(1+\frac{\sqrt{2\pi}}{s_B}\right)^2,\quad
 a=\sigma_{\min}^{+}(K)\sin\theta_0.
\]

For every integer R≥max(1,R₀), the complete omitted absolute sum obeys

\[
 \boxed{
 \sum_{|m|\ge R}|\widehat g(m)|e^{-|Km|^2/2}
 \le \frac{8C_0L}{R}
 +e^{-a^2R^2/4}\left(1+\frac{2\sqrt\pi}{a}\right)^3.
 }
 \tag{3}
\]

Thus (2) implies full absolute convergence. Formula (3) charges the modes
outside the cone as well; it does not replace Gaussian support with a
finite tube. The constants retain footprint conditioning.

Proof: fix the third integer coordinate j and sum over the other two.
Completing the affine shift and applying the least singular value gives

\[
 \sum_{n\in\mathbb Z^2}e^{-|Bn+cj|^2/2}
 \le\sum_{n\in\mathbb Z^2}e^{-s_B^2|n+B^{-1}cj|^2/2}
 \le L.
\]

In a shell r≤|m|<2r with integer r, fewer than 4r values of j occur.
Its conic contribution is therefore at most 4C₀L/r. Summing shells
r=2^jR proves the first term. Off the cone, |Km|≥a|m|. Split the
Gaussian into two equal exponent factors, bound one by e^{-a²R²/4},
and sum the other over the entire integer lattice as a product of three
one-dimensional Gaussian sums. This proves the second term.

The count uses integer coordinate slices, not equidistribution along
an irrational direction or the area of a thin ellipse. Rational and
irrational kernels are both covered.

## 2. What stationary phase can supply

For a regular threshold surface S=∂{F>t}, the divergence theorem gives,
for m nonzero,

\[
 \widehat g(m)=
 \frac{i}{(2\pi)^3|m|^2}
 \int_S e^{-im\cdot\theta}(m\cdot\nu)\,dS.
 \tag{4}
\]

The prefactor contributes one inverse power of |m| after normalizing
m to a unit direction. A uniform inverse-power bound of order one
for the two-dimensional surface integral gives (2).

[Lee–Oh, Theorem 1.2 and Remark 1](https://arxiv.org/pdf/2012.12572)
provide an appropriate uniform stationary-phase inequality. In surface
dimension two, C³ phase and C² compactly supported amplitude suffice.
Their hypotheses include a Hessian-determinant lower bound on a normalized
chart and a support margin. The theorem assumes an injective phase gradient;
the remark removes that assumption with worse constants. The constants
depend on phase and amplitude norms and chart data. This is a decay
inequality, not a higher-order asymptotic remainder.

To apply it to a level-set formula, supply or derive all of the following:

- A regular-level bound inf_S|∇F|≥γ>0, or equivalent quantitative charts.
- A finite atlas, chart derivative bounds, and cutoff/support controls.
- A uniform bound on the absolute Hessian determinant in stationary
  charts for every direction in the cone, including both normal orientations.
- A uniform tangential phase-gradient gap on the nonstationary complement.
- A value or certified upper bound for the final constant C₀, with all
  chart contributions included.

Negative Gaussian curvature is allowed: a saddle has a nonzero Hessian
determinant. Curvature need not be positive. A bound at finitely many
central stationary points does not control a whole cone or exclude other
stationary branches.

The complementary surface integral needs only one integration by parts.
For phase φ=u·θ, amplitude A=χ(u·ν), and
|∇_Sφ|≥η on the cutoff support, put H=sup||Hess_Sφ||. A sufficient bound is

\[
 \left|\int_S A e^{-i\lambda\phi}dS\right|
 \le \lambda^{-1}
 \left[\eta^{-1}\|\nabla_S A\|_{L^1}
       +4H\eta^{-2}\|A\|_{L^1}\right].
\]

It follows by using the tangential vector field
∇_Sφ/|∇_Sφ|² and bounding its divergence. Area, cutoff derivatives
and angular separation therefore enter the final coefficient bound.

The word parabolic does not specify a higher decay exponent. A single
uniformly nonzero second derivative already gives a conservative surface
decay of order one half, under the corresponding localized amplitude
controls; after (4), exponent 3/2 is enough for the rank-two lattice sum.
Stronger finite-type exponents need their orders and constants stated.
No general improvement from an infinitely flat direction is assumed here.

## 3. The dimensional balance is a sufficient criterion

The slicing argument extends to latent dimension d and Gaussian rank r<d.
Let q=d−r be the number of unfiltered linear directions, choose an invertible
r-column submatrix B, and put

\[
 L_r=\left(1+\frac{\sqrt{2\pi}}{\sigma_{\min}(B)}\right)^r.
\]

If a conic coefficient envelope is C|m|^{-p}, then an integer-radius
shell has conic mass at most 4^q C L_r R^{q-p}. Whenever p>q,

\[
 \text{conic tail beyond }R
 \le \frac{4^q C L_r}{1-2^{q-p}}R^{q-p}.
 \tag{5}
\]

The cone is now a neighborhood of the entire kernel subspace. Off it,
the isotropic Gaussian argument above still applies, with exponent d
on its lattice constant.

This separates two factors: coefficient decay from material geometry,
and how many phase directions the footprint fails to damp. Formula (5)
is sufficient, not necessary. At p≤q it says nothing; it is not a
divergence theorem. Anisotropic coefficient structure, exact phase
relations and alternative representations can all change the conclusion.

## 4. An absolutely divergent expansion can describe a trivial pixel

Take q=(1,1,1) and

\[
 g(\theta)=\mathbf1_{\{\cos(q\cdot\theta)>0\}},\qquad
 K^{\mathsf T}K=I-\frac{qq^{\mathsf T}}3.
\]

The covariance has rank two and every individual phase has nonzero
variance. Yet q·θ is constant on every source leaf. Choose q·θ₀=0:
the source material is identically 1 and never meets its boundary.
The pixel therefore requires only evaluation of that surviving phase.

The boundary consists of regular analytic flat tori. Along m=nq the
Gaussian multiplier equals 1, while for odd n the Fourier magnitude is
1/(π|n|). Thus the weighted absolute sum diverges.

The trace is well-defined; the absolute-series certificate fails.
Conditioning on q·θ, or composing the counts before filtering, resolves
the source exactly. This example rules out identifying slow absolute
spectral decay with intrinsic material difficulty.

## 5. An exact regular-level certificate for the actual sine mask

The mask in demo/mask-table.js is, after absorbing phase offsets,

\[
 F(\psi)=\sin\psi_1+\tfrac45\sin\psi_2+\tfrac35\sin\psi_3,
 \qquad t=\tfrac3{10}.
\]

Put z_i=a_i sinψ_i. Its level surface maps onto the box slice

\[
 z\in[-1,1]\times[-.8,.8]\times[-.6,.6],
 \qquad z_1+z_2+z_3=.3,
\]
\[
 |\nabla_\psi F|^2=2-\sum_i z_i^2.
\]

The convex squared norm reaches a maximum at a vertex of this polytope.
Every vertex has two coordinates at box endpoints. The complete feasible
list is:

| Vertex z | Squared gradient |
| --- | ---: |
| (1, −.8, .1) | .35 |
| (−1, .8, .5) | .11 |
| (1, −.1, −.6) | .63 |
| (−1, .7, .6) | .15 |
| (.1, .8, −.6) | .99 |
| (.5, −.8, .6) | .75 |

It follows exactly that

\[
 \boxed{\min_{F=3/10}|\nabla_\psi F|=\frac{\sqrt{11}}{10}.}
 \tag{6}
\]

The minimum is attained, with sine values (−1,1,5/6). This is a
phase-gradient bound, not a screen-gradient or curvature bound.
The rational material parameters are exact in this calculation;
floating-point coefficient perturbations need a separate allowance.

The same reduction works for any finite sum of independent sine phases:
maximize a convex squared norm on a sliced box. Its vertex enumeration
can be exponential in the number of phases, so the reduction does not
by itself provide a cheap general algorithm.

The stationary-point and cone samples reported in bridge 129 remain
exploratory evidence. Sign-change scans can miss tangent and endpoint
roots. Sampled directions do not certify global curvature extrema or
root counts. Formula (6) is proved independently of those samples;
the cone geometry, constant C₀, and automatic extraction of a suitable
representation remain open.

## 6. Exact phase relations organize restriction, not automatic compression

For a periodic material graph, let M⊆Z^d be a syntactic module containing
all phase characters used by the graph. Its minimal Fourier-support
module can be smaller: sin²θ+cos²θ is constant, despite its input phase.
Graph propagation supplies a conservative enclosure, not a general
semantic equivalence procedure.

For an affine Gaussian source define M₀=M∩ker K. This subgroup is
saturated in M: if nz∈M₀ for nonzero integer n, then nKz=0 implies Kz=0.
Consequently a basis of M₀ extends to an integer basis of M.
In those character coordinates the M₀ coordinates are constant on the
source leaf. Substitute their values into the source expression, retaining
all variable characters. This is exact restriction; a Haar average over
the variable coordinates would perform a different operation.

The restriction need not be cheap to construct or evaluate. A Fourier
description would have to aggregate the original coefficients within
each coset of M₀, including their phase factors; that can retain the
original cancellation and trace issues. In the example of section 4,
the source formula simplifies immediately, which is why the reduction
is useful.

Eliminating all integer zero-rate characters does not produce a spectral
gap. For rates (1,√2), the integer kernel is zero, but nonzero integer
combinations have arbitrarily small rates. The remaining real covariance
can still be rank deficient. Exact relations and near relations need
different certificates.

Exact relation discovery also depends on the arithmetic model. Rational
rate matrices permit exact integer-kernel algorithms with bit-size costs.
Arbitrary real rate data require an explicit method for proving the
equalities being used. Every finite binary floating-point constant is
rational, so a real-arithmetic 2×3 rank-two matrix made of those stored
constants has a nonzero integer kernel, possibly with enormous integer
coefficients. An ideal irrational source model may have no such integer
relation. A numerical small singular value does not settle this question.

Finally, a kernel of a local derivative model is not automatically a
source relation. The phase x² has zero first derivative at the centre
but is not constant on its footprint. Constant-phase elimination requires
affine source maps or a separately proved source-level identity.

The resulting research program is to track characters conservatively,
prove useful source relations, restrict and simplify the actual material,
then select a representation whose discarded contributions and total
evaluation cost are bounded. Neither an exact quotient nor a convergent
Fourier representation alone proves that the resulting material is compact.
