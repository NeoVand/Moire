# Paper 3 — the plan, before the prose

Written 2026-09-02, on the author's instruction: "start with writing the new
paper, and before that, start thinking about how we are going to do this.
Even a college student should be able to start reading it, and with a few
lookups and a little help from AI, they should be able to finish it."

This note is the design. It fixes who the reader is, what order the ideas
come in, what each section owes the reader, what a section may and may not
assume, and how we will find out whether it works. `paper/notes/beating.md`
is the theory at the right level; this is the book-building.

## 1. The reader

A second- or third-year student in any quantitative major, or a curious
musician or artist with one calculus course. They know: functions,
derivatives and integrals, vectors, `x mod 1`, what "periodic" means, the
idea that a sound is a sum of harmonics (vaguely), a little linear algebra.
They do not know: tori, characters, conditional expectation, cohomology,
continued fractions, lattice reduction, ergodic theory, Fourier multipliers.
They can look things up, and they can ask an AI to explain a named fact.

So the contract is: the paper introduces every idea it uses from an instance
the reader has held in their hands, and where it must lean on a fact from
outside, it NAMES the fact, says exactly which one-line consequence is
needed, and phrases it as a question that can be typed into a search box or
an AI. Nothing in the paper depends on a fact that is not either derived in
place or named as a lookup. Eight lookups for the whole paper is the budget.

## 2. The ladder of ideas, one rung per section

Each section introduces ONE new idea, in this order every time: an instance,
its name, a picture, the formula, what the formula says in words, a theorem
if there is one (idea of the proof in one sentence, then the proof if it is
under ten lines), an experiment that measures it, and a "try it" the reader
can do with objects or with the app.

| § | Title | The question | The one new idea | The picture | The formula | Theorem / claim | Experiment (script) | Lookup | Try it |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Coincidence | What do two rulers, two click trains and two gratings have in common? | **The count** ξ(x): how many members up to x, interpolated | two rulers, ticks numbered, the vernier bands (TikZ) | ξ = x/T for a periodic family; exists for any family | none; three observations | — | — | two rulers, two combs, two window screens |
| 2 | Where you are in every family | What is the state of a superposition at a point? | **The torus** Φ(x) = (ξ₁,…,ξ_K) mod 1, and the picture I on it; the drawing is I∘Φ; **combined counts** k·Φ; slow vs fast; the heterodyne ratio | the stack beside its torus (TikZ, from paper 2, more labels) | D = I∘Φ; k·Φ; η | "every superposition is geometry Φ times appearance I" (a definition, not a theorem) | — | torus as a square with edges glued | the app's ratio view: the map of where a beat can form |
| 3 | What pooling sees | Why does every blurring observer see the same bands? | **The average along the fast directions** = conditional expectation E[I \| slow]; sharp for schedules, soft for windows; **the observer theorem** | exposure quad (exists); a window as a multiplier (small TikZ) | ∫₀¹ e^{2πi m u} du = [m=0]; E[I\|L_w]; Ŵ(ρ∇(k·Φ)); N∘(I∘Φ) = (N∘I)∘Φ | Thm A (sharp projection), Thm B (window multiplier), Thm C (universality) — proofs inline, each under ten lines | exposure.mjs, observer.mjs | orthogonality of complex exponentials (THE lookup); what a low-pass filter is | a long-exposure photo of two gratings sliding; blur your eyes |
| 4 | Who can see a beat | Why does a beat in air need an ear, and a beat on paper not? | **Additive vs multiplicative superposition**; a nonlinearity changes the picture, never the geometry; hard patterns are observer-proof | the ear model figure (NEW: ear-figs.mjs): the octave null under four ears, hard vs soft pulses | Î(k) for a product vs a sum; N = s² mints â(1)b̂(1)/2 | Cor. who-sees; Cor. hard-ink; Cor. soft reopens | observer.mjs, ear.mjs | Fourier coefficients of a pulse train | a synth: mistuned octave of square waves at 50% duty vs 30% |
| 5 | Which pattern emerges | Of all combined counts, which one do you see? | **Selection**: slowest per unit of cost, cost = product of harmonic orders; stations; **duty nulls**; the continued-fraction ladder; deserts | duty-null plot + station triple (exist); stations-as-places (exists); the Perron staircase (NEW from stations.json) | η_{a,b} = \|a g₁ + b g₂\| / (½\|a g₁ − b g₂\|) · \|ab\|; ĝ(n) = sin(nπd)/(nπ); Perron's identity; the threshold | Thm D (duty nulls), Prop E (stations are convergents with large complete quotients), deserts | dutynull.mjs, stations.mjs, convergents.mjs, ear.mjs (desert) | continued fractions (one page) | rulers at 2:1 with one ruler's ticks thickened to half the pitch |
| 6 | Emergence, iterated | Can the new pattern beat again? | **The emergent pattern is a family** (its count is D); beats of beats; a cascade of observers; the tower property | fan/ring trio envelope (exists); beats-of-beats bars (NEW from ear.json) | E[E[I\|L₁]\|L₂] = E[I\|L₁∩L₂]; the ternary (1,−2,1) has order 4 | Prop F (tower); the two-stage claim | ear.mjs (beats of beats), ternary.mjs | — | three tones on a synth; the app's three-ring stack |
| 7 | When counting fails | Can a count always be written down? | **The trichotomy**: global / winding (defects) / fold (search); the Mach number | defect trio (exists); fold law (exists) | monodromy; ∂_ν F = 0; ρ(−δ) > s | Thm G (trichotomy), defects count charge, the fold law as a statement | defects.mjs, foldlaw.mjs | implicit function theorem; winding number | the app: a `theta` field; a walking family |
| 8 | Predictions, measured | What would be wrong if the theory were? | the ledger: classical / ours / how sure | the generated table, one domain column | — | — | numbers.mjs (fails on any gate) | — | the at-home list |
| 9 | The instrument | Where can all of this be seen? | one page on Moiré: every view is a measurement | app screenshots | — | — | — | — | the app |

Moiré appears in every section as the laboratory where a statement can be
photographed, and the ear as the second domain where the same statement is
a sound; the strobe (wagon wheel) is the third domain and is a remark until
its script exists. Never "in the moiré literature" before §5, never a
citation in §1–2 except Helmholtz and Rayleigh as names in passing.

## 3. Rules of the prose

1. Instance before name, name before picture, picture before formula. A
   symbol never appears before the thing it stands for has been pointed at.
2. Every displayed formula is followed by one sentence saying what it says.
3. A proof is under ten lines or it goes to the appendix; every proof is
   preceded by "the idea:" in one sentence. The proofs ARE the accessible
   part — a student can check them — and that is a feature to advertise.
4. Lookup boxes: at most eight in the paper. Each names the fact, states the
   one consequence used, and gives the query to type. Phrased as a question,
   so it works on a search engine and on an AI alike.
5. Try-it boxes: an experiment with objects (rulers, combs, screens, a
   strobe app, a synth) or with the app, one per section where possible.
6. Symbols: ξ (a count), Φ (the point on the torus), I (the picture on the
   torus), k (a combination of counts), D (a difference of counts), η (the
   heterodyne ratio), N (a front end), W (a window), E[·|·] (an average
   holding something fixed). One table, §2, and no others.
7. Sentences short. Present tense. Second person allowed for instructions.
   No "we show that". No "it is easy to see". No "clearly".
8. Every number generated by `tools/numbers.mjs`; every figure by a script;
   the predictions table generated with a domain column.
9. Honesty section (§8) keeps beating.md §3 verbatim in spirit: what is
   classical, what is ours, how sure, and where the depth is not.
10. Moiré vocabulary is translated on first use: "moiré" = the beat you can
    see; "station" = a locked beat of higher order; "envelope" = what pooling
    sees; "fringe" = one band of the beat.

## 4. What exists and what must be made

Figures that exist and are reused: the torus TikZ (paper 2), exposure-quad,
dutynull-triple + the duty-null pgfplot, selection-stations (provisional),
teaser-fantrio, defect trio, fold-law, quilt-pair (maybe, §3 Nyquist remark).

Figures to make: (a) the two-ruler vernier with counts labelled (TikZ, §1);
(b) the ear figure — the octave null under four ears for hard and soft
pulses, from `data/ear.json`, via a new `tools/exp/ear-figs.mjs` writing
CSVs for pgfplots (§4); (c) beats-of-beats bars (§6, same script); (d) the
Perron staircase / threshold plot from `data/stations.json` (§5); (e) the
window-as-multiplier sketch (TikZ, §3).

Macros to add to numbers.mjs: the ear numbers (null depths under each ear,
hard and soft; the ternary under square, cubic, cascade, printed; the desert
ratio) with their gates, and a paper-3 predictions table with a Domain
column (drawing / sound / any).

Citations: only keys already in `refs.bib` until each new one is verified by
hand: Perron (continued fractions), Weyl (equidistribution), Arnold
(tongues), the wagon-wheel literature, second-order beats in
psychoacoustics. Each is a TODO in the text, never a guessed key.

## 5. How we find out whether it works

The reader test. After each section is drafted, a fresh agent that has read
NOTHING else is given the section (and only the sections before it) with
the instruction "you are a second-year student; read this; write down every
sentence you could not follow, every symbol you met before it was defined,
and every place you would need to look something up". The confusions are
fixed before the next section is written. The author reads it last.

## 6. Order of work

Status 2026-09-02, later: P1–P5 done — nine sections, 25 pages, builds clean, every number generated, three reader tests run (1–3, 4–6, 7–9) and every finding applied (the commits that applied them list the findings); a third measured domain (the strobe, wagonwheel.mjs) added. Open: P6 (venue), the URL placeholder in §9 (the author's to supply), a second round of reader tests on the revised text, and the listening tests of §8.

- P1 (this note) — the design.
- P2 — §1–§3: the build-up through the observer theorem, with the ruler
  figure and the reused exposure figure. Build the PDF; show the author.
- P3 — §4–§6 with the ear figure script and macros.
- P4 — §7–§9, the generated table with the domain column, the honesty
  section.
- P5 — the reader test on every section; lookup and try-it pass; length
  pass (target 20–25 pages at 10pt with figures, about ten thousand words).
- P6 — venue. Candidates, to be decided with the draft in hand: a physics
  education journal (American Journal of Physics), a broad-audience
  mathematics venue (SIAM Review's education section, the Mathematical
  Intelligencer), or arXiv first with the app as the companion.

## 7. Title

Working title: "The third pattern: how beats emerge from counting".
Alternatives kept: "What a beat is"; "Coincidence: a theory of beating
without frequencies". The phrase "third pattern" is the author's, and the
abstract earns it in its second sentence.

## 8. Risks

Density creep: every section will want to say more; the ladder table above
is the budget, and a section that wants a second idea gets a second section
or loses the idea. Moiré bias: the reader test asks explicitly "does this
read as being about moiré?". The ear is a simulation, not an ear: §8 says so
in its first line about sound, and the at-home list is what would make it an
ear.
