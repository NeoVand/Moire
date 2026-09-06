# Composition depends on what can still interact

2026-09-06. Analytic examples, independent proof review and primary-source
research. No implementation or benchmark. The mathematical foundations
below are classical; their synthesis is an organizing proposal, not a
novelty claim or a general rendering cost theorem.

A small set of visible output modes is not necessarily a small sufficient
state for composing a material. Unresolved source detail can interact with
another factor and generate a retained mode. A useful compiler must either
retain those interaction directions, compile the interacting sources
jointly, or bound the error for a restricted family of later operations.

## 1. Output truncation does not commute with composition

On the circle with normalized Haar measure, let

\[
 A(\theta)=B(\theta)=\frac{1+\cos(N\theta)}2.
\]

For any fixed finite output band E containing zero, choose N outside E-E.
Each factor restricted to E-E is the constant 1/2. Multiplying those
restricted factors gives mean 1/4, whereas the original product has mean
3/8. Thus even the product coefficient at zero can depend on factor
frequencies arbitrarily far outside the difference set of the output band.

For a KNOWN context with actual spectral support S, the correct factor
coefficient request for output E is E-S. Replacing S by the context's
already filtered output band discards precisely the correlations at issue.
If the context has infinite support, this exact request can be infinite.

Gaussian filtering does not eliminate the problem by retaining tiny
nonzero coefficients. Let P_t be one-dimensional Gaussian convolution
with variance t. The filtered factors A and A'=1/2 differ in maximum
norm by (1/2)exp(-tN^2/2). With the same downstream context B=A,

\[
 P_t[(A-A')B](x)
 =\tfrac18+\tfrac14e^{-tN^2/2}\cos(Nx)
 +\tfrac18e^{-2tN^2}\cos(2Nx).
\]

The difference tends uniformly to 1/8 as N grows. Reconstructing this
response from only the already filtered factor is not uniformly stable:
arbitrarily small differences in that representation can have an order-one
effect after an allowed multiplication. Exact infinite-precision
invertibility of Gaussian smoothing is not a finite-precision remedy.

## 2. The downstream-context seminorm

Fix a probability measure mu and an allowed context family C. Define

\[
 \|f\|_{\mathcal C}=\sup_{B\in\mathcal C}
 \left|\int fB\,d\mu\right|.
 \tag{1}
\]

Approximating A in this seminorm preserves its products with the allowed
contexts at this measure. The family must include the operations and
weights actually claimed: masks, correlated lighting, footprint changes,
or compositions of remaining nodes can enlarge it. A guarantee for a
smaller family cannot silently be used for the enlarged one.

For every real integrable f,

\[
 \sup_{0\le B\le1}\left|\int fB\,d\mu\right|
 =\max\left(\int f_+\,d\mu,\int f_-\,d\mu\right)
 =\frac{\|f\|_1+|\int f\,d\mu|}{2}.
 \tag{2}
\]

Indeed the positive and negative supports attain the two extrema; no
bounded mask can increase their respective integrals. For equal-mean
A,A', the right side is (1/2)||A-A'||_1. Therefore any two equal-mean
inputs sharing a summary that predicts EVERY bounded context to error
epsilon must satisfy ||A-A'||_1<=4epsilon. The factor four includes two
allowed prediction errors. Keeping their common mean is far weaker.

There is a useful restricted version. Suppose every B in C has an
approximation B_V in an r-dimensional subspace V of L2(mu), with
||B-B_V||_2<=delta. Keeping the r source projections on an orthonormal
basis of V predicts the product with B_V exactly and the original product
with error at most ||A||_2 delta. This follows from Cauchy-Schwarz.
Constructing V, certifying delta over ALL admitted contexts, computing the
source projections and maintaining the certificate under composition are
separate costs. A sampled low-rank fit alone supplies none of them.

This is a concrete form of the response-space proposal in
[SUBDIVISION-PRIOR-ART.md](SUBDIVISION-PRIOR-ART.md). It restricts the
information requirement by future use, not merely by present visibility.

## 3. Quantitative limits: rank and storage are different

First consider a small explicit context family. Take distinct positive
integers N_j>max_{k in E}|k|, so both signs lie outside E, and

\[
 A_a=\tfrac12+\eta\sum_{j=1}^q a_j\cos(N_j\theta),\quad
 |a_j|\le1,\quad 0<\eta\le\frac1{2q},\qquad
 B_j=\frac{1+\cos(N_j\theta)}2.
\]

All A_a lie in [0,1], have mean 1/2 and have identical retained coefficients.
Orthogonality gives E[A_a B_j]=1/4+eta a_j/4. A linear summary of a
with rank below q has a kernel vector v normalized to ||v||_infinity=1.
The inputs v and -v share a summary, but one query differs by eta/2.
Thus no decoder of that summary can guarantee error epsilon<eta/4 for
every a and j. Restricting to a in {-1,1}^q similarly requires at least q
encoded bits. With eta=1/(2q), the threshold is 1/(8q): this example
does not establish an arbitrarily large fixed-error lower bound.

A richer context family gives a fixed-error STORAGE result. For q divisible
by eight, consider balanced binary patterns on q equal cells of a phase
period, with exactly q/2 one-valued cells. Their number is at least
2^q/(q+1). Greedily choose patterns separated by Hamming distance at least
q/4. Each choice removes no more than sum_{i<=q/4}binom(q,i), which is
at most 2^(q H_2(1/4)), where H_2 is binary entropy. Hence there is a code
of size at least 2^(q[1-H_2(1/4)])/(q+1).

Two selected patterns A_s,A_t with Hamming distance d are distinguished
by the allowed context B=A_s:

\[
 E[A_sB]-E[A_tB]=\frac{d}{2q}\ge\frac18.
\]

For epsilon<1/16 they cannot share an encoding. A reusable finite-bit
summary therefore requires at least
[1-H_2(1/4)]q-log_2(q+1) bits. Repeat every pattern N times around the
circle, with integer N beyond the output cutoff. All its retained
nonconstant coefficients vanish, while the contextual separation remains.
For a fixed positive Gaussian footprint, choosing N sufficiently large
also makes the wrapped phase arbitrarily close to Haar in total variation;
any fixed epsilon<1/16 then retains the same separation argument after
charging that additional allowance. In particular, total variation below
1/8-2epsilon suffices: the separating product difference A_s(1-A_t) is
itself bounded between zero and one.

This is not a universal runtime lower bound. The family has growing source
complexity and a rich allowed context set. An unrestricted exact real
number can encode unlimited bits, so scalar count without precision or
regularity assumptions is not a storage model. Joint compilation can
avoid constructing a reusable summary for all possible future contexts.

## 4. Scale evolution already has an exact correlation law

Let Sigma be a fixed constant positive-definite matrix, and
P_t=exp(t Sigma:Hessian/2). For sufficiently regular bounded a,b, define
C_t(a,b)=P_t(ab)-(P_ta)(P_tb). The product rule gives

\[
 \partial_t C_t=\tfrac12\Sigma:\nabla^2C_t
 +(\nabla P_ta)^T\Sigma\nabla P_tb,\qquad C_0=0,
\]

and therefore

\[
 C_t(a,b)=\int_0^tP_{t-s}
 [(\nabla P_sa)^T\Sigma\nabla P_sb]ds.
 \tag{3}
\]

One can verify the sign and factor directly by differentiating
P_{t-s}[(P_sa)(P_sb)]. Johnson's
[2021 primary paper](https://arxiv.org/pdf/2102.06844), equations 2.44-2.48,
already gives this scalar forced-diffusion description for an isotropic
Gaussian. Constant anisotropy is the corresponding direct extension.

There is an exact scale-consistency identity as well:

\[
 C_{s+t}(a,b)=P_s C_t(a,b)+C_s(P_ta,P_tb).
 \tag{4}
\]

Expand both sides and use P_s P_t=P_{s+t}. This is the Gaussian instance
of the filtered-covariance relation in
[Germano (1992), section 3, equation 33](https://www.ams.jhu.edu/~eyink/Turbulence/classics/Germano92.pdf),
inspected in the original paper by the independent research reviewer.
Correlation already generated at a finer scale must be propagated, as
well as the correlation generated by further averaging.

Neither identity supplies a compact closure. For finite Fourier polynomials,
the exact Gaussian product written in terms of filtered factors has the
formal differential representation

\[
 P_t(ab)=\left.e^{t\Sigma:\nabla_x\nabla_y}
 [(P_ta)(x)(P_tb)(y)]\right|_{y=x}.
 \tag{5}
\]

Each Fourier pair k,l receives exp(-t k^T Sigma l). The derivative series
converges for this finite Fourier input, but opposite high frequencies
require many orders. In one dimension a=e^(ikx), b=e^(-ikx), truncation
through order N gives exp(-lambda)sum_{n=0}^N lambda^n/n!, lambda=tk^2,
instead of the exact product one. Every fixed N fails as lambda grows.

The Gaussian filtered-gradient expansion and its inverse-filter stability
problems are established prior art: see
[Eyink (2006), Appendix B](https://arxiv.org/pdf/nlin/0512022), discussing
Yeo, Bedford and Leonard. Its multiscale alternative still needs a model
of unresolved fields; a formal identity is not a cheap closure. In graphics,
[Yang and Barnes (2018), section 4.2](https://www.connellybarnes.com/work/publications/2018_shader_bandlimiting.pdf)
already includes covariance in product-mean propagation and approximates
it through several correlation models. An exact, inexpensive source-aware
correlation state would need to add more than the recognition of covariance.

Equations (3)-(5) assume a translation-invariant footprint. Allowing Sigma
to vary spatially inside the differential operator creates extra terms;
freezing it per pixel must not be confused with an exact global field law.

## 5. Geometry and unique indexing still need a composition price

For two frequency lattices, Lambda_1 intersect Lambda_2={0} does imply
unique decomposition k=m_1+m_2: subtract two decompositions. Pairwise
intersections do not establish this for three factors. With irrational
alpha, the lattices Z^2, alpha Z^2 and (1+alpha)Z^2 have pairwise trivial
intersections, yet v+alpha v-(1+alpha)v=0. The required multi-factor
condition is injectivity of the sum map from the direct sum of lattices,
or an explicitly represented and priced relation module.

Nor does uniqueness provide frequency separation. Let R rotate by pi/4,
let p^2-2q^2=1 be a positive Pell solution, m=(0,p), n=(q,q), and delta=m-n.
Then

\[
 (I-R)m+R\delta=m-Rn=(0,1/(p+\sqrt2q))\longrightarrow0,
\]

while ||delta|| grows. Discarding a shifted beat class because |R delta|
is large ignores cancellation by the other term. Each fixed nonzero beat
eventually damps under indefinitely broad averaging; a uniform cutoff over
all beats still requires a coefficient-tail or separation certificate.

For absolutely summable factor coefficients, one sufficient discarded-tuple
bound is sum_D |prod_j c_j(m_j)| exp[-(sum_j m_j)^T Sigma(sum_j m_j)/2].
Unique indexing does not bound this sum. Nonsummable families need another
justified remainder argument.

On a shared torus, polygonal piecewise-constant factors can instead be
compiled onto a common refinement. With explicit edges and transverse
general-position intersections, its size is O(V_0+E_0+I), where I counts
crossings. This is output-sensitive complexity: p vertical and q horizontal
stripe boundaries have pq crossings and pq resulting regions. The cost
can therefore still be multiplicative. A compact separable representation
may avoid that explicit refinement, so this is not an integration lower bound.
Overlaps, coincident vertices and periodic seams need their own event accounting.

Every pointwise operation on the already constant face values stays
constant on that refinement. A new coordinate predicate, continuous shading
or an independently warped factor can introduce additional boundaries.
Ordinary F=E-V torus counting assumes disk faces; parallel stripe partitions
have annular faces and do not satisfy that hypothesis.

## 6. A constructive next step

[RESONANT-PRODUCT-COST.md](RESONANT-PRODUCT-COST.md) gives an explicit
finite-band common-carrier family in which a bounded partial-frequency
state retains all cancellations that can reach the output. Its state is
constructed from the grammar with a stated transition count, not inferred
from a small output ellipse. A coefficient l1 bound controls absolute
arithmetic-error propagation, and a frequency gap gives a Gaussian remainder.

This is a restricted source-preserving closure using classical convolution.
It illustrates what the broader theory must deliver: declared source and
context families, a constructible interaction state, a scale law or valid
remainder, and a cost that includes composition and precision. General masks,
nonlinear warps and realistic lighting still need such a closure of their own.
