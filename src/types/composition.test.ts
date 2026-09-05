import assert from 'node:assert/strict';
import { composeLoop, loopIssues } from './composition.ts';
import { createAnimator, MOTION_NONE, sampleAnimator, type MotionDoc } from './motion.ts';

const motion: MotionDoc = { ...MOTION_NONE, animators: [
  createAnimator('layer.a.rotation', { id: 'a', from: 0, to: 20, period: 2 }),
  createAnimator('layer.b.rotation', { id: 'b', from: 0, to: 30, period: 3 }),
] };
assert.equal(loopIssues(motion, 0, 12).length, 0);
assert.equal(loopIssues(motion, 0, 6).length, 1);
assert.equal(loopIssues(motion, 0, 6)[0].id, 'a');
assert.equal(loopIssues(motion, 1, 13).length, 0);
const once = { ...motion, animators: [createAnimator('x', { mode: 'once', period: 2, from: 0, to: 10 })] };
assert.equal(loopIssues(once, 0, 2).length, 1);
assert.equal(loopIssues(once, 3, 7).length, 0);
const delay = { ...motion, animators: [{ ...motion.animators[0], delay: 2 }] };
assert.equal(loopIssues(delay, 0, 4).length, 1);
assert.equal(loopIssues(delay, 2, 6).length, 0);
const reset = { ...motion, animators: [{ ...motion.animators[0], mode: 'loop' as const }] };
assert.equal(loopIssues(reset, 0, 4).length, 1);
const rotation = { ...reset, animators: [{ ...reset.animators[0], from: 0, to: 360 }] };
assert.equal(loopIssues(rotation, 0, 4, () => 360).length, 0);
assert.equal(loopIssues(rotation, 0, 3, () => 360).length, 1);
assert.equal(loopIssues({ ...rotation, animators: [{ ...rotation.animators[0], to: 180 }] }, 0, 4, () => 360).length, 1);
const joined = composeLoop(motion, ['a', 'b'], 1, 5);
assert.equal(loopIssues(joined, 1, 6).length, 0);
for (const a of joined.animators) {
  assert.equal(sampleAnimator(a, joined.timings, 1), sampleAnimator(a, joined.timings, 6));
  assert.equal(a.from, motion.animators.find((b) => b.id === a.id)?.from);
  assert.equal(a.to, motion.animators.find((b) => b.id === a.id)?.to);
}
assert.equal(composeLoop(motion, ['a'], 0, 5).animators[1], motion.animators[1]);
assert.equal(composeLoop(motion, ['a'], 0, NaN), motion);
console.log('Composition: mixed cycles, delayed and completed tracks, explicit synchronization passed.');
