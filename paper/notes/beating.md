# Beating as emergence — the framework, what I actually think, and the predictions that would make it a theory

Written 2026-09-01, in answer to the author's intervention: "put all of your
intelligence into the framework and the right predictions, and tell me what
you think." This note is written to be read before anything else in the
repo. It builds up from three ordinary examples, states the framework in
plain language, then says honestly what is proved, what is classical, what
is new, how sure we are, and which predictions have reach beyond moiré.
Every claim with a number points at a gated script.

## 1. Three examples, no frequencies

**Two rulers.** Lay a ruler with 10 divisions per inch over one with 9.
Somewhere the ticks line up; a little further they are a hair apart; further
still a hair more; after ten ticks of one and nine of the other they line up
again. The eye sees a slow pattern of coincidence — the vernier — that
neither ruler contains. Nothing was periodic in any fancy sense; the rulers
could have been slightly irregular and the coincidence pattern would still
be there, slightly irregular in its own way.

**Two click trains through a threshold.** Feed two trains of clicks at
nearly equal rates into a detector that fires only when both clicks arrive
together. It fires once per *coincidence*, and coincidences recur at the
difference of the rates. The detector's output is a spike train whose rate is
the beat, and it does not depend on the two input rates separately — double
both and the output is unchanged. No Fourier component of the input sum sits
at the beat rate. The beat is not *in* the sum; it is in the joint statistics
of the two trains, and the threshold is what reads it out.

**Two gratings on a page.** Print one grating over another, slightly
different in pitch. From arm's length you see broad bands — moiré. Blur your
eyes and the bands stay; they are what survives the blur. Photograph them,
threshold them, print them badly: the bands are always in the same place.
Only their contrast changes.

What the three share: each family has *numbered members* (ticks, clicks,
lines); the pattern that emerges is a pattern of *coincidences* between the
numbering of one family and the numbering of the other; it lives on a scale
set by how slowly the two numberings drift apart; and it is read out by
anything that *pools* — an eye, a threshold, a blur — with the pooling
changing only how the pattern is graded, never where it is.

Frequency is where a family is. Counting is what beating is.

## 2. The framework in five statements

1. **A family has a count.** Anything that comes in numbered members — ticks,
   clicks, lines, rings, rays, teeth, steps, atoms, days — has a count
   $\xi(x)$: how many members up to the point $x$ of its substrate (time,
   space, angle), interpolated between members. For a periodic family
   $\xi = x/T$; but the count exists for any family, periodic or not, and
   that is the whole reason frequencies are a red herring.

2. **A superposition is a joint count on a torus.** $K$ families give
   $\Phi(x) = (\xi_1(x), \dots, \xi_K(x)) \bmod 1$, a point on the torus
   $\mathbb T^K$: where you are within each member. What the superposition
   *looks like* at $x$ depends only on $\Phi(x)$ through a fixed function $I$
   on the torus, the appearance (ink, pressure, spikes). So every
   superposition is $I \circ \Phi$: geometry in $\Phi$, appearance in $I$.

3. **Slow and fast.** Integer combinations $k \cdot \Phi$ are the characters.
   When two families nearly agree, their difference of counts $D = \xi_1 -
   \xi_2$ drifts slowly while everything else changes at the members' own
   rate. "Nearly agree" is a dimensionless number, the ratio of $D$'s drift
   to the members' rate (the heterodyne ratio $\eta$), and it can be small
   for a pair of rulers, a pair of clicks, or a pair of gratings alike.

4. **What pooling sees is the quotient.** Any observer that pools before it
   decides — a lens, a film, a membrane, a low-pass, a long exposure — sees at
   $x$ a function of the slow characters only: the conditional expectation
   $\mathbb E[\,N \circ I \mid \text{slow}\,](\Phi(x))$, with the fast
   characters averaged away. The observer's front-end nonlinearity $N$
   changes the function; the substrate's geometry $\Phi$ chooses the
   variable. Where the pattern is, is nobody's choice. (Theorems 3.1, 3.6,
   3.8 of the draft; proofs are a few lines each.)

5. **The emergent pattern is a family.** $\mathbb E[N\circ I \mid D]$ as a
   function of $x$ has its own members (the fringes), its own count (it is
   $D$ itself), its own profile (the tent). So it can beat again with a third
   family, and pooling observers stacked in a cascade climb a hierarchy of
   slower patterns, each exactly computable. That is the precise sense in
   which beating is emergence: a new family, with a new count, that no
   member of the parts' description contains, produced by a quotient that is
   exact rather than approximate.

The three laws of the draft are these five statements sorted by the
question they answer: *which* character emerges (arithmetic: lattice
reduction, continued fractions, amplitude prices), *what* an observer sees of
it (analysis: the conditional expectation, exact and universal), and *whether*
the count exists at all (topology: lifts, windings, folds).

## 3. What I actually think

**The mathematics is solid and short.** Every theorem is a few lines from
standard facts: Fourier series on a torus, the implicit function theorem,
Weyl's equidistribution, Perron's formula for convergents. There is no
theorem in this theory that a good graduate student could not prove in an
afternoon once the statement is in front of them. That is a strength for a
theory meant to be understood and a weakness for a theory meant to impress.

**The experiments are honest.** Every number in the repository is behind a
gate, and today two of them corrected earlier claims: the duty-null and
exposure scripts had measured a carrier-scale coefficient rather than the
visible station, and the "visibility spectrum" I had called unnamed is
Perron's sequence of convergent qualities. The corrections make the theory
stronger, not weaker: the claims that survive are the ones that were checked
twice.

**What is classical.** Beats of two sinusoids and their demodulation by a
nonlinearity (Helmholtz's combination tones; every radio detector). The
geometry of moiré fringes as level sets of an index difference (the indicial
method). Which $(a,b)$ moirés exist and how strong, from the layers' spectra
(Fourier moiré theory, for periodic layers). The count of an aperiodic
family (de Bruijn's index function; cut-and-project). Conditional
expectation onto invariant factors (ergodic theory). Convergents as best
approximations. None of these is ours.

**What is ours.** (i) The factorisation $I\circ\Phi$ as the *one* object,
and the observation that all the phenomena are properties of $\Phi$, of $I$,
or of the quotient. (ii) The envelope as a sharp conditional expectation on
a subtorus for integer schedules, and the soft one for spatial windows, with
the leakage explicit. (iii) The observer theorem: the subtorus is
observer-independent, only the potential is the observer's; hard patterns
are observer-proof; blurred patterns are not, and exactly how. (iv)
Selection as per-pixel lattice reduction with an amplitude price, so
stations are places on an aperiodic pair, and the closed-form threshold on
the complete quotient that decides which convergents are visible, with the
golden and silver ratios as deserts. (v) The topology: the trichotomy of
counts, the fold law with its Mach reading, defects as monodromy. (vi) The
exact envelope integrator, and a tool in which every one of these is a
measurement.

**Where the depth is, and is not.** The depth is in the unification, not in
any one piece. The same theorem says why a mistuned octave of square waves
does not beat, why a coupled pair of symmetric oscillators has no even
Arnold tongue, why a 50%-duty wheel cannot show the 2:1 wagon-wheel station,
and why a blurred grating reopens the null under a squaring observer while a
sharp one does not. That reach is real. What the theory does *not* yet have
is a prediction that a physicist would find surprising *and* that has been
tested outside the moiré tool. Today's sound experiment (§5, item 1–3) is the
first step out of the tool, and it is a simulation of an ear, not an ear.

**On "beating is emergence".** I agree, in this precise sense: the beat is a
new family (it has a count), it is absent from any linear description of the
parts (a sum of two additive families has no cross character), it appears
only to observers that pool after a nonlinearity or to superpositions that
multiply, and yet its geometry is fixed by the parts alone and is the same
for every such observer. That is emergence with a theorem attached: the
quotient of the joint count by its fast symmetry. Reduction to frequencies
cannot see it, because the beat is not a linear functional of the parts. I
would not go further than that in print. It is weak emergence made exact,
and that is a better claim than strong emergence made vague.

**How sure.** Of the theorems: certain, they are proved. Of the moiré
predictions: certain, they are measured through the shipped renderer. Of the
cross-domain predictions: the arithmetic is certain, the physics of each
domain adds assumptions (that an ear squares before it pools; that a
photoreceptor saturates; that coupling strength between oscillators is
proportional to the product of harmonic amplitudes) which are standard but
not ours, and each needs its own measurement.

## 4. Why frequencies mislead, said once

The spectrum of a *sum* of two families has lines at the families' own
harmonics and nowhere else. The beat has no line. To see it you need either
a product (printed inks multiply) or a nonlinearity (an ear, a threshold, a
film), and after either, the beat is at the *difference*, carried by the
product of the two harmonics that nearly coincide. The threshold spike
train is the extreme case: a threshold that fires only on coincidence
outputs *nothing but* the beat, and doubling both input rates changes
nothing, because the output is a function on the quotient circle $D$ and
$D$ does not know the rates, only their ratio. That is the author's
observation, and it is Theorem 3.8 with $N$ a step function.

## 5. Predictions with reach (each: status, and the experiment)

1. **The duty null, everywhere.** A family whose profile has no $q$-th
   harmonic cannot take part in any $(q,\cdot)$ station. A 50%-duty square
   wave has no even harmonics, so: a mistuned octave of square waves does
   not beat (sound); two coupled symmetric oscillators have no 2:1 tongue
   (dynamics — known as a symmetry fact, unified here); a wheel with 50%
   sectors shows no 2:1 wagon-wheel station under a strobe (vision); a
   50%-duty grating against a 2:1 partner shows no moiré (measured, 6305×).
   *Sound: gated today in ear.mjs through square-law, cubic and two-stage
   ears.*

2. **Who can see it.** A linear pooling observer sees no beat in an aired
   (additive) superposition, ever; a square-law one sees it at exactly half
   the product of the harmonics; printed (multiplicative) superpositions show
   it to a linear observer. *Gated (observer.mjs, ear.mjs).*

3. **Hard patterns are observer-proof, blurred ones are not.** For
   two-valued patterns every front end gives the same envelope up to
   grading. For blurred patterns a square-law ear keeps a null (bilinear
   cross term) that a cubic ear reopens — so *the order of an ear's
   nonlinearity is audible* in a mistuned octave of blurred square waves.
   New, sharp, and cheap to test on people with a synthesizer.
   *Gated today (ear.mjs).*

4. **Hierarchical beats need hierarchical observers.** Three aired tones
   with pairwise beats $\delta_1, \delta_2$ have a beat of beats at
   $|\delta_1-\delta_2|$ that no single square-law or cubic stage can hear —
   the character $(1,-2,1)$ has order four — but a cascade of square, pool,
   square hears at once. Printed, the same ternary is visible at linear
   order (the ring-trio teaser). This is the mechanism of iterated
   emergence, and it predicts that second-order beats are heard only by
   systems with at least two stages of demodulation. *Gated today
   (ear.mjs).* The psychoacoustics literature on "second-order beats" is
   the place to look for a test that already exists.

5. **Deserts.** Two families whose pitch ratio has bounded small partial
   quotients never beat visibly at any order: the golden ratio sits at
   Hurwitz's $1/\sqrt5$, the silver at $1/2\sqrt2$. In sound: two rich tones
   at the golden ratio have no station line a fifth as strong as a 2.05
   pair's. *Gated (stations.mjs, ear.mjs).* Prediction for hearing: golden
   intervals of harmonic-rich tones sound rough but never *beat*.

6. **Temporal selection.** A long exposure or a strobe keeps exactly the
   characters annihilated by the rate vector; the wagon-wheel effect's
   perceived speed is the amplitude-priced convergent of spoke rate over
   frame rate, and its reversals sit at the convergents. *Gated in the tool
   (exposure.mjs); the wagon-wheel version is an afternoon's script.*

7. **Nyquist is a beat with the sampling family.** An alias is the station
   of a signal against its sampler; the visible-fringe threshold refines
   the sampling theorem into "when is an alias a *pattern*" (the alias must
   be slow against the signal, $\eta<\tfrac14$, i.e. $f/f_s$ within about
   $7/9$ to $9/7$ or near another station). And an observer whose window is
   under two members hallucinates the sum: the handover quilt. *The quilt
   is measured; the sampling reading is a remark.*

8. **The fold law and the Mach number.** A family whose members walk faster
   than they grow folds along a shock; the drift is a Mach number. Outside
   moiré: any front that advances and drifts — wakes, caustics of moving
   sources. *Measured in the tool to 2.8%; the physical reading is a
   remark.*

## 6. The paper that should exist

Not a follow-up to the moiré paper. A paper whose first page is the three
examples of §1 and whose first equation is $D = I\circ\Phi$ *after* the
reader already knows what a count is from a ruler. Structure:

1. *Coincidence.* The three examples; what they share; the count.
2. *The torus of counts.* $I\circ\Phi$; characters; slow and fast; the
   heterodyne ratio. One figure: a stack beside its torus.
3. *What pooling sees.* The conditional expectation; sharp for schedules,
   soft for windows; the observer theorem; hard versus blurred; who can
   see a beat. The sound experiment as the running example, moiré as the
   laboratory.
4. *Which pattern emerges.* Selection by amplitude-priced convergents; the
   threshold on the complete quotient; stations as places; deserts.
5. *Emergence, iterated.* The envelope as a family; beats of beats; the
   cascade; hierarchy.
6. *When counting fails.* The trichotomy; defects; folds; the Mach number.
7. *Predictions, measured.* One table, one domain per row where possible.
8. *The instrument.* One page.

Moiré appears in every section as the place where each statement can be
seen, never as the subject.

## 7. Open, in order of reach

- A listening test for prediction 3 (order of the ear's nonlinearity) and
  prediction 4 (second-order beats need two stages).
- The wagon-wheel script: a rendered spoked wheel, a sampler, the
  amplitude-priced convergents, the reversals.
- Coupled oscillators: a circle-map simulation showing that tongue widths
  follow the product of harmonic amplitudes and that the 50%-duty symmetric
  pair has no even tongues — the dynamical face of the duty null.
- Grid cells: the oscillatory-interference model is a moiré of dendritic
  oscillators; the theory says what the grid's geometry cannot depend on.
- Iterated conditioning as renormalisation: whether the amplitude price
  makes station-within-station self-similar under the Gauss map.
