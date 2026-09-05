"""Create owned fixed-camera sequences in the isolated project under NullRHI.

Run through capture_native.py --prepare. This does not launch a renderer or
modify the source maps, their cameras, materials, or another Unreal project.
"""

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import unreal

SCRIPTS = Path(__file__).resolve().parent
PROJECT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
import scene_contract as contract

OWNER_TAG = "MoireComparisonGenerator"
MAP_OWNER = "native-scene-v1"
OWNER = "native-capture-v1"
SEQUENCE_FOLDER = contract.PACKAGE_ROOT + "/CaptureSequences"
FRAME_RATE = 60
END_FRAME = 512


def require(value, message):
    if not value:
        raise RuntimeError(message)
    return value


def package_file(asset_path, extension):
    require(asset_path.startswith(contract.PACKAGE_ROOT + "/"), "Asset outside owned namespace")
    return PROJECT / "Content" / (asset_path.removeprefix("/Game/") + extension)


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    require(Path(unreal.SystemLibrary.get_project_directory()).resolve() == PROJECT,
            f"Wrong project; run only in {PROJECT}.")
    require(hasattr(unreal, "MovieSceneSequenceExtensions"), "Enable SequencerScripting in this project.")
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    assets.make_directory(SEQUENCE_FOLDER)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    directory = PROJECT / "Saved/MoireComparison"
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / f"prepare-capture-{stamp}.json"
    report = {"created_at": stamp, "status": "running", "project": str(PROJECT),
              "engine": unreal.SystemLibrary.get_engine_version(), "generator": OWNER,
              "rendered": False, "frame_rate": FRAME_RATE, "sequence_range": [0, END_FRAME],
              "hashes": {p.name: sha(p) for p in (Path(__file__), SCRIPTS / "scene_contract.py")},
              "sequences": []}
    output.write_text(json.dumps(report, indent=2) + "\n")
    try:
        for pose in contract.POSES:
            for suffix in ("", "_Analytic"):
                name = pose["name"] + suffix
                map_path = contract.PACKAGE_ROOT + "/Maps/" + name
                world = require(unreal.load_asset(map_path), f"Bootstrap map missing: {map_path}")
                require(assets.get_metadata_tag(world, OWNER_TAG) == MAP_OWNER,
                        f"Map is not owned by the scene generator: {map_path}")
                before = sha(package_file(map_path, ".umap"))
                require(levels.load_level(map_path), f"Could not load {map_path}")
                cameras = [a for a in actors.get_all_level_actors()
                           if a.get_actor_label() == "MoireGenerated_Camera" and isinstance(a, unreal.CameraActor)]
                require(len(cameras) == 1, f"Expected one generated camera in {map_path}")
                camera = cameras[0]
                expected = contract.camera_pose(pose)
                location, rotation = camera.get_actor_location(), camera.get_actor_rotation()
                require(all(math.isclose(getattr(location, axis), value, abs_tol=1e-5)
                            for axis, value in zip(("x", "y", "z"), expected["unreal_location_cm"])),
                        f"Camera location changed: {map_path}")
                require(all(math.isclose(getattr(rotation, axis), value, abs_tol=1e-4)
                            for axis, value in expected["unreal_rotation_degrees"].items()),
                        f"Camera rotation changed: {map_path}")
                component = camera.get_component_by_class(unreal.CameraComponent)
                require(math.isclose(component.get_editor_property("field_of_view"),
                                     contract.HORIZONTAL_FOV_DEGREES, abs_tol=1e-4), "Camera FOV changed")
                require(math.isclose(component.get_editor_property("aspect_ratio"),
                                     contract.WIDTH / contract.HEIGHT, abs_tol=1e-6), "Camera aspect changed")

                sequence_path = SEQUENCE_FOLDER + "/" + name
                sequence = unreal.load_asset(sequence_path) if assets.does_asset_exist(sequence_path) else None
                if sequence:
                    require(assets.get_metadata_tag(sequence, OWNER_TAG) == OWNER,
                            f"Refusing to overwrite an unowned sequence: {sequence_path}")
                    require(isinstance(sequence, unreal.LevelSequence), f"Not a LevelSequence: {sequence_path}")
                    for track in sequence.get_tracks():
                        require(sequence.remove_track(track), "Could not replace owned track")
                    for binding in sequence.get_bindings():
                        binding.remove()
                else:
                    sequence = require(tools.create_asset(name, SEQUENCE_FOLDER, unreal.LevelSequence,
                                                           unreal.LevelSequenceFactoryNew()), sequence_path)
                sequence.set_display_rate(unreal.FrameRate(FRAME_RATE, 1))
                sequence.set_playback_start(0)
                sequence.set_playback_end(END_FRAME)
                binding = sequence.add_possessable(camera)
                track = require(sequence.add_track(unreal.MovieSceneCameraCutTrack), "Could not add camera cut")
                section = require(track.add_section(), "Could not add camera-cut section")
                section.set_range(0, END_FRAME)
                section.set_camera_binding_id(sequence.get_binding_id(binding))
                require(len(sequence.get_bindings()) == 1 and len(sequence.get_tracks()) == 1,
                        "Unexpected tracks/bindings in fixed-camera sequence")
                assets.set_metadata_tag(sequence, OWNER_TAG, OWNER)
                require(assets.save_loaded_asset(sequence, False), f"Could not save {sequence_path}")
                require(before == sha(package_file(map_path, ".umap")), "Preparation changed a source map")
                report["sequences"].append({"pose": pose, "map": map_path, "sequence": sequence_path,
                    "arms": ["analytic"] if suffix else ["raw", "tsr"], "camera": camera.get_path_name(),
                    "binding_id": str(binding.get_id()), "camera_pose": expected,
                    "map_sha256": before, "sequence_sha256": sha(package_file(sequence_path, ".uasset"))})
                output.write_text(json.dumps(report, indent=2) + "\n")
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["failure"] = str(error)
        raise
    finally:
        output.write_text(json.dumps(report, indent=2) + "\n")
        unreal.log(f"Moire capture preparation: {output}")


if __name__ == "__main__":
    main()
