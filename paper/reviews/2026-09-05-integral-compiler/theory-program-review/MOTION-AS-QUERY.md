# Motion as a query: reuse, admission, and the missing compactness

Theory only, 2026-09-06. No implementation or timing claim.
This extends the scope of [GAUSSIAN-QUERY-STATE.md](GAUSSIAN-QUERY-STATE.md).
Motion of an entire material and independent motion of its ingredients
are different problems. Even a common nonlinear motion can transfer
complexity into the filter rather than remove it.

## 1. The established change of variables

Let the fixed source be measurable \(F_0:\mathbb R^d\to[0,1]\), and let
the moving source be \(F_\theta(x)=F_0(T_\theta(x))\).
For a \(C^1\) diffeomorphism \(T\) and input density \(p\),

\[
 I_\theta=\int F_0(Tx)p(x)\,dx=\int F_0(y)q_T(y)\,dy,\qquad
 q_T(y)=\frac{p(T^{-1}y)}{|\det DT(T^{-1}y)|}.                 \tag{1}
\]

This is classical. [Heckbert (1989), section 3.4, equation (3.2)](
https://www2.eecs.berkeley.edu/Pubs/TechRpts/1989/CSD-89-516.pdf)
already gives a general warped resampling kernel including the Jacobian.
[Loubet, Holzschuch and Jakob (2019), section 3.2, equations (9)--(13)](
https://rgl.s3.eu-central-1.amazonaws.com/media/papers/Loubet2019Reparameterizing.pdf)
explicitly transfer motion of an indicator into a kernel for differentiable
rendering. Their practical local parameterizations have additional
approximation assumptions. Neither citation establishes our desired
uniform Hermite degree, acquisition price, or GPU cost.

For \(T(x)=Ax+b\) and \(p=N(\mu,\Sigma)\), (1) is exactly the Gaussian
\(N(A\mu+b,A\Sigma A^T)\). A common affine motion therefore reuses the
same source coefficients within the declared query patch. Transforming
parameters, checking admission, and evaluating the query still cost work.
No new source acquisition is required for this case.

Independent layer motions generally have no supplied common \(T\) of the
whole composed material. The relative-phase example in
[REUSABLE-PAIR-RESPONSE.md](REUSABLE-PAIR-RESPONSE.md), section 7, applies
there. Equation (1) neither discards those phases nor makes their updates
inexpensive.

## 2. The exact admission and approximation questions

Work in the fixed reference coordinates, with \(\gamma=N(0,I_d)\).
Set \(R_T=q_T/\gamma\). Change variables once more:

\[
 \|R_T\|_{L^2(\gamma)}^2
 =\int\frac{p(x)^2}{\gamma(Tx)|\det DT(x)|}\,dx.             \tag{2}
\]

When this is finite, the same source state
\(H_\alpha=E_\gamma[F_0h_\alpha]\) pairs with query coefficients
\(c_\alpha(T)=E_p[h_\alpha(TX)]\).
Let \(\Pi_N\) be total-degree Hermite projection. The retained response is
\(\sum_{|\alpha|\le N}H_\alpha c_\alpha(T)\). Its error obeys two
different bounds:

\[
 |I-I_N|
 \le \tfrac12\|(I-\Pi_N)R_T\|_2,\qquad
 |I-I_N|
 \le \|R_T\|_2\,\|(I-\Pi_N)F_0\|_2.                       \tag{3}
\]

The first uses the bounded source's variance and \(N\ge0\).
The second can be useful when the source has its own spectral certificate.
If a family has uniformly bounded query norms, each fixed \(L^2\) source
therefore admits uniform convergence via the second bound. This does not
give a source-independent degree selector.

Admission alone supplies neither a uniform query tail nor inexpensive
coefficients \(E_p[h_\alpha(TX)]\). Those expectations may themselves
require substantial integration.

A sufficient admission example: take \(p=\gamma\),
\(|T(x)-x|\le a\) everywhere, and \(|\det DT(x)|\ge j>0\).
For any \(0<\eta<1\), Young's inequality in (2) gives

\[
 \|R_T\|_2^2\le
 j^{-1}(1-\eta)^{-d/2}
 \exp\!\left[\frac{a^2}{2}(1+\eta^{-1})\right].             \tag{4}
\]

Indeed the integrand is \(\gamma(x)\exp(x\cdot u+|u|^2/2)/|\det DT|\)
with \(u=T(x)-x\), and \(x\cdot u\le\eta|x|^2/2+a^2/(2\eta)\).
This is a global hypothesis, not a center witness.

Smooth invertibility by itself fails even admission. In one dimension
\(T(x)=x+x^3\) is a smooth global diffeomorphism, but (2) becomes

\[
 \frac1{\sqrt{2\pi}}\int
 \frac{\exp((x+x^3)^2/2-x^2)}{1+3x^2}\,dx=\infty.
\]

Every fixed Gaussian reference fails because its reciprocal contributes
a positive sixth-degree exponent. Restricting a window can remove this
tail obstruction, at the separately charged probability and boundary cost.

There is also a sufficient way to avoid nonlinear query coefficients.
Suppose the warp of a standard Gaussian input is
\(\Psi(z)=b+B[z+u(z)]\), with \(B\) invertible, \(u\) continuously
differentiable, and the global bound \(\|Du\|_{\rm op}\le\kappa<1\).
Then \(S(z)=z+u(z)\) is a global diffeomorphism. Its displacement is
Lipschitz, so the Gaussian integrations below are finite.
Change of variables and Gaussian integration by parts give

\[
 D_{\rm KL}(S_\#\gamma\|\gamma)
 =E_\gamma\left[\operatorname{tr}Du-\log\det(I+Du)
                         +\tfrac12|u|^2\right]
 \le\tfrac12E|u|^2+\frac{E\|Du\|_F^2}{2(1-\kappa)}.       \tag{4a}
\]

The determinant is positive by continuation from \(I\).
For a possibly nonsymmetric matrix \(D\) with \(\|D\|\le\kappa\),
expand \(\operatorname{tr}\log(I+D)\) and bound
\(|\operatorname{tr}D^n|\le\|D\|_F^2\kappa^{n-2}\) for \(n\ge2\).
This proves the stated conservative inequality. Pinsker's inequality,
and invariance under the invertible affine map, now yield

\[
 |E F_0(\Psi Z)-E_{N(b,BB^T)}F_0|
 \le \frac12\sqrt{E|u|^2+\frac{E\|Du\|_F^2}{1-\kappa}}.   \tag{4b}
\]

Add this model allowance to the Gaussian-state error. No smoothness of
the material is needed. This uses established change of variables,
Gaussian integration by parts and Pinsker; no novelty claim is made.
It is sufficient rather than necessary: special warps can have sharper
certificates.

A local version charges the uncontrolled tail explicitly. Let \(R>0\),
let \(u\) be \(C^1\) on a neighborhood of the ball of radius \(2R\),
and suppose \(|u|\le a\) and \(\|Du\|\le\kappa\) on that ball.
Multiply \(u\) by a smooth cutoff equal to one on radius \(R\), zero
outside \(2R\), with gradient at most \(2/R\). If
\(\widehat\kappa=\kappa+2a/R<1\), applying (4b) to this globally
extended displacement and coupling on the inner ball gives

\[
 |E F_0(\Psi Z)-E_{N(b,BB^T)}F_0|
 \le P_\gamma(|Z|>R)
   +\frac12\sqrt{a^2+\frac{d\widehat\kappa^2}{1-\widehat\kappa}}.
                                                               \tag{4c}
\]

Choose the cutoff flat at its outer boundary so that extension by zero
is \(C^1\). The original warp need only be defined measurably outside
that reach. Response-error bounds (4b)--(4c) may always be capped at one.
In two dimensions the tail is \(e^{-R^2/2}\). These are certified bounds
over a region, not agreement at a few sample points. They supply an
admission test for an affine approximation, not a universal small error.

## 3. A bounded displacement still allows unresolved phase

In two dimensions fix \(a>0\), let \(b>0\), and consider the shear

\[
 T_b(x,y)=(x+a\sin(by),y).
\]

It is a smooth diffeomorphism with displacement at most \(a\) and
determinant one. Its derivative is not uniformly bounded as \(b\) grows.
For standard Gaussian input its density ratio is

\[
 R_b(x,y)=\exp\!\left[a x\sin(by)-\tfrac12a^2\sin^2(by)\right],
 \qquad \|R_b\|_2^2=E_Y e^{a^2\sin^2(bY)}\le e^{a^2}.     \tag{5}
\]

Thus there is a uniform norm bound, however large the carrier frequency.
It does not give a uniform query degree.

Put \(r_\phi(x)=\exp(a x\sin\phi-a^2\sin^2\phi/2)\) and
\(\bar R(x)=E_\phi r_\phi(x)\), with uniform phase \(\phi\).
For every fixed pair of indices,

\[
 c_{pq}(b)=\frac{a^p}{\sqrt{p!}}\,
 E_Y[\sin^p(bY)h_q(Y)]
 \longrightarrow
 \frac{a^p}{\sqrt{p!}}E_\phi[\sin^p\phi]\,\mathbf1_{q=0}. \tag{6}
\]

To see this, condition on \(Y\), use the Hermite moment of a translated
unit Gaussian in \(x\), and expand the finite trigonometric polynomial
\(\sin^p\). Every nonconstant Fourier term paired with fixed \(h_q\)
tends to zero. Hence \(\Pi_N R_b\to\Pi_N\bar R\) for every fixed \(N\).
On the other hand,

\[
 \|R_b\|_2^2\longrightarrow M=E_\phi e^{a^2\sin^2\phi},\qquad
 \|\bar R\|_2^2=B=E_{\phi,\psi}e^{a^2\sin\phi\sin\psi}.
\]

These limits follow by periodic averaging and Gaussian integration.
The strict gap is

\[
 M-B=E_\phi\|r_\phi-\bar R\|_{L^2(\gamma_1)}^2
 \ge E_\phi(a\sin\phi)^2=\frac{a^2}{2}.                   \tag{7}
\]

The inequality projects onto the normalized Hermite \(h_1(x)=x\).
Consequently, for every fixed \(N\),

\[
 \lim_{b\to\infty}\|(I-\Pi_N)R_b\|_2^2
 =M-\|\Pi_N\bar R\|_2^2\ge a^2/2.                        \tag{8}
\]

There is also an explicit bounded-source response witness, not just a
norm argument. Choose \(F_b(x,y)=\mathbf1_{\{x\sin(by)>0\}}\). Then

\[
 E_{q_b}F_b=E_Y\Phi(a|\sin(bY)|)
 \longrightarrow\tfrac12+D(a),\qquad
 D(a)=E_\phi\Phi(a|\sin\phi|)-\tfrac12
 \ge\frac{2a}{\pi}\varphi(a)>0.                          \tag{9}
\]

The function \(\Pi_N\bar R\) is even in \(x\) and has integral one, so
its pairing with \(F_b\) is exactly \(1/2\). Equation (6) makes the
retained-query response tend to \(1/2\) too. Thus any fixed universal
degree misses the response (9) for some sufficiently rapid shear and
bounded material.

The witness source varies with \(b\). It does not contradict uniform
convergence for each fixed source in (3), and it is not a lower bound
against all representations. A representation retaining this shared
phase could be much better. The obstruction is to a degree selector
based only on displacement, determinant, and query norm.

## 4. Polynomial corrections must be expressed in the reference basis

A useful restricted non-Gaussian query is \(P(y)q(y)\), where
\(q=N(m,Q)\), \(Q\prec2I\), and \(P\) is a supplied polynomial of degree
\(s\). It may be signed; any model error is a separate allowance.
Let \(c_\alpha=E_qh_\alpha\), and define multiplication operators

\[
 (X_i c)_\alpha=\sqrt{\alpha_i+1}c_{\alpha+e_i}
                   +\sqrt{\alpha_i}c_{\alpha-e_i}.
\]

The corrected coefficients are \(d_\alpha=[P(X)c]_\alpha\).
To obtain them through \(N\), obtain \(c\) through \(N+s\), and retain
only indices with adequate padding after each multiplication.
Fixed degree and dimension give \(O(K_{N+s})\) arithmetic, with
polynomial coefficient formation and numerical conditioning charged.

In two dimensions, for the signed projective correction of
[PROJECTIVE-DENSITY.md](PROJECTIVE-DENSITY.md), section 4, if
\(Q=BB^T\), the polynomial in reference coordinates is

\[
 P(y)=1+[k\cdot B^{-1}(y-m)]\,[3-|B^{-1}(y-m)|^2].
\]

Applying the cubic in the query-whitened coordinates directly to the
reference coefficient vector would generally be wrong. Three degrees
of padding suffice; the original Gaussian tail cannot simply be reused.

There is an exact total-energy certificate for any such polynomial.
Let \(S=\|q/\gamma\|_2^2\), whose explicit Gaussian formula is given in
the query-state note. Completing the square gives

\[
 V=(2Q^{-1}-I)^{-1},\qquad v=2VQ^{-1}m,\qquad
 \|Pq/\gamma\|_2^2=S\,E_{N(v,V)}[P^2].                  \tag{10}
\]

The omitted squared coefficient norm is (10) minus
\(\sum_{|\alpha|\le N}|d_\alpha|^2\). For a cubic, (10) needs Gaussian
moments only through degree six. Numerical intervals must certify the
subtraction; cancellation does not provide accuracy for free.
Half the square root bounds its pairing error with \(F_0\in[0,1]\).
Add the projective signed-model error separately. This does not assert
that the exact rational pushforward, with its heavy tails, is itself
Gaussian-\(L^2\) admissible.

## 5. What remains open

The useful distinction is between common affine motion, a common
nonlinear warp with certified query complexity, and independent changes
of the material's ingredients. Their costs need separate contracts.
The shear example explains why eliminating a fast coordinate can lose
the material correlation it later meets.

For supplied moving polygon boundaries, state derivatives are another
possible route. [Li et al. (2018), section 3.1, equations (6)--(10)](
https://people.csail.mit.edu/tzumao/diffrt/diffrt.pdf)
derive the corresponding interior and boundary terms in rendering.
For an indicator, \(\partial_\theta H_\alpha
=\int_{\partial\Omega}v_n h_\alpha\gamma\,ds\).
Affine normal velocity along each edge admits the polynomial boundary
oracle. Integrating that derivative over a finite edit still requires
error control and treatment of topology changes.

None of these facts prices arbitrary implicit boundaries or proves
real-time material updates. They specify where a new closure or
phase-preserving representation would have to improve on existing
transformed-filter mathematics.
