# A positive common quadrature for finite Gabor intensity polynomials

2026-09-06. Theory only. No implementation, experiment, timing or
floating-point certificate. The Gaussian and Gauss-Hermite tools are
classical; novelty of this combination has not been established.

[GABOR-THRESHOLD-MOMENTS.md](GABOR-THRESHOLD-MOMENTS.md) prices true moments
using separate moment-dependent Gaussian tilts. Those rules do not justify
evaluating a Bernstein or Chebyshev polynomial on one common node set.
This note supplies a different proof for a positive common rule. It retains
the original finite authored source and expands atom tuples only in the
error proof, never in the proposed evaluation.

## 1. Source, normalization and parameters

Let

\[
 F(X)=\sum_{j=1}^J a_j
 e^{-\frac12(X-c_j)^TA(X-c_j)}e^{i\omega_j^TX},\qquad
 A\succ0,\quad X=\mu+DZ,\quad Z\sim N(0,I_r).
\]

The list is finite, amplitudes may be complex, and all atoms share A.
There are no periodic images, random-ensemble substitutions or envelope
truncations. Put h(Z)=|F(mu+DZ)|^2, S_A=sum_j |a_j| and W_F=S_A^2.
For S_A>0, normalize the
amplitudes by S_A and write F for that normalized field below. Thus
x(Z)=|F(mu+DZ)|^2=h(Z)/W_F lies in [0,1] and sum_j |a_j|=1. W_F is an
authored upper bound on intensity, not necessarily its attained maximum.

Fix maximum polynomial degree N>=1. Choose the reference center c_0=mu
and any fixed reference carrier omega_0. Define

\[
 G=D^TAD=O\operatorname{diag}(g_i)O^T,\quad
 \gamma=\lambda_{\max}(G),\quad
 u_j=D^TA(c_j-\mu),\quad v_j=D^T(\omega_j-\omega_0),
\]
\[
 L=\max_j\{u_j^TG^+u_j+v_j^TG^+v_j\}.
 \tag{1}
\]

Here G^+ is the Moore-Penrose inverse. Since A is positive definite,
ker G=ker D, so u_j and v_j lie in range G even for a singular footprint.
Consequently, for every m>=1,

\[
 \max_j\|(I+2mG)^{-1/2}(u_j+i v_j)\|^2\le L/(2m).
 \tag{2}
\]

This is the linear-in-m rate bound from the preceding note. One may use
the simpler upper bound max_j[(c_j-mu)^TA(c_j-mu)+
(omega_j-omega_0)^TA^{-1}(omega_j-omega_0)] in place of L. The center
reference is fixed at mu here; a different reference needs its additional
linear importance factor accounted for.

If S_A=0, evaluate the zero source directly, using x=0 as the zero-source
normalization convention. N=0 means a constant polynomial and requires no
quadrature. If G=0 then D=0: evaluate x at mu and use one unit-weight node.
Otherwise gamma>0. Zero eigenvalue directions may be retained below, or
removed for the unweighted observable, which is independent of them.
For the original-Z polynomial weights in section 8, retain those directions
or integrate their polynomial moments analytically; in the N=0, G=0 or
zero-source cases, use exact Gaussian polynomial moments instead of
evaluating the weight at one point.

## 2. One node set and positive weights

Let (y_a,w_a) be the tensor product of normalized q-point Gauss-Hermite
rules for N(0,1), with positive weights summing to one. Define

\[
 Z_a=O\operatorname{diag}(1+2Ng_i)^{-1/2}y_a,\qquad
 W_N=\det(I+2NG)^{-1/2},
\]
\[
 \pi_a=W_Nw_a
 \exp\left[N\sum_i\frac{g_i y_{a,i}^2}{1+2Ng_i}\right],\qquad
 M_q=\sum_a\pi_a,\qquad \widehat\pi_a=\pi_a/M_q.
 \tag{3}
\]

The common raw functional is Qp=sum_a pi_a p(x(Z_a)); the normalized
functional is Qhat p=sum_a pihat_a p(x(Z_a)). Nodes and weights are shared
by every polynomial of degree at most N. Completing the Gaussian square
shows that the continuous version of the raw importance weight has mass
one and recovers the original Z measure exactly.

For the Gaussian rule, 0<=Q_q Y^(2l)<=E Y^(2l), with equality for l<q;
odd moments vanish. To see the inequality, interpolate Y^(2l), including
its first derivative, at the q nodes. Its Hermite-interpolation remainder
has the sign of the nonnegative 2q-th derivative. Integrating and using
exactness through degree 2q-1 proves the claim. Tensor even moments inherit
the inequality. The importance integrand in (3) has nonnegative even
Taylor coefficients. Monotone convergence therefore gives

\[
 0<M_q\le1.
 \tag{4}
\]

Normalization produces a probability rule. For any |p|<=B on [0,1],

\[
 |\widehat Qp-Qp|\le B(1-M_q).
 \tag{5}
\]

There is no inverse-mass amplification in this bound: positivity gives
|Qp|<=B M_q. The mass error will be certified along with the other moments.

## 3. A positive generating-function bound

Work in the eigenbasis of G. Set d_j=c_j-mu, nu_j=omega_j-omega_0 and

\[
 \beta_j=a_j e^{-d_j^TAd_j/2+i\nu_j^T\mu},\qquad
 b_{j,N}=\operatorname{diag}(1+2Ng_i)^{-1/2}O^T(u_j+i v_j).
\]

These are coefficients of exponentials, not Hermite-feature coefficients;
no exp(b_j^T b_j/2) factor is inserted. Their absolute sum is at most one.
Dividing by the reference atom and absorbing its 2N-th envelope power gives

\[
 I_m:=E x^m=W_N E\left[
 e^{\sum_i\eta_{m,i}Y_i^2}
 \left|\sum_j\beta_j e^{b_{j,N}\cdot Y}\right|^{2m}\right],\qquad
 \eta_{m,i}=\frac{(N-m)g_i}{1+2Ng_i},\quad 0\le m\le N.
 \tag{6}
\]

For m=0 the power is one, so this is the importance mass. Expanding the
power for the proof yields complex linear rates c equal to sums of m b's
and m conjugate b's. The absolute coefficient sum is at most one.

For any diagonal 0<=eta_i<1/2 and complex c, majorize the even Taylor
coefficients of exp(sum eta_i Y_i^2+c dot Y) and multiply them by their
Gaussian moments. The resulting nonnegative coefficients have generating function

\[
 \mathcal M_c(s)=\prod_i(1-2s\eta_i)^{-1/2}
 \exp\left[\sum_i\frac{s|c_i|^2}{2(1-2s\eta_i)}\right].
 \tag{7}
\]

This is E exp(s sum eta_i Y_i^2+sqrt(s) sum |c_i|Y_i).
Every tensor even-moment deficit is nonnegative and vanishes if every
coordinate degree is below 2q. In particular it vanishes below total
degree 2q. If M_c(s)=sum_l A_l s^l with A_l>=0, taking absolute Taylor
coefficients and using sum_(l>=q) A_l<=s^(-q)M_c(s) proves

\[
 |(E-Q_q^{\otimes r})e^{\sum_i\eta_iY_i^2+c\cdot Y}|
 \le s^{-q}\mathcal M_c(s),\quad s>1,\quad 2s\max_i\eta_i<1.
 \tag{8}
\]

All series exchanges are justified by the finite Gaussian exponential
majorant in (7). A separate tensor factor r is unnecessary.

## 4. Keep the moment order in the cutoff

For 0<=m<N, define

\[
 \theta_m=\min\left\{1,\frac{1+2m\gamma}{4(N-m)\gamma}\right\},
 \quad s_m=1+\theta_m;\qquad \theta_N=1,\quad s_N=2.
 \tag{9}
\]

Put T_m=I+2m diag(g_i)-2theta_m(N-m)diag(g_i). The monotonicity of
g/(1+2mg) implies T_m >= (I+2m diag(g_i))/2. Thus (8) is admissible.
In W_N M_c(s_m), the determinant factor is det(T_m)^(-1/2)<=2^(r/2).
Writing c=diag(1+2Ng_i)^(-1/2)w, w is a sum of 2m rotated vectors
u_j+i v_j or their conjugates. For m>=1 the exponent in (7) is bounded by

\[
 \frac{s_m}{2}w^*T_m^{-1}w
 \le s_m\|(I+2m\operatorname{diag}(g_i))^{-1/2}w\|^2
 \le4s_m m^2\frac{L}{2m}\le4mL.
\]

For m=0 that exponent is zero. Summing absolute coefficients proves the
single-rule moment certificate, including both endpoints,

\[
 |I_m-Q_m|\le2^{r/2}e^{4mL}s_m^{-q},\qquad Q_m=Q[x^m].
 \tag{10}
\]

There is no evaluation of J^(2m) tuples. Formula (6) proves the bound;
formula (3) evaluates the true intensity once at each common node.

## 5. Bernstein families and normalization error

Let p(x)=sum_(k=0)^N b_k binom(N,k)x^k(1-x)^(N-k), with |b_k|<=B.
Assume B>0 and 0<epsilon<=B. Write p=sum_m c_m x^m. The exact identity
c_m=binom(N,m) sum_(k=0)^m (-1)^(m-k)binom(m,k)b_k gives

\[
 |c_0|\le B,\qquad |c_m|\le B2^m\binom Nm
 \le B(2eN/m)^m\quad(m\ge1).
 \tag{11}
\]

With all logarithms natural, a sufficient integer q is

\[
 q\ge\left\lceil16NL+4N\log(2eN)
 +2\max(1,4N\gamma)
 \log\frac{2^{r/2+1}B(N+1)}{\epsilon}\right\rceil.
 \tag{12}
\]

For completeness, 0<theta_m<=1 gives log(1+theta_m)>=theta_m/2, and

\[
 m/\theta_m\le2N,\qquad
 1/\theta_m\le\max(1,4N\gamma).
 \tag{13}
\]

For m<N these follow by writing 1/theta_m as the maximum of one and
4(N-m)gamma/(1+2m gamma); m=N is immediate. With
K=log[2^(r/2+1)B(N+1)/epsilon], (12) therefore implies
q log s_m >=4mL+m log(2eN/m)+K for m>=1 and q log s_0>=K.
Each coefficient-weighted error in (10) is at most epsilon/[2(N+1)],
so |E p-Qp|<=epsilon/2. Also B(1-M_q)<=epsilon/[2(N+1)]. Since
|p|<=B, (5) completes the proof:

\[
 \boxed{|E p(x)-\widehat Qp(x)|\le\epsilon.}
 \tag{14}
\]

The same positive rule works uniformly for this entire coefficient-bounded
Bernstein family. Its gap and endpoint evaluations do not require an
alternating sum of separately computed moments. If B=0 the polynomial is
zero. If epsilon>B, one may construct the positive rule using epsilon'=B;
a zero estimate already meets that larger tolerance as a separate shortcut.

## 6. Chebyshev and all bounded degree-N polynomials

Suppose p(x)=sum_(l=0)^N d_l T_l(2x-1), and C=sum_l |d_l|>0.
Then |p|<=C. For 1<=m<=l, the shifted-Chebyshev coefficient identity is

\[
 [x^m]T_l(2x-1)=(-1)^{l-m}\frac{l}{l+m}\binom{l+m}{2m}4^m.
\]

It follows either from the Chebyshev recurrence or its explicit polynomial
formula. Hence |c_0|<=C and |c_m|<=C(2eN/m)^(2m). For 0<epsilon<=C,
the same proof gives (14) with

\[
 q\ge\left\lceil16NL+8N\log(2eN)
 +2\max(1,4N\gamma)
 \log\frac{2^{r/2+1}C(N+1)}{\epsilon}\right\rceil.
 \tag{15}
\]

C=0 is the zero polynomial; epsilon>C can be replaced by epsilon'=C.
The certificate uses coefficient bounds but does not require evaluation
in monomials: the common values can be evaluated by Clenshaw recurrence.
If only |p|<=B on [0,1] is supplied, the cosine coefficient integrals give
|d_0|<=B and |d_l|<=2B, so C<=(2N+1)B. Using that value in (15) supplies
one rule for every polynomial of degree at most N bounded by B.

Grading the coefficients by m is essential. Assigning every low-order
moment an exp(-O(N)) tolerance from a single aggregate coefficient norm
would give a needlessly severe cutoff in the nearly singular m=0 tilt.

## 7. Arithmetic price and unavoidable conditioning

Given prepared rules and source parameters, evaluate the original finite
field at each of the q^r common source nodes, then the requested polynomial.
The real-arithmetic work is O(q^r[J+C_p(N)]), where C_p(N)=O(N) for supplied
Clenshaw coefficients. Zero eigenvalue axes may use one node. Rule and
parameter preparation, polynomial representation conversion, storage for
reused values and certified numerical arithmetic are separate costs.

At fixed gamma,L,r and a bounded polynomial family, (15) gives
q=O(NL+N log(N+1)+(1+N gamma)log[B(N+1)^2/epsilon]). In particular it is
O(N log[(N+1)B/epsilon]) at fixed source parameters and polynomial bound. The
dependence on J is linear only with these parameters and N held fixed;
source spread and the normalization of a desired threshold can change them.

Some growth in N is unavoidable for this common tilt. Take one normalized
atom with x(Z)=exp(-g|Z|^2), g>0. Standard-normal Gauss-Hermite nodes have
absolute value at most 2sqrt(q), by the row-sum bound on their tridiagonal
Jacobi matrix with off-diagonals sqrt(1),...,sqrt(q-1). Every transformed
node therefore has x(Z_a)>=exp[-4rgq/(1+2Ng)]. If q=o(N), all these values
tend to one, so every positive normalized rule on them returns Qhat x->1.
But E x=(1+2g)^(-r/2)<1. This proves a failure for q=o(N), not optimality
of the logarithmic factor in the sufficient bound. The m=0 quadratic
coefficient approaching 1/2 explains the importance-mass conditioning.

The raw importance exponential can be enormous while a Gaussian rule
weight is tiny; the scaled product pi_a is bounded by the total mass, but
forming the factors separately can overflow or underflow. Nodes, weights,
complex phases, source summation, normalization and polynomial evaluation
all require their own error allowances. Common-node positivity removes
the logical mismatch between moment-specific rules; it does not certify
a fixed-float implementation or game frame time. Polynomial latent weights
are addressed next; discontinuous indicators, nonpolynomial latent weights,
geometry approximations and broader responses still need separate contracts.

## 8. Fixed polynomial weights in the original Gaussian coordinates

Let w be a fixed polynomial of the original Z. In G's eigenframe, write
w(Oz)=sum_beta w_beta z^beta. This is only an orthogonal rotation: z at a
common node is diag(1+2Ng_i)^(-1/2)y, not y itself. Keep inactive Gaussian
directions unless their polynomial moments have first been integrated
analytically. The same nodes and raw weights can query E[w(Z)p(x(Z))].

Here is a coefficientwise extension of (8). For one implicit exponential
term in moment m, let t be its sum of 2m rotated vectors u_j+i v_j or their
conjugates, so c=diag(1+2Ng_i)^(-1/2)t. Insert z^beta into the integrand
and scale the ENTIRE expression by Y -> sqrt(s)Y. Its Gaussian-weighted
even-degree majorant, including W_N, is

\[
 \partial_a^\beta\mathcal F_s(a)\big|_{a_i=|t_i|},\qquad
 \mathcal F_s(a)=\det(R)^{-1/2}
 e^{\frac{s}{2}\sum_i a_i^2/R_i},\quad
 R_i=1+2mg_i-2(s-1)(N-m)g_i.
 \tag{16}
\]

Indeed differentiation inserts (sqrt(s) z)^beta. A missed even monomial
still has full degree at least 2q, now including the inserted polynomial,
so its error is at most s^(-q) times (16). This argument differentiates a
positive generating function; it does not differentiate an inequality.

The derivative in (16) is F_s times the Gaussian moment polynomial with
mean_i=s a_i/R_i and diagonal variance_i=s/R_i. At s=s_m, R is at least
(I+2m diag(g_i))/2. Thus every variance is at most 4; for m>=1, (2) gives

\[
 \|\mathrm{mean}\|^2\le16\|(I+2m\operatorname{diag}(g_i))^{-1/2}t\|^2
 \le32mL.
\]

Define the nonnegative increasing polynomial

\[
 K_w(C)=\sum_\beta|w_\beta|
 \sum_{\ell\le\beta/2}
 \frac{\beta!\,C^{|\beta|-2|\ell|}\,2^{|\ell|}}
 {(\beta-2\ell)!\,\ell!}.
 \tag{17}
\]

The factor 2^|ell| comes from (variance/2)^|ell|<=2^|ell|. Summing
absolute source coefficients as in (10) proves the raw weighted bound

\[
 |E[w(Z)x^m]-Q[w(Z)x^m]|
 \le2^{r/2}e^{4mL}K_w(\sqrt{32mL})s_m^{-q}.
 \tag{18}
\]

For m=0 the mean vector is zero. Every monomial with an odd coordinate
has exactly zero true and raw-rule integral by symmetry. The remaining
terms obey (18) with K_w(0), using 0^0=1.

For an intensity polynomial with Chebyshev coefficient sum C_p, set
K_*=K_w(sqrt(32NL)). If C_p K_*>0, using (15) with C replaced by C_p K_*
and epsilon by a raw allowance delta_w is sufficient for raw weighted
error at most delta_w (the displayed constants actually give delta_w/2).
Use 0<delta_w<=C_p K_*, or replace a larger allowance by C_p K_*. If
K_*=0, (18) already gives zero raw error and no logarithm is required.
At fixed weight degree d, K_* grows at most as a constant times
(1+sqrt(NL))^d; its coefficients and their geometry dependence remain part
of the price. Evaluating w adds its polynomial evaluation cost per node.

The unsigned normalization estimate (5) must not be reused for unbounded
w. If the raw query error is at most delta_w, the mass error is at most
delta_0<1, and |E[wp]|<=B_w, the valid bound is

\[
 |\widehat Q[wp]-E[wp]|
 \le\frac{\delta_w+B_w\delta_0}{1-\delta_0},\qquad
 B_w=\|p\|_\infty\sqrt{Ew^2}\ \text{is sufficient}.
 \tag{19}
\]

This follows by writing Q[wp]-M_q E[wp], not by asserting independence.
Choose one q meeting both the raw weighted allowance and the m=0 mass
allowance. Gaussian polynomial moments provide Ew^2 explicitly. For
N=0, or a constant/zero source, integrate w by those moments directly.

For example, the two-dimensional cubic projective correction
w=1+(k dot Z)(3-|Z|^2) is covered with the rotated k in this eigenframe.
Here Ew^2=1+9|k|^2 and (17) gives
K_w(C)=1+(|k_1|+|k_2|)(2C^3+19C). The weighted source and its intensity
stay on the same nodes throughout; no correlation is discarded.
