# Shared-phase averaging without conditional independence

Theory only. This applies classical periodic averaging to a gap in our conditional-Gaussian argument. [Surroop et al. (2020), Definition 1 and Lemma 3](https://arxiv.org/pdf/2004.07656) establish deterministic averaging for moving discontinuous waveforms under trajectory-dependent regularity. [Talvila (2009)](https://arxiv.org/pdf/0909.4336) supplies a continuous-primitive/BV-weight integration-by-parts framework. Neither source automatically establishes every material extension below; the stated pixel bound is derived here.

## The gap

For phases \(\phi(x)=\omega x\) and \(s(x)=\delta x\), knowing the slow beat \(s\) determines the carrier when \(\delta\ne0\). The conditional Gaussian covariance vanishes, so our conditional mixing bound cannot eliminate the carrier. Deterministic cancellation can still do so while retaining the varying beat.

Let \(H(\theta,s)\) be \(2\pi\)-periodic in \(\theta\), and define

\[
h(s)=\frac1{2\pi}\int_0^{2\pi}H(\theta,s)\,d\theta,
\qquad
G(\theta,s)=\int_0^\theta[H(u,s)-h(s)]\,du,
\]

extending \(G\) periodically. The proposed effective material is \(h(s(x))\), retaining its entire spatial variation.

## An exact identity and a finite bound

First assume sufficient smoothness for the chain rule, \(\phi'\ne0\), and integrability of the expressions below. On \([a,b]\), put

\[
E=\int_a^b w(x)[H(\phi(x),s(x))-h(s(x))]\,dx.
\]

Differentiating \(G(\phi,s)\) and integrating by parts gives

\[
E=\left[\frac{wG(\phi,s)}{\phi'}\right]_a^b
-\int_a^b\left(\frac w{\phi'}\right)'G(\phi,s)\,dx
-\int_a^b\frac w{\phi'}G_s(\phi,s)s'\,dx.
\]

If \(w\ge0\), \(\|G\|_\infty\le M_0\), \(\|G_s\|_\infty\le M_1\), and the endpoint term vanishes,

\[
|E|\le M_0\left\|\left(\frac w{\phi'}\right)'\right\|_1
+M_1\int\frac{w|s'|}{|\phi'|}\,dx.
\]

This includes nonaffine carriers; their rate variation enters the first term. For an affine carrier and normalized Gaussian weight of variance \(\sigma^2\),

\[
|E|\le\frac{M_0\sqrt{2/\pi}/\sigma+M_1\mathbb E_w|s'|}{|\omega|}.
\]

No independence assumption or Fourier-tail summability enters this argument.

## Discontinuities require an actual source trace

An almost-everywhere identity in \((\theta,s)\) need not hold on the particular curve \((\phi(x),s(x))\). For example,

\[
H(\theta,s)=\mathbf1_{\{\theta=2s\bmod2\pi\}}
\]

has \(h=G=0\), but equals one along \(\phi=2x,s=x\). Even a smooth primitive does not fix this. [Allaire (1992), Proposition 5.8](https://www.cmap.polytechnique.fr/~allaire/two-scale.pdf) gives a stronger indicator counterexample with continuous dependence into the periodic \(L^1\) space. Slice regularity alone cannot justify diagonal evaluation.

A concrete admissible family is

\[
H(\theta,s)=a(\theta)b(\theta-s),
\]

where \(a,b\) are indicators of finite unions of nondegenerate circular arcs, with their usual piecewise-constant values. Assume \(\phi\) is \(C^2\), \(s\) is \(C^1\), \(\phi'\) never vanishes, and

\[
|s'|\le\kappa|\phi'|,\qquad \kappa<1.
\]

Both \(\phi\) and \(\phi-s\) then cross mask endpoints transversally. Periodically smooth the masks, apply the smooth bound, and pass to the limit by dominated convergence. Mask boundary values affect only a null set. The weight, boundary and integrability assumptions still apply.

The constants are explicit. Since \(0\le H\le1\), the total positive mass of \(H-h\) is at most \(2\pi h(1-h)\), so

\[
M_0\le\pi/2.
\]

Write \(G=\int k_\theta(u)a(u)b(u-s)\,du\), where
\(k_\theta=\mathbf1_{[0,\theta]}-\theta/(2\pi)\).
The signed measure \(db\) has total mass zero; the oscillation of \(k_\theta a\) is at most one. Hence the corrector's Lipschitz constant obeys

\[
M_1\le\tfrac12\operatorname{TV}_{\mathbb T}(b).
\]

The same bounds hold for positive periodic smoothings. For two single-arc masks, \(\operatorname{TV}(b)=2\). With \(s=\delta x+s_0\) and \(|\delta|<|\omega|\),

\[
\boxed{|E|\le\frac{\sqrt{\pi/2}/\sigma+|\delta|}{|\omega|}.}
\]

Here \(h(s)\) is the normalized circular overlap of the arcs, a piecewise-linear function preserving their beat. It is not the product of independent coverages. Computing the subsequent filtered overlap remains part of the work.

## A geometric interpretation

For smooth sources in several dimensions, choose a vector field \(v\) with \(v\cdot\nabla\phi=1\). With vanishing boundary flux, the same derivation gives

\[
E=-\int\operatorname{div}(wv)G\,dx
-\int wG_s(v\cdot\nabla s)\,dx.
\]

The two costs are variation of the averaging measure along the chosen direction and change of the retained material state along it. A direction tangent to that state removes the second term; a dependent beat instead incurs a controlled term. This interpretation does not itself construct a cheap vector field or extend the mask proof to arbitrary geometry.

Carrier turning points, grazing moving boundaries, or interval births can invalidate these bounds. Large carrier rate alone is insufficient: rates relative to material boundaries matter. The result supplies a specific correlated family and explicit sufficient conditions, not a universal closure, tight error estimate, or real-time cost theorem. No implementation or numerical experiments accompany this note.
