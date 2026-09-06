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

## 5b. The band certificate from moments, and the degree law

The gap of section 4 is a band mass in disguise, and the question of which degree n a pixel error needs is the question of how much footprint mass sits near the threshold. Two things are precise about it and one is open.

The certificate [elementary; the distinction from the Christoffel function per #279]. For any polynomial p and any band B = [tau - b, tau + b] on which p(t)^2 >= a > 0 is certified, P(h in B) <= E[p(h)^2] / a. The Christoffel function lambda_n(tau) = min_{p(tau) = 1, deg p <= n} E p(h)^2 bounds the point mass P(h = tau) only; a polynomial normalized at one point need not majorize a band, and its zeros can make the bound useless. The optimal band probability given moments is a generalized moment problem with a globally feasible band-majorizing polynomial (Bertsimas and Popescu 2005, Huerlimann 2015; the Chebyshev-Markov-Stieltjes construction under its canonical-quadrature assumptions), and an ordinary floating-point semidefinite solution is not its own certificate: feasibility must be certified separately, for instance by an exact sum-of-squares decomposition of p^2 - a on B.

The density statement [collaborator, #279]. If ess sup_{|t - tau| <= b} f_h(t) <= M, then P(|h - tau| <= b) <= 2 b M, with b = 2 W delta for the envelope of section 4. A gradient floor on the single level tau is not enough for this; the density must be controlled on the whole band. Critical values need not make the density diverge: a nondegenerate extremum in two dimensions has a finite one-sided density and a saddle a logarithmic singularity, so a critical level worsens the required degree without forcing an infinite one for every tolerance in an atom-free law.

The degree law in the two forms it can take. With the Bernstein envelope, ε = exp(-2 n delta^2), the band half-width is 2 W delta and E Delta <= 4 W delta M + 3 ε, so a gap budget eta is met with delta = eta / (8 W M) and n = 32 W^2 M^2 ln(6 / eta) / eta^2: quadratic in W M / eta, because a Bernstein envelope resolves a step only to width W / sqrt(n). An envelope of the Jackson or Chebyshev kind resolves to width W / n and would make the degree linear in W M / eta; its sandwich property then needs its own certificate (a sum-of-squares identity on [0, W]), which the Bernstein construction gets for free from positivity. [checked here, toy law] On the uniform law on [0, 1] with tau = 0.4 and the constructive polynomial p_m(t) = (1 - (t - tau)^2)^m, a = (1 - b^2)^m, the certificate E p_m^2 / a reads 0.389, 0.200, 0.106 and 0.064 at m = 10, 40, 160, 640 against a true band mass 0.040 at b = 0.02, tracking the resolution 1 / sqrt(2 m) rather than b, which is the sqrt(n) limit in numbers.

Conditioning, an obligation and not a footnote. [checked here] In the monomial basis the absolute coefficient sum of p_m^2 is 1.5e6 at m = 10 and 2.0e24 at m = 40 on that toy, so moments carried as numbers in the monomial basis lose everything long before a useful degree; the collaborator's 3^n bound for the Bernstein envelope is the same growth. The remedy is not to form monomial moments at all: the quadrature of section 3 evaluates the source at its nodes, so E p^{+-}(h) is evaluated as sum_i w_i p^{+-}(h(y_i)) with p^{+-} in the Bernstein basis by de Casteljau, stable on [0, W]. The analytic error bound still carries the coefficient growth (3^n times the single-moment Poisson tail, hence about n log_2 3 more nodes per axis), which is the price Astra's O(n [J + log(n + 1)] [n (L + 1) + log(1 / t)]^r) already contains; the floating-point evaluation does not.

The band certificate in its general form [collaborator, #281, independently audited]. Let K be a set containing the support of h (here [0, W]) and B the band. If a polynomial q satisfies q >= 0 on K and q >= 1 on B, both certified, then P(h in B) <= E q(h) = sum_j c_j m_j in the coefficients c_j of q and the moments m_j, and with the moments known to intervals of half-width epsilon_j the bound is sum_j c_j m_hat_j + sum_j |c_j| epsilon_j. If only q >= -eta on K and q >= 1 - eta on B are certified, then q + eta is feasible and the bound gains eta. The form P(B) <= E p^2 / a above is the case q = p^2 / a, whose nonnegativity on K is automatic and whose band bound is the one obligation. Feasibility must be certified, coefficient residuals included; a sum-of-squares identity is one way, with its positive-semidefinite allowances accounted, and an ordinary floating-point solver output is not a certificate.

Two exact counterexamples to keep [collaborator, #280; checked here]. On the uniform law on [-1, 1] the degree-two Christoffel function at the centre is lambda_2(0) = 4 / 9, while P(|X| <= 1 / 2) = 1 / 2: the centre value is not even an upper bound for that band, which is why a band needs a majorant and not a point-normalized minimizer. Inside the Gabor family itself, the single atom F(z) = exp(-|z|^2 / 4) under the standard Gaussian in two dimensions has intensity h = exp(-|Z|^2 / 2) exactly uniform on (0, 1), with density one at its nondegenerate critical maximum: critical levels need classification, not a universal divergence claim.

Open. A bound on M from the source geometry (the density of the intensity near the threshold under the footprint), which is what would turn the degree law into a cost statement in the source's own terms; and whether an optimal envelope with a certified sum-of-squares sandwich is worth its construction against the Bernstein one.

## 6. What a probe must report

For one synthetic field with J, A, the centres, frequencies and amplitudes stated, one footprint (mu, D, k) stated, one threshold tau: the moments to order 2 n with their intervals and the q used for each; the envelope's n and delta and epsilon; the interval [E p^-, E p^+], the point estimate, the certified error, and the corrected estimate with its error; the true response by a Monte Carlo with its own noise, for comparison only; and the arithmetic count (nodes times atoms per moment, summed). The result is a diagnostic of the contract on that field, not a cost claim.

## 7. What this page does not cover

Unequal atom widths, periodized atom fields, hashed noise, normalized normals and BRDFs, general material graphs, and any small uniform cost. The geometry certificate covers every bounded material on the shared chart; the material integration covered here is one family, and its price is source-dependent.
