# Native Unreal comparison

This is an isolated **content-only Unreal 5.8.2 project** with a matched point source, actual Unreal TSR configuration, and the shared analytic HLSL material. The [comparison gallery](comparison.html) now shows clean ordinary-game Metal captures at rest and while the camera keeps moving. The user's existing Unreal project and engine installation are not edited.

The [moving native workflow](tools/live.md) supplies camera-following materials, matched sequences and autoplay maps. The analytic pattern has been observed moving in a normal Unreal game window. The latest triplet keeps playback running through readback. Raw pixels uniquely identify the saved time, with matching camera and capture timing in the other arms. Trajectory-wide temporal quality, synchronized native presentation, replay-history checks and controlled frame timing remain pending.

Use the working [ordinary-game screenshot workflow](tools/viewport_diagnosis.md) for new captures. It uses plain `Shot` from a real game window at 640×360, with identical source and display settings across arms. The earlier [Movie Render Queue workflow](tools/capture-mrq.md) and [MRQ gallery](comparison-mrq.html) remain as separate controls. MRQ creates an offline view family. Neither capture duration nor screenshot writing time measures sustained real-time throughput.

The original FrameGrabber route delivered no PNG, including in a real window. Its [failure record](evidence/capture-20260905T202331.609258Z-raw-Glide0/diagnosis.json) is preserved. A subsequent offscreen composition experiment produced contaminated pixels and opened crash-report windows despite unattended mode; that route is disabled. The successful plain `Shot` path bypasses those dependencies and all six accepted runs exit without ensures.

## Reproduce the project

From the repository:

```sh
node native/Unreal/MoireComparison/Scripts/stage_kernel.mjs

"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" \
  "/Users/neo/repos/Moire/native/Unreal/MoireComparison/MoireComparison.uproject" \
  -run=pythonscript \
  -script="/Users/neo/repos/Moire/native/Unreal/MoireComparison/Scripts/bootstrap.py" \
  -unattended -nop4 -nosplash -nullrhi

PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_native.py --prepare
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_mrq.py --prepare
```

The first command stages the author-owned HLSL for Unreal's existing `/Project` shader mapping. Generated includes and assets are ignored; the generators are the source of truth. The stage adds namespace isolation and checks source/generator/output hashes, without changing the mathematics. Start Unreal after staging a settled author handoff. Restage and restart after a kernel change so cached includes cannot be attributed to newer code.

The bootstrap refuses the wrong project, writes only `/Game/MoireComparison`, and replaces only generator-tagged materials/maps and generator-prefixed actors. Put manual work outside that generated package tree. A partially failed first creation may leave an untagged package; inspect it before trying again. AndroidFileServer is explicitly disabled to prevent unrelated generated server configuration. The sequence preparer separately tags its assets and verifies that source maps remain unchanged.

`NullRHI` creates assets without rendering. The [six-map bootstrap](evidence/compile-native-material-bootstrap-20260905T201802.877543Z/run.json) and [sequence preparation](evidence/capture-prepare-20260905T202250.332646Z/report.json) completed with clean exits. This exercises the actual editor bindings and material connections, but does not compile a Metal runtime material or verify native pixels.

## Methods and scene contract

| Item | Contract |
|---|---|
| Point maps | `Glide0`, `Glide8`, `Approach4` |
| Analytic maps | Same names with `_Analytic` appended |
| Raw | Procedural point shader; Unreal AA method 0 |
| TSR | Same procedural shader; actual Unreal AA method 4; input/output at 100%; history at 200% |
| Analytic | Shared `checkerMeanH`; AA disabled; Gaussian variance 0.25 device pixels² |
| Camera poses | Glide t=0; glide t=8; approach t=4 with detail=2 |
| Coordinates | Three `(x,y,z)` → Unreal `(-z,x,y) × 100` cm |
| Checker counts | `u = UE.Y / (100 × period)`, `v = -UE.X / (100 × period)` |
| Period | `4/detail` Three world units; two half-period squares per axis |
| White predicate | The two `fract(count) >= 0.5` predicates are equal |
| Linear dark / light | `0.025 / 0.82` |
| Linear sky | `(0.105, 0.13, 0.16)` |
| Ground | XY plane, Z=0, width 10,000,000 cm |
| Camera height | 1,200 cm |
| Projection | 50° vertical; 79.316878520382° horizontal at constrained 16:9 |

The engine plane's bounds are measured before scaling. A constant unlit sphere supplies the sky. Lights, Lumen, reflections, ray tracing, fog, motion blur and automatic exposure are disabled in the prepared scene. Native point shading differs from the browser's sign-of-sine convention exactly on a discontinuity; nearby stable points and filtered references are checked separately.

The original fixed-pose analytic [Custom Material Expression](https://dev.epicgames.com/documentation/unreal-engine/custom-material-expressions-in-unreal-engine?lang=en-US) receives `ViewportUV` and `ViewSize`. Its normalized homography rows divide their XY coefficients by the actual dimensions, and `ViewportUV × ViewSize` supplies the pixel center without another half-pixel shift. Counts are already period-normalized, so the kernel receives period 1. These fixed materials remain controls. The separate motion materials derive the homography from actual world position, linear view depth and raster derivatives; their construction and precision limits are in [the moving workflow](tools/live.md).

The native TSR arm consumes the same procedural source as native raw. The browser baseline consumes a mipmapped checker with anisotropic filtering plus Three TRAA. These are distinct pipelines; their scores cannot be interchanged. A native mipmapped/anisotropic arm remains a useful additional comparison once this matched-source gate works.

The shared kernel returns regime 4 for declined or exhausted work. Fixed adapters still display its value component; the new motion adapter instead marks that regime magenta, and invalid inputs red. Separate regime materials are also generated. A flagged partial or declined value is not a certified integral. Whole-image error and unsupported-region counts remain required.

## Ordinary-game image checks

The [fixed-camera report](evidence/game-quality-20260905T212821544Z/README.md) and [after-motion report](evidence/game-quality-20260905T212756753Z/README.md) use the original ray/checker source, not the analytic approximation. All 230,400 raw pixels pass palette calibration. Dense raw registration passes 885/885 positions at rest and 879/879 at t=2 seconds; all 54 predetermined Gaussian quality probes remain in each report.

| Linear RGB RMSE against the Gaussian target | At rest | After motion history |
| --- | ---: | ---: |
| No AA | 0.267730 | 0.279330 |
| Unreal TSR | 0.113363 | 0.098215 |
| Analytic | 0.004138 | 0.004817 |

These ordinary-game PNGs use a recorded power gamma of 2.2, unlike the earlier MRQ sRGB images. Calibration checks three source colors; it does not establish an arbitrary continuous transfer bound. Small analytic residuals remain beyond the unchanged display-code allowance, including channel-dependent output differences. The [precision notes](evidence/game-quality-20260905T212821544Z/integration-notes.md) retain those failures and reference-convergence limits. TSR uses its own reconstruction filter, so the Gaussian-target scores are a diagnostic, not an overall AA ranking.

The moving sequences play continuously to frame 120, then pause for one additional stationary readback frame. Matching recorded cameras, sequence times and independent raw registration establish corresponding after-motion stills. They do not yet establish uninterrupted temporal quality, cut recovery or frame rate. Open the original PNGs in the gallery to avoid browser scaling of fine detail.

The newer [uninterrupted capture report](evidence/game-quality-20260905T221241048Z/README.md) removes that pause. A request at sequence frame 120 saves the next game frame, at 2.016666774 seconds. Dense raw registration passes 876/876 points at that time; neighboring frames disagree. All three runs keep playing through frame 123, with matching camera/time observations and no cut, skip or ensure. Raw pixels independently identify time; the filtered arms inherit it through matching readback phase and observed camera metadata.

All 54 quality probes remain. Linear RGB RMSE is 0.279080 / 0.0961393 / 0.00433559 for raw / TSR / analytic, with a maximum analytic residual of 0.00229292 beyond the unchanged display-code allowance. These are selected-pixel, filter-specific results for one genuinely moving frame, not a temporal-error curve or performance measurement. The gallery now uses this newer triplet; the held-frame controls above remain archived.

The next integration step is the [synchronized native viewport](tools/synchronized-view-design.md), followed by a combined filtered-shading + TSR arm and native whole-frame timing. The source investigation identifies a project-local runtime plugin route; that plugin has not yet been built.

## Earlier MRQ controls

```sh
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_mrq.py --arm raw --pose Glide0 --render
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_mrq.py --arm tsr --pose Glide0 --render
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_mrq.py --arm analytic --pose Glide0 --render
```

Run one method at a time from the same prepared batch. The runner records actual source hashes, camera assets, settings, process status, dimensions, shader errors and images. It requires a correctly numbered frame rather than treating process success as a successful capture. The [matched batch](evidence/mrq-prepare-20260905T203352.265013Z/capture-batch.json) has one spatial sample, one temporal sample, 64 discarded render warm-ups, and one saved frame numbered 64. TSR retains its native jitter. Those warm-ups are renders at a fixed pose, not 64 moving game frames.

The first MRQ image exposed a default vignette. The corrected batch disables it with `r.Tonemapper.Quality=0`; exposure, tone curve and other post effects are also disabled. All 230,400 raw pixels lie within one byte of the rounded expected dark/light/sky palette, with at most one byte of spatial spread per channel. The maximum distance to the unrounded standard sRGB value is 1.05028 bytes. This calibration establishes the flat-color transfer within output precision; it does not certify sub-byte accuracy. The initial vignette image is preserved alongside the corrected result.

The [independent CPU image check](evidence/quality-20260905T204627830Z/README.md) retains all 54 predetermined off-axis pixels. Stable raw point parity matches at 47/47 positions. Against two 65,536-sample Gaussian references, linear RGB RMS is 0.271281 for raw, 0.113124 for TSR and 0.00215019 for analytic. All analytic channels fit the palette-derived PNG allowance; this does not establish zero shader error or a continuous transfer bound. The largest reference-sequence disagreement is 0.00156487 and is not an error bound. The CPU runner also passes from a relocated evidence tree with no generated Unreal assets.

The archived MRQ gallery uses the original PNGs. Image scaling in a browser can change their apparent fine detail; open each image at its native size. Quantized sRGB PNG readback is not a float linear render target. Our reference filter has Gaussian sigma 0.5 pixel, while TSR uses its own reconstruction filter. Errors against that reference are diagnostic and do not alone establish an overall quality ranking.

The existing references exclude the outer plane edge and a three-pixel band at the geometric horizon. Do not infer silhouette or sky accuracy from their scores. The fixed scenes do not test motion, history recovery after cuts, disocclusion, or gameplay. The new camera-following version supplies matched trajectories and marks unsupported regimes, while uninterrupted motion, whole-image regime counts and uncontended whole-frame timing remain open gates.

## Verification

```sh
node native/tools/compare_mrq.mjs
PYTHONDONTWRITEBYTECODE=1 python3 native/check_preparation.py
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_hlsl.py --spirv
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_material.py
```

The static checks compare 135 independent off-axis ground rays and 90 sky rays across three poses and three aspect ratios, plus camera/count/phase/FOV fixtures. [Compiler validation](tools/README.md) runs the real installed DXC library: checker/circles, compute/pixel, DXIL/SPIR-V; the exact material bodies also compile under macro and duplicate-include checks. A known-invalid shader must fail. DXIL is unsigned because the signing library is absent. Neither DXIL nor SPIR-V acceptance proves Metal execution or image quality.

The installed Unreal 5.8 source was used to verify `/Project` mapping, Custom Material includes, viewport UV/size outputs, editor asset APIs, camera activation, AA method identifiers and Metal TSR support. Each evidence bundle records the tested bytes and actual execution scope. Failed attempts are retained alongside successful runs.
