// CPU-only scorer controls. The PNG is a committed t=2 paused-history capture.
// ALL nearby-tick metadata below is synthetic and never saved as capture
// evidence. Passing these tests proves no uninterrupted playback or GPU rate.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PNG } from 'pngjs';
import {
  calibrateRawPalette, cameraSource, denseRegistration, poseAtTime,
  resolveTransfer, resolveUninterruptedPose,
} from './compare_game_capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRECTORY = path.join(ROOT, 'native/evidence/viewport-diagnosis-20260905T212612.895862Z-raw-Glide0');
const capture = JSON.parse(fs.readFileSync(path.join(DIRECTORY, 'report.json'), 'utf8'));
const pngBytes = fs.readFileSync(path.join(DIRECTORY, 'frames/raw_Glide0.0120.png'));
const image = PNG.sync.read(pngBytes, { skipRescale: true });
const transfer = resolveTransfer([capture, capture, capture]);
const base = capture.prepared_scene.camera_pose;
const ARMS = ['raw', 'tsr', 'analytic'];

function tick(frame, engineFrame, phase = 'post', subFrame = 0) {
  const time = (frame + subFrame) / 60;
  const pose = poseAtTime(base, 'glide', time);
  const look = pose.three_target.map((v, i) => v - pose.three_eye[i]);
  return {
    synthetic_test_metadata: true,
    phase, engine_frame: engineFrame,
    sequence_time: { frame, sub_frame: subFrame, rate_numerator: 60, rate_denominator: 1 },
    camera_location: [-100 * pose.three_eye[2], 100 * pose.three_eye[0], 100 * pose.three_eye[1]],
    camera_rotation: [0, Math.atan2(look[1], Math.hypot(look[0], look[2])) * 180 / Math.PI,
      Math.atan2(look[0], -look[2]) * 180 / Math.PI],
    camera_fov: pose.horizontal_fov_degrees,
    is_playing: true, camera_cut: false,
  };
}

function records() {
  return Object.fromEntries(ARMS.map(arm => {
    const report = structuredClone(capture);
    Object.assign(report.contract, {
      arm, capture_uninterrupted_motion: true, capture_after_paused_motion_history: false,
      sample_time_seconds: null, output_sequence_frame: null, requested_sequence_frame: 120,
    });
    Object.assign(report.artifacts[0], { sequence_frame: null, file_frame_label: 120 });
    Object.assign(report.shot_record, {
      synthetic_test_metadata: true, requested_engine_frame: 400, completed_engine_frame: 403,
      paused_for_shot: false, extra_stationary_readback_frame: false,
      nearby_ticks: [tick(119, 400), tick(119, 401, 'pre'), tick(120, 401),
        tick(120, 402, 'pre'), tick(121, 402), tick(121, 403, 'pre'), tick(122, 403)],
    });
    // Only raw pixels are examined by this resolver. Reusing the image here
    // does not invent TSR or analytic rendering evidence.
    return [arm, { report, image }];
  }));
}

const resolve = (data = records(), explicitTime, curve = transfer) => resolveUninterruptedPose(data, explicitTime, curve);
const rejected = result => {
  assert.equal(result.frameRegistration.passed, false,
    `Expected rejection; candidates=${JSON.stringify(result.frameRegistration.candidates.map(c => ({ time: c.time, frame: c.engineFrame, mismatches: c.mismatches })))}`);
  assert.match(result.source, /diagnostic only/, 'Rejected registration must not claim an established saved time.');
};

test('committed paused-history image has the expected bytes and documented transfer', () => {
  assert.equal(crypto.createHash('sha256').update(pngBytes).digest('hex'), '7e2fe960601976bbb6bf72584878a47fd6fa9bfee40aaf43cf6f3f0eb6691421');
  assert.deepEqual([image.width, image.height], [640, 360]);
  assert.equal(capture.contract.capture_after_paused_motion_history, true);
  assert.equal(capture.contract.sample_time_seconds, 2);
  assert.equal(transfer.supported, true);
  assert.equal(calibrateRawPalette(image, transfer).passed, true);
});

test('dense original-source registration distinguishes two seconds from adjacent 60-Hz frames', () => {
  for (const frame of [119, 120, 121]) {
    const result = denseRegistration(image, cameraSource(poseAtTime(base, 'glide', frame / 60), 640, 360), transfer);
    assert.ok(result.checked >= 500);
    if (frame === 120) assert.equal(result.failures.length, 0);
    else assert.ok(result.failures.length > 0, `Adjacent frame ${frame} must mismatch the committed image.`);
  }
});

test('unique image-matching tick selects t=2 despite an incorrect requested filename label', () => {
  const data = records();
  for (const arm of ARMS) data[arm].report.contract.requested_sequence_frame = 119;
  const result = resolve(data);
  assert.equal(result.frameRegistration.passed, true);
  assert.equal(result.time, 2);
  assert.deepEqual(result.pose.three_eye, base.three_eye);
  assert.deepEqual(result.pose.three_target, base.three_target);
  assert.equal(result.frameRegistration.candidates.length, 3);
  assert.equal(result.frameRegistration.candidates.filter(c => c.mismatches === 0).length, 1);
  for (const arm of ARMS) assert.equal(result.frameRegistration.selectedTicks[arm].engine_frame, 401);
});

test('missing image-matching candidate cannot fall back to the requested frame', () => {
  const data = records();
  for (const arm of ARMS) data[arm].report.shot_record.nearby_ticks = data[arm].report.shot_record.nearby_ticks
    .filter(t => t.sequence_time.frame !== 120);
  const result = resolve(data);
  rejected(result);
  assert.match(result.frameRegistration.failures.join(' '), /found 0/);
});

test('explicit time must agree with the independent image registration', () => {
  const result = resolve(records(), 121 / 60);
  rejected(result);
  assert.match(result.frameRegistration.failures.join(' '), /Explicit time conflicts/);
});

test('duplicate matching post records are rejected', () => {
  const data = records();
  data.raw.report.shot_record.nearby_ticks.push(tick(120, 401));
  rejected(resolve(data));
});

test('identical sequence time on two distinct engine frames is ambiguous, not deduplicated', () => {
  const data = records();
  for (const arm of ARMS) data[arm].report.shot_record.nearby_ticks = [
    tick(119, 400), tick(120, 401), tick(120, 402), tick(121, 403),
  ];
  rejected(resolve(data));
});

test('two distinct image-indistinguishable times are rejected rather than fitted', () => {
  const data = records();
  for (const arm of ARMS) data[arm].report.shot_record.nearby_ticks = [
    tick(119, 400), tick(120, 401), tick(120, 402, 'post', 0.0006), tick(121, 403),
  ];
  const result = resolve(data);
  assert.ok(result.frameRegistration.candidates.filter(c => c.mismatches === 0).length >= 2);
  rejected(result);
});

test('unsupported transfer and wrong palette calibration both reject registration', () => {
  rejected(resolve(records(), undefined, { ...transfer, supported: false }));
  rejected(resolve(records(), undefined, { ...transfer, encode: value => value }));
});

test('matching camera time at a different readback phase in one arm is rejected', () => {
  const data = records();
  data.analytic.report.shot_record.nearby_ticks = [tick(119, 400), tick(119, 401), tick(120, 402), tick(121, 403)];
  const result = resolve(data);
  rejected(result);
  assert.match(result.frameRegistration.failures.join(' '), /analytic/);
});

test('pre-request and pre-tick observations cannot establish the saved frame', () => {
  const data = records();
  for (const arm of ARMS) data[arm].report.shot_record.nearby_ticks = [
    tick(120, 400), tick(120, 401, 'pre'), tick(121, 401), tick(122, 402),
  ];
  rejected(resolve(data));
});

test('mixing paused and uninterrupted capture contracts is rejected', () => {
  const data = records();
  data.tsr.report.contract.capture_uninterrupted_motion = false;
  rejected(resolve(data));
});
