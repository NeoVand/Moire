# Native Unreal comparison

This is an isolated **content-only Unreal 5.8.2 project** with a matched point source, actual Unreal TSR configuration, and the shared analytic HLSL material. Six maps, six materials and six camera sequences have been generated successfully. Shader bodies pass standalone DXC compilation; actual captured images and Metal execution are separate gates. The user's existing Unreal project and engine installation are not edited.

Start with [the controlled viewport capture workflow](tools/capture-native.md). The first target is one still pose per method at 640×360, then the other fixed poses. Motion replay, disocclusion and native performance remain later checks. Offline capture frame stepping is not evidence of sustained real-time throughput.

The first Mac offscreen viewport run initialized Metal SM6, finished shader compilation and stepped through the requested frame, but delivered no PNG. Its [failure record](evidence/capture-20260905T202331.609258Z-raw-Glide0/diagnosis.json) is preserved. That viewport readback route is not currently verified; a separate native render-target capture is being prepared. No native image is claimed from the failed run.

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

The analytic [Custom Material Expression](https://dev.epicgames.com/documentation/unreal-engine/custom-material-expressions-in-unreal-engine?lang=en-US) receives `ViewportUV` and `ViewSize`. Its normalized homography rows divide their XY coefficients by the actual dimensions, and `ViewportUV × ViewSize` supplies the pixel center without another half-pixel shift. Counts are already period-normalized, so the kernel receives period 1. Rows are fixed to the map's camera; moving the camera requires updating them.

The native TSR arm consumes the same procedural source as native raw. The browser baseline consumes a mipmapped checker with anisotropic filtering plus Three TRAA. These are distinct pipelines; their scores cannot be interchanged. A native mipmapped/anisotropic arm remains a useful additional comparison once this matched-source gate works.

The shared kernel returns regime 4 for declined or exhausted work. Current material adapters display the value component and do not yet measure unsupported-pixel coverage. A flagged partial or declined value is not a certified integral. Whole-image error and unsupported-region diagnostics remain required.

## Capturing and interpreting results

```sh
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_native.py --arm raw --pose Glide0 --render
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_native.py --arm tsr --pose Glide0 --render
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/capture_native.py --arm analytic --pose Glide0 --render
```

Run one method at a time. The runner uses the actual game viewport through Unreal's automated LevelSequence capture, with one spatial sample and one temporal sample per frame, no tiling, 64 warm-up frame steps, and the saved frame explicitly identified. It retains process status, dimensions, source hashes, requested and logged console settings, shader errors and images. It does not silently treat process success as pipeline verification. No rendering measurements should be called performance while other editors or GPU jobs are active.

Unlit emission, disabled exposure, `r.EyeAdaptation.PreExposureOverride=1`, and the `ShowFlag.Tonemapper 0` console command request a simple output path. They do not prove equality with Three's linear-to-sRGB output. PNGs are viewport output, not linear measurements. Before scoring, verify the transfer function and known dark/light/sky values or obtain a linear render-target readback. Also check actual content dimensions, camera activation, horizon, off-axis phase, active Metal shader platform and effective AA mode.

The existing material reference excludes the outer plane edge and a three-pixel band at the geometric horizon. Do not infer silhouette or sky accuracy from its scores. The fixed scenes do not yet test motion, history recovery after cuts, disocclusion, or gameplay. Capture warm-up frame counts describe sequence stepping; verify the actual temporal-history state before claiming an exact TSR history age.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 native/check_preparation.py
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_hlsl.py --spirv
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_material.py
```

The static checks compare 135 independent off-axis ground rays and 90 sky rays across three poses and three aspect ratios, plus camera/count/phase/FOV fixtures. [Compiler validation](tools/README.md) runs the real installed DXC library: checker/circles, compute/pixel, DXIL/SPIR-V; the exact material bodies also compile under macro and duplicate-include checks. A known-invalid shader must fail. DXIL is unsigned because the signing library is absent. Neither DXIL nor SPIR-V acceptance proves Metal execution or image quality.

The installed Unreal 5.8 source was used to verify `/Project` mapping, Custom Material includes, viewport UV/size outputs, editor asset APIs, camera activation, AA method identifiers and Metal TSR support. Each evidence bundle records the tested bytes and actual execution scope. Failed attempts are retained alongside successful runs.
