# The threshold oracle: a contract page

The specification a probe or an implementation of a thresholded Gabor intensity's pixel mean has to meet, fixed before anything is run. Assembled from bridge #269 to #273 and the collaborator's GABOR-WEIGHTED-MOMENTS.md, GABOR-THRESHOLD-MOMENTS.md and PROJECTIVE-DENSITY.md. Every item names its status: proved on the collaborator's side, checked here numerically, or open.

## 1. Source and material

A finite authored Gabor field with a common envelope: F(x) = sum_{j = 1}^J a_j exp(-(x - c_j)^T A (x - c_j) / 2) exp(i omega_j . x) with A positive definite, real centres c_j and frequencies omega_j, complex amplitudes a_j. The intensity is h = |F|^2 with the global range 0 <= h <= W, W = (sum_j |a_j|)^2. The material is the threshold 1{h >= tau} with tau in (0, W); endpoint thresholds, a constant field and known-support cases are outside this page and need separate treatment.

## 2. Footprint, state, and the two targets

The footprint is the pixel's Gaussian in whitened screen coordinates, Z standard Gaussian in r = 2 dimensions; the state is X = mu + D Z on the plane (the shared planar chart; nothing nonlinear in Z is a separate count). Two targets:

- the affine surrogate's response, I_A(tau) = P(h(mu + D Z) >= tau), Z standard Gaussian, no tilt;
- the corrected response, I_1(tau) = E[1{h(mu + D Z) >= tau} w(Z)] with the signed weight w(Z) = 1 + (k . Z)(3 - |Z|^2), k the perspective rate of the shared chart.

The geometry certificate is already in place and is not re-derived here [proved, collaborator]: with W_F = 1 for an indicator, |I_true - I_A| <= 0.7381 |k| and |I_true - I_1| <= 1.8921 |k|^2, the latter conditional on the corrected integral being evaluated exactly. This page is about evaluating I_A and I_1 with a certificate, not about the geometry.

## 3. Moments, exactly, with a price

For m >= 1 the m-th intensity moment E[h(mu + D Z)^m] is an exact Gaussian expectation of |sum_j beta_j exp(b_j . Y)|^{2m} with Y standard Gaussian after the reference envelope is absorbed to the power 2 m, with its own tilt, normalization W_m and coefficients b_j, beta_j given in GABOR-THRESHOLD-MOMENTS.md; polynomial weights in Z are transformed by Z = -2 m H_m D^T A u + H_m^{1/2} Y and must not be applied untransformed [proved, collaborator]. The moments are not the self-products of a truncated feature vector; those change the source (#271).

Evaluation: a positive Gauss-Hermite rule with q nodes per coordinate, applied to the original exponential sum at q^r nodes with |sum|^2 raised to m, at O(q^r (J + log m)) arithmetic given the rule; error at most A_m e^{Lambda} P(Pois(Lambda) >= q) with C = 2 m max_j ||b_j||, Lambda = C^2 / 2, A_m = W_m (sum_j |beta_j|)^{2m}; a polynomial weight of degree s multiplies the error by the explicit factor K_w(C) and shifts q to q - s; a sufficient q is s + n with n >= max(1, 2 e Lambda, log_2(A_m K_w(C) / epsilon)) [proved, collaborator; the one-dimensional Poisson-tail bound checked here on tabulated rules, bridge #274]. The rule's construction and the floating-point error are separate obligations and enter the moment's error interval. Each moment carries its interval [E h^m - e_m, E h^m + e_m].

Growth in the order [proved, collaborator, #275]: with G = D^T A D, u_j = D^T A d_j, v_j = D^T nu_j and L = max_j (u_j^T G^+ u_j + v_j^T G^+ v_j) (a positive-definite common envelope puts every u_j, v_j in the range of G even for a singular D; the safe simpler bound replaces L by max_j (d_j^T A d_j + nu_j^T A^{-1} nu_j)), the m-th moment's Lambda_m is at most m L, linear in the order; and the single-atom identity W_m(c_0) |beta_j|^{2m} exp(2 m^2 ||Re b_j||^2) = |a_j|^{2m} W_m(c_j) gives A_m <= (sum_j |a_j|)^{2m}, so for the normalized intensity x = h / (sum_j |a_j|)^2 the prefactor is at most one and an unweighted normalized moment to error epsilon needs only q >= max(1, 2 e m L, log_2(1 / epsilon)) nodes per axis: a cost linear in the moment order per axis with no hidden J^{2m} evaluation. The amplitude bound and the normalization refer to the original authored atoms, never to tilted or Hermite coefficients. A broad spread of centres and frequencies still makes L large, and q^r is the dimension cost. Open: how the binomial coefficients' growth with n enters the total cost of a degree-n threshold; the coefficient precision looks exponential in n while the node count is logarithmic in that precision, which may keep the ideal arithmetic price polynomial in n; this is distinct from the final threshold error, which needs the actual certified gap.

## 4. The envelope

With x = h / W in [0, 1], a = tau / W, 0 < delta < min(a, 1 - a), epsilon = exp(-2 n delta^2) and S_b(x) = sum_{j >= n b} binom(n, j) x^j (1 - x)^{n - j}:

p^-(x) = S_{a + delta}(x) - epsilon <= 1{x >= a} <= S_{a - delta}(x) + epsilon = p^+(x),

polynomials of degree n in x, hence in h [proved, collaborator; checked here on a grid]. The gap Delta = p^+ - p^- = 2 epsilon + sum of the Bernstein terms between n(a - delta) and n(a + delta) is a nonnegative polynomial, at most 1 + 2 epsilon everywhere and at most 3 epsilon outside |h - tau| <= 2 W delta. Its degree is n, so E Delta and E Delta^2 are combinations of the moments up to order n and 2 n.

Limitation, not to be argued around: p^-(tau) <= 0 and p^+(tau) >= 1 for any continuous global envelopes, so the gap is at least one at the threshold and E Delta is at least the footprint's mass at h = tau. The gap is the band mass computed rather than assumed. A material whose footprint sits on its threshold reports a large gap, which is the correct answer.

## 5. The oracle and its certificate

Affine target: the interval [E p^-(h), E p^+(h)], each endpoint a combination of the moments with the moments' error intervals propagated through the polynomial's coefficients (the coefficients of S_b in the monomial basis alternate in sign and grow with n, so the propagation is by absolute values and is part of the reported error); the point estimate E q(h) with q = (p^+ + p^-) / 2; the certified error E Delta / 2 plus the propagated moment error.

Corrected target: the point estimate E[w q(h)], evaluated as moment queries with the transformed weight; the certified error E[|w| Delta(h)] / 2, bounded by either sqrt((1 + 9 |k|^2) E Delta(h)^2) / 2 (E w^2 = 1 + 9 |k|^2 in two dimensions, checked here) or E[(1 + w^2) Delta(h)] / 4, which adds degree six in Z [proved, collaborator]; multiplying the order relation by the signed weight is not allowed.

Total error reported for the corrected oracle: the geometry term 1.8921 |k|^2 plus the sandwich's certified error plus the propagated moment intervals plus the visibility tail if the footprint reaches the chart's boundary. A display budget is met when the sum is below it; nothing is admitted on the geometry term alone.

## 6. What a probe must report

For one synthetic field with J, A, the centres, frequencies and amplitudes stated, one footprint (mu, D, k) stated, one threshold tau: the moments to order 2 n with their intervals and the q used for each; the envelope's n and delta and epsilon; the interval [E p^-, E p^+], the point estimate, the certified error, and the corrected estimate with its error; the true response by a Monte Carlo with its own noise, for comparison only; and the arithmetic count (nodes times atoms per moment, summed). The result is a diagnostic of the contract on that field, not a cost claim.

## 7. What this page does not cover

Unequal atom widths, periodized atom fields, hashed noise, normalized normals and BRDFs, general material graphs, and any small uniform cost. The geometry certificate covers every bounded material on the shared chart; the material integration covered here is one family, and its price is source-dependent.
