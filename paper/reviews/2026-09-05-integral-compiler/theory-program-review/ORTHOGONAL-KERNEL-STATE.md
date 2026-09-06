# Orthogonal moments and approximation of the whole Hermite kernel

September 6, 2026. Theory only; independently checked. This answers
Claude's question in bridge message 454. The ingredients are classical:
the Szász Hermite inequality, best orthogonal polynomial approximation,
and Bessel's inequality. No fixed-float or game-performance claim is made.

Two changes improve the sufficient acquisition contract. Approximate the
whole normalized Gaussian-Hermite kernel, using a degree that grows as
\(\sqrt N\) rather than retaining its degree-\(N\) Hermite factor exactly.
Then represent one shared source-moment error as one polynomial source
perturbation, so its collective state error is controlled by Bessel.

## 1. A uniform envelope for the normalized kernel

Let \(h_n=\operatorname{He}_n/\sqrt{n!}\), orthonormal under the standard
Gaussian, and define on the physical line
\[
 g_{n,\sigma}(x)=\sigma^{-1}\phi(y)h_n(y),\qquad
 y=(x-\mu)/\sigma,\qquad \sigma\ge1.                     \tag{1}
\]
The physicists' Hermite inequality in
[DLMF 18.14.9](https://dlmf.nist.gov/18.14.E9), credited there to
Szász (1951), gives
\[
 |h_n(y)|\le e^{y^2/4},\qquad
 |g_{n,\sigma}(x)|
 \le e_\sigma(x):=
 \frac{e^{-(x-\mu)^2/(4\sigma^2)}}{\sigma\sqrt{2\pi}}.
                                                               \tag{2}
\]
The envelope is independent of \(n\). Also
\(\|g_{n,\sigma}\|_1=E|h_n(Z)|\le1\).

On each physical unit cell use the orthonormal shifted Legendre basis
\[
 L_a(t)=\sqrt{2a+1}\,P_a(2t-1),\quad 0\le t\le1.
\]
Let \(\Pi_J\) be its degree-\(J\) orthogonal projection. If
\(c_{i,a}^{(n)}=\int_i^{i+1}g_{n,\sigma}(x)L_a(x-i)\,dx\), then
\[
 \sum_i\|c_i^{(n)}\|_2
 \le\sum_i\|g_{n,\sigma}\|_{L^2([i,i+1])}
 \le\sum_i\sup_{[i,i+1]}e_\sigma
 \le A(\sigma),                                        \tag{3}
\]
\[
 A(\sigma)=\sqrt2+\sqrt{2/\pi}/\sigma\le
 A_0:=\sqrt2+\sqrt{2/\pi}<2.22.
\]
The last step uses the unit-cell upper-sum inequality
\(\sum_i\sup_C e\le\int e+\int|e'|\).
Thus exact projection coefficients have a bounded sum of block norms
independent of both \(n\) and \(J\).

This statement concerns exact orthogonal projection, not arbitrary
conversion of a previously formed approximate polynomial.

## 2. Approximate the whole kernel at a lower sufficient degree

Differentiating the complete normalized kernel gives
\[
 g_{n,\sigma}^{(m)}(x)=
 (-1)^m\sigma^{-m-1}
 \sqrt{\frac{(n+m)!}{n!}}\,\phi(y)h_{n+m}(y).             \tag{4}
\]
Use the degree-\(m-1\) Taylor polynomial about each unit cell's center.
Its pointwise remainder is at most
\(2^{-m}\sup_C|g^{(m)}|/m!\). On a unit cell this also bounds the
\(L^2\) remainder. Orthogonal projection is the best \(L^2\) polynomial,
so (2)--(4) imply
\[
 \sum_i\|g_{n,\sigma}-\Pi_{m-1}g_{n,\sigma}\|_{L^2(C_i)}
 \le E_m(n,\sigma),                                    \tag{5}
\]
\[
 E_m(n,\sigma)=
 A(\sigma)\sigma^{-m}2^{-m}
 \frac{\sqrt{(n+m)!/n!}}{m!}.
\]
The same bound holds for the sum of cell \(L^1\) errors.
Integrating the Taylor remainder instead of taking its supremum would
improve (5) by \(1/\sqrt{2m+1}\); the displayed bound is sufficient.

For all \(n\le N\), use one common degree \(J=m-1\).
The elementary estimates
\[
 \sqrt{(n+m)!/n!}\le(N+m)^{m/2},\qquad
 m!\ge(m/e)^m
\]
give
\[
 E_m(n,\sigma)\le
 A_0\left[\frac{e\sqrt{N+m}}{2m}\right]^m.               \tag{6}
\]
Consequently, if \(0<\delta\le1\),
\[
 m\ge1,\qquad m^2\ge e^2(N+m),\qquad
 m\ge\log_2(A_0/\delta),                                \tag{7}
\]
then (5) is at most \(\delta\). One simple sufficient integer selector is
\[
 m=\left\lceil\max\{2e\sqrt N,\ 2e^2,\
                         \log_2(A_0/\delta)\}\right\rceil.
                                                               \tag{8}
\]
Indeed half of \(m^2\) covers \(e^2N\), and the other half covers \(e^2m\).
Thus
\[
 J=O(\sqrt N+\log(1/\delta)).                            \tag{9}
\]
The factorial criterion (5) can be used for a smaller sufficient degree.
This is an approximation of the whole kernel, so the older product
construction's requirement \(J'=N+2(N_T-1)\) does not apply to this route.
That observation is a change of approximation contract, not a contradiction.

## 3. Finite windows and state-entry error

Keep every whole cell intersecting
\([\mu-R\sigma,\mu+R\sigma]\). For the true normalized kernel,
\[
 \int_{|y|>R}\phi(y)|h_n(y)|\,dy
 \le\sqrt{\Pr(|Z|>R)}\le e^{-R^2/4},                    \tag{10}
\]
uniformly in \(n\), by Cauchy--Schwarz.
For completeness,
\(2\Phi(-R)=2e^{-R^2/2}\int_0^\infty\phi(t)e^{-Rt}\,dt
\le e^{-R^2/2}\).

Project only the retained cells and set the kernel to zero elsewhere.
For an axis allowance \(0<\delta_{\rm ax}\le1\), choose the degree from
(7) with \(\delta=\delta_{\rm ax}/2\), and
\[
 R\ge2\sqrt{\log(2/\delta_{\rm ax})}.                    \tag{11}
\]
The full axis-kernel \(L^1\) error is at most \(\delta_{\rm ax}\).
Use the same cells and degree for all \(n\le N\).

Two axes with errors \(\delta_x,\delta_y\) give tensor-kernel error
\[
 \delta_x+\delta_y+\delta_x\delta_y,                     \tag{12}
\]
since the exact axis kernels each have \(L^1\) norm at most one.
This is a state-entry error against any bounded source. A conservative
collective kernel-acquisition allowance is \(\sqrt{K_N}\) times (12).
That factor is still present for this kernel approximation budget.

## 4. One shared orthogonal moment table

For the fixed bounded prototype \(\widehat f_s\), store
\[
 M_{s,ab}=\int_{[0,1]^2}\widehat f_s(t,u)L_a(t)L_b(u)\,dt\,du,
 \qquad 0\le a,b\le J.                                 \tag{13}
\]
Bessel gives \(\|M_s\|_2\le1\).
There is no \((J+1)^2\) normalization in (13), unlike the normalized
Bernstein moments in the earlier prototype note.

An acquired state entry uses
\[
 \widetilde H_\alpha=
 \sum_{i,j\ {\rm retained}}\sum_{a,b}
 c_{i,a}^{(\alpha_x)}c_{j,b}^{(\alpha_y)}
 M_{s(i,j),ab}.                                        \tag{14}
\]
Repeated hash/carry classes can fold this sum exactly as before, with
the new coefficient and moment definitions. A uniform prototype
moment-vector error \(\|\Delta M_s\|_2\le\eta_M\) costs at most
\(A_0^2\eta_M\) per state entry by (3).

More strongly, suppose the same approximate moment vector is reused for
every state index and every occurrence of \(s\). Define the polynomial
error on a unit prototype cell by
\[
 R_s(t,u)=\sum_{a,b}\Delta M_{s,ab}L_a(t)L_b(u),\qquad
 \|R_s\|_{L^2([0,1]^2)}\le\eta_M.                       \tag{15}
\]
Repeat it on the physical cells and restrict it to the common retained
window \(W\). Exact projection coefficients imply the exact identity
\[
 \Delta H_\alpha=
 E_{q_C}[R(X)1_W(X)h_\alpha(Z)],                        \tag{16}
\]
where \(q_C\) is the reference Gaussian and \(Z\) its standardized variable.
For reference widths \(c_x,c_y\ge1\), Bessel and the cell upper sums give
\[
 \|\Delta H_{\le N}\|_2^2
 \le\int |R1_W|^2q_C
 \le\eta_M^2\sum_{\rm cells}\sup q_C
 \le(1+\sqrt{2/\pi})^2\eta_M^2.                         \tag{17}
\]
Thus the collective moment-table allowance is
\[
 \|\Delta H_{\le N}\|_2\le
 (1+\sqrt{2/\pi})\eta_M.                                \tag{18}
\]
There is no \(N,J,\sqrt{K_N}\), or reference-count factor in (18).

The distinction between vector and scalar error matters. Bounding each
scalar entry by \(\xi\) only guarantees
\(\|\Delta M_s\|_2\le(J+1)\xi\) for this tensor table.
Moreover \(R_s\) need not be bounded in \([0,1]\): it represents acquisition
error relative to a bounded source, not the source to which the analytic
bounded-response theorem is applied.

Kernel-coefficient rounding, numerical transforms and independently varying
state errors need their own allowances. They do not automatically correspond
to one shared \(R\). The same degree and window across indices, and one
consistent table, are hypotheses of (16)--(18).

## 5. Acquisition and numerical costs remain

For the coherent rectangle sources in
[COHERENT-SOURCE-ACQUISITION.md](COHERENT-SOURCE-ACQUISITION.md), moment
acquisition costs \(O(R_s(J+1)^2)\) arithmetic per prototype. Shifted
Legendre integrals can be obtained from polynomial recurrences and endpoint
antiderivatives. With rational rectangles and payoffs, the unnormalized
polynomial integrals are rational; the displayed orthonormal moments
include known square-root scale factors. Their representation and rounding
must satisfy the vector allowance in (18).

Exact kernel projection also needs an acquisition procedure:
\[
 c_{i,a}^{(n)}=\int_i^{i+1}g_{n,\sigma}(x)L_a(x-i)\,dx.
\]
After standardization, multiply \(h_n(y)\) by
\(L_a(\mu-i+\sigma y)\). The three-term Legendre recurrence and
\(y h_r=\sqrt{r+1}h_{r+1}+\sqrt r h_{r-1}\) express this product in
Hermite indices through \(n+a\), whose interval integrals are (7) in
the coherent-source note.

For one retained cell, a conservative arithmetic count for all
\(n\le N,a\le J\) is
\[
 O\bigl(N+J+1+(N+1)(J+1)^2\bigr),                       \tag{19}
\]
plus certified endpoint Gaussian primitives and arithmetic precision.
The recurrence can have cancellation; (19) is not a fixed-float
stability theorem. Multiply it by the actual retained axis-cell count.

The degree reduction reduces the number of moment channels and their
arithmetic, but does not make state acquisition constant work.
Periodic source tables and any FFT reuse still need their full costs,
actual reference/coset coverage, truncation and numerical contracts.
No frequency cutoff follows merely from naming the kernel Gaussian.

## 6. One assembled sufficient budget

Use the same axis-kernel allowance \(\delta_{\rm ax}\) in both dimensions.
Suppose that, for every axis and every \(n\le N\), the numerically acquired
kernel coefficient blocks have
\(\sum_i\|\Delta c_i^{(n)}\|_2\le\zeta\). Their tensor coefficient error is
at most \(2A_0\zeta+\zeta^2\) in the sum of block norms. The stored moment
vectors have norm at most \(1+\eta_M\).

One sufficient total state-acquisition error relative to the exact state
of the bounded whole \(\widehat F\) is therefore
\[
 \eta_H\le
 \sqrt{K_N}(2\delta_{\rm ax}+\delta_{\rm ax}^2)
 +(1+\sqrt{2/\pi})\eta_M
 +\sqrt{K_N}(1+\eta_M)(2A_0\zeta+\zeta^2)
 +\eta_{\rm transforms}+\eta_{\rm state\ accumulation}. \tag{20}
\]
The last two allowances are collective state-vector errors, not free
per-entry constants. Actual parameter/index errors also require allowances.
The finite-window contribution is already included in \(\delta_{\rm ax}\).

Let \(\eta_{\rm src}\) be the per-cell coherent source disagreement area,
\(E_N\) the bounded-source query truncation allowance, \(\kappa\) the
query density-ratio norm bound, and \(\eta_c\) the query coefficient-vector
error. Under the physical source admission \(\Sigma\succeq I\), the final
mean error is at most
\[
 C_0\eta_{\rm src}+E_N+\kappa\eta_H+
 (1+\eta_H)\eta_c+\epsilon_{\rm query\ accumulation},
 \qquad C_0=(1+\sqrt{2/\pi})^2.                         \tag{21}
\]
Select the source tolerance, degrees, window and numerical allowances
from one split target in (20)--(21), before quoting a cost at that accuracy.
The query also has to satisfy the relative-reference Gaussian admission
for \(E_N\) and finite \(\kappa\); \(\Sigma\succeq I\) alone supplies
the physical source-error bound.

Orthogonality and a shared source remove an artificial moment-error
amplification. They do not remove the query density-ratio norm, the
independent kernel/numerical allowances, or the work needed to obtain
the coefficients.
