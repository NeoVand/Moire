// Second-order moiré probe: two parallel line families near a 2:1 pitch ratio.
//
// The first-order characters (1,∓1) are both fast here, so a criterion that
// scans only them declares "no fringe" -- yet the composite carries a classical
// (2,-1) beat: measured below at the predicted period, with a coverage swing
// inside the range Table 1 calls a fringe, collapsing onto a generalized
// profile Phi_{2,-1}(frac(2*phi1 - phi2)). This is the probe behind the
// character generalization of §3.6 and the order-two limitation of §10.
//
// A diagnostic like hyperdiag.mjs: prints to stdout, feeds no figure.
//
//   node paper/tools/exp/order2.mjs

const s1 = 20;
const s2 = 10.3;
const h = 3.5 / 2; // stroke half-width, the tool's default thickness
const a = 0.75; //   antialias band at zoom 1 (0.7 px, rounded as in the sweep)

const smoothstep = (lo, hi, x) => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
const pd = (v) => {
  const f = v - Math.floor(v);
  return Math.min(f, 1 - f);
};

// The paper's own compositing: per-layer coverage from the eikonal distance,
// union-composited. Parallel lines make everything one-dimensional.
const ink = (x) => {
  const a1 = 1 - smoothstep(h - a, h + a, pd(x / s1) * s1);
  const a2 = 1 - smoothstep(h - a, h + a, pd(x / s2) * s2);
  return a1 + a2 - a1 * a2;
};

// The criterion, all six primitive characters |k| <= 2 (gradients collinear
// here, so the vector ratio collapses to scalars).
const g1 = 1 / s1;
const g2 = 1 / s2;
const eta = (k1, k2) =>
  Math.abs(k1 * g1 + k2 * g2) / (Math.abs(k1 * g1 - k2 * g2) / 2);
console.log('character scan (fringe regime is eta <= 0.25):');
for (const [k1, k2] of [[1, -1], [1, 1], [2, -1], [2, 1], [1, -2], [1, 2]]) {
  const e = eta(k1, k2);
  const beat = Math.abs(k1 * g1 + k2 * g2);
  const note = e <= 0.25 ? ` <- fringe, period ${(1 / beat).toFixed(1)}` : '';
  console.log(`  eta(${k1},${k2}) = ${e.toFixed(4)}${note}`);
}

// Measure the beat in the composite: low-pass wider than the carriers and
// narrower than the beat, then read off the dominant period and the swing.
const N = 400000;
const X = 4000;
const dx = X / N;
const img = new Float64Array(N);
for (let i = 0; i < N; i++) img[i] = ink(i * dx);

const sigma = 30 / dx;
const R = Math.ceil(4 * sigma);
const kern = [];
let ks = 0;
for (let j = -R; j <= R; j++) {
  const w = Math.exp((-j * j) / (2 * sigma * sigma));
  kern.push(w);
  ks += w;
}
const lp = new Float64Array(N);
for (let i = R; i < N - R; i++) {
  let acc = 0;
  for (let j = -R; j <= R; j++) acc += img[i + j] * kern[j + R];
  lp[i] = acc / ks;
}

let mn = 1;
let mx = 0;
let mean = 0;
let cnt = 0;
for (let i = 2 * R; i < N - 2 * R; i++) {
  mn = Math.min(mn, lp[i]);
  mx = Math.max(mx, lp[i]);
  mean += lp[i];
  cnt++;
}
mean /= cnt;

let best = { T: 0, amp: 0 };
for (let T = 100; T <= 1200; T += 2) {
  let re = 0;
  let im = 0;
  for (let i = 2 * R; i < N - 2 * R; i++) {
    const ph = (2 * Math.PI * (i * dx)) / T;
    re += (lp[i] - mean) * Math.cos(ph);
    im += (lp[i] - mean) * Math.sin(ph);
  }
  const amp = (2 * Math.hypot(re, im)) / cnt;
  if (amp > best.amp) best = { T, amp };
}

// Collapse onto Phi_{2,-1}: bin the low-passed ink by frac(2*phi1 - phi2) and
// report the explained variance -- the generalized fringe law's fit quality.
const B = 40;
const bins = new Float64Array(B);
const cnts = new Float64Array(B);
const binOf = (x) => {
  const D = (2 * x) / s1 - x / s2;
  return Math.min(B - 1, Math.floor((D - Math.floor(D)) * B));
};
for (let i = 2 * R; i < N - 2 * R; i++) {
  const b = binOf(i * dx);
  bins[b] += lp[i];
  cnts[b]++;
}
let tot2 = 0;
let withinSS = 0;
for (let i = 2 * R; i < N - 2 * R; i++) {
  tot2 += (lp[i] - mean) ** 2;
  const b = binOf(i * dx);
  withinSS += (lp[i] - bins[b] / cnts[b]) ** 2;
}

console.log(`pitches ${s1} and ${s2}: predicted (2,-1) beat period ${(1 / Math.abs(2 * g1 - g2)).toFixed(1)} world units`);
console.log(`measured dominant period ${best.T}, coverage swing ${(mx - mn).toFixed(4)} (Table 1 fringes swing 0.12-0.64)`);
console.log(`collapse onto Phi_{2,-1}(frac(2 phi1 - phi2)): ${(100 * (1 - withinSS / tot2)).toFixed(1)}% of variance explained`);
