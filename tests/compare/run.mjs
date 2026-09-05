import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) || path.join(os.tmpdir(), `moire-comparison-live-${Date.now()}.json`);
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5198, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // The browser asks for a root favicon even when a page has not supplied
    // one. Its absence is unrelated to shader compilation or rendering.
    if (message.type() === 'error' && !message.location().url?.endsWith('/favicon.ico')) errors.push(message.text());
  });
  await page.setViewport({ width: 1200, height: 780, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/compare.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__compare?.info().ready);
  const result = await page.evaluate(async () => {
    const app = window.__compare;
    app.pause(); app.resize(192, 128); app.setMotion('glide'); app.setTime(0);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const digest = values => {
      let hash = 2166136261;
      for (const value of values) hash = Math.imul(hash ^ value, 16777619);
      return (hash >>> 0).toString(16);
    };
    const shot = method => {
      const frame = app.pixels(method);
      const values = frame.data.filter((_, i) => i % 4 !== 3);
      return { width: frame.width, height: frame.height, hash: digest(frame.data), min: Math.min(...values), max: Math.max(...values), opaque: frame.data.every((v, i) => i % 4 !== 3 || v === 255), data: frame.data };
    };
    const initial = { raw: shot('raw'), spectral: shot('spectral') };
    const pausedTime = app.info().time;
    const historyBefore = app.info().historyFrames;
    app.step(24);
    const paused = app.info();
    const temporal = shot('temporal');
    const h = paused.homography;
    const source = (x, y) => {
      const d = h.d[0] * x + h.d[1] * y + h.d[2];
      if (d >= 0) return null;
      const u = (h.u[0] * x + h.u[1] * y + h.u[2]) / d;
      const v = (h.v[0] * x + h.v[1] * y + h.v[2]) / d;
      return (u - Math.floor(u) >= 0.5) === (v - Math.floor(v) >= 0.5);
    };
    const srgb = linear => linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
    const textureChecks = [];
    for (let y = 84; y < 124; y += 3) for (let x = 4; x < 188; x += 5) {
      const c = source(x + 0.5, y + 0.5);
      if (c === null || ![-2, 0, 2].every(dx => [-2, 0, 2].every(dy => source(x + 0.5 + dx, y + 0.5 + dy) === c))) continue;
      const expected = srgb(c ? 0.82 : 0.025);
      const got = temporal.data[(y * 192 + x) * 4] / 255;
      textureChecks.push({ x, y, expected, got, error: Math.abs(got - expected) });
    }
    app.setTime(8);
    const moved = { raw: shot('raw'), spectral: shot('spectral') };
    app.setTime(0);
    const resetHistory = app.info().historyFrames;
    const repeated = { raw: shot('raw'), spectral: shot('spectral') };
    app.setDetail(2);
    const detail = shot('spectral');
    app.resize(160, 160);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const resized = Object.fromEntries(['raw', 'temporal', 'spectral'].map(method => [method, shot(method)]));
    const info = app.info();
    const compact = item => { const { data, ...rest } = item; return rest; };
    return { initial: Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, compact(v)])), moved: Object.fromEntries(Object.entries(moved).map(([k, v]) => [k, compact(v)])), repeated: Object.fromEntries(Object.entries(repeated).map(([k, v]) => [k, compact(v)])), temporal: compact(temporal), detail: compact(detail), resized: Object.fromEntries(Object.entries(resized).map(([k, v]) => [k, compact(v)])), info, pausedTime, historyBefore, paused, resetHistory, textureChecks };
  });
  for (const method of ['raw', 'spectral']) {
    assert.equal(result.initial[method].hash, result.repeated[method].hash, `${method} changes after returning to the same pose.`);
    assert.notEqual(result.initial[method].hash, result.moved[method].hash, `${method} did not respond to camera motion.`);
  }
  assert.notEqual(result.initial.spectral.hash, result.detail.hash, 'Pattern density did not change the rendered material.');
  assert.equal(result.paused.time, result.pausedTime);
  assert.equal(result.paused.playing, false);
  assert.ok(result.paused.historyFrames >= result.historyBefore + 24, 'Paused TAA did not continue accumulating.');
  assert.ok(result.resetHistory <= 2, 'Camera cut did not reset TAA history.');
  assert.ok(result.textureChecks.length >= 10, `Only ${result.textureChecks.length} resolved texture interiors were found.`);
  assert.ok(Math.max(...result.textureChecks.map(c => c.error)) < 0.07, `Texture baseline phase/color differs from the source checker on resolved interiors: ${JSON.stringify(result.textureChecks.sort((a, b) => b.error - a.error).slice(0, 6))}`);
  for (const shot of [result.temporal, ...Object.values(result.initial), ...Object.values(result.resized)]) {
    assert.ok(shot.opaque && shot.max - shot.min > 80, 'A panel is blank, transparent, or lacks the checker material.');
  }
  for (const shot of Object.values(result.resized)) assert.deepEqual([shot.width, shot.height], [160, 160]);
  assert.equal(result.info.backend.toLowerCase(), 'webgpu');
  const kernelSwitch = await page.evaluate(async () => {
    const app = window.__compare;
    const hash = method => app.pixels(method).data.reduce((v, c) => Math.imul(v ^ c, 16777619), 2166136261) >>> 0;
    const before = { raw: hash('raw'), spectral: hash('spectral'), state: app.info() };
    await app.setKernel('lattice');
    const lattice = { raw: hash('raw'), spectral: hash('spectral'), state: app.info() };
    await app.setKernel('homography');
    const homography = { raw: hash('raw'), spectral: hash('spectral'), state: app.info() };
    await app.setKernel('projective');
    const restored = { raw: hash('raw'), spectral: hash('spectral'), state: app.info() };
    return { before, lattice, homography, restored };
  });
  for (const kernel of ['lattice', 'homography']) {
    assert.equal(kernelSwitch[kernel].state.kernel, kernel);
    assert.equal(kernelSwitch[kernel].state.ready, true);
    assert.equal(kernelSwitch[kernel].state.time, kernelSwitch.before.state.time);
    assert.deepEqual(kernelSwitch[kernel].state.homography, kernelSwitch.before.state.homography);
    assert.equal(kernelSwitch[kernel].raw, kernelSwitch.before.raw, 'Kernel switch changed the source view.');
  }
  assert.equal(kernelSwitch.restored.spectral, kernelSwitch.before.spectral, 'Returning to the original kernel changed its output.');
  await page.click('button[aria-expanded]');
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.$eval('[role="dialog"]', el => el.textContent), /DLAA/);
  await page.click('button[aria-label="Close"]');
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.select('select[aria-label="Integration kernel"]', 'homography');
  await page.waitForFunction(() => window.__compare.info().ready && window.__compare.info().kernel === 'homography');
  // Return to native panel dimensions before translating a real UI click into
  // a device-pixel coordinate. The bridge's earlier small buffers were tests.
  await page.evaluate(async () => {
    window.__compare.setDetail(1);
    window.__compare.resize();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const canvas = await page.$('canvas[aria-label="No anti-aliasing"]');
  const rect = await canvas.boundingBox();
  await page.mouse.click(rect.x + rect.width * 0.63, rect.y + rect.height * 0.73);
  await page.waitForSelector('[aria-label="Pixel comparison"]');
  const inspection = await page.$eval('[aria-label="Pixel comparison"]', el => el.textContent);
  assert.match(inspection, /Reference/);
  assert.match(inspection, /131,072 samples/);
  assert.match(inspection, /different (?:reconstruction )?filter/);
  assert.equal(await page.evaluate(() => window.__compare.info().playing), false);
  assert.equal(await page.$$eval('.compare-crosshair', items => items.length), 3);
  await page.click('button[aria-label="Close pixel inspection"]');
  await page.waitForSelector('[aria-label="Pixel comparison"]', { hidden: true });
  await page.click('.compare-play');
  await page.waitForFunction(() => window.__compare.info().playing);
  const resumedTime = await page.evaluate(() => window.__compare.info().time);
  await page.waitForFunction(t => window.__compare.info().time > t, {}, resumedTime);
  await page.click('.compare-play');
  await page.screenshot({ path: out.replace(/\.json$/, '.png'), fullPage: true });
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  fs.writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), browser: await browser.version(), result, kernelSwitch, inspection }, null, 2), { flag: 'wx' });
  console.log(`PASS synchronized live WebGPU comparison, real TRAA history/reset, resize, texture phase, controls, pixel inspector; ${out}`);
} finally {
  await browser.close(); await server.close();
}
