# Reciprocal-depth row transform: the reuse works; the dense table is a CPU prototype

This answers priority 3 in `REPLY-2.md`. One table per row and horizontal harmonic supplies the exact-perspective multiplier for every horizontal pixel and every vertical harmonic. The prototype reproduces the plain circles shader at `y=5` to **1.56×10⁻⁹** on seven tested pixels, including a position between pixels. Individual complex multipliers agree with direct depth conditioning to **7.08×10⁻⁹** over 81 test cases.

The row reuse is established for this fixture. A GPU frame budget is not: the measured dense configuration takes **74 ms to construct and 27.3 MB to retain for one row** on this CPU. After construction, a 480-pixel circles row takes **9.50 ms**. The next engineering question is how much of the dense frequency table is needed, not whether each pixel needs its own oscillatory transform.

The representative recorded run is [row-results-2026-09-05T16-08-03-190Z.json](row-results-2026-09-05T16-08-03-190Z.json), generated on an Apple M4, Node v24.20.0. Its source hashes identify the actual geometry inspected. Reruns use fresh timestamped paths by default.

## 1. Source geometry, without a centre expansion

The numeric shader in `paper/tools/exp/fjet-yb.mjs` uses

\[
s=-50\frac{x-240+X}{d_0+Y},\qquad
t=-12000\frac1{d_0+Y},\qquad
d_0=y_0+1,
\]

where the independent pixel displacements are \(X,Y\sim\mathcal N(0,\sigma^2)\). Here \(y_0=5\), \(d_0=6\), and \(\sigma=0.5\). Circles have period 20 in both surface coordinates, so the prototype uses normalized counts

\[
u=A(x-240+X)V,\quad w=BV,\qquad
A=-2.5,\quad B=-600,\quad V=(d_0+Y)^{-1}.
\]

Its \(k_s,k_t\) are harmonics of these unit-period counts. Equivalently, they are physical surface wavenumbers \(k_s/20,k_t/20\) in the earlier answer. There is no Taylor approximation to the perspective map.

Conditioning on depth integrates the Gaussian horizontal displacement exactly:

\[
m(k_s,k_t;x)=\int_{\mathbb R\setminus\{0\}}
f_V(v)e^{-2\pi^2\sigma^2A^2k_s^2v^2}
e^{2\pi i\nu v}\,dv,
\quad \nu=Ak_s(x-240)+Bk_t,
\]

\[
f_V(v)=\frac{\exp[-(1/v-d_0)^2/(2\sigma^2)]}
{\sqrt{2\pi}\sigma v^2}.
\]

At fixed row and \(|k_s|\), only \(\nu\) changes. This is the sharing contract. It is restricted to phases affine in the surface coordinates with constant amplitude after the horizontal integration. A count containing \(s^2\), varying lighting, or a correlated hard mask requires a different conditional integrand; this table must not be substituted silently.

The source evaluates the algebra on either sign of depth. It does not clip the Gaussian footprint to the front half-plane or renormalize it. The undefined pole has zero Gaussian probability. The test checks the exposed geometry and disc indicator against the actual numeric shader at 30 points, including points on both sides of the horizon. At this particular row, the front-plane convention would change a bounded multiplier by at most \(\phi(12)/12<1.79\times10^{-33}\), but it matters near the horizon and remains a different integral.

## 2. Reciprocal tails are controlled in depth coordinates

Keep \(|Y|\le9\sigma\). At this row that means depth in \([1.5,10.5]\), hence

\[
v\in[1/10.5,1/1.5].
\]

Since every multiplier integrand has modulus at most one, the omitted integral is bounded by

\[
\Pr(|Y|>9\sigma)\le\frac{2\phi(9)}9
=2.2844\times10^{-19}.
\]

This controls the missing negative-depth branch and the reciprocal tail together; it does not pretend the reciprocal density decays exponentially. The bound follows by comparing the Gaussian tail integral with its first-moment tail integral, the usual Mills inequality. [NIST DLMF §7.8](https://dlmf.nist.gov/7.8).

**The \(k_s=0\) case is retained explicitly.** Its extra damping is exactly one; it is a transform of the reciprocal density itself. The constant mode returns the known full-source normalization \(m(0,0)=1\). Nonzero \(k_t\) uses the same table without invented damping. Tests include nonzero values and frequencies between table nodes for this case.

There is a subtle reason to keep the tail argument explicit: for \(k_s=0\), \(f_V(v)\sim C/v^2\), so the full reciprocal distribution's fourth absolute moment does not exist, however small \(C\) is at this row. A global fourth-derivative interpolation bound cannot be justified from that nonexistent moment. We bound interpolation on the **truncated** interval, then add the separately bounded omitted mass.

The current implementation rejects rows with \(d_0\le9\sigma\). A row whose main Gaussian mass straddles the pole needs both reciprocal branches plus a separately budgeted neighbourhood \(|d_0+Y|<\delta\), or an oscillatory tail integrator. Merely extending this positive-branch grid to a larger finite endpoint would not establish accuracy there.

## 3. What is shared and how queries work

The prototype implements a radix-two Float64 FFT, with one shared transform plan. It tabulates the damped reciprocal density for \(|k_s|=0,\ldots,12\). No external library or transform dependency is needed.

It first factors out the central reciprocal-depth phase:

\[
m(\nu)=e^{2\pi i\nu v_c}H(\nu),\qquad v_c=1/d_0,
\]

\[
H(\nu)=\int g(v)e^{2\pi i\nu(v-v_c)}\,dv.
\]

Interpolating \(H\) is more accurate than interpolating the rapidly rotating complex phase directly. A query reads four neighbouring complex values, performs cubic interpolation, and restores the known phase. Queries outside the transform's frequency range throw instead of wrapping into an aliased answer. Negative \(k_s\) reuses the same damped table; signed frequency retains its phase.

Three configurations isolate two different discretizations:

| Configuration | FFT period \(T\) | Nodes | Frequency spacing | Stored complex tables | Setup in recorded run |
|---|---:|---:|---:|---:|---:|
| Coarser frequency interpolation | 2 | 65,536 | 0.5 | 13.6 MB | 40.2 ms |
| Measured working configuration | 4 | 131,072 | 0.25 | 27.3 MB | 74.1 ms |
| Doubled density-grid validation | 4 | 262,144 | 0.25 | 54.5 MB | 233 ms |

The first two have the same reciprocal grid spacing; their difference tests interpolation. The last two have the same frequency spacing; their difference tests sampling the density. The working configuration's Nyquist frequency is 16,384, covering the finite test range without wrapping.

For four-point cubic interpolation, an exact-arithmetic error bound on the truncated transform is

\[
\frac3{128}\,\Delta\nu^4(2\pi)^4
\int_{\rm kept}|v-v_c|^4f_V(v)\,dv.
\]

The integral is upper-bounded by interval upper sums in the original depth coordinate. Dropping the horizontal damping only enlarges the bound, so it applies to all retained \(k_s\). At frequency spacing 0.25 the result is **2.28×10⁻⁸**. This bounds interpolation of exact transform samples; it is not a complete floating-point or FFT-discretization certificate. Those errors are checked by refinement and the independent reference.

## 4. Validation includes the complete circles value

For individual multipliers, the independent reference is midpoint quadrature directly in Gaussian depth, after integrating \(X\). It uses 32,768 and 65,536 points. It shares no reciprocal grid or interpolation code with the transform. Tests cover \(k_s=0,1,2,6,12\), a negative horizontal harmonic, zero/nonzero vertical harmonics, cancellation directions, large frequencies, and fractional pixel positions.

| Check | Largest observed discrepancy |
|---|---:|
| Direct multiplier reference refinement | 1.71×10⁻¹⁴ |
| Transform versus direct multiplier reference | 7.08×10⁻⁹ |
| Frequency-grid refinement | 1.40×10⁻⁷ |
| Density-grid refinement | 1.57×10⁻¹⁶ |

For the complete shader, the unit-cell disc has radius \(r=5/12\), centre \((1/2,1/2)\), constant lighting \(L=0.76028592126970562\), and coefficients

\[
c_{k,l}=(-1)^{k+l}\pi r^2\frac{2J_1(2\pi r\sqrt{k^2+l^2})}
{2\pi r\sqrt{k^2+l^2}},\qquad c_{0,0}=\pi r^2.
\]

The shader-specific coefficients are evaluated by a periodic quadrature of Bessel's integral; doubling 128 to 256 angular points changes them by at most 8.33×10⁻¹⁷ here. [NIST DLMF 10.9.2](https://dlmf.nist.gov/10.9.E2). They are reusable across rows. The shader mean is \(L\sum c_{k,l}m(k,l;x)\).

The complete-source reference follows `fjet-exacty.mjs`: condition on depth, express the disc interiors as horizontal Gaussian intervals, and sum CDF differences. I added a useful reference improvement: split the outer depth integral at

\[
B/d=n+1/2\pm r.
\]

These are the exact openings and closings of a disc's vertical support. A cosine change of variable removes each interval's square-root endpoint behaviour. Across 343 nonempty panels, 32- and 64-point Gauss–Legendre rules agree to 2.50×10⁻¹⁵ on this fixture. The real CDF utility is copied unchanged from the author's exact-conditioning probe; the geometry integration is otherwise implemented locally.

This improvement matters. A 400,000-point unpartitioned midpoint rule is still **5.63×10⁻⁷** away from the converged result at \(x=120\). Its apparent residual must not be blamed on the row transform. The probe retains that dense midpoint check as a separate comparison.

| Pixel at \(y=5\) | Converged exact conditioning | Row reconstruction, cutoff 12 | Absolute difference |
|---|---:|---:|---:|
| x=0 | 0.425503898639679 | 0.425503898639680 | 3.89×10⁻¹⁶ |
| x=30 | 0.414671689506002 | 0.414671689506001 | 1.67×10⁻¹⁶ |
| x=120 | 0.417706251921101 | 0.417706251921102 | 4.44×10⁻¹⁶ |
| x=239.75 | 0.314738750256876 | 0.314738751815905 | 1.56×10⁻⁹ |
| x=240 | 0.286423692915896 | 0.286423692915896 | 2.78×10⁻¹⁶ |
| x=300 | 0.414671763366382 | 0.414671763366382 | 0 |
| x=479 | 0.406554820016866 | 0.406554820016866 | 5.00×10⁻¹⁶ |

Integer pixel positions happen to request frequencies on this table's grid. The fractional-position test is necessary: it exposes the interpolation error that the integer-pixel comparisons miss. Increasing the rectangular harmonic cutoff from 8 to 12 changes these seven results by less than displayed floating-point resolution. That is measured convergence on this row, not a hard-profile truncation theorem for all rows or scenes.

## 5. Cost and the next bounded experiment

The recorded warm query median is **54.6 ns** over five batches of 200,000 calls, excluding the constant-mode shortcut. A direct 65,536-point multiplier reference takes a median **1.34 ms**. These compare a lookup after setup with a converged numerical integral; their ratio is not a standalone rendering speedup.

The complete circles reconstruction uses 312 nonconstant queries per pixel at cutoff 12. Its 480-pixel row takes a median **9.50 ms**, or **83.6 ms including this run's shared row setup**. Constructing all three coefficient-cutoff lists separately takes another 3.34 ms in the probe; those coefficients are shader data reusable across rows. The single 64-point-per-panel full-circle reference costs roughly 14–17 ms per tested pixel. Setup timings are individual builds; warm query/row timings are five-batch medians. All are CPU/JIT measurements, not GPU or sustained frame measurements.

Keep the row-transform interface. Do not ship this dense allocation as the GPU solution. It stores a large frequency interval even where the answer is negligible; it also stores both conjugate frequency halves. The next experiment should bound or validate a much smaller frequency range per \(k_s\), exploit conjugacy, and price construction across changing rows and camera parameters. A sparse-query conditioning path remains appropriate when few multipliers are requested. None of these timings supports a 2 ms GPU claim.

The useful conceptual result is that exact perspective did not require a separate transform for each pixel. It required a shared characteristic function queried at the combined frequency. The result also suggests improving the author's standalone exact-conditioning reference by cutting at source support events before increasing sample counts.

## Reproduce without replacing someone else's output

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/gpu-followup/row-transform-probe.mjs
```

The default filename includes a timestamp. To choose one explicitly:

```sh
node paper/reviews/2026-09-05-integral-compiler/author-reply/gpu-followup/row-transform-probe.mjs --out /tmp/row-transform-my-run.json
```

The run took 1.77 seconds on the recorded machine. It imports the numeric source harness read-only, modifies no compiler/app files, records source provenance, checks finite query guards, and reports all validation gates. The exported `buildRow()` function can also be imported without running the probe. Near-pole rows deliberately fail the current domain guard rather than receiving an unsupported approximation.
