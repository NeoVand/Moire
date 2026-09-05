"""Create isolated MRQ quality-capture presets under NullRHI; never render.

Uses already verified fixed-camera sequences. Each preparation has a unique
asset namespace and output directory, so prior capture evidence is preserved.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import unreal

PROJECT = Path(__file__).resolve().parent.parent
OWNER_TAG = "MoireComparisonGenerator"
OWNER = "native-mrq-v1"
WIDTH, HEIGHT, WARMUP = 640, 360, 64


def require(value, message):
    if not value:
        raise RuntimeError(message)
    return value


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def package_file(path, extension):
    require(path.startswith("/Game/MoireComparison/"), "Asset outside owned namespace")
    return PROJECT / "Content" / (path.removeprefix("/Game/") + extension)


def configure(setting, values):
    for key, value in values.items():
        setting.set_editor_property(key, value)


def main():
    require(Path(unreal.SystemLibrary.get_project_directory()).resolve() == PROJECT, "Wrong project")
    require(hasattr(unreal, "MoviePipelinePrimaryConfigFactory"), "Enable MovieRenderPipeline in this project")
    reports = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-capture-*.json"))
    require(reports, "Prepare the owned fixed-camera sequences first")
    preparation = json.loads(reports[-1].read_text())
    require(preparation.get("status") == "passed", "Camera sequence preparation failed")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    folder = "/Game/MoireComparison/MRQ/B" + stamp.replace(".", "_")
    output_root = PROJECT / "Saved/MoireComparison/MRQ" / stamp
    report_path = PROJECT / "Saved/MoireComparison" / f"prepare-mrq-{stamp}.json"
    report = {"created_at": stamp, "status": "running", "project": str(PROJECT), "generator": OWNER,
              "engine": unreal.SystemLibrary.get_engine_version(), "rendered": False,
              "sequence_preparation": str(reports[-1]), "sequence_preparation_sha256": sha(reports[-1]),
              "script_sha256": sha(Path(__file__)), "configs": []}
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    assets.make_directory(folder)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    try:
        for source in preparation["sequences"]:
            for path, extension, key, owner in (
                (source["map"], ".umap", "map_sha256", "native-scene-v1"),
                (source["sequence"], ".uasset", "sequence_sha256", "native-capture-v1"),
            ):
                obj = require(unreal.load_asset(path), f"Missing prepared asset: {path}")
                require(assets.get_metadata_tag(obj, OWNER_TAG) == owner, f"Unowned source asset: {path}")
                require(sha(package_file(path, extension)) == source[key], f"Source asset changed: {path}")
            for arm in source["arms"]:
                name = arm + "_" + source["pose"]["name"]
                config_path = folder + "/" + name
                require(not assets.does_asset_exist(config_path), f"Refusing to overwrite {config_path}")
                config = require(tools.create_asset(name, folder, unreal.MoviePipelinePrimaryConfig,
                                                    unreal.MoviePipelinePrimaryConfigFactory()), config_path)
                add = config.find_or_add_setting_by_class
                output_directory = output_root / name
                configure(add(unreal.MoviePipelineOutputSetting), {
                    "output_directory": unreal.DirectoryPath(str(output_directory)),
                    "file_name_format": name + ".{frame_number}",
                    "output_resolution": unreal.IntPoint(WIDTH, HEIGHT),
                    "use_custom_frame_rate": True, "output_frame_rate": unreal.FrameRate(60, 1),
                    "override_existing_output": False, "handle_frame_count": 0, "output_frame_step": 1,
                    "use_custom_playback_range": True, "custom_start_frame": 64, "custom_end_frame": 65,
                    "auto_version": False, "version_number": 1, "zero_pad_frame_numbers": 4,
                    "frame_number_offset": 0, "flush_disk_writes_per_shot": True,
                })
                aa_method = unreal.AntiAliasingMethod.AAM_TSR if arm == "tsr" else unreal.AntiAliasingMethod.AAM_NONE
                configure(add(unreal.MoviePipelineAntiAliasingSetting), {
                    "spatial_sample_count": 1, "temporal_sample_count": 1, "override_anti_aliasing": True,
                    "anti_aliasing_method": aa_method, "render_warm_up_count": WARMUP,
                    "use_camera_cut_for_warm_up": False, "engine_warm_up_count": 0, "render_warm_up_frames": False,
                })
                configure(add(unreal.MoviePipelineDeferredPassBase), {
                    "disable_multisample_effects": False, "render_main_pass": True,
                    "additional_post_process_materials": [], "add_default_layer": False,
                    "accumulator_includes_alpha": False,
                })
                configure(add(unreal.MoviePipelineImageSequenceOutput_PNG), {"write_alpha": False})
                configure(add(unreal.MoviePipelineColorSetting), {"disable_tone_curve": True})
                # MRQ otherwise silently creates a transient game override using cinematic scalability.
                configure(add(unreal.MoviePipelineGameOverrideSetting), {
                    "cinematic_quality_settings": False, "use_lod_zero": False, "disable_hlods": False,
                    "use_high_quality_shadows": False, "override_view_distance_scale": False,
                    "flush_grass_streaming": False, "override_grass_cull_distance_scale": False,
                    "override_grass_density_scale": False, "flush_streaming_managers": False,
                    "override_virtual_texture_feedback_factor": False,
                })
                cvars = {"sg.AntiAliasingQuality": 3, "r.AntiAliasingMethod": 4 if arm == "tsr" else 0,
                         "r.ScreenPercentage": 100, "r.SecondaryScreenPercentage.GameViewport": 100,
                         "r.DynamicRes.OperationMode": 0, "r.TSR.History.ScreenPercentage": 200,
                         "r.MotionBlurQuality": 0, "r.DepthOfFieldQuality": 0, "r.BloomQuality": 0,
                         "r.EyeAdaptationQuality": 0, "r.EyeAdaptation.PreExposureOverride": 1,
                         "r.LensFlareQuality": 0, "r.SceneColorFringeQuality": 0,
                         "r.Tonemapper.Quality": 0}
                console = add(unreal.MoviePipelineConsoleVariableSetting)
                for key, value in cvars.items():
                    require(console.add_or_update_console_variable(key, float(value)), f"Could not set {key}")
                configure(console, {"start_console_commands": list(cvars)})
                assets.set_metadata_tag(config, OWNER_TAG, OWNER)
                require(assets.save_loaded_asset(config, False), f"Could not save {config_path}")
                require(sha(package_file(source["map"], ".umap")) == source["map_sha256"], "Map changed")
                require(sha(package_file(source["sequence"], ".uasset")) == source["sequence_sha256"], "Sequence changed")
                report["configs"].append({"pose": source["pose"]["name"], "arm": arm,
                    "map": source["map"], "sequence": source["sequence"], "config": config_path,
                    "map_sha256": source["map_sha256"], "sequence_sha256": source["sequence_sha256"],
                    "config_sha256": sha(package_file(config_path, ".uasset")), "camera_pose": source["camera_pose"],
                    "output_directory": str(output_directory), "requested_cvars": cvars,
                    "contract": {"label": "Native MRQ quality capture", "performance_measurement": False,
                        "output_size": [WIDTH, HEIGHT], "fixed_fps": 60, "sequence_frame_range": [64, 65],
                        "spatial_samples": 1, "temporal_samples": 1, "tile_count": 1,
                        "render_warmup_samples": WARMUP, "engine_warmup_count": 0,
                        "warmup_note": "64 discarded render samples at the fixed first pose; MRQ forces one setup engine tick",
                        "aa_method": "TSR" if arm == "tsr" else "None", "cinematic_scalability": False,
                        "disable_tone_curve": True, "readback": "MRQ deferred render target to PNG; 8-bit display transfer requires validation"}})
                report_path.write_text(json.dumps(report, indent=2) + "\n")
        require(len(report["configs"]) == 9, "Expected three arms at three fixed poses")
        report["status"] = "passed"
    except Exception as error:
        report.update({"status": "failed", "failure": str(error)})
        raise
    finally:
        report_path.write_text(json.dumps(report, indent=2) + "\n")
        unreal.log(f"Moire MRQ preparation: {report_path}")


if __name__ == "__main__":
    main()
