import assert from 'node:assert/strict';
import {
  createAnimator, createTiming, detachTiming, motionSpan, sampleAnimator, sampleMotion,
  type Animator, type MotionDoc,
} from './motion.ts';

const doc = (...animators: Animator[]): MotionDoc => ({ timings: [], animators, playOnLoad: false });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

const once = createAnimator('value', { from: 2, to: 6, period: 1, mode: 'once', ease: 'linear', hold: true });
near(sampleMotion(doc(once), 0.5).get('value')!, 4);
near(sampleMotion(doc(once), 4).get('value')!, 6);
assert.equal(sampleMotion(doc(once), 4, { releaseFinished: true }).size, 0);
near(sampleMotion(doc(once), 0).get('value')!, 2);

const shared = createTiming({ delay: 3, period: 7, mode: 'once', ease: 'out' });
const linked = createAnimator('value', { timing: shared.id });
const detached = detachTiming(linked, [shared]);
assert.equal(detached.timing, null);
for (const t of [0, 3, 4.5, 7, 10, 20]) near(sampleAnimator(detached, [], t), sampleAnimator(linked, [shared], t));

assert.deepEqual(motionSpan(doc()), { end: 6, seamless: false, empty: true });
assert.equal(motionSpan(doc(createAnimator('value', { from: 3, to: 3 }))).empty, true);
assert.equal(motionSpan(doc(createAnimator('value', { mode: 'loop' }))).seamless, false);
assert.equal(motionSpan(doc(createAnimator('rotation', { from: 0, to: 360, mode: 'loop' })), () => 360).seamless, true);
assert.equal(motionSpan(doc(createAnimator('rotation', { from: 0, to: 350, mode: 'loop' })), () => 360).seamless, false);
assert.equal(motionSpan(doc(createAnimator('rotation', { from: 10, to: -710, mode: 'loop' })), () => 360).seamless, true);
assert.deepEqual(motionSpan(doc(
  createAnimator('a', { period: 1.5 }), createAnimator('b', { period: 2 }),
)), { end: 12, seamless: true, empty: false });
assert.equal(motionSpan(doc(createAnimator('value', { delay: 1 }))).seamless, false);
assert.equal(motionSpan(doc(createAnimator('value', { period: 1.003 }))).seamless, false);
near(motionSpan(doc(createAnimator('value', { period: 1.003 }))).end, 2.006);
assert.deepEqual(motionSpan(doc(
  createAnimator('a', { mode: 'loop', period: 7 }),
  createAnimator('b', { mode: 'loop', period: 11 }),
  createAnimator('c', { mode: 'once', period: 50 }),
)), { end: 50, seamless: false, empty: false });
assert.equal(motionSpan(doc(
  createAnimator('a', { mode: 'loop', period: 7 }),
  createAnimator('b', { mode: 'loop', period: 11 }),
  createAnimator('c', { period: 50 }),
)).end, 100);
assert.equal(motionSpan(doc(
  createAnimator('a', { mode: 'once', delay: 50, period: 2 }),
  createAnimator('b', { period: 7 }),
)).end, 52);

console.log('motion: deterministic endpoints, held tracks, schedule detachment and loop ranges passed');
