#!/usr/bin/env python3
"""Compile the shared HLSL with UE's actual DXC library, without a renderer.

The default path compiles the source unchanged. --forward-declarations is an
explicit diagnostic shim, never silently enabled. Reports preserve all inputs,
compiler diagnostics and hashes. Binary outputs stay in ignored tools/build/.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parents[1]
DEFAULT_ENGINE = Path("/Users/Shared/Epic Games/UE_5.8")
PROTOTYPES = """float2 checkerMeanHMode(float3 hu,float3 hv,float3 hd,float x,float y,float period,float S,uint mode);
float2 circlesMeanHMode(float3 hu,float3 hv,float3 hd,float x,float y,float period,float S,uint mode);
"""


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(command, seconds):
    start = time.monotonic()
    try:
        result = subprocess.run(command, text=True, capture_output=True, timeout=seconds)
        return {"argv": command, "exit_code": result.returncode,
                "elapsed_seconds": time.monotonic() - start,
                "stdout": result.stdout, "diagnostics": result.stderr}
    except subprocess.TimeoutExpired as error:
        def text(value):
            return value.decode(errors="replace") if isinstance(value, bytes) else value or ""
        return {"argv": command, "exit_code": 124, "elapsed_seconds": time.monotonic() - start,
                "stdout": text(error.stdout), "diagnostics": text(error.stderr), "timed_out": True}


def wrapper(source, function, stage, prototypes):
    # Default include handler reads the exact original file. The test does not
    # translate, rewrite, or copy the mathematical module.
    include = source.as_posix().replace('"', '\\"')
    code = (PROTOTYPES if prototypes else "") + f'#include "{include}"\n'
    code += "cbuffer Inputs : register(b0) { float4 HU; float4 HV; float4 HD; float4 Settings; };\n"
    if stage == "cs":
        code += "RWStructuredBuffer<float2> Answer : register(u0);\n"
        code += "[numthreads(1,1,1)] void Main(uint3 id : SV_DispatchThreadID) {\n"
        code += f"  Answer[id.x] = {function}(HU.xyz, HV.xyz, HD.xyz, Settings.x, Settings.y, Settings.z, Settings.w);\n}}\n"
    else:
        code += "float4 Main(float4 pixel : SV_Position) : SV_Target0 {\n"
        code += f"  float2 result = {function}(HU.xyz, HV.xyz, HD.xyz, pixel.x, pixel.y, Settings.z, Settings.w);\n"
        code += "  return float4(result, 0.0, 1.0);\n}\n"
    return code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", type=Path, default=DEFAULT_ENGINE)
    parser.add_argument("--source", type=Path, default=REPO / "demo/ours-kernel.hlsl")
    parser.add_argument("--forward-declarations", action="store_true",
                        help="Explicitly prepend Mode prototypes; a diagnostic shim, not an unchanged-source pass")
    parser.add_argument("--spirv", action="store_true", help="Also compile every entry through DXC's SPIR-V backend")
    args = parser.parse_args()
    engine, source = args.engine.resolve(), args.source.resolve()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = REPO / "native/evidence" / ("compile-" + stamp)
    evidence.mkdir(parents=True, exist_ok=False)
    build = TOOLS / "build"
    binaries = build / ("compile-" + stamp)
    binaries.mkdir(parents=True, exist_ok=False)
    library = engine / "Engine/Binaries/ThirdParty/ShaderConductor/Mac/libdxcompiler.dylib"
    includes = engine / "Engine/Source/ThirdParty/ShaderConductor/ShaderConductor/External/DirectXShaderCompiler/include"
    driver = build / "dxc_compile"
    report = {
        "started_at": stamp, "status": "running", "machine": platform.machine(),
        "os": platform.platform(), "source": str(source), "source_sha256": sha(source),
        "dxc_library": str(library), "dxc_library_sha256": sha(library),
        "dxc_api_header_sha256": sha(includes / "dxc/dxcapi.h"),
        "driver_source_sha256": sha(TOOLS / "dxc_compile.cpp"),
        "runner_source_sha256": sha(Path(__file__)),
        "engine_build": json.loads((engine / "Engine/Build/Build.version").read_text()),
        "diagnostic_forward_declarations": args.forward_declarations,
        "source_unchanged_compilation": not args.forward_declarations,
        "renderer_or_gpu_started": False, "jobs": [],
        "limitations": [
            "Compilation does not execute shader arithmetic or validate numerical equality.",
            "Standalone DXC acceptance is not an Unreal material-environment or Metal device execution test.",
            "Any missing DXIL signing-library warning means the DXIL object is unsigned.",
            "SPIR-V output, when requested, is not Metal/MSL output.",
        ],
    }
    report_path = evidence / "report.json"
    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    # C++14 is sufficient for this API client and its standard UTF-8 conversion.
    compile_driver = ["xcrun", "clang++", "-std=c++14", "-O2", "-I" + str(includes),
                      str(TOOLS / "dxc_compile.cpp"), "-o", str(driver)]
    report["driver_build"] = run(compile_driver, 60)
    if report["driver_build"]["exit_code"]:
        report["status"] = "driver-build-failed"; save()
        print(report["driver_build"]["diagnostics"])
        print(report_path)
        return 1
    report["driver_binary_sha256"] = sha(driver)
    backends = ["dxil", "spirv"] if args.spirv else ["dxil"]
    for function in ["checkerMeanH", "circlesMeanH"]:
        for stage in ["cs", "ps"]:
            name = function + "-" + stage
            path = evidence / (name + ".hlsl")
            path.write_text(wrapper(source, function, stage, args.forward_declarations))
            for backend in backends:
                object_path = binaries / (name + (".dxil" if backend == "dxil" else ".spv"))
                command = [str(driver), str(library), str(path), "Main", stage + "_6_0",
                           str(object_path), "-HV", "2021", "-O3"]
                if backend == "spirv":
                    command += ["-spirv", "-fspv-target-env=vulkan1.1", "-fvk-use-dx-layout"]
                result = run(command, 60)
                result.update({"function": function, "stage": stage, "backend": backend,
                               "wrapper_sha256": sha(path)})
                if result["exit_code"] == 0:
                    data = object_path.read_bytes()
                    magic = b"DXBC" if backend == "dxil" else bytes.fromhex("03022307")
                    result.update({"object_path": str(object_path), "object_bytes": len(data),
                                   "object_sha256": sha(object_path), "object_magic_valid": data[:4] == magic})
                report["jobs"].append(result); save()
                print(function, stage, backend, "PASS" if result["exit_code"] == 0 else "FAIL", flush=True)
    # A known-invalid shader must fail through this same API client. This guards
    # against a tool that reports success without inspecting DXC's compile status.
    invalid = evidence / "negative-control.hlsl"
    invalid.write_text("float4 Main(float4 p : SV_Position) : SV_Target0 { return missing_symbol; }\n")
    report["negative_control"] = run([str(driver), str(library), str(invalid), "Main", "ps_6_0",
                                       str(binaries / "negative-control.dxil"), "-HV", "2021"], 20)
    report["source_sha256_after"] = sha(source)
    passed = (all(job["exit_code"] == 0 and job.get("object_magic_valid") for job in report["jobs"])
              and report["negative_control"]["exit_code"] == 1
              and "missing_symbol" in report["negative_control"]["diagnostics"]
              and report["source_sha256_after"] == report["source_sha256"])
    report["status"] = "passed" if passed else "failed"
    save()
    print(report_path)
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
