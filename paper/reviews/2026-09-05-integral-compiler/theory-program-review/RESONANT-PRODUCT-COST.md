# A conditional cost for products with retained frequency cancellations

2026-09-06. Theory only; no implementation, experiment, floating-point
certificate, or novelty claim. Finite polynomial convolution, backward
reachability, and transfer-matrix evaluation are classical. This note
prices one supplied source family and its discarded Gaussian contribution.
It does not assume that individually fast factors become independent.

## 1. Exact relevance for a finite product

Let f_i(theta)=sum_{k in K_i} a_i(k) exp(i k dot theta), i=1,...,m,
where m>=1 and K_i are supplied finite subsets of Z^d. All source
coefficients and indices are fixed. Let E be a supplied finite set of
output frequencies whose FULL product coefficients are required. Define

\[
 A_j=K_1+\cdots+K_j,\qquad B_j=K_{j+1}+\cdots+K_m,
 \qquad R_j=A_j\cap(E-B_j),
 \quad A_0=B_m=\{0\}.
 \tag{1}
\]

Set v_0(0)=1 if 0 belongs to R_0, and use the empty array otherwise.
The exact recurrence is

\[
 v_j(t)=\sum_{\substack{k\in K_j\\t-k\in R_{j-1}}}
 a_j(k)v_{j-1}(t-k),\qquad t\in R_j.
 \tag{2}
\]

For every t in R_j, v_j(t) is the full coefficient of the first j
factors. To prove this, choose a suffix sum s in B_j with t+s in E.
Every prefix contribution to t extends by that same suffix. If its last
step is k, its predecessor t-k lies in A_{j-1}, and (t-k)+(k+s) lies
in E with k+s in B_{j-1}. Thus every predecessor belongs to R_{j-1}.
Induction proves the claim; cancellations among coefficients do not
invalidate it. At j=m, all desired reachable coefficients are obtained.

Input truncation to E-E is not valid. For example, exp(iC theta) times
exp(-iC theta) has constant coefficient one for arbitrarily large C.
Both factors would disappear if E={0} were used to truncate their inputs.

Given the frontiers and their membership structures, let T_j count pairs
(r,k) in R_{j-1} times K_j whose sum belongs to R_j. Coefficient work is
O(sum_j T_j) if those transitions are supplied; a direct construction
tests at most sum_j |R_{j-1}| |K_j| candidate pairs. Two consecutive
coefficient arrays suffice, in addition to frontier/transition storage.

Building the frontiers is a separate cost. Explicit forward and backward
Minkowski sums can require exponential space. Forming E-B_j can itself
cost |E| |B_j| before intersection. Already deciding whether R_0 is empty
contains subset-sum reachability: take K_i={0,w_i} and E={T}. A small
observed frontier is not an end-to-end algorithm without a priced way
to discover or enclose it. Integer arithmetic and set operations also
depend on the bit lengths of source frequencies and partial sums.

## 2. Gaussian error and coefficient conditioning

Let theta=theta_0+D Z, Z standard Gaussian. A product coefficient c(n)
contributes c(n) exp(i n dot theta_0-||D^T n||^2/2). Put
L_i=sum_k|a_i(k)| and Q=product_i L_i. Convolution gives
sum_n|c(n)|<=Q; if an L_i is zero, the source is identically zero.
Consequently, if all reachable n outside E satisfy ||D^T n||>=T,

\[
 |I-I_E|\le Q e^{-T^2/2}.
 \tag{3}
\]

The discarded set must satisfy this ACTUAL combined-frequency condition.
Large individual frequencies do not imply it. For rank-deficient D,
small physical frequencies can have large integer indices; a convenient
integer ball E needs its own admission proof.

Normalizing each factor by L_i makes convolution and coefficient
projection contractions in coefficient l1 norm. The final answer and
absolute error are then multiplied by Q. Relative conditioning can still
be arbitrarily poor: (1+exp(iC theta)) times
(1-(1-eta)exp(-iC theta)) has constant coefficient eta but Q near four.
The theorem gives absolute allowances, not relative accuracy at zeros.

## 3. A positive finite-band source with explicit frontiers

Now take one scalar phase theta and the supplied real-valued factors

\[
 f_i(\theta)=\frac{1+a_i(\theta)\cos(C\theta+\phi_i)}2,
 \qquad a_i(\theta)=\sum_{r=-w}^{w}\alpha_{i,r}e^{ir\theta},
 \qquad \sum_r|\alpha_{i,r}|\le1.
 \tag{4}
\]

Here C>=1 and w>=0 are integers, alpha_{i,-r}=conjugate(alpha_{i,r}),
and phi_i are fixed real phases. Thus |a_i(theta)|<=1, every f_i lies
in [0,1], and so does their product F. The number of factors and their
finite bandwidth remain explicit source parameters.

Keep a carrier index q and an envelope index r instead of immediately
merging them into physical frequency qC+r. The lifted factor is

\[
 b_i(0,0)=\tfrac12,\qquad
 b_i(\pm1,r)=\tfrac14e^{\pm i\phi_i}\alpha_{i,r}.
 \tag{5}
\]

It has at most 4w+3 entries and l1 norm (1+||alpha_i||_1)/2<=1.
Multiplying these finite Laurent polynomials is an exact representation
of F after substituting exp(iC theta) for the carrier variable. Different
lifted indices may describe the same physical frequency; their eventual
sum is the actual coefficient. No global uniqueness is assumed.

For an integer B>=0, request the final lifted indices (0,r), |r|<=B.
At stage j use the explicitly constructed enclosing box

\[
 \mathcal G_j=\{(q,r):|q|\le Q_j,\ |r|\le P_j\},\qquad
 Q_j=\min(j,m-j),\quad P_j=\min(jw,B+(m-j)w).
 \tag{6}
\]

Initialize delta_{(0,0)} and multiply by (5), discarding results outside
G_j after each step. A path ending at (0,r_final), |r_final|<=B, has
|q_j|<=j and |q_j|<=m-j because the remaining factors must cancel it.
Also |r_j|<=jw and |r_j|<=B+(m-j)w. Every contributing path therefore
survives all boxes, so the final requested lifted coefficients are exact.

Unlike the true sets R_j, these boxes may contain infeasible states.
Their intermediate stored coefficients can be partial prefix coefficients:
earlier pruning may have removed paths that can never reach the final
target. Only the final-target exactness just proved is asserted for all
box states. This distinction prevents using an intermediate array as an
unproved general prefix-product oracle.

## 4. Explicit construction, transition and query costs

The box sizes and membership tests use integer intervals; no Minkowski
sum enumeration is hidden in their construction. Write W_j=|G_j|.
The number of candidate coefficient transitions is at most

\[
 (4w+3)\sum_{j=0}^{m-1}(2Q_j+1)(2P_j+1)
 \le m(4w+3)(m+1)[mw+\min(B,mw)+1].
 \tag{7}
\]

Indeed 2Q_j+1<=m+1 and
2P_j+1<=min(2mw,mw+B)+1. Initializing dense box arrays has the same
order of cost. Two stages need O((m+1)[mw+min(B,mw)+1]) coefficient
storage. The simpler sufficient arithmetic bound is O(m^3(w+1)^2),
including w=0; (7) retains the more informative source dependence.

Reading envelope coefficients costs O(m(2w+1)), and forming the phase
multipliers costs O(m) elementary-function evaluations. Frequency indices
in the boxes have O(log(m+1)+log(w+1)) bits. C has its own input length,
and the admission comparisons below must be certified. Arbitrary large
carrier magnitude is not zero-cost arbitrary-precision arithmetic.

Once the final coefficients are prepared, a query with specified theta_0
and sigma needs at most 2min(B,mw)+1 Gaussian multipliers and a contraction.
For all final q=0 coefficients this is O(mw+1) work per query. Changing
the source coefficients, phases, or requested frontier can require new
preparation at the stated cost, including when animation changes them.
Reuse assumes these supplied quantities remain unchanged; it does not
make arbitrary time-dependent sources free. These counts exclude
certified coordinate, phase and Gaussian-multiplier evaluation accuracy.

## 5. Two different exactness statements

First request actual physical coefficients in E={-B,...,B}. If

\[
 C>mw+B,
 \tag{8}
\]

then a full lifted term with q!=0 has |qC+r|>=C-mw>B. Hence every
physical coefficient in E is exactly the computed coefficient at (0,r).
Global uniqueness of all lifted frequencies is unnecessary. For
theta=theta_0+sigma Z, sigma>0, the retained physical-frequency mean has
error at most exp[-sigma^2(B+1)^2/2], because all omitted integer
frequencies have magnitude at least B+1 and their coefficient l1 sum
is at most one. Numerical errors are separate.

Second, retain ALL final q=0 coefficients by setting B=mw in (6).
Define the exact auxiliary carrier-phase average

\[
 \bar F(\theta)=\frac1{2\pi}\int_0^{2\pi}
 \prod_i\frac{1+a_i(\theta)\cos(\eta+\phi_i)}2\,d\eta.
 \tag{9}
\]

This is the q=0 polynomial, of envelope bandwidth at most mw. The rule
computes E bar F(theta_0+sigma Z) exactly in real arithmetic. For C>mw,
each discarded LIFTED term has |qC+r|>=C-mw. The total lifted coefficient
l1 norm is at most one, so

\[
 |E F(\theta_0+\sigma Z)-E\bar F(\theta_0+\sigma Z)|
 \le e^{-\sigma^2(C-mw)^2/2}.
 \tag{10}
\]

For 0<epsilon<1, C>=mw+sqrt(2log(1/epsilon))/sigma suffices. Unlike
(8), this statement bounds discarded labeled terms; it does not claim
that the retained labels supply full physical coefficients wherever
different q bands overlap. It requires neither global uniqueness nor
disjoint bands. All surviving products of envelope factors remain intact.
For example, two factors give
bar F=(1+a_1 a_2 cos(phi_1-phi_2)/2)/4, not generally 1/4.

## 6. Absolute numerical-error contract

For the subclass (4), exact convolution by b_i followed by projection
onto G_i has induced coefficient l1 norm at most one. If the computed
stage differs from that exact operator applied to its computed input
by l1 error at most tau_i, final coefficient error is at most sum_i tau_i
(plus initial error). Gaussian multipliers have modulus at most one,
so the same allowance bounds the error in the retained mean.

Input errors delta_i=||bhat_i-b_i||_1 add directly if every approximating
factor is also certified to have l1 norm at most one. In this paragraph,
tau_i denotes arithmetic error relative to convolution with bhat_i and
projection, so it excludes the separately charged input error. The total
allowance is sum_i(delta_i+tau_i). Otherwise, with kappa_i=||bhat_i||_1,
the safe recurrence is e_i<=kappa_i e_{i-1}+delta_i+tau_i, giving

\[
 e_m\le\sum_{i=1}^m(\delta_i+\tau_i)
 \prod_{j=i+1}^m\kappa_j
 \tag{11}
\]

for exact initialization. One may bound kappa_i by 1+delta_i. The
coefficient entries can be signed or complex despite 0<=F<=1; positivity
of F alone is not the reason for contraction. The explicit l1 bound is.
The tau_i are ARRAY l1 allowances, not per-coordinate errors: a uniform
entrywise error must be multiplied by the number of affected entries.
Final summation, Gaussian/phase evaluation and source-parameter errors
need their own budgets. Small resulting means have no relative guarantee.

## 7. Scope and relation to the earlier shared-phase family

[SHARED-PHASE-COST.md](SHARED-PHASE-COST.md) treats Boolean graphs of
single-arc masks through endpoint arrangements, a carrier corrector,
and piecewise-affine beat integration. Here the supplied factors are
continuous finite-band modulations and the response is their product.
Exact finite coefficient propagation replaces endpoint arrangements;
the discarded carrier band has an explicit Gaussian gap. Neither family
contains the other, and no generic material-graph closure is claimed.

The chain of partial sums is also a factor-graph representation: the
messages carry integer sums and the backward sets express reachability.
A chain topology alone does not make the state domains small; the
explicit boxes and source bandwidth are what establish (7). Products
with several unrelated carriers, arbitrary masks, nonlinear warps,
non-finite spectra or uncontrolled coefficient norms need new contracts.
If a finite Fourier model approximates a different source, its error
must be charged before invoking this theorem. No frequency is rounded
to enter the common-carrier class, and no GPU cost follows from (7).
