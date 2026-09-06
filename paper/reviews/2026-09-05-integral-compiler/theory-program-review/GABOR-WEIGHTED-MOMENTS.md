# Shared Gabor features for polynomial footprint corrections

2026-09-06. Theory only; no implementation or benchmark. The weighted
tail argument was independently derived and reviewed. This extends
[GABOR-GRAM-LAW.md](GABOR-GRAM-LAW.md) to the mean queries required by
[PROJECTIVE-DENSITY.md](PROJECTIVE-DENSITY.md). The Hermite algebra is
classical; novelty of this particular construction is not established.

The result is conditional but concrete: polynomial corrections to the
Gaussian footprint can reuse aggregated features of a finite Gabor
intensity. They do not require enumerating every atom pair. A small
feature buffer captures all retained/discarded cross terms, and a
polynomial-weighted Poisson tail bounds the remaining error.

## 1. Source and coordinate contract

Use the finite authored source

\[
 f_j(x)=a_j e^{-\frac12(x-c_j)^TA(x-c_j)}e^{i\omega_j^Tx},
 \qquad F(x)=\sum_{j=1}^J f_j(x),\qquad A\succ0.
\]

All atoms share the envelope precision A. Centers and frequencies are
real; amplitudes can be complex. The material is the squared magnitude
|F|^2, with the available global range bound

\[
 0\le |F(x)|^2\le W_F:=\left(\sum_j|a_j|\right)^2.
\]

There is no implicit periodic image sum, random ensemble average,
threshold of the intensity, or subsequent nonlinear BRDF in this source
contract.

Let X=mu+DZ with Z standard Gaussian in r dimensions. Keep all original
latent screen dimensions, typically r=2, including any direction invisible
to D. The following square completion remains valid if D has dependent
columns; reducing the latent rank without integrating the polynomial
weight in the discarded directions would be incorrect.

Choose the same reference center c_0 and carrier omega_0 as the unweighted
Gabor theorem. Put

\[
 M=I+2D^TAD,\qquad H=M^{-1},\qquad
 \zeta=-2HD^TA(\mu-c_0),\qquad T=H^{1/2}.
\]

After absorbing the squared reference envelope into the Gaussian measure,
the original latent variable becomes

\[
 Z=\zeta+TY,\qquad Y\sim N(0,I_r).
 \tag{1}
\]

Let gamma_j and b_j be the coherent coefficients from equations (3)-(9)
of the unweighted note, using L=DT. In particular, gamma_j already includes
the square root of the reference-envelope normalization. For normalized
probabilists' Hermite polynomials H_alpha, define

\[
 V(Y)=\sum_\alpha v_\alpha H_\alpha(Y),\qquad
 v_\alpha=\sum_j\gamma_j\frac{b_j^\alpha}{\sqrt{\alpha!}}.
\]

For any real polynomial w_orig in the original latent variable,

\[
 \mathbb E[w_{\rm orig}(Z)|F(\mu+DZ)|^2]
 =\mathbb E[w(Y)|V(Y)|^2],\qquad
 w(Y)=w_{\rm orig}(\zeta+TY).
 \tag{2}
\]

The transformation preserves degree, but changes the coefficients and
the error certificate. Ignoring this change gives the wrong weighted
mean even when the unweighted mean is correct.

As before,

\[
 E_j=\mathbb E|f_j(X)|^2=|\gamma_j|^2e^{\lambda_j},\qquad
 \lambda_j=\|b_j\|^2,\qquad
 S=\sum_j\sqrt{E_j},\qquad \lambda_*=\max_j\lambda_j.
 \tag{3}
\]

These are properties of a fixed finite source, not a random atom model.
The common carrier cancels from |F|^2 and from the feature spread.

## 2. Polynomial weights are sparse feature operators

Coordinate multiplication satisfies

\[
 Y_iH_\alpha
 =\sqrt{\alpha_i+1}H_{\alpha+e_i}
  +\sqrt{\alpha_i}H_{\alpha-e_i}.
 \tag{4}
\]

If w has degree s, its multiplication operator M_w therefore couples
only indices with ||alpha-beta||_1<=s. Applying it through the coordinate
recurrence requires no dense feature matrix and no pairs of source atoms.

Because w is real, M_w is self-adjoint on its polynomial multiplication
domain. The exact desired moment is

\[
 I_w=\langle v,M_wv\rangle.
\]

The finite exponential sum V, and its difference from a finite Hermite
polynomial, have every required polynomially weighted Gaussian moment.
Thus the unbounded operator and the quadratic forms used below are
well-defined.

## 3. A buffer removes every retained/discarded cross term

Choose an integer cutoff N>=0. Define

\[
 v_N=P_Nv,\qquad v_B=P_{N+s}v,\qquad r_N=v-v_N,
\]

where P_N retains total degree at most N. Use the estimator

\[
 \widehat I_w=
 2\operatorname{Re}\langle v_B,M_wv_N\rangle
 -\langle v_N,M_wv_N\rangle.
 \tag{5}
\]

M_wv_N has support through degree N+s, so the buffer makes the first
inner product identical to <v,M_wv_N>. Expanding v=v_N+r_N gives

\[
 \boxed{I_w-\widehat I_w=\langle r_N,M_wr_N\rangle.}
 \tag{6}
\]

All low/high cross terms have been included exactly. Unlike the
unweighted energy theorem, the remaining error can have either sign.
Simply evaluating the weighted projected field <v_N,M_wv_N> would not
have this residual formula.

## 4. A polynomial-weighted tail certificate

Write the transformed polynomial as

\[
 w(Y)=\sum_\beta c_\beta Y^\beta,
\]

and define the nonnegative increasing polynomial

\[
 \Psi_w(n)=\sum_\beta |c_\beta|\,2^q
                    (n+2q+1)^{\lceil q/2\rceil},\qquad q=|\beta|.
 \tag{7}
\]

A degree-q monomial expands into at most 2^q coordinate-raising/lowering
words. Starting at degree n, the absolute row sum of its matrix is at
most 2^q(n+q+1)^(q/2), which is bounded by the corresponding summand in
(7). The monomial matrix is symmetric. Applying
2|r_alpha r_beta|<=|r_alpha|^2+|r_beta|^2 and then summing over monomials
proves

\[
 |\langle r,M_wr\rangle|
 \le\sum_\alpha\Psi_w(|\alpha|)|r_\alpha|^2.
 \tag{8}
\]

This argument can first be applied to finite truncations. Coherent
coefficient sequences have finite number-weighted norms of every order,
so truncations converge in the required multiplication graph norms.

For one atom, the degree-n energy is exactly

\[
 |\gamma_j|^2\frac{\lambda_j^n}{n!}
 =E_j e^{-\lambda_j}\frac{\lambda_j^n}{n!}.
\]

Weighted l2 Minkowski, followed by (6)-(8), consequently gives

\[
 |I_w-\widehat I_w|
 \le\left[\sum_j\sqrt{E_j}
 \sqrt{\mathbb E_{X\sim\operatorname{Pois}(\lambda_j)}
 [\Psi_w(X)\mathbf1_{X>N}]}\right]^2
 \tag{9}
\]

and, by Poisson stochastic monotonicity,

\[
 \boxed{|I_w-\widehat I_w|
 \le S^2\mathbb E_{X\sim\operatorname{Pois}(\lambda_*)}
              [\Psi_w(X)\mathbf1_{X>N}].}
 \tag{10}
\]

The factor S^2 can grow quadratically with total authored amplitude.
That is a dependence of an absolute-error bound, not a required atom-pair
loop. An unweighted L2 tail alone would not control these unbounded
polynomial weights.

## 5. Only finitely many ordinary Poisson tails are needed

Put h=ceil(s/2). Since (7) has nonnegative monomial coefficients, its
falling-factorial expansion has nonnegative coefficients too:

\[
 \Psi_w(n)=\sum_{\ell=0}^h a_\ell(n)_{\underline\ell},
 \qquad a_\ell\ge0.
\]

For T_m(lambda)=P(Pois(lambda)>m), the exact tail expression is

\[
 \mathbb E[\Psi_w(X)\mathbf1_{X>N}]
 =\sum_{\ell=0}^h a_\ell\lambda^\ell T_{N-\ell}(\lambda).
 \tag{11}
\]

Use T_m=1 when m<0, and lambda^0=1 including lambda=0. Thus the
certificate uses h+1 ordinary Poisson tails; it does not evaluate an
unbounded weighted series directly.

For an explicit sufficient cutoff, let
C_w(lambda)=sum_l a_l lambda^l. If S^2 C_w(lambda_*)>0, choose an integer

\[
 n\ge\max\left\{1,2e\lambda_*,
       \log_2\frac{S^2C_w(\lambda_*)}{\epsilon_{\rm feat}}\right\},
 \qquad N=h+n-1.
 \tag{12}
\]

The usual Poisson Chernoff bound gives T_{n-1}(lambda_*)<=2^(-n).
Since N-l>=n-1, (11) is at most C_w(lambda_*)2^(-n), proving feature
error at most epsilon_feat. If the prefactor is zero, the certificate is
already zero; no logarithm of zero is needed. This sufficient choice is
conservative, particularly for odd polynomial degrees.

## 6. Cost of all projective correction queries

Order p in PROJECTIVE-DENSITY requires original-coordinate moments

\[
 (e\cdot Z)^j|Z|^{2l},\qquad 0\le l\le j\le p,
\]

where e=k/|k| when k is nonzero. The combined correction is a real
polynomial of degree s<=3p. For k=0 only the unweighted mean is needed.
Let K=N+3p and

\[
 D_K=\binom{K+r}{r}.
\]

One pass over the J atoms accumulates all v_alpha through degree K in
O(J D_K) arithmetic at fixed r, as in the unweighted theorem. This
already includes every atom's interaction with every other atom through
the aggregated coefficients.

In the tilted coordinates, define sparse operators

\[
 \mathcal A=e\cdot(\zeta+TY),\qquad
 \mathcal B=|\zeta+TY|^2.
\]

Apply B repeatedly to v_N, and for each resulting vector apply A
successively. This obtains all A^j B^l v_N with 0<=l<=j<=p and their
buffered inner products. Intermediates have degree at most N+3p. The
query work is O((p+1)^2 r^2 D_K), a conservative upper bound, with
O(D_K) work-vector storage plus the O(p^2) scalar results. Several
vectors may be streamed; a dense D_K-by-D_K matrix is unnecessary.

Total feature/query arithmetic is therefore

\[
 \boxed{O(JD_K+(p+1)^2r^2D_K),}
 \tag{13}
\]

in addition to the previously stated coordinate preparation, polynomial
coefficient/certificate formation, and special-function accuracy costs.
At fixed correction order and latent dimension those additional
polynomial operations are independent of J. There is no hidden J^2
evaluation. This remains an arithmetic bound rather than a GPU timing.

Use (10) once for the whole transformed correction polynomial, or bound
the individual requested moments and sum their coefficient-weighted
errors. In either case the transformed coefficients must be included in
the certificate. The spread lambda_*, amplitudes S, order p and tolerance
determine the cutoff; the feature count is not universally small.

## 7. Combined geometry and material error

For the projective target

\[
 \mathbb E\left|F\left(\mu+D\frac{Z}{1+k\cdot Z}\right)\right|^2,
\]

apply this note to the order-p signed correction polynomial in the
original Z coordinates. The complete algebraic-source error is at most

\[
 \epsilon_{\rm geometry}+\epsilon_{\rm feat}+\epsilon_{\rm numerical}.
\]

The first term is the material-independent remainder from
PROJECTIVE-DENSITY with W=W_F. The second is (9) or (10). Numerical
coefficient formation, exponentials, Hermite recurrences, cancellation,
Poisson tails and final contraction need their own allowances. Physical
visibility or other source/model differences are additional terms.

Keep pointwise residual subtraction tied to the exact source predictor.
The signed mean correction does not require changing that predictor.
This construction does not supply a cheap integral of the different
positive quadratic-coordinate surrogate.

## 8. What this closes, and what remains open

For a finite common-width authored Gabor intensity, one compact set of
features supports all fixed-order polynomial footprint corrections, with
explicit tail control. Relative phase interactions survive without
expanding the atom-pair list. This supplies a conditional bridge from the
geometry theorem to material-query cost.

It does not establish closure for thresholded intensities, arbitrary
noise hashes, unequal atom widths, nonlinear normal normalization,
general BRDFs or an infinite periodized atom field. Those may change the
source representation and its required state. It also gives no guarantee
that the feature spread or numerical conditioning is small in a
particular scene.

Hermite coefficients as Gaussian-weighted response derivatives and their
affine/scale transformations are established in
[Makram-Ebeid and Mory, Scale-Space Image Analysis Based on Hermite
Polynomials Theory (2005), section 1.2 and sections 3-4](https://dev.ipol.im/~reyotero/bib/bib_all/2005_Ebeid_Mory_scalespace_anal_Hermite_polynomial_ijcv.pdf).
The coherent feature aggregation is documented with its prior art in
GABOR-GRAM-LAW. The specific additions here are the finite cross-term
buffer, polynomial-weighted tail certificate and shared query cost for
the stated source family. A broader priority claim is not made.
