# Nonlinear noise responses through local prototype moments

September 6, 2026. Theory only. The construction and error accounting have
independent analytic audits; no novelty, implementation, fixed-float or
game-performance claim is made.

The finite carry state in [NOISE-COMPOSITION.md](NOISE-COMPOSITION.md)
identifies an entire local function, not only its polynomial coefficients.
This permits bounded nonlinear responses, including sharp thresholds, by
approximating the pixel kernel and acquiring moments of the complete response.
It removes the polynomial-response restriction for that source family.
It does not make acquiring or updating those moments free.

## 1. Source state and what composition preserves

Use the original source contract: \(P=2^b\), invertible GF(2) axis maps
\(A_x,A_y\), common unit grid and fixed supplied gradient profiles. For
integer cell indices, all arithmetic increments and wraps are modulo \(P\).
Write
\[
 g_{ij}=A_xi\oplus A_yj,\qquad
 d_i=A_x((i+1)\oplus i),\quad e_j=A_y((j+1)\oplus j).
\]
There are \(D_x,D_y\le b\) carry classes. The four corner keys are
\(g,g\oplus d,g\oplus e,g\oplus d\oplus e\).
They determine every admitted noise field throughout the cell.

Consequently any fixed bounded measurable pointwise response of those
fields has an exact representation
\[
 F(i+t,j+u)=f_{d_i,e_j,g_{ij}}(t,u),\qquad
 0\le f_{d,e,g}\le1,\quad (t,u)\in[0,1]^2.                 \tag{1}
\]
Cell seams are irrelevant to positive-width Gaussian integrals. There
are at most \(S=PD_xD_y\) prototypes, including possibly unused states.
Polynomiality and smoothness of the response are unnecessary for (1).
Its dependence on the shared local coordinates must remain in each prototype.

This is closure of the *local source description*. Moments of a product
cannot in general be formed by multiplying moments of its factors.
Acquire moments of the whole joint response. Changing a threshold, profile
or other source control generally changes this table.

## 2. The table contains moments, not source coefficients

For degree \(J\), let \(B_\alpha^J\) be the Bernstein basis and define
\[
 M_{d,e,\alpha,\beta}(g)
 =(J+1)^2\int_{[0,1]^2}
 f_{d,e,g}(t,u)B_\alpha^J(t)B_\beta^J(u)\,dt\,du.
                                                               \tag{2}
\]
Each entry lies in \([0,1]\): each factor \((J+1)B_\alpha^J\) is a
probability density. These entries are not Bernstein coefficients of \(f\).
Their existence alone supplies no algorithm for obtaining them.

Approximate a one-dimensional Gaussian on physical unit cell \(i\) by
\(\widetilde p_x(i+t)=\sum_\alpha\beta^x_{i,\alpha}B_\alpha^J(t)\).
For a retained finite collection of cells define folded weights
\[
 u_\alpha(r)=\frac1{J+1}\sum_{i\equiv r\pmod P}\beta^x_{i,\alpha},
 \qquad
 v_\beta(s)=\frac1{J+1}\sum_{j\equiv s\pmod P}\beta^y_{j,\beta}.
                                                               \tag{3}
\]
The exact integral against these polynomial kernels is
\[
 \widetilde I=\sum_{r,s,\alpha,\beta}
 u_\alpha(r)v_\beta(s)
 M_{d_r,e_s,\alpha,\beta}(A_xr\oplus A_ys).                \tag{4}
\]
This follows by integrating within each cell before folding. It does not
require enumerating the Cartesian product of the retained axis-cell lists.

Define carry-masked, reindexed vectors
\[
 w_{d,\alpha}(a)=\mathbf1_{d_{A_x^{-1}a}=d}u_\alpha(A_x^{-1}a),
 \quad
 z_{e,\beta}(a)=\mathbf1_{e_{A_y^{-1}a}=e}v_\beta(A_y^{-1}a).
\]
With the unnormalized Walsh transform on \(b\) bits, (4) becomes
\[
 \widetilde I=\frac1P
 \sum_{d,e,\alpha,\beta,k}
 \widehat M_{d,e,\alpha,\beta}(k)
 \widehat w_{d,\alpha}(k)\widehat z_{e,\beta}(k).           \tag{5}
\]
This uses the old contraction but different weights and their required
\((J+1)^{-1}\) normalization.

## 3. Gaussian approximation at every width of at least one cell

The coordinates of the native Gaussian must be independent. For an axis
allowance \(0<\delta<1\), set
\[
 R=\sqrt{2\log(4/\delta)},\quad M_*=R/2+3/8,\quad
 N=\left\lceil\max\{1,2eM_*,\log_2(8/\delta)\}\right\rceil,
 \quad J=2(N-1).                                         \tag{6}
\]
All parameter rounding must preserve the stated inequalities.

For \(1\le\sigma<\sigma_H\), where
\[
 \sigma_H=P\max\{1,R/(2\pi)\},
                                                               \tag{7}
\]
retain every unit cell meeting \([\mu-R\sigma,\mu+R\sigma]\).
On a cell centered at \(c\), put \(H=1/\sigma\), \(y=(c-\mu)/\sigma\) and
\[
 z(t)=-Hy(t-\tfrac12)-\tfrac12H^2(t-\tfrac12)^2,\qquad
 \widetilde p(c+t-\tfrac12)
 =p(c)\sum_{a=0}^{N-1}z(t)^a/a!.
                                                               \tag{8}
\]
The local Gaussian proof in
[GAUSSIAN-SUBDIVISION-COST.md](GAUSSIAN-SUBDIVISION-COST.md), sections 2--4,
gives \(M_C=H|y|/2+H^2/8\le M_*\) and
\[
 \sum_C p(c_C)e^{M_C}<4,\qquad
 \max_\alpha|\beta_{C,\alpha}|\le p(c_C)e^{M_C}.
                                                               \tag{9}
\]
The omitted Gaussian tail is at most \(\delta/2\); the retained-cell
kernel \(L^1\) error is at most \(4M_*^N/N!\le\delta/2\).
Folding over periods is \(L^1\)-contractive.

For \(\sigma\ge\sigma_H\), use the uniform density \(1/P\) on a period.
Indeed, putting \(a=2\pi^2(\sigma/P)^2\ge2\pi^2\), its error is
\[
 \|p_{\rm wrapped}-1/P\|_1
 \le2\sum_{n\ge1}e^{-an^2}\le4e^{-a}\le\delta.             \tag{10}
\]
Here \(n^2\ge1+3(n-1)\) bounds the series, and (7) gives
\(a\ge R^2/2=\log(4/\delta)\).
In (3) use \(u_\alpha(r)=1/[P(J+1)]\) for this branch.

The direct branch visits at most
\[
 K_\delta=2PR\max\{1,R/(2\pi)\}+2
          =O(P[1+\log(1/\delta)])                        \tag{11}
\]
axis cells. The choice of branch is independent for each coordinate.
Both resulting axis kernels have wrapped \(L^1\) error at most \(\delta\).
Compare their products on the period torus \([0,P)^2\), where all kernels
are integrable. Since the original kernels have mass one, the result is
\[
 |I-\widetilde I|\le2\delta+\delta^2.                     \tag{12}
\]
This holds even when polynomial kernels are signed. Taking
\(\delta=\epsilon_K/3\), \(0<\epsilon_K\le1\), makes (12) at most
\(\epsilon_K\). Thus \(J=O(\log(1/\epsilon_K))\) for all
\(\sigma_x,\sigma_y\ge1\), with arbitrary centers.

### A sharper degree from the Gaussian's derivatives

Claude's alternative K1 (bridge 423) approximates the Gaussian itself by
its degree-\(J\) Taylor polynomial at each cell center:
\[
 \widetilde p_C(c+s)=\sum_{n=0}^J p^{(n)}(c)s^n/n!.
                                                               \tag{20}
\]
The primary [NIST DLMF 18.14.9](https://dlmf.nist.gov/18.14#E9)
Hermite bound, attributed there to Szász (1951), is sharper than the
older rounded Cramér constant: converting
\(\mathrm{He}_n(y)=2^{-n/2}H_n(y/\sqrt2)\) gives
\[
 e^{-y^2/4}|\mathrm{He}_n(y)|\le\sqrt{n!}.
                                                               \tag{21}
\]
Thus \(p^{(n)}(x)=(-1)^n\sigma^{-n-1}
\mathrm{He}_n((x-\mu)/\sigma)\phi((x-\mu)/\sigma)\) has an explicit
absolute bound. With \(m=J+1\), Taylor's theorem and \(|s|\le1/2\) give
\[
 \sum_{\text{all unit cells}}\|p-\widetilde p_C\|_{L^1(C)}
 \le\frac{\sigma^{-m-1}2^{-m}(4+2\sigma\sqrt\pi)}
          {\sqrt{m!}\sqrt{2\pi}}
 \le\frac{4\,2^{-m}}{\sqrt{m!}}\quad(\sigma\ge1).          \tag{22}
\]
For the first inequality, the sum of cell suprema of
\(\exp[-(x-\mu)^2/(4\sigma^2)]\) is at most \(4+2\sigma\sqrt\pi\).
Its integral is \(2\sigma\sqrt\pi\); bounding each cell's supremum-minus-
average by its variation gives the even smaller additive constant two.
The finite retained window still needs its separate \(\delta/2\) tail.

Keep \(R,\sigma_H\) from (6)--(7), but choose the smallest integer \(m\ge1\)
with
\[
 4^m m!\ge64/\delta^2,\qquad J=m-1.                      \tag{23}
\]
The kernel and tail allowances are then at most \(\delta/2\) each.
Factorial growth gives
\(J=O(\log(1/\delta)/\log(2+\log(1/\delta)))\).
Equation (23) is a terminating integer selection, not a numerical probe.

This alternative also preserves the coefficient bound; it needs its own
proof. The centered monomial \((t-1/2)^n\) has degree-\(n\) Bernstein
coefficients of magnitude \(2^{-n}\), and elevation is convex. Hence
\[
 \max_\alpha|\beta_{C,\alpha}|
 \le\frac{e^{-y_C^2/4}}{\sigma\sqrt{2\pi}}
       \sum_{n=0}^J\frac{(2\sigma)^{-n}}{\sqrt{n!}}.
\]
Cauchy--Schwarz bounds the series by
\(\sqrt2\exp[1/(4\sigma^2)]\). The midpoint variation bound for a Gaussian
of width \(\sqrt2\sigma\) gives
\[
 \sum_C\frac{e^{-y_C^2/4}}{\sigma\sqrt{2\pi}}
 \le\sqrt2+\frac1{\sigma\sqrt{2\pi}}.
\]
Their product is at most
\(2e^{1/4}(1+1/(2\sqrt\pi))<4\) for \(\sigma\ge1\).
Thus the error and cost results below apply unchanged with (23)'s degree.
Forming the derivative coefficients and converting/elevating the Taylor
polynomial to Bernstein form costs \(O((J+1)^2)\) arithmetic per cell.
Actual derivative/coefficient evaluation errors still require certification.

## 4. Error in the prototype moments has bounded amplification

Equation (9), or the alternative bound after (23), followed by averaging
over the \(J+1\) coefficients and folding, gives
\[
 \sum_{r,\alpha}|u_\alpha(r)|<4,\qquad
 \sum_{s,\beta}|v_\beta(s)|<4.                            \tag{13}
\]
Uniform-branch weights have norm exactly one. Carry masks partition entries;
they introduce no extra class factor.
If every original entry of \(M\) is acquired to absolute error at most
\(\eta_M\), the resulting error in (4) is less than \(16\eta_M\).
This bound is independent of degree and of source polynomial coefficients.
It concerns the untransformed moment table, with exact contraction.

More generally, let folded weight errors have joint \(l^1\) norms
\(\eta_u,\eta_v\). Before Walsh and accumulation rounding, a sufficient bound is
\[
 16\eta_M+(1+\eta_M)
       [4\eta_u+4\eta_v+\eta_u\eta_v].                   \tag{14}
\]
Add (12), plus actual errors from storing/transformation of tables,
query transforms, coordinate/index selection and final accumulation.
The unnormalized Walsh table need not have entries in \([0,1]\).
Neither (13) nor a source bound certifies an existing floating-point
implementation or its intermediate dynamic range.

## 5. Storage, acquisition and query are separate costs

Let \(C_{\rm acquire}(J,\eta_M)\) include obtaining every prototype moment
to the required accuracy. In exact-real arithmetic the sufficient costs are
\[
\begin{aligned}
 \text{storage}&=O(PD_xD_y(J+1)^2),\\
 \text{preparation}&=C_{\rm acquire}
       +O(PD_xD_y(J+1)^2\log P),\\
 \text{query}&=O\bigl(K_\delta(J+1)^2
       +(D_x+D_y)(J+1)P\log P
       +PD_xD_y(J+1)^2\bigr).
\end{aligned}                                                   \tag{15}
\]
Gaussian polynomial formation uses the quadratic Bernstein recurrence
from the subdivision note, costing \(O((J+1)^2)\) per axis cell.
For \(D_x,D_y\le b=\log_2P\), the query bound reduces to
\[
 O\bigl(P(J+1)^2[b^2+1+\log(1/\delta)]\bigr).             \tag{16}
\]
Elementary functions, input bits, coefficient formation precision and
certified summation remain additional costs. Width is absent from this
bound; period and the prototype table are not. The sufficient degree
selector is conservative. No small GPU cost follows from (16).

## 6. A constructive acquisition class for sharp thresholds

Suppose each prototype is a rational finite-valued circuit
\(f=G(\operatorname{sign}p_1,\ldots,\operatorname{sign}p_m)\in[0,1]\)
on the unit square, with supplied rational polynomial predicates.
Remove constants, including zero polynomials, with the specified equality
convention. Let \(D\ge1\) bound their total degree for each prototype and put
\(C_D=2D^2+7D\). If there are no nonconstant predicates, all its moments
equal the exactly evaluated constant.

The complete polynomial box decisions and incidence proof in
[IMPLICIT-POLYNOMIAL-SOURCE.md](IMPLICIT-POLYNOMIAL-SOURCE.md)
apply after translating the square. At cell width \(h=2^{-L}\), unresolved
area and visited nodes satisfy
\[
 A_L\le10Dh+C_Dh^2,\qquad
 T_L\le1+40D(2^L-1)+4C_DL.                              \tag{17}
\]
Use the exact value on resolved rectangles and zero on unresolved ones,
forming one coherent lower approximation \(\widehat f\).
Since \(B_\alpha^J\le1\), every normalized moment error is at most
\((J+1)^2A_L\). For \(0<\eta_M\le1\), choose
\[
 h_*=\min\left\{1,\frac{\eta_M}{20D(J+1)^2},
          \sqrt{\frac{\eta_M}{2C_D(J+1)^2}}\right\},\qquad
 L=\lceil\log_2(1/h_*)\rceil.                            \tag{18}
\]
This gives uniform moment error at most \(\eta_M\) and the conservative count
\[
 T_L=O\left(\frac{D^2(J+1)^2}{\eta_M}
       +D^2\log\frac{D(J+1)^2}{\eta_M}\right)             \tag{19}
\]
per prototype, with constant-size cases interpreted separately.

All rectangle moments are exact rational polynomial integrals. For example,
\[
 C_\alpha(x)=\sum_{k=\alpha+1}^{J+1}
   \binom{J+1}{k}x^k(1-x)^{J+1-k},\qquad
 C_\alpha'(x)=(J+1)B_\alpha^J(x).
\]
A constant-value rectangle contributes its value times
\([C_\alpha(b_x)-C_\alpha(a_x)]
 [C_\beta(b_y)-C_\beta(a_y)]\).
Computing all endpoint vectors and accumulating all entries costs
\(O((J+1)^2)\) rational arithmetic per rectangle using polynomial
binomial construction. Complete box decisions, circuit evaluation,
polynomial expansion and coefficient/endpoint/rational bit lengths are
also charged. Thus the leading node count in (19) is not the complete
acquisition work; a sufficient arithmetic term is \(O(S T_L(J+1)^2)\)
in addition to those decisions.

Polynomial-fade noise has the required local polynomial structure once
its corner constants are fixed. For rational two-dimensional quintic
gradient noise, one local field has total degree at most eleven; a supplied
polynomial response of degree \(K\) has degree at most \(11K\) before its
thresholds. This is a local degree claim, not a global one or a bound in
succinct circuit size. Actual shader rounding is a separate source model.

## 7. Arbitrary supplied axis permutations preserve the algebra

Replace \(A_x,A_y\) by supplied permutations \(\pi_x,\pi_y\) of the \(P\)
keys and set
\[
 g_{ij}=\pi_x(i)\oplus\pi_y(j),\qquad
 d_i=\pi_x(i+1)\oplus\pi_x(i),\quad
 e_j=\pi_y(j+1)\oplus\pi_y(j).
\]
The four-corner identity is unchanged. Reindex masks by
\(\pi_x^{-1},\pi_y^{-1}\) in (5). All moment, kernel and error statements
still hold. Forming the supplied permutations' carry-class and inverse
tables costs \(O(P)\) table operations, with \(b\)-bit key costs declared.

Now \(D_x,D_y\le P\), not necessarily \(b\). Keep the general cost (15);
the smaller bound (16) requires the smaller class counts. A table with
\(PD_xD_y\) states may exceed the \(P^2\) actual unit cells of a period.
An explicit-cell representation can then be preferable. This extension
admits the separable-XOR permutation family algebraically, with no automatic
compression or visual-quality guarantee.
An arbitrary nonseparable hash \(H(i,j)\) does not inherit (5).

## 8. Scope and the conceptual lesson

Arbitrary bounded measurable prototypes have moments but need not admit
effective acquisition from point samples. Section 6 supplies one explicit
class; it is not a universal nonlinear-material compiler.
Widths below one cell, correlated native Gaussians, unrelated grids and
general coordinate warps are outside this construction. Source edits
require updated moments unless a separate control representation is proved.

The organizing result is that complexity can be assigned to two different
objects: a finite local source state and a smooth family of footprint
queries. The polynomial degree here belongs to the footprint approximation,
not to the visible material. Sharp boundaries survive in the prototype
integrals and therefore need no source-polynomial approximation. The cost
has moved into acquiring a bounded table, not disappeared.

This combines existing carry-state and Gaussian/subdivision derivations.
Adaptive conservative procedural-shader acquisition has direct graphics
prior art in Greene and Kass (1994) and
[Heidrich, Slusallek and Seidel (1998)](https://vccimaging.org/Publications/Heidrich1998SPS/Heidrich1998SPS.pdf).
The old noise note records the relationship to Kensler, Knoll and Shirley's
XOR-permutation noise. No novelty claim is made for these ingredients or
their combination here.
