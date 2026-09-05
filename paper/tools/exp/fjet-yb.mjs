// The Yang & Barnes benchmark through the Fourier-jet compiler: their shaders
// written once in the language, evaluated with plain numbers for the truth
// and with Fourier jets for the filtered frame. No per-shader derivation.
// Run: node paper/tools/exp/fjet-yb.mjs [--probe] [--quick] [--only=a,b]

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import * as F from './fjet.mjs';
import { Jet, Pixel } from './fjet.mjs';

const TAU = 2 * Math.PI;
const W = 480;
const H = 320;
// FJET_SIG overrides the pixel's sigma (a diagnostic: the truth and the
// compiler both use it)
const SIG = process.env.FJET_SIG ? Number(process.env.FJET_SIG) : 0.5;
const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const SAVE = args.includes('--save');
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
// FJET_DEPTH=1: trace in (X, W) with W = Y0^2 (1 / (Y0 + Y) - 1 / Y0), which is
// -Y to first order and makes 1 / d exactly linear, so the plane's s is
// exactly bilinear and t exactly linear: every count affine in (s, t) has an
// exact second-order jet (a count quadratic in s or t does not: s^2 is
// quartic in (X, W), and the harness declines depth mode where a re-trace
// away from the centre shows the model wrong). X stays the pixel's own
// coordinate, so at fixed depth it is exactly the pixel's Gaussian, and the
// compiler's exact conditioning on depth (Pixel.setDepth) integrates the
// depth nodes. Surface coordinates (p = -s / (50 v0) - X0) were tried and
// rejected: they hide a count's depth dependence in the measure's
// node-dependent mean, which the enumeration cannot see, and an off-centre
// pixel then keeps recipes that oscillate hundreds of times over the depth
// nodes. The numeric backend is unchanged.
// on by default for rows within DEPTH_ROWS of the horizon, where the
// perspective's Taylor remainder is above 1e-4 (FJET_DEPTH=0 disables,
// FJET_DEPTH=1 forces every row); the witness below declines it per pixel
// where the (X, W) model is not exact
const DEPTH = process.env.FJET_DEPTH !== '0';
const DEPTH_FORCE = process.env.FJET_DEPTH === '1';
const DEPTH_ROWS = process.env.FJET_DEPTHROWS ? Number(process.env.FJET_DEPTHROWS) : 48;
const DEPTH_NODES = process.env.FJET_DEPTHN ? Number(process.env.FJET_DEPTHN) : 32;
let depthOn = false; // per pixel: set below, and the validity probe may switch it off
const inputsAt = (O, x, y, jets) => {
  const X = jets ? new Jet(x - 240, 1, 0) : x - 240;
  let Y;
  let s;
  let t;
  if (jets && depthOn) {
    const Y0 = y + 1;
    const W = new Jet(0, 0, 1);
    const v = W.scale(1 / (Y0 * Y0)).add(Jet.c(1 / Y0)); // 1 / d, exactly linear in W
    s = X.scale(-50).mul(v);
    t = v.scale(-12000);
    Y = v.inv(); // d itself, for the lighting only (second order in W)
  } else {
    Y = jets ? new Jet(y + 1, 0, 1) : y + 1;
    s = jets ? X.scale(-50).div(Y) : (-50 * X) / Y;
    t = jets ? Jet.c(-12000).div(Y) : -12000 / Y;
  }
  const C = jets ? Jet.c(240) : 240;
  const vn = jets ? X.mul(X).add(C.mul(C)).add(Y.mul(Y)).sqrt() : Math.hypot(X, C, Y);
  const viewer = jets ? [X.div(vn), C.div(vn), Y.div(vn)] : [X / vn, C / vn, Y / vn];
  return { s, t, viewer, normal: [0, 0, 1], light: LIGHT, tangentT: [1, 0, 0], tangentB: [0, 1, 0], time: 0 };
};

// their normal_mapping for the plane, 'parallax_normal' displacement
// FJET_BUMPSCALE scales the normal map's height (ripples and bumps) for the
// frozen amplitude sweep of the held-out family; 1 is the published shader
const BUMPSCALE = process.env.FJET_BUMPSCALE ? Number(process.env.FJET_BUMPSCALE) : 1;
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
    h = O.scale(O.sin(theta), a * BUMPSCALE);
    const rinv = O.div(1, r);
    dhdu = O.mul(O.mul(O.scale(u, a * f * BUMPSCALE), rinv), O.cos(theta));
    dhdv = O.mul(O.mul(O.scale(v, a * f * BUMPSCALE), rinv), O.cos(theta));
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
    h = O.scale(O.mul(O.sin(fu), O.sin(fv)), BUMPSCALE);
    dhdu = O.scale(O.mul(O.cos(fu), O.sin(fv)), BUMPSCALE);
    dhdv = O.scale(O.mul(O.cos(fv), O.sin(fu)), BUMPSCALE);
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
  const PART = process.env.FJET_PART;
  const v = PART === 'spec' ? spec : PART === 'diff' ? O.mul(LN, ans0) : PART === 'LN' ? LN : PART === 'ss' ? O.mul(LN, ss) : PART === 'tt' ? O.mul(LN, tt) : PART === 'sstt' ? O.mul(O.mul(LN, ss), tt) : O.add(O.mul(LN, ans0), spec);
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
  const PART = process.env.FJET_PART;
  if (PART === 'spec') return [spec, spec, spec];
  if (PART === 'LN') return [LN, LN, LN];
  if (PART === 'w') return [weight, weight, weight];
  if (PART === 'diff') return [O.mul(weight, LN), O.mul(weight, LN), O.mul(weight, LN)];
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
  // the remaining published comparisons of Yang and Barnes 2018
  makeCase('zigzagRipples', 'zigzag', 'ripples'),
  makeCase('fireBumps', 'fire', 'bumps'),
  makeCase('colorCirclesBumps', 'colorCircles', 'bumps'),
  makeCase('checkerboardBumps', 'checkerboard', 'bumps'),
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
// The pixel as a mixture of narrower Gaussians: N(0, s^2) is the mixture of
// N(mu, r^2 s^2) over mu ~ N(0, (1 - r^2) s^2), discretised by Gauss-Hermite
// with n nodes per axis. Each sub-pixel is traced and expanded at its own
// centre, so the second-order model has a shorter reach where the third
// order would bite (the horizon rows). FJET_SPLIT=n turns it on for every
// probe pixel. Measured against a million samples it does not help: with
// five nodes per axis and ratio 0.5 (sub-pixels of sigma 0.25, each exact
// to 3e-4 to 6e-4 on its own) the mixture errs by 5.1e-3 at the circles'
// (240,5) and 5.8e-3 at (300,12), where the plain pixel is 1.5e-3 and 1e-3,
// because the sub-pixel value varies with its centre on the pattern's own
// scale and five Hermite nodes cannot integrate it. Kept as the record of
// the experiment; the third-order remedy is still open.
const hermiteNodes = (n) => {
  // probabilists' Hermite: roots of He_n and weights, by Newton on the recurrence
  const x = [];
  const w = [];
  // the non-negative roots by Newton from the standard initial guesses, then mirrored
  const half = [];
  for (let i = 0; i < Math.floor(n / 2) + (n % 2); i++) {
    let z = Math.sqrt(2 * n + 1) * Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    if (n % 2 === 1 && i === (n - 1) / 2) z = 0;
    let dp = 1;
    for (let it = 0; it < 60; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = z * p1 - (k - 1) * p0;
        p0 = p1;
        p1 = p2;
      }
      dp = n * p0;
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-14) break;
    }
    // weight: n! sqrt(2 pi) / (n^2 He_{n-1}(z)^2); normalised below
    let p0 = 1;
    let p1 = z;
    for (let k = 2; k <= n - 1; k++) {
      const p2 = z * p1 - (k - 1) * p0;
      p0 = p1;
      p1 = p2;
    }
    half.push([z, 1 / (n * n * p1 * p1)]);
  }
  for (const [z, wt] of half) {
    if (Math.abs(z) < 1e-12) {
      x.push(0);
      w.push(wt);
    } else {
      x.push(z, -z);
      w.push(wt, wt);
    }
  }
  const tot = w.reduce((a, b) => a + b, 0);
  return { x, w: w.map((v) => v / tot) };
};
const SPLIT = process.env.FJET_SPLIT ? Number(process.env.FJET_SPLIT) : 0;
const SPLIT_RATIO = process.env.FJET_SPLIT_RATIO ? Number(process.env.FJET_SPLIT_RATIO) : 0.5;
const oursPixelSplit = (cs, x, y, stats, n, ratio) => {
  const gh = hermiteNodes(n);
  const outer = SIG * Math.sqrt(1 - ratio * ratio);
  const acc = [0, 0, 0];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = oursPixelAt(cs, x + outer * gh.x[i], y + outer * gh.x[j], stats, SIG * ratio);
      const w = gh.w[i] * gh.w[j];
      for (let ch = 0; ch < 3; ch++) acc[ch] += w * v[ch];
    }
  return acc;
};
const oursPixel = (cs, x, y, stats) => (SPLIT ? oursPixelSplit(cs, x, y, stats, SPLIT, SPLIT_RATIO) : oursPixelAt(cs, x, y, stats, SIG));
// compare the centre model's counts and coefficients at the far depth nodes
// with a fresh trace there; returns a reason string when the model is wrong
const DEPTH_TOL = process.env.FJET_DEPTHTOL ? Number(process.env.FJET_DEPTHTOL) : 1e-4;
const depthWitness = (cs, x, y, out, px) => {
  const Y0 = y + 1;
  let worst = '';
  let worstErr = 0;
  // the corners of the reach: a count quadratic in s has its error in the
  // mixed X W terms, which a probe on the centre line X = 0 cannot see
  for (const [Xf, Yf] of [[0, -3 * px.sig], [0, 3 * px.sig], [2 * px.sig, 3 * px.sig], [-2 * px.sig, 3 * px.sig], [2 * px.sig, -3 * px.sig], [-2 * px.sig, -3 * px.sig]]) {
    const Wf = (-Y0 * Yf) / (Y0 + Yf);
    F.resetAxes();
    const far = cs.eval(FJ, x + Xf, y + Yf, true);
    for (let ch = 0; ch < out.length; ch++) {
      const A = out[ch].axes();
      const B = far[ch].axes();
      if (A.length !== B.length) return `axis count differs at Y ${Yf}`;
      for (let i = 0; i < A.length; i++) {
        if (A[i].label !== B[i].label || A[i].kind !== B[i].kind) return `axis structure differs at Y ${Yf}`;
        const model = px.countAt(A[i], [Xf, Wf]);
        const scale = A[i].kind === 'edge' ? Math.max(1, Math.abs(B[i].count.v)) : 1;
        const err = Math.abs(model - B[i].count.v) / scale;
        if (err > worstErr) {
          worstErr = err;
          worst = `count ${A[i].label}#${i} off by ${err.toExponential(1)} at Y ${Yf}`;
        }
        // a field's coefficients (the parallax scale carries the viewer)
        if (A[i].field || B[i].field) {
          if (!A[i].field || !B[i].field || A[i].field.terms.length !== B[i].field.terms.length) return `field structure differs at Y ${Yf}`;
          for (let k = 0; k < A[i].field.terms.length; k++) {
            const j = A[i].field.terms[k].c.re;
            const fm = j.v + j.gx * Xf + j.gy * Wf + 0.5 * (j.hxx * Xf * Xf + 2 * j.hxy * Xf * Wf + j.hyy * Wf * Wf);
            const fe = B[i].field.terms[k].c.re.v;
            const ferr = Math.abs(fm - fe) / Math.max(1e-3, Math.abs(fe));
            if (ferr > worstErr) {
              worstErr = ferr;
              worst = `field coefficient of ${A[i].label}#${i} off by ${ferr.toExponential(1)} at Y ${Yf}`;
            }
          }
        }
      }
      const T = out[ch].terms;
      const U = far[ch].terms;
      if (T.length !== U.length) return `term count differs at Y ${Yf}`;
      for (let i = 0; i < T.length; i++) {
        const j = T[i].c.re;
        const model = j.v + j.gx * Xf + j.gy * Wf + 0.5 * (j.hxx * Xf * Xf + 2 * j.hxy * Xf * Wf + j.hyy * Wf * Wf);
        const exact = U[i].c.re.v;
        const err = Math.abs(model - exact) / Math.max(1, Math.abs(exact));
        if (err > worstErr) {
          worstErr = err;
          worst = `coefficient of term ${i} off by ${err.toExponential(1)} at Y ${Yf}`;
        }
      }
    }
  }
  F.resetAxes();
  if (process.env.FJET_DEBUG) console.log(`      depth witness at (${x},${y}): worst ${worst}`);
  return worstErr > DEPTH_TOL ? worst : '';
};
const oursPixelAt = (cs, x, y, stats, sig) => {
  F.resetAxes();
  F.setTraceReach(6 * sig);
  const px = new Pixel(sig, process.env.FJET_CUT ? Number(process.env.FJET_CUT) : 1e-4);
  depthOn = DEPTH && (DEPTH_FORCE || y + 1 <= DEPTH_ROWS) && px.setDepth(y + 1, DEPTH_NODES);
  if (process.env.FJET_PANEL) px.localPanel = Number(process.env.FJET_PANEL);
  if (process.env.FJET_PANEL_B) px.localPanelB = Number(process.env.FJET_PANEL_B);
  if (process.env.FJET_LOCALSIG) px.localSigma = Number(process.env.FJET_LOCALSIG);
  if (process.env.FJET_PARSIN) px.parallelSin = Number(process.env.FJET_PARSIN);
  if (process.env.FJET_PARSIG) px.parallelSigma = Number(process.env.FJET_PARSIG);
  if (process.env.FJET_LINEMAX) px.lineMaxPeriods = Number(process.env.FJET_LINEMAX);
  if (process.env.FJET_FOLDGROWTH) px.foldGrowth = Number(process.env.FJET_FOLDGROWTH);
  if (process.env.FJET_CURV === '0') px.curvedWidth = false;
  if (process.env.FJET_SHIFT) px.shiftMode = process.env.FJET_SHIFT;
  if (process.env.FJET_MAXK) px.maxK = Number(process.env.FJET_MAXK);
  let out = cs.eval(FJ, x, y, true);
  // the depth model is exact for counts affine in the surface coordinates
  // and not for others (s^2 is quartic in (X, W)); a re-trace at the far
  // depth nodes is the witness: where the centre model's counts or
  // coefficients disagree with the re-trace, depth mode is declined for
  // this pixel and the ordinary (X, Y) trace is used
  if (depthOn) {
    const bad = depthWitness(cs, x, y, out, px);
    if (bad) {
      if (process.env.FJET_DEBUG) console.log(`      depth mode declined at (${x},${y}): ${bad}`);
      depthOn = false;
      px.depth = null;
      F.resetAxes();
      out = cs.eval(FJ, x, y, true);
    }
  }
  // channels with the same structure (grey shaders build three equal
  // elements) are computed once
  const done = new Map();
  const vals = out.map((el) => {
    const key = F.elementKey(el);
    if (!done.has(key)) done.set(key, px.expect(el));
    return done.get(key);
  });
  if (stats) {
    stats.terms += px.stats.terms;
    stats.recipes += px.stats.recipes;
    stats.dfts += px.stats.dfts;
    stats.overflow += px.stats.overflow;
    stats.thetaAbsMax = Math.max(stats.thetaAbsMax || 0, px.stats.thetaAbsMax || 0);
    stats.thetaHMax = Math.max(stats.thetaHMax || 0, px.stats.thetaHMax || 0);
    stats.shiftOrderMax = Math.max(stats.shiftOrderMax || 0, px.stats.shiftOrderMax || 0);
    stats.shiftGrid = px.stats.shiftAnalytic ? 'analytic' : px.shiftNG;
    stats.shiftWindow = px.stats.shiftWindow || px.shiftKW;
    stats.shiftRecipes = (stats.shiftRecipes || 0) + (px.stats.shiftRecipes || 0);
    stats.shiftAmp = (stats.shiftAmp || 0) + (px.stats.shiftAmp || 0);
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

// render rows [y0, y1) of the truth with n samples; the row's stream is
// seeded by the frame seed and the row
const renderRowsMC = (cs, n, seed, y0, y1) => {
  const out = new Float64Array((y1 - y0) * W * 3);
  for (let y = y0; y < y1; y++) {
    const r = rng(seed * 100003 + y);
    for (let x = 0; x < W; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        const [dx, dy] = gaussPair(r);
        const v = cs.eval(NUM, x + SIG * dx, y + SIG * dy, false);
        a += v[0];
        b += v[1];
        c += v[2];
      }
      const p = ((y - y0) * W + x) * 3;
      out[p] = a / n;
      out[p + 1] = b / n;
      out[p + 2] = c / n;
    }
  }
  return out;
};

// a worker evaluates rows of one case, ours or the truth, on request
if (!isMainThread) {
  const cs = CASES.find((c) => c.name === workerData.name);
  parentPort.on('message', (msg) => {
    if (msg.type === 'exit') process.exit(0);
    if (msg.type === 'truth') {
      const out = renderRowsMC(cs, msg.n, msg.seed, msg.y0, msg.y1);
      parentPort.postMessage({ type: 'truth', y0: msg.y0, y1: msg.y1, out }, [out.buffer]);
      return;
    }
    const out = new Float64Array((msg.y1 - msg.y0) * W * 3);
    const stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0 };
    for (let y = msg.y0; y < msg.y1; y++)
      for (let x = 0; x < W; x++) {
        const v = oursPixel(cs, x, y, stats);
        const p = ((y - msg.y0) * W + x) * 3;
        out[p] = v[0];
        out[p + 1] = v[1];
        out[p + 2] = v[2];
      }
    parentPort.postMessage({ type: 'rows', y0: msg.y0, y1: msg.y1, out, stats }, [out.buffer]);
  });
}

// PNG output (8-bit, the benchmark's own quantisation) and a comparison
// strip: truth, unfiltered, ours, and ten times the error
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const writePNG = (path, img, w = W, h = H) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.floor(clamp01(img[(y * w + x) * 3 + c]) * 256 - 1e-4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(path, png);
};
const writeStrip = (path, frames) => {
  const cx0 = 160;
  const cy0 = 16;
  const cw = 160;
  const ch = 60;
  const Z = 3;
  const gap = 4;
  const n = frames.length;
  const w = n * W + (n - 1) * gap;
  const h = H + gap + ch * Z;
  const img = new Float64Array(w * h * 3).fill(1);
  frames.forEach((f, i) => {
    const ox = i * (W + gap);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) img[(y * w + ox + x) * 3 + c] = f[(y * W + x) * 3 + c];
    for (let y = 0; y < ch * Z; y++)
      for (let x = 0; x < cw * Z; x++)
        for (let c = 0; c < 3; c++) img[((H + gap + y) * w + ox + x) * 3 + c] = f[((cy0 + Math.floor(y / Z)) * W + cx0 + Math.floor(x / Z)) * 3 + c];
  });
  writePNG(path, img, w, h);
};

// the frame, rows farmed out to workers; kind 'ours' or 'truth' (n, seed)
const NWORKERS = Math.max(1, Math.min(os.cpus().length - 1, 12));
const parallelFrame = (cs, kind, n, seed, progress) =>
  new Promise((resolve) => {
    const img = new Float64Array(W * H * 3);
    const stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0 };
    const chunk = kind === 'truth' ? 8 : 2;
    let next = 0;
    let done = 0;
    let finished = 0;
    const t0 = performance.now();
    const workers = [];
    const dispatch = (w) => {
      if (next >= H) {
        w.postMessage({ type: 'exit' });
        finished++;
        if (finished === workers.length) resolve({ img, stats, seconds: (performance.now() - t0) / 1000 });
        return;
      }
      const y0 = next;
      const y1 = Math.min(H, next + chunk);
      next = y1;
      w.postMessage(kind === 'truth' ? { type: 'truth', n, seed, y0, y1 } : { type: 'rows', y0, y1 });
    };
    for (let i = 0; i < NWORKERS; i++) {
      const w = new Worker(new URL(import.meta.url), { workerData: { name: cs.name } });
      workers.push(w);
      w.on('message', (msg) => {
        img.set(msg.out, msg.y0 * W * 3);
        if (msg.stats) for (const k of Object.keys(stats)) stats[k] += msg.stats[k];
        done += msg.y1 - msg.y0;
        if (progress && done % 40 < chunk) process.stdout.write(`  ${kind} row ${done}/${H} (${((performance.now() - t0) / 1000).toFixed(0)} s)\n`);
        dispatch(w);
      });
      w.on('error', (e) => {
        console.error(e);
        process.exit(1);
      });
      dispatch(w);
    }
  });

const wanted = CASES.filter((c) => !only || only.slice(7).split(',').includes(c.name));
const main = async () => {

const atArg = process.argv.find((a) => a.startsWith('--at='));
// FJET_BRUTE=N: samples of the probe's brute force (100000 by default)
const NBRUTE = process.env.FJET_BRUTE ? Number(process.env.FJET_BRUTE) : 100000;
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
      let v = NaN;
      try {
        v = oursPixel(cs, x, y, stats)[0];
      } catch (e) {
        console.log(`  (${x},${y}) FAILED: ${e.message.slice(0, 300)}`);
      }
      const ms = performance.now() - t0;
      const ref = brutePixel(cs, x, y, NBRUTE, 1);
      const pt = cs.eval(NUM, x, y, false)[0];
      const shiftInfo = stats.thetaAbsMax ? ` shift|theta|max ${stats.thetaAbsMax.toFixed(1)} theta*h ${stats.thetaHMax.toFixed(1)} order ${stats.shiftOrderMax} grid ${stats.shiftGrid} window ${stats.shiftWindow} recipes ${stats.shiftRecipes} amplification ${stats.shiftAmp.toExponential(2)}` : '';
      console.log(`  (${x},${y}) ours ${v.toFixed(5)} brute ${ref.toFixed(5)} |err| ${Math.abs(v - ref).toExponential(1)} point ${pt.toFixed(3)}  recipes ${stats.recipes} dfts ${stats.dfts} ${stats.overflow ? 'OVERFLOW' : ''} ${ms.toFixed(1)} ms${shiftInfo}`);
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
  console.log(`${cs.name}: truth on ${NWORKERS} workers...`);
  const n = QUICK ? 200 : 1000;
  // the truths are cached on disk per case and sample count: they are the
  // protocol's, not the compiler's, and cost an hour a pair
  const truthPath = (seed) => new URL(`../../data/truth-${cs.name}-${n}-${seed}.f64`, import.meta.url);
  const loadTruth = async (seed) => {
    const path = truthPath(seed);
    if (existsSync(path)) return new Float64Array(readFileSync(path).buffer.slice(0));
    const img = (await parallelFrame(cs, 'truth', n, seed, false)).img;
    writeFileSync(path, Buffer.from(img.buffer));
    return img;
  };
  const gt = await loadTruth(101);
  const gt2 = await loadTruth(202);
  const floor = rms(gt, gt2) / Math.SQRT2;
  // the unfiltered shader's time is measured single-threaded, as the
  // reference of the relative cost
  const t0 = performance.now();
  const noaa = renderMC(cs, 1, 1);
  const tNoaa = performance.now() - t0;
  const { img, stats, seconds } = await parallelFrame(cs, 'ours', 0, 0, true);
  const r = { noAA: rms(noaa, gt), ours: rms(img, gt), floor, rel: (seconds * 1000 * NWORKERS) / tNoaa, seconds, workers: NWORKERS, stats };
  results[cs.name] = r;
  if (SAVE) {
    const IMG = new URL('../../figures/', import.meta.url);
    const err = new Float64Array(W * H * 3);
    for (let i = 0; i < err.length; i++) err[i] = 10 * Math.abs(clamp01(img[i]) - clamp01(gt[i]));
    writePNG(new URL(`fjet-${cs.name}-gt.png`, IMG), gt);
    writePNG(new URL(`fjet-${cs.name}-ours.png`, IMG), img);
    writeStrip(new URL(`fjet-${cs.name}-strip.png`, IMG), [gt, noaa, img, err]);
  }
  console.log(`  no AA ${r.noAA.toFixed(4)}  ours ${r.ours.toFixed(4)}  floor ${floor.toFixed(4)}  time ${r.seconds.toFixed(0)} s on ${NWORKERS} workers (${r.rel.toFixed(0)}x single-thread)  ${JSON.stringify(stats)}`);
  writeFileSync(new URL('../../data/fjet-yb.json', import.meta.url), JSON.stringify({ protocol: { W, H, sigma: SIG, samples: QUICK ? 200 : 1000 }, results }, null, 1));
}
};
if (isMainThread && !process.env.FJET_LIB) main();
// FJET_LIB=1: import the harness as a library (no main); the cases and the
// pixel evaluators are what a debugging script needs
export { CASES, oursPixel, brutePixel, SIG, W, H, FJ, NUM };
