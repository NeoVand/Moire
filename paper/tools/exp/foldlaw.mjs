// The fold law, tested: where a walking family folds is decided in closed
// form by the support calculus, and the closed-form inverse reaches exactly
// as far as the twist is rational.
//
// A member is a convex body: gauge radius rho_n = n s + phi, frame turned by
// n theta, center c(n) = R_{n theta}(n delta). Its support function is
// h(u, n) = rho_n h0(u - n theta) + <c(n), u-hat>, and the family folds
// (consecutive members stop nesting, an envelope forms) exactly where the
// normal speed dh/dn = s h0(w) - rho_n theta h0'(w) + <c'(n), u-hat>
// first vanishes. Three consequences, each gated here against brute force
// that samples actual member boundaries and knows nothing of the calculus:
//
//   T1  rotation folds every non-circular shape at gauge radius
//       rho* = s / (theta L), L = sup |h0'/h0|  (L = tan(pi/k) for the
//       regular k-gon, (a^2-b^2)/(2ab) for the ellipse, 0 for the circle:
//       circles alone survive rotation). The first crossing sits at
//       Euclidean radius R* = s/(theta sin(pi/k)) for k-gons and
//       rho* sqrt((a^2+b^2)/2) for ellipses.
//   T2  translation folds circles exactly when the center outruns the
//       growth: |c'(n)| > s (the Mach condition). Straight walk: fold iff
//       |delta| > s, immediately. Rotating walk: |c'| = |delta| sqrt(1+n^2 theta^2)
//       crosses s at n* = sqrt((s/|delta|)^2 - 1) / theta.
//   T3  the closed-form inverse extends and splits: an ellipse gauge under
//       translation is the same quadratic as the circle; a rational twist
//       theta = 2 pi p/q splits the family into q translated subfamilies,
//       each quadratic. Both are gated against brute-force argmin.
//   T4  for a generic (irrational) twist the number of members within the
//       solver guard of a point grows without bound with radius -- the
//       branch growth that makes the incidence non-algebraic.
//
// Writes paper/data/foldlaw.json; prints a summary. Run with
//   node paper/tools/exp/foldlaw.mjs

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/foldlaw.json', import.meta.url);
const TAU = Math.PI * 2;

let failures = 0;
const report = [];
function gate(name, pass, detail) {
  if (!pass) failures += 1;
  report.push({ name, pass, ...detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name.padEnd(44)} ${JSON.stringify(detail)}`);
}

// ---------------------------------------------------------------------------
// Shapes. Each supplies: support h0(u) of the unit-gauge body, a boundary
// sampler of the unit body, and the gauge (for membership tests).

function regularPolygon(k) {
  // Unit-INRADIUS regular k-gon: facet normals at angles 2*pi*j/k, vertices
  // between them at radius sec(pi/k).
  const rv = 1 / Math.cos(Math.PI / k);
  const verts = Array.from({ length: k }, (_, j) => {
    const a = (TAU * (j + 0.5)) / k;
    return { x: rv * Math.cos(a), y: rv * Math.sin(a) };
  });
  return {
    name: `${k}-gon`,
    support: (u) => {
      let m = -Infinity;
      for (const v of verts) m = Math.max(m, v.x * Math.cos(u) + v.y * Math.sin(u));
      return m;
    },
    gauge: (q) => {
      let m = -Infinity;
      for (let j = 0; j < k; j += 1) {
        const a = (TAU * j) / k;
        m = Math.max(m, q.x * Math.cos(a) + q.y * Math.sin(a));
      }
      return m;
    },
    // Boundary: edges between consecutive vertices, sampled evenly.
    boundary: (samples) => {
      const pts = [];
      const per = Math.ceil(samples / k);
      for (let j = 0; j < k; j += 1) {
        const a = verts[j];
        const b = verts[(j + 1) % k];
        for (let i = 0; i < per; i += 1) {
          const t = i / per;
          pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      return pts;
    },
    L: Math.tan(Math.PI / k),
    euclidAtFold: (rhoStar) => rhoStar / Math.cos(Math.PI / k),
  };
}

function ellipse(a, b) {
  return {
    name: `ellipse ${a}:${b}`,
    support: (u) => Math.sqrt(a * a * Math.cos(u) ** 2 + b * b * Math.sin(u) ** 2),
    gauge: (q) => Math.sqrt((q.x / a) ** 2 + (q.y / b) ** 2),
    boundary: (samples) =>
      Array.from({ length: samples }, (_, i) => {
        const t = (TAU * i) / samples;
        return { x: a * Math.cos(t), y: b * Math.sin(t) };
      }),
    L: (a * a - b * b) / (2 * a * b),
    euclidAtFold: (rhoStar) => rhoStar * Math.sqrt((a * a + b * b) / 2),
  };
}

const circle = {
  name: 'circle',
  support: () => 1,
  gauge: (q) => Math.hypot(q.x, q.y),
  boundary: (samples) =>
    Array.from({ length: samples }, (_, i) => {
      const t = (TAU * i) / samples;
      return { x: Math.cos(t), y: Math.sin(t) };
    }),
  L: 0,
};

const rot = (a, p) => ({
  x: Math.cos(a) * p.x - Math.sin(a) * p.y,
  y: Math.sin(a) * p.x + Math.cos(a) * p.y,
});

// ---------------------------------------------------------------------------
// Brute-force nesting detector. Member n: boundary x = c(n) + R_{n theta}(rho_n * bd).
// Nesting of n inside n+1 breaks when some boundary point of member n lies
// outside member n+1 (gauge of the pulled-back point exceeds rho_{n+1}).
// Knows nothing of support calculus: pure membership tests.

function firstBreak(shape, { s, phi = 0, theta = 0, delta = { x: 0, y: 0 }, nMax, samples = 4096 }) {
  const bd = shape.boundary(samples);
  for (let n = 0; n < nMax; n += 1) {
    const rho = n * s + phi;
    const rhoNext = (n + 1) * s + phi;
    const cN = rot(n * theta, { x: n * delta.x, y: n * delta.y });
    const cNext = rot((n + 1) * theta, { x: (n + 1) * delta.x, y: (n + 1) * delta.y });
    let worst = -Infinity;
    let worstPt = null;
    for (const q of bd) {
      const x = {
        x: cN.x + Math.cos(n * theta) * rho * q.x - Math.sin(n * theta) * rho * q.y,
        y: cN.y + Math.sin(n * theta) * rho * q.x + Math.cos(n * theta) * rho * q.y,
      };
      const pulled = rot(-(n + 1) * theta, { x: x.x - cNext.x, y: x.y - cNext.y });
      const excess = shape.gauge(pulled) - rhoNext;
      if (excess > worst) {
        worst = excess;
        worstPt = x;
      }
    }
    if (worst > 1e-7 * Math.max(1, rhoNext)) {
      return { n, rho, radius: Math.hypot(worstPt.x, worstPt.y) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// T1: rotation folds every non-circular shape at rho* = s / (theta L).

console.log('T1: rotation fold onset, brute nesting vs rho* = s/(theta L)');
const t1 = [];
{
  const s = 5;
  const phi = 2;
  const theta = 0.02;
  for (const shape of [regularPolygon(3), regularPolygon(4), regularPolygon(6), ellipse(1.3, 1 / 1.3), ellipse(1.6, 1)]) {
    // Numeric L: sup |h'/h| by dense difference quotients (independent check
    // of the constant itself).
    let Lnum = 0;
    const M = 200000;
    let prev = Math.log(shape.support(0));
    for (let i = 1; i <= M; i += 1) {
      const cur = Math.log(shape.support((TAU * i) / M));
      Lnum = Math.max(Lnum, Math.abs(cur - prev) / (TAU / M));
      prev = cur;
    }
    gate(`L(${shape.name}) numeric = closed form`, Math.abs(Lnum - shape.L) / shape.L < 0.02, {
      numeric: Number(Lnum.toFixed(4)),
      closed: Number(shape.L.toFixed(4)),
    });

    const rhoStar = s / (theta * shape.L);
    const nStar = (rhoStar - phi) / s;
    const hit = firstBreak(shape, { s, phi, theta, nMax: Math.ceil(nStar * 1.5) + 20, samples: 8192 });
    const ok = hit !== null && Math.abs(hit.rho - rhoStar) / rhoStar < 0.05;
    const Rstar = shape.euclidAtFold(rhoStar);
    const okR = hit !== null && Math.abs(hit.radius - Rstar) / Rstar < 0.06;
    gate(`fold onset (${shape.name})`, ok, {
      predictedRho: Number(rhoStar.toFixed(1)),
      measuredRho: hit ? Number(hit.rho.toFixed(1)) : null,
    });
    gate(`fold radius, Euclidean (${shape.name})`, okR, {
      predictedR: Number(Rstar.toFixed(1)),
      measuredR: hit ? Number(hit.radius.toFixed(1)) : null,
    });
    t1.push({ shape: shape.name, L: shape.L, rhoStar, measured: hit });
  }

  // The circle never folds under rotation: nesting holds out to any depth.
  const hit = firstBreak(circle, { s, phi, theta: 0.3, nMax: 2000, samples: 512 });
  gate('circle survives any rotation', hit === null, { checkedTo: 2000 });
}

// ---------------------------------------------------------------------------
// T2: the Mach condition for walking circles.

console.log('T2: translation folds circles iff the center outruns the growth');
const t2 = [];
{
  const s = 5;
  const phi = 2;
  // Straight walk: subsonic never folds, supersonic folds immediately.
  const sub = firstBreak(circle, { s, phi, delta: { x: 0.95 * s, y: 0 }, nMax: 4000, samples: 1024 });
  const sup = firstBreak(circle, { s, phi, delta: { x: 1.05 * s, y: 0 }, nMax: 50, samples: 4096 });
  gate('straight walk, |delta| = 0.95 s: nested forever', sub === null, { checkedTo: 4000 });
  gate('straight walk, |delta| = 1.05 s: folds at once', sup !== null && sup.n === 0, {
    firstBreak: sup ? sup.n : null,
  });

  // Rotating walk: |c'| = |delta| sqrt(1 + n^2 theta^2) crosses s at n*.
  for (const [dlen, theta] of [[0.5, 0.02], [1.0, 0.01], [2.0, 0.005]]) {
    const nStar = Math.sqrt((s / dlen) ** 2 - 1) / theta;
    const hit = firstBreak(circle, { s, phi, theta, delta: { x: dlen, y: 0 }, nMax: Math.ceil(nStar * 1.5), samples: 2048 });
    const ok = hit !== null && Math.abs(hit.n - nStar) / nStar < 0.05;
    gate(`rotating walk d=${dlen} th=${theta}: onset n*`, ok, {
      predicted: Number(nStar.toFixed(0)),
      measured: hit ? hit.n : null,
    });
    t2.push({ dlen, theta, nStar, measured: hit ? hit.n : null });
  }
}

// ---------------------------------------------------------------------------
// T3a: translated ellipse gauge is the circle's quadratic, verbatim.

console.log('T3: the closed form extends (ellipse) and splits (rational twist)');
{
  const s = 5;
  const phi = 2;
  const a = 1.5;
  const b = 0.8;
  const M = (p, q) => (p.x * q.x) / (a * a) + (p.y * q.y) / (b * b);
  const gauge = (q) => Math.sqrt(M(q, q));
  const h = (p, n, d) => gauge({ x: p.x - n * d.x, y: p.y - n * d.y }) - (n * s + phi);

  let worst = 0;
  let rng = 12345;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff), rng / 0x7fffffff);
  for (let trial = 0; trial < 500; trial += 1) {
    const d = { x: (rand() - 0.5) * 2.2, y: (rand() - 0.5) * 2.2 };
    if (gauge({ x: -d.x, y: -d.y }) >= s * 0.95) continue; // stay clearly subsonic
    const r = 30 + rand() * 1500;
    const ang = rand() * TAU;
    const p = { x: r * Math.cos(ang), y: r * Math.sin(ang) };
    // Quadratic: M(p - n d, p - n d) = (n s + phi)^2.
    const A = M(d, d) - s * s;
    const B = -2 * M(p, d) - 2 * s * phi;
    const C = M(p, p) - phi * phi;
    const disc = B * B - 4 * A * C;
    const cands = new Set([0]);
    if (disc >= 0) {
      for (const root of [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)]) {
        for (const j of [Math.floor(root), Math.ceil(root), Math.floor(root) + 1, Math.floor(root) - 1]) {
          if (j >= 0 && Number.isFinite(j)) cands.add(j);
        }
      }
    }
    let best = Infinity;
    for (const n of cands) best = Math.min(best, Math.abs(h(p, n, d)));
    let brute = Infinity;
    // The brute range must be stated in the gauge, not the Euclidean radius:
    // gauge(p) can exceed |p| by 1/min(a,b).
    const nMax = Math.ceil((gauge(p) + phi + s) / (s - gauge({ x: -d.x, y: -d.y }))) + 4;
    for (let n = 0; n <= nMax; n += 1) brute = Math.min(brute, Math.abs(h(p, n, d)));
    worst = Math.max(worst, Math.abs(best - brute));
  }
  gate('translated ellipse: quadratic == brute argmin', worst < 1e-7, {
    worstGap: Number(worst.toExponential(2)),
  });
}

// T3b: rational twist theta = 2 pi p / q splits into q quadratics.
{
  const s = 5;
  const phi = 2;
  const q = 7;
  const pp = 2;
  const theta = (TAU * pp) / q;
  const dlen = 2.0;
  const h = (p, n) => {
    const c = rot(n * theta, { x: n * dlen, y: 0 });
    return Math.hypot(p.x - c.x, p.y - c.y) - (n * s + phi);
  };

  let worst = 0;
  let rng = 98765;
  const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff), rng / 0x7fffffff);
  for (let trial = 0; trial < 300; trial += 1) {
    const r = 30 + rand() * 2000;
    const ang = rand() * TAU;
    const p = { x: r * Math.cos(ang), y: r * Math.sin(ang) };
    const cands = new Set([0]);
    for (let j = 0; j < q; j += 1) {
      // Class n === j (mod q): center direction fixed at angle j*theta, so
      // |p - n * R_{j theta} delta| = n s + phi is one quadratic in n.
      const dj = rot(j * theta, { x: dlen, y: 0 });
      const A = dlen * dlen - s * s;
      const B = -2 * (p.x * dj.x + p.y * dj.y) - 2 * s * phi;
      const C = p.x * p.x + p.y * p.y - phi * phi;
      const disc = B * B - 4 * A * C;
      if (disc < 0) continue;
      for (const root of [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)]) {
        if (!Number.isFinite(root)) continue;
        const base = j + q * Math.round((root - j) / q);
        for (const n of [base - q, base, base + q]) if (n >= 0) cands.add(n);
      }
    }
    let best = Infinity;
    for (const n of cands) best = Math.min(best, Math.abs(h(p, n)));
    let brute = Infinity;
    const nMax = Math.ceil((r + phi + s) / (s - dlen)) + 4;
    for (let n = 0; n <= nMax; n += 1) brute = Math.min(brute, Math.abs(h(p, n)));
    worst = Math.max(worst, Math.abs(best - brute));
  }
  gate(`rational twist 2pi*${pp}/${q}: ${q} quadratics == brute`, worst < 1e-7, {
    worstGap: Number(worst.toExponential(2)),
  });
}

// ---------------------------------------------------------------------------
// T4: irrational twist, branches through a point grow with radius. The branch
// count is the number of real crossings of the continuous residual h(nu) --
// the members of the interpolated front that pass through p -- which is what
// bounds the sheet count of any algebraic formula.

console.log('T4: branch growth under an irrational twist');
const t4 = [];
{
  const s = 5;
  const phi = 2;
  const theta = 1; // theta / 2 pi irrational
  const dlen = 0.5;
  const counts = [];
  for (const r of [200, 400, 800, 1600, 3200]) {
    const p = { x: r, y: 0 };
    const nuMax = (r + phi + s) / (s - dlen) + 4;
    let crossings = 0;
    const step = 0.02;
    let prev = Math.hypot(p.x - 0, p.y - 0) - phi;
    for (let nu = step; nu <= nuMax; nu += step) {
      const c = rot(nu * theta, { x: nu * dlen, y: 0 });
      const cur = Math.hypot(p.x - c.x, p.y - c.y) - (nu * s + phi);
      if ((prev > 0 && cur <= 0) || (prev <= 0 && cur > 0)) crossings += 1;
      prev = cur;
    }
    counts.push({ r, crossings });
  }
  t4.push(...counts);
  const growing = counts.every((c, i) => i === 0 || c.crossings > counts[i - 1].crossings * 1.5);
  gate('branches through a point grow with radius', growing, {
    counts: counts.map((c) => `${c.r}:${c.crossings}`).join(' '),
  });
}

writeFileSync(OUT, JSON.stringify({ t1, t2, t4, gates: report }, null, 1));
console.log(failures === 0 ? 'all gates pass' : `${failures} GATE FAILURE(S)`);
process.exitCode = failures === 0 ? 0 : 1;
