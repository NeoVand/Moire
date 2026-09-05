# One synchronized Unreal game viewport

Read-only design against the installed **Unreal 5.8.2** source on 2026-09-05. No plugin, project configuration, map, build, editor session, or GPU job was changed by this investigation. The design below is supported by the source order; mixed-AA rendering still requires execution and capture gates.

## Smallest implementation

Add one runtime C++ plugin **inside the isolated MoireComparison project**, with a small comparison director and a world-scoped scene-view extension. Keep the existing fixed and motion maps as controls; generate one new owned comparison map. Use three real local players in one ordinary game viewport, rather than scene captures or compositing separately rendered movies.

1. Create local players 1 and 2 through `UGameInstance::CreateLocalPlayer`, check their returned controllers and distinct view identities, and use the existing first player as pane 0. Set `bUseSplitscreen=true` and `ThreePlayerSplitscreenLayout=Vertical` in this project's game-map settings. The built-in layout already provides equal left/middle/right thirds; a custom viewport client is unnecessary initially.
2. Use one common camera trajectory and source clock. A `SetupViewPoint` override copies a single per-frame cached pose into all three `FMinimalViewInfo` values before projection/culling. Do not advance the trajectory on each callback: this callback may run more than once per view. Keep the camera's projection, aspect, clipping, postprocess settings, time and explicit cut flag common. Record the resulting unjittered matrices, actual pane rectangles, frame ID and pose for all three views.
3. Put two coincident ground meshes in the new map: the original point material and the current validated camera-following analytic material. Pane 0 and pane 1 hide the analytic actor; pane 2 hides the point actor through each controller's `HiddenActors`/`HiddenPrimitiveComponents`. Share the same sky. Disable collision/shadows on these unlit test surfaces. Per-view hiding avoids changing a shared material between draw calls and prevents overlap depth fighting. Future lit scenes need a separate assessment of shared shadows/reflections.
4. Register an `FWorldSceneViewExtension`, restricted further to this game's viewport. Associate panes with recorded local-player/controller identities, not an assumption that any unrelated view's index means a pane. In `SetupView`, use:

| Pane | `AntiAliasingMethod` | `PrimaryScreenPercentageMethod` | Jitter |
| --- | --- | --- | --- |
| Raw | `AAM_None` | `SpatialUpscale` | Disallowed |
| TSR | `AAM_TSR` | `TemporalUpscale` | Allowed |
| Analytic | `AAM_None` | `SpatialUpscale` | Disallowed |

Keep family `PostProcessing`, `AntiAliasing` and `TemporalAA` show flags enabled, with `bRealtimeUpdate=true`. These flags are shared; switching a family flag off for the raw pane would also disable TSR. Require a valid persistent view state and actual TSR support for the middle pane. Keep primary render resolution at 100%, disable dynamic resolution, set secondary screen percentage to 100% explicitly to avoid DPI-derived scaling, and leave the test screen-percentage override at its normal value. Do not install a third-party temporal upscaler on this family.

For **three 640×360 panes**, the whole drawable viewport should be 1920×360. For three 1920×1080 panes it is 5760×1080; a 1920×1080 whole window does not give three independent 1080p views. Use each actual pane's dimensions for projection and Gaussian pixel width. A 50-degree vertical FOV means about 79.3169 degrees horizontal at 16:9. Integer rectangle rounding and Retina drawable pixels must be checked after layout. The existing dynamic analytic material derives its local homography from world position and depth, so it avoids a hard-coded full-window pixel origin.

## Why the per-view override should survive

All paths below are relative to `/Users/Shared/Epic Games/UE_5.8/Engine/Source/Runtime/` and refer to this installed version:

| Source location | Finding |
| --- | --- |
| `Engine/Private/GameViewportClient.cpp:329` and `:2945` | Built-in `ThreePlayer_Vertical` assigns size `(1/3,1)` and origins `0,1/3,2/3`; `LayoutPlayers` writes each local player's rectangle. |
| `Engine/Private/GameInstance.cpp:837` and `:846` | Local-player creation maps controller IDs to platform users, checks duplicates and the split-player limit. Check failures rather than assuming three hardware users exist. |
| `Engine/Private/LocalPlayer.cpp:842` | Every local player allocates and supplies its own persistent `ViewStates` entry. The TSR pane therefore has a separate history. |
| `Engine/Private/LocalPlayer.cpp:730` | `SetupViewPoint` can replace the cached camera view before projection. |
| `Engine/Private/SceneView.cpp:1043` | The `FSceneView` constructor chooses default AA, then derives `PrimaryScreenPercentageMethod` from it. Changing AA later must also change that method. |
| `Engine/Private/SceneView.cpp:1162` | Default AA setup applies support, show-flag, realtime and history-state fallbacks. A runtime-source search found its only call in the constructor. |
| `Engine/Private/LocalPlayer.cpp:1006` and `:1011` | `EndFinalPostprocessSettings` finishes **before** extension `SetupView`. |
| `Renderer/Private/SceneRendering.cpp:1010` | `FViewInfo` copies the supplied `FSceneView`; it does not reconstruct it with the global AA default. |
| `Renderer/Private/SceneRendering.cpp:3060` | **Important exception:** a family `TemporalUpscalerInterface` changes every view to `AAM_TemporalAA`/`TemporalUpscale`. Exclude third-party upscalers. |
| `Renderer/Private/SceneRendering.cpp:3530` and `:3649` | Later postprocessing-disabled and screen-percentage test/debug conditions can disable AA or alter scaling. Keep the normal deferred game path and record final values. |
| `Renderer/Private/PostProcess/PostProcessing.cpp:1154` | The per-view TSR configuration dispatches `AddMainTemporalSuperResolutionPasses` with that view. |
| `Engine/Private/LocalPlayer.cpp:938`; `Engine/Private/PlayerController.cpp:6502` | Each controller's hidden actors/components become that view's `HiddenPrimitives`. |
| `Engine/Public/SceneViewExtension.h:145`, `:173`, `:292` | Game-thread setup, later render-thread observation hooks, and a world-scoped extension base are public APIs. |

Add **read-only** render-thread observations: `PreRenderView_RenderThread` sees the renderer's prepared rectangles and AA mode (`SceneRendering.cpp:4247`, `:4303`), while `PostRenderView_RenderThread` records the final jitter, cut state and view-state identity. Jitter is applied later during view initialization (`SceneVisibility.cpp:5244`), so the pre-render callback alone cannot certify it. The first execution gate must show None/TSR/None with valid TSR history and zero raw/analytic jitter; `SetupView` logging alone is insufficient. Check the render graph includes TSR only for the middle pane. Validate each crop against the isolated frozen controls at the same pane resolution, then run continuous motion and deliberate cuts. Aggregate triptych frame time measures all three views and shared work, not any method's isolated frame cost.

## Local build prerequisites observed

The current `.uproject` is content-only, with no C++ module. A project-local runtime plugin can supply the extension/director without modifying the installed engine. Its module needs the usual `Core`, `CoreUObject`, `Engine`, `EngineSettings` and `RenderCore` dependencies; add `RHI` only for the concrete observation types used. Public extension hooks avoid Renderer private-header coupling.

Xcode **26.6 (17F113)** is selected at `/Applications/Xcode.app/Contents/Developer`; `clang++` resolves there, the macOS SDK reports **26.5**, and `metal` resolves to the installed Metal toolchain. Unreal's `Engine/Config/Apple/Apple_SDK.json` allows Xcode 15.2–27.9. The installed-build marker, UnrealBuildTool binary/DLL, and bundled .NET 10.0 mac-arm64/mac-x64 directories exist. These observations establish availability, not a successful plugin build or accepted toolchain configuration.

`Engine/Build/BatchFiles/Mac/Build.sh` invokes the bundled UBT and skips rebuilding UBT/ShaderCompileWorker for an installed build. After adding the project-owned plugin descriptor/module, the first bounded build to try is:

```sh
"/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" UnrealEditor Mac Development -Project="/Users/neo/repos/Moire/native/Unreal/MoireComparison/MoireComparison.uproject" -architecture=arm64 -WaitMutex -NoHotReloadFromIDE
```

This command was **not run**. Installed-engine target/plugin discovery, UHT, link compatibility and the mixed-view rendering path remain execution checks. Do not rebuild the engine, install tools, or alter the user's other Unreal project as part of this first step.
