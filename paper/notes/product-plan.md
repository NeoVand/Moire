# Product plan: a shading prefilter the industry adopts

Written 2026-09-05 evening after the author restated the target: not a paper but a product that Unreal, big studios or NVIDIA would put in place of part of their anti-aliasing pipeline. Every decision from here is measured against the three criteria below. Codex holds the engine side; this file is the shared list.

## What the product is

Temporal AA, TSR and DLSS handle geometry edges and upscaling for arbitrary content, and nobody replaces them wholesale. What they cannot fix is aliasing that originates in shading: procedural patterns, thresholded masks, cell patterns, displacement, specular on structured normals. Studios pay for that with blur, shimmer and hand-tuned octave fades. Our theory filters those exactly under the pixel footprint.

So the product is a shading prefilter: a compiler pass from a material graph to the material that returns the footprint-filtered result, running inside the engine's material system and composable with whatever AA and upscaler the engine already runs. The buyer is the engine vendor (a material feature), the studio (a plugin) or the GPU vendor (a library).

## Acceptance criteria

1. Generality: any material built from the node set below compiles with no per-scene work.
2. Cost: at most 1 ms at 1080p for a full-screen material on a mid-range GPU, or under twice the unfiltered material's cost, at 8-bit precision (2e-3 RMS against a 1024-spp reference), with a fixed per-pixel budget and a visible flag where the budget is exceeded.
3. Verified still and moving against the reference inside Unreal next to the engine's own AA at matched settings.

## Where we stand (2026-09-05)

| Node or scene | Theory | Kernel | Error at rest | Cost | Status |
|---|---|---|---|---|---|
| periodic tiling, thresholds (checkerboard) | exact coverage, spectral fallback | WGSL + HLSL, Unreal | 0.0005 RMS | 1.9 ms at 480x320 | done, cost 10x off |
| discs on a lattice (circles) | exact conic pullback, disc series | WGSL + HLSL, Unreal | 0.0005 RMS | 3.0 ms at 480x320 | done, cost 10x off |
| smooth UV warps (homographies) | second-order jets, curvature-aware widths | in all entries | as above | included | done |
| displacement with phase-driven lighting (rippled checkerboard) | line quadrature across the ripple, shifted-lattice recipes | WGSL | 0.0007 RMS | 26 ms at 240x160 before today's cost work | correct, cost being measured |

At 1080p these kernels are 50x to 100x too heavy against criterion 2. The CPU harness (`demo/tests/ripples-cpu.mjs`, the shader text run in a WGSL interpreter against brute force) shows the flat kernels' cost is not in the precision constants: reach 1.2 instead of 1.6 cycles a pixel and 4.5 instead of 5.5 sigma reaches move the errors by under 1e-5 and the counted calls by a third. It is in structure: the checker's mid band pays for every edge pair inside the window (up to 100 pairs), and handing pixels with more than four edges an axis to the spectral path cuts that band's mean cost 4x at the same error; the circles pay for the disc panels and for the lattice fallback, whose series converges slowly, so the exact path should keep as many pixels as it can.

## Node set, in product-value order, with the theory each needs

1. Threshold of a smooth field (`noise > t`, `sin(f(uv)) > 0`, height cut-offs). This is the commonest aliasing source in procedural materials. Theory: the field's second-order jet at the pixel gives its zero set as a conic locally; the disc machinery (`quadRegion`) already integrates a conic region under the window. New work: the jet of an arbitrary graph node through the chain rule (the compiler has it), and the case of several thresholds in one footprint.
2. Cell patterns (Voronoi, Worley, scales, stones, cracks). Every boundary is the bisector line between two feature points, so a cell's coverage is an intersection of half-planes: the coverage branch with data-dependent edges. No analytic filter exists for these in engines. New work: the feature-point enumeration per footprint and the joint of up to three half-planes (the trivariate normal, or the pairwise inclusion-exclusion the theory already bounds).
3. Displacement and phase-driven lighting on general patterns (the ripple result generalised): the line quadrature and the shifted lattice as a node that composes with 1 and 2.
4. Lattice noises (Perlin, value, simplex) under a footprint larger than their cell. Their basis is piecewise polynomial, so the window integral of each octave is closed form; the industry fades octaves by a heuristic. Modest value on its own (noise without a threshold aliases mildly) but needed under node 1.
5. Specular on structured normals. For procedural bumps the normal field's jet is known and the highlight's expectation is a Gaussian moment. For sampled normal maps the engines already ship moment-based filters (LEAN, Toksvig), so our contribution there is the coupling with nodes 1 to 3, not the filter itself.

## Cost work, in order

1. Precision dial: the kernels run at 8-bit precision (cuts at 1e-3, fewer quadrature nodes, the four-edge handover) with a per-pixel budget and the regime flag.
2. Structural: prune edge pairs by a probability bound before the bivariate normal; share the per-pixel setup across the arms; avoid thread-memory arrays in the hot paths.
3. The 1080p protocol on native hardware (Codex) decides what counts.

## Split

Claude: the compiler's node types (theory and kernel), the precision dial and structural cost work, the CPU harness. Codex: the Unreal material integration as a product surface, the benchmark of industry materials with references (brick, tiles, wood grain, noise masks, hex tiles, cell patterns, normal-mapped metal with specular), the 1080p native cost protocol, the moving-camera comparison against the engine's AA.
