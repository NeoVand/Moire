# Image stability during gestures: evidence and remaining questions

Date: 2026-09-05. This is an application review note, not a change to the integral compiler or a claim that every gray region is an error.

## What was reproduced

The opening walking-circle pair develops broad gray regions around its centres when the renderer reduces the drawing buffer during a gesture. This happens in the ordinary view with Envelope off. A GPU probe of the opening final pose at zoom 0.92 produced the reported disks at a buffer scale of 0.35. The full-size frame and an interaction frame at scale 1 were byte-identical. Disabling pooling at scale 0.35 removed the averaging but produced severe aliasing; it is not a satisfactory fix.

Envelope was also tested at zoom 0.92 and sweep 1. With the pair table enabled, the full-size rest and full-size interaction frames were byte-identical. Reducing the buffer produced a gray lens. With the table disabled, the rest and interaction frames differed even at full size: the interaction flag selects a different synthesis path. Those images looked broadly similar, but their unequal pixels establish that the flag changes the rendering contract.

The demonstrated fix is therefore to render ordinary gestures at the full pixel grid and keep the same solver as the stationary frame. Anti-aliasing stays enabled. The frame may take longer on a demanding scene; a gesture must not silently change which picture the application is drawing. Playback must advance by real elapsed time when rendering is slow.

The regression checks should compare the same pose at rest and during a held gesture in both ordinary and Envelope views. They should also cover switching views during a gesture, type morphs, pan/zoom, and a subsequent export. A visual comparison alone can miss a solver switch; pixel equality is appropriate when the pose and render settings are identical.

## Why a smaller buffer makes disks

The one- and two-family ordinary view uses `poolDirect2` in `src/gpu/composite.ts`. Its footprint expands in world units when the buffer shrinks. Close to the two circle centres the local normals often differ strongly, so the difference-frequency signal is relatively fast. Farther away the normals can be nearly parallel, leaving a much slower beat. A wider footprint removes the former signal more strongly, creating a localized gray area rather than fading the whole frame uniformly.

For illustration, the current footprint formula gives the following values for spacing 6 and zoom 1. The last column is the Gaussian attenuation of the difference of two equal-frequency carriers whose normals meet at 90 degrees. It is an explanatory local model, not a measurement of final graded pixels.

| Buffer scale | Gaussian width in world units | Difference-frequency amplitude retained |
| --- | ---: | ---: |
| 1 | 0.379563 | 0.853860 |
| 0.7 | 0.776399 | 0.516314 |
| 0.5 | 1.281481 | 0.165155 |
| 0.35 | 2.545945 | 0.000818 |

This is sufficient to explain a large interaction-only loss of contrast. The exceptional normal at the exact circle centre occupies a tiny region and does not explain the broad disks. Locally treating curved rings as straight bands also has a curvature error, especially for a coarse footprint, but that is a separate approximation; it was not demonstrated to be the source of the user's broad movement regression.

## The table filter deserves a separate validity investigation

The Envelope pair table is a periodic color function of one count, sampled with five Gauss–Hermite taps. Its lookup additionally blends the result toward the independent-phase pivot with `smoothstep(0.12, 0.28, s)`, where `s = 0.4 * length(gradient(count))`. This is a heuristic low-pass transition, not exact Gaussian integration. Its comment that a beat beyond 0.12 count standard deviations is already unresolvable is too broad.

For a periodic fundamental, Gaussian attenuation is `exp(-2 * pi² * s²)`: it is 0.752583 at `s = 0.12`, 0.454041 at `s = 0.20`, and 0.212768 at `s = 0.28`. For example, an ideal half-duty pair gives a triangular envelope with mean 0.25; at its peak the Gaussian-filtered value at `s = 0.28` is approximately 0.293116, whereas a complete blend to the mean gives 0.25.

**Correction to an initially tempting interpretation:** those nonzero Gaussian amplitudes do not by themselves prove that the removed signal should be displayed. Gaussian filtering is not a strict band limit. Because the pixel window coefficient is 0.4, `s = 0.20` corresponds to a radial frequency of 0.5 cycles per pixel. The sampling limit is a square in two-dimensional frequency coordinates, not a radial threshold. An axis-aligned fundamental at that frequency reaches Nyquist; a diagonal fundamental of the same radial magnitude has components approximately 0.354 and remains inside the square. At `s = 0.28`, a frequency of magnitude 0.7 is outside the square along an axis but can still lie just inside it diagonally. Harmonics reach those limits sooner. Simply removing the pivot blend can therefore expose aliasing, while the current radial blend can suppress resolvable signal in some directions.

A principled replacement would filter each harmonic using the actual two-dimensional frequency and a documented pixel window, preserve the correct mean for the selected observer, and be compared against a converged pixel integral. Five taps alone are not a converged reference for a nonsmooth periodic tent. A compact coefficient table could make harmonic filtering affordable, but it requires a new prepass, truncation/error choices, and performance measurements. That is not a bounded prerequisite for fixing the verified movement regression. No table-filter change is included in this pass.

## The table eligibility rule also needs its own reference

The table builder uses synthetic symmetric trios with gaps equal to each layer's nominal `spacing`. The lookup uses the gap measured from that pixel's solved trio. The renderer's comments require constant symmetric gaps, but its eligibility check currently tests family type, two visible scalar layers, no fields, no active morph, and a whole-number sweep. It does not reject walking offsets or rotating polygon members.

The opening circles have a walking offset of magnitude 0.5 and nominal spacing 6. Their local gap can vary roughly between 5.5 and 6.5; using a fixed nominal profile can therefore change its local duty by roughly nine percent relative to the local-gap profile. This is evidence of an assumption mismatch, not proof that disabling the table improves the displayed image.

A controlled GPU comparison at the same opening pose, zoom 0.92, and sweep 1 changed only table eligibility. Table versus per-pixel chain had a mean absolute RGB difference of 3.66/255 and RMS 6.01/255 globally. A 120 by 155 region near the foci had mean absolute difference 5.28/255 and RMS 8.71/255; the maximum difference was 101/255. Another region away from the foci had mean absolute difference 4.99/255. The chain image did not remove a broad gray-disk artifact. These differences identify a modeling question but do not establish the chain as pixel-integral ground truth; its spatial filtering also differs from the table path.

Consequently this pass leaves table eligibility unchanged as well. A follow-up should compare constant symmetric circles, walking circles, and rotating polygons against a converged source/pixel integral across zoom and sweep. It should isolate table-profile error from spatial filtering error, then change eligibility only where the reference demonstrates an improvement. The optional Envelope mask intentionally fades toward a pivot and is outside this issue.

## Reproduction provenance

The actual GPU probes were run by the export/renderer audit during this review. Their temporary captures were written to `/tmp/moire-envelope-probe/` as `table-rest.png`, `table-1.png`, `table-0.5.png`, `table-0.35.png`, and corresponding `chain-*` files. These temporary files are useful within the current session but are not durable test fixtures. The numeric attenuation examples above follow directly from the current footprint formula and the Fourier transform of its Gaussian window. They do not substitute for the GPU comparisons or a converged reference.

## Integration note

Commit `0bee02f` included the tracked app edits from this work alongside its
paper response change, but omitted the new support modules and tests. The app
follow-up commit includes those missing files (`history.ts`, `paramMetadata.ts`,
`composition.ts`, their tests and export/interaction harnesses), the final test
command, and the app documentation. The concurrent commit was not rewritten.
