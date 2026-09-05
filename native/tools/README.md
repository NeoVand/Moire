# Real HLSL compilation on this Mac

`compile_hlsl.py` builds a small C++ client for Unreal's bundled `libdxcompiler.dylib`, then compiles the shared HLSL through **DXC 1.8**. It does not start Unreal, create a renderer, execute a shader, or use the GPU.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_hlsl.py --spirv
```

Default installation: `/Users/Shared/Epic Games/UE_5.8`. Use `--engine /path/to/UE_5.8` or `--source /path/to/kernel.hlsl` to change inputs. The source must provide `checkerMeanH` and `circlesMeanH` with the shared seven-argument homography interface.

The driver uses the matching installed `dxc/dxcapi.h`, `DxcCreateInstance`, `IDxcCompiler3::Compile`, `IDxcResult::GetStatus`, and the object/error outputs. It checks the compiler's actual result, not merely whether its API call returned. A known-invalid shader must produce a compiler failure. No third-party files or global engine settings are changed.

Each run compiles checker and circles entry wrappers as compute (`cs_6_0`) and pixel (`ps_6_0`) shaders, with HLSL 2021 and optimization level 3. Uniform inputs keep the material computations live. `--spirv` additionally uses DXC's SPIR-V backend targeting Vulkan 1.1. Output magic and size are checked. The driver binary and compiled shader objects remain in ignored `native/tools/build/`; timestamped evidence is written to `native/evidence/compile-*/`.

Reports include exact build/compile arguments, compiler diagnostics/version, library/header/source/wrapper/object hashes, shader stage/backend, negative control, and before/after shared-source hashes. A source mutation during the run fails the gate. Compiler elapsed times are CPU compilation costs, **not rendering performance**.

## Observed results

The initial generated HLSL at SHA `367e70f05f57c1e6e24316a6a58fa6883fd7a7787963690ce16a0c3ec91074bd` failed because its wrappers called `checkerMeanHMode` and `circlesMeanHMode` before any declaration. [Initial real diagnostics](../evidence/compile-20260905T201037.883192Z/diagnostics.txt) preserve that result. An explicitly marked `--forward-declarations` diagnostic run isolated those missing prototypes as the blocker; that flag must not be confused with an unchanged-source pass.

The revised working source at SHA `4f53be9c95b1cdf3b5245e5b1e046b18bdc66dacb58a5ebf019278890e8a6b43` subsequently passed **all eight unchanged-source compilations**: checker/circles × compute/pixel × DXIL/SPIR-V. Its [complete report](../evidence/compile-20260905T201243.716379Z/report.json) records the source remaining unchanged throughout the run. The negative control failed as intended. The report identifies source bytes rather than assuming an uncommitted file belongs to the previous commit.

SPIR-V compilation emitted no diagnostics. DXIL compilation warned that its signing library is absent; the resulting DXIL objects are compiled **but unsigned**, not ready-to-ship signed Windows shader binaries. Successful standalone DXC compilation does not establish Unreal material-environment compatibility, Metal/MSL compilation, numerical equivalence, or native rendering speed. Those are separate next gates.

The optional diagnostic command is:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_hlsl.py --forward-declarations --spirv
```

It adds only the two Mode declarations to the wrapper and sets `diagnostic_forward_declarations=true` and `source_unchanged_compilation=false` in the report. The default command does neither.

## Staged Unreal include and material bodies

After the author-owned emitted file matches its generator, the native host stages
its include with `Scripts/stage_kernel.mjs`. Validate the actual staged namespace
and the exact `analytic_material.checker_code(pose)` bodies with:

```sh
node native/Unreal/MoireComparison/Scripts/stage_kernel.mjs
PYTHONDONTWRITEBYTECODE=1 python3 native/tools/compile_material.py
```

This produces six real pixel-shader compilations: the three native camera poses,
each through DXIL and SPIR-V. UV and viewport size remain shader inputs. The test
defines `PI`/`TAU` macros before including `Kernel.ush` twice, exercising both
namespace/macro isolation and the include guard. It imports the actual material
body from Python and does not substitute another implementation. Reports under
`native/evidence/compile-material-*/` save the body, wrapper, stage record,
diagnostics, object hashes, and source hashes before/after compilation.

This is still a standalone DXC test of those exact pieces, not an Unreal-generated
material permutation or a Metal device test. Separately running the project's
bootstrap under NullRHI exercises editor bindings and generated assets without
rendering. The stage guard intentionally refuses a run if the author changes its
source between staging and asset generation; restage a settled handoff rather
than bypassing that check.

The frozen `1612267` source (HLSL SHA
`85c87f01b4d16a18dbad1fa8a34dc2e793eeb0769377569fb3432ebf7a5595bc`)
has now passed all of these preparation gates:

| Gate | Result | Evidence |
| --- | --- | --- |
| Direct unchanged-source checker/circles compute + pixel compilation | 8/8 DXIL/SPIR-V objects; negative control rejected | [Compiler report](../evidence/compile-20260905T201851.786207Z/report.json) |
| Staged namespace/include and actual three-pose material bodies | 6/6 pixel-shader objects; macro and duplicate-include checks included | [Material report](../evidence/compile-material-20260905T201745.240756Z/report.json) |
| Actual Unreal Python asset generation under NullRHI | Exit 0, zero errors/warnings, six maps and six materials; native source/config hashes unchanged | [NullRHI report](../evidence/compile-native-material-bootstrap-20260905T201802.877543Z/run.json) |

The NullRHI run exercised the real `ViewportUV`/`ViewSize` material node
connections and `include_file_paths` binding. It did not compile an engine
material for a live Metal device or render any image. Its [bootstrap
metadata](../evidence/compile-native-material-bootstrap-20260905T201802.877543Z/bootstrap.json)
identifies the actual point/analytic map names, poses, stage hashes, and source
contract. Earlier failed evidence is retained: the stale-stage guard caught an
author edit during startup before it could generate assets from that stale
handoff.
