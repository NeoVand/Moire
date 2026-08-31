/**
 * Ad-hoc zoo renders: the run.mjs pipeline (Vite, headless Chrome, WebGPU,
 * the __zoo bridge) pointed at an arbitrary scenes module instead of the
 * golden set, with no comparison step. For looking at a work-in-progress
 * change from the exact pixels the app would produce:
 *
 *   node tests/zoo/render.mjs <scenes.mjs> <outDir> [--scale 2]
 *
 * The scenes module exports `cases`: [{ name, scene }] in the same shape
 * scenes.mjs uses. `--scale` multiplies the capture size, for reading
 * pixel-level artifacts without the PNG viewer's resampling in the way.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { CAPTURE, VIEWPORT } from './scenes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const [scenesPath, outDirArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!scenesPath || !outDirArg) {
  console.error('usage: node tests/zoo/render.mjs <scenes.mjs> <outDir> [--scale N]');
  process.exit(2);
}
const scaleArg = process.argv.indexOf('--scale');
const scale = scaleArg >= 0 ? Number(process.argv[scaleArg + 1]) : 1;

const { cases } = await import(pathToFileURL(path.resolve(scenesPath)).href);
const outDir = path.resolve(outDirArg);
fs.mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { port: 5198, strictPort: false, host: '127.0.0.1' },
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
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo && window.__zoo.info() !== null, {
    timeout: 180_000,
  });

  for (const c of cases) {
    const t0 = Date.now();
    const dataUrl = await page.evaluate(
      async ({ json, width, height }) => {
        window.__zoo.load(json);
        return await window.__zoo.capture({ width, height });
      },
      {
        json: JSON.stringify(c.scene),
        width: CAPTURE.width * scale,
        height: CAPTURE.height * scale,
      }
    );
    fs.writeFileSync(
      path.join(outDir, `${c.name}.png`),
      Buffer.from(dataUrl.split(',')[1], 'base64')
    );
    console.log(`  wrote ${c.name}.png  (${Date.now() - t0}ms)`);
  }
} finally {
  await browser.close();
  await server.close();
}
