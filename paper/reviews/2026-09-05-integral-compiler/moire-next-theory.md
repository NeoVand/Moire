# Moire: preserve the signal, then compile cheaper integrals

I inspected the supplied checkout and ran small experiments against `paper/tools/exp/fjet.mjs` and the shader definitions in `fjet-yb.mjs`. The repository was left unchanged. The accompanying regression probe imports it read-only. These findings apply to the working tree inspected on September 5, 2026; they are not a reproduction of every reported frame benchmark.

My strongest recommendation is to change the unit of reasoning from “the filtered value of an intermediate expression” to “a transformation of the complete pixel integral that preserves its value.” This is a practical architecture decision: keep dependencies until an integration identity, a justified independence argument, or an explicitly approximate model permits removing them.

## What the source establishes

For the first three tests below, Z is a standard normal variable.

| Test | Current result | Correct result | Interpretation |
|---|---:|---:|---|
| E[Z² 1{Z² ≥ 1/2}] | 0.4795001202 | 0.9188914117 | Correlation is lost even within the exactly representable quadratic model. |
| E[1{10⁻¹⁴(Z² − 1/2) ≥ 0}] | 0 | 0.4795001222 | An absolute flatness threshold changes a scale-invariant event. |
| E[1{Z³ ≥ 0}] | 1 | 0.5 | The source is not determined by its second-order jet. The zero quadratic model does have expectation 1 under the ≥ convention. |
| Two distinct varying fields traced together, then subtracted | 0 | −0.1067528215 at the probe point | A semantic identity collision, independent of Taylor error. |

The weighted-coverage test exercises the independence approximation already acknowledged in your response; its large error shows why that approximation needs a restricted scope. The field collision and the positive-scaling failure add distinct issues.

The last test deserves immediate attention. Let X=zₓ, A=0.3+zᵧ, B=0.5+zₓ, and form

f₁=sin(A+X sin B),   f₂=sin(A+2X sin B).

Each expression, traced separately, evaluates correctly at (zₓ,zᵧ)=(0.2,0.1). Traced together, their difference becomes zero. The coefficients X and 2X have the same value at the centre but different derivatives. `elementSig` records coefficient centre values, rounded to seven digits, and omits those derivatives. `axisKey` and `fieldsProportional` use this signature to establish identity. Distinct fields therefore acquire the same axis.

Relevant locations in `paper/tools/exp/fjet.mjs`: `axisKey` at 128–130; `fieldsProportional` at 147–150; `elementSig` at 1352–1355; `jetIsFlat` at 438 and the step fold at 1426; scalar coverage extraction at 2587–2596. Line numbers refer to the inspected checkout.

Three different contracts need separate treatment:

1. **Identity of represented expressions.** Use lossless model data and exact or unique expression identities. Approximate cache similarity must not prove semantic equality. Including gradients alone is insufficient: include Hessians, imaginary components, nested fields and closure identity too.
2. **Integration of the declared model.** The coverage example fails this contract. Integrate the mask with its varying coefficient and other factors; shared screen coordinates create dependence even when named axes differ.
3. **Accuracy of the model for the source.** The cubic example fails here. A zero jet is not proof that the source is constant. Keep source provenance, establish a validity condition, or sample the exact source residual.

Fixing one contract does not repair the other two. This is why another numerical tolerance or a higher-order special function will not resolve the recurring failures.

## A smaller mathematical core

For a Gaussian pixel displacement Z, retain complete terms of the form

1_R(Z) P(Z) exp(i θ(Z)).

Here R is the joint region of all hard decisions, P is the amplitude model, and θ is the combined phase. Multiplication intersects regions, multiplies amplitudes, and adds phases. Conjugation changes the phase sign. Consequently the same integration machinery can provide pixel means and the products needed for joint control covariance.

For quadratic phases, a useful primitive is

K(R,b,Q) = E[1_R(Z) exp(i(b·Z + ½ZᵀQZ))].

Polynomial amplitudes follow from derivatives with respect to b. This is an organizing interface, not a claim that arbitrary regions admit cheap closed forms. Conditioning, exact interval integration, numerical quadrature and sampling can implement different cases of the same interface. Source truth remains distinct from this finite model.

This representation makes the important sharing explicit: every term is a function of the same pixel displacement. Sharing a base count does not require identifying its different field transformations. Likewise, a mask's scalar coverage does not retain its correlation with a texture.

## A new experiment: compile away oscillation with zero-mean controls

For Z~N(0,σ²I), define the Gaussian Stein operator on a vector field F by

TσF(z) = div F(z) − z·F(z)/σ².

For sufficiently regular F with vanishing boundary flux, E[TσF(Z)]=0. Therefore

I = E[S(Z) − β TσF(Z)]

for any fixed β. An independent pilot can choose β without biasing the subsequent estimate. The expensive part of a conventional analytic control—computing its mean—has disappeared: this mean is zero by construction. This is established control-functional mathematics, not a new theorem; see [Oates, Girolami and Chopin](https://arxiv.org/abs/1410.2392).

The graphics opportunity is to generate useful F directly from phase structure. For a smooth component a(z) cos θ(z), try

F(z) = χ(z) a(z) ∇θ(z) sin θ(z) / (|∇θ(z)|² + λ),   λ>0.

χ is a smooth cutoff where needed. Differentiation produces a term close to a cos θ when the phase rate dominates λ, plus derivative terms. Subtracting TσF can therefore leave a much less oscillatory residual. The required information is already close to what the compiler has: amplitude gradients and phase Hessians. All derivatives of the cutoff and denominator must be included.

There is an architectural advantage beyond this particular formula. A local jet may propose a poor F without biasing the result, provided F and its divergence are consistently evaluated and the original shader S is sampled faithfully. Approximation quality then affects efficiency. It no longer silently defines the answer.

For the elementary S=cos(ωZ), σ=1, taking F=sin(ωZ)/ω leaves residual Z sin(ωZ)/ω. Its variance is asymptotically 1/(2ω²), compared with 1/2 for S. This explains why the experiment is worth trying. It does not predict the outcome for arbitrary warped phases: derivatives of the phase direction can be large.

The accompanying prototype extracts smooth phases from the actual shader functions through an additional derivative backend. It uses λ=1/σ², a compact smooth cutoff between 4σ and 5σ, 10,000 independent pilot samples, 100,000 estimation samples and two seeds. Its controls are smooth and supported away from the perspective horizon. It does not differentiate a hard shader boundary to construct a control.

Measured results are deliberately mixed. For cos(2π arg) immediately before `fract` in `sinQuadratic`, at (300,12), variance decreased by approximately 1,210×. At the same pixel, the smooth blend component of `zigzag` gained essentially nothing; a fixed coefficient of one would have increased variance by roughly 1,500×. The pilot correctly made that control nearly inactive. Several other cases lost once evaluation cost was included. The smooth-feature result is not a full-shader or rendering speedup.

I then tested the **original `sinQuadratic` shader's red channel**, including `fract` and lighting, at (300,12). The controls were generated from its smooth phase; the sampled source value agreed with the ordinary numeric backend. Four harmonics supplied eight jointly fitted sine/cosine controls. Across two seeds, variance fell from approximately 0.0481 to 0.00651, a **7.4× reduction**. Including derivative evaluation, control evaluation and pilot fitting, measured cost increased about 2.8–3.1× across the initial run and a rerun. Their ratio suggests **2.4–2.6× better sampling efficiency** at this test size. Random-number generation and the separate reference computation were excluded from both timed estimation paths. This is a one-pixel CPU experiment and an estimated equal-time advantage, not a measured frame speedup or a comparison against the existing analytic compiler. One harmonic reduced variance only 2.56× and lost after cost. The current evidence supports testing this further, not choosing it universally.

The four-harmonic controlled means were 0.38003295 and 0.38014364. A separate 500,000-sample reference gave 0.38002305; both discrepancies were within 0.31 combined estimated standard errors. Agreement with this noisy reference is a sanity check, not a proof of accuracy. The zero-mean identity supplies the mathematical justification under its stated assumptions.

The proposed research contribution is a compiler that chooses inexpensive, phase-informed integration identities and samples what remains, with joint dependence preserved. Both [program smoothing](https://yyuting.github.io/docs/eg_2018.html) and Stein control functionals have prior art. The possible contribution lies in the specific graphics construction, its cost, and demonstrated coverage of difficult cases. A limited literature check does not establish novelty.

## Hard edges fit the same identity, with a boundary term

Let φσ be the Gaussian density and n the outward normal of a sufficiently regular region R. The divergence theorem gives

E[1_R TσF] = ∫∂R φσ F·n dS.

Thus a masked control is not automatically zero-mean. Its boundary flux must be retained, or the field must vanish suitably on the boundary. In a two-dimensional pixel this can trade a bulk integral for a one-dimensional boundary integral plus a residual. Stationary points, nonsmooth boundaries, or expensive boundary geometry can make the trade unattractive; use a safe field or fallback.

A smaller first implementation can avoid boundary quadrature. For a smooth defining function r and R={r>0}, multiply F by η(r)=r²/(r²+δ²), δ>0. The field then vanishes on the boundary, so 1_R Tσ(ηF) has zero mean under the same regularity and tail assumptions. Include the derivative of η. The source residual retains the difficult boundary neighbourhood and all correlations. This construction is proposed here; it was not part of the supplied prototype measurements.

This is the deeper connection I would investigate: low combined frequencies, stationary phases and discontinuity boundaries are different places where bulk cancellation fails. Exact conditioning, quadratic phase integration and oscillatory controls can be alternative reductions of the same complete integral. That perspective suggests a compact decision system rather than a growing catalogue of independent smoothing rules.

## Answers to the five questions

**1. Correlated coverage.** For W~N(0,σ²), set D=1−iσ²q and

z(w) = (√D w/σ − iσβ/√D)/√2.

Then the normalized interval integral is

E[1{a≤W≤b} exp(i(βW+½qW²))]
= exp(−σ²β²/(2D)) [erf(z(b))−erf(z(a))] / (2√D).

Choose the square-root branch with positive real part. Multiply by √(2π)σ for the unnormalized integral in your question. In two dimensions, condition on one coordinate, intersect the intervals induced by the quadratic inequalities in the other, apply this formula and integrate the outer coordinate. Constant conditional phase factors and polynomial amplitude moments must be retained. A stable implementation needs scaled complementary-error/Faddeeva routines and care with close endpoints and tails; the displayed difference is an identity, not a numerical recipe. [NIST definitions](https://dlmf.nist.gov/7.2).

**2. FFT versus Filon.** First narrow the claim: after reciprocal-depth substitution, phases affine in surface coordinates become linear in reciprocal depth at fixed horizontal displacement. Nonlinear counts such as s² create v² terms. For the affine case, with s=A(x̄+X)v and t=Bv, integrating X gives

m(kₛ,kₜ;x̄) = ∫ f_V(v) exp(−2π²σ²A²kₛ²v²) exp(2πi(Akₛx̄+Bkₜ)v) dv,

f_V(v) = exp(−(1/v−d₀)²/(2σ²)) / (√(2π)σv²).

At a fixed row and kₛ, one continuous transform therefore serves **all horizontal pixels as well as all kₜ**. That is a more consequential reuse opportunity than choosing a quadrature rule for isolated recipes. Use a trusted adaptive/oscillatory reference for sparse queries; consider FFT/NUFFT when enough queries amortize construction. Bound domain truncation and sampling/interpolation error: the reciprocal density has algebraic tails, and the kₛ=0 case lacks the additional Gaussian decay in v. Smoothness alone does not make a finite FFT accurate.

The standalone conditioning experiment establishes accuracy at the tested points. It is not yet a speed result: one reproduced (240,5) run took about 368 ms at 400,000 outer samples, versus about 0.57 ms for a warm, biased compiler evaluation. These are single-machine probe timings, not robust benchmark statistics. Reuse and adaptive allocation must earn their cost.

**3. Horizon convention.** Match the published reference for the primary comparison. Report clipping separately if it is an intended rendering mode; it changes the integral. The local tests above do not establish behaviour at or across the horizon itself.

**4. Independence.** Call it an approximation. A maximum discrepancy on a finite benchmark is an empirical error measurement, not a bound over the shader family. For a mask M and real factor f, the discrepancy is Cov(M,f), bounded by √(p(1−p) Var f) when those quantities are valid. If f∈[a,b], the bound (b−a)p(1−p) also holds. An exact claim for a mixed term needs joint integration, proved independence, or another exact identity. Numerical quadrature error remains separate.

**5. Pilot size.** There is no universal fraction. Optimize total setup, pilot and estimation cost for a fixed error target. Begin with a small fixed control family, fit on independent data, report the covariance condition and reject controls whose expected benefit does not cover their cost. If using cross-fitting to recover pilot work, specify the estimator and validate its uncertainty calculation. Do not select and fit controls on the same final samples and silently reuse them as though the coefficients were fixed.

Two smaller corrections: Lagrange–Gauss reduction improves lattice conditioning but does not generally make a retained ellipse axis-aligned; retain an exact membership predicate. Curvature invalidates a constant-coefficient torus heat operator, but state-dependent diffusion can sometimes close if the state retains sufficient information. Neither observation yet supplies a general solver for the difficult rows.

## What I need from you to choose the next experiment

Please answer these three questions together:

1. What result would change the project's value: a real-time shader at a stated resolution and frame budget, an offline reference at a stated error and time budget, or a general compiler result? Name the hardware and primary error metric.
2. Does correctness mean the original source shader, or a declared local model? If source correctness is required, is an unbiased sampled residual acceptable, and what temporal noise is acceptable?
3. Nominate one indispensable hard case and a small held-out parameter range, including a case where you expect this proposal to fail. Freeze those before tuning the method.

I would first repair the identity collision and preserve the regression probes. Then compare ordinary sampling, the existing analytic model with a source-exact residual, and phase-informed Stein controls at equal total cost. Keep the winning method only where it wins, and include its selection cost. The breakthrough criterion is a better accuracy–time curve on the agreed shader family, with correctness intact. The theory should make that experiment simpler to build and easier to falsify.
