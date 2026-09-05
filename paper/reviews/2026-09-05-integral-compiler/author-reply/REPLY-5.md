# Reply 5: a much smaller row transform, a cheaper coverage rule, and two contract repairs

My recommendation is to start the far-field GPU emitter now, with one complete shader as the first checkpoint. The new depth work is useful, and recording its failed alternatives improves the theory. This package answers all three requests and finds two issues to repair before their assumptions reach the GPU.

Everything new is in [next-followup](next-followup/README.md). Your compiler, application, notes, and probes are untouched by our changes. The instrumentation reads temporary source copies; it does not alter the live program.

## 1. The row table is now 10.8 KB of numeric data

[The compact row transform](next-followup/row-compact-notes.md) retains **10,760 numeric bytes instead of 27,262,976**, about **2,534× smaller**. There is no hidden dense FFT: peak logically live numeric buffers are 34,440 bytes and cumulative numeric allocation 104,976 bytes. The note separately reports measured JavaScript heap overhead and transient memory; the ratio concerns the numeric table, not total process memory.

The change is structural. Bound negligible horizontal harmonics using the actual damped reciprocal-depth density; bound its high-frequency tail by integration by parts; store only the remaining positive-frequency intervals as small Chebyshev pieces; use conjugacy for the other half. The phase is centered before interpolation. Each discarded region has a mathematical bound for the actual measure, with the distinction between exact-arithmetic bounds and their padded Float64 evaluation kept explicit.

**610 multiplier checks across three depth/width settings and ten complete circles pixels pass.** Maximum observed mode error is `1.25e−9`, complete-pixel error `1.38e−11`. The 480-pixel CPU row costs about **1.49 ms after setup**, compared with the previous 9.50 ms. Setup is still **20–45 ms per row** on this CPU. Those costs must be counted when camera/footprint changes invalidate the data; this is not a two-millisecond full-frame result.

The supported family remains explicit: constant-amplitude phases affine in the plane's surface coordinates, with the tabulated integer horizontal harmonics. It is not a drop-in replacement for every coefficient jet or additional frequency in color circles. Please connect it first to the plain circles case, then generalize from the actual queries rather than assuming the restriction disappeared with the memory cost.

## 2. Mask inversion works; the immediate winner is simpler

[The one-dimensional inversion](next-followup/mask-inversion.md) correctly retains mask, phase, and polynomial-amplitude correlation. It includes both complex signs, the removable zero-frequency limit, boundary conventions, explicit mathematical tail bounds where supported, and refusal cases. Independent original-frame conditional-erf references at 40/55 digits confirm the result. On the saddle cases, truncation at 4096 gives observed errors below **4.6e−8**, but requires **101,184 full Gaussian evaluations**, about **41–42 ms** in warm CPU trials. There is no demonstrated speed advantage.

That independent reference locates the existing adapter's remaining discrepancy: its outer rule has errors `2.456e−6`, `2.618e−6`, and `3.505e−8`. A [small endpoint repair](next-followup/coverage-outer.md) is more useful now. Keep its existing discriminant cuts and map each outer panel with `w=m+h sin(πx/2)`, including the Jacobian. This regularizes the square-root opening of the conditional interval.

Using **16 mapped nodes instead of 32 ordinary nodes** cuts inner calls from **256/256/192 to 128/128/96**, while all three errors fall below **5.3e−9**. The measured CPU times roughly halve. With 32 mapped nodes and an 8σ outer domain, the three results agree near binary64 precision with the independent reference; this is measured agreement on the fixtures, not a general quadrature certificate.

I would use the mapped conditioning path first and keep the inversion as a validated alternative. Neither kernel throughput nor these scalar timings establishes a real-time image. The lesson transfers from your circles reference: locate support events and regularize their endpoints before paying for more nodes or replacing the integral.

## 3. A smaller fire pilot is useful; training loss is a bad selector

[The pilot sweep](next-followup/pilot-README.md) measures 32 through 4,096 samples, five control families, three pixels, and eight independent pilot seeds: **840 fits**, audited on independent heldout samples. It separates source/derivatives, controls, Gram construction, and solve costs. Independent reconstruction checks of 90 saved fits also pass.

For preselected K4 at `(100,120)`, a **32-sample pilot costs 0.181 ms**, with median modeled **3.78× gain within a 1 ms total budget**; all eight seeds win. At 64 samples, median gain rises to 4.03×, but one seed loses. The two difficult pixels still lose across every tested configuration even before setup cost. The original 4,096-sample K4 pilot costs about 22.3 ms and needs roughly 23.9 ms total budget to break even at the favorable pixel.

A tested naive selector fits every arm, pays that setup, and chooses using training residual variance. It selects overfit controls and loses badly, including on six of eight seeds at the favorable pixel with a 10 ms budget. Solver success and low training loss are not evidence that a control pays for itself.

These CPU pilots are too expensive to pay independently at ordinary frame densities. The next bounded experiment is shared fitting per tile/material/cache entry, plus independent validation of reuse. A coefficient vector independent of a pixel's final samples preserves the zero-mean-control identity there; its variance benefit need not transfer. Reuse and validation costs are not tested by this package, so they remain explicit work.

## 4. Two repairs to the integration contract

[The compiler-contract note](next-followup/compiler-contracts.md) contains runnable counterexamples and instrumentation.

**The depth evaluator and pruner currently use different measures.** `termExpectation` honors `cond.depth`; `logMult` and the harmonic candidate bound still assume Gaussian coordinates. For the bounded source `0.5+0.5 cos(9W)`, `W=−6Y/(6+Y)`, `Y~N(0,0.5²)`, the model in W is exact. Yet depth-enabled `Pixel.expect` with cut `1e−4` returns **0.5** instead of **0.4995713764**, because it drops both recipes. The actual multiplier magnitude is `9.62e−4`, while the Gaussian-W estimate is `4.01e−5`. The difference is not a model remainder or an outer-quadrature problem. A stricter cut restores the signal. Please replace the measure-incompatible bounds throughout enumeration and pruning; changing only the final cut can be too late.

**The Bessel error bound is absolute; your amplification statistic prices a relative error.** `Σ|contribution|` does not justify the claimed `1.5e−6 pixel bound`. We instrumented the correct linear sensitivities for the assembled Q-jet. At checkerboard bumps `(400,60)`, the Q weight is **27.705**, versus contribution-magnitude sum **4.298**; composition and derivative weights must also enter before raw Bessel errors reach the pixel.

There is a related sizing issue: at doubled amplitude, zigzag ripples `(400,60)` retains sideband order 18 but actually accesses **raw Bessel order 51**, after lighting convolution and adjacent derivative shifts. The largest accessed raw value above order 42 is about `4.22e−4`. That is not its weighted pixel effect, but the delivered order-42 table does not cover the request. Extend its domain or budget the weighted omission; do not infer raw order from retained sideband order.

## The organizing principle and the roadmap

I would sharpen our sentence to: **compile an integration request with its measure, and make evaluation, pruning, approximation, and cost answer that same request.** Coordinates may differ between stages if the phase, amplitude, measure, and bounds travel together. Your surface-coordinate failure omitted a conditional mean from the rate calculation; the new W counterexample shows that seeing the rate still does not license the wrong characteristic function.

The roadmap's order makes sense. Its dates are planning estimates, especially where recipe-count reduction remains open research. I would make the next checkpoint a narrow vertical slice: one plain shader through the real GPU/display path, a fixed camera sweep, a matched-footprint CPU/source reference, the supersampling/mipmap comparison, and separate warm rendering versus rebuild/upload costs. Add the other five shaders after that interface and cost are visible. Rest, motion, source/model error, and numerical/truncation error should remain separate measurements. Keep the app presentation restrained.

Please take these next, in order:

1. Reproduce the depth false-pruning gate and carry the actual measure into its bounds.
2. Try the mapped outer rule on your adapter and preserve the new independent reference.
3. Connect the compact row module to one supported case, counting setup and invalidation.
4. Record assembled-coefficient sensitivities and raw Bessel orders when choosing the GPU kernel's domain.

This gives the far-field emitter a concrete path forward while the horizon and warp work remains gated by measurements. The compact representation and endpoint repair are usable progress now; the unresolved pieces should remain visible rather than folded into a promised completion date.
