# Handoff — the Moiré project, its theory, and where it is going

Written 2026-09-01 for the successor session. Read this first, then, in
order: `AGENTS.md` (the always-applied project memory — dense, every line
load-bearing), `paper/notes/paper2-plan.md` (the roadmap you are executing),
`paper/notes/torus.md` (the formulation), and skim
`git log --oneline -30` — the commit messages narrate the whole intellectual
history in prose and are worth the ten minutes.

## The mission, in the author's own terms

The ambition is NOT a graphics paper. The author wants to discover **what the
envelope really is — the third pattern — in all kinds of beating**, and
believes it is an *exactly solvable mechanism of emergence*. The historical
blinder: beating has always been studied on sinusoids, where

    cos(w1 t) + cos(w2 t) = 2 cos((w1+w2)/2 t) cos((w1-w2)/2 t)

collapses everything into a two-factor identity so tidy that there was
nothing left to ask. For sinusoids the envelope factorizes trivially; for
real profiles — strokes, pulses, squares, anything with a full harmonic
ladder — the third pattern is a rich object: a saturating tent rather than a
cosine, a whole lattice of stations, exact duty nulls, quantized defects,
mode-locking staircases. The author's conjecture is that the envelope is not
a "view" or a perceptual artifact: **it is the canonical structure that any
slow or nonlinear observer — an eye, a camera, a brain, any system that
averages before it responds — necessarily extracts**, and that the question
of "visibility" was always the wrong frame. The theory should meet David
Deutsch's standard for good explanations: hard to vary, and with *reach* —
answering questions it was not built to answer. It must remain clearly
demonstrated in the app (Moire) at every step: build it, try it, learn from
it, then go explore the math. That loop is the project's ethos and it has
paid off every single time it was honored.

A concrete theorem candidate for the successor to chase, which would make
"the third pattern is real" precise: *any functional of the drawing that is
invariant under rephasing of the carriers factors through the conditional
expectation* — i.e., the envelope fields are the universal invariants, the
quotient of the joint system by its fast symmetry. That is ergodic factor
theory wearing new clothes, and it may be provable in an afternoon. If true,
"emergence" here is literally: the observable content of a superposition IS
its envelope tower, and everything else is gauge.

## The theory as it stands (three laws over one object)

**Object.** A drawing is `I ∘ Φ`: a counting map `Φ: R² → T^K` (each layer's
fractional member index; walking families make Φ a correspondence, winding
families give it monodromy) composed with an ink potential `I` on the torus
(paint-order composite of per-coordinate stroke profiles). Fourier appears
nowhere except as amplitude bookkeeping for I.

**Law I — Selection (arithmetic).** The visible moiré is the integer
character `k` of the torus with the slowest pullback, weighted by amplitude
`|k1 k2 ...|` (profile harmonics decay ~1/n). Computed per pixel by
Lagrange–Gauss reduction. Stations = convergents (Stern–Brocot); deserts =
badly approximable directions (golden). VERIFIED PREDICTION: duty nulls —
`paper/tools/exp/dutynull.mjs` (42× station collapse at duty 1/2 while the
difference beat peaks; gates pass).

**Law II — Averaging (analysis).** The envelope along schedule `w` is the
conditional expectation `E[I | characters k with k·w = 0]`. The fringe law
(tent) is its rank-1 case, the contrast pivot its rank-0 case, the diagonal
preserves the zero-sum lattice. It has a CLOSED FORM (piecewise-cubic
profiles, corners known from the phase trio) and the shipped shader now
evaluates it exactly, faster than the tap sampling it replaced. Conditioning
is a global chart choice: per-pixel choice quilts the view (the licensing
lesson, and the open P0 defect below). VERIFIED PREDICTION: temporal
selection — `paper/tools/exp/exposure.mjs` (a long exposure IS an envelope;
animation rates select which fringe survives, 615×/45× swap; gates pass).

**Law III — Integrability (topology).** The three ways a count can exist =
the branch structure of the implicit function of the incidence `F(p,ν)=0`:
glues (exact), monodromy (winding — defects with quantized charge), or a
discriminant (fold). All decided in closed form: the carrier classification
(four one-parameter similarity flows; transverse seeds never fold; winding ⇔
rotational part), the fold law (`∂ₙH = 0`, onset radii like `s/(θ sin π/k)`,
gated to 2.8%, the drift constant is a Mach number), the reach of closed
forms (convex below rotation; rational twists untwist into b quadratics;
provably non-semialgebraic beyond — Kepler's class, but multivalued).

## History — how the ideas evolved (and the lessons)

1. **The instrument era (before this arc).** Moire: WebGPU/TSL app; layer =
   index field + distance field; fringe law Φ(D); heterodyne ratio η; the
   certified walking-family solver; the zoo (golden-image regression through
   the real GPU). Lesson that shaped everything after: *every view must be a
   measurement with a gate*.
2. **The envelope wars.** Tap-based envelope accumulated artifacts: dark
   thumbs, circular pocket seams ("quilting") on a dipole-warped pair. Fixes
   evolved from local patches to a structural principle: devW = P·R·T·L
   gates, and the LICENSE — deviation identity is a decision of the stack,
   never of the pixel. Then the per-pixel pivot (independent-phase mean =
   the DC; contrast amplifies exactly the correlation) and true-width
   strokes (the zoom-out blur was the hairline floor inflating duty).
3. **The fold-law arc (the "pressure test").** Asked for the general theory,
   found it in two generators: group orbits (four similarity flows) and
   propagating fronts (support functions). Fold law with closed-form onsets,
   verified by brute nesting tests that know no calculus; the figure draws
   predicted caustics in crimson over brute renders. The reach-of-closed-
   forms results (untwist; non-semialgebraicity). Software dividends: the
   log-spiral family (the loxodromic clock the classification said was
   missing; bend 0 = geometric rings), and a real bug found by algebra —
   both solver twins collapsed spiral chirality through abs(); the teaser's
   counter-spiral caption arithmetic was unreachable in the tool until then.
4. **The torus formulation** (`paper/notes/torus.md`): drawing = I∘Φ; the
   envelope as conditional expectation; the five-law collapse sketch; edge
   of chaos = the resonance web, graded by amplitude.
5. **The exact envelope.** From the conditional-expectation form: profiles
   are piecewise cubic with closed-form corners, so integrate exactly —
   first attempt 6× slower than taps (a 224-float per-pixel event array
   spilled to scratch and collapsed GPU occupancy: ARCHITECTURE BEATS
   FLOPS), rebuilt as per-layer corner RESIDUES modulo each layer's period
   with a K-way cursor merge, Gauss-3: now FASTER than 52 taps (89 vs
   115 ms) with zero noise at any zoom/rate/thinness. All 55 zoo goldens
   matched without re-blessing.
6. **Predictions verified same-day** (duty nulls; temporal selection — both
   now gated repo scripts). **Prior-art scan**: the object exists in three
   non-communicating literatures — Amidror's indicial method (which his own
   book says ignores intensity profiles — exactly what Law I restores),
   de Bruijn's multigrid index function (IS the counting map; they dualize
   to Penrose tilings, never ask visibility), and the hull torus of
   incommensurate physics (spectral questions only). The visibility/
   averaging/integrability theory appears to be ours.
7. **The handover quilt** (user-found, diagnosed, FIX PENDING = P0): scene
   `paper/notes/handover-quilt.json` (identical-pitch, identical-center pair,
   one with a steep dipole field) shows zoom-migrating pockets of
   carrier-pitch rims. Bisection: exact ≡ taps (0.03 gray), survives
   contrast 1, CPU trio ≡ brute truth, and forcing the diagonal removes it —
   it is the FIRST-ORDER sum/diff handover (license-exempt by design)
   flip-flopping per pixel where the difference character degenerates to the
   field alone. Fix direction in AGENTS.md: extend license discipline to
   first order for nominal-degenerate pairs, key the handover on genuinely
   opposed gradients; MUST preserve the `rings-sum-handover` golden.

## What is in the repo (read in this order)

1. `AGENTS.md` — full project memory: product contract, inverse math, the
   envelope machinery (devW gates, license, pivot, exact sweep), fold law,
   zoo method, checks. The "KNOWN DEFECT" entry is P0.
2. `paper/notes/paper2-plan.md` — the de-frankensteinized paper: thesis,
   six-section outline, asset inventory, action plan P0–P5.
3. `paper/notes/torus.md` — the formulation and the five-law sketch.
4. `src/gpu/composite.ts` — the whole renderer: solveLayers, scanCharacters
   (selection), sweepStack (tap loop + exact path: `exactResidues`,
   `exactChain{K}` generated WGSL, `exactLayerMean`), grade.
5. `src/gpu/inverseCpu.ts` / `src/gpu/inverse.wgsl.ts` — the solver twins
   (curve kinds 0–4; log spiral = kind 4; signed spiral chirality).
6. `src/gpu/renderer.ts` — writeSlots: ranking, licenses (`pairLicense`),
   `exactSweep` gate (all-scalar, no morphs), solo pivot.
7. `paper/tools/exp/` — gated experiments: `foldlaw.mjs` (+`-figs`),
   `dutynull.mjs`, `exposure.mjs`, `defects.mjs`, `convergents.mjs`;
   `paper/tools/numbers.mjs` regenerates `numbers.tex` and FAILS on any
   gate failure (the prose cannot quote an unverified number).
8. `tests/zoo/` — the golden-image method; `render.mjs` doubles as the
   perf probe (`--scale 3`) and scene renderer for ad-hoc probes.
9. The TOG draft (`paper/*.tex`, esp. `sec-field.tex` §3.2 taxonomy +
   carrier classification, `sec-walking.tex` fold law + untwist,
   `sec-super.tex` selection/envelope, `app-proofs.tex`) — now the
   *companion/systems* paper; paper 2 mines it.

## Discipline (violate any of these and the repo will punish you)

- `npx tsc --noEmit` checks NOTHING (solution file). Use `npm run build`,
  `npx eslint src`, and `npm run zoo` before AND after touching `src/gpu/`.
- CPU and WGSL solvers are twins and must not drift; the zoo is per-backend
  (current goldens: webgpu, Apple Metal); bless only diffs you can explain.
- Every number in the paper is generated (numbers.mjs), never typed.
- Commit style: long narrative messages explaining the WHY; commit and push
  as you land things; never commit `.agents/`, `.claude/`, `skills-lock.json`.
- After editing paper LaTeX: rebuild PDF (tectonic) AND the HTML
  (`node paper/tools/html/build-html.mjs`), commit `public/paper/`.
- The author tests by hand in the app; ship things they can feel, then ask.

## Open questions with reach (the "genius hour" list)

1. The universal-invariant theorem (above): envelope = the factor of the
   joint system by carrier rephasing. Would upgrade "view" → "the third
   pattern" formally, and is the paper-2 §3 crown if it holds.
2. Iterated conditioning: envelopes of envelopes along the subtorus
   filtration = a renormalization flow organized by Stern–Brocot. Is the
   station-within-station self-similarity exact?
3. The 2-D cell version of the exact sweep (lattices still tap; the fold
   law's support calculus suggests the cell integral also has closed
   corners).
4. First-order handover discipline (P0) — the last known lie in the
   envelope, and the quilt figure needs its "after" half.
5. The "visibility spectrum" of a real number (best approximation priced by
   |pq|): apparently unnamed in number theory; even a definition + staircase
   figure has standalone value. [RESOLVED 2026-09-01: it is Perron's
   k_n‖k_n x‖ = 1/(x_{n+1} + k_{n−1}/k_n) up to a factor → 1 — a classical
   object, so the novelty claim is withdrawn; the new content is the
   threshold (a convergent is a station iff its complete quotient plus the
   denominator ratio exceeds ~4; a_{n+1} ≥ 5 guarantees, ≤ 2 forbids) and the
   deserts (golden at Hurwitz's 1/√5, silver at 1/2√2). stations.mjs gates
   it; paper 2 §2.3 states it.]
6. Nonlinear observers: which class of pointwise nonlinearities composed
   with local averaging extracts exactly E[I | subtorus]? (This is the
   author's "a brain interacts with the third pattern" intuition made
   checkable — start with rectification, the classic beat-demodulator.)

The author's instinct, stated at handoff: *"a good theory will answer
questions that you didn't even intend to answer."* The duty nulls and the
exposure selection were exactly that — neither was sought, both fell out,
both survived measurement within the hour. Keep that loop tight and this
project will keep paying.

## Addendum — 2026-09-01, the successor's first day

P0 is landed and its diagnosis was revised. The handover quilt was not a
licensing gap: the exhibit's rings carry `offset (−0.07, −0.014)`, a
fiftieth of a spacing per member, so the pair sat on the walking families'
screen-derivative gradient path, and at 1.87 px per member a derivative of
the fractional index aliases — the two layers unwrapped differently and the
SUM character read as slow (a first-order winner, licence-exempt), so the
sweep held carrier-pitch rims in zoom-migrating sectors. The same scene at
three times the pixel density was clean before any fix. The fix is at the
root: every scalar family's index gradient is closed form now (a walking
member's facet normal in the layer frame, built from the member index the
split ring solve reports), the dFdx path is gone from the scan, and the
exhibit is a zoo golden (`walk-field-quilt`). Genius-hour item 4 is
therefore closed, and the "measurement is a layer" moral gained a second
face for paper 2 §3: an observer's window is Nyquist-limited.

Genius-hour items 1 and 6 are now one note, paper/notes/observer.md, with a
gated check (paper/tools/exp/observer.mjs, 12 gates): the envelope is the
universal invariant of the fast rephasing among linear observables and one
sweep period projects sharply; a spatial window is a Fourier multiplier on
the torus with an explicit, verified curvature remainder; every observer
that pools before it decides reports E[N∘I | L_p] and owns only its
front-end potential. Its reach: additive superpositions have no linear
moiré, hard ink is observer-proof, soft ink reopens duty nulls under a
nonlinear front end. Writing the gates exposed that the two same-day
predictions had been measured on a carrier-scale coefficient, not the
visible station; re-aimed, the duty null is 6305× deep and the exposure
selectivity 14668×.

By the end of the day P0–P4 are all landed: the exact sweep is certified
three ways (a double-precision JS twin, the shipped WGSL through a headless
compute harness, and a 65536-tap truth; exactsweep.mjs), paper/paper2.tex
exists with six sections of prose and proofs, seven figures (four new: the
TikZ torus, the duty-null plot and station-envelope triple, the exposure
quad, the quilt pair generated by a two-pixel estimator in the CPU mirror),
and a generated predictions table of twenty gated rows. Build it with
"cd paper && tectonic -X compile paper2.tex --outdir build". What is owed
next is in paper2-plan.md under P4: citations with verified bibliography,
the weighted staircase, an abstract pass. The genius-hour list is now:
iterated conditioning (2), the 2-D exact cell integral (3), the visibility
spectrum (5), band-pass observers (new, observer.md §7), and an observer
control in the Research panel (new, observer.md §7) — the last is the thing
to ship next if the author wants something to feel.

THE AUTHOR'S VERDICT, late 2026-09-01: paper2.tex as drafted reads as a
follow-up to the moiré paper — dense, moiré-biased, no build-up — and will
most likely be scrapped for a third paper written from the theory up. Read
paper/notes/beating.md FIRST: it is the framework at the right level of
abstraction (families → counts → torus → the quotient → the observer →
emergence iterated), an honest ledger of what is classical and what is ours,
and the cross-domain predictions; paper/tools/exp/ear.mjs is the first
experiment outside moiré (an ear model on aired pulse trains: the octave
duty null through square-law, cubic and two-stage ears; a linear ear hears
nothing; a cubic ear reopens a softened null a square-law keeps; beats of
beats need a two-stage observer; the golden desert in sound). Everything
below this line is the day's record and still true of the repository.

Later the same day the observer control shipped (Research panel →
Square-law): the drawing squared before the average in both the tap loop and
the exact chain, the pivot E[c²] composed exactly from per-layer (E[α],
E[α²]), certified by exactsweep.mjs, pinned by two zoo cases. Try it on a
16.4:8 line pair with the coarse stroke at 8.2: envelope on is flat, the
toggle brings the station back, and zooming out makes it stronger.
