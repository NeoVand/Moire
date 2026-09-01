# The observer theorem — the third pattern is what pooling extracts

Written 2026-09-01. Companion to torus.md. The handoff's "universal-invariant
theorem" (genius-hour 1) and its nonlinear-observer question (genius-hour 6)
are one statement with two halves. Gated check: paper/tools/exp/observer.mjs.

## 1. Setting

A drawing is D = I∘Φ: a counting map Φ: R² → T^K (each layer's fractional
index) composed with an ink potential I: T^K → R. Rephasing layer i by c_i
translates the potential: (τ_c I)(x) = I(x + c), c ∈ T^K. Characters are
k ∈ Z^K; the local frequency of character k at p is ∇(k·Φ)(p) = J_pᵀ k with
J_p = DΦ(p); k is *slow* at p when |J_pᵀ k| is small against the carriers.

## 2. The linear half: invariants of rephasing

**Proposition 1 (the envelope is the universal invariant of a rephasing
subgroup).** For a closed subgroup H ≤ T^K let E_H I = ∫_H τ_h I dh. Then
E_H is the conditional expectation onto the H-invariant functions — the span
of the characters with k|_H = 0 — and every continuous linear functional F on
ink potentials with F(τ_h I) = F(I) for all h ∈ H satisfies F = F∘E_H.
Conversely every G∘E_H is H-invariant. So the H-invariant linear observables
are exactly the linear observables of the envelope: E_H is the quotient of
the ink by the fast rephasing, in the category of linear observers.

Proof. F(I) = ∫_H F(τ_h I) dh = F(∫_H τ_h I dh) = F(E_H I), exchanging a
bounded linear map with a Bochner integral over a compact group. The
converse is that E_H is H-invariant and idempotent. ∎

For the sweep schedule w ∈ Z^K, H is the closure of {u w}, and because w is
integral one period of the sweep already projects exactly:

    ∫₀¹ e^{2πi k·(x + u w)} du = e^{2πi k·x} · 1[k·w = 0].

The sweep is the SHARP projection onto L_w = {k : k·w = 0}, with no leakage.
That is why "envelope = conditional expectation" holds with equality in the
tool, and why the diagonal preserves the whole zero-sum lattice at once.

Why "linear" cannot be dropped: F(I) = ∫ I² is invariant under the whole
torus and is not a function of E[I]. The invariants of rephasing among
NONLINEAR functionals of the potential are the orbit space of I, far larger
than the envelope. The nonlinear observers that matter physically are not
functionals of the potential at all; they are functionals of the DRAWING —
a pointwise front end and a spatial window — and for those the right
statement is the spatial half.

## 3. The spatial half: a window is a multiplier on the torus

**Theorem 2.** Let W ≥ 0 be an even window with ∫W = 1 and second moment
m₂ = ∫|x|² W, and W_ρ its dilate to scale ρ. For Φ ∈ C² and I with
absolutely summable coefficients Σ|k||Î(k)| < ∞,

    (D ∗ W_ρ)(p) = Σ_k Î(k) · Ŵ(ρ J_pᵀ k) · e^{2πi k·Φ(p)} + R_ρ(p),
    |R_ρ(p)| ≤ π · ‖D²Φ‖ · m₂ · ρ² · Σ_k |k| |Î(k)|.

Proof. Expand I in characters and write Φ(q) = Φ(p) + J_p(q−p) + E(q),
|E(q)| ≤ ½‖D²Φ‖|q−p|². The window integral of e^{2πi k·J_p (q−p)} is
Ŵ(ρ J_pᵀ k); the factor e^{2πi k·E} differs from 1 by at most 2π|k||E|,
which integrates against W_ρ to π|k|‖D²Φ‖ m₂ ρ². ∎

The first-order remainder is explicit: for a one-dimensional chirp
Φ₁(x) = x/s + c x², R = Σ_k Î(k) e^{2πi k·Φ(p)} · 2πi a c F_ρ(J_pᵀ k) with
F_ρ(ν) = ∫ x² e^{2πiνx} W_ρ = −Ŵ_ρ''(ν)/4π² — the multiplier's own second
derivative. observer.mjs gates all three lines: the identity is exact to
1e-7 without curvature, the remainder sits inside the bound, and the
second-derivative term accounts for it (1e-5 → 1e-7).

Reading. A pooling observer applies to the ink potential ON THE TORUS the
multiplier m_p(k) = Ŵ(ρ ∇(k·Φ)(p)): the window's transfer function at each
character's own local frequency. When the local frequencies split around
1/ρ — the fringe regime, η ≪ 1 — m_p ≈ 1[k slow] and the observer reports
E[I | slow characters](Φ(p)), the soft version of the sweep's sharp
projection; the two agree exactly on k·J_p = 0 and differ only by the
window's leakage. Fourier low-pass explanations of moiré (Amidror) are the
ρ-soft special case of this per-pixel statement.

## 4. Observers, and the universality of the third pattern

**Definition.** A front-end observer is O = A_ρ ∘ N: a pointwise map
N: R → R (identity allowed) followed by pooling A_ρ = ∗W_ρ, possibly followed
by anything.

**Lemma 3 (potential transport).** N∘(I∘Φ) = (N∘I)∘Φ. ∎

A front-end nonlinearity changes the potential and never the counting map.
Law I — which characters are slow, and where — is observer-independent;
Law II applies with I replaced by N∘I.

**Theorem 4 (universality).** For every front-end observer,
O(D)(p) = Σ_k (N∘I)^(k) Ŵ(ρ J_pᵀ k) e^{2πi k·Φ(p)} + R, with R bounded as in
Theorem 2 for the coefficients of N∘I; in the fringe regime
O(D)(p) = E[N∘I | L_p](Φ(p)). The subtorus is Φ's alone; an observer
chooses only the potential it averages and the leakage of its window. ∎

Order matters. Pool-then-respond (g∘A_ρ) sees g(E[I | L]): the linear
envelope, regraded, no new character. Respond-then-pool (A_ρ∘N) sees the
envelope of N∘I: the same admissible characters, different amplitudes, and
possibly characters I never carried. Both are conditional expectations on
the same subtorus. That is the precise sense in which the third pattern is
canonical: every observer that pools before it decides reports an envelope,
and only the potential is theirs.

## 5. Corollaries with reach (each gated in observer.mjs)

**5.1 Which superpositions have a linear moiré.** Visibility of character k
to O is (N∘I)^(k) ≠ 0. A printed overlay multiplies transmittances,
I = Π g_i(x_i), so Î(k) = Π ĝ_i(k_i): every cross character is present at
linear order, and a defocused camera sees printed moiré. An additive
superposition — two incoherent projected gratings, two tones in air — has
I = Σ g_i(x_i), whose spectrum lives on the coordinate axes: NO cross
character, so no linear observer sees a beat, ever (measured: 8e-17). A front
end with N'' ≠ 0 mints the cross character at leading order — for N = s² on
(a+b)/2, exactly â(1) b̂(1)/2 (measured to 1e-6) — and a hard saturation
min(a+b, 1) mints one at nearly the printed amplitude. Helmholtz's
combination tones and the demodulator's rectifier, in the language of
characters: the beat of additive signals lives in the observer, the beat of
multiplicative ones lives in the ink.

**5.2 Hard ink is observer-proof.** If I takes two values, N∘I = N(0) +
(N(1) − N(0)) I is affine in I: every observer sees the same envelope up to
grading. The third pattern of a hard-ink drawing is canonical in the
strongest sense — the duty null of the 2:1 pair's station (2,−1) holds for
every observer (measured 1e-17 under identity and squaring alike).

**5.3 Soft ink reopens nulls.** A duty-1/2 stroke has no second harmonic;
with symmetric anti-alias ramps it still has none — half-wave antisymmetry
survives symmetric smoothing, smoothstep included — so the null holds for
every LINEAR observer at every blur (measured 1e-17 at ramps 0.35, 0.7, 1.4
on a 16.4 pitch). A squaring front end reopens it with amplitude linear in
the ramp width (3.3e-3, 6.5e-3, 1.2e-2). Prediction for the app: a
nonlinear observer control (square-law, threshold) would show a duty null
reopen as the anti-alias width grows, while the exact envelope — a linear
sweep — keeps it closed at every zoom.

**5.4 The station is the slow character, not the small one.** For a p:q
pair (coarse : fine) the visible station is (q, −p) — q times the coarse
index minus p times the fine — carried by the coarse family's q-th harmonic
and the fine family's p-th. The first cuts of dutynull.mjs and exposure.mjs
projected onto (1,−2) in the wrong order, a coefficient with period 5.3 on a
16.4:8 pair; its null and its exposure swap were real, but the fringe was
not. Measured on the station itself over exact periods: the 2:1 null at
coarse duty 1/2 is 6305× deep, the 3:1 nulls at 1/3 and 2/3 are 3458× and
2549× deep, the amplitudes track |sin(qπd)/(qπ)|·|ĝ_fine(1)| within the
ramp's softening, and the exposure at rates (1,2) keeps the station to 0.09%
of the still while (1,1) and (2,1) wash it 14668×.

**5.5 Nyquist is Theorem 2 applied to the measurement.** A finite-difference
estimate of Φ's gradient is itself an observer with a two-pixel window; its
multiplier has its first zero at two pixels per member, which is where the
handover quilt came from. Closed-form gradients are the ρ → 0 limit: an
observer with no window.

## 6. What this settles for paper 2 §3

- "Third pattern" is formal on two levels: the envelope is the universal
  invariant of the fast rephasing for linear observers (Prop. 1), and the
  universal output of pooling observers up to their front-end potential
  (Thm. 4). Emergence here is literal: the observable content of a
  superposition is its envelope tower; everything else is gauge.
- The sweep is the sharp multiplier, a spatial window the soft one, and the
  leakage term is explicit and gated — the tool's envelope is the idealised
  observer, not an approximation of one.
- Every exhibit must name the slow character. Gate 0 of observer.mjs
  documents the slip and the corrected scripts carry the numbers.

## 7. Open, in order of reach

- Iterated conditioning (genius-hour 2). The tower property
  E[E[I | L₁] | L₂] = E[I | L₁ ∩ L₂] holds for subtori, so envelopes of
  envelopes along the Stern–Brocot chain are a filtration, not a flow;
  the interesting object is the amplitude weighting between rungs, and
  whether station-within-station self-similarity is exact under it.
- Band-pass front ends (centre–surround) are multipliers in the plane
  composed with ours: Ŵ becomes a band-pass and selects a BAND of local
  frequencies, i.e. an observer tuned to one station of the ladder. That is
  a retina. Theorem 2 holds verbatim with Ŵ(0) ≠ 1.
- SHIPPED 2026-09-01: the square-law observer is a toggle in the Research
  panel (`envelopeSquare`), applied before the average in both the tap loop
  and the exact chain, with the pivot as E[c²] composed from per-layer
  (E[α], E[α²]); exactsweep.mjs certifies the squared chain (7.9e-4 worst,
  Gauss-3 kept), and the zoo pins the 2:1 null flat under linear and banded
  under square-law at zoom 0.25. A threshold front end would break the
  closed form (unknown crossing points) and would need the tap loop; not
  built.
