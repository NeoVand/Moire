# Paper 2 — "Moiré is counting" (working title) — outline and action plan

The de-frankensteinized paper. Theory first, no application sprawl, no systems
chapters. Everything the TOG draft built — solvers, zoo, figures, experiments,
the instrument itself — is quarry, not obligation. The TOG draft survives as
the systems companion (cite it for implementation depth).

## Thesis, in three sentences

A pattern is a counting map Φ into a torus, composed with an ink potential.
Everything visible about interference is one of three finite questions about
Φ: which integer characters are slow (arithmetic), which survive an average
(analysis), and how the count fails to be a function (topology). Fourier
appears only as amplitude bookkeeping — and its one job, harmonic weights,
is what prices the arithmetic.

## Structure (target: 14–16 pages, self-contained theory + verified predictions)

### 1. The object (≈2 pp)
- Drawing = I∘Φ. Counting maps, fractional index, the torus of counts.
- Characters = H¹(T^K); a moiré is the pullback of a slow character.
- One new figure: a stack beside its torus (schematic) — the only diagram
  in the paper that is not a render.
- Related-work positioning *here*, one column: the indicial method is the
  k=(1,−1) germ of this (and Amidror's own verdict — "ignores intensity
  profiles" — names exactly what the amplitude weight restores); Fourier
  theory is global and needs periodicity; de Bruijn's index function IS a
  counting map (pentagrids/multigrids), asked different questions; the
  hull-torus of incommensurate physics is the same torus, asked spectral
  questions. We sit at the junction; the visibility theory is the new part.

### 2. Law I — Selection (arithmetic of the visible beat) (≈3 pp)
- The visible moiré minimizes amplitude-weighted slowness: per-pixel
  Lagrange–Gauss reduction under the |k₁k₂| weight. (Import: §selection,
  convergents experiment, staircase + stations figure — Fig 6 assets.)
- Stations = convergents; deserts = badly approximable; the golden carrier.
- NEW, verified: DUTY NULLS. A (p,−q) station is carried by profile
  harmonics; an arc of duty d has zero q-th coefficient iff qd ∈ ℤ. Measured:
  50× collapse of (1,−2) at duty 1/2 while (1,−1) peaks simultaneously.
  Figure: character amplitudes vs duty (one panel), plus the render pair.
  Corollary: fringe spectroscopy (measure duty by finding the null).
- The "visibility spectrum" of a real number: best approximation with
  denominators priced by |pq| — state as a definition + staircase; flag the
  number-theoretic object as (to our knowledge) unnamed.

### 3. Law II — Averaging (the envelope is a conditional expectation) (≈4 pp)
- Theorem: averaging along schedule w computes E[I | characters ⊥ w].
  Corollaries, each one line: the fringe law (rank 1), the pivot (rank 0),
  zero-sum preservation of the diagonal, temporal exposure equivalence.
- EXACTNESS: the integral is piecewise polynomial with closed-form corners;
  the segment integrator (residue streams, Gauss-3) evaluates it — faster
  than the sampling it replaced (89 vs 115 ms receipts; error table vs
  65536-tap truth incl. rate-12 stations where 24 taps err by 0.19).
- NEW, verified: TEMPORAL SELECTION. Time-averaging an animated stack at
  rates r keeps exactly k·r = 0: measured 400:1 selectivity swap between
  (1,−1) and (1,−2) by changing rates from (1,1) to (2,1). Figure: the two
  exposures of one scene. (A long exposure is an envelope; the shutter is a
  character filter.)
- ILL-POSEDNESS: conditioning is a chart choice and must be global — the
  licensing lesson, now with the first-order exhibit (handover-quilt.json:
  identical-pitch concentric pair + dipole field; per-pixel winner pockets
  paint carrier-pitch rims that migrate with zoom). Figure: the quilted
  view beside the disciplined one. This section owns the "measurement is a
  layer" moral.

### 4. Law III — Integrability (topology of the count) (≈3.5 pp)
- Trichotomy: lift / monodromy / discriminant — exact, winding, fold — as
  the branch structure of the implicit count. (Import: taxonomy §3.2 text.)
- Carrier classification: the four similarity flows; transverse seeds never
  fold; winding ⇔ rotational part; the alphabet ends (and the tool shipped
  the two clocks it lacked — one sentence, cite companion).
- The fold law: normal speed ∂ₙH = 0; onset radii in closed form; Mach
  condition; the drift constant as Mach number. (Import: fold-law figure —
  crimson caustics over brute renders; gates ≤2.8%.)
- Reach of closed forms: convexity below rotation; rational twists untwist
  (b quadratics, verified exact); non-semialgebraic incidence beyond
  (Kepler-class, branch counts 3,5,9,21,41). One paragraph + table.
- Defects: circle-valued counts mint quantized fringe endings; charge
  counting; core radius where the law fails. (Import: §5 compressed to 1 p;
  keep the fork figure + winding gates.)

### 5. Predictions, measured (≈1.5 pp)
The paper's spine, gathered: a table of every verified claim with its gate —
duty null (50×), exposure swap (400:1), fold onsets (≤2.8%), untwist
(exact to 1e-7), branch growth (3,5,9,21,41), envelope exactness (≤1e-6),
mode-locking staircase (convergents experiment). Every row names its script.
No claim without a number; no number without a script.

### 6. Coda: the instrument (≈0.5 p)
The tool exists, the zoo method, one paragraph, cite the companion for all
engineering. The plate and teaser assets appear throughout as running
examples, not as a gallery.

## What is deliberately OUT
- Applications sprawl (metrology, sound, anti-counterfeit): one sentence in
  the discussion, no sections. (Future paper 3 if ever.)
- The walking-solver engineering (window theorem, Lipschitz skip, GPU
  results tables): companion paper.
- UI/system prose, capture pipeline, motion system: companion.
- The edge-of-chaos rhetoric: one honest paragraph in the discussion tying
  stations/deserts to the resonance web; no cosmology.

## Asset inventory (existing → paper 2)
- Fig 6 (staircase + stations) → §2, tightened.
- fold-law.png + foldlaw.mjs gates → §4.
- defect trio figures + defects.mjs → §4.
- selection/convergents experiment → §2.
- exact-envelope receipts (prototype table, perf probe) → §3 (new small
  table; scripts exist in /tmp — REWRITE as paper/tools/exp/exactsweep.mjs
  with gates, house style).
- NEW figures needed: torus schematic (§1); duty-null panel (§2, script
  exists in session log — port to exp/dutynull.mjs); exposure pair (§3,
  port to exp/exposure.mjs); quilt exhibit (§3, scene saved at
  paper/notes/handover-quilt.json — needs the first-order fix landed so the
  "disciplined" half exists).

## Action plan (ordered; each phase ends in a commit)
- P0. Engineering debt that the paper depends on: extend license discipline
  to the first-order handover (opposed-gradients criterion, preserve
  rings-sum-handover golden; kill the quilt pockets). Zoo before/after.
- P1. Port the session experiments into gated house-style scripts:
  exactsweep.mjs (integrator vs truth), dutynull.mjs, exposure.mjs.
  numbers.mjs learns their macros.
- P2. Skeleton paper2.tex with the five sections, theorem statements only
  (no prose), figures placeholdered, imports mapped. Build must pass.
- P3. New figures: torus schematic, duty-null, exposure pair, quilt pair.
- P4. Prose, one section per sitting, §3 first (it owns the two best
  results), §1 last (write the object description once the laws exist).
- P5. Venue decision with the finished draft in hand — not before.

## Naming candidates (park, decide at P4)
"Moiré is counting" / "The counting maps of interference" /
"Visible arithmetic: a theory of beats without frequencies".
