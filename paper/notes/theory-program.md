# Theory program: what the product needs that the theory does not yet give

Drafted 2026-09-05 late at the author's request, to be planned with the collaborator through the feedback loops we already run. Companion to [product-plan.md](product-plan.md), which holds the product criteria. This file is the ledger: every claim below carries a status, and a claim moves only through the loops in the last section.

Status vocabulary: conjectured (stated, no derivation), derived (a note with the mathematics and its assumptions), prototyped (a CPU implementation against brute force in the harness), gated (the collaborator's numerical and compiler gates pass on an immutable commit), promoted (in the frozen kernel and the compiler).

## Why new mathematics

The theory we have, the count-map pushforward with second-order jets, the multiplier theorem for quadratic phases, exact coverage of half-planes and conics, and recipes with per-term pruning, produces error at the reference's noise floor on every scene tried. It does not produce bounded cost across scales or general material graphs, and the numbers say why: each node lives in two regimes, explicit edges when the pattern is coarser than the pixel and a global series when it is finer, and both blow up at the pixel's own scale, where 100 edge pairs or 700 recipes buy a value that a bounded local description should give with a few dozen terms. Engineering the constants moves that cost by a third; the representation moves it by an order of magnitude or not at all. Generality has the same shape: we have rules for a handful of node types and no algebra that composes two filtered descriptions into a third with an error that is known.

## Track A. A local multi-scale representation of pictures

A1 (derived for affine pullbacks; approximate with a stated remainder otherwise; corrected after the collaborator's review, bridge #75). A Gaussian atom with a linear phase in count space, pulled back through an affine map, is a Gaussian with a linear phase in pixel space, and its expectation under the pixel window is closed form: a complex symmetric 2x2 Gaussian integral (atom-expectation.md). Through a curved map the pullback is not Gaussian: a quadratic count map gives a quadratic phase but a quartic log-envelope (one dimension, u = x^2, atom exp(-u^2/2), pullback exp(-x^4/2)), so the quadratic form in the derivation is an approximation of the log-envelope. It stands only with (a) a positivity witness, the real part of the truncated precision matrix positive definite over the footprint, and (b) a remainder bound for the dropped cubic and quartic terms of the log-envelope over the ball, both computable per pixel from the jet and the atom's width, and the exact alternative where they fail is the one-dimensional quadrature along the direction of the curvature, as the depth conditioning does for phases. Cost per atom in the affine case: one complex exponential and a 2x2 solve.

A2 (conjectured). Each node's picture decomposes into explicit edges (the coverage branch keeps them) plus a sum of atoms that carries the content below the edge scale, with a residual bounded by the decomposition's own tail (a frame bound for the atom system, a Sobolev-class decay for the smooth part). For periodic pictures the atoms are the harmonics windowed to a few periods; for thresholded fields they are the mid-scale content between the edge description and the far-field mean; for lattice noises they are the noise's own kernels, which are atoms already. The decomposition is computed once per material by the compiler, not per pixel.

A3 (conjectured, restated after #75). The earlier statement, atoms meeting a footprint bounded by the footprint's area over the atom's area, is false: the ratio is itself scale dependent, Gaussian atoms have infinite support, and a long thin footprint of fixed area meets arbitrarily many atoms of a fixed width. The claim to test is a hierarchy: atoms at the scale of the footprint's short axis; along the long axis the sum of the atoms met is a periodic or quasi-periodic structure whose Gaussian average has few terms (the mean and low harmonics, the existing spectral machinery), with the residual certified by Track C. The bound must be stated as a function of the tolerance, the footprint's two semi-axes in count space, the picture's complexity (the rank of its phase module and the count of its edge branches) and the tail mechanism. The first test is the noise mask's transition band, where today 450 to 760 evaluations a pixel leave 2.5e-3 to 3.4e-3: the target is 2e-3 at a cost that does not grow with the footprint's anisotropy.

Risk: the hierarchy may not have a clean seam between the atom scale and the periodic collapse, and the edge-plus-atoms split may leave a mid-scale residual that neither side carries. The prototype answers this within a week, after the collaborator's full adversarial response.

## Track B. A composition calculus with certified intervals

B1 (conjectured). A filtered description is a tuple: a mean, a list of atoms, a list of explicit edges, and an error interval. Rules are needed for sum, scalar function of a smooth field (the jets, which exist), product (atom times atom is a Gaussian times a Gaussian, closed form; edge times edge is the joint of two half-planes, which exists as the bivariate normal; edge times atom is an integral of a Gaussian over a half-plane, closed form through the error function), threshold of a description (the zero set of an atom sum is found on lines, or as a conic locally), select and min and max (thresholds of differences), lookups of sampled data (the mipmap is already the pushforward of the window through the texture; its error interval is the texture's own), warps (jet composition, which exists), and seams in the mapping (the window split by the seam as an explicit edge, each piece with its own jet).

B2 (prototyped for the mask's near regime, 2026-09-05 late). The interval: the coverage enclosure the collaborator proposed (two shifted conics around the model's error over a ball, plus the mass outside the ball, plus the integrator's own error) for thresholds; the quadrature's error for lines; the tail bound of Track C for series and atoms. The interval is what decides the representation per pixel and what raises the flag. First numbers (demo modes 11 and 12, twenty near-field probes): every interval contains the truth, and the widths are 0.011 to 0.18 where the true error is 1e-4, because the sup of the Taylor remainder over a 3-sigma ball and the 1.1 percent of the window outside it dominate; at 8-bit the conic regime is certified nowhere with this bound. The tighter rigorous form to derive next: the two indicators can differ only where |q - t| <= |F - q|, so the coverage error is bounded by the window's mass of the band {|q(X) - t| <= eps(|X|)} with eps growing as |X|^3 from the centre, which is small where the density is large; computable as a line integral along the conic or by shells, and it removes the ball's outside mass from the bound.

B3 (conjectured). Lowering: for each pixel the cheapest representation whose interval meets the budget, in a fixed order, with the unresolved interval and the flag carried out when none fits. This is the compiler's inner loop and the definition of "automatic lowering from a node set".

## Track C. Certified truncation at 8-bit precision

C1 (derived for atoms, open for series). Tail bounds for what is dropped: for atom expansions, decay by the smoothness class of the smooth part; for the indicator's Fourier series, the coefficient mass beyond order M is controlled by the boundary's length over M (an isoperimetric-type bound), which is heavy, and is the second reason the global series is the wrong representation at the pixel's scale. The pruning in the kernels bounds each dropped term; nothing yet bounds their sum. The collaborator's point stands until this is derived.

C2 (prototyped as constants, not as a dial). The precision dial: the map from an error budget to the cuts, the reaches, the node counts and the handovers, validated per node by the harness. The first measurement on the flat scenes shows the constants move the cost by a third and the structure by 4x.

## Track D. Shading with contracts

D1 (promoted for one case). Lighting as a function of a phase coupled to the picture: the rippled checkerboard, where the lighting's spectrum over the phase enters the recipes. Generalisation: any lighting that is a function of the same structure as the picture composes through the same recipes.

D2 (conjectured, bounded not exact). Specular on structured normals: normalised normals are not Gaussian and a clamped BRDF has no closed-form expectation, so the deliverable is a closure with a stated BRDF, stated random variables, a validity witness and an error interval, preserving energy and the correlation with the picture. For procedural bumps the slope field's jet is known and the closure is a Gaussian moment; for sampled normal maps the engines' moment filters are the baseline and our contribution is the coupling with the picture.

## Track E. Mappings and phases beyond second order

E1 (prototyped as quadrature). Depth conditioning: a rational-linear phase is linear along lines perpendicular to the depth gradient, so the expectation is a one-dimensional quadrature with the exact phase; in the kernel since 20bc272 with a cubic witness. The closed form is open: the expectation of a cubic phase under a Gaussian is an Airy-type integral, and a cubic multiplier theorem would replace the 24 nodes with a formula and extend the exactness to any map with a third-order jet.

E2 (conjectured). Piecewise-smooth mappings (seams, triplanar blends, parallax): the seam is an explicit edge in the window and each side carries its own jet; the coverage branch already integrates edges, so the rule is a composition rule of Track B, not a new integral.

E3 (out of the product's scope, noted). Geometric edges belong to the engine's AA; the coverage branch could take a silhouette as an edge if an engine handed it over.

## Track F. Time

F1 (conjectured). Animated phases and moving cameras: the analytic value is deterministic, so temporal stability under the engine's TAA is a property to verify, not to build; the combined filtered-plus-TSR arm on the native side is the test. Motion blur as a space-time window is a possible extension of the same pushforward, not planned.

## Feedback loops, as they exist

1. Claims are written here with their status; the collaborator reviews each adversarially on the bridge (variables, witnesses, contracts, what the claim does not cover) before any prototype, as they have done for the depth measure, the counter contract, the enclosure and the specular caution.
2. The CPU harness (`demo/tests/ripples-cpu.mjs`, the shader text itself run in a WGSL interpreter against a jittered brute force, with textual variants for bisecting) is the first numerical gate for every kernel change.
3. The demo's GPU profile by row band and its isolated benches are the second, and the arbiter for compile errors.
4. The collaborator's immutable-candidate gates (DXC compile of the emitted HLSL, float fixtures including adversarial families, the 120-probe comparison, the watchdog controls) on a named commit are the third; promotion into the frozen kernel needs them.
5. Native captures in Unreal, still and moving, next to the engine's AA at matched settings, with the combined filtered-plus-TSR arm, are the product-level test.
6. Formal write-ups go through the review folders (`paper/reviews/`), with probes the reviewer runs.
7. The product criteria in product-plan.md are the acceptance test for the whole.

Cadence: a claim moves one status per loop; nothing skips a loop. The ledger is updated in the commit that moves a claim.

## Ownership, proposed

Claude: derivations and their notes, the CPU prototypes and the harness, the kernel and the compiler's lowering, this ledger. The collaborator: adversarial review of every claim, the benchmark of industry material graphs with references, the numerical and compiler gates, the native comparison and the plugin, the cost protocol on a named GPU, and the evidence folders. Either side proposes claims; the ledger records who reviewed what.

## Order

A1 and A3 on the noise mask's transition band first (the crux of cost), with C1 for atoms; B2's enclosure on the mask's near regime next (the crux of honesty); then B1 rules in the order the material benchmark needs them; E1's cubic multiplier when the quadrature's cost shows in a profile; D2 last, with its contract stated before any code.
