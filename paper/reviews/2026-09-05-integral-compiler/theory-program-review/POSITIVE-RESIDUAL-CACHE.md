# A positive residual-Gaussian response cache

September 6, 2026. Analytic proposal and sufficient bounds; no new implementation,
measurements, minimality claim, or demonstrated GPU cost.

## What this changes

A fixed, bounded periodic material can be queried through a finite table of its
Gaussian-filtered responses. A wider Gaussian is a positive average of narrower
Gaussians. Discretizing that residual average, with its normalization and finite
support accounted for, gives a response approximation for every bounded source,
including discontinuous and nonseparable sources.

For independent two-dimensional Gaussian footprints with variances at least one,
the construction below has continuous queries in position and scale, sufficient
storage \(O(P^2\log(32/\epsilon))\), and at most
\(O(\log^2(32/\epsilon))\) scalar table reads per query. These are sufficient
mathematical counts. They exclude acquisition, arithmetic precision, bandwidth,
material edits, and the work of mapping a real pixel to an admitted footprint.

This replaces the inverse-power tolerance bound of the particular linear
interpolation construction in [RESPONSE-LOOKUP.md](RESPONSE-LOOKUP.md). It does
not establish a lower bound or a new general texture-filtering architecture.

## 1. Source and cache contract

Let \(F:\mathbb R^2\to[0,1]\) be measurable and \(P\)-periodic in each coordinate,
with \(P\ge1\). The target is

\[
 U_{v_x,v_y}(\mu)=
 \mathbb E F\bigl(N(\mu_x,v_x)\otimes N(\mu_y,v_y)\bigr),
 \qquad v_x,v_y\ge1.
\]

The cache contains exact values \(U_{d_x,d_y}(z)\) on specified periodic grids,
plus Gaussian/Haar and Haar/Gaussian boundary tables and the full period mean.
Haar denotes the uniform probability measure on one period. Comparisons with
Haar take place on the period torus, not between unwrapped measures on the line.
Approximate cache values are charged separately in section 7.

Write \(\phi_v\) for the centered normal density of variance \(v\).
For one axis, set \(A=v-d>0\). The Gaussian semigroup gives

\[
 U_v(\mu)=\int_{\mathbb R}\phi_A(z-\mu)U_d(z)\,dz.
\]

This is an identity for the full source response, not an independence
approximation applied to factors of the material.

## 2. A normalized finite residual stencil

Assume \(d/v\in[1/8,1/2]\). Then \(A/d\in[1,7]\) and
\(w=dA/v\ge d/2\). For \(q(x)=\phi_v(x-\mu)\), Gaussian conditioning gives

\[
 \phi_A(z-\mu)\phi_d(x-z)
 =q(x)\phi_w(z-m_x),\qquad m_x=(d\mu+Ax)/v.
\]

Choose an axis tolerance \(0<\delta\le1\), and set

\[
 a=\ln(16/\delta),\quad h_{\max}=\pi\sqrt{d/a},\quad
 n=\lceil P/h_{\max}\rceil,\quad h=P/n.
\]

The infinite positive mixture

\[
 q_h(x)=h\sum_{k\in\mathbb Z}
       \phi_A(kh-\mu)\phi_d(x-kh)
\]

satisfies, by the conditioning identity and Poisson summation,

\[
 \left|q_h(x)/q(x)-1\right|\le E,\qquad
 E=2\sum_{\ell\ge1}e^{-2\pi^2w\ell^2/h^2}
 \le\frac{2e^{-a}}{1-e^{-3a}}\le\delta/4.
\]

The geometric bound uses \(\ell^2\ge1+3(\ell-1)\).
The off-centre mass
\(Z_h=h\sum_k\phi_A(kh-\mu)\) obeys \(|Z_h-1|\le E\);
it need not be at least one. Normalizing the infinite mixture therefore gives
total variation error at most \(E/(1-E)\).

For a finite, continuously varying support, define

\[
 R=\sqrt{2\ln(4/\delta)},\qquad B=R\sqrt A+h,
\]

\[
 \chi_k=\operatorname{clamp}
 \left(\frac{B+h-|kh-\mu|}{h},0,1\right).
\]

Thus \(\chi_k=1\) through radius \(R\sqrt A+h\), and reaches zero at
\(R\sqrt A+2h\). The discarded unnormalized mass satisfies

\[
 \tau=h\sum_k\phi_A(kh-\mu)(1-\chi_k)
 \le2\Phi(-R)\le e^{-R^2/2}=\delta/4.
\]

To see the grid buffer's role, each right-hand discarded node is beyond
\(R\sqrt A+h\); its preceding interval lies beyond \(R\sqrt A\).
The decreasing Gaussian's integral on that interval bounds the node's
right-endpoint rectangle. Sum the disjoint intervals and repeat on the left.
The ramp only discards less mass than this hard tail.

Use the finite normalized weights

\[
 p_k=\frac{\phi_A(kh-\mu)\chi_k}
           {\sum_j\phi_A(jh-\mu)\chi_j}.
\]

The denominator is positive: the nearest lattice node is inside the plateau.
In fact the retained mass is at least \(1-E-\tau\).
Soft rejection followed by normalization changes the infinite normalized
mixing law by at most \(\tau/Z_h\) in total variation. Consequently

\[
 \operatorname{TV}\left(q,\sum_kp_k\phi_d(\,\cdot-kh)\right)
 \le\frac{E+\tau}{1-E}\le\delta.
\]

Here \(\operatorname{TV}=\tfrac12\|\cdot\|_1\), so this controls the response of
every \(F\in[0,1]\) by \(\delta\). Wrapping the laws cannot increase the error.
The number of nonzero stencil terms is bounded by

\[
 S(d,v,h)\le5+\left\lfloor\frac{2R\sqrt A}{h}\right\rfloor.
\]

Use the actual \(h=P/n\) in this expression. Cache addressing is \(k\bmod n\);
multiple wrapped terms may be aggregated. The bound conservatively counts
every term before aggregation.

For fixed \(d,h,\delta\), each entering or leaving node has zero weight.
The weights, denominator, and resulting response are continuous in \(\mu,v\).
Continuity between cached blur levels requires the following additional rule.

## 3. Continuous scale selection and the Haar endpoint

For final two-dimensional tolerance \(0<\epsilon\le1\), take

\[
 \delta=\epsilon/2,\quad a=\ln(32/\epsilon),\quad
 R=\sqrt{2\ln(8/\epsilon)},\quad
 H=\max\left\{1,\frac{P^2\ln(8/\epsilon)}{2\pi^2}\right\},
 \quad J=\lceil\log_2H\rceil.
\]

For \(v\ge H\), Fourier coefficients of the wrapped Gaussian give

\[
 \operatorname{TV}(N(\mu,v)\bmod P,\mathrm{Haar})
 \le\sum_{m\ge1}e^{-2\pi^2vm^2/P^2}
 \le2e^{-2\pi^2v/P^2}\le\epsilon/4.
\]

Cache precisely the Gaussian blur levels

\[
 d_k=2^k,\qquad k=-2,-1,\ldots,J-1,
\]

and Haar. There are \(J+2\) Gaussian levels. Even when \(H=1\), the list
contains \(1/4\) and \(1/2\).

For \(1\le v<2H\), let \(j=\lfloor\log_2v\rfloor\) and
\(\theta=\log_2(v/2^j)\). Query the two residual stencils with
\(d_l=2^{j-2}\) and \(d_u=2^{j-1}\), and blend their responses using
weights \(1-\theta,\theta\). Both have \(d/v\in[1/8,1/2]\).
At a dyadic boundary the preceding upper level is the next lower level,
so the response is continuous.

Then blend this result with Haar, using

\[
 \lambda_H(v)=\operatorname{clamp}(\log_2(v/H),0,1).
\]

At \(v\ge2H\), return Haar directly. No additional Gaussian level is needed
at that endpoint. In the transition, both approximations target the same
wrapped Gaussian, so the axis error is bounded by

\[
 (1-\lambda_H)\delta+\lambda_H\epsilon/4\le\delta.
\]

It is not an additive charge for two successive unrelated approximations.
Each axis has at most two Gaussian stencils and one Haar term.
Tensoring the two axis laws gives error at most \(2\delta=\epsilon\), even
when the bounded material \(F\) itself is nonseparable. All combined weights
are nonnegative and sum to one.

## 4. Storage and read counts with grid rounding

Every cached \(d<H\) satisfies

\[
 h_{\max}/P
 \le\max\{\pi/\sqrt{\ln32},\,1/\sqrt2\}<2.
\]

The first case covers \(H=1\); the other follows from the expression for \(H\)
and \(\ln(8/\epsilon)\le a\). Thus \(P/h_{\max}>1/2\), and

\[
 n=\lceil P/h_{\max}\rceil\le2P/h_{\max},\qquad
 h_{\max}/2\le h=P/n\le h_{\max}.
\]

This justification matters: \(\lceil x\rceil\le2x\) is not valid for all
positive \(x\).
Using \(A/d\le7\), a uniform per-Gaussian stencil bound is

\[
 S_\epsilon=5+\left\lfloor\frac{4R}{\pi}\sqrt{7a}\right\rfloor.
\]

The full two-dimensional query may have four Gaussian/Gaussian stencils,
four Gaussian/Haar boundary stencils, and the Haar/Haar value.
Its conservative scalar read count is therefore

\[
 (2S_\epsilon+1)^2=O(\log^2(32/\epsilon)).
\]

The exact scalar cache size, including boundary tables, is

\[
 B_{\mathrm{cache}}=
 \left(1+\sum_{k=-2}^{J-1}n(d_k)\right)^2
 \le\left[J+3+\frac{4+2\sqrt2}{\pi}P\sqrt a\right]^2
 =O(P^2\log(32/\epsilon)).
\]

The geometric sum uses
\(\sum_{k=-2}^{\infty}2^{-k/2}=4+2\sqrt2\).
The explicit expression retains level and rounding costs. These are scalar
values and reads, not bytes, GPU instructions, or elapsed time.

## 5. Acquisition is part of the algorithm

The table requires \(B_{\mathrm{cache}}\) actual Gaussian/Haar responses.
It includes variance \(1/4\), meaning standard deviation \(1/2\).
The existing prototype query contract for standard deviations at least one
does not directly supply those nodes. An admitted integration oracle is
required; explicit coherent rectangle sources are one available route.
Their retained periodic image windows, Gaussian interval integrals, arithmetic,
and precision all need prices. Extending an existing whole-kernel theorem to
a smaller minimum variance also changes its constants and must be stated.

This result removes source-detail dependence from the admitted *query* count.
It does not remove source complexity from acquisition, or the period \(P\)
from storage. No cheap preparation or update theorem follows from lookup.

## 6. Source approximation can remain coherent

Suppose every cached response is computed from the same bounded, periodic
\(\widehat F\), with a uniform cellwise \(L^1\) source error \(\eta_{\rm src}\)
under the contract of
[COHERENT-SOURCE-ACQUISITION.md](COHERENT-SOURCE-ACQUISITION.md).
At the final physical covariance \(\Sigma\succeq I\),

\[
 \|G_\Sigma*(F-\widehat F)\|_\infty
 \le C_0\eta_{\rm src},\qquad
 C_0=(1+\sqrt{2/\pi})^2<4.
\]

Apply the residual-cache theorem to \(\widehat F\), then compare its final
response with \(F\). The narrow cached blur does not force the *source geometry*
to satisfy a narrower-footprint approximation contract. Its integrals still
need accuracy relative to this same \(\widehat F\).

If instead each narrow node is certified directly against the original \(F\),
the base source bound must reflect that narrower variance; at variance \(1/4\)
the corresponding sufficient constant is \((1+2\sqrt{2/\pi})^2\).
These are different acquisition contracts and must not be conflated.

## 7. Numerical errors, edits, and scope

If all cache entries have uniform integration/storage error
\(\eta_{\rm cache}\), positivity makes their query contribution at most
\(\eta_{\rm cache}\), independent of the number of reads.
Clamping stored values into \([0,1]\) cannot worsen their error.
With a coherent source, the total contract is

\[
 |\widehat U-U_F|
 \le C_0\eta_{\rm src}+\epsilon+\eta_{\rm cache}
       +\eta_{\rm numerical}.
\]

The last term must include weights and normalization, parameter evaluation,
addressing, exponentials/logarithms, and accumulation. For example, if the
implemented weights remain nonnegative and normalized, an \(L^1\) weight
error \(\eta_w\) changes a weighted average of \([0,1]\) values by at most
\(\eta_w/2\). This does not certify all other floating-point operations.

The cache belongs to one complete fixed \(F\). Camera footprint changes and
a common material translation are queries. Relative layer movement, changing
profiles or thresholds, and lighting or visibility changes that alter \(F\)
require a stated control representation or rebuilding. Continuity of the
exact query construction is not a temporal bandwidth or motion-blur theorem.

For correlated \(\Sigma\succeq I\), the admitted positive decomposition in
[POSITIVE-FOOTPRINT-MIXTURES.md](POSITIVE-FOOTPRINT-MIXTURES.md) can reuse this
cache, since each component has independent variances at least one. Work is
multiplied by the component count; the cache error is averaged, not multiplied
by that count. Mixture error and its numerical work remain separate.
Claude is independently deriving a direct two-dimensional residual stencil.
Its finite support, periodic-grid rounding, continuous covariance selection,
and any Haar closure must be audited before replacing the admitted route.

## 8. Prior work and the defensible claim

[Feline, McCormack et al.](https://merl.com/publications/docs/TR2000-22.pdf)
already uses Gaussian-weighted prefiltered mipmap probes, normalized by their
total weight (§3.1). That rendering architecture is prior work.

[Maz'ya and Schmidt, *On approximate approximations using Gaussian kernels*](https://www.wias-berlin.de/preprint/111/wias_preprints_111.pdf)
develop Gaussian lattice quasi-interpolation and its Poisson-summation
saturation terms. The exponential lattice-error mechanism is classical.

[Ling and Belfiore, *Achieving AWGN Channel Capacity With Lattice Gaussian Coding*](https://arxiv.org/pdf/1302.5906)
give a discrete-Gaussian/continuous-Gaussian convolution flatness result at the
posterior variance (Lemma 9). This is direct probability-level prior for the
conditioning mechanism.

Our present result is a sufficient bounded-source certificate for a particular
positive periodic response cache: off-centre normalization, buffered finite
support, continuous scale selection, explicit rounded-grid storage and reads,
and a coherent-source acquisition/error contract. The combination has not been
established as novel. It is useful if its complete acquisition, memory, update,
and query budget beats alternatives on an industrially relevant admitted class.
