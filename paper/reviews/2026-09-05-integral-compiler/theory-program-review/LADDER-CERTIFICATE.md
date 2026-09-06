# A finite certificate for the two-carrier beat law

2026-09-06. Theory only; no new numerical experiment or implementation.

This supplies a proved replacement for the spectral error estimates in bridge
messages 112 and 120. It complements [SHARED-PHASE-COST.md](SHARED-PHASE-COST.md):
the interval representation evaluates the retained beat law, while this note
bounds the error made in eliminating the other families. The tools are
classical Fourier analysis and elementary Gaussian lattice estimates. The
result is restricted to two affine carriers and single-arc masks.

## 1. Source, retained law, and exact identity

Let A and B be indicators of single arcs on the circle of period 2π, with
fractions p and q. Use normalized Fourier coefficients. Thus Ahat_0=p,
Bhat_0=q, and for nonzero integers

\[
 |\widehat A_k|=\frac{|\sin(\pi p k)|}{\pi|k|},\qquad
 |\widehat B_l|=\frac{|\sin(\pi q l)|}{\pi|l|}.
\]

Let X have distribution N(0,σ²), with σ>0, and let
0<δ<ω and b=ω−δ. Define

\[
 V=\mathbb E[A(\omega X+u)B(bX+v)],\qquad
 h(s)=\frac1{2\pi}\int_0^{2\pi}A(\theta)B(\theta-s)\,d\theta,
\]
\[
 V_0=\mathbb E[h(\delta X+u-v)].
\]

The exact source response is

\[
 V=\sum_{k,l\in\mathbb Z}\widehat A_k\widehat B_l
 e^{i(ku+lv)}e^{-\sigma^2(k\omega+lb)^2/2}.
 \tag{1}
\]

Grouping n=k+l gives the family rate nω−lδ. The family n=0 is
exactly V_0. Consequently

\[
 |V-V_0|\le S:=
 \sum_{k+l\ne0}|\widehat A_k\widehat B_l|
 e^{-\sigma^2(k\omega+lb)^2/2}.
 \tag{2}
\]

These statements do not assume independent phases. The infinite bound S is
mathematical, not yet a finite algorithm.

Both the identity and absolute convergence have short justifications here.
For any spacing d>0 and real z,

\[
 \sum_{j\in\mathbb Z}e^{-\sigma^2(z+jd)^2/2}
 \le 1+\frac{\sqrt{2\pi}}{\sigma d}.
 \tag{3}
\]

One proof uses layer cake: an interval of radius r contains at most 1+2r/d
lattice points, and integration against the Gaussian level sets gives (3).
The Gaussian matrix in (1) therefore has uniformly bounded row and column
sums. The Schur bound and the square summability of the Fourier coefficients
prove absolute convergence. Independently smooth each arc by a positive
periodic heat kernel, integrate the absolutely convergent smooth expansions,
then remove the smoothing. Each source phase has nonzero rate, so the Gaussian
source measure assigns zero mass to its countable set of boundary crossings.
Bounded convergence on the source and domination by the full absolute series
justify (1). A slice-wise almost-everywhere Fourier assertion alone would not.

## 2. A certificate with constant arithmetic cost

Choose any T with 0<T<b. Put

\[
 f_T=e^{-\sigma^2T^2/2},\qquad
 I_T=\int_T^\infty e^{-\sigma^2r^2/2}\,dr.
\]

Then

\[
 \boxed{|V-V_0|\le N_T+\Lambda+R_T}
 \tag{4}
\]

with

\[
 N_T=\frac{\delta^2+\sqrt{2\pi}\,\delta/\sigma}
 {3(\omega-T)(b-T)},\qquad
 R_T=\frac23 f_T+\frac13\left(\frac1b+\frac1\omega\right)I_T,
 \tag{5}
\]
\[
 \Lambda=
 -\frac2\pi\left[
 q\log(1-e^{-\sigma^2\omega^2/2})
 +p\log(1-e^{-\sigma^2b^2/2})\right].
 \tag{6}
\]

This is an a priori bound, not an assertion that it is tight. It may be
intersected with the trivial bound 1 and with the corrector certificate.
For the latter, the two-arc theorem in SHARED-PHASE-AVERAGING.md gives

\[
 |V-V_0|\le
 \frac{\sqrt{\pi/2}/\sigma+\delta}{\omega}.
\]

No special-function evaluation is necessary in (5): one may use

\[
 I_T\le f_T\min\left\{\frac{\sqrt{\pi/2}}{\sigma},
                         \frac1{\sigma^2T}\right\}.
 \tag{7}
\]

The first inequality follows by writing r=T+z and dropping the cross term;
the second is the Gaussian tail bound obtained from r/T≥1.
Arithmetic, logarithm, and exponential evaluations are counted as primitives
here. A floating-point certificate still needs upward error allowances.

### Near windows: the discrete resonance contribution

Take k,l nonzero, n=k+l nonzero, and |nω−lδ|≤T. Then

\[
 |l|\ge\frac{|n|\omega-T}{\delta},\qquad
 |k|\ge\frac{|n|b-T}{\delta}.
\]

For a fixed n, bound the coefficient product by the reciprocal of these
lower bounds divided by π², and the entire Gaussian sum over l by (3)
with spacing δ. This gives

\[
 \frac{\delta^2+\sqrt{2\pi}\delta/\sigma}
 {\pi^2(|n|\omega-T)(|n|b-T)}.
\]

Since |n|ω−T≥|n|(ω−T), and similarly for b, summing over all nonzero n
and using \(\sum_{n\ne0}n^{-2}=\pi^2/3\) gives N_T.
The δ² term comes from the unit lattice mass in (3); dropping it loses
exact resonances.

### Far windows: no Gaussian tail is discarded

For k,l nonzero, use

\[
 \frac1{|kl|}\le\frac12(k^{-2}+l^{-2}).
\]

For any shifted lattice of spacing d, the Gaussian sum outside [-T,T]
is at most 2f_T+2I_T/d. On each side, charge the first lattice point f_T
and bound subsequent decreasing values by the corresponding integral.
For the k^{-2} part sum first over l, with spacing b; for the l^{-2} part
sum first over k, with spacing ω. Then sum the reciprocal squares:

\[
 \frac1{2\pi^2}\frac{\pi^2}{3}
 \left[2f_T+\frac{2I_T}{b}
       +2f_T+\frac{2I_T}{\omega}\right]=R_T.
\]

Including the n=0 family in this tail estimate only enlarges it.

### Axes: arbitrary arc widths require their DC weights

The exact absolute contribution of k=0 or l=0, excluding the origin, is

\[
 \Lambda_{\rm exact}=
 \frac{2q}{\pi}\sum_{j\ge1}
 \frac{|\sin(\pi pj)|}{j}e^{-\sigma^2\omega^2j^2/2}
 +\frac{2p}{\pi}\sum_{j\ge1}
 \frac{|\sin(\pi qj)|}{j}e^{-\sigma^2b^2j^2/2}.
\]

Use |sin|≤1 and j²≥j, then
\(\sum_{j\ge1}z^j/j=-\log(1-z)\), to obtain (6).
Replacing both factors 2q and 2p by 1 is safe for half arcs, but not for
general widths. For p=q=2/3, the first-harmonic multiplier is
2p sin(πp)=2√3/3>1.

## 3. A persistent resonance rules out the earlier estimate

Let A=B be the indicator of cosθ>0, take offsets zero, and choose
ω=N+2, b=N, δ=2 with N a positive odd integer. As σ tends to infinity,
only exact zero-rate terms survive. Besides the origin, these have
k=N j and l=−(N+2)j. The nonzero half-arc coefficients are
sin(πk/2)/(πk). Therefore

\[
 \lim_{\sigma\to\infty}(V-V_0)
 =-\frac{2}{\pi^2N(N+2)}
       \sum_{\substack{j\ge1\\j\ {\rm odd}}}\frac1{j^2}
 =-\frac1{4N(N+2)}.
 \tag{8}
\]

In contrast V_0 tends to 1/4, since δ is nonzero. For N=1 the full mean
is 1/6, a discrepancy of 1/12. Taking N=39 makes δ/ω=2/41, so the
counterexample also applies at detuning below five percent.

The estimate in message 120, with its near-window numerator proportional
only to δ/σ and a bounded Gaussian-tail constant, tends to zero in this
example and is false. Formula (5) retains the missing contribution.
This is a classical arithmetic resonance, not a new graphics phenomenon:
the lesson for the proposed material law is to certify which joint phase
relationships can be removed.

## 4. An optional finite evaluation of the absolute certificate

For a tighter but potentially expensive certificate, take integer J≥1 and
compute (2) on the rectangle |k|,|l|≤J, obtaining S_J. Put α=ω, β=b, and
for positive a,d define

\[
 Z_d=1+\frac{\sqrt{2\pi}}{\sigma d},\quad
 Z'_d=1+\frac{2\sqrt\pi}{\sigma d},
\]
\[
 U_{a|d}(J)=\frac{4d Z_d}{\pi^2aJ}
 +\frac{Z'_d}{\pi^2}
 E_1\left(\frac{\sigma^2a^2J^2}{16}\right),
 \quad E_1(z)=\int_z^\infty\frac{e^{-r}}r\,dr.
\]

Then the omitted sum is bounded by

\[
 S-S_J\le U_{\alpha|\beta}(J)+U_{\beta|\alpha}(J)
 +\frac q\pi E_1\left(\frac{\sigma^2\alpha^2J^2}{2}\right)
 +\frac p\pi E_1\left(\frac{\sigma^2\beta^2J^2}{2}\right).
 \tag{9}
\]

To prove the first U bound, take |k|>J and l nonzero. In the strip
|αk+βl|≤α|k|/2, one has |l|≥α|k|/(2β); use (3) and
\(\sum_{k>J}k^{-2}\le1/J\). Outside that strip,

\[
 e^{-\sigma^2(\alpha k+\beta l)^2/2}
 \le e^{-\sigma^2\alpha^2k^2/16}
       e^{-\sigma^2(\alpha k+\beta l)^2/4}.
\]

Use 1/|l|≤1, the widened Gaussian lattice bound Z'_β, and
\[
 2\sum_{k>J}\frac{e^{-A k^2}}k
 \le 2\int_J^\infty\frac{e^{-A x^2}}x\,dx=E_1(AJ^2).
\]
Swap indices for the second U bound. Bound the omitted axes the same way.
Counting the corner twice and including the excluded n=0 family in the tail
are harmless overestimates. Every E_1 may be replaced by e^{-z}/z.
The tail tends to zero as O(1/J); the straightforward rectangle costs O(J²).
It is not a constant-cost renderer or a proven efficient selection method.

## 5. Whole-pixel cost and the useful organizing principle

The constant-arithmetic bound (4) can replace the first-order corrector bound
for the two-mask product in SHARED-PHASE-COST.md. That note integrates V_0
through the piecewise-affine overlap h, with explicit event counts and a
Gaussian truncation allowance. Thus a sufficient total-error condition is
N_T+Λ+R_T≤ε/2, followed by a coarse-integral error of at most ε/2.
There is no hidden infinite-sum computation in this route.

For fixed δ, σ, masks, offsets and tolerance, taking T=b/2 makes the
near contribution O(ω^{-2}) as ω grows; the other contributions decay
exponentially. The retained overlap's event count depends on δ, not ω.
This is a stronger certificate for this family than the O(ω^{-1})
corrector estimate, with the same retained material law.

Holding δ/ω fixed is different: exact arithmetic resonances can leave an
error of order (δ/ω)², and the beat's own event count can grow with ω.
Neither the certificate nor the rendering cost is automatically independent
of frequency in that regime. Multiple masks, independent carriers, general
smooth shading, numerical precision and nonlinear phase geometry require
their own cost and approximation arguments.

The constructive direction is a material law that keeps the correlations
the pixel can still see, together with an explicit bound for removing the
rest. Shared-phase interval geometry and Fourier families are complementary
ways to describe those correlations; choosing between them is meaningful
only when both material evaluation and discarded contributions are charged.

## 6. Absolute convergence for every finite Boolean graph in this family

The Fourier identity in the collaborator's shared-phase-family draft need
not retain absolute convergence as an open assumption. It holds for every
finite graph of single-arc masks whenever all source rates are nonzero.
It does not require irrationality, nonresonance or distinct rates.

First consider a product of d masks with source rates r_1,...,r_d, all nonzero.
Partition each integer Fourier index into

\[
 E_0=\{0\},\qquad
 E_n=\{k:2^{n-1}\le |k|<2^n\}\quad(n\ge1).
\]

The actual arc coefficients satisfy
\(|\widehat b_k|\le2^{-n}\) on E_n, and \(|E_n|=2^n\),
including n=0. In a block indexed by (n_1,...,n_d), choose a coordinate j
with maximal index N. Bound all coefficients by their block bounds,
sum the Gaussian over the full integer j coordinate using (3), and count
the remaining coordinates. The block contribution is at most

\[
 2^{-\sum_i n_i}
 \left(1+\frac{\sqrt{2\pi}}{\sigma|r_j|}\right)
 2^{\sum_{i\ne j}n_i}
 \le L_{\max}2^{-N},
 \quad L_{\max}=\max_j\left(1+\frac{\sqrt{2\pi}}{\sigma|r_j|}\right).
\]

There are (N+1)^d−N^d blocks with maximum N. Hence

\[
 \sum_{\mathbf k}
 \prod_j|\widehat b_{j,k_j}|
 e^{-\sigma^2(\sum_jr_jk_j)^2/2}
 \le L_{\max}\sum_{N\ge0}[(N+1)^d-N^d]2^{-N}
 \le 2^d d!\,L_{\max}<\infty.
 \tag{10}
\]

For the last bound use
\((N+1)^d-N^d\le d(N+1)^{d-1}\),
\((N+1)^{d-1}\le(d-1)!\binom{N+d-1}{d-1}\), and the binomial generating
function at 1/2. The d=0 constant product is immediate.

Every function F on a finite Boolean cube is a finite linear combination
of products of its bits, by multilinear interpolation. Apply (10) to each
product and the triangle inequality. Arc boundary crossings have zero
source measure because their rates are nonzero, so the smoothing argument
from section 1 proves the exact Fourier identity for this whole family.
This discharges the convergence obligation, including all rational
relations among its rates.

The finite Boolean expansion is a proof device. Its size and coefficients
can be exponential in m; the displayed summability bound itself grows
factorially with d and deteriorates as a source rate approaches zero.
Nothing in (10) proves cheap enumeration, a useful truncation rate uniform
in m, or a general-m version of the constant-arithmetic error bound (4).
The interval algorithm evaluates the original graph directly and does not
pay for this proof expansion.

This convergence proof also works for nonparallel vector rates in any
Gaussian footprint dimension. If its covariance is Σ, require
\(\lambda_j=\sqrt{r_j^{\mathsf T}\Sigma r_j}>0\).
With the other indices fixed, decompose
\(\Sigma^{1/2}(\sum_i k_i r_i)\) along \(\Sigma^{1/2}r_j\).
The perpendicular Gaussian factor is at most 1 and the longitudinal sum
is bounded by \(1+\sqrt{2\pi}/\lambda_j\). Use that quantity in L_max
and the rest of the dyadic proof is unchanged. Boundary crossings still
have zero Gaussian measure because each phase has nonzero variance.
This extension proves the identity for finite Boolean graphs of affine
arc masks in general Gaussian footprints. It does not extend the
one-dimensional interval cost theorem, nor does it cover arbitrary
thresholds of smooth fields in several phase coordinates.
