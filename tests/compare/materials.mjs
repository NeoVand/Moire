import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  // An existing static file gives the page our Vite origin without starting
  // either app renderer; only the isolated materials below use the GPU.
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/compare/blank.html`);
  const adapter = await page.evaluate(async () => {
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
  const results = [];
  for (const config of configurations) {
    const capture = await page.evaluate(async options => {
      const { captureMaterials } = await import('/tests/compare/browser-entry.mjs');
      return captureMaterials(options);
    }, config);
    assert.equal(capture.backend, 'webgpu');
    const h = capture.frames.raw.h;
    assert.deepEqual(capture.frames.spectral.h, h);
    assert.deepEqual(capture.frames.lattice.h, h, 'The shared kernel must receive exactly the same source homography.');
    const validation = capture.frames.lattice.validation;
    assert.equal(validation.channels, config.width * config.height * 4);
    assert.equal(validation.nonFiniteChannels, 0, 'The shared kernel produced NaN or infinity in float readback.');
    assert.equal(validation.outOfRangeChannels, 0, `The shared kernel produced out-of-range colors: ${JSON.stringify(validation)}`);
    assert.ok(validation.maxAlphaError < 0.001);
    const source = (x, y) => {
      const d = h.d[0] * x + h.d[1] * y + h.d[2];
      if (d >= 0) return 0.105;
      const u = (h.u[0] * x + h.u[1] * y + h.u[2]) / d;
      const v = (h.v[0] * x + h.v[1] * y + h.v[2]) / d;
      const white = (u - Math.floor(u) >= 0.5) === (v - Math.floor(v) >= 0.5);
      return 0.025 + 0.795 * Number(white);
    };
    const probes = [];
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
      assert.ok([raw, spectral, lattice].every(value => Number.isFinite(value) && value >= 0 && value <= 1));
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
      probes.push({ x, y, raw, spectral, lattice, reference, point, pointStable, latticePolarityCheck, pointDifference: raw - point, sequenceDifference: Math.abs(a - b), rawError: raw - reference, spectralError: spectral - reference, latticeError: lattice - reference, latticeMinusSpectral: lattice - spectral });
    }
    assert.ok(probes.length >= 20);
    const rms = key => Math.sqrt(probes.reduce((sum, p) => sum + p[key] ** 2, 0) / probes.length);
    const summary = { ...config, probes: probes.length, stablePointChecks: probes.filter(p => p.pointStable).length, latticePolarityChecks: probes.filter(p => p.latticePolarityCheck).length,
      latticeDarkPolarityChecks: probes.filter(p => p.latticePolarityCheck && p.point < 0.5).length, latticeLightPolarityChecks: probes.filter(p => p.latticePolarityCheck && p.point >= 0.5).length,
      rawRms: rms('rawError'), spectralRms: rms('spectralError'), latticeRms: rms('latticeError'), referenceDifferenceRms: rms('sequenceDifference'), worstSpectral: Math.max(...probes.map(p => Math.abs(p.spectralError))), worstLattice: Math.max(...probes.map(p => Math.abs(p.latticeError))), latticeVsSpectralRms: rms('latticeMinusSpectral') };
    results.push({ summary, latticeValidation: validation, probes });
    console.log(JSON.stringify(summary));
    assert.ok(summary.spectralRms < summary.rawRms, 'The live filtered material must improve these fixed probes over raw point shading.');
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  const polarityCoverage = {
    darkChecks: results.reduce((sum, result) => sum + result.summary.latticeDarkPolarityChecks, 0),
    lightChecks: results.reduce((sum, result) => sum + result.summary.latticeLightPolarityChecks, 0),
  };
  polarityCoverage.missing = ['dark', 'light'].filter(value => polarityCoverage[`${value}Checks`] === 0);
  assert.deepEqual(hashes(), sourceHashes, 'Source changed during the material comparison; repeat on a stable version.');
  fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), browser: await browser.version(), adapter,
    host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model }, sourceHashes, polarityCoverage,
    authorKernel: { adapter: 'src/compare/authorKernel.ts', source: 'demo/ours-kernel.wgsl.js', sha256: sourceHashes['demo/ours-kernel.wgsl.js'] },
    measurement: { readback: 'RGBA8Unorm linear for unchanged raw/projective/lattice error columns; one code step is 1/255. Errors below this scale are unresolved. The normalized target clips out-of-range colors, so lattice has a separate full-frame RGBA16Float finite/range validation.', reference: 'Two independently shifted 65536-sample Gaussian sequences of the exact rational source, sigma0.5. Sequence disagreement is not an error bound.', arms: { raw: 'Point source', spectral: 'Existing projective coverage / fixed spectral kernel', lattice: 'Shared author lattice kernel through the common scene adapter' }, gates: 'Existing raw-source parity and projective-improves-raw assertions retained. Lattice requires the same homography and finite, valid output. Resolved interior pixels where both independent references agree with the point within 1e-5 require lattice polarity within 0.01. All other lattice source errors are reported without a superiority assertion.' }, results }, null, 2), { flag: 'wx' });
  console.log(`PASS actual WebGPU materials / independent exact-source reference; ${out}`);
} finally {
  await browser.close();
  await server.close();
}
