/**
 * The zoo runner: renders every case in scenes.mjs through the real app —
 * Vite dev server, headless Chrome, WebGPU on the actual GPU — and compares
 * the pixels against the blessed goldens.
 *
 *   npm run zoo                    compare against goldens, fail on drift
 *   npm run zoo:update             re-bless: current renders become golden
 *   npm run zoo -- grid            only cases whose name contains "grid"
 *
 * A failing case writes out/<name>.png (the render) and out/<name>.diff.png
 * (disagreeing pixels in red); the case's scene JSON is in scenes.mjs and
 * loads straight into the app for a look. Goldens are per-backend: the
 * manifest records which backend blessed them, and the runner refuses to
 * compare webgpu pixels against webgl2 goldens rather than report noise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import pixelmatch from 'pixelmatch';
import pngjs from 'pngjs';
import { cases, CAPTURE, MAX_DIFF_RATIO, VIEWPORT } from './scenes.mjs';

const { PNG } = pngjs;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const goldenDir = path.join(here, 'golden');
const outDir = path.join(here, 'out');
const manifestPath = path.join(goldenDir, 'manifest.json');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const argv = process.argv.slice(2);
const update = argv.includes('--update') || argv.includes('-u');
const filter = argv.find((a) => !a.startsWith('-')) ?? '';

const wanted = cases.filter((c) => c.name.includes(filter));
if (wanted.length === 0) {
  console.error(`No zoo case matches "${filter}".`);
  process.exit(2);
}

fs.mkdirSync(goldenDir, { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { port: 5197, strictPort: false, host: '127.0.0.1' },
  logLevel: 'silent',
});
await server.listen();
const port = server.httpServer.address().port;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'],
});

let failures = 0;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', (err) => console.error('  page error:', err.message));
  await page.setViewport({ ...VIEWPORT, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo && window.__zoo.info() !== null, {
    timeout: 180_000,
  });
  const backend = await page.evaluate(() => window.__zoo.info().backend);

  const manifest = readManifest();
  if (!update && manifest && manifest.backend !== backend) {
    console.error(
      `Goldens were blessed on ${manifest.backend}, this run is on ${backend} — ` +
        `pixel comparison across backends is noise. Run zoo:update on this backend ` +
        `or fix the backend first.`
    );
    process.exit(2);
  }
  if (backend !== 'webgpu') {
    console.warn(`Note: rendering on ${backend}, not webgpu.`);
  }

  console.log(`zoo: ${wanted.length} case(s) on ${backend}\n`);

  const blessed = {};
  for (const c of wanted) {
    const t0 = Date.now();
    const dataUrl = await page.evaluate(
      async ({ json, width, height }) => {
        window.__zoo.load(json);
        return await window.__zoo.capture({ width, height });
      },
      { json: JSON.stringify(c.scene), ...CAPTURE }
    );
    const png = PNG.sync.read(Buffer.from(dataUrl.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(outDir, `${c.name}.png`), PNG.sync.write(png));
    const ms = Date.now() - t0;

    if (update) {
      fs.writeFileSync(path.join(goldenDir, `${c.name}.png`), PNG.sync.write(png));
      blessed[c.name] = { coords: c.coords, note: c.note };
      console.log(`  blessed  ${c.name}  (${ms}ms)`);
      continue;
    }

    const goldenPath = path.join(goldenDir, `${c.name}.png`);
    if (!fs.existsSync(goldenPath)) {
      failures++;
      console.log(`  NEW      ${c.name} — no golden yet; run npm run zoo:update`);
      continue;
    }
    const golden = PNG.sync.read(fs.readFileSync(goldenPath));
    if (golden.width !== png.width || golden.height !== png.height) {
      failures++;
      console.log(
        `  FAIL     ${c.name} — size ${png.width}x${png.height} vs golden ` +
          `${golden.width}x${golden.height}`
      );
      continue;
    }
    const diff = new PNG({ width: png.width, height: png.height });
    const bad = pixelmatch(golden.data, png.data, diff.data, png.width, png.height, {
      threshold: 0.12,
    });
    const ratio = bad / (png.width * png.height);
    if (ratio > MAX_DIFF_RATIO) {
      failures++;
      fs.writeFileSync(path.join(outDir, `${c.name}.diff.png`), PNG.sync.write(diff));
      console.log(
        `  FAIL     ${c.name} — ${bad} px differ (${(ratio * 100).toFixed(3)}%), ` +
          `see tests/zoo/out/${c.name}.diff.png`
      );
    } else {
      console.log(`  ok       ${c.name}  (${ms}ms${bad ? `, ${bad} px within tolerance` : ''})`);
    }
  }

  if (update) {
    const previous = readManifest();
    const caseNotes = filter ? { ...(previous?.cases ?? {}), ...blessed } : blessed;
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          backend,
          viewport: VIEWPORT,
          capture: CAPTURE,
          updatedAt: new Date().toISOString(),
          cases: caseNotes,
        },
        null,
        2
      ) + '\n'
    );
    console.log(`\n${wanted.length} golden(s) blessed on ${backend}.`);
  } else {
    const stale = fs
      .readdirSync(goldenDir)
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.slice(0, -4))
      .filter((name) => !cases.some((c) => c.name === name));
    if (stale.length) {
      console.warn(`\nGoldens with no case (delete or re-add): ${stale.join(', ')}`);
    }
    console.log(
      failures
        ? `\n${failures} of ${wanted.length} case(s) FAILED.`
        : `\nAll ${wanted.length} case(s) match.`
    );
  }
} finally {
  await browser.close();
  await server.close();
}

process.exit(failures ? 1 : 0);
