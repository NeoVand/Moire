# Ordinary game viewport capture and readback diagnosis

Status: **plain `Shot` from a real game window succeeds**, including raw, native TSR, and the analytic material at both a fixed camera and after camera motion. The original FrameGrabber and offscreen composition attempts remain preserved as failures. Offscreen rendering through this diagnostic is now refused because its null-window ensures launched crash-report windows despite `-unattended`; those were an unacceptable user-visible side effect, not harmless log messages.

## Reproduce the successful route

```sh
# Inspect the plan without launching an application.
python3 native/tools/viewport_diagnosis.py --windowed --shot --arm raw --pose Glide0

# Run arms serially when the shared GPU is free; substitute tsr or analytic.
python3 native/tools/viewport_diagnosis.py --render --windowed --shot --arm raw --pose Glide0 --timeout 120

# Camera-following material gate, after motion history at t=2 seconds.
python3 native/tools/viewport_diagnosis.py --render --windowed --shot --motion --frame 120 --arm analytic --pose Glide0 --timeout 120
```

The runner launches the installed application's actual `UnrealEditor.app/Contents/MacOS/UnrealEditor` binary in `-game`, with a real 640×360 window in the isolated project. A map-URL override selects `MoviePipelineGameMode`; that class's `BeginPlay` only enables cinematic mode to hide the default pawn/HUD and disable manual input. It does not start MRQ or replace the renderer or clock. This capture invocation uses a fixed 1/60-second simulation step; the separate interactive live launcher keeps its normal clock.

`viewport_diagnosis_shot.py` runs through the installed runtime `py` console command (`PythonScriptPlugin.cpp:1057–1072`). It resolves the actual runtime world by exact package path and waits on Slate post-ticks. It does not use an editor-only world accessor. Plain `Shot filename=… -nosuffix` calls `FScreenshotRequest::RequestScreenshot` in `GameViewportClient.cpp:4284–4305`, then the ordinary viewport's screenshot processing reads its existing output. No custom capture protocol, postprocess copy material, high-resolution screenshot, SceneCapture view, MRQ executor, or added supersampling is involved. The file's completion triggers a quit command in this owned process only.

Settings are matched across arms: 640×360, AA None/TSR/None, anti-aliasing quality 3, input screen percentage 100, TSR history percentage 200, and explicit display gamma 2.2. The gamma-only tonemapper and standard screenshot readback produce calibrated 8-bit RGBA PNGs. Every successful run records the exact command, queried CVars, camera, PNG depth/type, process PID, source hashes before/after, and a copy of its preparation JSON. Any ensure, shader error, failed callback, missing frame, or changed source prevents a successful capture status. Pixel validation remains a separate gate.

### Fixed controls

| Arm | Report | Image |
| --- | --- | --- |
| Raw | [212312.706151Z](../evidence/viewport-diagnosis-20260905T212312.706151Z-raw-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T212312.706151Z-raw-Glide0/frames/raw_Glide0.0064.png) |
| TSR | [212352.013770Z](../evidence/viewport-diagnosis-20260905T212352.013770Z-tsr-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T212352.013770Z-tsr-Glide0/frames/tsr_Glide0.0064.png) |
| Analytic | [212408.788462Z](../evidence/viewport-diagnosis-20260905T212408.788462Z-analytic-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T212408.788462Z-analytic-Glide0/frames/analytic_Glide0.0064.png) |

The fixed camera stays unchanged throughout 64 warmup ticks. Shot is requested at engine frame 64 and completes at 65. The filename's 64 is a warmup label, not a claim that a sequence is playing. All three runs have matching frozen script hashes, no ensures, and stable source files. The independent [fixed quality report](../evidence/game-quality-20260905T212821544Z/report.json) confirms the raw palette over all 230,400 pixels and original-ray registration at 885/885 test points.

### After camera motion

| Arm | Report | Image |
| --- | --- | --- |
| Raw | [212612.895862Z](../evidence/viewport-diagnosis-20260905T212612.895862Z-raw-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T212612.895862Z-raw-Glide0/frames/raw_Glide0.0120.png) |
| TSR | [212647.625707Z](../evidence/viewport-diagnosis-20260905T212647.625707Z-tsr-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T212647.625707Z-tsr-Glide0/frames/tsr_Glide0.0120.png) |
| Dynamic analytic | [212630.590287Z](../evidence/viewport-diagnosis-20260905T212630.590287Z-analytic-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T212630.590287Z-analytic-Glide0/frames/analytic_Glide0.0120.png) |

These runs use the verified `MotionSequences` assets and, for analytic, the camera-following `Glide0_MotionAnalytic` map. The helper seeks once to frame 55, then **plays continuously** to 120. There are no per-frame jumps, manual camera updates, or final corrective seeks. An overshoot fails the run. At frame 120 it pauses the sequence, requests Shot, and records camera/sequence time again when the file completes. Both records in every arm agree at frame 120 + 2.384185791015625e-7 subframe at 60 Hz, with identical camera transforms. This is t=2 seconds within floating-point time precision. Dense raw registration independently passes 879/879 points.

The independent [motion quality report](../evidence/game-quality-20260905T212756753Z/report.json) confirms matching source, transfer, time, and camera; all 54 quality samples are retained. The final screenshot includes **one additional stationary render frame after motion history** (request engine 66, completion 67). This is an explicit image-quality and camera-following gate, not an uninterrupted motion sequence, a temporal-artifact score, or a game frame-rate measurement. Neither capture wall time nor PNG writing time measures algorithm GPU cost.

The first otherwise clean Shot attempt is [preserved](../evidence/viewport-diagnosis-20260905T212232.686005Z-raw-Glide0/report.json): an incorrectly spelled `nosuffix` parameter let Unreal append a filename suffix, so the callback did not recognize completion. Adding the required dash fixed only the capture filename handling. That report remains failed.

### Uninterrupted motion

The separate `--uninterrupted` option keeps the sequence playing through the Shot request, file completion, and two subsequent observation ticks. The fixed and paused-motion commands above retain their original behavior. The three native captures below completed without errors or ensures, with matching frozen sources. The independent [quality and phase report](../evidence/game-quality-20260905T220123687Z/report.json) accepts the saved raw frame uniquely at 2.0166667739550275 seconds, recorded post-tick frame 67: all 876 dense registration points and 45 stable quality probes pass, and all 54 anti-aliasing probes are retained. Neighboring recorded frames 65, 66, and 68 produce 14, 2, and 6 raw mismatches. TSR and analytic match that saved-frame latency and camera metadata; their filtered pixels are not separately registered as raw samples.

```sh
# Inspect the complete configuration without launching Unreal.
python3 native/tools/viewport_diagnosis.py --windowed --shot --motion --uninterrupted --frame 120 --arm raw --pose Glide0

# Run only in an agreed GPU window; substitute tsr or analytic for matched arms.
python3 native/tools/viewport_diagnosis.py --render --windowed --shot --motion --uninterrupted --frame 120 --arm raw --pose Glide0 --timeout 120
```

| Arm | Report | Image |
| --- | --- | --- |
| Raw | [215931.012554Z](../evidence/viewport-diagnosis-20260905T215931.012554Z-raw-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T215931.012554Z-raw-Glide0/frames/raw_Glide0.0120.png) |
| TSR | [220005.031523Z](../evidence/viewport-diagnosis-20260905T220005.031523Z-tsr-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T220005.031523Z-tsr-Glide0/frames/tsr_Glide0.0120.png) |
| Dynamic analytic | [220034.396327Z](../evidence/viewport-diagnosis-20260905T220034.396327Z-analytic-Glide0/report.json) | [PNG](../evidence/viewport-diagnosis-20260905T220034.396327Z-analytic-Glide0/frames/analytic_Glide0.0120.png) |

All three records agree: Shot is requested at engine frame 66, sequence frame 120 + 2.384185791015625e-7; completion is observed at engine frame 67, sequence frame 121 + 6.4373016357421875e-6. Playback continues through sequence frame 123, with 75 recorded observations and no subsequent seek, pause, skipped step, or camera-cut event. All PNGs are 640×360, 8-bit RGBA. These are observations of capture behavior; the filename does not establish the saved phase.

There is one initial seek, then continuous playback at the capture's fixed simulation step. There is no pause or corrective seek at the request or completion. The helper rejects unexpected engine or sequence frame skips, stopped playback, changed camera components, and sequence camera-cut events after the initial binding. It allows at most three engine frames to observe the PNG, then records two more ticks before quitting its own process. Shader errors, ensures, and changed sources remain capture failures.

The filename labels the **request frame**, not the saved frame. `contract.capture_uninterrupted_motion` is true; `sample_time_seconds` and `output_sequence_frame` are null until independent registration. `requested_sequence_frame` and `requested_sample_time_seconds` identify the intended request. The prepared camera is likewise the request pose, not an assertion about the PNG. Artifact metadata preserves `file_frame_label` separately and leaves `sequence_frame` null.

`shot_record.nearby_ticks` records each warmup post-tick and nearby pre/post ticks from three sequence frames before the request through two engine frames after observed completion. Each entry contains `phase` (`pre` or `post`), `engine_frame`, the qualified `sequence_time`, camera location/rotation/FOV, `is_playing`, `camera_cut`, and the active camera component. The original request/completion fields remain available. `actual_saved_sequence_time` stays null; observing the file is not an exact screenshot callback or a GPU timestamp.

Camera-cut detection uses the reflected `LevelSequencePlayer.on_camera_cut` delegate (`LevelSequencePlayer.h:110`, `LevelSequencePlayer.cpp:223`) and records its events separately. `MovieSceneCameraCutGameHandler.cpp:456` sends that notification for a new hard camera cut; sequence jumps and active-camera changes are checked independently. The camera manager's flag is only supplemental: `GameViewportClient.cpp:1924` clears it during drawing, so its later false value cannot prove that no cut occurred. This bounded fixture has no external gameplay system producing unrelated camera cuts.

The [first native attempt](../evidence/viewport-diagnosis-20260905T215838.615574Z-raw-Glide0/report.json) stopped before Shot because the sequence's cached camera component was null. The actual camera had moved correctly. `MovieSceneCameraCutGameHandler.cpp:333–353` returns early when the existing view target already matches the sequence camera; consequently the cache populated by `OnCameraCutUpdated` can remain empty. The helper now reads the actual player's view target and its camera component through the reflected `Controller.GetViewTarget` and `Actor.GetComponentByClass` APIs. The failed run remains preserved. The corrected helper also passes [nine synthetic callback cases](../evidence/viewport-uninterrupted-cpu-20260905T215942Z/report.json), with a reproducible harness alongside the report; these simulations validate control flow, not Unreal rendering or image phase.

Installed source establishes the relevant order: `LaunchEngineLoop.cpp:5859` ticks the game engine, whose `GameEngine.cpp:2034` redraws the viewport. `UnrealClient.cpp:1872` processes ordinary screenshots after viewport drawing. Only afterward does `LaunchEngineLoop.cpp:5991` tick Slate widgets. `SlateApplication.cpp:1758,1827` broadcasts the pre/post tick delegates around widget drawing; both therefore follow the game draw. `PySlate.cpp:99,134` exposes these exact delegates. A Shot requested from the post-tick cannot capture that already-processed game draw; the next draw is the expected candidate, which still requires image verification.

Independent phase registration must select a unique matching camera time from recorded post-ticks **after the request and no later than first observed file completion**, using the raw source and dense phase checks. Other arms must match that observed time and relative frame latency. It must not select time by minimizing our method's error or infer it from the filename. A single verified image during playback is useful for checking camera-following behavior; it does not establish temporal artifact quality over a video or game performance.

## Historical failures and remaining inferences

The [original raw capture](../evidence/capture-20260905T202331.609258Z-raw-Glide0/diagnosis.json) initialized Metal SM6, rendered the warm-up sequence, and logged one capture request at sequence frame 64. No PNG arrived after 132.8 seconds. The sampled process was still rendering; watched source hashes were stable. “Captured frame” in that log records a request, not completed readback.

Its PNG protocol uses `FFrameGrabber`. Installed `FrameGrabber.cpp:278` registers a Slate presentation callback; `:362` requires the callback window to match its stored target, and `:414` copies the backbuffer into a staging surface. On Mac, `-RenderOffScreen` creates a generic dummy window (`SlateApplication.cpp:1986`), whose `IsRenderingOffScreen()` returns false (`GenericWindow.cpp:226`), so Slate still uses a Metal viewport rather than its offscreen-texture branch (`SlateRHIRenderer.cpp:321`). This explains why the assumed offscreen-texture route was incorrect. It does **not** prove which callback/window/readback condition prevented the PNG. The default `framegrabber.framelatency` is 0 (`FrameGrabber.cpp:22`), so a multi-frame readback delay is not supported as the default explanation.

## Preserved offscreen composition experiment — disabled

Keep `AutomatedLevelSequenceCapture` and the same game viewport. Replace its PNG protocol with the installed composition-graph export:

```text
-MovieFormat=CustomRenderPasses
-CustomRenderPasses=FinalImage
-CaptureFramesInHDR=false
-CaptureGamut=0
-DisableScreenPercentage=false
```

The legacy plan remains inspectable for diagnosis. Its render invocation is now rejected; use the real-window Shot commands above.

The original experiment used the isolated project, prepared map/sequence hashes, 640×360 at fixed 60 Hz sequence time, 64 ordinary sequence warm-up frames, and one saved frame 64. It preserved commands, settings, logs, source hashes, and image metadata. Clean process exit proved insufficient. No engine files or existing assets were edited.

## Source evidence for the failed composition route

Checked against installed Unreal 5.8.2, changelist 56702186:

- `MovieSceneCaptureModule.cpp:62` supplies `UGameEngine::SceneViewport` to the capture. `MovieSceneCapture.cpp:323` selects the protocol by its command-line identifier.
- `CompositionGraphCaptureProtocol.h:49` declares `CustomRenderPasses`. Its implementation `:158` attaches a view extension; `:86` marks the existing view's buffer output for export. `:137` only overrides screen percentage when requested; the runner explicitly disables that override.
- `BaseEngine.ini:3144` registers `FinalImage`. [Read-only NullRHI inspection](../evidence/viewport-diagnosis-material-20260905T205810.981563Z.json) confirms its material is **after tonemapping**, sampling `PPI_POST_PROCESS_INPUT0`. The engine asset hash did not change.
- `PostProcessing.cpp:1156` runs native TSR before tonemapping; `:1667` applies after-tonemap material outputs. `PostProcessVisualizeBuffer.cpp:301` reads the existing render-graph texture and queues image writing, bypassing Slate presentation. The image-write module drains its queue on shutdown (`ImageWriteQueue.cpp:370,475`).

No new view family, MRQ offline flag, SceneCapture camera, spatial supersampling, or high-resolution screenshot is requested. Export adds a postprocess copy/readback and blocks on GPU data, so its wall-clock duration is **not a game performance measurement**.

The diagnostic explicitly uses `ShowFlag.Tonemapper=0` and `r.Tonemapper.Quality=0`. Gamma-only output can differ from the successful MRQ route's sRGB encoding. Pixel transfer, source phase, camera agreement, and actual AA must be checked before comparing errors. The independent material inspection can be repeated without a renderer using `--inspect-material`; its initial missing-API attempt is preserved separately, and the corrected inspection passed.

## Preserved first-use diagnostics

The stock [FinalImage capture](../evidence/viewport-diagnosis-20260905T205910.470514Z-raw-Glide0/report.json), [preloaded FinalImage capture](../evidence/viewport-diagnosis-20260905T210327.764543Z-raw-Glide0/report.json), and [owned one-node copy capture](../evidence/viewport-diagnosis-20260905T210718.314779Z-raw-Glide0/report.json) all exported exactly the same contaminated PNG SHA256, `3f410cab165b7f192c93e9a0ba145c7286c8d83230af1bf8fffa8e9630223b4b`. All processes exited cleanly with stable source hashes; no shader compile failures were logged. A clean process exit is insufficient to validate the pixels.

The [read-only expression inspection](../evidence/viewport-diagnosis-material-20260905T210311.427272Z.json) confirms that the stock material has only a SceneTexture input and FeatureLevelSwitch. Its empty SM6 input correctly falls back to the connected Default input (`MaterialExpressions.cpp:9220–9242`), so it is not an unconnected-SM6 expression error. The owned copy has one direct PostProcessInput0-to-Emissive connection and no texture assets; its [preparation record](../evidence/viewport-diagnosis-prepare-20260905T210714.303134Z.json) records the asset hash. An invocation-only buffer-material registration selected that asset successfully, as confirmed by the output filename. Neither alternative fixes the overlay.

Installed `PostProcessMaterial.cpp:409–434` explicitly falls back to another material when the requested postprocess shaders are unavailable. The default postprocess material references the engine's DefaultDiffuse texture, consistent with the visible grunge. This is evidence for a fallback hypothesis, not yet a trace proving which material rendered.

The default `r.ShaderCompiler.JobCacheDDC=true` skips material shader compilation at PostLoad (`ShaderCompilerJobCache.cpp:77–81,181–185`; `Material.cpp:4772–4779`). Thus preloading an asset does not necessarily compile its draw shaders. CompositionGraphCaptureProtocol activates the copy material only on the saved frame, after the automated capture's shader-completion check. The preserved eager-shader attempt applied `r.ShaderCompiler.JobCacheDDC=0` through an invocation-only startup INI override.

The [eager test](../evidence/viewport-diagnosis-20260905T210852.254591Z-raw-Glide0/report.json) confirmed that override at startup and compiled missing engine materials. It hit its 120-second cap while waiting for 3,696 remaining shaders at game frame 0; it produced no image. The initial default shader-map compilation completed before that wait. The owned worker processes were independently checked after timeout and had all exited. No unrelated Unreal session was terminated.

The [discarded-frame test](../evidence/viewport-diagnosis-20260905T211116.680566Z-raw-Glide0/report.json) exported frame 63 to warm the copy pass, retained frame 64, and preserved both. Both PNGs still match the same grunge hash; no shader jobs were reported between them. Therefore one extra export frame is not a demonstrated fix. Source inspection provides a further reason this can persist: `PipelineStateCache.cpp:4951–4958` unconditionally disables PSO precaching in `WITH_EDITOR` builds, including an editor executable launched with `-game`, whereas `Material.cpp:4795–4811` relies on precaching/preloading for postprocess domains. `Material.cpp:452–461` returns null before `TryGetShaders` if the rendering shader map is absent. These are code-path facts; identifying the exact branch taken still requires a clean controlled run or renderer trace.

That historical composition test forced `gamma 2.2` and queried `getall Engine DisplayGamma`, which logged `GameEngine_0.DisplayGamma = 2.200000`. Its contaminated PNGs are **16-bit**; they never passed transfer calibration, and a byte-only readback assumption would be incorrect. The independent scorer rejects those historical pixels under both sRGB and documented gamma 2.2, so transfer correction alone cannot resolve their failure. The successful ordinary Shot captures above are **8-bit RGBA** and independently pass gamma-2.2 calibration. Current reports record IHDR bit depth and color type directly.

Offscreen composition capture produced two `OSWindow != nullptr` ensures in HDR metadata add/remove (`RenderCore.cpp:519,547`). Although those functions return on null, ensure reporting launched crash-report windows on the user's desktop. The route was stopped and disabled, not accepted with a disclaimer. The first diagnostic also requested unsupported image-write log verbosity; that setting was removed in subsequent runs.

A [real-window FrameGrabber attempt](../evidence/viewport-diagnosis-20260905T211825.669833Z-raw-Glide0/report.json) also timed out after 120 seconds with no PNG. The actual window was visibly clean, no ensures occurred, and process sampling showed normal rendering/presentation continuing. Thus a dummy offscreen window is not a sufficient explanation of the FrameGrabber failure. Its exact missing callback/readback condition remains unresolved; the successful plain Shot route bypasses that dependency.
