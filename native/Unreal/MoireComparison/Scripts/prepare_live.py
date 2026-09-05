"""Create owned self-playing demo maps for an ordinary Unreal -game viewport.

Uses the already verified MotionSequences; no capture protocol, fixed capture
clock, image writer, renderer launch, or changes to source maps/materials.
Run under NullRHI after coordinating map creation with other capture jobs.
"""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import unreal

SCRIPTS = Path(__file__).resolve().parent
PROJECT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))
import prepare_motion as motion
import scene_contract as contract

OWNER = "native-live-v1"
OWNER_TAG = "MoireComparisonGenerator"
ACTOR_LABEL = "MoireGenerated_LiveSequence"
MAP_ROOT = contract.PACKAGE_ROOT + "/Maps/"
SEQUENCE_ROOT = contract.PACKAGE_ROOT + "/MotionSequences/"
PLANS = (
    ("Glide_LiveRaw", "Glide0", "native-scene-v1", "raw", "Glide0"),
    ("Glide_LiveAnalytic", "Glide0_MotionAnalytic", "native-motion-v1", "analytic", "Glide0"),
    ("Approach_LiveRaw", "Approach4", "native-scene-v1", "raw", "Approach4"),
    ("Approach_LiveAnalytic", "Approach4_MotionAnalytic", "native-motion-v1", "analytic", "Approach4"),
)
require = motion.require
sha = motion.sha


def initial_camera(pose):
    return contract.camera_pose({**pose, "time": 0.0})


def read_settings(actor):
    settings = actor.get_editor_property("playback_settings")
    return {"auto_play": settings.get_editor_property("auto_play"),
            "loop_count": settings.get_editor_property("loop_count").get_editor_property("value"),
            "play_rate": settings.get_editor_property("play_rate"),
            "start_time": settings.get_editor_property("start_time"),
            "random_start_time": settings.get_editor_property("random_start_time"),
            "pause_at_end": settings.get_editor_property("pause_at_end"),
            "disable_camera_cuts": settings.get_editor_property("disable_camera_cuts")}


def find_camera(actors, map_path):
    cameras = [a for a in actors.get_all_level_actors() if isinstance(a, unreal.CameraActor)
               and a.get_actor_label() == "MoireGenerated_Camera"]
    require(len(cameras) == 1, f"Expected one generated camera in {map_path}")
    require(cameras[0].get_path_name().startswith(map_path + "."), "Camera belongs to a different map")
    return cameras[0]


def check_live_actor(actor, camera, sequence):
    expected = {"auto_play": True, "loop_count": -1, "play_rate": 1.0,
                "start_time": 0.0, "random_start_time": False, "pause_at_end": False,
                "disable_camera_cuts": False}
    actual = read_settings(actor)
    require(actual == expected, f"Unexpected persisted playback settings: {actual}")
    require(actor.get_sequence() == sequence, "Live actor references a different sequence")
    bindings = sequence.get_bindings()
    require(len(bindings) == 1, "Expected the verified sequence's single camera binding")
    binding = bindings[0]
    binding_id = sequence.get_binding_id(binding)
    overrides = actor.get_editor_property("binding_overrides").get_editor_property("binding_data")
    require(len(overrides) == 1, "Expected one explicit local-camera override")
    override = overrides[0]
    require(override.get_editor_property("overrides_default"), "Original-map binding must be excluded")
    guid = override.get_editor_property("object_binding_id").get_editor_property("guid").to_string()
    require(guid == binding.get_id().to_string(), "Override targets the wrong camera binding")
    # SetSequence initializes the editor-world player, while normal game startup
    # initializes it itself. This neither plays the clock nor modifies the asset.
    actor.set_sequence(sequence)
    # UE5.8 exposes the BlueprintGetter through the property, not a Python
    # get_sequence_player method on LevelSequenceActor.
    player = require(actor.get_editor_property("sequence_player"), "Live actor has no sequence player")
    bound = player.get_bound_objects(binding_id)
    require(len(bound) == 1 and bound[0] == camera,
            "Live sequence did not resolve exclusively to this map's generated camera")
    return {"settings": actual, "binding_id": guid, "resolved_camera": camera.get_path_name(),
            "allow_original_asset_binding": False,
            "runtime_autoplay_verified": False, "runtime_replay_cut_verified": False,
            "temporal_history_reset_verified": False}


def main():
    require(Path(unreal.SystemLibrary.get_project_directory()).resolve() == PROJECT,
            f"Run only in the isolated project {PROJECT}")
    assets = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    prepared_paths = sorted((PROJECT / "Saved/MoireComparison").glob("prepare-motion-*.json"))
    require(prepared_paths, "Run prepare_motion.py successfully first")
    prepared_path = prepared_paths[-1]
    prepared = json.loads(prepared_path.read_text())
    require(prepared.get("status") == "passed", "Latest motion sequence preparation failed")
    records = {r["sequence"]: r for r in prepared["sequences"]}
    target_names = {p[0] for p in PLANS}
    protected = [p for p in (PROJECT / "Content/MoireComparison/Maps").glob("*.umap")
                 if p.stem not in target_names]
    protected += list((PROJECT / "Content/MoireComparison/Materials").glob("*.uasset"))
    for folder in ("CaptureSequences", "MotionSequences"):
        protected += list((PROJECT / "Content/MoireComparison" / folder).glob("*.uasset"))
    protected_before = {str(p.relative_to(PROJECT)): sha(p) for p in sorted(protected)}
    sources = (Path(__file__), SCRIPTS / "prepare_motion.py", SCRIPTS / "scene_contract.py")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report_path = PROJECT / "Saved/MoireComparison" / f"prepare-live-{stamp}.json"
    report = {"created_at": stamp, "status": "running", "generator": OWNER,
              "project": str(PROJECT), "engine": unreal.SystemLibrary.get_engine_version(),
              "rendered": False, "capture_protocol": None, "capture_clock": None,
              "anti_aliasing_method": "Host/runtime setting; the raw shader map can be used for either unfiltered or TSR rendering",
              "motion_preparation": str(prepared_path), "motion_preparation_sha256": sha(prepared_path),
              "source_hashes_before": {p.name: sha(p) for p in sources},
              "protected_assets_before": protected_before, "maps": [],
              "replay": {"seconds": 8, "time_start": 0, "time_end": 8,
                         "continuous_loop": False,
                         "description": "Deliberate cut from the end of each 8-second trajectory back to its t=0 pose",
                         "runtime_cut_and_temporal_reset_verified": False}}

    def save():
        report_path.write_text(json.dumps(report, indent=2) + "\n")

    save()
    try:
        # Validate every source and existing destination before changing a map.
        for target, source, owner, arm, pose_name in PLANS:
            source_path, sequence_path = MAP_ROOT + source, SEQUENCE_ROOT + source
            world = require(unreal.load_asset(source_path), f"Missing source map: {source_path}")
            require(assets.get_metadata_tag(world, OWNER_TAG) == owner, "Source map owner mismatch")
            sequence = require(unreal.load_asset(sequence_path), f"Missing motion sequence: {sequence_path}")
            require(assets.get_metadata_tag(sequence, OWNER_TAG) == motion.OWNER, "Sequence owner mismatch")
            require(sequence_path in records, "Motion preparation does not cover this sequence")
            record = records[sequence_path]
            require(record["map"] == source_path, "Motion sequence preparation references another source map")
            require(sha(motion.package_file(source_path, ".umap")) == record["map_sha256"], "Source map changed after motion verification")
            require(sha(motion.package_file(sequence_path, ".uasset")) == record["sequence_sha256"], "Motion sequence changed after verification")
            require(sequence.get_playback_start() == 0 and sequence.get_playback_end() == motion.END_FRAME,
                    "Unexpected playback range")
            rate = sequence.get_display_rate()
            require(rate.numerator == 60 and rate.denominator == 1, "Unexpected sequence display rate")
            target_path = MAP_ROOT + target
            if assets.does_asset_exist(target_path):
                existing = require(unreal.load_asset(target_path), target_path)
                require(assets.get_metadata_tag(existing, OWNER_TAG) == OWNER, "Refusing to modify an unowned live map")
                require(assets.get_metadata_tag(existing, "MoireLiveSourceMap") == source_path,
                        "Existing live map has a different source")
                require(assets.get_metadata_tag(existing, "MoireLiveSourceSHA256") == record["map_sha256"],
                        "Source changed; explicitly rebuild the owned live map before reusing it")

        for target, source, owner, arm, pose_name in PLANS:
            target_path, source_path, sequence_path = MAP_ROOT + target, MAP_ROOT + source, SEQUENCE_ROOT + source
            if assets.does_asset_exist(target_path):
                require(levels.load_level(target_path), f"Could not load {target_path}")
            else:
                require(levels.new_level_from_template(target_path, source_path), f"Could not copy {source_path}")
            world = require(unreal.load_asset(target_path), "Copied world is unavailable")
            # Persist ownership immediately so an interrupted generation can be
            # resumed without mistaking the copied source tag for another owner.
            assets.set_metadata_tag(world, OWNER_TAG, OWNER)
            assets.set_metadata_tag(world, "MoireLiveSourceMap", source_path)
            assets.set_metadata_tag(world, "MoireLiveSourceSHA256", records[sequence_path]["map_sha256"])
            require(levels.save_current_level(), f"Could not mark ownership of {target_path}")
            camera = find_camera(actors, target_path)
            pose = next(p for p in contract.POSES if p["name"] == pose_name)
            start = initial_camera(pose)
            camera.set_actor_location_and_rotation(unreal.Vector(*start["unreal_location_cm"]),
                unreal.Rotator(**start["unreal_rotation_degrees"]), False, False)
            camera.set_editor_property("auto_activate_for_player", unreal.AutoReceiveInput.PLAYER0)
            for actor in actors.get_all_level_actors():
                if actor.get_actor_label() == ACTOR_LABEL:
                    require(isinstance(actor, unreal.LevelSequenceActor), "Live actor label belongs to another class")
                    require(actors.destroy_actor(actor), "Could not replace the owned live sequence actor")
            require(not any(isinstance(a, unreal.LevelSequenceActor) for a in actors.get_all_level_actors()),
                    "Unexpected other sequence actor in copied map")
            live = require(actors.spawn_actor_from_class(unreal.LevelSequenceActor, unreal.Vector(), unreal.Rotator()),
                           "Could not create persistent live sequence actor")
            live.set_actor_label(ACTOR_LABEL)
            settings = unreal.MovieSceneSequencePlaybackSettings()
            settings.set_editor_property("auto_play", True)
            settings.set_editor_property("loop_count", unreal.MovieSceneSequenceLoopCount(-1))
            settings.set_editor_property("play_rate", 1.0)
            settings.set_editor_property("start_time", 0.0)
            settings.set_editor_property("random_start_time", False)
            settings.set_editor_property("pause_at_end", False)
            settings.set_editor_property("disable_camera_cuts", False)
            live.set_editor_property("playback_settings", settings)
            sequence = require(unreal.load_asset(sequence_path), sequence_path)
            live.set_sequence(sequence)
            bindings = sequence.get_bindings()
            require(len(bindings) == 1, "Expected one prepared camera binding")
            live.set_binding(sequence.get_binding_id(bindings[0]), [camera], False)
            verification = check_live_actor(live, camera, sequence)
            assets.set_metadata_tag(world, OWNER_TAG, OWNER)
            assets.set_metadata_tag(world, "MoireLiveSourceMap", source_path)
            assets.set_metadata_tag(world, "MoireLiveSourceSHA256", records[sequence_path]["map_sha256"])
            require(levels.save_current_level(), f"Could not save new live map {target_path}")
            report["maps"].append({"map": target_path, "source_map": source_path, "sequence": sequence_path,
                "arm": arm, "path": pose["motion"], "detail": pose["detail"], "initial_camera": start,
                "verification": verification, "map_sha256": sha(motion.package_file(target_path, ".umap")),
                "sequence_sha256": records[sequence_path]["sequence_sha256"],
                "launch_arguments": [str(PROJECT / "MoireComparison.uproject"), target_path, "-game", "-windowed"]})
            save()

        # Reopen each saved map and resolve its serialized binding override again.
        for record in report["maps"]:
            require(levels.load_level(record["map"]), "Could not reload saved live map")
            camera = find_camera(actors, record["map"])
            found = [a for a in actors.get_all_level_actors() if a.get_actor_label() == ACTOR_LABEL
                     and isinstance(a, unreal.LevelSequenceActor)]
            require(len(found) == 1, "Saved live sequence actor missing or duplicated")
            record["reload_verification"] = check_live_actor(found[0], camera, unreal.load_asset(record["sequence"]))
            require(record["map_sha256"] == sha(motion.package_file(record["map"], ".umap")),
                    "Verification changed a saved live map")
        report["protected_assets_after"] = {str(p.relative_to(PROJECT)): sha(p) for p in sorted(protected)}
        require(protected_before == report["protected_assets_after"], "A control map/material/sequence changed")
        report["source_hashes_after"] = {p.name: sha(p) for p in sources}
        require(report["source_hashes_before"] == report["source_hashes_after"], "Source changed during preparation")
        report["status"] = "passed"
    except Exception as error:
        report.update({"status": "failed", "failure": str(error)})
        raise
    finally:
        save()
        unreal.log("Moire live preparation: " + str(report_path))


if __name__ == "__main__":
    main()
