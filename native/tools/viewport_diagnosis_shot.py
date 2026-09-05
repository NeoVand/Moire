"""Plain game-viewport Shot after warmup; invoked by the isolated game only."""

import json
import os
from pathlib import Path
import unreal

CONFIG = json.loads(Path(os.environ["MOIRE_VIEWPORT_SHOT_CONFIG"]).read_text())
PROJECT = Path(__file__).resolve().parents[2] / "native/Unreal/MoireComparison"
if Path(unreal.SystemLibrary.get_project_directory()).resolve() != PROJECT:
    raise RuntimeError("Refusing to operate outside the isolated comparison project")
OUTPUT = Path(CONFIG["output"])
RECORD = Path(CONFIG["record"])
START = unreal.SystemLibrary.get_frame_count()
STATE = {"status": "waiting", "registered_engine_frame": START, "capture_route": "ordinary Shot"}
PLAYER = None
SEQUENCE_ACTOR = None


def sequence_time():
    qualified = PLAYER.get_current_time()
    return {"frame": qualified.time.frame_number.value, "sub_frame": qualified.time.sub_frame,
            "rate_numerator": qualified.rate.numerator, "rate_denominator": qualified.rate.denominator}


def camera_state(world):
    camera = unreal.GameplayStatics.get_player_camera_manager(world, 0)
    location, rotation = camera.get_camera_location(), camera.get_camera_rotation()
    return {"camera_location": [location.x, location.y, location.z],
            "camera_rotation": [rotation.roll, rotation.pitch, rotation.yaw], "camera_fov": camera.get_fov_angle()}


def save():
    RECORD.write_text(json.dumps(STATE, indent=2) + "\n")


def tick(delta):
    global HANDLE, PLAYER, SEQUENCE_ACTOR
    try:
        world = next((w for w in unreal.ObjectIterator(unreal.World)
                      if w.get_path_name() == CONFIG["world"]), None)
        if world is None:
            return
        frame = unreal.SystemLibrary.get_frame_count()
        ready = frame >= START + CONFIG["warmup_frames"]
        if CONFIG.get("motion_sequence"):
            if PLAYER is None:
                sequence = unreal.load_asset(CONFIG["motion_sequence"])
                settings = unreal.MovieSceneSequencePlaybackSettings()
                PLAYER, SEQUENCE_ACTOR = unreal.LevelSequencePlayer.create_level_sequence_player(world, sequence, settings)
                start_frame = CONFIG["target_sequence_frame"] - CONFIG["warmup_frames"] - 1
                params = unreal.MovieSceneSequencePlaybackParams(frame=unreal.FrameTime(unreal.FrameNumber(start_frame)),
                    position_type=unreal.MovieScenePositionType.FRAME, update_method=unreal.UpdatePositionMethod.JUMP)
                PLAYER.set_playback_position(params)
                PLAYER.play()
                STATE.update({"sequence_start_frame": start_frame, "initial_seek_only": True,
                              "continuous_playback_between_start_and_target": True})
                save()
                return
            position = sequence_time()
            current = position["frame"] + position["sub_frame"]
            ready = current >= CONFIG["target_sequence_frame"] - 1e-4
            if STATE["status"] == "waiting" and ready:
                if abs(current - CONFIG["target_sequence_frame"]) > 1e-3:
                    raise RuntimeError("Sequence overshot target; refusing a final seek that might reset history")
                PLAYER.pause()
                STATE.update({"sequence_at_request": position, "paused_for_shot": True,
                              "history_reset_during_final_seek": False, "extra_stationary_readback_frame": True})
        if STATE["status"] == "waiting" and ready:
            STATE.update({"status": "requested", "requested_engine_frame": frame,
                **camera_state(world), "fixed_camera": not bool(CONFIG.get("motion_sequence")),
                "high_resolution_screenshot": False})
            save()
            unreal.SystemLibrary.execute_console_command(world, "Shot filename=" + str(OUTPUT) + " -nosuffix")
            unreal.log("Viewport Shot requested: " + str(OUTPUT))
        elif STATE["status"] == "requested" and OUTPUT.is_file() and OUTPUT.stat().st_size > 24:
            STATE.update({"status": "captured", "completed_engine_frame": frame,
                          "png_bytes": OUTPUT.stat().st_size, "camera_at_completion": camera_state(world)})
            if PLAYER is not None:
                STATE["sequence_at_completion"] = sequence_time()
            save()
            unreal.unregister_slate_post_tick_callback(HANDLE)
            unreal.SystemLibrary.execute_console_command(world, "quit")
    except Exception as error:
        STATE.update({"status": "failed", "error": str(error)})
        save()
        unreal.log_error("Viewport Shot failed: " + str(error))
        unreal.unregister_slate_post_tick_callback(HANDLE)
        # Only this isolated application's command interpreter receives quit.
        if world is not None:
            unreal.SystemLibrary.execute_console_command(world, "quit")


save()
HANDLE = unreal.register_slate_post_tick_callback(tick)
