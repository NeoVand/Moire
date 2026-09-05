import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

function harness() {
  const callbacks = new Map(); let next = 1;
  const { MoireRenderer } = loadTs('../../src/gpu/renderer.ts', {
    'three/webgpu': {}, '../types/moire': { MAX_LAYERS: 12 },
    './composite': { fieldSource: (field) => field?.source ?? '' },
    './typeMorph': { clearLayerMorphs: () => {}, hasLayerMorphs: () => false },
  }, {
    requestAnimationFrame: (f) => { const id = next++; callbacks.set(id, f); return id; },
    cancelAnimationFrame: (id) => callbacks.delete(id),
    window: { devicePixelRatio: 1, setTimeout: () => 1 },
  });
  const r = new MoireRenderer();
  const canvas = { width: 100, height: 100 };
  const container = { clientWidth: 100, clientHeight: 100 };
  let writes = 0; let draws = 0; let ratio = 1;
  Object.assign(r, {
    ready: true, readyAt: performance.now(),
    renderer: { setPixelRatio: (n) => { ratio = n; }, setSize: (w, h) => Object.assign(canvas, { width: w * ratio, height: h * ratio }) },
    scene: {}, camera: {}, canvas, container,
    cameraUniforms: { zoom: { value: 1 }, scale: { value: 1 } },
    lastWidth: 100, lastHeight: 100, lastDpr: 1,
    writeSlots: () => { writes++; }, draw: () => { draws++; }, watchFields: () => {},
  });
  return { r, canvas, container, callbacks, writes: () => writes, draws: () => draws, MoireRenderer };
}

function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

test('concurrent snapshots hold their own size until each reader finishes', async () => {
  const { r } = harness(); const opened = deferred(); const release = deferred(); const seen = [];
  const first = r.snapshotWith({ height: 200 }, async (canvas) => {
    seen.push(canvas.width); opened.resolve(); await release.promise; seen.push(canvas.width);
  });
  await opened.promise;
  const second = r.snapshotWith({ height: 300 }, async (canvas) => seen.push(canvas.width));
  await Promise.resolve(); assert.deepEqual(seen, [200]);
  release.resolve(); await first; await second;
  assert.deepEqual(seen, [200, 200, 300]);
});

test('display sync, render and resize wait until a frame is consumed', async () => {
  const h = harness(); const opened = deferred(); const release = deferred();
  const frame = h.r.snapshotWith({ height: 200 }, async () => { opened.resolve(); await release.promise; });
  await opened.promise;
  const before = h.writes();
  h.r.sync({ layers: [] }); h.r.render();
  h.container.clientWidth = 300; h.container.clientHeight = 150; h.r.resize();
  assert.equal(h.writes(), before); assert.equal(h.callbacks.size, 0);
  assert.equal(h.canvas.width, 200); assert.equal(h.canvas.height, 200);
  release.resolve(); await frame;
  assert.equal(h.canvas.width, 300); assert.equal(h.canvas.height, 150);
  assert.ok(h.writes() > before);
});

test('failed readers release the capture lock and restore the display', async () => {
  const { r, canvas } = harness();
  await assert.rejects(r.snapshotWith({ height: 200 }, async () => { throw Error('reader'); }), /reader/);
  assert.equal(canvas.width, 100); assert.equal(r.capturing, false);
  await r.snapshotWith({ height: 300 }, (c) => assert.equal(c.width, 300));
});

test('still capture settles queued expression edits before reading', async () => {
  const { r } = harness(); let settled = false;
  r.settle = async () => { settled = true; };
  await r.snapshotWith({}, () => assert.equal(settled, true));
});

test('frozen framing keeps world extent unchanged after a window resize', () => {
  const { r } = harness();
  const opts = { height: 200, aspect: 1, framing: { width: 100, height: 100 } };
  const before = r.exportFrame(opts);
  r.lastWidth = 300; r.lastHeight = 150;
  const after = r.exportFrame(opts);
  assert.equal(before.zScale, after.zScale);
  assert.equal(after.zScale, 2);
});

test('uniform-only animation does not dispose image field textures', () => {
  const { r, MoireRenderer } = harness(); let disposed = 0;
  Object.assign(r, {
    lastState: { layers: [{ field: { source: 'image:one' } }] },
    slotCount: 1, fieldSources: ['image:one'],
    imageFields: new Map([['image:one', { texture: { dispose: () => disposed++ } }]]),
  });
  MoireRenderer.prototype.watchFields.call(r);
  assert.equal(disposed, 0); assert.equal(r.imageFields.size, 1);
});

test('every live view keeps full resolution and its resting solver during slow interaction', () => {
  for (const view of [{}, { envelope: true }, { ratio: true }, { envelopeContours: true }]) {
    const { r, canvas } = harness();
    r.lastState = { view }; r.viewUniforms = { stream: { value: 1 } };
    r.readyAt = -1000; r.held = true; r.fullCost = 200;
    r.render();
    assert.equal(r.scale, 1); assert.equal(canvas.width, 100);
    assert.equal(r.viewUniforms.stream.value, 0);
  }
});

test('a stale reduced buffer is restored before drawing a changed view', () => {
  const { r, canvas } = harness();
  r.scale = .35; canvas.width = 35; canvas.height = 35;
  r.held = true; r.readyAt = -1000;
  r.sync({ layers: [], view: { envelope: true } });
  assert.equal(r.scale, 1); assert.equal(canvas.width, 100);
  r.render(); assert.equal(r.scale, 1);
});
