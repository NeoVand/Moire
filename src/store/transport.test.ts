import assert from 'node:assert/strict';
import { createAnimator, createTiming, sampleAnimator, type Animator } from '../types/motion';
import { readParam } from './params';
import { sceneOf, useProjectStore as project } from './project';
import { applyMotionAt, startTransport, stopTransport, useTransportStore as transport } from './transport';

const path = 'view.envelopeContrast';
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const install = (animator: Animator) => {
  project.getState().resetProject();
  project.getState().setMotion({ timings: [], animators: [animator], playOnLoad: false });
};
let callback: FrameRequestCallback | undefined;
globalThis.requestAnimationFrame = (fn) => { callback = fn; return 1; };
globalThis.cancelAnimationFrame = () => { callback = undefined; };
let now = 1000;
const tick = (dt = 100) => { now += dt; callback?.(now); };
startTransport();
tick();

const once = createAnimator(path, { from: 1, to: 5, period: 1, mode: 'once', ease: 'linear', hold: true });
install(once);
transport.getState().seek(0.5);
near(readParam(path)!, 3);
transport.getState().seek(4);
near(readParam(path)!, 5);
transport.getState().seek(0.25);
near(readParam(path)!, 2);
transport.getState().stop();
near(readParam(path)!, 1);
tick(); tick();
near(readParam(path)!, 1);
assert.equal(transport.getState().t, 0);

transport.getState().play();
tick(250);
near(readParam(path)!, 2);
project.getState().selectLayer(project.getState().layers[1].id);
assert.equal(transport.getState().state, 'playing');
for (let i = 0; i < 4; i++) tick(250);
near(readParam(path)!, 5);
assert.equal(transport.getState().state, 'paused');
near(transport.getState().t, 1);
transport.getState().play();
near(transport.getState().t, 0);
near(readParam(path)!, 1);
transport.getState().seek(1);
transport.getState().pause();
tick();
near(readParam(path)!, 5);

transport.getState().previewRange(0.25, 0.5, false);
tick(250);
near(transport.getState().t, 0.5);
near(readParam(path)!, 3);
assert.equal(transport.getState().state, 'paused');
transport.getState().previewRange(0.25, 0.5, true);
tick(250);
near(transport.getState().t, 0.25);
near(readParam(path)!, 2);
assert.equal(transport.getState().state, 'playing');
transport.getState().seek(0.75);
assert.equal(transport.getState().range, null);
transport.getState().pause();
transport.getState().previewRange(0.25, 1, false, true);
near(transport.getState().t, 0.75);
near(readParam(path)!, 4);
tick(250);
assert.equal(transport.getState().state, 'paused');
transport.getState().previewRange(0.25, 1, false, true);
near(transport.getState().t, 0.25);

const cyclic = createAnimator(path, { from: 1, to: 5, period: 2, mode: 'bounce', phase: 0.25, ease: 'linear' });
install(cyclic);
project.getState().setView({ envelopeContrast: 4 });
let writes = 0;
const unsub = project.subscribe(() => writes++);
const scene = sceneOf();
near(readParam(path)!, 4);
near(scene.view.envelopeContrast!, sampleAnimator(cyclic, [], 0));
assert.equal(writes, 0);
unsub();

const saved = structuredClone(project.getState().motion);
project.getState().setMotion({ animators: [createAnimator(path, { from: 10, to: 20 })] });
transport.setState({ muted: [cyclic.id], solo: 'different' });
applyMotionAt(0, { motion: saved, muted: [], solo: null });
near(readParam(path)!, 3);

transport.setState({ t: 9, state: 'playing', muted: ['old'], solo: 'old' });
project.getState().loadScene(scene);
assert.equal(transport.getState().state, 'stopped');
assert.equal(transport.getState().t, 0);
assert.deepEqual(transport.getState().muted, []);
assert.equal(transport.getState().solo, null);
transport.setState({ muted: ['old'], solo: 'old' });
project.getState().resetProject();
assert.deepEqual(transport.getState().muted, []);
assert.equal(transport.getState().solo, null);
transport.getState().play();
assert.equal(transport.getState().state, 'stopped');

const timing = createTiming({ period: 11, delay: 4, mode: 'once', ease: 'out' });
const linked = createAnimator(path, { timing: timing.id });
project.getState().setMotion({ timings: [timing], animators: [linked] });
project.getState().removeTiming(timing.id);
const result = project.getState().motion.animators[0];
for (const time of [0, 4, 7, 15, 20]) near(sampleAnimator(result, [], time), sampleAnimator(linked, [timing], time));

// A costly frame must not change the duration of an authored motion.
const slowFrameMotion = createAnimator(path, { from: 1, to: 5, period: 2, mode: 'once', ease: 'linear' });
install(slowFrameMotion);
transport.getState().play();
tick(500);
near(transport.getState().t, 0.5);
near(readParam(path)!, 2);
tick(500);
near(transport.getState().t, 1);
near(readParam(path)!, 3);
tick(1500);
near(transport.getState().t, 2);
near(readParam(path)!, 5);
assert.equal(transport.getState().state, 'paused');

// With another track still moving, a delayed frame must also settle a completed
// Once exactly, even when no display callback landed on its terminal timestamp.
install(once);
const endless = createAnimator('view.envelopeLift', { from: 0, to: 0.4, period: 2, mode: 'bounce', ease: 'linear' });
project.getState().setMotion({ animators: [once, endless] });
transport.getState().play();
tick(1500);
near(transport.getState().t, 1.5);
near(readParam(path)!, 5);
assert.equal(transport.getState().state, 'playing');

// A single delayed frame can cross more than one preview cycle. Keep the
// remainder, rather than restarting the range or discarding the extra time.
transport.getState().previewRange(0.25, 0.75, true);
tick(1250);
near(transport.getState().t, 0.5);
near(readParam(path)!, 3);
assert.equal(transport.getState().state, 'playing');
tick(500);
near(transport.getState().t, 0.5);
transport.getState().previewRange(0.25, 0.75, false);
tick(1250);
near(transport.getState().t, 0.75);
near(readParam(path)!, 4);
assert.equal(transport.getState().state, 'paused');

// Elapsed time while paused, held by an edit, or owned by the recorder still
// does not accumulate into a jump when playback resumes.
install(cyclic);
transport.getState().play();
tick(500);
near(transport.getState().t, 0.5);
transport.getState().pause();
tick(3000);
transport.getState().play();
tick(500);
near(transport.getState().t, 1);
transport.getState().setInteracting(true);
tick(3000);
transport.getState().setInteracting(false);
tick(500);
near(transport.getState().t, 1.5);
transport.getState().setRecording(true);
tick(3000);
transport.getState().setRecording(false);
tick(500);
near(transport.getState().t, 2);
tick(-50);
near(transport.getState().t, 2);

stopTransport();
console.log('transport: seek/play/pause/stop, range preview, slow-frame timing, persistence purity, frozen sampling and project reset passed');
