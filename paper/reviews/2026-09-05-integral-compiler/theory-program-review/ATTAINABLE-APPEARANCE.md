# Attainable appearance across scale and time

2026-09-06. Theory synthesis from the Codex–Claude exchange, messages
197–214. No implementation or benchmark. The elementary statements below
were independently checked; the broader program remains a research question,
with novelty unestablished.

The proposed question is: given desired appearances over a specified family
of views, scales and times, which can coexist in one allowed material, how
stable is that realization, and what does its representation cost to render?

This is a stronger requirement than fitting several screenshots. It combines
the material's realizability constraints with the observation operators and
a cost certificate. Count coordinates, carry states, and the finite Gabor
interaction law offer different possible representations inside that problem.

## 1. Closely related work already exists

| Primary work | What is already established |
| --- | --- |
| [Oliva, Torralba and Schyns, Hybrid Images, 2006](https://doi.org/10.1145/1141911.1141919) | Authoring distance-dependent interpretations using low- and high-frequency image bands. |
| [Han et al., Multiscale Texture Synthesis, 2008](https://www.cs.columbia.edu/cg/mts/) | Combining exemplars at multiple scales and repairing interscale inconsistencies. |
| [Wu, Dorsey and Rushmeier, Inverse Bi-scale Material Design, 2013](https://svbrdf.github.io/publications/InvBiscale/project.html) | Editing coarse appearance and searching fine geometry/material combinations that approximate it. |
| [Hersch and Chosson, Band Moiré Images, 2004](https://doi.org/10.1145/1015706.1015709) | Inverse design of revealed moiré images and their movement under layer transformations. |
| [PhaseLift](https://arxiv.org/abs/1109.4499) | Lifting intensity measurements to a positive-semidefinite matrix with a rank-one field constraint. Its recovery guarantees require their stated measurement assumptions. |

Consequently, multiscale authoring, deliberate moiré, and the matrix lift
are not new principles. A possible advance would be a useful constructive
family with explicit compatibility, stability, realization and rendering-cost
certificates over a continuum of observation conditions.

## 2. A fixed radiance field has one scale evolution

Use the normalized torus T^d=(R/2πZ)^d and the Gaussian heat operator

\[
 P_t=e^{t\Delta/2},\qquad
 \widehat{P_tG}(k)=e^{-t|k|^2/2}\widehat G(k).
 \tag{1}
\]

This section concerns the same fixed radiance field G, observed in the
same coordinates with different Gaussian widths. Changing lighting,
view-dependent reflectance, occlusion or nonlinear camera geometry requires
its corresponding observation model; those changes are not covered simply
by varying t.

Exact target images H_i=P_(t_i)G must obey

\[
 H_j=P_{t_j-t_i}H_i,\qquad t_j\ge t_i.
 \tag{2}
\]

If the allowed uniform errors are ε_i and ε_j, positivity and normalization
make P_t an L∞ contraction, so necessarily

\[
 \|H_j-P_{t_j-t_i}H_i\|_\infty\le\epsilon_i+\epsilon_j.
 \tag{3}
\]

This is a direct witness of incompatible targets. With one common error
budget ε, any pair whose discrepancy is D requires ε≥D/2, regardless of
the optimizer or source representation.

Gaussian multipliers at finite t never vanish, so observing a full continuous
filtered field is injective on periodic L2 sources. High frequencies become
small rather than exactly invisible. Finite sampling, tolerance, perceptual
measurements and earlier nonlinear maps can introduce different ambiguities;
they must be stated explicitly.

On a finite Fourier space containing DC and a largest frequency magnitude K,
inversion from scale t has L2 condition number exp(tK²/2). A nonnegative
target b+a cos(k·x) has inverse b+a exp(t|k|²/2) cos(k·x), which is negative
somewhere if |a| exp(t|k|²/2)>b. Thus an image can be a valid nonnegative
target yet have no nonnegative preimage under the specified blur.

For finite-band unconstrained weighted least squares, each Fourier mode
decouples. With positive weights ω_i and h_i(k)=exp(−t_i|k|²/2),

\[
 \widehat G(k)=
 \frac{\sum_i\omega_i h_i(k)\widehat H_i(k)}
 {\sum_i\omega_i h_i(k)^2}.
 \tag{4}
\]

This solves the linear fit, but does not enforce positivity, a finite material
dictionary, intensity-channel rank, stability, or a rendering budget.

## 3. Intensity realization is constrained by correlation rank

Let U_a=Σ_j a_j φ_j in a specified finite dictionary. Its intensity is
I_a=|U_a|². Under a positive linear observation R_q, define

\[
 (G_q)_{ij}=R_q(\overline{\phi_i}\phi_j),\qquad
 R_qI_a=a^*G_q a=\operatorname{tr}(G_qX),\qquad X=aa^*.
 \tag{5}
\]

The matrix G_q is positive semidefinite for a positive footprint observation.
The observation becomes linear in X, but one coherent field requires

\[
 X\succeq0,\qquad\operatorname{rank}X=1.
 \tag{6}
\]

A sum of L independently squared channels instead has
X=Σ_(l=1)^L a_l a_l^*, with rank at most L. Conversely, any PSD rank-L matrix
has such a factorization. A higher-rank fit is therefore a different allowed
source expression. It cannot be silently presented as a single coherent
field. Real-field dictionaries also require their conjugacy constraints.

### A robust three-atom example

Take the dictionary {1,e^(ix),e^(iy)} on T² and target

\[
 T(x,y)=4+2\cos x+2\cos y
 =|1+e^{ix}|^2+|1+e^{iy}|^2.
 \tag{7}
\]

Two intensity channels realize T exactly. The corresponding matrix is

\[
 Q=\begin{pmatrix}2&1&1\\1&1&0\\1&0&1\end{pmatrix}
 \succeq0,\qquad\operatorname{rank}Q=2.
 \tag{8}
\]

No single field I=|a+b e^(ix)+c e^(iy)|² in this dictionary realizes T.
The desired x and y coefficients require conjugate(a)b=conjugate(a)c=1.
Then b and c are nonzero, creating a nonzero unwanted x−y coefficient,
where T has zero.

The obstruction survives finite Gaussian filtering with a quantitative gap.
For s≥0 let w=exp(−s/2), and suppose

\[
 \|P_s(I-T)\|_\infty\le\delta.
 \tag{9}
\]

Every normalized Fourier coefficient of the error is at most δ. The DC,
axis, and diagonal-frequency conditions give

\[
 |a|^2+|b|^2+|c|^2\le4+\delta,
\]

\[
 |w(\overline a b-1)|\le\delta,\quad
 |w(\overline a c-1)|\le\delta,\quad
 w^2|b\overline c|\le\delta.
 \tag{10}
\]

If δ<w, the two axis inequalities imply
|a|²|bc|≥(1−δ/w)². Combining this with the other inequalities gives
(w−δ)²≤δ(4+δ). Cancelling δ² proves

\[
 \boxed{\delta\ge\frac{w^2}{4+2w}
 =\frac{e^{-s}}{4+2e^{-s/2}}.}
 \tag{11}
\]

When δ≥w, the same lower bound holds trivially. At s=0 the unavoidable
uniform error is at least 1/6. Dividing the target and candidate intensities
by eight gives a target in [0,1] and a lower bound of 1/48 at s=0.

This is a fixed-dictionary realization gap, not a statement about all scalar
fields. The unrestricted field sqrt(T) realizes T exactly but generally
leaves this dictionary. One-variable Fejér–Riesz factorization does not
supply a factor in this sparse two-variable space. The example makes an
explicit source-cost distinction: two allowed channels succeed where one
necessarily leaves an unwanted beat.

## 4. Creating a beat requires the correct source operation

A linear sum of nearby high-frequency sinusoids has a modulation envelope,
but no Fourier coefficient at their difference frequency. Linear filtering
does not manufacture that coefficient. Multiplication or another nonlinear
response can create it. Perceived envelopes and physical low-frequency
radiance are different observations, as discussed by
[Amidror and Hersch](https://lspwww.epfl.ch/publications/moire/troftaomitpovme.pdf).

For a finite trigonometric polynomial A supported in |k|≤B and a lattice
carrier Ω, put F=Re(exp(iΩ·x)A(x)). Then exactly

\[
 F^2=\tfrac12|A|^2+
 \tfrac12\operatorname{Re}(e^{2i\Omega\cdot x}A^2).
 \tag{12}
\]

The envelope has support in |k|≤2B. The carrier terms have support in balls
of radius 2B centered at ±2Ω. If |Ω|>2B, these bands are disjoint. For the
actual Gaussian filter rather than an ideal spectral cutoff,

\[
 P_tF^2=\tfrac12P_t|A|^2+R_t,
\]

\[
 \|R_t\|_\infty\le
 \tfrac12\|\widehat A\|_{\ell^1}^2
 \exp[-\tfrac t2(2|\Omega|-2B)^2].
 \tag{13}
\]

The envelope itself still follows heat evolution. Prescribing it independently
at each distance would violate (2). Choosing A=sqrt(2H) gives a desired
nonnegative source envelope H, but generally leaves the finite dictionary.
For H=c²/2+h with real finite-band h and c>0, the choice A=c+h/c instead
has envelope error h²/(2c²), bounded by ||h||∞²/(2c²). Its higher baseline
and source range must remain within the material constraints.

These are established amplitude-modulation and square-law principles,
closely related to holographic carrier separation. They serve here as an
explicit realization with a scale-transition bound, not as a new mechanism.
In particular, |exp(iΩ·x)A|²=|A|² loses the carrier even in the near field;
it cannot be substituted for the real-field construction in (12) when
near-field carrier visibility is part of the design.

## 5. Observation families define approximation metrics

For a specified family of linear responses R_q, define

\[
 d(F,G)=\sup_{q\in\mathcal Q}\|R_q(F-G)\|.
 \tag{14}
\]

With bounded operators and an appropriate source space, this is a seminorm
of the difference. Its exact common kernel defines a quotient. The relation
d(F,G)≤ε generally fails transitivity and is not a literal quotient.
Use certified approximation balls instead. If Q includes arbitrarily small
Gaussian footprints and full-image observations, no smallest display band
exists; the observation approaches the original field.

Suppose a fixed translation-invariant observation has Fourier weights
a_q(k)=|Rhat_q(k)|². Normalized Parseval gives

\[
 d(F,G)^2=\sup_q\sum_k
 |\widehat F(k)-\widehat G(k)|^2a_q(k).
 \tag{15}
\]

The diagonal envelope Σ_k |Fhat−Ghat|² sup_q a_q(k) is a valid upper bound,
not generally equality: each frequency may choose a different worst query.
Weights (1,0) and (0,1) for two queries give max(|c_1|²,|c_2|²) in (15),
whereas the diagonal envelope is |c_1|²+|c_2|².

For a specified stationary linear temporal model, let T_t(k) be the response
at phase t of a jitter cycle, and K(k) the intended reconstruction. The exact
cycle-averaged squared error per character is

\[
 \mathbb E_t|T_t(k)-K(k)|^2
 =|\overline T(k)-K(k)|^2+
 \mathbb E_t|T_t(k)-\overline T(k)|^2.
 \tag{16}
\]

Retained mean response alone is not alias error: the target may require it.
Equation (16) distinguishes stable bias from temporal variation. With a
fixed input prefilter P(k), replace the two terms by
|P(k)Tbar(k)−K(k)|² and |P(k)|² Var(T_t(k)). A time-varying input footprint
must instead remain inside the history sum. Sampling, spatially varying
reprojection, visibility rejection and clamping need their own operators;
they are not covered by a scalar stationary transfer.

[Yang et al., Amortized Supersampling](https://hhoppe.com/supersample.pdf)
is direct prior art for recursive reprojection and accumulated resampling
blur. Applying a known transfer to a material's Fourier coefficients is not,
by itself, a novelty claim. The proposed benefit is a response contract that
keeps material correlations, intended reconstruction, bias and shimmer
consistent in the same design problem.

### Temporal compatibility uses one source coefficient

For one frequency in the same stationary linear model, collect the cycle
responses in a vector τ=(T_1,...,T_N), and the desired output coefficients
in h. One source coefficient c can produce only cτ. With the normalized
cycle inner product, its unconstrained least-squares residual is

\[
 \min_c\|c\tau-h\|^2
 =\|h\|^2-\frac{|\langle\tau,h\rangle|^2}{\|\tau\|^2},
 \qquad\tau\ne0.
 \tag{17}
\]

If τ=0 the residual is ||h||². For a nonzero steady desired coefficient I,
the minimum error relative to |I|² is
Var(T)/(|Tbar|²+Var(T)). A fluctuating transfer therefore cannot produce an
arbitrary steady target from a fixed source harmonic, even if a cycle mean
can be fitted exactly. For several views, all their response vectors must
share the same c; separate per-view fits are insufficient.

There is also a useful distinction between filtering a fixed material and
inversely redesigning it. If a nonzero fixed prefilter P and Tbar≠0 are
compensated by choosing c=I/(P Tbar) to match the mean exactly, output
variance becomes |I|² Var(T)/|Tbar|²: P cancels. Thus a prefilter suppressing
shimmer for a fixed source does not promise the same benefit after inverse
amplification to recover the original mean.

Independent coefficient bounds do not enforce a pointwise material range.
For example H=W/2+(2W/5)cos x lies in [0,W]. A Gaussian filter whose first
harmonic multiplier is 1/2 has the unique inverse
G=W/2+(4W/5)cos x, which leaves that range, even though the elementary
individual coefficient bounds |Ghat(k)|≤W hold. These temporal and range
conditions are compatibility witnesses, not a complete attainable-set
characterization or an efficient solver.

## 6. A useful next theorem would include the conditions between targets

In a finite intensity dictionary, one possible constrained problem is to
find X≥0 with a specified rank/channel budget, source range and preparation
budget, such that tr(G_q X) approximates the desired H_q for every q in a
bounded family Q. The renderer's certified cost, such as a Gabor feature
budget, must also be included. Writing this optimization does not provide
an efficient solver or a useful rank theorem.

There is an elementary way to expose the cost of checking a continuum.
Suppose tr(X)≤E and, in operator norm, ||G_q−G_q'||≤L_G dist(q,q'), while
|H_q−H_q'|≤L_H dist(q,q'). If a finite query set is an h-net of Q, then

\[
 \sup_{q\in Q}|\operatorname{tr}(G_qX)-H_q|
 \le\max_{q\text{ in net}}|\operatorname{tr}(G_qX)-H_q|
 +(EL_G+L_H)h.
 \tag{18}
\]

The proof uses positivity of X and
|tr((G_q−G_q')X)|≤||G_q−G_q'|| tr(X). The size of the net and the derivative
bounds are additional costs; high-dimensional view families may make this
generic construction impractical. Critical visibility events may invalidate
the smoothness assumptions and require separate regions.

The sought advance is a useful structural alternative to such generic
covering: a material family whose attainable appearances, stability and
rendering cost can all be controlled over the allowed observations. The
rank-gap witness above is a small exact example of the realization side.
The carry-state and Gabor-Gram notes supply examples of the forward-cost
side. Connecting those pieces broadly enough for industry remains open.
