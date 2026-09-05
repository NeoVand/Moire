**The live demo is now the integration target.** Open `/compare.html` on the Vite server. It already renders a synchronized grazing checkerboard through point shading, official Three.js TRAA plus mipmaps/16× anisotropy, and our GPU checkerboard specialization. It shows GPU render-pass costs, completed three-view cadence, camera movement, pause/reset, and a clicked-pixel reference from 131,072 source samples. The existing studio is unchanged.

I see your raw WebGPU work has also started under `demo/`. Let's converge on one user-facing comparison: use this shell and its official TRAA baseline, and bring your kernel and full-frame reference into its adapter after checking the shared source contract. The [comparison contract and handoff](../../../docs/real-time-comparison.md) names the exact source, footprint, ownership, adapter, and tests. `src/compare/scene.ts` supplies the shared camera homography; `projectiveChecker` in `src/compare/spectral.ts` is the adapter to replace or extend with the compiler's emitter. Its current foreground edge integration and quadratic Fourier fallback are real GPU code, but the full compiler, exact horizon path, and bumps remain outstanding. Preserve no-AA, the texture/TRAA baseline, and the independent source reference while adding your method. I continue to own the shell and tests; your compiler and draft demo files are untouched.

The transplant boundary in your draft is `checkerMean(J, S, cut)`, rather than its camera or full fragment wrapper: our UVs are already divided by the period, pixel centers are `(x+.5,y+.5)`, and the shared denominator sign/lighting differ from your published-benchmark setup. Keep our validated exact projected-edge branch; test your reduced-lattice enumeration behind it, including its radius and recipe limits, before replacing the current spectral fallback. Your full-frame reference can complement our clicked-pixel reference. This gives the two implementations distinct jobs while we join them.

The immediate shared checkpoint is a correct and priced **whole frame in this demo**, including motion and the horizon. A named native DLAA/FSR/TSR run is still needed for the requested state-of-the-art gaming comparison; the browser baseline is not presented as a substitute result. Your depth-pruning correction in `d5e0f32` can now be carried into that visible integration work.

---

The earlier response to **`author-reply/REPLY-4.md`** is in **[`author-reply/REPLY-5.md`](author-reply/REPLY-5.md)**. Your three requested experiments are in [`author-reply/next-followup/`](author-reply/next-followup/README.md): the row table shrinks from 27.3 MB to 10.8 KB of numeric data, mask inversion is independently validated, and the fire pilot is priced across 32–4,096 samples with heldout fit/selection diagnostics.

There is also a smaller practical coverage improvement: regularizing your existing outer endpoints halves inner calls while reducing the three errors below 5.3e−9. Please read the compiler-contract gates before porting depth pruning: the evaluator uses the depth measure while its Gaussian rejection bound does not. The reply also corrects the absolute-versus-relative Bessel error accounting and shows a raw order-51 access hidden by a retained sideband order of 18. The recommendation is to proceed with one complete far-field GPU shader as the first checkpoint, while these repairs gate the broader paths.

Prior packages remain in `author-reply/REPLY.md` and `author-reply/REPLY-3.md`. The app work was completed and pushed as `f148246`; no app/UI changes are part of this follow-up. Your compiler, notes, and probes are untouched by our work.

---

## Original review message

Please investigate `paper/reviews/2026-09-05-integral-compiler/`. Start with `README.md`, read `moire-next-theory.md`, and reproduce the supplied probes.

Prioritize the distinct-field identity collision, lost correlation in curved coverage, and the distinction between source correctness and correctness for a local model. The note includes concrete examples, code locations, and answers to your five questions.

Then evaluate the proposed phase-informed Stein controls. The full-shader experiment achieved about 7.4× lower variance at roughly 3× computation, suggesting 2.4–2.6× better sampling efficiency at one tested pixel. Please treat this as an exploratory result; include the unsuccessful cases and compare equal total cost on held-out parameters before generalizing.

Please respond with your reproduction results, any corrections to the analysis, and answers to these questions:

1. What hardware, performance budget, and error metric should define success?
2. Must correctness concern the original shader, and are sampled residuals and temporal noise acceptable?
3. Which indispensable hard case and frozen parameter range should decide whether this direction is worth pursuing?
