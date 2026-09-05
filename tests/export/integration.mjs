/** Real WebGPU + browser encoder regression. Uses a fresh browser profile.
 * node tests/export/integration.mjs
 * Requires Chrome and ffprobe (same Chrome path as the existing zoo).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { cases } from '../zoo/scenes.mjs';
import { cases as imageCases } from '../../paper/tools/exp/inverse-scenes.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'moire-export-test-'));
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5196, host: '127.0.0.1', strictPort: false, hmr: false }, logLevel: 'silent' });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', (error) => console.error('browser:', error.message));
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?zoo`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__zoo?.info() !== null && window.__zoo?.info() !== undefined);
  const result = await page.evaluate(async ({ lineScene, imageScene }) => {
    const { recordFrames } = await import('/src/gpu/recorder.ts');
    const { captureWith, captureSettle } = await import('/src/gpu/capture.ts');
    const { videoSink, encodable } = await import('/src/gpu/video.ts');
    const { useProjectStore } = await import('/src/store/project.ts');
    const { useTransportStore, applyMotionAt } = await import('/src/store/transport.ts');
    const { createAnimator } = await import('/src/types/motion.ts');
    const digest = async (canvas) => {
      const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
      const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
      const bytes = ctx.getImageData(0, 0, copy.width, copy.height).data;
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    };
    const checks = [];
    for (const [label, scene, path, from, to] of [
      ['lines', lineScene, `layer.${lineScene.layers[1].id}.rotation`, 4, 8],
      ['image field', imageScene, `layer.${imageScene.layers[1].id}.field.amount`, .2, .5],
    ]) {
      window.__zoo.load(JSON.stringify(scene));
      useTransportStore.getState().pause();
      const animator = createAnimator(path, { from, to, period: .43, mode: 'once', ease: 'linear' });
      useProjectStore.getState().setMotion({ animators: [animator], timings: [], playOnLoad: false });
      await captureSettle();
      const sequences = [];
      for (let take = 0; take < 2; take++) {
        const hashes = [];
        await recordFrames({ t0: 0, t1: 1, fps: 12, aspect: 4 / 3, height: 240 }, {
          frame: async (_, frame) => hashes.push(await digest(await frame.canvas())),
        });
        sequences.push(hashes);
      }
      applyMotionAt(1);
      const terminal = await captureWith({ aspect: 4 / 3, height: 240 }, digest);
      checks.push({ label, identical: JSON.stringify(sequences[0]) === JSON.stringify(sequences[1]), frames: sequences[0].length, distinct: new Set(sequences[0]).size, endpoint: sequences[0].at(-1) === terminal });
    }
    window.__zoo.load(JSON.stringify(lineScene));
    useTransportStore.getState().pause();
    useProjectStore.getState().setMotion({ animators: [createAnimator(`layer.${lineScene.layers[1].id}.rotation`, { from: 4, to: 8, period: 1, mode: 'bounce', ease: 'linear' })], timings: [], playOnLoad: false });
    const videos = [];
    for (const format of ['mp4', 'webm']) {
      if (!(await encodable(format, 320, 240, 12))) { videos.push({ format, unsupported: true }); continue; }
      const sink = videoSink({ format, width: 320, height: 240, fps: 12 });
      const recorded = await recordFrames({ t0: 0, t1: 1, fps: 12, aspect: 4 / 3, height: 240 }, sink);
      const blob = sink.result();
      videos.push({ format, frames: recorded.frames, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
    }
    return { backend: window.__zoo.info().backend, checks, videos };
  }, { lineScene: cases.find(c => c.name === 'lines-pair').scene, imageScene: imageCases.find(c => c.name === 'inverse-aligned').scene });
  assert.equal(result.backend, 'webgpu');
  for (const check of result.checks) {
    assert.equal(check.frames, 12); assert.equal(check.identical, true, `${check.label}: repeatability`);
    assert.equal(check.endpoint, true, `${check.label}: once endpoint`);
    assert.ok(check.distinct > 1, `${check.label}: actually animated`);
    console.log(`PASS ${check.label}: 12 repeatable frames, ${check.distinct} distinct poses, exact once endpoint`);
  }
  let encoded = 0;
  for (const video of result.videos) {
    if (video.unsupported) { console.log(`SKIP ${video.format}: browser codec unsupported`); continue; }
    encoded++;
    const file = path.join(temporary, `take.${video.format}`); fs.writeFileSync(file, new Uint8Array(video.bytes));
    const metadata = JSON.parse(execFileSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,r_frame_rate:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
    const stream = metadata.streams[0];
    assert.equal(Number(stream.nb_read_frames), 12); assert.equal(stream.width, 320); assert.equal(stream.height, 240);
    assert.equal(stream.r_frame_rate, '12/1'); assert.ok(Math.abs(Number(metadata.format.duration) - 1) < .01);
    console.log(`PASS ${video.format}: ${stream.codec_name}, 320×240, 12 decoded frames, 12 fps, ${metadata.format.duration}s (${video.bytes.length} bytes)`);
  }
  assert.ok(encoded > 0, 'No video codec available for end-to-end validation');
} finally {
  await browser.close(); await server.close(); fs.rmSync(temporary, { recursive: true, force: true });
}
