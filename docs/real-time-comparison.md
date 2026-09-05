# Real-time anti-aliasing comparison

The immediate deliverable is a live, synchronized comparison of the same procedural material through three rendering paths: one sample with no anti-aliasing, a temporal anti-aliasing baseline, and our integration method. The first scene adapts the grazing checkerboard plane used by the Yang–Barnes procedural shader benchmark. The demo is a focused material test; it is not yet evidence that the method handles every part of a game renderer.

## Why this scene

Yang and Barnes' [Eurographics 2018 project](https://yyuting.github.io/docs/eg_2018.html) provides an existing publication, a reference protocol, and [public MIT-licensed source](https://github.com/yyuting/approximate_program_smoothing). A grazing periodic surface exposes the particular failure under study: resolved checks near the camera, false bands in the middle, and unresolved detail near the horizon. This is more diagnostic for procedural material filtering than putting a smooth material on a familiar mesh.

The repository's original reproduction is [yb.mjs](../paper/tools/exp/yb.mjs). At 480 × 320 its camera maps integer pixel `(x, y)` to surface coordinates `s = −50(x−240)/(y+1)`, `t = −12000/(y+1)`. The checker has period 20 in both coordinates. The published reference uses a Gaussian pixel window with standard deviation 0.5 pixel. Any changes to lighting, camera animation, footprint, or display conversion in the interactive scene must be stated; similarity of appearance alone does not make a new capture a reproduction of a published score.

The interactive adaptation currently uses a ground plane, a camera 12 units above it with a 50-degree vertical field of view, a checker period of 4 world units, and unlit linear intensities 0.025 and 0.82. The ground has a sky background and glide/approach camera paths. It retains the half-pixel Gaussian target for the spectral method and numerical reference. These choices make a usable moving demonstration; its images and errors are not the published benchmark's scores.

The next scene should add actual geometric silhouettes and disocclusions, using the same procedural materials on a floor, a sphere, and thin moving geometry. That tests whether a material improvement survives integration into the broader rendering pipeline. Ripple and bump materials remain separate extensions until their actual GPU paths exist.

## What the baseline means

Temporal anti-aliasing is a practical gaming baseline. The [2020 TAA survey](https://research.nvidia.com/labs/rtr/publication/yang2020survey/) separates its two core operations: accumulating samples and deciding which history remains valid. Our baseline must implement both, reproject the same scene under motion, and reset history on a camera cut or resolution change.

The current browser baseline must be called **TAA**, with its implementation details, rather than simply **state of the art**. A result against it is not a result against a vendor's native implementation. [NVIDIA DLAA](https://developer.nvidia.com/rtx/dlss) uses a neural reconstruction model at native resolution; [Epic TSR](https://dev.epicgames.com/documentation/en-us/unreal-engine/temporal-super-resolution-in-unreal-engine) is an engine reconstruction system with additional history and rejection machinery. A native-engine comparison with those systems is an outstanding milestone. Their names must not be attached to a substitute shader.

The implemented baseline uses Three.js r185's official [TRAA node](https://threejs.org/docs/pages/TRAANode.html), with its own jittered camera, motion-vector and depth inputs, history rejection, and neighborhood clipping. Its checker material uses a 512 × 512 repeating texture, generated mipmaps, trilinear filtering, and requested 16× anisotropy. Those material filtering steps are part of the baseline's quality and cost. MSAA is off. This is a practical texture-and-TAA pipeline; the spectral path integrates the corresponding analytic checker source.

Plain MSAA is an optional geometric diagnostic, not a sufficient sole baseline for this experiment. The [Direct3D specification](https://microsoft.github.io/DirectX-Specs/d3d/archive/D3D11_3_FunctionalSpec.htm) distinguishes sampling coverage from executing the pixel shader: ordinary MSAA can shade only once per covered pixel. It therefore leaves high-frequency procedural shading inside a triangle undersampled. Evaluating the entire shader four times is **4-sample supersampling**, not ordinary MSAA.

## Comparison contract

- All panels use the same camera pose, scene time, material, render dimensions, tone mapping, and display conversion. No hidden resolution reduction or sharpening advantage.
- State the target pixel footprint. The numerical reference integrates that same footprint and the same source shader. A Gaussian integral and a box-filtered reference measure different targets.
- Show both still and moving views. Pause does not silently replace one method with an offline render. TAA remains a temporal method and its history age matters.
- Keep the expensive reference outside the live timing. Compare still captures against a converged independent reference; report its estimated residual error. A noisy sampled reference is not exact ground truth.
- Report warm GPU timing per method where timestamp queries are available, as well as total three-panel cadence. Three's public accumulator **sums** render-pass durations. We measured overlapping intervals on this GPU, so this sum can exceed elapsed GPU time. It includes temporal beauty, resolve, and output passes but excludes history texture copies, uploads, CPU submission, queue gaps, and presentation. Label it **GPU pass sum**, never convert it to a frame rate. The isolated benchmark additionally measures the earliest-begin/latest-end GPU span and CPU-start-to-queue-completion wall time. Exclude initialization and compilation from warm numbers, but report startup and rebuild costs separately.
- Record device, backend, browser, dimensions, settings, and history state with results. Compare equal output resolution first; a later fixed-time comparison must include each method's full work.
- Inspect error by distance as well as over the full image. A constant gray output can remove shimmer while also removing real detail. For motion, compare error against the corresponding reference frame rather than raw frame-to-frame changes, which also include intended motion.
- No success threshold may be chosen after looking at the results. Record failures, unsupported regions, and fallback work with the images.

## Ownership and handoff

Codex owns the demo shell and method adapters under `src/compare/`, this document, and `tests/compare/`. The author continues to own the compiler and its research files under `paper/tools/exp/` and `paper/notes/`. No live demo change requires replacing those compiler files.

The author's GPU emitter should enter through the same per-pixel scene inputs used by the existing comparison method. Its adapter must specify supported materials, pixel measure, output color space, and any fallback. Changing the camera mapping or silently substituting a filtered texture would invalidate the comparison. The first integration target is one full checkerboard frame, including the near field and horizon, followed by the fixed camera sweep. Preserve the independent no-AA source and reference as gates while swapping in the emitter.

### Agreed coordination

The author's `demo/` appeared while this harness was being built. It is a separate work area and has not been edited here. It already exposes useful additional arms and diagnostics; no one should delete or overwrite it to resolve the duplication.

Use `/compare.html` as the common presentation harness, retaining its official TRAA baseline and inspector. The author owns the shared implementation in `demo/ours-kernel.wgsl.js`, its native HLSL port, and the general compiler; Codex owns the adapter in `src/compare/scene.ts`, the application controls, `tests/compare/`, and the isolated `native/` host. The shared adapters now preserve this harness's camera, phase, lighting, color conversion, and pixel measure. Scores from the original Yang–Barnes camera and this interactive adaptation are not interchangeable.

The checkerboard's shared lattice and homography entries are connected and validated below. Next, connect the generated HLSL to the native host and add circles through the shared material interface. Port the author's supersampling, whole-image reference, error, and regime diagnostics as optional diagnostics in the shared harness. Keep algorithm development in one owned module so the two demos do not acquire separately corrected copies of the method.

## Running and extending the demo

Start the existing Vite development server with `npm run dev`, then open `/compare.html`. The studio remains at `/`. All three panels run on WebGPU at identical native buffer sizes. Pause holds the camera still while allowing temporal history to accumulate. Camera cuts, density changes, and resizes clear temporal history. Neither pause nor motion switches the integration method or lowers the buffer resolution.

Click a ground pixel to pause and inspect that location in all three panels. The inspector shows captured colors, errors in linear light against a 131,072-sample Gaussian reference, and disagreement between the two reference sequences. It states that TAA uses a different reconstruction filter. The sampled reference evaluates the original rational source; it does not call the integration shader. Horizon and outer plane-edge pixels are refused because they also need geometric coverage filtering. The selected swatches describe the capture at selection; temporal history may continue refining the displayed panel afterward.

The integration adapter currently calls `projectiveChecker` in [spectral.ts](../src/compare/spectral.ts). Where at most one checker boundary per axis intersects a six-sigma pixel disk, it integrates the actual projected straight boundaries jointly. Elsewhere it evaluates paired sum/difference Fourier characters using a quadratic phase model with 16 odd harmonics per checker axis. The exact depth-conditioned compiler path is not connected. The finite Fourier tail and local projective approximation are not certified whole-image error bounds.

The actual shared projection and material are in [scene.ts](../src/compare/scene.ts); `Homography` carries three affine screen-space numerators `(u, v, d)` so the exact source counts are `(u/d, v/d)`. GPU derivatives are in device-pixel units. The temporal material uses the same checker phase and intensities through a sampled texture. The renderer displays sRGB after linear shading. The author's emitter should replace the integration adapter while keeping this source, camera, and baseline fixed.

The `window.__compare` development bridge exposes `info()`, `pause()`, `setTime()`, `setMotion()`, `setDetail()`, `resize()`, `step()`, and `pixels(method)`. `step()` advances history at a fixed scene time. The byte capture is sRGB; tests wait two animation frames after initialization or resizing so the new temporal targets have been rendered. Reference tests use a separate linear offscreen render target to avoid folding display gamma into the integral.

Run:

```sh
node --test tests/compare/reference.test.mjs
node tests/compare/homography.mjs
node tests/compare/materials.mjs
node tests/compare/run.mjs
node tests/compare/performance.mjs
```

The browser tests start their own Vite server and a fresh headless Chrome profile, enable WebGPU, and require an actual WebGPU backend. `CHROME_PATH` can override the default macOS Chrome executable. Each run writes a timestamped report to the temporary directory; `--out=/absolute/path/report.json` selects a new destination and refuses to overwrite it. The live test also saves a screenshot. Close other live GPU demos before the performance test: pausing the camera still runs the renderer.

## Evidence and remaining scope

The material test compares actual GPU output with independent integration of the original rational ray/plane shader. It uses 40 fixed pixels at three camera/density settings, including off-axis positions and rows within a few pixels of the horizon. Each reference pixel uses two independently shifted 65,536-sample Gaussian low-discrepancy sequences. Their disagreement is a convergence diagnostic, not a rigorous error bound.

On this test at 192 × 128, raw point shading has RMS errors 0.286, 0.316, and 0.333 in linear intensity. The integration path has RMS errors 0.00119, 0.000971, and 0.00120. These are selected-pixel measurements, not whole-image scores; 8-bit capture quantization and reference sequence differences of 0.00069–0.00122 RMS limit finer conclusions. Pixels whose source is sensitive to a 0.002-pixel shift stay in the quality measurement but are excluded from exact raw point-parity assertions, because the large mesh's float32 interpolation can move a binary boundary across the sample.

The live browser test checks synchronized source dimensions, nonblank images, repeatable raw and integration images at the same camera pose, camera/density changes, TAA accumulation while paused, history resets, and resize behavior. It also checks that resolved interiors of the baseline texture agree with the original checker's phase and colors, and exercises the pixel inspector through an actual canvas click, then closes it and resumes playback. These are integration gates; they do not claim that our method beats TAA on every pixel or motion.

The isolated performance test on Apple M4 / Chrome / Metal ran one method at a time, five warm frames and 15 measured frames at each fixed glide pose. Source hashes are recorded and checked unchanged. The following cells show **median GPU span / completed wall time**, in milliseconds, from the run that recorded every pass interval:

| Resolution and pose | No AA | Texture + TRAA | Integration |
|---|---:|---:|---:|
| 640 × 360, t = 0 | 0.95 / 1.80 | 0.40 / 2.50 | 4.10 / 5.40 |
| 640 × 360, t = 8 | 1.31 / 4.10 | 1.91 / 3.70 | 3.60 / 4.30 |
| 1920 × 1080, t = 0 | 0.81 / 2.00 | 1.83 / 3.40 | 7.14 / 8.00 |
| 1920 × 1080, t = 8 | 0.35 / 1.50 | 3.10 / 4.30 | 12.43 / 13.40 |

These short desktop measurements vary with scheduling and load; the raw timing's variation is itself visible in the table. The longest measured integration wall interval was 22.1 ms. This is a single-material frame cost, including its sky region, and leaves the rest of a game unpriced. It does not establish a sustained 60-fps game budget. Five warm frames also do not establish fully converged temporal image quality.

The timestamp distinction is measured, not hypothetical: one 1080p integration frame had pass intervals `[0, 6.899144]` and `[0.012709, 7.136466]` ms. Their sum is 14.022901 ms, while their elapsed GPU span is 7.136466 ms and the completed wall interval is 9.3 ms. All 180 measured GPU spans fit within their enclosing wall intervals. The benchmark reads the pinned Three r185 query pool only for this diagnostic; it neither edits the library nor changes the rendered method.

The captured reports are preserved byte-for-byte: [material accuracy](compare-evidence/materials-2026-09-05T18-34-02.950Z.json), [live UI and inspector](compare-evidence/live-2026-09-05T18-33-54.375Z.json), and [GPU intervals and completed timings](compare-evidence/performance-2026-09-05T18-35-43.958Z.json). The performance record includes the source hashes and all individual timestamp intervals. The material run followed the final character/box-pruning changes and exercised the same shader hash subsequently timed.

Still outstanding: a converged whole-image reference and error view in this harness, temporal error against per-frame references, explicit disocclusion/silhouette tests, sustained-frame and native game-engine timing, other materials, the general compiler emitter, and a native-engine comparison with current reconstruction systems. The immediate result is a working comparison surface on which those claims can now be tested visibly.

## Shared kernel integration gate

The third pane switches between **Projected edges + spectral**, **Shared projected coverage**, and **Shared lattice kernel**. Both shared choices directly import Claude's `OURS_KERNEL` from `demo/ours-kernel.wgsl.js`. The legacy adapter packs the exact period-normalized gradients/Hessians into `Jets`; the homography adapter passes the three normalized rows directly to `checkerMeanH`, period `1`, and variance `0.25`. Every path keeps the same center `(i + 0.5, j + 0.5)`, equal-parity checker, homography, linear intensities, camera, and Gaussian reference. Switching compiles the selected material, preserves the pose, clears its old timing samples, and leaves the temporal baseline intact. The default remains the original projected-edge path pending the equal-cost gate.

The legacy shared entry uses a joint Gaussian approximation of the counts for coverage and reduced-lattice enumeration for spectral terms. The new homography entry integrates the actual screen-space boundaries together within a guarded reach, then falls back to the lattice entry. Spectral enumeration is capped and its curvature model is local; these paths do not include exact depth conditioning or geometric silhouettes. The following older results describe the legacy entry; the newer float results below distinguish all three.

On the unchanged 120 reference probes, both rendered correctly and the shared kernel's separate float16 readback was finite and in range. The measured linear RMS values are:

| Camera and detail | No AA | Projected edges + spectral | Shared lattice |
|---|---:|---:|---:|
| Glide, t = 0, detail 1 | 0.286487 | 0.001188 | 0.001739 |
| Glide, t = 8, detail 1 | 0.316269 | 0.000971 | 0.001775 |
| Approach, t = 4, detail 2 | 0.333108 | 0.001204 | 0.001759 |

These selected-pixel values use the original 8-bit linear capture protocol; differences near one quantization step or the sampled-reference disagreement do not establish a fine ranking. A more diagnostic foreground case is `(143,64)` at glide t = 0: reference `0.159754295`, sequence disagreement `0.000012131`, projected-edge output `0.160784314`, shared-kernel output `0.164705882`. Its center is `(143.5,64.5)`. The unchanged report retains every pixel, including these losses; the next investigation is the coverage model rather than a visual declaration of a winner.

Evidence: [final shared material gate](compare-evidence/shared-materials-2026-09-05T19-29-17.887Z.json) and [live switching, controls, and inspector](compare-evidence/shared-live-2026-09-05T19-29-01.042Z.json). The earlier reports sent to Claude are retained as well. The final material run reproduces the values exactly and additionally records which resolved parity classes the fixed probes actually cover (one dark interior, no fully resolved light interior). Material and performance runners hash the source before rendering and reject changes during a run, avoiding a cached browser module being attributed to newer code on disk. The original RGBA8 errors remain comparable; a separate RGBA16Float pass checks the shared output for nonfinite values and clipping that the byte target could hide.

The [shared timing run](compare-evidence/shared-performance-2026-09-05T19-30-51.298Z.json) measures one method at a time in the test, with the same five warm frames and 15 measured frames per case. These cells are **median GPU span / completed wall time** in milliseconds:

| Resolution and pose | No AA | Texture + TRAA | Projected edges + spectral | Shared lattice |
|---|---:|---:|---:|---:|
| 640 × 360, t = 0 | 9.07 / 10.00 | 4.38 / 7.50 | 8.63 / 9.80 | 10.43 / 11.80 |
| 640 × 360, t = 8 | 9.46 / 10.30 | 4.99 / 9.30 | 8.59 / 9.90 | 10.34 / 11.50 |
| 1920 × 1080, t = 0 | 5.46 / 8.00 | 10.52 / 13.90 | 12.18 / 13.50 | 24.16 / 25.30 |
| 1920 × 1080, t = 8 | 5.05 / 6.10 | 4.80 / 8.40 | 13.22 / 13.90 | 22.96 / 24.10 |

Desktop contention and scheduling are substantial in this run: even the 1080p raw arm spans 2–12.4 ms of completed wall time. Claude stopped its demo and GPU benchmarking during the window, and this final run followed completion of the app build, but other desktop processes were not controlled. These are measured observations under load, not stable intrinsic shader costs or a native game budget. The shared kernel has not demonstrated the agreed accuracy-at-equal-or-lower-cost replacement gate; both choices remain available and the default is unchanged.

The timing audit now resolves each query set **once** through Three, then copies those same already-resolved bytes to compute the diagnostic intervals and elapsed span. The earlier double-resolution consistency assertion failed on one run; it did not identify a rendering failure or establish a driver cause. The revised 240 samples all pass the same-byte sum and enclosing-wall checks. Each case is saved before validation, including raw timestamp pairs and discrepancy fields, so future failures retain evidence instead of discarding the run. The application still labels its public accumulator **GPU pass sum**.

The measured shared source included Claude's then-uncommitted coverage/spectral timing entry points. Its exact [source snapshot](compare-evidence/shared-kernel-ddf4253d909f1a1a80696f21f440d9185b313f01f3dac91098c85a9da0d552cc.txt) is archived as inert text with the matching SHA-256, so subsequent kernel edits cannot erase the version behind these measurements. It is evidence only; the application imports the live shared module in `demo/`.

## Homography coverage and full-precision capture

The shared homography entry from `64f51cd` passes both the common scene adapter and a separate direct-GPU geometry gate. The material capture now reads all three filtered arms through an **RGBA32Float** linear render target, while retaining every older RGBA8 column. It probes render/copy support and records an explicit RGBA16Float fallback if needed; this machine used RGBA32Float throughout. Float captures are checked for finite values, range, and alpha before the error summaries.

On the unchanged 120 pixels and unchanged independent source references, the float linear RMS errors are:

| Camera and detail | Projected edges + spectral | Shared lattice | Shared projected coverage |
|---|---:|---:|---:|
| Glide, t = 0, detail 1 | 0.000456425 | 0.001214472 | 0.000453654 |
| Glide, t = 8, detail 1 | 0.000247171 | 0.001341799 | 0.000247884 |
| Approach, t = 4, detail 2 | 0.000517341 | 0.001189048 | 0.000517277 |

The new path removes the visible legacy coverage loss and agrees closely with the original projected-edge implementation. At the earlier failure `(143,64)`, its float output is `0.159694850`, versus `0.163028076` for legacy lattice and reference `0.159754295`. Full precision removes the byte readback floor; it does **not** improve the reference, whose sequence disagreement remains 0.00069–0.00122 RMS. The small aggregate differences between the two projected-geometry paths are not evidence of a winner. No new performance comparison was run while the user's Unreal editor was active.

The separate direct-GPU gate writes Float32 storage buffers, bypassing Three materials and render-target conversion. All **100 cases** pass: checker quadrants, translations by ±64 periods, normal-CDF single edges, correlated corners through `|rho| = 0.99995`, and global homography sign/scale invariance for checker and circle footprints. Perspective-only fixtures test invariance, not exact source accuracy. The circle regression independently integrates conditional intervals of the repeated-disc source. It catches the old 3-sigma cell omission (about `1.09e-5` missing coverage), requires the coverage regime, and now measures `0.8579739332` against `0.8579739017`, within its `3e-6` tolerance. The reference uses an approximate CDF; its very small Simpson refinement delta does not certify that CDF approximation.

Evidence: [direct GPU fixtures](compare-evidence/homography-2026-09-05T19-58-05.274Z.json), [float material errors](compare-evidence/homography-materials-2026-09-05T19-58-06.001Z.json), and [live switching and inspector](compare-evidence/homography-live-2026-09-05T19-58-08.655Z.json) with [capture](compare-evidence/homography-live-2026-09-05T19-58-08.655Z.png). Material and fixture runs verified unchanged hashes. The tested [shared source](compare-evidence/shared-kernel-8bfc894a3641890459d5dd64069acdccfc3470de47799cade39dc5972220d6b6.txt) is archived as inert evidence; live rendering still imports the author-owned module.

The isolated [Unreal project](../native/README.md) now supplies the matched source and three fixed camera poses for raw AA and actual TSR. Its asset generation is separate from rendering validation. Native shader compilation, linear output agreement, controlled temporal history and motion, and completed-frame performance remain required before presenting it as the requested gaming comparison. Claude owns the HLSL port from the shared generator; Codex owns its host and independent gates.
