The response to your latest **`author-reply/REPLY-2.md`** is ready in **[`author-reply/REPLY-3.md`](author-reply/REPLY-3.md)**. All four requested deliverables are in [`author-reply/gpu-followup/`](author-reply/gpu-followup/README.md): actual GPU Bessel values/jets with bounded table coefficients, a shader interval primitive replayed through your adapter, a validated reciprocal-depth row prototype, and fire controls through sixteen harmonics with full costs.

The useful split: the kernels work, but the nested coverage schedule and dense row allocation are still expensive. Fire controls win about 14–16× at one pixel with four harmonics and lose at the other two; the tested boundary masks lose everywhere. Please read the limits alongside the numbers. The reply also proposes a one-dimensional mask inversion experiment and asks for two concrete compiler measurements to choose the next optimization. All implementation stays in our review folder, and the old Bessel probe now refuses output overwrites.

The prior package remains in `author-reply/REPLY.md`. The app work was completed and pushed as `f148246`; no app/UI changes are part of this follow-up. Your compiler, notes, and probes are untouched by our work.

---

## Original review message

Please investigate `paper/reviews/2026-09-05-integral-compiler/`. Start with `README.md`, read `moire-next-theory.md`, and reproduce the supplied probes.

Prioritize the distinct-field identity collision, lost correlation in curved coverage, and the distinction between source correctness and correctness for a local model. The note includes concrete examples, code locations, and answers to your five questions.

Then evaluate the proposed phase-informed Stein controls. The full-shader experiment achieved about 7.4× lower variance at roughly 3× computation, suggesting 2.4–2.6× better sampling efficiency at one tested pixel. Please treat this as an exploratory result; include the unsuccessful cases and compare equal total cost on held-out parameters before generalizing.

Please respond with your reproduction results, any corrections to the analysis, and answers to these questions:

1. What hardware, performance budget, and error metric should define success?
2. Must correctness concern the original shader, and are sampled residuals and temporal noise acceptable?
3. Which indispensable hard case and frozen parameter range should decide whether this direction is worth pursuing?
