"""Plain game-viewport Shot after warmup; invoked by the isolated game only."""

import json
import math
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
UNINTERRUPTED = bool(CONFIG.get("uninterrupted_motion"))
PRE_HANDLE = None
HANDLE = None
LAST_POST = None
CUT_BOUND = False
if UNINTERRUPTED:
    if not CONFIG.get("motion_sequence"):
        raise RuntimeError("Uninterrupted capture requires a motion sequence")
    STATE.update({"uninterrupted_motion": True, "paused_for_shot": False,
                  "extra_stationary_readback_frame": False, "history_reset_during_final_seek": False,
                  "nearby_ticks": [], "camera_cut_events": [], "actual_saved_sequence_time": None,
                  "camera_cut_detection": "LevelSequence.on_camera_cut events and sequence/component continuity; post-draw camera-manager flag is supplemental because Draw clears it",
                  "saved_phase_assignment": "pending independent raw-image registration to recorded camera observations",
                  "observation_stage_note": "Slate pre/post ticks follow the game update and viewport draw; neither is a GPU timestamp or screenshot callback"})


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


def stop(world):
    global CUT_BOUND
    if CUT_BOUND:
        PLAYER.on_camera_cut.remove_callable(on_sequence_camera_cut)
        CUT_BOUND = False
    if PRE_HANDLE is not None:
        unreal.unregister_slate_pre_tick_callback(PRE_HANDLE)
    if HANDLE is not None:
        unreal.unregister_slate_post_tick_callback(HANDLE)
    if world is not None:
        unreal.SystemLibrary.execute_console_command(world, "quit")


def fail(error, world):
    STATE.update({"status": "failed", "error": str(error)})
    save()
    unreal.log_error("Viewport Shot failed: " + str(error))
    stop(world)


def runtime_world():
    return next((w for w in unreal.ObjectIterator(unreal.World)
                 if w.get_path_name() == CONFIG["world"]), None)


def on_sequence_camera_cut(component):
    # Record in the delegate and validate in the next tick; Python delegate
    # exceptions are not a reliable way to terminate the owning game process.
    STATE["camera_cut_events"].append({"engine_frame": unreal.SystemLibrary.get_frame_count(),
        "sequence_time": sequence_time(), "camera_component": component.get_path_name() if component else None})


def observe(world, frame, phase):
    """Observe CPU camera state after the game draw; leave saved-frame phase unresolved."""
    position = sequence_time()
    if position["rate_numerator"] != CONFIG["expected_sequence_rate"] or position["rate_denominator"] != 1:
        raise RuntimeError("Unexpected sequence frame rate")
    current = position["frame"] + position["sub_frame"]
    camera = unreal.GameplayStatics.get_player_camera_manager(world, 0)
    controller = unreal.GameplayStatics.get_player_controller(world, 0)
    view_target = controller.get_view_target() if controller else None
    component = view_target.get_component_by_class(unreal.CameraComponent) if view_target else None
    observation = {"phase": phase, "engine_frame": frame, "sequence_time": position,
                   "sample_time_seconds": current / CONFIG["expected_sequence_rate"],
                   **camera_state(world), "is_playing": PLAYER.is_playing(),
                   "camera_cut_flag_after_draw": bool(camera.get_editor_property("game_camera_cut_this_frame")),
                   "view_target_actor": view_target.get_path_name() if view_target else None,
                   "active_camera_component": component.get_path_name() if component else None}
    observation["camera_cut"] = observation["camera_cut_flag_after_draw"] or any(
        event["engine_frame"] == frame for event in STATE["camera_cut_events"])
    STATE["nearby_ticks"].append(observation)
    if not all(math.isfinite(value) for value in [current, observation["camera_fov"],
               *observation["camera_location"], *observation["camera_rotation"]]):
        raise RuntimeError("Non-finite sequence or camera state")
    if not observation["is_playing"]:
        raise RuntimeError("Sequence unexpectedly stopped or paused during uninterrupted capture")
    if not component:
        raise RuntimeError("Actual player view target has no camera component")
    if observation["camera_cut"] and current > STATE["sequence_start_frame"] + 1.001:
        raise RuntimeError("Unexpected camera cut after the initial sequence binding")
    if any(event["engine_frame"] > STATE["sequence_created_engine_frame"] + 1 for event in STATE["camera_cut_events"]):
        raise RuntimeError("Unexpected sequence camera-cut event after the initial binding")
    return observation


def pre_tick(delta):
    if PLAYER is None or STATE["status"] == "failed":
        return
    world = None
    try:
        world = runtime_world()
        if world is None:
            raise RuntimeError("Runtime world disappeared during uninterrupted playback")
        position = sequence_time()
        if position["frame"] + position["sub_frame"] >= CONFIG["target_sequence_frame"] - CONFIG["nearby_pre_tick_frames"]:
            observe(world, unreal.SystemLibrary.get_frame_count(), "pre")
    except Exception as error:
        fail(error, world)


def tick(delta):
    global PLAYER, SEQUENCE_ACTOR, LAST_POST, CUT_BOUND
    if STATE["status"] == "failed":
        return
    world = None
    try:
        world = runtime_world()
        if world is None:
            if UNINTERRUPTED and PLAYER is not None:
                raise RuntimeError("Runtime world disappeared during uninterrupted playback")
            return
        frame = unreal.SystemLibrary.get_frame_count()
        ready = frame >= START + CONFIG["warmup_frames"]
        if CONFIG.get("motion_sequence"):
            if PLAYER is None:
                sequence = unreal.load_asset(CONFIG["motion_sequence"])
                settings = unreal.MovieSceneSequencePlaybackSettings()
                PLAYER, SEQUENCE_ACTOR = unreal.LevelSequencePlayer.create_level_sequence_player(world, sequence, settings)
                start_frame = CONFIG["target_sequence_frame"] - CONFIG["warmup_frames"] - 1
                if UNINTERRUPTED:
                    STATE["sequence_created_engine_frame"] = frame
                    PLAYER.on_camera_cut.add_callable(on_sequence_camera_cut)
                    CUT_BOUND = True
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
            if UNINTERRUPTED:
                if LAST_POST is not None and frame == LAST_POST["engine_frame"]:
                    return  # Repeated Slate callback is not a new game frame.
                observation = observe(world, frame, "post")
                if LAST_POST is not None:
                    previous_time = LAST_POST["sequence_time"]
                    previous_frame = previous_time["frame"] + previous_time["sub_frame"]
                    if frame - LAST_POST["engine_frame"] != 1 or abs(current - previous_frame - 1) > 1e-3:
                        raise RuntimeError("Unexpected engine/sequence frame skip, repeat, or jump")
                    if observation["active_camera_component"] != LAST_POST["active_camera_component"]:
                        raise RuntimeError("Unexpected active camera change during uninterrupted playback")
                elif abs(current - STATE["sequence_start_frame"] - 1) > 1e-3:
                    raise RuntimeError("Unexpected first playback step after the initial seek")
                LAST_POST = observation
            ready = current >= CONFIG["target_sequence_frame"] - 1e-4
            if STATE["status"] == "waiting" and ready:
                if abs(current - CONFIG["target_sequence_frame"]) > 1e-3:
                    raise RuntimeError("Sequence overshot target; refusing a final seek that might reset history")
                if not UNINTERRUPTED:
                    PLAYER.pause()
                STATE.update({"sequence_at_request": position, "paused_for_shot": not UNINTERRUPTED,
                              "history_reset_during_final_seek": False, "extra_stationary_readback_frame": not UNINTERRUPTED})
        if STATE["status"] == "waiting" and ready:
            STATE.update({"status": "requested", "requested_engine_frame": frame,
                **camera_state(world), "fixed_camera": not bool(CONFIG.get("motion_sequence")),
                "high_resolution_screenshot": False})
            save()
            unreal.SystemLibrary.execute_console_command(world, "Shot filename=" + str(OUTPUT) + " -nosuffix")
            unreal.log("Viewport Shot requested: " + str(OUTPUT))
        elif STATE["status"] == "requested" and OUTPUT.is_file() and OUTPUT.stat().st_size > 24:
            STATE.update({"status": "readback-observed" if UNINTERRUPTED else "captured", "completed_engine_frame": frame,
                          "png_bytes": OUTPUT.stat().st_size, "camera_at_completion": camera_state(world)})
            if PLAYER is not None:
                STATE["sequence_at_completion"] = sequence_time()
            if UNINTERRUPTED:
                if frame - STATE["requested_engine_frame"] > CONFIG["maximum_readback_frames"]:
                    raise RuntimeError("Screenshot completion exceeded the bounded observation window")
                STATE["completion_observation_note"] = "First Slate post-tick that observed the written PNG; not an exact render callback"
            save()
            if not UNINTERRUPTED:
                stop(world)
        elif UNINTERRUPTED and STATE["status"] == "requested" and frame - STATE["requested_engine_frame"] >= CONFIG["maximum_readback_frames"]:
            raise RuntimeError("Screenshot was not observed within the bounded readback window")
        elif UNINTERRUPTED and STATE["status"] == "readback-observed" and frame >= STATE["completed_engine_frame"] + CONFIG["post_completion_frames"]:
            STATE.update({"status": "captured", "observations_finished_engine_frame": frame,
                          "sequence_at_observations_finished": sequence_time(),
                          "continuous_playback_through_completion": True,
                          "sequence_continuity_valid": True,
                          "unexpected_camera_cut_detected": False})
            save()
            stop(world)
    except Exception as error:
        fail(error, world)


save()
if UNINTERRUPTED:
    PRE_HANDLE = unreal.register_slate_pre_tick_callback(pre_tick)
HANDLE = unreal.register_slate_post_tick_callback(tick)
