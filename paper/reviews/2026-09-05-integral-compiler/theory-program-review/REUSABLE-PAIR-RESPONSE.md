# Reusable Gaussian responses after material composition

September 6, 2026. Theory only. This note separates a compact final-query
state from the cost of constructing it and from the state needed for
independent material controls. It records the independently checked
bridge derivations #366–368. No implementation, benchmark, novelty or
GPU-performance claim follows.

The finite polygon-pair construction is in
[the orientation note](../../../notes/orientation-note.md), sections 7b–7d;
the full Gaussian pairing and numerical contract are in
[GAUSSIAN-LATTICE-PAIR.md](GAUSSIAN-LATTICE-PAIR.md).

## 1. Fixed sources, a declared family of queries

Use physical radian frequency lattices
\(\Lambda_A=B_A\mathbb Z^2\), \(\Lambda_B=B_B\mathbb Z^2\).
Let \(a_m,b_n\) be the normalized Fourier coefficients of two bounded,
periodic, piecewise constant polygonal sources. The response is

\[
 I(\mu,\Sigma)=\mathbb E[A(X)B(X)],\qquad X\sim N(\mu,\Sigma).
\]

Write \(L_A=\|a\|_2\), \(L_B=\|b\|_2\). The pair theorem gives

\[
 I(\mu,\Sigma)=\sum_{m,n}a_mb_n
 e^{-\frac12(m+n)^T\Sigma(m+n)+i(m+n)\cdot\mu},
\]

with absolute Gaussian-weighted convergence, and

\[
 \sum_{m,n}|a_mb_n|e^{-\frac12(m+n)^T\Gamma(m+n)}
 \le K_\Gamma L_A L_B. \tag{1}
\]

Here \(K_\Gamma\) is the explicit Schur constant from the pair note.
Pointwise domination gives \(K_{\Gamma_2}\le K_{\Gamma_1}\) when
\(\Gamma_2\succeq\Gamma_1\), if these constants are defined using the
underlying lattice Gaussian sums (or their corresponding common bounds).

First assume only \(\Sigma\succeq\lambda_-I\), \(\lambda_->0\).
Sources, physical lattices and their relative registration stay fixed.
Pixel-center translation is a query; an independent layer translation
is a change of source, as section 7 makes explicit.

Zero source norms give zero response. Constant-source cases can be handled
as single-source Gaussian sums; if one factor is constant, only pairs with
that factor's zero frequency contribute. Their bounded output frequencies
are a finite, directly enumerated set. Below, both sources have nonzero
jump edges of positive length.

## 2. One finite pair list for the whole footprint family

Allocate output error \(\epsilon_G>0\), and put

\[
 \overline K=K_{\lambda_-I/2},\quad
 R=\max\!\left(1,2\sqrt{\log_+
       \frac{\overline K L_A L_B}{\epsilon_G}}\right),\quad
 b=R/\sqrt{\lambda_-}. \tag{2}
\]

Using a fixed output **disk** \(|k|\le b\), rather than changing an
ellipse at every query, gives the uniform discarded-output bound

\[
 \sum_{|m+n|>b}|a_mb_n|e^{-\frac12(m+n)^T\Sigma(m+n)}
 \le e^{-\lambda_-b^2/4}\overline K L_A L_B
 \le\epsilon_G. \tag{3}
\]

This follows by splitting the Gaussian exponent in half and applying
(1) at \(\lambda_-I/2\). The harmless lower bound \(R\ge1\) avoids
normalization by a zero disk radius later.

Let \(D_A,D_B\) be the physical period-cell areas, and let \(D\) and
\(\rho\) be the area and centered fundamental-cell radius of the outer
frequency lattice \(\Lambda_A\). For source edges, \(J_e,J_f\) are
absolute jump magnitudes and \(\ell_e,\ell_f\) their positive lengths.
Set

\[
 h=\max(2b,b+2/\ell_{\min},\rho),\quad
 c=(1+\rho/h)^2\le4,
\]
\[
 C_0=\frac4{D_A D_B D}
       \sum_{e,f}J_eJ_f(\ell_e^2+\ell_f^2). \tag{4}
\]

An explicit uniform majorant on the actual partner count is

\[
 \sup_m\#\{n\in\Lambda_B:|m+n|\le b\}\le N_*:=\min\left\{
 \frac{\pi(b+\rho_B)^2}{|\det B_B|},
 \left(\left\lfloor\frac{2b}{\sigma_{\min}(B_B)}\right\rfloor+1\right)^2
 \right\}. \tag{5}
\]

Either right-hand bound alone is also a valid majorant.
The shifted integer-box algorithm actually tests the second
number of candidates per outer frequency; an upper bound on accepted
partners alone is not an enumeration price.

For source omission allowance \(\eta>0\), choose

\[
 K=C_0N_*c,\quad v=\max(1,K/\eta),\quad
 u=2v[3+\log c+\log(2v)],\quad T=h^2u. \tag{6}
\]

In the outer lattice, take the common union

\[
 S=\bigcup_{t\text{ an edge tangent of }A\text{ or }B}
 \{m:|m|\max(h,|m\cdot t|)\le T\}.
\]

The orientation theorem, applied with the common reach \(b\), proves

\[
 \sum_{m\notin S,\ |m+n|\le b}|a_mb_n|\le\eta. \tag{7}
\]

Indeed, its sum is at most \(K[3+\log(cu)]/u\). With
\(L=3+\log c+\log(2v)\ge1\), this is
\(K(L+\log L)/(2vL)\le K/v\le\eta\).

Now build the finite list

\[
 \mathcal P=\{(m,n):m\in S,\ n\in\Lambda_B,\ |m+n|\le b\}. \tag{8}
\]

There is no independent source cutoff on \(n\). Whole coefficients
\(a_mb_n\) are used. The edge decomposition proves the omission bound;
it does not change the finite contraction or its Schur contract.
The set \(S\) includes the radius-\(2b\) disk, so contributing zero
frequencies are retained and computed from source means/areas.

Equations (3) and (7) certify error at most \(\epsilon_G+\eta\), uniformly
over every center and every admitted covariance. For the response-state
construction below, evaluate **all** of (8): a query-dependent hard
ellipse cutoff would change the analytic kernel being approximated.

The explicit rotated-rectangle enumeration in the orientation note builds
\(S\) without scanning its large bounding square. First-containing-edge
ownership removes duplicates with a priced number of membership checks.
Scanning the resulting cache still costs \(O(|\mathcal P|)\) per query;
reuse by itself does not reduce that cost.

## 3. Nesting and directional reach

For a single tangent the exact region identity is

\[
 \Omega(h,T)=\{m:|m|\le T/h,\ |m||m\cdot t|\le T\}. \tag{9}
\]

Thus both \(T\) and \(T/h\) being nondecreasing is sufficient for
nesting. Increasing \(h\) at fixed \(T\) shrinks the region. The common
construction above proves its certificate directly and does not need
individually optimized regions to nest.

If containment of every individual selector is required, replace its
\(c\) by 4, its partner majorant by \(N_*\), and its floor by the common
largest \(h\). The resulting \(u_0\) dominates every individual \(u\);
\(T_0=h^2u_0\) and \(T_0/h=hu_0\) dominate both bounds in (9).

For a footprint ellipse \(k^T\Sigma k\le R^2\), the shifted tangent
envelope can use the smaller directional reach
\(R\sqrt{t_f^T\Sigma^{-1}t_f}\). A family requires a supplied or priced
supremum of this quantity. This sharpens a tangent factor; it does not
replace the full radial guard or the full neighbor count. Increasing a
physical covariance shrinks this frequency ellipse at fixed \(R\).

## 4. Aggregate moments eliminate the pair scan after preparation

Fix a reference center \(\mu_0\), and put \(\Sigma_0=\lambda_-I\).
Now declare a finite query patch

\[
 \|\mu-\mu_0\|\le L_\mu,\qquad
 0\preceq\Delta\Sigma=\Sigma-\Sigma_0\preceq D_\Sigma I. \tag{10}
\]

For each retained pair write \(k=m+n\) and

\[
 d_{mn}=a_mb_n e^{-k^T\Sigma_0k/2+i k\cdot\mu_0},\qquad
 B=K_{\Sigma_0}L_A L_B.
\]

Equation (1) bounds \(\sum_{\mathcal P}|d_{mn}|\le B\).
With \(\Delta\mu=\mu-\mu_0\), let

\[
 z(k)=i k\cdot\Delta\mu-\tfrac12 k^T\Delta\Sigma k,\qquad
 M=bL_\mu+\tfrac12 b^2D_\Sigma.
\]

For all retained pairs, \(\Re z\le0\) and \(|z|\le M\). For
\(p_n(z)=\sum_{j=0}^n z^j/j!\), \(N=n+1\), the integral remainder is

\[
 e^z-p_n(z)=\frac{z^N}{(N-1)!}
  \int_0^1(1-t)^{N-1}e^{tz}\,dt,
\quad |e^z-p_n(z)|\le\frac{|z|^N}{N!}. \tag{11}
\]

There is no \(e^M\) multiplier because \(\Re z\le0\). Consequently

\[
 \left|\sum_{\mathcal P}d_{mn}e^{z(k)}-
             \sum_{\mathcal P}d_{mn}p_n(z(k))\right|
 \le B M^N/N!. \tag{12}
\]

For allowance \(\epsilon_K\), one sufficient integer is

\[
 N\ge\left\lceil\max\{1,2eM,\log_2(B/\epsilon_K)\}\right\rceil.
 \tag{13}
\]

Use \(N!\ge(N/e)^N\). If \(B=0\), return zero before using the
logarithm. A zero query range needs only \(H_0\) and has zero kernel
approximation error; source and output truncation allowances remain.

Precompute the normalized aggregate moments

\[
 H_\alpha=\sum_{(m,n)\in\mathcal P}d_{mn}(k/b)^\alpha,
 \qquad \alpha\in\mathbb N^2,\quad |\alpha|\le2n. \tag{14}
\]

Each \(|H_\alpha|\le B\). The query polynomial
\(p_n(z(by))=\sum_{|\alpha|\le2n}c_\alpha y^\alpha\) then gives the
response by \(\sum_\alpha c_\alpha H_\alpha\). The state has exactly
\((n+1)(2n+1)\) complex entries, independent of the number of pairs
once preparation is complete.

This retains signed/complex aggregate contributions. It does not assert
that only a few individual pairs matter. If one elects to keep a short
prefix of a finite pair list, the certified error instead includes both
the outside-list remainder and the sum of certified absolute weights of
all discarded pairs **inside** the list; sorting does not remove that term.

## 5. Arithmetic, precision and amortization are separate prices

Given the list, preparing (14) costs \(O(|\mathcal P|(n+1)^2)\)
arithmetic and \(O((n+1)^2)\) persistent response-state entries.
Pair contributions can stream into the moments; retaining all pairs is
optional. Obtaining source coefficients and pair indices is still charged.

A direct query recurrence starts with \(Q_0(y)=1\), repeatedly computes
\(Q_j(y)=z(by)Q_{j-1}(y)/j\), and accumulates \(\sum_{j=0}^n Q_j\).
The multiplier is a sparse quadratic in two variables. Work is
\(O(\sum_{j=0}^n(j+1)^2)=O((n+1)^3)\), storage \(O((n+1)^2)\),
followed by a quadratic-sized contraction. This preserves the cutoff
on exponential order. Replacing it with the monomial-degree-\(2n\)
truncation of \(e^{z(y)}\) is a different polynomial and needs a new proof.

For numerical stability define

\[
 A_q=b\|\Delta\mu\|_1+\tfrac12b^2
 (|\Delta\Sigma_{11}|+2|\Delta\Sigma_{12}|+|\Delta\Sigma_{22}|).
\]

The query coefficient sum is bounded by \(\|c\|_1\le e^{A_q}\),
uniformly

\[
 A_q\le\sqrt2\,bL_\mu+b^2D_\Sigma. \tag{15}
\]

For the covariance part, positive semidefiniteness and the eigenvalue
bound give \(\Delta\Sigma_{11}+\Delta\Sigma_{22}
+2|\Delta\Sigma_{12}|\le2D_\Sigma\).
If every prepared moment differs from its **true** value by at most
\(\eta_H\), and the query coefficient vector has \(\ell^1\) error
\(\eta_c\), then

\[
 E_{\rm numerical}\le
 e^{A_q}\eta_H+(B+\eta_H)\eta_c+E_{\rm accumulation}. \tag{16}
\]

Source coefficient errors, phase and Gaussian evaluation, moment powers,
and preparation summation enter the true-moment allowance \(\eta_H\).
Repeated queries of the same source coefficient must be consistent to
use array-based Schur bounds. Certified region membership, source
parameters and index/phase bit lengths remain explicit numerical costs.
Large patches can be poorly conditioned in this monomial basis despite
the small analytic remainder. Subdividing patches is possible but its
number and preparation cost must be charged.

At fixed polygon geometry, lattices, positive \(\lambda_-\), and fixed
query patch, allocate constant positive fractions of the target error:
\(\eta,\epsilon_G,\epsilon_K=\Theta(\epsilon)\), and let
\(L_\epsilon=1+\log(1/\epsilon)\). The proved
polygon-pair construction uses \(O(\epsilon^{-1}L_\epsilon^5)\)
candidate arithmetic. Here \(b=O(\sqrt{L_\epsilon})\),
\(n+1=O(L_\epsilon)\). Thus a conservative assembly has preparation
\(O(\epsilon^{-1}L_\epsilon^7)\), response state \(O(L_\epsilon^2)\)
and query arithmetic \(O(L_\epsilon^3)\), **plus coefficient acquisition
and the stated precision costs**. These asymptotic constants need not be
small. Multiple patches multiply preparation; changing sources can require
rebuilding it. No gaming frame rate follows from these arithmetic bounds.

The full analytical response error is
\(\eta+\epsilon_G+\epsilon_K\), with (16) and any unaccounted parameter
errors added. Center/covariance parameter errors cannot silently be folded
into a polynomial remainder derived for different parameters.

## 6. Classical foundations and the actual research gap

Aggregating sources into moments and evaluating their collective smooth
field is classical. [Greengard and Strain (1991), section 2, Lemmas
2.1–2.2](https://math.nyu.edu/~greengar/fgt_1991.pdf) use Hermite and
Taylor expansions to replace sums of Gaussian sources by collective
expansions. [Veerapaneni and Biros (2008)](https://dept.math.lsa.umich.edu/~shravan/papers/heat2d.pdf)
combine piecewise polynomial source representations, Gaussian transforms
and Fourier transforms for distributed heat potentials. These establish
the prior-art boundary; this note's algebra is not a claim to have invented
moment compression or Gaussian response reuse.

Our explicit assembly answers a narrower question: a certified finite
material-pair computation can feed a compact camera/scale response state,
with its preparation and error amplification visible. It does **not**
answer how a rich material program prepares that state cheaply without
enumerating its interactions. That preparation problem, and the conditions
for updating state under allowed material operations, remain substantive.

## 7. Independent material controls require additional state

Take a one-dimensional example

\[
 A(x)=\tfrac12(1+\cos Cx),\qquad
 B_\delta(x)=\tfrac12(1+\cos(Cx+C\delta)).
\]

For \(X\sim N(\mu,\sigma^2)\), direct multiplication gives

\[
\begin{aligned}
 \mathbb E[A(X)B_\delta(X)]
 ={}&\tfrac14+\tfrac18\cos(C\delta)\\
 &+\tfrac14 e^{-\sigma^2C^2/2}
 [\cos(C\mu)+\cos(C\mu+C\delta)]\\
 &+\tfrac18e^{-2\sigma^2C^2}\cos(2C\mu+C\delta).
\end{aligned} \tag{17}
\]

The far-field relative-phase term survives when spatial carriers vanish.
Its pairs have combined spatial frequency \(k=0\), yet its dependence on
the independent layer displacement has frequency \(C\). A moment cache
in \(k\) for one fixed \(\delta\) does not predict other registrations.

More generally, shifts of the two sources give pair phase

\[
 m\cdot s_A+n\cdot s_B
 =(m+n)\cdot s_B+m\cdot(s_A-s_B). \tag{18}
\]

Spatial Gaussian averaging damps \(m+n\), not the relative-control
frequency \(m\). Thus a compact final response for camera and scale
does not automatically supply a compact response for every animation or
material control.

This example is **not** a general complexity lower bound: retaining the
phase coordinate \(\phi=C\delta\bmod2\pi\) makes (17) a constant-size
trigonometric law. It identifies what a sufficient state must preserve.
The useful organizing question is therefore which spatial, scale and
control queries are allowed, and which undamped phase or symmetry
coordinates make their joint response compact. Count maps provide some
of those coordinates. The general compact-state and cheap-preparation
conditions are still open.
