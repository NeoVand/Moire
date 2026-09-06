# What is classical, and what remains to contribute

2026-09-06. Primary-source research and theoretical synthesis. No new
implementation or measurements. This note narrows the novelty claims; it
does not establish novelty for the remaining candidate result.

The finite-state representation, averaging of unresolved detail, affine
moment closure, and Bernstein subdivision are established mathematics.
Our assembled Gaussian filtering contract is useful progress for a supplied
source class. A broadly useful material theory still needs a reason that
the required representation stays small and stable under composition.

## 1. Closest verified sources

**Kari, Image Processing Using Finite Automata (2006).** The original-author
[full chapter](https://www.researchgate.net/publication/31596873_Image_Processing_Using_Finite_Automata)
was inspected. Sections 7.2, 7.4 and 7.8 describe average-preserving images
as measures, weighted matrix representations, polynomial images, and
integration through transducers. Section 7.5 prices decoding, and section
7.6 constructs states from independent residual images. Thus neither
compressed images with meaningful coarse averages nor direct integration
in an automaton representation is new here.

One distinction matters: the Cartesian product construction multiplies
finite-resolution image values. If these values are regional means, their
product is generally not the regional mean of the pointwise product.
Our correlated source queries cannot be justified by multiplying already
filtered images. For a nonconstant binary mask, E[F^2]=E[F], whereas
(E[F])^2 differs whenever the mean lies strictly between zero and one.

**Culik and Karhumaki, Finite Automata Computing Real Functions (1994).**
The [publisher abstract](https://epubs.siam.org/doi/10.1137/S0097539791224893)
explicitly includes polynomial representations and integration in automaton
form. Access in this review was abstract-only; no exact theorem hypotheses
or section numbers from the full paper are asserted.

**Dahmen and Micchelli, Using the Refinement Equation for Evaluating
Integrals of Wavelets (1993).** The
[publisher abstract](https://epubs.siam.org/doi/10.1137/0730024)
describes integral evaluation through refinement and an eigenvector/moment
problem. This is close foundational work, although an equilibrium wavelet
construction and a finite-depth terminal-payoff source have different
hypotheses. Access here was abstract-only.

**Jorgensen, Kornelson and Shuman, Iterated Function Systems, Moments, and
Transformations of Infinite Matrices (2008).** The
[full primary text](https://arxiv.org/pdf/0809.2124), section 3.1 and
section 3.2, encodes affine transformations by triangular polynomial
matrices. Lemma 3.5 gives exact compatibility with finite truncation;
Proposition 3.6 addresses the equilibrium moment problem. Finite-degree
closure under affine maps is therefore an ingredient we use, not a new
closure principle. General nonlinear substitution need not preserve it.

**Farouki and Rajan, Algorithms for Polynomials in Bernstein Form (1988).**
The [IBM publication record](https://research.ibm.com/publications/algorithms-for-polynomials-in-bernstein-form)
describes arithmetic, substitution, subdivision and numerical conditioning
in this basis. This institutional abstract was inspected by the research
reviewer; the full paper was not inspected. Bernstein arithmetic alone is
not a new numerical method, nor does changing basis automatically certify
all intermediate calculations.

**Strain, The Fast Gauss Transform with Variable Scales (1991).** The
[author PDF](https://math.berkeley.edu/~strain/Publications/fgtvs.pdf),
sections 2 through 4, supplies localized Gaussian expansions with explicit
truncation bounds. Its explicit weighted point sources and targets differ
from a compact finite-state description of potentially exponentially many
source cells. Local Gaussian approximation with a remainder is established;
the source representation and the complete work accounting matter here.

**Balle and Mohri, Learning Weighted Automata (2015).** The
[author PDF](https://cs.nyu.edu/~mohri/pub/cai.pdf), section 3.2, Theorem 1,
states the classical Fliess characterization: over a field, the rank of
H_f(u,v)=f(uv) equals the minimum unrestricted weighted-automaton state
count. Section 3.3 distinguishes state minimization from transition cost.
This concerns exact linear representation, not necessarily a positive,
sparse or numerically stable one. Low rank in a finite sampled block also
does not by itself certify every unseen continuation.

## 2. What the current contract actually adds to our program

[GAUSSIAN-SUBDIVISION-COST.md](GAUSSIAN-SUBDIVISION-COST.md) assembles,
for the specified one-dimensional bounded finite-depth source:

- Gaussian tail and local polynomial allowances selected from the error budget;
- exact polynomial-weighted queries against the authored source;
- prefix, exact-leaf and sufficiently broad-footprint branches;
- a degree-independent global coefficient amplification bound below four;
- source-state, depth, degree, cell, table and precision costs.

The passages reviewed above did not supply that exact combined contract.
That is a limited literature finding, not a proof that the combination is
novel. In particular, the first complete cost statement in this project
must not be advertised as the first such result in the literature.

[GAUSSIAN-SUBDIVISION-2D.md](GAUSSIAN-SUBDIVISION-2D.md) extends the
amplification argument to rotated Gaussian footprints while preserving the
source axes. It does not remove anisotropy from the retained cell count.
Neither note establishes the GPU cost of general game materials.

## 3. A more useful organizing question

What information must a material retain so that every allowed downstream
operation and pixel footprint can still predict its visible response?

For a declared family Q of downstream queries, regard two intermediate
descriptions as equivalent only when every query in Q gives the same
response. An approximate version must bound the discrepancy over the
whole allowed query family, not just examples used to construct it.

This is an organizing proposal using classical observable-state ideas.
It is not a new theorem. The choice of Q does the work: it must include
the lighting, masks, products, coordinate transformations and footprint
weights that the claimed material class actually permits. An equivalence
that downstream composition can distinguish is not a valid reduction.

Count maps describe repeated phase structure. Digit states describe
repeated subdivision structure. Weighted states can describe affine
evolution of continuous quantities. They are different representations
that may support a small family of visible-response queries. None is
automatically small or sufficient for every material graph.

The research target is a bound on the size, transition work and numerical
sensitivity of such a representation, including its construction cost.
Renaming it a response space or quoting the unrestricted Hankel-rank
theorem would not supply that bound.

## 4. Real-valued output is already possible in the positive class

Here is an elementary extension of our source contract, using classical
weighted automata. Let every digit matrix T_d be nonnegative and row
stochastic, let pi be a probability row, and let g have entries in [0,1].
On a depth-m leaf with digit word w, define the unchanged source by

\[
 F(w)=\pi T_w g.
\]

It remains in [0,1]. This representation need not enumerate every possible
output value as a separate deterministic state.

For example, pi=(1-y_0,y_0), g=(0,1)^T, and

\[
 T_0=\begin{pmatrix}1&0\\1/2&1/2\end{pmatrix},\qquad
 T_1=\begin{pmatrix}1/2&1/2\\0&1\end{pmatrix}
\]

implement y'=(y+d)/2. There are 2^m distinct output values after m binary
digits using two linear states. The most recently read digit has the
largest weight; this example must not be confused with ordinary
most-significant-digit-first binary evaluation. Matrix probabilities
encode a deterministic value of the authored source, not randomization
of the material.

Using the restriction coefficients R from SUBDIVISION-FOOTPRINTS.md,
the normalized Bernstein recurrence remains

\[
 V_j^{(\ell)}=\frac1b\sum_{d,l}R_{d;jl}T_d V_l^{(\ell-1)}.
\]

Positivity and the identity (1/b) sum_{d,l} R_{d;jl}=1 keep the augmented
operator row stochastic. The contraction and coefficient-amplification
arguments still apply. Dense matrices increase source preparation to
O(ell b S^2 (J+1)^2) and one length-k prefix evaluation to O(k S^2).
After constructing that prefix row, querying all moments costs another
O(S(J+1)) per cell. Actual sparsity can reduce transition work; matrix
representation costs must be counted rather than hidden behind state count.

Rounded prefixes need their own allowance. If initial L1 error is delta_pi,
each approximate transition is row stochastic with matrix infinity-norm
error at most eta_T, and each row update has L1 arithmetic error at most
tau_pi, then prefix error is at most delta_pi+k(eta_T+tau_pi). Its action
on any normalized moment in [0,1]^S has at most that error. The global
Gaussian coefficient bound then prices its propagation. Unlike an exact
deterministic prefix traversal, weighted prefix arithmetic is not free.

This extension broadens the representable values; the finite-depth source
is still piecewise constant, not a continuous function. It does not establish
small closure through arbitrary thresholds, warps or nonlinear lighting.
An unrestricted signed realization may be smaller but loses this immediate
positive stability argument. These distinctions are central, not numerical
details to defer until implementation.

## 5. The next theory deliverable

Select a compositional material family and exhibit its response state,
the exact or bounded-error update under each permitted operation, and a
joint bound for state size, transitions, footprint dependence and numerical
error. Identify where compression is necessary and what property makes
it valid for the unchanged source. If the state multiplies at each mask
or warp, that growth is the problem to solve.

The eventual demonstration should test that claim. At present the claim
itself, especially composition cost and anisotropic reuse, is unfinished.
