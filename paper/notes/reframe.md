# The reframe: beating as arithmetic on counting fields

Working document for restructuring the paper around its deeper point. The
paper's current spine says: represent a layer as two fields and the fringes
become computable. The reframed spine says something stronger and simpler,
of which the current paper is the 2D instance.

## 1. The object

A pattern is a pair (Ξ, F):

- **Ξ : M → T^K**, a *counting map*. Each coordinate counts members of one
  family, fractionally; the gauge lattice Z^K absorbs the arbitrary choice
  of who is member zero. K is the pattern's rank (1 for a scalar family,
  2 for a lattice, K for a stack).
- **F : T^K → [0,1]**, an *ink function* on the torus. The drawn image is
  F∘Ξ.

Everything in the current paper is a statement about this pair. The
distance field is the leading term of F; the index field is one coordinate
of Ξ; the fringe law is about the pushforward of F along slow characters;
eta measures DΞ; the envelope integrates F over a subtorus; the walking
solver evaluates Ξ where it has no closed form. One object, one page,
where the current paper takes three sections to assemble it implicitly.

Note what the split explains at once: a honeycomb and a triangle lattice
share Ξ and differ only in F ("kind lives in the ink, geometry lives in
the counting"), which is why the envelope's ink weights had to exist.

## 2. The ladder (integrability) and the axis (rank)

Every family in the tool sits in one cell of a 2-by-3 table:

| | rank 1 | rank 2 |
|---|---|---|
| **exact** (Ξ has a global scalar potential) | the nine phase families | the three lattices + tilings |
| **defect** (closed but with periods; circle-valued) | radial pencil (a charge-N defect), `theta` fields | — (future) |
| **fold** (branched counting; no global form) | walking families | — (future) |

- *Exact*: ξ = f(p). "Family = field": circles are lines∘r, parabolas are
  lines∘(y − ax²), spirals are lines∘(r − bθ). The catalog collapses to
  ONE family (parallel lines) precomposed with fields. The space of exact
  rank-1 patterns is an affine space over scalar fields, which is why the
  contouring section works: differences of patterns ARE fields.
- *Defect*: the counting form is closed but has periods; ξ is
  circle-valued with winding. The radial pencil is not an exception to the
  theory, it is the charge-N point defect of the line family. A field
  containing `theta` mints defects: `theta/tau` inserts one extra member
  (a fork; an edge dislocation; the fork-grating hologram). Fringes can
  END at a defect, and the number of endings is the charge.
- *Fold*: no global form at all; the local index tears along envelope
  curves (fold catastrophes). This is WHY walking families need search:
  search is the price of non-integrability, and the certificate is the
  interest rate. The paper's second half gets a reason instead of a
  circumstance.

## 3. The four load-bearing statements

**T1 (fringe law).** Local averaging of F∘Ξ leaves Φ(k·Ξ) for the slow
character k, with a tent profile and O(η) error. *Status: proved and
measured in the current paper. Unchanged.*

**T2 (selection is best approximation).** Which character wins is not a
perceptual mystery and not an enumeration problem: in 1D the characters
that ever win, as the order budget grows, are exactly the continued
fraction convergents of the pitch ratio (Lagrange's best-approximation
theorem, imported). In 2D the winner is found by Lagrange–Gauss reduction
of the character lattice {aG1 + bG2}, exactly, at any order, in a handful
of iterations per pixel. *Status: classical import + new identification;
verify numerically (E1), then implement (E2). Kills the |k| ≤ 2
limitation. Also explains: 2:1 beats (a convergent), 3:1 blindness (the
next one), golden-ratio tap scrambling (worst-approximable = the fringe
desert, by Hurwitz), and the marginal band's continued-fraction structure
(same object, met by the solver).*

**T3 (the envelope is a conditional expectation).** Averaging over the
subtorus orthogonal to the kept characters is basis-independent; every
sweep schedule in the supplemental is a basis choice for one annihilator;
a character is holdable by a connected sweep iff primitive (the (2,0)
"no unimodular completion" observation, stated as a lemma). *Status: easy
lemma; new statement; also the two-scale-convergence connection.*

**T4 (defect fringe topology).** For circle-valued fields, fringes are
leaves of a singular foliation; the signed count of fringe endings inside
a loop equals the enclosed charge times the gain. *Status: new to state
in this framework, classical in optics (Nye–Berry dislocations, fork
gratings); verify by experiment (E3).*

## 4. Honesty ledger

- Counting/indicial view of moiré: classical (Oster; Amidror's geometric
  approach). The paper already credits this. New: exactness with a
  validity field, and the (Ξ, F) formulation as a *representation*.
- T2's mathematics: Lagrange, 1798. New: the identification of visible
  beat selection with best approximation, the reduction algorithm in a
  renderer, and the golden-ratio/tap connection.
- T4's physics: known in singular optics. New: authorable defects in an
  interactive field framework; the fringe law extension; the pencil
  unification.
- Two-scale convergence: Nguetseng/Allaire. New: the identification.

The paper's existing style (name the debt precisely, state the delta)
carries all four.

## 5. The reframed paper

1. **Introduction.** The claim: beating is arithmetic on counting fields;
   frequency analysis is its affine special case; here is the local
   theory, exact where Fourier is asymptotic, and an instrument that runs
   it at 60 Hz.
2. **A pattern is a counting map and an ink function.** (Ξ, F), the
   ladder, the taxonomy figure. The catalog becomes a half-page: thirteen
   families as one family plus fields plus rank (table derives every
   ψ from the current Table 1).
3. **Superposition.** Torus map, characters, T1 (unchanged theorem), η,
   T2 with the convergent theorem and the reduction scan, T3 as the
   envelope's foundation. The convergent-fan figure lives here.
4. **Defects.** Circle-valued fields, T4, the fork figure, the pencil
   as a defect. Short section, big conceptual payoff.
5. **Folds and their inversion.** Current §5 + §6, lightly compressed
   (proofs already in the appendix).
6. **The instrument.** Current §7 compressed; §7.5 (clock) to
   supplemental.
7. **Results.** Current results + E1/E2/E3/E4 additions; vector-renderer
   comparison keeps its headline figure, detail to supplemental.
8. **Fringes as an instrument.** Current §9, now literally "patterns form
   an affine space over fields; the moiré is visible subtraction with
   gain 1/s."
9. **Discussion.** Limitations shrink: the order-two cap is *deleted* as
   a limitation (T2 removes it).

## 6. Experiments and figures

- **E1 `convergents.mjs`**: 1D verification that scan winners are CF
  convergents; 2D verification that Gauss reduction finds the true winner
  and measurement of what |k| ≤ 2 misses. Feeds F2.
- **E2 reduction scan in the shader**: replace the CHARACTERS enumeration
  with weighted Lagrange–Gauss reduction per pixel (or keep enumeration
  as fallback behind the same interface). Zoo cases at 3:1 and 5:2.
- **E3 defect charges**: fields with winding; count fringe endings on
  probe circles against the authored charge; the fork render.
- **E4 local Nyquist**: η with the pixel lattice as one more layer
  predicts the resampling moiré of the traditions figure's raster panel.

- **F1** taxonomy (rank × integrability, all families placed).
- **F2** the convergent fan: winning character vs pitch ratio and order
  budget; Stern–Brocot structure visible; golden ratio marked.
- **F3** the authored dislocation: fork render, fringe endings, charge.
- **F4** predicted vs actual resampling moiré.

## 7. Stages (each leaves the paper submittable)

- **S1** Validate T2 numerically (E1). Gate: winners match convergents.
  *DONE — convergents.mjs: 207/207 ratios' record-setters are convergents;
  the |k| ≤ 2 cap misses 858/4000 visible fringes, reduction misses 2.*
- **S2** Reduction scan in the tool (E2) + zoo. Gate: finds every fringe
  the enumeration finds, plus the 3:1 family, at acceptable cost.
  *DONE — per-pixel Gauss reduction in scanCharacters (8 unrolled steps,
  short vector + two-row window, amplitude weight |a b|; the exact shader
  scheme mirrored in convergents.mjs misses 1/4000, names the brute-force
  winner 99.8%). Licensed by hasGrad: walking pairs keep the old tuned
  floor (dFdx noise reads as slow high-order characters and stipples).
  Zoo: pitch-3to1-{envelope,contours,ratio}, pitch-5to2-envelope,
  rings-3to1-ratio; radial-pair-contours now resolves the rational
  stations along the axis — the Stern-Brocot ladder in pixels, an F2
  companion figure from the real pipeline.*
- **S3** Defects (E3) + §4 draft. Gate: charge counting exact.
  *EXPERIMENT DONE — defects.mjs: winding quantized at every amount and
  radius, localized, additive (dipole), blind to the exact part; the
  non-integer tear carries the remainder; core radius r* = 2As/π exact.
  Zoo: line-fork-render (the charge-5 fork grating), line-fork-envelope
  (five fringes ending at the defect) — F3's two panels. §4 draft still
  to write, with the S4 restructure.*
- **S4** Restructure LaTeX (new §2–§4 spine, compress §6–§7 into place,
  move listed material to supplemental). Full zoo + build + HTML.
  *DONE — executed as the integrability ladder rather than the full (Ξ, F)
  formalism: §3 "A pattern is a counting map" (object + taxonomy
  `sec:taxonomy` + catalog absorbed; `sec-catalog.tex` deleted), §4
  Superposition (law → η → merit → selection → envelope → verification,
  reordered so the envelope consumes the selection), §5 defects promoted
  to its own section, §6 retitled "Folds: walking families" with a ladder
  bridge. All old subsection labels survive, so the supplemental's xr
  links did not move. The torus/character formalism stays §4-local; the
  abstract and intro now open on the counting map and the three rungs.
  Landed at 33pp (was 32): the ladder bought approachability, not pages;
  the deep compression (proofs to supplemental, vector-comparison
  mechanics out) was judged watering-down and declined.*
- **S5** E4 + results integration; regenerate numbers. *Deferred.*
- **S6** Abstract/intro/conclusion/related-work pass (add Lagrange,
  Khinchin, three-distance, phason/quasicrystal, singular-optics
  citations). *Abstract, intro, contributions, discussion, conclusion
  done with S4; Khinchin/Hurwitz/Nguyen–Stehlé/Nye–Berry/Bazhenov/Soskin
  cited in §4–§5. Three-distance and phason remain unplaced.*

## 8. Risks

- The reframe must not read as mathematics wearing graphics clothes; the
  instrument and the performance results keep it TOG. Every new claim
  ships with a rendered figure.
- T2's weighting (amplitude vs order) must be principled: contrast decay
  supplies the weight; state it once and use it everywhere.
- Timeline: TOG is a rolling journal; there is no deadline gun. The gate
  is quality only.
