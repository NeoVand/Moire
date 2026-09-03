// Full-size frame cost of scenes as the app measures it: the settled frame's
// fullCost (submit to queue completion) on a 1600x1000 viewport at device
// scale 2, the minimum of five loads. This is the number the interaction
// ladder starts from, so it is the number that decides whether a gesture is
// drawn full size. Usage: node tests/zoo/cost.mjs <scenes.mjs> <case> [case...]
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [scenesPath, ...names] = process.argv.slice(2);
const { cases } = await import(pathToFileURL(path.resolve(scenesPath)).href);
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, strictPort: false, host: '127.0.0.1' }, logLevel: 'silent' });
await server.listen();
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo && window.__zoo.info() !== null, { timeout: 180_000 });
  for (const name of names) {
    const c = cases.find((c) => c.name === name);
    const costs = await page.evaluate(async (json) => {
      const out = [];
      for (let i = 0; i < 5; i++) {
        window.__zoo.load(json);
        await new Promise((r) => setTimeout(r, 700));
        out.push(window.__zoo.info().fullCost);
      }
      return out;
    }, JSON.stringify(c.scene));
    const min = Math.min(...costs.filter((x) => x > 0));
    console.log(name.padEnd(16), `min ${min.toFixed(1)} ms  of`, costs.map((x) => x?.toFixed(0)).join(' '));
  }
} finally { await browser.close(); await server.close(); }
