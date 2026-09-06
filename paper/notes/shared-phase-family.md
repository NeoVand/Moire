# The shared-carrier family: one statement, two evaluations, two certificates

A draft for the collaborator's audit, 2026-09-06. The cell side and its certificate are theirs (SHARED-PHASE-AVERAGING.md and SHARED-PHASE-COST.md in the theory-program review folder); the spectral side is from the bridge: the identity and its assumptions (#112, #116), the closed certificate (#123, the collaborator's) and the convergence proof (#125, the collaborator's). Theory only: nothing here is a GPU cost or a frame budget, and the arithmetic model is the collaborator's (exact reals, sorting, Gaussian CDF and density).

## The family

A carrier theta(x) = omega x + phi0 and slow shifts s_j(x) = delta_j x + beta_j, j = 1..m, with |delta_j| < |omega|. Masks b_j, indicators of single nondegenerate arcs of the circle. A bounded graph F from {0, 1}^m to [0, 1] costing C_F to evaluate on a maintained bit vector. The material is

    H(theta, s) = F(b_1(theta - s_1), ..., b_m(theta - s_m)),

and the pixel is the Gaussian window w of width sigma on the line, V = E H(theta(X), s(X)). (A two-dimensional footprint reduces to this line when every rate is parallel; nonparallel rates are the next family, section 8.)

## The effective law

The orbit average over the carrier, h(s) = (1 / 2 pi) int H(theta, s) d theta, and its window integral B = E h(s(X)). Both evaluations compute B. They differ in how, and in what they certify about V - B.

## The identity behind both

H is invariant under (theta, s) -> (theta + u, s + u 1), so its Fourier coefficients H_hat(k, l) vanish unless k + sum_j l_j = 0. Under

- (a) the pixel measure gives no mass to the discontinuity set of H: here, every mask's phase theta - s_j has nonzero screen rate omega - delta_j, which the family assumes; and
- (b) the Gaussian-weighted coefficient sum converges absolutely,

the pixel value is

    V = sum over k + sum_j l_j = 0 of H_hat(k, l) exp(i (k phi0 + l . beta)) exp(-sigma^2 (k omega + l . delta)^2 / 2),

and B is its k = 0 part, the Fourier series of h against the slow multipliers exp(-sigma^2 (l . delta)^2 / 2). Proof: with the Gaussian multipliers the sum is the Gauss mean of H paired with the pixel measure; the Gauss mean is bounded and converges to H at every continuity point, so bounded convergence gives V under (a), and dominated convergence removes the Gauss parameter under (b). (Bridge #112, accepted with the trace reading of #116: (a) is a trace-admissibility assumption checked from the source, not a generic certification.) (b) holds for the family by the collaborator's dyadic-block argument (#125, LADDER-CERTIFICATE.md): expand F into finitely many products of arc bits (a proof device, not an algorithm), split each Fourier index into the blocks 2^(n-1) <= |k| < 2^n where an arc coefficient is below 2^-n and the block holds 2^n indices, sum the Gaussian over the index with the largest block (at most 1 + sqrt(2 pi) / (sigma |r_j|) for a nonzero rate r_j = omega - delta_j) and count the others, so a block with maximal index N contributes at most L_max 2^-N and the polynomially many such blocks sum to at most 2^d d! L_max for a product of d masks. No Diophantine condition, only nonzero rates; the constants and the expansion grow with m, so this proves the identity and not cheap enumeration.

## Cell evaluation and its certificate (the collaborator's theorem)

At fixed shifts the 2 m endpoints partition the circle and the bit vector is constant between them, so h(s) is a sum over at most 2 m intervals of length times F, at cost O(m log(m + 1) + m C_F): the arrangement, not the 2^m truth table. Along the line the cyclic order changes only when two endpoints with different drifts collide modulo 2 pi; between collisions h(s(x)) is affine and its Gaussian integral is closed form in the normal CDF and density. On [-R, R] with R = sigma sqrt(2 log(4 / eps)) the events number at most B_ev = 4 sum over j < k with delta_j != delta_k of (1 + R |delta_j - delta_k| / pi), and the total arithmetic cost is O(B_ev log(B_ev + 2) + (B_ev + 1)(m log(m + 1) + m C_F)): independent of omega for fixed drifts, graph, window and tolerance.

Certificate (corrector): with the periodic primitive G of H - h, ||G||_inf <= pi / 2 and Lip_{s_j} G <= 2, mollification and transversal crossings,

    |V - B| <= [sqrt(pi / 2) / sigma + 2 sum_j |delta_j|] / |omega|.

It needs bounded variation and transversality only, no coefficient sum. Its first term is 1.25 / (omega sigma), so it certifies 2e-3 on the carrier only from about a hundred cycles per sigma; its second term is a floor at fixed delta / omega.

## Spectral evaluation and its certificates

B is the retained part of the k = 0 slice: the near-resonances among the slow phases, l with sum_j l_j = 0 and |l . delta| sigma <= sqrt(c), against the coefficients H_hat(0, l) of the beat. For m = 2 that set is finite (l = (l1, -l1) with |l1 (delta_1 - delta_2)| sigma <= sqrt c); for m >= 3 it is a strip and needs the beat's own coefficient decay along it, which for a product of masks is a product of arc coefficients (obligation 1).

The certificate for V - B is the k != 0 part, and it comes in two forms.

The exact absolute family sum, sum over k != 0 and l of |H_hat(k, l)| exp(-sigma^2 (k omega + l . delta)^2 / 2), is a valid bound and, truncated after K families, a finite per-pixel certificate with a tail of order (1 / (pi^2 K)) [(1 + sqrt(2 pi) / (sigma a)) + (a / omega)(1 + sqrt(2 pi) / (sigma omega))], a = omega - delta, by the device 1 / (|k| |l|) <= (k^-2 + l^-2) / 2 without the Gaussian; a 1e-4 tail costs about two thousand families of a few terms each, so it is a diagnostic rather than the theorem's certificate. For two half-arc masks it is within a factor of 2.5 of the exact error at every point where the exact evaluation is above its 1e-7 floor (paper/tools/exp/theory-probes/ladder-exact.mjs, an exact piecewise evaluation by normal CDF differences): 8.8e-4 against 7.5e-4 at one cycle per sigma and delta / omega = 0.05, 2.0e-4 against 1.7e-4 at four cycles, 4.1e-5 against 2.3e-5 at four cycles and 0.01.

The closed form is the collaborator's certificate (#123), for m = 1 and two single arcs with arc fractions p and q, a = omega - delta, a window half-width 0 < T < a, f_T = exp(-sigma^2 T^2 / 2) and I_T = int_T^inf exp(-sigma^2 u^2 / 2) du <= f_T min(sqrt(pi / 2) / sigma, 1 / (sigma^2 T)):

    |V - B| <= N + Lambda + R,
    N = [delta^2 + sqrt(2 pi) delta / sigma] / [3 (omega - T)(a - T)],
    R = (2 / 3) f_T + (1 / 3)(1 / a + 1 / omega) I_T,
    Lambda <= -(2 / pi) [q log(1 - exp(-sigma^2 omega^2 / 2)) + p log(1 - exp(-sigma^2 a^2 / 2))].

N is the near-resonance windows: inside the window |n omega - l delta| <= T of family n, |l| >= (|n| omega - T) / delta and |n - l| >= (|n| a - T) / delta bound the coefficient product, the Gaussian lattice sum is at most 1 + sqrt(2 pi) / (sigma delta) (an exact resonance keeps a unit term, which is the delta^2), and (|n| omega - T)(|n| a - T) >= n^2 (omega - T)(a - T) is summed over n. R is the far remainder: 1 / (|k| |l|) <= (k^-2 + l^-2) / 2, and each shifted-lattice Gaussian tail outside [-T, T] is at most 2 f_T + 2 I_T / spacing, with the reciprocal squares summed on the other index. Lambda is the carrier leakage, the k = 0 and l = 0 terms. Two earlier closed forms of mine were false: one vanished as delta -> 0 while the leakage does not (#116), the other dropped the unit lattice mass while an exact resonance between coprime rates persists as sigma grows (#122: omega = 3, delta = 2 leaves 1 / 12; rates N + 2 and N leave 1 / (4 N (N + 2))). The certificate is valid on both examples (1.07 and 8.7e-4 against 1 / 12 and 1.6e-4) and on the two-grating points, loose by twenty to a hundred and fifty (paper/tools/exp/theory-probes/cert123.mjs); at fixed ratio it carries the resonance floor (delta / omega)^2 / 3, so it certifies 2e-3 from about two cycles per sigma at delta / omega = 0.01 and not at 0.05.

## Why the two certificates scale differently

The corrector as proved integrates by parts once: one derivative falls on the window, and the material contributes its bounded primitive, which is why that bound is polynomial in 1 / (omega sigma); whether a higher-order corrector exists for materials of bounded variation is not shown either way. The ladder puts every derivative on the window, which is entire, harmonic by harmonic: the carrier term is Gaussian in omega sigma and the drift term is of order delta / (omega^2 sigma). Its price is summing the material's harmonics, which is assumption (b). At fixed ratio delta / omega both carry a floor, 2 sum |delta_j| / |omega| for the corrector and (delta / omega)^2 / 3 for the ladder, and the ladder's floor is real: exact resonances between coprime rates persist as sigma grows (#122). Where both apply the ladder is smaller by about delta / (6 omega) on the floor and exponentially on the carrier term; the corrector applies without any window condition and without coefficient sums. Both are proved; the statement carries both and says which regime each serves.

## Regimes

Fixed drifts and a growing carrier (the collaborator's statement): the cell cost and the corrector certificate are independent of omega, the certificate being O(1 / omega); the #123 certificate with T = a / 2 is O(omega^-2), since N is then about 4 (delta^2 + sqrt(2 pi) delta / sigma) / (3 omega^2) and R and Lambda are exponentially small in omega sigma. Fixed ratio delta / omega: both certificates have floors, 2 sum |delta_j| / |omega| and (delta / omega)^2 / 3, and the second is attained up to a constant by coprime rates. A common drift can be subtracted from carrier and shifts on both sides.

## Kept separate from the theorem

The mask of three wavelengths is not in this family (three independent carriers). Its ladder density and coefficient decay measured from a finite table (bridge #112: 33, 14, 5 and 1.2 rungs per unit |m| at k sigma = 2, 3, 5, 10; rms decay |m|^-2.1; about 1500 rungs to 2e-3 at k sigma = 2) are predictions, consistent with the kernel's measured transition band, and not consequences of any statement here.

## Obligations

1. Assumption (b) for the family: proved by the collaborator's dyadic-block argument (#125), stated above.
2. The closed-form ladder certificate for general m: windows indexed by the pairwise drift differences delta_j - delta_k, constants carrying the Walsh mass, and the leakage for a general graph.
3. Numerical precision for both evaluations (near-coincident events, phase reduction, certified CDF and exponential evaluation), the collaborator's caveat in SHARED-PHASE-COST.md.
4. The next family, section 8.

## 8. The next family

Two carriers with nonparallel screen rates and slow shifts on each. The cell side becomes an arrangement in two phase dimensions, where two boundary directions (N, 1) and (1, N) already meet N^2 - 1 times per period, so winding must enter the event budget explicitly; for polygon and conic pictures this is the existing coverage kernels' near field, a per-node contract rather than new mathematics. The spectral side keeps the identity with (a) and (b), and the windows become the material-intrinsic ladder of the pair: the integer points near the kernel of the surface rate matrix K, camera-free, with the cutoff set by the camera. For products of arc masks the dyadic argument gives (b) again. For a threshold g = 1{F > t} of a smooth field on T^3 with a rank-two pixel it does not, and this is where the noise mask lives.

The derivation I propose there. The divergence theorem writes the coefficient as an oscillatory integral over the boundary surface, g_hat(m) = (2 pi)^-3 (i / |m|^2) int over the boundary of exp(-i m . theta) (m . nu) dS. Along the ladder m = t v + w with v the unit kernel direction of K and |w| <= rho, so the phase is t (v . theta) + w . theta and its stationary points on the boundary are the points whose normal is parallel to v + w / t. If the Gaussian curvature of the boundary is bounded below by kappa_0 > 0 on the set of boundary points whose normals lie in the cone of half-angle rho / t_0 around v, stationary phase gives |g_hat(m)| <= C / |m|^2 for every ladder point with t >= t_0, with C explicit in kappa_0, the number of stationary points and the C^3 norm of F; the weighted sum over the ladder then converges absolutely with an explicit tail, and (b) is certified for that material by a finite compile-time computation (the finitely many boundary points with normal parallel to v, their curvatures, the cone). Where a parabolic point's normal lies in the cone the exponent drops to a known value at that point (van der Corput), still explicit. For the noise mask the normal ranges over a box, so such points exist and the computation is finite. What this would certify is honest and not cheap: with the measured constants the absolute tail in the transition band is of order ten over the truncation radius, so a hard threshold of incommensurate noise stays expensive at 8 bits by the spectral side, and the theorem's content is that the expense is the material's. The cell side (the level curves inside the window by boundary integrals, with an enclosure) and the soft threshold are the ways around it.
