# Native MRQ quality capture

This is the working offscreen still-image route for the isolated `native/Unreal/MoireComparison` project. It uses Unreal **5.8.2**, Metal SM6, Movie Render Queue's deferred pass, and actual native TSR in the TSR arm. It launches a separate `UnrealEditor-Cmd -game -RenderOffScreen` process and does not connect to an existing editor.

These captures establish native image output and settled-pose quality. MRQ constructs its own view family and marks it `bIsOfflineRender=true`. Capture duration, startup time, and MRQ's warm-up loop are **not main-game real-time performance measurements**. Motion, disocclusion, cold history, and game-frame GPU timings remain separate tests.

## Reproduce

First prepare the isolated maps/materials as described in [the native setup](../README.md). The project must enable PythonScriptPlugin, EditorScriptingUtilities, SequencerScripting, and MovieRenderPipeline for the editor target. From the repository root:

```sh
# Create fixed-camera sequences, then nine MRQ presets, using NullRHI only.
python3 native/tools/capture_native.py --prepare
python3 native/tools/capture_mrq.py --prepare

# Inspect the command without starting a renderer.
python3 native/tools/capture_mrq.py --arm raw --pose Glide0

# Run serially, with other GPU tests stopped.
python3 native/tools/capture_mrq.py --render --arm raw --pose Glide0 --timeout 600
python3 native/tools/capture_mrq.py --render --arm tsr --pose Glide0 --timeout 600
python3 native/tools/capture_mrq.py --render --arm analytic --pose Glide0 --timeout 600
```

Preparation creates a unique preset namespace and output directory; it does not alter source maps or sequences. `--pose` also accepts `Glide8` and `Approach4`; those presets are prepared but have not been captured in the evidence below. `--prepared /absolute/path/to/prepare-mrq-<timestamp>.json` pins a specific batch. Otherwise the latest successful preparation is selected. Used output directories cannot be reused: prepare a new batch for another run. Changed map, sequence, or preset hashes are rejected. Use `--engine` to select another installed engine; the default is `/Users/Shared/Epic Games/UE_5.8`.

## Fixed contract

All three arms use the same camera pose, 50-degree vertical FOV, checker period, source colors, and **640×360** output. Raw/TSR share the point-material map; analytic uses its matching `_Analytic` map and the shared HLSL homography kernel with pixel variance `S=0.25`.

- One output frame, sequence frame **64**, from the half-open range `[64,65)` at a fixed 60 Hz sequence rate.
- **One spatial sample and one temporal sample**, one tile, no MRQ supersampling. Native TSR retains its own temporal jitter and history reconstruction.
- **64 discarded render warm-up samples** at the fixed first pose. MRQ uses sample indices 0–63 and forces one setup engine tick; this is not 64 moving game frames.
- AA method None / TSR / None; AA quality 3; input/output screen percentage 100; dynamic resolution off; declared TSR history percentage 200.
- Cinematic scalability overrides off. Motion blur, depth of field, bloom, exposure adaptation, and lens effects off. The tone curve is disabled; `r.Tonemapper.Quality=0` removes vignette and grain. Deferred-pass `disable_multisample_effects` remains false because enabling it would also disable TSR.

Each execution saves its command, engine version, settings, before/after source hashes, output hashes, and extracted diagnostics under `native/evidence/mrq-*`. PNGs are copied into the capture's `frames/` directory. Validation requires one correctly numbered 640×360 PNG, successful exit, stable sources, and no detected shader/render failure. `captured-pipeline-verification-pending` means artifact checks passed; independent source/image analysis is still required. PNG readback has 8-bit quantization and dither.

## Preserved results

The corrected batch has identical common source hashes, preset batch, and camera pose: [batch manifest](../evidence/mrq-prepare-20260905T203352.265013Z/capture-batch.json).

| Arm | Corrected frame |
| --- | --- |
| Raw | [raw_Glide0.0064.png](../evidence/mrq-capture-20260905T203404.322055Z-raw-Glide0/frames/raw_Glide0.0064.png) |
| TSR | [tsr_Glide0.0064.png](../evidence/mrq-capture-20260905T203440.239836Z-tsr-Glide0/frames/tsr_Glide0.0064.png) |
| Analytic | [analytic_Glide0.0064.png](../evidence/mrq-capture-20260905T203502.965788Z-analytic-Glide0/frames/analytic_Glide0.0064.png) |

The [raw color calibration](../evidence/mrq-capture-20260905T203404.322055Z-raw-Glide0/pixel-calibration.json) checks all 230,400 pixels against the three defined source colors after standard linear-to-sRGB conversion. Every pixel is within one byte of the rounded expected source palette, with spatial ranges of at most one byte per channel. The maximum distance to the unrounded sRGB value is 1.05028 bytes. This establishes flat colors within output precision, not sub-byte accuracy or checker-phase correctness.

The [initial MRQ raw result](../evidence/mrq-capture-20260905T203213.567190Z-raw-Glide0/report.json) remains preserved with its visible default vignette. The separate [ordinary viewport capture failure](capture-native.md) also remains intact. Neither is substituted for a corrected comparison arm.

Implementation was checked against installed engine source: `MovieRenderPipelineCommandLine.cpp` loads the primary preset and in-process executor; `MoviePipelineRendering.cpp` controls sample counts, warm-up, and camera cuts; `MoviePipelineImagePassBase.cpp` selects native TSR and marks the offline view family. `SceneView.cpp` clears vignette and grain when tonemapper quality is zero.
