# Moving native comparison

The new live maps run through Unreal's ordinary game loop, with camera autoplay and an eight-second replay. They use the same procedural source and trajectory for raw, TSR and analytic. The analytic material now follows the actual perspective view; its camera rows are no longer baked into the shader.

The [first native-window observation](../evidence/live-20260905T211457.738570Z-analytic-glide/observation.json) shows the analytic pattern rendering cleanly while the camera moves. This is a visual runtime check, not a numerical image score or frame-rate measurement. The initial default player object is now hidden by the launcher's game-mode selection.

The separate [ordinary-game capture workflow](viewport_diagnosis.md) now supplies matched raw/TSR/analytic stills at rest and after motion history. Open the [gallery](../comparison.html). The fixed and moving images pass dense original-ray registration at 885/885 and 879/879 positions respectively. After motion, the sequence pauses for one readback frame; this does not establish uninterrupted temporal behavior. The [independent scores and residuals](../evidence/game-quality-20260905T212821544Z/integration-notes.md) document the Gaussian target, display precision and remaining numerical error.

## Prepare and launch

First generate the fixed scene and stage the shared kernel as described in [the native setup](../README.md). Then run each new generator using the same project and Python commandlet arguments as `bootstrap.py`, with `-nullrhi`:

1. `Scripts/bootstrap_motion.py` creates camera-following materials and separate motion maps.
2. `Scripts/prepare_motion.py` creates the matched camera sequences.
3. `Scripts/prepare_live.py` creates separate live maps with persistent autoplay actors.

The fixed-pose materials, maps and sequences remain controls. Every generator checks ownership and records source/control hashes; generated assets remain outside version control.

From the repository, inspect a plan or open a bounded live window:

```sh
python3 native/tools/launch_live.py --arm analytic --path glide
python3 native/tools/launch_live.py --run --arm analytic --path glide --seconds 120
python3 native/tools/launch_live.py --run --arm raw --path glide --seconds 120
python3 native/tools/launch_live.py --run --arm tsr --path glide --seconds 120
```

`--path approach` selects the second trajectory and detail level. The default viewport is 1920×1080; `--width 640 --height 360` is useful for an initial smoke check. The runner opens the real `UnrealEditor.app` game window, records the owned process and stops only that process at its requested lifetime. `--offscreen` uses the command-line executable for ordinary-game smoke/profiler work; it never selects the failing offscreen composition-graph capture protocol.

Raw/TSR select the same live raw map; AA is 0/4, with 100% input/output resolution, 200% TSR history and dynamic resolution disabled. Analytic has AA off. The selected `MoviePipelineGameMode` only puts the controller in cinematic mode to hide its pawn/HUD and prevent manual movement. No MRQ executor, movie-capture clock, or offline view family is introduced by that game mode.

Autoplay begins independently in each process. Separate live windows are therefore **not synchronized side-by-side**. Matched sequence captures provide corresponding frames; a synchronized native presentation remains a separate integration step. Replay deliberately cuts from t=8 back to t=0. Correct temporal-history reset at that cut still needs a rendering gate.

## Camera-following material

For the planar perspective scene, `q=(WorldPosition.y,-WorldPosition.x)/periodCm` is the source count and `w=1/PixelDepth` is reciprocal linear view depth. Both `q*w` and `w` are affine in raster coordinates. Their derivatives recover the homography directly. The material centers it at the shaded pixel and normalizes the three rows together before calling the shared kernel with period 1 and variance 0.25. Derivatives are evaluated before any filtering branch.

The [independent geometry check](../evidence/dynamic-homography-20260905T205748.185542Z/README.md) exercises 758 quads across camera poses, aspect ratios and jitter. The ordinary-family per-operation float32 discrepancy stays below 0.000161 checker periods. This is not a universal bound: orthographic cameras, large world coordinates, silhouettes and near-horizon cancellation require additional treatment. The actual material's [eight standalone compiler jobs](../evidence/compile-material-20260905T205842.364084Z/report.json) pass DXIL and SPIR-V; the native-window observation additionally exercises Metal rendering.

Declined/exhausted kernel work appears magenta in the new material. Invalid inputs appear red. Separate regime materials are generated for diagnostics. Such pixels must be counted in validation rather than silently treated as complete integrals.

## Motion and timing limits

The [motion sequence gate](../evidence/motion-prepare-20260905T210255.471500Z/sequence-report.json) verifies 481 exact keys at 60 Hz, all 480 rendered-frame camera transforms, and five seek/reset positions. Raw and analytic evaluated-transform hashes match for each trajectory. Unreal's component cache can retain a rotation within about 0.0001 degrees of the mathematical key; the report measures that discrepancy rather than modifying the engine or loosening key accuracy.

The [live-map gate](../evidence/live-prepare-20260905T210929.504003Z/live-report.json) reloads all four saved maps and verifies autoplay, infinite replay and binding exclusively to each map's own camera. Serialized settings alone do not establish runtime history behavior.

`launch_live.py --profile-frames N` optionally collects Unreal's boot CSV and exits after it completes. It includes startup and warm-up, uses the normal variable game clock and does not align camera poses across separate processes. The runner retains raw data with `performance_verified=false`. A controlled whole-frame timing protocol must select valid steady-state frames, account for CPU/GPU contention and report camera/time settings before quoting a gaming frame budget.
