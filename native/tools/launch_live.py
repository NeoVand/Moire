#!/usr/bin/env python3
"""Launch an isolated autoplay map through the ordinary game loop.

Default only prints the plan. --run opens a game window; --offscreen is for
bounded smoke/profiler runs. No movie capture or fixed simulation clock is used.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]
PROJECT = REPO / "native/Unreal/MoireComparison"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--arm", choices=("raw", "tsr", "analytic"), default="analytic")
    parser.add_argument("--path", choices=("glide", "approach"), default="glide")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--seconds", type=int, default=60, help="Bounded lifetime, including startup")
    parser.add_argument("--profile-frames", type=int, default=0, help="Optional boot CSV capture; requires later warm-up/validity analysis")
    parser.add_argument("--offscreen", action="store_true")
    parser.add_argument("--prepared", type=Path)
    parser.add_argument("--engine", type=Path, default=Path("/Users/Shared/Epic Games/UE_5.8"))
    args = parser.parse_args()
    if not (1 <= args.seconds <= 600 and 64 <= args.width <= 3840 and 64 <= args.height <= 2160):
        parser.error("Lifetime must be 1..600 seconds; dimensions must be 64..3840 by 64..2160")
    if args.width * 9 != args.height * 16:
        parser.error("These prepared cameras require a 16:9 viewport")
    if not 0 <= args.profile_frames <= 10000:
        parser.error("Profile frames must be 0..10000")
    preparations = [args.prepared.resolve()] if args.prepared else sorted((PROJECT / "Saved/MoireComparison").glob("prepare-live-*.json"), reverse=True)
    record = None
    for preparation_path in preparations:
        preparation = json.loads(preparation_path.read_text())
        if preparation.get("status") != "passed":
            continue
        record = next((r for r in preparation["maps"] if r["path"] == args.path and
                       r["arm"] == ("analytic" if args.arm == "analytic" else "raw")), None)
        if record:
            break
    if record is None:
        parser.error("Generate and verify the live maps first")
    assets = []
    for key, extension in (("map", ".umap"), ("sequence", ".uasset")):
        if not record[key].startswith("/Game/MoireComparison/"):
            parser.error("Unscoped prepared asset")
        asset = PROJECT / "Content" / (record[key].removeprefix("/Game/") + extension)
        if not asset.is_file() or sha(asset) != record[key + "_sha256"]:
            parser.error("Prepared live asset changed: " + str(asset))
        assets.append(asset)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    output = REPO / "native/evidence" / f"live-{stamp}-{args.arm}-{args.path}"
    cvars = {"r.AntiAliasingMethod": 4 if args.arm == "tsr" else 0,
             "sg.AntiAliasingQuality": 3, "r.ScreenPercentage": 100,
             "r.SecondaryScreenPercentage.GameViewport": 100, "r.DynamicRes.OperationMode": 0,
             "r.TSR.History.ScreenPercentage": 200, "r.Tonemapper.Quality": 0,
             "ShowFlag.Tonemapper": 0, "r.VSync": 0, "t.MaxFPS": 0}
    executable = args.engine / ("Engine/Binaries/Mac/UnrealEditor-Cmd" if args.offscreen else
                                "Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor")
    command = [str(executable),
               str(PROJECT / "MoireComparison.uproject"),
               record["map"] + "?game=/Script/MovieRenderPipelineCore.MoviePipelineGameMode", "-game", "-windowed",
               "-ForceRes", f"-ResX={args.width}", f"-ResY={args.height}", "-NoTextureStreaming",
               "-unattended", "-nop4", "-nosplash", "-nosound", "-stdout",
               "-AbsLog=" + str(output / "unreal.log"),
               "-ExecCmds=" + ",".join([f"{key} {value}" for key, value in cvars.items()] + ["gamma 2.2"] + list(cvars))]
    if args.offscreen:
        command.append("-RenderOffScreen")
    if args.profile_frames:
        command += [f"-csvCaptureFrames={args.profile_frames}", "-csvGpuStats", "-csvCompression=0", "-ExitAfterCsvProfiling"]
    report = {"started_at": stamp, "argv": command, "run_requested": args.run,
              "route": "ordinary game loop; persistent LevelSequenceActor autoplay; no capture protocol",
              "fixed_simulation_clock": False, "offline_view_family": False,
              "game_mode": "MoviePipelineGameMode: hides default pawn/HUD and prevents manual movement; no MRQ executor",
              "requested_display_gamma": 2.2,
              "arm": args.arm, "path": args.path, "resolution": [args.width, args.height],
              "prepared_map": record, "preparation_sha256": sha(preparation_path),
              "requested_cvars": cvars, "profile_frames_requested": args.profile_frames,
              "status": "plan", "performance_verified": False,
              "limitations": ["Runtime camera activation, replay cuts and history require separate checks.",
                              "Boot CSV includes startup/warm-up. No steady-state timing summary is implied."]}
    if not args.run:
        print(json.dumps(report, indent=2)); return 0
    output.mkdir(parents=True, exist_ok=False)
    watched = assets + list((PROJECT / "Content/MoireComparison/Materials").glob("*.uasset"))
    watched += [Path(__file__), PROJECT / "Scripts/dynamic_material.py", PROJECT / "Scripts/prepare_live.py",
                PROJECT / "MoireComparison.uproject", PROJECT / "Config/DefaultEngine.ini",
                PROJECT / "Shaders/Moire/Generated/Kernel.ush", PROJECT / "Shaders/Moire/Generated/source.json"]
    hashes = lambda: {str(p.relative_to(REPO)): sha(p) for p in watched}
    report.update({"source_hashes": hashes(), "status": "running"})
    (output / "preparation.json").write_bytes(preparation_path.read_bytes())
    report_path = output / "report.json"
    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    save()
    profile_dir = PROJECT / "Saved/Profiling/CSV"
    old_csv = set(profile_dir.glob("*.csv"))
    start = time.monotonic()
    with (output / "stdout.log").open("w") as log:
        try:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
            report["owned_pid"] = process.pid
            save()
            try:
                report["exit_code"] = process.wait(timeout=args.seconds)
                report["status"] = "exited" if report["exit_code"] == 0 else "process-failed"
            except subprocess.TimeoutExpired:
                process.terminate()
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait(timeout=10)
                report.update({"status": "bounded-run-stopped", "exit_code": process.returncode})
        except OSError as error:
            report.update({"status": "launch-failed", "failure": str(error)})
    report["elapsed_wall_seconds"] = time.monotonic() - start
    report["source_hashes_after"] = hashes()
    report["source_hashes_stable"] = report["source_hashes_after"] == report["source_hashes"]
    report["csv_artifacts"] = []
    for csv in sorted(set(profile_dir.glob("*.csv")) - old_csv):
        destination = output / csv.name
        shutil.copy2(csv, destination)
        report["csv_artifacts"].append({"file": csv.name, "sha256": sha(destination)})
    lines = (output / "stdout.log").read_text(errors="replace").splitlines()
    report["failures"] = [line for line in lines if any(s in line for s in
        ("Failed to compile", "LogShaderCompilers: Error", "Fatal error:", "LogMaterial: Error"))]
    report["console_setting_lines"] = [line for line in lines if any(key + " =" in line for key in cvars)]
    if not report["source_hashes_stable"] or report["failures"]:
        report["status"] = "validation-failed"
    save(); print(report_path)
    return 0 if report["status"] in ("exited", "bounded-run-stopped") else 1


if __name__ == "__main__":
    sys.exit(main())
