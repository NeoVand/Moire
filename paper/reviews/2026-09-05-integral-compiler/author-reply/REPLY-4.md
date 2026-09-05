# Reply 4: your kernels reproduce; exact conditioning is in the compiler, with a witness

## 1. Reproduction of the four packages

All four ran here (Apple M-series, Node 24, Chrome through the repository's puppeteer for the two WebGPU probes).

- **Bessel.** `bessel-test.mjs --reference bessel-reference-v1`: CPU table maximum absolute errors $7.6\times10^{-8}, 4.8\times10^{-8}, 5.7\times10^{-8}$ for $J, J', J''$; GPU table $5.43\times10^{-8}, 4.9\times10^{-8}, 6.5\times10^{-8}$, the same $5.43\times10^{-8}$ you report. `bessel-bench.mjs` on the GPU: median $1.04$ ms per batch, $126$ ns per argument.
- **Coverage.** `coverage-gpu-probe.mjs`: all adapter calls accepted; $25.6$ million interval calls a second here against your $31$ million, the same order.
- **Row transform.** `row-transform-probe.mjs`: all gates pass; $27.3$ MB and $67$ ms of setup for the row, interpolation bound $2.3\times10^{-8}$, depth-tail bound $2\times10^{-19}$.
- **Fire controls.** `fire-controls-test.mjs`: $3{,}564$ divergence checks, maximum relative error $1.3\times10^{-6}$, source error $3\times10^{-13}$.

Your correction to my standalone reference is taken: the outer depth integral should be cut where a disc's vertical support opens or closes, and my $400{,}000$-point midpoint rule was $5.6\times10^{-7}$ from the cut rule. The compiler's own result below agrees with the cut value to the digits it prints, so nothing I concluded from the reference changes, but the reference script now carries your note.

## 2. Exact conditioning on depth is in the compiler, and a witness decides where

The harness can trace in $(X, W)$ with $W = Y_0^2(1/d - 1/Y_0)$, which is $-Y$ to first order and makes $1/d$ exactly linear, so the plane's $s$ is exactly bilinear and $t$ exactly linear; $X$ stays the pixel's own coordinate, so at fixed depth it is exactly the pixel's Gaussian. `Pixel.setDepth` carries the Gaussian in $Y$ to Gauss–Legendre nodes in $W$ over $\pm5\sigma$, and every spectral term expectation becomes the sum over nodes of the existing exact line integral along $X$ (the compiler's line condition, `dim 1`, with the node as the point). Twenty-four nodes already converge; the default is thirty-two.

Results at the horizon, against the exact standalone values for circles and against deterministic two-dimensional references ($3{,}000$ to $6{,}000$ point midpoint rules over six sigma) where a million samples could not decide:

| pixel | ordinary model | depth model | reference |
|---|---:|---:|---:|
| circles $(240,5)$ | $0.28482$ | $0.28642$ | $0.286424$ |
| circles $(300,12)$ | $0.42095$ | $0.42122$ | $0.421217$ |
| circles $(240,20)$ | $0.03252$ | $0.03259$ | $0.032576$ |
| circles $(30,5)$ | $0.41467$ | $0.41467$ | $0.414672$ |
| zigzag $(240,5)$ | $0.28542$ | $0.28577$ | $0.285773$ |
| colour circles $(240,5)$ | $0.08760$ | $0.08847$ | $0.08862 \pm 0.00015$ (a million samples) |
| colour circles $(30,5)$ | $0.14538$ | $0.14568$ | $0.1457$ (reference still converging) |

The last $4\times10^{-5}$ at circles $(240,5)$ was the recipe cut, not the quadrature: at a cut of $10^{-5}$ the value is $0.28642$ against $0.286424$.

Two things went wrong on the way and are recorded, because they bear on your organising sentence. First, a surface-coordinate variant, $p = -s/(50v_0) - X_0$ and $q = W$, in which every count of degree two in $(s,t)$ is exactly a second-order jet, was tried and rejected: it moves a count's depth dependence into the measure's node-dependent mean, which the enumeration cannot see, so an off-centre pixel keeps recipes that turn hundreds of times over the depth nodes (circles $(30,5)$ came out $0.4198$ for $0.4147$). The coordinates that preserve the geometry and the coordinates in which the measure is simple are different things, and the enumeration must see the rate in the measure's coordinates: that is your "which coordinates preserve the needed geometry" and "which representation makes the integral reusable" as two decisions, met in practice. Second, the $(X, W)$ model is exact for counts affine in $(s,t)$ and not for others ($s^2$ is quartic in $(X, W)$), and a first witness that probed only the centre line $X = 0$ passed the quadratic sine, whose error sits in the mixed $XW$ terms. The witness now compares the centre model's counts, coefficient jets and field coefficient jets with fresh traces at six points of the reach, corners included, and declines depth mode where any disagrees by more than $10^{-4}$. Accepted: checkerboard, circles, zigzag, colour circles (count errors $10^{-14}$). Declined: the quadratic sine ($0.54$ periods off at a corner), fire ($0.04$), and checkerboard with bumps, where the parallax field's coefficient carries the truncated viewer ($0.31334$ against a deterministic $0.31294$, the ordinary model's $0.31303$ being closer). So the witness is what you said it should be, a rejection heuristic choosing between two models, not a certificate, and it earns its keep.

Depth mode is now the harness default for rows with $Y_0 \le 48$; every other benchmark probe pixel is unchanged. Cost: the closed form becomes thirty-two line integrals per spectral term, colour circles $(300,12)$ going from $0.4$ to $4.3$ s. Your row-shared transform is the amortisation of exactly this cost, and its $27$ MB is the thing to shrink.

## 3. Your request 1: what the provider is asked for

The probe line now reports, per pixel, the largest requested argument $|\theta|\cdot h$, the largest sideband order kept, the route (analytic provider or tables) with its window, the number of surviving shift recipes (those passing the multiplier cut and summed into the pixel), and the amplification, the sum of the surviving contributions' magnitudes, which bounds how a relative coefficient error $\epsilon$ reaches the pixel ($\le \epsilon\times$ amplification). At the published amplitude and twice it (depth mode declined by the witness at every $(300,12)$ here, the parallax coefficient carrying the truncated viewer):

| scene, pixel | amplitude | $\theta h$ | order kept | route, window | surviving recipes | amplification | O terms |
|---|---:|---:|---:|---|---:|---:|---:|
| zigzag ripples $(300,12)$ | $1\times$ | $14.2$ | $20$ | analytic, 43 | $0$ | $0$ | 23 |
| zigzag ripples $(120,34)$ | $1\times$ | $4.0$ | $4$ | analytic, 46 | $66$ | $0.085$ | 21 |
| zigzag ripples $(400,60)$ | $1\times$ | $16.5$ | $18$ | analytic, 48 | $240$ | $0.78$ | 23 |
| zigzag ripples $(300,12)$ | $2\times$ | $28.3$ | $20$ | analytic, 66 | $0$ | $0$ | 63 |
| zigzag ripples $(120,34)$ | $2\times$ | $8.0$ | $4$ | analytic, 74 | $68$ | $0.074$ | 63 |
| zigzag ripples $(400,60)$ | $2\times$ | $32.9$ | $18$ | analytic, 77 | $316$ | $0.71$ | 63 |
| checkerboard bumps $(300,12)$ | $1\times$ | $15.9$ | $16$ | tables 64, 16 | $18$ | $0.96$ | 125 |
| checkerboard bumps $(120,34)$ | $1\times$ | $15.4$ | $16$ | tables 64, 16 | $334$ | $2.35$ | 125 |
| checkerboard bumps $(400,60)$ | $1\times$ | $15.2$ | $16$ | tables 64, 16 | $1{,}034$ | $4.30$ | 125 |
| checkerboard bumps $(300,12)$ | $2\times$ | $31.8$ | $16$ | tables 64, 16 | $22$ | $0.73$ | 1,789 |
| checkerboard bumps $(120,34)$ | $2\times$ | $30.9$ | $16$ | tables 64, 16 | $580$ | $2.01$ | 1,789 |
| checkerboard bumps $(400,60)$ | $2\times$ | $30.5$ | $16$ | tables 64, 16 | $1{,}620$ | $3.87$ | 1,789 |
| colour circles bumps $(300,12)$ | $1\times$ | $12.7$ | $16$ | tables 64, 16 | $386$ | $0.28$ | 125 |
| colour circles bumps $(120,34)$ | $1\times$ | $13.3$ | $12$ | tables 64, 16 | $12{,}700$ | $2.71$ | 125 |
| colour circles bumps $(300,12)$ | $2\times$ | $25.5$ | $16$ | tables 128, 16 | $564$ | $0.23$ | 1,789 |
| colour circles bumps $(120,34)$ | $2\times$ | $26.6$ | $12$ | tables 64, 16 | $16{,}508$ | $2.49$ | 1,789 |

Readings. The amplification stays below $4.3$ on the benchmark, so your float32 table's $3.4\times10^{-7}$ coefficient bound costs at most $1.5\times10^{-6}$ a pixel: accuracy is not what the table needs more of. The orders the analytic route keeps ($18$ to $20$) sit just above the old window and well below the argument, so the truncation is governed by the multiplier, not by Bessel decay, and a bounded table to order $42$ covers every request here; at twice the amplitude the tables still cap at $16$ while the argument is $31$, which is the one place I would expect a measurable truncation and have not yet measured. The number of surviving recipes is the cost: $12$ to $16$ thousand at colour circles $(120,34)$, and that is what a real-time path must bound. And the shading's spectrum is the other cost: $125$ terms at the published amplitude, $1{,}789$ at twice it, because the relu's kink enters the visible range as the bumps steepen; at that point even the tables need $1{,}741$ theta nodes and $2.9$ s. A per-shader spectrum of the shading, cut at the $10^{-5}$ that changes a pixel by $5\times10^{-9}$, is what the GPU form should hold.

## 4. Your request 2: the coverage terms

The compiler's coverage path fires for a hard picture of a count that is mostly curvature; on the benchmark's probe pixels that is rare, and the terms it meets are single-factor, so the correlated case the adapter exercises does not yet arise in the benchmark itself. I will instrument the path to record, per pixel, the conditional calls per surviving term and the mask and phase jets, and run the frozen family through it, but the honest present answer is that the joint lowering's cost question is decided by shaders outside the twelve, which is one more reason for the held-out family. The one-dimensional mask inversion you propose is worth trying on the adapter's three synthetic terms first; they are in `author-probes/correlated-coverage-adapter.mjs` with their references.

## 5. On the fire controls

Fourteen to sixteen times at one pixel and a loss at two others is the answer to the question we froze, and it is a useful one: the controls are a per-pixel option to be priced by a pilot, not a route. I take your point that the pilot-free model oracle cannot price nonlinear source controls; for the demo this means the analytic path everywhere the witness accepts a model, and a sampled fallback with a pilot only where it does not.

## 6. The organising sentence

"Compile the joint distribution induced by the coordinates, then price the remaining integral" is right, and the depth work is its first full instance: the coordinates $(X, W)$ preserve the geometry, the line integral at fixed $W$ makes the inner integral closed form, and the outer quadrature is priced against the row-shared table. I would add one clause from this week: the coordinates that preserve the geometry must also be ones in which the enumeration can see every rate, or the pruning will keep terms the quadrature cannot integrate.

## 7. Next

Mine: the joint coverage lowering (your primitive as the inner integral), the axis merge for fire with bumps, and the GPU emitter for the far-field spectral path, which the depth work now makes exact on the plane demos. Yours, if you take them: shrinking the row transform's table (the $27$ MB is dense in harmonics that the cut would drop), the one-dimensional mask inversion on the adapter's terms, and the fire pilot's cost as a function of sample count, so the selector can be priced.
