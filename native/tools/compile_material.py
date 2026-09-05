#!/usr/bin/env python3
"""Compile the exact staged include and Custom Material bodies without Unreal.

This checks real DXC parsing/lowering, namespace isolation, and PI/TAU macro
collision resistance. Unreal's material environment and pixels remain separate.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from compile_hlsl import DEFAULT_ENGINE, REPO, TOOLS, run, sha

PROJECT = REPO / "native/Unreal/MoireComparison"
SCRIPTS = PROJECT / "Scripts"
sys.path.insert(0, str(SCRIPTS))
import analytic_material
import scene_contract


def main():
    stage = analytic_material.staged_kernel(PROJECT)
    include = PROJECT / stage["output"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = REPO / "native/evidence" / ("compile-material-" + stamp)
    evidence.mkdir(parents=True, exist_ok=False)
    build = TOOLS / "build"
    binaries = build / ("compile-material-" + stamp)
    binaries.mkdir(parents=True, exist_ok=False)
    driver = build / "dxc_compile"
    library = DEFAULT_ENGINE / "Engine/Binaries/ThirdParty/ShaderConductor/Mac/libdxcompiler.dylib"
    headers = DEFAULT_ENGINE / "Engine/Source/ThirdParty/ShaderConductor/ShaderConductor/External/DirectXShaderCompiler/include"
    watched = [include, SCRIPTS / "analytic_material.py", SCRIPTS / "scene_contract.py",
               SCRIPTS / "stage_kernel.mjs", REPO / "demo/ours-kernel.hlsl",
               REPO / "demo/ours-kernel.wgsl.js"]
    hashes = lambda: {str(p.relative_to(REPO)): sha(p) for p in watched}
    report = {"started_at": stamp, "status": "running", "stage": stage,
              "source_hashes": hashes(), "jobs": [], "renderer_or_gpu_started": False,
              "dxc_library_sha256": sha(library), "driver_source_sha256": sha(TOOLS / "dxc_compile.cpp"),
              "runner_source_sha256": sha(Path(__file__)),
              "environment": "Standalone DXC with PI/TAU macros and a duplicate include; actual staged namespace and Python-generated material body",
              "limitations": ["Not Unreal-generated Material.ush or a complete engine material permutation.",
                              "No Metal/MSL device compilation or pixel execution.",
                              "Uniform viewport size and varying UV stay symbolic during compilation."]}
    report_path = evidence / "report.json"
    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    report["driver_build"] = run(["xcrun", "clang++", "-std=c++14", "-O2", "-I" + str(headers),
                                  str(TOOLS / "dxc_compile.cpp"), "-o", str(driver)], 60)
    if report["driver_build"]["exit_code"]:
        report["status"] = "driver-build-failed"; save(); print(report_path); return 1
    for pose in scene_contract.POSES:
        body = analytic_material.checker_code(pose)
        source = evidence / (pose["name"] + ".hlsl")
        # PI and TAU expand even inside a namespace. Including the file twice
        # additionally proves its guard works with this full module.
        code = "#define PI 3.141592653589793\n#define TAU 6.283185307179586\n"
        code += f'#include "{include.as_posix()}"\n#include "{include.as_posix()}"\n'
        code += "cbuffer Settings : register(b0) { float2 InputViewportSize; float2 Padding; };\n"
        code += "float3 MaterialBody(float2 ViewportUV, float2 ViewportSize) {\n" + body + "\n}\n"
        code += "float4 Main(float2 InputUV : TEXCOORD0) : SV_Target0 {\n"
        code += "  return float4(MaterialBody(InputUV, InputViewportSize), 1.0);\n}\n"
        source.write_text(code)
        for backend in ("dxil", "spirv"):
            binary = binaries / (pose["name"] + (".dxil" if backend == "dxil" else ".spv"))
            command = [str(driver), str(library), str(source), "Main", "ps_6_0", str(binary), "-HV", "2021", "-O3"]
            if backend == "spirv":
                command += ["-spirv", "-fspv-target-env=vulkan1.1", "-fvk-use-dx-layout"]
            job = run(command, 60)
            job.update({"pose": pose, "backend": backend, "wrapper_sha256": sha(source),
                        "material_body": body})
            if job["exit_code"] == 0:
                data = binary.read_bytes()
                job.update({"object_bytes": len(data), "object_sha256": sha(binary),
                            "object_path": str(binary),
                            "object_magic_valid": data[:4] == (b"DXBC" if backend == "dxil" else bytes.fromhex("03022307"))})
            report["jobs"].append(job); save()
            print(pose["name"], backend, "PASS" if job["exit_code"] == 0 else "FAIL", flush=True)
    report["source_hashes_after"] = hashes()
    passed = (all(j["exit_code"] == 0 and j.get("object_magic_valid") for j in report["jobs"])
              and report["source_hashes"] == report["source_hashes_after"])
    report["status"] = "passed" if passed else "failed"
    save(); print(report_path)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
