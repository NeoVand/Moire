#!/usr/bin/env node
// CPU-only validation of one ordinary-game, three-pane screenshot. No shader
// or renderer is imported. PostRenderView observations are graph-construction
// metadata; the image independently identifies a pose, not GPU completion.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { calibrateRawPalette, cameraSource, denseRegistration, poseAtTime } from './compare_game_capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARMS = [0, 1, 2], DARK = 0.025, LIGHT = 0.82, SKY = [0.105, 0.13, 0.16];
export const REGISTRATION_RULE = 'fixed-grid-count-cell-neighborhood-v2';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const finite = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const close = (a, b, tolerance) => finite(a, b.length) && a.every((v, i) => Math.abs(v - b[i]) <= tolerance);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const n = Math.hypot(...a); return a.map(v => v / n); };
const POWER_GAMMA = { name: 'documented-power-gamma-2.2', encode: v => v ** (1 / 2.2), decode: v => v ** 2.2 };

export function originalPose(motion, time, width, height, period = 4) {
  const horizontal_fov_degrees = 360 / Math.PI * Math.atan(Math.tan(25 * Math.PI / 180) * width / height);
  return poseAtTime({ period_world: period, horizontal_fov_degrees }, motion, time);
}

export function originalMatrices(pose, width, height) {
  const convert = a => [-a[2] * 100, a[0] * 100, a[1] * 100];
  const location = convert(pose.three_eye), target = convert(pose.three_target);
  const forward = unit(target.map((v, i) => v - location[i]));
  const right = unit(cross([0, 0, 1], forward)), up = cross(forward, right);
  const worldToView = [right[0], up[0], forward[0], 0, right[1], up[1], forward[1], 0,
    right[2], up[2], forward[2], 0, -dot(location, right), -dot(location, up), -dot(location, forward), 1];
  const sy = 1 / Math.tan(25 * Math.PI / 180), sx = sy * height / width;
  // UE reversed-Z infinite perspective, 10 cm near clip; row-vector layout.
  const projection = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 0, 1, 0, 0, 10, 0];
  const rotation = [0, Math.atan2(forward[2], Math.hypot(forward[0], forward[1])) * 180 / Math.PI,
    Math.atan2(forward[1], forward[0]) * 180 / Math.PI];
  return { location, rotation, worldToView, projection };
}

export function cropImage(image, rect) {
  assert.ok(validRect(rect, image), 'Invalid output crop rectangle.');
  const width = rect[2] - rect[0], height = rect[3] - rect[1];
  const data = Buffer.isBuffer(image.data) ? Buffer.allocUnsafe(width * height * 4) : new image.data.constructor(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = 4 * ((y + rect[1]) * image.width + rect[0]);
    data.set(image.data.subarray(start, start + width * 4), y * width * 4);
  }
  return { width, height, data, depth: image.depth };
}
function validRect(rect, image) {
  return finite(rect, 4) && rect.every(integer) && rect[2] > rect[0] && rect[3] > rect[1]
    && rect[2] <= image.width && rect[3] <= image.height;
}
function codesAt(image, x, y) {
  const scale = image.data.BYTES_PER_ELEMENT === 2 ? 255 / 65535 : 1;
  return Array.from(image.data.subarray(4 * (y * image.width + x), 4 * (y * image.width + x) + 3), v => v * scale);
}

export function countCellNeighborhood(source, x, y, radius = 0.01) {
  // Each original count is a ratio of affine functions. When the denominator
  // has one sign over a rectangle, its extrema occur at rectangle vertices.
  // Requiring one HALF-cell for each count prevents a whole-period skip from
  // masquerading as stable parity at the sampled offsets.
  const points = [-radius, radius].flatMap(dx => [-radius, radius].map(dy => [x + dx, y + dy]));
  if (!points.every(([px, py]) => source.horizonDistance(px, py) > 0))
    return { stable: false, reason: 'neighborhood touches or crosses ground-facing denominator boundary' };
  const counts = points.map(([px, py]) => source.ground(px, py));
  if (!counts.every(q => finite(q, 2))) return { stable: false, reason: 'neighborhood leaves finite ground' };
  const minimum = [0, 1].map(axis => Math.min(...counts.map(q => q[axis])));
  const maximum = [0, 1].map(axis => Math.max(...counts.map(q => q[axis])));
  const guard = 1e-10;
  const lowHalfCells = minimum.map(v => Math.floor(2 * (v - guard)));
  const highHalfCells = maximum.map(v => Math.floor(2 * (v + guard)));
  const stable = same(lowHalfCells, highHalfCells);
  return { stable, reason: stable ? 'each count stays in one half-cell' : 'at least one count crosses a half-cell boundary',
    minimum, maximum, lowHalfCells, highHalfCells, countBoundaryGuard: guard };
}

export function rigorousGridDiagnostic(image, pose, expanded = false) {
  const source = cameraSource(pose, image.width, image.height);
  const result = { family: expanded ? 'expanded x13 step17, y13 step11' : 'frozen x13 step17, y93 step11',
    selection: 'Source-only count extrema at all four ±0.01px rectangle corners with fixed-sign denominator; both half-cell indices must remain unchanged. Output colors never select exclusions.',
    total: 0, stableChecked: 0, stableMismatches: [], rejected: [] };
  const maxX = expanded ? image.width - 10 : image.width, maxY = expanded ? image.height - 10 : image.height;
  for (let y = expanded ? 13 : 93; y < maxY; y += 11) for (let x = 13; x < maxX; x += 17) {
    result.total++;
    const px = x + 0.5, py = y + 0.5, ink = source.ink(px, py);
    if (ink === null || source.horizonDistance(px, py) <= 3) {
      result.rejected.push({ x, y, reason: ink === null ? 'center outside finite ground' : 'center within3px of horizon' });
      continue;
    }
    const bounds = countCellNeighborhood(source, px, py);
    const expected = Math.round(255 * POWER_GAMMA.encode(DARK + (LIGHT - DARK) * ink)), observed = codesAt(image, x, y);
    const nominalMismatch = observed.some(v => Math.abs(v - expected) > 1);
    if (!bounds.stable) {
      result.rejected.push({ x, y, ...bounds, nominalMismatch,
        ...(nominalMismatch ? { expected, observed, horizonDistancePixels: source.horizonDistance(px, py) } : {}) });
      continue;
    }
    result.stableChecked++;
    if (nominalMismatch) result.stableMismatches.push({ x, y, expected, observed, bounds,
      horizonDistancePixels: source.horizonDistance(px, py) });
  }
  result.passed = result.stableChecked > 0 && result.stableMismatches.length === 0;
  result.limitation = 'This certifies the mathematical original-source neighborhood, not a bound on GPU coordinate error. The v2 registration rule uses it on the unchanged frozen xy grid. Legacy sampled-parity and nominal expanded-grid results remain separate diagnostics.';
  return result;
}

export function registerRawCrop(image, pose) {
  const source = cameraSource(pose, image.width, image.height);
  // Preserve the old nine-offset guard verbatim as diagnostic evidence. Its
  // sampled parity can alias, as the real loop witness (472,93) demonstrates.
  // V2 changes only the source-only stability predicate, on the SAME xy grid.
  const established = denseRegistration(image, source, POWER_GAMMA);
  const rigorous = rigorousGridDiagnostic(image, pose);
  let checked = 0, mismatches = 0;
  const firstFailures = [];
  for (let y = 13; y < image.height - 10; y += 11) for (let x = 13; x < image.width - 10; x += 17) {
    const px = x + 0.5, py = y + 0.5, ink = source.ink(px, py);
    if (ink === null || source.horizonDistance(px, py) <= 3
      || ![-0.01, 0, 0.01].every(dx => [-0.01, 0, 0.01].every(dy => source.ink(px + dx, py + dy) === ink))) continue;
    checked++;
    const expected = Math.round(255 * POWER_GAMMA.encode(DARK + (LIGHT - DARK) * ink));
    const observed = codesAt(image, x, y);
    if (observed.some(v => Math.abs(v - expected) > 1)) {
      mismatches++;
      if (firstFailures.length < 8) {
        const eps = 0.001, left = source.ground(px - eps, py), right = source.ground(px + eps, py);
        const above = source.ground(px, py - eps), below = source.ground(px, py + eps);
        firstFailures.push({ x, y, expected, observed, horizonDistancePixels: source.horizonDistance(px, py),
          sourceCounts: source.ground(px, py), countRatesPerPixel: {
            method: 'Centered difference of the original rational camera rays, step0.001px',
            dx: left && right ? right.map((v, i) => (v - left[i]) / (2 * eps)) : null,
            dy: above && below ? below.map((v, i) => (v - above[i]) / (2 * eps)) : null,
          } });
      }
    }
  }
  return { rule: REGISTRATION_RULE, checked: rigorous.stableChecked, mismatches: rigorous.stableMismatches.length,
    firstFailures: rigorous.stableMismatches.slice(0, 8), passed: rigorous.stableChecked >= 500 && rigorous.stableMismatches.length === 0,
    family: 'Unchanged frozen xy grid: x=13..<640 step17, y=93..<360 step11; original-source horizon>3px; each count remains in one half-cell throughout±0.01px.',
    sourceNeighborhood: rigorous,
    legacyParitySampleDiagnostic: { rule: 'fixed-grid-nine-parity-samples-v1', ...established,
      mismatches: established.failures.length, passed: established.checked >= 500 && established.failures.length === 0 },
    expandedGridDiagnostic: { checked, mismatches, firstFailures,
      family: 'Additional y=13 step11 grid; not the committed frame-registration family. This exposed two source residuals at y=90 in the historical paused raw control.' } };
}

function anchorCrops(crops, pose) {
  const source = cameraSource(pose, crops[0].width, crops[0].height);
  const results = { sky: 0, constantGround: 0, failures: [] };
  for (let y = 7; y < crops[0].height - 8; y += 29) for (let x = 19; x < crops[0].width - 20; x += 53) {
    const px = x + 0.5, py = y + 0.5, q = source.ground(px, py);
    let expected;
    if (q === null && source.horizonDistance(px, py) < -3) {
      results.sky++;
      expected = SKY;
    } else if (q !== null && source.horizonDistance(px, py) > 3) {
      const bins = q.map(v => Math.floor(2 * v));
      const constant = [-3, 3].every(dx => [-3, 3].every(dy => {
        const other = source.ground(px + dx, py + dy);
        return other !== null && other.every((v, i) => Math.floor(2 * v) === bins[i]);
      }));
      if (!constant) continue;
      results.constantGround++;
      const ink = source.ink(px, py), color = DARK + (LIGHT - DARK) * ink;
      expected = [color, color, color];
    } else continue;
    const target = expected.map(v => Math.round(255 * POWER_GAMMA.encode(v)));
    for (const arm of ARMS) {
      const observed = codesAt(crops[arm], x, y);
      if (observed.some((v, i) => Math.abs(v - target[i]) > 1))
        results.failures.push({ arm, x, y, expected: target, observed });
    }
  }
  results.passed = results.sky >= 5 && results.constantGround >= 5 && results.failures.length === 0;
  return results;
}

export function validateSynchronized({ image, telemetry, captureReport, preparation }) {
  const checks = [], warnings = [];
  const check = (name, passed, detail) => { checks.push({ name, passed: Boolean(passed), ...(detail ? { detail } : {}) }); return Boolean(passed); };
  const t = telemetry, c = captureReport, p = preparation;
  const requiredCVars = { 'r.ScreenPercentage': 100, 'r.SecondaryScreenPercentage.GameViewport': 100,
    'r.DynamicRes.OperationMode': 0, 'r.TSR.History.ScreenPercentage': 200,
    'r.MotionBlurQuality': 0, 'r.DepthOfFieldQuality': 0, 'r.BloomQuality': 0,
    'r.EyeAdaptationQuality': 0, 'r.EyeAdaptation.PreExposureOverride': 1,
    'r.LensFlareQuality': 0, 'r.SceneColorFringeQuality': 0, 'ShowFlag.Tonemapper': 0 };
  check('schema and terminal telemetry', t.schema === 'moire-synchronized-v1' && t.status === 'observed-unverified' && t.failure === '');
  check('ordinary game route', t.ordinary_game_renderer === true && t.performance_measurement === false && c.paused_for_capture === false
    && Array.isArray(c.argv) && c.argv.includes('-game') && c.argv.includes('-MoireSynchronized') && !c.argv.includes('-RenderOffScreen'));
  check('process succeeded without ensures', c.exit_code === 0 && c.status === 'captured-validation-pending'
    && Array.isArray(c.failures) && c.failures.length === 0 && Array.isArray(c.handled_ensures) && c.handled_ensures.length === 0);
  check('capture source hashes stable', c.source_hashes_stable === true && same(c.source_hashes, c.source_hashes_after) && Object.keys(c.source_hashes ?? {}).length >= 9);
  check('owned source scene and map preparation', p.status === 'passed' && p.generator === 'native-comparison-v1'
    && p.map_sha256 === c.map_sha256 && p.initial_pose?.period_world === 4 && p.initial_pose?.detail === 1
    && p.plane_width_cm === 10000000 && p.protected_assets_unchanged === true && p.source_unchanged === true);
  for (const role of ['point', 'analytic', 'sky']) {
    const material = p.materials?.[role], name = material?.path?.split('.').pop();
    const key = `native/Unreal/MoireComparison/Content/MoireComparison/Materials/${name}.uasset`;
    check(`${role} material hash agrees with prepared scene`, typeof material?.sha256 === 'string' && c.source_hashes?.[key] === material.sha256);
  }
  check('documented gamma-only command and common source settings', Object.entries(requiredCVars).every(([name, value]) => c.requested_cvars?.[name] === value)
    && c.argv?.some(arg => arg.startsWith('-ExecCmds=') && arg.slice(10).split(',').map(s => s.trim()).includes('gamma 2.2')));
  check('screenshot file was processed', t.shot_requested === true && t.shot_processed === true && t.shot_file_exists === true
    && integer(t.shot_requested_game_frame) && integer(t.shot_processed_game_frame) && t.shot_processed_game_frame > t.shot_requested_game_frame);
  check('supported source motion', ['glide', 'approach'].includes(t.motion));
  check('explicit temporal/source mode metadata', typeof t.third_arm_tsr === 'boolean' && typeof t.uses_fixed_source_time === 'boolean'
    && Number.isFinite(t.loop_seconds) && t.loop_seconds >= 0);
  check('observed source mode agrees with requested run', c.third_tsr === t.third_arm_tsr
    && (t.uses_fixed_source_time ? Number.isFinite(c.fixed_time_seconds) && Math.abs(c.fixed_time_seconds - t.fixed_source_time_seconds) <= 1e-9
      : c.fixed_time_seconds === null));
  const shapeOK = check('supported image and recorded pane size', integer(image.width) && integer(image.height)
    && image.width === 1920 && image.height === 360 && image.data.length === image.width * image.height * 4
    && [1, 2].includes(image.data.BYTES_PER_ELEMENT) && same(c.requested_window_pixels, [image.width, image.height])
    && same(c.requested_pane_pixels, [640, 360]));
  const rows = Array.isArray(t.final_view_observations) ? t.final_view_observations : [];
  const windowOK = check('bounded observation metadata', integer(t.first_game_frame) && integer(t.observation_frame_count)
    && t.observation_frame_count >= 2 && rows.length >= 3);
  const rowShapeOK = check('view records have finite matrices and identifiers', rows.length > 0 && rows.every(v => ARMS.includes(v.arm)
    && integer(v.game_frame) && integer(v.relative_frame) && integer(v.render_frame_number) && integer(v.controller_id)
    && integer(v.view_key) && v.view_key > 0 && typeof v.view_state_identity === 'string' && /^[1-9][0-9]*$/.test(v.view_state_identity)
    && Number.isFinite(v.source_time_seconds) && v.source_time_seconds >= 0 && integer(v.loop_index)
    && Number.isFinite(v.secondary_resolution_fraction) && typeof v.explicit_initial_or_loop_cut === 'boolean'
    && typeof v.observed_camera_cut === 'boolean'
    && finite(v.world_to_view, 16) && finite(v.projection_no_aa, 16) && finite(v.camera_location, 3)
    && finite(v.camera_rotation, 3) && finite(v.jitter_clip, 2) && validRect(v.output_rect, image)));
  const groups = new Map();
  if (rowShapeOK) for (const row of rows) {
    const key = `${row.game_frame}:${row.render_frame_number}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const familyOK = rowShapeOK && windowOK && [...groups.values()].every(views => views.length === 3 && new Set(views.map(v => v.arm)).size === 3);
  check('each recorded render family contains exactly three arms', familyOK);
  const seenGameFrames = new Set(rows.map(v => v.game_frame));
  const missingGameFrames = [];
  if (windowOK) for (let frame = t.first_game_frame; frame < t.first_game_frame + t.observation_frame_count; frame++)
    if (!seenGameFrames.has(frame)) missingGameFrames.push(frame);
  check('complete expected game-frame coverage', windowOK && missingGameFrames.length === 0
    && rows.every(v => v.game_frame >= t.first_game_frame && v.game_frame < t.first_game_frame + t.observation_frame_count),
  missingGameFrames.length ? `Missing game frames: ${missingGameFrames.join(',')}` : undefined);
  check('render-family identifiers are unique', new Set([...groups.values()].map(views => views[0].render_frame_number)).size === groups.size);
  let observedMetadataPassed = false, heldOutSource = null, rigorousSourceNeighborhoods = null,
    registration = { rule: REGISTRATION_RULE, passed: false, candidates: [], savedGameFrame: null, sourceTime: null },
    rawPalette = null, anchors = null, primaryRasterVerified = false;
  if (shapeOK && familyOK && ['glide', 'approach'].includes(t.motion)) {
    const families = [...groups.values()].map(views => ({ frame: views[0].game_frame, renderFrame: views[0].render_frame_number,
      views: views.sort((a, b) => a.arm - b.arm) })).sort((a, b) => a.frame - b.frame || a.renderFrame - b.renderFrame);
    const first = families[0].views;
    check('three distinct persistent histories and controllers', new Set(first.map(v => v.view_key)).size === 3
      && new Set(first.map(v => v.view_state_identity)).size === 3 && new Set(first.map(v => v.controller_id)).size === 3);
    const errors = [];
    let previous = null;
    for (const { frame, views } of families) {
      const head = views[0];
      const common = ['source_time_seconds', 'loop_index', 'explicit_initial_or_loop_cut', 'observed_camera_cut', 'render_frame_number'];
      if (!common.every(key => views.every(v => v[key] === head[key]))) errors.push(`frame${frame}: source/cut/render family mismatch`);
      if (t.uses_fixed_source_time) {
        if (!Number.isFinite(t.fixed_source_time_seconds) || Math.abs(head.source_time_seconds - t.fixed_source_time_seconds) > 1e-9) errors.push(`frame${frame}: fixed source time mismatch`);
      } else if (previous && head.game_frame !== previous.game_frame) {
        const loop = head.loop_index === previous.loop_index + 1;
        if (!(head.source_time_seconds > previous.source_time_seconds && head.loop_index === previous.loop_index)
          && !(loop && t.loop_seconds > 0 && head.source_time_seconds < previous.source_time_seconds && head.explicit_initial_or_loop_cut))
          errors.push(`frame${frame}: nonmonotonic motion without declared replay cut`);
      }
      if ((previous === null || head.loop_index !== previous.loop_index) && !head.explicit_initial_or_loop_cut) errors.push(`frame${frame}: missing initial/replay cut`);
      if (head.explicit_initial_or_loop_cut && !head.observed_camera_cut) errors.push(`frame${frame}: explicit cut not observed`);
      const pose = originalPose(t.motion, head.source_time_seconds, 640, 360), matrices = originalMatrices(pose, 640, 360);
      for (const v of views) {
        const temporal = v.arm === 1 || (v.arm === 2 && t.third_arm_tsr);
        if (v.relative_frame !== frame - t.first_game_frame || v.view_key !== first[v.arm].view_key
          || v.view_state_identity !== first[v.arm].view_state_identity || v.controller_id !== first[v.arm].controller_id) errors.push(`frame${frame}/arm${v.arm}: identity changed`);
        if (v.anti_aliasing_method !== (temporal ? 4 : 0) || v.primary_screen_percentage_method !== (temporal ? 1 : 0)
          || v.allows_temporal_jitter !== temporal || v.third_party_temporal_upscaler !== false || v.offline_render !== false
          || (!temporal && Math.hypot(...v.jitter_clip) > 1e-12) || Math.abs(v.secondary_resolution_fraction - 1) > 1e-6)
          errors.push(`frame${frame}/arm${v.arm}: AA/jitter/scaling/mode mismatch`);
        if (!same(v.output_rect, [v.arm * 640, 0, (v.arm + 1) * 640, 360]) || !same(v.unconstrained_rect, v.output_rect)) errors.push(`frame${frame}/arm${v.arm}: output crop mismatch`);
        if (!close(v.camera_location, matrices.location, 0.01) || !close(v.camera_rotation, matrices.rotation, 1e-4)
          || !v.world_to_view.every((value, i) => Math.abs(value - matrices.worldToView[i]) <= (i >= 12 && i < 15 ? 0.01 : 2e-6))
          || !close(v.projection_no_aa, matrices.projection, 2e-6))
          errors.push(`frame${frame}/arm${v.arm}: original camera/projection mismatch`);
        if (!close(v.world_to_view, head.world_to_view, 1e-8) || !close(v.projection_no_aa, head.projection_no_aa, 1e-8)) errors.push(`frame${frame}: per-pane matrices differ`);
      }
      previous = head;
    }
    check('shared camera, AA, history, cuts and output crops match the source', errors.length === 0, errors.slice(0, 20).join('; '));
    for (const arm of ARMS.filter(a => a === 1 || a === 2 && t.third_arm_tsr)) {
      const sequence = families.map(f => f.views[arm].jitter_clip);
      check(`arm${arm}: temporal jitter actually varies`, sequence.some(j => Math.hypot(...j) > 1e-10)
        && new Set(sequence.map(j => j.map(v => v.toPrecision(10)).join(','))).size >= 2);
    }
    primaryRasterVerified = t.primary_raster_diagnostic_enabled === true && t.all_recorded_primary_raster_rects_observed === true
      && rows.every(v => v.primary_raster_observed === true && finite(v.primary_raster_rect, 4)
        && v.primary_raster_rect.every(integer) && v.primary_raster_rect[2] - v.primary_raster_rect[0] === 640
        && v.primary_raster_rect[3] - v.primary_raster_rect[1] === 360 && close(v.primary_raster_to_output_ratio, [1, 1], 1e-9));
    if (!primaryRasterVerified) warnings.push('Equal primary raster sizes are unverified. Requested 100% and observed output rectangles do not verify the private primary raster rectangle.');
    if (t.uniform_buffer_cpu_copy_overhead_enabled) warnings.push('Uniform-buffer CPU-copy diagnostics were enabled; this capture is unsuitable for performance timing.');
    observedMetadataPassed = checks.every(item => item.passed);
    const crops = first.map(v => cropImage(image, v.output_rect));
    rawPalette = calibrateRawPalette(crops[0], POWER_GAMMA);
    check('raw crop validates documented transfer palette', rawPalette.passed);
    const candidates = families.filter(f => f.frame > t.shot_requested_game_frame && f.frame <= t.shot_processed_game_frame);
    for (const { frame, renderFrame, views } of candidates) {
      const pose = originalPose(t.motion, views[0].source_time_seconds, 640, 360);
      registration.candidates.push({ gameFrame: frame, renderFrameNumber: renderFrame, sourceTime: views[0].source_time_seconds,
        ...registerRawCrop(crops[0], pose) });
    }
    const matches = registration.candidates.filter(v => v.passed);
    if (t.uses_fixed_source_time) {
      registration.passed = candidates.length > 0 && matches.length === candidates.length;
      registration.kind = 'fixed-pose-image-registration';
      registration.sourceTime = registration.passed ? t.fixed_source_time_seconds : null;
      registration.savedGameFrame = null;
      registration.savedRenderFrameNumber = null;
      registration.identity = 'A static source can validate the pose but cannot identify which equal-pose rendered family supplied the PNG.';
    } else {
      registration.passed = matches.length === 1;
      registration.kind = 'moving-image-registration';
      registration.sourceTime = registration.passed ? matches[0].sourceTime : null;
      registration.savedGameFrame = registration.passed ? matches[0].gameFrame : null;
      registration.savedRenderFrameNumber = registration.passed ? matches[0].renderFrameNumber : null;
      registration.identity = 'Raw pixels must select exactly one recorded post-request rendered family. Callback frame is only an interval endpoint.';
    }
    check('saved image identifies the required source pose', registration.passed,
      `${matches.length} image-matching families among ${candidates.length} candidates; ${registration.kind}`);
    if (registration.passed) {
      heldOutSource = { ...matches[0].expandedGridDiagnostic, passed: matches[0].expandedGridDiagnostic.mismatches === 0 };
      if (!heldOutSource.passed) warnings.push(`${heldOutSource.mismatches} additional raw-source mismatches in the held-out expanded grid; registration is not a full-source correctness pass.`);
      anchors = anchorCrops(crops, originalPose(t.motion, registration.sourceTime, 640, 360));
      rigorousSourceNeighborhoods = {
        frozenGrid: rigorousGridDiagnostic(crops[0], originalPose(t.motion, registration.sourceTime, 640, 360)),
        expandedGrid: rigorousGridDiagnostic(crops[0], originalPose(t.motion, registration.sourceTime, 640, 360), true),
      };
      check('all panes share sky and constant-source registration anchors', anchors.passed,
        `${anchors.sky} sky, ${anchors.constantGround} constant-ground anchors; ${anchors.failures.length} mismatches`);
    }
  }
  const imageAndObservedMetadataPassed = checks.every(item => item.passed);
  const passed = imageAndObservedMetadataPassed && primaryRasterVerified;
  return { schema: 'moire-synchronized-validation-v1', status: passed ? 'registered-and-comparable'
    : imageAndObservedMetadataPassed ? 'registered-primary-raster-unverified' : 'validation-failed', passed,
  performanceMeasurement: false, temporalQualityEstablished: false, observedMetadataPassed,
  comparability: { passed, primaryRasterVerified, imageAndObservedMetadataPassed }, checks,
  failures: checks.filter(item => !item.passed), warnings, registration, heldOutSource, rigorousSourceNeighborhoods,
  observationCoverage: { expectedGameFrames: t.observation_frame_count, observedGameFrames: seenGameFrames.size,
    recordedRenderFamilies: groups.size, missingGameFrames },
  calibration: { transfer: POWER_GAMMA.name, rawPalette, anchors },
  limitations: [
    'PostRenderView records final graph-construction state; they are not GPU-completion or performance measurements.',
    'Only the raw crop independently identifies source pose/time. Other panes are associated through their common rendered family, camera matrices and constant-source anchors.',
    'Equal fixed-pose frames cannot identify an exact saved game frame. Moving frames that match multiple recorded source times are rejected.',
    'Primary output rectangles and requested resolution are not measurements of the private primary raster rectangle.',
    'This is registration and configuration validation, not a filter-quality score, temporal trajectory evaluation or frame-rate benchmark.',
    'Registration rulev2 uses source-only count extrema on the unchanged frozen xy grid. The invalid v1 nine-offset parity-stability claim is retained as a diagnostic; expanded-grid residuals and all source-only exclusions remain visible.',
    'Power-gamma 2.2 follows the documented gamma-only ordinary Shot path; source palette and constant anchors validate this readback, not arbitrary continuous transfer accuracy.',
  ] };
}

export function main(argv = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    assert.ok(['--capture', '--out'].includes(argv[i]) && argv[i + 1], 'Use --capture render/report.json [--out new-report.json].');
    options[argv[i].slice(2)] = path.resolve(argv[i + 1]);
  }
  assert.ok(options.capture, 'An explicit capture report is required.');
  const directory = path.dirname(options.capture);
  const files = { capture: options.capture, telemetry: path.join(directory, 'views.json'), preparation: path.join(directory, 'preparation.json'), image: path.join(directory, 'comparison.png') };
  const bytes = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, fs.readFileSync(file)]));
  const captureReport = JSON.parse(bytes.capture), telemetry = JSON.parse(bytes.telemetry), preparation = JSON.parse(bytes.preparation);
  assert.equal(sha(bytes.image), captureReport.image?.sha256, 'PNG hash differs from capture report.');
  const image = PNG.sync.read(bytes.image, { skipRescale: true });
  assert.deepEqual([image.width, image.height], captureReport.image.size, 'PNG dimensions differ from report.');
  const result = validateSynchronized({ image, telemetry, captureReport, preparation });
  result.inputs = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { path: path.relative(ROOT, file), sha256: sha(bytes[name]) }]));
  result.createdAt = new Date().toISOString();
  result.validatorSha256 = sha(fs.readFileSync(fileURLToPath(import.meta.url)));
  result.sourceHelperSha256 = sha(fs.readFileSync(path.join(ROOT, 'native/tools/compare_game_capture.mjs')));
  const out = options.out ?? path.join(directory, `validation-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ output: out, status: result.status, failures: result.failures, warnings: result.warnings,
    registration: { ...result.registration, candidates: result.registration.candidates.map(v => ({ gameFrame: v.gameFrame, renderFrameNumber: v.renderFrameNumber, sourceTime: v.sourceTime, checked: v.checked, mismatches: v.mismatches })) } }, null, 2));
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (!main().passed) process.exitCode = 1; }
  catch (error) { console.error(error.stack ?? error); process.exitCode = 1; }
}
