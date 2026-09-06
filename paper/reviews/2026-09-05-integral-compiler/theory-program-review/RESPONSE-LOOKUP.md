# A bounded-source contract for positive scale-space lookup

September 6, 2026. Theory only. Prefiltered pyramids and position/scale
interpolation are established graphics techniques; the primary references
are below. This note gives an explicit source-preserving error and cost
contract to compare with the compact Hermite response state.

For a fixed bounded periodic material, a per-pixel scan of its source
representation is not necessary. A finite table of filtered responses
supports a query using at most sixteen values. The price is preparation
and potentially very large storage. This does not establish a small
representation for editable general material graphs.

## 1. The unchanged material and its response

Let \(P\ge1\), and let \(F:\mathbb R^2\to[0,1]\) be measurable and
\(P\)-periodic in each coordinate. Define
\[
 U(\mu_x,\mu_y,t_x,t_y)
 =E F(\mu_x+e^{t_x/2}Z_x,\mu_y+e^{t_y/2}Z_y),
 \qquad t_x,t_y\ge0,                                    \tag{1}
\]
with independent standard normals. Thus the component variances
\(v_i=e^{t_i}\) are at least one native cell squared.
The complete composed response is \(F\): separate filtering followed by
a nonlinear combination is not part of this contract.

The independent Gaussian convolution makes \(U\) smooth in these query
parameters even when \(F\) has discontinuities. For one axis,
\[
 \partial_{\mu\mu}q_v=\frac{z^2-1}{v}q_v,\qquad
 \partial_{tt}q_v=\frac{z^4-4z^2+1}{4}q_v,
 \quad z=(x-\mu)/\sqrt v.                                \tag{2}
\]
These derivative kernels have integral zero. Subtracting \(1/2\) from
the bounded source therefore gives
\[
 |\partial_{\mu_i\mu_i}U|
 \le\frac{E|Z^2-1|}{2v_i}
 =\frac{2\phi(1)}{v_i}<\frac1{2v_i},                     \tag{3}
\]
\[
 |\partial_{t_it_i}U|
 \le\frac18 E|Z^4-4Z^2+1|
 \le\frac{\sqrt{32}}8=\frac1{\sqrt2}.                    \tag{4}
\]
Here \(E(Z^4-4Z^2+1)^2=32\). Differentiation under the integral follows
from the integrable Gaussian derivative envelopes on every compact
parameter set. No derivative or boundary count of \(F\) is required.

## 2. Positive interpolation and its error

Linear interpolation of a twice differentiable scalar function across
an interval of length \(h\) has sup error at most
\(h^2\|f''\|_\infty/8\). It is also a positive contraction in the sup norm.
Successive interpolation in several coordinates therefore adds the
one-coordinate error bounds; mixed derivative bounds are unnecessary.

For example, on a fixed four-dimensional grid, the interpolation error is
at most
\[
 \frac18\left[
 \frac{h_x^2}{2v_{x,\min}}+
 \frac{h_y^2}{2v_{y,\min}}+
 \frac{\Delta_x^2+\Delta_y^2}{\sqrt2}
 \right].                                               \tag{5}
\]
The minimum variances in (5) are over the relevant interpolation cell.

To reduce storage, each variance node has its own spatial grid. Choose
\(0<\epsilon\le1\) and a log-variance step
\(\Delta=\sqrt\epsilon\). At variance \(v_j\), use periodic spatial
spacing
\[
 h_j=P/n_j,\qquad
 n_j=\left\lceil P/(\sqrt\epsilon\sqrt{v_j})\right\rceil.
                                                               \tag{6}
\]
At each of the four surrounding variance-level pairs, interpolate
bilinearly in position on that pair's own grid. Then blend the four
values using the two log-variance weights. There are at most sixteen
scalar table reads, with nonnegative weights summing to one.

For the error proof, first interpolate the exact \(U\) only in the two
log variances at fixed position; (4) bounds that error. Replace each
resulting corner value by its own bilinear spatial approximation; (3)
bounds its error at that corner's variances, and the scale weights
are a convex combination. Different corner grids cause no extra term.
Using the looser bounds \(1/v_i\) in (3) and \(1\) in (4), each axis
costs at most \(\epsilon/8\) in position and \(\epsilon/8\) in log variance.

If \(n_j=1\), periodic interpolation has coincident endpoint values but
an interval of length \(P\); the same second-derivative bound still applies.

## 3. Close the infinite scale range

Let \(H\) be uniform probability measure on one period. For a wrapped
one-dimensional Gaussian of variance \(v\), Fourier expansion gives
\[
 \operatorname{TV}(G_{\mu,v}^{\rm wrap},H)
 \le \sum_{n\ge1}e^{-an^2},
 \qquad a=2\pi^2v/P^2.                                  \tag{7}
\]
This is uniform in the mean. If \(a\ge\log8\), then
\[
 \sum_{n\ge1}e^{-an^2}
 \le\frac{e^{-a}}{1-e^{-3a}}\le2e^{-a}.                  \tag{8}
\]
Set
\[
 v_H=\max\{1,P^2\log(8/\epsilon)/(2\pi^2)\},
 \qquad T=\log v_H,\qquad
 J=\lceil T/\Delta\rceil.                               \tag{9}
\]
For every \(v\ge v_H\), replacing that axis by its exact period average
costs at most \(\epsilon/4\) in expectation against any bounded source.

For \(j<J\), use \(t_j=j\Delta\). The terminal level \(j=J\) is attached
to \(t_J=T\), but stores the exact Haar limit rather than the Gaussian
at \(T\). Its mean coordinate disappears, so \(n_J=1\). The last scale
interval is at most \(\Delta\); replacing its upper Gaussian node by
Haar adds the allowance in (8). At and beyond \(T\), use that same
Haar row. If \(T=0\), the only level is Haar.

Each axis now has total allowance at most
\(\epsilon/8+\epsilon/8+\epsilon/4=\epsilon/2\).
The product construction has total error at most \(\epsilon\):
\[
 |U-\widetilde U|\le\epsilon
 \quad\hbox{for every mean and all }v_x,v_y\ge1.          \tag{10}
\]
One can also view each approximate axis kernel as a positive mixture of
at most four Gaussian/Haar kernels. Its uniform bounded-function error
is a TV bound, and the TV of the product is at most the sum of the two
axis bounds. This proves (10) even at the terminal rows.

The table has Gaussian/Gaussian interior values, Haar/Gaussian and
Gaussian/Haar boundary values, and the full material mean at its corner.
The lookup is continuous across position wraps, scale levels and the
terminal branch. This is continuity, not a temporal bandwidth or
motion-blur guarantee.

## 4. Storage, preparation, and actual pixel work

Store an \(n_j\) by \(n_k\) spatial grid for each level pair \((j,k)\).
Its exact scalar-entry count is
\[
 B=\left(\sum_{j=0}^J n_j\right)^2.                      \tag{11}
\]
Because \(n_j\le1+P e^{-j\Delta/2}/\sqrt\epsilon\),
\[
 \sum_jn_j
 \le J+1+
 \frac{P}{\sqrt\epsilon(1-e^{-\sqrt\epsilon/2})}
 \le \frac T{\sqrt\epsilon}+2+\frac{4P}{\epsilon}.
                                                               \tag{12}
\]
The last step uses \(1-e^{-x/2}\ge x/4\) for \(0<x\le1\).
In particular \(B=O(P^2/\epsilon^2)\) for \(P\ge1\);
the explicit bound (12) retains the scale cutoff and rounding terms.
This may be enormous at a stringent uniform error tolerance.

The query has at most sixteen fetches and a fixed number of weight and
index operations, plus log-variance evaluation. Level metadata, periodic
coordinate reduction, integer addressing, stored precision and arithmetic
are real costs. A scalar table is being counted; additional independently
stored response channels multiply its size and query work.

Acquiring the table means acquiring \(B\) Gaussian/Haar expectations of
the unchanged \(F\). If every stored value has certified absolute error
at most \(\eta\), positivity gives
\[
 |U-\widetilde U_{\rm stored}|
 \le\epsilon+\eta+\epsilon_{\rm query\ arithmetic}.
                                                               \tag{13}
\]
Clamping a stored value to \([0,1]\) cannot increase its error.
The scalar acquisition cost is the sum of the actual costs of these
\(B\) integrals. Boundedness alone supplies no certified finite-point
sampling procedure for an arbitrary measurable source.

For the structured material class in
[NOISE-PROTOTYPE-MOMENTS.md](NOISE-PROTOTYPE-MOMENTS.md), the existing
prototype tables can be acquired once and queried at each node, including
exact Haar-axis weights. A sufficient node allowance is
\(\epsilon_K+16\eta_M+\epsilon_{\rm node\ numerical}\), with the original
per-node contraction cost and prototype acquisition cost. Directly using
that oracle costs \(B\) contractions after table acquisition; no FFT
or semigroup acceleration is assumed here.

An alternative shared preparation is welcome only with its own sampling,
truncation and numerical contract. The continuous Gaussian semigroup
does not make repeated discrete pooling an exact Gaussian filter.

## 5. Tilted footprints and edits

For the admitted \(Q\succeq I\) class, use the positive mixture in
[POSITIVE-FOOTPRINT-MIXTURES.md](POSITIVE-FOOTPRINT-MIXTURES.md). Every
component has diagonal variances at least one and can use this same table.
For mixture error \(\epsilon_{\rm mix}\), its mean error is bounded by
\[
 \epsilon_{\rm mix}+\epsilon+\eta+
 \epsilon_{\rm numerical}.                             \tag{14}
\]
The work is at most sixteen reads per component, not sixteen for the
whole tilted query. Its rank and covariance/weight arithmetic remain
those of the mixture theorem. Positivity avoids a rank multiplier on
the uniform table-error allowance, but not on work.

The response table belongs to one fixed complete source \(F\).
Camera-footprint changes and a common translation of \(F\) reuse it;
translation shifts the queried mean. Changing a profile, threshold,
relative layer configuration or lighting that changes \(F\) generally
changes its entries. Such edits need an additional control representation
or a rebuild. Periodic source structure and admitted affine reparameterizations
can be used explicitly; they do not imply arbitrary-edit reuse.

The table proves that source evaluation cost can be moved out of the pixel.
It does not prove that acquisition, memory, dynamic updates, or anisotropic
mixture rank meet a game budget. The Hermite response-state route offers
a different tradeoff: more query arithmetic with a higher-order local
representation and potentially much less storage.

## Primary prior and the role of this comparison

- Williams, [Pyramidal Parametrics
  (1983)](https://www.cs.cmu.edu/afs/cs/academic/class/15869-f11/www/readings/williams83_mipmap.pdf),
  sections 2--3, describes prefiltered levels with interpolation within
  and between levels, periodic wrapping, and fixed query work independent
  of footprint area. Its described implementation uses box prefilters
  and identifies symmetric filtering as a limitation.
- Liu et al., [Rip-NeRF: Anti-aliasing Radiance Fields with Ripmap-Encoded
  Platonic Solids (2024)](https://arxiv.org/abs/2405.02386), section 3.2,
  uses tetra-linear lookup in two position and two logarithmic scale
  coordinates, with anisotropically pooled learned feature grids.
  That is direct architectural prior; learned features and their decoder
  are not the unchanged bounded material response used in this theorem.

This is an explicit sufficient contract for a classical architecture,
not a new claim to prefiltering or ripmaps. It provides a useful comparison:
neither a full per-pixel source contraction nor a particular signed
representation's large error majorant is an intrinsic necessity.
The remaining research question is which material and control structures
allow a substantially better preparation/storage/query tradeoff.
