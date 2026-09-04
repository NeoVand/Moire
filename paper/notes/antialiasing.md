# Aliasing is moiré: the count-map theory of anti-aliasing

A working note. What the third-pattern theory says about anti-aliasing when it is read as a theory of rendering, what of that is already known under other names, what is new, and what `paper/tools/exp/aa.mjs` measures. Every number below is from that script, which gates them.

## The one statement

A renderer computes an image $S(x)$ on the screen. Everything that varies across a pixel does so through a handful of *inputs*: texture coordinates, signed distances to edges, normals, depths. Write $Z(x)$ for the vector of inputs at screen position $x$ and $f$ for the shader, so that $S = f \circ Z$. That is the factorisation $S = I \circ \Phi$ of the paper with the state map allowed to land in any space, not only a torus: a texture coordinate lives on a torus, a signed distance on a line, a normal on a sphere.

The pixel is a window $W$, and for this note a Gaussian of covariance $\Sigma$ in screen units, half a pixel wide. Across the window each input is affine to first order, $Z(p + z) = Z(p) + J z + O(|z|^2)$. A Gaussian pushed through an affine map is a Gaussian. So:

> **The pixel theorem.** The filtered pixel value is the expectation of the shader under a Gaussian in input space,
> $$ (S * W)(p) \;=\; \mathbb{E}\big[f(Z^\*)\big] + R, \qquad Z^\* \sim \mathcal N\big(Z(p),\; J \Sigma J^{T}\big), $$
> with $|R|$ bounded by the curvature of the inputs times the window's second moment (the remainder of the multiplier theorem, paper Theorem 2). The pixel is a Gaussian in input space; anti-aliasing is computing a Gaussian expectation there.

Every anti-aliasing technique is a way of computing that expectation for some structure of $f$ and $Z$:

| Structure | The expectation | Known as |
|---|---|---|
| $Z$ on a torus, $f$ periodic | $\sum_k \hat f(k)\, e^{2\pi i k\cdot Z(p)}\, e^{-2\pi^2 k^T J\Sigma J^T k}$: each Fourier term times the Gaussian's characteristic function at its own screen rate | EWA and mipmapping approximate it on a pyramid; the tool's pooled view computes it |
| $Z$ a signed distance, $f$ a step | $\Phi_{\mathcal N}\!\big(Z(p)/\sqrt{\nabla Z^T \Sigma \nabla Z}\big)$, an error function | analytic edge anti-aliasing, distance-field text, `fwidth` |
| $f$ a polynomial of degree $n$ in $Z$ | the Gaussian's moments to order $n$ (Isserlis) | LEAN and its successors, at order two |
| $f$ two-valued | affine in the coverage, so *any* pointwise nonlinearity commutes with the filter | alpha coverage; the paper's "hard patterns are observer-proof" |
| edge $\times$ texture, two surfaces in one pixel | a joint Gaussian in (distance, counts): erf times shifted characteristic functions | the tool's `poolDirect2` for two strokes |
| $Z$ not smooth on the window | the trichotomy below | visibility |

The remainder is the only approximation, and it has a closed-form second-order correction: with the Hessians $H_c$ of the inputs, each term's multiplier becomes the Gaussian integral of a quadratic phase,
$$ \mathbb{E}\, e^{\,i b\cdot z + \frac{i}{2} z^T Q z} \;=\; \prod_j (1 - i\rho^2\lambda_j)^{-1/2}\; \exp\!\Big(-\tfrac12\, b^T(\Sigma^{-1} - iQ)^{-1} b\Big), \qquad b = 2\pi J^T k,\; Q = 2\pi \textstyle\sum_c k_c H_c, $$
$\lambda_j$ the eigenvalues of $\rho^2 Q$. That is EWA with curvature, and it is new as far as I can find.

### Where the inputs are not smooth: the trichotomy of pixels

The paper's trichotomy of counts (exact, winding, fold) is a classification of pixels.

- **Exact.** All inputs smooth across the window. The pixel theorem applies as stated. Almost every pixel.
- **Winding.** A singular point of an input inside the window: the pole of a parametrisation, the centre of a radial texture, a cone tip, a vortex. The pushforward is not Gaussian; along the winding coordinate the pixel sees every phase, and the expectation is over the whole fibre in that coordinate. The paper's defects, with the core radius $r^\* = 2qs/\pi$ saying how many pixels around the point are of this kind.
- **Fold.** A silhouette or depth discontinuity inside the window: the surface's parametrisation folds against the view, $\partial F/\partial c = 0$, two surfaces are present, and no single smooth $Z$ exists. The image is a partition $\sum_j \mathbf 1\{x \in R_j\}\, f_j(Z_j(x))$ whose region indicators are steps of signed distances, so the pixel value is again a joint-Gaussian expectation once the surfaces are *found*. Finding them is a search with a certificate, conservative rasterisation or ray casting, exactly as the fold rung of the count solver is a search with an interval certificate. This is the one place anti-aliasing cannot be a formula, and the theory says so.

The paper's fold law transfers literally: a field added to a count cannot fold it, so texture warps, bump offsets, and parallax mapping never create a fold pixel; only geometry does.

## The sampling half

Point sampling on the pixel grid is a comb family. In the multiplier sum it replaces the Gaussian's characteristic function $e^{-2\pi^2 k^T J\Sigma J^T k}$ by the comb's, which is one on the pixel grid's dual lattice: every recipe whose screen rate lands on a multiple of the pixel rate comes through at full strength. Those are the stations of the content against the pixel comb, and they are the aliases. The sampling theorem is the statement that the pixel comb's dual lattice must miss the content's spectrum, which is "no station below the beat regime" in the paper's words.

Supersampling with $N$ samples in a pixel is a finer comb. At $\sigma$ periods a pixel and $N$ regular samples, harmonic $k$ survives exactly when $k\sigma/N$ is a whole number: a regular grid is exact (a slide, Theorem 1) at some $N$ and aliases fully at others, and which is arithmetic. Random samples have no stations and converge as $N^{-1/2}$. A Kronecker sequence with the golden step has no stations either, by Hurwitz: it is the desert of the paper's Section 5, and it converges as about $N^{-1}$. This is why golden-ratio and other low-discrepancy jitters work in temporal anti-aliasing, said in the theory's vocabulary: they put the sampler in the desert.

## What aa.mjs measures

**1. The pixel theorem on the canonical scene.** A plane in perspective (focal length 128 pixels, unit tile at unit depth), textured with $\exp(2\cos 2\pi u + 2\cos 2\pi v + 1.5\cos 2\pi(u-v))/40$, which is not separable and has coefficients under $10^{-9}$ by $|k| = 20$. Eighteen pixels from magnification (0.008 periods a pixel) to 3.6 periods a pixel, on and off axis. Reference: a dense Gaussian-weighted grid, converged to $10^{-5}$.

| regime | first-order multiplier | second order | point sample | isotropic footprint |
|---|---|---|---|---|
| worst error over all pixels | $3.0\times10^{-2}$ | $4.1\times10^{-3}$ | $5.0$ | mean $0.37$ |
| where the theorem's bound is under $10^{-2}$ | under $10^{-4}$ | | | |
| the four pixels the first order gets wrong by over $5\times10^{-3}$ (rate changing 30 to 40% across the window) | $0.9$ to $3.0\times10^{-2}$ | $0.4$ to $1.6\times10^{-3}$ | | |

Every error is within the theorem's remainder bound. The isotropic footprint, which is what trilinear mipmapping approximates, errs by a third of the signal on average on this anisotropic scene; the point sample by up to five. The multiplier's cost is the number of surviving terms: 4096 (all) under magnification, where one would evaluate the texture directly, 520 at half a period a pixel, 79 at two, 29 at 3.6.

One thing this scene showed that I did not put in: at 60 pixels off axis and 3.6 periods a pixel, the pixel is *not* the texture's mean. Along that viewing direction the recipe $(2,-1)$ of the texture is slow (its two rates, 1.67 and 3.56 periods a pixel along the row, nearly cancel in twice the first minus the second), it survives the window at 78%, and the far ground shows a beat of the texture with itself through the perspective. The theory names it, the brute force confirms it, and a mipmap would blur it away or alias it.

**2. The observer theorem inside a shader.** A ridged normal map (height $0.15\cos 2\pi u$) under a Blinn-Phong lobe of power 32 with the half vector 35 degrees off the mean normal. Filtering the normal and then shading (pool, then respond) against the exact expectation of the shading (respond, then pool):

| minification $\sigma$ (periods per pixel-sigma) | exact | multiplier error | filtered-normal shading | ratio |
|---|---|---|---|---|
| 0.01 | 0.986 | $1.6\times10^{-7}$ | 0.998 | 1.0 |
| 0.1 | 0.628 | $3.6\times10^{-7}$ | 0.781 | 0.8 |
| 0.3 | 0.374 | $2.1\times10^{-7}$ | 0.0142 | 26 |
| 1.0 | 0.314 | $9.2\times10^{-8}$ | 0.0017 | 186 |

The highlight lives on the ridge flanks. The filtered normal points straight up and misses it by two orders of magnitude; the mean of the shading keeps it. This is the LEAN problem stated exactly, and the multiplier sum of $N \circ I$ is exact to $10^{-7}$ at every minification.

Two ridge fields added, pitches in the ratio 1.08, at 1.2 pixels a period so the carriers are under the window and the 15-pixel beat is not. The linear shader (Lambert of the summed slope) has a cross coefficient $(1,-1)$ of $10^{-15}$ relative to its carrier and a beat contrast of $2\times10^{-16}$ in the filtered image. The specular lobe has a cross coefficient of $2\times10^{-2}$ at $(1,-1)$, $0.57$ at $(2,-2)$, and a beat contrast of $1.6\%$. Two bump maps under a diffuse shader can never moiré; under a specular one they must. "Who sees a beat", in a shader.

**3. Stations of a supersampling grid.** Content with harmonics to 8 at 2 periods a pixel, $N$ regular samples. Predicted exact set for $N \le 20$: $\{9, 11, 13, 15, 17, 18, 19, 20\}$; measured errors there are $10^{-16}$. Predicted aliasing at the others, with the kept harmonics named ($N=8$ keeps 4 and 8; $N=16$ keeps 8): measured errors $4\times10^{-3}$ to $1$. Every one of twenty classified correctly. Random sampling: error $0.174$ at $N=16$, $0.023$ at $N=1024$, a factor 7.7 for a factor 8 in $\sqrt N$. Golden Kronecker: $0.049$ to $0.00076$, a factor 65.

## What is known, what is new

Known: ray differentials (Igehy 1999) compute $J$; EWA (Heckbert 1989) is the pushforward Gaussian for textures on a pyramid; covariance tracing (Belcour 2013) propagates the light field's covariance for adaptive sampling; LEAN mapping (Olano and Baker 2010) is the polynomial case at order two; distance-field anti-aliasing is the erf case; band-limiting of procedural shaders by Gaussian smoothing of program terms (Dorn 2015, Yang and Barnes 2018) approximates the periodic case; lattice rules and Kronecker sequences are quasi-Monte Carlo theory.

New, I think: the single statement with the trichotomy as a pixel classification, and the fold as the one irreducible search; the exact multiplier for arbitrary periodic $N \circ I$ with the station arithmetic as the cost oracle (the surviving-term count, found by the lattice reduction the tool already runs); the second-order pushforward in closed form; the order results (a diffuse shader cannot moiré two bump maps, a specular one must; beats of beats need order four) as facts about shading; and aliasing read as a station of the content against the sampler, with the desert as the reason quasi-random jitter works.

## Measured against a published benchmark

`benchmark-yb.md` reports the method on the Yang and Barnes (Eurographics 2018) procedural-shader band-limiting benchmark, rebuilt from their public code so that the unfiltered errors match theirs to three decimals. On all five cases tried, including the two with a rippled normal map and a parallax coupling, the count-map error equals the protocol's own noise floor (0.005 to 0.007 RMS) against their published 0.035 to 0.071, at a cost of 70 to 1000 times the unfiltered shader on a CPU in JavaScript, which is at or below the cost of supersampling to the same error.

## What I would build

1. **The oracle.** Per pixel, from $J$ and a material's spectrum, the number and identity of surviving recipes. It tells a renderer where supersampling is needed and where the mean suffices, before shading. Cheap: the ratio view's lattice reduction.
2. **Exact filtering of periodic materials with nonlinear shading.** Store a material as its spectrum, shade the spectrum ($N \circ I$ by a torus DFT once per lighting change or per lobe), and filter by the multiplier with curvature. Bricks, tiles, weaves, meshes, hatching, and anything procedural. Cloth is the flagship.
3. **Fold pixels only.** Restrict visibility supersampling to pixels the classification marks as folds, which conservative rasterisation finds; everything else is a formula.

The honest limit: the pixel theorem is exact to third order in curvature and needs $J$, which rasterisers have from quad derivatives and ray tracers from differentials. Real materials with texel-scale detail still want a pyramid, since the multiplier's cost is the number of slow recipes, and under magnification that is all of them. The theory does not replace mipmaps in the texel regime; it says what they are approximating, and takes over where they fail: minification of structured content, nonlinear shading, and moiré between patterns.
