# B2. The coverage enclosure and its band-mass form

Claim B2 of [theory-program.md](theory-program.md). The enclosure is the collaborator's (bridge #64); this note derives the tighter band-mass form, estimates what it certifies, and states the honest conclusion. Status: derived, prototype pending the collaborator's read of the band argument (bridge #77).

## The enclosure as stated

Let F be the field, q its second-order model at the pixel's centre, t the threshold, and suppose |F(X) - q(X)| <= eps on a ball B of radius R around the centre. Then on B

    {q > t + eps} is contained in {F > t} is contained in {q > t - eps},

and with tau the window's mass outside B,

    L = max(0, P[q > t + eps] - tau) <= P[F > t] <= min(1, P[q > t - eps] + tau) = U.

For a sum of sines with amplitudes a_i and pixel-space wavenumbers k_i the Taylor remainder over B is eps = sum_i a_i |k_i|^3 R^3 / 6. Measured on the noise mask's near regime (demo modes 11 and 12, twenty probes): every interval contains the truth, and the widths are 0.011 to 0.18 where the true error is 1e-4. The two causes: tau = exp(-R^2 / 2 sigma^2) is 0.011 at R = 3 sigma, and eps takes the sup over the ball, which grows as R^3 where the window's density falls as exp(-R^2 / 2 sigma^2).

## The band-mass form

The two indicators 1{F > t} and 1{q > t} can differ only at points where |q(X) - t| <= |F(X) - q(X)|. With a pointwise remainder eps(X) >= |F(X) - q(X)| that grows with the distance from the centre, eps(rho) = c rho^3 for the sines with c = sum_i a_i |k_i|^3 / 6, the coverage error is bounded by the window's mass of the band

    |P[F > t] - P[q > t]| <= P[ |q(X) - t| <= eps(|X|) ],

with no ball and no outside mass: far from the centre the band is wide but the density is negligible, near the centre the density is large but the band is thin. Two computable forms.

Shells. With radii 0 = rho_0 < rho_1 < ... < rho_J = R and eps_j = c rho_j^3 on the shell between rho_{j-1} and rho_j,

    error <= sum_j min( m_j, P[q <= t + eps_j] - P[q <= t - eps_j] ) + exp(-R^2 / 2 sigma^2),

with m_j = exp(-rho_{j-1}^2 / 2 sigma^2) - exp(-rho_j^2 / 2 sigma^2) the shell's mass; two conic integrals a shell with the existing routine, conservative because each shell takes its outer radius's eps everywhere on the shell.

Line integral. The band's mass is the integral along the boundary {q = t} of its local width 2 eps(|X|) / |grad q(X)| times the window's density, to first order in eps; tighter, a one-dimensional quadrature along the conic, exact in the limit of thin bands and needing a second-order correction where the band is not thin.

## What it certifies, estimated

Along a boundary through the centre with |grad F| about a k for a dominant component, the band's mass is about (2 c / (a k)) E[rho^3] with E[rho^3] the third moment of the window along the boundary, about 0.4 sigma^3 for sigma = 0.5. With c = sum a_i k_i^3 / 6 this is of order (k sigma)^2 times a constant near 1.3: 1.3e-2 at k sigma = 0.1, 2e-3 at k sigma = 0.04. The measured true error at k sigma = 0.1 is 1e-4, a hundred times smaller, because the cubic term is odd about the centre and its first-order effect on the coverage cancels along a boundary through the centre; a bound built on the sup of a cubic remainder cannot see that cancellation.

## Conclusion, honest

1. The band-mass form removes the outside mass and most of the sup's looseness and is rigorous under the same hypothesis; it is the form to prototype.
2. Even so, the conic regime is certified at the 8-bit budget (2e-3) only where k sigma is under about 0.04, that is, patterns coarser than about 80 pixels at sigma = 0.5. Above that the true error is fine and the certificate is not, and the lowering, if it obeys certificates, hands those pixels to the line regime at 150 to 500 evaluations.
3. To certify the conic regime where it is actually accurate, the model must go one order up: a cubic jet leaves a quartic remainder, even about the centre, whose band mass is of order (k sigma)^4 times a constant, 3e-4 at k sigma = 0.1. The regions of a cubic model are not conics; their masses need the line machinery (exact roots along lines) or a bound that reduces them to conics. This is a new item for Track E: the cubic model's coverage.
4. The line regime's own certificate is open: its error is the quadrature across lines plus the scan's misses, and neither has a bound yet. Until it does, the interval carried out of the line regime is uncertified, and the honest flag says so.

So the enclosure is sound and, as it stands, mostly a demonstration that the 8-bit certificate is harder than the 8-bit accuracy: the accuracy is there, the proof lags by two orders. The product needs both; the prototype order is the band-mass form on the conic regime, then the line regime's certificate, then the cubic model.
