#!/usr/bin/env python3
"""Build, prepare, or observe the isolated synchronized Unreal comparison.

Prints a plan unless --execute is supplied. Rendering opens a real game window;
coordinate GPU ownership first. Observation/capture runs are not FPS benchmarks.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import struct
import subprocess
import sys
import time
import zlib

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"
PLUGIN = PROJECT / "Plugins/MoireCompare"
MAP = "/Game/MoireComparison/Maps/Glide_Comparison"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes(include_map=False):
    files = [PROJECT / "MoireComparison.uproject", Path(__file__)]
    files += sorted((PROJECT / "Config").glob("*.ini"))
    files += sorted((PROJECT / "Scripts").glob("*.py"))
    files += [p for p in PLUGIN.rglob("*") if p.is_file()
              and p.suffix in (".h", ".cpp", ".cs", ".uplugin")
              and not {"Intermediate", "Binaries"}.intersection(p.parts)]
    files += sorted((PROJECT / "Shaders/Moire/Generated").glob("*"))
    files += [p for p in (PROJECT / "Content").rglob("*") if p.is_file()
              and p.suffix in (".uasset", ".umap", ".uexp", ".ubulk")
              and (include_map or p != PROJECT / "Content/MoireComparison/Maps/Glide_Comparison.umap")]
    return {str(p.relative_to(REPO)): sha(p) for p in files if p.is_file()}


def read_object(file):
    value = json.loads(file.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object: {file}")
    return value


def compile_sources():
    files = [PROJECT / "MoireComparison.uproject"]
    files += [p for p in PLUGIN.rglob("*") if p.is_file()
              and p.suffix in (".h", ".cpp", ".cs", ".uplugin")
              and not {"Intermediate", "Binaries"}.intersection(p.parts)]
    return {str(p.relative_to(REPO)): sha(p) for p in sorted(files)}


def plugin_binaries():
    manifest = PLUGIN / "Binaries/Mac/UnrealEditor.modules"
    record = read_object(manifest)
    name = record.get("Modules", {}).get("MoireCompare")
    if not isinstance(name, str) or Path(name).name != name or not name.endswith(".dylib"):
        raise ValueError("MoireCompare is missing from its compiled module manifest")
    library = manifest.parent / name
    if not library.is_file():
        raise ValueError("Compiled MoireCompare library is missing")
    return {str(p.relative_to(REPO)): sha(p) for p in (manifest, library)}, library


def verify_files(record, base, label):
    if not isinstance(record, dict) or not record:
        raise ValueError(f"Missing {label} hash records")
    for relative, expected in record.items():
        file = (base / relative).resolve()
        if not file.is_relative_to(base.resolve()) or not file.is_file() or sha(file) != expected:
            raise ValueError(f"{label} changed or unavailable: {relative}")


def build_preflight(engine):
    current_sources = compile_sources()
    current_binaries, library = plugin_binaries()
    reports = sorted((REPO / "native/evidence").glob("synchronized-build-*/report.json"), reverse=True)
    for file in reports:
        record = read_object(file)
        if record.get("status") != "process-passed" or record.get("exit_code") != 0:
            continue
        if record.get("source_hashes") != record.get("source_hashes_after") or record.get("failures") or record.get("handled_ensures"):
            continue
        previous_sources = record.get("build_source_hashes", record.get("source_hashes", {}))
        if any(previous_sources.get(p) != h for p, h in current_sources.items()):
            continue
        if Path(record.get("argv", [""])[0]).resolve() != (engine / "Engine/Build/BatchFiles/Mac/Build.sh").resolve():
            continue
        if "plugin_binary_hashes" in record:
            if record["plugin_binary_hashes"] != current_binaries:
                continue
            origin = "Binary hashes recorded by the successful build wrapper"
        else:
            # The first successful build predates artifact hashing. Do not label
            # a later observation as an original build-time hash: require its
            # library timestamp inside that successful build and disclose it.
            start = datetime.strptime(record["created_at"], "%Y%m%dT%H%M%S.%fZ").replace(tzinfo=timezone.utc).timestamp()
            if not start <= library.stat().st_mtime <= start + record.get("elapsed_wall_seconds", 0):
                continue
            origin = "Retrospective artifact hashes; legacy build had matching stable sources and library mtime inside its recorded build interval, but no original binary hash"
        return file, {"report_sha256": sha(file), "build_source_hashes": current_sources,
                      "plugin_binary_hashes": current_binaries, "artifact_hash_origin": origin}
    raise ValueError("No successful build matches the current plugin/project source and binary; run build --execute first")


def preparation_preflight():
    paths = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-comparison-*.json"), reverse=True)
    for file in paths:
        record = read_object(file)
        if record.get("status") != "passed":
            continue
        if (record.get("source_unchanged") is not True or record.get("protected_assets_unchanged") is not True
                or record.get("source_hashes_before") != record.get("source_hashes_after")
                or record.get("protected_assets_before") != record.get("protected_assets_after")):
            raise ValueError("Successful preparation lacks unchanged source/asset verification")
        verify_files(record.get("source_hashes_after"), PROJECT, "Prepared source")
        verify_files(record.get("protected_assets_after"), PROJECT, "Prepared asset")
        if record.get("map") != MAP or record.get("map_sha256") != sha(PROJECT / "Content/MoireComparison/Maps/Glide_Comparison.umap"):
            raise ValueError("Comparison map differs from its successful preparation")
        stage = read_object(PROJECT / "Shaders/Moire/Generated/source.json")
        if stage != record.get("kernel"):
            raise ValueError("Prepared analytic kernel stage changed")
        for name, hash_name, base in [("source", "sourceSha256", REPO), ("generator", "generatorSha256", REPO),
                                      ("adapter", "adapterSha256", REPO), ("output", "outputSha256", PROJECT)]:
            verify_files({stage[name]: stage[hash_name]}, base, "Staged kernel")
        return file
    raise ValueError("Build and prepare the synchronized map first")


def stop_owned_group(process):
    """Only signal the new session created by this wrapper, including children."""
    result = {"process_group": process.pid, "term_requested": False, "kill_requested": False}
    try:
        os.killpg(process.pid, signal.SIGTERM)
        result["term_requested"] = True
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    # A parent can exit on TERM while its children ignore it. Check the owned
    # group even after the leader exits, instead of trusting leader.wait().
    try:
        os.killpg(process.pid, 0)
        os.killpg(process.pid, signal.SIGKILL)
        result["kill_requested"] = True
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
        result["leader_reaped"] = True
    except subprocess.TimeoutExpired:
        result["leader_reaped"] = False
    return result


def inspect_png(file):
    data = file.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Capture is not a PNG")
    position, image_data, header, ended = 8, bytearray(), None, False
    while position + 12 <= len(data):
        size = struct.unpack(">I", data[position:position + 4])[0]
        kind = data[position + 4:position + 8]
        payload = data[position + 8:position + 8 + size]
        end = position + size + 12
        if end > len(data) or zlib.crc32(kind + payload) != struct.unpack(">I", data[end - 4:end])[0]:
            raise ValueError("Truncated or corrupt PNG chunk")
        if header is None and kind != b"IHDR":
            raise ValueError("Missing PNG header")
        if kind == b"IHDR":
            if header is not None or size != 13:
                raise ValueError("Invalid PNG header")
            header = struct.unpack(">IIBBBBB", payload)
            if header[:2] != (1920, 360) or header[2] != 8 or header[3] not in (2, 6) or header[4:] != (0, 0, 0):
                raise ValueError("Expected a 1920x360, 8-bit RGB/RGBA, noninterlaced PNG")
        elif kind == b"IDAT":
            image_data.extend(payload)
        elif kind == b"IEND":
            ended = size == 0 and end == len(data)
            break
        position = end
    if not ended or not image_data or header is None:
        raise ValueError("Incomplete PNG capture")
    row_bytes = header[0] * (3 if header[3] == 2 else 4) + 1
    decoded = zlib.decompress(image_data)
    if len(decoded) != row_bytes * header[1] or any(decoded[i] > 4 for i in range(0, len(decoded), row_bytes)):
        raise ValueError("Invalid PNG pixel stream")
    return {"path": str(file), "sha256": sha(file), "size": list(header[:2]), "bit_depth": header[2], "color_type": header[3]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("build", "prepare", "render"))
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--engine", type=Path, default=Path("/Users/Shared/Epic Games/UE_5.8"))
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--fixed-time", type=float, help="Static camera control in seconds; omitted uses game time")
    parser.add_argument("--third-tsr", action="store_true", help="Combine analytic shading and TSR in the third pane")
    parser.add_argument("--loop-seconds", type=float, help="Positive deliberate cut interval; omitted disables looping")
    parser.add_argument("--observe-primary-raster", action="store_true", help="Diagnostic CPU uniform-buffer copies; not a performance run")
    parser.add_argument("--observe-frames", type=int, default=120)
    parser.add_argument("--shot-frame", type=int, default=90)
    args = parser.parse_args()
    if not 1 <= args.timeout <= 900:
        parser.error("Timeout must be 1..900 seconds")
    if not 16 <= args.observe_frames <= 600 or not 8 <= args.shot_frame <= args.observe_frames - 8:
        parser.error("Observe 16..600 frames, leaving at least eight observations after Shot")
    if args.fixed_time is not None and (not math.isfinite(args.fixed_time) or not 0 <= args.fixed_time <= 3600):
        parser.error("Fixed time must be finite and in 0..3600 seconds")
    if args.loop_seconds is not None and (not math.isfinite(args.loop_seconds) or args.loop_seconds <= 0):
        parser.error("Loop seconds must be finite and positive when supplied")
    engine = args.engine.resolve()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = REPO / "native/evidence" / f"synchronized-{args.action}-{stamp}"
    project_file = PROJECT / "MoireComparison.uproject"
    if not project_file.is_file() or PROJECT.resolve() != project_file.resolve().parent:
        parser.error("Isolated project is unavailable")
    prefix = engine / "Engine/Binaries/Mac"
    cvars = {"sg.AntiAliasingQuality": 3, "r.AntiAliasingMethod": 4,
             "r.ScreenPercentage": 100, "r.SecondaryScreenPercentage.GameViewport": 100,
             "r.DynamicRes.OperationMode": 0, "r.TSR.History.ScreenPercentage": 200,
             "r.MotionBlurQuality": 0, "r.DepthOfFieldQuality": 0, "r.BloomQuality": 0,
             "r.EyeAdaptationQuality": 0, "r.EyeAdaptation.PreExposureOverride": 1,
             "r.LensFlareQuality": 0, "r.SceneColorFringeQuality": 0,
             "r.Tonemapper.Quality": 0, "ShowFlag.Tonemapper": 0, "r.VSync": 0}
    suffix = ["-unattended", "-nop4", "-nosplash", "-nosound", "-stdout", "-FullStdOutLogOutput",
              "-AbsLog=" + str(evidence / "unreal.log")]
    if args.action == "build":
        command = [str(engine / "Engine/Build/BatchFiles/Mac/Build.sh"),
                   "UnrealEditor", "Mac", "Development", "-Project=" + str(project_file),
                   "-architecture=arm64", "-WaitMutex", "-NoHotReloadFromIDE"]
    elif args.action == "prepare":
        command = [str(prefix / "UnrealEditor-Cmd"), str(project_file), "-run=pythonscript",
                   "-script=" + str(PROJECT / "Scripts/prepare_comparison.py"), "-nullrhi"] + suffix
    else:
        command = [str(prefix / "UnrealEditor.app/Contents/MacOS/UnrealEditor"), str(project_file),
                   MAP + "?game=/Script/MovieRenderPipelineCore.MoviePipelineGameMode", "-game",
                   "-windowed", "-ForceRes", "-ResX=1920", "-ResY=360", "-NoTextureStreaming",
                   "-MoireSynchronized", "-MoireReport=" + str(evidence / "views.json"),
                   "-MoireObserveFrames=" + str(args.observe_frames),
                   "-MoireShotFrame=" + str(args.shot_frame),
                   "-MoireShotPath=" + str(evidence / "comparison.png"), "-MoireQuitAfterObservations",
                   "-ExecCmds=" + ",".join([f"{k} {v}" for k, v in cvars.items()] + list(cvars)
                                              + ["gamma 2.2", "getall Engine DisplayGamma"])] + suffix
        if args.fixed_time is not None:
            command.append("-MoireFixedTime=" + str(args.fixed_time))
        if args.third_tsr:
            command.append("-MoireThirdTSR")
        if args.loop_seconds is not None:
            command.append("-MoireLoopSeconds=" + str(args.loop_seconds))
        if args.observe_primary_raster:
            command.append("-ini:Engine:[ConsoleVariables]:r.RHI.UniformBufferContentMap.Enable=1")
    report = {"action": args.action, "argv": command, "execute_requested": args.execute,
              "created_at": stamp, "output_directory": str(evidence), "timeout_seconds": args.timeout,
              "renderer_will_start": args.action == "render", "performance_measurement": False,
              "source_hashes": source_hashes(include_map=args.action == "render"), "status": "planned"}
    if args.action == "render":
        report.update({"requested_window_pixels": [1920, 360], "requested_pane_pixels": [640, 360],
                       "fixed_time_seconds": args.fixed_time, "third_tsr": args.third_tsr,
                       "requested_cvars": cvars, "saved_frame_identity": "unassigned until independent registration",
                       "clock": "ordinary game time", "paused_for_capture": False,
                       "loop_seconds": args.loop_seconds or 0,
                       "primary_raster_diagnostic": args.observe_primary_raster,
                       "diagnostic_overhead": "CPU uniform-buffer content copies enabled; no performance claim" if args.observe_primary_raster else None})
    if not args.execute:
        print(json.dumps(report, indent=2)); return 0
    evidence.mkdir(parents=True, exist_ok=False)
    report_file = evidence / "report.json"
    def save():
        report_file.write_text(json.dumps(report, indent=2) + "\n")
    save()
    try:
        if not Path(command[0]).is_file() or not os.access(command[0], os.X_OK):
            raise ValueError("Requested engine executable/build script is unavailable or not executable")
        report["build_source_hashes"] = compile_sources()
        if args.action in ("prepare", "render"):
            build_file, report["build_provenance"] = build_preflight(engine)
            (evidence / "build.json").write_bytes(build_file.read_bytes())
            report["plugin_binary_hashes_before"] = report["build_provenance"]["plugin_binary_hashes"]
        if args.action == "render":
            preparation_file = preparation_preflight()
            (evidence / "preparation.json").write_bytes(preparation_file.read_bytes())
            report["preparation_sha256"] = sha(preparation_file)
            report["map_sha256"] = sha(PROJECT / "Content/MoireComparison/Maps/Glide_Comparison.umap")
    except (OSError, ValueError, KeyError, TypeError) as error:
        report.update(status="preflight-failed", failure=str(error))
        save(); print(report_file); return 1
    start = time.monotonic()
    process = None
    abnormal = False
    old_sigterm = signal.getsignal(signal.SIGTERM)
    def interrupt(_signal, _frame):
        raise KeyboardInterrupt("Launcher termination requested")
    signal.signal(signal.SIGTERM, interrupt)
    try:
        with (evidence / "stdout.log").open("w") as log:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            report.update(status="running", process_id=process.pid)
            save()
            try:
                code = process.wait(timeout=args.timeout)
                report.update(exit_code=code, status="process-passed" if code == 0 else "process-failed")
            except subprocess.TimeoutExpired:
                abnormal = True
                report.update(exit_code=124, status="timed-out")
    except KeyboardInterrupt:
        abnormal = True
        report.update(exit_code=130, status="interrupted")
    except Exception as error:
        abnormal = True
        report.update(exit_code=127, status="launch-failed", failure=str(error))
    finally:
        if abnormal and process is not None:
            try:
                report["process_cleanup"] = stop_owned_group(process)
                if not report["process_cleanup"].get("leader_reaped"):
                    report["cleanup_failed"] = True
            except (OSError, subprocess.SubprocessError) as error:
                report["cleanup_failed"] = True
                report["cleanup_error"] = str(error)
        signal.signal(signal.SIGTERM, old_sigterm)
    report["elapsed_wall_seconds"] = time.monotonic() - start
    try:
        report["source_hashes_after"] = source_hashes(include_map=args.action == "render")
        report["source_hashes_stable"] = report["source_hashes"] == report["source_hashes_after"]
        log_path = evidence / "stdout.log"
        lines = log_path.read_text(errors="replace").splitlines() if log_path.exists() else []
        report["failures"] = [line for line in lines if re.search(
            r"\berror:|Failed to compile|LogShaderCompilers: Error|LogMaterial: Error|Fatal error:|LogPython: Error|LogMoireCompare: Error|TSR was requested but", line)]
        report["handled_ensures"] = [line for line in lines if "Ensure condition failed:" in line]
        report["result_lines"] = [line for line in lines if any(key in line for key in
            ("Result:", "Total execution time", "LogMoireCompare:", "LogPython: Moire comparison", "LogScreenshot"))]
        if args.action == "build" and report["status"] == "process-passed":
            report["plugin_binary_hashes"], _ = plugin_binaries()
        if args.action in ("prepare", "render"):
            report["plugin_binary_hashes_after"], _ = plugin_binaries()
            report["plugin_binaries_stable"] = report["plugin_binary_hashes_before"] == report["plugin_binary_hashes_after"]
            if not report["plugin_binaries_stable"]:
                report["status"] = "binary-changed"
        if args.action == "prepare":
            fresh = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-comparison-*.json"))
            fresh = [p for p in fresh if p.name.removeprefix("prepare-comparison-") >= stamp]
            if len(fresh) == 1:
                prepared = read_object(fresh[0])
                report["preparation_status"] = prepared.get("status")
                report["preparation_sha256"] = sha(fresh[0])
                (evidence / "preparation.json").write_bytes(fresh[0].read_bytes())
                if prepared.get("protected_assets_unchanged") is not True or prepared.get("source_unchanged") is not True:
                    raise ValueError("Preparation did not prove source and existing-asset preservation")
                if preparation_preflight() != fresh[0]:
                    raise ValueError("Fresh preparation does not match the current scene and source")
            if report.get("preparation_status") != "passed":
                report["status"] = "preparation-failed"
        if args.action == "render":
            report["image"] = inspect_png(evidence / "comparison.png")
            telemetry = read_object(evidence / "views.json")
            report["telemetry_status"] = telemetry.get("status")
            observations = telemetry.get("final_view_observations")
            if (telemetry.get("schema") != "moire-synchronized-v1" or telemetry.get("status") != "observed-unverified"
                    or telemetry.get("failure") or telemetry.get("shot_processed") is not True
                    or telemetry.get("shot_requested") is not True or telemetry.get("shot_file_exists") is not True
                    or telemetry.get("observation_frame_count") != args.observe_frames
                    or not isinstance(observations, list) or len(observations) < args.observe_frames * 3):
                raise ValueError("Telemetry reports failure, incomplete observations, or unsuccessful Shot processing")
            # Camera/pixel registration, individual primary-raster availability,
            # and AA correctness remain the independent validator's responsibility.
            if report["status"] == "process-passed":
                report["status"] = "captured-validation-pending"
        if report["failures"] or report["handled_ensures"]:
            report["status"] = "execution-errors"
        if not report["source_hashes_stable"]:
            report["status"] = "source-changed"
    except (OSError, ValueError, KeyError, TypeError, zlib.error, struct.error) as error:
        report["validation_failure"] = str(error)
        if report["status"] in ("process-passed", "captured-validation-pending"):
            report["status"] = "validation-failed"
    if report.get("cleanup_failed"):
        report["status"] = "cleanup-failed"
    save()
    print(report_file)
    return 0 if report["status"] in ("process-passed", "captured-validation-pending") else 1


if __name__ == "__main__":
    sys.exit(main())
