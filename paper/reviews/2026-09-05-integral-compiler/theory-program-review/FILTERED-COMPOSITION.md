# Filtering changes the law of composition

Theory only. Gaussian product expansions are established mathematics, used in large-eddy simulation: see [Moeleker and Leonard (2001)](https://doi.org/10.1006/jcph.2000.6669) and Eq. 94 of [Gorban, *Basic Types of Coarse-Graining II*](https://web.ma.utexas.edu/mp_arc/c/06/06-59.pdf). The normalization and convergence below follow independently from Gaussian Hermite completeness; see [Khoshnevisan, Gaussian Analysis, Chapter 3](https://www.math.utah.edu/~davar/math7880/F18/GaussianAnalysis.pdf). The proposed interpretation for count maps is a research direction, not a novelty or performance claim.

## The exact product and its remainder

Write \(P_t=e^{t\Delta/2}\), so \(t\) is Gaussian variance. Fix a pixel center \(x\), \(t>0\), and \(f,g\in L^2(N(x,tI))\). Bounded material functions satisfy this condition. For a multi-index \(\alpha\), the normalized Hermite coefficient of \(f(x+\sqrt tZ)\) is

\[
a_{f,\alpha}=\frac{t^{|\alpha|/2}}{\sqrt{\alpha!}}
\partial^\alpha P_tf(x).
\]

Differentiation acts on the Gaussian kernel; the source need not be differentiable. Parseval gives

\[
P_t(fg)(x)=\sum_\alpha\frac{t^{|\alpha|}}{\alpha!}
\partial^\alpha P_tf(x)\,\partial^\alpha P_tg(x).
\]

The series converges absolutely by Cauchy–Schwarz. For complex functions this is bilinear; conjugate the second factor for \(P_t(f\overline g)\). These are derivatives of the **filtered fields**, not local source derivatives.

For any finite retained index set \(A\), define

\[
E_{f,A}=P_t|f|^2(x)-\sum_{\alpha\in A}
\frac{t^{|\alpha|}}{\alpha!}|\partial^\alpha P_tf(x)|^2.
\]

This nonnegative residual energy bounds the omitted product by
\(\sqrt{E_{f,A}E_{g,A}}\). Computing these energies and filtered derivatives is part of the cost; the bound does not supply a free stopping rule.

## Why a count representation can be much smaller

Take opposite carriers \(f(y)=e^{ik\cdot y}\), \(g(y)=e^{-ik\cdot y}\), and \(\lambda=t|k|^2\). Their exact filtered product is one. Retaining all derivatives through total order \(N\) gives

\[
e^{-\lambda}\sum_{n=0}^{N}\frac{\lambda^n}{n!}.
\]

The error is exactly the upper tail of a Poisson variable with mean \(\lambda\); the residual-energy bound is attained. For fixed accuracy, the required order grows as \(\lambda+O(\sqrt\lambda)\). A fixed derivative order loses the surviving constant as frequency increases.

By contrast, retaining the phases yields immediately

\[
P_t(e^{ik\cdot y}e^{i\ell\cdot y})(x)
=e^{i(k+\ell)\cdot x-t|k+\ell|^2/2}.
\]

Phase addition sums the entire derivative interaction exactly. This is a useful interpretation of count maps: a compact representation of a family of interactions that can be expensive in a general moment basis. One pair is constant-size work; a large mixture can still have many pairs and surviving beats.

## Where the lost interaction lives

The heat product rule also gives

\[
P_t(fg)-P_tf\,P_tg
=\int_0^tP_{t-s}(\nabla P_sf\cdot\nabla P_sg)\,ds.
\]

For smooth bounded inputs, differentiate \(P_{t-s}[(P_sf)(P_sg)]\). The Gaussian \(L^2\) version follows by the square-integrable Brownian martingale identity. For opposite carriers, the integrand is \(|k|^2e^{-s|k|^2}\): the interaction accumulates at fine scales \(s\sim |k|^{-2}\), even though both individually filtered fields are tiny at the final scale.

An exact filtered multiplication law can therefore preserve composition. Truncating it need not preserve associativity. Already in one dimension, \(F\star G=FG+tF'G'\) has associator

\[
(F\star G)\star H-F\star(G\star H)
=t^2G'(F''H'-F'H'').
\]

Consequently, a fixed truncation can make two algebraically equivalent material graphs disagree. This is an approximation issue, not a failure of the exact Gaussian filter.

## The research question this sharpens

Beyond count maps, seek representations that preserve and sum useful interaction families, with explicit residual control. Phase carriers supply one family; merely increasing moment order is not a general cost solution. The task is to discover which geometric, shading and visibility relations admit similarly compact composition, and whether those representations remain small when combined. Neither the exact expansion nor its scale-integral form proves that they do.
