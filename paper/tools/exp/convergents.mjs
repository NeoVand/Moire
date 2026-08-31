// The selection theorem, tested: which beat wins is best approximation.
//
// 1D claim (Lagrange, imported): for two combs at pitch ratio rho, the
// characters (a, b) that set a new record for beat slowness |a rho + b| as
// the order budget a <= A grows are exactly the continued-fraction
// convergents p/q of rho (best approximations of the second kind). If this
// holds, the visible-beat hierarchy of a superposition IS the continued
// fraction of its ratio, the golden ratio is the fringe desert, and an
// order cap on the character scan is the wrong tool: the convergent ladder
// (or, in 2D, lattice reduction) finds every winner at any order.
//
// 2D claim: the slowest character of a pair of index gradients g1, g2 is
// the shortest vector of the lattice {a g1 + b g2}, and Lagrange-Gauss
// reduction finds it exactly in a handful of iterations. The shipped
// |k| <= 2 enumeration is measured against it: how often does a fringe
// exist (unrestricted eta below threshold) that the cap declares absent?
//
// Writes paper/data/convergents.json; prints a summary.

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/convergents.json', import.meta.url);

// ---------------------------------------------------------------- 1D part

/** Continued-fraction convergents [p, q] of rho, while q stays sane. */
function convergents(rho, maxQ = 1e6) {
  const out = [];
  let x = rho;
  let p0 = 1, q0 = 0, p1 = Math.floor(rho), q1 = 1;
  out.push([p1, q1]);
  for (let i = 0; i < 48; i += 1) {
    const frac = x - Math.floor(x);
    if (frac < 1e-12) break;
    x = 1 / frac;
    const a = Math.floor(x);
    const p2 = a * p1 + p0;
    const q2 = a * q1 + q0;
    if (q2 > maxQ) break;
    out.push([p2, q2]);
    p0 = p1; q0 = q1; p1 = p2; q1 = q2;
  }
  return out;
}

/**
 * Record-setting denominators of min_p |q rho - p| as q grows: the beat
 * slowness ladder of the (q, -p) characters. Lagrange says these are the
 * convergent denominators (from the first convergent with error below the
 * trivial q = 1 record).
 */
function recordSetters(rho, maxQ) {
  const out = [];
  let best = Infinity;
  for (let q = 1; q <= maxQ; q += 1) {
    const p = Math.round(q * rho);
    const err = Math.abs(q * rho - p);
    if (err < best - 1e-15) {
      best = err;
      out.push([p, q]);
    }
  }
  return out;
}

const RATIOS = [
  ['golden', (1 + Math.sqrt(5)) / 2],
  ['sqrt2', Math.SQRT2],
  ['e', Math.E],
  ['pi', Math.PI],
  ['near-2:1', 2.013],
  ['near-3:1', 3.007],
  ['near-5:2', 2.492],
];
// Plus a spread of arbitrary ratios, deterministic so the run reproduces.
let seed = 0x9e3779b9;
const rand = () => {
  // xorshift32
  seed ^= seed << 13; seed >>>= 0;
  seed ^= seed >> 17;
  seed ^= seed << 5; seed >>>= 0;
  return seed / 0xffffffff;
};
for (let i = 0; i < 200; i += 1) RATIOS.push([`random-${i}`, 1 + 3 * rand()]);

const MAXQ = 2000;
let checked = 0;
let matched = 0;
const mismatches = [];
for (const [name, rho] of RATIOS) {
  const conv = convergents(rho, MAXQ).filter(([, q]) => q <= MAXQ);
  const rec = recordSetters(rho, MAXQ);
  // Lagrange covers best approximations of the second kind; the record
  // ladder starts at q = 1, which is the zeroth convergent (or ties it).
  const convSet = new Set(conv.map(([p, q]) => `${p}/${q}`));
  const extras = rec.filter(([p, q]) => !convSet.has(`${p}/${q}`));
  checked += 1;
  if (extras.length === 0) matched += 1;
  else mismatches.push({ name, rho, extras, rec, conv });
}

// The convergent fan: winning character against ratio at a fixed order
// budget, for the figure. Winner = argmin over 1 <= q <= A of q-weighted
// slowness (the profile's harmonic amplitude decays with order, so weight
// by order; the qualitative fan is insensitive to the exact weight).
const FAN_BUDGETS = [2, 4, 8, 16];
const fan = [];
for (let i = 0; i <= 1200; i += 1) {
  const rho = 1 + (i / 1200) * 2.5; // ratios 1..3.5
  const row = { rho: Number(rho.toFixed(5)) };
  for (const A of FAN_BUDGETS) {
    let best = Infinity;
    let win = [0, 0];
    for (let q = 1; q <= A; q += 1) {
      const p = Math.round(q * rho);
      if (p === 0) continue;
      const e = Math.abs(q * rho - p) * q; // order-weighted slowness
      if (e < best) {
        best = e;
        win = [p, q];
      }
    }
    row[`A${A}`] = win;
  }
  fan.push(row);
}

// ---------------------------------------------------------------- 2D part

const n2 = (v) => v[0] * v[0] + v[1] * v[1];
const norm = (v) => Math.sqrt(n2(v));
const comb = (a, g1, b, g2) => [a * g1[0] + b * g2[0], a * g1[1] + b * g2[1]];

/** Lagrange-Gauss reduction: the two successive minima of {a g1 + b g2},
 * with the integer coordinates carried along. */
function gaussReduce(g1, g2) {
  let u = { v: g1, k: [1, 0] };
  let w = { v: g2, k: [0, 1] };
  if (n2(u.v) < n2(w.v)) [u, w] = [w, u];
  for (let i = 0; i < 64; i += 1) {
    const mu = Math.round((u.v[0] * w.v[0] + u.v[1] * w.v[1]) / n2(w.v));
    const r = { v: [u.v[0] - mu * w.v[0], u.v[1] - mu * w.v[1]], k: [u.k[0] - mu * w.k[0], u.k[1] - mu * w.k[1]] };
    if (n2(r.v) >= n2(w.v)) return [w, u];
    u = w;
    w = r;
  }
  return [w, u];
}

/** The scan's figure of merit: beat gradient over the mean carrier in the
 * relabeling that brings the carriers close (eq. ratiok of the paper). */
const eta = (a, g1, b, g2) => {
  const beat = comb(a, g1, b, g2);
  const carrier = comb(a, g1, -b, g2);
  return norm(beat) / Math.max(0.5 * norm(carrier), 1e-12);
};

/**
 * Contrast weight: a beat at character (a, b) rides layer 1's |a|-th and
 * layer 2's |b|-th harmonic, and a stroke profile's harmonics decay like
 * 1/m, so the beat's contrast falls like 1/(|a||b|). Weighting slowness by
 * |a||b| makes "slowest VISIBLE beat" a well-posed question; without it the
 * criterion degenerates (good rational approximations exist at every order,
 * so unweighted eta favours beats no ink can carry).
 */
const weight = (a, b) => Math.abs(a) * Math.abs(b);

/** Best character by weighted slowness, brute force (a > 0, b nonzero). */
function bruteBest(g1, g2, K) {
  let best = Infinity;
  let win = [0, 0];
  for (let a = 1; a <= K; a += 1) {
    for (let b = -K; b <= K; b += 1) {
      if (b === 0) continue;
      const e = eta(a, g1, b, g2) * weight(a, b);
      if (e < best) {
        best = e;
        win = [a, b];
      }
    }
  }
  return { merit: best, k: win };
}

/** The shipped candidate set. */
const SHIPPED = [
  [1, -1],
  [1, 1],
  [2, -1],
  [2, 1],
  [1, -2],
  [1, 2],
];
function shippedBest(g1, g2) {
  let best = Infinity;
  let win = [0, 0];
  for (const [a, b] of SHIPPED) {
    const e = eta(a, g1, b, g2) * weight(a, b);
    if (e < best) {
      best = e;
      win = [a, b];
    }
  }
  return { merit: best, k: win };
}

/** Reduction-based scan: reduce, then read the winner off the reduced
 * basis (the shortest lattice vector with both generator coordinates
 * nonzero is the reduced short vector itself or a bounded combination of
 * the two; scanning the reduced pair's small combinations is order-free). */
function reducedBest(g1, g2) {
  const [s, t] = gaussReduce(g1, g2);
  let best = Infinity;
  let win = [0, 0];
  for (let i = -3; i <= 3; i += 1) {
    for (let j = -3; j <= 3; j += 1) {
      const a = i * s.k[0] + j * t.k[0];
      const b = i * s.k[1] + j * t.k[1];
      if (a === 0 || b === 0) continue;
      const e = eta(Math.abs(a), g1, Math.sign(a) * b, g2) * weight(a, b);
      if (e < best) {
        best = e;
        win = a > 0 ? [a, b] : [-a, -b];
      }
    }
  }
  return { merit: best, k: win };
}

/**
 * The shader's scan, mirrored exactly: reduction unrolled to a fixed step
 * count with a clamped quotient (a GPU cannot loop until done), candidates
 * limited to the shipped six (the safety floor: the scan can never do worse
 * than the old cap) plus the reduced short vector and the two-row window
 * {i s + t, i s + 2 t}. The second row matters: the weighted winner is not
 * always a shortest vector, because a longer lattice vector can carry
 * smaller integer coordinates (one row misses 5 fringes in 4000, two rows
 * miss 1). Once a step's remainder fails to shrink, later steps recompute
 * and reject the same remainder, so the unroll needs no done flag.
 */
function shaderBest(g1, g2, steps = 8, half = 3, rows = 2) {
  let u = { v: g1, k: [1, 0] };
  let w = { v: g2, k: [0, 1] };
  if (n2(u.v) < n2(w.v)) [u, w] = [w, u];
  for (let i = 0; i < steps; i += 1) {
    const mu = Math.max(
      -64,
      Math.min(64, Math.round((u.v[0] * w.v[0] + u.v[1] * w.v[1]) / Math.max(n2(w.v), 1e-24)))
    );
    const r = {
      v: [u.v[0] - mu * w.v[0], u.v[1] - mu * w.v[1]],
      k: [u.k[0] - mu * w.k[0], u.k[1] - mu * w.k[1]],
    };
    if (n2(r.v) < n2(w.v)) {
      u = w;
      w = r;
    }
  }
  const cands = SHIPPED.map(([a, b]) => [a, b]);
  cands.push([w.k[0], w.k[1]]);
  for (let j = 1; j <= rows; j += 1) {
    for (let i = -half; i <= half; i += 1) {
      cands.push([i * w.k[0] + j * u.k[0], i * w.k[1] + j * u.k[1]]);
    }
  }
  let best = Infinity;
  let win = [0, 0];
  for (const [a, b] of cands) {
    if (a === 0 || b === 0) continue;
    const e = eta(a, g1, b, g2) * weight(a, b);
    if (e < best) {
      best = e;
      win = a > 0 ? [a, b] : [-a, -b];
    }
  }
  return { merit: best, k: win };
}

// Visible iff weighted merit below the threshold a first-order beat at the
// regime line would have: eta = 1/4 at weight 1.
const THRESH = 0.25;
const K_TRUTH = 48;
let trials = 0;
let capMisses = 0; // visible fringe exists, |k|<=2 scan says none
let reducedMisses = 0; // visible fringe exists, reduction scan says none
let reducedAgrees = 0; // reduction winner matches brute-force winner
let shaderMisses = 0; // visible fringe exists, the shader's bounded scan says none
let shaderAgrees = 0; // shader winner matches brute-force winner
const missByRatio = [];
for (let t = 0; t < 4000; t += 1) {
  // Two carriers: pitches within a factor of four, direction within a few
  // degrees, the regime where higher-order beats live.
  const pitch2 = 1 / (1 + 3.2 * rand());
  const ang = (rand() - 0.5) * 0.2;
  const g1 = [1, 0];
  const g2 = [Math.cos(ang) / pitch2, Math.sin(ang) / pitch2];
  const truth = bruteBest(g1, g2, K_TRUTH);
  const cap = shippedBest(g1, g2);
  const red = reducedBest(g1, g2);
  const sha = shaderBest(g1, g2);
  trials += 1;
  if (truth.merit < THRESH && cap.merit >= THRESH) {
    capMisses += 1;
    missByRatio.push(Number((1 / pitch2).toFixed(3)));
  }
  if (truth.merit < THRESH && red.merit >= THRESH) reducedMisses += 1;
  if (red.k[0] === truth.k[0] && red.k[1] === truth.k[1]) reducedAgrees += 1;
  if (truth.merit < THRESH && sha.merit >= THRESH) shaderMisses += 1;
  if (sha.k[0] === truth.k[0] && sha.k[1] === truth.k[1]) shaderAgrees += 1;
}

const summary = {
  oneD: {
    ratiosChecked: checked,
    recordsMatchConvergents: matched,
    mismatches: mismatches.length,
  },
  twoD: {
    trials,
    fringeMissedByCap: capMisses,
    fringeMissedByReduction: reducedMisses,
    reductionMatchesBruteForce: reducedAgrees,
    fringeMissedByShaderScan: shaderMisses,
    shaderScanMatchesBruteForce: shaderAgrees,
    threshold: THRESH,
    truthBudget: K_TRUTH,
  },
};

writeFileSync(
  OUT,
  JSON.stringify({ summary, fan, mismatchSample: mismatches.slice(0, 3) }, null, 1)
);

// The fan as a CSV for the paper's pgfplots panel: the winning character
// (p, q) against the pitch ratio, one (p, q) pair per order budget. The
// figure plots the locked ratio p/q, whose plateaus against rho are the
// mode-locking staircase of the convergents.
const fanCsv = ['rho,p2,q2,p4,q4,p8,q8,p16,q16'];
for (const row of fan) {
  fanCsv.push(
    [
      row.rho,
      row.A2[0],
      row.A2[1],
      row.A4[0],
      row.A4[1],
      row.A8[0],
      row.A8[1],
      row.A16[0],
      row.A16[1],
    ].join(',')
  );
}
writeFileSync(new URL('../../data/convergent-fan.csv', import.meta.url), fanCsv.join('\n') + '\n');

console.log('1D: record-setting beats vs continued-fraction convergents');
console.log(
  `  ${matched}/${checked} ratios: every record-setter is a convergent` +
    (mismatches.length ? ` (${mismatches.length} MISMATCH)` : '')
);
console.log('2D: eta scan winners, 4000 random carrier pairs');
console.log(`  fringes (eta < ${THRESH}) missed by the |k|<=2 cap:      ${capMisses}`);
console.log(`  fringes missed by Gauss reduction + local refine:        ${reducedMisses}`);
console.log(`  reduction winner == brute force (|k|<=${K_TRUTH}) winner:    ${reducedAgrees}/${trials}`);
console.log(`  fringes missed by the shader's bounded scan:             ${shaderMisses}`);
console.log(`  shader scan winner == brute force winner:                ${shaderAgrees}/${trials}`);
if (missByRatio.length) {
  missByRatio.sort((a, b) => a - b);
  console.log(
    `  cap misses cluster at pitch ratios: ${missByRatio[0]} .. ${missByRatio[missByRatio.length - 1]}` +
      ` (median ${missByRatio[Math.floor(missByRatio.length / 2)]})`
  );
}
