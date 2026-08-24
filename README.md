# Moiré

<p align="center">
  <img src="moire.gif" alt="Moiré — overlapping concentric fields in the studio" width="100%">
</p>

<p align="center">
  A canvas-first WebGPU studio for interference fields.<br>
  <a href="https://neovand.github.io/Moire/"><strong>Open the live studio</strong></a>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=000">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=fff">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=fff">
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-000?style=flat-square&logo=threedotjs&logoColor=fff">
  <img alt="WebGPU" src="https://img.shields.io/badge/WebGPU-005A9C?style=flat-square">
  <img alt="WGSL" src="https://img.shields.io/badge/WGSL-TSL-111?style=flat-square">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=fff">
  <img alt="Zustand" src="https://img.shields.io/badge/Zustand-443E38?style=flat-square">
  <img alt="Hugeicons" src="https://img.shields.io/badge/Hugeicons-111?style=flat-square">
</p>

Two similar periodic figures—lines, rings, polygons, or lattices—overlay to make a new figure. Moiré is a full-bleed canvas with one studio on the left. Add layers, drag them, and watch the interference write itself.

## Fields, not drawings

This is not a pile of SVG paths. Nothing here is a list of rings the GPU then strokes. Each layer is a **scalar field**: every pixel asks how far it is from the nearest member of a family, and ink appears where that distance is smaller than half the stroke.

A family is indexed by an integer `n`. Ring `n` has radius `n * spacing + phase`. If the layer is translated or rotated, the center walks with `n` too — `rotate(n · δ, n · θ)` — then the sample is unrotated back into that ring’s frame. Two of those fields, slightly out of step, *are* the moiré. The interference is not composited after the fact; it is what you see when two answers disagree.

```ts
function evalRing(p, n, offset, theta, spacing, phase, shape, sides) {
  const radius = n * spacing + phase;
  const center = rotate2d({ x: offset.x * n, y: offset.y * n }, n * theta);
  const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -n * theta);
  return Math.abs(shapeRadius(q, shape, sides) - radius);
}
```

`shapeRadius` is the metric for that family: Euclidean length for circles, `max(|x|, |y|)` for squares, the regular-polygon radial metric for triangles and n-gons. Centered layers collapse to a `mod`. Circles with a pure translation solve a quadratic. Squares with a translation have a closed L∞ form. Rotation — or a translated polygon — needs Newton, plus a sweep of `n` over the range the orientation can actually occupy. Cap that range and whole sides vanish when you zoom out (the white holes). There is no `maxRings`.

The same functions exist twice, on purpose: TypeScript in `src/gpu/inverseCpu.ts` and WGSL in `src/gpu/inverse.wgsl.ts`. Three.js `wgslFn` only parses the first `fn` in a string, so each helper is its own include. Tests lock the twins: `node --experimental-strip-types src/gpu/inverseCpu.test.ts`.

Stroke width is also a field test. `halfT = max(thickness / 2, 1.15 · pixel)` so a hairline stays a hairline at any zoom, instead of peppering into gaps. Twelve layer slots are compiled once; hide or delete writes `active = 0` into the same uniforms.

## Patterns

| Family | What it draws |
| --- | --- |
| **Lines** | Parallel strokes |
| **Circles** | Concentric rings |
| **Polygon** | Concentric squares, triangles, or hexagons |
| **Grid** | Square, hex, or triangle lattices — vertices, optional edges, Scale X/Y |

Hex grid edges are hexagon sides, not three-line families. Grids have no offset.

## Studio

- Drag moves the selected layer. **Option-drag** rotates around the world origin.
- Space or middle-drag pans. Wheel zooms to the cursor. Shift on a slider is fine control.
- `I` collapses the studio to a mark. `E` exports a PNG. `F` resets the view.
- `1`–`9` select a layer. `H` hides it. `D` duplicates. `⌫` removes.
- Click the mark for a short note on the effect. `?` lists shortcuts.

Theme defaults to dark. The canvas defaults to white. Pattern colors are the only accent.

## Develop

```bash
git clone https://github.com/NeoVand/Moire.git
cd Moire
npm install
npm run dev
```

Open `http://localhost:5173`. `npm run build` writes `dist/`.

Needs a browser with [WebGPU](https://gpuweb.github.io/gpuweb/). Inverse math is kept as CPU and WGSL twins; run `node --experimental-strip-types src/gpu/inverseCpu.test.ts`.

## License

MIT. Designed and created by [Neo Mohsenvand](https://neovand.github.io/).
