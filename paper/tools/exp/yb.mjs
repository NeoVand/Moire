// The Yang & Barnes (Eurographics 2018) procedural-shader band-limiting
// benchmark, reproduced from their public code (MIT), with the count-map
// method run against it. Their protocol: a 480x320 frame, plane geometry,
// camera path 1 at time 0, ground truth the mean of 1000 samples jittered by
// a Gaussian of sigma 0.5 pixel, values clamped to [0,1], the error the RMS
// over pixels and channels. Their published numbers (Figures 1 and 5) for
// the plane: circles with no parallax mapping 0.148 unfiltered, 0.035 theirs
// at 4x; checkerboard with ripples 0.194 and 0.071 at 2x; quadratic sine with
// ripples 0.184 and 0.045 at 2x.
//
// The scene, from their C++ solver: pixel (x, y) with x in [0,480), y in
// [0,320); ray (x-240, y+1, 240) rotated to (-(x-240), -240, -(y+1)) from
// the origin (0,0,50); the plane z=0 is hit at s = -50(x-240)/(y+1),
// t = -12000/(y+1); the texture coordinate is (s,t); the normal (0,0,1); the
// light (0.228, 0.608, 0.760); the viewer direction the unit vector from
// the hit point back to the camera.
//
// Run: node paper/tools/exp/yb.mjs [--probe] [--quick] [--only=name,name]

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../../data/yb.json', import.meta.url);
const IMG = new URL('../../figures/', import.meta.url);
const TAU = 2 * Math.PI;
const W = 480;
const H = 320;
const SIG = 0.5;
const args = process.argv.slice(2);
const PROBE = args.includes('--probe');
const argNum = (name, dflt) => {
  const a = args.find((v) => v.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : dflt;
};
// term budget: keep a Fourier term when its first-order weight times its
// coefficient exceeds CUT; use the Fourier route when the harmonic box is
// at most CROSS terms, else the direct integral; use the first-order weight
// alone when the pixel's curvature term is under CURV
const CUT = argNum('cut', 1e-4);
const CROSS = argNum('cross', 600);
const CURV = argNum('curv', 0.02);
const RIPPLE_QUAD_MAX = argNum('rq', 1.8);
// below this ripple sigma the lighting means use nine Gauss-Hermite nodes; the
// highlight is a peak of width 0.1 to 0.3 radians, so this is only safe when
// the window is narrower than that, which this scene never reaches
const SLOW_LIGHT = argNum('slowlight', 0.05);
// The hybrid: where a pixel's estimated term count exceeds BUDGET, the sums
// give way to NSAMP stratified Gaussian samples of the shader itself. Set at
// run time by the sweep.
let BUDGET = argNum('budget', Infinity);
let NSAMP = argNum('samples', 64);
const SWEEP = args.includes('--sweep');
const DIAG = args.includes('--diag');
const QUICK = args.includes('--quick');

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
const LIGHT = [0.22808577638091165, 0.60822873701576452, 0.76028592126970562];
const LN = LIGHT[2];
const REFL = [-LIGHT[0], -LIGHT[1], 2 * LN - LIGHT[2]];

const scene = (x, y) => {
  const yp = y + 1;
  const s = (-50 * (x - 240)) / yp;
  const t = -12000 / yp;
  const vx = x - 240;
  const vy = 240;
  const vz = yp;
  const vn = Math.hypot(vx, vy, vz);
  const rv = (REFL[0] * vx + REFL[1] * vy + REFL[2] * vz) / vn;
  return { s, t, rv };
};
const fract = (x) => x - Math.floor(x);

// derivatives of s and t in pixel coordinates
const deriv = (x, y) => {
  const yp = y + 1;
  return {
    s: [-50 / yp, (50 * (x - 240)) / (yp * yp)],
    t: [0, 12000 / (yp * yp)],
    Hs: [
      [0, 50 / (yp * yp)],
      [50 / (yp * yp), (-100 * (x - 240)) / (yp * yp * yp)],
    ],
    Ht: [
      [0, 0],
      [0, -24000 / (yp * yp * yp)],
    ],
  };
};

// ---------------------------------------------------------------------------
// Shaders, as written in their code
// ---------------------------------------------------------------------------
const checkerboard = (x, y, out) => {
  const { s, t, rv } = scene(x, y);
  const ss = fract(s / 20) >= 0.5 ? 1 : 0;
  const tt = fract(t / 20) >= 0.5 ? 1 : 0;
  const chk = ss * tt + (1 - ss) * (1 - tt);
  const v = LN * chk + Math.pow(Math.max(rv, 0), 50);
  out[0] = v;
  out[1] = v;
  out[2] = v;
};

const QA = 3 * Math.cos(0) + 0.01;
const QB = 3 * Math.sin(0) + 0.01;
const QC = 3 * Math.sin(0) * Math.cos(0) + 0.01;
const sinQuadratic = (x, y, out) => {
  const { s, t, rv } = scene(x, y);
  const cx = s;
  const cy = t + 55;
  const phi = 0.2 * Math.sin(cx + cy) + 3 * 0.001 * (QA * cx * cx + QB * cy * cy + QC * cx * cy);
  const w = fract(phi);
  const spec = Math.pow(Math.max(rv, 0), 25);
  out[0] = w * LN + spec;
  out[1] = w * LN + spec;
  out[2] = LN + spec;
};

// The 'ripples' normal map with 'parallax_normal' displacement, from their
// normal_mapping(): h = (1/3) sin(3 r), r = sqrt(s^2 + t^2); the perturbed
// normal is (dh/ds, dh/dt, 1) normalised; the texture coordinate is moved by
// h times the viewer direction's x and y.
const ripples = (x, y) => {
  const yp = y + 1;
  const s = (-50 * (x - 240)) / yp;
  const t = -12000 / yp;
  const vx0 = x - 240;
  const vy0 = 240;
  const vz0 = yp;
  const vn = Math.hypot(vx0, vy0, vz0);
  const vx = vx0 / vn;
  const vy = vy0 / vn;
  const vz = vz0 / vn;
  const r = Math.hypot(s, t);
  const th = 3 * r;
  const h = Math.sin(th) / 3;
  const c = Math.cos(th);
  const dhds = (s / r) * c;
  const dhdt = (t / r) * c;
  const nl = Math.hypot(dhds, dhdt, 1);
  const n = [dhds / nl, dhdt / nl, 1 / nl];
  const ln = Math.max(LIGHT[0] * n[0] + LIGHT[1] * n[1] + LIGHT[2] * n[2], 0);
  const R = [2 * ln * n[0] - LIGHT[0], 2 * ln * n[1] - LIGHT[1], 2 * ln * n[2] - LIGHT[2]];
  const rv = R[0] * vx + R[1] * vy + R[2] * vz;
  return { s: s + h * vx, t: t + h * vy, ln, rv };
};

const checkerboardRipples = (x, y, out) => {
  const { s, t, ln, rv } = ripples(x, y);
  const ss = fract(s / 20) >= 0.5 ? 1 : 0;
  const tt = fract(t / 20) >= 0.5 ? 1 : 0;
  const chk = ss * tt + (1 - ss) * (1 - tt);
  const v = ln * chk + Math.pow(Math.max(rv, 0), 50);
  out[0] = v;
  out[1] = v;
  out[2] = v;
};

const sinQuadraticRipples = (x, y, out) => {
  const { s, t, ln, rv } = ripples(x, y);
  const cx = s;
  const cy = t + 55;
  const phi = 0.2 * Math.sin(cx + cy) + 3 * 0.001 * (QA * cx * cx + QB * cy * cy + QC * cx * cy);
  const w = fract(phi);
  const spec = (ln > 0 ? 1 : 0) * Math.pow(Math.max(rv, 0), 25);
  out[0] = w * ln + spec;
  out[1] = w * ln + spec;
  out[2] = ln + spec;
};

// Circles: a disc of radius 25/3 at (10,10) of each 20 by 20 cell, diffuse only
const CR = 25 / 3;
const CGAP = 5 / 3;
const CD = 2 * CR + 2 * CGAP;
const circles = (x, y, out) => {
  const { s, t } = scene(x, y);
  const xm = fract(s / CD) * CD - CGAP;
  const ym = fract(t / CD) * CD - CGAP;
  const r = Math.hypot(xm - CR, ym - CR);
  const sg = r > CR ? 1 : r < CR ? -1 : 0;
  const v = LN * (0.5 - 0.5 * sg);
  out[0] = v;
  out[1] = v;
  out[2] = v;
};

// ---------------------------------------------------------------------------
// Monte Carlo renderers: the unfiltered frame, the ground truth, MSAA
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

const renderMC = (shader, n, seed) => {
  const img = new Float64Array(W * H * 3);
  const r = rng(seed);
  const out = [0, 0, 0];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let a = 0;
      let b = 0;
      let c = 0;
      for (let i = 0; i < n; i++) {
        let dx = 0;
        let dy = 0;
        if (n > 1) [dx, dy] = gaussPair(r);
        shader(x + SIG * dx, y + SIG * dy, out);
        a += out[0];
        b += out[1];
        c += out[2];
      }
      const p = (y * W + x) * 3;
      img[p] = a / n;
      img[p + 1] = b / n;
      img[p + 2] = c / n;
    }
  return img;
};

// Stratified Gaussian supersampling of a shader at one pixel: n by n strata
// in (radius, angle), shifted per pixel by a hash, so the pattern is a
// randomly shifted stratification and not a comb.
const hash2 = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  const a = (h >>> 0) / 4294967296;
  let g = (x * 2654435761 + y * 40503) | 0;
  g = Math.imul(g ^ (g >>> 15), 2246822519);
  g ^= g >>> 13;
  return [a, (g >>> 0) / 4294967296];
};
// the pattern is built once per sample count: n by n strata in (radius,
// angle) with a golden offset in angle per radial stratum; per pixel it is
// rotated by a hashed angle, which keeps the Gaussian and breaks the comb
let patternN = -1;
let patternX = null;
let patternY = null;
const buildPattern = () => {
  const n = Math.max(1, Math.round(Math.sqrt(NSAMP)));
  patternN = NSAMP;
  patternX = new Float64Array(n * n);
  patternY = new Float64Array(n * n);
  const gold = 0.6180339887498949;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const u1 = (i + 0.5) / n;
    const r = Math.sqrt(-2 * Math.log(1 - u1));
    for (let j = 0; j < n; j++) {
      const u2 = ((j + 0.5) / n + i * gold) % 1;
      patternX[idx] = SIG * r * Math.cos(TAU * u2);
      patternY[idx] = SIG * r * Math.sin(TAU * u2);
      idx++;
    }
  }
};
const superSample = (shader, x, y, out) => {
  if (patternN !== NSAMP) buildPattern();
  const [h] = hash2(x, y);
  const ca = Math.cos(TAU * h);
  const sa = Math.sin(TAU * h);
  const tmp = [0, 0, 0];
  let a = 0;
  let b = 0;
  let c = 0;
  const m = patternX.length;
  for (let i = 0; i < m; i++) {
    const px = patternX[i];
    const py = patternY[i];
    shader(x + ca * px - sa * py, y + sa * px + ca * py, tmp);
    a += tmp[0];
    b += tmp[1];
    c += tmp[2];
  }
  out[0] = a / m;
  out[1] = b / m;
  out[2] = c / m;
};

// ---------------------------------------------------------------------------
// The count-map method: Gaussian expectations in input space
// ---------------------------------------------------------------------------
// E exp(i b.z + (i/2) z^T Q z) for z ~ N(0, sig^2 I): the second-order
// pushforward of one Fourier term through a count with Hessian.
const qphase = (b, Q, sig) => {
  const r2 = sig * sig;
  const m00 = [1 / r2, -Q[0][0]];
  const m01 = [0, -Q[0][1]];
  const m11 = [1 / r2, -Q[1][1]];
  const cm = (u, v) => [u[0] * v[0] - u[1] * v[1], u[0] * v[1] + u[1] * v[0]];
  const p1 = cm(m00, m11);
  const p2 = cm(m01, m01);
  const det = [p1[0] - p2[0], p1[1] - p2[1]];
  const bx = b[0];
  const by = b[1];
  const num = [m11[0] * bx * bx - 2 * m01[0] * bx * by + m00[0] * by * by, m11[1] * bx * bx - 2 * m01[1] * bx * by + m00[1] * by * by];
  const dd = det[0] * det[0] + det[1] * det[1];
  const quad = [(num[0] * det[0] + num[1] * det[1]) / dd, (num[1] * det[0] - num[0] * det[1]) / dd];
  const ex = -0.5 * quad[0];
  if (ex < -40) return [0, 0];
  const ey = -0.5 * quad[1];
  const tr = r2 * (Q[0][0] + Q[1][1]);
  const dq = r2 * r2 * (Q[0][0] * Q[1][1] - Q[0][1] * Q[0][1]);
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - dq));
  const root = (l) => {
    const mod = Math.hypot(1, l);
    const ang = Math.atan2(-l, 1) / 2;
    return [Math.sqrt(mod) * Math.cos(ang), Math.sqrt(mod) * Math.sin(ang)];
  };
  const den = cm(root(tr / 2 + disc), root(tr / 2 - disc));
  const e = Math.exp(ex);
  const ez = [e * Math.cos(ey), e * Math.sin(ey)];
  const dn = den[0] * den[0] + den[1] * den[1];
  return [(ez[0] * den[0] + ez[1] * den[1]) / dn, (ez[1] * den[0] - ez[0] * den[1]) / dn];
};

const curvature = (Hs) => SIG * SIG * Hs.reduce((m, r) => Math.max(m, ...r.map(Math.abs)), 0);

// the same, scalar in and out (QP_RE, QP_IM), for the hot loops
let QP_RE = 0;
let QP_IM = 0;
const qphaseS = (bx, by, q00, q01, q11, sig) => {
  const r2 = sig * sig;
  const ir = 1 / r2;
  // M = Sigma^{-1} - i Q: m00 = ir - i q00, m01 = -i q01, m11 = ir - i q11
  // det = m00 m11 - m01^2
  const detR = ir * ir - q00 * q11 + q01 * q01;
  const detI = -ir * (q00 + q11);
  // num = m11 bx^2 - 2 m01 bx by + m00 by^2
  const numR = ir * bx * bx + ir * by * by;
  const numI = -q11 * bx * bx + 2 * q01 * bx * by - q00 * by * by;
  const dd = detR * detR + detI * detI;
  const quadR = (numR * detR + numI * detI) / dd;
  const quadI = (numI * detR - numR * detI) / dd;
  const ex = -0.5 * quadR;
  if (ex < -40) {
    QP_RE = 0;
    QP_IM = 0;
    return;
  }
  const ey = -0.5 * quadI;
  const tr = r2 * (q00 + q11);
  const dq = r2 * r2 * (q00 * q11 - q01 * q01);
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - dq));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  // principal roots of (1 - i l) without trigonometry:
  // sqrt(1 - i l) = sqrt((|w| + 1)/2) - i sign(l) sqrt((|w| - 1)/2), |w| = sqrt(1 + l^2)
  const w1 = Math.sqrt(1 + l1 * l1);
  const r1r = Math.sqrt((w1 + 1) / 2);
  const r1i = -(l1 < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (w1 - 1) / 2));
  const w2 = Math.sqrt(1 + l2 * l2);
  const r2r = Math.sqrt((w2 + 1) / 2);
  const r2i = -(l2 < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (w2 - 1) / 2));
  const dr = r1r * r2r - r1i * r2i;
  const di = r1r * r2i + r1i * r2r;
  const dn = dr * dr + di * di;
  const e = Math.exp(ex);
  const er = e * Math.cos(ey);
  const ei = e * Math.sin(ey);
  QP_RE = (er * dr + ei * di) / dn;
  QP_IM = (ei * dr - er * di) / dn;
};

// standard normal cdf
const Phi = (z) => {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
};
// erf-grade cdf for the direct integrals (A&S 7.1.26 is 1.5e-7; use a
// better one: Cody-style rational via erfc is overkill; refine with a
// series around 0 and the asymptotic tail)
const erf = (x) => {
  const ax = Math.abs(x);
  if (ax > 6) return x < 0 ? -1 : 1;
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return x < 0 ? -y : y;
};
const cdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

// P(fract(U) >= 1/2) for U ~ N(mu, sig^2)
const probHalf1 = (mu, sig) => {
  if (sig < 1e-9) return fract(mu) >= 0.5 ? 1 : 0;
  if (sig > 2.5) {
    // Fourier: 1/2 - sum_{k odd} (2/(pi k)) sin(2 pi k mu) e^{-2 pi^2 sig^2 k^2}
    let v = 0.5;
    for (let k = 1; k < 20; k += 2) {
      const w = Math.exp(-2 * Math.PI * Math.PI * sig * sig * k * k);
      if (w < 1e-12) break;
      v -= ((2 / (Math.PI * k)) * Math.sin(TAU * k * mu)) * w;
    }
    return v;
  }
  const lo = Math.floor(mu - 6 * sig) - 1;
  const hi = Math.ceil(mu + 6 * sig) + 1;
  let p = 0;
  for (let n = lo; n <= hi; n++) p += cdf((n + 1 - mu) / sig) - cdf((n + 0.5 - mu) / sig);
  return p;
};

// Gauss-Legendre nodes on [-1,1]
const GL = [
  [-0.9602898565, 0.1012285363],
  [-0.7966664774, 0.2223810345],
  [-0.525532409, 0.3137066459],
  [-0.1834346425, 0.3626837834],
  [0.1834346425, 0.3626837834],
  [0.525532409, 0.3137066459],
  [0.7966664774, 0.2223810345],
  [0.9602898565, 0.1012285363],
];

// P(fract(U) >= 1/2, fract(V) >= 1/2) for a bivariate normal, by integrating
// over the variable with the smaller sigma and conditioning the other
const probHalf2 = (muU, sigU, muV, sigV, rho) => {
  if (sigU > sigV) return probHalf2(muV, sigV, muU, sigU, rho);
  if (sigU < 1e-9) {
    if (fract(muU) < 0.5) return 0;
    return probHalf1(muV, sigV);
  }
  const sigC = sigV * Math.sqrt(Math.max(0, 1 - rho * rho));
  const lo = Math.floor(muU - 6 * sigU) - 1;
  const hi = Math.ceil(muU + 6 * sigU) + 1;
  let p = 0;
  for (let n = lo; n <= hi; n++) {
    const a = Math.max(n + 0.5, muU - 6 * sigU);
    const b = Math.min(n + 1, muU + 6 * sigU);
    if (b <= a) continue;
    // panels no wider than 1.5 sigma, so eight nodes resolve the density
    const panels = Math.ceil((b - a) / (2 * sigU));
    for (let q = 0; q < panels; q++) {
      const pa = a + ((b - a) * q) / panels;
      const pb = a + ((b - a) * (q + 1)) / panels;
      const half = (pb - pa) / 2;
      const mid = (pa + pb) / 2;
      for (const [node, wt] of GL) {
        const u = mid + half * node;
        const dens = Math.exp((-(u - muU) * (u - muU)) / (2 * sigU * sigU)) / (sigU * Math.sqrt(TAU));
        const muC = muV + (rho * sigV * (u - muU)) / sigU;
        p += wt * half * dens * probHalf1(muC, sigC);
      }
    }
  }
  return p;
};

// Fourier coefficients of the half-duty square wave 1[fract(u) >= 1/2]
const sqCoef = (k) => {
  if (k === 0) return [0.5, 0];
  if (k % 2 === 0) return [0, 0];
  return [0, 1 / (Math.PI * k)];
};

const specFiltered = (x, y, pow) => {
  // the highlight is broad: centre value plus the second-order Gaussian term
  const f = (xx, yy) => Math.pow(Math.max(scene(xx, yy).rv, 0), pow);
  const h = 0.5;
  const c = f(x, y);
  const lap = (f(x + h, y) + f(x - h, y) + f(x, y + h) + f(x, y - h) - 4 * c) / (h * h);
  return c + 0.5 * SIG * SIG * lap;
};

// The checkerboard: chk = 1/2 + 2 (sq(u) - 1/2)(sq(v) - 1/2), u = s/20, v = t/20,
// and sq - 1/2 has odd harmonics only, so
//   E[chk] = 1/2 - (4/pi^2) sum_{k>0 odd} sum_{l odd} cos(2 pi (k mu_u + l mu_v)) w_kl / (k l).
// Far and mid field: that sum, with the Gaussian weight and the phase advanced
// by recurrences (a term is a handful of flops); near field: the joint
// probability directly, and no integral at all when no edge is in the window.
const oursCheckerboard = (x, y, out, stats) => {
  const { s, t } = scene(x, y);
  const d = deriv(x, y);
  const muU = s / 20;
  const muV = t / 20;
  const gu = [d.s[0] / 20, d.s[1] / 20];
  const gv = [d.t[0] / 20, d.t[1] / 20];
  const sigU = SIG * Math.hypot(gu[0], gu[1]);
  const sigV = SIG * Math.hypot(gv[0], gv[1]);
  const reach = Math.sqrt(-2 * Math.log(CUT));
  const Ku = Math.ceil(reach / (TAU * Math.max(sigU, 1e-6)));
  const Kv = Math.ceil(reach / (TAU * Math.max(sigV, 1e-6)));
  let chk;
  if (Ku * Kv <= CROSS) {
    const cross = Math.abs(gu[0] * gv[1] - gu[1] * gv[0]);
    if (-Math.log(CUT) / (8 * Math.PI * SIG * SIG * Math.max(cross, 1e-12)) > BUDGET) {
      superSample(checkerboard, x, y, out);
      if (stats) stats.sampled++;
      return;
    }
    const Hu = d.Hs.map((r) => r.map((e) => e / 20));
    const Hv = d.Ht.map((r) => r.map((e) => e / 20));
    const cu = TAU * curvature(Hu);
    const cv = TAU * curvature(Hv);
    // exponent of the weight: -(A k^2 + 2 B k l + C l^2)
    const A = 2 * Math.PI * Math.PI * SIG * SIG * (gu[0] * gu[0] + gu[1] * gu[1]);
    const B = 2 * Math.PI * Math.PI * SIG * SIG * (gu[0] * gv[0] + gu[1] * gv[1]);
    const C = 2 * Math.PI * Math.PI * SIG * SIG * (gv[0] * gv[0] + gv[1] * gv[1]);
    const lnCut = Math.log(CUT);
    let acc = 0;
    let terms = 0;
    const lmax = Math.min(Kv, 401) | 1;
    for (let l = -lmax; l <= lmax; l += 2) {
      // the k that survive lie near k* = -B l / A within the reach
      const kc = (-B * l) / A;
      const kr = Math.sqrt(Math.max(0, (-lnCut - C * l * l + (B * B * l * l) / A) / A));
      if (!(kr > 0)) continue;
      let k0 = Math.max(1, Math.floor(kc - kr));
      if (k0 % 2 === 0) k0 += 1;
      const k1 = Math.min(Math.ceil(kc + kr), 401);
      if (k1 < k0) continue;
      if (k1 * cu + Math.abs(l) * cv >= CURV) {
        for (let k = k0; k <= k1; k += 2) {
          const bx = TAU * (k * gu[0] + l * gv[0]);
          const by = TAU * (k * gu[1] + l * gv[1]);
          qphaseS(bx, by, TAU * (k * Hu[0][0] + l * Hv[0][0]), TAU * (k * Hu[0][1] + l * Hv[0][1]), TAU * (k * Hu[1][1] + l * Hv[1][1]), SIG);
          const ph = TAU * (k * muU + l * muV);
          acc += (Math.cos(ph) * QP_RE - Math.sin(ph) * QP_IM) / (k * l);
          terms++;
        }
      } else {
        // recurrences in k (step 2): weight w_k = exp(-(A k^2 + 2 B k l + C l^2)),
        // w_{k+2} = w_k exp(-(4A(k+1) + 4 B l)); phase rotates by 4 pi mu_u
        let k = k0;
        let w = Math.exp(-(A * k * k + 2 * B * k * l + C * l * l));
        let m = Math.exp(-(4 * A * (k + 1) + 4 * B * l));
        const mm = Math.exp(-8 * A);
        let ph = TAU * (k * muU + l * muV);
        let c = Math.cos(ph);
        let sn = Math.sin(ph);
        const rc = Math.cos(2 * TAU * muU);
        const rs = Math.sin(2 * TAU * muU);
        for (; k <= k1; k += 2) {
          acc += (c * w) / (k * l);
          terms++;
          w *= m;
          m *= mm;
          const c2 = c * rc - sn * rs;
          sn = sn * rc + c * rs;
          c = c2;
        }
      }
    }
    chk = 0.5 - (4 / (Math.PI * Math.PI)) * acc;
    if (stats) {
      stats.fourier++;
      stats.terms += terms;
    }
  } else {
    // direct. An edge of sq sits at every half integer.
    const straddle = (mu, sig) => Math.floor(2 * (mu - 6 * sig)) !== Math.floor(2 * (mu + 6 * sig));
    const su = straddle(muU, sigU);
    const sv = straddle(muV, sigV);
    let e; // E[(sq_u - 1/2)(sq_v - 1/2)]
    if (!su && !sv) e = (fract(muU) >= 0.5 ? 0.5 : -0.5) * (fract(muV) >= 0.5 ? 0.5 : -0.5);
    else if (!su) e = (fract(muU) >= 0.5 ? 0.5 : -0.5) * (probHalf1(muV, sigV) - 0.5);
    else if (!sv) e = (fract(muV) >= 0.5 ? 0.5 : -0.5) * (probHalf1(muU, sigU) - 0.5);
    else {
      const cov = SIG * SIG * (gu[0] * gv[0] + gu[1] * gv[1]);
      const rho = cov / (sigU * sigV);
      const pu = probHalf1(muU, sigU);
      const pv = probHalf1(muV, sigV);
      const puv = probHalf2(muU, sigU, muV, sigV, rho);
      e = puv - 0.5 * pu - 0.5 * pv + 0.25;
    }
    chk = 0.5 + 2 * e;
    if (stats) stats.direct++;
  }
  const v = LN * chk + specFiltered(x, y, 50);
  out[0] = v;
  out[1] = v;
  out[2] = v;
};

// Bessel J_m(z) for m = 0..M by Miller's backward recurrence
const besselRow = (z, M) => {
  const J = new Float64Array(M + 1);
  if (z === 0) {
    J[0] = 1;
    return J;
  }
  const start = Math.max(M + 2, Math.ceil(z + 20 + 2 * Math.sqrt(z))) + 20;
  let jp1 = 0;
  let j = 1e-30;
  let norm = 0;
  const tmp = new Float64Array(start + 2);
  tmp[start] = j;
  for (let m = start; m >= 1; m--) {
    const jm1 = ((2 * m) / z) * j - jp1;
    jp1 = j;
    j = jm1;
    tmp[m - 1] = j;
    if (Math.abs(j) > 1e250) {
      for (let i = m - 1; i <= start; i++) tmp[i] *= 1e-250;
      j *= 1e-250;
      jp1 *= 1e-250;
    }
  }
  norm = tmp[0];
  for (let m = 2; m <= start; m += 2) norm += 2 * tmp[m];
  for (let m = 0; m <= M; m++) J[m] = tmp[m] / norm;
  return J;
};
const besselCache = new Map();
const besselJ = (k) => {
  // J_m(0.4 pi k) for all m needed at harmonic k
  if (!besselCache.has(k)) {
    const z = 0.4 * Math.PI * k;
    besselCache.set(k, besselRow(z, Math.ceil(z + 12 + 3 * Math.cbrt(z + 1))));
  }
  return besselCache.get(k);
};
const J = (k, m) => {
  const row = besselJ(k);
  const am = Math.abs(m);
  if (am >= row.length) return 0;
  const v = row[am];
  return m < 0 && am % 2 === 1 ? -v : v;
};

// E[fract(Phi)] for Phi ~ N(mu, sig^2), by the floor's expectation
const expectFract1 = (mu, sig) => {
  if (sig < 1e-9) return fract(mu);
  const lo = Math.floor(mu - 7 * sig) - 1;
  const hi = Math.ceil(mu + 7 * sig) + 1;
  let ef = 0;
  for (let n = lo; n <= hi; n++) ef += n * (cdf((n + 1 - mu) / sig) - cdf((n - mu) / sig));
  return mu - ef;
};

// The quadratic sine: w = fract(q + 0.2 sin psi), q the quadratic count and
// psi = s + t + 55 a second count carrying the field. On the 2-torus,
// fract(q + 0.2 sin psi) = 1/2 + sum_{k != 0} (i/(2 pi k)) e^{2 pi i k q}
// sum_m J_m(0.4 pi k) e^{i m psi}; each (k, m) term is pushed through the
// pixel with its own rate and Hessian.
const oursSinQuadratic = (x, y, out, stats) => {
  const { s, t } = scene(x, y);
  const d = deriv(x, y);
  const cx = s;
  const cy = t + 55;
  const g = 0.003;
  const gq = [0, 1];
  const Hq = [
    [0, 0],
    [0, 0],
  ];
  for (let i = 0; i < 2; i++) {
    gq[i] = g * (2 * QA * cx * d.s[i] + 2 * QB * cy * d.t[i] + QC * (cy * d.s[i] + cx * d.t[i]));
    for (let j = 0; j < 2; j++)
      Hq[i][j] =
        g *
        (2 * QA * (d.s[i] * d.s[j] + cx * d.Hs[i][j]) +
          2 * QB * (d.t[i] * d.t[j] + cy * d.Ht[i][j]) +
          QC * (d.s[i] * d.t[j] + d.t[i] * d.s[j] + cy * d.Hs[i][j] + cx * d.Ht[i][j]));
  }
  const muq = g * (QA * cx * cx + QB * cy * cy + QC * cx * cy);
  const mupsi = cx + cy;
  const gpsi = [d.s[0] + d.t[0], d.s[1] + d.t[1]];
  const Hpsi = [
    [d.Hs[0][0] + d.Ht[0][0], d.Hs[0][1] + d.Ht[0][1]],
    [d.Hs[1][0] + d.Ht[1][0], d.Hs[1][1] + d.Ht[1][1]],
  ];
  const sigPsi = SIG * Math.hypot(gpsi[0], gpsi[1]);
  let w;
  if (sigPsi < 0.15) {
    // the field is slow across the pixel: fold it into the count
    const cps = Math.cos(mupsi);
    const sps = Math.sin(mupsi);
    const gphi = [gq[0] + 0.2 * cps * gpsi[0], gq[1] + 0.2 * cps * gpsi[1]];
    const sigPhi = SIG * Math.hypot(gphi[0], gphi[1]);
    if (sigPhi < 0.04) {
      w = expectFract1(muq + 0.2 * sps, sigPhi);
      if (stats) stats.direct++;
    } else {
      const Hphi = [
        [Hq[0][0] + 0.2 * (cps * Hpsi[0][0] - sps * gpsi[0] * gpsi[0]), Hq[0][1] + 0.2 * (cps * Hpsi[0][1] - sps * gpsi[0] * gpsi[1])],
        [Hq[1][0] + 0.2 * (cps * Hpsi[1][0] - sps * gpsi[1] * gpsi[0]), Hq[1][1] + 0.2 * (cps * Hpsi[1][1] - sps * gpsi[1] * gpsi[1])],
      ];
      const muphi = muq + 0.2 * sps;
      let acc = 0.5;
      let terms = 0;
      const K = Math.min(Math.ceil(1.1 / sigPhi) + 2, 300);
      for (let k = 1; k <= K; k++) {
        const b = [TAU * k * gphi[0], TAU * k * gphi[1]];
        const Q = [
          [TAU * k * Hphi[0][0], TAU * k * Hphi[0][1]],
          [TAU * k * Hphi[1][0], TAU * k * Hphi[1][1]],
        ];
        const m = qphase(b, Q, SIG);
        // 2 Re[(i/(2 pi k)) e^{2 pi i k mu} m] = -(1/(pi k)) Im[e^{...} m]
        const ph = TAU * k * muphi;
        const im = Math.sin(ph) * m[0] + Math.cos(ph) * m[1];
        acc -= im / (Math.PI * k);
        terms++;
      }
      w = acc;
      if (stats) {
        stats.fourier++;
        stats.terms += terms;
      }
    }
  } else {
    // the field oscillates within the pixel: the two-torus sum. Per k, the m
    // that survive lie near m* where the combined rate is least; the weight
    // exp(-(a k^2 + 2 b k m + c m^2)) and the phase advance by recurrences
    // in m, and the second-order pushforward is used only where the pixel's
    // curvature term matters.
    const S = SIG * SIG;
    const a = 2 * Math.PI * Math.PI * S * (gq[0] * gq[0] + gq[1] * gq[1]);
    const b = Math.PI * S * (gq[0] * gpsi[0] + gq[1] * gpsi[1]);
    const c = 0.5 * S * (gpsi[0] * gpsi[0] + gpsi[1] * gpsi[1]);
    const varMin = Math.max(0, a - (b * b) / c); // residual exponent per k^2 after the best m
    const lnCut = Math.log(CUT);
    const K = Math.min(Math.ceil(Math.sqrt(-lnCut / Math.max(varMin, 1e-9))) + 2, 400);
    if (K * (2 * Math.sqrt(-lnCut / c) + 1) * 0.7 > BUDGET) {
      superSample(sinQuadratic, x, y, out);
      if (stats) stats.sampled++;
      return;
    }
    const cq = TAU * curvature(Hq);
    const cpsi = curvature(Hpsi);
    let acc = 0.5;
    let terms = 0;
    const rc = Math.cos(mupsi);
    const rs = Math.sin(mupsi);
    for (let k = 1; k <= K; k++) {
      const row = besselJ(k);
      const mStar = (-b * k) / c;
      const mr = Math.sqrt(Math.max(0, (-lnCut - varMin * k * k) / c));
      const mlo = Math.max(-(row.length - 1), Math.ceil(mStar - mr));
      const mhi = Math.min(row.length - 1, Math.floor(mStar + mr));
      if (mhi < mlo) {
        if (varMin * k * k > -lnCut) break;
        continue;
      }
      let sumIm = 0;
      if (k * cq + Math.max(Math.abs(mlo), Math.abs(mhi)) * cpsi >= CURV) {
        for (let m = mlo; m <= mhi; m++) {
          const jm = J(k, m);
          if (Math.abs(jm) < 1e-10) continue;
          qphaseS(TAU * k * gq[0] + m * gpsi[0], TAU * k * gq[1] + m * gpsi[1], TAU * k * Hq[0][0] + m * Hpsi[0][0], TAU * k * Hq[0][1] + m * Hpsi[0][1], TAU * k * Hq[1][1] + m * Hpsi[1][1], SIG);
          const ph = TAU * k * muq + m * mupsi;
          sumIm += jm * (Math.cos(ph) * QP_IM + Math.sin(ph) * QP_RE);
          terms++;
        }
      } else {
        let m = mlo;
        let w = Math.exp(-(a * k * k + 2 * b * k * m + c * m * m));
        let mul = Math.exp(-(2 * c * m + c + 2 * b * k));
        const mm = Math.exp(-2 * c);
        const ph0 = TAU * k * muq + m * mupsi;
        let cs = Math.cos(ph0);
        let sn = Math.sin(ph0);
        for (; m <= mhi; m++) {
          const jm = J(k, m);
          sumIm += jm * sn * w;
          terms++;
          w *= mul;
          mul *= mm;
          const c2 = cs * rc - sn * rs;
          sn = sn * rc + cs * rs;
          cs = c2;
        }
      }
      acc -= sumIm / (Math.PI * k);
    }
    w = acc;
    if (stats) {
      stats.torus++;
      stats.terms += terms;
    }
  }
  const spec = specFiltered(x, y, 25);
  out[0] = w * LN + spec;
  out[1] = w * LN + spec;
  out[2] = LN + spec;
};

// J1 by the Numerical Recipes rational approximations, 1e-8
const besselJ1 = (x) => {
  const ax = Math.abs(x);
  let ans;
  if (ax < 8) {
    const y = x * x;
    const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.4826 + y * -30.16036606)))));
    const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y * 1.0))));
    ans = a1 / a2;
  } else {
    const z = 8 / ax;
    const y = z * z;
    const xx = ax - 2.356194491;
    const a1 = 1.0 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
    const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
    ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
    if (x < 0) ans = -ans;
  }
  return ans;
};
// coefficient of the disc indicator (radius CR/CD at (1/2,1/2)) at recipe (k,l)
const discCoef = (k, l) => {
  const rr = CR / CD;
  const rho = Math.hypot(k, l);
  const sgn = (k + l) % 2 === 0 ? 1 : -1;
  if (rho === 0) return Math.PI * rr * rr;
  const z = TAU * rr * rho;
  return sgn * Math.PI * rr * rr * ((2 * besselJ1(z)) / z);
};
// P(pixel point inside a disc of the cell lattice) for a bivariate normal
const probDisc = (muU, sigU, muV, sigV, rho) => {
  if (sigU > sigV) return probDisc(muV, sigV, muU, sigU, rho);
  const rr = CR / CD;
  const sigC = sigV * Math.sqrt(Math.max(0, 1 - rho * rho));
  const lo = Math.floor(muU - 6 * sigU);
  const hi = Math.ceil(muU + 6 * sigU);
  let p = 0;
  for (let n = lo; n <= hi; n++) {
    const cu = n + 0.5;
    const a = Math.max(cu - rr, muU - 6 * sigU);
    const b = Math.min(cu + rr, muU + 6 * sigU);
    if (b <= a) continue;
    const panels = Math.ceil((b - a) / (2 * sigU));
    for (let q = 0; q < panels; q++) {
      const pa = a + ((b - a) * q) / panels;
      const pb = a + ((b - a) * (q + 1)) / panels;
      const half = (pb - pa) / 2;
      const mid = (pa + pb) / 2;
      for (const [node, wt] of GL) {
        const u = mid + half * node;
        const dens = Math.exp((-(u - muU) * (u - muU)) / (2 * sigU * sigU)) / (sigU * Math.sqrt(TAU));
        const muC = muV + (rho * sigV * (u - muU)) / sigU;
        const chord = Math.sqrt(Math.max(0, rr * rr - (u - cu) * (u - cu)));
        // the v-extent of the disc in every cell row near muC
        let pv = 0;
        const mlo = Math.floor(muC - 6 * sigC - 1);
        const mhi = Math.ceil(muC + 6 * sigC + 1);
        for (let m = mlo; m <= mhi; m++) {
          const cv = m + 0.5;
          if (sigC < 1e-9) pv += Math.abs(muC - cv) < chord ? 1 : 0;
          else pv += cdf((cv + chord - muC) / sigC) - cdf((cv - chord - muC) / sigC);
        }
        p += wt * half * dens * pv;
      }
    }
  }
  return p;
};

// the disc's coefficients, tabulated once
const DISC_K = 401;
const discTable = new Float64Array((2 * DISC_K + 1) * (2 * DISC_K + 1));
for (let k = -DISC_K; k <= DISC_K; k++) for (let l = -DISC_K; l <= DISC_K; l++) discTable[(k + DISC_K) * (2 * DISC_K + 1) + (l + DISC_K)] = discCoef(k, l);
const discC = (k, l) => discTable[(k + DISC_K) * (2 * DISC_K + 1) + (l + DISC_K)];

const oursCircles = (x, y, out, stats) => {
  const { s, t } = scene(x, y);
  const d = deriv(x, y);
  const muU = s / CD;
  const muV = t / CD;
  const gu = [d.s[0] / CD, d.s[1] / CD];
  const gv = [d.t[0] / CD, d.t[1] / CD];
  const sigU = SIG * Math.hypot(gu[0], gu[1]);
  const sigV = SIG * Math.hypot(gv[0], gv[1]);
  const reach = Math.sqrt(-2 * Math.log(CUT));
  const Ku = Math.ceil(reach / (TAU * Math.max(sigU, 1e-6)));
  const Kv = Math.ceil(reach / (TAU * Math.max(sigV, 1e-6)));
  const rr = CR / CD;
  let disc;
  if (Ku * Kv <= CROSS) {
    const cross = Math.abs(gu[0] * gv[1] - gu[1] * gv[0]);
    if (-Math.log(CUT) / (2 * Math.PI * SIG * SIG * Math.max(cross, 1e-12)) > BUDGET) {
      superSample(circles, x, y, out);
      if (stats) stats.sampled++;
      return;
    }
    const Hu = d.Hs.map((r) => r.map((e) => e / CD));
    const Hv = d.Ht.map((r) => r.map((e) => e / CD));
    const cu = TAU * curvature(Hu);
    const cv = TAU * curvature(Hv);
    const A = 2 * Math.PI * Math.PI * SIG * SIG * (gu[0] * gu[0] + gu[1] * gu[1]);
    const B = 2 * Math.PI * Math.PI * SIG * SIG * (gu[0] * gv[0] + gu[1] * gv[1]);
    const C = 2 * Math.PI * Math.PI * SIG * SIG * (gv[0] * gv[0] + gv[1] * gv[1]);
    const lnCut = Math.log(CUT);
    let acc = 0;
    let terms = 0;
    const lmax = Math.min(Kv, DISC_K);
    for (let l = -lmax; l <= lmax; l++) {
      const kc = (-B * l) / A;
      const kr = Math.sqrt(Math.max(0, (-lnCut - C * l * l + (B * B * l * l) / A) / A));
      if (!(kr >= 0)) continue;
      const k0 = Math.max(-DISC_K, Math.floor(kc - kr));
      const k1 = Math.min(DISC_K, Math.ceil(kc + kr));
      if (k1 < k0) continue;
      if (Math.max(Math.abs(k0), Math.abs(k1)) * cu + Math.abs(l) * cv >= CURV) {
        for (let k = k0; k <= k1; k++) {
          const c = discC(k, l);
          if (Math.abs(c) < 1e-9) continue;
          const bx = TAU * (k * gu[0] + l * gv[0]);
          const by = TAU * (k * gu[1] + l * gv[1]);
          qphaseS(bx, by, TAU * (k * Hu[0][0] + l * Hv[0][0]), TAU * (k * Hu[0][1] + l * Hv[0][1]), TAU * (k * Hu[1][1] + l * Hv[1][1]), SIG);
          const ph = TAU * (k * muU + l * muV);
          acc += c * (Math.cos(ph) * QP_RE - Math.sin(ph) * QP_IM);
          terms++;
        }
      } else {
        let k = k0;
        let w = Math.exp(-(A * k * k + 2 * B * k * l + C * l * l));
        let m = Math.exp(-(A * (2 * k + 1) + 2 * B * l));
        const mm = Math.exp(-2 * A);
        const ph = TAU * (k * muU + l * muV);
        let c = Math.cos(ph);
        let sn = Math.sin(ph);
        const rc = Math.cos(TAU * muU);
        const rs = Math.sin(TAU * muU);
        for (; k <= k1; k++) {
          acc += discC(k, l) * c * w;
          terms++;
          w *= m;
          m *= mm;
          const c2 = c * rc - sn * rs;
          sn = sn * rc + c * rs;
          c = c2;
        }
      }
    }
    disc = acc;
    if (stats) {
      stats.fourier++;
      stats.terms += terms;
    }
  } else {
    // direct, with early-outs: the window box against the nearest disc
    const cu = Math.floor(muU) + 0.5;
    const cv = Math.floor(muV) + 0.5;
    const du = Math.abs(muU - cu);
    const dv = Math.abs(muV - cv);
    const hu = 6 * sigU;
    const hv = 6 * sigV;
    // farthest and nearest corner distances to the disc centre of the cell
    const far = Math.hypot(du + hu, dv + hv);
    const nearU = Math.max(0, du - hu);
    const nearV = Math.max(0, dv - hv);
    const near = Math.hypot(nearU, nearV);
    // and to the neighbouring cells' discs the window could reach
    const reachesNeighbour = du + hu > 1 - rr || dv + hv > 1 - rr;
    if (far < rr) disc = 1;
    else if (near > rr && !reachesNeighbour) disc = 0;
    else {
      const cov = SIG * SIG * (gu[0] * gv[0] + gu[1] * gv[1]);
      const rho = cov / (sigU * sigV);
      disc = probDisc(muU, sigU, muV, sigV, rho);
    }
    if (stats) stats.direct++;
  }
  const v = LN * disc;
  out[0] = v;
  out[1] = v;
  out[2] = v;
};

// ---------------------------------------------------------------------------
// Ripples: the shader is a picture on the 3-torus (u, v, theta). Per pixel the
// lighting LN and the highlight are even periodic functions of theta (they
// depend on cos theta only), expanded in cosine harmonics; the parallax offset
// u + a sin theta couples the counts through Bessel factors; every (k, l, N)
// term is pushed through the pixel at its own rate 2 pi (k grad u + l grad v)
// + N grad theta, the (k, l) that survive for a given N lying in an ellipse
// around the point where that rate vanishes. Near the camera the ripple is
// slow and the checker's direct route is integrated over theta by quadrature.
// ---------------------------------------------------------------------------
const NH = 64; // theta samples for the lighting harmonics
const HMAX = 32;
const cosTab = new Float64Array(NH * (HMAX + 1));
for (let j = 0; j < NH; j++) for (let n = 0; n <= HMAX; n++) cosTab[j * (HMAX + 1) + n] = Math.cos((TAU * j * n) / NH);

const besselJ0 = (x) => {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = 57568490574.0 + y * (-13362590354.0 + y * (651619640.7 + y * (-11214424.18 + y * (77392.33017 + y * -184.9052456))));
    const a2 = 57568490411.0 + y * (1029532985.0 + y * (9494680.718 + y * (59272.64853 + y * (267.8532712 + y * 1.0))));
    return a1 / a2;
  }
  const z = 8 / ax;
  const y = z * z;
  const xx = ax - 0.785398164;
  const a1 = 1.0 + y * (-0.1098628627e-2 + y * (0.2734510407e-4 + y * (-0.2073370639e-5 + y * 0.2093887211e-6)));
  const a2 = -0.1562499995e-1 + y * (0.1430488765e-3 + y * (-0.6911147651e-5 + y * (0.7621095161e-6 - y * 0.934935152e-7)));
  return Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
};
// J_0..J_4 at once: series for small z, forward recurrence otherwise
const besselJ04 = (z, out) => {
  const az = Math.abs(z);
  if (az < 2.5) {
    const h = z / 2;
    const h2 = h * h;
    for (let n = 0; n <= 4; n++) {
      let term = 1;
      for (let i = 1; i <= n; i++) term *= h / i;
      let sum = term;
      for (let j = 1; j < 14; j++) {
        term *= -h2 / (j * (j + n));
        sum += term;
      }
      out[n] = sum;
    }
  } else {
    out[0] = besselJ0(z);
    out[1] = besselJ1(z);
    for (let n = 1; n < 4; n++) out[n + 1] = ((2 * n) / z) * out[n] - out[n - 1];
  }
};
const JB = new Float64Array(5);

const rippleGeometry = (x, y) => {
  const yp = y + 1;
  const s = (-50 * (x - 240)) / yp;
  const t = -12000 / yp;
  const d = deriv(x, y);
  const r = Math.hypot(s, t);
  const dx = s / r;
  const dy = t / r;
  const theta0 = 3 * r;
  const gr = [(s * d.s[0] + t * d.t[0]) / r, (s * d.s[1] + t * d.t[1]) / r];
  const gth = [3 * gr[0], 3 * gr[1]];
  const Hth = [
    [0, 0],
    [0, 0],
  ];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) Hth[i][j] = (3 * (d.s[i] * d.s[j] + s * d.Hs[i][j] + d.t[i] * d.t[j] + t * d.Ht[i][j])) / r - 3 * gr[i] * gr[j] / r;
  const vx0 = x - 240;
  const vy0 = 240;
  const vz0 = yp;
  const vn = Math.hypot(vx0, vy0, vz0);
  const v = [vx0 / vn, vy0 / vn, vz0 / vn];
  return { s, t, d, dx, dy, theta0, gth, Hth, v };
};

// cosine harmonics of LN(theta) and spec(theta) = max(R.v, 0)^pow at a pixel
const lightingHarmonics = (dx, dy, v, pow, Lc, Sc) => {
  const ldir = LIGHT[0] * dx + LIGHT[1] * dy;
  Lc.fill(0);
  Sc.fill(0);
  for (let j = 0; j < NH; j++) {
    const c = Math.cos((TAU * j) / NH);
    const nl = Math.sqrt(1 + c * c);
    const nx = (dx * c) / nl;
    const ny = (dy * c) / nl;
    const nz = 1 / nl;
    const ln = Math.max(LIGHT[0] * nx + LIGHT[1] * ny + LIGHT[2] * nz, 0);
    const rv = (2 * ln * nx - LIGHT[0]) * v[0] + (2 * ln * ny - LIGHT[1]) * v[1] + (2 * ln * nz - LIGHT[2]) * v[2];
    const sp = Math.pow(Math.max(rv, 0), pow);
    void ldir;
    for (let n = 0; n <= HMAX; n++) {
      const cs = cosTab[j * (HMAX + 1) + n];
      Lc[n] += ln * cs;
      Sc[n] += sp * cs;
    }
  }
  for (let n = 0; n <= HMAX; n++) {
    const f = n === 0 ? 1 / NH : 2 / NH;
    Lc[n] *= f;
    Sc[n] *= f;
  }
};

// E[f(theta)] for f = c0 + sum c_n cos(n theta) under the pixel's pushforward
const expectHarmonics = (coef, theta0, gth, Hth) => {
  const sigT = SIG * Math.hypot(gth[0], gth[1]);
  const ct = curvature(Hth);
  let acc = coef[0];
  for (let n = 1; n <= HMAX; n++) {
    if (Math.abs(coef[n]) < 1e-9) continue;
    let w;
    if (n * ct >= CURV) {
      const m = qphase([n * gth[0], n * gth[1]], [[n * Hth[0][0], n * Hth[0][1]], [n * Hth[1][0], n * Hth[1][1]]], SIG);
      w = Math.cos(n * theta0) * m[0] - Math.sin(n * theta0) * m[1];
    } else {
      const e = Math.exp(-0.5 * n * n * sigT * sigT);
      if (e < 1e-12) break;
      w = Math.cos(n * theta0) * e;
    }
    acc += coef[n] * w;
  }
  return acc;
};

const LcBuf = new Float64Array(HMAX + 1);
const ScBuf = new Float64Array(HMAX + 1);

// Where the ripple is slow across the pixel, E[LN] and E[spec] are Gaussian
// expectations of smooth functions of theta: nine Gauss-Hermite nodes.
const GH9 = [
  [-4.512745863, 2.234584401e-5],
  [-3.205429003, 2.789141321e-3],
  [-2.076847979, 4.991640676e-2],
  [-1.023255663, 0.2440975029],
  [0, 0.4062513223],
  [1.023255663, 0.2440975029],
  [2.076847979, 4.991640676e-2],
  [3.205429003, 2.789141321e-3],
  [4.512745863, 2.234584401e-5],
];
const lightingMeansSlow = (dx, dy, v, pow, theta0, sigT) => {
  let ln = 0;
  let sp = 0;
  for (const [node, wt] of GH9) {
    const th = theta0 + Math.SQRT2 * sigT * node;
    const c = Math.cos(th);
    const nl = Math.sqrt(1 + c * c);
    const nx = (dx * c) / nl;
    const ny = (dy * c) / nl;
    const nz = 1 / nl;
    const l = Math.max(LIGHT[0] * nx + LIGHT[1] * ny + LIGHT[2] * nz, 0);
    const rv = (2 * l * nx - LIGHT[0]) * v[0] + (2 * l * ny - LIGHT[1]) * v[1] + (2 * l * nz - LIGHT[2]) * v[2];
    ln += wt * l;
    sp += wt * Math.pow(Math.max(rv, 0), pow);
  }
  // the weights above are already normalised to one
  return [ln, sp];
};

const oursCheckerboardRipples = (x, y, out, stats) => {
  const g = rippleGeometry(x, y);
  const { s, t, d, dx, dy, theta0, gth, Hth, v } = g;
  const a = v[0] / 60; // parallax amplitude in cells
  const b = v[1] / 60;
  const muU = s / 20;
  const muV = t / 20;
  const gu = [d.s[0] / 20, d.s[1] / 20];
  const gv = [d.t[0] / 20, d.t[1] / 20];
  const sigU = SIG * Math.hypot(gu[0], gu[1]);
  const sigV = SIG * Math.hypot(gv[0], gv[1]);
  const sigT = SIG * Math.hypot(gth[0], gth[1]);
  const reach = Math.sqrt(-2 * Math.log(CUT));
  const Ku = Math.ceil(reach / (TAU * Math.max(sigU, 1e-6)));
  const Kv = Math.ceil(reach / (TAU * Math.max(sigV, 1e-6)));
  // the budget decision comes before any per-pixel precomputation
  const fourierRoute = Ku * Kv <= CROSS;
  const straddle = (mu, sig, off) => Math.floor(2 * (mu - 6 * sig - off)) !== Math.floor(2 * (mu + 6 * sig + off));
  if (fourierRoute) {
    const Nmax0 = Math.min(HMAX + 2, Math.ceil(reach / Math.max(sigT, 1e-6)));
    const cross = Math.abs(gu[0] * gv[1] - gu[1] * gv[0]);
    const ellipse = -Math.log(CUT) / (2 * Math.PI * SIG * SIG * Math.max(cross, 1e-12));
    if ((2 * Nmax0 + 1) * Math.max(1, ellipse / 4) > BUDGET) {
      superSample(checkerboardRipples, x, y, out);
      if (stats) stats.sampled++;
      return;
    }
  } else if (straddle(muU, sigU, Math.abs(a)) || straddle(muV, sigV, Math.abs(b))) {
    if (((10 * sigT) / Math.min(0.6 * sigT, 0.5)) * 8 * 3 > BUDGET) {
      superSample(checkerboardRipples, x, y, out);
      if (stats) stats.sampled++;
      return;
    }
  }
  let spec;
  let meanLNslow = null;
  if (!fourierRoute && sigT < SLOW_LIGHT) {
    const mm = lightingMeansSlow(dx, dy, v, 50, theta0, sigT);
    meanLNslow = mm[0];
    spec = mm[1];
  } else {
    lightingHarmonics(dx, dy, v, 50, LcBuf, ScBuf);
    spec = expectHarmonics(ScBuf, theta0, gth, Hth);
  }
  let val;
  if (fourierRoute) {
    // (k, l, N) sum
    const Hu = d.Hs.map((r) => r.map((e) => e / 20));
    const Hv = d.Ht.map((r) => r.map((e) => e / 20));
    const cu = TAU * curvature(Hu);
    const cv = TAU * curvature(Hv);
    const ct = curvature(Hth);
    const A = 2 * Math.PI * Math.PI * SIG * SIG * (gu[0] * gu[0] + gu[1] * gu[1]);
    const B = 2 * Math.PI * Math.PI * SIG * SIG * (gu[0] * gv[0] + gu[1] * gv[1]);
    const C = 2 * Math.PI * Math.PI * SIG * SIG * (gv[0] * gv[0] + gv[1] * gv[1]);
    const lnCut = Math.log(CUT);
    // inverse of M = [gu gv] (columns) for the N-shifted centre
    const det = gu[0] * gv[1] - gv[0] * gu[1];
    const Nmax = Math.min(HMAX + 2, Math.ceil(reach / Math.max(sigT, 1e-6)));
    let acc = 0; // sum of L-weighted checker terms, E[LN * (chk - 1/2)] * ... see below
    let terms = 0;
    // E[LN chk] = E[LN]/2 + 2 E[LN (sq_u-1/2)(sq_v-1/2)]; the second is the (k,l odd) sum
    for (let N = -Nmax; N <= Nmax; N++) {
      // coefficient e^{i N theta} of LN, before the parallax coupling: L_N
      const LN_N = (n) => (n === 0 ? LcBuf[0] : Math.abs(n) <= HMAX ? LcBuf[Math.abs(n)] / 2 : 0);
      // theta-weight bound for this N: skip if even the best (k,l) is negligible is handled by the ellipse
      const kc = (-N * (gv[1] * gth[0] - gv[0] * gth[1])) / (TAU * det);
      const lc = (-N * (-gu[1] * gth[0] + gu[0] * gth[1])) / (TAU * det);
      const lr = Math.sqrt(Math.max(0, (-lnCut) / (C - (B * B) / A)));
      const l0 = Math.ceil(lc - lr);
      const l1 = Math.floor(lc + lr);
      for (let l = l0; l <= l1; l++) {
        if (l % 2 === 0) continue;
        const dl = l - lc;
        const kcen = kc - (B * dl) / A;
        const kr = Math.sqrt(Math.max(0, (-lnCut - C * dl * dl + (B * B * dl * dl) / A) / A));
        let k0 = Math.ceil(kcen - kr);
        const k1 = Math.floor(kcen + kr);
        if (k0 % 2 === 0) k0 += 1;
        if (k1 < k0) continue;
        const secondOrder = Math.max(Math.abs(k0), Math.abs(k1)) * cu + Math.abs(l) * cv + Math.abs(N) * ct >= CURV;
        for (let k = k0; k <= k1; k += 2) {
          // parallax coupling: sum_m L_{N-m} J_m(z), z = 2 pi (k a + l b)
          const z = TAU * (k * a + l * b);
          besselJ04(z, JB);
          const coefL =
            LN_N(N) * JB[0] +
            (LN_N(N - 1) - LN_N(N + 1)) * JB[1] +
            (LN_N(N - 2) + LN_N(N + 2)) * JB[2] +
            (LN_N(N - 3) - LN_N(N + 3)) * JB[3] +
            (LN_N(N - 4) + LN_N(N + 4)) * JB[4];
          if (Math.abs(coefL) < 1e-12) continue;
          const bx = TAU * (k * gu[0] + l * gv[0]) + N * gth[0];
          const by = TAU * (k * gu[1] + l * gv[1]) + N * gth[1];
          const ph = TAU * (k * muU + l * muV) + N * theta0;
          let re;
          if (secondOrder) {
            qphaseS(bx, by, TAU * (k * Hu[0][0] + l * Hv[0][0]) + N * Hth[0][0], TAU * (k * Hu[0][1] + l * Hv[0][1]) + N * Hth[0][1], TAU * (k * Hu[1][1] + l * Hv[1][1]) + N * Hth[1][1], SIG);
            re = Math.cos(ph) * QP_RE - Math.sin(ph) * QP_IM;
          } else {
            const e = 0.5 * SIG * SIG * (bx * bx + by * by);
            if (e > -lnCut + 2) continue;
            re = Math.cos(ph) * Math.exp(-e);
          }
          // checker coefficient at odd (k,l): -2/(pi^2 k l), and the term is real
          acc += (-2 / (Math.PI * Math.PI * k * l)) * coefL * re;
          terms++;
        }
      }
    }
    const meanLN = expectHarmonics(LcBuf, theta0, gth, Hth);
    val = 0.5 * meanLN + acc;
    if (stats) {
      stats.fourier++;
      stats.terms += terms;
    }
  } else {
    // near the camera: is there an edge in the window at all (with the offset)?
    const su = straddle(muU, sigU, Math.abs(a));
    const sv = straddle(muV, sigV, Math.abs(b));
    const meanLN = meanLNslow !== null ? meanLNslow : expectHarmonics(LcBuf, theta0, gth, Hth);
    if (!su && !sv) {
      const chk = 0.5 + 2 * (fract(muU) >= 0.5 ? 0.5 : -0.5) * (fract(muV) >= 0.5 ? 0.5 : -0.5);
      val = meanLN * chk;
    } else {
      // quadrature over theta of LN(theta) E[chk | theta]
      const cuT = SIG * SIG * (gu[0] * gth[0] + gu[1] * gth[1]);
      const cvT = SIG * SIG * (gv[0] * gth[0] + gv[1] * gth[1]);
      const sT2 = sigT * sigT;
      // conditional covariance of (u, v) given theta
      const vuu = Math.max(1e-14, sigU * sigU - (cuT * cuT) / sT2);
      const vvv = Math.max(1e-14, sigV * sigV - (cvT * cvT) / sT2);
      const cuv = SIG * SIG * (gu[0] * gv[0] + gu[1] * gv[1]) - (cuT * cvT) / sT2;
      const su_ = Math.sqrt(vuu);
      const sv_ = Math.sqrt(vvv);
      const rho = Math.max(-0.999999, Math.min(0.999999, cuv / (su_ * sv_)));
      const half = 5 * sigT;
      const panelW = Math.min(0.6 * sigT, 0.5);
      const panels = Math.max(1, Math.ceil((2 * half) / panelW));
      let acc = 0;
      let wsum = 0;
      const ldirx = dx;
      const ldiry = dy;
      for (let q = 0; q < panels; q++) {
        const pa = theta0 - half + ((2 * half) * q) / panels;
        const pb = theta0 - half + ((2 * half) * (q + 1)) / panels;
        const hw = (pb - pa) / 2;
        const mid = (pa + pb) / 2;
        for (const [node, wt] of GL) {
          const th = mid + hw * node;
          const dens = Math.exp((-(th - theta0) * (th - theta0)) / (2 * sT2));
          const c = Math.cos(th);
          const nl = Math.sqrt(1 + c * c);
          const ln = Math.max(LIGHT[0] * ((ldirx * c) / nl) + LIGHT[1] * ((ldiry * c) / nl) + LIGHT[2] / nl, 0);
          const off = Math.sin(th);
          const mu1 = muU + (cuT * (th - theta0)) / sT2 + a * off;
          const mu2 = muV + (cvT * (th - theta0)) / sT2 + b * off;
          let e;
          const s1 = straddle(mu1, su_, 0);
          const s2 = straddle(mu2, sv_, 0);
          if (!s1 && !s2) e = (fract(mu1) >= 0.5 ? 0.5 : -0.5) * (fract(mu2) >= 0.5 ? 0.5 : -0.5);
          else if (!s1) e = (fract(mu1) >= 0.5 ? 0.5 : -0.5) * (probHalf1(mu2, sv_) - 0.5);
          else if (!s2) e = (fract(mu2) >= 0.5 ? 0.5 : -0.5) * (probHalf1(mu1, su_) - 0.5);
          else {
            const pu = probHalf1(mu1, su_);
            const pv = probHalf1(mu2, sv_);
            const puv = probHalf2(mu1, su_, mu2, sv_, rho);
            e = puv - 0.5 * pu - 0.5 * pv + 0.25;
          }
          const w = wt * hw * dens;
          acc += w * ln * (0.5 + 2 * e);
          wsum += w;
        }
      }
      val = acc / wsum;
    }
    if (stats) stats.direct++;
  }
  const vv = val + spec;
  out[0] = vv;
  out[1] = vv;
  out[2] = vv;
};

// ---------------------------------------------------------------------------
// The rippled quadratic sine: w = fract(phi), phi = q(s', t') + 0.2 sin(psi'),
// with the parallax offset s' = s + h vx, t' = t + h vy, h = sin(theta)/3.
// To first order in the offset, phi = q + alpha sin theta + 0.2 sin(psi + gamma
// sin theta), alpha = (q_s vx + q_t vy)/3 (up to a cycle off axis), gamma =
// (vx + vy)/3. Jacobi-Anger twice:
//   e^{2 pi i k phi} = sum_m sum_n J_m(0.4 pi k) J_n(2 pi k alpha + m gamma)
//                      e^{i(2 pi k q + m psi + n theta)},
// LN(theta) = sum_p L_p e^{i p theta} multiplies it, and every (k, m, N) term
// is pushed through the pixel at its rate 2 pi k grad q + m grad psi + N grad
// theta. Off the far field the ripple angle is slow and the plain method runs
// conditioned on theta under a quadrature.
// ---------------------------------------------------------------------------
// J_n(z) for n in [nlo, nhi], written to out[n - nlo]
const besselRange = (z, nlo, nhi, out) => {
  const az = Math.abs(z);
  const nmax = Math.max(Math.abs(nlo), Math.abs(nhi));
  let J;
  if (az < 1e-12) {
    J = new Float64Array(nmax + 1);
    J[0] = 1;
  } else if (nmax + 2 < 0.8 * az) {
    // forward recurrence is stable below the turning point
    J = new Float64Array(nmax + 1);
    J[0] = besselJ0(az);
    if (nmax >= 1) J[1] = besselJ1(az);
    for (let n = 1; n < nmax; n++) J[n + 1] = ((2 * n) / az) * J[n] - J[n - 1];
  } else {
    J = besselRow(az, nmax);
  }
  for (let n = nlo; n <= nhi; n++) {
    const an = Math.abs(n);
    let v = an <= nmax ? J[an] : 0;
    if (n < 0 && an % 2 === 1) v = -v;
    if (z < 0 && an % 2 === 1) v = -v;
    out[n - nlo] = v;
  }
};

// E[fract(Phi)] for a one-dimensional Gaussian count, by whichever route is cheap
const expectFractGauss = (mu, sig) => {
  if (sig < 0.04) return expectFract1(mu, sig);
  let acc = 0.5;
  const K = Math.ceil(1.1 / sig) + 2;
  for (let k = 1; k <= K; k++) {
    const e = Math.exp(-2 * Math.PI * Math.PI * sig * sig * k * k);
    if (e < 1e-9) break;
    acc -= (Math.sin(TAU * k * mu) * e) / (Math.PI * k);
  }
  return acc;
};

const JN = new Float64Array(4096);

const oursSinQuadraticRipples = (x, y, out, stats) => {
  const g = rippleGeometry(x, y);
  const { s, t, d, dx, dy, theta0, gth, Hth, v } = g;
  // the quadratic count and the field's count
  const cx = s;
  const cy = t + 55;
  const G = 0.003;
  const gq = [0, 0];
  const Hq = [
    [0, 0],
    [0, 0],
  ];
  for (let i = 0; i < 2; i++) {
    gq[i] = G * (2 * QA * cx * d.s[i] + 2 * QB * cy * d.t[i] + QC * (cy * d.s[i] + cx * d.t[i]));
    for (let j = 0; j < 2; j++)
      Hq[i][j] =
        G *
        (2 * QA * (d.s[i] * d.s[j] + cx * d.Hs[i][j]) +
          2 * QB * (d.t[i] * d.t[j] + cy * d.Ht[i][j]) +
          QC * (d.s[i] * d.t[j] + d.t[i] * d.s[j] + cy * d.Hs[i][j] + cx * d.Ht[i][j]));
  }
  const muq = G * (QA * cx * cx + QB * cy * cy + QC * cx * cy);
  const mupsi = cx + cy;
  const gpsi = [d.s[0] + d.t[0], d.s[1] + d.t[1]];
  const Hpsi = [
    [d.Hs[0][0] + d.Ht[0][0], d.Hs[0][1] + d.Ht[0][1]],
    [d.Hs[1][0] + d.Ht[1][0], d.Hs[1][1] + d.Ht[1][1]],
  ];
  const qs = G * (2 * QA * cx + QC * cy);
  const qt = G * (2 * QB * cy + QC * cx);
  const alpha = (qs * v[0] + qt * v[1]) / 3;
  const gamma = (v[0] + v[1]) / 3;
  const S = SIG * SIG;
  const sigT = SIG * Math.hypot(gth[0], gth[1]);
  // given theta, the field psi is slow wherever grad psi and grad theta are
  // nearly collinear, which is the whole mid field; the quadrature route
  // with the one-dimensional conditional count then applies far beyond a
  // slow ripple. Its conditional sigma of psi decides.
  const cpT0 = SIG * SIG * (gpsi[0] * gth[0] + gpsi[1] * gth[1]);
  const sigPsiGivenT = Math.sqrt(Math.max(0, SIG * SIG * (gpsi[0] * gpsi[0] + gpsi[1] * gpsi[1]) - (cpT0 * cpT0) / (sigT * sigT)));
  const torusRoute = sigT >= 0.45 && (sigT > RIPPLE_QUAD_MAX || sigPsiGivenT > 0.25);
  // the budget decision comes before any per-pixel precomputation
  if (torusRoute) {
    const lnCut0 = Math.log(CUT);
    const app0 = 0.5 * S * (gpsi[0] * gpsi[0] + gpsi[1] * gpsi[1]);
    const apt0 = 0.5 * S * (gpsi[0] * gth[0] + gpsi[1] * gth[1]);
    const att0 = 0.5 * S * (gth[0] * gth[0] + gth[1] * gth[1]);
    const det0 = gpsi[0] * gth[1] - gth[0] * gpsi[1];
    const mr0 = Math.sqrt(Math.max(0, -lnCut0 / (app0 - (apt0 * apt0) / att0)));
    const Nr0 = Math.sqrt(Math.max(0, -lnCut0 / att0));
    const rx1 = -TAU * gq[0];
    const ry1 = -TAU * gq[1];
    const mRate = Math.abs((rx1 * gth[1] - gth[0] * ry1) / det0);
    const Keff = mRate > 0.4 * Math.PI + 0.1 ? Math.min(200, Math.ceil((12 + mr0) / (mRate - 0.4 * Math.PI))) : 200;
    if (Keff * (2 * mr0 + 1) * (2 * Nr0 + 1) * 0.5 > BUDGET) {
      superSample(sinQuadraticRipples, x, y, out);
      if (stats) stats.sampled++;
      return;
    }
  } else if (((10 * sigT) / Math.min(0.6 * sigT, 0.5)) * 8 * 30 > BUDGET) {
    superSample(sinQuadraticRipples, x, y, out);
    if (stats) stats.sampled++;
    return;
  }
  let spec;
  let meanLN;
  if (!torusRoute && sigT < SLOW_LIGHT) {
    const mm = lightingMeansSlow(dx, dy, v, 25, theta0, sigT);
    meanLN = mm[0];
    spec = mm[1];
  } else {
    lightingHarmonics(dx, dy, v, 25, LcBuf, ScBuf);
    spec = expectHarmonics(ScBuf, theta0, gth, Hth);
    meanLN = expectHarmonics(LcBuf, theta0, gth, Hth);
  }
  let w;
  if (torusRoute) {
    // the (k, m, N) sum
    const lnCut = Math.log(CUT);
    const reach = Math.sqrt(-2 * lnCut);
    const LP = (p) => (p === 0 ? LcBuf[0] : Math.abs(p) <= HMAX ? LcBuf[Math.abs(p)] / 2 : 0);
    let P = 1;
    while (P < HMAX && Math.abs(LcBuf[P]) > 1e-6) P++;
    // quadratic form of the weight in (m, N) for fixed k:
    //   exponent = -(app (m-m*)^2 + 2 apt (m-m*)(N-N*) + att (N-N*)^2)
    const app = 0.5 * S * (gpsi[0] * gpsi[0] + gpsi[1] * gpsi[1]);
    const apt = 0.5 * S * (gpsi[0] * gth[0] + gpsi[1] * gth[1]);
    const att = 0.5 * S * (gth[0] * gth[0] + gth[1] * gth[1]);
    const det = gpsi[0] * gth[1] - gth[0] * gpsi[1];
    const cq = TAU * curvature(Hq);
    const cp = curvature(Hpsi);
    const ct = curvature(Hth);
    const K = 200;
    let acc = 0.5 * meanLN;
    let terms = 0;
    for (let k = 1; k <= K; k++) {
      const row = besselJ(k); // J_m(0.4 pi k)
      // (m*, N*): the real solution of 2 pi k grad q + m grad psi + N grad theta = 0
      const rx = -TAU * k * gq[0];
      const ry = -TAU * k * gq[1];
      const mStar = (rx * gth[1] - gth[0] * ry) / det;
      const NStar = (gpsi[0] * ry - rx * gpsi[1]) / det;
      const mr = Math.sqrt(Math.max(0, -lnCut / (app - (apt * apt) / att)));
      const mlo = Math.max(-(row.length - 1), Math.ceil(mStar - mr));
      const mhi = Math.min(row.length - 1, Math.floor(mStar + mr));
      if (mhi < mlo) {
        if (Math.abs(mStar) > row.length + mr + 2) break;
        continue;
      }
      let sumIm = 0;
      let any = false;
      for (let m = mlo; m <= mhi; m++) {
        const jm = m < 0 && Math.abs(m) % 2 === 1 ? -row[-m] : row[Math.abs(m)];
        if (Math.abs(jm) < 1e-8) continue;
        const dm = m - mStar;
        const Ncen = NStar - (apt * dm) / att;
        const Nr = Math.sqrt(Math.max(0, (-lnCut - app * dm * dm + (apt * apt * dm * dm) / att) / att));
        const N0 = Math.ceil(Ncen - Nr);
        const N1 = Math.floor(Ncen + Nr);
        if (N1 < N0) continue;
        const z = TAU * k * alpha + m * gamma;
        // Bessel J_n(z) for n = N - p, p in [-P, P]
        const nlo = N0 - P;
        const nhi = N1 + P;
        if (nhi - nlo + 1 > JN.length) continue;
        besselRange(z, nlo, nhi, JN);
        const secondOrder = k * cq + Math.max(Math.abs(mlo), Math.abs(mhi)) * cp + Math.max(Math.abs(N0), Math.abs(N1)) * ct >= CURV;
        for (let N = N0; N <= N1; N++) {
          let coef = 0;
          for (let p = -P; p <= P; p++) coef += LP(p) * JN[N - p - nlo];
          coef *= jm;
          if (Math.abs(coef) < 1e-9) continue;
          const bx = TAU * k * gq[0] + m * gpsi[0] + N * gth[0];
          const by = TAU * k * gq[1] + m * gpsi[1] + N * gth[1];
          const ph = TAU * k * muq + m * mupsi + N * theta0;
          let im;
          if (secondOrder) {
            qphaseS(bx, by, TAU * k * Hq[0][0] + m * Hpsi[0][0] + N * Hth[0][0], TAU * k * Hq[0][1] + m * Hpsi[0][1] + N * Hth[0][1], TAU * k * Hq[1][1] + m * Hpsi[1][1] + N * Hth[1][1], SIG);
            im = Math.cos(ph) * QP_IM + Math.sin(ph) * QP_RE;
          } else {
            const e = 0.5 * S * (bx * bx + by * by);
            if (e > -lnCut + 2) continue;
            im = Math.sin(ph) * Math.exp(-e);
          }
          sumIm += coef * im;
          terms++;
          any = true;
        }
      }
      // fract(phi) = 1/2 + sum_{k != 0} (i / (2 pi k)) e^{2 pi i k phi}: the pair
      // (k, -k) gives -(1/(pi k)) Im[...]
      acc -= sumIm / (Math.PI * k);
      void any;
    }
    w = acc;
    if (stats) {
      stats.torus++;
      stats.terms += terms;
    }
  } else {
    // the ripple is slow: quadrature over theta, the plain method conditioned
    const cqT = S * (gq[0] * gth[0] + gq[1] * gth[1]);
    const cpT = S * (gpsi[0] * gth[0] + gpsi[1] * gth[1]);
    const sT2 = sigT * sigT;
    // conditional covariance of (q, psi) given theta (rank one)
    const vqq = Math.max(0, S * (gq[0] * gq[0] + gq[1] * gq[1]) - (cqT * cqT) / sT2);
    const vpp = Math.max(0, S * (gpsi[0] * gpsi[0] + gpsi[1] * gpsi[1]) - (cpT * cpT) / sT2);
    const vqp = S * (gq[0] * gpsi[0] + gq[1] * gpsi[1]) - (cqT * cpT) / sT2;
    const half = 5 * sigT;
    const panelW = Math.min(0.6 * sigT, 0.5);
    const panels = Math.max(1, Math.ceil((2 * half) / panelW));
    let acc = 0;
    let wsum = 0;
    for (let q = 0; q < panels; q++) {
      const pa = theta0 - half + ((2 * half) * q) / panels;
      const pb = theta0 - half + ((2 * half) * (q + 1)) / panels;
      const hw = (pb - pa) / 2;
      const mid = (pa + pb) / 2;
      for (const [node, wt] of GL) {
        const th = mid + hw * node;
        const dens = Math.exp((-(th - theta0) * (th - theta0)) / (2 * sT2));
        const c = Math.cos(th);
        const nl = Math.sqrt(1 + c * c);
        const ln = Math.max(LIGHT[0] * ((dx * c) / nl) + LIGHT[1] * ((dy * c) / nl) + LIGHT[2] / nl, 0);
        const off = Math.sin(th);
        const mq = muq + (cqT * (th - theta0)) / sT2 + alpha * off;
        const mp = mupsi + (cpT * (th - theta0)) / sT2 + gamma * off;
        // fold the field: phi = q + 0.2 sin psi, linear in (q, psi) about the means
        const cps = Math.cos(mp);
        const sps = Math.sin(mp);
        const muphi = mq + 0.2 * sps;
        const varphi = vqq + 2 * 0.2 * cps * vqp + 0.04 * cps * cps * vpp;
        const ef = expectFractGauss(muphi, Math.sqrt(Math.max(0, varphi)));
        const wgt = wt * hw * dens;
        acc += wgt * ln * ef;
        wsum += wgt;
      }
    }
    w = acc / wsum;
    if (stats) stats.direct++;
  }
  out[0] = w + spec;
  out[1] = w + spec;
  out[2] = meanLN + spec;
};

const renderOurs = (method) => {
  const img = new Float64Array(W * H * 3);
  const out = [0, 0, 0];
  const stats = { fourier: 0, direct: 0, torus: 0, sampled: 0, terms: 0, msFourier: 0, msDirect: 0 };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t0 = performance.now();
      const f0 = stats.fourier + stats.torus;
      method(x, y, out, stats);
      const dt = performance.now() - t0;
      if (stats.fourier + stats.torus > f0) stats.msFourier += dt;
      else stats.msDirect += dt;
      const p = (y * W + x) * 3;
      img[p] = out[0];
      img[p + 1] = out[1];
      img[p + 2] = out[2];
    }
  return { img, stats };
};

// ---------------------------------------------------------------------------
// Metrics and images
// ---------------------------------------------------------------------------
const clamp01 = (v) => (Number.isNaN(v) ? 0 : v < 0 ? 0 : v > 1 ? 1 : v);
const quant = (v) => Math.floor(clamp01(v) * 256 - 1e-4) / 255;
const rms = (a, b, q = false) => {
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    const d = q ? quant(a[i]) - quant(b[i]) : clamp01(a[i]) - clamp01(b[i]);
    acc += d * d;
  }
  return Math.sqrt(acc / a.length);
};
const rmsRows = (a, b, y0, y1) => {
  let acc = 0;
  let n = 0;
  for (let y = y0; y < y1; y++)
    for (let i = y * W * 3; i < (y + 1) * W * 3; i++) {
      const d = clamp01(a[i]) - clamp01(b[i]);
      acc += d * d;
      n++;
    }
  return Math.sqrt(acc / n);
};

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

// A comparison strip: four frames side by side, and under each a 3x crop of
// the moire zone (rows 16-76, columns 160-320), with a one-pixel white gap.
const writeStrip = (path, frames) => {
  const cx0 = 160;
  const cy0 = 16;
  const cw = 160;
  const ch = 60;
  const Z = 3;
  const gap = 4;
  const w = 4 * W + 3 * gap;
  const h = H + gap + ch * Z;
  const img = new Float64Array(w * h * 3).fill(1);
  frames.forEach((f, i) => {
    const ox = i * (W + gap);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) img[((y) * w + ox + x) * 3 + c] = f[(y * W + x) * 3 + c];
    for (let y = 0; y < ch * Z; y++)
      for (let x = 0; x < cw * Z; x++)
        for (let c = 0; c < 3; c++) img[((H + gap + y) * w + ox + x) * 3 + c] = f[((cy0 + Math.floor(y / Z)) * W + cx0 + Math.floor(x / Z)) * 3 + c];
  });
  writePNG(path, img, w, h);
};

// ---------------------------------------------------------------------------
// Probe: single pixels against a heavy brute force
// ---------------------------------------------------------------------------
const brutePixel = (shader, x, y, n, seed) => {
  const r = rng(seed);
  const out = [0, 0, 0];
  let a = 0;
  for (let i = 0; i < n; i++) {
    const [dx, dy] = gaussPair(r);
    shader(x + SIG * dx, y + SIG * dy, out);
    a += out[0];
  }
  return a / n;
};

if (PROBE) {
  for (const [name, shader, method] of [
    ['checkerboard', checkerboard, oursCheckerboard],
    ['sinQuadratic', sinQuadratic, oursSinQuadratic],
    ['circles', circles, oursCircles],
    ['checkerboardRipples', checkerboardRipples, oursCheckerboardRipples],
    ['sinQuadraticRipples', sinQuadraticRipples, oursSinQuadraticRipples],
  ]) {
    console.log(name);
    for (const [x, y] of [
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
      const out = [0, 0, 0];
      const stats = { fourier: 0, direct: 0, torus: 0, terms: 0 };
      method(x, y, out, stats);
      const ref = brutePixel(shader, x, y, 200000, 1);
      const pt = [0, 0, 0];
      shader(x, y, pt);
      const mode = stats.fourier ? 'fourier' : stats.torus ? 'torus' : 'direct';
      console.log(`  (${x},${y}) ${mode.padEnd(7)} terms ${String(stats.terms).padStart(5)}  ours ${out[0].toFixed(5)}  brute ${ref.toFixed(5)}  |err| ${Math.abs(out[0] - ref).toExponential(1)}  point ${pt[0].toFixed(3)}`);
    }
  }
  process.exit(0);
}

if (DIAG) {
  const shader = checkerboard;
  const method = oursCheckerboard;
  const gt = renderMC(shader, 200, 101);
  const gt2 = renderMC(shader, 200, 202);
  const ours = renderOurs(method).img;
  const rows = [];
  for (let y = 0; y < H; y += 20) rows.push({ y, ours: rmsRows(ours, gt, y, y + 20), floor: rmsRows(gt, gt2, y, y + 20) / Math.SQRT2 });
  for (const r of rows) console.log(`rows ${r.y}-${r.y + 20}: ours ${r.ours.toFixed(4)} floor ${r.floor.toFixed(4)}`);
  // worst pixels
  const errs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) errs.push({ x, y, e: Math.abs(clamp01(ours[(y * W + x) * 3]) - clamp01(gt[(y * W + x) * 3])) });
  errs.sort((a, b) => b.e - a.e);
  for (const { x, y, e } of errs.slice(0, 12)) {
    const out = [0, 0, 0];
    const st = { fourier: 0, direct: 0, torus: 0, terms: 0 };
    method(x, y, out, st);
    const ref = brutePixel(shader, x, y, 400000, 5);
    console.log(`  (${x},${y}) err vs gt ${e.toFixed(4)}  ours ${out[0].toFixed(5)} gt ${gt[(y * W + x) * 3].toFixed(5)} brute400k ${ref.toFixed(5)} mode ${st.fourier ? 'fourier' : 'direct'} terms ${st.terms}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Full frames
// ---------------------------------------------------------------------------
const time = (fn) => {
  const t0 = performance.now();
  const r = fn();
  return { r, ms: performance.now() - t0 };
};

const CASES = [
  ['checkerboard', checkerboard, oursCheckerboard, null],
  ['sinQuadratic', sinQuadratic, oursSinQuadratic, null],
  ['circles', circles, oursCircles, { noAA: 0.148, theirs: 0.035, theirsTime: 4, dorn: 0.063, msaa: 0.087, msaaTime: 3 }],
  ['checkerboardRipples', checkerboardRipples, oursCheckerboardRipples, { noAA: 0.194, theirs: 0.071, theirsTime: 2, dorn: 0.102, msaa: 0.233, msaaTime: 2 }],
  ['sinQuadraticRipples', sinQuadraticRipples, oursSinQuadraticRipples, { noAA: 0.184, theirs: 0.045, theirsTime: 2, dorn: 0.094, msaa: 0.158, msaaTime: 3 }],
];
const only = args.find((a) => a.startsWith('--only='));
const results = {};
const truths = {};
for (const [name, shader, method, published] of CASES.filter(([n]) => !only || only.slice(7).split(',').includes(n))) {
  console.log(`${name}: rendering ground truth (1000 spp)...`);
  const gt = renderMC(shader, QUICK ? 200 : 1000, 101);
  const gt2 = renderMC(shader, QUICK ? 200 : 1000, 202);
  const noaa = time(() => renderMC(shader, 1, 1));
  const msaa = {};
  for (const n of [2, 4, 8, 16]) msaa[n] = time(() => renderMC(shader, n, 7 + n));
  const noiseFloor = rms(gt, gt2) / Math.SQRT2;
  truths[name] = gt;
  const r = {
    published,
    noiseFloor,
    noAA: { err: rms(noaa.r, gt), err8: rms(noaa.r, gt, true), ms: noaa.ms, rel: 1 },
    msaa: Object.fromEntries(Object.entries(msaa).map(([n, m]) => [n, { err: rms(m.r, gt), ms: m.ms, rel: m.ms / noaa.ms }])),
  };
  writePNG(new URL(`yb-${name}-gt.png`, IMG), gt);
  writePNG(new URL(`yb-${name}-noaa.png`, IMG), noaa.r);
  writePNG(new URL(`yb-${name}-msaa4.png`, IMG), msaa[4].r);
  console.log(`  no AA ${r.noAA.err.toFixed(4)} (published ${published ? published.noAA : 'n/a'})   MSAA 2/4/8/16: ${[2, 4, 8, 16].map((n) => r.msaa[n].err.toFixed(4)).join(' ')}   noise floor ${noiseFloor.toFixed(4)}`);
  if (method) {
    const ours = time(() => renderOurs(method));
    r.ours = { err: rms(ours.r.img, gt), err8: rms(ours.r.img, gt, true), errVsSecond: rms(ours.r.img, gt2), ms: ours.ms, rel: ours.ms / noaa.ms, stats: ours.r.stats };
    r.bands = {
      far: { rows: [0, 20], noAA: rmsRows(noaa.r, gt, 0, 20), ours: rmsRows(ours.r.img, gt, 0, 20), msaa4: rmsRows(msaa[4].r, gt, 0, 20) },
      moire: { rows: [20, 80], noAA: rmsRows(noaa.r, gt, 20, 80), ours: rmsRows(ours.r.img, gt, 20, 80), msaa4: rmsRows(msaa[4].r, gt, 20, 80) },
      near: { rows: [80, 320], noAA: rmsRows(noaa.r, gt, 80, 320), ours: rmsRows(ours.r.img, gt, 80, 320), msaa4: rmsRows(msaa[4].r, gt, 80, 320) },
    };
    writePNG(new URL(`yb-${name}-ours.png`, IMG), ours.r.img);
    writeStrip(new URL(`yb-${name}-strip.png`, IMG), [gt, noaa.r, msaa[4].r, ours.r.img]);
    console.log(`  ours ${r.ours.err.toFixed(4)} (8-bit ${r.ours.err8.toFixed(4)}, vs second truth ${r.ours.errVsSecond.toFixed(4)}); published theirs ${published ? published.theirs + ' at ' + published.theirsTime + 'x, Dorn ' + published.dorn + ', MSAA ' + published.msaa + ' at ' + published.msaaTime + 'x' : 'n/a'}`);
    console.log(`  time: no AA ${noaa.ms.toFixed(0)} ms, ours ${ours.ms.toFixed(0)} ms (${r.ours.rel.toFixed(1)}x), MSAA4 ${msaa[4].ms.toFixed(0)} ms (${r.msaa[4].rel.toFixed(1)}x)  stats ${JSON.stringify(ours.r.stats)}`);
    console.log(`  bands: far ${r.bands.far.noAA.toFixed(3)} -> ${r.bands.far.ours.toFixed(4)}, moire ${r.bands.moire.noAA.toFixed(3)} -> ${r.bands.moire.ours.toFixed(4)}, near ${r.bands.near.noAA.toFixed(3)} -> ${r.bands.near.ours.toFixed(4)}`);
  }
  results[name] = r;
}

if (SWEEP) {
  const SETTINGS = [
    { label: 'exact', budget: Infinity, samples: 0 },
    { label: 'b400 s64', budget: 400, samples: 64 },
    { label: 'b200 s64', budget: 200, samples: 64 },
    { label: 'b100 s64', budget: 100, samples: 64 },
    { label: 'b100 s36', budget: 100, samples: 36 },
    { label: 'b50 s36', budget: 50, samples: 36 },
    { label: 'b50 s16', budget: 50, samples: 16 },
    { label: 'b25 s16', budget: 25, samples: 16 },
    { label: 'b25 s9', budget: 25, samples: 9 },
  ];
  const sweep = {};
  for (const [name, r] of Object.entries(results)) {
    const [, shader, method] = CASES.find(([n]) => n === name);
    if (!method) continue;
    const gt = truths[name];
    const noaa = time(() => renderMC(shader, 1, 1));
    const points = [];
    for (const n of [4, 16, 64, 256]) {
      const m = time(() => renderMC(shader, n, 7 + n));
      points.push({ label: `MSAA ${n}`, kind: 'msaa', err: rms(m.r, gt), rel: m.ms / noaa.ms });
    }
    points.push({ label: 'exact', kind: 'ours', err: r.ours.err, rel: r.ours.rel, sampled: 0, terms: r.ours.stats.terms });
    for (const st of SETTINGS.filter((q) => q.label !== 'exact')) {
      BUDGET = st.budget;
      NSAMP = st.samples;
      const o = time(() => renderOurs(method));
      points.push({ label: st.label, kind: 'ours', err: rms(o.r.img, gt), rel: o.ms / noaa.ms, sampled: o.r.stats.sampled, terms: o.r.stats.terms });
      console.log(`  ${name} ${st.label}: err ${points[points.length - 1].err.toFixed(4)} time ${points[points.length - 1].rel.toFixed(1)}x sampled ${o.r.stats.sampled}`);
    }
    BUDGET = Infinity;
    sweep[name] = { noiseFloor: r.noiseFloor, published: r.published, points };
  }
  writeFileSync(new URL('../../data/yb-sweep.json', import.meta.url), JSON.stringify(sweep, null, 1));
}

const gates = {};
for (const [name, r] of Object.entries(results)) {
  if (r.published) gates[`${name}NoAAMatchesPublished`] = Math.abs(r.noAA.err - r.published.noAA) < 0.02;
  if (r.ours) {
    gates[`${name}NearFloor`] = r.ours.err < 2 * r.noiseFloor;
    if (r.published) gates[`${name}BeatsPublished`] = r.ours.err < r.published.theirs;
  }
}
const ok = Object.values(gates).every(Boolean);
// merge with what earlier runs of other cases left in the file
let merged = { protocol: { W, H, sigma: SIG, groundTruthSamples: QUICK ? 200 : 1000 }, results: {}, gates: {} };
if (only && existsSync(OUT) && !QUICK) {
  try {
    const prev = JSON.parse(readFileSync(OUT, 'utf8'));
    if (prev.protocol && prev.protocol.groundTruthSamples === merged.protocol.groundTruthSamples) merged = prev;
  } catch (e) {
    void e;
  }
}
Object.assign(merged.results, results);
Object.assign(merged.gates, gates);
merged.budget = { cut: CUT, cross: CROSS, curv: CURV };
if (!QUICK) writeFileSync(OUT, JSON.stringify(merged, null, 1));
console.log(gates);
console.log(ok ? 'all gates pass' : 'GATE FAILURE');
