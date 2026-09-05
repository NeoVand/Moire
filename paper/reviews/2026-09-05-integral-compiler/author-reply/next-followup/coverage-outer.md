# The immediate coverage improvement: regularize the outer endpoints

The new mask inversion agrees with its independent high-precision reference, but is slower than the existing nested adapter. That reference also exposes the adapter's outer discretization error. A small change to the existing method resolves it: **apply the same endpoint regularization that repaired the circles depth reference**.

The adapter already cuts the outer coordinate where the discriminant vanishes. At such a cut, a conditional interval opens with square-root width. A plain Gauss–Legendre rule sees a function with a singular endpoint derivative. On each existing outer subpanel `[m−h,m+h]`, replace its linear map by

```
w1 = m + h sin(πx/2),    x ∈ [−1,1],
dw1/dx = h(π/2) cos(πx/2).
```

The distance to an endpoint is now quadratic in the new coordinate, regularizing the square-root opening. The cuts, source geometry, correlation, amplitude, and inner interval primitive remain the same. The [probe](coverage-outer-probe.mjs) changes only an in-memory copy of the author's adapter; no author/compiler file is edited.

| Outer rule | Saddle, constant amplitude | Saddle, quadratic amplitude | Ridge |
| --- | ---: | ---: | ---: |
| Original 32-node, 6σ | 2.456e−6 | 2.618e−6 | 3.505e−8 |
| Mapped 16-node, 6σ | 6.177e−10 | 5.217e−9 | 1.838e−10 |
| Mapped 32-node, 6σ | 6.174e−10 | 1.828e−12 | 1.838e−10 |
| Mapped 32-node, 8σ | 9.193e−16 | 5.276e−18 | 5.829e−17 |

Entries are **measured complex absolute errors on these three terms**, against the [independent original-frame reference](mask-reference-2026-09-05T16-54-39.569Z.json). They are not uniform accuracy bounds. The 6σ plateau on the first and third cases is consistent with outer-tail truncation: doubling 32 to 64 nodes does not change it materially, while extending the domain to 8σ removes it on this fixture. The inner primitive continues to satisfy its own requested `1e−11` estimated tolerance.

The 16-node mapped rule halves inner calls from **256/256/192 to 128/128/96**, with errors below `5.3e−9`. Five warm CPU trials measured about **1.33/1.70/0.21 ms**, versus **2.71/3.40/0.41 ms** for the original rule. These same-process comparisons are useful evidence of reduced work, not a hardware-independent speed guarantee. The high-accuracy 8σ/32-node version uses **320/320/224 calls**, with 64-node refinement agreeing near binary64 precision. GPU float32 errors and full-frame scheduling are separate; this alone does not make coverage real time.

For these terms, preserve the nested representation and improve its outer rule first. Keep the inversion as an independently validated alternative and a potential later optimization. The practical principle is to expose support events and remove their endpoint singularities before adding quadrature nodes or replacing the entire integral.

Run:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/coverage-outer-probe.mjs
```

The [recorded six-variant comparison](coverage-outer-results-2026-09-05T16-58-05.408Z-fce9ba50.json) contains all five timing trials, failure counts, source/reference hashes, and complex means. The script verifies that the current adapter matches the independently referenced source, uses a unique timestamped output, accepts `--out NEW.json`, and refuses overwrites. Faster phases or other masks still need their own outer error/tail treatment; no blanket replacement of a certified integration policy is implied.
