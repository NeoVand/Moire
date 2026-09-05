import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-comparison-performance-${Date.now()}.json`);
const sourceNames = ['src/compare/scene.ts', 'src/compare/spectral.ts', 'src/compare/temporal.ts', 'tests/compare/performance-entry.mjs'];
const hashes = () => Object.fromEntries(sourceNames.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
const sourceHashes = hashes();
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5200, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/compare/blank.html`);
  const adapter = await page.evaluate(async () => {
    const gpu = await navigator.gpu.requestAdapter();
    const info = gpu?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
  });
  const results = [];
  for (const [width, height] of [[640, 360], [1920, 1080]]) for (const time of [0, 8]) for (const method of ['raw', 'temporal', 'spectral']) {
    const result = await page.evaluate(async options => {
      const { measureMethod } = await import('/tests/compare/performance-entry.mjs');
      return measureMethod(options);
    }, { method, width, height, time, warmFrames: 5, frames: 15 });
    assert.equal(result.samples.length, 15);
    assert.ok(result.samples.every(s => s.completedWallMs > 0 && Number.isFinite(s.completedWallMs)));
    assert.ok(result.gpuMedianMs === null || result.gpuMedianMs > 0);
    for (const sample of result.samples) if (sample.intervals) {
      // Re-resolving a pair on this driver differed by up to 48 ns; permit
      // 1 microsecond rather than requiring bit-identical timestamp readbacks.
      assert.ok(Math.abs(sample.intervals.sumMs - sample.gpuRenderMs) < 0.001, 'Public GPU pass sum disagrees with its timestamp intervals.');
      assert.ok(sample.gpuSpanMs <= sample.completedWallMs + 0.25, 'GPU render span cannot exceed its enclosing completed wall interval.');
    }
    results.push(result);
    const { samples, ...summary } = result;
    console.log(JSON.stringify(summary));
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(hashes(), sourceHashes, 'The source changed during the performance run; repeat on a stable version.');
  fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes, host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model }, browser: await browser.version(), adapter,
    measurement: { isolated: 'One renderer/method active in this test at a time. Other applications may still contend; close the visible comparison before running because pause still renders TAA history.', gpuSum: 'Public Three sum of GPU render-pass durations. Pass intervals can overlap: this sum is not elapsed GPU time.', gpuSpan: 'Earliest render-pass begin through latest render-pass end, measured from the pinned r185 query pool without changing library code; includes gaps within that span, excludes work outside it.', wall: 'CPU scene update/render start through queue.onSubmittedWorkDone; includes submission and completed queue work, excludes display presentation and timestamp readback.', scene: 'Grazing checkerboard, detail1, fixed glide poses t0 and t8. These are microbenchmark frame costs, not a whole-game budget or temporal-quality score.' }, results }, null, 2), { flag: 'wx' });
  console.log(`PASS isolated actual-GPU method timings; ${out}`);
} finally {
  await browser.close(); await server.close();
}
