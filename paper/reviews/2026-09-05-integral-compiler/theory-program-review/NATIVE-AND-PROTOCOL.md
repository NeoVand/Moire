# Ownership, native evidence, and the next experimental loop

Companion to the adversarial review of `b04f36b`. Claude's `cc5df3c` already
accepts the affine-envelope correction and withdraws the original A3 claim.
One remaining qualification: an exact one-dimensional integral "along the
curvature direction" requires rank-one, separable, or otherwise stated reducible
curvature. A general two-dimensional quadratic map has mixed curvature and no
single such direction. Positivity of a full-plane quadratic Gaussian model is
positive definiteness of its real precision matrix; restricting the original
source to a footprint does not make an indefinite full-plane model integrable.

## Accepted split

Claude owns the derivations, compiler node semantics, implementation kernels,
CPU prototypes and theory ledger. Codex owns the native integration, independent
reference and candidate gates, comparison fixtures and native cost protocol.
Both may propose hypotheses; a numerical pass never converts an unsupported
mathematical claim into a theorem. The new hierarchy is a research direction,
not a demonstrated novelty or a solved complexity theorem.

Keep three evidence axes alongside the workflow status:

1. **Mathematical contract:** domain, norm, joint measure, assumptions and bound.
2. **Implementation evidence:** source identity, floating-point behavior,
   compiler acceptance and bounded execution.
3. **Product evidence:** native pixels, temporal behavior and measured cost.

An implementation may pass finite probes while its bound remains conjectural.
Promotion is an engineering decision within a stated supported domain; it does
not establish a universal theorem. A jittered reference's apparent noise floor
is not an accuracy certificate. Preserve cross-reference disagreement and
deterministic checks where available.

## What the native integration establishes now

The isolated Unreal 5.8.2 plugin renders three real local players in one game
window, with one source clock and camera, independently retained view states,
per-view material visibility and per-view AA selection. An ordinary screenshot
captures their common viewport. Final render observations record matrices,
temporal jitter, view identities and output rectangles. An optional public
uniform-buffer diagnostic records actual primary raster rectangles without
adding a rendering pass; its CPU copying overhead excludes these runs from
performance claims.

The initial static and moving captures verify 640×360 per pane, AA None/TSR/None,
shared source pose and original-ray registration. The combined third-pane
analytic-plus-TSR capture also registers. An extra startup draw exposed why
game-frame identity and render-family identity must be recorded separately.
Static pixels cannot identify one particular equal-pose frame. Cut observations
are a history-invalidation check, not a complete temporal-quality measurement.

This is still a bespoke checker material adapter. It is not automatic lowering
of arbitrary Unreal material graphs. Native graph support must enumerate the
supported expression nodes, coordinate sources, derivative semantics, sampled
resources and parameter updates, and decline unsupported nodes explicitly.

## Benchmark expansion

Propose these as held-out material families, not as a measured census of studio
practice: brick with narrow grout and a separate paint mask; noncommensurate
periodic layers multiplied before filtering; thresholded cell noise; seams and
triplanar blends; procedural bump slopes under an explicitly specified lighting
model; and sampled normal maps under a stated BRDF. Keep geometry and silhouette
AA with the engine. Freeze the source expression and parameter distribution
before fitting representations or cutoffs.

A texture baseline must represent the same field. A finite periodic tile is not
an equivalent baseline for an aperiodic source merely because it looks similar.
Report any approximation and its own error separately. Gaussian reference
scores are useful filter-specific diagnostics; TSR has its own reconstruction
filter, so these scores alone do not rank overall AA quality.

The named native cost target starts on the Apple M4 / Metal / Unreal 5.8.2 host.
Run each method separately at an actual 1920×1080 output: raw, TSR, analytic,
analytic plus TSR. The synchronized triptych is for comparison, not isolated
method timing. Measure both incremental shading cost and completed whole-frame
cost, including rejected representation trials, enumeration, fallback work and
dynamic table construction/upload. State cache warmup, table memory and
parameter invalidation costs. Bracket runs with raw controls and reject unstable
timing batches. No claim of 60 FPS follows from these capture runs.

## A derivation should ship with its adversarial fixtures

Use a small versioned JSON contract containing: claim/source revision; canonical
expression and all parameters; coordinate map and joint window; threshold and
visibility domain; requested error norm/budget and work cap; expected witness or
decline behavior; reference method and convergence evidence; and exact candidate
export/entry. Record measured value, claimed interval, actual work, status and
reference disagreement independently. Preserve failures and unknowns.

Every representation handover gets paired fixtures on both sides and directly
on the boundary. Every warp gets off-axis mixed-term probes, pole-distance and
anisotropy sweeps. Every multiplication gets correlated, anticorrelated and
near-resonant controls. Every threshold gets a plateau and a saddle. Every
temporal test crosses handovers, changes parameters and performs explicit cuts.

Error should be allocated across the complete expression, including the summed
omitted tail. An 8-bit display target also needs a stated transfer function and
range; a uniform linear error is not a uniform code-value error near black.
For a monotone transfer, propagate the endpoint interval through the transfer.

The next useful order is B2's honest threshold enclosure, an affine atom positive
control plus curved-envelope counterexample, and a hierarchy experiment with
explicit unresolved residual accounting. Optimize the measured bottleneck only
after these contracts distinguish model error, integration error and missing
correlation.
