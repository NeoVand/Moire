# The Bessel claim works; specialize the shift, then compose it

Reply to `THEORY-NOTE.md` §8, ask 1. Tested 2026-09-05 against the actual compiler source, whose hashes are in the result file. No compiler code was changed.

The elementary identity is validated. It can replace a numerical transform for a recognized sinusoidal shift. The useful breakthrough is to treat a warp as an operation that moves observable coefficients between integer recipes, with the existing pixel integral applied afterward. It is not a license to replace the entire rippled or bumped shader with one Bessel factor.

Run the check:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/bessel-shift-probe.mjs
```

The original run took about 0.23 seconds on this machine and its 134 records are preserved in `bessel-shift-results.jsonl`. New runs write a unique timestamped file under `runs/`, or use `--out NEW_FILE.jsonl`; existing files are never overwritten. The probe copies `fjet.mjs` and the benchmark into a temporary directory, adds exports for private table functions to the copy, and extracts the sine factor from the real `sinQuadraticRipples` trace. It calls the actual `shiftTables` implementation directly. It does **not** claim that the complete benchmark currently takes that table route, nor does it measure full-shader error or GPU speed.

## 1. Fix the argument convention

The compiler defines

\[
Q(\theta;n)=\int_0^1 O(s)e^{i\theta H(s)}e^{-2\pi i ns}\,ds.
\]

For `O=1` and `H(s)=a₀ sin(2πs)`, this is **`J_n(theta * a₀)`**. The compiler's `thetaOf` already includes `2π` and the parent recipe harmonics. Thus §2's proposed table comparison `J_n(2π k theta a₀)` double-counts them if `theta` means the table argument. If `theta` instead names a physical amplitude, rename it to avoid this collision. The extracted factor has `a₀=1`; the height's `1/3` is carried by the smooth coefficient, not by `H`.

The same specialization gives the two derivatives needed by the coefficient jet:

\[
Q'=\frac{a_0}{2}(J_{n-1}-J_{n+1}),\qquad
Q''=\frac{a_0^2}{4}(J_{n-2}-2J_n+J_{n+2}),
\]

evaluated at `theta*a₀`. A field phase `δ` contributes `exp(i n δ)`; a cosine shift contributes `i^n`. These identities and the recurrence are standard, not a novelty claim. [NIST Jacobi–Anger expansions](https://dlmf.nist.gov/10.12), [NIST recurrence and derivative identities](https://dlmf.nist.gov/10.6).

## 2. Agreement, interpolation, and a real table limit

For all orders −16 through 16 at tested on-grid arguments with `|theta|≤16`, maximum absolute errors were:

| Quantity | Error |
| --- | ---: |
| Q | 1.45×10⁻⁸ |
| Q′ | 1.36×10⁻⁸ |
| Q″ | 8.47×10⁻⁹ |

Seven off-grid arguments gave maximum errors of 2.46×10⁻⁶, 2.04×10⁻⁶, and 2.04×10⁻⁶ respectively. This separates Float32 storage from quadratic interpolation error. The independent double-precision Bessel recurrence agreed with a 4096-point periodic integral to 1.67×10⁻¹⁵ on its test set.

The fixed **64-point shift grid aliases at larger arguments**, even for retained orders within ±16:

| theta | Maximum Q error, 64-point grid |
| ---: | ---: |
| 24 | 6.45×10⁻⁹ |
| 32 | 1.97×10⁻⁶ |
| 40 | 0.002693 |
| 64 | 0.223642 |

A 256-point grid restores Float32-scale agreement on these tested arguments. Widening only the theta range does not fix torus aliasing. On the midpoint grid, the computed coefficient contains aliases `Σ_r (-1)^r J_(n+rN)(theta)`. The analytic specialization removes that source of error and the interpolation error. It does not automatically certify a finite sideband window or a stable float32 recurrence. Choose recurrence direction and normalization deliberately; this probe uses a double-precision downward recurrence, not a GPU performance prototype. [NIST computational guidance](https://dlmf.nist.gov/10.74).

## 3. The actual rippled quadratic has more structure

At pixel `(300,12)`, freezing the trace's smooth coefficients gives the count

\[
q+\alpha\sin r+\beta\sin^2r+0.2\sin(\psi+\gamma\sin r),
\]

with `α=−0.3576318568`, `β=0.00006276785`, and `γ=0.4036690724`. Here `r` and `ψ` are angles in radians. The quadratic evaluated after the parallax displacement creates the `sin²` term. The source's ripple height being one sinusoid does not make every downstream count a single sinusoidal shift.

For parent harmonic `k`, first expand the inner sine. Its order `m` has factor `J_m(0.4πk)`. The remaining ripple coefficient is the transform of `exp(i[A sin r+B sin²r])`, where

\[
A=2\pi k\alpha+m\gamma,\qquad B=2\pi k\beta.
\]

Its order `n` is

\[
C_n(A,B)=e^{iB/2}\sum_j(-i)^jJ_j(B/2)J_{n-2j}(A).
\]

Multiply by `pHat(k) J_m(0.4πk)` and attach the recipe phase `2πkq+mψ+nr`. This formula matched independent periodic integration to 1.79×10⁻¹⁵ over four actual pixels, six signed `k` values through 16, three `m` values, and nine signed `n` values. Dropping `B` caused a tested shift-coefficient error up to 0.004371, or 0.000659 after the inner Bessel factor. Those are coefficient errors, not rendered-image errors.

The older `paper/tools/exp/yb.mjs` already contains the first-order double-Bessel expansion and a recurrence near its rippled-quadratic section. It explicitly omits the quadratic offset term. Reuse it as implementation evidence and a comparison case; the improvement here is organizing the **traced** composition and retaining its additional harmonic, not discovering Jacobi–Anger anew.

Also, `shiftTables` includes other closures `O(s)`. They require convolution with their Fourier coefficients. For `O=1+0.3cos(2πs)` at theta 5, the convolution matched the actual table to 1.47×10⁻⁸; a bare Bessel factor missed by 0.093896. Actual lighting is more complicated and has not been certified by this probe. Bumps and the full self-dependent fire shader also remain unvalidated.

## 4. Prune after the warp mixes frequencies

The assertion that the far-field multiplier kills large `k` before the series gets long needs qualification. The relevant frequency is **`k∇u+n∇u′`**, not the unwarped `k∇u`. A sideband can cancel a large carrier into a slow recipe.

Concrete checked example: `∇u=∇u′=(1,0)`, amplitude 1, and Gaussian sigma 0.5. For `k=4`, the bare multiplier is `5.12×10⁻³⁵`; the sideband `n=−4` has zero frequency and coefficient `J_−4(8π)=0.1426731192`. It survives with multiplier 1. At `k=16`, the corresponding DC coefficient is still 0.0706938935. Pruning those parent harmonics solely by the bare carrier rate loses these contributions.

Enumerate or bound the **mixed** recipes using coefficient magnitude and their final window multiplier. A Bessel tail bound can limit the sidebands; a carrier-only window bound cannot replace that step.

For a shift depending on the same count, orders merge:

\[
\widehat{p(u+a\sin2\pi u)}(\ell)
=\sum_k\hat p(k)J_{\ell-k}(2\pi ka).
\]

The probe verifies this for a cosine picture. The axis merge is essential: coefficients with `k+n=ell` must be added before treating them as independent recipes. For hard pictures, many parent orders and cancellation may still be needed; the identity does not promise a short sum.

The next implementation step I would support is a detected sinusoidal-shift primitive returning `Q,Q′,Q″`, with tests against the existing tables and mixed-frequency pruning. Then compose that primitive for the actual ripple graph, include the lighting convolution, and compare complete pixel means and costs against the current compiler. That is a concrete simplification with a measurable acceptance test.
