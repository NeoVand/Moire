import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

function harness(fail = '') {
  const events = [];
  class BufferTarget { buffer = new Uint8Array([1, 2, 3]).buffer; }
  class Output {
    constructor(opts) { if (fail === 'construct') throw Error('no encoder'); this.target = opts.target; }
    addVideoTrack() {}
    async start() { events.push('start'); if (fail === 'start') throw Error('start failed'); }
    async finalize() { events.push('finalize'); if (fail === 'finalize') throw Error('flush failed'); }
    async cancel() { events.push('cancel'); }
  }
  class CanvasSource { async add(t, d) { events.push([t, d]); } }
  const module = loadTs('../../src/gpu/video.ts', {
    mediabunny: { BufferTarget, Output, CanvasSource, Mp4OutputFormat: class {}, WebMOutputFormat: class {}, QUALITY_HIGH: 1, canEncodeVideo: async () => true },
  }, { document: { createElement: () => ({ getContext: () => ({ drawImage() {}, fillRect() {} }) }) } });
  return { ...module, events };
}
const opts = { format: 'mp4', width: 1280, height: 720, fps: 30 };

test('codec setup failures resolve unsupported rather than reject the format check', async () => {
  const h = harness('construct'); const formats = await h.encodableFormats(720, 16 / 9, 30);
  assert.equal(formats.size, 0);
});

test('video timestamps and durations use the chosen frame rate', async () => {
  const h = harness(); const sink = h.videoSink(opts);
  for (let n = 0; n < 3; n++) await sink.frame(n, { canvas: async () => ({}) });
  await sink.close(true);
  assert.deepEqual(h.events.filter(Array.isArray), [[0, 1 / 30], [1 / 30, 1 / 30], [2 / 30, 1 / 30]]);
  assert.equal(sink.result().type, 'video/mp4');
});

test('a failed finalization cancels the encoder and retains the original error', async () => {
  const h = harness('finalize'); const sink = h.videoSink(opts);
  await sink.frame(0, { canvas: async () => ({}) });
  await assert.rejects(sink.close(true), /flush failed/);
  assert.equal(h.events.at(-1), 'cancel'); assert.equal(sink.result(), null);
});

test('an encoder whose start fails is still cancelled during cleanup', async () => {
  const h = harness('start'); const sink = h.videoSink(opts);
  await assert.rejects(sink.frame(0, { canvas: async () => ({}) }), /start failed/);
  await sink.close(false); assert.equal(h.events.at(-1), 'cancel');
});
