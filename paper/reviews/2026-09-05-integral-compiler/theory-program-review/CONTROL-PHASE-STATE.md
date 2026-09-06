# A retained control phase can support independent motion

Theory only, 2026-09-06. This gives a sufficient update class, not a
general solution for animated materials. It combines classical finite
Fourier dependence with the Gaussian Hermite state of
[GAUSSIAN-QUERY-STATE.md](GAUSSIAN-QUERY-STATE.md).
The relative-phase counterexample in
[REUSABLE-PAIR-RESPONSE.md](REUSABLE-PAIR-RESPONSE.md), section 7,
explains why the control coordinate must be retained.

## 1. A supplied finite control band

Let \(\phi\in\mathbb T^p\), with radians and normalized Haar measure.
Suppose the complete source is supplied in the form

\[
 F(x,\phi)=\sum_{k\in\mathcal K}F_k(x)e^{ik\cdot\phi},
 \qquad \mathcal K\subset\mathbb Z^p\text{ finite},\qquad
 0\le F(x,\phi)\le1.                                    \tag{1}
\]

The range bound holds for every control value and almost every \(x\).
The coefficient fields have the conjugate symmetry needed for a real
source. Write \(M=|\mathcal K|\), and store

\[
 H_{\alpha k}=E_\gamma[F_k h_\alpha],\qquad |\alpha|\le N.
                                                               \tag{2}
\]

The reference Gaussian is fixed; each camera/footprint query has its
usual coefficients \(c_\alpha(m,Q)\). The response is

\[
 I_N(m,Q,\phi)=\sum_{|\alpha|\le N}c_\alpha(m,Q)
                        \sum_{k\in\mathcal K}H_{\alpha k}e^{ik\cdot\phi}.
                                                               \tag{3}
\]

This is the Hermite approximation of the bounded source
\(F(\cdot,\phi)\), for each fixed \(\phi\). Consequently, throughout the
admitted Gaussian patch, the same degree selector and bound hold:

\[
 |I-I_N|\le\tfrac12\sqrt{S(w;m,Q)}\,w^{-(N+1)/2},
 \qquad w>1,\quad w\|Q-I\|_{\rm op}<1.                    \tag{4}
\]

Here \(S(w)\) is the exact weighted Gaussian coefficient energy in the
query-state note. There is no \(\sqrt M\) analytical truncation factor:
all control modes are retained, and the complete controlled source is
bounded. This argument does not assert that a truncated Fourier source
remains bounded.

## 2. Costs and numerical allowances

With \(K_N=\binom{N+d}{d}\), (2) stores \(M K_N\) complex entries
before using conjugate symmetry. Computing a fresh query costs
\(O(dK_N+M K_N+pM)\) arithmetic plus phase evaluation. At a fixed
Gaussian query, first contract the spatial coefficients to \(M\)
control-response coefficients; later control-only queries cost
\(O(pM)\).

All \(M K_N\) source moments must be obtained. A separate moment oracle,
its input preparation and its accuracy are part of the acquisition cost.
A known rectangular control band can be recovered exactly from a
sufficient finite tensor phase grid and a DFT in exact arithmetic;
this prices control extraction, not the spatial integrals.

Joint Parseval and Bessel give

\[
 \sum_{\alpha,k}|H_{\alpha k}|^2
 \le E_{\gamma,\phi}|F(x,\phi)|^2\le1.                   \tag{5}
\]

But evaluation at a particular phase has vector norm \(\sqrt M\).
An unstructured Frobenius error \(\eta_H\) in the stored matrix therefore
contributes at most

\[
 \sqrt{S(1;m,Q)}\,\sqrt M\,\eta_H                         \tag{6}
\]

with exact query coefficients and phase. Query coefficient error,
phase evaluation, accumulation and input-coordinate errors are additional.
For example, with exact \(H,c\), a phase-vector error
\(\eta_v=\|(e^{ik\cdot\widehat\phi}-e^{ik\cdot\phi})_k\|_2\)
contributes at most \(\sqrt{S(1)}\eta_v\), by (5).
One sufficient bound is
\(\eta_v\le(\sum_k|k|^2)^{1/2}|\widehat\phi-\phi|\),
using consistent phase representatives.

Thus the analytical absence of \(\sqrt M\) in (4) does not remove the
price of storing, evaluating or accurately constructing the modes.

## 3. A concrete independently moving family

Let \(A:\mathbb R^d\to[0,1]\) be arbitrary but fixed. Let
\(b:\mathbb T^p\to[0,1]\) be a supplied finite Fourier polynomial, and
let \(L\) be a fixed real \(p\)-by-\(d\) matrix in radian units.
Define \(B(x)=b(Lx)\). Independent translations satisfy

\[
 A(x+s_A)B(x+s_B)=A(y)b(Ly+\phi),\qquad
 y=x+s_A,\quad \phi=L(s_B-s_A)\pmod{2\pi}.                \tag{7}
\]

The common translation changes the Gaussian mean to \(\mu+s_A\).
The relative translation changes the retained phase \(\phi\).
The coefficient fields are exactly

\[
 F_k(y)=b_k A(y)e^{i k\cdot Ly}.                         \tag{8}
\]

For \(b(\theta)=(1+\cos\theta)/2\), there are only three columns:
\(A/2\), \(A e^{iL y}/4\), and \(A e^{-iL y}/4\).
This count does not grow with the carrier magnitude \(|L|\).
The carrier still enters the moment acquisition and the conversion
of displacement uncertainty to phase uncertainty, \(L\,\delta s\).
There is no fixed-precision or carrier-independent preparation claim.

If \(A\) is supplied as bounded polygonal cells, (8) can be acquired
directly with Gaussian-times-plane-wave boundary moments. It requires
no enumeration of the Fourier spectrum of \(A\) or of beat pairs.
If \(y=\mu_{\rm ref}+Wz\) whitens the reference Gaussian, transform
the cells and source to \(z\), use frequency
\(\omega=W^TL^Tk\), and retain the constant factor
\(e^{ik\cdot L\mu_{\rm ref}}\).
For completeness, the local recurrences giving that claim follow.

Let \(g(z)=e^{i\omega\cdot z}\), and let
\(I_\alpha=\int_e h_\alpha\gamma g\,ds\) on a straight edge
\(z=an+ut\), with \(n,t\) orthonormal.
Put \(B_\alpha=[h_\alpha\gamma g]_{u_0}^{u_1}\),
\(\ell_{\alpha,j}=\sqrt{\alpha_j}I_{\alpha-e_j}\), and
\(v_{\alpha,j}=\sqrt{\alpha_j+1}I_{\alpha+e_j}\).
Multiplication in the normal direction and differentiation in the
tangent direction give

\[
 n\cdot v_\alpha=aI_\alpha-n\cdot\ell_\alpha,\qquad
 t\cdot v_\alpha=-B_\alpha+i(\omega\cdot t)I_\alpha.      \tag{9}
\]

Both equations involve lower degrees and known endpoint values.
The edge seed is the one-dimensional Gaussian integral with a complex
linear term. For a cell \(P\), write
\(M_\alpha=\int_P h_\alpha\gamma g\) and
\(e_\alpha=\int_{\partial P}n h_\alpha\gamma g\,ds\).
Integrating the coordinate derivative identities gives

\[
 \sqrt{\alpha_i+1}M_{\alpha+e_i}
       =-e_{\alpha,i}+i\omega_iM_\alpha.                 \tag{10}
\]

After the cell's complex Gaussian probability seed, one predecessor
per target obtains all moments through \(N\) in \(O(K_N)\) work in
fixed dimension two. Equations (9)--(10) are the plane-wave special
case of the weighted Gaussian recurrence developed with Claude in
the orientation note, section 7h(d).

For \(E_{\rm inc}\) supplied cell-boundary incidences and \(C\) cells,
the direct preparation price in two dimensions is
\(O(M(E_{\rm inc}+C)(N+1)^2)\) arithmetic plus the complex univariate
and bivariate Gaussian seed evaluations. Geometry, actual translated
copies, source cell labels, frequency input precision, numerical error
and cancellation remain charged. This is a special-function arithmetic
contract, not a statement that those seed calls are cheap or GPU-ready.

## 4. The structural condition behind the example

A more general sufficient condition is an additive phase action on the
counts:

\[
 \tau_j(T_{j,\theta}x)
 =\tau_j^0(T_{{\rm common},\theta}x)+q_j\cdot\phi(\theta),
 \qquad q_j\in\mathbb Z^p.                              \tag{11}
\]

The common map needs its own query contract from
[MOTION-AS-QUERY.md](MOTION-AS-QUERY.md), and the complete response
needs a supplied finite band in \(\phi\).
Linear counts under translation, angular phase under rotation, and
log-radius phase under positive dilation provide elementary additive
actions on their valid domains. This does not imply an arbitrary
independently deformed layer has (11).

A positive illustrative family is

\[
 F(x,\phi)=\prod_{j=1}^J
       \frac{1+a_j(x)\cos(\tau_j(x)+q_j\cdot\phi)}2,
 \qquad |a_j(x)|\le1.                                   \tag{12}
\]

Its candidate control support is the sum of
\(\{-q_j,0,q_j\}\). With all \(q_j\) equal, at most \(2J+1\) modes
are needed. With \(J\) unrelated independent coordinate characters,
there can be \(3^J\). Forming the coefficient fields and their support
is part of preparation. Small control dimension or small authored
graphs alone do not supply a small band.

## 5. What this does not establish

A finite pair list can also be grouped by controlled frequency, but
its projection gives candidate modes, not a lower bound on necessary
ones. Partner cancellation and other representations remain possible.
Its truncation must use the enlarged *state* reach and a uniform
state-error budget, not merely an output-frequency cutoff.

For an infinite control spectrum, Haar-average error does not justify
evaluation at a selected phase. A new truncation needs uniform control
of the source, its moments, or the final response over the allowed
controls. This is still open for the general material program.

The useful positive result here is narrower: explicitly retaining a
small, exact control band can support independent layer motion with
reusable Gaussian source moments, and for polygonal masks times a
finite-spectrum layer those moments have a direct spatial acquisition
route. The mathematics does not yet establish production cost.
