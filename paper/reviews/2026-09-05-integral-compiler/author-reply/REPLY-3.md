# Reply 3: runnable kernels, shared perspective, and a selective role for controls

Your instrumentation and coverage adapter make the decisions much clearer. I accept your clarification: the compiler already enumerates at the mixed frequency, and the rippled checkerboard/quadratic examples do not run through the shift table. The aliasing warning applies to that table and its replacement; it is not evidence that every rippled shader takes that route. Also, a window reaching 16 is a request to budget the omitted terms, not proof that increasing the coefficient accuracy alone fixes the whole mean.

All four requested deliverables are now in [gpu-followup](gpu-followup/README.md). They stay in our review folder. Your compiler, notes, and `author-probes` are untouched by this package. The old Bessel probe now uses unique timestamped output or `--out NEW_FILE.jsonl`, refuses overwrites, and preserves the historical result.

## 1. Float32 Bessel: a bounded table and a measured recurrence

[The Bessel package](gpu-followup/bessel-README.md) contains callable WGSL and a float32 JS mirror. It supports arguments through ±40, values through order ±42, and first/second derivative jets through ±40.

For a defensible absolute-error contract, use the 46,956-byte piecewise degree-12 Taylor table. Its coefficients have exact rational enclosures, and the integral representation gives the uniform remainder `1/13!`. Under the stated Horner arithmetic contract, including adjacent rounding and flushed subnormals, the bounds for `J`, `J′`, `J″` are **3.395e−7, 4.587e−7, 5.481e−7**. These concern the actual float32 input, not the real expression before rounding. WGSL reassociation means the conditional arithmetic analysis is not automatically a proof for every compiled backend.

The table-free Miller alternative runs downward from 80 and normalizes the row; it is experimentally accurate, without a proved uniform recurrence-error bound here. Actual Apple/Metal WebGPU checks against 4,370 high-precision inputs found maximum value errors **5.43e−8** for the table and **3.57e−7** for Miller. Sparse jet requests favor the table in the isolated benchmark; a cached row slightly favors Miller. Neither result is a full renderer claim.

Use the adjacent derivatives with your amplitude chain rule. Keep sideband-tail error, argument construction, lighting/ripple convolution, and recipe summation as separate charges. In particular, `n≤40` is the kernel's supported request domain, not a guarantee that order 40 is a sufficient truncation at argument 40.

## 2. The interval primitive can run in a shader

[The coverage package](gpu-followup/coverage-gpu.md) supplies fixed-degree, capped-work WGSL, using standardized interval moments and explicit refusal statuses. All **704** calls from your unchanged adapter are accepted at the tested `1e−4` moment tolerance. Replaying the adapter with the GPU results changes its three complex means by at most **9.94e−9**. Across the accepted tests, the largest individual moment discrepancy is **3.96e−7**; the independent exact-packed-input check reaches **3.99e−7**.

That does not transfer your CPU `1e−11` contract into float32: all 704 replayed calls fail that stricter requested tolerance under the shader's estimate, even though their means agree closely. The shader's analytic truncation accounting and empirical roundoff estimate are separate, and unsupported precision/work requests fail explicitly. Host-side amplitude scaling and outer quadrature still need their own error allocation.

The important cost result is less flattering: **31.1 million interval calls per second** on the final tested adapter mixture, with slower earlier runs. Your 192–256 calls per outer term cannot simply be repeated per pixel across a 1080p image within two milliseconds. We now have a runnable primitive; the nested lowering still needs an algorithmic reduction.

The note proposes a bounded next experiment: invert the mask's step in one scalar frequency, using the existing full-line quadratic Gaussian expectation of `amplitude × exp(i(phase + t × maskCount))`. This keeps correlation and may replace the nested interval/outer integration with one scalar inversion. Both frequency signs are needed for a complex weight. Tail control, boundary conventions, and a useful finite quadrature remain open; this is the next experiment, not a claimed fast solution.

## 3. Perspective can be shared across a row

[The reciprocal-depth prototype](gpu-followup/row-transform-notes.md) conditions on horizontal displacement exactly, then tabulates a reciprocal-depth characteristic function per row and horizontal harmonic. Pixels and vertical harmonics query it at the **combined** frequency. It keeps the source perspective rather than a center expansion.

At `y=5`, 81 multiplier checks agree within **7.08e−9**, and seven complete circles pixels within **1.56e−9**, including a fractional position that actually exercises interpolation. The present dense allocation is expensive: **27.3 MB and 74 ms setup per row**, then **9.50 ms for 480 pixels on CPU**. The interface and sharing work; that storage scheme is not ready for the GPU. The prototype rejects rows too close to the pole for its proven tail treatment.

A useful correction for your references: split the outer depth integral where a circle's vertical support opens/closes, then cosine-map the endpoint. The 32/64-point panel rules agree to roughly `2.5e−15` on this fixture; an unpartitioned 400,000-point midpoint reference was still `5.63e−7` away. Please use the support cuts before attributing a small discrepancy to the compiler or merely increasing sample counts.

## 4. Fire controls: keep the win and the failures

[The equal-cost experiment](gpu-followup/fire-controls.md) evaluates the original fire-with-bumps source, with pointwise derivatives, independent pilots, harmonics 1/4/8/16, and the boundary-masked arm. Costs include sampling, derivatives, controls, pilot, and fitting.

With K = 4, estimated sampling efficiency improves **14.44–15.74× at `(100,120)`** over two seeds. It loses at the other two pixels: **0.49–0.51× at `(300,12)`**, **0.81–0.83× at `(400,60)`**. K = 8 adds little; K = 16 adds cost. The particular boundary-masked family loses everywhere tested. This fails an across-the-three-pixels 3× requirement. It is also not a comparison against your already-fast analytic answer at `(100,120)`.

The evidence is a scalar, fixed-parameter CPU variance comparison, not an RGB image or ten-million-sample accuracy result. The reference uncertainties and shared-reference discrepancies are reported rather than hidden. The control implementation passes 3,564 independent numerical divergence checks. Its mathematical zero-mean argument survives the source's discontinuities because the vector field is smooth/compactly supported; the target itself need not be differentiable.

## What I would change in the organizing theory

**Compile the joint distribution induced by the coordinates, then price the remaining integral.** That is the common object behind all three constructive results. A warp transports coefficients; conditioning changes the measure exactly; joint coverage asks that measure a correlated question. A center jet is one possible description of that distribution, with a limited validity region. It should not become the definition of the source.

This suggests three distinct compiler decisions: which coordinates preserve the needed geometry, which representation makes the resulting integral reusable, and which numerical method meets the error budget at the lowest measured cost. Keep those decisions separate. The current results support trying exact structure first and small source-derived controls only where their measured residual savings pay for them. A pilot-free model oracle cannot price these nonlinear source controls; a selector needs fresh validation and a bounded setup cost of its own.

Two things would make the next exchange especially useful:

1. From the new provider, record the **largest requested order, coefficient-tail estimate, surviving mixed recipes, and weighted coefficient-error amplification**, alongside arguments and complete-pixel cost. That will tell us whether the bounded table needs more orders, better accuracy, or fewer requests.
2. From joint coverage, give the distribution of conditional calls per surviving term and the actual range of mask/phase jets. We can compare the one-dimensional mask inversion against your adapter on the same terms before choosing a GPU lowering.

Please reproduce the four packages and report the failures as well as the successes. The next breakthrough would be a smaller, correctly priced representation of the remaining integral—not a larger collection of impressive isolated speedups.
