#!/usr/bin/env python3
"""Synthetic CPU callback tests. Replaces unreal entirely; never launches Unreal or a GPU."""
import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import types

N = types.SimpleNamespace
REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / 'native/tools/viewport_diagnosis_shot.py'
FILES = [SCRIPT, REPO / 'native/tools/viewport_diagnosis.py']
hashes = lambda: {str(p.relative_to(REPO)): hashlib.sha256(p.read_bytes()).hexdigest() for p in FILES}
BEFORE = hashes()
RESULTS = []
for file in FILES:
    ast.parse(file.read_text())
for mode in ['uninterrupted', 'paused', 'fixed', 'skip', 'cut-event', 'cut-flag', 'stopped', 'camera-change', 'late-file']:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        output, record, config = path / 'frame.png', path / 'shot.json', path / 'config.json'
        moving, continuous = mode != 'fixed', mode not in ('paused', 'fixed')
        config.write_text(json.dumps({'output': str(output), 'record': str(record), 'world': '/Game/Test.Test',
            'warmup_frames': 64, 'motion_sequence': '/Game/TestSequence' if moving else None,
            'target_sequence_frame': 120, 'uninterrupted_motion': continuous, 'expected_sequence_rate': 60,
            'nearby_pre_tick_frames': 3, 'maximum_readback_frames': 3, 'post_completion_frames': 2}))
        os.environ['MOIRE_VIEWPORT_SHOT_CONFIG'] = str(config)
        state = {'engine': 0, 'seq': 0, 'playing': False, 'pauses': 0, 'seeks': 0, 'shot': None,
                 'quit': False, 'pre': None, 'post': None, 'cut': None}
        component = N(get_path_name=lambda: '/Game/Camera2' if mode == 'camera-change' and state['seq'] >= 100 else '/Game/Camera')
        class Player:
            def __init__(self):
                self.on_camera_cut = N(add_callable=lambda cb: state.update(cut=cb), remove_callable=lambda cb: state.update(cut=None))
            def get_current_time(self):
                return N(time=N(frame_number=N(value=state['seq']), sub_frame=0), rate=N(numerator=60, denominator=1))
            def set_playback_position(self, params):
                state['seq'] = params.frame.frame_number.value
                state['seeks'] += 1
                if state['cut']:
                    state['cut'](component)
            def play(self): state['playing'] = True
            def pause(self):
                state['playing'] = False
                state['pauses'] += 1
            def is_playing(self): return state['playing']
            def get_active_camera_component(self): return component
        player = Player()
        camera = N(get_camera_location=lambda: N(x=state['seq'], y=0, z=1),
            get_camera_rotation=lambda: N(roll=0, pitch=0, yaw=0), get_fov_angle=lambda: 79.,
            get_editor_property=lambda name: mode == 'cut-flag' and state['seq'] == 100)
        world = N(get_path_name=lambda: '/Game/Test.Test')
        def command(world, text):
            if text.startswith('Shot '):
                assert state['shot'] is None
                state['shot'] = state['engine']
            elif text == 'quit':
                state['quit'] = True
        def register(kind, callback):
            state[kind] = callback
            return kind
        unreal = types.ModuleType('unreal')
        unreal.SystemLibrary = N(get_project_directory=lambda: str(REPO / 'native/Unreal/MoireComparison'),
            get_frame_count=lambda: state['engine'], execute_console_command=command)
        view_target = N(get_path_name=lambda: '/Game/CameraActor', get_component_by_class=lambda cls: component)
        unreal.GameplayStatics = N(get_player_camera_manager=lambda world, index: camera,
            get_player_controller=lambda world, index: N(get_view_target=lambda: view_target))
        unreal.CameraComponent = object
        unreal.World = object
        unreal.ObjectIterator = lambda cls: iter([world])
        unreal.load_asset = lambda path: path
        unreal.MovieSceneSequencePlaybackSettings = lambda: N()
        unreal.LevelSequencePlayer = N(create_level_sequence_player=lambda world, seq, settings: (player, object()))
        unreal.MovieSceneSequencePlaybackParams = lambda **args: N(**args)
        unreal.FrameNumber = lambda value: N(value=value)
        unreal.FrameTime = lambda number: N(frame_number=number)
        unreal.MovieScenePositionType, unreal.UpdatePositionMethod = N(FRAME=0), N(JUMP=0)
        unreal.register_slate_pre_tick_callback = lambda cb: register('pre', cb)
        unreal.register_slate_post_tick_callback = lambda cb: register('post', cb)
        unreal.unregister_slate_pre_tick_callback = lambda handle: state.update(pre=None)
        unreal.unregister_slate_post_tick_callback = lambda handle: state.update(post=None)
        unreal.log = unreal.log_error = lambda text: None
        sys.modules['unreal'] = unreal
        runpy.run_path(str(SCRIPT), run_name='__capture_mock__')
        for frame in range(160):
            state['engine'] = frame
            if state['playing']:
                state['seq'] += 2 if mode == 'skip' and state['seq'] == 99 else 1
                if mode == 'stopped' and state['seq'] == 100:
                    state['playing'] = False
                if mode == 'cut-event' and state['seq'] == 100 and state['cut']:
                    state['cut'](component)
            if state['shot'] is not None and frame > state['shot'] and mode != 'late-file':
                # Deliberately not a PNG: only the helper's file-observation logic is tested.
                output.write_bytes(b'mock screenshot file with more than24bytes')
            if state['pre']: state['pre'](1 / 60)
            if state['post']: state['post'](1 / 60)
            if state['quit']: break
        result = json.loads(record.read_text())
        success = mode in ('uninterrupted', 'paused', 'fixed')
        assert result['status'] == ('captured' if success else 'failed'), (mode, result)
        assert state['quit'] and state['pre'] is None and state['post'] is None and state['cut'] is None
        assert state['seeks'] == int(moving)
        if mode == 'uninterrupted':
            assert state['pauses'] == 0 and state['playing']
            assert result['sequence_at_request']['frame'] == 120 and result['sequence_at_completion']['frame'] == 121
            assert result['sequence_at_observations_finished']['frame'] == 123 and result['actual_saved_sequence_time'] is None
            candidates = [tick for tick in result['nearby_ticks'] if tick['phase'] == 'post'
                and result['requested_engine_frame'] < tick['engine_frame'] <= result['completed_engine_frame']]
            assert len(candidates) == 1 and candidates[0]['sequence_time']['frame'] == 121
        if mode == 'paused':
            assert state['pauses'] == 1 and result['sequence_at_request'] == result['sequence_at_completion']
        RESULTS.append({'mode': mode, 'passed': True, 'synthetic_capture_status': result['status'],
            'expected_failure': result.get('error'), 'seek_count': state['seeks'], 'pause_count': state['pauses'],
            'request_sequence': result.get('sequence_at_request'), 'completion_sequence': result.get('sequence_at_completion'),
            'observation_end_sequence': result.get('sequence_at_observations_finished')})
AFTER = hashes()
assert BEFORE == AFTER
report = {'status': 'passed', 'created_at': datetime.now(timezone.utc).isoformat(),
    'synthetic': True, 'actual_unreal_process_started': False, 'gpu_used': False,
    'scope': 'CPU simulation of helper callbacks, mode invariants, failure paths and cleanup; not Unreal API, image or phase validation',
    'source_hashes': BEFORE, 'source_hashes_after': AFTER, 'source_hashes_stable': True,
    'runner_hash_coverage': {'runner': 'watched includes Path(__file__)',
        'helper_and_camera_cut_callback': 'watched includes shot_script; on_sequence_camera_cut is defined in that file',
        'self_contained_config': 'watched includes shot_config'},
    'tests': RESULTS}
report_path = Path(__file__).with_name('report.json')
report_path.write_text(json.dumps(report, indent=2) + '\n')
print(report_path)
