import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { gaussianOffsets, integratePixel } from './reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-comparison-materials-${Date.now()}.json`);
const sourceNames = ['src/compare/scene.ts', 'src/compare/spectral.ts', 'src/compare/authorKernel.ts', 'demo/ours-kernel.wgsl.js', 'tests/compare/browser-entry.mjs', 'tests/compare/reference.mjs', 'tests/compare/materials.mjs'];
const hashes = () => Object.fromEntries(sourceNames.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
const sourceHashes = hashes();
const report = { createdAt: new Date().toISOString(), status: 'running', browser: null, adapter: null,
  host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model }, sourceHashes,
  authorKernel: { adapter: 'src/compare/authorKernel.ts', source: 'demo/ours-kernel.wgsl.js', sha256: sourceHashes['demo/ours-kernel.wgsl.js'] },
  measurement: { readback: 'All legacy RGBA8Unorm linear columns are unchanged, with 1/255 code steps. All three filtered arms also have separate RGBA32Float output, or an explicitly reported RGBA16Float fallback. Float format, finite/range/alpha validation, and observed 8-bit-minus-float differences accompany each configuration. These differences are observations, not a certified error decomposition.',
    reference: 'Two independently shifted 65536-sample Gaussian sequences of the exact rational source, sigma0.5. Sequence disagreement is not an error bound. Float output removes the 8-bit readback floor but does not improve reference convergence or shader arithmetic.',
    arms: { raw: 'Point source', spectral: 'Existing projective coverage / fixed spectral kernel', lattice: 'Shared author lattice kernel through the common scene adapter', homography: 'Shared author guarded homography kernel through the common scene adapter' },
    gates: 'Existing RGBA8 raw-source parity and projective-improves-raw assertions retained. All floating outputs must be finite and within range, with opaque alpha. Lattice and homography share the same source homography; resolved-interior polarity is checked within 0.01. Other source errors are reported without a superiority assertion.' },
  results: [],
};
// Keep the completed and failing-case evidence even when a validation rejects
// the run. Reserve the requested filename and atomically update our own report.
fs.writeFileSync(out, '', { flag: 'wx' });
const persist = () => {
  const temporary = `${out}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2), { flag: 'wx' });
  fs.renameSync(temporary, out);
};
persist();
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
let currentConfig = null;
const errors = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  // An existing static file gives the page our Vite origin without starting
  // either app renderer; only the isolated materials below use the GPU.
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/compare/blank.html`);
  report.browser = await browser.version();
  report.adapter = await page.evaluate(async () => {
    const gpu = await navigator.gpu.requestAdapter();
    const info = gpu?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
  });
  const configurations = [
    { width: 192, height: 128, time: 0, motion: 'glide', detail: 1 },
    { width: 192, height: 128, time: 8, motion: 'glide', detail: 1 },
    { width: 192, height: 128, time: 4, motion: 'approach', detail: 2 },
  ];
  const offsetsA = gaussianOffsets(65536, 0.5, 1701);
  const offsetsB = gaussianOffsets(65536, 0.5, 2909);
  const results = report.results;
  for (const config of configurations) {
    currentConfig = config;
    const capture = await page.evaluate(async options => {
      const { captureMaterials } = await import('/tests/compare/browser-entry.mjs');
      return captureMaterials(options);
    }, config);
    const probes = [];
    const caseResult = { configuration: config, floatReadback: capture.floatReadback,
      spectralValidation: capture.frames.spectral.validation, latticeValidation: capture.frames.lattice.validation,
      homographyValidation: capture.frames.homography.validation, probes };
    results.push(caseResult);
    persist();
    assert.equal(capture.backend, 'webgpu');
    const h = capture.frames.raw.h;
    assert.deepEqual(capture.frames.spectral.h, h);
    assert.deepEqual(capture.frames.lattice.h, h, 'The shared kernel must receive exactly the same source homography.');
    assert.deepEqual(capture.frames.homography.h, h, 'The homography kernel must receive exactly the same source homography.');
    assert.ok(['RGBA32Float', 'RGBA16Float'].includes(capture.floatReadback.actual));
    if (capture.floatReadback.actual === 'RGBA16Float') assert.ok(capture.floatReadback.limitation, 'Float16 fallback must report its precision limitation.');
    for (const arm of ['spectral', 'lattice', 'homography']) {
      const validation = capture.frames[arm].validation;
      assert.equal(validation.format, capture.floatReadback.actual);
      assert.equal(capture.frames[arm].floatPixels.length, config.width * config.height * 4);
      assert.equal(validation.channels, config.width * config.height * 4);
      assert.equal(validation.nonFiniteChannels, 0, `${arm} produced NaN or infinity in float readback.`);
      assert.equal(validation.outOfRangeChannels, 0, `${arm} produced out-of-range colors: ${JSON.stringify(validation)}`);
      assert.ok(validation.maxAlphaError < 0.001);
    }
    const source = (x, y) => {
      const d = h.d[0] * x + h.d[1] * y + h.d[2];
      if (d >= 0) return 0.105;
      const u = (h.u[0] * x + h.u[1] * y + h.u[2]) / d;
      const v = (h.v[0] * x + h.v[1] * y + h.v[2]) / d;
      const white = (u - Math.floor(u) >= 0.5) === (v - Math.floor(v) >= 0.5);
      return 0.025 + 0.795 * Number(white);
    };
    // Fixed positions exercise grazing, middle, near, and off-axis regions.
    // Pixels within 6 sigma of the geometric horizon are intentionally outside
    // this material-only test; the finite plane edge needs its own coverage.
    for (const y of [34, 36, 40, 48, 64, 88, 112, 124]) for (const x of [18, 53, 97, 143, 179]) {
      const distance = -(h.d[0] * (x + 0.5) + h.d[1] * (y + 0.5) + h.d[2]) / Math.hypot(h.d[0], h.d[1]);
      if (distance < 3) continue;
      const a = integratePixel(source, x + 0.5, y + 0.5, offsetsA);
      const b = integratePixel(source, x + 0.5, y + 0.5, offsetsB);
      const reference = (a + b) / 2;
      const raw = capture.frames.raw.pixels[(y * config.width + x) * 4] / 255;
      const spectral = capture.frames.spectral.pixels[(y * config.width + x) * 4] / 255;
      const lattice = capture.frames.lattice.pixels[(y * config.width + x) * 4] / 255;
      const homography = capture.frames.homography.pixels[(y * config.width + x) * 4] / 255;
      const spectralFloat = capture.frames.spectral.floatPixels[(y * config.width + x) * 4];
      const latticeFloat = capture.frames.lattice.floatPixels[(y * config.width + x) * 4];
      const homographyFloat = capture.frames.homography.floatPixels[(y * config.width + x) * 4];
      assert.ok([raw, spectral, lattice, homography].every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      assert.ok([spectralFloat, latticeFloat, homographyFloat].every(Number.isFinite));
      const point = source(x + 0.5, y + 0.5);
      // A 100000-unit mesh interpolated in float32 may move a discontinuity by
      // a tiny screen offset. Keep those pixels in the error comparison, but
      // only assert exact point parity where this 0.002px box is constant.
      const pointStable = [-0.002, 0.002].every(dx => [-0.002, 0.002].every(dy => source(x + 0.5 + dx, y + 0.5 + dy) === point));
      if (pointStable) assert.ok(Math.abs(raw - point) <= 1 / 255 + 1e-7, `Raw camera/source mismatch ${JSON.stringify({ config, x, y, raw, point, h })}`);
      const latticePolarityCheck = pointStable && Math.abs(a - point) < 1e-5 && Math.abs(b - point) < 1e-5;
      // This only checks clearly resolved interior polarity / period. It does
      // not require the shared kernel to improve the filtered error elsewhere.
      if (latticePolarityCheck) assert.ok(Math.abs(lattice - point) < 0.01,
        `Shared kernel resolved-interior polarity mismatch ${JSON.stringify({ config, x, y, lattice, point, a, b })}`);
      const homographyPolarityCheck = latticePolarityCheck;
      if (homographyPolarityCheck) assert.ok(Math.abs(homography - point) < 0.01,
        `Homography kernel resolved-interior polarity mismatch ${JSON.stringify({ config, x, y, homography, point, a, b })}`);
      probes.push({ x, y, raw, spectral, lattice, reference, point, pointStable, latticePolarityCheck, pointDifference: raw - point, sequenceDifference: Math.abs(a - b), rawError: raw - reference, spectralError: spectral - reference, latticeError: lattice - reference, latticeMinusSpectral: lattice - spectral,
        spectralFloat, latticeFloat, spectralFloatError: spectralFloat - reference, latticeFloatError: latticeFloat - reference,
        spectralQuantizationDelta: spectral - spectralFloat, latticeQuantizationDelta: lattice - latticeFloat,
        latticeFloatMinusSpectral: latticeFloat - spectralFloat,
        homography, homographyFloat, homographyPolarityCheck, homographyError: homography - reference, homographyFloatError: homographyFloat - reference,
        homographyQuantizationDelta: homography - homographyFloat, homographyMinusSpectral: homography - spectral, homographyMinusLattice: homography - lattice,
        homographyFloatMinusSpectral: homographyFloat - spectralFloat, homographyFloatMinusLattice: homographyFloat - latticeFloat });
    }
    assert.ok(probes.length >= 20);
    const rms = key => Math.sqrt(probes.reduce((sum, p) => sum + p[key] ** 2, 0) / probes.length);
    const summary = { ...config, probes: probes.length, stablePointChecks: probes.filter(p => p.pointStable).length, latticePolarityChecks: probes.filter(p => p.latticePolarityCheck).length,
      latticeDarkPolarityChecks: probes.filter(p => p.latticePolarityCheck && p.point < 0.5).length, latticeLightPolarityChecks: probes.filter(p => p.latticePolarityCheck && p.point >= 0.5).length,
      rawRms: rms('rawError'), spectralRms: rms('spectralError'), latticeRms: rms('latticeError'), referenceDifferenceRms: rms('sequenceDifference'), worstSpectral: Math.max(...probes.map(p => Math.abs(p.spectralError))), worstLattice: Math.max(...probes.map(p => Math.abs(p.latticeError))), latticeVsSpectralRms: rms('latticeMinusSpectral'),
      floatFormat: capture.floatReadback.actual, spectralFloatRms: rms('spectralFloatError'), latticeFloatRms: rms('latticeFloatError'),
      worstSpectralFloat: Math.max(...probes.map(p => Math.abs(p.spectralFloatError))), worstLatticeFloat: Math.max(...probes.map(p => Math.abs(p.latticeFloatError))),
      spectralQuantizationRms: rms('spectralQuantizationDelta'), latticeQuantizationRms: rms('latticeQuantizationDelta'), latticeFloatVsSpectralRms: rms('latticeFloatMinusSpectral'),
      homographyPolarityChecks: probes.filter(p => p.homographyPolarityCheck).length,
      homographyDarkPolarityChecks: probes.filter(p => p.homographyPolarityCheck && p.point < 0.5).length, homographyLightPolarityChecks: probes.filter(p => p.homographyPolarityCheck && p.point >= 0.5).length,
      homographyRms: rms('homographyError'), homographyFloatRms: rms('homographyFloatError'),
      worstHomography: Math.max(...probes.map(p => Math.abs(p.homographyError))), worstHomographyFloat: Math.max(...probes.map(p => Math.abs(p.homographyFloatError))),
      homographyQuantizationRms: rms('homographyQuantizationDelta'), homographyVsSpectralRms: rms('homographyMinusSpectral'), homographyVsLatticeRms: rms('homographyMinusLattice'),
      homographyFloatVsSpectralRms: rms('homographyFloatMinusSpectral'), homographyFloatVsLatticeRms: rms('homographyFloatMinusLattice') };
    caseResult.summary = summary;
    persist();
    console.log(JSON.stringify(summary));
    assert.ok(summary.spectralRms < summary.rawRms, 'The live filtered material must improve these fixed probes over raw point shading.');
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  const polarityCoverage = {
    darkChecks: results.reduce((sum, result) => sum + result.summary.latticeDarkPolarityChecks, 0),
    lightChecks: results.reduce((sum, result) => sum + result.summary.latticeLightPolarityChecks, 0),
  };
  polarityCoverage.missing = ['dark', 'light'].filter(value => polarityCoverage[`${value}Checks`] === 0);
  report.polarityCoverage = polarityCoverage;
  const homographyPolarityCoverage = {
    darkChecks: results.reduce((sum, result) => sum + result.summary.homographyDarkPolarityChecks, 0),
    lightChecks: results.reduce((sum, result) => sum + result.summary.homographyLightPolarityChecks, 0),
  };
  homographyPolarityCoverage.missing = ['dark', 'light'].filter(value => homographyPolarityCoverage[`${value}Checks`] === 0);
  report.homographyPolarityCoverage = homographyPolarityCoverage;
  report.sourceHashesAfter = hashes();
  assert.deepEqual(report.sourceHashesAfter, sourceHashes, 'Source changed during the material comparison; repeat on a stable version.');
  report.status = 'passed';
  persist();
  console.log(`PASS actual WebGPU materials / independent exact-source reference; ${out}`);
} catch (error) {
  report.status = 'failed';
  report.failure = { currentConfig, message: error.message, stack: error.stack, browserErrors: errors };
  try { report.sourceHashesAfter = hashes(); } catch (hashError) { report.sourceHashReadError = hashError.message; }
  persist();
  console.error(`FAIL actual WebGPU materials; evidence saved to ${out}\n${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
