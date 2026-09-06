# Certified acquisition of a planar polynomial-threshold source

September 6, 2026. Theory only; no novelty, fixed-float or performance claim.
This sufficient acquisition class for [GAUSSIAN-QUERY-STATE.md](GAUSSIAN-QUERY-STATE.md)
does not make arbitrary bounded-source moments inexpensive to acquire.

## 1. Exact input and reference coordinates

Work in declared coordinates z=(x,y) with reference gamma=N(0,I_2).
Supply finitely represented rational polynomials p_1,...,p_m and a
specified response circuit G with rational values in [0,1], defining

\[
 F(z)=G(\operatorname{sign}p_1(z),\ldots,\operatorname{sign}p_m(z)). \tag{1}
\]

The range restriction is an input contract; Boolean circuits satisfy it.
Price G's representation, evaluation and intermediate rational bit lengths.
Replace every constant polynomial, including the zero polynomial, by its
exact sign, respecting equality, strict and non-strict predicate conventions.
For the remaining nonconstant polynomials set D=sum_j deg(p_j)>=1 and
P=product_j p_j. The product defines the boundary superset Z={P=0};
the algorithm need not expand it. Each remaining zero set has Gaussian
measure zero; its equality convention does not change the integral.
The actual material boundary may be smaller.

If D=0, evaluate v exactly: H_0=v, all other H_alpha=0; no subdivision or CDF calls.

Irrational whitening need not preserve rational coefficients. Exact algebraic
coefficients need a separate encoded number-field/bit contract; approximate
coefficients need a source-perturbation certificate. Neither is assumed here.

## 2. A complete cell decision, not a sampling heuristic

Start with the rational square [-R,R]^2, R>0. For each closed dyadic
cell C, decide, for every remaining j, the existential statement

\[
 \exists(x,y)\in C:\ p_j(x,y)=0. \tag{2}
\]

This has four rational linear box constraints and one polynomial equality.
If all answers are false, signs are constant on connected C: store the rational-center value.
Otherwise subdivide, or mark C uncertain at maximum depth, including tangencies,
isolated zeros and boundary touches. Incomplete interval/Bernstein tests need a complete fallback.

Basu's Theorem 2.18 gives s^(k+1)d^O(k) arithmetic operations for one
existential block and intermediate integer bit lengths tau*d^O(k).
Here k=2 and s=5: separate tests cost m*d_max^O(1) operations per cell.
After clearing denominators, depth ell adds O(ell) box-endpoint bits to
R's encoded size. Cell-test bit cost is polynomial in degree and input/
endpoint bits at fixed dimension, without a root-separation assumption.
This asymptotic decision result is not an inexpensive GPU test.

## 3. Explicit zero-set cell count

Consider a k-by-k grid of the square, cell side h=2R/k. Let M_k count
closed cells meeting Z. A direct deduction gives

\[
 M_k\le\min\{k^2,\ 10Dk+2D^2+7D\}. \tag{3}
\]

There are 2(k+1) grid lines. A restriction not identically zero has <=D roots;
each root touches <=4 cells, accounting for at most 8D(k+1) cells.
Identically zero grid lines are distinct linear factors: <=D in total,
each meeting <=2k cells. Every remaining hit cell contains an entire
connected component of Z; different such cells require different components.
Milnor's bound b_0(Z)<=D(2D-1), as quoted by Wongkew, completes (3).
Singularities and grid-aligned factors are allowed; constants are loose.

Wongkew independently gives O(D*R*rho+D^2*rho^2) tube area, including singularities.
Our constants instead use the incidence argument and its stated component bound.

Only uncertain cells are split. Through depth L>=0 the total number of
tested nodes, including the root, is bounded by

\[
 T_L\le1+40D(2^L-1)+4(2D^2+7D)L. \tag{4}
\]

Indeed each tested child has a zero-set-intersecting parent, so
T_L<=1+4 sum_{ell=0}^{L-1} M_{2^ell}. No samples are presumed to detect
features. The number of stored constant leaves is at most T_L.

## 4. Collective source error and an explicit selector

Let h=2R/2^L and let U_h be the union of uncertain terminal cells.
Cell interiors are disjoint, hence, with C_D=2D^2+7D,

\[
 |U_h|\le20DRh+C_Dh^2. \tag{5}
\]

Define F_hat by the certified constants and zero on U_h and outside
the square. Since 0<=F<=1, sup gamma-density=1/(2pi), and the square
contains the radius-R disk,

\[
 \|F-\widehat F\|_{L^2(\gamma)}^2
 \le \frac{20DRh+C_Dh^2}{2\pi}+e^{-R^2/2}=:E_A^2. \tag{6}
\]

For any geometric acquisition allowance 0<eta<=1, choose a rational R
and an integer L satisfying the following sufficient conditions:

\[
 R\ge\max\{1,\sqrt{2\log(2/\eta^2)}\},\qquad
 h_* =\min\left\{2R,\frac{\pi\eta^2}{40DR},
                    \eta\sqrt{\frac{\pi}{2C_D}}\right\},
 \quad L\ge\max\{0,\lceil\log_2(2R/h_*)\rceil\}. \tag{7}
\]

Then the tail, linear and quadratic terms in (6) are at most eta^2/2,
eta^2/4 and eta^2/4 respectively. Numerical construction of these
selectors must round outward so the displayed inequalities hold.
Alternatively, sum certified Gaussian masses of uncertain rectangles
for a tighter a posteriori allowance. No fitted boundary margin is used.

With orthonormal probabilists' Hermites, H_alpha=E_gamma[F h_alpha] and
Hhat_alpha=E_gamma[F_hat h_alpha], Bessel gives for every retained degree N:

\[
 \left(\sum_{|\alpha|\le N}|H_\alpha-\widehat H_\alpha|^2\right)^{1/2}
 \le E_A\le\eta. \tag{8}
\]

No sqrt(K_N) factor occurs. A query patch with density-ratio norm bound kappa_*
has scalar contribution <=kappa_*eta; query truncation remains separate.

## 5. Rectangle moments and remaining costs

For a certified leaf [a,b]x[c,d] of constant value v, its contribution
to Hhat_(p,q) is v J_p(a,b)J_q(c,d), where

\[
 J_0(a,b)=\Phi(b)-\Phi(a),\qquad
 J_n(a,b)=\frac{\phi(a)h_{n-1}(a)-\phi(b)h_{n-1}(b)}{\sqrt n},\ n\ge1.
 \tag{9}
\]

The second identity follows from (phi h_{n-1})'=-sqrt(n) phi h_n.
Accumulate total degrees p+q<=N, K_N=(N+1)(N+2)/2. A direct method
uses O(K_N*T_L) arithmetic operations, O(N) endpoint recurrences per
leaf and O(T_L) Gaussian density and one-dimensional CDF calls; the output state has K_N
entries. Streaming does not require retaining all leaf moment vectors.

Certified CDF differences, recurrences, products and sums need a numerical vector
allowance eta_num, giving stored-state error <=eta+eta_num. Query coefficients
and final accumulation need separate budgets; required precision is not fixed.

With R within a constant factor of its lower bound in (7), and L the
smallest admissible integer (or at most a constant number of extra levels), nodes cost
O(D^2*R^2/eta^2+D^2*log(D*R^2/eta^2)), plus cell tests, G and moment arithmetic.
Degree can be exponential in compact circuit size. This proves admission and
termination, not practical speed or coverage of arbitrary-real/transcendental sources.

## 6. A stronger query-only allowance under a broader reference

Suppose every whitened query q=N(m,Q) satisfies
q_- I<=Q<=(1-delta)I, q_->0, 0<delta<1, and ||m||<=L_q.
Completing the square in q/gamma gives

\[
 \|q/\gamma\|_\infty
 =\det(Q)^{-1/2}\exp\{\tfrac12m^T(I-Q)^{-1}m\}
 \le q_-^{-1}\exp\{L_q^2/(2\delta)\}=:K_\infty. \tag{10}
\]

Our coherent underapproximation obeys 0<=F_hat<=F<=1 almost everywhere.
If u=gamma(U_h union outside-square), then

\[
 0\le E_qF-E_q\widehat F\le K_\infty u. \tag{11}
\]

For a scalar source allowance epsilon_A>0, use (7) with
eta=sqrt(min(1,epsilon_A/K_infty)); (6) bounds u by eta^2 as well.
Using the same minimal-depth convention gives
O(D^2*R^2*K_infty/epsilon_A) nodes plus logarithmic terms
when epsilon_A/K_infty<=1. It does not improve the L2 claim (8).
Compile the moments of this same bounded F_hat: its own query truncation
still has the companion note's variance factor beta=1/2. Total response
error is epsilon_A plus that truncation bound and numerical allowances.
There is no claim that the moments of F were acquired to error epsilon_A.

For rational physical polynomials, rational mu_ref and A=cI, c rational,
preserve rational coefficients and degree under x=mu_ref+c z. Given covariance
bounds Sigma_-<=Sigma<=Sigma_+, choose c^2>=lambda_max(Sigma_+)/(1-delta)
using certified spectral bounds; q_-=lambda_min(Sigma_-)/c^2>0 suffices.
Price substitution bit growth and the changed source/query state. Excessively
broad references worsen q_- and Hermite degree; (10) is not uniform near
delta=0, q_-=0 or unbounded mean. This choice is not asserted optimal.

## 7. Price acquisition directly under the query family

The Gaussian reference used for the Hermite basis need not also be the
measure used to bound acquisition error. A simpler sufficient construction
avoids the exponential mean-range factor in (10).

In the same reference coordinates, suppose the whole query family has
\(q_-I\preceq Q\preceq q_+I\) and \(|m|\le L_q\), with \(q_->0\).
Every two-dimensional query density is at most \(1/(2\pi q_-)\).
Writing \(Y=m+Q^{1/2}Z\), for \(R>L_q\) gives
\[
 P_q(Y\notin[-R,R]^2)
 \le P(|Z|>(R-L_q)/\sqrt{q_+})
 =\exp[-(R-L_q)^2/(2q_+)].
\]
Thus the same resolved-cell approximation satisfies, uniformly over queries,
\[
 0\le E_qF-E_q\widehat F
 \le\frac{20DRh+C_Dh^2}{2\pi q_-}
       +\exp[-(R-L_q)^2/(2q_+)].                         \tag{12}
\]
No density-ratio bound or \(Q<I\) assumption is needed for this step.

For \(D\ge1\) and \(0<\epsilon_A\le1\), choose a rational reach rounded
upward so that
\[
 R\ge\max\{1,L_q+\sqrt{2q_+\log(2/\epsilon_A)}\},\qquad
 h_*=\min\left\{2R,\frac{\pi q_-\epsilon_A}{40DR},
                   \sqrt{\frac{\pi q_-\epsilon_A}{2C_D}}\right\},
 \quad L=\max\{0,\lceil\log_2(2R/h_*)\rceil\}.            \tag{13}
\]
The tail costs at most \(\epsilon_A/2\), and each area term at most
\(\epsilon_A/4\). Use one mesh chosen from these family bounds, rather
than rebuilding a different approximation for each query.
With \(R\) within a constant factor of its lower bound and this minimal depth,
\[
 T_L=O\left(\frac{D^2R^2}{q_-\epsilon_A}
          +D^2\log\frac{DR^2}{q_-\epsilon_A}\right).       \tag{14}
\]
The quadratic step-size constraint fits this bound because
\(R^2/(q_-\epsilon_A)\ge2\log2\).
Exact cell decisions, circuit evaluation, and rectangle moment arithmetic
and precision are still charged as in section 5.

Compile the one bounded \(\widehat F\) into its Hermite state. The response
budget is \(\epsilon_A\), plus its bounded-source query truncation, plus
numerical state/query/accumulation errors. Do not additionally charge
\(\|F-\widehat F\|_2\): (12) already accounts for this source approximation.
The Hermite query itself retains its separate strict \(Q<2I\) admission
with a declared margin. Its degree and numerical amplification may still
depend strongly on mean range. Only the geometric acquisition estimate
has removed section 6's exponential mean-range penalty.

## Primary references

- Richard Wongkew (1993), [Volumes of tubular neighbourhoods of real
  algebraic varieties](https://msp.org/pjm/1993/159-1/pjm-v159-n1-p10-p.pdf),
  main theorem p.178; Milnor component bound in the proof, pp.179--181.
- Saugata Basu (author survey), [Algorithms in Real Algebraic Geometry](https://www.math.purdue.edu/~sbasu/raag_survey2011_final.pdf),
  Theorem 2.18, p.13, arithmetic complexity and integer bit lengths;
  section 2.5 makes the dense-degree representation convention explicit.
