# Reusing prototype summaries while a threshold changes

September 6, 2026. Theory only; no novelty, fixed-float or performance claim.
The construction has independent analytic audits. It extends
[NOISE-PROTOTYPE-MOMENTS.md](NOISE-PROTOTYPE-MOMENTS.md) with a scalar
material control, without rebuilding the source's geometry for each change.

The stored object is a family of cumulative moments of each local scalar
field. A material update selects or blends those moments and rebuilds their Walsh
profiles once; every admitted pixel then reuses the resulting table.
This update has an explicit cost. It is not a free animated-source theorem.

## 1. One coherent threshold choice per prototype

Keep the finite source-state, hash and grid contract of the prototype note.
For each of its \(S=PD_xD_y\) states \(s\), supply a scalar field \(V_s\)
on the unit square. A common threshold \(\theta\) gives
\[
 f_{s,\theta}(t,u)=\mathbf1_{\{V_s(t,u)\le\theta\}},\qquad
 G_s(a)=|\{(t,u)\in[0,1]^2:V_s(t,u)\le a\}|.              \tag{1}
\]
The constructive class below uses rational polynomials \(V_s\).
For a desired area allowance \(0<\eta\le1\), prepare ordered threshold knots
for each prototype such that every intervening value interval carries
area mass at most \(\eta\).

Given \(\theta\), select its largest lower knot \(a_s(\theta)\).
Use the same knot for every moment of that prototype:
\[
 \widehat f_{s,\theta}=\mathbf1_{\{V_s\le a_s(\theta)\}},
 \qquad
 M_{s,\alpha,\beta}(a)
 =(J+1)^2\int\mathbf1_{\{V_s\le a\}}B_\alpha^J B_\beta^J.
                                                               \tag{2}
\]
Use the exact zero/one response outside the declared value range.
Then \(0\le\widehat f_{s,\theta}\le f_{s,\theta}\le1\), with disagreement
area at most \(\eta\) per unit cell. The different prototypes may choose
different knots. They still define one complete bounded spatial source.

## 2. Price the source error under the actual footprint

For a differentiable one-dimensional density \(p\) and unit cells,
\[
 \sum_i\sup_{[i,i+1]}p
 \le\int_{\mathbb R}p+\int_{\mathbb R}|p'|.
\]
For a Gaussian of width \(\sigma\), this is
\(1+\sqrt{2/\pi}/\sigma\). Thus, for the independent native Gaussian axes
of the prototype theorem, \(\sigma_x,\sigma_y\ge1\),
\[
 0\le I_\theta-I_{\rm floor}
 \le\eta\left(1+\frac{\sqrt{2/\pi}}{\sigma_x}\right)
          \left(1+\frac{\sqrt{2/\pi}}{\sigma_y}\right)
 <4\eta.                                                 \tag{3}
\]
Proof: bound each cell's integral of the nonnegative disagreement by its
area times the supremum of the Gaussian density on that cell, then sum.

Apply the polynomial-kernel approximation to the complete floor source
\(\widehat F_\theta\). A sufficient total budget is
\[
 4\eta+\epsilon_K+16\eta_M+\epsilon_{\rm numerical},       \tag{4}
\]
where \(\epsilon_K\) is the kernel allowance and \(\eta_M\) bounds acquisition
error in each stored moment relative to its selected floor source.
Weight/transform/parameter/accumulation errors are separate as in the
prototype note. Do not add a \(J^2\eta\) term: (3) already pays for threshold
discretization under the true query. All moments must use the same floor
threshold for this argument.

### Continuous control without an additional source allowance

For consecutive knots \(a_k\le\theta\le a_{k+1}\), another coherent choice is
\[
 \lambda=\frac{\theta-a_k}{a_{k+1}-a_k},\qquad
 \widehat f_\theta=(1-\lambda)\mathbf1_{\{V\le a_k\}}
                    +\lambda\mathbf1_{\{V\le a_{k+1}\}}.
\]
Use the same \(\lambda\) for all moment entries of a prototype.
This bounded function and \(f_\theta\) agree outside the intervening value
band; their absolute difference is at most its indicator. Equation (3)
therefore holds as an absolute error bound, and (4) is unchanged.
Its moments are exactly the corresponding convex blend of the two tables.
Moment acquisition errors bounded by \(\eta_M\) remain bounded by \(\eta_M\)
after this blend, before parameter and arithmetic errors.

The constructed source and its true Gaussian mean are continuous and
nondecreasing in \(\theta\), so moving the control need not step between
table levels. The signed polynomial-kernel contraction is also continuous,
but need not preserve monotonicity exactly; (4) bounds its error.
A constant prototype retains its actual jump instead. This is continuity
of the approximation, not a bound on temporal frequency or a motion-blur
theorem. Narrow value intervals can still demand accurate blend-weight
evaluation.

## 3. An explicit polynomial modulus, including critical values

For a nonconstant rational polynomial \(V(x,y)\), swap axes if necessary
so its highest \(x\)-degree \(m\) is positive. Let \(c(y)\) be the coefficient
of \(x^m\), with degree \(b\) and nonzero leading coefficient \(c_*\).
Put \(d_*=m+b\le\deg V\). Uniformly over every real \(\theta\) and \(a>0\),
\[
 |\{|V-\theta|\le a\}|
 \le\min\{1,\,2d_*(a/|c_*|)^{1/d_*}\}.                  \tag{5}
\]
This elementary coefficient bound is deliberately conservative.

For a univariate degree-\(m\) polynomial
\(p(x)=c\prod_{\ell=1}^m(x-z_\ell)\), \(|p(x)|\le a\) implies that \(x\)
lies within \((a/|c|)^{1/m}\) of some complex root. Projecting the corresponding
disks to the real line bounds the sublevel length by
\(2m(a/|c|)^{1/m}\).
If \(b=0\), integrate this bound directly over \(y\).
If \(b>0\), separate the strip \(|c(y)|\le\tau\) from its complement.
Their contributions to area are at most
\[
 2b(\tau/|c_*|)^{1/b}+2m(a/\tau)^{1/m}.
\]
Choose \(\rho=(a/|c_*|)^{1/d_*}\) and \(\tau=|c_*|\rho^b\).
Both terms have the common factor \(\rho\), proving (5).
The leading positive-\(x\)-degree coefficient is unaffected by subtracting
\(\theta\); this makes the estimate uniform in the threshold.

A nonconstant polynomial has zero-area level sets, so \(G\) is continuous
and has no atoms. It need not have a bounded density: \(V=x^d\) has
\(G(a)=a^{1/d}\) near zero. Constant prototypes have one exact jump and
are handled separately with the supplied \(\le\) convention.

Let \(B=2\sum|\text{coefficients of }V|>0\), so \(|V|<B\) on the square.
The strict enclosure also makes the interpolated source meet its exact
zero/one extensions continuously at the two outer knots.
The rational data \(B,c_*\), the actual expanded polynomial degree and
coefficient bits are inputs to the cost. Small \(c_*\) can demand fine
threshold precision. No bound in succinct shader-circuit length is asserted.

## 4. Rational quantile knots with a terminating construction

Use finitely represented rational accuracy allowances and set
\[
 K=\lceil2/\eta\rceil,\qquad \zeta=\eta/8,\qquad
 r_k=k/K\quad(1\le k<K).                                 \tag{6}
\]
For each target \(r_k\), bisect the value interval \([-B,B]\).
At a rational midpoint \(a\), obtain a certified interval
\([L(a),U(a)]\) containing \(G(a)\), of width at most \(\zeta\).

- If \(r_k\in[L(a),U(a)]\), keep \(a\) as the knot.
- If \(U(a)<r_k\), replace the left endpoint by \(a\).
- If \(L(a)>r_k\), replace the right endpoint by \(a\).

The remaining endpoints bracket the target in true CDF value.
If the search has not already stopped, stop after
\[
 L_*=\left\lceil
        \log_2(B/|c_*|)+d_*\log_2(2d_*/\zeta)
      \right\rceil                                      \tag{7}
\]
halvings and keep the left endpoint. Here \(B\ge|c_*|\).
The residual value interval has width at most
\(2|c_*|(\zeta/(2d_*))^{d_*}\). Equation (5), centered on that interval,
therefore bounds its CDF variation by \(\zeta\).
In either stopping case the chosen knot \(a_k\) satisfies
\[
 |G(a_k)-k/K|\le\zeta.                                   \tag{8}
\]
Use certified upward rounding of (7), or its equivalent rational
interval-width inequality, so the depth is not underestimated.

The knots are strictly ordered: \(1/K\ge\eta/(2+\eta)>2\zeta\).
Add \(a_0=-B\), \(a_K=B\). Consecutive internal knots have probability gap
at most \(1/K+2\zeta\le3\eta/4\); the two end gaps are at most
\(1/K+\zeta\le5\eta/8\). Thus every floor lookup has the area allowance
used in (3), with \(O(1/\eta)\) knots per prototype.
Exact comparisons with their rational locations are part of the control
contract; rounded control inputs need an additional allowance.

Each target uses at most \(L_*+1\) CDF calls. Knot bit lengths grow by
\(O(L_*)\) beyond the rational endpoint representation. Existence of exact
quantiles is not being substituted for their acquisition.

## 5. The CDF and moment oracles have explicit prices

At a rational level \(a\), the CDF is the area of the polynomial predicate
\(V-a\le0\). Use the complete rational box decisions of
[IMPLICIT-POLYNOMIAL-SOURCE.md](IMPLICIT-POLYNOMIAL-SOURCE.md):
resolved cells contribute their exact area or zero; unresolved cells
contribute zero to the lower bound and their area to the upper bound.

For \(D=\deg V\ge1\), \(C_D=2D^2+7D\), unit-square cell width \(h\) gives
unresolved area at most \(10Dh+C_Dh^2\). Taking the minimal dyadic depth
with
\[
 h\le\min\{1,\zeta/(20D),\sqrt{\zeta/(2C_D)}\}             \tag{9}
\]
makes the CDF interval width at most \(\zeta\).
The visited-node count for one such CDF call is
\[
 T_{\rm CDF}=O(D^2/\zeta+D^2\log(D/\zeta)).               \tag{10}
\]
Complete polynomial decisions and their degree/input-bit/depth-bit costs,
threshold-coefficient formation and exact rational area summation remain
additional to this count. Across one prototype, there are at most
\((K-1)(L_*+1)\) such calls.

After acquiring the knots, acquire all degree-\(J\) moments at each knot
to error \(\eta_M\), using section 6 of the prototype note.
With a common degree bound \(D\), this has the sufficient node count
\[
 T_M=O\left(D^2(J+1)^2/\eta_M+
             D^2\log(D(J+1)^2/\eta_M)\right)              \tag{11}
\]
per knot, plus \(O((J+1)^2)\) rational moment arithmetic per rectangle and
the complete decision/bit costs.
A safe total preparation budget sums \(K(L_*+1)T_{\rm CDF}\) decision
nodes and \(KT_M\) moment-acquisition nodes over all \(S\) prototypes,
including their actual arithmetic precision. This bound makes no assumption
that searches or geometry from different levels can be shared.

The reusable untransformed table stores
\[
 O(SK(J+1)^2)
\]
numbers, plus knot locations. A scalar material update requires
\[
 O(S\log K+S(J+1)^2\log P)                               \tag{12}
\]
arithmetic/table work for the per-prototype searches, active-table assembly
and Walsh profile rebuild. The transformed active table is then used by
the unchanged pixel-query algorithm.
This amortization requires a threshold shared across the rendered material;
a threshold varying per pixel does not inherit one rebuild per frame.

Knots shared across Bernstein indices within one prototype are not shared
automatically across all prototypes. Pretransforming a single global
threshold ladder trades update work for potentially much larger storage.
Neither tradeoff is declared inexpensive.

## 6. Limited extensions and interpretation

For a band response \(\mathbf1_{\{a<V\le b\}}\), \(a\le b\), use the
difference of the two cumulative tables. Floor knots preserve endpoint
order, so the approximate band is still a bounded indicator. Its symmetric
difference has area at most \(2\eta\) per prototype; (3) then gives
source error below \(8\eta\). Moment errors from both endpoint tables and
their arithmetic must be added. Using the continuous interpolation instead
also gives a response in \([0,1]\), because that approximation is pointwise
nondecreasing in the threshold. The same \(8\eta\) bound follows from the
sum of the two endpoint disagreement bounds.

Multiple unrelated source controls or edits to \(V\) itself are different
problems. In particular, these tables do not determine moments over an
arbitrary clipped piece of a cell, and cannot be treated as polynomial
source coefficients under a fractional shift.
General bounded fields with atoms require certified atom locations and
equality conventions; section 4's nonconstant-polynomial construction
cannot be applied across such jumps.

This is a distribution/transfer-function construction with its preparation
and update costs exposed. It preserves the actual local scalar field's
threshold distribution. It does not replace that distribution by a
Gaussian or claim that finite summaries support every future material edit.

## Prior work

- Heitz, Nowrouzezahrai, Poulin and Neyret,
  [Filtering Non-Linear Transfer Functions on Surfaces](https://doi.org/10.1109/TVCG.2013.102),
  sections 4.1--4.2, already organize filtering as a value distribution
  paired with a transfer function. That organizing principle is prior art.
- Carbery and Wright (2001), *Distributional and \(L^q\) Norm Inequalities
  for Polynomials over Convex Bodies in \(\mathbb R^n\)*, Theorem 8,
  gives polynomial sublevel estimates under log-concave measures.
- Glazer and Mikulincer (2022),
  [Anti-concentration of polynomials: dimension-free covariance bounds and
  decay of Fourier coefficients](https://arxiv.org/pdf/2108.04268),
  Theorem 1 and Corollary 4, give coefficient-normalized variance and
  small-ball bounds. Coefficient-based anti-concentration is established
  mathematics; (5) supplies an elementary explicit constant for this square.

The result here is the stated connection between coherent prototype
quantiles, a terminating rational acquisition procedure, and the actual
Gaussian-query error. Novelty of the combination has not been established.
