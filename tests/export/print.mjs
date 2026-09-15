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

  const clickButton = async (text, scope = '') => {
    await page.waitForFunction((text, scope) => [...document.querySelectorAll(`${scope} button`)].some((el) => el.textContent.trim() === text), {}, text, scope);
    await page.evaluate((text, scope) => [...document.querySelectorAll(`${scope} button`)].find((el) => el.textContent.trim() === text).click(), text, scope);
  };
  await page.click('button[aria-label="Capture"]');
  await clickButton('Print');
  await page.waitForSelector('dialog[open]');
  await page.waitForSelector('dialog img');
  await page.screenshot({ path: path.join(output, 'print-dialog.png') });
  await page.select('dialog select', 'letter');
  const orientation = (await page.$$('dialog select'))[1];
  await orientation.select('landscape');
  await page.waitForSelector('dialog img');
  const paperRatio = await page.$eval('dialog img', (img) => img.parentElement.clientWidth / img.parentElement.clientHeight);
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
