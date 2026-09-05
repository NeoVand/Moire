# Offscreen native viewport capture

`capture_native.py` operates only on the isolated `native/Unreal/MoireComparison` project. The default command prints the complete plan without launching Unreal or writing outputs. `--prepare` creates owned camera sequences under NullRHI. `--render` launches a separate game process with `-RenderOffScreen`; it never connects to the user's editor.

**Current runtime result:** sequence preparation and its owned-asset rerun pass, but the first Mac offscreen raw run delivered no PNG after the single capture request. Its record is `native/evidence/capture-20260905T202331.609258Z-raw-Glide0/`. The process was stopped after 132.8 seconds; frame-step logs, actual console values, source hashes, and a process sample are retained. No native image quality or successful offscreen readback is established by this implementation yet.

```sh
python3 native/tools/capture_native.py --prepare
python3 native/tools/capture_native.py --arm raw --pose Glide0

# Execute one mode at a time, after other GPU work has stopped:
python3 native/tools/capture_native.py --arm raw --pose Glide0 --render
python3 native/tools/capture_native.py --arm tsr --pose Glide0 --render
python3 native/tools/capture_native.py --arm analytic --pose Glide0 --render
```

Defaults: 640×360, fixed 60 Hz sequence time, 64 warm-up sequence frames, one saved frame numbered 64. The camera-cut section spans sequence frames 0 through 511, including the entire warm-up. There are no animated transforms, temporal subsamples, spatial supersampling, high-resolution screenshot tiles, or per-frame delays. Raw and analytic use AA method 0; TSR uses actual native method 4, quality 3, 100% input/output screen percentage, dynamic resolution off, and explicitly declared 200% history resolution. `--width`/`--height` accept only 16:9 because the fixed native camera and analytic rows use that aspect. `--warmup 0 --frames 16` captures the early sequence frames separately.

Preparation verifies ownership tags, camera pose/FOV, and source-map hashes. It only replaces tracks in its own six `/Game/MoireComparison/CaptureSequences/` assets; it does not save or change maps. Raw/TSR share the point-material maps; analytic uses the corresponding `_Analytic` maps. Run preparation again after regenerating maps, since actor bindings belong to those exact map packages. Rendering rejects changed map/sequence package hashes.

Each execution reserves a timestamped `native/evidence/capture-*` directory, preserves the full command and logs, and records before/after source hashes. Render validation requires the requested number of PNG files, exact dimensions and sequence frame numbers, clean process exit, and no detected shader-compilation failure. Requested CVars and their console output are retained separately. Successful file production is labeled `captured-pipeline-verification-pending` until the actual RHI, AA settings, camera, source polarity, and output transfer have been reviewed. PNG is an 8-bit viewport output; it is not assumed to be linear light. Fixed capture time and readback overhead are not a real-time performance measurement.

## Why this is the main viewport

The implementation was checked against installed Unreal **5.8.2**, changelist **56702186**:

- `Runtime/Engine/Private/GameEngine.cpp:1277` initializes the movie capture from the game command line.
- `Runtime/MovieSceneCapture/Private/MovieSceneCaptureModule.cpp:62` supplies `UGameEngine::SceneViewport`; line 77 handles `-MovieSceneCaptureType`/manifest selection and line 198 binds capture completion to process exit.
- `Editor/MovieSceneTools/Private/AutomatedLevelSequenceCapture.cpp:172` accepts the sequence, start/end, warm-up and delay arguments. At line 664 it waits for outstanding shader compilation; at line 727 it decrements the warm-up frame counter. Frame advancement uses a fixed frame-step controller. This class exists in editor builds used with `-game`; it does not require Python in the game process.
- `Runtime/MovieSceneCapture/Private/FrameGrabber.cpp:278` registers the backbuffer callback; line 362 receives the actual viewport backbuffer and queues its readback. The offscreen renderer still broadcasts that callback (`Runtime/SlateRHIRenderer/Private/SlateRHIRenderer.cpp:1288`).
- `Runtime/Slate/Private/Framework/Application/SlateApplication.cpp:1986` routes `-RenderOffScreen` to a dummy generic window on Mac. However, `Runtime/ApplicationCore/Private/GenericPlatform/GenericWindow.cpp:226` returns **false** from `IsRenderingOffScreen()`. Thus the offscreen-texture branch at `Runtime/SlateRHIRenderer/Private/SlateRHIRenderer.cpp:321` does not follow merely from that command-line flag. The first run's sample shows Metal viewport/drawable activity. This is evidence of a mismatch in the expected Mac readback route; the precise reason the backbuffer callback does not finish still needs a targeted fix or a different supported output path.

This avoids SceneCapture render targets and Movie Render Queue's separately constructed view family. The counted warm-up is stronger than a wall-clock sleep, but a strict claim about the exact TSR history index after camera reset still needs runtime instrumentation. Before publishing cold-history results, verify the initial camera cut's reset and correlate the frame-step logs with rendered frames. Static settled captures can proceed with the declared 64-frame warm-up and this limitation recorded.
