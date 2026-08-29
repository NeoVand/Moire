// Ground truth. Scans every integer index, stride 1, no budget, no window.
//
// The only thing it assumes is the trivial one: shapeRadius(q_n) <= |q_n| <=
// |p| + n * m, so once a ring's inradius clears that by more than the guard, no
// larger index can be within the guard either. That is a termination test, not
// the search window under test, so this reference is independent of the bound
// the paper is arguing for.

import { shapeRadius, ringDrift } from '../../../src/gpu/inverseCpu.ts';

const HARD_CAP = 1 << 20;

export function referenceRing(p, offset, theta, spacing, phase, shape, sides, guard) {
  const s = Math.max(spacing, 1e-4);
  const radius = Math.hypot(p.x, p.y);
  const m = ringDrift(offset, shape, sides);
  const g = guard ?? s * 0.75;
  let best = 1e6;
  let evals = 0;
  for (let n = 0; n < HARD_CAP; n++) {
    const ringR = n * s + phase;
    if (ringR > radius + n * m + g) break;
    if (ringR < 0) continue;
    const psi = n * theta;
    const c = Math.cos(psi);
    const sn = Math.sin(psi);
    // q_n = R(-n theta) (p - R(n theta) n delta) = R(-n theta) p - n delta
    const q = {
      x: c * p.x + sn * p.y - n * offset.x,
      y: -sn * p.x + c * p.y - n * offset.y,
    };
    evals += 1;
    const gap = Math.abs(shapeRadius(q, shape, sides) - ringR);
    if (gap < best) best = gap;
  }
  referenceRing.lastEvals = evals;
  return Math.min(best, g);
}

/** Solver-shaped adapter so the rasteriser can render the reference like any other. */
export function referenceSolver() {
  const COUNT = { metric: 0, grad: 0 };
  return {
    name: 'reference',
    COUNT,
    ringDistance(p, offset, theta, spacing, phase, shape, sides, _accept, reject) {
      const guard = Math.max(reject ?? 0, Math.max(spacing, 1e-4) * 0.75);
      const d = referenceRing(p, offset, theta, spacing, phase, shape, sides, guard);
      COUNT.metric += referenceRing.lastEvals;
      return d;
    },
  };
}
