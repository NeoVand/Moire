"""CPU-only launcher failure controls using synthetic files and a mocked process.

No fixture is an Unreal asset, executable, compiled library, or rendering result.
subprocess.Popen is always mocked; these tests cannot launch Unreal or a build.
"""

import contextlib
from datetime import datetime, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import zlib


SOURCE = Path(__file__).with_name("synchronized_comparison.py")


class LauncherControls(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="moire-launcher-cpu-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        script = self.root / "native/tools/synchronized_comparison.py"
        script.parent.mkdir(parents=True)
        shutil.copyfile(SOURCE, script)
        spec = importlib.util.spec_from_file_location("synthetic_synchronized_launcher", script)
        self.module = importlib.util.module_from_spec(spec)
        previous_bytecode = sys.dont_write_bytecode
        sys.dont_write_bytecode = True
        try:
            spec.loader.exec_module(self.module)
        finally:
            sys.dont_write_bytecode = previous_bytecode
        self.project, self.plugin = self.module.PROJECT, self.module.PLUGIN
        self.put(self.project / "MoireComparison.uproject", '{"FileVersion":3}')
        self.source = self.plugin / "Source/MoireCompare/Private/Director.cpp"
        self.put(self.source, "// synthetic source; never compiled\n")
        self.put(self.plugin / "MoireCompare.uplugin", '{"FileVersion":3}')
        self.manifest = self.plugin / "Binaries/Mac/UnrealEditor.modules"
        self.library = self.manifest.parent / "libUnrealEditor-MoireCompare.dylib"
        self.put(self.manifest, json.dumps({"Modules": {"MoireCompare": self.library.name}}))
        self.put(self.library, b"synthetic binary fixture; not executable")
        self.map = self.project / "Content/MoireComparison/Maps/Glide_Comparison.umap"
        self.material = self.project / "Content/MoireComparison/Materials/Point.uasset"
        self.put(self.map, b"synthetic map fixture")
        self.put(self.material, b"synthetic material fixture")
        self.engine = self.root / "synthetic-engine"
        for file in [self.engine / "Engine/Build/BatchFiles/Mac/Build.sh",
                     self.engine / "Engine/Binaries/Mac/UnrealEditor-Cmd",
                     self.engine / "Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor"]:
            self.put(file, "not an executable; process creation is mocked")
            file.chmod(0o755)
        stage = {}
        for name, field, relative, base in [
            ("source", "sourceSha256", "demo/kernel.hlsl", self.root),
            ("generator", "generatorSha256", "demo/kernel.js", self.root),
            ("adapter", "adapterSha256", "native/stage.mjs", self.root),
            ("output", "outputSha256", "Shaders/Moire/Generated/Kernel.ush", self.project),
        ]:
            self.put(base / relative, "synthetic " + name)
            stage.update({name: relative, field: self.module.sha(base / relative)})
        self.put(self.project / "Shaders/Moire/Generated/source.json", json.dumps(stage))
        protected = {str(self.material.relative_to(self.project)): self.module.sha(self.material)}
        sources = {str(self.source.relative_to(self.project)): self.module.sha(self.source)}
        self.preparation = self.project / "Saved/MoireComparison/prepare-comparison-20260905T231100.000000Z.json"
        self.put(self.preparation, json.dumps({"status": "passed", "map": self.module.MAP,
            "map_sha256": self.module.sha(self.map), "source_unchanged": True, "protected_assets_unchanged": True,
            "source_hashes_before": sources, "source_hashes_after": sources,
            "protected_assets_before": protected, "protected_assets_after": protected, "kernel": stage}))
        self.build = self.root / "native/evidence/synchronized-build-20260905T231000.000000Z/report.json"
        self.put(self.build, json.dumps({"action": "build", "status": "process-passed", "exit_code": 0,
            "created_at": "20260905T231000.000000Z", "elapsed_wall_seconds": 10,
            "argv": [str(self.engine / "Engine/Build/BatchFiles/Mac/Build.sh")],
            "source_hashes": self.module.source_hashes(), "source_hashes_after": self.module.source_hashes(),
            "build_source_hashes": self.module.compile_sources(),
            "plugin_binary_hashes": self.module.plugin_binaries()[0], "failures": [], "handled_ensures": []}))

    @staticmethod
    def put(file, value):
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(value if isinstance(value, bytes) else value.encode())

    def invoke(self, action="render", execute=True, wait_effect=None, output=None, extra=()):
        process = Mock(pid=765432)
        first = True
        def popen(command, **options):
            self.assertTrue(options["start_new_session"])
            folder = Path(options["stdout"].name).parent
            def wait(**_kwargs):
                nonlocal first
                if first:
                    first = False
                    if output:
                        output(folder)
                    if wait_effect:
                        raise wait_effect
                return 0
            process.wait.side_effect = wait
            return process
        arguments = [str(SOURCE), action, "--engine=" + str(self.engine), *extra]
        if execute:
            arguments.append("--execute")
        with patch.object(self.module.subprocess, "Popen", side_effect=popen) as launch, \
             patch.object(self.module.os, "killpg") as kill, patch.object(sys, "argv", arguments), \
             contextlib.redirect_stdout(io.StringIO()) as stdout:
            code = self.module.main()
        reports = sorted((self.root / "native/evidence").glob(f"synchronized-{action}-*/report.json"))
        current = next((p for p in reversed(reports) if p != self.build), None)
        return code, json.loads(current.read_text()) if current else None, launch, kill, stdout.getvalue()

    @staticmethod
    def png():
        def chunk(kind, payload):
            return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
        header = struct.pack(">IIBBBBB", 1920, 360, 8, 6, 0, 0, 0)
        pixels = (b"\0" + b"\0\0\0\xff" * 1920) * 360
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b"")

    def capture(self, directory, status="observed-unverified"):
        self.put(directory / "comparison.png", self.png())
        # Explicitly synthetic schema controls; not native observation evidence.
        self.put(directory / "views.json", json.dumps({"schema": "moire-synchronized-v1", "status": status,
            "shot_requested": True, "shot_processed": True, "shot_file_exists": True,
            "observation_frame_count": 120, "final_view_observations": [{"primary_resolution_fraction": None}] * 360}))

    def test_plan_never_spawns_or_creates_evidence(self):
        before = set((self.root / "native/evidence").iterdir())
        code, report, launch, kill, stdout = self.invoke(execute=False)
        self.assertEqual(code, 0); self.assertIsNone(report)
        launch.assert_not_called(); kill.assert_not_called()
        self.assertEqual(before, set((self.root / "native/evidence").iterdir()))
        self.assertEqual(json.loads(stdout)["status"], "planned")

    def test_complete_capture_keeps_registration_pending_and_null_primary_is_not_failure(self):
        code, report, launch, kill, _ = self.invoke(output=self.capture,
            extra=("--loop-seconds=2", "--observe-primary-raster"))
        self.assertEqual(code, 0)
        self.assertEqual(report["status"], "captured-validation-pending")
        self.assertFalse(report["performance_measurement"])
        self.assertEqual(report["loop_seconds"], 2)
        self.assertTrue(report["primary_raster_diagnostic"])
        self.assertIn("-MoireLoopSeconds=2.0", report["argv"])
        self.assertIn("-ini:Engine:[ConsoleVariables]:r.RHI.UniformBufferContentMap.Enable=1", report["argv"])
        launch.assert_called_once(); kill.assert_not_called()

    def test_changed_material_blocks_launch(self):
        self.put(self.material, b"changed since preparation")
        code, report, launch, _, _ = self.invoke()
        self.assertEqual(code, 1); self.assertEqual(report["status"], "preflight-failed")
        self.assertIn("Prepared asset", report["failure"]); launch.assert_not_called()

    def test_changed_compiled_binary_blocks_launch(self):
        self.put(self.library, b"another binary")
        code, report, launch, _, _ = self.invoke()
        self.assertEqual(code, 1); self.assertEqual(report["status"], "preflight-failed")
        self.assertIn("No successful build", report["failure"]); launch.assert_not_called()

    def test_stale_build_source_blocks_launch(self):
        self.put(self.source, "// source changed after build")
        code, report, launch, _, _ = self.invoke()
        self.assertEqual(code, 1); self.assertEqual(report["status"], "preflight-failed")
        launch.assert_not_called()

    def test_malformed_preparation_is_saved_as_preflight_failure(self):
        self.put(self.preparation, "{broken")
        code, report, launch, _, _ = self.invoke()
        self.assertEqual(code, 1); self.assertEqual(report["status"], "preflight-failed")
        launch.assert_not_called()

    def test_explicit_failed_telemetry_never_becomes_successful_capture(self):
        code, report, _, _, _ = self.invoke(output=lambda p: self.capture(p, status="failed"))
        self.assertEqual(code, 1); self.assertEqual(report["status"], "validation-failed")
        self.assertEqual(report["telemetry_status"], "failed")

    def test_malformed_telemetry_is_preserved_as_validation_failure(self):
        def output(folder):
            self.capture(folder); self.put(folder / "views.json", "{broken")
        code, report, _, _, _ = self.invoke(output=output)
        self.assertEqual(code, 1); self.assertEqual(report["status"], "validation-failed")
        self.assertIn("validation_failure", report)

    def test_header_only_png_is_rejected(self):
        def output(folder):
            self.capture(folder); self.put(folder / "comparison.png", self.png()[:29])
        code, report, _, _, _ = self.invoke(output=output)
        self.assertEqual(code, 1); self.assertEqual(report["status"], "validation-failed")

    def test_map_mutation_during_render_fails_preservation(self):
        def output(folder):
            self.capture(folder); self.put(self.map, b"modified during render")
        code, report, _, _, _ = self.invoke(output=output)
        self.assertEqual(code, 1); self.assertEqual(report["status"], "source-changed")
        self.assertFalse(report["source_hashes_stable"])

    def test_timeout_kills_surviving_owned_children_even_when_leader_exits_on_term(self):
        code, report, _, kill, _ = self.invoke(action="build", wait_effect=subprocess.TimeoutExpired("synthetic", 1))
        self.assertEqual(code, 1); self.assertEqual(report["status"], "timed-out")
        self.assertEqual(report["exit_code"], 124)
        self.assertEqual(kill.call_args_list, [unittest.mock.call(765432, signal.SIGTERM),
                                             unittest.mock.call(765432, 0), unittest.mock.call(765432, signal.SIGKILL)])
        self.assertTrue(report["process_cleanup"]["leader_reaped"])

    def test_keyboard_interrupt_stops_only_its_owned_process_group(self):
        code, report, _, kill, _ = self.invoke(action="build", wait_effect=KeyboardInterrupt())
        self.assertEqual(code, 1); self.assertEqual(report["status"], "interrupted")
        self.assertEqual(report["exit_code"], 130)
        self.assertTrue(kill.called)
        self.assertTrue(all(call.args[0] == 765432 for call in kill.call_args_list))

    def test_legacy_build_requires_in_interval_library_and_discloses_retrospective_hash(self):
        record = json.loads(self.build.read_text()); del record["plugin_binary_hashes"]
        self.put(self.build, json.dumps(record))
        start = datetime(2026, 9, 5, 23, 10, tzinfo=timezone.utc).timestamp()
        os.utime(self.library, (start + 5, start + 5))
        _, proof = self.module.build_preflight(self.engine)
        self.assertIn("Retrospective", proof["artifact_hash_origin"])
        os.utime(self.library, (start + 20, start + 20))
        with self.assertRaisesRegex(ValueError, "No successful build"):
            self.module.build_preflight(self.engine)

    def test_plugin_frame_cap_and_invalid_loop_are_rejected_before_spawn(self):
        for extra in [("--observe-frames=601",), ("--loop-seconds=nan",), ("--loop-seconds=0",)]:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                self.invoke(execute=False, extra=extra)
            self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
