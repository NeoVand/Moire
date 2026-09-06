# A complete conditional cost bound for shared-phase mask graphs

Theory only; no implementation or timing claim. This extends [the two-mask corrector](SHARED-PHASE-AVERAGING.md) to a bounded material graph and includes integration of the surviving beat. The arithmetic model uses exact real operations, sorting, integer-range enumeration, and Gaussian CDF/PDF evaluations. Numerical precision and certified transcendental evaluation are additional costs.

The arrangement method is classical: [CSG Ray Tracing Revisited, §3.1](https://www.scitepress.org/PublishedPapers/2017/61364/61364.pdf) describes sorted interval events; [Paoluzzi et al., Algorithm 3](https://arxiv.org/pdf/1910.11848) evaluates Boolean expressions on actual arrangement cells. The possible research contribution is combining this representation with justified carrier elimination and a complete filtered-material cost contract, not inventing interval sorting or periodic averaging.

## Family and phase mean

Let \(b_1,\ldots,b_m\) be indicators of nondegenerate single arcs on the \(2\pi\)-circle. Let the supplied finite material graph

\[
F:\{0,1\}^m\longrightarrow[0,1]
\]

cost \(C_F\) to evaluate on a maintained binary input vector. Define

\[
H(\theta,s)=F(b_1(\theta-s_1),\ldots,b_m(\theta-s_m)),
\quad h(s)=\frac1{2\pi}\int_0^{2\pi}H(\theta,s)\,d\theta.
\]

At fixed shifts, at most \(2m\) distinct endpoints partition the circle. The entire binary state is constant between adjacent endpoints. Group tied endpoints, maintain the state while sweeping, and evaluate \(F\) on each positive-length interval:

\[
h(s)=\frac1{2\pi}\sum_\ell |I_\ell(s)|F(v_\ell(s)).
\]

Initial classification and all bit updates cost \(O(m)\); sorting and material evaluation cost

\[
O(m\log(m+1)+mC_F).
\]

This does not enumerate a truth table of size \(2^m\), or construct every possible ordering in parameter space.

## Elimination bound for the full graph

Use the periodic primitive \(G(\theta,s)=\int_0^\theta(H-h)\). Since \(0\le H\le1\),

\[
\|G\|_\infty\le\pi/2.
\]

Changing only \(s_j\) changes the material only on that mask's symmetric difference, with amplitude at most one. Therefore

\[
\|H(\cdot,s+ue_j)-H(\cdot,s)\|_1\le2|u|,
\quad \operatorname{Lip}_{s_j}G\le2,
\quad |h(s+ue_j)-h(s)|\le |u|/\pi.
\]

The product-specific constant one for \(G\) does not hold for arbitrary graphs: signed influences at a mask's two edges can add, as in XOR.

For a rigorous nonsmooth passage, smooth each arc periodically and use only in the proof the extension
\(\widetilde F(p)=\mathbb E F(B)\), with independent Bernoulli coordinates of means \(p_j\). It obeys \(0\le\widetilde F\le1\) and \(|\partial_j\widetilde F|\le1\). The displayed corrector bounds remain uniform. This extension is not an algorithm or an assumed cheap evaluation of \(F\).

If \(\phi'\ne0\) and \(|s_j'|\le\kappa|\phi'|\) for a fixed \(\kappa<1\), every phase \(\phi-s_j\) crosses its arc endpoints transversally. Mollified sources converge almost everywhere on the actual curve. Under the weight, boundary, and derivative integrability assumptions in the preceding note, the smooth corrector identity passes to the bound

\[
\left|\int w(H(\phi,s)-h(s))\right|
\le\frac\pi2\left\|\left(\frac w{\phi'}\right)'\right\|_1
+2\sum_j\int\frac{w|s_j'|}{|\phi'|}.
\]

In particular, for \(X\sim N(0,\sigma^2)\), \(\phi(x)=\omega x+\phi_0\), and \(s_j(x)=\delta_jx+\beta_j\) with \(|\delta_j|<|\omega|\),

\[
\left|\mathbb EH(\phi(X),s(X))-\mathbb Eh(s(X))\right|
\le \frac{\sqrt{\pi/2}/\sigma+2\sum_j|\delta_j|}{|\omega|}.
\tag{1}
\]

## Integrating the beat without sampling its fine carrier

Let the two endpoints of arc \(j\) be \(c_{j,a}\), \(a\in\{0,1\}\). Their moving lifts are
\(e_{j,a}(x)=\delta_jx+\beta_j+c_{j,a}\).
The cyclic ordering changes only at

\[
(\delta_j-\delta_k)x+\beta_j+c_{j,a}-\beta_k-c_{k,b}=2\pi n.
\]

Equal-slope endpoints are permanently tied or never collide. Group them appropriately. Choosing a moving endpoint as angular origin shows that crossings of a fixed zero seam create no additional events. Between consecutive collision locations, each circular interval has affine length and a fixed material value. Thus \(h(s(x))\) is affine on that interval. Its translation bound proves continuity through collisions, including simultaneous ones.

On \([-R,R]\), each edge pair with \(\delta_j\ne\delta_k\) has at most \(1+R|\delta_j-\delta_k|/\pi\) collision occurrences. Define the budget

\[
B=4\sum_{\substack{j<k\\\delta_j\ne\delta_k}}
\left(1+\frac{R|\delta_j-\delta_k|}{\pi}\right).
\tag{2}
\]

This bounds raw events before duplicates are merged and also covers unequal-slope pair enumeration. Group slopes first, so the common-drift case does not incur an unnecessary quadratic scan. An actual distinct-event count alone would omit this setup work.

For an affine piece \(h(s(x))=A+Dx\) on \([a,b]\),

\[
\int_a^b w_\sigma(x)h(s(x))\,dx
=A[\Phi(b/\sigma)-\Phi(a/\sigma)]
+D\sigma[\varphi(a/\sigma)-\varphi(b/\sigma)],
\]

where \(\Phi,\varphi\) are the standard normal CDF and density. Values at the piece endpoints determine \(A,D\) by continuity.

For \(0<\varepsilon<1\), choose

\[
R=\sigma\sqrt{2\log(4/\varepsilon)}.
\]

The omitted Gaussian mass is at most \(\varepsilon/2\). Apply (1) on the **full Gaussian first**, then truncate only the coarse integral. If the right side of (1) is at most \(\varepsilon/2\), the resulting pixel approximation has total absolute error at most \(\varepsilon\).

Its arithmetic cost is

\[
O\!\left(B\log(B+2)+(B+1)[m\log(m+1)+mC_F]\right).
\tag{3}
\]

For fixed drift rates, graph, window and tolerance, this cost is independent of the shared carrier frequency once its elimination certificate passes. This is a complete conditional pixel bound for this specified family; the statement does not assign a game-frame budget.

## Scope and representation choices

A common drift can be subtracted: replace \(\omega\) by \(\omega-c\) and every \(\delta_j\) by \(\delta_j-c\). Both the source and its circular phase mean are unchanged. Event cost already depends only on drift differences; the elimination certificate may improve, provided transversality still holds.

The graph is fixed during the integral and depends on space only through its mask inputs. General continuously varying shading, nonlinear drift, several independent carriers, and masks with many windings are outside this theorem. A mask \(b_j(n_j\theta-s_j)\) contributes \(2|n_j|\) endpoints, exposing frequency in the event count again. In two phase dimensions even two directions \((N,1)\) and \((1,N)\) create \(N^2-1\) intersections per pair of boundary levels; mask count alone cannot bound arrangement work.

Near-coincident events, numerical phase reduction, input representation length, and certified CDF evaluation need their own precision analysis. No generality, novelty, numerical stability, or GPU performance claim follows from the exact-real arithmetic count.
