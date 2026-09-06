# The two-factor composition certificate

2026-09-06. A theorem note, assembled from the bridge exchange with the collaborator (#339 to #346) and the research log. It states, with consistent units, what is proved about the Gaussian-filtered product of two periodic materials whose spectra are truncated: the heat-content lemma, the tail-energy law, the Gaussian pair matrix bound, and the full-response truncation certificate. Everything else about composition (coefficient construction, retained-pair enumeration, three or more factors, the near field) is listed as unpriced at the end.

## 1. Setting and units

A material is a function f on the plane, periodic on a lattice Lambda = B Z^2 (B the basis matrix, |Lambda| = |det B| the cell area), with values in [0, 1]. Its Fourier series uses cycle frequencies on the dual lattice Lambda^* = B^{-T} Z^2:

    f(x) = sum_{k in Lambda^*} a_k exp(2 pi i k . x),   sum_k |a_k|^2 = (1 / |Lambda|) int_cell f^2 <= 1.

A Gaussian footprint with covariance C (physical units squared) filters f to sum_k a_k exp(2 pi i k . x_0) exp(-2 pi^2 k^T C k). Writing Sigma = 4 pi^2 C, the damping is exp(-k^T Sigma k / 2); this Sigma is the one that appears below, and it is the cycle-frequency form of the radian-frequency expression exp(-k^T C k / 2) with k in radians. The variation of f is V_f = int_cell |grad f| dx, with units of length; the normalized variation density is V_f / |Lambda|, with units of inverse length, matching a cycle radius.

The product of two materials A on Lambda_1 and B on Lambda_2 filtered at x_0 is the absolutely convergent double series

    sum_{m in Lambda_1^*} sum_{n in Lambda_2^*} a_m b_n exp(2 pi i (m + n) . x_0) exp(-(m + n)^T Sigma (m + n) / 2),

the absolute convergence being section 4's Schur bound; the identification of this series with the Gaussian integral of the pointwise product was checked on the collaborator's side by Fejer approximation for L2 sources on two nonsingular torus charts (#346). The individual dual lattices are discrete; their sum may be dense in the plane, and nothing below assumes otherwise.

## 2. The heat-content lemma on the torus

Lemma. Let f have bounded variation on the unit torus with 0 <= f <= 1 and V = ||grad f||_1, and let K_s be the Gaussian of standard deviation s (in cell units), with damping exp(-2 pi^2 s^2 |m|^2) at the cycle frequency m in Z^2. Then

    sum_{m} |a_m|^2 (1 - exp(-2 pi^2 s^2 |m|^2)) = <f, f - K_s f> <= s V / sqrt(2 pi).

Two proofs. Semigroup (mine, #344): with T_t = exp(t Laplacian), the Gaussian of standard deviation sqrt(2 t), d/dt ||T_t f||^2 = -2 ||grad T_t f||^2 and ||grad T_t f||^2 = <grad f, grad T_{2t} f> <= V sup |grad T_{2t} f|; for a unit vector e and 0 <= f <= 1, e . grad(p_u * f) = int (e . grad p_u) f <= int (e . grad p_u)_+ = (1 / 2) int |e . grad p_u| <= 1 / (2 sqrt(pi u)), the positive part being half the total because the derivative integrates to zero and the periodized kernel's derivative having at most the plane kernel's L1 norm; so ||grad T_t f||^2 <= V / (2 sqrt(2 pi t)), and integrating, ||f||^2 - ||T_t f||^2 = <f, f - T_{2t} f> <= V sqrt(2 t / pi), which with s = 2 sqrt(t) is the claim. Translation (the collaborator's, #345): <f, f - K_s f> = (1 / 2) E_Y ||f(. + Y) - f||_2^2 <= (1 / 2) E_Y ||f(. + Y) - f||_1 <= (1 / 2) E_Y |Y . nu| V evaluated directionally, and E |Y . nu| = s sqrt(2 / pi) for the Gaussian Y of standard deviation s, using 0 <= f <= 1 (so the square of a difference is at most its absolute value) and the directional bounded-variation translation bound. This is Ledoux's semigroup inequality (1994), tight for a half plane; on the torus the constant is the same and periodization is harmless.

## 3. The tail-energy theorem

Theorem. For f as in the lemma and M > 0,

    T(M) := sum_{|m| > M} |a_m|^2 <= c* V / M,   c* = min over beta > 0 of sqrt(beta) / (2 pi^{3/2} (1 - exp(-beta))),

the minimum attained where exp(beta) = 1 + 2 beta; the exact expression is the certified constant, and c* < 0.1408 is an outward numerical bound (the minimizer is near 1.2564 and the value near 0.1407). Proof: 1_{|m| > M} <= (1 - exp(-beta |m|^2 / M^2)) / (1 - exp(-beta)), then the lemma at 2 pi^2 s^2 = beta / M^2.

Physical lattices. For f periodic on Lambda = B Z^2, pull back to the unit torus by g(u) = f(B u); the coefficients are unchanged, the unit-torus variation is at most ||B|| V_f / |Lambda|, and a physical radius R corresponds to a unit radius at least sigma_min(B) R. Hence

    sum_{|k| > R, k in Lambda^*} |a_k|^2 <= c* kappa(B) V_f / (|Lambda| R),   kappa(B) = ||B|| / sigma_min(B),

with the basis chosen reduced so that kappa is small (kappa = 1 for a square cell). This is the form that matches a radius in cycles per physical unit.

Remarks, not part of the theorem. The density V / (2 pi^2 r^2) dr saturates the lemma at every s, and the measured ratio of tail energy times M to variation tends to 1 / (2 pi^2) for polygons (polygon-tail-energy.mjs); the certified constant is 2.777 times larger, and a point mass at radius M shows that no majorant built from the lemma alone does better.

## 4. The Gaussian pair matrix

For the frequency lattices Lambda_1^*, Lambda_2^* and the damping matrix Sigma define

    Theta_j(Sigma) = sup over y of sum_{l in Lambda_j^*} exp(-(l + y)^T Sigma (l + y) / 2).

By Poisson summation the shifted sum has nonnegative Fourier coefficients in y, so the supremum is at y = 0 and Theta_j(Sigma) = sum_{l in Lambda_j^*} exp(-l^T Sigma l / 2), the theta function of the frequency lattice at the footprint, computable to any precision; its Poisson form Theta_j = (|Lambda_j| / (2 pi sqrt(det C))) sum_{p in Lambda_j} exp(-p^T C^{-1} p / 2) shows the near-field value, the cell area over the footprint's area 2 pi sqrt(det C), and the far-field value 1. An explicit geometric bound without the sum (the collaborator's, #346): for Lambda_j^* = B_j Z^2 and a = lambda_min(B_j^T Sigma B_j) > 0, Theta_j(Sigma) <= [1 + sqrt(2 pi / a)]^2, by bounding the quadratic below by a |z + B_j^{-1} y|^2 and the one-dimensional shifted Gaussian sum by one plus its integral, then tensoring; conservative, and it exposes poor conditioning.

Schur bound. The matrix G(m, n) = exp(-(m + n)^T Sigma (m + n) / 2) indexed by m in Lambda_1^*, n in Lambda_2^* has row sums at most Theta_2(Sigma) and column sums at most Theta_1(Sigma), so by Schur's test its l2 operator norm is at most K_Sigma := sqrt(Theta_1(Sigma) Theta_2(Sigma)), and

    sum_{m, n} |a_m| |b_n| G(m, n) <= K_Sigma ||a||_2 ||b||_2 <= K_Sigma.

No unique decomposition of the beat frequency m + n is needed; the bound holds for a dense sum of lattices.

## 5. The full-response truncation certificate

Theorem (the collaborator's assembly, #345, independently audited on their side, #346; the derivation reproduced here). Let both sources be cut at the physical radius M: keep the pairs with |m| <= M and |n| <= M. The filtered product changes by at most

    K_Sigma [ sqrt(T_A(M) T_B(M / 2)) + sqrt(T_B(M) T_A(M / 2)) ] + 2 exp(-lambda_min(Sigma) M^2 / 16) K_{Sigma / 2} ||a||_2 ||b||_2,

where T_A, T_B are the physical tail energies of section 3 and K_{Sigma / 2} = sqrt(Theta_1(Sigma / 2) Theta_2(Sigma / 2)). With T_A(M) <= c_A / M and T_B(M) <= c_B / M the algebraic term is at most 2 sqrt(2) K_Sigma sqrt(c_A c_B) / M.

Proof. The dropped pairs have |m| > M or |n| > M; by symmetry bound the first set. Split its partner: for |n| > M / 2, the Schur bound applied to the restricted sequences gives at most K_Sigma sqrt(T_A(M)) sqrt(T_B(M / 2)). For |n| <= M / 2, the beat satisfies |m + n| > M / 2, so with G = G^{1/2} G^{1/2} one factor is at most exp(-lambda_min(Sigma) (M / 2)^2 / 4) = exp(-lambda_min(Sigma) M^2 / 16) and the other is the pair matrix of Sigma / 2, whose Schur norm is K_{Sigma / 2}; that set contributes at most exp(-lambda_min(Sigma) M^2 / 16) K_{Sigma / 2} ||a||_2 ||b||_2. The set |n| > M is symmetric. This bounds the absolute sum over dropped pairs, hence the change of the response at every x_0.

The retained pairs are computed exactly; the certificate says nothing about how they are enumerated or how the source coefficients are formed.

## 6. What this does and does not cover

Covered: any two materials with values in [0, 1] and bounded variation on their own period lattices, at any footprint, with the entire filtered product (not only an output ellipse) certified after cutting both spectra at a radius; the same-lattice case included, where the coherent pairs beyond the radius contribute exactly the tail energy to the mean and are priced by the same theorem (the collaborator's example (1 + cos N theta) / 2 squared is charged the carrier's variation 2 N).

Not covered or not priced: the construction of the source coefficients (exact for piecewise-constant materials by the polygon character integrals, otherwise a compile-time quadrature with its own certificate); the enumeration of retained pairs per pixel (the raw count within the radius is the geometric count pi M^2 pi r_E^2 per unit dual cell in the far field, beat-pair-count.mjs, and the pairs that matter at eight bits are dozens for two half-square masks, a prediction and not a certificate); three or more factors (the l2 tools give infinite counts on a dense module; the proposed route through a weighted l1 law, the half-smoothed material in the Wiener algebra, is in the research log, unproved); the near field, where Theta grows like the cell area over the footprint area and the exact-cell branch of the count theorem is the alternative; rank-deficient footprints and warps (the affine part moves the lattices, the remainder is the projective correction's business); and thresholds of the product, which are the threshold oracle's. Same-lattice products of piecewise-constant materials are exact by the common refinement, whose cell count is additive in the factors' cells plus the crossings, at most the product of the edge counts.

## 7. Checks

polygon-tail-energy.mjs and polygon-tail-bound.mjs: coefficients of polygon indicators by the divergence theorem edge by edge, checked against the closed form at the first frequency; the lemma's ratio never above one on four polygons at five scales and approaching one as the scale shrinks; the tail over c* V / M about 0.36 for compact shapes. schur-pair-certificate.mjs: two half-square masks on Z^2 and on its rotation by twenty degrees, isotropic footprints of standard deviation 0.25, 0.5 and 1 cell, pairs enumerated to radius 256 with damping above 1e-14; Theta(Sigma) = 2.5499, 1.0290, 1.0000 against the near-field value 1 / (2 pi s^2) = 2.546 at s = 0.25; the full absolute pairing 0.43931, 0.16312, 0.08032 against the Schur bound 0.63747, 0.25724, 0.25000; the dropped mass at M = 8 to 128 below the certificate with the tail law by factors of one hundred to ten thousand (at s = 0.5: 5.129e-4 against 1.024e-1 at M = 8, 3.293e-6 against 6.398e-3 at M = 128), the measured dropped mass falling faster than 1 / M, since the square's coefficients are of order 1 / |m|^2 off the edge normals and the pairs are incoherent. The certificate is loose by that much; it is a certificate.

## 8. Credits

Ledoux, Semigroup proofs of the isoperimetric inequality in Euclidean and Gauss space (1994), for the heat-content inequality; Miranda, Pallara, Paronetto and Preunkert (2007) for the short-time heat flow characterization of variation; Schur's test and Poisson summation are classical. The Schur repair of the certificate, the exponent 1 / 16, the explicit theta bound, the translation proof of the lemma and the units discipline are the collaborator's (#345, #346, CONTEXTUAL-COMPOSITION.md, RESONANT-PRODUCT-COST.md); the lemma on the torus, the tail theorem with its constant, and the checks are mine. The Ledoux-based route to a tail law with an explicit constant has not been searched for in the literature; it may be known.
