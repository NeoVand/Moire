#!/usr/bin/env python3
"""Prepare or capture the isolated native comparison; default only prints a plan.

--prepare creates owned camera-cut sequences under NullRHI.
--render starts one offscreen main-game-viewport capture, never another editor.
Capture output is correctness evidence, not a real-time performance benchmark.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"
SCRIPTS = PROJECT / "Scripts"
DEFAULT_ENGINE = Path("/Users/Shared/Epic Games/UE_5.8")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--prepare", action="store_true")
    action.add_argument("--render", action="store_true")
    parser.add_argument("--engine", type=Path, default=DEFAULT_ENGINE)
    parser.add_argument("--pose", choices=("Glide0", "Glide8", "Approach4"), default="Glide0")
    parser.add_argument("--arm", choices=("raw", "tsr", "analytic"), default="raw")
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--warmup", type=int, default=64)
    parser.add_argument("--frames", type=int, default=1)
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    if not (16 <= args.width <= 4096 and 16 <= args.height <= 2304 and args.width * 9 == args.height * 16):
        parser.error("Use a 16:9 viewport from 16 pixels to 4096×2304; native camera/material rows are fixed to that aspect.")
    if not (0 <= args.warmup <= 256 and 1 <= args.frames <= 16 and 1 <= args.timeout <= 1800):
        parser.error("Warm-up must be 0..256, saved frames 1..16, timeout 1..1800 seconds.")
    engine = args.engine.resolve()
    executable = engine / "Engine/Binaries/Mac/UnrealEditor-Cmd"
    name = args.pose + ("_Analytic" if args.arm == "analytic" else "")
    map_path = "/Game/MoireComparison/Maps/" + name
    sequence = "/Game/MoireComparison/CaptureSequences/" + name
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = REPO / "native/evidence" / (f"capture-prepare-{stamp}" if args.prepare else f"capture-{stamp}-{args.arm}-{args.pose}")
    common = [str(executable), str(PROJECT / "MoireComparison.uproject")]
    suffix = ["-unattended", "-nop4", "-nosplash", "-nosound", "-stdout", "-FullStdOutLogOutput",
              "-AbsLog=" + str(evidence / "unreal.log")]
    if args.prepare:
        command = common + ["-run=pythonscript", "-script=" + str(SCRIPTS / "prepare_capture.py"), "-nullrhi"] + suffix
    else:
        aa = 4 if args.arm == "tsr" else 0
        cvars = {"sg.AntiAliasingQuality": 3, "r.AntiAliasingMethod": aa, "r.ScreenPercentage": 100,
                 "r.SecondaryScreenPercentage.GameViewport": 100, "r.DynamicRes.OperationMode": 0,
                 "r.TSR.History.ScreenPercentage": 200, "r.MotionBlurQuality": 0,
                 "r.SkipPresentOnCameraCut": 0, "ShowFlag.Tonemapper": 0}
        commands = [f"{key} {value}" for key, value in cvars.items()] + list(cvars)
        command = common + [map_path, "-game", "-RenderOffScreen", "-windowed", "-ForceRes",
            f"-ResX={args.width}", f"-ResY={args.height}", "-NoTextureStreaming",
            "-MovieSceneCaptureType=/Script/MovieSceneTools.AutomatedLevelSequenceCapture",
            "-LevelSequence=" + sequence, "-MovieFormat=PNG", "-MovieFrameRate=60",
            f"-MovieStartFrame={args.warmup}", f"-MovieEndFrame={args.warmup + args.frames}",
            f"-MovieWarmUpFrames={args.warmup}", "-MovieDelayBeforeWarmUp=0",
            "-MovieDelayBeforeShotWarmUp=0", "-MovieDelayEveryFrame=0", "-MovieRelativeFrames=false",
            "-MovieEngineScalabilityMode=false", "-MovieCinematicMode=true", "-UseBurnIn=false",
            "-WriteEditDecisionList=false", "-WriteFinalCutProXML=false", "-MovieOverwriteExisting=false",
            "-MovieFolder=" + str(evidence / "frames"), "-MovieName=" + args.arm + "_" + args.pose + ".{frame}",
            "-LogCmds=LogMovieSceneCapture VeryVerbose", "-ExecCmds=" + ",".join(commands)] + suffix
    plan = {"action": "prepare" if args.prepare else "render", "argv": command,
            "output_directory": str(evidence), "renderer_will_start": bool(args.render),
            "execute_requested": args.prepare or args.render}
    if not (args.prepare or args.render):
        print(json.dumps(plan, indent=2)); return 0

    if args.render:
        prepared = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-capture-*.json"))
        if not prepared:
            parser.error("No prepared camera sequences; run --prepare first.")
        preparation_path = prepared[-1]
        preparation = json.loads(preparation_path.read_text())
        record = next((x for x in preparation.get("sequences", []) if x["sequence"] == sequence), None)
        if preparation.get("status") != "passed" or not record:
            parser.error("Latest camera sequence preparation did not succeed for this map.")
        for asset, extension, key in [(map_path, ".umap", "map_sha256"), (sequence, ".uasset", "sequence_sha256")]:
            file = PROJECT / "Content" / (asset.removeprefix("/Game/") + extension)
            if not file.is_file() or sha(file) != record[key]:
                parser.error(f"Prepared asset changed: {file}; run --prepare again.")

    evidence.mkdir(parents=True, exist_ok=False)
    if args.render:
        (evidence / "frames").mkdir()
    watched = [Path(__file__), SCRIPTS / "prepare_capture.py", SCRIPTS / "scene_contract.py",
               SCRIPTS / "analytic_material.py", PROJECT / "MoireComparison.uproject",
               PROJECT / "Config/DefaultEngine.ini", PROJECT / "Shaders/Moire/Generated/Kernel.ush",
               PROJECT / "Shaders/Moire/Generated/source.json", REPO / "demo/ours-kernel.wgsl.js",
               REPO / "demo/ours-kernel.hlsl"]
    watched += sorted((PROJECT / "Content/MoireComparison/Materials").glob("*.uasset"))
    hashes = lambda: {str(p.relative_to(REPO)): sha(p) for p in watched}
    report = {**plan, "started_at": stamp, "status": "running", "source_hashes": hashes(),
              "engine_build": json.loads((engine / "Engine/Build/Build.version").read_text()),
              "capture_contract": {"pose": args.pose, "arm": args.arm, "map": map_path, "sequence": sequence,
                  "output_size_requested": [args.width, args.height], "fixed_fps": 60,
                  "warmup_sequence_frames": args.warmup, "output_sequence_frames": list(range(args.warmup, args.warmup + args.frames)),
                  "spatial_samples": 1, "temporal_subsamples": 1, "tiling": False,
                  "readback": "PNG from normal game-viewport backbuffer; 8-bit output, transfer function not yet calibrated",
                  "performance_measurement": False}, "artifacts": []}
    if args.render:
        report.update({"preparation_report": str(preparation_path), "preparation_sha256": sha(preparation_path),
                       "requested_cvars": cvars, "prepared_assets": record})
    report_path = evidence / "report.json"
    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    started = time.monotonic()
    try:
        with (evidence / "stdout.log").open("w") as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=args.timeout)
        report["exit_code"] = result.returncode
        report["status"] = "process-passed" if result.returncode == 0 else "process-failed"
    except subprocess.TimeoutExpired:
        report.update({"exit_code": 124, "status": "timed-out"})
    except OSError as error:
        report.update({"exit_code": 127, "status": "launch-failed", "failure": str(error)})
    report["elapsed_wall_seconds"] = time.monotonic() - started
    report["source_hashes_after"] = hashes()
    report["source_hashes_stable"] = report["source_hashes"] == report["source_hashes_after"]
    if args.prepare:
        generated = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-capture-*.json"))
        latest = json.loads(generated[-1].read_text()) if generated else {}
        valid = latest.get("created_at", "") >= stamp and latest.get("status") == "passed" and len(latest.get("sequences", [])) == 6
        if valid:
            report["preparation_report"] = str(generated[-1])
            report["preparation_sha256"] = sha(generated[-1])
            report["preparation"] = latest
        elif report["exit_code"] == 0:
            report["status"] = "preparation-failed"
    if args.render:
        frames = sorted((evidence / "frames").glob("*.png"))
        for file in frames:
            header = file.read_bytes()[:24]
            valid = len(header) == 24 and header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR"
            size = list(struct.unpack(">II", header[16:24])) if valid else None
            frame_text = file.stem.rsplit(".", 1)[-1]
            report["artifacts"].append({"path": str(file), "sha256": sha(file), "size": size,
                                        "sequence_frame": int(frame_text) if frame_text.isdecimal() else -1})
        text = (evidence / "stdout.log").read_text(errors="replace")
        report["captured_frame_log"] = [int(x) for x in re.findall(r"Captured frame: (\d+)", text)]
        report["console_setting_lines"] = [line for line in text.splitlines() if any(key in line for key in cvars)]
        report["renderer_log_lines"] = [line for line in text.splitlines() if "LogRHI" in line or "LogMetal" in line]
        report["render_failures"] = [line for line in text.splitlines() if re.search(
            r"Failed to compile|LogShaderCompilers: Error|LogMaterial: Error|Fatal error:|TSR was requested but", line)]
        valid = (len(frames) == args.frames and all(a["size"] == [args.width, args.height] for a in report["artifacts"])
                 and sorted(a["sequence_frame"] for a in report["artifacts"]) == report["capture_contract"]["output_sequence_frames"])
        report["frame_files_valid"] = valid
        report["status"] = "captured-pipeline-verification-pending" if valid and report["exit_code"] == 0 and not report["render_failures"] else "capture-failed"
    if not report["source_hashes_stable"]:
        report["status"] = "source-changed"
    save()
    print(report_path)
    return 0 if report["status"] in ("process-passed", "captured-pipeline-verification-pending") else 1


if __name__ == "__main__":
    sys.exit(main())
