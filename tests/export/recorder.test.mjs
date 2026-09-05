import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

function harness() {
  const state = { state: 'playing', t: 5, recording: false, muted: [], solo: null };
  let value = 17;
  const motion = { animators: [{ path: 'x', to: 10 }] };
  const events = [];
  const capture = {
    captureSettle: async () => {},
    captureSize: () => ({ width: 100, height: 50 }),
    captureWith: async (opts, read) => { events.push(['capture', opts]); return read({}); },
  };
  const module = loadTs('../../src/gpu/recorder.ts', {
    './capture': capture,
    '../store/params': {
      readParam: () => value,
      applyParams: (params) => {
        value = params.get('x');
        // The real transport pauses Play when a hand writes the project.
        if (state.state === 'playing' && !state.recording) state.state = 'paused';
      },
    },
    '../store/project': { useProjectStore: { getState: () => ({ motion }) } },
    '../store/transport': {
      useTransportStore: { getState: () => state, setState: (patch) => Object.assign(state, patch) },
      applyMotionAt: (t, opts) => { value = t * opts.motion.animators[0].to; events.push(['pose', t, value]); },
    },
  });
  return { ...module, state, capture, events, motion, value: () => value };
}
const range = { t0: 0, t1: 1, fps: 2 };

for (const failure of ['settle', 'frame', 'close']) {
  test(`restores pose and playback after ${failure} failure`, async () => {
    const h = harness();
    let closeOk;
    if (failure === 'settle') h.capture.captureSettle = async () => { throw Error('settle failed'); };
    await assert.rejects(h.recordFrames(range, {
      frame: async () => { if (failure === 'frame') throw Error('frame failed'); },
      close: async (ok) => { closeOk = ok; if (failure === 'close') throw Error('close failed'); },
    }), new RegExp(`${failure} failed`));
    assert.equal(closeOk, failure === 'close');
    assert.equal(h.state.recording, false);
    assert.equal(h.state.state, 'playing');
    assert.equal(h.state.t, 5);
    assert.equal(h.value(), 17);
  });
}

test('keeps the original frame error when cleanup also fails', async () => {
  const h = harness();
  await assert.rejects(h.recordFrames(range, {
    frame: async () => { throw Error('original'); }, close: async () => { throw Error('cleanup'); },
  }), /original/);
  assert.equal(h.state.recording, false);
});

test('records exact times from a frozen motion and viewport, then resumes Play', async () => {
  const h = harness(); const progress = [];
  const result = await h.recordFrames(range, {
    frame: async () => { h.motion.animators[0].to = 99; },
  }, (p) => progress.push(p));
  assert.equal(result.frames, 2);
  assert.equal(result.cancelled, false);
  assert.equal(h.events.filter((e) => e[0] === 'pose')[1][2], 5);
  assert.deepEqual(h.events.filter((e) => e[0] === 'pose').map((e) => e[1]), [0, .5]);
  assert.equal(h.events.find((e) => e[0] === 'capture')[1].framing.width, 100);
  assert.deepEqual(progress.map((p) => p.stage), ['preparing', 'rendering', 'rendering', 'finalizing']);
  assert.equal(h.state.state, 'playing');
  assert.equal(h.value(), 17);
});

test('cancellation closes unsuccessfully and restores the original pose', async () => {
  const h = harness(); const abort = new AbortController(); let ok;
  const result = await h.recordFrames(range, {
    frame: async () => abort.abort(), close: async (value) => { ok = value; },
  }, undefined, abort.signal);
  assert.equal(result.frames, 1); assert.equal(result.cancelled, true);
  assert.equal(ok, false); assert.equal(h.value(), 17); assert.equal(h.state.recording, false);
});

test('refuses concurrent recording and invalid ranges before acquiring resources', async () => {
  const h = harness(); let release;
  h.capture.captureSettle = () => new Promise((r) => { release = r; });
  const first = h.recordFrames(range, { frame: async () => {} });
  await assert.rejects(h.recordFrames(range, { frame: async () => {} }), /already/);
  release(); await first;
  for (const opts of [{ ...range, t1: 0 }, { ...range, t0: 2 }, { ...range, fps: 0 }, { ...range, fps: NaN }]) {
    assert.equal(h.frameCount(opts), 0);
    await assert.rejects(h.recordFrames(opts, { frame: async () => assert.fail('invalid capture') }));
  }
});

test('each image sequence uses its own child folder and aborts a failed write', async () => {
  const h = harness(); const names = []; let aborted = 0;
  const dir = { getDirectoryHandle: async (name) => {
    names.push(name);
    return { getFileHandle: async (frame) => {
      assert.equal(frame, 'frame_000000.png');
      return { createWritable: async () => ({ write: async () => { throw Error('disk full'); }, close: async () => {}, abort: async () => { aborted++; } }) };
    } };
  } };
  for (let i = 0; i < 2; i++) {
    await assert.rejects(h.directorySink(dir).frame(0, { png: async () => new Blob(['frame']) }), /disk full/);
  }
  assert.equal(aborted, 2); assert.notEqual(names[0], names[1]);
  assert.ok(h.frameName(99999) < h.frameName(100000));
});

test('a failed progress observer still closes the sink and releases the recording', async () => {
  const h = harness(); let ok;
  await assert.rejects(h.recordFrames(range, {
    frame: async () => {}, close: async (value) => { ok = value; },
  }, (p) => { if (p.stage === 'finalizing') throw Error('observer failed'); }), /observer failed/);
  assert.equal(ok, false); assert.equal(h.state.recording, false); assert.equal(h.value(), 17);
});

test('cancelling while the video is finalizing discards the result', async () => {
  const h = harness(); const abort = new AbortController();
  const result = await h.recordFrames(range, {
    frame: async () => {}, close: async () => abort.abort(),
  }, undefined, abort.signal);
  assert.equal(result.cancelled, true); assert.equal(h.state.recording, false);
});
