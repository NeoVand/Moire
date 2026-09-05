#!/usr/bin/env python3
"""Candidate ordinary-game FinalImage export; default only prints a plan.

The supported capture candidate uses the actual application binary and a real
window with the original PNG FrameGrabber protocol. Legacy offscreen plans remain
inspectable, but execution is refused because they launched crash reporters.
This is a readback diagnostic, not an FPS measurement.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--render", action="store_true")
    action.add_argument("--inspect-material", action="store_true", help="Read engine FinalImage properties under NullRHI")
    action.add_argument("--prepare-material", action="store_true", help="Create owned diagnostic copy material under NullRHI")
    parser.add_argument("--windowed", action="store_true", help="Real application window with PNG FrameGrabber; required for render")
    parser.add_argument("--shot", action="store_true", help="Plain viewport Shot after 64 warmup ticks, without a capture protocol")
    parser.add_argument("--motion", action="store_true", help="Play the prepared motion sequence, then hold the requested frame for Shot")
    parser.add_argument("--frame", type=int, help="Motion sequence frame; default120 for motion,64 fixed label")
    parser.add_argument("--copy-material", action="store_true", help="Use the owned one-node copy material instead of stock FinalImage")
    parser.add_argument("--eager-shaders", action="store_true", help="Compile material shader maps on load instead of first draw")
    parser.add_argument("--readback-warmup", type=int, choices=(0, 1, 2), default=0,
                        help="Discard this many export frames before retained frame 64 to warm copy shaders")
    parser.add_argument("--engine", type=Path, default=Path("/Users/Shared/Epic Games/UE_5.8"))
    parser.add_argument("--arm", choices=("raw", "tsr", "analytic"), default="raw")
    parser.add_argument("--pose", choices=("Glide0", "Glide8", "Approach4"), default="Glide0")
    parser.add_argument("--prepared", type=Path, help="Explicit prepare-capture JSON; default latest successful preparation")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()
    if args.render and not args.windowed:
        parser.error("Offscreen capture is disabled: its null-window ensures launched crash reporters. Use --windowed.")
    if args.windowed and (args.copy_material or args.eager_shaders or args.readback_warmup):
        parser.error("Windowed PNG capture does not use copy-material, eager-shaders, or discarded export-frame options")
    if args.shot and not args.windowed:
        parser.error("Shot requires a real --windowed application")
    if args.motion and (not args.shot or args.pose == "Glide8"):
        parser.error("Motion requires --windowed --shot with Glide0 or Approach4")
    args.frame = args.frame if args.frame is not None else 120 if args.motion else 64
    if args.motion and not 65 <= args.frame < 480:
        parser.error("Motion frame must be65..479 to include the full warmup")
    if not 1 <= args.timeout <= 600:
        parser.error("Timeout must be 1..600 seconds")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    evidence = REPO / "native/evidence" / f"viewport-diagnosis-{stamp}-{args.arm}-{args.pose}"
    engine = args.engine.resolve()
    executable = ("Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"
                  if args.windowed and not (args.inspect_material or args.prepare_material)
                  else "Engine/Binaries/Mac/UnrealEditor-Cmd")
    common = [str(engine / executable), str(PROJECT / "MoireComparison.uproject")]
    suffix = ["-unattended", "-nop4", "-nosplash", "-nosound", "-stdout", "-FullStdOutLogOutput",
              "-AbsLog=" + str(evidence / "unreal.log")]
    record = None
    if args.inspect_material or args.prepare_material:
        script = "viewport_diagnosis_prepare.py" if args.prepare_material else "viewport_diagnosis_material.py"
        command = common + ["-run=pythonscript", "-script=" + str(Path(__file__).with_name(script)), "-nullrhi"] + suffix
    else:
        name = args.pose + ("_MotionAnalytic" if args.motion and args.arm == "analytic" else "_Analytic" if args.arm == "analytic" else "")
        sequence = "/Game/MoireComparison/" + ("MotionSequences/" if args.motion else "CaptureSequences/") + name
        pattern = "prepare-motion-*.json" if args.motion else "prepare-capture-*.json"
        candidates = [args.prepared.resolve()] if args.prepared else sorted((PROJECT / "Saved/MoireComparison").glob(pattern), reverse=True)
        for preparation_path in candidates:
            preparation = json.loads(preparation_path.read_text())
            if preparation.get("status") == "passed":
                record = next((r for r in preparation["sequences"] if r["sequence"] == sequence), None)
                if record:
                    break
        if not record:
            parser.error("No successful fixed-camera preparation for this arm/pose")
        if args.motion:
            sys.path.insert(0, str(PROJECT / "Scripts"))
            import scene_contract
            trajectory = next(t for t in preparation["trajectories"] if t["name"] == args.pose)
            pose = {"name": args.pose, "motion": trajectory["motion"], "time": args.frame / 60, "detail": trajectory["detail"]}
            record = {**record, "pose": pose, "camera_pose": scene_contract.camera_pose(pose),
                      "expected_sequence_sample": trajectory["samples"][args.frame]}
        for key, ext in (("map", ".umap"), ("sequence", ".uasset")):
            if not record[key].startswith("/Game/MoireComparison/"):
                parser.error("Prepared asset outside the isolated namespace")
            file = PROJECT / "Content" / (record[key].removeprefix("/Game/") + ext)
            if not file.is_file() or sha(file) != record[key + "_sha256"]:
                parser.error(f"Prepared asset changed: {file}; regenerate camera sequences first")
        cvars = {"sg.AntiAliasingQuality": 3, "r.AntiAliasingMethod": 4 if args.arm == "tsr" else 0,
                 "r.ScreenPercentage": 100, "r.SecondaryScreenPercentage.GameViewport": 100,
                 "r.DynamicRes.OperationMode": 0, "r.TSR.History.ScreenPercentage": 200,
                 "r.MotionBlurQuality": 0, "r.DepthOfFieldQuality": 0, "r.BloomQuality": 0,
                 "r.EyeAdaptationQuality": 0, "r.EyeAdaptation.PreExposureOverride": 1,
                 "r.LensFlareQuality": 0, "r.SceneColorFringeQuality": 0,
                 "r.Tonemapper.Quality": 0, "ShowFlag.Tonemapper": 0,
                 "framegrabber.framelatency": 0}
        if args.eager_shaders:
            cvars["r.ShaderCompiler.JobCacheDDC"] = 0
        copy_path = "/Game/MoireComparison/ViewportDiagnosis/M_FinalImageCopy.M_FinalImageCopy"
        copy_file = PROJECT / "Content/MoireComparison/ViewportDiagnosis/M_FinalImageCopy.uasset"
        if args.copy_material and not copy_file.is_file():
            parser.error("Run --prepare-material first")
        material_path = copy_path if args.copy_material else "/Engine/BufferVisualization/FinalImage.FinalImage"
        render_pass = "MoireFinalImage" if args.copy_material else "FinalImage"
        command = common + [record["map"], "-game", "-RenderOffScreen", "-windowed", "-ForceRes",
            "-ResX=640", "-ResY=360", "-NoTextureStreaming",
            "-MovieSceneCaptureType=/Script/MovieSceneTools.AutomatedLevelSequenceCapture",
            "-LevelSequence=" + sequence, "-MovieFormat=CustomRenderPasses", "-CustomRenderPasses=" + render_pass,
            "-PostProcessingMaterial=" + material_path,
            "-CaptureFramesInHDR=false", "-CaptureGamut=0", "-DisableScreenPercentage=false",
            "-MovieFrameRate=60", "-MovieStartFrame=" + str(64 - args.readback_warmup), "-MovieEndFrame=65", "-MovieWarmUpFrames=64",
            "-MovieDelayBeforeWarmUp=0", "-MovieDelayBeforeShotWarmUp=0", "-MovieDelayEveryFrame=0",
            "-MovieRelativeFrames=false", "-MovieEngineScalabilityMode=false", "-MovieCinematicMode=true",
            "-UseBurnIn=false", "-WriteEditDecisionList=false", "-WriteFinalCutProXML=false", "-MovieOverwriteExisting=false",
            "-MovieFolder=" + str(evidence / "frames"), "-MovieName=" + args.arm + "_" + args.pose + ".{material}.{frame}",
            "-LogCmds=LogMovieSceneCapture VeryVerbose",
            "-ExecCmds=" + ",".join([f"{k} {v}" for k,v in cvars.items()] + list(cvars)
                                    + ["gamma 2.2", "getall Engine DisplayGamma"])] + suffix
        if args.copy_material:
            # One key/value; no commas in the value, so no legacy override token ambiguity.
            command.append("-ini:Engine:[Engine.BufferVisualizationMaterials]:MoireFinalImage=(Material=" + copy_path + ")")
        if args.eager_shaders:
            command.append("-ini:Engine:[ConsoleVariables]:r.ShaderCompiler.JobCacheDDC=0")
        if args.windowed:
            game_mode = "/Script/MovieRenderPipelineCore.MoviePipelineGameMode"
            removed = ("-RenderOffScreen", "-CustomRenderPasses=", "-PostProcessingMaterial=",
                       "-CaptureFramesInHDR=", "-CaptureGamut=", "-DisableScreenPercentage=")
            command = [c for c in command if not any(c == key or c.startswith(key) for key in removed)]
            command[2] = record["map"] + "?game=" + game_mode
            command = ["-MovieFormat=PNG" if c == "-MovieFormat=CustomRenderPasses" else
                       "-MovieName=" + args.arm + "_" + args.pose + ".{frame}" if c.startswith("-MovieName=") else c
                       for c in command]
        if args.shot:
            shot_script = Path(__file__).with_name("viewport_diagnosis_shot.py")
            command = [c for c in command if not c.startswith(("-Movie", "-LevelSequence=", "-UseBurnIn=", "-WriteEdit", "-WriteFinalCut"))]
            command = [c + ",py " + str(shot_script) if c.startswith("-ExecCmds=") else c for c in command]
            command += ["-UseFixedTimeStep", "-FPS=60"]
    plan = {"argv": command, "output_directory": str(evidence),
            "action": "prepare-material" if args.prepare_material else "inspect-material" if args.inspect_material else "render",
            "execute_requested": args.render or args.inspect_material or args.prepare_material, "renderer_will_start": args.render,
            "performance_measurement": False,
            "route": ("ordinary game viewport -> Shot/FScreenshotRequest -> PNG" if args.shot else
                      "ordinary game view -> real window -> Slate FrameGrabber -> PNG" if args.windowed else
                      "LEGACY DISABLED: offscreen CustomRenderPasses FinalImage -> RDG readback -> PNG")}
    if not (args.render or args.inspect_material or args.prepare_material):
        print(json.dumps(plan, indent=2)); return 0
    evidence.mkdir(parents=True, exist_ok=False)
    if args.render:
        (evidence / "frames").mkdir()
    process_env = None
    if args.shot:
        shot_config = evidence / "shot-config.json"
        shot_config.write_text(json.dumps({"output": str(evidence / "frames" / (args.arm + "_" + args.pose + f".{args.frame:04d}.png")),
            "record": str(evidence / "shot.json"), "world": record["map"] + "." + record["map"].rsplit("/", 1)[-1],
            "warmup_frames": 64, "motion_sequence": record["sequence"] if args.motion else None,
            "target_sequence_frame": args.frame}, indent=2) + "\n")
        process_env = {**os.environ, "MOIRE_VIEWPORT_SHOT_CONFIG": str(shot_config)}
    watched = [Path(__file__), PROJECT / "MoireComparison.uproject", PROJECT / "Config/DefaultEngine.ini",
               PROJECT / "Scripts/scene_contract.py", PROJECT / "Scripts/analytic_material.py",
               PROJECT / "Shaders/Moire/Generated/Kernel.ush", PROJECT / "Shaders/Moire/Generated/source.json",
               REPO / "demo/ours-kernel.wgsl.js", REPO / "demo/ours-kernel.hlsl"]
    watched += sorted((PROJECT / "Content/MoireComparison/Materials").glob("*.uasset"))
    if args.shot:
        watched += [shot_script, shot_config]
    if record:
        (evidence / "preparation.json").write_bytes(preparation_path.read_bytes())
        if args.copy_material:
            watched.extend([copy_file, Path(__file__).with_name("viewport_diagnosis_prepare.py")])
        watched += [PROJECT / "Content" / (record[key].removeprefix("/Game/") + ext)
                    for key,ext in (("map", ".umap"), ("sequence", ".uasset"))]
    hashes = lambda: {str(p.relative_to(REPO)): sha(p) if p.is_file() else None for p in watched}
    report = {**plan, "status": "running", "started_at": stamp, "source_hashes": hashes(), "artifacts": [],
              "engine_build": json.loads((engine / "Engine/Build/Build.version").read_text())}
    if record:
        report.update({"prepared_scene": record, "preparation_report": str(preparation_path),
                       "preparation_sha256": sha(preparation_path), "requested_cvars": cvars,
                       "contract": {"arm": args.arm, "pose": args.pose, "resolution": [640,360],
                           "fixed_fps": 60, "warmup_sequence_frames": 64, "output_sequence_frame": args.frame,
                           "sample_time_seconds": record["pose"]["time"], "camera_motion": record["pose"]["motion"],
                           "spatial_samples": 1, "temporal_subsamples": 1, "new_view_family": False,
                           "mrq": False, "highres_screenshot": False,
                           "real_window": args.windowed,
                           "ordinary_shot": args.shot,
                           "fixed_pose_sequence_label_only": args.shot and not args.motion,
                           "motion_sequence_playback": args.motion,
                           "capture_after_paused_motion_history": args.motion,
                           "motion_capture_limitation": "one additional stationary readback frame after real playback; not uninterrupted motion" if args.motion else None,
                           "game_mode": game_mode if args.windowed else "map default",
                           "preloaded_passthrough_material": None if args.windowed else material_path,
                           "buffer_visualization_material": None if args.windowed else material_path,
                           "registration": None if args.windowed else "invocation-only INI override" if args.copy_material else "engine default",
                           "eager_material_shader_compilation": args.eager_shaders,
                           "discarded_readback_warmup_frames": list(range(64 - args.readback_warmup, 64)),
                           "display_gamma": 2.2,
                           "readback_stage": "game viewport backbuffer after gamma-only tonemapper" if args.windowed else "SceneColorAfterTonemapping",
                           "readback_transfer": "power-gamma",
                           "readback_transfer_validation": "Gamma-only pow(linear, 1/display_gamma); byte palette must independently confirm"}})
    report_path = evidence / "report.json"
    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    start = time.monotonic()
    try:
        with (evidence / "stdout.log").open("w") as log:
            with subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=process_env) as process:
                report["process_id"] = process.pid
                save()
                try:
                    exit_code = process.wait(timeout=args.timeout)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                    raise
        report.update({"exit_code": exit_code, "status": "process-passed" if exit_code == 0 else "process-failed"})
    except subprocess.TimeoutExpired:
        report.update({"exit_code": 124, "status": "timed-out"})
    except OSError as error:
        report.update({"exit_code": 127, "status": "launch-failed", "failure": str(error)})
    report["elapsed_wall_seconds"] = time.monotonic() - start
    report["source_hashes_after"] = hashes()
    report["source_hashes_stable"] = report["source_hashes"] == report["source_hashes_after"]
    log_text = (evidence / "stdout.log").read_text(errors="replace")
    report["capture_lines"] = [line for line in log_text.splitlines() if any(
        key in line for key in ("LogMovieSceneCapture", "LogImageWriteQueue", "LogPython: Viewport diagnosis"))]
    report["failures"] = [line for line in log_text.splitlines() if re.search(
        r"Failed to compile|LogShaderCompilers: Error|LogMaterial: Error|Fatal error:|TSR was requested but|LogMovieSceneCapture: Error|LogImageWriteQueue: Error|LogPython: Error", line)]
    report["handled_ensures"] = [line for line in log_text.splitlines() if "Ensure condition failed:" in line]
    if args.shot:
        report["shot_record"] = json.loads((evidence / "shot.json").read_text()) if (evidence / "shot.json").exists() else None
    if args.render:
        report["console_setting_lines"] = [line for line in log_text.splitlines()
                                            if any(k in line for k in cvars) or "DisplayGamma" in line]
        report["discarded_artifacts"] = []
        for file in sorted((evidence / "frames").rglob("*.png")):
            header = file.read_bytes()[:29]
            valid = len(header) == 29 and header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR"
            size = list(struct.unpack(">II", header[16:24])) if valid else None
            frame = file.stem.rsplit(".",1)[-1]
            target = report["artifacts"] if frame.isdecimal() and int(frame) == args.frame else report["discarded_artifacts"]
            target.append({"path": str(file), "sha256": sha(file), "size": size,
                                        "png_bit_depth": header[24] if valid else None,
                                        "png_color_type": header[25] if valid else None,
                                        "sequence_frame": int(frame) if frame.isdecimal() else -1})
        valid = (len(report["artifacts"]) == 1 and all(a["size"] == [640,360] and a["sequence_frame"] == args.frame for a in report["artifacts"])
                 and [a["sequence_frame"] for a in report["discarded_artifacts"]] == list(range(64 - args.readback_warmup, 64))
                 and all(a["size"] == [640,360] for a in report["discarded_artifacts"]))
        report["frame_files_valid"] = valid
        if report["exit_code"] == 0:
            report["status"] = "captured-pipeline-verification-pending" if valid and not report["failures"] and not report["handled_ensures"] else "capture-failed"
            if args.shot and (report["shot_record"] or {}).get("status") != "captured":
                report["status"] = "capture-failed"
    elif report["failures"] and report["exit_code"] == 0:
        report["status"] = "inspection-failed"
    if not report["source_hashes_stable"]:
        report["status"] = "source-changed"
    save()
    print(report_path)
    return 0 if report["status"] in ("process-passed", "captured-pipeline-verification-pending") else 1


if __name__ == "__main__":
    sys.exit(main())
