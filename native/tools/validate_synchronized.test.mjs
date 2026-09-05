// Synthetic view/capture metadata around a committed paused-history raw PNG.
// The other two crops repeat that raw image. These tests exercise the CPU
// validator only: they are not synchronized rendering or AA-quality evidence.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import { originalPose, originalMatrices, registerRawCrop, countCellNeighborhood, cropImage, REGISTRATION_RULE, validateSynchronized } from './validate_synchronized.mjs';
import { cameraSource } from './compare_game_capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'native/evidence/viewport-diagnosis-20260905T212612.895862Z-raw-Glide0');
const committed = JSON.parse(fs.readFileSync(path.join(DIR, 'report.json'), 'utf8'));
const raw = PNG.sync.read(fs.readFileSync(path.join(DIR, 'frames/raw_Glide0.0120.png')), { skipRescale: true });
const image = { width: 1920, height: 360, depth: 8, data: Buffer.alloc(1920 * 360 * 4) };
for (let y = 0; y < 360; y++) for (let arm = 0; arm < 3; arm++)
  image.data.set(raw.data.subarray(y * 640 * 4, (y + 1) * 640 * 4), (y * 1920 + arm * 640) * 4);

function observation(arm, frame, sourceTime, thirdTSR = false) {
  const matrices = originalMatrices(originalPose('glide', sourceTime, 640, 360), 640, 360);
  const temporal = arm === 1 || arm === 2 && thirdTSR;
  return {
    synthetic_test_metadata: true, arm, controller_id: arm + 3, game_frame: frame,
    relative_frame: frame - 100, render_frame_number: frame + 800,
    source_time_seconds: sourceTime, loop_index: 0,
    explicit_initial_or_loop_cut: frame === 100, observed_camera_cut: frame === 100,
    anti_aliasing_method: temporal ? 4 : 0, primary_screen_percentage_method: temporal ? 1 : 0,
    primary_resolution_fraction: null, secondary_resolution_fraction: 1,
    allows_temporal_jitter: temporal, third_party_temporal_upscaler: false, offline_render: false,
    view_key: arm + 10, view_state_identity: String(arm + 1000),
    output_rect: [arm * 640, 0, (arm + 1) * 640, 360], unconstrained_rect: [arm * 640, 0, (arm + 1) * 640, 360],
    jitter_clip: temporal ? [(frame % 2 ? 1 : -1) / 1280, (frame % 3 - 1) / 720] : [0, 0],
    camera_location: matrices.location, camera_rotation: matrices.rotation,
    world_to_view: matrices.worldToView, projection_no_aa: matrices.projection,
  };
}

function fixture({ fixed = false, thirdTSR = false } = {}) {
  const captureReport = {
    synthetic_test_metadata: true, argv: ['-game', '-MoireSynchronized', '-ExecCmds=gamma 2.2'],
    status: 'captured-validation-pending', exit_code: 0, failures: [], handled_ensures: [],
    source_hashes: committed.source_hashes, source_hashes_after: committed.source_hashes,
    source_hashes_stable: true, paused_for_capture: false, map_sha256: 'synthetic-map',
    requested_window_pixels: [1920, 360], requested_pane_pixels: [640, 360],
    fixed_time_seconds: fixed ? 2 : null, third_tsr: thirdTSR,
    requested_cvars: committed.requested_cvars,
  };
  const materials = {};
  for (const [role, name] of [['point', 'M_Checker_Detail1'], ['analytic', 'M_MotionAnalytic_Detail1'], ['sky', 'M_Sky']]) {
    materials[role] = { path: `/Game/MoireComparison/Materials/${name}.${name}`,
      sha256: committed.source_hashes[`native/Unreal/MoireComparison/Content/MoireComparison/Materials/${name}.uasset`] };
  }
  const preparation = { synthetic_test_metadata: true, status: 'passed', generator: 'native-comparison-v1',
    map_sha256: 'synthetic-map', initial_pose: { period_world: 4, detail: 1 }, plane_width_cm: 10000000,
    protected_assets_unchanged: true, source_unchanged: true, materials };
  const telemetry = {
    synthetic_test_metadata: true, schema: 'moire-synchronized-v1', status: 'observed-unverified', failure: '',
    motion: 'glide', ordinary_game_renderer: true, performance_measurement: false, third_arm_tsr: thirdTSR,
    uses_fixed_source_time: fixed, fixed_source_time_seconds: fixed ? 2 : -1, loop_seconds: 0,
    observation_frame_count: 16, first_game_frame: 100, primary_resolution_verified: false,
    shot_requested: true, shot_processed: true, shot_file_exists: true,
    shot_requested_game_frame: 101, shot_processed_game_frame: 103,
    final_view_observations: [],
  };
  for (let i = 0; i < 16; i++) for (let arm = 0; arm < 3; arm++)
    telemetry.final_view_observations.push(observation(arm, 100 + i, fixed ? 2 : (118 + i) / 60, thirdTSR));
  return { image, captureReport, preparation, telemetry };
}
const validate = data => validateSynchronized(data);
const rejected = result => assert.equal(result.passed, false);

test('committed raw crop identifies the original source and rejects an adjacent frame', () => {
  const registered = registerRawCrop(raw, originalPose('glide', 2, 640, 360));
  assert.equal(registered.passed, true);
  assert.equal(registered.expandedGridDiagnostic.mismatches, 2, 'Preserve the wider-grid residuals rather than treating them as registration equality.');
  assert.equal(registerRawCrop(raw, originalPose('glide', 121 / 60, 640, 360)).passed, false);
});

test('moving image selects one family while unknown primary raster remains unverified', () => {
  const result = validate(fixture());
  assert.deepEqual(result.failures, []);
  assert.equal(result.status, 'registered-primary-raster-unverified');
  assert.equal(result.registration.savedGameFrame, 102);
  assert.equal(result.registration.sourceTime, 2);
  assert.equal(result.comparability.primaryRasterVerified, false);
  assert.equal(result.passed, false);
  assert.equal(result.heldOutSource.passed, false);
  assert.equal(result.heldOutSource.mismatches, 2);
  assert.ok(result.heldOutSource.firstFailures.every(v => Number.isFinite(v.horizonDistancePixels) && v.countRatesPerPixel.dx.length === 2));
});

test('static control validates pose but never assigns an equal-pose saved frame', () => {
  const result = validate(fixture({ fixed: true }));
  assert.deepEqual(result.failures, []);
  assert.equal(result.registration.passed, true);
  assert.equal(result.registration.kind, 'fixed-pose-image-registration');
  assert.equal(result.registration.savedGameFrame, null);
  assert.equal(result.registration.sourceTime, 2);
  assert.equal(result.registration.candidates.filter(c => c.passed).length, 2);
});

test('synthetic observed primary-resolution metadata enables its separate gate only', () => {
  const data = fixture();
  data.telemetry.primary_raster_diagnostic_enabled = true;
  data.telemetry.uniform_buffer_cpu_copy_overhead_enabled = true;
  data.telemetry.all_recorded_primary_raster_rects_observed = true;
  for (const view of data.telemetry.final_view_observations) {
    view.primary_raster_observed = true;
    view.primary_raster_rect = [...view.output_rect];
    view.primary_raster_to_output_ratio = [1, 1];
  }
  const result = validate(data);
  assert.equal(result.status, 'registered-and-comparable');
  assert.equal(result.passed, true);
  assert.equal(result.performanceMeasurement, false);
  assert.equal(result.temporalQualityEstablished, false);
});

test('missing matching family does not substitute the callback or requested time', () => {
  const data = fixture();
  data.telemetry.shot_requested_game_frame = 103;
  data.telemetry.shot_processed_game_frame = 105;
  const result = validate(data);
  assert.equal(result.registration.passed, false);
  assert.equal(result.registration.savedGameFrame, null);
  rejected(result);
});

test('two image-indistinguishable moving times are ambiguous', () => {
  const data = fixture();
  data.telemetry.final_view_observations = data.telemetry.final_view_observations.map(v => v.game_frame === 103
    ? observation(v.arm, v.game_frame, 2.00001) : v);
  const result = validate(data);
  assert.equal(result.registration.candidates.filter(v => v.passed).length, 2);
  assert.equal(result.registration.passed, false);
  assert.equal(result.registration.savedGameFrame, null);
});

test('duplicate or missing per-arm observations fail complete-family validation', () => {
  for (const change of [rows => rows.pop(), rows => { rows[1] = structuredClone(rows[0]); }]) {
    const data = fixture(); change(data.telemetry.final_view_observations);
    const result = validate(data);
    assert.ok(result.failures.some(c => /complete|family/.test(c.name)));
    rejected(result);
  }
});

test('shared history identity and mid-run history replacement are rejected', () => {
  for (const change of [rows => { for (const v of rows) if (v.arm === 2) v.view_key = 11; },
    rows => { rows[10].view_state_identity = '9000'; }]) {
    const data = fixture(); change(data.telemetry.final_view_observations);
    assert.ok(validate(data).failures.some(c => /histor|camera/.test(c.name)));
  }
});

test('raw jitter, absent temporal jitter, wrong AA and unmatched raster settings fail', () => {
  for (const change of [rows => { rows[0].jitter_clip = [0.001, 0]; },
    rows => { for (const v of rows) if (v.arm === 1) v.jitter_clip = [0, 0]; },
    rows => { rows[2].anti_aliasing_method = 4; },
    rows => { rows[1].secondary_resolution_fraction = 0.75; }]) {
    const data = fixture(); change(data.telemetry.final_view_observations);
    assert.ok(validate(data).failures.some(c => /AA|jitter/.test(c.name)));
  }
});

test('shifted pane crops and transposed matrices cannot be accepted', () => {
  for (const change of [rows => { for (const v of rows) if (v.arm === 0) { v.output_rect = [1, 0, 641, 360]; v.unconstrained_rect = v.output_rect; } },
    rows => { for (const v of rows) v.world_to_view = v.world_to_view.map((_, i, a) => a[(i % 4) * 4 + Math.floor(i / 4)]); }]) {
    const data = fixture(); change(data.telemetry.final_view_observations);
    assert.ok(validate(data).failures.some(c => /camera/.test(c.name)));
  }
});

test('unobserved explicit cut and source time disagreement across panes are rejected', () => {
  for (const change of [rows => { for (const v of rows.slice(0, 3)) v.observed_camera_cut = false; },
    rows => { rows[8].source_time_seconds += 1 / 60; }]) {
    const data = fixture(); change(data.telemetry.final_view_observations);
    assert.ok(validate(data).failures.some(c => /camera/.test(c.name)));
  }
});

test('source changes, altered material and missing gamma command fail comparability', () => {
  for (const change of [d => { d.captureReport.source_hashes_stable = false; },
    d => { d.preparation.materials.analytic.sha256 = 'changed'; },
    d => { d.captureReport.argv = ['-game', '-MoireSynchronized']; }]) {
    const data = fixture(); change(data);
    assert.ok(validate(data).failures.length > 0);
  }
});

test('third-arm TSR has independent history and observed temporal jitter requirements', () => {
  const result = validate(fixture({ thirdTSR: true }));
  assert.deepEqual(result.failures, []);
  assert.ok(result.checks.find(c => c.name === 'arm2: temporal jitter actually varies').passed);
});

test('missing or nonfinite observed fields do not silently satisfy numerical gates', () => {
  for (const key of ['secondary_resolution_fraction', 'observed_camera_cut', 'world_to_view']) {
    const data = fixture();
    delete data.telemetry.final_view_observations[0][key];
    assert.ok(validate(data).failures.some(c => /finite matrices/.test(c.name)));
  }
});

test('multiple real render families in one game frame are preserved', () => {
  const data = fixture({ fixed: true });
  const extra = data.telemetry.final_view_observations.slice(0, 3).map(v => ({ ...structuredClone(v), render_frame_number: 899 }));
  data.telemetry.final_view_observations.push(...extra);
  const result = validate(data);
  assert.deepEqual(result.failures, []);
  assert.equal(result.observationCoverage.observedGameFrames, 16);
  assert.equal(result.observationCoverage.recordedRenderFamilies, 17);
});

test('an extra startup render family cannot hide a missing final game frame', () => {
  const data = fixture({ fixed: true });
  const extra = data.telemetry.final_view_observations.slice(0, 3).map(v => ({ ...structuredClone(v), render_frame_number: 899 }));
  data.telemetry.final_view_observations.splice(-3, 3, ...extra);
  const result = validate(data);
  assert.ok(result.failures.some(c => c.name === 'complete expected game-frame coverage'));
  assert.deepEqual(result.observationCoverage.missingGameFrames, [115]);
  assert.equal(result.registration.passed, true, 'Valid pose diagnostics survive an incomplete observation window.');
});

test('count-cell bound rejects whole-period skips that sampled parity would miss', () => {
  const source = { horizonDistance: () => 1, ground: (x, y) => [100 * x + 0.25, 0.25 + y] };
  assert.equal(countCellNeighborhood(source, 0, 0).stable, false);
  const parity = x => (Math.floor(2 * source.ground(x, 0)[0]) % 2 + 2) % 2;
  assert.equal(parity(-0.01), parity(0));
  assert.equal(parity(0), parity(0.01));
  assert.equal(countCellNeighborhood({ ...source, ground: (x, y) => [x + 0.25, y + 0.25] }, 0, 0).stable, true);
  assert.equal(countCellNeighborhood({ ...source, horizonDistance: x => x }, 0, 0).stable, false);
});

test('real loop witness aliases all nine old parity samples but crosses inside the neighborhood', () => {
  const time = 0.9920632829307579, pose = originalPose('glide', time, 640, 360);
  const source = cameraSource(pose, 640, 360), x = 472.5, y = 93.5;
  for (const dx of [-0.01, 0, 0.01]) for (const dy of [-0.01, 0, 0.01])
    assert.equal(source.ink(x + dx, y + dy), 0);
  assert.equal(source.ink(x, y + 0.003), 1, 'An unsampled interior location disproves the old stability claim.');
  const bounds = countCellNeighborhood(source, x, y);
  assert.equal(bounds.stable, false);
  assert.deepEqual(bounds.lowHalfCells, [146, -388]);
  assert.deepEqual(bounds.highHalfCells, [147, -387]);
  const png = fs.readFileSync(path.join(ROOT, 'native/evidence/synchronized-render-20260905T232319.229573Z/comparison.png'));
  assert.equal(crypto.createHash('sha256').update(png).digest('hex'), '9a0131e4aa04fa3bfa948e41681b19b90bd641a9b98b1205c84d9b4f70e15cd5');
  const crop = cropImage(PNG.sync.read(png, { skipRescale: true }), [0, 0, 640, 360]);
  const result = registerRawCrop(crop, pose);
  assert.equal(result.rule, REGISTRATION_RULE);
  assert.equal(result.passed, true);
  assert.equal(result.legacyParitySampleDiagnostic.passed, false);
  assert.equal(result.legacyParitySampleDiagnostic.mismatches, 1);
  assert.ok(result.legacyParitySampleDiagnostic.failures.some(p => p.x === 472 && p.y === 93));
  assert.ok(result.sourceNeighborhood.rejected.some(p => p.x === 472 && p.y === 93 && p.nominalMismatch));
});
