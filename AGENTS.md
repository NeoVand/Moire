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
- Envelope view is the continuous-domain mean ink: one pass with `ENVELOPE_TAPS` taps sliding each family through exactly one of its own local periods. Level-set families slide their residual with `phaseDistWgsl` on the `(r, rUp, rDown, floor)` phase sample — no re-solve per tap. Lattices resample instead, advancing generator one by `u` and generator two by the golden ratio (a rank-1 rule); in lockstep a lattice beats against itself. Contrast expands about `nominalCoverage`, which must count a lattice's families or the pivot drives the frame black.
- Ratio view is the heterodyne ratio `η = |∇D| / |ḡ|` of the two topmost visible scalar-index layers (no lattices; radial fan counts), picked on the CPU into the `ratioA`/`ratioB` uniforms — never a rebuild. Fractional index is the phase sample's signed residual over the gap toward `min(rUp, rDown)` (smaller residual is always the next member up); `dFdx/dFdy` per layer, integer wraps rounded out of the per-pixel deltas, η clamped to [0,1]. Dark ≤ 1/4 is the fringe regime; `ratio` widens the solver guard like `sweep`. Fewer than two eligible layers renders the plain composite.
- Stroke: `halfT = max(thickness/2, 1.15 * pixel)` so hairlines and small geometric gaps do not pepper at zoom-out. `pixel = 1/zoom`.
- `devicePixelRatio` clamped to 2. Camera at `z = 1`, `near = 0.1`. `toneMapped = false`.
- First paint waits on `compileAsync`. `MoireStage` shows a Jupiter “Compiling” mark until the first frame. The first load then eases two default concentric layers into the preset.

## UI

- One `Studio` panel with a Jupiter (`JupiterIcon`) mark. Do not resurrect a separate top HUD, right inspector, or bottom filmstrip.
- PNG export is `exportPng()` in `src/gpu/capture.ts`. The stage registers `MoireRenderer.snapshot()`.
- Frosted HUD: `--hud-bg` + `backdrop-filter`. Selected layer is a quiet ring, not an inverted overlay.
- Every slider has a reset affordance next to its label when dirty. Defaults live in `LAYER_DEFAULTS`.
- Envelope is a header icon toggle; its options (contrast, sweep, exposure/lift, taps) live in a movable `FloatingPanel` opened on enable or right-click — all four are view uniforms, never a rebuild. Ratio is the gauge icon beside it (`R` toggles); envelope and ratio retire each other in `setView`. Fields are a calligraphic `f` on each layer row that opens the `FieldEditor`, also a `FloatingPanel` (presets, syntax-highlighted expression via `src/fields/highlight.ts` — a pre under a transparent textarea, classes from the parser's own name tables — live CPU preview with fringes/field modes and a heavier zero set, amount, extent, reference, and an enable switch that mutes by zeroing the amount uniform so A/B is instant; `f` shows muted-filled when a source is present but off). `FloatingPanel` (src/components/ui): no backdrop, drags by header with pointer capture, remembers position per id in localStorage, raises on pointer-down, Escape peels only the topmost. Active buttons are marked by fill and colour, never a ring. No `View` section, no field controls inline in the layer panel.
- Switching a layer to lines, grid, or curves zeros `offset` and `rotationOffset`. Type changes ease on the GPU (~280 ms): one stroke, mixed distances. The store snaps to the target.

## Git

Do not commit `.agents/`, `.claude/`, or `skills-lock.json`.
