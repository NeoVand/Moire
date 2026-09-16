import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const resampling = loadTs('../../src/gpu/printResample.ts', {}, { setTimeout });

function harness({ mismatch = false, failEncode = false, cancelOnDecode } = {}) {
  const images = [], draws = [], renders = [];
  const files = [{ blob: new Blob(['a']) }, { blob: new Blob(['b']) }];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: (image, ...args) => draws.push({ id: image.id, args, width: canvas.width, height: canvas.height }) }),
    toBlob: (fn) => fn(failEncode ? null : new Blob(['stack'])),
  };
  const api = loadTs('../../src/gpu/printPreview.ts', {
    './print': { renderPrintSheets: async (...args) => { renders.push(args); return files; } },
    './printResample': resampling,
  }, {
    document: { createElement: () => canvas },
    createImageBitmap: async (blob) => {
      const image = { id: await blob.text(), width: mismatch && images.length ? 50 : 2480, height: 3508, closed: false, close() { this.closed = true; } };
      images.push(image); cancelOnDecode?.(); return image;
    },
  });
  return { ...api, files, canvas, images, draws, renders };
}

test('overlay stacks the actual print pixels in order before any display resizing', async () => {
  const h = harness();
  const source = { state: { layers: [{ id: 'a' }, { id: 'b' }] } };
  const result = await h.renderPrintPreview(source, { dpi: 300 }, ['b', 'a']);
  assert.equal(result.width, 2480); assert.equal(result.height, 3508);
  assert.deepEqual(h.draws.map((d) => [d.id, ...d.args, d.width, d.height]), [['a', 0, 0, 2480, 3508], ['b', 0, 0, 2480, 3508]]);
  assert.deepEqual(Array.from(result.sheets, (sheet) => sheet.id), ['a', 'b']);
  assert.equal(result.sheets[0].blob, h.files[0].blob);
  assert.equal(h.renders[0][3].preview, undefined, 'Never request individually downsampled sheets');
  assert.ok(h.images.every((image) => image.closed));
  assert.equal(h.canvas.width, 1); assert.equal(h.canvas.height, 1);
});

test('preview filtering attenuates dense carriers equally along axes and diagonals', async () => {
  // Independent oracle: a Gaussian of sigma has sinusoidal frequency response
  // exp(-2 pi^2 sigma^2 f^2), regardless of the carrier's direction.
  const size = 512, target = 96;
  for (const period of [1.8, 4, 12]) for (const angle of [0, Math.PI / 6, Math.PI / 4]) {
    const data = new Uint8ClampedArray(size * size * 4);
    const phase = (x, y) => 2 * Math.PI * (x * Math.cos(angle) + y * Math.sin(angle)) / period;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      data[p] = 255;
      data[p + 3] = 127.5 + 120 * Math.cos(phase((x + .5) * target / size, (y + .5) * target / size));
    }
    const result = await resampling.resamplePrintPixels({ width: size, height: size, data }, target, target);
    const amplitude = 120 * Math.exp(-2 * Math.PI ** 2 * .8 ** 2 / period ** 2);
    let worst = 0;
    for (let y = 5; y < target - 5; y++) for (let x = 5; x < target - 5; x++) {
      const p = (y * target + x) * 4;
      worst = Math.max(worst, Math.abs(result[p + 3] - (127.5 + amplitude * Math.cos(phase(x + .5, y + .5)))));
      assert.equal(result[p], 255, 'Transparent edges must not darken the ink color');
      assert.equal(result[p + 1], 0);
    }
    assert.ok(worst < 1, `period ${period}, angle ${angle}: ${worst} gray levels from independent filter response`);
  }
});

test('resampling yields to cancellation while filtering a large sheet', async () => {
  const controller = new AbortController();
  const pending = resampling.resamplePrintPixels({ width: 500, height: 500, data: new Uint8ClampedArray(500 * 500 * 4) }, 100, 100, controller.signal);
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test('preview failures and cancellation close decoded bitmaps and release the full-size canvas', async () => {
  for (const options of [{ mismatch: true }, { failEncode: true }]) {
    const h = harness(options);
    await assert.rejects(h.stackPrintSheets(h.files));
    assert.ok(h.images.every((image) => image.closed));
    assert.equal(h.canvas.width, 1);
  }
  const controller = new AbortController();
  const h = harness({ cancelOnDecode: () => controller.abort() });
  await assert.rejects(h.stackPrintSheets(h.files, controller.signal), /abort/i);
  assert.equal(h.draws.length, 0);
  assert.equal(h.images.length, 1);
  assert.equal(h.images[0].closed, true);
  assert.equal(h.canvas.width, 1);
  await assert.rejects(h.stackPrintSheets([]), /at least one/);
});
