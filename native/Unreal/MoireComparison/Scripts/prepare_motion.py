"""Build and verify owned 60 Hz camera trajectories under NullRHI.

Creates only /Game/MoireComparison/MotionSequences assets. Existing maps and
fixed CaptureSequences are never saved or replaced. The two MotionAnalytic maps
must already exist; their camera-driven materials are prepared separately.
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
MOTION_MAP_OWNER = "native-motion-v1"
OWNER = "native-motion-v1"
SEQUENCE_FOLDER = contract.PACKAGE_ROOT + "/MotionSequences"
FRAME_RATE = 60
END_FRAME = 8 * FRAME_RATE
# USceneComponent's world-transform cache uses Equals(..., 1e-4) and can
# retain the preceding transform for smaller changes, even with exact keys.
ACTOR_TRANSLATION_TOLERANCE_CM = 1.1e-4
ACTOR_ROTATION_TOLERANCE_DEGREES = 1.1e-4
CHANNEL_NAMES = ("Location.X", "Location.Y", "Location.Z", "Rotation.X",
                 "Rotation.Y", "Rotation.Z", "Scale.X", "Scale.Y", "Scale.Z")
POSE_NAMES = ("Glide0", "Approach4")


def require(value, message):
    if not value:
        raise RuntimeError(message)
    return value


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def json_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def package_file(asset_path, extension):
    require(asset_path.startswith(contract.PACKAGE_ROOT + "/"), "Asset outside owned namespace")
    return PROJECT / "Content" / (asset_path.removeprefix("/Game/") + extension)


def sample_table(pose):
    result = []
    for frame in range(END_FRAME + 1):
        camera = contract.camera_pose({**pose, "time": frame / FRAME_RATE})
        r = camera["unreal_rotation_degrees"]
        # Unreal transform channel Rotation.X/Y/Z means Roll/Pitch/Yaw.
        values = [*camera["unreal_location_cm"], r["roll"], r["pitch"], r["yaw"], 1.0, 1.0, 1.0]
        require(all(math.isfinite(v) for v in values), "Nonfinite camera key")
        result.append({"frame": frame, "time_seconds": frame / FRAME_RATE, "values": values})
    return result


def camera_values(camera):
    p, r, s = camera.get_actor_location(), camera.get_actor_rotation(), camera.get_actor_scale3d()
    return [p.x, p.y, p.z, r.roll, r.pitch, r.yaw, s.x, s.y, s.z]


def compare_transform(actual, expected, context):
    require(all(math.isfinite(v) for v in actual), f"Nonfinite evaluated transform: {context}")
    errors = [abs(a - e) for a, e in zip(actual, expected)]
    # Rotators can use an equivalent angle differing by a complete turn.
    errors[3:6] = [abs((actual[i] - expected[i] + 180.0) % 360.0 - 180.0) for i in range(3, 6)]
    require(max(errors[:3]) <= ACTOR_TRANSLATION_TOLERANCE_CM,
            f"Camera translation mismatch at {context}: {errors[:3]}")
    require(max(errors[3:6]) <= ACTOR_ROTATION_TOLERANCE_DEGREES,
            f"Camera rotation mismatch at {context}: {errors[3:6]}")
    require(max(errors[6:]) <= 1e-8, f"Camera scale mismatch at {context}")
    return errors


def verify_channel_evaluation(sequence, channels, samples):
    evaluation_range = sequence.make_range(0, END_FRAME + 1)
    rate = unreal.FrameRate(FRAME_RATE, 1)
    evaluated = []
    for index, name in enumerate(CHANNEL_NAMES):
        channel = channels[name]
        keys = channel.get_keys()
        require(len(keys) == END_FRAME + 1, f"Unexpected key count: {name}")
        for frame, key in enumerate(keys):
            time = key.get_time(unreal.MovieSceneTimeUnit.DISPLAY_RATE)
            require(time.frame_number.value == frame and time.sub_frame == 0.0,
                    f"Incorrect display-frame key time: {name}, {frame}")
        values = list(channel.evaluate_keys(evaluation_range, rate))
        require(len(values) == END_FRAME + 1, f"Unexpected evaluated sample count: {name}")
        error = max(abs(value - samples[frame]["values"][index]) for frame, value in enumerate(values))
        require(all(math.isfinite(value) for value in values) and error <= 1e-9,
                f"Unreal channel evaluation differs from scene_contract: {name}, {error}")
        evaluated.append(values)
    table = [[values[frame] for values in evaluated] for frame in range(END_FRAME + 1)]
    return {"channels": list(CHANNEL_NAMES), "samples_per_channel": END_FRAME + 1,
            "evaluated_values_sha256": json_hash(table), "max_absolute_error": max(
                abs(table[f][i] - samples[f]["values"][i]) for f in range(END_FRAME + 1) for i in range(9))}


def verify_bound_camera(sequence, binding, camera, samples, actors):
    """Evaluate the actual runtime player and possessed actor, without rendering.

    Installed UE source creates this LevelSequenceActor with RF_Transient. The
    player evaluates synchronously on SetPlaybackPosition; its forced restore
    mode and an explicit final restore preserve the loaded source camera.
    """
    original = camera.get_actor_transform()
    original_values = camera_values(camera)
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    settings = unreal.MovieSceneSequencePlaybackSettings()
    settings.set_editor_property("finish_completion_state_override",
                                 unreal.MovieSceneCompletionModeOverride.FORCE_RESTORE_STATE)
    # No viewport exists under NullRHI. Validate the serialized cut separately;
    # runtime history invalidation is a rendering test, not this transform gate.
    settings.set_editor_property("disable_camera_cuts", True)
    player, temporary_actor = unreal.LevelSequencePlayer.create_level_sequence_player(world, sequence, settings)
    require(player and temporary_actor, "Could not create transient sequence evaluation player")
    maxima = [0.0] * 9
    actual_table = []
    reset_frames = [0, END_FRAME // 2, 0, END_FRAME - 1, 0]
    try:
        bound = player.get_bound_objects(sequence.get_binding_id(binding))
        require(camera in bound, "Sequence does not possess the generated camera in this map")
        for frame in [*range(END_FRAME), *reset_frames]:
            parameters = unreal.MovieSceneSequencePlaybackParams(
                frame=unreal.FrameTime(unreal.FrameNumber(frame)),
                position_type=unreal.MovieScenePositionType.FRAME,
                update_method=unreal.UpdatePositionMethod.JUMP)
            player.set_playback_position(parameters)
            actual = camera_values(camera)
            errors = compare_transform(actual, samples[frame]["values"], f"frame {frame}")
            maxima = [max(a, b) for a, b in zip(maxima, errors)]
            actual_table.append({"frame": frame, "values": actual})
    finally:
        try:
            player.stop()
            player.restore_state()
        finally:
            try:
                actors.destroy_actor(temporary_actor)
            finally:
                # Never save a map; restore even if player validation failed.
                camera.set_actor_transform(original, False, False)
    compare_transform(camera_values(camera), original_values, "source camera restoration")
    return {"method": "Transient LevelSequencePlayer.set_playback_position and bound CameraActor transform readback",
            "rendered_frames_checked": END_FRAME, "seek_reset_frames": reset_frames,
            "max_error_per_channel": maxima, "actual_transforms_sha256": json_hash(actual_table),
            "translation_tolerance_cm": ACTOR_TRANSLATION_TOLERANCE_CM,
            "rotation_tolerance_degrees": ACTOR_ROTATION_TOLERANCE_DEGREES,
            "tolerance_reason": "USceneComponent world-transform cache skips changes within its 1e-4 Equals tolerance; exact channel values are checked separately",
            "endpoint_480": "Key/channel verified; outside the exclusive playback range",
            "camera_history_reset_verified": False}


def create_sequence(name, camera, samples, assets, tools):
    sequence_path = SEQUENCE_FOLDER + "/" + name
    sequence = unreal.load_asset(sequence_path) if assets.does_asset_exist(sequence_path) else None
    if sequence:
        require(assets.get_metadata_tag(sequence, OWNER_TAG) == OWNER,
                f"Refusing to replace an unowned sequence: {sequence_path}")
        require(isinstance(sequence, unreal.LevelSequence), f"Not a LevelSequence: {sequence_path}")
        for track in sequence.get_tracks():
            require(sequence.remove_track(track), "Could not replace owned sequence track")
        for binding in sequence.get_bindings():
            binding.remove()
    else:
        sequence = require(tools.create_asset(name, SEQUENCE_FOLDER, unreal.LevelSequence,
                                              unreal.LevelSequenceFactoryNew()), sequence_path)
    sequence.set_display_rate(unreal.FrameRate(FRAME_RATE, 1))
    sequence.set_tick_resolution_directly(unreal.FrameRate(24000, 1))
    sequence.set_playback_start(0)
    sequence.set_playback_end(END_FRAME)
    binding = sequence.add_possessable(camera)
    transform_track = require(binding.add_track(unreal.MovieScene3DTransformTrack), "Missing transform track")
    transform_track.set_property_name_and_path("Transform", "Transform")
    section = require(transform_track.add_section(), "Missing transform section")
    section.set_range(0, END_FRAME + 1)
    section.set_completion_mode(unreal.MovieSceneCompletionMode.RESTORE_STATE)
    section.set_editor_property("use_quaternion_interpolation", False)
    channels = {str(c.get_editor_property("channel_name")): c for c in
                section.get_channels_by_type(unreal.MovieSceneScriptingDoubleChannel)}
    require(set(channels) == set(CHANNEL_NAMES), f"Unexpected transform channels: {sorted(channels)}")
    for sample in samples:
        for index, name in enumerate(CHANNEL_NAMES):
            value = sample["values"][index]
            key = channels[name].add_key(unreal.FrameNumber(sample["frame"]), value, 0.0,
                                         unreal.MovieSceneTimeUnit.DISPLAY_RATE, unreal.MovieSceneKeyInterpolation.LINEAR)
            # UE5.8's shared AddKeyToChannel implementation accepts float even
            # for double channels. SetValue writes the actual double afterward.
            key.set_value(value)
    cut_track = require(sequence.add_track(unreal.MovieSceneCameraCutTrack), "Missing camera-cut track")
    cut = require(cut_track.add_section(), "Missing camera-cut section")
    cut.set_range(0, END_FRAME)
    cut.set_camera_binding_id(sequence.get_binding_id(binding))
    require(len(sequence.get_tracks()) == 1 and len(sequence.get_bindings()) == 1 and
            len(binding.get_tracks()) == 1, "Unexpected motion sequence topology")
    require(cut.get_camera_binding_id().get_editor_property("guid").to_string() == binding.get_id().to_string(),
            "Camera-cut binding mismatch")
    assets.set_metadata_tag(sequence, OWNER_TAG, OWNER)
    assets.set_metadata_tag(sequence, "MoireMotionSamplesSHA256", json_hash(samples))
    assets.set_metadata_tag(sequence, "MoireMotionRate", str(FRAME_RATE))
    return sequence_path, sequence, binding, channels


def main():
    require(Path(unreal.SystemLibrary.get_project_directory()).resolve() == PROJECT,
            f"Wrong project; run only in {PROJECT}.")
    require(hasattr(unreal, "MovieSceneSequenceExtensions"), "Enable SequencerScripting in this project")
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    assets.make_directory(SEQUENCE_FOLDER)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    directory = PROJECT / "Saved/MoireComparison"
    directory.mkdir(parents=True, exist_ok=True)
    output = directory / f"prepare-motion-{stamp}.json"
    protected_files = sorted((PROJECT / "Content/MoireComparison/Maps").glob("*.umap"))
    protected_files += sorted((PROJECT / "Content/MoireComparison/CaptureSequences").glob("*.uasset"))
    protected_before = {str(p.relative_to(PROJECT)): sha(p) for p in protected_files}
    source_files = (Path(__file__), SCRIPTS / "scene_contract.py")
    report = {"created_at": stamp, "status": "running", "project": str(PROJECT), "generator": OWNER,
              "engine": unreal.SystemLibrary.get_engine_version(), "rendered": False,
              "frame_rate": FRAME_RATE, "duration_seconds": 8, "playback_range_exclusive": [0, END_FRAME],
              "key_range_inclusive": [0, END_FRAME], "interpolation": "Linear; exact contract samples at integer frames",
              "camera_cuts": [{"frame": 0, "end_exclusive": END_FRAME, "kind": "continuous shot"}],
              "internal_camera_cuts": False, "temporal_history_reset_verified": False,
              "hashes_before": {p.name: sha(p) for p in source_files},
              "protected_assets_before": protected_before, "trajectories": [], "sequences": []}
    output.write_text(json.dumps(report, indent=2) + "\n")
    try:
        for pose_name in POSE_NAMES:
            pose = next(p for p in contract.POSES if p["name"] == pose_name)
            samples = sample_table(pose)
            report["trajectories"].append({"name": pose_name, "motion": pose["motion"], "detail": pose["detail"],
                "time_range": [0, 8], "samples_sha256": json_hash(samples), "samples": samples})
            expected_channel_hash = None
            for suffix in ("", "_MotionAnalytic"):
                name = pose_name + suffix
                map_path = contract.PACKAGE_ROOT + "/Maps/" + name
                world_asset = require(unreal.load_asset(map_path), f"Prepare motion map first: {map_path}")
                expected_map_owner = MOTION_MAP_OWNER if suffix else MAP_OWNER
                require(assets.get_metadata_tag(world_asset, OWNER_TAG) == expected_map_owner,
                        f"Map is not owned by the scene generator: {map_path}")
                map_before = sha(package_file(map_path, ".umap"))
                require(levels.load_level(map_path), f"Could not load {map_path}")
                cameras = [a for a in actors.get_all_level_actors() if
                           a.get_actor_label() == "MoireGenerated_Camera" and isinstance(a, unreal.CameraActor)]
                require(len(cameras) == 1, f"Expected one generated camera: {map_path}")
                camera = cameras[0]
                component = camera.get_component_by_class(unreal.CameraComponent)
                require(math.isclose(component.get_editor_property("field_of_view"), contract.HORIZONTAL_FOV_DEGREES,
                                     abs_tol=1e-4), "Camera FOV differs from scene contract")
                require(math.isclose(component.get_editor_property("aspect_ratio"), contract.WIDTH / contract.HEIGHT,
                                     abs_tol=1e-6), "Camera aspect differs from scene contract")
                sequence_path, sequence, binding, channels = create_sequence(name, camera, samples, assets, tools)
                channel_gate = verify_channel_evaluation(sequence, channels, samples)
                camera_gate = verify_bound_camera(sequence, binding, camera, samples, actors)
                if expected_channel_hash is None:
                    expected_channel_hash = channel_gate["evaluated_values_sha256"]
                require(channel_gate["evaluated_values_sha256"] == expected_channel_hash,
                        "Raw and analytic sequences evaluate different trajectories")
                require(assets.save_loaded_asset(sequence, False), f"Could not save {sequence_path}")
                require(map_before == sha(package_file(map_path, ".umap")), "Motion preparation changed a map")
                report["sequences"].append({"pose": pose_name, "map": map_path, "sequence": sequence_path,
                    "arms": ["analytic"] if suffix else ["raw", "tsr"], "camera": camera.get_path_name(),
                    "binding_id": binding.get_id().to_string(), "map_sha256": map_before,
                    "sequence_sha256": sha(package_file(sequence_path, ".uasset")),
                    "channel_evaluation": channel_gate, "camera_evaluation": camera_gate})
                output.write_text(json.dumps(report, indent=2) + "\n")
        report["protected_assets_after"] = {str(p.relative_to(PROJECT)): sha(p) for p in protected_files}
        require(protected_before == report["protected_assets_after"], "A fixed map or capture sequence changed")
        report["hashes_after"] = {p.name: sha(p) for p in source_files}
        require(report["hashes_before"] == report["hashes_after"], "Generator or contract changed while running")
        report["status"] = "passed"
    except Exception as error:
        report["status"] = "failed"
        report["failure"] = str(error)
        raise
    finally:
        output.write_text(json.dumps(report, indent=2) + "\n")
        unreal.log(f"Moire motion preparation: {output}")


if __name__ == "__main__":
    main()
