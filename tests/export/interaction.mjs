/** Actual pan/zoom regression: every live view must retain its pixel grid and picture.
 * node tests/export/interaction.mjs
 * Uses a fresh Chrome profile and the same WebGPU launch as the zoo.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 5196, strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1231, height: 987, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo?.info() != null, { timeout: 180_000 });
  await page.evaluate(async () => {
    const { MoireRenderer } = await import('/src/gpu/renderer.ts');
    const sync = MoireRenderer.prototype.sync;
    MoireRenderer.prototype.sync = function (...args) { window.__interactionRenderer = this; return sync.apply(this, args); };
    const { createDefaultProject } = await import('/src/types/moire.ts');
    const { useProjectStore } = await import('/src/store/project.ts');
    const { useTransportStore } = await import('/src/store/transport.ts');
    const { captureSettle } = await import('/src/gpu/capture.ts');
    window.__zoo.load(JSON.stringify({ app: 'moire', version: 2, ...createDefaultProject(), motion: { animators: [], timings: [], playOnLoad: false } }));
    useTransportStore.getState().pause();
    useProjectStore.getState().setCamera({ zoom: .92 });
    useProjectStore.getState().setView({ envelope: false, envelopeContours: false, ratio: false });
    await captureSettle();
    // Force the performance signal that formerly selected the 0.35 buffer.
    const renderer = window.__interactionRenderer;
    renderer.readyAt = -1000; renderer.fullCost = 200; renderer.lockedScale = .35;
  });
  const read = () => page.evaluate(async () => {
    const r = window.__interactionRenderer;
    // Draw at the LIVE buffer; snapshot() would force full size and hide the bug.
    r.draw();
    const copy = document.createElement('canvas'); copy.width = r.canvas.width; copy.height = r.canvas.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(r.canvas, 0, 0);
    const pixels = ctx.getImageData(0, 0, copy.width, copy.height).data;
    const hash = await crypto.subtle.digest('SHA-256', pixels);
    let low = 255, high = 0;
    for (let i = 0; i < pixels.length; i += 4) { low = Math.min(low, pixels[i]); high = Math.max(high, pixels[i]); }
    return { width: copy.width, height: copy.height, scale: r.scale, hash: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join(''), contrast: high - low };
  });
  const check = (frame) => {
    assert.equal(frame.scale, 1); assert.equal(frame.width, 2462); assert.equal(frame.height, 1974);
    assert.ok(frame.contrast > 128, 'Live read must contain real ink, not an empty canvas');
  };
  const modes = [
    { name: 'plain', view: {} },
    { name: 'Envelope table', view: { envelope: true } },
    { name: 'Envelope chain', view: { envelope: true, envelopeSweep: .5 } },
    { name: 'Ratio', view: { ratio: true } },
    { name: 'Contours', view: { envelopeContours: true } },
  ];
  for (const mode of modes) {
    await page.evaluate(async (mode) => {
      const { useProjectStore } = await import('/src/store/project.ts');
      const { captureSettle } = await import('/src/gpu/capture.ts');
      useProjectStore.getState().setCamera({ zoom: .92, pan: { x: 0, y: 0 } });
      useProjectStore.getState().setView({ envelope: false, envelopeSweep: 1, envelopeContours: false, ratio: false, ...mode.view });
      await captureSettle();
      const r = window.__interactionRenderer;
      // Reproduce the remembered slow-preview state that caused the regression.
      r.readyAt = -1000; r.fullCost = 200; r.lockedScale = .35; r.memoryKey = r.costKey;
    }, mode);
    await page.mouse.move(870, 650); await page.mouse.down({ button: 'middle' });
    for (let i = 1; i <= 3; i++) { await page.mouse.move(870 + i * 4, 650 + i); check(await read()); }
    const held = await read(); await page.mouse.up({ button: 'middle' });
    await page.evaluate(() => new Promise(r => setTimeout(r, 250)));
    const resting = await read(); check(resting);
    assert.equal(held.hash, resting.hash, `${mode.name}: same pan pose must match during and after a gesture`);

    for (let i = 0; i < 2; i++) { await page.mouse.wheel({ deltaY: i % 2 ? -20 : 25 }); check(await read()); }
    const zooming = await read(); await page.evaluate(() => new Promise(r => setTimeout(r, 250)));
    const zoomed = await read(); check(zoomed);
    assert.equal(zooming.hash, zoomed.hash, `${mode.name}: same zoom pose must match after the wheel settles`);
    console.log(`PASS ${mode.name}: pan/zoom at full 2462×1974, same-pose pixels identical during and after interaction`);
  }

  const returned = await page.evaluate(async () => {
    const { useProjectStore } = await import('/src/store/project.ts');
    const r = window.__interactionRenderer;
    // A renderer left at a legacy preview size must recover on the next edit.
    r.scale = .35; r.renderer.setPixelRatio(2 * .35); r.renderer.setSize(1231, 987, false);
    useProjectStore.getState().setView({ envelope: true, envelopeContours: false, ratio: false });
    return { scale: r.scale, width: r.canvas.width, height: r.canvas.height };
  });
  assert.equal(returned.scale, 1); assert.equal(returned.width, 2462); assert.equal(returned.height, 1974);
  console.log('PASS view change: a legacy reduced buffer returns immediately to full resolution');

} finally {
  await browser.close(); await server.close();
}
