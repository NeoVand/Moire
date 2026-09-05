# Independent industry-contract gates

This package turns the first generality and coverage objections into executable CPU fixtures. It does not promote a GPU kernel. The historical polar prototype at `722a1a3` is deliberately retained as a failing candidate so a future fix has something concrete to beat.

From the repository root:

```sh
node paper/reviews/2026-09-05-integral-compiler/theory-program-review/industry-contract-gates/run.mjs
```

Each run writes a fresh timestamped JSON result, including candidate commit, source hashes, every case, failures, tolerances and limitations. An existing `--out` file is never overwritten. Exit code **2** means the candidate radial contract is rejected; **1** means an independent fixture check failed; **0** means this limited CPU package passed. The default historical candidate should exit 2. Pass `--revision <hex-commit>` to check a later candidate with the same function interface; an incompatible adapter fails explicitly.

## What is being tested

| Component | Independent reference | What it establishes |
| --- | --- | --- |
| Radial events | Known factored polynomials, explicit positive intervals, analytic Gaussian radial masses | Whether the candidate's lower and upper event bounds contain the reference |
| Source remainder | Exact rational phase identities and stable trigonometric residual evaluation | Counterexamples to the old bound; finite checks of the corrected whole-ball formula |
| Composition | Gaussian characteristic function, sign symmetry, covariance and Cauchy–Schwarz identities | Why material products need shared coordinates and residual information |

The radial adapter loads only `cubicRoots` and `coverageAt` from an immutable Git source blob. It does not execute the author's expensive sampling loops. This is a deliberately narrow adapter, not a stable compiler API.

## Reproduced failures

For the lower event

\[
-(r-1.002)(r-1.023)(r-10)>0,\quad 0\le r\le6,
\]

the historical 240-cell scan finds no roots. It returns `0.9999999847700203`; the exact radial event has mass `0.9872652848480943`. Negating the polynomial makes an upper event whose returned mass is zero while the true mass is `0.012734699921926`. Both missed roots lie in one scan cell. The discrepancy is about 3.25 steps of an 8-bit intensity scale. Three roots in one cell also fail; repeated roots expose smaller numerical errors.

For the source `sin(pi/2 + 0.01*s)` at plane point `(240,9)`, the omitted mixed derivative makes the true leading cubic remainder **4.6188 times** the historical allowance. The fixture uses the direction `(sqrt(2/3),1/sqrt(3))` and checks eight finite radii with stable residual algebra. This failure occurs arbitrarily close to the center; it does not require a pole nearby.

The replacement source bound uses the exact rational identity from bridge message 85. With `Delta=v/(1+w)`, the two differences `Delta-(v-v*w)` and `Delta²-v²` are known rational expressions. Bounding them over a ball with `||w||*R<1` includes the missing mixed terms and denominator variation. Pole-touching and crossing balls decline. This is a real-arithmetic argument; finite tests do not certify floating-point evaluation.

The composition cases give factors with identical marginal means but different product means, including aligned/opposite masks and anisotropic coordinates. They also show that a general approximation product requires the two mixed model/residual terms as well as the residual product. These are requirements for a future compiler node interface, not evidence that such an interface is implemented.

## Next handoff

Claude owns the candidate fixes and compiler lowering. The next CPU gate must replace the sign scan with complete root isolation, count uncertain root neighborhoods conservatively on **both** endpoints, and use a whole-ball source remainder. Derivative critical points partition a cubic into at most three monotone pieces, but numerical uncertainty around critical or repeated roots still needs an explicit enclosure. GPU translation follows that contract.

Codex owns this independent package. Subsequent material implementations should expose candidate outputs against the composition fixtures, then meet the agreed native quality and cost protocol. Angular refinement cost, full-expression residual allocation, supported node coverage, preprocessing, storage and temporal behavior remain open.
