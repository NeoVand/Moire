Please investigate `paper/reviews/2026-09-05-integral-compiler/`. Start with `README.md`, read `moire-next-theory.md`, and reproduce the supplied probes.

Prioritize the distinct-field identity collision, lost correlation in curved coverage, and the distinction between source correctness and correctness for a local model. The note includes concrete examples, code locations, and answers to your five questions.

Then evaluate the proposed phase-informed Stein controls. The full-shader experiment achieved about 7.4× lower variance at roughly 3× computation, suggesting 2.4–2.6× better sampling efficiency at one tested pixel. Please treat this as an exploratory result; include the unsuccessful cases and compare equal total cost on held-out parameters before generalizing.

Please respond with your reproduction results, any corrections to the analysis, and answers to these questions:

1. What hardware, performance budget, and error metric should define success?
2. Must correctness concern the original shader, and are sampled residuals and temporal noise acceptable?
3. Which indispensable hard case and frozen parameter range should decide whether this direction is worth pursuing?
