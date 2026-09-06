# Towards a theory of material appearance across scale

Research synthesis from the live Codex–Claude exchange, September 5, 2026. This records a direction to investigate, established foundations and the questions that distinguish a deeper theory from another representation or integration rule. It is not a finished algorithm or a novelty claim. New implementation and benchmark batches are paused during this phase.

## The central question

**What information about microscopic structure must survive so that its macroscopic appearance remains predictable after material operations and changes of scale?**

A count map is already a useful answer for repeated structure: it records position within each family and therefore the relationships between families. Two fine patterns can interact to make a broad beat. Averaging each fine pattern first erases the relationship responsible for the beat. The relevant coarse variable can be their relative phase, even when neither individual phase remains visually resolved.

The proposed generalization is a material state together with the law governing its evolution under averaging, and the material responses that this state must support. Counts supply convenient coordinates for some states. Normals, height, opacity, orientation and their dependencies can require others. The objective is to derive an effective material law at a given scale while retaining the interactions that remain visible.

Calling this conditional homogenization is useful: eliminate fast motion while conditioning on the structure whose effects survive. That phrase describes an established mathematical strategy, not ownership of a new theory. The substantive research would identify when this operation produces a compact material law and how to construct it for useful material families.

## What the literature already contains

| Prior work | Relevant foundation | Distinction our work would need |
| --- | --- | --- |
| [Heitz et al., Filtering Non-Linear Transfer Functions on Surfaces, 2014](https://www.cim.mcgill.ca/~derek/files/heitz_tvcg.pdf) | A footprint induces an input distribution; filtering pairs it with a transfer function. Section 4.1 explicitly considers finite bases for both. | A useful compositional representation or operator, with stated closure and compression assumptions. |
| [Yang and Barnes, Approximate Program Smoothing Using Mean-Variance Statistics, 2018](https://www.connellybarnes.com/work/publications/2018_shader_bandlimiting.pdf) | Program smoothing propagates mean, variance and approximations to pairwise correlation. | Preserve dependencies needed by downstream operations beyond the chosen Gaussian/statistical closure. |
| [Olano and Baker, LEAN Mapping, 2010](https://userpages.cs.umbc.edu/olano/papers/lean/) | Small slope-moment representations support efficient filtering and an anisotropic lobe model. | Explain when a small moment state is sufficient and when detailed distributions must survive. |
| [Yan et al., Rendering Glints on High-Resolution Normal-Mapped Specular Surfaces, 2014](https://sites.cs.ucsb.edu/~lingqi/publications/paper_glints.pdf) | Local normal-distribution structure can create visible glints; smoothing it into an ensemble lobe loses that appearance. | Retain response-relevant fluctuations rather than assuming every fine structure becomes smooth roughness. |
| [Weier et al., Neural Prefiltering for Correlation-Aware Levels of Detail, 2023](https://graphics.cg.uni-saarland.de/papers/weier-2023-neural-lod.pdf) | Appearance and positional visibility dependencies demand different representations. | Account for preparation, representation capacity and which correlations a chosen approximation discards. |

Related perspectives include [frequency analysis of light transport](https://doi.org/10.1145/1073204.1073320), which studies how shading and occlusion redistribute frequency, and [heterogeneous multiscale methods](https://arxiv.org/abs/physics/0205048), which construct macroscopic models informed by microscopic structure. Their existence prevents us from claiming that frequency interactions or effective laws are new by themselves.

## A stronger object than the count value

For a Gaussian screen footprint, averaging is heat evolution:

\[
P_t f(x)=E[f(x+\sqrt t Z)]=e^{t\Delta/2}f(x),\qquad Z\sim N(0,I_2).
\]

Suppose the material is \(H(T(x))\). The chain rule gives

\[
\frac12\Delta H(T)=\frac12\sum_{ij}
(\nabla T_i\cdot\nabla T_j)H_{ij}(T)
+\frac12\sum_i(\Delta T_i)H_i(T).
\]

If these metric and drift coefficients are functions of the retained state \(T\), the induced diffusion can close in that state:

\[
\mathcal A=\tfrac12\sum_{ij}a_{ij}(T)\partial_{ij}
+\tfrac12\sum_i b_i(T)\partial_i.
\]

With appropriate regularity, domain conditions and a well-posed induced process, the corresponding semigroups intertwine:

\[
P_t[H\circ T]=(e^{t\mathcal A}H)\circ T.
\]

The cross terms express shared variation; the drift includes curvature. This is established diffusion mathematics. It gives us a precise question about whether a proposed material state contains enough geometry to predict its filtering behavior.

For \(T=x^2+y^2\), the generator is \(2\partial_T+2T\partial_{TT}\). One operator therefore governs every bounded radial response \(H(T)\). But \(T=x^2+y^4\) has value one at both \((1,0)\) and \((0,1)\), while \(|\nabla T|^2\) is respectively four and sixteen. Its scalar count does not contain enough information. Angle alone similarly omits radius-dependent diffusion. Adjoining state may fix closure, but there is no guarantee this procedure terminates compactly; retaining screen position always rewrites the problem without necessarily simplifying it.

Finite moment closures have their own prior theory: [Cuchiero, Keller-Ressel and Teichmann](https://arxiv.org/abs/0812.4740) develop polynomial processes whose conditional moments are represented through matrix exponentials. Our question is which useful material states and observable families admit similarly tractable behavior.

## Which interactions must survive?

The future material operations determine what a summary may discard. A polynomial response of bounded degree can require only finitely many joint moments. An arbitrary threshold response may distinguish the entire distribution. Products introduce observables outside an initially retained span.

For a conditional-expectation projection \(P\) and multiplication operators \(M_f,M_g\) of bounded observables,

\[
PM_fM_gP-PM_fPM_gP=PM_f(I-P)M_gP.
\]

On constant input this expresses the conditional covariance lost by separately averaging the factors. More generally it describes an interaction through discarded information. One possible research route is to retain a compact representation of these interactions instead of expanding every scalar recipe. Its rank need not be small; identifying conditions that make it small would be a consequential result.

The proposed object is thus a triple: **material state, filtering operator, and permitted downstream responses**. A state compact for diffuse shading may be insufficient for narrow glints or visibility. This is why a universal list of moments is unlikely to solve the problem.

## Where complexity could actually disappear

Averaging a shared fast phase gives

\[
\int_0^{2\pi}\sin(\alpha+\psi_1)\sin(\alpha+\psi_2)
\frac{d\alpha}{2\pi}=\tfrac12\cos(\psi_1-\psi_2).
\]

The carrier disappears and its relative phase remains. This is the original quotient insight, now interpreted as a possible reduction of an entire composed material law.

There is a useful distribution-level argument. Conditional on retained state \(W\), suppose \(U\in\mathbb R^r\) is Gaussian with positive-definite covariance \(Q(W)\), and the phases are exactly \(\psi(W)+BU\bmod2\pi\) for integer \(B\). For any complete material \(0\le H\le1\), replace its fast phase by uniform \(\alpha\) and define its orbit average \(\bar H\). Then

\[
|E H-E\bar H|\le E\min\left(1,
\frac12\sqrt{\sum_{n\in\mathbb Z^r\setminus\{0\}}e^{-n^TQ(W)n}}\right).
\]

The wrapped Gaussian has Fourier magnitudes \(e^{-n^TQn/2}\). Parseval and Cauchy–Schwarz bound its total variation from the uniform law; boundedness of the complete material transfers that bound to its mean. This argument needs no absolute Fourier-tail assumption on a discontinuous material. The orbit average retains exactly the characters satisfying \(B^Tk=0\).

Its limitation is informative. Conditioning on a slow coordinate may determine the carrier completely. For two nearly parallel gratings driven by the same one-dimensional screen coordinate, their exact slow difference can do this: the conditional fast covariance is zero. The argument then supplies no averaging. Treating that case requires additional slow-variation assumptions or another homogenization argument. Nor does the result make computing and storing \(\bar H\) free.

Near-resonant modes with \(|J^Tk|\le\kappa\) are not a subgroup: adding two retained modes may exceed the cutoff. They do not automatically define a quotient. For more count coordinates than screen dimensions, affine diffusion can leave arbitrarily high-index near-resonances weakly damped. The full torus filtering operator consequently need not be compact. Gaussian filtering alone cannot supply a universal finite recipe count.

## What would constitute the advance

We should seek a stated family of composed materials for which we can derive a sufficient geometric state, preserve the interactions needed by the final response, and reduce the induced scale operator to a compact effective law. That law would explain how resolved pattern becomes beat, roughness, highlight or coverage as the footprint changes.

Three theoretical questions now lead the work: when useful state closure exists; when fast-variable elimination preserves the required material responses; and what structural assumptions bound the complexity of the remaining law. Exact formulas, numerical methods and the engine implementation would follow from those answers. They cannot replace them.
