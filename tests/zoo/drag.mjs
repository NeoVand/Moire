/**
 * The interaction probe: what a hand feels. Loads zoo scenes through the
 * __zoo bridge at a retina-scale viewport, drags the stage the way a hand
 * would (space + drag pans; a 400 ms pause mid-drag stands in for a hand
 * that hesitates), and reports the animation-frame cadence, how the
 * interaction buffer paced itself, and any main-thread long tasks:
 *
 *   node tests/zoo/drag.mjs [cssWidth cssHeight dpr] [--only fan]
 *
 * 1600x1000 at 2 is a laptop window; 2560x1440 at 2 is a 5K display. The
 * frame counter is a continuous requestAnimationFrame loop, which Chrome
 * throttles under GPU back-pressure and not otherwise, so its cadence is
 * the frame rate the viewer sees regardless of how often the mouse moved.
 * The mouse itself moves once per 16 ms, but puppeteer waits for each
 * event's dispatch, so a slow frame slows the hand too: the drag durations
 * are pessimistic, the cadences are not.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { cases } from './scenes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const cssW = Number(positional[0] || 1600);
const cssH = Number(positional[1] || 1000);
const dpr = Number(positional[2] || 2);
const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : '';

const pick = (name) => cases.find((c) => c.name === name).scene;
const plain = (scene) => {
  const copy = JSON.parse(JSON.stringify(scene));
  copy.view.envelope = false;
  return copy;
};
const probes = [
  ['fan plain', plain(pick('fan-trio-envelope'))],
  ['fan envelope', pick('fan-trio-envelope')],
  ['fan envelope again', pick('fan-trio-envelope')],
  ['rings plain', plain(pick('rings-sum-handover'))],
  ['rings envelope', pick('rings-sum-handover')],
  ['rings envelope again', pick('rings-sum-handover')],
].filter(([label]) => !only || label.includes(only));

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { port: 5199, strictPort: false, host: '127.0.0.1' },
  logLevel: 'silent',
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'],
});

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', (err) => console.error('  page error:', err.message));
  await page.setViewport({ width: cssW, height: cssH, deviceScaleFactor: dpr });
  await page.goto(`http://127.0.0.1:${port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo && window.__zoo.info() !== null);

  for (const [label, scene] of probes) {
    await page.evaluate((json) => window.__zoo.load(json), JSON.stringify(scene));
    await page.evaluate(() => new Promise((r) => setTimeout(r, 800)));
    const canvas = await page.$('canvas[aria-label="Moire canvas"]');
    const box = await canvas.boundingBox();
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.5;
    await page.evaluate(() => {
      window.__probe = { frames: 0, long: 0, longMs: 0, log: [], running: true, t0: performance.now() };
      const tick = () => {
        if (!window.__probe.running) return;
        window.__probe.frames++;
        window.__probe.log.push([performance.now(), window.__zoo.info().scale]);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__probe.long++;
          window.__probe.longMs += e.duration;
        }
      });
      window.__po.observe({ entryTypes: ['longtask'] });
    });
    await page.keyboard.down('Space');
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const t0 = Date.now();
    for (let i = 1; i <= 120; i++) {
      await page.mouse.move(cx + Math.sin(i / 10) * 120, cy + Math.cos(i / 13) * 80);
      await new Promise((r) => setTimeout(r, i === 60 ? 400 : 16));
    }
    const dragMs = Date.now() - t0;
    await page.mouse.up();
    await page.keyboard.up('Space');
    const p = await page.evaluate(() => {
      window.__probe.running = false;
      window.__po.disconnect();
      const s = window.__probe;
      s.elapsed = performance.now() - s.t0;
      return s;
    });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const info = await page.evaluate(() => window.__zoo.info());
    const settled = await page.evaluate(() => {
      const c = document.querySelector('canvas[aria-label="Moire canvas"]');
      return `${c.width}x${c.height}`;
    });
    const runs = [];
    for (let k = 1; k < p.log.length; k++) {
      const scale = p.log[k][1];
      const dt = p.log[k][0] - p.log[k - 1][0];
      if (!runs.length || runs[runs.length - 1].scale !== scale) runs.push({ scale, v: [] });
      runs[runs.length - 1].v.push(dt);
    }
    const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    console.log(
      `${label.padEnd(22)} ${(p.frames / (p.elapsed / 1000)).toFixed(1)} fps  ` +
        `full frame ${info.fullCost.toFixed(0)} ms  settled ${settled}  drag ${dragMs} ms  ` +
        `long tasks ${p.long} (${p.longMs.toFixed(0)} ms)`
    );
    console.log(
      '   buffer: ' +
        runs.map((r) => `${r.scale} x${r.v.length} @ ${mean(r.v).toFixed(1)} ms`).join(' -> ')
    );
  }
} finally {
  await browser.close();
  await server.close();
}
