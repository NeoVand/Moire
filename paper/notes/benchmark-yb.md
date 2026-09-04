# The count-map method on the Yang and Barnes shader benchmark

Yang and Barnes, *Approximate Program Smoothing Using Mean-Variance Statistics, with Application to Procedural Shader Bandlimiting* (Eurographics 2018), is the nearest thing to a public benchmark for the problem the pixel theorem of `antialiasing.md` addresses: filter a procedural shader analytically, compare against a heavily supersampled truth, report error and time. Their code is public under MIT, so their protocol can be rebuilt exactly, and `paper/tools/exp/yb.mjs` does that and runs the count-map method against it. Every number here is from that script; `paper/data/yb.json` holds them and the gates.

## The protocol, rebuilt from their code

A 480 by 320 frame. Pixel coordinates are the integers. The plane geometry with camera path 1 at time 0: the ray through pixel (x, y) is (x − 240, y + 1, 240), rotated to (−(x − 240), −240, −(y + 1)), from the origin (0, 0, 50), and it hits the plane z = 0 at s = −50(x − 240)/(y + 1), t = −12000/(y + 1). The texture coordinate is (s, t), the normal (0, 0, 1), the light (0.228, 0.608, 0.760), the viewer direction the unit vector from the hit point back to the camera. Row 0 is the far horizon; the checkerboard's moiré zone is rows 20 to 60.

Ground truth is the mean of 1000 samples of the shader, each jittered by a Gaussian of sigma 0.5 pixel in x and y. Values are clamped to [0, 1] and quantised to eight bits; the error is the RMS over pixels and channels. Their L2 error, in the figures' units, is that RMS. Time is reported relative to the unfiltered shader.

The reproduction is checked against their published unfiltered errors, which are the one number in their tables that depends only on the scene and the shader:

| case | published, no anti-aliasing | rebuilt |
|---|---|---|
| circles, no parallax | 0.148 | 0.1474 |
| checkerboard with ripples | 0.194 | 0.1937 |
| quadratic sine with ripples | 0.184 | 0.1832 |

Three decimals on all three, so the comparison below is against their numbers and not a guess at them. Their headline checkerboard and quadratic-sine figures are for the "with ripples" variants, a rippled normal map (height sin(3r)/3 with r the distance on the plane) with a parallax offset of the texture coordinate by the height times the viewer direction. Only bricks and circles are published without parallax.

One more quantity matters: the protocol's own noise floor. A 1000-sample truth is itself an estimate, and a perfect filter scores its noise, not zero. The script renders two independent truths and reports their RMS difference over root two as the floor.

## The method, per case

Each shader is written as a picture composed with counts, and the pixel's value is the shader's expectation under the pushforward Gaussian, computed by whichever route is cheap where the pixel sits.

- **Checkerboard.** chk = ½ + 2 (sq(u) − ½)(sq(v) − ½) with u = s/20, v = t/20, and sq − ½ has odd harmonics only, so E[chk] = ½ − (4/π²) Σ_{k, l odd} cos(2π(kμ_u + lμ_v)) w_kl /(kl). Far and mid field: that sum, the Gaussian weight and the phase advanced by recurrences so a term is a handful of flops, the second-order pushforward (a closed-form complex 2 by 2 per term) where the curvature term times the harmonic index exceeds 0.02. Near the camera: the joint probability of the two half-waves under the bivariate normal, by Gauss–Legendre panels no wider than two sigma over the conditional, and no integral at all when no edge lies in the window, which is most pixels.
- **Circles.** The disc indicator's coefficients are a jinc, (πr²)·2J₁(2πrρ)/(2πrρ) with the cell's sign, tabulated once. Same two routes; the near-field integral is over the disc's chords.
- **Quadratic sine.** w = fract(φ) with φ = q + 0.2 sin ψ, q a quadratic count (a Hessian of its own, not only the perspective's) and ψ = s + t + 55 a second count carrying the field. The sawtooth is ½ + Σ_{k≠0} (i/2πk) e^{2πikφ}, and by Jacobi–Anger e^{2πik·0.2 sin ψ} = Σ_m J_m(0.4πk) e^{imψ}, so the picture lives on a 2-torus and each (k, m) term has its own rate 2πk∇q + m∇ψ. Where the field is slow across the pixel it is folded into the count; where the count itself is slow (near the camera) the floor's expectation is a short erf sum. On the axis, where ∇q vanishes, the second-order term is the only decay, and the sum is long.
- **Checkerboard with ripples.** A picture on the 3-torus (u, v, θ) with θ = 3r. The lighting and the highlight are even periodic functions of θ (they depend on cos θ only), expanded per pixel in cosine harmonics from 64 samples. The parallax offset u + a sin θ couples the counts through Bessel factors J₀ to J₄. Every (k, l, N) term is pushed through the pixel at its rate 2π(k∇u + l∇v) + N∇θ, the surviving (k, l) for a given N lying in an ellipse around the point where that rate vanishes, which is the station arithmetic of the paper made into an enumeration. Near the camera the ripple is slow and the checker's direct route is integrated over θ by quadrature.
- **Quadratic sine with ripples.** The same on the 3-torus (q, ψ, θ), with the parallax offset now a field on the sawtooth count of amplitude up to a whole cycle off axis, expanded by Jacobi–Anger twice. In the mid field the ripple and the field are nearly collinear, so conditioning on θ makes ψ slow, and the quadrature route with the one-dimensional conditional count applies up to a ripple sigma of 1.8 radians. That observation took the frame from 214 s to 16 s.

## Results

Ground truth of 1000 samples, RMS in [0, 1], time relative to the unfiltered shader on the same machine and in the same language (JavaScript, one core). Published numbers are from their Figures 1 and 5; "MSAA" in their column is their multisample result at the stated relative time, and in ours it is Gaussian-jittered supersampling with the stated sample count.

| case | no AA | MSAA 4 (ours) | MSAA 16 (ours) | Dorn 2015 (published) | Yang and Barnes (published) | count-map | noise floor | count-map time |
|---|---|---|---|---|---|---|---|---|
| checkerboard | 0.164 | 0.095 | 0.048 | | | **0.0060** | 0.0060 | 72× |
| quadratic sine | 0.128 | 0.072 | 0.036 | | | **0.0046** | 0.0045 | 730× |
| circles | 0.147 | 0.087 | 0.044 | 0.063 | 0.035 at 4× | **0.0057** | 0.0055 | 410× |
| checkerboard, ripples | 0.194 | 0.118 | 0.059 | 0.102 | 0.071 at 2× | **0.0075** | 0.0074 | 407× |
| quadratic sine, ripples | 0.183 | 0.112 | 0.057 | 0.094 | 0.045 at 2× | **0.0072** | 0.0072 | 1051× |

On every case the count-map error equals the protocol's noise floor to the third decimal: the method is exact to within the truth's own noise, and the residual is the truth's, not ours. Against the published state of the art the error is 6.1 times lower on circles, 9.5 times lower on the rippled checkerboard and 6.3 times lower on the rippled quadratic sine. Against supersampling at 16 samples it is 8 times lower.

**Time is the honest weakness.** Their filter costs two to four times a shader of a few flops; ours costs hundreds of times, because an exact expectation is a sum over the slow recipes and in the mid field, where every count is marginally resolved, there are hundreds of them per pixel. The fair comparison is equal error: supersampling would need about 750 samples to reach 0.006 on the checkerboard, 665 on circles, 670 on the rippled checkerboard and 640 on the rippled quadratic sine, so at the error we actually reach the count-map method is cheaper than the brute force on four cases and at parity on the fifth, and no approximation in the literature reaches that error at all. Where the time goes, by regime:

- Far field: one to ten terms per pixel. Free.
- Near field: no integral for most pixels, one or two error functions at an edge, a short quadrature at a corner. About 0.3 microseconds a pixel.
- Mid field: the sums. Most of the frame's time, on a fifth of its pixels.

Three things would change the picture. The sums are embarrassingly parallel and are exp, cos and sin, which is what a GPU is for. The term count can be traded for error through one threshold (the script's `--cut`). And the mid field is where a hybrid samples rather than sums, with the theory saying which pixels those are before any shading is done: the next section measures that.

## The hybrid: the regime map with a term budget

The per-pixel term count is known before any term is computed: it is the number of lattice points in the ellipse of surviving recipes (for the 3-torus cases, times the ripple harmonics that survive), from the Jacobian and the material's spectrum alone. So the method can decide per pixel, in advance, between the exact sum and a fallback. `yb.mjs --budget=B --samples=N` does that: where the estimate exceeds B the pixel is instead the mean of N stratified Gaussian samples of the shader (n by n strata in radius and angle, rotated per pixel by a hash), and everywhere else the exact routes run, which in the far field and the near field are nearly free. `--sweep` runs a ladder of budgets against supersampling at 4, 16, 64 and 256 samples on the same truth, and `yb-pareto.mjs` draws `figures/yb-pareto.svg`.

Error and time relative to the unfiltered shader, 1000-sample truth, one JavaScript core. "MSAA at equal time" is read off the supersampling curve at the hybrid's time.

| case | hybrid setting | error | time | MSAA at equal time | published state of the art |
|---|---|---|---|---|---|
| checkerboard | budget 100, 36 samples | 0.0078 | 25× | about 0.065 | |
| checkerboard | budget 50, 36 samples | 0.0087 | 21× | about 0.07 | |
| quadratic sine | budget 100, 36 samples | 0.0072 | 42× | 0.034 | |
| quadratic sine | budget 50, 16 samples | 0.014 | 29× | 0.045 | |
| circles | budget 100, 36 samples | 0.0088 | 36× | 0.046 | 0.035 at 4× |
| circles | budget 25, 9 samples | 0.030 | 26× | 0.06 | |
| checkerboard, ripples | budget 400, 64 samples | 0.012 | 98× | 0.027 | 0.071 at 2× |
| checkerboard, ripples | budget 100, 36 samples | 0.016 | 53× | 0.040 | |
| quadratic sine, ripples | budget 100, 36 samples | 0.017 | 45× | 0.040 | 0.045 at 2× |
| quadratic sine, ripples | budget 50, 16 samples | 0.029 | 25× | 0.055 | |

Three readings of the table.

- **Against supersampling the hybrid is two to seven times better in error at equal time on every case**, and the gap is largest where the exact routes cover most of the frame (the plain checkerboard: 0.008 against 0.065 at 25×). It is smallest on the rippled cases, where most pixels end up sampled because the rippled shader has three marginally resolved counts through the whole mid field and its lighting harmonics cost about a hundred shader evaluations per exact pixel.
- **Against the published approximations the hybrid reaches their error at five to twenty times their time, and two to four times lower error at ten to twenty-five times.** There is no point on our curve below about 18×, because the exact routes' fixed per-pixel work (the count geometry, the early-outs, a few error functions) already costs that much against a five-flop shader.
- **Where the theory acts in the hybrid is the decision, not the samples.** The sampler is ordinary stratified supersampling. What makes the curve is knowing, per pixel and before shading, that the far field is its mean, that the near field is an error function or nothing, and that only the mid field needs samples. That is the oracle of `antialiasing.md` doing real work, and it is the part that transfers to any renderer.

What did not work, so it is not tried again: a Laplace closed form for the highlight's Gaussian mean (the lobe is clipped and rarely one Gaussian peak; errors up to 1.2 against 1e-9 for the 64-sample harmonics), and nine Gauss–Hermite nodes for the same mean (the peak is 0.1 to 0.3 radians wide and the nodes miss it). The highlight's mean under the pixel genuinely needs the lighting sampled densely in the ripple angle, and that is the time floor of the rippled cases.

## Images

`paper/figures/yb-pareto.svg`: error against time, one panel per case, the count-map curve from the hybrid's cheapest setting to the exact sum, the supersampling curve, the truth's noise floor, and the published points.



`paper/figures/yb-<case>-strip.png`: truth, unfiltered, MSAA 4, count-map, with the moiré zone (rows 16 to 76, columns 160 to 320) magnified three times under each.

## What this shows, and what it does not

It shows that the pixel theorem is not only a statement but a filter that reaches the noise floor of a published benchmark on every case it was tried on, including two with a rippled normal map, a nonlinear lighting model and a parallax coupling, which is the class of shader the previous work found hardest. It shows the station arithmetic doing real work: the enumeration of surviving (k, l, N) terms around the zero of the combined rate is what makes the 3-torus sums finite.

It does not show a fast filter. The exact expectation is expensive exactly where the picture has the most slow recipes, and the benchmark's time axis is against a shader too cheap to compete with by any exact method on a CPU. It also does not cover their bricks, fire, zigzag and colour-circles shaders, nor the sphere and hyperboloid geometries, nor animation. Bricks needs their Gabor noise, whose filtered kernel is closed form and would fit; fire and zigzag are sums of sinusoids of counts and would fit as the quadratic sine does; the colour circles are aperiodic and would need the disc search of the fold rung.
