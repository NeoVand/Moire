# Moiré Fields — paper

A write-up of the field formulation behind the app: a moiré layer as a pair of
scalar fields (an index field and a distance field), the fringe law that follows
from it, the bounded inversion that makes walking families interactive, and the
use of the whole thing as a contouring primitive.

The mathematics lives in `src/gpu/inverseCpu.ts` and `src/gpu/inverse.wgsl.ts`, and
the field language in `src/fields/`; the paper measures those files rather than
describing them.

Every number in the paper and every figure that is not a photograph of the app is
generated from this repository by a script in `tools/`. Nothing in `paper/` is
imported by the app, and no experiment touches `src/`.

## Build

```bash
brew install tectonic          # or any XeLaTeX with acmart + pgfplots
mkdir -p build
tectonic -X compile paper.tex --outdir build --keep-intermediates
tectonic -X compile supplemental.tex --outdir build
```

Writes `build/paper.pdf` and `build/supplemental.pdf`. The supplemental
(catalog plate, gradient atlas, envelope and ablation details, gallery
settings, reproduction guide) resolves references into the main paper through
`build/paper.aux`, so build the paper first, with intermediates kept. First run
downloads the ACM class and fonts. Tectonic
does not keep `build/paper.log` by default; pass `--print` to see TeX warnings.

`paper.tex` is a shell; the prose is in `sec-*.tex` and `app-*.tex`, and every
quoted number is a macro in `numbers.tex`, so the text cannot drift from the data.

## Reproduce

```bash
node tools/exp/fringe.mjs      # fringe law: measured ink against Phi(D)
node tools/exp/fringelaw.mjs   # the same law, drawn in five panels
node tools/exp/lawatlas.mjs    # the law and its criterion across five family pairs
node tools/exp/gradient.mjs    # the eikonal divide, per family
node tools/exp/cost.mjs        # evaluations per pixel + fidelity, per scene
node tools/exp/artifacts.mjs   # the artifact figures, drop maps, insets
node tools/exp/zoom.mjs        # the stroke floor: bias and noise across zoom
node tools/exp/contour.mjs     # fringe-to-contour displacement, five fields
node tools/exp/fidelity.mjs    # 2401-setting sweep against brute force  (~1 min)
node tools/exp/envelope.mjs    # 55k-setting interval-width sweep        (~1 min)
node tools/exp/degenerate.mjs  # the strided band against a deep scan
node tools/exp/math.mjs        # data for the explanatory plots
node tools/exp/plate.mjs       # the thirteen-family catalog plate
node tools/exp/teaser.mjs      # the teaser strip
node tools/exp/traditions.mjs  # raster pipeline versus field pipeline
node tools/exp/instrument.mjs  # streamlines and shadow moiré
node tools/numbers.mjs         # collect data/ into numbers.tex and the tables
```

Run `envelope.mjs` before `degenerate.mjs` and `math.mjs`: they read its CSV. Run
`numbers.mjs` last, and before the document build. Results land in `data/`,
figures in `figures/`. `hyperdiag.mjs` is a diagnostic that prints to stdout and
feeds no figure; it is what found the hyperbola row of Table 1.

Total runtime is dominated by `fidelity.mjs` and `envelope.mjs`.

### GPU numbers

Table 3 (solver timings), Table 7 (interpreting a field expression against
compiling it) and the ablation need a real device, so they run in the browser
against the shipping WGSL, extracted from source rather than reimplemented.

```bash
npm run dev            # in the repo root
node paper/tools/sink.mjs   # receives results, writes them into data/ and figures/
```

Then from the page console:

```js
const root = '/ABSOLUTE/PATH/TO/Moire';
const gpu = await import(`/@fs/${root}/paper/tools/gpu/run.mjs`);
const json = await gpu.report(root);   // a JSON string
await fetch('http://localhost:5199/data/gpu.json', { method: 'POST', body: json });
```

`report()` returns a string; post it as-is. `run.mjs` also drives `ablation()` the
same way, into `data/ablation.json`.

Two traps worth knowing. `probe.mjs` throws on a timestamp delta of zero rather
than reporting a fast number, because a pass that fails validation and a pass that
is quick look identical through a query set. And the timestamp counter on Apple
parts ticks every 65.5 µs, so the field kernel evaluates its expression 32 times
per thread and stores once: what is timed is then the arithmetic, well above the
tick, rather than the store.

`tools/gpu/capture.mjs` renders teaser and figure frames through a private
`MoireRenderer` instance mounted offscreen, so captures cannot disturb the UI.

## Layout

| Path | What it is |
| --- | --- |
| `paper.tex`, `sec-*.tex`, `app-*.tex` | the paper and its appendices |
| `numbers.tex`, `tab-*.tex` | every quoted number and two generated tables |
| `refs.bib` | bibliography |
| `tools/lib/fields.mjs` | the thirteen families as index and distance fields, and the field expressions modulating them |
| `tools/lib/instrument.mjs` | loads a solver generation, counts its calls, applies ablation patches |
| `tools/lib/reference.mjs` | exhaustive brute-force solver — the referee |
| `tools/lib/raster.mjs` | CPU rasteriser mirroring the shader, plus cost maps and drop maps |
| `tools/lib/render.mjs` | composition, panel strips, low-pass filters, level-set overlays |
| `tools/lib/png.mjs` | PNG writer and colormaps |
| `tools/exp/*.mjs` | one experiment each |
| `tools/gpu/*.mjs` | WebGPU timing harness, browser driver, frame capture |
| `tools/sink.mjs` | local HTTP sink so the page can write results to disk |
| `data/`, `figures/` | generated; safe to delete and regenerate |

## Solver generations

The comparisons need the solvers this work replaced, so `tools/legacy/` holds
frozen snapshots:

- `sweep` — fixed-budget seed-and-sweep, the version shipped before this work
- `window1` — the interval, but with drift bounded by `|δ|` instead of `ρ(−δ)`
  (the paper calls it `Loose`)
- `final` — read live from `src/`, so the paper always measures what ships
- `expr.interp.wgsl.ts` — the per-pixel field-expression interpreter the compiler
  in `src/fields/emit.ts` replaced, for Table 7

`instrument.mjs` can also patch `final` on the fly (budget, anchoring, individual
mechanisms) for the ablation, which keeps the ablated variants honest: they are
the shipping solver with one edit, not a separate implementation.
