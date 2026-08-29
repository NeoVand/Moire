# Moire — agent memory

Canvas-first WebGPU moiré tool. Vite + React + TypeScript + Three.js TSL. Do not edit the rewrite plan file.

## Product contract

- Full-bleed canvas. One studio chrome on the left (Jupiter mark, view, layers, fields, PNG export). `I` collapses it to a Moire pill. `E` exports a PNG.
- World Y is up. Flip Y only in `src/gpu/camera.ts` (pointer / zoom-to-cursor).
- Drag moves the selected layer (screen-space; invert layer rotation onto position). Option-drag rotates around the world origin (degrees in UI). Space or middle-drag pans. Wheel zooms to cursor. Shift on sliders is fine control.
- `rotation` is degrees. `rotationOffset` is radians, always present on the layer.
- No `maxRings`, JSON import/export theater, or fake blend modes.
- V1 patterns: parallel lines and radial lines through the origin; concentric circles, squares, triangles, n-gons; square / hex / triangle lattices (no offset; vertices + optional edges; X/Y scale); curves — wave, parabola, hyperbola, Archimedean spiral. Hex edges are hexagon sides, not 3-line families. Studio groups them as Lines, Concentric, Grid, Curves.
- Radial lines: N undirected lines through the layer origin, equally spaced over π. No spacing, progressive, or offset — `lineCount` instead (default 8, max 360). `phase` is Start: a hole of that radius around the origin (0 draws through the center). Type code 8.
- Render on dirty store subscribe, rAF-coalesced. Do not rebuild `colorNode` when layer count changes.
- Pattern colors are the only accent. Background default is `#ffffff`.
- Hugeicons only. Lines use `Asterisk02Icon`, not `EqualSignIcon` or `LineIcon`.
- Studio chrome is dark. Zoom, background, and shortcuts live in the studio header.

## Inverse math (CPU and WGSL must stay twins)

Ring `n`: shape of radius `n * spacing + phase`, center `rotate(n * δ, n * θ)`, then `q = rotate(p - center, -n * θ)`.

- Centered (`δ = 0`, `θ = 0`): `mod` of `shapeRadius`.
- Circles + translation: conditioned quadratic, then neighbor integers.
- Squares + translation: closed-form L∞ axis candidates.
- Rotation, or translated polygons: Newton plus a sweep of `n` over `[nMin, nMax]`. Rotation fans the nearest index away from `|p|/spacing`; missing that range drops whole sides (the “broken segments / white holes” when zoomed out).
- `shapeRadius`: `length` (circles), `max(|x|,|y|)` (squares), regular-polygon radial metric (tri / n-gon).
- Three.js `wgslFn` only parses the first `fn` in a string. One helper per `wgslFn`, passed as includes.
- Parallel lines: `mod` of the projection. Radial lines: `max(r * |sin(wrapToHalf(atan2(p), π/N))|, start - r)`.
- Curves: type codes 9–12. No walking offset.
  - Wave: `φ = x − A sin(2π f y / 32 + ψ)`. `bend` is A, `frequency` is f (1 = one cycle / 32), `phase` is ψ. Ink `periodicDist(φ, spacing)`.
  - Parabola: one upward family `y = 0.01 B x² + n s + phase`. Bend 0 is horizontal parallels. Euclidean band `periodicDist(ψ, s) / |∇ψ|` (sides darken at high bend).
  - Hyperbola: rectangular `√|x² − y²| = n s + phase` for n ≥ 1 (east-west and north-south). No quadratic wrap.
  - Spiral: Archimedean. Spacing is the arm gap. Starts `M = max(1, round(B / s))`, used pitch `M s` so the cut stays closed. `periodicDist(r − (M s / 2π) θ − phase, s)`. Pitch 0 is concentric.
- Files: `src/gpu/inverseCpu.ts` and `src/gpu/inverse.wgsl.ts`. Tests: `node --experimental-strip-types src/gpu/inverseCpu.test.ts`.

## Fields

A field is a displacement of a layer's *index*: `shift` many members, wherever you stand. Every family spends it in its own currency — phase for the level-set families, a rotation for the radial fan, a translation along the first generator for lattices — so the fringes against an unmodulated twin are the level sets of the field.

- `src/fields/expr.ts` parses `f(x, y)` to stack bytecode. Guards (`EXPR_EPS`), opcodes and limits live there and are shared, so no evaluator can drift on numbering or on where a singularity is clamped.
- `src/fields/emit.ts` unrolls that bytecode into **straight-line code**: no loop, no dispatch, no stack, nothing passed in. It is backend-agnostic; `wgslBackend` ships and the JS backend in the test exists so the unrolling can be checked against the interpreter without a browser. Do not put an interpreter back in the shader — that was 50 ms a frame, and nearly as much for an *empty* program, because the call had to hand the program over first.
- `src/fields/evalExpr.ts` is the CPU twin (dual numbers, forward-mode AD), used by the editor's preview and the paper's CPU mirror.
- Chain rule: a term with an exactly-zero factor contributes nothing, even against an overflowed partial. `evalExpr.ts` does that in `term`; `emit.ts` folds the same zeros while generating code. A plain multiply gives `0 · ∞ = NaN` and poisons the gradient.
- One generated `fn moireField{slot}` per layer that carries a field, so **a new expression is a new material**. `MoireRenderer` debounces that on `FIELD_SETTLE_MS` (220 ms) and holds the last frame across the build. Amount and extent are uniforms and never rebuild.
- Tests: `node --experimental-strip-types src/fields/expr.test.ts`.

## Renderer

- Fixed `MAX_LAYERS` (12) slots compiled once. Hide/delete writes `active = 0` into the same uniforms. Never allocate a new slot array on count change. A field expression is the one thing that does rebuild the material, and only after it settles.
- Envelope view is the continuous-domain mean ink: one pass with `ENVELOPE_TAPS` taps sliding each family through exactly one of its own local periods. Level-set families slide their residual with `phaseDistWgsl` on the `(r, rUp, rDown, floor)` phase sample — no re-solve per tap. Lattices resample instead: one generator advances by `u` coherently and the other by the golden ratio (a rank-1 rule — in lockstep a lattice beats against itself). Which combination rides `u`, and stepped which way, is chosen per pixel among the four beat-capable index combinations — each generator, their sum, and their difference (a hex/triangle lattice's third row direction) — by matching each one's exact index gradient (`local · b_k`, linear, so `dFdx` is exact) against the ranked partner's `gradA`, forward or backward; the sum/diff schedules (`(g, su∓g)`) leave both bare generators equidistributed so the lattice still never self-hatches. A global choice erases beats along the unchosen directions or counted the other way (the lattice edition of the sum-moiré convention; a ring partner's counting direction rotates around its centre). The envelope's ranked pair falls back to the topmost eligible layer alone (`envelopePair`) — the ratio view still needs two, but with one grid and one family the partner gradient would otherwise be the zero vector and the choice degrades to noise. Lattice⊗lattice beats are unhandled. Contrast expands about `nominalCoverage`, which must count a lattice's families or the pivot drives the frame black.
- Ratio view is the heterodyne ratio of the two topmost visible scalar-index layers (no lattices; radial fan counts), picked on the CPU into the `ratioA`/`ratioB` uniforms — never a rebuild. Fractional index is the phase sample's signed residual over the gap toward `min(rUp, rDown)` (smaller residual is always the next member up); `dFdx/dFdy` per layer, integer wraps rounded out of the per-pixel deltas. A family's index sign is a convention, so η is the MIN of the difference and sum ratios (`|∇(ξA∓ξB)| / (|∇(ξA±ξB)|/2)`) — the classical difference and sum moirés — clamped to [0,1]. Dark ≤ 1/4 is the fringe regime; `ratio` widens the solver guard like `sweep`. Fewer than two eligible layers renders the plain composite.
- The envelope reuses that η twice: `envMask` fades the view to its pivot where η > 1/4 (outside the regime the mean is a faithful but carrier-fine Φ(D) that reads as a failed average — mask defaults OFF, slider in the panel), and where the SUM beat is the slower one the ranked second layer sweeps backwards (the diagonal preserves φ₁−φ₂ and averages φ₁+φ₂ away; flipping recovers the sum moiré). Pair uniforms stay warm during any enveloped frame.
- Stroke: `halfT = max(thickness/2, 1.15 * pixel)` so hairlines and small geometric gaps do not pepper at zoom-out. `pixel = 1/zoom`.
- `devicePixelRatio` clamped to 2. Camera at `z = 1`, `near = 0.1`. `toneMapped = false`.
- First paint waits on `compileAsync`. `MoireStage` shows a Jupiter “Compiling” mark until the first frame. The first load then eases two default concentric layers into the preset.

## UI

- One `Studio` panel with a Jupiter (`JupiterIcon`) mark. Do not resurrect a separate top HUD, right inspector, or bottom filmstrip.
- Export lives behind the image icon: an `ExportDialog` `FloatingPanel` with a live preview (0.25× render, refreshed on aspect change and debounced on any store change), aspect chips (cover-never-crop: a different aspect extends the frame about centre — the pattern continues past every edge), and 1/2/4× resolution with a px readout. Exports render at an explicit framebuffer size with the zoom uniform scaled to match (`MoireRenderer.snapshot({scale, aspect})` / `snapshotSize` — framing identical by construction, capped 8192px a side; `capturePng`/`captureSize`/`exportPng` in `src/gpu/capture.ts`). The scene side saves/loads the whole construction as JSON (drag-drop onto the panel works) — `src/store/scene.ts` serializes layers/camera/background/view and parses forgivingly (missing fields take `createLayer` defaults; unknown types are errors), `loadScene` replaces the project wholesale. The export shortcut still saves a 1× PNG directly.
- Frosted HUD: `--hud-bg` + `backdrop-filter`. Selected layer is a quiet ring, not an inverted overlay.
- Every slider has a reset affordance next to its label when dirty. Defaults live in `LAYER_DEFAULTS`.
- Envelope is a header icon toggle; its options (contrast, sweep, exposure/lift, taps) live in a movable `FloatingPanel` opened on enable or right-click — all four are view uniforms, never a rebuild. Ratio is the gauge icon beside it (`R` toggles); envelope and ratio retire each other in `setView`. Fields are a calligraphic `f` on each layer row that opens the `FieldEditor`, also a `FloatingPanel` (presets, syntax-highlighted expression via `src/fields/highlight.ts` — a pre under a transparent textarea, classes from the parser's own name tables — live CPU preview with fringes/field modes and a heavier zero set, amount, extent, reference, and an enable switch that mutes by zeroing the amount uniform so A/B is instant; `f` shows muted-filled when a source is present but off). `FloatingPanel` (src/components/ui): no backdrop, drags by header with pointer capture, remembers position per id in localStorage, raises on pointer-down, Escape peels only the topmost. Active buttons are marked by fill and colour, never a ring. No `View` section, no field controls inline in the layer panel.
- Switching a layer to lines, grid, or curves zeros `offset` and `rotationOffset`. Type changes ease on the GPU (~280 ms): one stroke, mixed distances. The store snaps to the target.

## Git

Do not commit `.agents/`, `.claude/`, or `skills-lock.json`.
