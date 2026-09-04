// The Yang & Barnes benchmark through the Fourier-jet compiler: their shaders
// written once in the language, evaluated with plain numbers for the truth
// and with Fourier jets for the filtered frame. No per-shader derivation.
// Run: node paper/tools/exp/fjet-yb.mjs [--probe] [--quick] [--only=a,b]

import { writeFileSync } from 'node:fs';
import * as F from './fjet.mjs';
import { Jet, Pixel } from './fjet.mjs';

const TAU = 2 * Math.PI;
const W = 480;
const H = 320;
const SIG = 0.5;
const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const QUICK = args.includes('--quick');
const only = args.find((a) => a.startsWith('--only='));

// ---------------------------------------------------------------------------
// two backends with one interface
// ---------------------------------------------------------------------------
const NUM = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  neg: (a) => -a,
  scale: (a, s) => a * s,
  sin: Math.sin,
  cos: Math.cos,
  exp: Math.exp,
  sqrt: Math.sqrt,
  pow: Math.pow,
  fract: (x) => x - Math.floor(x),
  floor: Math.floor,
  mod: (x, m) => {
    const r = x % m;
    return r < 0 ? r + m : r;
  },
  step: (x) => (x >= 0 ? 1 : 0),
  relu: (x) => (x > 0 ? x : 0),
  sign: (x) => (x > 0 ? 1 : x < 0 ? -1 : 0),
  abs: Math.abs,
  ge: (a, b) => (a >= b ? 1 : 0),
  gt: (a, b) => (a > b ? 1 : 0),
  max: Math.max,
  min: Math.min,
  select: (c, a, b) => c * a + (1 - c) * b,
  eq: (a, b) => (Math.abs(a - b) < 1e-9 ? 1 : 0),
  dot: (u, v) => u.reduce((s, x, i) => s + x * v[i], 0),
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  normalize: (v) => {
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  },
  const: (x) => x,
};
const FJ = {
  add: F.add,
  sub: F.sub,
  mul: F.mul,
  div: F.div,
  neg: F.neg,
  scale: F.scale,
  sin: F.sin,
  cos: F.cos,
  exp: F.exp,
  sqrt: F.sqrt,
  pow: F.pow,
  fract: F.fract,
  floor: F.floor,
  mod: F.mod,
  step: F.step,
  relu: F.relu,
  sign: F.sign,
  abs: F.abs,
  ge: F.ge,
  gt: F.gt,
  max: F.max,
  min: F.min,
  select: F.select,
  eq: F.eq,
  dot: F.dot,
  cross: F.cross,
  normalize: F.normalize,
  const: (x) => x,
};

// ---------------------------------------------------------------------------
// the scene: their plane, camera path 1, time 0
// ---------------------------------------------------------------------------
const LIGHT = [0.22808577638091165, 0.60822873701576452, 0.76028592126970562];
// inputs for a pixel position: numbers or jets according to the backend
const inputsAt = (O, x, y, jets) => {
  const X = jets ? new Jet(x - 240, 1, 0) : x - 240;
  const Y = jets ? new Jet(y + 1, 0, 1) : y + 1;
  const C = jets ? Jet.c(240) : 240;
  const s = jets ? X.scale(-50).div(Y) : (-50 * X) / Y;
  const t = jets ? Jet.c(-12000).div(Y) : -12000 / Y;
  const vn = jets ? X.mul(X).add(C.mul(C)).add(Y.mul(Y)).sqrt() : Math.hypot(X, C, Y);
  const viewer = jets ? [X.div(vn), C.div(vn), Y.div(vn)] : [X / vn, C / vn, Y / vn];
  return { s, t, viewer, normal: [0, 0, 1], light: LIGHT, tangentT: [1, 0, 0], tangentB: [0, 1, 0], time: 0 };
};

// their normal_mapping for the plane, 'parallax_normal' displacement
const normalMapping = (O, I, kind) => {
  if (kind === 'none') return { normal: I.normal, s: I.s, t: I.t };
  const u = I.s;
  const v = I.t;
  let h;
  let dhdu;
  let dhdv;
  if (kind === 'ripples') {
    const f = 3.0;
    const velocity = 15.0;
    const a = 1.0 / 3;
    const r2 = O.add(O.mul(u, u), O.mul(v, v));
    const r = O.sqrt(r2);
    const theta = O.sub(O.mul(r, f), I.time * velocity);
    h = O.scale(O.sin(theta), a);
    const rinv = O.div(1, r);
    dhdu = O.mul(O.mul(O.scale(u, a * f), rinv), O.cos(theta));
    dhdv = O.mul(O.mul(O.scale(v, a * f), rinv), O.cos(theta));
  } else if (kind === 'spheres') {
    const f = 0.5;
    const fu = O.sub(O.scale(O.fract(O.scale(u, f)), 2), 1);
    const fv = O.sub(O.scale(O.fract(O.scale(v, f)), 2), 1);
    const h2 = O.sub(O.sub(1, O.mul(fu, fu)), O.mul(fv, fv));
    h = O.sqrt(O.max(h2, 1e-5));
    const valid = O.gt(h2, 0);
    const hinv = O.pow(h, -0.5);
    dhdu = O.select(valid, O.mul(O.scale(fu, -2 * f), hinv), 0);
    dhdv = O.select(valid, O.mul(O.scale(fv, -2 * f), hinv), 0);
  } else if (kind === 'bumps') {
    const fu = u;
    const fv = v;
    h = O.mul(O.sin(fu), O.sin(fv));
    dhdu = O.mul(O.cos(fu), O.sin(fv));
    dhdv = O.mul(O.cos(fv), O.sin(fu));
  } else throw new Error(kind);
  // plane: cross_tangent = (0,0,1); small_t = (-1,0,0); small_b = (0,-1,0)
  const newNormal = [dhdu, dhdv, O.const(1)];
  const nl = O.sqrt(O.add(O.add(O.mul(newNormal[0], newNormal[0]), O.mul(newNormal[1], newNormal[1])), 1));
  const unit = newNormal.map((c) => O.div(c, nl));
  // parallax_normal: surface matrix is the identity on the plane
  const scaleP = O.mul(h, newNormal[2]);
  const s2 = O.add(u, O.mul(scaleP, I.viewer[0]));
  const t2 = O.add(v, O.mul(scaleP, I.viewer[1]));
  return { normal: unit, s: s2, t: t2 };
};

// lighting helpers on the (possibly perturbed) normal
const lighting = (O, normal, light, viewer, specPow, gateLN) => {
  const ln0 = O.dot(light, normal);
  const LN = O.max(ln0, 0);
  const R = normal.map((n, i) => O.sub(O.mul(O.scale(LN, 2), n), light[i]));
  let spec = O.pow(O.max(O.dot(R, viewer), 0), specPow);
  if (gateLN) spec = O.mul(O.gt(LN, 0), spec);
  return { LN, spec };
};

// ---------------------------------------------------------------------------
// their shaders, line for line
// ---------------------------------------------------------------------------
const checkerboard = (O, I) => {
  const { normal, s, t } = I;
  const xs = O.fract(O.div(s, 20));
  const ys = O.fract(O.div(t, 20));
  const ss = O.select(O.ge(xs, 0.5), 1, 0);
  const tt = O.select(O.ge(ys, 0.5), 1, 0);
  const ans0 = O.add(O.mul(ss, tt), O.mul(O.sub(1, ss), O.sub(1, tt)));
  const { LN, spec } = lighting(O, normal, I.light, I.viewer, 50, false);
  const v = O.add(O.mul(LN, ans0), spec);
  return [v, v, v];
};

const circles = (O, I) => {
  const { normal, s, t } = I;
  const circleR = 25 / 3;
  const gap = 5 / 3;
  const d = 2 * circleR + 2 * gap;
  const xm = O.sub(O.scale(O.fract(O.div(s, d)), d), gap);
  const ym = O.sub(O.scale(O.fract(O.div(t, d)), d), gap);
  const r2 = O.add(O.mul(O.sub(xm, circleR), O.sub(xm, circleR)), O.mul(O.sub(ym, circleR), O.sub(ym, circleR)));
  const r = O.sqrt(r2);
  const ans = O.sub(0.5, O.scale(O.sign(O.sub(r, circleR)), 0.5));
  const LN = O.max(O.dot(I.light, normal), 0);
  const v = O.mul(LN, ans);
  return [v, v, v];
};

const sinQuadratic = (O, I) => {
  const { normal, s, t } = I;
  const time = I.time;
  const w = 0.001;
  const cst = 0.01;
  const a = 3 * Math.cos(time) + cst;
  const b = 3 * Math.sin(time) + cst;
  const c = 3 * Math.sin(time) * Math.cos(time) + cst;
  const cx = s;
  const cy = O.add(t, 55);
  const quad = O.add(O.add(O.scale(O.mul(cx, cx), a), O.scale(O.mul(cy, cy), b)), O.scale(O.mul(cx, cy), c));
  const arg = O.add(O.scale(O.sin(O.add(cx, cy)), 0.2), O.scale(quad, 3 * w));
  const weight = O.fract(arg);
  const color = [weight, weight, O.const(1)];
  const { LN, spec } = lighting(O, normal, I.light, I.viewer, 25, true);
  return color.map((ch) => O.add(O.mul(ch, LN), spec));
};

const zigzag = (O, I) => {
  const { normal, s, t } = I;
  const LN0 = O.dot(I.light, normal);
  const R = normal.map((n, i) => O.sub(O.mul(O.scale(LN0, 2), n), I.light[i]));
  const diffuseIntensity = O.max(LN0, 0);
  const specularIntensity = O.pow(O.max(O.dot(R, I.viewer), 0), 50);
  const xarg = s;
  const yarg = t;
  const sinArg = O.add(xarg, O.scale(O.sin(yarg), 0.8));
  const modulation1 = O.add(0.5, O.scale(O.sign(O.scale(O.sin(sinArg), 0.5)), 0.5));
  const c1 = [1, 1, 1];
  const c2 = [0.3, 0.3, 1];
  const ambient = 0.1;
  const blend = O.add(0.5, O.scale(O.cos(O.scale(sinArg, 0.5)), 0.5));
  const diffuseSum = c1.map((v1, i) => O.mul(modulation1, O.add(v1, O.scale(blend, c2[i] - v1))));
  const baseDiffuse = O.scale(diffuseIntensity, 0.8);
  return diffuseSum.map((ds) => O.add(O.add(O.mul(baseDiffuse, ds), specularIntensity), ambient));
};

const colorCircles = (O, I) => {
  const { normal, s, t } = I;
  const circleR = 25 / 3;
  const gap = 5 / 3;
  const d = 2 * circleR + 2 * gap;
  const xm = O.sub(O.scale(O.fract(O.div(s, d)), d), gap);
  const ym = O.sub(O.scale(O.fract(O.div(t, d)), d), gap);
  const r = O.sqrt(O.add(O.mul(O.sub(xm, circleR), O.sub(xm, circleR)), O.mul(O.sub(ym, circleR), O.sub(ym, circleR))));
  const xf = O.floor(O.div(s, d));
  const yf = O.floor(O.div(t, d));
  const rVar = O.scale(O.add(O.add(0.8, O.scale(O.sin(O.add(xf, yf)), 0.1)), O.scale(O.cos(O.sub(xf, yf)), 0.1)), circleR);
  const indicator = O.sub(0.5, O.scale(O.sign(O.sub(r, rVar)), 0.5));
  const color = [O.add(0.6, O.scale(O.sin(O.div(s, 10)), 0.4)), O.const(0), O.add(0.5, O.scale(O.cos(O.div(t, 10)), 0.5))];
  const { LN, spec } = lighting(O, normal, I.light, I.viewer, 25, true);
  return color.map((ch) => O.add(O.mul(O.mul(ch, LN), indicator), spec));
};

// fire: interpolate_color_4
const palette = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 0.27, 0],
  [1, 0.65, 0],
  [1, 1, 0],
  [1, 1, 1],
];
const colorInterp = (O, sArg) => {
  const n = palette.length;
  const sMod = O.mod(sArg, n);
  const sFrac = O.sub(1, O.fract(sArg));
  const lerp = (c1, c2) => c1.map((v1, i) => O.add(O.mul(sFrac, v1), O.mul(O.sub(1, sFrac), c2[i])));
  let color = lerp(palette[0], palette[1]);
  for (let i = 1; i < n; i++) {
    const cand = lerp(palette[i], palette[(i + 1) % n]);
    const g = O.ge(sMod, i);
    color = color.map((c, j) => O.select(g, cand[j], c));
  }
  return color;
};
const fire = (O, I) => {
  const { normal, s, t } = I;
  const time = I.time;
  const x = s;
  const y = O.add(t, 55);
  const sinArg = O.add(x, O.scale(O.sin(y), 0.8));
  const modulation1 = O.add(0.5, O.scale(O.sign(O.scale(O.sin(sinArg), 0.5)), 0.5));
  const base = O.add(O.scale(O.sin(O.add(O.scale(O.mul(x, x), 0.005), time)), 2), O.add(y, 5 * time));
  const s1 = base;
  const s2 = O.add(base, palette.length / 4);
  const cA = colorInterp(O, s1);
  const cB = colorInterp(O, s2);
  const sel = O.ge(modulation1, 1);
  const color = cA.map((c, i) => O.select(sel, c, cB[i]));
  const { LN, spec } = lighting(O, normal, I.light, I.viewer, 25, true);
  return color.map((ch) => O.add(O.mul(ch, LN), spec));
};

const SHADERS = { checkerboard, circles, sinQuadratic, zigzag, colorCircles, fire };

// a case: shader with a normal map
const makeCase = (name, shaderName, mapKind) => ({
  name,
  eval: (O, x, y, jets) => {
    const I = inputsAt(O, x, y, jets);
    const m = normalMapping(O, I, mapKind);
    return SHADERS[shaderName](O, { ...I, normal: m.normal, s: m.s, t: m.t });
  },
});
const CASES = [
  makeCase('checkerboard', 'checkerboard', 'none'),
  makeCase('circles', 'circles', 'none'),
  makeCase('sinQuadratic', 'sinQuadratic', 'none'),
  makeCase('zigzag', 'zigzag', 'none'),
  makeCase('colorCircles', 'colorCircles', 'none'),
  makeCase('fire', 'fire', 'none'),
  makeCase('checkerboardRipples', 'checkerboard', 'ripples'),
  makeCase('sinQuadraticRipples', 'sinQuadratic', 'ripples'),
];

// ---------------------------------------------------------------------------
// truth, ours, metrics
// ---------------------------------------------------------------------------
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gaussPair = (r) => {
  const u1 = 1 - r();
  const u2 = r();
  const m = Math.sqrt(-2 * Math.log(u1));
  return [m * Math.cos(TAU * u2), m * Math.sin(TAU * u2)];
};
const renderMC = (cs, n, seed) => {
  const img = new Float64Array(W * H * 3);
  const r = rng(seed);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        let dx = 0;
        let dy = 0;
        if (n > 1) [dx, dy] = gaussPair(r);
        const v = cs.eval(NUM, x + SIG * dx, y + SIG * dy, false);
        a += v[0];
        b += v[1];
        c += v[2];
      }
      const p = (y * W + x) * 3;
      img[p] = a / n;
      img[p + 1] = b / n;
      img[p + 2] = c / n;
    }
  return img;
};
const brutePixel = (cs, x, y, n, seed, ch = 0) => {
  const r = rng(seed);
  let a = 0;
  for (let i = 0; i < n; i++) {
    const [dx, dy] = gaussPair(r);
    a += cs.eval(NUM, x + SIG * dx, y + SIG * dy, false)[ch];
  }
  return a / n;
};
const oursPixel = (cs, x, y, stats) => {
  F.resetAxes();
  const px = new Pixel(SIG, 1e-4);
  const out = cs.eval(FJ, x, y, true);
  const vals = out.map((el) => px.expect(el));
  if (stats) {
    stats.terms += px.stats.terms;
    stats.recipes += px.stats.recipes;
    stats.dfts += px.stats.dfts;
    stats.overflow += px.stats.overflow;
  }
  return vals;
};
const clamp01 = (v) => (Number.isNaN(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v);
const rms = (a, b) => {
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    const d = clamp01(a[i]) - clamp01(b[i]);
    acc += d * d;
  }
  return Math.sqrt(acc / a.length);
};

const wanted = CASES.filter((c) => !only || only.slice(7).split(',').includes(c.name));

const atArg = process.argv.find((a) => a.startsWith('--at='));
const PROBE_AT = atArg ? atArg.slice(5).split(';').map((p) => p.split(',').map(Number)) : null;
if (PROBE) {
  for (const cs of wanted) {
    console.log(cs.name);
    for (const [x, y] of PROBE_AT || [
      [240, 300],
      [100, 300],
      [240, 200],
      [60, 200],
      [240, 120],
      [100, 120],
      [240, 60],
      [400, 60],
      [240, 34],
      [120, 34],
      [240, 20],
      [300, 12],
      [240, 5],
      [30, 5],
    ]) {
      const stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0 };
      const t0 = performance.now();
      const v = oursPixel(cs, x, y, stats)[0];
      const ms = performance.now() - t0;
      const ref = brutePixel(cs, x, y, 100000, 1);
      const pt = cs.eval(NUM, x, y, false)[0];
      console.log(`  (${x},${y}) ours ${v.toFixed(5)} brute ${ref.toFixed(5)} |err| ${Math.abs(v - ref).toExponential(1)} point ${pt.toFixed(3)}  recipes ${stats.recipes} dfts ${stats.dfts} ${stats.overflow ? 'OVERFLOW' : ''} ${ms.toFixed(1)} ms`);
    }
  }
  process.exit(0);
}

// --stride=N: a sub-sampled frame, every N-th pixel in x and y, each against
// its own brute force; reports the RMS over the sample, the brute noise, the
// time per pixel and the frame time it implies, and the worst pixels
const strideArg = process.argv.find((a) => a.startsWith('--stride='));
if (strideArg) {
  const N = parseInt(strideArg.slice(9), 10);
  const NS = 4000;
  for (const cs of wanted) {
    const stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0 };
    const rows = [];
    let acc = 0;
    let count = 0;
    let tOurs = 0;
    let worst = 0;
    for (let y = N >> 1; y < H; y += N)
      for (let x = N >> 1; x < W; x += N) {
        const t0 = performance.now();
        const v = oursPixel(cs, x, y, stats);
        const ms = performance.now() - t0;
        tOurs += ms;
        const ref = [0, 1, 2].map((ch) => brutePixel(cs, x, y, NS, 7, ch));
        for (let ch = 0; ch < 3; ch++) {
          const d = clamp01(v[ch]) - clamp01(ref[ch]);
          acc += d * d;
          count++;
          if (Math.abs(d) > worst) worst = Math.abs(d);
        }
        rows.push({ x, y, err: Math.max(...[0, 1, 2].map((ch) => Math.abs(clamp01(v[ch]) - clamp01(ref[ch])))), ms });
      }
    rows.sort((a, b) => b.err - a.err);
    const slow = [...rows].sort((a, b) => b.ms - a.ms);
    const perPx = tOurs / rows.length;
    console.log(`${cs.name}: stride ${N}, ${rows.length} px: rms ${Math.sqrt(acc / count).toFixed(4)} (brute noise ~${(0.3 / Math.sqrt(NS)).toFixed(4)}), worst ${worst.toExponential(1)}, ${perPx.toFixed(1)} ms/px -> frame ${((perPx * W * H) / 1000).toFixed(0)} s ${stats.overflow ? 'OVERFLOW ' + stats.overflow : ''}`);
    console.log('  worst:', rows.slice(0, 6).map((r) => `(${r.x},${r.y}) ${r.err.toExponential(1)}`).join('  '));
    console.log('  slowest:', slow.slice(0, 6).map((r) => `(${r.x},${r.y}) ${r.ms.toFixed(0)}ms`).join('  '));
  }
  process.exit(0);
}

const results = {};
for (const cs of wanted) {
  console.log(`${cs.name}: truth...`);
  const n = QUICK ? 200 : 1000;
  const gt = renderMC(cs, n, 101);
  const gt2 = renderMC(cs, n, 202);
  const floor = rms(gt, gt2) / Math.SQRT2;
  const t0 = performance.now();
  const noaa = renderMC(cs, 1, 1);
  const tNoaa = performance.now() - t0;
  const img = new Float64Array(W * H * 3);
  const stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0 };
  const t1 = performance.now();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = oursPixel(cs, x, y, stats);
      const p = (y * W + x) * 3;
      img[p] = v[0];
      img[p + 1] = v[1];
      img[p + 2] = v[2];
    }
    if (y % 40 === 39) process.stdout.write(`  row ${y + 1}/${H} (${((performance.now() - t1) / 1000).toFixed(0)} s)\n`);
  }
  const tOurs = performance.now() - t1;
  const r = { noAA: rms(noaa, gt), ours: rms(img, gt), floor, rel: tOurs / tNoaa, seconds: tOurs / 1000, stats };
  results[cs.name] = r;
  console.log(`  no AA ${r.noAA.toFixed(4)}  ours ${r.ours.toFixed(4)}  floor ${floor.toFixed(4)}  time ${r.seconds.toFixed(0)} s (${r.rel.toFixed(0)}x)  ${JSON.stringify(stats)}`);
}
writeFileSync(new URL('../../data/fjet-yb.json', import.meta.url), JSON.stringify({ protocol: { W, H, sigma: SIG, samples: QUICK ? 200 : 1000 }, results }, null, 1));
