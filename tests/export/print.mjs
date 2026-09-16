/** Actual WebGPU alpha, print framing, ZIP download and modal regression. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { cases } from '../zoo/scenes.mjs';
import { cases as imageCases } from '../../paper/tools/exp/inverse-scenes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = process.env.PRINT_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'moire-print-'));
fs.mkdirSync(output, { recursive: true });
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5195, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo?.info());
  const result = await page.evaluate(async ({ scene, imageScene }) => {
    const { renderPrintSheets, exportPrint } = await import('/src/gpu/print.ts');
    const { DEFAULT_PRINT, printLayout } = await import('/src/gpu/printFormat.ts');
    const { capturePng, captureSize, captureSettle } = await import('/src/gpu/capture.ts');
    const { useProjectStore } = await import('/src/store/project.ts');
    const { useTransportStore } = await import('/src/store/transport.ts');
    window.__zoo.load(JSON.stringify(scene));
    useTransportStore.getState().pause();
    const hash = async (blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).join(',');
    const state = useProjectStore.getState();
    const source = { state: structuredClone({ layers: state.layers, camera: state.camera, backgroundColor: state.backgroundColor, view: state.view }), framing: captureSize() };
    const frozen = JSON.stringify(source);
    const settings = { ...DEFAULT_PRINT, paper: 'custom', customWidth: 101.6, customHeight: 76.2, dpi: 150, margin: 6 };
    await captureSettle();
    const before = await hash(await capturePng({ height: 240, aspect: 4 / 3 }));
    const inspect = async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, partial = 0, maxAlpha = 0, ink = 0, worstColor = 0, alphaSum = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        const a = bytes[i + 3];
        if (!a) transparent++;
        else { ink++; if (a < 255) partial++; }
        maxAlpha = Math.max(maxAlpha, a);
        alphaSum += a;
        // Every nonzero red pixel must stay red, without a white or dark matte.
        if (a > 30) worstColor = Math.max(worstColor, Math.abs(bytes[i] - 255), bytes[i + 1], bytes[i + 2]);
      }
      return { width: canvas.width, height: canvas.height, transparent, partial, maxAlpha, ink, worstColor, alphaSum, corner: Array.from(bytes.slice(0, 4)) };
    };
    const red = { ...source, state: { ...source.state, backgroundColor: '#24b379', layers: [{ ...source.state.layers[0], color: '#ff0000', opacity: .6, spacing: 24, thickness: 6 }] } };
    const redFiles = await renderPrintSheets(red, settings, [red.state.layers[0].id]);
    const redInfo = await inspect(redFiles[0].blob);
    const white = { ...red, state: { ...red.state, layers: [{ ...red.state.layers[0], color: '#ffffff', opacity: 1 }] } };
    const [whiteFile] = await renderPrintSheets(white, settings, [white.state.layers[0].id]);
    const whiteInfo = await inspect(whiteFile.blob);
    const twin = structuredClone(red);
    twin.state.layers.push({ ...twin.state.layers[0], id: 'identical-twin', visible: false });
    const twinFiles = await renderPrintSheets(twin, settings, twin.state.layers.map((l) => l.id));
    const twinsIdentical = await hash(twinFiles[0].blob) === await hash(twinFiles[1].blob);
    const fine = { ...red, state: { ...red.state, layers: [{ ...red.state.layers[0], thickness: .5 }] } };
    const duty = [];
    for (const dpi of [150, 300]) {
      const [file] = await renderPrintSheets(fine, { ...settings, dpi }, [fine.state.layers[0].id]);
      const info = await inspect(file.blob);
      duty.push(info.alphaSum / (info.width * info.height));
    }
    const variants = [];
    for (const [name, layer] of [
      ['expression', { ...red.state.layers[0], field: { source: 'sin(x / 20)', amount: 1, scale: 100 } }],
      ['tiling', { ...red.state.layers[0], type: 'tiling-periodic', tiling: 'kagome', drawEdges: true, tileFill: .3 }],
      ['image', imageScene.layers[1]],
    ]) {
      const variant = { ...source, state: { ...source.state, view: { ...source.state.view, envelope: true, ratio: true, envelopeContours: true }, layers: [layer] } };
      const [file] = await renderPrintSheets(variant, settings, [layer.id]);
      variants.push({ name, ...await inspect(file.blob) });
    }
    const zip = await exportPrint(twin, { ...settings, marks: true }, twin.state.layers.map((l) => l.id));
    const after = await hash(await capturePng({ height: 240, aspect: 4 / 3 }));
    return { redInfo, whiteInfo, twinsIdentical, duty, variants, unchanged: before === after && frozen === JSON.stringify(source),
      layout: printLayout(settings), redPng: Array.from(new Uint8Array(await redFiles[0].blob.arrayBuffer())), zip: Array.from(new Uint8Array(await zip.arrayBuffer())) };
  }, { scene: cases.find((c) => c.name === 'lines-pair').scene, imageScene: imageCases.find((c) => c.name === 'inverse-aligned').scene });
  assert.equal(result.redInfo.width, 600); assert.equal(result.redInfo.height, 450);
  assert.ok(result.redInfo.transparent > 1000); assert.ok(result.redInfo.partial > 100);
  assert.ok(Math.abs(result.redInfo.maxAlpha - 153) <= 1, JSON.stringify(result.redInfo));
  assert.ok(result.redInfo.worstColor <= 3, `Edge RGB contains a matte: ${JSON.stringify(result.redInfo)}`);
  assert.deepEqual(result.redInfo.corner, [0, 0, 0, 0]);
  assert.equal(result.whiteInfo.maxAlpha, 255, 'White ink remains distinct from transparent background');
  assert.equal(result.twinsIdentical, true, 'Independent sheets must share identical registration');
  assert.ok(Math.abs(result.duty[0] / result.duty[1] - 1) < .03, `DPI changed physical ink coverage: ${result.duty}`);
  assert.equal(result.unchanged, true, 'Live capture and source state changed after printing');
  for (const variant of result.variants) {
    assert.ok(variant.transparent > 1000 && variant.ink > 100, `${variant.name}: missing ink or transparency`);
  }
  fs.writeFileSync(path.join(output, 'red-sheet.png'), new Uint8Array(result.redPng));
  fs.writeFileSync(path.join(output, 'sheets.zip'), new Uint8Array(result.zip));
  execFileSync('unzip', ['-t', path.join(output, 'sheets.zip')]);
  const decoded = PNG.sync.read(Buffer.from(result.redPng));
  assert.equal(decoded.width, 600);
  console.log('PASS WebGPU alpha, colored edges, white ink, expression/image/tiling fields, identical sheets, unchanged live capture, valid ZIP');

  const proofs = await page.evaluate(async ({ imageScene, lineScene }) => {
    const { renderPrintPreview, stackPrintSheets, fitPrintPreview } = await import('/src/gpu/printPreview.ts');
    const { renderPrintSheets } = await import('/src/gpu/print.ts');
    const { DEFAULT_PRINT } = await import('/src/gpu/printFormat.ts');
    const { useProjectStore } = await import('/src/store/project.ts');
    const { captureSize } = await import('/src/gpu/capture.ts');
    const { useTransportStore } = await import('/src/store/transport.ts');
    const pixels = async (blob) => {
      const img = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); img.close();
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const results = [];
    const settings = { ...DEFAULT_PRINT, paper: 'custom', customWidth: 101.6, customHeight: 76.2, dpi: 150, margin: 6 };
    const expressionScene = structuredClone(lineScene);
    expressionScene.layers[1].field = { source: 'sin(x / 30) + cos(y / 25)', amount: 1, scale: 100 };
    for (const [name, scene] of [['expression', expressionScene], ['shared image', imageScene]]) {
      window.__zoo.load(JSON.stringify(scene));
      useTransportStore.getState().pause();
      const { layers, camera, backgroundColor, view } = useProjectStore.getState();
      const source = { state: structuredClone({ layers, camera, backgroundColor, view }), framing: captureSize() };
      const ids = layers.map((l) => l.id);
      const preview = await renderPrintPreview(source, settings, [...ids].reverse());
      const exports = await renderPrintSheets(source, settings, ids);
      const a = await pixels(exports[0].blob), b = await pixels(exports[1].blob), stacked = await pixels(preview.blob);
      let worst = 0, differsFromFirst = 0;
      const bounds = [600, 450, 0, 0];
      for (let i = 3; i < stacked.length; i += 4) {
        const expected = b[i] + a[i] * (1 - b[i] / 255);
        worst = Math.max(worst, Math.abs(stacked[i] - expected));
        if (Math.abs(stacked[i] - a[i]) > 20) differsFromFirst++;
        if (Math.abs(a[i] - b[i]) > 20) {
          const x = ((i - 3) / 4) % 600, y = Math.floor((i - 3) / 2400);
          bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
          bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
        }
      }
      const fit = await fitPrintPreview(preview.blob, { width: 400, height: 300 });
      results.push({ name, worst, differsFromFirst, width: preview.width, height: preview.height,
        fit: Array.from(new Uint8Array(await fit.arrayBuffer())),
        bounds,
      });
    }
    // A simple encoded image: two individually uniform stripe sheets make a
    // half-gray / half-black overlay. Pre-filtering the sheets erases the image.
    const sheets = [];
    for (let layer = 0; layer < 2; layer++) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const ctx = c.getContext('2d');
      for (let x = 0; x < 64; x++) if (x % 2 === (layer && x >= 32 ? 1 : 0)) ctx.fillRect(x, 0, 1, 32);
      sheets.push({ blob: await new Promise((resolve) => c.toBlob(resolve)) });
    }
    const stacked = await stackPrintSheets(sheets);
    const tiny = await fitPrintPreview(stacked.blob, { width: 16, height: 8 });
    const filtered = await pixels(tiny);
    const tinyPixels = [filtered[(4 * 16 + 4) * 4 + 3], filtered[(4 * 16 + 12) * 4 + 3]];
    return { results, tinyPixels };
  }, { imageScene: imageCases.find((c) => c.name === 'inverse-halves-aligned').scene, lineScene: cases.find((c) => c.name === 'lines-pair').scene });
  for (const proof of proofs.results) {
    assert.equal(proof.width, 600); assert.equal(proof.height, 450);
    assert.ok(proof.worst <= 1.5, `${proof.name}: preview differs from exported alpha composition`);
    assert.ok(proof.differsFromFirst > 100, `${proof.name}: second sheet is missing from the overlay`);
    fs.writeFileSync(path.join(output, `${proof.name.replaceAll(' ', '-')}-proof.png`), new Uint8Array(proof.fit));
    if (proof.name === 'shared image') {
      assert.ok(proof.bounds[0] > 150 && proof.bounds[1] > 100 && proof.bounds[2] < 450 && proof.bounds[3] < 350,
        'Shared image sheets must stay in register outside the image field');
    }
  }
  assert.ok(Math.abs(proofs.tinyPixels[0] - 128) <= 1);
  assert.equal(proofs.tinyPixels[1], 255, 'Downsampling erased the image encoded in the sheet alignment');
  console.log('PASS expression and shared-image overlays match exported sheets; subpixel encoded image survives preview resizing');

  const rings = await page.evaluate(async () => {
    const { renderPrintSheets } = await import('/src/gpu/print.ts');
    const { fitPrintPreview } = await import('/src/gpu/printPreview.ts');
    const { DEFAULT_PRINT, printLayout } = await import('/src/gpu/printFormat.ts');
    const { useProjectStore } = await import('/src/store/project.ts');
    const { captureSize } = await import('/src/gpu/capture.ts');
    const { layers, camera, view, backgroundColor } = useProjectStore.getState();
    const layer = { ...layers[0], type: 'concentric-circles', field: undefined, spacing: 6, thickness: 3,
      position: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, rotation: 0, rotationOffset: 0, phase: 0, opacity: 1 };
    const source = { state: { layers: [layer], camera: { ...camera, zoom: 1, pan: { x: 0, y: 0 } }, view, backgroundColor }, framing: captureSize() };
    const [sheet] = await renderPrintSheets(source, DEFAULT_PRINT, [layer.id]);
    const pixels = async (blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    const full = await pixels(sheet.blob), layout = printLayout(DEFAULT_PRINT);
    const scale = Math.min(layout.artWidth / source.framing.width, layout.artHeight / source.framing.height);
    let nativeWorst = 0, nativeSamples = 0;
    // Check the exported geometry independently, away from anti-aliased edges.
    for (let y = layout.inset + 4; y < full.height - layout.inset - 4; y += 3) {
      for (let x = layout.inset + 4; x < full.width - layout.inset - 4; x += 3) {
        const r = Math.hypot(x + .5 - full.width / 2, y + .5 - full.height / 2) / scale;
        const distance = Math.abs((r + 3) % 6 - 3);
        if (r < 20 || Math.abs(distance - 1.5) * scale < 1.1) continue;
        nativeWorst = Math.max(nativeWorst, Math.abs(full.data[(y * full.width + x) * 4 + 3] - (distance < 1.5 ? 255 : 0)));
        nativeSamples++;
      }
    }
    const fits = [];
    for (const height of [238, 448, 476]) {
      const blob = await fitPrintPreview(sheet.blob, { width: height, height });
      const fit = await pixels(blob);
      let min = 255, max = 0, sum = 0, n = 0;
      for (let y = 30; y < fit.height - 30; y++) for (let x = 30; x < fit.width - 30; x++) {
        if (Math.hypot(x - fit.width / 2, y - fit.height / 2) < 20) continue;
        const a = fit.data[(y * fit.width + x) * 4 + 3];
        min = Math.min(min, a); max = Math.max(max, a); sum += a; n++;
      }
      fits.push({ height, min, max, mean: sum / n, png: Array.from(new Uint8Array(await blob.arrayBuffer())) });
    }
    return { nativeWorst, nativeSamples, fits };
  });
  assert.ok(rings.nativeSamples > 100_000);
  assert.ok(rings.nativeWorst <= 3, `Single-layer export disagrees with concentric ring geometry: ${rings.nativeWorst}`);
  for (const fit of rings.fits) {
    assert.ok(fit.max - fit.min <= 10, `${fit.height}px preview invented single-layer moire: ${fit.min}–${fit.max}`);
    assert.ok(Math.abs(fit.mean - 127.5) < 1, 'Preview changed the ink coverage');
    fs.writeFileSync(path.join(output, `single-rings-${fit.height}.png`), new Uint8Array(fit.png));
  }
  console.log('PASS single-layer PNG matches ring geometry; normal, enlarged and high-DPI fits suppress false moire');

  const clickButton = async (text, scope = '') => {
    await page.waitForFunction((text, scope) => [...document.querySelectorAll(`${scope} button`)].some((el) => el.textContent.trim() === text), {}, text, scope);
    await page.evaluate((text, scope) => [...document.querySelectorAll(`${scope} button`)].find((el) => el.textContent.trim() === text).click(), text, scope);
  };
  await page.click('button[aria-label="Capture"]');
  await clickButton('Print');
  await page.waitForSelector('dialog[open]');
  await page.waitForSelector('dialog img');
  await page.waitForFunction(() => document.querySelector('dialog img')?.naturalWidth > 0);
  assert.equal(await page.$eval('dialog img', (img) => img.alt), 'All selected print sheets stacked in alignment');
  assert.ok(await page.$eval('dialog img', (img) => img.naturalWidth <= 238), 'Fit preview should be filtered to display resolution');
  await page.screenshot({ path: path.join(output, 'print-dialog.png') });
  const overlayUrl = await page.$eval('dialog img', (img) => img.dataset.printSource);
  const previewSelect = (await page.$$('dialog select'))[3];
  await previewSelect.select('1');
  await page.waitForFunction(() => document.querySelector('dialog img')?.alt.includes('Rings'));
  assert.notEqual(await page.$eval('dialog img', (img) => img.dataset.printSource), overlayUrl);
  await previewSelect.select('');
  await page.waitForSelector('dialog img');
  assert.equal(await page.$eval('dialog img', (img) => img.dataset.printSource), overlayUrl, 'Switching preview mode should reuse the rendered sheets');
  await clickButton('Enlarge', 'dialog');
  await page.waitForFunction(() => document.querySelector('dialog img')?.naturalHeight >= 440);
  await page.screenshot({ path: path.join(output, 'print-overlay-expanded.png') });
  await clickButton('100%', 'dialog');
  await page.waitForFunction(() => document.querySelector('dialog img')?.naturalWidth === 2480);
  assert.equal(await page.$eval('dialog img', (img) => img.clientWidth), 2480);
  assert.ok(await page.$eval('dialog img', (img) => img.parentElement.scrollLeft > 0), 'Detail view should begin at the drawing center');
  await page.keyboard.press('Escape');
  assert.ok(await page.$('dialog[open]'), 'Escape from enlarged preview should return to print settings');
  // Deselecting the displayed sheet must update the combined proof as well.
  const layerCheckboxes = await page.$$('dialog label input[type="checkbox"]');
  await layerCheckboxes.at(-1).click();
  await page.waitForFunction((old) => document.querySelector('dialog img')?.dataset.printSource && document.querySelector('dialog img').dataset.printSource !== old, {}, overlayUrl);
  const singleUrl = await page.$eval('dialog img', (img) => img.dataset.printSource);
  await layerCheckboxes.at(-1).click();
  await page.waitForFunction((old) => document.querySelector('dialog img')?.dataset.printSource && document.querySelector('dialog img').dataset.printSource !== old, {}, singleUrl);
  await page.select('dialog select', 'letter');
  const orientation = (await page.$$('dialog select'))[1];
  await orientation.select('landscape');
  await page.waitForSelector('dialog img');
  const paperRatio = await page.$eval('dialog img', (img) => img.clientWidth / img.clientHeight);
  assert.ok(Math.abs(paperRatio - 279.4 / 215.9) < .02, 'Landscape preview distorted the paper');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.screenshot({ path: path.join(output, 'print-mobile.png') });
  assert.equal(await page.$eval('dialog', (d) => d.scrollWidth <= d.clientWidth), true, 'Print dialog overflows a narrow screen');
  await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
  const sceneBefore = await page.evaluate(async () => {
    const { useProjectStore } = await import('/src/store/project.ts');
    const s = useProjectStore.getState();
    return JSON.stringify({ layers: s.layers, camera: s.camera, view: s.view, documentRevision: s.documentRevision });
  });
  // Oversized output is actionable and cannot silently downsample.
  await page.select('dialog select', 'a4');
  await orientation.select('portrait');
  const selects = await page.$$('dialog select');
  await selects[2].select('600');
  await page.waitForFunction(() => document.querySelector('dialog [role="alert"]')?.textContent.includes('too large'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('dialog button')].find((el) => el.textContent.trim().startsWith('Export ')).disabled), true);
  await selects[2].select('150');
  await page.select('dialog select', 'a5');
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output });
  await clickButton('Export 2 layers', 'dialog');
  await page.waitForFunction(() => document.querySelector('dialog [role="status"]')?.textContent.includes('Saved'));
  await page.waitForFunction(() => !!document.querySelector('dialog a[download]'));
  const downloaded = path.join(output, 'moire-print-a5-150dpi.zip');
  for (let i = 0; i < 100 && !fs.existsSync(downloaded); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(fs.existsSync(downloaded), 'Print button did not download its ZIP');
  execFileSync('unzip', ['-t', downloaded]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog'));
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some((el) => el.textContent.trim() === 'Save frame')), 'Escape must return to Capture');
  const sceneAfter = await page.evaluate(async () => {
    const { useProjectStore } = await import('/src/store/project.ts');
    const s = useProjectStore.getState();
    return JSON.stringify({ layers: s.layers, camera: s.camera, view: s.view, documentRevision: s.documentRevision });
  });
  assert.equal(sceneAfter, sceneBefore);
  assert.deepEqual(errors, []);
  console.log(`PASS print modal, size validation, real ZIP download, Escape back to Capture; evidence ${output}`);
} finally {
  await browser.close(); await server.close();
}
