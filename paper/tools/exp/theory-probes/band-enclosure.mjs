// B2, the band-mass enclosure in the collaborator's polar form (bridge #79): whiten the
// window, write X = sigma r (cos th, sin th); the conic model minus the threshold is
// q - t = d + a(th) r + b(th) r^2 and the source remainder is eps = C r^3, so at each angle
// the set where the model can be wrong about the sign is the intersection of two cubic
// inequalities in r >= 0, whose radial mass is exact, exp(-r_lo^2/2) - exp(-r_hi^2/2).
// The estimate integrates over a fine angle grid; the certificate partitions the circle
// into arcs, bounds a and b on each arc (exact extrema of a cosine and of a cosine of 2 th),
// widens the band outward with those bounds, and sums; arcs with the largest mass are refined.
// Scene: the demo's noise mask on the benchmark plane, near field. The conic's own measure
// is a dense grid here, whose numerical error is reported separately, not certified.
// usage: node paper/tools/exp/theory-probes/band-enclosure.mjs [x,y ...]
import { MASK, maskField } from '../../../../demo/mask-table.js';

const SIG = 0.5, S = SIG * SIG;
const K = MASK.k; // pixel-independent wavevectors in plane units

// the benchmark plane: s = -50 (x - 240) / D, t = -12000 / D, D = y + 1, with derivatives
function planeJet(x, y) {
  const D = y + 1;
  const s = -50 * (x - 240) / D, t = -12000 / D;
  const gs = [-50 / D, 50 * (x - 240) / (D * D)], gt = [0, 12000 / (D * D)];
  const Hs = [[0, 50 / (D * D)], [50 / (D * D), -100 * (x - 240) / (D ** 3)]];
  const Ht = [[0, 0], [0, -24000 / (D ** 3)]];
  // third derivatives along y (the largest): s_yyy = 300 (x-240) / D^4, t_yyy = 72000 / D^4; along x none
  const s3 = 300 * Math.abs(x - 240) / (D ** 4), t3 = 72000 / (D ** 4);
  return { s, t, gs, gt, Hs, Ht, s3, t3 };
}
function fieldJet(x, y) {
  const P = planeJet(x, y);
  let F0 = 0, g = [0, 0], H = [[0, 0], [0, 0]], C = 0, Cp = 0;
  for (let i = 0; i < 3; i++) {
    const k = K[i], a = MASK.a[i];
    const th = k[0] * P.s + k[1] * P.t + MASK.ph[i];
    const gth = [k[0] * P.gs[0] + k[1] * P.gt[0], k[0] * P.gs[1] + k[1] * P.gt[1]];
    const Hth = [[k[0] * P.Hs[0][0] + k[1] * P.Ht[0][0], k[0] * P.Hs[0][1] + k[1] * P.Ht[0][1]], [k[0] * P.Hs[1][0] + k[1] * P.Ht[1][0], k[0] * P.Hs[1][1] + k[1] * P.Ht[1][1]]];
    const sn = Math.sin(th), cs = Math.cos(th);
    F0 += a * sn;
    g[0] += a * cs * gth[0]; g[1] += a * cs * gth[1];
    for (let p = 0; p < 2; p++) for (let q = 0; q < 2; q++) H[p][q] += a * (cs * Hth[p][q] - sn * gth[p] * gth[q]);
    const gn = Math.hypot(gth[0], gth[1]);
    C += a * gn ** 3 / 6;                                   // the sine's cubic remainder, pixel units
    Cp += a * (Math.abs(k[0]) * P.s3 + Math.abs(k[1]) * P.t3) / 6; // the perspective's third-order term of the phase
  }
  return { F0, g, H, C: (C + Cp) * SIG ** 3, kmax: Math.max(...K.map((k, i) => Math.hypot(k[0] * P.gs[0] + k[1] * P.gt[0], k[0] * P.gs[1] + k[1] * P.gt[1]))) };
}

// brute force under the window, jittered grid, the truth
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
function truth(x, y, N = 801) {
  let acc = 0, wsum = 0; const R = 4.5 * SIG; seed = 12345 + 7919 * x + 104729 * y;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const dx = -R + (2 * R * (i + rnd())) / N, dy = -R + (2 * R * (j + rnd())) / N;
    const w = Math.exp(-0.5 * (dx * dx + dy * dy) / S); const P = planeJet(x + dx, y + dy);
    acc += w * (maskField(P.s, P.t) > MASK.t0 ? 1 : 0); wsum += w;
  }
  return acc / wsum;
}
// the conic model's coverage, dense grid (its numerical error is of the grid, about 1e-5)
function conicCoverage(J, N = 1201) {
  let acc = 0, wsum = 0; const R = 6 * SIG;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const dx = -R + (2 * R * (i + 0.5)) / N, dy = -R + (2 * R * (j + 0.5)) / N;
    const w = Math.exp(-0.5 * (dx * dx + dy * dy) / S);
    const q = J.F0 + J.g[0] * dx + J.g[1] * dy + 0.5 * (J.H[0][0] * dx * dx + 2 * J.H[0][1] * dx * dy + J.H[1][1] * dy * dy);
    acc += w * (q > MASK.t0 ? 1 : 0); wsum += w;
  }
  return acc / wsum;
}

// the radial set {r >= 0 : p1(r) >= 0 and p2(r) >= 0} for cubics, by a sign scan and bisection,
// widened outward by the scan's cell where a root is bracketed
function cubicRoots(c3, c2, c1, c0, rmax = 6, n = 240) {
  const f = (r) => ((c3 * r + c2) * r + c1) * r + c0;
  const roots = []; let ra = 0, fa = f(0);
  for (let i = 1; i <= n; i++) { const rb = rmax * i / n, fb = f(rb); if ((fa < 0) !== (fb < 0)) { let lo = ra, hi = rb; for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if ((f(m) < 0) === (fa < 0)) lo = m; else hi = m; } roots.push([lo, hi]); } ra = rb; fa = fb; }
  return { roots, sign0: f(0) >= 0 };
}
function bandMassAt(d, aLo, aHi, bLo, bHi, C, outward) {
  // conservative band on an arc: q_min(r) = d + aLo r + bLo r^2 <= C r^3 and q_max(r) = d + aHi r + bHi r^2 >= -C r^3
  const p1 = cubicRoots(C, -bLo, -aLo, -d);   // C r^3 - q_min >= 0
  const p2 = cubicRoots(C, bHi, aHi, d);      // C r^3 + q_max >= 0
  // walk r from 0 to rmax with both sign states, summing the mass where both hold
  const ev = [];
  for (const [lo, hi] of p1.roots) ev.push([outward ? lo : 0.5 * (lo + hi), 1, outward ? hi : 0.5 * (lo + hi)]);
  for (const [lo, hi] of p2.roots) ev.push([outward ? lo : 0.5 * (lo + hi), 2, outward ? hi : 0.5 * (lo + hi)]);
  ev.sort((u, v) => u[0] - v[0]);
  let s1 = p1.sign0, s2 = p2.sign0, r = 0, mass = 0;
  const seg = (r0, r1) => Math.exp(-0.5 * r0 * r0) - Math.exp(-0.5 * r1 * r1);
  for (const [rl, which, rh] of ev) {
    if (s1 && s2) mass += seg(r, rl);
    // inside the bracket the state is uncertain: count it as in the band when outward
    if (outward) mass += seg(rl, rh);
    if (which === 1) s1 = !s1; else s2 = !s2;
    r = rh;
  }
  if (s1 && s2) mass += seg(r, 6);
  return mass;
}
// a(th) = A cos(th - tA), b(th) = B0 + B1 cos(2 th - tB); their exact ranges on an arc
const cosRange = (amp, phase, mult, t0, t1) => { // range of amp cos(mult th - phase) for th in [t0, t1]
  let lo = Infinity, hi = -Infinity; const f = (t) => amp * Math.cos(mult * t - phase);
  for (const t of [t0, t1]) { lo = Math.min(lo, f(t)); hi = Math.max(hi, f(t)); }
  // interior extrema where mult th - phase = k pi
  for (let k = -8; k <= 8; k++) { const t = (k * Math.PI + phase) / mult; if (t > t0 && t < t1) { lo = Math.min(lo, f(t)); hi = Math.max(hi, f(t)); } }
  return [lo, hi];
};
// the direct route (the collaborator's, bridge #81): on an arc the source coverage is bounded
// below by the radial mass of {q_min(r) - C r^3 > 0} and above by that of {q_max(r) + C r^3 > 0},
// one cubic inequality each; strict threshold, an identically zero polynomial counts as not > 0
function coverageAt(c3, c2, c1, c0, outward) {
  if (c3 === 0 && c2 === 0 && c1 === 0 && c0 === 0) return 0;
  const p = cubicRoots(c3, c2, c1, c0);
  const seg = (r0, r1) => Math.exp(-0.5 * r0 * r0) - Math.exp(-0.5 * r1 * r1);
  let s = p.sign0, r = 0, mass = 0;
  for (const [lo, hi] of p.roots) {
    if (s) mass += seg(r, outward ? hi : 0.5 * (lo + hi)); // a positive stretch is widened outward to the bracket's far end
    else if (outward) mass += seg(lo, hi);                 // a bracket at the start of a positive stretch is counted whole
    s = !s; r = outward ? (s ? lo : hi) : 0.5 * (lo + hi);
  }
  if (s) mass += seg(r, 6);
  return mass;
}
function enclosure(J, arcs0 = 64, refine = 3) {
  const d = J.F0 - MASK.t0;
  const A = SIG * Math.hypot(J.g[0], J.g[1]), tA = Math.atan2(J.g[1], J.g[0]);
  const B0 = 0.25 * S * (J.H[0][0] + J.H[1][1]);
  const B1 = 0.25 * S * Math.hypot(J.H[0][0] - J.H[1][1], 2 * J.H[0][1]), tB = Math.atan2(2 * J.H[0][1], J.H[0][0] - J.H[1][1]);
  // the estimate: a fine angle grid, lower and upper coverage at each angle exactly
  const nth = 720; let estLo = 0, estHi = 0;
  for (let i = 0; i < nth; i++) {
    const th = (2 * Math.PI * (i + 0.5)) / nth; const a = A * Math.cos(th - tA), b = B0 + B1 * Math.cos(2 * th - tB);
    estLo += coverageAt(-J.C, b, a, d, false) / nth; // q - C r^3 > 0
    estHi += coverageAt(J.C, b, a, d, false) / nth;  // q + C r^3 > 0
  }
  // the certificate: arcs with the exact ranges of a and b, widened outward, refined where the width is largest
  let arcs = []; for (let i = 0; i < arcs0; i++) arcs.push([2 * Math.PI * i / arcs0, 2 * Math.PI * (i + 1) / arcs0]);
  const bounds = ([t0, t1]) => { const [aLo, aHi] = cosRange(A, tA, 1, t0, t1); const [bLo, bHi] = cosRange(B1, tB, 2, t0, t1); const w = (t1 - t0) / (2 * Math.PI); return { lo: coverageAt(-J.C, B0 + bLo, aLo, d, false) * w, hi: coverageAt(J.C, B0 + bHi, aHi, d, true) * w }; };
  for (let pass = 0; pass < refine; pass++) {
    const b = arcs.map(bounds); const width = b.map((v) => v.hi - v.lo);
    const order = width.map((v, i) => i).sort((p, q) => width[q] - width[p]).slice(0, Math.ceil(arcs.length / 4));
    const split = new Set(order); const next = [];
    arcs.forEach((arc, i) => { if (split.has(i)) { const mid = 0.5 * (arc[0] + arc[1]); next.push([arc[0], mid], [mid, arc[1]]); } else next.push(arc); });
    arcs = next;
  }
  const b = arcs.map(bounds);
  const L = b.reduce((s, v) => s + v.lo, 0), U = Math.min(1, b.reduce((s, v) => s + v.hi, 0) + Math.exp(-18)); // the tail beyond r = 6 only on the upper side
  const Rb = 3, epsBall = J.C * Rb ** 3, tau = Math.exp(-0.5 * Rb * Rb);
  return { estLo, estHi, L, U, arcs: arcs.length, epsBall, tau };
}

const args = process.argv.slice(2);
const pixels = args.length ? args.map((a) => a.split(',').map(Number)) : [[100, 158], [140, 158], [220, 158], [100, 150], [140, 150], [100, 140], [140, 140], [100, 130], [140, 130], [180, 130], [100, 120], [140, 120], [100, 110], [140, 110], [180, 110], [100, 100], [140, 100]];
console.log('x,y      k*sig  truth    conic    |err|    est [lo, hi]        cert [L, U]         width    arcs  ball-form width  truth in [L, U]?');
let allIn = true;
for (const [x, y] of pixels) {
  const J = fieldJet(x, y); const tr = truth(x, y); const pc = conicCoverage(J); const e = enclosure(J);
  const err = Math.abs(tr - pc); const inside = tr >= e.L - 1e-9 && tr <= e.U + 1e-9; allIn = allIn && inside;
  console.log(`${String(x).padEnd(3)},${String(y).padEnd(4)} ${(J.kmax * SIG).toFixed(3)}  ${tr.toFixed(5)}  ${pc.toFixed(5)}  ${err.toExponential(1)}  [${e.estLo.toFixed(5)}, ${e.estHi.toFixed(5)}]  [${e.L.toFixed(5)}, ${e.U.toFixed(5)}]  ${(e.U - e.L).toExponential(2)}  ${String(e.arcs).padStart(3)}   ${(2 * e.epsBall + 2 * e.tau).toExponential(1)}          ${inside ? 'yes' : 'NO'}`);
}
console.log(`all truths inside their certified intervals: ${allIn}`);

// the held-out cancellation fixture (bridge #81): F(x) = sin(e x) - sin(2 e x) / 2 at threshold 0 on a flat map:
// the quadratic jet vanishes identically, F is odd and nonzero almost everywhere, P(F > 0) = 1/2 while P(q > 0) = 0
console.log('cancellation fixture: F = sin(e x) - sin(2 e x) / 2, threshold 0, flat map');
for (const eps of [0.2, 0.05, 0.01]) {
  const C = (eps ** 3 + 0.5 * (2 * eps) ** 3) / 6 * SIG ** 3;
  const J = { F0: MASK.t0, g: [0, 0], H: [[0, 0], [0, 0]], C, kmax: 2 * eps }; // F0 - t0 = 0: the threshold is 0 for this fixture
  const e = enclosure(J);
  console.log(`  e = ${eps}: k sigma ${(2 * eps * SIG).toFixed(3)}, conic says P(q > 0) = 0, truth 1/2, certified [${e.L.toFixed(3)}, ${e.U.toFixed(3)}] (wide, as it must be)`);
}
// the plateau (probe 5): a linear crossing through the centre of slope 0.1 delta with a fixed remainder C = 1e-3,
// delta -> 0: the model's slope vanishes against a fixed error and the interval must widen toward [0, 1]
console.log('plateau fixture: q - t = 0.1 delta x, remainder C = 1e-3 fixed, delta -> 0');
for (const delta of [1, 0.1, 0.01, 0.001]) {
  const J = { F0: MASK.t0, g: [0.1 * delta, 0], H: [[0, 0], [0, 0]], C: 1e-3, kmax: 0.1 };
  const e = enclosure(J);
  console.log(`  delta = ${delta}: certified [${e.L.toFixed(4)}, ${e.U.toFixed(4)}] width ${(e.U - e.L).toExponential(1)}`);
}
