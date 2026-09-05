# The row transform now stores 10.8 KB, with bounds for the actual depth measure

The 27.3 MB dense table is replaced by **10,760 bytes of retained numeric data**, a **2,534× reduction**. This is a callable transform built without constructing a dense FFT first. It passes 610 mode checks across three depth/window settings and ten complete circles pixels at `y=5`. Maximum observed mode error is **1.25×10⁻⁹**; maximum complete-pixel error is **1.38×10⁻¹¹** against converged exact conditioning.

The implementation is [row-compact.mjs](row-compact.mjs). The representative result is [row-results-2026-09-05T16-53-33-445Z.json](row-results-2026-09-05T16-53-33-445Z.json); [row-compact-test.mjs](row-compact-test.mjs) reproduces it. Setup remains a real cost: **20–45 ms** across the recorded builds, followed by **1.49 ms for the 480-pixel circles row** on an Apple M4 CPU. This establishes a small reusable representation, not a full-frame or GPU budget.

The important change is that both omissions use the **actual reciprocal-depth measure**. A large horizontal harmonic is removed only when its whole characteristic function is small. A large combined frequency is removed only when integration by parts bounds that same characteristic function. No Gaussian model in the transformed depth coordinate decides either cutoff.

## Exact source and callable scope

The source remains

\[
u=A(x-x_c+X)/D,\quad w=B/D,\quad D=d_0+Y,
\quad X,Y\stackrel{\rm iid}{\sim}\mathcal N(0,\sigma^2),
\]

with \(A=-2.5,B=-600,x_c=240\) for the plane's unit-period counts \(s/20,t/20\). For a fixed phase \(2\pi(k_su+k_tw)\), horizontal Gaussian integration gives

\[
m_{k_s}(\nu)=\int f_V(v)e^{-\gamma v^2}e^{2\pi i\nu v}\,dv,
\quad V=D^{-1},\quad
\gamma=2\pi^2\sigma^2A^2k_s^2,
\quad\nu=Ak_s(x-x_c)+Bk_t.
\]

This uses the exact perspective geometry. It is not the compiler's local Gaussian model in \(W\).

```js
import { buildCompactRow } from './row-compact.mjs';
const row = buildCompactRow({ d0: 6, sigma: 0.5, maxKs: 12, absTol: 1e-8 });
const complexMean = row.query(1, 0, 239.75);
const atCombinedFrequency = row.queryFrequency(0, 324 / (2 * Math.PI));
const output = new Float64Array(2);
row.queryFrequencyInto(0, 10.137, output); // allocation-free query
```

The table indexes **integer horizontal harmonics** with \(|k_s|\le\texttt{maxKs}\). Vertical harmonics and combined frequencies may be real. A negative frequency uses conjugacy; positive and negative horizontal harmonics share the same damping. Zero frequency is real, and \(m_0(0)=1\) is returned exactly.

The direct contract is a **fixed affine surface phase with constant amplitude**. General colour-circle expressions, additive frequencies with noninteger horizontal coefficients, varying lighting jets, joint masks, or nonlinear surface counts are not drop-in calls to this table. Some need additional damped families or amplitude-weighted moments. The compiler must retain that distinction and budget coefficient amplification separately: a multiplier error \(\epsilon\) contributes at most \(|c|\epsilon\) to a constant-coefficient term, not automatically \(\epsilon\) to the entire pixel.

## Truncation and horizon convention

The source is the full, unclipped Gaussian footprint, including both signs of depth. There is no front-plane renormalization. At the primary fixture, \(d_0=6,\sigma=0.5\), keeping \(|Y|\le8\sigma\) means \(D\in[2,10]\), hence \(v\in[0.1,0.5]\). The omitted mass satisfies

\[
\epsilon_{\rm depth}\le2\phi(8)/8=1.2631\times10^{-15}.
\]

This includes the omitted negative-depth branch and the reciprocal tail. It is the ordinary Gaussian tail inequality applied **before** taking the reciprocal; the reciprocal density itself has an algebraic tail. [NIST DLMF §7.8](https://dlmf.nist.gov/7.8).

The constructor refuses a retained depth interval that reaches the pole, an unrepresentable window scale, an unfunded tail error, or an exceeded construction budget. Rows with \(d_0\le L\sigma\) require two reciprocal branches and a separate pole-neighbourhood budget. They do not silently receive this positive-interval approximation.

For \(k_s=0\), damping is exactly one. Its full reciprocal fourth and higher absolute moments do not exist. All derivative/interpolation moment bounds below therefore concern the finite retained interval, followed by the explicit omitted-mass bound. The zero-horizontal mode is not approximated by a Gaussian and is not discarded as a special case.

## Why almost all of the dense table disappears

Write \(g(v)=f_V(v)e^{-\gamma v^2}\) on the retained interval \([a,b]\).

First, positivity gives a frequency-independent bound:

\[
|m_{k_s}(\nu)|\le\int_a^b g(v)\,dv+\epsilon_{\rm depth}.
\]

Interval upper sums in the original depth coordinate bound that integral. At the primary row, every \(|k_s|\ge6\) is below the allocated \(2\times10^{-9}\) omission budget. For example, the bound at \(k_s=6\) is \(2.71\times10^{-11}\). These harmonics need no table at any frequency.

Second, repeated integration by parts gives, for \(\omega=2\pi|\nu|>0\),

\[
|\!\int_a^b g(v)e^{i\omega v}dv|
\le\sum_{j=0}^{p-1}\frac{|g^{(j)}(a)|+|g^{(j)}(b)|}{\omega^{j+1}}
+\frac{\|g^{(p)}\|_1}{\omega^p}.
\]

The endpoint terms are retained: cutting the density does not make them zero. The implementation takes the best bound for \(p=1,\ldots,8\), adds the depth tail, and finds a cutoff beyond which returning zero fits the omission budget. The bound decreases with frequency, so the zero shortcut applies to **all** higher frequencies, not merely sampled ones.

For reproducible derivative bounds, set \(z=(D-d_0)/\sigma\) and write

\[
g^{(p)}(v)=g(v)R_p(z)/D^p,\qquad R_0=1.
\]

Exact differentiation gives the polynomial recurrence

\[
R_{p+1}=-D^3R'_p/\sigma+
[(p-2)D^2+D^3z/\sigma-2\gamma]R_p.
\]

Interval polynomial ranges and density bounds supply both the \(L^1\) derivative bounds and the suprema used by quadrature. The resulting primary-row representation is:

| \(|k_s|\) | Largest stored positive frequency | Degree-15 pieces | Construction quadrature nodes |
|---:|---:|---:|---:|
| 0 | 332.19 | 16 | 1,320 |
| 1 | 286.13 | 12 | 1,088 |
| 2 | 214.91 | 6 | 720 |
| 3 | 147.83 | 3 | 416 |
| 4 | 90.94 | 2 | 224 |
| 5 | 46.29 | 1 | 120 |
| 6–12 | uniformly omitted within budget | 0 | 0 |

The dense prototype covered both frequency signs out to roughly 16,384 for every harmonic. This one stores only **40 small polynomial pieces**, shares the negative-frequency half by conjugacy, and proves an omission budget for the rest in exact arithmetic.

## Interpolation and construction error

As before, remove the central reciprocal-depth phase:

\[
m(\nu)=e^{2\pi i\nu/d_0}H(\nu).
\]

On each frequency interval of width \(h\), interpolate \(H\) at 16 Chebyshev roots. With

\[
M_{16}=\int_a^b |v-1/d_0|^{16}g(v)\,dv,
\]

the ordinary interpolation remainder gives

\[
|H-P_{15}|\le\frac{2(\pi h/2)^{16}M_{16}}{16!}.
\]

Interval upper sums bound \(M_{16}\). The piece widths are chosen from this bound, not only from a convergence test. This is the standard interpolation remainder applied to the truncated characteristic function. [NIST DLMF §3.3](https://dlmf.nist.gov/3.3).

The sample values are constructed by composite eight-point Gauss–Legendre quadrature in reciprocal depth. Its derivative bound includes the oscillatory factor through

\[
\|(g e^{i\omega v})^{(16)}\|_\infty
\le\sum_{j=0}^{16}\binom{16}{j}|\omega|^{16-j}\|g^{(j)}\|_\infty.
\]

The standard Gauss remainder determines a sufficient panel count. [NIST DLMF §3.5(v)](https://dlmf.nist.gov/3.5#v). A conservative factor of 31 bounds amplification of sample error through the 16-point cosine transform and polynomial evaluation. Primary-row active-query analytic budgets range from approximately \(1.22\times10^{-9}\) to \(3.02\times10^{-9}\), below the requested \(10^{-8}\). Zero shortcuts have their separate bound of at most \(2\times10^{-9}\).

**Qualification:** these are analytic bounds in exact arithmetic. Polynomial interval ranges are padded in Float64, but the full implementation does not use directed rounding or interval versions of transcendental functions. The recorded test separately checks numerical error and refinement. It would be incorrect to label this an end-to-end machine-certified error bound.

## Validation and the pruning witness

The suite includes all 81 earlier multiplier fixtures, fresh frequencies inside every active range, frequencies immediately below and above each cutoff, polynomial-piece boundaries, omitted harmonics, negative-frequency conjugacy, and altered windows \((d_0,\sigma)=(13,0.5),(6,0.625)\). Each fresh reference integrates directly in Gaussian depth at 32,768 and 65,536 points. The maximum reference refinement difference is \(1.85\times10^{-14}\). Both additional settings retain 13,320 numeric bytes; the 10,760-byte figure is specifically the original row.

The current numeric source matches the exposed circle geometry at 30 points, including both sides of the horizon, with zero discrepancy in the recorded test. Complete circles values use the original disc coefficients and a separate source-boundary-partitioned exact-conditioning reference at Gauss orders 32 and 64. Ten pixels include `30.137`, `120.317`, `239.75`, and `240.001`, so accuracy cannot be an accident of landing on grid nodes. The full-pixel discrepancy is at most \(1.38\times10^{-11}\); reference refinement is at most \(2.50\times10^{-15}\). Harmonic cutoffs 4, 8 and 12 are recorded separately. This remains measured hard-profile convergence, not an all-scene truncation theorem.

The new compiler-pruning witness is especially useful. For

\[
W=36(1/D-1/6),\qquad\theta=9W,
\]

the actual full-Gaussian multiplier is

\[
\mathbb E e^{i\theta}
=-0.000857247249167+0.000436911305578i,
\]

whose magnitude is **0.000962166480**. A Gaussian model in \(W\) predicts only **0.0000400652974**, crossing the wrong side of a \(10^{-4}\) cut. The compact transform retains it and agrees with the direct source integral. This uses the full Gaussian convention; a compiler integral cut at five sigma is a separately truncated reference.

## Memory and CPU cost, including construction

| Memory quantity, primary row | Recorded bytes |
|---|---:|
| Retained coefficient/descriptor buffers | 10,760 |
| Peak logically live owned numeric buffers, including scratch | 34,440 |
| All owned numeric buffers allocated over construction | 104,976 |
| Observed post-GC ArrayBuffer increase | 10,760 |
| Observed post-GC JavaScript heap increase | 184,872 |
| Largest sampled JavaScript heap increase during construction | 2,287,656 |

There is no unreported dense construction grid. Numerical scratch is released after each harmonic. Logical release differs from garbage collection: sampled process ArrayBuffers peaked 91,024 bytes above baseline in this run, while logically live owned buffers peaked at 34,440. The JavaScript heap includes objects, metadata, runtime/JIT effects and temporary allocation; it is not included in the 10.8 KB table payload. Process checkpoints are sampled observations, not a continuous total-process high-water measurement. After two explicit collections, the measured ArrayBuffer increase equals the retained-data accounting exactly.

On the recorded Apple M4 / Node 24 run:

- Cold setup: **41.1 ms**. Three further builds: **32.7, 41.7, 19.8 ms**. The separately memory-instrumented build took **44.7 ms**.
- Active polynomial interpolation: **126 ns/query** median over five batches of 200,000 calls.
- Mixed fixture queries, including bounded zero shortcuts: **79.7 ns/query**.
- Complete 480-pixel circles row at cutoff 12: **1.49 ms** median; **46.2 ms** with the separately measured setup.

Active interpolation is more arithmetic than the dense table's four-node lookup. The full-row gain comes from avoiding work for most harmonics and combined frequencies. This is a CPU experiment; it does not establish GPU throughput, a sustained moving-camera budget, or a general compiler speedup. Different rows/window parameters change the measure and require rebuilding or a separately validated cache/interpolation scheme. Setup is still the next cost to amortize.

## Reproduce

```sh
node --expose-gc paper/reviews/2026-09-05-integral-compiler/author-reply/next-followup/row-compact-test.mjs
```

The complete recorded run took about 1.70 seconds. Outputs are timestamped by default; `--out NEW_FILE.json` selects a path and refuses to overwrite an existing file. `--expose-gc` enables the retained-memory cross-check. The tests also refuse unsupported pole windows and construction budgets. No compiler or app file is changed.

The next integration step is to make enumeration ask for this measure's multiplier or bound. Keeping an exact depth integral behind a Gaussian-in-depth pruning test still loses valid terms before the integral is evaluated. The compact representation removes the memory objection to sharing the right quantity; it does not remove that semantic obligation.
