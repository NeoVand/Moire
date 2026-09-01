# The torus of counts — scratchpad

The one-object formulation the paper keeps circling. Written to be mined for
the eventual collapse into a few theorems; the exact envelope below is its
first engineering dividend.

## 1. Every drawing is I ∘ Φ

A stack of K scalar-index layers is a map

    Φ : R² → T^K,   Φ(p) = (ξ₁(p), …, ξ_K(p)) mod 1

(the counting maps, fractionally), composed with a fixed **ink potential**
I : T^K → color — the paint-order composite of per-coordinate profiles
A_i (a trapezoid: duty window with aa ramps). The render is I∘Φ. That is the
whole tool. Everything the paper studies is a property of Φ, of I, or of the
interplay:

- **Carriers** = the fast directions of DΦ.
- **A beat** = an integer character χ_k(x) = k·x, k ∈ Z^K, whose pullback
  k·Φ has small gradient. No Fourier needed anywhere: k lives in H¹(T^K) = Z^K,
  the *integer cohomology of the target*, and "visible moiré = slow pullback
  of an integer cohomology class" is the frequency-free statement. Fourier
  only ever enters through amplitude weights, and those are really a rank
  statement about I (a product of one-coordinate factors — its "spectrum" is
  supported on the coordinate axes and decays like 1/harmonic; hence the
  |k₁k₂| merit).
- **The selection principle** = shortest nonzero vector of the pulled-back
  lattice {Σkᵢ∇ξᵢ} under the amplitude norm — Lagrange–Gauss, as shipped.
- **The rungs** = the topology of Φ. Exact: Φ lifts to R^K. Winding: Φ lifts
  on a cover; the obstruction is the monodromy homomorphism π₁(domain) → Z^K
  (defect charges = its image, quantized because monodromy is). Fold: Φ is
  only a correspondence (the incidence variety of the fold law); the
  discriminant ∂_νF = 0 is where the correspondence fails to be a graph.
- **A field** = post-composition Φ ↦ Φ + A·f·e_i: moves Φ within its homotopy
  class or (circle-valued f) changes the monodromy by a quantized amount —
  and can never create a discriminant. §5 in one line.

## 2. The envelope is a conditional expectation (and has a closed form)

The sweep with schedule w ∈ Z^K (diagonal (1,…,1), or a licensed deviation)
averages I along the orbit {Φ(p) + u·w}. The orbit's closure is the subtorus
T_w annihilated by L_w = {k : k·w = 0}. Therefore

    Envelope(p) = E[ I | characters in L_w ] (Φ(p)),

the conditional expectation of the ink potential on the quotient torus. This
single statement subsumes:

- **Fringe law** (Thm 2): rank-one residual, two layers — E[I | ξ₁−ξ₂] = Φ(D),
  the tent.
- **Zero-sum preservation**: the diagonal's L_w is the zero-sum lattice —
  every pairwise difference and ternary at once — which is exactly the
  shipped "THE DIAGONAL IS THE ENVELOPE".
- **The pivot**: E[I] over all of T^K — the independent-phase mean; the
  contrast expansion amplifies exactly the conditional-minus-unconditional
  part, i.e. the correlations carried by L_w.
- **Licenses**: which subtorus to condition on is a *global* (stack-level)
  choice — a per-pixel choice of T_w quilts the view; hence P·R·L.

**Exactness.** For a rank-one schedule the conditional expectation is a 1-D
integral over u ∈ [0,1) of a product of per-layer profiles evaluated at
ξᵢ + wᵢu. Each profile-in-u is piecewise cubic (trapezoid with smoothstep
ramps composed with a linear function), with corner positions known in closed
form from the phase trio (residual, up/down neighbors, gap) — so the integral
is *piecewise polynomial with known breakpoints* and can be computed exactly:
segment the period at the union of corners, integrate each segment with a
Gauss rule of sufficient degree. No taps, no tap-adequacy limit, no Quality
dial: a rate-q schedule just contributes q times as many (known) corners
instead of needing taps ≳ 8q.

Two shader-friendly integrators, to be chosen by prototype:
(a) **merge-exact** — K-way merge of per-layer corner streams; Gauss-4 per
segment (exact through two simultaneous cubic layers, ~1e-6 beyond);
(b) **corrected taps** — keep a small uniform tap grid and add the
Euler–Maclaurin corner corrections Σ J_c·h²·B₂({θ_c/h})/2 (positions and
derivative jumps are closed-form); kills the leading error terms that make
tap noise *spatially coherent*, which is what the eye sees.

Ground truth: 65536-tap trapezoid. Target: max error ≤ 1e-4 (display is
4e-3) across pairs/trios/walking/radial/high-rate stations.

## 3. Edge of chaos, made precise

The interesting patterns concentrate where the schedule flow *just fails* to
equidistribute: the resonance web {stacks with k·w = 0 solvable at low
|k|·amplitude}. Rational ratios = closed orbits = locked stations;
golden-ratio directions = maximally equidistributed = fringe deserts; the
visible drawing lives on the boundary, graded by the merit weight. The
convergent staircase (Fig 6) is the 1-D slice of this web; the untwist
proposition is its solver-side shadow (finite frames ⇔ rational); "most
irrational = least pattern" is why the printed carriers ride the golden
slope. If the paper ever collapses to a few laws, this is the fourth:

  A. Factorization: drawing = I∘Φ, moiré = slow integer cohomology.
  B. Conditioning: every averaged view = E[I | subtorus]; fringe law,
     pivot, envelope, licenses are its rank-0/1/global cases.
  C. Selection: the visible class is the amplitude-weighted shortest
     vector (reduction, convergents).
  D. Integrability: exact/winding/fold = lift/monodromy/discriminant,
     each decided in closed form (fold law; untwist; carrier flows).
  E. The edge: pattern density is the distance-to-resonance function;
     art lives at its boundary.

Not for this session: rewriting the paper around A–E. This note is the seed.
