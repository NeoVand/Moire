import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv.find(a => a.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-homography-${Date.now()}.json`);
const sourceNames = ['demo/ours-kernel.wgsl.js', 'tests/compare/homography-browser.mjs', 'tests/compare/homography.mjs'];
const hashes = () => Object.fromEntries(sourceNames.map(p => [p, createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')]));
const sourceHashes = hashes();
// A&S CDF approximation (absolute error below 7.5e-8), used only for the
// independent separable disc reference below; tolerance includes this error.
function phi(x) {
  const a = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * a);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return 0.5 * (1 + Math.sign(x) * erf);
}
function fixture(name, u, v, gu = [0.02, 0], gv = [0, 0.02], r = [0, 0]) {
  const x = 0.5, y = 0.5;
  const row = (q, g) => { const a = g[0] + q * r[0], b = g[1] + q * r[1]; return [a, b, q - a * x - b * y]; };
  return { name, material: 'checker', hu: row(u, gu), hv: row(v, gv), hd: [r[0], r[1], 1 - r[0] * x - r[1] * y], x, y, period: 1, variance: 0.25 };
}
const cases = [];
for (const u of [0.25, 0.75]) for (const v of [0.25, 0.75]) for (const shift of [0, 64, -64]) {
  cases.push({ ...fixture(`quadrants-${u}-${v}-shift${shift}`, u + shift, v - shift), expected: Number(u === v), tolerance: 2e-6 });
}
for (const shift of [0, 64, -64]) {
  cases.push({ ...fixture(`single-edge-shift${shift}`, -0.025 + shift, 0.25, [0.1, 0], [0, 0.001]), expected: 0.3085375387259869, tolerance: 1e-4 });
}
for (const rho of [0, 0.9, -0.9, 0.99995, -0.99995]) {
  cases.push({ ...fixture(`corner-rho${rho}`, 0, 0, [0.1, 0], [0.1 * rho, 0.1 * Math.sqrt(1 - rho * rho)]), expected: 0.5 + Math.asin(rho) / Math.PI, tolerance: 3e-5 });
}
// Test invariance at two genuine perspective footprints without claiming a
// closed-form target for their complete periodic source.
cases.push(fixture('perspective-edge', -0.025, 0.25, [0.1, 0.02], [0.005, 0.08], [0.01, -0.015]));
cases.push(fixture('perspective-corner', 0.01, -0.02, [0.1, 0.07], [0.12, 0.025], [-0.013, 0.008]));

// Exact-source conditional integral for the omitted-disc witness. V is very
// narrow but not degenerate. Conditional on V, every disc gives a normal CDF
// interval in U. Simpson convergence is checked separately below.
function circleReference(steps) {
  const R = 5 / 12, su = 0.36, sv = 0.0005;
  const extent = 8, step = 2 * extent / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const z = -extent + i * step, dy = sv * z;
    let horizontal = 0;
    if (Math.abs(dy) < R) {
      const radius = Math.sqrt(R * R - dy * dy);
      for (let n = -5; n <= 5; n++) horizontal += phi((n + radius) / su) - phi((n - radius) / su);
    }
    sum += (i === 0 || i === steps ? 1 : i % 2 ? 4 : 2) * horizontal * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  }
  return sum * step / 3;
}
const discA = circleReference(2048), discB = circleReference(4096);
assert.ok(Math.abs(discA - discB) < 1e-9, 'The independent circle reference did not converge.');
cases.push({ ...fixture('circle-retained-footprint', 0.5, 0.5, [0.72, 0], [0, 0.001]), material: 'circles', expected: discB, tolerance: 3e-6, expectedRegime: 1 });
cases.push({ ...fixture('circle-center', 0.5, 0.5, [0.02, 0.001], [0.005, 0.02]), material: 'circles', expected: 1, tolerance: 2e-6 });
cases.push({ ...fixture('circle-perspective', 0.8, 0.7, [0.08, 0.01], [0.005, 0.09], [0.02, -0.01]), material: 'circles' });
const originals = [...cases];
for (const c of originals) for (const scale of [-1, 3.7, -3.7]) cases.push({ ...c, name: `${c.name}-scale${scale}`, base: c.name,
  hu: c.hu.map(v => scale * v), hv: c.hv.map(v => scale * v), hd: c.hd.map(v => scale * v), expected: undefined });

const report = { createdAt: new Date().toISOString(), status: 'running', sourceHashes,
  reference: { circle: discB, refinementDifference: Math.abs(discA - discB), method: 'Conditional CDF intervals of the original repeated discs, Simpson outer integration; no Taylor counts.' }, cases, results: [], failures: [] };
fs.writeFileSync(out, JSON.stringify(report, null, 2), { flag: 'wx' });
const save = () => fs.writeFileSync(out, JSON.stringify(report, null, 2));
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 5201, strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/compare/blank.html`);
  const capture = await page.evaluate(async list => {
    const { captureHomographyFixtures } = await import('/tests/compare/homography-browser.mjs');
    return captureHomographyFixtures(list);
  }, cases);
  report.browser = await browser.version(); report.adapter = capture.adapter; report.format = capture.format;
  report.results = capture.results;
  const byName = new Map(capture.results.map(r => [r.name, r]));
  for (const c of cases) {
    const actual = byName.get(c.name);
    const problems = [];
    if (!Number.isFinite(actual.mean) || actual.mean < -1e-5 || actual.mean > 1 + 1e-5) problems.push('nonfinite or out-of-range mean');
    if (![1, 3, 4].includes(actual.regime)) problems.push('unknown integration regime');
    if (c.expectedRegime !== undefined && actual.regime !== c.expectedRegime) problems.push('expected coverage path');
    if (c.expected !== undefined && Math.abs(actual.mean - c.expected) > c.tolerance) problems.push('independent source target');
    if (c.base) {
      const base = byName.get(c.base);
      if (Math.abs(actual.mean - base.mean) > 2e-4 || actual.regime !== base.regime) problems.push('global homography sign/scale invariance');
    }
    if (problems.length) report.failures.push({ name: c.name, problems, expected: c.expected, tolerance: c.tolerance, actual });
  }
  report.sourceHashesAfter = hashes();
  if (JSON.stringify(report.sourceHashesAfter) !== JSON.stringify(sourceHashes)) report.failures.push({ problems: ['Source changed during run; do not attribute these results to the final file.'] });
  report.status = report.failures.length ? 'failed' : 'passed';
  save();
  console.log(JSON.stringify({ status: report.status, cases: cases.length, failures: report.failures, report: out }, null, 2));
  if (report.failures.length) process.exitCode = 1;
} catch (error) {
  report.status = 'failed'; report.failure = error.message; save();
  console.error(`FAIL shared homography gate: ${error.message}\nEvidence: ${out}`); process.exitCode = 1;
} finally { await browser.close(); await server.close(); }
