# Moire — agent memory

Canvas-first WebGPU moiré tool. Vite + React + TypeScript + Three.js TSL. Do not edit the rewrite plan file.

## Product contract

- Full-bleed canvas. One studio chrome on the left (Jupiter mark, view, layers, fields, PNG export). `I` collapses it to a Moire pill. `E` exports a PNG.
- World Y is up. Flip Y only in `src/gpu/camera.ts` (pointer / zoom-to-cursor).
- Drag moves the selected layer (screen-space; invert layer rotation onto position). Option-drag rotates around the world origin (degrees in UI). Space or middle-drag pans. Wheel zooms to cursor. Shift on sliders is fine control.
- `rotation` is degrees. `rotationOffset` is radians, always present on the layer.
- No `maxRings`, JSON import/export theater, or fake blend modes.
- V1 patterns: parallel lines; concentric circles, squares, triangles, n-gons; square / hex / triangle lattices (no offset; vertices + optional edges; X/Y scale). Hex edges are hexagon sides, not 3-line families. Studio groups them as Lines, Circles, Polygon, Grid.
- Render on dirty store subscribe, rAF-coalesced. Do not rebuild `colorNode` when layer count changes.
- Pattern colors are the only accent. Background default is `#ffffff`.
- Hugeicons only. Lines use `Asterisk02Icon`, not `EqualSignIcon` or `LineIcon`.
- Theme defaults to dark. Zoom, background, theme, and shortcuts live in the studio header.

## Inverse math (CPU and WGSL must stay twins)

Ring `n`: shape of radius `n * spacing + phase`, center `rotate(n * δ, n * θ)`, then `q = rotate(p - center, -n * θ)`.

- Centered (`δ = 0`, `θ = 0`): `mod` of `shapeRadius`.
- Circles + translation: conditioned quadratic, then neighbor integers.
- Squares + translation: closed-form L∞ axis candidates.
- Rotation, or translated polygons: Newton plus a sweep of `n` over `[nMin, nMax]`. Rotation fans the nearest index away from `|p|/spacing`; missing that range drops whole sides (the “broken segments / white holes” when zoomed out).
- `shapeRadius`: `length` (circles), `max(|x|,|y|)` (squares), regular-polygon radial metric (tri / n-gon).
- Three.js `wgslFn` only parses the first `fn` in a string. One helper per `wgslFn`, passed as includes.
- Files: `src/gpu/inverseCpu.ts` and `src/gpu/inverse.wgsl.ts`. Tests: `node --experimental-strip-types src/gpu/inverseCpu.test.ts`.

## Renderer

- Fixed `MAX_LAYERS` (12) slots compiled once. Hide/delete writes `active = 0` into the same uniforms. Never allocate a new slot array on count change.
- Stroke: `halfT = max(thickness/2, 1.15 * pixel)` so hairlines and small geometric gaps do not pepper at zoom-out. `pixel = 1/zoom`.
- `devicePixelRatio` clamped to 2. Camera at `z = 1`, `near = 0.1`. `toneMapped = false`.
- First paint waits on `compileAsync`. `MoireStage` shows a Jupiter “Compiling” mark until the first frame.

## UI

- One `Studio` panel with a Jupiter (`JupiterIcon`) mark. Do not resurrect a separate top HUD, right inspector, or bottom filmstrip.
- PNG export is `exportPng()` in `src/gpu/capture.ts`. The stage registers `MoireRenderer.snapshot()`.
- Frosted HUD: `--hud-bg` + `backdrop-filter`. Selected layer is a quiet ring, not an inverted overlay.
- Every slider has a reset affordance next to its label when dirty. Defaults live in `LAYER_DEFAULTS`.
- Switching a layer to lines zeros `offset` and `rotationOffset`.

## Git

Do not commit `.agents/`, `.claude/`, or `skills-lock.json`.
