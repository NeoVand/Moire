#!/usr/bin/env python3
"""Prepare or run one isolated native MRQ quality capture, never benchmark.

Default prints the plan without starting Unreal. --prepare uses NullRHI.
--render executes one previously prepared arm, with a bounded child lifetime.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"
SCRIPTS = PROJECT / "Scripts"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--prepare", action="store_true")
    action.add_argument("--render", action="store_true")
    parser.add_argument("--engine", type=Path, default=Path("/Users/Shared/Epic Games/UE_5.8"))
    parser.add_argument("--arm", choices=("raw", "tsr", "analytic"), default="raw")
    parser.add_argument("--pose", choices=("Glide0", "Glide8", "Approach4"), default="Glide0")
    parser.add_argument("--prepared", type=Path, help="Explicit prepare-mrq JSON; default latest successful preparation")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 1800:
        parser.error("Timeout must be 1..1800 seconds")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = REPO / "native/evidence" / (f"mrq-prepare-{stamp}" if args.prepare else f"mrq-capture-{stamp}-{args.arm}-{args.pose}")
    engine = args.engine.resolve()
    common = [str(engine / "Engine/Binaries/Mac/UnrealEditor-Cmd"), str(PROJECT / "MoireComparison.uproject")]
    suffix = ["-unattended", "-nop4", "-nosplash", "-nosound", "-stdout", "-FullStdOutLogOutput",
              "-AbsLog=" + str(evidence / "unreal.log")]
    record = None
    if args.prepare:
        command = common + ["-run=pythonscript", "-script=" + str(SCRIPTS / "prepare_mrq.py"), "-nullrhi"] + suffix
    else:
        candidates = [args.prepared.resolve()] if args.prepared else sorted((PROJECT / "Saved/MoireComparison").glob("prepare-mrq-*.json"), reverse=True)
        for preparation_path in candidates:
            preparation = json.loads(preparation_path.read_text())
            if preparation.get("status") == "passed":
                record = next((r for r in preparation["configs"] if r["pose"] == args.pose and r["arm"] == args.arm), None)
                if record:
                    break
        if not record:
            parser.error("No successful MRQ preparation for this arm/pose; run --prepare first")
        for key, extension in (("map", ".umap"), ("sequence", ".uasset"), ("config", ".uasset")):
            file = PROJECT / "Content" / (record[key].removeprefix("/Game/") + extension)
            if not file.is_file() or sha(file) != record[key + "_sha256"]:
                parser.error(f"Prepared asset changed: {file}; prepare again")
        output = Path(record["output_directory"])
        if not output.is_relative_to(PROJECT / "Saved/MoireComparison/MRQ"):
            parser.error("Prepared output directory is outside the isolated capture namespace")
        if output.exists() and any(output.iterdir()):
            parser.error("This preset already has output; prepare again to preserve earlier captures")
        command = common + [record["map"] + "?game=/Script/MovieRenderPipelineCore.MoviePipelineGameMode",
            "-game", "-RenderOffScreen", "-windowed", "-ForceRes", "-ResX=640", "-ResY=360", "-NoTextureStreaming",
            "-LevelSequence=" + record["sequence"], "-MoviePipelineConfig=" + record["config"],
            "-MoviePipelineLocalExecutorClass=/Script/MovieRenderPipelineCore.MoviePipelineInProcessExecutor",
            "-LogCmds=LogMovieRenderPipeline VeryVerbose"] + suffix
    plan = {"action": "prepare" if args.prepare else "render", "argv": command,
            "output_directory": str(evidence), "renderer_will_start": bool(args.render),
            "execute_requested": args.prepare or args.render, "label": "Native MRQ quality capture",
            "performance_measurement": False}
    if not (args.prepare or args.render):
        print(json.dumps({**plan, "prepared_config": record}, indent=2)); return 0
    evidence.mkdir(parents=True, exist_ok=False)
    watched = [Path(__file__), SCRIPTS / "prepare_mrq.py", SCRIPTS / "scene_contract.py",
               SCRIPTS / "analytic_material.py", PROJECT / "MoireComparison.uproject",
               PROJECT / "Config/DefaultEngine.ini", PROJECT / "Shaders/Moire/Generated/Kernel.ush",
               PROJECT / "Shaders/Moire/Generated/source.json", REPO / "demo/ours-kernel.wgsl.js", REPO / "demo/ours-kernel.hlsl"]
    watched += sorted((PROJECT / "Content/MoireComparison/Materials").glob("*.uasset"))
    if record:
        watched += [PROJECT / "Content" / (record[key].removeprefix("/Game/") + ext)
                    for key, ext in (("map", ".umap"), ("sequence", ".uasset"), ("config", ".uasset"))]
    hashes = lambda: {str(p.relative_to(REPO)): sha(p) for p in watched}
    report = {**plan, "started_at": stamp, "status": "running", "source_hashes": hashes(),
              "engine_build": json.loads((engine / "Engine/Build/Build.version").read_text()), "artifacts": []}
    if record:
        report.update({"preparation_report": str(preparation_path), "preparation_sha256": sha(preparation_path),
                       "prepared_config": record})
    report_path = evidence / "report.json"
    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    started = time.monotonic()
    try:
        with (evidence / "stdout.log").open("w") as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout)
        report.update({"exit_code": result.returncode, "status": "process-passed" if result.returncode == 0 else "process-failed"})
    except subprocess.TimeoutExpired:
        report.update({"exit_code": 124, "status": "timed-out"})
    except OSError as error:
        report.update({"exit_code": 127, "status": "launch-failed", "failure": str(error)})
    report["elapsed_wall_seconds"] = time.monotonic() - started
    report["source_hashes_after"] = hashes()
    report["source_hashes_stable"] = report["source_hashes"] == report["source_hashes_after"]
    if args.prepare:
        generated = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-mrq-*.json"))
        latest = json.loads(generated[-1].read_text()) if generated else {}
        valid = latest.get("created_at", "") >= stamp and latest.get("status") == "passed" and len(latest.get("configs", [])) == 9
        if generated:
            report.update({"preparation_report": str(generated[-1]), "preparation": latest})
        if not valid and report["exit_code"] == 0:
            report["status"] = "preparation-failed"
    if args.render:
        frames = sorted(output.rglob("*.png")) if output.exists() else []
        (evidence / "frames").mkdir()
        for file in frames:
            header = file.read_bytes()[:24]
            valid = len(header) == 24 and header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR"
            size = list(struct.unpack(">II", header[16:24])) if valid else None
            destination = evidence / "frames" / file.name
            shutil.copy2(file, destination)
            frame = file.stem.rsplit(".", 1)[-1]
            report["artifacts"].append({"path": str(destination), "original_path": str(file), "sha256": sha(file),
                                        "size": size, "sequence_frame": int(frame) if frame.isdecimal() else -1})
        log_text = (evidence / "stdout.log").read_text(errors="replace")
        report["pipeline_log_lines"] = [line for line in log_text.splitlines() if "LogMovieRenderPipeline:" in line]
        report["console_setting_lines"] = [line for line in log_text.splitlines() if any(key in line for key in record["requested_cvars"])]
        report["renderer_log_lines"] = [line for line in log_text.splitlines() if "LogRHI" in line or "LogMetal" in line]
        report["render_failures"] = [line for line in log_text.splitlines() if re.search(
            r"Failed to compile|LogShaderCompilers: Error|LogMaterial: Error|Fatal error:|TSR was requested but|Temporal AntiAliasing is not supported|LogMovieRenderPipeline: Error", line)]
        valid = len(frames) == 1 and all(a["size"] == [640, 360] and a["sequence_frame"] == 64 for a in report["artifacts"])
        report["frame_files_valid"] = valid
        report["status"] = "captured-pipeline-verification-pending" if valid and report["exit_code"] == 0 and not report["render_failures"] else "capture-failed"
    if not report["source_hashes_stable"]:
        report["status"] = "source-changed"
    save()
    print(report_path)
    return 0 if report["status"] in ("process-passed", "captured-pipeline-verification-pending") else 1


if __name__ == "__main__":
    sys.exit(main())
