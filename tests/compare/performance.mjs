import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { createCandidateSource, assertCandidateUnchanged } from './candidate-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-comparison-performance-${Date.now()}.json`);
const candidate = createCandidateSource({ root, evidencePath: out });
const methods=(process.argv.find(arg=>arg.startsWith('--methods='))?.slice(10)??'raw,temporal,spectral,lattice,homography').split(',');
assert.ok(methods.length>0&&new Set(methods).size===methods.length&&methods.every(m=>['raw','temporal','spectral','lattice','homography'].includes(m)),'--methods must list distinct supported comparison arms.');
const sourceNames = ['tests/compare/candidate-source.mjs', 'vite.config.ts', 'src/compare/scene.ts', 'src/compare/spectral.ts', 'src/compare/authorKernel.ts', 'demo/ours-kernel.wgsl.js', 'src/compare/temporal.ts', 'tests/compare/performance-entry.mjs', 'tests/compare/performance.mjs', 'node_modules/three/src/renderers/webgpu/utils/WebGPUTimestampQueryPool.js'];
const hashes = () => Object.fromEntries(sourceNames.map(name => [name, createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex')]));
const sourceHashes = hashes();
const report = {
  createdAt: new Date().toISOString(), status: 'running', commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceHashes,
  kernelSource: candidate.metadata,requestedMethods:methods,
  authorKernel: { adapter: 'src/compare/authorKernel.ts', source: candidate.metadata.modulePath, importedAs: 'demo/ours-kernel.wgsl.js', sha256: candidate.metadata.sha256, sourceMode: candidate.metadata.mode },
  host: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model }, browser: null, adapter: null,
  measurement: { isolated: 'One renderer/method active at a time. Other applications may contend; close the visible comparison because pause still renders TAA history.',
    gpuSum: 'Public Three sum from ONE timestamp query resolve per frame. Diagnostic raw timestamps are copied from that same resolved buffer. Pass intervals can overlap, so this sum is not elapsed GPU time.',
    gpuSpan: 'Earliest render-pass begin through latest render-pass end from the same resolved bytes, using the pinned r185 buffer layout without changing library code. Includes gaps within the span, excludes work outside it.',
    wall: 'CPU scene update/render start through queue.onSubmittedWorkDone; includes submission and completed queue work, excludes presentation and timestamp readback.',
    scene: 'Grazing checkerboard, detail1, fixed glide poses t0 and t8. Microbenchmark frame costs, not a whole-game budget or temporal-quality score.' }, results: [],
};
// Reserve the requested name, then atomically replace only our own report.
// Every completed case (including a failed validation) is saved before aborting.
fs.writeFileSync(out, '', { flag: 'wx' });
const persist = () => {
  const temporary = `${out}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(report, null, 2), { flag: 'wx' });
  fs.renameSync(temporary, out);
};
persist();
const server = await createServer({ root, plugins: candidate.plugins, configFile: path.join(root, 'vite.config.ts'), server: { port: 5200, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
let currentCase = null;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/compare/blank.html`);
  report.browser = await browser.version();
  report.adapter = await page.evaluate(async () => {
    const gpu = await navigator.gpu.requestAdapter();
    const info = gpu?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null;
  });
  for (const [width, height] of [[640, 360], [1920, 1080]]) for (const time of [0, 8]) for (const method of methods) {
    currentCase = { method, width, height, time, warmFrames: 5, frames: 15 };
    const result = await page.evaluate(async options => {
      const { measureMethod } = await import('/tests/compare/performance-entry.mjs');
      return measureMethod(options);
    }, { method, width, height, time, warmFrames: 5, frames: 15 });
    const failures = [];
    if (result.failure) failures.push({ check: 'measurement-completed', ...result.failure });
    if (result.samples.length !== 15) failures.push({ check: 'sample-count', expected: 15, actual: result.samples.length });
    if (result.gpuMedianMs !== null && !(result.gpuMedianMs > 0)) failures.push({ check: 'positive-gpu-median', actual: result.gpuMedianMs });
    for (const sample of result.samples) {
      const interval = sample.intervals;
      const publicDifferenceMs = interval ? sample.gpuRenderMs - interval.sumMs : null;
      const checks = {
        completedWallFinite: Number.isFinite(sample.completedWallMs) && sample.completedWallMs > 0,
        timestampsPresent: !result.timestampsSupported || interval !== null,
        sameResolvedSum: !interval || (Number.isFinite(publicDifferenceMs) && Math.abs(publicDifferenceMs) <= 1e-9),
        oneFrame: !interval || (interval.frameIds.length === 1 && interval.frameIds[0] === sample.rendererFrame),
        allPassesCaptured: !interval || (interval.queryCount === 2 * interval.pairCount && interval.pairCount === sample.renderPasses),
        nonnegativeIntervals: !interval || interval.passes.every(pass => pass.durationMs >= 0 && Number.isFinite(pass.durationMs)),
        spanWithinWall: !interval || (Number.isFinite(sample.gpuSpanMs) && sample.gpuSpanMs >= 0 && sample.gpuSpanMs <= sample.completedWallMs + 0.25),
      };
      sample.validity = { valid: Object.values(checks).every(Boolean), checks, publicDifferenceMs,
        publicSumMs: sample.gpuRenderMs, resolvedSumMs: interval?.sumMs ?? null,
        gpuSpanMs: sample.gpuSpanMs, completedWallMs: sample.completedWallMs };
      if (!sample.validity.valid) failures.push({ frame: sample.frame, ...sample.validity });
    }
    result.validity = { valid: failures.length === 0, failures };
    report.results.push(result);
    persist();
    assert.ok(result.validity.valid, `Timing validation failed: ${JSON.stringify({ ...currentCase, failures })}`);
    const { samples, ...summary } = result;
    console.log(JSON.stringify(summary));
  }
  assert.deepEqual(errors, []);
  report.kernelSourceVerification = assertCandidateUnchanged(candidate);
  report.sourceHashesAfter = hashes();
  assert.deepEqual(report.sourceHashesAfter, sourceHashes, 'The source changed during the performance run; repeat on a stable version.');
  report.status = 'passed';
  persist();
  console.log(`PASS isolated actual-GPU method timings; ${out}`);
} catch (error) {
  report.status = 'failed';
  report.failure = { currentCase, message: error.message, stack: error.stack };
  try { report.kernelSourceVerification = candidate.verify(); report.sourceHashesAfter = hashes(); } catch (hashError) { report.sourceHashReadError = hashError.message; }
  persist();
  console.error(`FAIL isolated actual-GPU method timings; evidence saved to ${out}\n${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close(); await server.close();
}
