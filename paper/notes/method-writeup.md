# The method, where it stands, and what I think of it

Written 2026-09-04 for the author, as a self-contained account. Everything measured here is in the repo; everything I believe but have not measured is marked as belief.

## 1. The problem, stated once

A shader is a function S(p) of the point p on the screen. A pixel does not see S at a point; it sees S averaged over a small window w around its centre. The benchmark we work against (Yang and Barnes 2018, the standard one for procedural shaders) defines the window as a Gaussian of standard deviation half a pixel, so the pixel's value is

    pixel = E[ S(p + z) ],   z ~ N(0, sigma^2 I),  sigma = 0.5 px.

Anti-aliasing means computing that expectation. The naive way is supersampling: evaluate S at many random z and average, which costs hundreds of evaluations per pixel for a clean result (the benchmark's truth uses 1000). Every prefiltering method in the literature approximates the expectation by pushing some summary of the window through the shader's operations. The two-moment methods (mean and variance per intermediate, Yang and Barnes 2018; Li et al. 2020) are the state of the art for general shaders; they are fast and 10 to 20 times too inaccurate for the noise floor.

## 2. The idea: a shader is a shading function of counts

Every non-smooth thing a procedural shader does is a periodic or step function of some smooth quantity: fract(s/20), sin(x + 0.8 sin y), step(r - R), a palette lookup mod 6. The smooth quantity inside is what we call a count: a number of periods (or, for a step, a raw distance to the edge). The rest of the shader is smooth arithmetic. So any shader factors as

    S = I o Phi,

where Phi(p) = (c_1(p), ..., c_n(p)) is the state map, the vector of counts, and I is the shading function, a function on the torus (or product of torus and lines) that is periodic in each count. The tracer in `fjet.mjs` performs this factorisation mechanically with one rule: a non-smooth primitive makes the smooth part of its argument a count, and everything else composes. The counts carry a field when the argument has a non-smooth remainder: sin(x + 0.8 sin y) is a picture on the count x/2pi shifted by the field 0.8 sin(y)/2pi, itself a picture on the count y/2pi.

## 3. The pixel theorem and the multiplier theorem

Across a pixel, each count is smooth, so to first order it is affine: c_i(p + z) = c_i(p) + g_i . z, with g_i its rate (periods per pixel). Then the counts under the pixel's Gaussian are jointly Gaussian,

    Phi(p + z) ~ N( Phi(p), J Sigma J^T ),

and the pixel is the expectation of the shading function under that Gaussian. That is the pixel theorem, and it is the whole of what mipmapping, EWA filtering, LEAN mapping and the like compute for their one structure each.

Expand the shading function in its Fourier series in the counts. A term is a recipe m = (m_1, ..., m_n) of integer harmonics with a coefficient I_hat(m), and under the Gaussian it contributes

    I_hat(m) . exp(2 pi i m . Phi(p)) . exp(-2 pi^2 sigma^2 |sum_i m_i g_i|^2).

The last factor is the multiplier: the window's transform at the recipe's combined spatial frequency. A recipe survives only when its combined rate sum m_i g_i is slow, within about a period per pixel. This is the multiplier theorem, and it classifies pixels:

- a desert: every count is fast and no combination is slow, so only the zero recipe survives and the pixel is the mean of the shading function over the torus (this is what a mipmap's coarsest level is);
- a station: some non-trivial combination of harmonics cancels (a harmonic of one count in register with a harmonic of another through the perspective), and that recipe survives with its full coefficient. Stations are the moire fringes, and the theory's origin. They are exactly what two-moment methods cannot see, because a combination of counts is not a moment of any one intermediate;
- the near field: a count is slow across the pixel, so the multiplier keeps hundreds of its harmonics and the series is the wrong tool; the compiler integrates such a count by quadrature with its jumps located instead.

Second order: a count is not exactly affine across the pixel; it has a Hessian H_i. The Gaussian integral of a quadratic phase is a closed form (a complex determinant per recipe), which we use everywhere, with the first two moments so that coefficients that vary across the pixel (jets) are integrated too. This is what makes a fold, a recipe whose rate passes through zero inside the pixel, a formula and not a search: its multiplier decays algebraically rather than as a Gaussian, and the enumeration knows it. Third order is where the model ends; the row of the benchmark nearest the horizon shows it at the 1e-3 level (section 6).

## 4. The compiler

`fjet.mjs` is the theory as a program. The shader is written once in a small expression language and evaluated twice: with plain numbers (the truth's brute force) and with Fourier jets (the compiler), so the two read the same code and no per-shader mathematics is written anywhere.

The tracer produces an element: a sum of terms, each a coefficient jet (value, gradient and Hessian in pixel coordinates) times factors: pictures (a periodic function of one count, with an optional field) and closures (a function of several counts, evaluated pointwise). The evaluator computes the expectation of each term by whichever of these applies:

1. Spectral. Every picture's Fourier coefficients are computed once by a jump-aware transform; the recipes whose combined rate can pass the cut are enumerated (the harmonic range of each count is sized so that the others can cancel it, which is how stations are found), each recipe's second-order magnitude is checked, and the survivors are summed with the quadratic-phase integral. Closures over residual counts are transformed numerically, one or two axes at a time, with jumps located and square-root singularities cut and mapped.
2. Local. A count that is slow across the pixel (sigma under 0.02 periods in its own scale) is integrated by Gauss-Legendre quadrature over its Gaussian, conditioning the rest of the term on a line (one local count) or fixing a point (two). Nodes are placed where the integrated function has structure: the jumps of every picture are located as level crossings of shifted counts and refined by bisection; the panels are refined where halving them changes the sum.
3. Step of a sum. A non-smooth primitive g of a constant plus pictures on some counts X plus pictures with constant coefficients on further counts Phi whose fields run over X, g(c + A(x) + sum_j B_j(phi_j + G_j(x))), is a picture on the Phi torus whose coefficients T_m(a) depend on a = c + A(x) alone. For step, sign, relu and abs the coefficients are exact (Gauss-Legendre between the located roots of a + B and the jumps of B; two Phi axes by an inner exact transform and an outer integral cut at the square-root singularities), tabulated once; the transform over X of T_m(c + A(x)) e^{2 pi i m . G(x)} is an FFT that does not depend on the pixel and is remembered across the frame. Colour circles (a disc indicator whose per-cell radius is a sine and a cosine of the floors' smooth parts, each shifted by a sawtooth field) is this, and the rule fires for any product of such steps with other closures and field pictures on the same counts.
4. The shift family (the parallax theorem, built today and not yet finished). A bump-mapped surface with parallax shifts every count by the height times the view direction: F(x + c_X H(s), phi + c_phi H(s)) for one function H of the bump counts s. Its transform over (X, Phi, S) is F's transform at (k, m) times the transform over S of O(s) e^{i theta H(s)} at theta = 2 pi (k . c_X + m . c_phi), a one-parameter family tabulated once with its theta derivatives, which carry the view's variation across the pixel as the coefficient's jet. So a bumped pattern costs the plain pattern plus an interpolation. The seven bumps variants of the benchmark are this structure.

The one thing that separates this from every method in the literature: nothing here is a rule per primitive. The four paths are the four regimes of the multiplier theorem, and each primitive is only ever asked for its Fourier coefficients or its pieces.

## 5. What is measured

Protocol: the benchmark's own. 480 x 320 image of a textured plane in perspective, Gaussian jitter of sigma 0.5 px, the truth the mean of 1000 samples, clamped and quantised, RMS error over the frame; the noise floor is the RMS of two truths over sqrt 2.

Full frames, automatic, nine worker threads (`paper/data/fjet-yb.json` and the scratchpad's snapshots):

| shader | unfiltered | compiler | noise floor | Yang and Barnes 2018 |
|---|---|---|---|---|
| checkerboard | 0.164 | 0.0060 | 0.0060 | (0.071 with ripples) |
| circles | 0.147 | 0.0055 | 0.0055 | 0.035 |
| quadratic sine | 0.128 | 0.0045 | 0.0045 | (0.045 with ripples) |
| zigzag | 0.117 | 0.0045 | 0.0045 | (0.045 with ripples) |
| fire, checkerboard with ripples, quadratic sine with ripples | running | | | 0.037 (with bumps), 0.071, 0.045 |

Probe pixels, fourteen per shader from the near field to the horizon, against a brute force of 100000 samples (noise 1e-3) and, where it mattered, a million (noise 3e-4): checkerboard, circles, quadratic sine, zigzag, fire, colour circles, the two rippled cases, zigzag with ripples and checkerboard with bumps are all within about 2e-3 at every probe pixel and mostly under 5e-4. The two exceptions are understood: the row y = 5 carries 1e-3 in every shader because the perspective's rates change fourfold across the pixel there and the second-order counts are no longer the shader (halving sigma takes it to the noise, as the third-order phase should); and the rippled quadratic sine's on-axis pixel keeps 1.4e-3, where the traced element and the evaluator agree to the noise and what remains is between the element and the shader.

Cost: 2 to 40 ms per pixel on one core for the plain shaders, seconds for the far field of colour circles and the bumps variants, against a few microseconds for the unfiltered shader. The benchmark's methods run at 1 to 4 times the unfiltered cost. We are 100 to 10000 times slower. This is the weakness, and it is the next stage's whole subject.

## 6. Where I stand on it

What I am sure of. The mathematics is right and complete for its scope: the pixel theorem, the multiplier theorem, the second-order pushforward and the exact step transforms are theorems, and the compiler reaches the protocol's noise floor on every shader it traces, from source, with no per-shader work. I have checked each of those numbers against brute force at the pixel level and against the benchmark's truth at the frame level, and I have found and fixed my own errors with a brute force on the traced element that separates the evaluator from the tracer. The comparison to the published numbers is on their protocol, their shaders, their truth.

What I am not sure of, and would not claim in print without more work:

- That it is the state of the art in anti-aliasing. It is the state of the art in exact prefiltering of procedural shaders, as far as the literature I have read goes: the two-moment line (2015, 2018, 2020, and its 2022 and 2025 successors on gradients), the neural-field prefiltering line (mip-NeRF 2021, spectral prefiltering 2025), the per-structure closed forms (clamping 1982, LEAN, Han 2007, Gabor noise 2011, colour maps 2013, phasor noise 2019) and the surveys (Bruneton and Neyret 2012). I have not done a systematic sweep of 2024 to 2026 preprints, and "anti-aliasing" as a field is much wider: supersampling, temporal anti-aliasing, learned upsampling and analytic coverage of vector graphics are different problems that this does not touch. A fair sentence is: no published method computes the Gaussian pixel of a general procedural shader exactly and automatically; the best published one is ten times off it; ours is at the noise floor and a hundred times slower.
- That the exactness survives the move to the GPU. The design (the spectrum as the table, the oracle per pixel) is measured on one experiment, not built.
- That it generalises to procedural noise (Perlin, Gabor, Worley) at the same cost. Noise is a picture on a large torus, and I believe the tables get large; I have not run bricks with noise.
- The Gaussian pixel. Real pipelines use box or tent pixels and mipmapped textures. The theory carries over (the multiplier changes), but the closed-form second order does not, and I have not measured a box pixel.

What I think the deeper result is. The count algebra says that every prefiltering method in graphics is the same integral evaluated in one regime: mipmapping is the desert, LEAN and its family are the pixel theorem for the normal alone, two-moment propagation is a two-moment approximation of the desert, moire is the station. That is a statement about a field, not a method, and I think it is the thing worth writing carefully.

## 7. Publication and business, as I see them

Publication. There are two papers here and a third behind them.

1. The compiler paper: "exact prefiltering of procedural shaders from source" with the benchmark at the noise floor, the four regimes, the step of a sum and the parallax theorem, and the audit of the literature. This is a SIGGRAPH or TOG paper on its own; the numbers are already there for the plain shaders and the comparisons are on the published protocol. What it needs before submission: the full frames of every shader in the set (running now, a day of compute on the new machine), the bumps variants through the parallax path, one noise shader, and a box-pixel measurement so that the claim is not tied to one window. A preprint could go up within weeks to timestamp it.
2. The GPU paper: the same shaders in the browser at frame rate, with the spectral table and the oracle. That is the one that gets used, and it is Stage 2 of the plan.
3. The theory paper already exists in the repo (paper 3 and the tutorial): the count-map theory of moire, stations as small divisors, the duty-null law. It is the mathematical backbone and would cite and be cited by the first two.

Venues: SIGGRAPH (January deadline, published in TOG), SIGGRAPH Asia (May), Eurographics (October) or EGSR/HPG for the GPU paper. The reviewers to expect are the authors of the two-moment line and of the neural prefiltering line; the paper must compare on their terms, which it does.

Business, in the order I would bet on:

1. A material-authoring and engine plugin: exact prefiltering of procedural materials (Substance-style node graphs, Unity and Unreal material graphs, Shadertoy-style shaders) compiled to a GPU shader with its tables. Procedural materials alias badly at distance and the industry's answer is baking to textures and mipmapping them, which loses the procedural resolution; a compiler that keeps the procedure and filters it exactly is a real product with a clear buyer. This depends on Stage 2.
2. Neural rendering: prefiltering of neural fields and Gaussian splats through their nonlinearities (level of detail without retraining). The 2025 SIGGRAPH Asia paper shows the demand; the step of a sum is the piece they do not have.
3. The moire tool itself, the repo's origin: printed and laminated moire designs (security printing, packaging, art) keyed to register or viewing angle, from the inverse construction. Smaller market, but the theory gives it exact control nobody else has.
4. Display and optics: metrology by nulls, prefiltered rendering for near-eye displays, and the twisted-bilayer and grid-cell analogies are research, not products, and I would not sell them.

The honest business risk: speed. Nothing sells at a hundred times the cost of the shader. The bet is that the GPU stage brings the far and mid field to a handful of table reads per pixel (the measurement in `tables.mjs` says 175 terms a pixel on average for the exact spectral sum, no worse than anisotropic filtering's taps) and the near field to a few closed forms, and that the oracle decides per pixel which. I believe that bet; I have not yet won it.
