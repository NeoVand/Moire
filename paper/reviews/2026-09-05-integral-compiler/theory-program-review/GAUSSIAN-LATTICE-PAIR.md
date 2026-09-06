# A full-Gaussian certificate for a pair of periodic sources

2026-09-06. Independently derived and audited theory. Schur's test,
periodic Fourier approximation, Gaussian lattice sums and BV translation
estimates are classical ingredients. No novelty, implementation, benchmark,
fixed-precision certificate or general rendering-cost claim is made. The
two-dimensional enumeration below has a conditional arithmetic price;
coefficient acquisition and numerical precision are explicitly separate.

This supplies a source-tail argument for the composition problem in
[CONTEXTUAL-COMPOSITION.md](CONTEXTUAL-COMPOSITION.md). It integrates against
the full Gaussian: there is no additional output ellipse whose discarded
mass or coefficient interactions remain unpriced.

## 1. Physical source and frequency conventions

Work in one common physical space R^d. Each source has a discrete full-rank
RADIAN-frequency lattice Lambda_j=B_j Z^d, with B_j invertible. Its physical
period lattice is Gamma_j=2 pi B_j^(-T) Z^d. The two lattices need not be
commensurate, and their sum need not be discrete. Each individual periodic
source chart is nonsingular; no arbitrary torus function is restricted to
a lower-dimensional chart and then identified solely by its Fourier data.

Let A and B be periodic L2 functions on their respective physical period
cells Omega_1,Omega_2. Haar measure on each cell is normalized to one.
Write their coefficients as a_m, m in Lambda_1, and b_n, n in Lambda_2,
using exp(i m dot x), not exp(2 pi i m dot x). Thus

\[
 L_A^2:=\sum_m|a_m|^2
 =\frac1{|\Omega_1|}\int_{\Omega_1}|A|^2,
 \qquad L_B^2:=\sum_n|b_n|^2.
 \tag{1}
\]

For Sigma positive definite and X~N(x_0,Sigma), the target is the bilinear
product mean I(x_0)=E[A(X)B(X)]; no conjugate is inserted. Complex sources
are allowed here. The later BV corollary uses real sources in [0,1]. Put

\[
 w_\Sigma(k)=e^{-k^T\Sigma k/2},\qquad
 \Theta_j(\Sigma)=\sup_{y\in\mathbb R^d}
 \sum_{\ell\in\Lambda_j}w_\Sigma(\ell+y),\qquad
 K_\Sigma=\sqrt{\Theta_1(\Sigma)\Theta_2(\Sigma)}.
 \tag{2}
\]

Frequency cutoffs below use the physical Euclidean norm. Scaling a source
period changes its frequency lattice and its physical variation together.

## 2. An explicit finite theta bound

Set lambda_j=lambda_min(B_j^T Sigma B_j)>0. For y=B_j c,
(B_j k+y)^T Sigma(B_j k+y)>=lambda_j |k+c|^2. Consequently

\[
 \Theta_j(\Sigma)\le
 \left(1+\sqrt{\frac{2\pi}{\lambda_j}}\right)^d.
 \tag{3}
\]

To verify the scalar bound, translate the integer index so its sample
nearest the peak of exp(-lambda t^2/2) is central. That central sample is
at most one. Unimodality bounds each remaining sample by the integral
over the adjacent unit interval toward the peak; these intervals partition
the line except for shared endpoints. Their sum is at most the Gaussian
integral sqrt(2 pi/lambda). The d-dimensional isotropic lattice sum then
factorizes. This proof is uniform in the shift c.

Equation (3) is a computable upper bound, not an assumption that a theta
oracle or its numerical supremum is free. It can be conservative for a
poor lattice basis or an anisotropic footprint. The same formula applies
to Sigma/2. Certified lower eigenvalue bounds give safe numerical upper
bounds, if such numerical certificates are actually supplied.

## 3. Schur bound and absolute convergence

The nonnegative matrix W_mn=w_Sigma(m+n) has row sums at most Theta_2
and column sums at most Theta_1. For finite index sets, Cauchy-Schwarz gives

\[
 \begin{aligned}
 \sum_{m,n}|a_m b_n|W_{mn}
 &\le\left(\sum_{m,n}|a_m|^2W_{mn}\right)^{1/2}
       \left(\sum_{m,n}|b_n|^2W_{mn}\right)^{1/2}\\
 &\le K_\Sigma L_A L_B.
 \end{aligned}
 \tag{4}
\]

Increasing the finite sets proves the same bound for the full sum by
monotone convergence. In particular, the weighted double Fourier series

\[
 \sum_{m\in\Lambda_1}\sum_{n\in\Lambda_2}
 a_m b_n e^{i(m+n)\cdot x_0}w_\Sigma(m+n)
 \tag{5}
\]

is absolutely convergent, uniformly in x_0. This statement does not require
unique indexing by the output frequency m+n. Repeated sums may be grouped
after absolute convergence has been established. A dense combined lattice
does not make either individual row or column sum infinite.

## 4. Identification with the original source product

Let A_N,B_N be tensor Fejer approximants on each source's own torus.
They are finite trigonometric polynomials. Their coefficient multipliers
lie in [0,1], converge to one coefficientwise, and the approximants converge
in the respective normalized torus L2 norms. For bounded sources they also
give the familiar positive-contraction, almost-everywhere approximation.

The Gaussian wrapped onto the j-th physical period cell has a smooth
density relative to its normalized Haar measure. Its Fourier coefficients
are w_Sigma(m) times unit phases. Therefore its density is bounded by
sum_{m in Lambda_j} w_Sigma(m)<=Theta_j(Sigma), uniformly in x_0. Hence

\[
 \mathbb E|A_N(X)-A(X)|^2
 \le\Theta_1(\Sigma)\|A_N-A\|_{L^2(\Omega_1)}^2\longrightarrow0,
 \tag{6}
\]

and likewise for B. Here and below the cell norm is Haar-normalized.
Cauchy-Schwarz implies A_N(X)B_N(X)->A(X)B(X) in Gaussian L1; in particular
the original product is integrable. This proves the identification even
for unbounded L2 sources. For bounded sources, dominated convergence after
almost-everywhere pullback is an alternative proof.

For finite polynomials, Gaussian integration gives exactly (5). The full
absolutely summable majorant (4) lets the Fejer multipliers pass to the
limit in that series. Thus (5) equals I(x_0), rather than merely defining
a formal filtered product. Source translations change coefficients by
unit phases, and moving x_0 does the same in (5); all bounds are unchanged.

Nonsingular charts matter: an L2 torus representative can be changed on a
null set without changing its coefficients. A singular chart concentrated
on that null set can change its entire physical source. That case is not
covered by this identification argument.

## 5. One-sided and two-sided physical-frequency tails

Define T_A(M)=sum_{|m|>M}|a_m|^2, and similarly T_B, for M>0. Split the
discarded pairs with |m|>M into |n|>M/2 and |n|<=M/2. Equation (4) on the
first restricted pair of coefficient sequences gives
K_Sigma sqrt(T_A(M)T_B(M/2)). On the second set, |m+n|>M/2, so

\[
 w_\Sigma(m+n)=w_{\Sigma/2}(m+n)^2
 \le e^{-\lambda M^2/16}w_{\Sigma/2}(m+n),
 \qquad\lambda=\lambda_{\min}(\Sigma)>0.
\]

The remaining Gaussian half pays for the full Schur sum. Therefore

\[
 \sum_{|m|>M,n}|a_m b_n|w_\Sigma(m+n)
 \le K_\Sigma\sqrt{T_A(M)T_B(M/2)}
 +e^{-\lambda M^2/16}K_{\Sigma/2}L_A L_B.
 \tag{7}
\]

Let I_M retain only |m|<=M and |n|<=M in (5). Applying (7) and its symmetric
version to the union of discarded pairs proves, uniformly in x_0,

\[
 \begin{aligned}
 |I-I_M|\le{}&K_\Sigma\left[
 \sqrt{T_A(M)T_B(M/2)}+\sqrt{T_B(M)T_A(M/2)}\right]\\
 &+2e^{-\lambda M^2/16}K_{\Sigma/2}L_A L_B.
 \end{aligned}
 \tag{8}
\]

The intersection of the two discarded sets is counted twice, which is
safe. The first term preserves the near-cancellation pairs; it does not
incorrectly assign exponential damping to two individually large inputs.

## 6. A dimension-independent radian-frequency BV corollary

Assume now 0<=A<=1 and A is periodic BV. Define V_A as its Euclidean total
variation per physical period volume: V_A=|DA|(Omega_1)/|Omega_1|, on the
periodic domain, including any periodic trace jumps. It has inverse-length
units. The same definitions apply to B. This is not variation in arbitrary
normalized chart coordinates without the corresponding transformation.

For H~N(0,t I), Parseval and translation invariance give the heat content

\[
 \sum_m|a_m|^2(1-e^{-t|m|^2/2})
 =\tfrac12\mathbb E_H\|A(\cdot+H)-A\|_2^2
 \le\sqrt{\frac{t}{2\pi}}V_A.
 \tag{9}
\]

Indeed the squared difference is at most its absolute value because the
source range is [0,1]. The directional BV translation estimate, integrated
over isotropic Gaussian H, bounds the expected normalized L1 difference
by sqrt(2t/pi) V_A: for each unit polar direction nu of DA,
E|H dot nu|=sqrt(2t/pi). This avoids an unnecessary dimension factor.

Put t=2 beta/M^2 in (9). For every beta>0,

\[
 T_A(M)\le\frac{c_{\rm rad}V_A}{M},\qquad
 c_{\rm rad}:=\inf_{\beta>0}
 \frac{\sqrt\beta}{\sqrt\pi(1-e^{-\beta})}.
 \tag{10}
\]

The displayed bound before taking the infimum is valid for each beta.
An explicit chosen beta is sufficient; computing an optimizer is optional.
This constant uses radian frequencies. The source-range assumption is
essential to this form of the variation bound; general amplitudes require
the corresponding range factor in (9).

The heat-content estimate is established mathematics. For the indicator
case see [Ledoux (1994), Proposition 1.1](https://perso.math.univ-toulouse.fr/ledoux/files/2022/10/semig-isop.pdf):
his heat time u has variance 2u and constant sqrt(u/pi). The finite-perimeter
extension and BV increment results are in
[Miranda et al. (2007), Theorems 3.3 and 4.1](https://afst.centre-mersenne.org/item/10.5802/afst.1142.pdf).
The direct periodic translation proof above fixes this note's normalization.
The infimum in (10) optimizes that argument, not all possible spectral-tail
bounds. For grayscale BV functions, a claimed sharp asymptotic proportional
to total variation would be stronger and is not asserted: the quadratic
heat defect's leading jump term involves squared jump amplitudes.

Write C_A=c_rad V_A and C_B=c_rad V_B. Equation (8) becomes

\[
 |I-I_M|\le\frac{2\sqrt2 K_\Sigma\sqrt{C_A C_B}}{M}
 +2K_{\Sigma/2}L_A L_B e^{-\lambda M^2/16}.
 \tag{11}
\]

For a requested analytic allowance epsilon>0, both terms sum to at most
epsilon if M>0 and

\[
 M\ge\max\left\{
 \frac{4\sqrt2 K_\Sigma\sqrt{C_A C_B}}{\epsilon},\quad
 4\sqrt{\frac{\max\{0,\log(4K_{\Sigma/2}L_A L_B/\epsilon)\}}{\lambda}}
 \right\}.
 \tag{12}
\]

If L_A or L_B is zero, the corresponding source is zero almost everywhere
and I=0; handle this before the logarithm. If a variation is zero, that
source is constant almost everywhere and may be handled directly. The
general bound also permits C_A C_B=0. Certified upper bounds may replace
the theta constants, source norms and variations in this selector.

## 7. A separately priced output ellipse

There is a useful additional cut, now with its own global allowance.
Let E_R={k:k^T Sigma k<=R^2}. Outside this set,

\[
 w_\Sigma(k)\le e^{-R^2/4}w_{\Sigma/2}(k).
\]

Equation (4), for either full coefficient arrays or restricted ones, gives

\[
 \sum_{m+n\notin E_R}|a_m b_n|w_\Sigma(m+n)
 \le e^{-R^2/4}K_{\Sigma/2}L_A L_B.
 \tag{13}
\]

Let I_{M,R} keep only |m|,|n|<=M and m+n in E_R. Its error is bounded by
the right side of (8), plus (13). For total analytic budget epsilon, one
may choose M from (12) with allowance epsilon/2 and choose

\[
 R\ge2\sqrt{\max\{0,\log(2K_{\Sigma/2}L_A L_B/\epsilon)\}}.
 \tag{14}
\]

Then the two cuts total at most epsilon. Zero source norms are handled
before the logarithm. The source cut preserves high-frequency cancellations
up to its stated energy tail; the output cut uses a bound on the actual
combined frequency. Neither cut assumes that a large input frequency is
individually invisible to every future factor.

## 8. Explicit two-dimensional enumeration and its cost

Specialize this cost statement to d=2. All lattice bases and source
coefficients or coefficient-query procedures are supplied. Let

\[
 s_j=\sigma_{\min}(B_j)>0,\quad
 H_j(M)=(2\lfloor M/s_j\rfloor+1)^2,\quad
 N_j=|\Lambda_j\cap\{|k|\le M\}|\le H_j(M).
\]

Enumerate the integer square [-floor(M/s_j),floor(M/s_j)]^2 and test
|B_j n|<=M. This costs O(H_1+H_2) candidate tests, not an assumed lattice
ellipse oracle. Query each retained coefficient once. With certified
per-coefficient costs Q_j at the required tolerances, preparation costs

\[
 O(H_1+H_2+N_1 Q_1+N_2 Q_2).
 \tag{15}
\]

A baseline contraction examines N_1 N_2 pairs. A second enumeration uses
the now certified output ellipse. For fixed m in the first retained set,
write the other frequency as B_2 n, n an integer vector, and put
z=-B_2^{-1}m, G_2=B_2^T Sigma B_2, gamma_2=lambda_min(G_2)>0. Then

\[
 (m+B_2n)^T\Sigma(m+B_2n)=(n-z)^TG_2(n-z).
\]

Every accepted index lies in the shifted coordinate square with radius
h=R/sqrt(gamma_2). Enumerate each coordinate from ceil(z_i-h) to
floor(z_i+h), then test the source radius and actual quadratic form.
A closed interval of length 2h contains at most floor(2h)+1 integers.
Consequently there are at most

\[
 J_2=(\lfloor2R/\sqrt{\gamma_2}\rfloor+1)^2
\]

candidate partners for each m. The roles can be exchanged. Using direct
indexed storage for the bounding-square coefficients and presence flags
makes membership cost explicit, with O(H_1+H_2) storage. An alternative
sparse dictionary must price its own access cost. The query candidate
work is bounded by

\[
 O\!\left(\min\{N_1N_2,\ N_1(1+J_2),\ N_2(1+J_1)\}\right).
 \tag{16}
\]

Each candidate requires a fixed number of real-arithmetic operations and,
if retained, elementary phase/Gaussian evaluations and accumulation.
Near a cutoff, membership must be certified or conservatively included
and charged; rounded cancellation is not a resonance certificate. The
interval endpoints likewise need safe rounding. Their bit lengths and
elementary-function precision are not unit-cost numerical assumptions.

For FIXED lattices, variation, covariance and source norms, with nonzero
BV tail coefficient, M=O(epsilon^(-1)) and R=O(sqrt(log(1/epsilon))).
Then the candidate count in (16) is O(epsilon^(-2) log(1/epsilon)), plus
coefficient acquisition and precision costs. Enumerating all pairs would
instead give O(epsilon^(-4)). Constants can become large for narrow or
poorly aligned footprints, large variation or poorly conditioned bases.
This is not a speed advantage over sampling or a real-time performance claim.

Coefficient and neighbor-list reuse requires the corresponding source,
geometry and cutoffs to remain unchanged. Their reconstruction is charged
when those inputs change. Caching all pair products takes O(N_1N_2)
storage and does not alone make repeated contractions cheaper.

## 9. Coefficient acquisition and numerical allowances

Let the retained coefficient errors have l2 norms eta_A,eta_B. Expanding
the perturbed bilinear expression and applying (4) to each term gives

\[
 |\widehat I_{M,R}-I_{M,R}|
 \le K_\Sigma(\eta_A L_B+\eta_B L_A+\eta_A\eta_B),
 \tag{17}
\]

before multiplier and accumulation errors. Setting selected matrix entries
to zero for the output ellipse only decreases its absolute row and column
sums, so the same bound applies. Source translation and pixel-center phases
are unitary diagonal factors and do not alter this argument.

A sufficient per-coefficient complex error is eta_j/sqrt(N_j). Thus Q_j
in (15) must depend on this accuracy, frequency size and source geometry.
For a supplied polygonal indicator, a boundary integral gives an explicit
oracle. With cell area |Omega|, nonzero physical radian frequency k, edge
midpoints c_e, outward normals n_e and edge vectors d_e of lengths l_e,

\[
 a_k=\frac{i}{|\Omega|\,|k|^2}
 \sum_e(k\cdot n_e)l_e e^{-ik\cdot c_e}
 \operatorname{sinc}(k\cdot d_e/2),\qquad
 \operatorname{sinc}(u)=\begin{cases}\sin(u)/u,&u\ne0,\\1,&u=0.\end{cases}
 \tag{18}
\]

Apply the divergence theorem to i k exp(-ik.x)/|k|^2 and integrate each
straight edge. The zero coefficient is area divided by cell area. Supplied
piecewise-constant polygon values can use their weighted sums or boundary
jumps. Input edges must include the correct periodic clipping/identification.
This gives O(number of supplied edges) elementary work per coefficient,
not a fixed-precision guarantee: limiting evaluations, cancellation and
phase reduction require an actual numerical allowance. The same oracle
is not automatically available for arbitrary material graphs.

If every computed COMPLEX multiplier has error at most zeta times its
Gaussian magnitude w_Sigma(m+n), its additional contribution is at most

\[
 \zeta K_\Sigma(L_A+\eta_A)(L_B+\eta_B).
 \tag{19}
\]

A uniform absolute multiplier error delta instead gives only the weaker
delta sqrt(N_1N_2)(L_A+eta_A)(L_B+eta_B). Underflow does not automatically
satisfy a small relative-error condition. Final summation and parameter
uncertainty need separate budgets. Equations (17)-(19) are conditional
error contracts, not a claim that a fixed floating-point format meets them.

## 10. Scope of the resulting contract

The lattice bases, coefficient procedures, norm bounds and BV variation
bounds must be supplied in the common physical normalization. Deriving
them from a material graph, composing masks, or recognizing periodic charts
can cost more than evaluating the final formula. The two-source theorem
does not price arbitrary multi-factor composition by repeated application.

The footprint is a constant Gaussian in physical coordinates. Nonlinear
geometry, visibility clipping, nonperiodic shading and singular charts
require additional arguments. The result is a full-Gaussian pair-tail
theorem with an explicit cutoff, candidate enumeration and conditional
coefficient/numerical costs. It is not a general rendering-cost theorem
or a proof of acceptable gaming cost.
