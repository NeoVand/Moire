# Synchronized ordinary-game comparison

The project-local `MoireCompare` runtime plugin creates three real local-player
views of one scene in one game window. It is dormant without
`-MoireSynchronized`. The generated `/Game/MoireComparison/Maps/Glide_Comparison`
map is separate from all existing fixed and motion controls.

The panes share one per-game-frame camera sample and vertical field of view.
Their persistent view states remain separate. The left and middle panes use the
same point material; the right uses the validated camera-following analytic
material. Per-controller visibility chooses the material without mutating a
shared shader between views.

| Pane | Material | Native AA |
| --- | --- | --- |
| Left | Point source | None |
| Middle | Point source | Unreal TSR |
| Right | Analytic prefilter | None, or TSR with `--third-tsr` |

The default requested drawable window is 1920×360, giving three 640×360 panes.
Actual output rectangles, matrices, jitter and AA modes must be checked in the
captured telemetry. A 1920×1080 *whole* window would not make each pane a 1080p
render. Shared show flags keep postprocessing available to TSR; the extension
sets each view's AA and scaling methods separately.

## Build and prepare

Each command prints its plan unless `--execute` is supplied. The wrapper operates
only on this repository's isolated project, records source hashes and exit
status, and bounds the process it starts. It neither installs tools nor modifies
another Unreal project.

```sh
python3 native/tools/synchronized_comparison.py build --execute --timeout 600
python3 native/tools/synchronized_comparison.py prepare --execute
```

Preparation needs the existing staged kernel, point/sky materials and motion
analytic material. On a fresh checkout, follow the generation steps in the
[native project](../README.md) and [motion workflow](live.md), after building the
enabled plugin. Preparation runs with NullRHI. It tags the new map and actors,
refuses unowned replacements, and checks that previously generated assets remain
unchanged. Generated assets and build products stay ignored; source generators,
plugin code and compact evidence are retained.

## Observe the real game renderer

Coordinate GPU ownership with the other collaborator before execution. These
commands open a normal visible Unreal game window and close it after the bounded
observations. They use ordinary `Shot`, with no offscreen capture, movie executor,
pause or screenshot supersampling.

```sh
# Static source control; temporal history is still rendered and warmed.
python3 native/tools/synchronized_comparison.py render --fixed-time 0 --observe-primary-raster --execute

# One shared ordinary game-time trajectory through all three panes.
python3 native/tools/synchronized_comparison.py render --observe-primary-raster --execute

# Compose the shading prefilter with the native temporal reconstruction.
python3 native/tools/synchronized_comparison.py render --third-tsr --observe-primary-raster --execute
```

Each fresh evidence directory contains the launch report, preparation snapshot,
original PNG and `views.json`. The filename is not a claim about saved camera
time. The plugin records the screenshot request and processed callbacks, plus
per-view render observations. Independent original-ray checks bind the raw crop
to the observed camera and verify shared placement; repeated static frames cannot
identify one unique frame from pixels.

`PostRenderView_RenderThread` observes AA, jitter, matrices and view identity after
postprocessing graph construction. It is not a GPU fence, completed-frame timer,
or proof of performance. The public output rectangle is not the renderer's
private primary raster rectangle. `--observe-primary-raster` enables Unreal's
startup uniform-buffer content map and copies the actual raster rectangle from
the main view's shader constants. It adds CPU copying overhead, so it defaults
off and must stay off for performance runs. Missing debug data remains unknown.

The default source uses normal game time; `--fixed-time` holds the source camera
only. Unlike the older sequential motion captures, this experiment does not
force a 60 Hz engine timestep. Aggregate frame cost includes all three views and
shared work, so it cannot be quoted as the isolated cost of one algorithm. Native
per-method timing, trajectory-wide temporal error and cut recovery require
separate measurements.

The initial mathematical source remains the grazing-angle procedural checker.
This is an integration and sampling stress scene, not a representative game or
proof of general material support. The existing gallery and prior measurements
remain controls until this synchronized path passes native execution and source
registration.
