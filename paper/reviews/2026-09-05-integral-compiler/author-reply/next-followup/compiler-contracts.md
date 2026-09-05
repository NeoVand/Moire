# Two corrections before the GPU translation

Reply 4 contains useful engineering progress and two conclusions that do not yet follow from its measurements. The accompanying [probe](compiler-contract-probe.mjs) isolates both issues without changing compiler source. It imports a temporary source copy with extra exports only. These examples concern the integration/pruning contract and the interpretation of an error bound; they do not negate the reported benchmark improvements.

## 1. Absolute primitive error is not relative contribution error

The Bessel table's bound is `|computed J_n(x) − J_n(x)| ≤ ε`, an **absolute** bound. The compiler's `shiftAmp` instead accumulates the magnitudes of complete integrated contributions. That number can price a common relative perturbation of each complete contribution; it does not price arbitrary absolute errors in the component Bessel values or their derivatives.

For the simple fixed linear sum

```
I = Σ a_r Q_r,
```

absolute errors `|δQ_r| ≤ ε_r` give `|δI| ≤ Σ |a_r| ε_r`. The proposed `ε Σ |a_r Q_r|` would require a relative bound `|δQ_r| ≤ ε |Q_r|`. Near zeros, the latter is much stronger and is not provided by either Bessel kernel.

This is visible using the delivered table and high-precision fixtures. At the exact float32 input `x = −39.240447998046875`, order 8, the reference is `−3.61558e−10`, while the float32 CPU mirror gives `−7.45058e−9`. Its error `7.08902e−9` is comfortably inside the stated absolute bound. Multiplying that bound by the contribution magnitude predicts only `1.22732e−16`, underestimating this observed error by about 58 million times. The example does not claim that this particular coefficient occurs at a measured scene pixel; it disproves the inference from the recorded statistic.

For the actual coefficient jet in `stepsum`, the fixed surviving recipe is linear in the **assembled** complex `Q`, `Q′`, and `Q″`. Evaluate the three unit coefficient-jet bases through the same `termExpectation`:

```
δI_r = L_r0 δQ_r + L_r1 δQ′_r + L_r2 δQ″_r,
|δI| ≤ Σ_r (|L_r0| E_r0 + |L_r1| E_r1 + |L_r2| E_r2).
```

This preserves the theta gradient/Hessian chain rule, polynomial amplitude multiplication, mixed frequency, and actual measure. The [sensitivity probe](coefficient-sensitivity-probe.mjs) adds those counters to a temporary compiler copy; it leaves coefficient values, pruning decisions, and returned pixel values unchanged. It measures the missing weights directly.

At published amplitude, cut `1e−4`, ordinary model (matching the declined/far-field routes here), the recorded weights are:

| Case, pixel | Existing contribution magnitude sum | Absolute Q weight | Absolute Q′ weight | Absolute Q″ weight |
| --- | ---: | ---: | ---: | ---: |
| Zigzag ripples, `(400,60)` | 0.7785 | 1.6885 | 0.001087 | 9.10e−7 |
| Checkerboard bumps, `(400,60)` | 4.2977 | 27.7054 | 0.011369 | 1.30e−5 |
| Color circles bumps, `(120,34)` | 2.7117 | 10.2618 | 0.007456 | 9.18e−6 |

These counters aggregate the unique channels evaluated by the harness, as its existing statistic does; a per-channel counter can tighten them. In particular, the checkerboard's Q weight is 6.45 times its contribution-magnitude sum. The [recorded sensitivities](coefficient-sensitivity-results-2026-09-05T16-47-45.544Z-2d39e5a7.json) include complete returned pixel values and recipe counts. This table still does not multiply a raw Bessel error by a Q weight: the intervening composition must be accounted for first.

The primitive bounds still have to pass through composition. For a Bessel product, one simple bound is `|δ(J_a J_b)| ≤ |J_a| ε_b + |J_b| ε_a + ε_a ε_b`; a lighting convolution adds its coefficient weights. Include derivative identities, amplitude scaling, actual float32 argument construction, and accumulation rounding. The raw kernel's bound is not automatically the assembled Q-jet's bound. Shared primitive evaluations can be handled more tightly by accumulating their linear sensitivities before taking absolute values. Near a pruning threshold, freezing the recipe set is another assumption; keep an uncertainty margin or separately price changed inclusion decisions.

**Conclusion:** the reported `1.5e−6 per pixel` is not established by `shiftAmp ≤ 4.3`. It may turn out that float32 precision is sufficient, but it needs the correct sensitivities. The recipe counts and shading-spectrum counts remain useful cost measurements independently of this correction.

### The retained sideband order is not the raw Bessel order

Reply 4 also infers that the delivered order-42 table covers every request because the retained sidebands reach only order 18–20. The lighting convolution shifts that order, and the derivative identities shift it again. A [read-only access probe](bessel-access-probe.mjs) on the actual zigzag-ripples shader at `(400,60)` finds:

| Bump scale | Retained sideband order | Largest raw Bessel order accessed | Accesses above 42 |
| --- | ---: | ---: | ---: |
| 1× | 18 | 31 | 0 |
| 2× | 18 | 51 | 12,814 |

At 2×, the largest raw value beyond the kernel's supported order is about `4.2203e−4` at order 43, argument `−32.92363352381061`. It is subsequently weighted by the shading spectrum, so that raw number is **not** a pixel error. Nevertheless, silently replacing every unsupported order by zero is not covered by the primitive bound. Extend the kernel's supported order or prove a small enough weighted contribution before omitting it. Instrument the actual primitive accesses after convolution, rather than only the final sideband index. The [recorded access trace](bessel-access-results-2026-09-05T16-54-25.882Z-10cf70f3.json) includes both returned pixel values and source hashes; the current CPU provider evaluates those orders, so this is a GPU-port sizing correction, not a claim that the CPU drops them.

## 2. The evaluator changed measure; pruning did not

`termExpectation` has a `cond.depth` branch that integrates the pushforward depth distribution. `logMult` does not: when `cond.dim === 2`, it still evaluates the characteristic function of an isotropic Gaussian in the supplied coordinates. `harmonicsThrough` similarly derives its candidate region using that Gaussian assumption. A different measure requires a different pruning bound even when its coordinates expose every rate.

Here is a bounded grayscale source at the existing horizon test row:

```
Y ~ Normal(0, 0.5²), d0 = 6,
W = −6Y / (6+Y),
S(Y) = 0.5 + 0.5 cos(9W).
```

The phase is exactly affine in W. There are no omitted center-model terms for a witness to detect.

| Quantity | Value |
| --- | ---: |
| Gaussian-W multiplier used by `logMult` | 0.0000400653 |
| Actual reciprocal-depth multiplier magnitude | 0.0009621665 |
| Source mean from independent depth quadrature | 0.4995713764 |
| Actual `Pixel.expect`, depth enabled, cut `1e−4` | 0.5000000000 |
| Actual `Pixel.expect`, same model, cut `1e−8` | 0.4995715133 |

At the default cut, both cosine recipes disappear. Each has coefficient magnitude 1/4, so its actual complex contribution magnitude is about `2.405e−4`, already above `1e−4`; the Gaussian estimate predicts about `1.002e−5`. The resulting pixel error is **4.286e−4**. This is a concrete false-pruning case, not a claim that the compiler's cut is a complete global pixel-error budget.

The independent reference uses 32,768 and 65,536 midpoint samples in the original Gaussian Y coordinate over nine sigma; they agree within `8.72e−16`, with omitted probability bounded by `2.285e−19`. This convergence is numerical evidence, not a floating-point certificate. Evaluating the actual compiler depth integral with 32, 64, 128, and 256 nodes converges to a complex value within `3.61e−7` of the untruncated reference. Its remaining difference is consistent with the separate five-sigma truncation/renormalization. Neither that tail nor quadrature explains the much larger pruning error.

### What to change

Bind evaluation and pruning to the same measure descriptor. A method should return a value/error estimate and a magnitude envelope for that **same integration request**. A Gaussian bound must not be reused because the new coordinate happens to have the same variance to first order.

For the depth route, conservative conditional bounds can retain the Gaussian X integration while taking an upper bound over the kept depth interval, or using a validated positive quadrature with its remainder and omitted-tail bound. A weighted node average alone is not a bound on the continuous measure. Such bounds will miss some cancellation and retain extra work, but should not erase a signal by inventing Gaussian cancellation in W. The compressed row characteristic function can later provide a much sharper envelope for the phase family it actually supports. The enumeration region, pre-pruning, final recipe cut, and quadrature resolution all need this agreement; changing just the final `logMult` call may be too late if enumeration already omitted the recipe.

Disabling unsupported Gaussian rejection in depth mode is a sensible correctness baseline, but may be expensive. Measure its recipe growth before deciding the replacement. The full-source reference, discarded-tail budget, and source/model witness remain separate checks. An accepted witness is still a rejection heuristic, and declining one model does not certify its fallback.

## A more precise organizing statement

**Compile an integration request with its measure, then let every numerical decision answer that same request.** Coordinates can differ between tracing, conditioning, and tabulation if the transformed phase, amplitude, measure, and bounds are carried together. Requiring one particular coordinate system is an implementation shortcut, not a mathematical necessity.

The surface-coordinate experiment failed because the bound omitted the depth-dependent conditional mean. Substituting that mean back into the phase restores the missing rate. The present W example goes one step further: seeing the rate is not enough; the characteristic function used to reject it must belong to the actual measure. This distinction is useful for the GPU interface now, before its assumptions become embedded in generated shaders.

Run the read-only probes from the repo root:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/compiler-contract-probe.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/coefficient-sensitivity-probe.mjs
node paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/bessel-access-probe.mjs
```

They use timestamped output, accept `--out NEW.json`, refuse overwrites, and record compiler provenance. The first reproduces the two current counterexamples; its expected-failure assertions should be revised when the compiler is repaired. The other probes profile fixed surviving recipes and raw accesses, so they are deliberately not full error certificates or timing benchmarks.
