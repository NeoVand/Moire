// Toroidal mipmaps: the far and mid field of a picture on one or two counts
// as texture lookups. A picture P on the torus, blurred by an isotropic
// Gaussian of width s in count units, is tabulated at a ladder of widths;
// a pixel whose counts have covariance C = sig^2 G G^T (G the count
// gradients, periods per pixel) is read at the minor width with
// Gauss-Hermite taps along the major axis, as anisotropic texture
// filtering does. The reference is the exact spectral sum, sum_k c_k
// e^{2 pi i k.c0} e^{-2 pi^2 k^T C k}, the multiplier theorem at first
// order. Measured on the Yang & Barnes plane (480x320, camera path 1) for
// the checkerboard and the circles: RMS and worst error over the spectral
// pixels against the number of taps, and the share of pixels the tables
// do not cover (local regime, where an edge crosses the pixel).
// Run: node paper/tools/exp/tables.mjs [--levels=N] [--table=M]
// Writes paper/data/tables.json.

import { writeFileSync } from 'node:fs';

const TAU = 2 * Math.PI;
const W = 480;
const H = 320;
const SIG = 0.5;
const args = process.argv.slice(2);
const arg = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : def;
};
const TABLE = arg('table', 128); // table resolution per axis
const KMAX = arg('kmax', 96); // harmonics kept per axis
const LOCAL = 0.02; // below this minor width (periods) the pixel is local
const D = 20; // the pattern's period in texture units

// ---------------------------------------------------------------------------
// pictures on the unit 2-torus, and their Fourier coefficients
// ---------------------------------------------------------------------------
const checker = (u, v) => {
  const a = u - Math.floor(u) >= 0.5 ? 1 : 0;
  const b = v - Math.floor(v) >= 0.5 ? 1 : 0;
  return a * b + (1 - a) * (1 - b);
};
const R = 25 / 3 / D; // disc radius in periods
const disc = (u, v) => {
  const x = u - Math.floor(u) - 0.5;
  const y = v - Math.floor(v) - 0.5;
  return x * x + y * y < R * R ? 1 : 0;
};

// coefficients c[kx][ky] for |k| <= K by a DFT on an N x N grid with the
// jumps resolved by supersampling each cell 4 x 4 (a step's coefficients
// converge as the cell shrinks; N = 1024 puts the error near 1e-4)
const coefficients = (P, K, N) => {
  const re = new Float64Array((2 * K + 1) * (2 * K + 1));
  const im = new Float64Array((2 * K + 1) * (2 * K + 1));
  // separable DFT: first over v for each u, then over u
  const rowRe = new Float64Array(N * (2 * K + 1));
  const rowIm = new Float64Array(N * (2 * K + 1));
  const samples = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    for (let j = 0; j < N; j++) {
      let s = 0;
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) s += P(u + ((a + 0.5) / 4 - 0.5) / N, (j + 0.5) / N + ((b + 0.5) / 4 - 0.5) / N);
      samples[j] = s / 16;
    }
    for (let ky = -K; ky <= K; ky++) {
      let sr = 0;
      let si = 0;
      for (let j = 0; j < N; j++) {
        const ang = (-TAU * ky * (j + 0.5)) / N;
        sr += samples[j] * Math.cos(ang);
        si += samples[j] * Math.sin(ang);
      }
      rowRe[i * (2 * K + 1) + ky + K] = sr / N;
      rowIm[i * (2 * K + 1) + ky + K] = si / N;
    }
  }
  for (let kx = -K; kx <= K; kx++)
    for (let ky = -K; ky <= K; ky++) {
      let sr = 0;
      let si = 0;
      for (let i = 0; i < N; i++) {
        const ang = (-TAU * kx * (i + 0.5)) / N;
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        const r = rowRe[i * (2 * K + 1) + ky + K];
        const m = rowIm[i * (2 * K + 1) + ky + K];
        sr += r * c - m * s;
        si += r * s + m * c;
      }
      re[(kx + K) * (2 * K + 1) + ky + K] = sr / N;
      im[(kx + K) * (2 * K + 1) + ky + K] = si / N;
    }
  return { re, im, K };
};

// ---------------------------------------------------------------------------
// the exact spectral pixel: sum_k c_k e^{2 pi i k.c0} e^{-2 pi^2 k^T C k}
// ---------------------------------------------------------------------------
const spectral = (coef, c0, C, cut = 1e-7) => {
  const { re, im, K } = coef;
  let acc = 0;
  const lnCut = Math.log(cut);
  for (let kx = -K; kx <= K; kx++)
    for (let ky = -K; ky <= K; ky++) {
      const e = -2 * Math.PI * Math.PI * (C[0] * kx * kx + 2 * C[1] * kx * ky + C[2] * ky * ky);
      if (e < lnCut) continue;
      const idx = (kx + K) * (2 * K + 1) + ky + K;
      const r = re[idx];
      const m = im[idx];
      if (r * r + m * m < 1e-24) continue;
      const ph = TAU * (kx * c0[0] + ky * c0[1]);
      acc += Math.exp(e) * (r * Math.cos(ph) - m * Math.sin(ph));
    }
  return acc;
};

// ---------------------------------------------------------------------------
// the ladder: the picture blurred isotropically at widths s_j, tabulated
// ---------------------------------------------------------------------------
const buildLadder = (coef, widths, M) => {
  const { re, im, K } = coef;
  const levels = widths.map((s) => {
    const T = new Float32Array(M * M);
    // separable in the exponential weight: sum over kx of e^{2 pi i kx u}
    // times the ky sum, via a row transform first
    const rows = new Float64Array(M * (2 * K + 1) * 2);
    for (let kx = -K; kx <= K; kx++) {
      const wx = Math.exp(-2 * Math.PI * Math.PI * s * s * kx * kx);
      if (wx < 1e-9) continue;
      for (let j = 0; j < M; j++) {
        const v = j / M;
        let sr = 0;
        let si = 0;
        for (let ky = -K; ky <= K; ky++) {
          const w = wx * Math.exp(-2 * Math.PI * Math.PI * s * s * ky * ky);
          if (w < 1e-9) continue;
          const idx = (kx + K) * (2 * K + 1) + ky + K;
          const ang = TAU * ky * v;
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          sr += w * (re[idx] * c - im[idx] * sn);
          si += w * (re[idx] * sn + im[idx] * c);
        }
        rows[(kx + K) * M * 2 + 2 * j] = sr;
        rows[(kx + K) * M * 2 + 2 * j + 1] = si;
      }
    }
    for (let i = 0; i < M; i++) {
      const u = i / M;
      for (let j = 0; j < M; j++) {
        let acc = 0;
        for (let kx = -K; kx <= K; kx++) {
          const ang = TAU * kx * u;
          acc += rows[(kx + K) * M * 2 + 2 * j] * Math.cos(ang) - rows[(kx + K) * M * 2 + 2 * j + 1] * Math.sin(ang);
        }
        T[i * M + j] = acc;
      }
    }
    return T;
  });
  return { widths, levels, M };
};
// bilinear on the torus at level l
const lookup2 = (T, M, u, v) => {
  const x = (u - Math.floor(u)) * M;
  const y = (v - Math.floor(v)) * M;
  const i0 = Math.floor(x);
  const j0 = Math.floor(y);
  const fx = x - i0;
  const fy = y - j0;
  const i1 = (i0 + 1) % M;
  const j1 = (j0 + 1) % M;
  return (1 - fx) * ((1 - fy) * T[i0 * M + j0] + fy * T[i0 * M + j1]) + fx * ((1 - fy) * T[i1 * M + j0] + fy * T[i1 * M + j1]);
};
// trilinear: between the two ladder levels around width s (linear in log s)
const lookup = (ladder, s, u, v) => {
  const { widths, levels, M } = ladder;
  if (s <= widths[0]) return lookup2(levels[0], M, u, v);
  const last = widths.length - 1;
  if (s >= widths[last]) return lookup2(levels[last], M, u, v);
  let l = 0;
  while (widths[l + 1] < s) l++;
  const t = (Math.log(s) - Math.log(widths[l])) / (Math.log(widths[l + 1]) - Math.log(widths[l]));
  return (1 - t) * lookup2(levels[l], M, u, v) + t * lookup2(levels[l + 1], M, u, v);
};

// Gauss-Hermite for N(0,1): nodes and weights (probabilists')
const gaussHermite = (n) => {
  // Golub-Welsch on the Jacobi matrix of the Hermite polynomials
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 1; i < n; i++) b[i] = Math.sqrt(i);
  // symmetric tridiagonal QL (small n): use a simple Jacobi eigen solver
  const A = [];
  for (let i = 0; i < n; i++) {
    A.push(new Float64Array(n));
    A[i][i] = a[i];
    if (i > 0) {
      A[i][i - 1] = b[i];
      A[i - 1][i] = b[i];
    }
  }
  const V = A.map((_, i) => {
    const r = new Float64Array(n);
    r[i] = 1;
    return r;
  });
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p];
          const akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k];
          const aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  const nodes = [];
  for (let i = 0; i < n; i++) nodes.push([A[i][i], V[0][i] * V[0][i]]);
  nodes.sort((p, q) => p[0] - q[0]);
  return nodes;
};

// the table read at a pixel: taps along the major axis at spacing h = 1.5
// minor widths (the minor blur then hides the comb of taps to 1e-4),
// Gaussian weights of the major spread; with a cap on the tap count the
// minor width is raised until the taps fit, as hardware does. Returns
// [value, taps used].
const tableReadSpaced = (ladder, c0, C, cap) => {
  const tr = C[0] + C[2];
  const det = C[0] * C[2] - C[1] * C[1];
  const disc0 = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lmax = tr / 2 + disc0;
  const lmin = Math.max(1e-12, tr / 2 - disc0);
  let vx;
  let vy;
  if (Math.abs(C[1]) > 1e-15) {
    vx = lmax - C[2];
    vy = C[1];
  } else if (C[0] >= C[2]) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }
  const nv = Math.hypot(vx, vy);
  vx /= nv;
  vy /= nv;
  let s = Math.sqrt(lmin);
  let tau = Math.sqrt(Math.max(0, lmax - lmin));
  if (tau < 0.25 * s) return [lookup(ladder, Math.sqrt((lmin + lmax) / 2), c0[0], c0[1]), 1];
  let h = 1.5 * s;
  let n = Math.ceil((6 * tau) / h) | 1;
  if (cap && n > cap) {
    // raise the minor width so that cap taps at spacing 1.5 s cover 6 tau
    n = cap;
    h = (6 * tau) / n;
    s = h / 1.5;
    tau = Math.sqrt(Math.max(0, lmax - s * s));
  }
  let acc = 0;
  let wsum = 0;
  const half = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const t = (i - half) * h;
    const w = Math.exp((-t * t) / (2 * tau * tau));
    wsum += w;
    acc += w * lookup(ladder, s, c0[0] + t * vx, c0[1] + t * vy);
  }
  return [acc / wsum, n];
};
// terms of the exact sum a pixel needs: lattice points inside the
// multiplier's ellipse
const termCount = (K, C, cut = 1e-4) => {
  const lnCut = Math.log(cut);
  let n = 0;
  for (let kx = -K; kx <= K; kx++)
    for (let ky = -K; ky <= K; ky++) {
      const e = -2 * Math.PI * Math.PI * (C[0] * kx * kx + 2 * C[1] * kx * ky + C[2] * ky * ky);
      if (e >= lnCut) n++;
    }
  return n;
};
// the table read at a pixel: minor width, taps along the major axis
const tableRead = (ladder, c0, C, taps) => {
  const tr = C[0] + C[2];
  const det = C[0] * C[2] - C[1] * C[1];
  const disc0 = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lmax = tr / 2 + disc0;
  const lmin = Math.max(1e-12, tr / 2 - disc0);
  // major eigenvector
  let vx;
  let vy;
  if (Math.abs(C[1]) > 1e-15) {
    vx = lmax - C[2];
    vy = C[1];
  } else if (C[0] >= C[2]) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }
  const nv = Math.hypot(vx, vy);
  vx /= nv;
  vy /= nv;
  const s = Math.sqrt(lmin);
  const tau = Math.sqrt(Math.max(0, lmax - lmin));
  if (taps.length === 1 || tau < 1e-6) return lookup(ladder, Math.sqrt(lmin + (lmax - lmin) / 2), c0[0], c0[1]);
  let acc = 0;
  for (const [t, w] of taps) acc += w * lookup(ladder, s, c0[0] + t * tau * vx, c0[1] + t * tau * vy);
  return acc;
};

// ---------------------------------------------------------------------------
// the plane's count geometry at a pixel (their camera path 1, t = 0)
// ---------------------------------------------------------------------------
const geometry = (x, y) => {
  const X = x - 240;
  const Y = y + 1;
  const s = (-50 * X) / Y;
  const t = -12000 / Y;
  const ds = [-50 / Y, (50 * X) / (Y * Y)];
  const dt = [0, 12000 / (Y * Y)];
  const G = [ds[0] / D, ds[1] / D, dt[0] / D, dt[1] / D]; // periods per pixel
  const C = [SIG * SIG * (G[0] * G[0] + G[1] * G[1]), SIG * SIG * (G[0] * G[2] + G[1] * G[3]), SIG * SIG * (G[2] * G[2] + G[3] * G[3])];
  return { c0: [s / D, t / D], C };
};

// ---------------------------------------------------------------------------
export { checker, disc, coefficients, spectral, buildLadder, lookup, tableRead, gaussHermite, geometry };
const main = () => {
  const results = {};
  const widths = [];
  for (let j = 0; j <= 20; j++) widths.push(0.01 * Math.pow(2, j / 2));
  const tapCounts = [1, 2, 3, 4, 6, 8, 12, 16];
  const gh = new Map(tapCounts.map((n) => [n, gaussHermite(n)]));
  for (const [name, P] of [
    ['checkerboard', checker],
    ['circles', disc],
  ]) {
    const t0 = performance.now();
    const coef = coefficients(P, KMAX, 1024);
    const tCoef = performance.now() - t0;
    const t1 = performance.now();
    const ladder = buildLadder(coef, widths, TABLE);
    const tLadder = performance.now() - t1;
    // pixels: spectral if the minor width is at least LOCAL
    let nSpectral = 0;
    let nLocal = 0;
    const caps = [0, 64, 32, 16, 8];
    const errs = caps.map(() => ({ sq: 0, max: 0, n: 0, taps: 0 }));
    let tExact = 0;
    let tTable = 0;
    let terms = 0;
    let termsMax = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const { c0, C } = geometry(x, y);
        const tr = C[0] + C[2];
        const det = C[0] * C[2] - C[1] * C[1];
        const lmin = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
        if (Math.sqrt(Math.max(0, lmin)) < LOCAL) {
          nLocal++;
          continue;
        }
        nSpectral++;
        const te = performance.now();
        const ex = spectral(coef, c0, C);
        tExact += performance.now() - te;
        const tc = termCount(coef.K, C);
        terms += tc;
        if (tc > termsMax) termsMax = tc;
        caps.forEach((cap, i) => {
          const tt = performance.now();
          const [v, n] = tableReadSpaced(ladder, c0, C, cap);
          tTable += performance.now() - tt;
          const d = v - ex;
          errs[i].sq += d * d;
          errs[i].n++;
          errs[i].taps += n;
          if (Math.abs(d) > errs[i].max) errs[i].max = Math.abs(d);
        });
      }
    const row = {
      spectralPixels: nSpectral,
      localPixels: nLocal,
      caps: Object.fromEntries(caps.map((cap, i) => [cap || 'none', { rms: Math.sqrt(errs[i].sq / Math.max(1, errs[i].n)), max: errs[i].max, meanTaps: errs[i].taps / Math.max(1, errs[i].n) }])),
      exactTermsMean: terms / Math.max(1, nSpectral),
      exactTermsMax: termsMax,
      msExactPerPixel: tExact / Math.max(1, nSpectral),
      usTablePerRead: (1000 * tTable) / Math.max(1, nSpectral * caps.length),
      secondsCoefficients: tCoef / 1000,
      secondsLadder: tLadder / 1000,
      table: TABLE,
      levels: widths.length,
      kmax: KMAX,
    };
    results[name] = row;
    console.log(`${name}: ${nSpectral} spectral px, ${nLocal} local; exact sum ${row.exactTermsMean.toFixed(0)} terms/px mean, ${termsMax} max, ${row.msExactPerPixel.toFixed(2)} ms/px; coefficients ${row.secondsCoefficients.toFixed(0)} s, ladder ${row.secondsLadder.toFixed(0)} s`);
    for (const cap of caps) {
      const r = row.caps[cap || 'none'];
      console.log(`  cap ${String(cap || 'none').padStart(4)}: rms ${r.rms.toExponential(2)} max ${r.max.toExponential(2)} taps ${r.meanTaps.toFixed(1)} mean`);
    }
    void gh;
    void tapCounts;
  }
  writeFileSync(new URL('../../data/tables.json', import.meta.url), JSON.stringify({ protocol: { W, H, sigma: SIG, local: LOCAL }, results }, null, 1));
};
if (process.argv[1] && process.argv[1].endsWith('tables.mjs')) main();
