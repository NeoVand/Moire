# Submitting *Moiré Fields* to ACM TOG

Everything needed to get this paper submitted, in order. Written 30 August 2026
against the live TOG and ACM pages; every requirement below is quoted or
paraphrased from an official source, and the few things ACM does not publish
are marked **[unverified]** rather than guessed at.

---

## 0. The decision: submit directly to TOG, not through SIGGRAPH

SIGGRAPH's "Journal track" *is* TOG — journal-track papers fill two of TOG's six
annual issues. But the two routes into TOG are very different, and for this
paper the direct route is clearly right.

|  | **Direct TOG** | SIGGRAPH journal track |
|---|---|---|
| Portal | ScholarOne | Linklings |
| Deadline | **None — submit when ready** | Fixed, once a year |
| Page limit | **None** | None (journal), 7 pp (conference) |
| Decision | ~2.5 months average | Fixed calendar, with rebuttal |
| Presentation | Not required | **One author must attend in person** |
| Next window | **Today** | ~mid-Jan 2027, not yet announced |

SIGGRAPH 2026 and SIGGRAPH Asia 2026 deadlines have both passed. SIGGRAPH 2027
dates are not officially published. Direct TOG has no deadline, no page limit
(this paper is 29 pages), no travel obligation, and averages 2.5 months to a
decision. It also has a graded outcome ladder — Accept / Accept with minor
revisions / Provisionally accept with major revisions / Revise and Resubmit /
Reject — rather than SIGGRAPH's effectively binary result.

> You cannot do both. "TOG requires that submission are not under review for any
> other venue." Dual submission is grounds for rejection at both venues.

SIGGRAPH also actively routes work in this direction: "If you wish to submit
revised or extended versions of conference or workshop papers, please directly
submit to TOG instead of SIGGRAPH."

---

## 1. Accounts to create, in this order

### 1.1 ORCID — do this first (free, ~2 minutes)

Register at **<https://orcid.org/register>**.

> "All submitting authors are required to provide an ORCID at the time of
> manuscript submission." — TOG author guidelines

It hardens at acceptance: every listed author must have a valid ORCID before the
paper can go to production. You only need to *register*; you do not need to
claim your publications.

**Then put it in the paper.** `paper.tex` has a placeholder marked `TODO(orcid)`
next to the author block.

### 1.2 ScholarOne account on the TOG site

Go to **<https://mc.manuscriptcentral.com/tog>** and click *Create An Account*.
This is the ACM "Manuscript Central" instance for TOG; it is the only place TOG
submissions are accepted. (`tog.acm.org` now just redirects to the DL — there is
no separate TOG website.)

Link your ORCID to the account when prompted.

### 1.3 ACM membership — optional, but it pays for itself

**Not required to submit or publish.** It only changes the article processing
charge, and the saving is larger than the membership:

| 2026 journal APC | Without ACM membership | With |
|---|---|---|
| Standard | **$1,450** | **$950** |

Membership costs roughly $100/year, so joining before the rights process saves
about $400 net. Decide before acceptance, not after.

**You do not pay anything to submit.** The APC is charged only if the paper is
accepted. See §8 for the full picture, including why a hardship waiver is
unlikely to be granted on the basis of being unaffiliated.

*(No ACM page states outright that membership is optional. The evidence is that
ACM's own price table has a tier for articles where "No ACM or SIG members" are
among the authors, which would be meaningless otherwise.)*

### 1.4 ACM account

Not needed to submit. ACM's eRights system contacts you by email only after
acceptance.

---

## 2. Build the submission PDF

```bash
cd paper
tectonic -X compile paper.tex --outdir build --keep-intermediates
tectonic -X compile supplemental.tex --outdir build
```

The first line of `paper.tex` is already set to submission mode:

```latex
\documentclass[acmtog, anonymous, review]{acmart}
```

These three options are exactly what TOG requires — `acmtog` for the two-column
journal template, `anonymous` to hide the byline, `review` for the line numbers
referees cite by. A reading-mode line sits commented directly beneath it if you
want a named copy for yourself or for beta readers.

**Note:** ACM's *generic* journal instructions say to use single-column
`\documentclass[manuscript]{acmart}`. TOG overrides this, and ACM SIGGRAPH
confirms TOG is the stated exception to the generic rule. Follow TOG's page.

### The class version matters

`acmart.cls` and `ACM-Reference-Format.bst` are **vendored in `paper/`** at
version **2.20 (2026-08-16)**, the current release. This is deliberate: the
TeX distribution's bundled copy was v1.83 from 2022, well below what ACM
accepts. Do not delete these two files, and re-vendor them from
<https://ctan.org/pkg/acmart> if a newer version appears.

Verify what actually got used:

```bash
pdfinfo build/paper.pdf | grep Creator     # must say acmart 2026/08/16 v2.20
```

---

## 3. Pre-flight checklist

Run every one of these before uploading. The first six are documented
desk-rejection triggers at TOG.

```bash
cd paper
```

- [ ] **PDF only.** TOG accepts the manuscript as PDF. No source at submission.
- [ ] **No author name in the text.**
      `pdftotext build/paper.pdf - | grep -ci mohsenvand` → must print `0`
- [ ] **No author name in the metadata.** Explicitly called out by TOG.
      `pdfinfo build/paper.pdf` and `strings build/paper.pdf | grep -i mohsenvand`
- [ ] **Line numbers present.** Flip to any page and confirm.
- [ ] **No JavaScript in the PDF.** A PDF containing a script that phones home on
      open causes *immediate rejection* — the only stated auto-reject.
      `pdfinfo build/paper.pdf | grep JavaScript` → must say `no`
- [ ] **Author-year citations**, not numeric. Should read `[Hersch and Chosson
      2004]`. (`\citestyle{acmauthoryear}` is set; acmart's default for `acmtog`
      is numeric, so this is easy to lose.)
- [ ] **Supplemental is anonymous too** — it goes to the same referees.
      `pdftotext build/supplemental.pdf - | grep -ci mohsenvand` → `0`
- [ ] **Nothing cites a public preprint of this paper.** See §4.2.
- [ ] **Self-citations are neutral.** Refer to your own earlier work in the third
      person, never "as we showed in [12]".
- [ ] **No acknowledgments section.** There is none today. Do not add one before
      acceptance — it identifies you.
- [ ] **Not under review anywhere else.**
- [ ] **ORCID filled in** (`TODO(orcid)` in `paper.tex`).
- [ ] **Submission ID filled in** — see §5, step 3.

CCS concepts and keywords are already in the paper. TOG does not require them at
submission (only at acceptance), so they cost nothing and help the editor.

---

## 4. Two declarations to settle before you upload

These are judgement calls, not mechanical checks, and both are yours to make.

### 4.1 Generative AI in the methods — **decide this deliberately**

ACM revised its Policy on Authorship on **14 May 2026**, and the revision splits
AI use into two cases that are now treated very differently:

> Generative AI used **to conduct the research** "must be described in detail in
> the methods section of the Work."
>
> Generative AI used **to assist with writing** — "ACM no longer requires the
> disclosure."

So the prose no longer needs a disclaimer. The question is whether AI use
touched *the research itself*: the derivations, the solver, the measurement
harness, the figure-generating scripts — anything whose output bears on a claim
the paper makes. This repository was developed with substantial AI assistance,
which puts it squarely in the first case rather than the second, and the paper
currently says nothing about it anywhere.

I have deliberately **not** written a disclosure for you. Only you know the real
proportions, and a description that overstates or understates them is worse than
none. What the policy asks for is a factual paragraph in a methods or
implementation section: which parts were AI-assisted, at what level, and what
you did to verify the results. The verification story here is unusually strong —
every number and figure in the paper is regenerated by script, the solver has a
CPU/GPU twin test, and the renderer has a 42-case golden-image harness — so this
is a paragraph that costs little and forecloses a real objection.

⚠️ SIGGRAPH's 2026 papers page still states the *older*, stricter rule. It
predates the May 2026 update. For a direct TOG submission the policy above is
the operative one.

### 4.2 Whether to post a preprint

**TOG is unusually permissive here, and this is a genuine advantage of the
direct route.** Verbatim:

> "TOG allows submitting manuscripts that are available in essentially the same
> form, for example on arXiv or as a technical report. Authors are asked to
> refrain from mentioning that the publicly available manuscript has been
> submitted to TOG and to provide the public version as supplemental material
> not for review."

If you post to arXiv, then: leave it up, do **not** annotate it "under review at
TOG", do **not** cite it in the manuscript (that identifies you), and **do**
upload the public version as *Supplemental File(s) not for review*, ideally with
a note on how the two differ.

ACM permits posting every version — preprint, submitted, accepted, peer-reviewed
— to your homepage, arXiv, and any non-commercial repository, and asks you to
add the DOI once published. It does **not** permit ResearchGate, Academia.edu,
Mendeley, or Sci-Hub.

*(Some other ACM journals discourage preprints during review. That language is
not on TOG's page and does not apply here.)*

---

## 5. The submission itself

1. **Sign in** at <https://mc.manuscriptcentral.com/tog> and go to the *Author
   Center* → start a new submission. Select *Transactions on Graphics*.

2. **Category.** TOG accepts exactly two kinds. Choose *previously unpublished
   research paper*. (The other is a SIGGRAPH resubmission requesting reviewer
   continuity, which does not apply.)

3. **Get the submission ID, then rebuild.** ScholarOne issues a unique ID. TOG
   asks that this ID replace the author names on the manuscript:

   > "Instead of the names, include the TOG submission ID generated by
   > Manuscript Central."

   Put it in `paper.tex`:
   ```latex
   \acmSubmissionID{TOG-26-XXXX}
   ```
   rebuild, and upload the resulting PDF. The class prints it in the running
   head automatically under `anonymous`.

4. **Upload the main PDF** (`build/paper.pdf`).

5. **Upload the supplemental** (`build/supplemental.pdf`) plus a `readme.txt`
   describing it — ACM asks for one, and it appears in the DL beside the
   material.

6. **Use "Supplemental File(s) not for review"** for anything that would
   identify you: an arXiv version, a diff document, an identifying cover letter.

7. **Quote the ID** in all correspondence about the submission.

**One thing to open while you are logged in.** ScholarOne's public
*Instructions & Forms* panel for TOG lists an `ACM_Upload_Instructions.pdf` that
is unreachable from outside the login. It is the most likely place the
undocumented file limits in §10 are actually written down — read it before
building a large supplemental package. The same panel also links a *Copyright
Transfer Agreement*; **that link is stale.** ACM abolished copyright transfer on
1 January 2023 and changed the rights model again on 1 January 2026. Ignore it.

### What to send with it

The paper must stand alone; supplemental is for what does not fit. Reasonable
package here:

- `supplemental.pdf` — the catalog plate, gradient atlas, envelope and ablation
  details, gallery settings, and reproduction guide (already built)
- `readme.txt` — one paragraph on what each file is
- **A video** — see §7. Strongly recommended and currently missing.
- **The code** — as a self-contained archive, *not* a URL (see §7).

---

## 6. What the review will actually look like

Worth knowing before you write the cover material, because TOG's model is
neither of the two you would expect.

**It is author-anonymous to the referees, but not to the editor.** The
Associate Editor handling your paper *knows who you are* — that is how conflicts
of interest get checked — while the referees do not, and the referees stay
anonymous to you permanently.

> "The Associate Editor knows the identity of the authors and makes sure the
> referees have no conflict of interest." … "The referees are asked to refrain
> from trying to identify the authors."

*(ACM's umbrella policy calls its journals "single-anonymous". That generic
sentence does not describe TOG's stated practice; TOG's own page governs.)*

**The path:** an administrative conformance check (this is the desk-reject gate
the §3 checklist is aimed at) → the Editor-in-Chief triages for scope → an
Associate Editor is assigned and triages again → referees, who get **30 days**
each → the AE recommends → **the EiC makes the final, binding decision.**

**The five outcomes**, and what each one costs you:

| Outcome | Who verifies the revision |
|---|---|
| Accept as is | — |
| Accept with minor revisions | the Associate Editor |
| Provisionally accepted with major revisions | the original referees |
| Revise and Resubmit | no guarantee of acceptance even if fully addressed |
| Reject | — |

There is **no "conditional accept"** at TOG; that term belongs to SIGGRAPH.
Revisions are expected **within six months** of the decision unless the EiC
grants an extension. Target time to decision is 3 months, average 2.5.

If the paper is out of scope you hear quickly: "we will return the submission to
the author immediately."

---

## 7. Two things this submission still needs

### 7.1 A video

There is none in the repository, and for an interactive-system paper this is the
biggest remaining gap. TOG publishes no video specification **[unverified]**, so
use the SIGGRAPH conventions, which are the community norm:

- **≤ 5 minutes**, MP4 (H.264)
- **Silent with on-screen captions** — narration risks identifying you by voice
  under anonymous review, and reviewers often watch muted
- Show the tool being driven live: dragging layers, the envelope and contour
  views, authoring a field and watching fringes track its level sets
- Label real-time footage as real-time and state the hardware on screen

### 7.2 The code, shipped as a file rather than a link

This is a hard constraint and easy to get wrong:

> "Material cannot be made available to referees on websites (other than those
> used by ACM), as accessing the servers would potentially compromise the
> anonymity of the referees."

So **do not link the live studio or the GitHub repository in the submission.**
Ship a self-contained bundle in supplemental instead — a built, offline-openable
copy of the studio plus the source needed to reproduce the paper's numbers, with
the git remote and author strings stripped.

The public repository and live demo become a strength *after* acceptance, not
during review.

**Tag the commit the paper describes.** `main` has moved past the manuscript —
the Studio now ships a tiling family the paper does not cover. The bundle and
the eventual public artifact should both point at a tagged commit whose numbers
match the submitted PDF, not at a moving branch.

---

## 8. After acceptance

1. **eRights.** ACM emails the corresponding author. You keep copyright and
   grant ACM a non-exclusive licence — to publish, to act as Publisher with
   commercial rights "including the right to license the Work to third parties,
   such as for training by LLMs", and to defend the work's integrity. Since
   1 Jan 2026 you must choose **CC-BY or CC-BY-NC-ND**, and the choice is
   irrevocable.
2. **Names must match exactly.** Author names, order, affiliations and emails on
   the rights form must match the final paper. **Authors cannot be added after
   acceptance.**
3. **Pay the APC** ($950 with ACM membership, $1,450 without). Nothing is
   published — not even the Just Accepted posting — until it is paid. Hardship
   waivers exist but ACM states plainly that being an *"independent consultant
   without an affiliated institution is not itself a demonstration of financial
   hardship and is unlikely to be approved."* Waivers can only be requested
   through the system, after acceptance. Questions: `apcwaivers@acm.org`.
4. **Restore the non-anonymous front matter** — see §9.
5. **CCS concepts** are required now (already written).
6. **Apply for the Graphics Replicability Stamp.** TOG emails every accepted
   author a form. It certifies that your released code reproduces a result in
   the paper; it is explicitly *not* a quality judgement, and code quality is not
   assessed. Requirements: a public git repo, a script that runs with no
   arguments and reproduces one figure or table, an automated dependency install,
   and a licence permitting non-commercial use. Interactive tools where scripted
   reproduction is impossible may substitute a screen capture. See
   <https://www.replicabilitystamp.org/requirements.html>. This repository is
   close to qualifying already — every number and figure is script-generated.
   **The one missing prerequisite is a LICENSE file**; the repo has none, and the
   stamp requires a licence permitting non-commercial use. That choice is yours
   to make, not mine.

---

## 9. Camera-ready work deferred until acceptance

Do not do these now; they would break the anonymous submission.

- **Swap the class options** to `\documentclass[acmtog]{acmart}`.
- **Fill the rights block** from the eRights email verbatim: `\setcopyright`,
  `\setcctype`, `\copyrightyear`, `\acmYear`, `\acmDOI`, `\acmVolume`,
  `\acmNumber`, `\acmArticle`, `\acmMonth`, and the `\received` dates.
- **Restore `\authorsaddresses`.** It is currently emptied, and acmart warns
  about it on every build. ACM: this block "must not be suppressed."
- **Give the affiliation a real city and country.** It is currently
  `\institution{Independent}` with a blank city and country, which dodges
  acmart's mandatory-country error but leaves whitespace where ACM's metadata
  extraction expects a place. ACM does not allow anonymous authors, but it does
  explicitly accept `independent consultant` as a listed affiliation.
- **Add `\renewcommand{\shortauthors}{Mohsenvand}`** if the running head
  overflows.
- **Add acknowledgments**, if you want any. They must stay out until now.
- **Reconsider the non-approved LaTeX packages.** ACM's accepted-package list
  does not include `tikz`, `pgfplots`, `pgfplotstable`, or `algpseudocode`, all
  of which this paper uses heavily. TOG journal papers are *not* processed
  through TAPS (that is the conference pipeline), so this may never be enforced
  — but if production objects, the fix is to externalise the TikZ/pgfplots
  figures to PDF at build time and swap `algpseudocode` for `algorithm2e`.
  **[unverified]** whether direct-TOG papers hit the package validator at all.
- **Check image compression in the proofs.** TOG asks authors specifically to
  confirm that figures "have not been overly compressed."

---

## 10. Open questions worth one email

TOG publishes less than SIGGRAPH does. Before uploading anything large, send one
message to **`tog-admin@acm.org`** asking:

- Is there a size cap on supplemental material, and a per-file upload limit?
- Are there preferred video formats or a length limit?
- Does the submission flow include a cover letter, or preferred/excluded
  reviewer fields?
- Is a representative image wanted for a direct-TOG submission?
- Regular-issue TOG papers are said to be presentable at SIGGRAPH — how is that
  arranged?

All five are undocumented for direct TOG submissions. Do not rely on the
SIGGRAPH numbers (500 MB, 5-minute video, 1500×1000 representative image); those
are conference rules, and TOG has never published its own.

---

## 11. Who to write to

| | |
|---|---|
| Submission, files, process | `tog-admin@acm.org` — the journal administrator. *(The mailto link on TOG's own page is broken by a templating bug; type the address by hand.)* |
| Editor-in-Chief | Eitan Grinspun |
| Assistant to the EiC | Gaëlle Fer-Arslan · `gaelle.fer-arslan@tu-berlin.de` |
| Final-version formatting | Chris Miller (Aptara) · `Chris.Miller@aptaracorp.com` |
| LaTeX / template problems | `acmtexsupport@aptaracorp.com` |
| APC waiver questions | `apcwaivers@acm.org` (before acceptance; the waiver itself is filed after) |

---

## 12. Where the facts came from

- [TOG Author Guidelines](https://dl.acm.org/journal/tog/author-guidelines) —
  the operative document: format, anonymity, review model, prior publication
- [TOG submission site](https://mc.manuscriptcentral.com/tog)
- [TOG reviewer guidelines](https://dl.acm.org/journal/tog/reviewers) — the
  30-day referee window
- [TOG Open Access / APCs](https://dl.acm.org/journal/tog/open-access)
- [TOG Replicability](https://dl.acm.org/journal/tog/replicability) ·
  [Graphics Replicability Stamp](https://www.replicabilitystamp.org/)
- [ACM Publication Rights & Licensing](https://www.acm.org/publications/policies/publication-rights-and-licensing-policy)
- [ACM Policy on Authorship](https://www.acm.org/publications/policies/new-acm-policy-on-authorship) —
  the 14 May 2026 generative-AI revision
- [ACM roles and responsibilities](https://www.acm.org/publications/policies/roles-and-responsibilities) —
  affiliations, pen names, no anonymous authors
- [ACM APC hardship waivers](https://www.acm.org/publications/policies/policy-on-discretionary-open-access-apc-waivers)
- [ACM ORCID FAQs](https://authors.acm.org/author-resources/orcid-faqs)
- [acmart on CTAN](https://ctan.org/pkg/acmart) — class version and documentation
- [ACM CCS tool](https://dl.acm.org/ccs)

Several official ACM pages are stale or contradict each other; where they do,
TOG's own guidelines page wins, and the conflicts are flagged in place above.

A caution found while researching: several third-party sites rank highly for
"ACM TOG submission guide" and publish confident, invented timelines and fees.
Everything here comes from ACM's and TOG's own pages.
