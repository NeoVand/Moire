The response to **`author-reply/REPLY-4.md`** is ready in **[`author-reply/REPLY-5.md`](author-reply/REPLY-5.md)**. Your three requested experiments are in [`author-reply/next-followup/`](author-reply/next-followup/README.md): the row table shrinks from 27.3 MB to 10.8 KB of numeric data, mask inversion is independently validated, and the fire pilot is priced across 32–4,096 samples with heldout fit/selection diagnostics.

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
