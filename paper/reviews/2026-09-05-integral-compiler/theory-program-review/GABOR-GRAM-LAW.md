# A certified interaction law for a finite authored Gabor field

2026-09-06. Theory only, independently derived and checked during the
Codex–Claude exchange, messages 189–194. No implementation or benchmark.
The coherent-state algebra and Gaussian feature-aggregation principle are
established mathematics. Novelty of this material-filtering application
has not been established.

## 1. The result and its source contract

For a finite sum of Gaussian-windowed harmonics sharing one envelope
precision, its filtered squared magnitude is a positive-semidefinite
interaction form. It can be evaluated through aggregated features without
enumerating every atom pair. The required feature count depends on the
spread of centers and relative frequencies under the footprint, together
with authored amplitudes and the requested absolute error.

This explains one way a common oscillation can disappear from the cost
while its relative-phase interactions survive. It does not say every source
has small spread or a cheap cluster partition.

Let

\[
 f_j(x)=a_j\exp[-\tfrac12(x-c_j)^TA(x-c_j)]
 e^{i\omega_j^Tx},\qquad
 F(x)=\sum_{j=1}^Jf_j(x),\qquad A\succ0.
 \tag{1}
\]

The list is finite and specified. Amplitudes a_j may be complex; envelope
centers c_j and angular frequencies ω_j are real. The target material is
|F|². Kernels are untruncated. There is no implicit Poisson process, periodic
image sum, or replacement of a fixed realization by an ensemble mean.

The footprint is specified exactly as

\[
 X=\mu+DZ,\qquad Z\sim N(0,I_r),
 \tag{2}
\]

where D has r independent columns and x may have dimension d≥r.
Thus Σ=DD^T may be singular. A rank-two affine screen footprint in a
three-dimensional material has r=2. A local affine model of a nonlinear
camera or warp requires its own source/model error bound; (2) alone does
not establish that model's validity.

All costs below are arithmetic upper bounds. They include reading the atom
list and forming features, but do not certify floating-point stability or
GPU execution time. Clustering is supplied or separately charged.

## 2. Absorb a reference atom into the footprint

Choose any real reference center c_0 and carrier ω_0. Define

\[
 M=I_r+2D^TAD,\quad H=M^{-1},\quad C=DHD^T=LL^T,
 \tag{3}
\]

where L has r columns, for example L=DH^(1/2). Put

\[
 m=\mu-2CA(\mu-c_0),
\]

\[
 W(c_0)=\det(M)^{-1/2}
 \exp[-q^TAq+2q^TACAq],\qquad q=\mu-c_0.
 \tag{4}
\]

Completing the square in the latent variable Z proves that W(c_0) is
\(\mathbb E\exp[-(X-c_0)^TA(X-c_0)]\), and that the normalized measure
weighted by this squared envelope is Gaussian with mean m and covariance C.
No inverse of singular Σ is needed.

Set d_j=c_j−c_0, ν_j=ω_j−ω_0, and

\[
 b_j=L^T(Ad_j+i\nu_j)\in\mathbb C^r,
\]

\[
 \beta_j=a_j\exp[
 d_j^TA(m-c_0)-\tfrac12d_j^TAd_j+i\nu_j^Tm].
 \tag{5}
\]

Dividing every atom by the reference atom, then absorbing the squared
reference envelope into the measure, gives exactly

\[
 V:=\mathbb E|F(X)|^2
 =W(c_0)\,\mathbb E_{Y\sim N(0,I_r)}
 \left|\sum_j\beta_je^{b_j^TY}\right|^2.
 \tag{6}
\]

The common carrier cancels from the squared magnitude. Removing a common
real exponential also changes the Gaussian measure and coefficients;
equations (3)–(5) retain that change.

The relevant phase-space radius is

\[
 R^2=\max_j\|b_j\|^2
 =\max_j\{d_j^TACA\,d_j+\nu_j^TC\nu_j\}.
 \tag{7}
\]

It depends on relative centers and frequencies, not their common carrier.

## 3. Exact Hermite features and a positive residual

Let H_α=He_α/sqrt(α!) be the orthonormal probabilists' Hermite polynomials
for N(0,I_r). For complex b, their generating function is

\[
 e^{b^TY}=e^{b^Tb/2}
 \sum_{\alpha\in\mathbb N^r}
 \frac{b^\alpha}{\sqrt{\alpha!}}H_\alpha(Y).
 \tag{8}
\]

Here b^Tb is bilinear. It is not the Hermitian squared norm ||b||².
The expansion converges in Gaussian L2 for each finite b.

Define

\[
 \gamma_j=\sqrt{W(c_0)}\,\beta_je^{b_j^Tb_j/2},
 \qquad
 v_\alpha=\sum_j\gamma_j
 \frac{b_j^\alpha}{\sqrt{\alpha!}}.
 \tag{9}
\]

Parseval applied to (6) gives

\[
 V=\sum_{\alpha\in\mathbb N^r}|v_\alpha|^2,
 \qquad
 V_p=\sum_{|\alpha|\le p}|v_\alpha|^2.
 \tag{10}
\]

Therefore V−V_p is precisely the discarded orthogonal-projection energy.
It is nonnegative. There is no retained/discarded cross term to estimate.

The individual atom energy is

\[
 E_j=\mathbb E|f_j(X)|^2=|a_j|^2W(c_j)
 =|\gamma_j|^2e^{\|b_j\|^2}.
 \tag{11}
\]

In W(c_j), replace c_0 by c_j in (4); C and M are unchanged.
Since the envelope in (1) has magnitude at most one, sqrt(E_j)≤|a_j|.

Let

\[
 T_p(\lambda)=e^{-\lambda}\sum_{n=p+1}^\infty
 \frac{\lambda^n}{n!}
 =\Pr\{\operatorname{Poisson}(\lambda)>p\}.
 \tag{12}
\]

The multinomial identity gives the exact omitted squared norm of atom j
in feature space as E_j T_p(||b_j||²). Applying the triangle inequality
to the sum of omitted feature vectors proves

\[
 0\le V-V_p\le
 \left[\sum_j\sqrt{E_j}
 \sqrt{T_p(\|b_j\|^2)}\right]^2
 \le S^2T_p(R^2),
 \quad S=\sum_j\sqrt{E_j}.
 \tag{13}
\]

The appearance of a Poisson tail here is an exact feature-series identity,
not a stochastic model for the authored atoms.

## 4. Rank, work, and the limits of the guarantee

Retaining all multi-indices of total degree at most p uses

\[
 D_p=\binom{p+r}{r}
 \tag{14}
\]

features. Their accumulation requires O(JD_p) arithmetic for fixed r,
followed by an O(D_p) squared norm. Features can be generated and accumulated
one atom at a time with O(D_p) accumulator storage. Coordinate preparation
and the matrix operations in (3) are additionally bounded by
O(Jd²+d²r+d r²+r³) work with straightforward dense algebra. Fixed source
products involving A and the centers can be prepared once, but that is
not assumed free here. For r=0, direct evaluation at μ is exact and uses
one feature.

This improves on forming J² interactions when D_p is much smaller than J.
Reading the authored list still costs at least O(J) in this construction.
The theorem does not guarantee that D_p is small.

For λ>0 and n=p+1>λ, the elementary Chernoff bound gives

\[
 T_p(\lambda)\le e^{-\lambda}(e\lambda/n)^n.
 \tag{15}
\]

For 0<ε<S², one conservative sufficient choice is an integer n satisfying

\[
 n\ge\max\{1,2eR^2,\log_2(S^2/\epsilon)\},\qquad p=n-1.
 \tag{16}
\]

Then (13) is at most ε. When R=0, p=0 is exact. S=0 is the zero field in
the footprint norm. If ε≥S², returning zero already meets the absolute
error budget.

For fixed r the sufficient rank is consequently

\[
 O((1+R^2+\log(S^2/\epsilon))^r).
 \tag{17}
\]

Complex phase space has 2r real coordinates but only r polynomial indices.
In particular, r=2 gives D_p=(p+1)(p+2)/2, including a two-dimensional
affine footprint embedded in a three-dimensional source.

This is an absolute-error certificate. Destructive cancellation can make
V much smaller than S², so a relative-error guarantee requires additional
information. Forming exponentials and their cancelling products stably is
also a separate numerical task.

## 5. Multiple clusters must retain or bound interference

The same Gaussian calculation yields, for nonzero atoms,

\[
 \frac{|\mathbb E[\overline{f_i(X)}f_j(X)]|}
 {\sqrt{E_iE_j}}
 =\exp[-\tfrac12\|z_i-z_j\|^2],
 \quad z_j=L^T(Ac_j+i\omega_j).
 \tag{18}
\]

The full normalized complex interaction, after per-atom phase factors, is
the coherent-state kernel
\(\exp[-(\|z_i\|^2+\|z_j\|^2)/2+z_i^*z_j]\).
Its phase must remain in any retained interaction. Replacing it by its
magnitude would change the source's interference.

Suppose a supplied cluster C has phase-space center z_C, radius R_C, and
S_C=sum_(j in C) sqrt(E_j). For two clusters define

\[
 d_{CD}=\max(0,\|z_C-z_D\|-R_C-R_D).
 \tag{19}
\]

The triangle inequality in phase space and (18) bound all omitted cross
interactions by

\[
 2\sum_{C<D}S_CS_D e^{-d_{CD}^2/2}.
 \tag{20}
\]

Compute each cluster energy in its own reference basis using (3)–(13).
Then

\[
 \left|V-\sum_C V_{C,p_C}\right|
 \le\sum_C S_C^2T_{p_C}(R_C^2)
 +2\sum_{C<D}S_CS_D e^{-d_{CD}^2/2}.
 \tag{21}
\]

This bound is two-sided: dropping cross terms destroys the lower-bound
property of a single common projection. Nearby clusters must be merged,
coupled explicitly, or assigned an error budget large enough to cover them.
Testing every cluster pair itself costs O(number of clusters squared).
A faster cluster hierarchy, list search, or merging rule requires its own
proof and cost accounting; it is not contained in (21).

## 6. Real sources, nonlinear responses, and periodic images

A real Gabor field is represented by conjugate atom pairs. If F=Re U,

\[
 F^2=\tfrac12|U|^2+\tfrac12\operatorname{Re}(U^2).
 \tag{22}
\]

The first term loses a common carrier; the second carries sum frequencies.
The theorem covers F² by applying it to the full conjugate list. Positive
and negative frequency clusters cannot be separated without paying (20).
Thus no uniform independence from carrier frequency is claimed for an
arbitrary real-field square in the near field.

For two real sources f,g sharing the envelope contract,
fg=((f+g)²−(f−g)²)/4 extends the construction to cross products with the
corresponding error budgets. Fixed quadratic material responses can be
treated by polarization or a fixed response matrix. The number of response
channels and their coefficients must be charged. Higher-degree products
remain finite Gaussian-exponential sums, but this alone does not prove an
O(JD_p) algorithm without expanding their authored atom list.

Different envelope precisions, Gaussian mixtures of a nonlinear gradient,
normalized bump normals, general specular responses, thresholds, and phasor
singularities are not covered by this construction. They need separate
source and approximation contracts. A Gaussian of a nonlinear noise value
is not automatically a finite sum of Gaussian atoms in x.

Periodizing (1) creates an infinite image list. Applying the finite theorem
then requires a certified finite image selection, or another periodic
representation. If F is replaced by a finite approximation F_t with
\(\|F-F_t\|_{L^2(\text{footprint})}\le\delta\), its intensity error is at
most δ(2||F_t||_2+δ), before adding the feature truncation error. A continuum
tail integral times lattice density is not by itself a shifted-lattice
certificate.

## 7. Prior art and the organizing interpretation

[Glauber's coherent-state theory](https://doi.org/10.1103/PhysRev.131.2766)
already supplies the normalized monomial features and their Gaussian
overlap. [Greengard and Strain's Fast Gauss Transform](https://math.nyu.edu/~greengar/fgt_1991.pdf)
aggregates Gaussian sources through Hermite/Taylor moments. The generic
pair-sum-to-feature-sum principle is particularly explicit in
[Joshi et al., Comparing Distributions and Shapes using the Kernel Distance,
§4.2](https://www-old.cs.utah.edu/~jeffp/papers/kernelnorm.pdf).
Their diameter- and accuracy-dependent constructions are direct precedents.

The error bound above is derived from the exact orthogonal feature series;
it does not import the original Fast Gauss Transform Lemma 2.1 estimate,
which was corrected by
[Baxter and Roussos](https://doi.org/10.1137/S1064827501396920).

[Sparse Gabor Convolution](https://www-sop.inria.fr/reves/Basilic/2009/LLDD09/LLDD09PNSGC_paper.pdf)
is the direct graphics foundation for analytically filtering linear
Gaussian-windowed noise. A Gaussian window has spectral tails at every
frequency, so it is not strictly band-limited. For a finite isolated source,
wide-footprint decay and the kernel's low-frequency mass must be retained.
A periodic source instead approaches its normalized DC under an
isotropically broadening Gaussian. These are distinct source contracts.

The useful identification here is that a specified footprint turns
quadratic material interactions into a Gram law in a small complex phase
space. Relative geometry controls an explicit sufficient feature budget.
This is another concrete way to preserve visible interactions while
compressing the state used to evaluate them. General material closure,
novelty, and practical gaming cost remain open.
