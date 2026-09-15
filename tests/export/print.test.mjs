import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { loadTs } from './load-ts.mjs';

const format = loadTs('../../src/gpu/printFormat.ts', {}, { TextEncoder });
const { DEFAULT_PRINT, printLayout, pngWithDpi, printZip, printFilename, crc32 } = format;

test('paper dimensions retain millimetres and exact odd pixel dimensions', () => {
  const a4 = printLayout(DEFAULT_PRINT);
  assert.equal(a4.width, 2480); assert.equal(a4.height, 3508);
  const letter = printLayout({ ...DEFAULT_PRINT, paper: 'letter', dpi: 150, landscape: true });
  assert.equal(letter.width, 1650); assert.equal(letter.height, 1275);
  assert.equal(letter.widthMm, 279.4); assert.equal(letter.heightMm, 215.9);
  assert.equal(a4.artWidth + 2 * a4.inset, a4.width);
  assert.equal(a4.artHeight + 2 * a4.inset, a4.height);
  assert.equal(printLayout({ ...DEFAULT_PRINT, paper: 'a3' }).width, 3508);
});

test('invalid print sizes fail instead of silently changing the physical scale', () => {
  for (const patch of [
    { dpi: 600 }, { dpi: NaN }, { margin: NaN }, { margin: -1 }, { margin: 105 },
    { marks: true, margin: 5 }, { paper: 'custom', customWidth: 0 },
    { paper: 'custom', customHeight: Infinity }, { paper: 'custom', customWidth: 1000 },
    { paper: 'unknown' },
  ]) assert.throws(() => printLayout({ ...DEFAULT_PRINT, ...patch }));
  assert.equal(printLayout({ ...DEFAULT_PRINT, paper: 'a5', dpi: 600 }).width, 3496);
});

function chunks(bytes) {
  const result = [];
  for (let at = 8; at < bytes.length;) {
    const n = bytes.readUInt32BE(at);
    const type = bytes.toString('ascii', at + 4, at + 8);
    assert.equal(crc32(bytes.subarray(at + 4, at + 8 + n)), bytes.readUInt32BE(at + 8 + n), `${type} CRC`);
    result.push({ type, data: bytes.subarray(at + 8, at + 8 + n) });
    at += n + 12;
  }
  return result;
}

test('PNG embeds selected DPI with valid CRCs and unchanged transparent pixels', async () => {
  const png = new PNG({ width: 3, height: 2 });
  png.data.set([255, 60, 20, 128, 255, 255, 255, 255, 0, 0, 0, 0]);
  const original = PNG.sync.write(png);
  const once = await pngWithDpi(new Blob([original]), 300);
  const twice = await pngWithDpi(once, 150);
  const bytes = Buffer.from(await twice.arrayBuffer());
  const physical = chunks(bytes).filter((c) => c.type === 'pHYs');
  assert.equal(physical.length, 1);
  assert.equal(physical[0].data.readUInt32BE(0), 5906);
  assert.equal(physical[0].data.readUInt32BE(4), 5906);
  assert.equal(physical[0].data[8], 1);
  assert.deepEqual(PNG.sync.read(bytes).data, png.data);
  await assert.rejects(pngWithDpi(new Blob(['invalid']), 300), /encode/);
});

test('ZIP contains independent PNGs with safe unique names, exact bytes, and valid directory', async () => {
  const files = [0, 1].map((i) => ({ name: printFilename(i, '../Layer: one/\\'), blob: new Blob([`payload ${i}`]) }));
  const bytes = Buffer.from(await (await printZip(files)).arrayBuffer());
  let at = 0;
  for (const file of files) {
    assert.equal(bytes.readUInt32LE(at), 0x04034b50);
    const size = bytes.readUInt32LE(at + 18);
    const nameLength = bytes.readUInt16LE(at + 26);
    assert.equal(bytes.toString('utf8', at + 30, at + 30 + nameLength), file.name);
    const payload = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    assert.equal(crc32(payload), bytes.readUInt32LE(at + 14));
    assert.equal(payload.toString(), await file.blob.text());
    at += 30 + nameLength + size;
  }
  assert.equal(bytes.readUInt32LE(at), 0x02014b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 6), at);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), 2);
  assert.equal(files[0].name, '01-Layer-one.png');
  assert.equal(files[1].name, '02-Layer-one.png');
});

function service(failure) {
  const calls = []; let disposed = 0; let removed = 0;
  class Renderer {
    constructor(options) { assert.equal(options.print, true); }
    async mount() { if (failure === 'mount') throw new Error('mount failed'); }
    sync(state) { calls.push(state); }
    async snapshotWith(opts, read) {
      if (failure === 'render') throw new Error('render failed');
      assert.ok(opts.size.width > 0); read({});
    }
    dispose() { disposed++; }
  }
  const document = {
    body: { appendChild() {} },
    createElement: (tag) => tag === 'div' ? { style: {}, setAttribute() {}, remove: () => { removed++; } } : {
      getContext: () => ({ clearRect() {}, drawImage() {} }),
      toBlob: (fn) => fn(failure === 'encode' ? null : new Blob(['png'])),
    },
  };
  const module = loadTs('../../src/gpu/print.ts', { './renderer': { MoireRenderer: Renderer }, './printFormat': { ...format, pngWithDpi: async (b) => b } }, { document });
  return { ...module, calls, disposed: () => disposed, removed: () => removed };
}

const source = {
  framing: { width: 640, height: 480 },
  state: { camera: { zoom: 1, pan: { x: 2, y: 3 } }, backgroundColor: '#abcdab', view: { envelope: true, ratio: true, envelopeContours: true },
    layers: [{ id: 'a', name: 'A', visible: true, color: '#ff0000', position: { x: 5, y: 7 } }, { id: 'b', name: 'B', visible: false, color: '#ffffff' }] },
};

test('print exports selected hidden layers with the shared pose without modifying the source', async () => {
  const h = service(); const before = structuredClone(source);
  const files = await h.renderPrintSheets(source, DEFAULT_PRINT, ['b', 'a']);
  assert.equal(files.length, 2); assert.equal(files[0].name, '01-A.png');
  assert.deepEqual(source, before);
  assert.equal(h.calls[0].layers[0].id, 'print-a');
  assert.equal(h.calls[1].layers[0].visible, true);
  assert.equal(h.calls[1].layers[0].color, '#ffffff');
  assert.equal(h.calls[0].camera, source.state.camera);
  assert.equal(h.calls[0].view.envelope, false);
  assert.equal(h.calls[0].view.ratio, false);
  assert.equal(h.disposed(), 1); assert.equal(h.removed(), 1);
});

test('failed and cancelled print jobs always release their isolated renderer', async () => {
  for (const failure of ['mount', 'render', 'encode']) {
    const h = service(failure);
    await assert.rejects(h.renderPrintSheets(source, DEFAULT_PRINT, ['a']));
    assert.equal(h.disposed(), 1); assert.equal(h.removed(), 1);
  }
  const h = service(); const controller = new AbortController();
  await assert.rejects(h.renderPrintSheets(source, DEFAULT_PRINT, ['a', 'b'], {
    signal: controller.signal, progress: (p) => { if (p.done === 1) controller.abort(); },
  }), /abort/i);
  assert.equal(h.calls.length, 1); assert.equal(h.disposed(), 1); assert.equal(h.removed(), 1);
});
