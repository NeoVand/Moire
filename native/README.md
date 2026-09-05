# Native Unreal comparison preparation

This is a separate **content-only UE 5.8 project**. Its Python bootstrap has run successfully with **NullRHI**, generating and then regenerating three maps and three materials with zero errors/warnings. Static Python/JSON and coordinate checks also pass. **It has not rendered**, opened a graphical editor, or produced a native comparison result. There is no analytic material or placeholder “ours” panel yet. The final-configuration evidence is [the successful run manifest](evidence/20260905T200045.051834Z/run.json) and [bootstrap metadata](evidence/20260905T200045.051834Z/bootstrap.json); full local logs remain in the ignored project `Saved/Logs` directory.

The existing project at `/Users/neo/Documents/Unreal Projects/MyProject` and the engine installation are untouched. Generated scene assets and project run logs stay inside this project; Unreal also uses its normal shared derived-data cache. The bootstrap refuses to run with another active project, uses only `/Game/MoireComparison`, and replaces only generator-tagged materials/maps and generator-prefixed actors. Treat that package tree as generated; put manual work elsewhere. Do not run it during Play In Editor. A failed first run can leave an untagged partial package; inspect that package rather than removing the ownership guard.

AndroidFileServer is explicitly disabled in this Mac project. Its default-enabled editor plugin otherwise writes an Android server configuration and generated token into `DefaultEngine.ini`. That unrelated generated section was removed; the final successful rerun checks that the project configuration remains unchanged.

## What is prepared

- Three fixed camera maps: `Glide0` (glide, t=0), `Glide8` (glide, t=8), and `Approach4` (approach, t=4, detail=2). These are still poses, **not a motion replay or temporal-stability benchmark**.
- An unlit procedural point checker and a constant unlit sky sphere; no lights, Lumen, ray tracing, fog, motion blur, or auto exposure.
- Raw mode uses Unreal AA method **0**. The baseline uses Unreal's actual **TSR, method 4**, at a requested 1920×1080 input/output resolution. A 200% TSR history is declared separately; it is not a reduced-resolution render input.
- Both native modes consume the same procedural source. This differs from the browser baseline's mipmapped checker plus anisotropic filtering and Three TRAA. The two baseline pipelines must not be presented as interchangeable results. A native mipmapped/anisotropic arm can be added after this source-matching gate.

Unreal's [Custom Material Expression](https://dev.epicgames.com/documentation/unreal-engine/custom-material-expressions-in-unreal-engine?lang=en-US) supplies the **unfiltered** point source here. Nothing in the bootstrap implements analytic filtering.

## Exact scene convention

`Scripts/scene_contract.py` mirrors the fixed scene in `src/compare/scene.ts`:

| Quantity | Native preparation |
| --- | --- |
| Coordinates | Three `(x,y,z)` → Unreal `(-z,x,y) × 100` cm |
| Checker counts | `u = UE.Y / (100 × period)`, `v = -UE.X / (100 × period)` |
| Period | `4/detail` Three world units; two half-period squares per axis |
| White predicate | The two `fract(count) >= 0.5` predicates are equal |
| Linear dark / light | `0.025 / 0.82` |
| Linear sky | `(0.105, 0.13, 0.16)` |
| Ground | XY plane at UE Z=0, width 10,000,000 cm; mesh bounds checked at generation |
| Camera height | 1,200 cm |
| Projection | 50° **vertical** FOV; `2 atan(tan(25°) × 16/9)` horizontal FOV |
| Output request | 1920×1080, aspect constrained to 16:9 |

The axis mapping preserves camera orientation, checker phase, and negative-coordinate parity. The bootstrap measures the Engine plane's bounds before scaling instead of assuming a particular asset size. Native point shading uses half-cell predicates; the browser's sign-of-sine implementation differs exactly on discontinuity boundaries, where a point convention is needed.

The background sphere is a constant material behind the ground, not Three's clear color. Unreal's clipping, mesh interpolation, camera activation, and output transform still need verification. The ground's distant outer edge and a three-device-pixel band around its geometric horizon are outside the existing material-only reference gate. Do not report sky/silhouette accuracy from that gate.

## Reproduce asset generation without rendering

Validated installation: UE **5.8.2**, changelist **56702186**, `/Users/Shared/Epic Games/UE_5.8`. This command has generated the assets successfully; the evidence records the complete invocation, including local log routing:

```sh
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" \
  "/Users/neo/repos/Moire/native/Unreal/MoireComparison/MoireComparison.uproject" \
  -run=pythonscript \
  -script="/Users/neo/repos/Moire/native/Unreal/MoireComparison/Scripts/bootstrap.py" \
  -unattended -nop4 -nosplash -nullrhi
```

Local `PythonScriptCommandlet.cpp` explicitly parses `-Script=`, enables Python, runs the script, and returns an error on Python failure. The actual log reports RHI `Null`, no GPU, successful Python execution, and a clean exit. **Asset generation under NullRHI does not verify the Metal shader or guarantee the material has compiled for the runtime shader platform.** The Python bindings and editor-subsystem asset operations did execute successfully. No rendering-capable launch has been performed.

On success the script writes three maps and three materials under `Content/MoireComparison`, and a unique `Saved/MoireComparison/bootstrap-<UTC>.json` with camera coordinates, material contract, measured mesh dimensions, generator hashes, and engine version. Generated content is ignored because the reviewed source is the reproducible generator. The command uses a separate process and does not communicate with the user's existing editor.

## First actual raw and TSR sessions

After the asset step succeeds, launch **one mode at a time** to avoid competing GPU workloads. Use the same map, output request, shader warm-up, and capture schedule for both. These exact commands are also **unexecuted**:

```sh
# Raw point shading. CameraActor is configured to auto-activate for Player 0.
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
  "/Users/neo/repos/Moire/native/Unreal/MoireComparison/MoireComparison.uproject" \
  /Game/MoireComparison/Maps/Glide0 -game -windowed -ResX=1920 -ResY=1080 \
  -ExecCmds="r.AntiAliasingMethod 0,r.ScreenPercentage 100,r.SecondaryScreenPercentage.GameViewport 100,r.DynamicRes.OperationMode 0,ShowFlag.Tonemapper 0"

# Close the raw session before launching this actual native TSR session.
"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
  "/Users/neo/repos/Moire/native/Unreal/MoireComparison/MoireComparison.uproject" \
  /Game/MoireComparison/Maps/Glide0 -game -windowed -ResX=1920 -ResY=1080 \
  -ExecCmds="sg.AntiAliasingQuality 3,r.AntiAliasingMethod 4,r.ScreenPercentage 100,r.SecondaryScreenPercentage.GameViewport 100,r.DynamicRes.OperationMode 0,r.TSR.History.ScreenPercentage 200,ShowFlag.Tonemapper 0"
```

Repeat with `Glide8` and `Approach4`. Opening a new process gives a fresh history. Allow shader/PSO compilation to finish, then explicitly measure history warm-up and save captures at known frame counts. These commands do not implement exact-frame capture automation yet. In particular, wall-clock waiting while compilation stalls does not prove that 64 frames have rendered.

`ShowFlag.Tonemapper=0` in the launch commands, disabled exposure, and unlit emission request a simple output path. The ShowFlag is deliberately absent from `DefaultEngine.ini`: the first preparation attempt exposed an engine ensure because a cheat console variable cannot be set from that INI section; the console command is the supported entry used here. **These settings do not establish byte equality with Three's linear-to-sRGB output.** Before measuring error, capture known dark/light/sky values in a linear render target or verify the screen transfer function; record target format, output transfer, pre-exposure, HDR/SDR, and any remaining postprocessing. Do not silently grade native screenshots as linear or assume an ICC-managed desktop screenshot equals a render-target readback.

The first visual checks are the active camera, exact content viewport size (including Retina scaling), no unexpected pawn/overlay, aspect/FOV, quadrant phase, horizon row, and matching off-axis samples. Query the live values of the requested console variables and record the actual shader platform. Local configuration support is not proof of the active runtime pipeline.

## Evidence required from each mode

Store results in a new `Saved/MoireComparison/<UTC>-<mode>-<pose>/` folder; do not overwrite earlier runs. Each bundle should contain:

1. The actual viewport screenshot/readback and its exact pixel dimensions. Use an ordinary viewport capture; tiled high-resolution screenshots change sampling/history and are not interchangeable.
2. Metadata with engine build, OS/GPU/Metal shader platform, project/generator/source hashes, pose/map, period, camera transform/FOV/aspect, AA method, quality, input/output/history dimensions, dynamic resolution, and all effective postprocess/exposure/output settings.
3. Exact rendered frame count since reset/camera cut, shader-compilation completion, temporal warm-up policy, elapsed replay time, and capture frame index. Distinguish cold and settled TSR images. Continuous motion and disocclusion tests remain to be implemented.
4. Independent-source errors in linear light, reported separately from screenshot quantization; the source must use the actual captured camera/viewport. Keep failed pixels in the results and state the horizon/outer-edge exclusions.
5. GPU and completed-frame timing after warm-up, timed in isolation from browsers/other editors. Name the scope (material, TSR, full frame) and save distributions, not a claimed FPS derived from overlapping pass timers.

No comparison with an analytic native material is possible yet. That next adapter should follow the shared WGSL source/invariance gates, preserve the same counts/filter convention, and be measured in this same host. This preparation does not imply that port exists.

## API checks and current validation

Run the static check without importing Unreal:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 /Users/neo/repos/Moire/native/check_preparation.py
```

It checks Python syntax, project JSON, cross-coordinate camera projection and count fixtures, phase, and FOV conversion. The generator's exact API names/signatures were checked against the installed 5.8 headers and implementations:

- `PythonScriptPlugin/Private/PythonScriptCommandlet.cpp`: commandlet syntax and failure handling.
- `LevelEditor/Public/LevelEditorSubsystem.h`, `UnrealEd/Public/Subsystems/EditorActorSubsystem.h`, and `EditorAssetSubsystem.h`: map/actor creation, saving, and asset ownership tags.
- `MaterialEditor/Public/MaterialEditingLibrary.h` and `Engine/Public/Materials/MaterialExpressionCustom.h`: node creation, connections, custom inputs, and recompilation.
- `Engine/Classes/Camera/CameraComponent.h`: horizontal FOV and aspect; `CameraActor.h` plus `PlayerController.cpp`: Player 0 camera auto-activation.
- `RenderCore/Private/RenderUtils.cpp`: `SupportsTSR` reads `GetSupportsGen5TemporalAA`; `Engine/Config/Mac/DataDrivenPlatformInfo.ini` enables it for Metal SM5/SM6. `Engine/Private/SceneView.cpp` identifies AA 0 and AA 4.

Epic's Python docs additionally confirm [AutoReceiveInput.PLAYER0](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AutoReceiveInput?application_version=5.6), [CustomInput.input_name](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/CustomInput?application_version=5.6), and [Rotator's named pitch/yaw/roll fields](https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/Rotator?application_version=5.6). Those web pages are 5.6; installed 5.8 declarations were used for the project-specific API checks, then the concrete script executed under 5.8.2 NullRHI. Native render execution, runtime camera activation, history, output color, and performance remain unchecked.
