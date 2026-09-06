# Filtering a specified permutation-hash noise across all diagonal scales

2026-09-06. Theory only: no implementation, benchmark or GPU timing.

This proves a conditional arithmetic-cost result for linear Perlin-style
gradient noise with a specified nested permutation hash. Its useful
structure is a permuted circular convolution, rather than low rank.
It also supplies the filter weights, including their truncation error.
The Fourier and reconstruction tools are classical; no novelty claim is
made for those tools or for the application without a fuller literature check.

## 1. Source and arithmetic model

Let π be a permutation of Z/PZ. All indices below are modulo P.
On a fixed integer z=k slice, the hash in
[Perlin's reference implementation](https://cs.nyu.edu/~perlin/noise/) is

\[
 H(i,j,k)=\pi(\pi(\pi(i)+j)+k).
\]

The period is imposed by the integer indexing and permutation. It is
not a consequence of floating-point rates being rational. The reference
uses P=256, quintic fade, and gradients whose coordinate components
are in {−1,0,1}.

Let γ_x and γ_y extract those gradient components, and define

\[
 f^\ell_k(r)=\gamma_\ell(\pi(\pi(r)+k)),\qquad
 G^\ell_{ij}=f^\ell_k(\pi(i)+j),\quad \ell\in\{x,y\}.
\]

Write fade(t)=6t⁵−15t⁴+10t³ on [0,1], and define compact basis functions

\[
 \phi_0(t)=
 \begin{cases}1-\operatorname{fade}(|t|),&|t|\le1,\\0,&|t|>1,\end{cases}
 \qquad \phi_1(t)=t\phi_0(t).
\]

The continuous noise on the slice is

\[
 F(x,y)=\sum_{i,j\in\mathbb Z}
 \left[
 G^x_{ij}\phi_1(x-i)\phi_0(y-j)
 +G^y_{ij}\phi_0(x-i)\phi_1(y-j)
 \right].
 \tag{1}
\]

This is locally a finite sum. It is a tensor polynomial per lattice cell,
of degree at most six in each coordinate and eleven in total.
The vertical-gradient term vanishes on an integer z slice.

We count exact real/complex arithmetic, FFT operations, elementary
functions, and fixed-degree Gaussian moments as primitives. Numerical
precision, stable cancellation, input bit lengths and GPU execution
are separate costs. The footprint coordinates are independent Gaussians
in the native noise axes, including a zero-variance coordinate by continuity.
Nonlinear coordinate warps and nonlinear functions of F are excluded.

## 2. A finite coefficient table is not a finite harmonic spectrum

Periodize each generator:
\(\Phi_{r,P}(t)=\sum_{j\in\mathbb Z}\phi_r(t-jP)\).
With the unnormalized DFT of each P×P gradient array and
\(\xi_n=2\pi n/P\), the continuous Fourier coefficient is

\[
 \widehat F(n)=P^{-2}\left[
 \widehat G^x_{n\bmod P}
 \widehat\phi_1(\xi_{n_x})\widehat\phi_0(\xi_{n_y})
 +\widehat G^y_{n\bmod P}
 \widehat\phi_0(\xi_{n_x})\widehat\phi_1(\xi_{n_y})
 \right],\quad n\in\mathbb Z^2.
 \tag{2}
\]

Here \(\widehat\phi(\xi)=\int_{\mathbb R}\phi(t)e^{-i\xi t}dt\).
Unfolding a periodized generator's integral gives
\(\int_0^P\Phi_{r,P}(x-i)e^{-i\xi_nx}dx
=e^{-i\xi_ni}\widehat\phi_r(\xi_n)\), proving (2).

Only the DFT index is reduced modulo P. The analytic basis factors
use the full harmonic, including all replicas. In particular,

\[
 \widehat\phi_0(\xi)
 =2\int_0^1(1-10t^3+15t^4-6t^5)\cos(\xi t)\,dt,\qquad
 \widehat\phi_1(\xi)=i\widehat\phi'_0(\xi).
\]

They have elementary expressions, with removable singularities at zero:
\(\widehat\phi_0(0)=1\), \(\widehat\phi_1(0)=0\).
Their L¹ norms are 1 and 2/7, respectively.

For a simple counterexample to discarding replicas, take P=1,
G^x=1 and G^y=0 in the reconstruction family. On [0,1],
F(x,y)=x−fade(x), and F(1/4,y)=75/512. The sole gradient DFT entry is
DC, but the continuous DC vanishes; its other harmonics carry the signal.
This example concerns the reconstruction family, not a claim that this
particular coefficient choice is the P=1 reference hash.

## 3. Exact filtering becomes two structured contractions

For independent X and Y, define four P-vectors

\[
 (u_r)_i=\mathbb E[\Phi_{r,P}(X-i)],\qquad
 (v_r)_j=\mathbb E[\Phi_{r,P}(Y-j)],\quad r=0,1.
\]

Then

\[
 \mathbb E F(X,Y)=u_1^{\mathsf T}G^xv_0+
                  u_0^{\mathsf T}G^yv_1.
 \tag{3}
\]

For an arbitrary dense G, separability alone would leave a double sum.
For the specified hash, G_ij=f(π(i)+j). Push u through the permutation,
\(w_r=u_{\pi^{-1}(r)}\), and use the unnormalized DFT
\(\widehat w_l=\sum_rw_re^{-2\pi ilr/P}\). Direct substitution gives

\[
 \boxed{
 u^{\mathsf T}Gv
 =\frac1P\sum_{l=0}^{P-1}
 \widehat f_l\,\widehat w_{-l}\,\widehat v_{-l}.
 }
 \tag{4}
\]

The frequency reversals are essential. This is a bilinear formula,
with no inserted complex conjugation.

Precompute the two transforms of f in O(P log(2P)) arithmetic and O(P)
memory. Each query uses four transforms of weight vectors, two permutations,
and linear products/sums. Its contraction work is O(P log(2P)).
There is no P×P coefficient table and no low-rank hypothesis.
A row permutation preserves singular values, so the matrix may still
have full rank.

## 4. Constructing the weights with an explicit error

For these kernels,

\[
 \sum_{j\in\mathbb Z}\phi_0(x-j)=1,\qquad
 \sum_{j\in\mathbb Z}|\phi_1(x-j)|\le1.
\]

Thus every true weight vector has L¹ norm at most one. Fix a target
weight-vector error 0<δ≤1.

### Narrow or moderate Gaussian: σ≤P

Choose
\[
 R=\sqrt{2\log(2/\delta)}.
\]
Retain every complete basis support intersecting [μ−Rσ,μ+Rσ].
Integrate those basis functions against the Gaussian, and fold their
integer centres modulo P. Omitted basis functions vanish inside the
interval. Partition of unity and the absolute bound above show that
either vector's L¹ error is at most the omitted Gaussian mass, hence
at most δ.

The number of retained supports is O(1+σR). Each basis has two
polynomial pieces of degree at most six, so fixed-degree truncated
Gaussian moments evaluate each integral. Including initialization, the
cost is O(P+1+σR), at most O(P[1+R]) in this branch.
At σ=0 evaluate the local basis directly.

### Broad Gaussian: σ>P

The exact periodized weight vector is

\[
 u_r(i)=\frac1P\sum_{n\in\mathbb Z}
 \widehat\phi_r(2\pi n/P)
 e^{i2\pi n(\mu-i)/P}e^{-an^2},
 \qquad a=2\pi^2\sigma^2/P^2>2\pi^2.
 \tag{5}
\]

Since \(|\widehat\phi_r|\le1\), truncating |n|≤N gives

\[
 \|u_r-u_{r,N}\|_1
 \le\sum_{|n|>N}e^{-an^2}
 \le\frac{e^{-aN^2}}{aN}\quad(N\ge1).
 \tag{6}
\]

The factor 1/P cancels when summing the P entry errors. The last
bound follows by comparing the two decreasing tails with their Gaussian
integrals. The explicit choice

\[
 N=\max\left\{1,\left\lceil
 \sqrt{\frac{\log(1/\delta)}{2\pi^2}}\right\rceil\right\}
\]

makes (6) at most δ. Direct evaluation of all entries costs O(PN).
Only O(N) kernel factors need be generated; they can be shared.
This branch's weights need not be positive, so their errors are charged
as signed approximations.

## 5. Complete restricted cost theorem

Assume |G^x_ij|,|G^y_ij|≤1. Approximate each of the four weight vectors
with L¹ error at most δ. For one contraction, the error is at most

\[
 \|(u-\widetilde u)\|_1\|v\|_1+
 \|\widetilde u\|_1\|(v-\widetilde v)\|_1
 \le2\delta+\delta^2.
\]

The two terms in (3) therefore have combined error at most
4δ+2δ². For 0<ε≤1, choose δ=ε/6. This proves an ε approximation
uniformly in the Gaussian means and both coordinate variances, with

\[
 \boxed{
 \begin{aligned}
 \text{preprocessing}&=O(P\log(2P)),\\
 \text{query arithmetic}&=
 O\!\left(P\log(2P)+P[1+\sqrt{\log(1/\varepsilon)}]\right),\\
 \text{stored source/transforms}&=O(P),\\
 \text{query workspace}&=O(P+\sqrt{\log(1/\varepsilon)}).
 \end{aligned}
 }
 \tag{7}
\]

The cost includes weight construction, periodization truncation and
the structured contractions. Its dependence on Gaussian width has
disappeared by selecting between the two weight representations.
The tolerance here covers analytical truncation; finite-precision
evaluation must receive its own budget.

For a fixed noninteger z slice, the two neighbouring layers combine
their x/y terms and add a third scalar-basis term from the z gradients.
Each resulting coefficient sequence retains the same row permutation.
This supplies a constant-number-of-contractions extension, with its
own component amplitude/error factors; (7) was proved explicitly for
the integer slice.

## 6. Scope and the remaining question

The theorem uses a particular source hash and a separable Gaussian in
native noise coordinates. A different hash, correlated footprint,
oblique 3D slice, nonlinear domain warp, threshold or lighting transfer
needs another argument. Changing coordinates to diagonalize a Gaussian
does not preserve the lattice basis automatically.

This result improves a representation's arithmetic cost. It is not
a GPU performance measurement, a claim that a few FFTs per pixel meet
a frame budget, or a lower bound on other approaches. Precomputed
textures and batch filtering have different time/storage tradeoffs.

The broader lesson is concrete: reconstruct the continuous source from
its finite generators, then exploit the actual algebra of those
generators. A finite table, a separable window and an exact quotient
each help only when the remaining interaction cost is also controlled.
