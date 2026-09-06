# A finite carry state for polynomial noise materials

2026-09-06. Theory only; no implementation, benchmark, source replacement,
or claim of production performance. Derived during the Codex–Claude exchange,
bridge messages 174–183. The construction and its error accounting were
independently reviewed. Novelty has not been established.

## 1. The constructive result

A restricted family of existing XOR-hash noise constructions admits a
compact representation of a whole polynomial material. Its state consists
of one common hash key and two integer-carry classes. Polynomial composition
increases the degree of the response, but does not increase the number of
carry classes.

Let P=2^b, b≥1. Identify the integers 0,…,P−1 with b-bit vectors. Let
A_x and A_y be invertible linear maps over GF(2). A noise gradient component
has a specified lookup profile f and hash

\[
 G_{ij}=f(A_x i\oplus A_y j).
 \tag{1}
\]

Constant XOR seeds are absorbed into f. Several noise fields may have
different specified profiles, but must share these axis maps and the same
unit-cell grid. A fixed integer slice of a three-dimensional XOR hash has
this form. Indices of the lattice cells are still added as integers modulo P;
that addition is not XOR.

[Kensler, Knoll and Shirley, Better Gradient Noise, §2](https://sci.utah.edu/publications/SCITechReports/UUSCI-2008-001.pdf)
propose separate axis permutations combined by XOR. Equation (1) restricts
those permutations to GF(2)-affine maps. Their quality results for general
permutations do not establish quality for this restriction. Keep their
optional changes to reconstruction kernels separate: the proof here uses
the usual separable quintic gradient-noise reconstruction.

Let the final scalar material be a specified polynomial of total degree K
in a finite collection of those noise values. Set Q=6K, or use any sharper
proved upper bound on each coordinate degree. The source in each cell has
bidegree at most (Q,Q). Quintic gradient noise itself has bidegree at most
(6,6), with total spatial degree at most eleven. Total shader degree and
spatial bidegree are different quantities.

For a native-coordinate Gaussian with independent coordinates, the result
below provides an approximation with absolute error at most ε. Its costs
include preparation, representation size, and weight construction. They
do not grow with the two Gaussian widths. They can grow substantially with
K and with a coefficient amplification bound.

These are exact-real arithmetic counts. Fixed-degree Gaussian moments,
elementary functions, and Walsh transforms are counted explicitly below;
floating-point error, stability, bit complexity, and GPU scheduling are not
certified by this theorem.

## 2. Why the entire cell shares one state

Define

\[
 g_{ij}=A_xi\oplus A_yj,\qquad
 \delta_i=A_x((i+1)\oplus i),\qquad
 \eta_j=A_y((j+1)\oplus j).
 \tag{2}
\]

Increments and the wrap in (2) are modulo P. The increment masks
(i+1) XOR i are precisely

\[
 2^k-1,\qquad k=1,\ldots,b.
 \tag{3}
\]

Trailing runs of one bits give these masks. The wrap from P−1 to zero
repeats the all-bits mask; it does not add a class. Invertibility of each A
preserves the number of classes. Write D_x,D_y≤b for their counts.

Every corner of cell (i,j) therefore has one of the four keys

\[
 g,\quad g\oplus\delta_i,\quad
 g\oplus\eta_j,\quad g\oplus\delta_i\oplus\eta_j.
 \tag{4}
\]

All gradient components of all the allowed noise fields are functions of
these keys. Their local interpolation weights depend only on local cell
coordinates t,u∈[0,1). Thus the complete polynomial shader has coefficients
that depend only on (g,δ_i,η_j). A product does not require another independent
copy of the carry state: its factors refer to the same four corners.

This proves the exact representation

\[
 F(i+t,j+u)=\sum_{\alpha,\beta=0}^{Q}
 h_{\delta_i,\eta_j,\alpha,\beta}(g_{ij})
 B_\alpha^Q(t)B_\beta^Q(u),
 \tag{5}
\]

where B_α^Q(t)=binom(Q,α)t^α(1−t)^(Q−α) is the Bernstein basis.
Conversion to this basis is finite algebra. Its construction cost is charged
separately; no assumption is made that compiling an arbitrary polynomial
expression is free.

Define the finite bound

\[
 B=\max_{\delta,\eta,\alpha,\beta,g}
 |h_{\delta,\eta,\alpha,\beta}(g)|.
 \tag{6}
\]

The basis is nonnegative and sums to one, so |F|≤B. This B is a coefficient
bound, not the true range of F. It may be much larger, especially at high
degree. Computing the maximum over the constructed tables is included in
preparation. B=0 is the identically zero material.

## 3. Exact footprint pairing by masked Walsh contractions

Let p_x,p_y be normalized one-dimensional Gaussian densities. For
0≤i<P define periodized cell weights

\[
 u_\alpha(i)=\sum_{\ell\in\mathbb Z}\int_0^1
 B_\alpha^Q(t)p_x(i+\ell P+t)\,dt,
 \qquad
 v_\beta(j)=\sum_{\ell\in\mathbb Z}\int_0^1
 B_\beta^Q(u)p_y(j+\ell P+u)\,du.
 \tag{7}
\]

They are nonnegative, with

\[
 \sum_{i,\alpha}u_\alpha(i)=
 \sum_{j,\beta}v_\beta(j)=1.
 \tag{8}
\]

Mask each vector by its carry class, then reindex by the invertible axis map:

\[
 w_{\delta,\alpha}(a)=
 \mathbf1_{\delta_{A_x^{-1}a}=\delta}
 u_\alpha(A_x^{-1}a),
 \quad
 z_{\eta,\beta}(a)=
 \mathbf1_{\eta_{A_y^{-1}a}=\eta}
 v_\beta(A_y^{-1}a).
 \tag{9}
\]

For the unnormalized Walsh transform
\(\widehat f(k)=\sum_a(-1)^{k\cdot a}f(a)\),
character orthogonality gives

\[
 \mathbb EF=
 \frac1P\sum_{\delta,\eta,\alpha,\beta,k}
 \widehat h_{\delta,\eta,\alpha,\beta}(k)
 \widehat w_{\delta,\alpha}(k)
 \widehat z_{\eta,\beta}(k).
 \tag{10}
\]

This is an exact contraction identity. A profile transform is prepared once.
Only D_x(Q+1) row transforms and D_y(Q+1) column transforms are needed per
query; they are reused across all class pairs and coefficient pairs.

The costs, before approximating the weights, are

\[
\begin{aligned}
 \text{table storage}&=O(PD_xD_y(Q+1)^2),\\
 \text{preparation}&=C_{\rm coeff}+
 O(PD_xD_y(Q+1)^2\log P),\\
 \text{query contraction}&=
 O((D_x+D_y)(Q+1)P\log P+
 PD_xD_y(Q+1)^2).
\end{aligned}
 \tag{11}
\]

C_coeff includes forming the cell polynomials for each (g,δ,η), evaluating
the supplied shader polynomial algebraically, and conversion to Bernstein
coefficients. With D_x,D_y≤b and log₂P=b, these become storage
O(Pb²(Q+1)²), preparation C_coeff+O(Pb³(Q+1)²), and contraction
O(Pb²(Q+1)²). Small P or large degree can make these constants unattractive;
this is a sufficient construction, not an optimal representation theorem.

## 4. Weights at every Gaussian width, including their error

Approximate each full weight array in (7) with joint l1 error at most δ:

\[
 \sum_{i,\alpha}|\widetilde u_\alpha(i)-u_\alpha(i)|\le\delta,
 \qquad
 \sum_{j,\beta}|\widetilde v_\beta(j)-v_\beta(j)|\le\delta.
 \tag{12}
\]

Carry masking and reindexing partition the entries and do not enlarge
these norms. The kernel coefficients in (5) are bounded by B. Expanding
the two perturbed factors and using (8) gives

\[
 |\widetilde{\mathbb EF}-\mathbb EF|
 \le B(2\delta+\delta^2).
 \tag{13}
\]

The approximated weights may be signed; positivity is not used in (13).
For B>0 choose δ=min(1,ε/(3B)). Then (13) is at most ε.

Here is one explicit weight construction, in the same exact-real model
as [the diagonal Perlin theorem](NOISE-HASH-FILTERING.md).

For 0<σ≤P, choose R=sqrt(2 log(2/δ)). Retain every full unit cell meeting
[μ−Rσ,μ+Rσ], integrate its Bernstein polynomials against the Gaussian, and
fold the cell index modulo P. O(P[1+R]) cells suffice. Since the Bernstein
basis partitions unity, the total omitted weight over every i and α is at
most the Gaussian tail probability, bounded by δ. A conservative
O((Q+1)²) arithmetic budget per cell forms the needed polynomial moments
and basis conversions. This is an arithmetic count, not a claim that an
unstable monomial recurrence is a good numerical implementation.

For σ>P, let ψ_α(t)=B_α^Q(t) on [0,1), zero elsewhere, and
\(\widehat\psi_\alpha(\xi)=\int_0^1B_\alpha^Q(t)e^{-i\xi t}dt\).
The exact periodized weight is

\[
 u_\alpha(i)=\frac1P\sum_{n\in\mathbb Z}
 \widehat\psi_\alpha(2\pi n/P)
 e^{i2\pi n(\mu-i)/P}
 e^{-a n^2},\qquad a=2\pi^2\sigma^2/P^2>2\pi^2.
 \tag{14}
\]

The signs in (14) pair the negative-exponent basis transform with the
positive phase of the Gaussian center. Their integral bound gives

\[
 |\widehat\psi_\alpha(\xi)|\le\frac1{Q+1},
 \qquad\sum_\alpha|\widehat\psi_\alpha(\xi)|\le1.
 \tag{15}
\]

Truncating (14) to |n|≤N therefore incurs joint l1 error at most

\[
 \sum_{|n|>N}e^{-an^2}
 \le\frac{e^{-aN^2}}{aN},\quad N\ge1.
 \tag{16}
\]

The choice N=max(1,ceil(sqrt(log(1/δ)/(2π²)))) suffices. The basis transforms
are finite polynomial-exponential integrals with removable zero-frequency
singularities. All entries can conservatively be formed in
O(P(Q+1)N+(Q+1)²N) arithmetic. At σ=0, use the exact local basis values in
the containing half-open cell. The continuous source has the same boundary
value from either neighboring cell.

For both coordinates, a safe combined weight budget is consequently

\[
 W_{\rm weights}=
 O\!\left(P(Q+1)^2[1+\sqrt{\log(2/\delta)}]\right).
 \tag{17}
\]

Equations (11), (13), and (17) give the complete conditional query bound

\[
 O\!\left(P(Q+1)^2
 [b^2+1+\sqrt{\log(2/\delta)}]\right),
 \quad\delta=\min(1,\epsilon/(3B)).
 \tag{18}
\]

Both Gaussian widths have disappeared from this upper bound. Source period,
polynomial degree, coefficient amplification, preprocessing, and numerical
precision have not.

## 5. Why counting combined XOR labels is insufficient

For arbitrary axis permutations P_x,P_y, a product involving a cell shift
has the form

\[
 H_{ij}=f_a(P_x[i]\oplus P_y[j])
 f_b(P_x[i+d]\oplus P_y[j+e]).
\]

Let Δ_i=P_x[i+d] XOR P_x[i] and E_j=P_y[j+e] XOR P_y[j]. The profile
h_t(r)=f_a(r)f_b(r XOR t) can be reused for identical t, but its mask

\[
 M_t(i,j)=\mathbf1_{\Delta_i\oplus E_j=t}
\]

is generally not separable. The safe fast contractions are indexed by the
pairs (Δ,E), using a row mask and column mask for each pair. Their count is
D_xD_y, not automatically the number of distinct combined XOR labels.
M_t has real matrix rank equal to its number of nonempty matching class
pairs, because those pairs match disjoint row and column classes.

For example, with P=8, identity hashes and unit shifts, (i,j)=(0,2) and
(1,3) have the same key 2, but their combined carries are respectively zero
and four. The mask cannot be absorbed into a function of the common key.

An alternative exact lift puts row weight at (P_x[i],Δ_i), column weight
at (P_y[j],E_j), and uses K(s,t)=f_a(s)f_b(s XOR t) on the product group.
Its two-dimensional Walsh transform is

\[
 \widehat K(a,b)=\widehat f_a(a\oplus b)\widehat f_b(b).
\]

That is a P²-point convolution route, with O(P² log P) arithmetic; it does
not establish a P-point closure. Neither this route nor the class-pair
route proves a lower bound on every possible algorithm.

## 6. A limited decorrelation counterexample

Small carry-state count alone does not force nonzero ensemble correlation
between immediate neighbors. For an independently sampled centered gradient
table T with covariance C and a deterministic hash H,

\[
 \mathbb E_T[T(H(x))T(H(y))^T]
 =C\mathbf1_{H(x)=H(y)}.
 \tag{19}
\]

Let P=256, Gray(i)=i XOR (i shifted right by one bit), and let S cyclically
shift eight bits. M=I+S+S² is invertible over GF(2): x⁸−1=(x+1)⁸, while
1+x+x² does not vanish at x=1. Set

\[
 H(i,j)=\operatorname{Gray}(i)\oplus M\operatorname{Gray}(j).
 \tag{20}
\]

The cyclic Gray sequence changes by one bit at every unit step, including
wrap. A unit x step therefore changes one hash bit, and a unit y step
changes three distinct hash bits. A diagonal unit step combines a one-bit
and three-bit change, which cannot cancel. Every base point has a different
hash from each of its eight immediate neighbors. Each axis still has just
eight difference classes. Equation (19) gives zero ensemble covariance for
all those lags.

This is not a claim about all pairs in the surrounding 3×3 block, about
distant lags, higher-order independence, reconstructed-field spectra, or
the visual quality of one fixed table. A lookup sampled without replacement
from a fixed centered population has covariance −C/(P−1) between distinct
entries, so that model must not be substituted into (19). The actual fixed
Perlin source is neither an ensemble average nor automatically (20).

The construction refutes a particular necessity argument. It does not
recommend a production hash. The spectral defects in Better Gradient Noise
are evidence about the sources that paper studies, not a general lower bound
linking perceptual quality to carry-state count.

## 7. What this says about the organizing theory

Three structures must be distinguished:

1. The algebra of material responses at the same point.
2. How translating the source changes its retained state.
3. How a pixel footprint pairs with that state and those responses.

For every phase map θ(x), even a curved one,
exp(i n·θ(x)) exp(i m·θ(x))=exp(i(n+m)·θ(x)). Affinity makes the Gaussian
footprint pairing simple; it is not required for this character product
identity. Translated products introduce θ(x+d)−θ(x), a separate question.
An arbitrary curved source is not made exact by retaining its quadratic jet.

Here the local corner state is stable through polynomial material
composition, and the Bernstein responses pair with the footprint through
group contractions. This is one explicit finite effective material law,
with a degree cost and a source restriction. It is a constructive example
of how composition can stay compact without enumerating every lattice cell.

Thresholds, general nonlinear transfer functions, coordinate warps,
unrelated noise grids or axis maps, arbitrary three-dimensional slices,
and correlated native-coordinate footprints are outside this theorem.
Approximating a nonlinear response by a polynomial adds a separate source
approximation error and a degree-selection problem. A correlated Gaussian
can be separated with the audited Hermite-function certificate, but the
high-order signed-weight cost does not follow from the fixed-degree
Gaussian weight proof above.

The next useful question is which established, visually acceptable source
families admit an equally small state, and which additional material
operations preserve it. No impossibility claim follows from the families
that fail this construction.
