# Response to the integral-compiler review (September 5, 2026)

Written against the packaged revision `cb7c7e0` (the manifest's hashes match the tree I started from) and the changes described below, committed on top of it. Every probe was rerun here; the two Stein scripts were run unmodified.

## 1. What reproduces

All nine measurements of `moire-regression-probe.mjs` reproduce to the digit, including the four failures: coverage of the mask times $Z^2$ returned $0.4795$ for $0.9189$; the $10^{-14}$-scaled mask returned $0$ with no axis retained; the cubic step returned $1$; the two distinct fields traced together cancelled to $0$ for $-0.1068$, with `sameAxis: true` and identical field keys `0.000000*sin[sin0]`.

Both Stein probes reproduce exactly (the RNG is deterministic): the same eighteen variance gains in the smooth-feature run, from $1.00$ (zigzag at $(300,12)$) to $1{,}214$ (the quadratic feature at $(300,12)$), and the same full-shader gains, $2.56$ at one harmonic and $7.39$ and $7.40$ at four. My timings are $10$ to $25$ percent worse than the recorded ones because this machine is running a nine-thread frame in the background; the equal-time figures came out $0.65$ to $0.96$ at one harmonic and $2.38$ to $2.66$ at four, against your $0.76$ to $0.89$ and $2.38$ to $2.56$. The controlled means agree with the reference within the same $z$-scores you report.

## 2. What I changed, and what the probes say now

**Identity collision (contract 1), fixed.** Expression identity is now lossless: a count's key is its six jet components exactly, a field's signature carries every coefficient jet in full (real and imaginary parts, all six components, `toString` rather than `toPrecision`), closures built from elements inherit the lossless signature recursively, and the local path's closure key carries its coordinate exactly. The rounding survived only inside caches, where approximate similarity is what a cache wants. Probe 9 now returns $-0.10675282145782894$ against $-0.10675282145782905$. Across sixty-one benchmark probe pixels nothing changed and nothing slowed. One thing changed for the better: fire with bumps at $(100,120)$, which failed before, now runs, in $25$ s, to $7.8\times10^{-5}$ of a million samples. Its $(300,12)$ and $(400,60)$ pixels still stop at four residual axes; the merge of a field-carrying axis into a closure over its base axes, which your composition-operator note suggests, is the next compiler change after the ones below.

**Lost correlation in curved coverage (contract 2), fixed for the amplitude.** The coverage integral now carries the term's coefficient jet: in the Hessian's eigenframe the amplitude is a quadratic in the two coordinates, its Gaussian moments over each interval are closed form to order two, and $\mathbb E[c(z)\,p(\xi(z))]$ is integrated jointly. The probe returns $0.9188913$ against $0.9188914$ ($7\times10^{-8}$, the excursion grid's interpolation). What remains approximate, and is stated in the code, is the correlation between the mask and the term's *other* factors, pictures on other axes: they now see the constant $\mathbb E[c\,p]$. Your answer 1 gives the primitive that removes it, the interval integral of a quadratic phase through the complex error function, and I have not built it; see the asks below.

**Positive scaling (contract 2), fixed.** A step is folded to a constant only when the count's excursion over the trace reach ($6\sigma$, set by the harness from its $\sigma$) cannot reach zero, $|g|R + \tfrac12\|H\|R^2 < |s_0|$. That fold is exact for the model and invariant under positive scaling; the probe returns $0.4795$. An absolute flatness tolerance remains only for the smooth offset of a periodic picture, where the unit is the period and $10^{-12}$ of a period is meaningful.

**The cubic (contract 3), unchanged and intentional.** The model's answer is $1$; the source's is $\tfrac12$; nothing in the jet distinguishes them. I agree this needs provenance or a validity condition rather than another tolerance, and Section 4 has a measurement that makes the case sharper than the cubic does.

Both existing gates (`fjet-stationary.mjs`, `fjet-coverage.mjs`) pass after these changes.

## 3. The Stein controls, assessed

The formulas are right. I rederived $T_\sigma F$ for $F = \chi\,\nabla\theta\,\sin\theta/(|\nabla\theta|^2+\lambda)$ and for the harmonic-$k$ and sine variants, and the code matches term by term, cutoff derivative included. The unsuccessful cases are reported honestly and the pilot does what it should (the fixed-coefficient column shows what would have happened without it: $1{,}500\times$ worse on zigzag's blend).

Three things I would add to the reading.

- **Where the gain is large, the analytic answer is already free.** The $1{,}214\times$ case is $\cos(2\pi\,\mathrm{arg})$ at $(300,12)$, a smooth oscillation at $16$ periods a pixel in $x$ and $79$ in $y$. Its pixel mean is the multiplier of that recipe, which is zero to double precision, in closed form, at no cost. Your reference mean for the zigzag feature is $5\times10^{-4}$, noise. The controls remove an oscillation whose mean the multiplier theorem already reports; the sampling problem that needs help is the hard structure, where a smooth phase to differentiate is exactly what is missing, and where your own note says a boundary term or the $\eta$-masked field is needed. So the decisive test is not the smooth feature and not this pixel.
- **At this pixel the analytic route is the competitor, and it wins by orders of magnitude.** The compiler's value at $(300,12)$ is $0.380143$ in $3.7$ to $9$ ms (one recipe), $1.2\times10^{-4}$ from your $500{,}000$-sample reference, whose own standard error is $3.1\times10^{-4}$. To reach a standard error of $1.2\times10^{-4}$, plain sampling needs about $3.3$ million evaluations ($4$ s here), the four-harmonic controls about $450{,}000$ ($2$ s). The equal-time comparison you ask for therefore has to be run where the compiler is biased or absent: the horizon rows (bias $10^{-3}$ until exact conditioning lands) and fire with bumps at the two pixels that still fail. That is the experiment in Section 6.
- **The residual after $K$ harmonics decays as $1/K$ for a sawtooth,** since `fract`'s spectrum does; $7.4\times$ at $K=4$ should become roughly $2K$ at cost linear in $K$ (each harmonic is a cosine recurrence, cheap next to the jet evaluation). Worth measuring at $K = 8, 16$ to see whether the equal-time gain keeps growing or the jet cost caps it.

The cost is dominated by evaluating the whole shader with jets at every sample ($3\times$ the numeric cost). A phase-only emitter would cut that, and for this shader the phase is most of the computation, so I would not expect more than a factor of two from it.

## 4. The comparison you asked for, run: the analytic model as a control variate

I ran the third arm of your proposed comparison, our model with a source-exact residual, at the same pixel with the same seeds (`author-probes/model-control-probe.mjs`): $q(z)$ is the traced element's point value at displacement $z$, $\mathbb E q$ the compiler's expectation, $S(z)$ the original shader. Result: $\mathrm{Var}\,S = 0.0481$, $\mathrm{Var}(S-q) = 0.0418$, a variance gain of $1.2$ at $2$ to $3$ times the cost. It loses. The estimate $\mathbb E q + \overline{S-q}$ agrees with the reference within noise, so the construction is unbiased; it is just not useful.

The reason is the measurement I would put next to your cubic probe (`author-probes/count-model-error-probe.mjs`). The `fract` count at $(300,12)$ has rate $(16,-79)$ periods a pixel. Along $x$ the centre-expanded model is exact, the perspective being affine there. Along $y$ its error is $0.014$ periods at $0.25$ px, $0.11$ at $0.5$ px, $0.37$ at $0.75$, $0.85$ at $1$ px and $2.7$ at $1.5$ px: the perspective's cubic term. The model's point values correlate with the source at $0.57$. And yet the compiler's mean is within $1.2\times10^{-4}$, because the recipes the model misplaces are the fast ones the multiplier kills, and the slow structure (the shading) is modelled well. So the same object is a good model of the mean and a poor model of the point values, at the same pixel. That is your contract 3 in its practical form: source correctness for the mean can hold while the model is useless as a control, and no per-pixel error bound of the model implies either.

Two consequences I draw. Means should come from the centre model where a validity probe passes; controls should come from per-sample exact derivatives, which is what your jet backend does and why your controls work where our model does not. And the validity probe itself is cheap: the harness has both backends, and comparing the model's point value with the source at four to eight displacements per pixel costs less than one sample of the pilot. I would make that the compiler's selector between "analytic mean" and "sample with controls", and gate it on the cubic.

## 5. Corrections to my earlier statements

Lagrange–Gauss reduction does not make the retained ellipse axis-aligned; the reduced basis bounds the angle, so a box in it over-covers the ellipse by a bounded factor, and the exact membership predicate stays. The multiplier-weighted remainder was withdrawn in the previous letter and stays withdrawn. "A stationary count suppresses none of its harmonics" was wrong; it suppresses them as $k^{-1/2}$.

## 6. Proposed next experiment

A fixed-budget comparison on the pixels where the analytic route is biased or absent, with a converged reference at each:

| pixel | why |
|---|---|
| fire with bumps $(300,12)$, $(400,60)$ | the compiler stops (four residual axes); the palette's `mod` edges are hard |
| fire with bumps $(100,120)$ | the compiler now runs; a control on the same pixel |
| circles $(240,5)$ and $(300,12)$ | the compiler's horizon bias, $1.6\times10^{-3}$ and $2.7\times10^{-4}$, until exact conditioning lands |
| checkerboard $(240,60)$ | hard edges only; where I expect the controls to gain nothing without the boundary term |

Arms: plain Gaussian sampling; your controls at $K = 1, 4, 8, 16$ from every smooth phase the shader has (fire has two, the palette argument and the modulation's sine), with the $\eta$-masked field on the `mod` boundaries as a fifth arm if you build it; the compiler's mean where it exists, plus the validity probe as the selector. Reference: $10^7$ unclamped samples per pixel, run on the author's new workstation. Report error against total cost including per-sample jets and the pilot, and the selector's cost.

## 7. Answers to your three questions

These are my proposals; Neo decides.

**Hardware, budget, metric.** Two targets in order. First, an offline reference on the new workstation (a many-core CPU and a current GPU): a $480\times320$ frame of any of the twelve benchmark shaders in under $60$ s on sixteen threads, unclamped linear-light RMS at or below $10^{-4}$ against a $10^7$-sample reference at probe pixels and at or below the published floor over the frame, with the maximum pixel error reported. Second, real time for the plain shaders: $1920\times1080$ within $4$ ms of GPU time, RMS at or below $2\times10^{-3}$ (half an $8$-bit step), temporal RMS at rest at or below $10^{-3}$. The metric is unclamped RMS with a maximum and a temporal term, never PSNR of quantised frames.

**Correctness.** The original source shader, always; a declared model is an implementation detail with a validity condition and a measured error. A sampled residual is acceptable offline when it is unbiased and its noise sits under the $10^{-4}$ target at the budget, and in real time only under the temporal figure above, which is stricter than a temporal anti-aliaser needs to be.

**The hard case and the frozen range.** Fire with bumps at $(300,12)$, $(400,60)$ and $(100,120)$, with bump amplitude and parallax height each swept over $[0.5, 2]\times$ their published values and time in $\{0, 0.37, 1.1\}$; the horizon band $y \in [4, 12]$ of circles and checkerboard for the cubic error; checkerboard $(240,60)$ as the case where I expect the controls to fail. Frozen before anything is tuned. The criterion: on the fire pixels, unbiased against the $10^7$ reference and at least three times better than plain sampling at equal total cost, or the direction is not worth pursuing there.

## 8. What I would ask you to build

You can help most where the machinery is yours or the maths is in your note.

1. **Run the Section 6 comparison for the control arms** (fire with bumps, $K$ up to $16$, the $\eta$-masked boundary field). The probe scripts already read the shaders; fire has two smooth phases to extract.
2. **The correlated-coverage primitive.** A tested implementation of $\int_a^b e^{-w^2/2\sigma^2}e^{i(\beta w+\frac12 qw^2)}dw$ from your answer 1, with a scaled Faddeeva routine and a gate against quadrature, as a module `coverageExpect` can call. That removes the last stated approximation in the curved-edge path.
3. **The row-shared reciprocal-depth transform.** A prototype of $m(k_s,k_t;\bar x)$ for one row ($y = 5$) of circles with the error bounds you name (tails of $f_V$, the $k_s = 0$ case), checked against `fjet-exacty.mjs`. If it holds, it is the compiler's horizon path.
4. **The frozen held-out family.** The sweeps and the small random grammar with its exclusion rules, written by you rather than by the compiler's authors.
5. **The validity probe's statistic.** How many source evaluations per pixel and what test decides that the model is invalid, with the cubic as the gate.

Neo's new machine is being set up; the $10^7$ references and the frame-level runs belong there.
