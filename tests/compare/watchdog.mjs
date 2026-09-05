import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { instrumentWgslWatchdog, findWgslLoops } from './watchdog-instrument.mjs';

// Examples:
// node tests/compare/watchdog.mjs --ref=1d6a1a0 --ref=50a85b1
// No uninstrumented shader is compiled or dispatched by this harness.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const refs = process.argv.filter(a => a.startsWith('--ref=')).map(a => a.slice(6));
if (!refs.length) refs.push('WORKTREE');
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-watchdog-${Date.now()}.json`);
const limit = 16384;
const hash = value => createHash('sha256').update(value).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const sourcePath = process.argv.find(a => a.startsWith('--kernel-path='))?.slice(14) || 'demo/ours-kernel.wgsl.js';
assert.match(sourcePath,/^[A-Za-z0-9_./-]+\.(?:js|mjs)$/,'A repository-relative JavaScript module path is required.');
assert.ok(!sourcePath.startsWith('/')&&!sourcePath.startsWith('-')&&!sourcePath.split('/').some(p=>!p||p==='.'||p==='..'),'Invalid module path.');
const harnessPaths = ['tests/compare/watchdog.mjs', 'tests/compare/watchdog-browser.mjs', 'tests/compare/watchdog-instrument.mjs'];
const harnessHashes = () => Object.fromEntries(harnessPaths.map(p => [p, hash(fs.readFileSync(path.join(root, p)))]));
const workingHash = () => hash(fs.readFileSync(path.join(root, sourcePath)));
const negativeControl = `
fn diagnosticInfiniteControl() -> vec2f {
  var spins: u32 = 0u;
  for (var outer: u32 = 0u; outer < 2u; outer++) {
    loop { spins += 1u; continue; }
  }
  return vec2f(f32(spins), 99.0);
}`;
const make = (name, material, hu, hv, rest = {}) => ({ name, material, hu, hv, hd: [0, 0, 1], x: 0, y: 0, period: 1, variance: 0.25, ...rest });
const cases = [
  make('negative-control-infinite-nested-continue', 'synthetic', [0, 0, 0], [0, 0, 0], { expectedExhaustion: true }),
  make('A-checker-phase-2pow23', 'checker', [0.1, 0, 8388608], [0, 0.1, 0.25]),
  make('B-circle-phase-2pow24', 'circles', [0.01, 0, 16777216], [0, 0.01, 0.5]),
  make('C-checker-near-collinear', 'checker', [1, 0, 0.17], [0.5, 1e-8, 0.23]),
  make('C-circle-near-collinear', 'circles', [1, 0, 0.17], [0.5, 1e-8, 0.23]),
  make('control-checker-interior', 'checker', [0.02, 0, 0.25], [0, 0.02, 0.25], { expectedExhaustion: false, expected: 1, tolerance: 2e-6 }),
  make('control-checker-corner', 'checker', [0.1, 0, 0], [0, 0.1, 0], { expectedExhaustion: false, expected: 0.5, tolerance: 2e-6 }),
  make('control-circle-interior', 'circles', [0.02, 0, 0.5], [0, 0.02, 0.5], { expectedExhaustion: false, expected: 1, tolerance: 2e-6 }),
];
const report = {
  createdAt: new Date().toISOString(), status: 'running', limit,
  meaning: 'Test-only bounded WGSL execution. Exhausted raw values are interrupted computations, not pixel estimates. Non-exhaustion establishes this watchdog was not reached, not numerical accuracy or production performance.',
  sourcePath,harnessHashesBefore: harnessHashes(), workingSourceHashBefore: workingHash(), cases, versions: [], failures: [],
};
fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2));
const snapshots = [];
for (const ref of refs) {
  assert.match(ref, /^[A-Za-z0-9][A-Za-z0-9_.\/-]*$/, 'A simple Git commit/ref is required.');
  const commit = ref === 'WORKTREE' ? null : git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
  const moduleSource = commit ? git(['show', `${commit}:${sourcePath}`]) : fs.readFileSync(path.join(root, sourcePath), 'utf8');
  // Evaluate the exact immutable module bytes read above, never the mutable path.
  const module = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  const selectedExport=typeof module.OURS_KERNEL_CORE==='string'?'OURS_KERNEL_CORE':'OURS_KERNEL';
  const OURS_KERNEL=module[selectedExport];
  assert.equal(typeof OURS_KERNEL, 'string');
  const uninstrumented = `const PI: f32 = 3.141592653589793;\nconst TAU: f32 = 6.283185307179586;\n${OURS_KERNEL}\n${negativeControl}`;
  const transformed = instrumentWgslWatchdog(uninstrumented, { limit });
  assert.equal(transformed.audit.loopCount, findWgslLoops(OURS_KERNEL).length + 2);
  const snapshotPath=`${out}.${snapshots.length}.kernel.txt`;
  fs.writeFileSync(snapshotPath,moduleSource,{flag:'wx'});
  const version = { ref, commit, sourcePath,selectedExport,snapshot:path.basename(snapshotPath),moduleHashBefore: hash(moduleSource), kernelHash: hash(OURS_KERNEL), instrumentedHash: hash(transformed.code),
    instrumentation: transformed.audit, results: [], watchdogChecks: [], controlQualityChecks: [], failures: [] };
  report.versions.push(version); snapshots.push({ version, ...transformed });
}
save();
let server, browser;
try {
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 5203, strictPort: false, hmr: false }, logLevel: 'silent' });
  await server.listen();
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--mute-audio'] });
  report.browser = await browser.version();
  const page = await browser.newPage(); page.setDefaultTimeout(180000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/compare/blank.html`);
  for (const snapshot of snapshots) {
    const { version, code, audit } = snapshot;
    const capture = await page.evaluate(async input => {
      const { captureWatchdogFixtures } = await import('/tests/compare/watchdog-browser.mjs');
      return captureWatchdogFixtures(input);
    }, { code, audit, cases });
    version.adapter = capture.adapter; version.format = capture.format; version.results = capture.results;
    for (const c of cases) {
      const result = capture.results.find(r => r.name === c.name);
      const historical = version.commit?.startsWith('1d6a1a0') ?? false;
      // C's CPU per-operation f32 model stalls, but this GPU's generated
      // arithmetic reaches the recipe cap instead. Preserve C as an observation
      // on that historical revision, not a universal hardware hang assertion.
      const historicalExpectation = c.name === 'C-checker-near-collinear' ? null : ['A-checker-phase-2pow23', 'B-circle-phase-2pow24'].includes(c.name);
      const expectedExhaustion = c.expectedExhaustion ?? (historical ? historicalExpectation : false);
      const validFuel = Number.isInteger(result.fuel) && result.fuel >= 0 && result.fuel <= limit && (!result.exhausted || result.fuel === limit);
      const passed = validFuel && (expectedExhaustion === null || result.exhausted === expectedExhaustion);
      version.watchdogChecks.push({ name: c.name, expectedExhaustion, actualExhaustion: result.exhausted, fuel: result.fuel, passed });
      if (!passed) version.failures.push({ name: c.name, kind: 'watchdog', expectedExhaustion, result });
      if (c.expected !== undefined) {
        const error = Math.abs(result.rawMean - c.expected);
        const qualityPassed = !result.exhausted && Number.isFinite(result.rawMean) && error <= c.tolerance;
        version.controlQualityChecks.push({ name: c.name, expected: c.expected, error, tolerance: c.tolerance, passed: qualityPassed });
        if (!qualityPassed) version.failures.push({ name: c.name, kind: 'ordinary-control-value', expected: c.expected, result });
      }
    }
    version.moduleHashAfter = version.commit ? hash(git(['show', `${version.commit}:${sourcePath}`])) : workingHash();
    if (version.moduleHashAfter !== version.moduleHashBefore) version.failures.push({ kind: 'frozen-source-changed' });
    version.status = version.failures.length ? 'failed' : 'passed';
    save();
  }
  report.harnessHashesAfter = harnessHashes(); report.workingSourceHashAfter = workingHash();
  report.workingSourceChanged = report.workingSourceHashBefore !== report.workingSourceHashAfter;
  if (JSON.stringify(report.harnessHashesAfter) !== JSON.stringify(report.harnessHashesBefore)) report.failures.push('Harness files changed during the run.');
  report.failures.push(...report.versions.flatMap(v => v.failures.map(f => ({ ref: v.ref, ...f }))));
  report.status = report.failures.length ? 'failed' : 'passed'; save();
  console.log(JSON.stringify({ status: report.status, report: out, versions: report.versions.map(v => ({ ref: v.ref, commit: v.commit, loops: v.instrumentation.loopCount, results: v.results, failures: v.failures })) }, null, 2));
  if (report.failures.length) process.exitCode = 1;
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; save(); console.error(`Watchdog diagnostic failed: ${error.message}\nReport: ${out}`); process.exitCode = 1;
} finally { await browser?.close(); await server?.close(); }
