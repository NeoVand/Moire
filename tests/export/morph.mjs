/** The final type-morph frame and first export must use the settled solver.
 * node tests/export/morph.mjs
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
  const page = await browser.newPage(); await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo?.info() != null, { timeout: 180_000 });
  const result = await page.evaluate(async () => {
    const { MoireRenderer } = await import('/src/gpu/renderer.ts');
    const sync = MoireRenderer.prototype.sync;
    MoireRenderer.prototype.sync = function (...args) { window.__morphRenderer = this; return sync.apply(this, args); };
    const { createDefaultProject } = await import('/src/types/moire.ts');
    const { useProjectStore } = await import('/src/store/project.ts');
    const { clearLayerMorphs, TYPE_MORPH_MS } = await import('/src/gpu/typeMorph.ts');
    window.__zoo.load(JSON.stringify({ app: 'moire', version: 2, ...createDefaultProject(), motion: { animators: [], timings: [], playOnLoad: false } }));
    useProjectStore.getState().setView({ envelope: true, ratio: false, envelopeContours: false });
    const r = window.__morphRenderer;
    const hash = async (canvas) => {
      const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
      const ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0);
      const h = await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, c.width, c.height).data);
      return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
    };
    const grid = () => {
      useProjectStore.getState().setLayerType('1', 'grid-square');
      clearLayerMorphs(); r.writeSlots(); r.writeSlots();
    };
    grid(); useProjectStore.getState().setLayerType('1', 'concentric-circles');
    cancelAnimationFrame(r.morphRaf); r.morphRaf = 0;
    await new Promise(resolve => setTimeout(resolve, TYPE_MORPH_MS + 30));
    // One write is the final morph tick. It must not need an extra edit to settle.
    r.writeSlots(); r.draw();
    const terminal = { exact: r.viewUniforms.exactSweep.value, hash: await hash(r.canvas) };
    r.sync(useProjectStore.getState()); r.draw();
    const next = { exact: r.viewUniforms.exactSweep.value, hash: await hash(r.canvas) };
    grid(); useProjectStore.getState().setLayerType('1', 'concentric-circles');
    const capture = () => r.snapshotWith({ height: 240, aspect: 4 / 3 }, async canvas => ({ exact: r.viewUniforms.exactSweep.value, hash: await hash(canvas) }));
    const first = await capture(); const second = await capture();
    return { terminal, next, first, second };
  });
  assert.equal(result.terminal.exact, 1, 'Final morph tick must select the settled scalar solver');
  assert.equal(result.terminal.hash, result.next.hash, 'Final morph picture must match its next unchanged sync');
  assert.equal(result.first.exact, 1, 'First capture after lattice → scalar must select the scalar solver');
  assert.equal(result.first.hash, result.second.hash, 'First and second captures of the same post-morph pose must match');
  console.log('PASS final lattice → scalar morph tick and first post-morph capture match the settled picture');
} finally { await browser.close(); await server.close(); }
