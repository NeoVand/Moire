import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

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
