"""Thin Unreal Custom Material body for the shared HLSL entry, at a fixed pose."""

import hashlib
import json
from pathlib import Path

import scene_contract as contract

INCLUDE = "/Project/Moire/Generated/Kernel.ush"


def staged_kernel(project):
    """Reject stale generated includes before touching any Unreal assets."""
    generated = project / "Shaders/Moire/Generated"
    record = json.loads((generated / "source.json").read_text())
    root = project.parents[2]
    entries = [(root / record["source"], "sourceSha256"),
               (root / record["generator"], "generatorSha256"),
               (root / record["adapter"], "adapterSha256"),
               (project / record["output"], "outputSha256")]
    for file, key in entries:
        if hashlib.sha256(file.read_bytes()).hexdigest() != record[key]:
            raise RuntimeError(f"Stale kernel stage: {file}. Run Scripts/stage_kernel.mjs before Unreal starts.")
    return record


def checker_code(pose):
    """Input UV is already at the pixel center; no extra half-pixel shift."""
    rows = contract.homography_normalized(pose)
    declarations = []
    for name in ("hu", "hv", "hd"):
        a, b, c = rows[name]
        declarations.append(f"float3 {name} = float3({a:.17g} / ViewportSize.x, {b:.17g} / ViewportSize.y, {c:.17g});")
    return "\n".join(declarations) + f"""
float2 pixel = ViewportUV * ViewportSize;
float ink = MoireKernel::checkerMeanH(hu, hv, hd, pixel.x, pixel.y, 1.0, 0.25).x;
float value = {contract.DARK:.17g} + {contract.LIGHT - contract.DARK:.17g} * ink;
return float3(value, value, value);"""
