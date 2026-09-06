# Exact conditioning followed by fast-phase averaging

2026-09-06. Bounded theory note; no implementation, experiment, benchmark,
floating-point certificate, or novelty claim. Gaussian conditioning,
completion of squares, interval Poincare inequalities, and periodic
averaging are classical ingredients. The constants below were derived
and independently checked for this explicit source contract.

This extends section 6 of [GABOR-LEVEL-GEOMETRY.md](GABOR-LEVEL-GEOMETRY.md).
One coordinate of a thresholded finite Gabor field is integrated exactly.
The resulting continuous response admits a uniform slow-variable modulus,
which then bounds the error of replacing repeated carrier cycles by one
phase average. Computing that phase average remains a separate task.

## 1. Source and shared-direction contract

Let Z=(U,V) have independent standard normal coordinates, X=mu+DZ, and

\[
 F(X)=\sum_{j=1}^J a_j
 e^{-\frac12(X-c_j)^TP(X-c_j)}e^{i\omega_j^TX},
 \quad P\succ0,\quad h=|F|^2,\quad W=\left(\sum_j|a_j|\right)^2.
 \tag{1}
\]

This is a finite authored sum of peak-one envelopes; a_j are the original
complex amplitudes, not coefficients enlarged by factoring or tilting.
All centers, frequencies and geometry are fixed for the footprint query.
The affine chart and Gaussian measure are actual assumptions, not a
source-validity certificate for a nonlinear geometry approximation.

Choose reference center c_0 and frequency omega_0. Require all real and
imaginary parts of D^T[P(c_j-c_0)+i(omega_j-omega_0)] to lie in a single
real subspace of dimension at most one. Rotate the ORIGINAL standard
Gaussian and D together so the relative rates have zero v-component.
A one-dimensional complex span alone is insufficient. Additionally require

\[
 [D^T(\omega_j-\omega_0)]_u=n_j\Omega,
 \qquad n_j\in\mathbb Z,\qquad \Omega\ne0.
 \tag{2}
\]

Equation (2) is exact commensurability, not rounding to a nearby frequency.
Any fixed phase offsets are allowed. An arbitrary common carrier cancels
from intensity and need not be commensurate.

Put G=D^TPD, ell=D^TP(mu-c_0), a=G_vv, and initially assume a>0. Set

\[
 d(u)=\frac{G_{uv}u+\ell_v}{a},\quad
 g_s=G_{uu}-\frac{G_{uv}^2}{a}\ge0,\quad
 X_r(u)=\mu+D(u,-d(u))=x_r+t_ru.
 \tag{3}
\]

Every atom has the same v-envelope after this completion of squares:
its center shift has zero relative v-rate, and its relative phase does
too. Absorbing fixed phases into complex ridge amplitudes A_j(u) gives

\[
 h(u,v)=\mathcal A(u,\Omega u+\theta_0)e^{-a[v+d(u)]^2},\qquad
 \mathcal A(u,\theta)=\left|\sum_j A_j(u)e^{in_j\theta}\right|^2.
 \tag{4}
\]

Explicitly A_j(u) is the original jth envelope evaluated at X_r(u), times
a fixed complex phase: the relative ridge phase has slope n_j Omega.
Its squared-distance quadratic has leading coefficient
t_r^TPt_r=g_s. For g_s>0 it follows that

\[
 A_j(u)=\widetilde a_j e^{-g_s(u-u_j)^2/2},\quad
 |\widetilde a_j|\le|a_j|,\quad
 \sup_u|A_j'(u)|\le |a_j|\sqrt{g_s/e}.
 \tag{5}
\]

The inequality on the prefactor follows from nonnegativity of the minimum
squared distance along the ridge. If g_s=0, P positive definite implies
t_r=0; use constant ridge amplitudes directly, without dividing by g_s.
Consequently, uniformly in theta,

\[
 0\le\mathcal A\le W,\qquad
 |\partial_u\mathcal A|\le L_A:=2W\sqrt{g_s/e}.
 \tag{6}
\]

No harmonic index n_j or carrier Omega occurs in (6). Center shifts and
arbitrary fixed complex amplitudes are included; additional u-dependent
phases would require their own derivative contribution.

### Controlled residual phase rates

The same construction permits [D^T(omega_j-omega_0)]_u=n_j Omega+delta_j,
provided exp(i delta_j u) is RETAINED in the slow amplitude in (4).
The real shared-direction condition remains unchanged. Replace A_j by
A_j exp(i delta_j u); the triangle inequality gives

\[
 |(A_je^{i\delta_ju})'|
 \le |a_j|\left[\sqrt{g_s/e}+|\delta_j|\right],\qquad
 L_A\le2W\sqrt{g_s/e}+2S\sum_j|a_j||\delta_j|,
 \quad S=\sum_j|a_j|.
 \tag{6a}
\]

Any common residual carrier may first be subtracted from all delta_j,
because its unit complex factor cancels from intensity. Use (6a) instead
of (6) in every subsequent L_q. No frequency is silently rounded away.
Harmonic-index complexity AND residual slow variation must be charged:
choosing all n_j=0 for arbitrary Omega is valid but tautological, leaving
all original phase variation in the outer response rather than removing it.

## 2. Exact conditional threshold response

Assume 0<tau<W and write phi,Phi for the standard normal density and CDF.
Define q(u,theta)=[log(mathcal A(u,theta)/tau)]_+, setting q=0 where
mathcal A=0, and s=sqrt(q/a). The conditional response is

\[
 \psi(u,\theta)=\Phi(-d(u)+s)-\Phi(-d(u)-s),\qquad 0\le\psi\le1.
 \tag{7}
\]

When mathcal A<tau the event is empty and (7) is zero. At equality its
accepted interval is one point in v, again of zero Gaussian measure.
Otherwise it is exactly [-d-s,-d+s]. Thus, without any moment expansion,

\[
 I=E[1_{h(U,V)\ge\tau}]=E_U\psi(U,\Omega U+\theta_0).
 \tag{8}
\]

A source value of mathcal A costs O(J) arithmetic and atom evaluations at
fixed dimension, using the original ridge envelopes. This is not a bound
on the number of outer or phase quadrature evaluations or their precision.

## 3. A uniform slow-variable modulus

The map x -> [log(x/tau)]_+ on x>=0 is 1/tau-Lipschitz. Therefore
Lip_u(q)<=L_q:=L_A/tau, uniformly in theta. Any stronger certified L_q
may replace this value. A bound only near threshold, with no control of
variation on the rest of mathcal A>tau, is not sufficient for this claim.

For F(d,s)=Phi(s-d)+Phi(s+d)-1, s>=0,

\[
 |\partial_sF|\le\sqrt{2/\pi},\quad
 |\partial_dF|\le1/\sqrt{2\pi},\quad
 |\sqrt{x}-\sqrt y|\le\sqrt{|x-y|}.
\]

It follows that, for every theta and u,v,

\[
 |\psi(u,\theta)-\psi(v,\theta)|
 \le C_s\sqrt{|u-v|}+L_d|u-v|,\quad
 C_s=\sqrt{2/\pi}\sqrt{L_q/a},\quad
 L_d=|d'|/\sqrt{2\pi}.
 \tag{9}
\]

Since the response lies in [0,1], a global Holder-1/2 constant is
H=(C_s+sqrt(C_s^2+4L_d))/2: for |u-v|<=H^(-2), use (9), and for larger
separations use the range bound. H=0 means no slow-variable variation.
The phase mean of psi has the same modulus by integration over theta.

## 4. Averaging complete carrier periods

Let bar psi(u)=(2pi)^(-1) integral_0^(2pi) psi(u,theta) dtheta,
bar I=E bar psi(U), and L=2pi/|Omega|. Then

\[
 |I-\bar I|\le\min\left\{1,
 \sqrt2 C_s\sqrt L+L_dL+\frac L4\sqrt{2/\pi}\right\}.
 \tag{10}
\]

Proof: partition the whole real line into cells of length L and freeze
the slow argument at each midpoint. Do this for I and bar I; each change
costs at most C_s sqrt(L/2)+L_d L/2 after Gaussian weighting and summation.
The frozen function f_i(u)=psi(u_i,Omega u+theta_0) traverses exactly one
phase period in a cell, regardless of the sign of Omega or starting phase.

Let bar phi_i be the cell average of phi. The integrals of phi and
bar phi_i agree on the cell, and the integral of f_i against bar phi_i
equals that mass times bar psi(u_i). Since 0<=f_i<=1,

\[
 \left|\int_{C_i}(\phi-\bar\phi_i)f_i\right|
 \le\frac12\int_{C_i}|\phi-\bar\phi_i|
 \le\frac L4\int_{C_i}|\phi'|.
 \tag{11}
\]

The last inequality is the interval L1 Poincare bound. For any absolutely
continuous k on a length-L interval, averaging |k(x)-k(y)| over pairs
bounds integral |k-bar k| by integral 2t(L-t)|k'|/L, hence by
(L/2) integral |k'|. The preceding extra 1/2 uses the zero integral of
phi-bar phi and the unit response range. Finally integral |phi'|=
sqrt(2/pi). All infinite-cell sums converge by these integrable bounds.

No smoothness in theta, Fourier truncation, or threshold-crossing count
is used in this argument. Measurability and the uniform modulus (9) suffice.

## 5. Cubic signed projective correction

For a fixed vector k, rotated with the Gaussian coordinates, consider
w(u,v)=1+(k_u u+k_v v)(3-u^2-v^2). This section approximates the SIGNED
functional I_w=E[w 1_{h>=tau}]; any error relating it to actual projective
geometry is separate, as in [PROJECTIVE-DENSITY.md](PROJECTIVE-DENSITY.md).

For l=-d-s,r=-d+s, define M_j(d,s)=integral_l^r v^j phi(v) dv. Then

\[
 M_0=\Phi(r)-\Phi(l),\quad M_1=\phi(l)-\phi(r),\quad
 M_j=l^{j-1}\phi(l)-r^{j-1}\phi(r)+(j-1)M_{j-2}\quad(j\ge2).
 \tag{12}
\]

At s=0 all M_j vanish. Expanding w and integrating v gives

\[
 I_w=\sum_{j=0}^3\int\kappa_j(u)M_j(d(u),s(u,\Omega u+\theta_0))\,du,
 \quad\kappa_j=p_j\phi,
\]
\[
 p_0=1+k_u u(3-u^2),\quad p_1=k_v(3-u^2),\quad
 p_2=-k_u u,\quad p_3=-k_v.
 \tag{13}
\]

Let B_j=E|V|^j and m_j=sup_v |v|^j phi(v). In particular, with
c=sqrt(2/pi), (B_0,B_1,B_2,B_3)=(1,c,1,2c), m_0=1/sqrt(2pi), and
m_j=(j/e)^(j/2)/sqrt(2pi) for j>=1. Endpoint differentiation yields

\[
 \partial_sM_j=r^j\phi(r)+l^j\phi(l),\quad
 \partial_dM_j=l^j\phi(l)-r^j\phi(r).
\]

Both absolute derivatives are at most 2m_j. Thus the response M_j has
modulus (9) with C_s,j=2m_j sqrt(L_q/a) and L_d,j=2m_j |d'|.
Its range has width at most B_j: for even j it lies in [0,B_j]; for odd j
it lies in [-B_j/2,B_j/2], since each half-line has absolute moment B_j/2.

For any signed integrable W^(1,1) kernel kappa and a 2pi-periodic response
of range width B with that modulus, the same proof, freezing twice against
|kappa|, gives an averaging error at most

\[
 \sqrt2 C_s\|\kappa\|_1\sqrt L
 +L_d\|\kappa\|_1L+\frac{BL}{4}\|\kappa'\|_1.
 \tag{14}
\]

Indeed the frozen-cell kernel difference has zero integral. Subtract the
midpoint of the response range, pay (B/2) times its L1 norm, and then use
Poincare. If only |response|<=B is known, rather than range width B, the
last coefficient is B/2 instead of B/4. Polynomial variation of p_j is
already charged in kappa_j'; no extra frozen-coefficient step is omitted.

Let bar I_w replace each response in (13) by its uniform phase mean.
Summing (14) over j=0,...,3 is an explicit O(|Omega|^(-1/2)) bound for
|I_w-bar I_w| at fixed slow-source parameters, with these sufficient norms:

| j | upper bound on L1 norm of kappa_j | upper bound on L1 norm of kappa_j' |
|---|---|---|
| 0 | sqrt(1+6 k_u^2) | sqrt(1+24 k_u^2) |
| 1 | sqrt(6) abs(k_v) | sqrt(10) abs(k_v) |
| 2 | c abs(k_u) | sqrt(2) abs(k_u) |
| 3 | abs(k_v) | c abs(k_v) |

These follow by Cauchy-Schwarz and standard Gaussian Hermite orthogonality:
kappa_0/phi=1-k_u H_3 and kappa_0'/phi=-H_1+k_u H_4;
kappa_1'/phi=k_v(H_3-2H_1), with E H_n^2=n!. The other two rows follow
directly. All polynomial-Gaussian kernels and derivatives are integrable.
An optional total-error cap is E|w|<=sqrt(1+9||k||^2), because the original
indicator and its phase average both lie in [0,1]. A cap of 1 is invalid
for this signed functional. For k=0, use the sharper unsigned bound (10).

## 6. What remains to integrate and certify

Equation (10), or the sum of (14), is only the carrier-averaging allowance.
Add the numerical error of the one-phase mean and its slow Gaussian
integral; add any independent geometry/source approximation allowance.
The phase mean may still depend strongly on the integer harmonic indices,
atom count, and phase-boundary structure. Neither O(J) point evaluation
nor removal of repeated carrier cycles prices that remaining computation.

For the positive PHASE-AVERAGED response bar psi, a baseline outer rule
truncates to [-R,R], pays 2Phi(-R), and uses exact Gaussian cell masses.
At maximum cell length ell, midpoint error is at most
H sqrt(ell/2)+2Phi(-R), before adding errors in the phase means. Adaptive
certified ranges can discard cells below threshold or with already narrow
conditional-probability ranges. Signed rules need absolute weighted tails
and kernels as in section 5, not the unweighted Gaussian tail alone.

For the unaveraged outer integral, a certified simple root u_0 of
q_tilde(u)=log(mathcal A(u,Omega u+theta_0)/tau) permits the substitution
u=u_0+sign(q_tilde'(u_0)) t^2 on its positive side. Then
q_tilde=t^2 r(t^2), r(0)>0, so s=t sqrt(r(t^2)/a). The transformed
Gaussian-weighted integrand is analytic at t=0 for the analytic source.
Two simple endpoints bounding one positive component can use
u=u_L+(u_R-u_L)sin^2(pi t/2). Quantitative
derivative or complex-neighborhood bounds, certified root isolation, and
multiple-root handling remain necessary for a quadrature-rate claim.
Already two atoms give mathcal A(u)=e^(-g u^2)(2+2cos(Omega u)), with
Theta(|Omega| R) threshold crossings on a suitable fixed relevant interval.
This is why conditioning alone does not provide the averaging theorem.

## 7. Degenerate cases and scope

- If W=0, h=0. For any source, tau<=0 gives the constant-one indicator;
  its unsigned and signed means are both 1 since Ew=1. Tau>W gives zero.
- If a>0 and tau=W>0, every conditional event is empty or a singleton,
  so both means are zero. Constant-footprint ties require separate handling.
- If a=0, P positive definite implies De_v=0, G_uv=ell_v=0. The source is
  independent of v: use its exact indicator, including ties, and conditional
  signed weight 1+k_u u(2-u^2). The CDF/Holder argument does not apply.
- D=0 is a constant source query. If D has full column rank, both a and
  g_s are positive. The g_s=0 constant-ridge case is covered after (5).
- Omega=0 has no finite period L; keep the exact conditional integral.
  If all n_j=0, there is no phase dependence and both averaging errors
  are exactly zero, but residual u-oscillation may remain. Rates not exactly
  commensurate must retain and charge their residuals as in (6a).
- Bounds tending large as a or tau tends to zero are not uniform limits.
  Numerical evaluation, CDF tails, source bounds and certified quadrature
  require explicit precision/error budgets; none is implemented here.

Finally, this is a restricted-observable theorem, not full joint-state
independence in total variation. The law of (U,Omega U+theta_0 mod 2pi)
is supported on a graph, whereas (U,Theta) for independent uniform Theta
assigns that graph zero mass: their total variation is 1. The uniform
slow-variable modulus is what permits the selected threshold responses
to average despite that obstruction. No general material-graph closure,
native rendering cost, or industry-performance claim follows.
