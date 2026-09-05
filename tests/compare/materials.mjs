import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { gaussianOffsets, integratePixel } from './reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-comparison-materials-${Date.now()}.json`);
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
      const point = source(x + 0.5, y + 0.5);
      // A 100000-unit mesh interpolated in float32 may move a discontinuity by
      // a tiny screen offset. Keep those pixels in the error comparison, but
      // only assert exact point parity where this 0.002px box is constant.
      const pointStable = [-0.002, 0.002].every(dx => [-0.002, 0.002].every(dy => source(x + 0.5 + dx, y + 0.5 + dy) === point));
      if (pointStable) assert.ok(Math.abs(raw - point) <= 1 / 255 + 1e-7, `Raw camera/source mismatch ${JSON.stringify({ config, x, y, raw, point, h })}`);
      probes.push({ x, y, raw, spectral, reference, pointStable, pointDifference: raw - point, sequenceDifference: Math.abs(a - b), rawError: raw - reference, spectralError: spectral - reference });
    }
    assert.ok(probes.length >= 20);
    const rms = key => Math.sqrt(probes.reduce((sum, p) => sum + p[key] ** 2, 0) / probes.length);
    const summary = { ...config, probes: probes.length, stablePointChecks: probes.filter(p => p.pointStable).length, rawRms: rms('rawError'), spectralRms: rms('spectralError'), referenceDifferenceRms: rms('sequenceDifference'), worstSpectral: Math.max(...probes.map(p => Math.abs(p.spectralError))) };
    results.push({ summary, probes });
    console.log(JSON.stringify(summary));
    assert.ok(summary.spectralRms < summary.rawRms, 'The live filtered material must improve these fixed probes over raw point shading.');
  }
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), browser: await browser.version(), results }, null, 2), { flag: 'wx' });
  console.log(`PASS actual WebGPU materials / independent exact-source reference; ${out}`);
} finally {
  await browser.close();
  await server.close();
}
