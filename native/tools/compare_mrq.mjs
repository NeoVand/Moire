#!/usr/bin/env node
// CPU-only validation of captured native pixels. This does not import the
// analytic kernel, its homography helper, or Unreal's material implementation.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { gaussianOffsets, integratePixel } from '../../tests/compare/reference.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARMS = ['raw', 'tsr', 'analytic'];
const DEFAULTS = {
  raw: 'mrq-capture-20260905T203404.322055Z-raw-Glide0',
  tsr: 'mrq-capture-20260905T203440.239836Z-tsr-Glide0',
  analytic: 'mrq-capture-20260905T203502.965788Z-analytic-Glide0',
};
// The exact preparation bytes travel with this fixed capture family. Paths
// recorded by the original Unreal process are provenance, never file inputs.
const PREPARATION_ARCHIVE = '../mrq-prepare-20260905T203352.265013Z/preparation.json';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i].replace(/^--/, '');
  if (![...ARMS, 'preparation', 'out'].includes(name) || !process.argv[i + 1]) {
    throw new Error('Usage: node native/tools/compare_mrq.mjs [--raw report.json] [--tsr report.json] [--analytic report.json] [--preparation preparation.json] [--out new-directory]');
  }
  options[name] = path.resolve(process.argv[i + 1]);
}
const createdAt = new Date().toISOString();
const output = options.out ?? path.join(ROOT, 'native/evidence', `quality-${createdAt.replaceAll(/[-:.]/g, '')}`);
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = p => path.relative(ROOT, p);
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const srgb = linear => linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
const linear = encoded => encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
const DARK = 0.025;
const LIGHT = 0.82;
const SKY = [0.105, 0.13, 0.16];
const SIGMA = 0.5;
const PLANE_HALF_WIDTH = 50000;
const records = {};
for (const arm of ARMS) {
  const reportPath = options[arm] ?? path.join(ROOT, 'native/evidence', DEFAULTS[arm], 'report.json');
  const report = readJson(reportPath);
  assert.equal(report.exit_code, 0, `${arm}: capture exit`);
  assert.equal(report.source_hashes_stable, true, `${arm}: source changed during capture`);
  assert.deepEqual(report.source_hashes, report.source_hashes_after);
  assert.equal(report.frame_files_valid, true);
  assert.deepEqual(report.render_failures, []);
  assert.equal(report.performance_measurement, false);
  assert.equal(report.prepared_config.arm, arm);
  assert.equal(report.prepared_config.pose, 'Glide0');
  assert.equal(report.artifacts.length, 1);
  const artifact = report.artifacts[0];
  const imagePath = path.join(path.dirname(reportPath), 'frames', path.basename(artifact.path));
  const imageBytes = fs.readFileSync(imagePath);
  assert.equal(sha(imageBytes), artifact.sha256, `${arm}: PNG hash changed`);
  const image = PNG.sync.read(imageBytes);
  assert.deepEqual([image.width, image.height], artifact.size);
  assert.deepEqual(artifact.size, [640, 360], 'The fixed pixel family is for 640 by 360 Glide0.');
  assert.equal(artifact.sequence_frame, 64);
  const preparationPath = options.preparation ?? path.resolve(path.dirname(reportPath), PREPARATION_ARCHIVE);
  assert.equal(sha(fs.readFileSync(preparationPath)), report.preparation_sha256, `${arm}: archived preparation hash mismatch`);
  const aa = arm === 'tsr' ? 4 : 0;
  const expectedCvars = {
    'r.AntiAliasingMethod': aa,
    'r.ScreenPercentage': 100,
    'r.SecondaryScreenPercentage.GameViewport': 100,
    'r.DynamicRes.OperationMode': 0,
    'r.TSR.History.ScreenPercentage': 200,
    'r.Tonemapper.Quality': 0,
  };
  const observedCvars = {};
  for (const [name, value] of Object.entries(expectedCvars)) {
    assert.equal(report.prepared_config.requested_cvars[name], value);
    const matching = report.console_setting_lines.filter(line => line.includes(`${name} = "${value}"`));
    assert.ok(matching.length > 0, `${arm}: no queried log evidence for ${name}=${value}`);
    observedCvars[name] = matching;
  }
  records[arm] = { reportPath, report, imagePath, preparationPath, image, observedCvars };
}
const base = records.raw.report;
const omit = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));
for (const arm of ARMS) {
  const r = records[arm].report;
  assert.deepEqual(r.engine_build, base.engine_build);
  assert.equal(r.preparation_sha256, base.preparation_sha256);
  assert.deepEqual(r.prepared_config.camera_pose, base.prepared_config.camera_pose);
  assert.deepEqual(omit(r.prepared_config.requested_cvars, 'r.AntiAliasingMethod'), omit(base.prepared_config.requested_cvars, 'r.AntiAliasingMethod'));
  assert.deepEqual(omit(r.prepared_config.contract, 'aa_method'), omit(base.prepared_config.contract, 'aa_method'));
  assert.equal(r.prepared_config.contract.aa_method, arm === 'tsr' ? 'TSR' : 'None');
}
for (const property of ['map', 'map_sha256', 'sequence', 'sequence_sha256']) {
  assert.equal(records.tsr.report.prepared_config[property], base.prepared_config[property]);
}
const commonHashes = Object.fromEntries(Object.entries(base.source_hashes).filter(([name]) => ARMS.every(arm => name in records[arm].report.source_hashes)));
assert.ok(Object.keys(commonHashes).length >= 16, 'Missing shared shader, material, and host source evidence.');
for (const arm of ARMS) {
  for (const [name, hash] of Object.entries(commonHashes)) {
    assert.equal(records[arm].report.source_hashes[name], hash, `${arm}: mismatched shared source ${name}`);
  }
}

const pose = base.prepared_config.camera_pose;
const { width, height } = records.raw.image;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = v => { const n = Math.hypot(...v); return v.map(x => x / n); };
const eye = pose.three_eye;
const forward = normalize(pose.three_target.map((x, i) => x - eye[i]));
const right = normalize(cross(forward, [0, 1, 0]));
const up = cross(right, forward);
const tanX = Math.tan(pose.horizontal_fov_degrees * Math.PI / 360);
const tanY = tanX * height / width;
const raySlopeX = right.map(v => 2 * tanX * v / width);
const raySlopeY = up.map(v => -2 * tanY * v / height);
const rayConstant = forward.map((v, i) => v - right[i] * tanX + up[i] * tanY);
const denominatorSlope = Math.hypot(raySlopeX[1], raySlopeY[1]);
function rayGround(x, y) {
  const rx = rayConstant[0] + raySlopeX[0] * x + raySlopeY[0] * y;
  const ry = rayConstant[1] + raySlopeX[1] * x + raySlopeY[1] * y;
  const rz = rayConstant[2] + raySlopeX[2] * x + raySlopeY[2] * y;
  if (ry >= 0) return null;
  const t = -eye[1] / ry;
  const gx = eye[0] + t * rx;
  const gz = eye[2] + t * rz;
  if (Math.max(Math.abs(gx), Math.abs(gz)) >= PLANE_HALF_WIDTH) return null;
  return [gx / pose.period_world, gz / pose.period_world];
}
function pointInk(x, y) {
  const q = rayGround(x, y);
  if (q === null) return null;
  return (q[0] - Math.floor(q[0]) >= 0.5) === (q[1] - Math.floor(q[1]) >= 0.5) ? 1 : 0;
}
function horizonDistance(x, y) {
  return -(rayConstant[1] + raySlopeX[1] * x + raySlopeY[1] * y) / denominatorSlope;
}
const bytesAt = (image, x, y) => Array.from(image.data.subarray(4 * (x + image.width * y), 4 * (x + image.width * y) + 3));
const palette = [[DARK, DARK, DARK], [LIGHT, LIGHT, LIGHT], SKY].map(color => color.map(v => 255 * srgb(v)));
let paletteWorstBytes = 0;
let paletteWorstRoundedBytes = 0;
let paletteFailures = 0;
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const actual = bytesAt(records.raw.image, x, y);
  const error = Math.min(...palette.map(expected => Math.max(...expected.map((v, i) => Math.abs(actual[i] - v)))));
  const roundedError = Math.min(...palette.map(expected => Math.max(...expected.map((v, i) => Math.abs(actual[i] - Math.round(v))))));
  paletteWorstBytes = Math.max(paletteWorstBytes, error);
  paletteWorstRoundedBytes = Math.max(paletteWorstRoundedBytes, roundedError);
  if (roundedError > 1) paletteFailures++;
}

// Frozen before reading image errors. All cells remain in the quality report;
// only geometry proximity, never an arm's error, can exclude a fixture.
const X = [41, 137, 251, 388, 502, 599];
const Y = [92, 96, 104, 120, 148, 184, 232, 296, 344];
const offsets = [gaussianOffsets(65536, SIGMA, 1701), gaussianOffsets(65536, SIGMA, 2909)];
const pixels = [];
for (const y of Y) for (const x of X) {
  const cx = x + 0.5;
  const cy = y + 0.5;
  const distance = horizonDistance(cx, cy);
  // A same-sign rational function reaches its extrema over this rectangle
  // at corners. Checking its corners also excludes the finite plane boundary.
  const footprintInsideGround = [-3, 3].every(dx => [-3, 3].every(dy => rayGround(cx + dx, cy + dy) !== null));
  assert.ok(distance > 3 && footprintInsideGround, `Fixture ${x},${y} is within six sigma of a geometry edge.`);
  let skySamples = 0;
  const source = (px, py) => {
    const ink = pointInk(px, py);
    if (ink === null) { skySamples++; return SKY[0]; }
    return DARK + (LIGHT - DARK) * ink;
  };
  const estimates = offsets.map(samples => integratePixel(source, cx, cy, samples));
  assert.equal(skySamples, 0, 'This ground-only RGB reference requires all actual quadrature rays on the ground.');
  const mean = (estimates[0] + estimates[1]) / 2;
  const point = pointInk(cx, cy);
  // This guard excludes samples whose point parity could change under a tiny
  // native float camera perturbation. It does not exclude their AA comparison.
  const stablePoint = [-0.01, 0, 0.01].every(dx => [-0.01, 0, 0.01].every(dy => pointInk(cx + dx, cy + dy) === point));
  const expectedPointBytes = 255 * srgb(DARK + (LIGHT - DARK) * point);
  const measured = {};
  for (const arm of ARMS) {
    const bytes = bytesAt(records[arm].image, x, y);
    const rgb = bytes.map(v => linear(v / 255));
    const error = rgb.map(v => v - mean);
    // Calibration observes +/-1 integer code from rounded ideal sRGB. The
    // corresponding unrounded ideal can lie +/-1.5 codes from the readback.
    // Applying this palette-derived allowance to intermediate colors is a
    // diagnostic, not proof of a bounded continuous display transform.
    const displayAllowanceIntervalLinear = bytes.map(v => [
      linear(Math.max(0, v - 1.5) / 255),
      linear(Math.min(255, v + 1.5) / 255),
    ]);
    const signedErrorAfterDisplayAllowance = displayAllowanceIntervalLinear.map(([low, high]) => mean < low ? low - mean : mean > high ? high - mean : 0);
    const oneCodeStep = Math.max(...bytes.map(v => Math.max(
      linear(Math.min(255, v + 1) / 255) - linear(v / 255),
      linear(v / 255) - linear(Math.max(0, v - 1) / 255),
    )));
    measured[arm] = { bytes, linearRgb: rgb, signedLinearError: error, maxAbsLinearError: Math.max(...error.map(Math.abs)), oneCodeStepLinear: oneCodeStep, displayAllowanceIntervalLinear, signedErrorAfterDisplayAllowance };
  }
  const rawPointErrorBytes = Math.max(...measured.raw.bytes.map(v => Math.abs(v - expectedPointBytes)));
  pixels.push({ x, y, center: [cx, cy], horizonDistancePixels: distance, band: y <= 104 ? 'horizon' : y <= 184 ? 'middle' : 'foreground', reference: { linearRgb: [mean, mean, mean], estimates, sequenceDifferenceLinear: Math.abs(estimates[0] - estimates[1]), sampledSkyRays: skySamples }, rawPoint: { ink: point, stableWithinPixelOffset: stablePoint ? 0.01 : null, expectedDisplayByte: expectedPointBytes, errorBytes: rawPointErrorBytes, passes: !stablePoint || rawPointErrorBytes <= 1 }, measured });
}
function stats(list, arm) {
  const errors = list.flatMap(p => p.measured[arm].signedLinearError);
  const residuals = list.flatMap(p => p.measured[arm].signedErrorAfterDisplayAllowance);
  return { pixels: list.length, rmseLinearRgb: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length), meanAbsLinearRgb: errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length, maxAbsLinearRgb: Math.max(...errors.map(Math.abs)), maxOneCodeStepLinear: Math.max(...list.map(p => p.measured[arm].oneCodeStepLinear)), rmseAfterDisplayAllowanceLinearRgb: Math.sqrt(residuals.reduce((s, e) => s + e * e, 0) / residuals.length), maxAbsAfterDisplayAllowanceLinearRgb: Math.max(...residuals.map(Math.abs)), channelsOutsideDisplayAllowance: residuals.filter(v => v !== 0).length };
}
const summary = Object.fromEntries(ARMS.map(arm => [arm, stats(pixels, arm)]));
const byBand = Object.fromEntries(['horizon', 'middle', 'foreground'].map(band => [band, Object.fromEntries(ARMS.map(arm => [arm, stats(pixels.filter(p => p.band === band), arm)]))]));
const stablePoints = pixels.filter(p => p.rawPoint.stableWithinPixelOffset !== null);
const phaseFailures = stablePoints.filter(p => !p.rawPoint.passes);
const referenceDifference = Math.max(...pixels.map(p => p.reference.sequenceDifferenceLinear));
const warnings = [];
if (paletteFailures) warnings.push('Raw display transfer calibration failed.');
if (phaseFailures.length) warnings.push('Raw point parity disagrees with the independent camera source.');
// A deliberately loose integration alarm; this is not an accuracy certificate.
if (summary.analytic.rmseLinearRgb > 0.01 || summary.analytic.maxAbsLinearRgb > 0.03) warnings.push('Analytic native pixels need integration investigation: RMSE > 0.01 or maximum > 0.03.');
const report = {
  createdAt, status: warnings.length ? 'needs-investigation' : 'measured-no-integration-alarm',
  label: 'Native MRQ fixed-pose quality diagnostic', performanceMeasurement: false,
  inputResolution: { images: 'frames/<captured basename> relative to each input report directory', preparation: options.preparation ? relative(options.preparation) : PREPARATION_ARCHIVE, preparationBase: options.preparation ? 'explicit --preparation argument resolved from working directory' : 'each input report directory', capturedAbsolutePaths: 'provenance only; never opened', requiresUnrealInstallationOrGeneratedAssets: false },
  inputs: Object.fromEntries(ARMS.map(arm => [arm, { report: relative(records[arm].reportPath), reportSha256: sha(fs.readFileSync(records[arm].reportPath)), image: relative(records[arm].imagePath), imageSha256: records[arm].report.artifacts[0].sha256, preparationArchive: relative(records[arm].preparationPath), preparationSha256: records[arm].report.preparation_sha256, provenance: { originalImagePath: records[arm].report.artifacts[0].path, originalPreparationReport: records[arm].report.preparation_report }, map: records[arm].report.prepared_config.map, sequence: records[arm].report.prepared_config.sequence, preparedConfig: records[arm].report.prepared_config, observedCvars: records[arm].observedCvars }])),
  validation: { engine: base.engine_build, dimensions: [width, height], cameraPose: pose, commonSourceHashes: commonHashes, sourcesStableDuringEachCapture: true, commonSourcesMatch: true, commonPreparationSha256: base.preparation_sha256, sameCameraMetadata: true, rawTsrShareMapAndSequence: true, requestedSettingsMatchExceptAa: true, aaMethods: [0, 4, 0], rawPalette: { pixels: width * height, worstUnroundedDisplayByteError: paletteWorstBytes, worstRoundedDisplayByteError: paletteWorstRoundedBytes, pixelsOutsideOneByteOfRoundedPalette: paletteFailures }, rawPointParity: { checked: stablePoints.length, skippedBoundaryPoints: pixels.length - stablePoints.length, failures: phaseFailures.map(p => [p.x, p.y]), guardOffsetPixels: 0.01 } },
  reference: { method: 'Original camera ray intersection with finite ground; exact floor/frac checker parity; no shader/kernel/Taylor-model import', pixelCoordinates: 'PNG origin top left; source rays at x+0.5,y+0.5', source: { dark: DARK, light: LIGHT, sky: SKY, planeHalfWidthWorld: PLANE_HALF_WIDTH, periodWorld: pose.period_world }, filter: 'isotropic Gaussian', sigmaPixels: SIGMA, samplesPerPixel: 131072, sequences: 2, seeds: [1701, 2909], maximumSequenceDifferenceLinear: referenceDifference, sequenceDifferenceIsErrorBound: false, fixedX: X, fixedY: Y, selection: 'Cartesian product fixed before image error measurements; 54 retained pixels; >3px from horizon and 6-sigma rectangle inside finite ground', tailOutsideSixSigma: Math.exp(-18), transfer: 'standard sRGB inverse; raw palette validated within one byte; all captures share color settings' },
  displayAllowance: { calibratedRule: 'All raw pixels within one integer code of the rounded expected palette', inverseInterval: 'inverseSRGB(clamp((readbackByte +/- 1.5)/255, 0, 1))', interpretation: 'Residual after allowing the observed rounded-byte discrepancy plus half-code rounding. Calibrated at source palette only; extending the allowance to intermediate colors is a diagnostic, not a continuous display-transform bound or a pure shader integration error.', referenceSequenceDifferenceIncluded: false },
  summary, byBand, pixels, warnings,
  limitations: [
    'One fixed Glide0 pose, 640 by 360, unlit plane only; these measurements do not establish motion quality, disocclusion, scene-general accuracy, or real-time frame cost.',
    'MRQ uses the native deferred renderer and TSR but bIsOfflineRender=true. The 64 discarded fixed-pose samples warm history; convergence has not been demonstrated. This is a quality capture, not a live gameplay timing measurement.',
    'TSR reconstructs with its own history/filter/sharpening. Error against the selected sigma=0.5 Gaussian is a target-specific diagnostic, not an overall AA ranking.',
    'PNG is 8-bit with observed dithering. One local display-code step and two-sequence differences are reported separately; neither is a certified total error bound. No float-render-target accuracy claim.',
    'Matching camera metadata and independent raw phase checks support registration at tested pixels. Analytic and raw maps necessarily differ in material; metadata equality alone is not full scene identity proof.',
    'The fixed family excludes geometric horizon and plane edges; it does not measure filtering across geometry boundaries.',
  ],
  utilitySha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), referenceHelperSha256: sha(fs.readFileSync(path.join(ROOT, 'tests/compare/reference.mjs'))),
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const table = ARMS.map(arm => `| ${arm} | ${summary[arm].rmseLinearRgb.toExponential(4)} | ${summary[arm].maxAbsLinearRgb.toExponential(4)} | ${summary[arm].rmseAfterDisplayAllowanceLinearRgb.toExponential(4)} | ${summary[arm].maxAbsAfterDisplayAllowanceLinearRgb.toExponential(4)} |`).join('\n');
fs.writeFileSync(path.join(output, 'README.md'), `# Native fixed-pose quality diagnostic\n\nStatus: ${report.status}. Sources, camera metadata, size, and common settings match; native AA modes are 0 / 4 / 0. The raw point check matches at ${stablePoints.length - phaseFailures.length}/${stablePoints.length} stable fixtures; ${pixels.length - stablePoints.length} boundary fixtures are retained in quality statistics but omitted from that parity check.\n\nThe 54 fixed off-axis pixels use an independent original ray/plane checker reference, Gaussian sigma 0.5 pixels, two 65,536-sample sequences. Maximum sequence disagreement is ${referenceDifference.toExponential(4)} linear RGB; this is a convergence diagnostic, not a bound.\n\n| Arm | Linear RGB RMSE | Maximum error | RMSE after display allowance | Maximum after allowance |\n| --- | ---: | ---: | ---: | ---: |\n${table}\n\nThe display allowance uses the inverse-sRGB interval corresponding to each readback byte plus or minus 1.5 codes. The complete raw image is within one integer code of the **rounded** expected palette (maximum ${paletteWorstBytes.toFixed(6)} codes from the unrounded value). Half a code accounts for rounding. Extending this allowance from those palette anchors to intermediate colors is a diagnostic, not a certified continuous transfer bound or a measurement of pure shader error. The sample-sequence disagreement is reported separately and is not added as an error bound.\n\nTSR uses a different reconstruction filter. This table measures deviation from the chosen Gaussian and does not declare an overall winner. PNG readback has quantization and dithering.\n\n${report.limitations.map(v => '- ' + v).join('\n')}\n\nReproduce: \`node native/tools/compare_mrq.mjs\`. Explicit \`--raw\`, \`--tsr\`, \`--analytic\` report paths, an optional \`--preparation preparation.json\` archive path, and a fresh \`--out\` directory are also accepted. This performs CPU image analysis only and needs no Unreal installation or generated assets. PNGs resolve from each report directory’s \`frames/\` folder; the exact preparation JSON defaults to the sibling \`mrq-prepare-20260905T203352.265013Z/preparation.json\`. For a new capture batch, pass its exact archived preparation JSON with \`--preparation\`; its hash must match every input report. Captured absolute paths remain provenance only. Full per-pixel data, capture hashes, configuration, and actual queried cvars are in [report.json](report.json).\n`);
console.log(JSON.stringify({ output: relative(output), status: report.status, rawPointParity: report.validation.rawPointParity, summary, referenceDifference, warnings }, null, 2));
if (warnings.length) process.exitCode = 1;
