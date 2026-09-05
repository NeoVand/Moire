# Direct polar coverage enclosure

Proposed B2 construction, mathematically audited but not implemented or benchmarked. Bound source coverage directly: on each angular arc, integrate the safe-positive event \(q_{\min}-Cr^3>0\) for a lower bound and the possible-positive event \(q_{\max}+Cr^3>0\) for an upper bound. This avoids dividing by the gradient and preserves how the remainder vanishes near the pixel center.

## Assumptions and probability contract

Whiten a nondegenerate two-dimensional Gaussian pixel: \(X=\mu+LZ\), \(LL^{\mathsf T}=\Sigma\), \(Z\sim N(0,I_2)\). Let \(F(Z)=f(\mu+LZ)-t\), with the source convention **strictly positive**. Suppose a quadratic model satisfies

\[
q(r,\theta)=d+a(\theta)r+b(\theta)r^2,
\qquad |F-q|\le Cr^3\quad(0\le r\le R).
\]

The remainder must hold throughout the ball, not merely at sampled witnesses. For a sufficiently smooth source, one sufficient constant is \(C\ge\tfrac16\sup_{\|z\|\le R}\|D^3F(z)\|_{\rm op}\). A ball containing an unresolved seam or pole does not satisfy this assumption automatically; split it, certify a different bound, or decline the mode.

Partition the angle into nonoverlapping arcs \(A\). Certified coefficient bounds give

\[
q_{\min}=d+a_{\min,A}r+b_{\min,A}r^2
\le q(r,\theta)\le
q_{\max}=d+a_{\max,A}r+b_{\max,A}r^2.
\]

Independent coefficient extrema can be loose because \(a,b\) are correlated, but remain valid since \(r,r^2\ge0\). Define radial sets, clipped to \([0,R]\),

\[
I_A^- =\{r:q_{\min}(r)-Cr^3>0\},\qquad
I_A^+ =\{r:q_{\max}(r)+Cr^3>0\}.
\]

The former guarantees \(F>0\) throughout the arc; the latter contains every radius where \(F>0\) is possible.

## Exact radial measure and angular bounds

The whitened Gaussian has density \((2\pi)^{-1}r e^{-r^2/2}\,dr\,d\theta\). For disjoint radial intervals,

\[
\mathcal R\!\left(\bigcup_j[\ell_j,h_j]\right)
=\sum_j\left(e^{-\ell_j^2/2}-e^{-h_j^2/2}\right).
\]

Endpoints have zero radial mass unless a polynomial equality holds on an entire interval, which needs explicit handling below. With \(w_A=|A|/(2\pi)\) and \(\tau=e^{-R^2/2}\),

\[
\sum_A w_A\mathcal R(I_A^-)
\le P(F>0)\le
\min\!\left(1,\sum_Aw_A\mathcal R(I_A^+)+\tau\right).
\]

The unknown outside-ball contribution lies in \([0,\tau]\): add \(\tau\) **only to the upper probability**. Arc refinement tightens coefficient ranges; this is an enclosure, not an assumed angular quadrature error estimate.

For a quadratic jet, \(a=g_x\cos\theta+g_y\sin\theta\) and

\[
b=\frac{H_{xx}+H_{yy}}4+
\frac{H_{xx}-H_{yy}}4\cos2\theta+
\frac{H_{xy}}2\sin2\theta.
\]

Arc bounds must include interior extrema and angle wrapping, not just endpoints.

Keep the probability interval separate from the value actually returned by a renderer. If its endpoints are \(L_p,U_p\), their midpoint has absolute error at most \((U_p-L_p)/2\). Certifying an existing approximation \(v\) instead requires \(\max(|v-L_p|,|v-U_p|)\) to meet the budget. A narrow interval elsewhere does not certify \(v\). For fixed foreground/background colors, propagate coverage uncertainty through their affine mixture. A varying correlated shading amplitude requires a weighted integral contract; this unweighted coverage result does not certify it automatically. Arc mass uncertainties and numerical allowances must all enter the final endpoints before either acceptance test.

## Root and numerical obligations

Each event is a cubic inequality. Isolate every relevant real root, include \(0,R\), and certify signs on every intervening interval. Events may be disconnected. Repeated roots need not change sign: \(-r(r-1)^2\) remains nonpositive through its double root. Toggling at every returned root is incorrect.

An identically zero polynomial satisfies no **strict** positive event. Do not treat it as finitely many negligible roots, or replace \(>\) by \(\ge\) on a plateau. If source/model identity is independently proved, use that identity directly.

Floating-point implementation must enclose coefficient extrema, root positions, exponentials, and accumulated mass outward. Unresolved root neighborhoods contribute zero guaranteed mass and their full possible mass. Jet rounding is not covered by the analytic Taylor remainder: enclose \(d,a,b\), or include \(\delta_0+\delta_1r+\delta_2r^2\) in the remainder. The resulting inequalities remain cubic.

## Band mass is a separate fallback

Inside the ball, source/model indicator disagreement is contained in \(|q|\le Cr^3\). Its possible radial event is

\[
q_{\min}\le Cr^3\quad\text{and}\quad q_{\max}\ge-Cr^3;
\]

its guaranteed event replaces these by \(q_{\min}\ge-Cr^3\) and \(q_{\max}\le Cr^3\). Integrating them bounds band mass. Only the **upper** band mass plus \(\tau\) bounds indicator expectation error. A positive lower band mass is not a lower error bound: \(F=q\) can have zero error while satisfying a loose positive remainder allowance.

Direct source-coverage bounds can be tighter because uncertain crossings in opposite directions need not be charged as one signed error.

## Two revealing controls

For \(q=r^2\), \(C=0.01\), \(R=6\), the uncertain band requires \(r\ge100\); inside-ball coverage is therefore certain except at the zero-mass origin. The remaining allowance is \(e^{-18}\approx1.52\times10^{-8}\). A constant remainder \(CR^3=2.16\) instead marks approximately 66% of Gaussian mass uncertain. This demonstrates the mathematical advantage over a global shifted-conic allowance, without claiming measured performance.

Conversely, consider the analytic cancellation

\[
F(x)=\sin(\varepsilon x)-\tfrac12\sin(2\varepsilon x)
=\sin(\varepsilon x)(1-\cos(\varepsilon x)).
\]

Its quadratic jet at zero vanishes. For every \(\varepsilon>0\), a centered nondegenerate Gaussian gives \(P(F>0)=1/2\): the function is odd and its zeros are discrete. Its frequency and cubic remainder can be arbitrarily small while the zero model has strict-positive coverage zero. The direct enclosure correctly remains broad. A frequency cutoff alone cannot certify thresholds; fixed-frequency certification needs sign geometry or another structural argument.

## Unresolved cost

Constant polynomial degree does not bound angular refinement or difficult-root certification. Saddles and nearly tangent events can require substantial work. Stop at an explicit work cap, retain the unresolved probability interval, and use the declared fallback. This proposal supplies a coverage contract and useful degeneracy handling; it supplies neither a universal term-count theorem nor evidence of GPU speed.
