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
accepted. See §6 for the full picture, including why a hardship waiver is
unlikely to be granted on the basis of being unaffiliated.

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
`\documentclass[manuscript]{acmart}`. TOG overrides this. Follow TOG's page.

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
- [ ] **Nothing cites a public preprint of this paper.** If you post to arXiv,
      you must not cite it (it identifies you) — supply it instead as
      *Supplemental File(s) not for review*.
- [ ] **Self-citations are neutral.** Refer to your own earlier work in the third
      person, never "as we showed in [12]".
- [ ] **Not under review anywhere else.**
- [ ] **ORCID filled in** (`TODO(orcid)` in `paper.tex`).
- [ ] **Submission ID filled in** — see §4, step 3.

CCS concepts and keywords are already in the paper. TOG does not require them at
submission (only at acceptance), so they cost nothing and help the editor.

---

## 4. The submission itself

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

### What to send with it

The paper must stand alone; supplemental is for what does not fit. Reasonable
package here:

- `supplemental.pdf` — the catalog plate, gradient atlas, envelope and ablation
  details, gallery settings, and reproduction guide (already built)
- `readme.txt` — one paragraph on what each file is
- **A video** — see §5. Strongly recommended and currently missing.
- **The code** — as a self-contained archive, *not* a URL (see §5).

---

## 5. Two things this submission still needs

### 5.1 A video

There is none in the repository, and for an interactive-system paper this is the
biggest remaining gap. TOG publishes no video specification **[unverified]**, so
use the SIGGRAPH conventions, which are the community norm:

- **≤ 5 minutes**, MP4 (H.264)
- **Silent with on-screen captions** — narration risks identifying you by voice
  under anonymous review, and reviewers often watch muted
- Show the tool being driven live: dragging layers, the envelope and contour
  views, authoring a field and watching fringes track its level sets
- Label real-time footage as real-time and state the hardware on screen

### 5.2 The code, shipped as a file rather than a link

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

---

## 6. After acceptance

1. **eRights.** ACM emails the corresponding author. You keep copyright and
   grant ACM a non-exclusive licence. Since 1 Jan 2026 you must choose **CC-BY
   or CC-BY-NC-ND**, and the choice is irrevocable.
2. **Names must match exactly.** Author names, order, affiliations and emails on
   the rights form must match the final paper. **Authors cannot be added after
   acceptance.**
3. **Pay the APC** ($950 with ACM membership, $1,450 without). Nothing is
   published — not even the Just Accepted posting — until it is paid. Hardship
   waivers exist but ACM states plainly that being an *"independent consultant
   without an affiliated institution is not itself a demonstration of financial
   hardship and is unlikely to be approved."* Waivers can only be requested
   through the system, after acceptance. Questions: `apcwaivers@acm.org`.
4. **Restore the non-anonymous front matter** — see §7.
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

---

## 7. Camera-ready work deferred until acceptance

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
  extraction expects a place. `independent researcher` is an affiliation ACM
  explicitly accepts.
- **Add `\renewcommand{\shortauthors}{Mohsenvand}`** if the running head
  overflows.
- **Reconsider the non-approved LaTeX packages.** ACM's accepted-package list
  does not include `tikz`, `pgfplots`, `pgfplotstable`, or `algpseudocode`, all
  of which this paper uses heavily. TOG journal papers are *not* processed
  through TAPS (that is the conference pipeline), so this may never be enforced
  — but if production objects, the fix is to externalise the TikZ/pgfplots
  figures to PDF at build time and swap `algpseudocode` for `algorithm2e`.
  **[unverified]** whether direct-TOG papers hit the package validator at all.

---

## 8. Open questions worth one email

TOG publishes less than SIGGRAPH does. Before uploading anything large, send one
message to **`tog-admin@acm.org`** asking:

- Is there a size cap on supplemental material, and a per-file upload limit?
- Are there preferred video formats or a length limit?
- Does the submission flow include a cover letter, or preferred/excluded
  reviewer fields?
- Regular-issue TOG papers are said to be presentable at SIGGRAPH — how is that
  arranged?

All four are undocumented for direct TOG submissions. Do not rely on the
SIGGRAPH numbers (500 MB, 5-minute video); those are conference rules.

---

## 9. Where the facts came from

- [TOG Author Guidelines](https://dl.acm.org/journal/tog/author-guidelines) —
  the operative document: format, anonymity, review model, prior publication
- [TOG submission site](https://mc.manuscriptcentral.com/tog)
- [TOG Open Access / APCs](https://dl.acm.org/journal/tog/open-access)
- [TOG Replicability](https://dl.acm.org/journal/tog/replicability) ·
  [Graphics Replicability Stamp](https://www.replicabilitystamp.org/)
- [ACM Publication Rights & Licensing](https://www.acm.org/publications/policies/publication-rights-and-licensing-policy)
- [ACM APC hardship waivers](https://www.acm.org/publications/policies/policy-on-discretionary-open-access-apc-waivers)
- [ACM ORCID FAQs](https://authors.acm.org/author-resources/orcid-faqs)
- [acmart on CTAN](https://ctan.org/pkg/acmart) — class version and documentation
- [ACM CCS tool](https://dl.acm.org/ccs)

A caution found while researching: several third-party sites rank highly for
"ACM TOG submission guide" and publish confident, invented timelines and fees.
Everything here comes from ACM's and TOG's own pages.
