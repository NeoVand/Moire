# Plan: pictures on tori as the semantics of an anti-aliasing compiler

The aim is to move anti-aliasing of procedural shading from approximation to computation, with a theory that is short enough to state on a page, a compiler that follows from the theory with one rule, and demonstrations that a graphics audience cannot argue with: a public benchmark at its noise floor, automatically, and the same shaders running exactly filtered in real time in a browser. This note is the plan, the design, and the ledger of what each stage must show.

## The thesis in one paragraph

A shader is a program from pixel position to colour. Trace it and every intermediate is one of two things: a smooth function of position, or a non-smooth primitive (fract, mod, floor, sin, cos, step, sign, abs, max, min, comparisons) applied to something. The theory of the third pattern says what the second kind is: the smooth argument of a non-smooth primitive is a *count*, and everything computed from it is a *picture on the torus* of the counts so far. So any shader is F(c₁(z), …, c_K(z); p₁(z), …, p_M(z)), periodic in K counts and smooth in M parameters, and the anti-aliased pixel is E[F] under the pushforward of the pixel's Gaussian through the counts and parameters: the pixel theorem of `antialiasing.md`. Nothing in that sentence is an approximation rule. The current state of the art (Yang and Barnes 2018) propagates a mean and a variance through every operation with a rule per operation and a genetic search to choose among them; this replaces the rules by one fact about what the intermediates are, and the search by an arithmetic that says in advance which recipes are slow.

## The theory to write (paper 4, "Fourier jets")

1. **Fourier jets.** A *jet* is a value with its gradient and Hessian in pixel coordinates (second-order automatic differentiation). A *Fourier jet* is a finite sum Σ_k a_k(z) e^{2πi k·c(z)} with recipes k ∈ ℤ^K, coefficient jets a_k and count jets c_j. The Fourier jets over a set of counts form an algebra: closed under sums, products (recipes add, coefficients multiply), smooth functions of the count-free part (jet composition), and periodic functions of counts (by expansion). Non-smooth primitives extend the count set: fract(s + P) with s smooth and P periodic makes s a new count and the result a picture on the enlarged torus.
2. **The pixel functional.** For a Gaussian pixel of covariance Σ, E[a(z) e^{iφ(z)}] with a quadratic jet a and a quadratic phase φ is closed form: the quadratic-phase Gaussian integral I₀ = det(I − iΣQ)^{−1/2} exp(−½ bᵀ(Σ⁻¹ − iQ)⁻¹b) and its first two moments I₁ = iM⁻¹b I₀, I₂ = (M⁻¹ − M⁻¹bbᵀM⁻¹) I₀. So the pixel functional on Fourier jets is explicit, exact to third order in the counts' curvature, and its cost is the number of recipes with non-negligible coefficient times multiplier: the slow recipes, enumerable before any term is computed (the oracle).
3. **Modes per axis.** Each count has a pixel-sigma σ_c = σ|∇c|. Spectral mode (σ_c above a threshold): the axis is expanded and multiplied. Local mode (below): the count is nearly constant across the pixel, the picture is piecewise smooth on the reach, and the axis is integrated by quadrature with its jumps located; products with spectral axes are conditioned. Edges (steps of smooth arguments) are always local. This is the trichotomy of pixels made operational, and it is why the near field and the far field are free.
4. **Shaded pictures and tables.** The observer theorem says shading composes into the picture: the object to filter is N∘I, never N(E I). A picture on a torus of one or two counts, shaded, has a *toroidal mipmap*: its Gaussian blurs at a ladder of widths on the wrapped torus. The pixel value is that table read at the pushforward footprint, anisotropy by taps along the footprint's major axis, exactly as hardware texture filtering does, on the right torus with the right picture. That is the speed path and it reuses the industry's hardware.
5. **Time.** A shutter is a third pixel dimension. Counts have time derivatives (optical flow of the pattern); the multiplier is at the spatio-temporal rate; the exposure theorem of the paper says which recipes an accumulation keeps. Exact motion blur of procedural content falls out, and temporal anti-aliasing's ghosting is the fold rung in (x, y, t): a count whose jet does not exist across a disocclusion.
6. **Sampling.** Where no formula applies (folds, high-dimensional tori beyond the tables), the sampling half of the theory places samples: stations of the sampler against the content are the aliases, the desert is the placement that has none.

## The compiler (Stage 1: CPU, exact)

A small expression language in JavaScript, the same shape as theirs (their shaders port line for line): constants, pixel coordinates, arithmetic, smooth functions, and the non-smooth primitives. Tracing a shader builds elements:

- A **term** is a coefficient jet times a product of single-axis periodic closures, one per count it touches, and at most one multi-axis closure where a non-smooth primitive was applied to a smooth part plus an existing picture (fract(q + 0.2 sin ψ) is one).
- An **element** is a sum of terms. Sums concatenate. Products distribute, closures on the same axis multiply. A smooth unary on a single-term single-axis element composes the closure; a polynomial (integer power) distributes; a non-polynomial smooth function of a multi-term element collapses it to one multi-axis closure. A non-smooth primitive on an element with a smooth part makes that part a new axis.
- The **evaluator**, per pixel: count jets and parameter jets by automatic differentiation; a mode per axis from σ_c; spectral axes expanded by a numerical transform of their closures (cached when the closure has no pixel-dependent parameters, which is most of them), the recipe lattice enumerated in the ellipse of slow recipes, each term's pixel functional in closed form with curvature; local axes integrated by jump-aware quadrature with the spectral part conditioned; the output assembled.

What Stage 1 must show: the five hand-derived cases of `benchmark-yb.md` reproduced automatically to the same noise-floor numbers, then the remaining shaders of the benchmark (zigzag, fire, colour circles, bricks with their Gabor noise) and the parallax variants, all automatic, all at the floor. That is the whole 21-shader benchmark from one rule.

## Speed (Stage 2)

The compiler emits three things per shader: the oracle (term count per pixel from the jets and the pictures' spectra), tables for the pictures of one and two counts, and the fallback. The CPU frontier is measured as in `benchmark-yb.md`; then a WebGPU emitter puts the same shaders in the tool, exact, at frame rate, with a comparison slider against point sampling and supersampling. The claim to make: exact filtering of procedural materials at the cost of texture lookups.

**Which table (measured, `paper/tools/exp/tables.mjs`, `paper/data/tables.json`).** The first plan said toroidal mipmaps: the picture blurred isotropically at a ladder of widths, read at the pixel's count covariance with taps along the major axis, as hardware anisotropic filtering does. Measured on the benchmark's plane for the checkerboard and the circles, over the 26122 pixels whose minor width is at least 0.02 periods (the rest are local and no table's business): taps spaced 1.5 minor widths apart, so that the minor blur hides the comb of taps, reproduce the exact spectral sum to 6.6e-4 RMS (5e-3 worst), but need 108 lookups a pixel on average, four times the anisotropy ratio, which reaches 50 at the horizon. Capped at 16 taps by raising the minor width, as hardware does, the error is 5.7e-2 RMS on the checkerboard and 4.0e-2 on the circles, worst 0.4: hardware anisotropic filtering cannot reach this benchmark's floor on these pixels, whatever the picture. The exact sum over the same pixels needs 175 recipes a pixel on average, 939 at most, no more than the taps, and it is exact. So the table to put on the GPU is the spectrum: a texture of the picture's Fourier coefficients, read at the lattice points inside the multiplier's ellipse, each read an exp and a cosine. The spatial mipmap has its place where the anisotropy is mild (the mid field, fewer than 16 taps) and none where it is not; the spectral table has no such limit and the oracle is its term count. The near field stays quadrature, which the compiler already does in a few closed forms per pixel.

## Time (Stage 3)

Their shaders animate. The compiler's jets gain a time component, the pixel a shutter, and the benchmark a motion-blurred truth. The demonstration is the exposure theorem on a moving pattern: the accumulated frame is what the theory says a shutter keeps, and a rippled surface under motion blur is exact where temporal anti-aliasing smears.

## What would make it a breakthrough, honestly

Not the theorems, which are elementary. The combination: one rule replacing a rulebook, a benchmark at its floor automatically, hardware-speed filtering by reusing mipmaps on the right torus, and motion blur for free from the same jets. If Stage 1 and Stage 2 both land, the method is better than the state of the art on both axes it is measured on, and general. If only Stage 1 lands, it is a strong paper. The risks, in order: shaders whose count set is large (fire) making per-pixel transforms expensive, which the product-of-single-axis representation and caching are designed to prevent; smooth functions of multi-axis pictures forcing large transforms, which should be rare; and the tables' accuracy under strong anisotropy, which is the known EWA trade and can be measured.

## Ledger of Stage 1 (what the compiler had to learn)

Each of these was a wrong number at a probe pixel, and each is the theory, not a patch.

- A count's harmonic range is set by the slowest rate its multiples can reach with the other counts' help, not by its own rate: the quadratic sine at (240,20) has the sawtooth's fifth harmonic in register with the sine field's first through the perspective, a station, and a range of two harmonics missed it by 9e-3.
- The family of that station has a stationary point inside the pixel, a fold, so its multiples decay algebraically; the pruning uses the second-order magnitude of the quadratic-phase integral, which is exact, and a curvature budget where the recipe is not yet complete.
- Two local axes are evaluated at the point they fix, never through a truncated series; a second local axis has its jumps located with the first fixed; the first axis's nodes are placed on the integrated function along the second, with its own jumps located and panels refined where halving changes the sum, because an edge whose position moves with a field along the second axis makes that function steep but continuous.
- An axis slow along the conditioning line is integrated pointwise along it. Freezing it to its value at the line's centre cost 5e-2 at one pixel of the quadratic sine.
- One axis per count: sine and cosine of one argument, relu and step of one argument; a count that is an integer multiple of an existing one is the same torus, and the two axes of the palette lookup (argument modulo 8, its fractional part) otherwise make an exact station and a million recipes.
- An edge whose argument carries a field is periodised over the field's amplitude, and is a local axis in raw units when the smooth part's reach is small against that amplitude: the specular highlight on a rippled surface.
- A count at its stationary point (rate zero, curvature not) is frozen at its value; a sum of pictures on one axis with constant coefficients is one picture; a composition whose coefficients vary across the pixel is a jet-valued closure.

Open: colour circles. Its per-cell radius is 0.1 sin(xf + yf) + 0.1 cos(xf - yf) with xf = floor(s/d): the floor's smooth part is a third and fourth count, (s + t)/(2 pi d) and (s - t)/(2 pi d), entering the disc's indicator only through shifted coordinates. Near and mid field they are local and the point evaluation handles them. Far field the four-axis closure's transform factorises: for each harmonic pair (m1, m2) of the two slow counts, the transform over the angle variables of the indicator is a function of the radius alone, tabulated once, and what remains is a two-axis transform over (s, t) with a smooth kernel; the slow recipes are a desert (the rates are in the ratio pi) and few. To build.

## Order of work

1. Jets and the expression language; trace their checkerboard.
2. Elements and the pixel functional; reproduce the checkerboard number.
3. Circles, quadratic sine; then the ripples variants through the same code.
4. The remaining shaders; the automatic benchmark table.
5. Tables and the oracle on the CPU; the frontier.
6. WebGPU emitter in the tool; the real-time demo.
7. Time.
8. The paper.
