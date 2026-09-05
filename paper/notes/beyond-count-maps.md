# Beyond count maps: the latent pushforward, the moire spectrum, and the self-dual pairing

A research note, 2026-09-06, written after the author asked what the new theory is and warned against testing before thinking. This is a brainstorm with definitions and candidate theorems, not a ledger. Nothing here is proved; the point is to say what the theory should be, why it would be deeper than count maps, and which single theorem would make it consequential. Written to think with the collaborator, whose question it answers: what is the invariant object behind count maps.

## 1. The object

A material is a function g on a latent space L, and a shader is g composed with a map Phi from the pixel plane to L. The pixel's value under a window measure mu is

    <g, nu>,   nu = Phi_* mu,

the pairing of the material's latent function with the pushforward of the window onto the latent space. That pairing is the invariant object. Neither the map alone nor the function alone is enough; the pushforward carries the map's whole influence, and the pairing carries the function's.

What L is, for the materials people build:

- a torus T^d of phases, for anything periodic or quasi-periodic: tilings (d = 2), stripes (d = 1), the rippled checkerboard (T^2 x T^1 = T^3), a mask of three sines (T^3), lattice noises (T^2 per octave family, since the octaves of a Perlin or value noise share one lattice and are harmonics of one T^2), tileable cell noise (T^2);
- the slope plane R^2 (or the sphere of normals), for shading: the normal field is a map into slopes, the BRDF with its light and view vectors is a function on the slope plane, and the clamp is a threshold there;
- a data domain, for sampled inputs: a texture is a function on its own square, which is a T^2 under wrapping;
- products of these, for materials that combine them: the product latent space, with the joint map.

Count maps are this object in the toroidal case with a particular chart: a count is a phase coordinate divided by 2 pi, the count map is the map into the torus, the "picture" is g. So count maps are not wrong, they are the chart of the structured case. What they capture, and what they miss, is the subject of the next sections.

## 2. What count maps capture: the exactly solvable stationary phase

The pushforward nu is determined, to second order, by the jet of Phi: the map's value, gradient and Hessian at the pixel's centre. Its characteristic function on the torus,

    nu^(m) = E[ exp(i m . theta(X)) ],   m in Z^d,

is the multiplier of the count-map theory, closed form for a quadratic phase under a Gaussian window (the multiplier theorem), and the pairing is the series sum_m g^(m) nu^(m) over the material's Fourier coefficients. This is an oscillatory integral, and its magnitude,

    |nu^(m)| = exp(-(1/2) S |b_m|^2 / (1 + S^2 lambda_m^2)) (1 + S^2 lambda_m^2)^(-1/4),

with b_m the harmonic's rate and lambda_m its curvature, is exactly stationary phase for a quadratic phase: a harmonic whose phase has a stationary point inside the window (rate cancelled by curvature within a few sigma) survives with the 1 / sqrt(S lambda) prefactor of a nondegenerate critical point, and one without decays like a Gaussian in its rate. The depth conditioning of the kernel is the exact treatment of the one non-polynomial phase that perspective produces, rational-linear, which the collaborator showed is not a cubic surrogate; the cubic and higher polynomial phases are the fold and cusp caustics of catastrophe theory, with Airy and Pearcey functions where the count-map theory has the Gaussian.

So what count maps fundamentally capture is: the characteristic function of the pushforward for polynomial phases of degree two, exactly, and for the perspective phase, exactly along the depth line. What they do not capture is which harmonics matter and how many, which is the next section; the latents that are not tori; and the certification of what is dropped.

## 3. The moire spectrum: aliasing as near-resonance

Write the rates of the d phases at the pixel as the 2 x d matrix G (rows: the pixel's x and y). The harmonic m has the rate G^T m in the pixel plane, and its multiplier decays with |G^T m| sigma. The harmonics that survive the window are those with

    |G^T m| <= kappa,   kappa of order 1 / sigma,

the integer points of Z^d in a thin cylinder around the kernel of G^T, a subspace of dimension d - 2. Call the set of surviving m with |g^(m) nu^(m)| above the tolerance the moire spectrum of the pixel. Everything the pixel shows that a point sample would alias is in that set: the rippled checkerboard's moire on row 8 was the combination 3 k1 - k2 + k3 with a net rate of two radians a pixel, a near-resonance of three rates; the checkerboard's own harmonics near the horizon are the near-resonances of d = 2; the mask's far field was the sum over the cylinder for d = 3.

This makes aliasing a statement in the geometry of numbers. The number of lattice points in the cylinder up to |m| = M grows like M^(d - 2) for generic rates, and the coefficients of a material with a discontinuity (a threshold, a tile edge) decay on average like |m|^(-(d + 1) / 2). The absolute sum over the moire spectrum converges only when (d + 1) / 2 > d - 2, that is d < 5, and the sum of the terms themselves converges absolutely for d <= 3 with a margin, for d = 4 on the edge. Two consequences worth their own proofs:

- A dimension limit for certifiable exactness. A discontinuous material with five or more independent frequencies has a moire spectrum whose tail cannot be bounded absolutely; its pixel integral may still converge conditionally, but no truncation can be certified. This is not a limitation of the method, it is a property of such materials: they alias densely.
- A Diophantine design rule. For rate vectors that are badly approximable (their combinations stay away from resonance as well as integers allow), the cylinder holds only about log M lattice points up to M instead of M^(d - 2), and the moire spectrum is sparse for any d. A procedural material whose frequencies are chosen with that property (ratios related to quadratic irrationals, the golden ratio being the classical case) has a small moire spectrum everywhere in the image, and the compiler can verify or choose this at compile time. The filterability of a material is a Diophantine property of its frequencies.

The count-map kernels enumerate the cylinder as a lattice under a reach, which is right for d = 2 and which the mask node extended to d = 3 as a shifted lattice; the moire spectrum is the object those enumerations approximate, and its size is the honest cost of a pixel in the far and transition fields.

## 4. The self-dual pairing: why the crossover is cheap

For a periodic material the pairing has two expansions. Summing the window over the cells of the torus gives

    <g, nu> = int_cell g(u) theta_nu(u) du,   theta_nu(u) = sum_n nu(u + n),

the material on one cell against the periodised window, a theta function. Its two representations, the sum over cells (the coverage branch: the cells the window reaches, each an exact integral of g against a Gaussian piece, the erf products and conic integrals of the kernel) and the sum over the dual lattice (the spectral branch: the harmonics of g against the multipliers), are the two sides of Poisson summation on the torus. This is what the two regimes of every kernel are, and it says why the crossover between them is cheap when it is handled right: a Gaussian is its own Fourier transform, and at the self-dual scale (window width about a quarter to a half of a period) both series of the theta function converge in a handful of terms. The slow decay of a discontinuous material's coefficients never enters, because on the spectral side it is multiplied by the Gaussian decay of the multipliers, and on the cell side the cells are integrated exactly.

The cost claim this supports, to be proved: for a material on T^d whose cell integrals against a Gaussian piece are closed form (polygonal and conic pictures) and whose harmonic coefficients are known, the pixel value to tolerance epsilon is a sum of at most N(epsilon, d, the moire spectrum) terms, independent of the scale of the pattern relative to the pixel, with the cell expansion below the self-dual scale and the harmonic expansion above it. Below the self-dual scale the cells the window reaches are few; above it the multipliers kill all but the moire spectrum. The number is bounded across the whole image because the Gaussian's self-duality bounds the crossover and the moire spectrum bounds the far field. The kernels' measured mid-band costs (78 edge pairs before the four-edge handover, 18 after; 450 to 760 in the mask's transition band) are what happens when the handover is not at the self-dual point and the cut is at 1e-6 instead of the tolerance: this section says where the handover belongs and what the count should be.

Anisotropy is where this needs care and where the collaborator's objection to atom counting applies: a perspective footprint is long along depth and short across it, so the self-dual scale differs by direction; the theta function on T^d with an anisotropic Gaussian has its own self-dual ellipse, and the expansion should be chosen direction by direction (cells across, harmonics along, or the reverse), which is a mixed expansion the kernels do not have yet and which the depth conditioning approaches from one side.

## 5. The consequential theorem: the intrinsic complexity of a pixel

The theorem that would make this theory matter to the industry is not about our method; it is about every method. Define the moire spectrum M_epsilon of a pixel as above. Two claims:

1. The analytic value to tolerance epsilon costs about |M_epsilon| multiplier evaluations plus a bounded number of cell terms: work proportional to the size of the moire spectrum, with a logarithm of 1 / epsilon.
2. Any unbiased sampling estimator of the same pixel with N samples has variance at least the aliasing variance, sum over M_epsilon of |g^(m)|^2 (1 - |nu^(m)|^2) up to constants, and so needs N of order that variance over epsilon^2 samples to reach epsilon: the 1 / sqrt(N) law.

The separation is the factor 1 / epsilon^2: at 8-bit precision, about 2.5e5. This is the quantitative reason the measured table looks the way it does: supersampling at 16 samples and temporal AA at an effective 8 to 16 sit at 0.03 to 0.12 RMS on these scenes because the aliasing variance of a tiled picture is about 0.25 and sqrt(0.25 / 16) is 0.12, and the analytic value sits at the reference's floor because it pays for the terms, not for the variance. Stated and proved with the moire spectrum as the intrinsic quantity, it gives the product its claim: a computable, per-material, per-pixel quantity that says how much any anti-aliasing method must work and shows that analytic prefiltering is the one that works only that much.

## 6. Beyond the torus

Shading. The normal field is a map into the slope plane, its jet is known for procedural bumps, and the pushforward of the window onto the slope plane is a chirped Gaussian, the same object as on the torus. The BRDF for fixed light and view is a function on the slope plane: a Blinn-Phong lobe is nearly a Gaussian there, a GGX lobe is a sum of a few, the clamp n . l > 0 is a half-plane, the normalisation of the normal is inside the function and needs no Gaussian assumption. So the filtered specular is the pairing of a lobe with the slope pushforward, closed form for Gaussian lobes, with the clamp as a coverage term; and the coupling with the picture, the highlight riding on the tiles, is the joint pushforward onto T^d x R^2, the same as the ripple's coupling in one parameter. The collaborator's caution stands: this is a stated closure with a lobe approximation of the BRDF and an error from that approximation, not an exact BRDF integral; but it is the right object, and it says what to approximate.

Sampled inputs. In the affine case the pairing of a texture with the pushforward is exactly the elliptical weighted average, so the count-map theory contains EWA texture filtering as its data case. In the curved case the pushforward is not an ellipse but a bent footprint, and the exact filter for a texture near the horizon is the bent one. Computable from the texture's spectrum with the multipliers, or from a pyramid with a few lobes along the bend: anisotropic filtering with second-order footprints, a concrete extension the industry does not have.

Composition. A product of two quasi-periodic structures is a function on the product torus with the stacked rate matrix, and its multipliers are the same formula. Correlation between the factors is not something to carry: it is automatic, because both sets of phases are functions of the same X and the pushforward is joint by construction. This is the torus form of the collaborator's conditional-expectation hierarchy, and it moves the whole difficulty of composition into section 3: the moire spectrum of the product is the near-resonances of the stacked rates, which grow with the total dimension. Sums are sums of coefficients; thresholds of products are indicators on the product torus with coefficients from a DFT of the stacked phases, which is what the mask node did for d = 3 and which the dimension limit bounds.

Visibility. Parallax occlusion, displacement with self-occlusion, and silhouettes are maps that are not single valued: the latent point seen along a pixel's ray depends on a height intersection. The pushforward of the window through such a map is the pushforward through the visible branch, and the theory as stated does not have it; this is the honest boundary of the framework, and it stays with the engine's geometry AA for now.

Windows. The self-duality of section 4 is the Gaussian's. A box or tent pixel filter is a mixture of Gaussians to any tolerance, at the cost of the mixture's size, and the engine's temporal filter is a window in space-time whose pushforward through a moving map is the same object one dimension up: temporal stability is then a statement about the space-time moire spectrum, not about determinism.

## 7. What this predicts, and what would show it wrong

- The mask's transition-band cost should equal the size of its moire spectrum at the tolerance, computed from its rates alone, not the 450 to 760 evaluations of the current line and series paths. If a count of near-resonances from the rate matrix does not predict the measured cost, section 3 is wrong.
- The ripple's moire terms are the near-resonances of the three rates (gu, gv, grad psi); an enumeration of that cylinder should reproduce the terms the shifted lattice found and no others.
- Replacing the mask's three wavelengths (23, 17, 11) by three in badly approximable ratios should visibly shrink the far-field term counts at equal error. If it does not, the Diophantine rule is wrong or the rates are not the right quantity.
- The measured errors of supersampling and temporal AA on every scene should follow the square root of the aliasing variance over the effective sample count, with the variance computed from the moire spectrum; a scene where they do not would break section 5.
- The four-edge handover and the reach of the kernels should be derivable from the self-dual scale and the tolerance; if the derived handover costs more than the tuned one, section 4 is missing something, most likely anisotropy.

## 8. Credit, and the reformulation the collaborator's reading forced (2026-09-06, bridge #89 and #91)

The pairing of section 1 is not new. Heitz, Nowrouzezahrai, Poulin and Neyret (TVCG 2014, section 4.1) write shader filtering as the inner product of the shading function with the footprint's distribution of inputs, <C0, D_f>, and expand both in finite bases to get sums of pairings of basis elements; Yang and Barnes (2018) propagate pairwise correlations between inputs through the shader with several approximations; elliptical weighted averaging (Heckbert 1989) is the affine data case; LEAN (Olano and Baker 2010) and Toksvig's filter are moment closures for normals; classical homogenization (Bensoussan, Lions and Papanicolaou) and its quasi-periodic extension (Kozlov) integrate out fast periodic variables to produce effective laws; and the near-resonance problem of section 3 is the small-divisor problem of the geometry of numbers and of KAM theory. What the count-map work adds is narrower than the note's earlier sections read: the exact characteristic function of the footprint's distribution for quadratic and rational-linear maps where the prior work uses Gaussian or basis approximations, the exact coverage of coherent discontinuities, and the resonance structure of which harmonics survive, which the prior work does not analyse.

The collaborator's frame, conditional homogenization, is the better statement of sections 3 to 6 and I adopt it. The macrostate at a pixel is the set of phase combinations that stay coherent across the footprint, the kappa-slow module Lambda_kappa(G) = { m in Z^d : |G^T m| <= kappa } of the output observable's rate matrix; the effective law is the projection of the observable onto that module, a material on the quotient torus; the fast module is integrated out, which is what the multipliers' Gaussian decay does. Two gratings that are each fast but close have the slow combination m = (1, -1); the slow module of a product is computed from the stacked rates of the product, which contains cross-resonances that neither factor has, so averaging the inputs before the interaction destroys the effective law, and the rate matrix must propagate through the material graph exactly (rates add under products, unite under sums, multiply by integers under the harmonics of a smooth function of a phase: linear algebra on Z-modules) with the quotient taken at the output, demand-driven.

The central assumption, stated once: the coefficient mass of the output observable on its slow module is finite and concentrated at low order, sum over m in Lambda_kappa(G) of |g^(m)| finite with a computable tail. It is a joint condition on the material (the decay of g^) and the map (the Diophantine type of G): it holds for discontinuous observables generically when d <= 3 and for any d under a Diophantine condition on the rates, and it fails for materials with a continuous spectrum, whose slow module is a continuum and whose only compact effective law is statistical. That gives the dichotomy the theory should be built on: coherent structure (phases, a slow module, an exact effective law) and incoherent structure (moments, a closure with statistical error), joined by conditioning, the moments of the incoherent part conditional on the slow phases of the coherent part. A bump-mapped tile has both.

The first theorem to derive, in the affine quasi-periodic case: the pixel value equals the pairing of the projected observable with the window's pushforward on the quotient, with the error bounded by the sum over m outside the slow module of |g^(m)| exp(-sigma^2 (|G^T m|^2 - kappa^2) / 2), under a stated resonance module, coefficient decay and non-resonance assumption, with the size of the slow module as the work. Then curved maps, where the module bends and the near-resonances that sweep through resonance inside the footprint are the stationary-phase terms of section 2; then disorder, as moments conditional on the slow phases; then shading, as the slope-plane observable of section 6. Section 5's intrinsic-complexity statement becomes a corollary about the size of the slow module against the aliasing variance.

## 9. Open questions I do not know how to answer yet

Whether the moire spectrum's Diophantine count survives the curvature of the phases (the cylinder bends), and what replaces it under exact depth conditioning. Whether the self-dual expansion has a clean mixed form for anisotropic footprints. Whether the intrinsic-complexity lower bound holds for correlated (stratified, blue-noise) samplers, which beat 1 / sqrt(N) on smooth integrands but not, I think, on the aliasing variance. How much of the slope-plane pairing survives a real BRDF with visibility terms. And whether a general material graph can be lowered to a torus function with a computable moire spectrum by the compiler, which is the question the product actually asks.
