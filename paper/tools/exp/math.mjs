// Data for the figures that explain the method rather than measure it.
//
//   residual.csv  the residual h(n) at one pixel, with both envelopes, the window
//                 edges, the guard, and the indices the scan actually evaluated
//   fan.csv       the nearest index as a function of radius, against |p|/s and
//                 kappa |p|/s, which is the fan a rotation opens
//   convex.csv    the residual with theta = 0: piecewise linear, convex, with the
//                 facet crossing the closed form solves for
//
//   node paper/tools/exp/math.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, loadSolver, VISIT_PATCH } from '../lib/instrument.mjs';
import {
  RING_BUDGET,
  ringDrift,
  ringIndexWindow,
  shapeKappa,
  shapeRadius,
} from '../../../src/gpu/inverseCpu.ts';

function rotate2d(p, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

/** Signed residual: how far ring n's boundary is from p, positive when p is outside. */
function residual(p, n, offset, theta, spacing, phase, shape, sides) {
  const center = rotate2d({ x: offset.x * n, y: offset.y * n }, n * theta);
  const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -n * theta);
  return shapeRadius(q, shape, sides) - (n * spacing + phase);
}

// ---------------------------------------------------------------- residual h(n)

const TAU = Math.PI * 2;

const CASE = {
  p: { x: 620, y: 300 },
  offset: { x: 1.5, y: 0.8 },
  theta: 0.02,
  spacing: 14,
  phase: 0,
  shape: 3,
  sides: 3,
  guard: 10.5,
};

{
  const { p, offset, theta, spacing, phase, shape, sides, guard } = CASE;
  const radius = Math.hypot(p.x, p.y);
  const offLen = Math.hypot(offset.x, offset.y);
  const kappa = shapeKappa(shape, sides);
  const drift = ringDrift(offset, shape, sides);
  const win = ringIndexWindow(radius, offLen, drift, spacing, phase, kappa, guard);

  const visitor = await loadSolver('final', VISIT_PATCH, 'visit');
  globalThis.__visited = [];
  const got = visitor.ringDistance(p, offset, theta, spacing, phase, shape, sides, 0, guard);
  const visited = new Set(globalThis.__visited);
  globalThis.__visited = null;

  const rows = ['n,h,lower,upper'];
  const hits = ['n,h'];
  const nMax = Math.ceil(win.hi * 1.25) + 4;
  for (let n = 0; n <= nMax; n++) {
    const h = residual(p, n, offset, theta, spacing, phase, shape, sides);
    // The two envelopes that make the window provable.
    const lower = kappa * Math.abs(radius - n * offLen) - (n * spacing + phase);
    const upper = radius + n * drift - (n * spacing + phase);
    rows.push(`${n},${h.toFixed(4)},${lower.toFixed(4)},${upper.toFixed(4)}`);
    if (visited.has(n)) hits.push(`${n},${h.toFixed(4)}`);
  }
  writeFileSync(join(DATA, 'residual.csv'), `${rows.join('\n')}\n`);
  writeFileSync(join(DATA, 'residual-visited.csv'), `${hits.join('\n')}\n`);

  let brute = 1e9;
  let bruteAt = 0;
  for (let n = 0; n <= nMax * 4; n++) {
    const v = Math.abs(residual(p, n, offset, theta, spacing, phase, shape, sides));
    if (v < brute) {
      brute = v;
      bruteAt = n;
    }
  }
  writeFileSync(
    join(DATA, 'residual.json'),
    `${JSON.stringify(
      {
        ...CASE,
        radius: Math.round(radius * 100) / 100,
        kappa: Math.round(kappa * 10000) / 10000,
        drift: Math.round(drift * 10000) / 10000,
        window: win,
        span: win.hi - win.lo + 1,
        budget: RING_BUDGET,
        naiveIndex: Math.round((radius - phase) / spacing),
        trueIndex: bruteAt,
        trueDistance: Math.round(brute * 10000) / 10000,
        solved: Math.round(got * 10000) / 10000,
        evaluated: visited.size,
        nMax,
      },
      null,
      2
    )}\n`
  );
  console.log(
    `residual: window [${win.lo}, ${win.hi}] span ${win.hi - win.lo + 1}, ` +
      `naive index ${Math.round(radius / spacing)}, true index ${bruteAt}, ` +
      `evaluated ${visited.size}`
  );
}

// ------------------------------------------------------------------- index fan

// Three counts against radius, at fixed spacing:
//
//   stray     how far the true nearest index is from the naive guess, worst over
//             directions. A fixed neighbourhood must cover this or it drops ink.
//   span      the width of the proven interval, which is what has to be searched.
//   evaluated what the solver actually looks at, worst over directions.
//
// The first two grow linearly, because the number of rings genuinely near a pixel
// grows linearly. The third does not, which is the whole point of the skip.
{
  const spacing = 14;
  const offset = { x: 0, y: 0 };
  const ANGLES = 96;
  let windowChecks = 0;
  let windowViolations = 0;
  const fanSolver = await loadSolver('final', VISIT_PATCH, 'fan');
  for (const [shape, sides, name, theta] of [
    [3, 3, 'triangle', 0.02],
    [4, 6, 'hexagon', 0.05],
  ]) {
    const kappa = shapeKappa(shape, sides);
    const guard = spacing * 0.75;
    const rows = ['radius,stray,span,evaluated'];
    // Running max: the worst stray anywhere out to this radius, which is what a
    // budget covering the frame has to survive. The per-radius worst is the same
    // curve with sampling jitter on top.
    let strayHigh = 0;
    for (let r = 40; r <= 1600; r += 20) {
      const strays = [];
      const win = ringIndexWindow(r, 0, 0, spacing, 0, kappa, guard);
      let evalSum = 0;
      for (let i = 0; i < ANGLES; i++) {
        const a = (i * TAU) / ANGLES + 0.11;
        const p = { x: r * Math.cos(a), y: r * Math.sin(a) };
        let best = 1e9;
        let at = 0;
        for (let n = 0; n <= Math.ceil(r / spacing) + 64; n++) {
          const v = Math.abs(residual(p, n, offset, theta, spacing, 0, shape, sides));
          if (v < best) {
            best = v;
            at = n;
          }
        }
        globalThis.__visited = [];
        fanSolver.ringDistance(p, offset, theta, spacing, 0, shape, sides, 0, guard);
        evalSum += new Set(globalThis.__visited).size;
        globalThis.__visited = null;
        // Only pixels the guard does not already clamp: elsewhere the index is
        // irrelevant because the pixel is blank either way, and the window makes
        // no claim about it.
        if (best > guard) continue;
        if (at < win.lo || at > win.hi) {
          windowViolations += 1;
          console.error(`  WINDOW VIOLATION ${name} r=${r} n*=${at} window=[${win.lo},${win.hi}]`);
        }
        windowChecks += 1;
        strays.push(Math.abs(at - Math.round(shapeRadius(p, shape, sides) / spacing)));
      }
      if (!strays.length) continue;
      strays.sort((x, y) => x - y);
      strayHigh = Math.max(strayHigh, strays[strays.length - 1]);
      rows.push(`${r},${strayHigh},${win.hi - win.lo + 1},${(evalSum / ANGLES).toFixed(1)}`);
    }
    writeFileSync(join(DATA, `fan-${name}.csv`), `${rows.join('\n')}\n`);
  }
  // The paper quotes this check, so it has to leave a file behind like every
  // other measurement rather than living only in this console line.
  writeFileSync(
    join(DATA, 'window.json'),
    `${JSON.stringify({ checks: windowChecks, violations: windowViolations, angles: ANGLES, spacing }, null, 2)}\n`
  );
  console.log(
    `fan: stray of the nearest index from the naive guess; ` +
      `window held on ${windowChecks} of ${windowChecks + windowViolations} argmins`
  );
}

// ----------------------------------------------- convex residual, no rotation

{
  const p = { x: 520, y: 260 };
  const spacing = 14;
  const shape = 4;
  const sides = 6;
  // Marginal: shapeRadius(-offset) equals the spacing, so the leading facet's
  // slope cancels and h flattens instead of crossing again.
  const cases = {
    shrinking: { x: 4, y: 2 },
    marginal: { x: spacing / ringDrift({ x: 1, y: 0 }, shape, sides), y: 0 },
  };
  const meta = {};
  for (const [name, offset] of Object.entries(cases)) {
    const drift = ringDrift(offset, shape, sides);
    const rows = ['n,h'];
    for (let n = 0; n <= 260; n++) {
      rows.push(`${n},${residual(p, n, offset, 0, spacing, 0, shape, sides).toFixed(4)}`);
    }
    writeFileSync(join(DATA, `convex-${name}.csv`), `${rows.join('\n')}\n`);
    // Facet solves: the crossing of every facet's own linear piece.
    const solves = [];
    for (let k = 0; k < sides; k++) {
      const ang = (Math.PI * 2 * k) / sides;
      const nk = { x: Math.cos(ang), y: Math.sin(ang) };
      const a = p.x * nk.x + p.y * nk.y;
      const b = offset.x * nk.x + offset.y * nk.y;
      const den = spacing + b;
      solves.push(Math.abs(den) > 1e-6 ? Math.round(((a - 0) / den) * 100) / 100 : null);
    }
    meta[name] = {
      offset,
      drift: Math.round(drift * 1000) / 1000,
      spacing,
      facetSolves: solves,
      asymptoticSlope: Math.round((drift - spacing) * 1000) / 1000,
    };
  }
  writeFileSync(join(DATA, 'convex.json'), `${JSON.stringify({ p, shape, sides, cases: meta }, null, 2)}\n`);
  console.log('convex: wrote translated-hexagon residuals with facet solves');
}

// ------------------------------------- where the budget binds, against saturation

{
  const lines = readFileSync(join(DATA, 'saturation-sweep.csv'), 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const rows = lines.slice(1).map((l) => {
    const parts = l.split(',');
    return Object.fromEntries(parts.map((v, i) => [head[i], Number.isNaN(+v) ? v : +v]));
  });
  // One bin per power of two of window span: the least ink anyone could be losing
  // in that bin, and the typical amount.
  const bins = new Map();
  for (const r of rows) {
    const b = Math.max(0, Math.floor(Math.log2(Math.max(r.spanP90, 1))));
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b).push(r.inkAtLeast);
  }
  const out = ['span,minInk,medianInk,q25,count'];
  for (const b of [...bins.keys()].sort((a, b2) => a - b2)) {
    const v = bins.get(b).sort((x, y) => x - y);
    out.push(
      `${2 ** b},${v[0].toFixed(3)},${v[v.length >> 1].toFixed(3)},${v[Math.floor(v.length * 0.25)].toFixed(3)},${v.length}`
    );
  }
  writeFileSync(join(DATA, 'saturation.csv'), `${out.join('\n')}\n`);
  console.log(`saturation: ${bins.size} span bins from ${rows.length} settings`);
}
