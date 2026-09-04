// Anti-aliasing as the count-map theory says it: the pixel is a Gaussian
// window on the screen, every shader input is affine across it to first
// order, so the inputs are jointly Gaussian under the window with covariance
// J Sigma J^T, and the pixel's value is the shader's expectation under that
// Gaussian. For periodic inputs the expectation is the multiplier sum, each
// Fourier term times the Gaussian's characteristic function at the term's own
// screen-space rate; the remainder is the curvature term of the multiplier
// theorem. Three experiments, each a claim the general statement makes that
// the paper's tool did not already measure:
//
//   1. The pixel theorem on the canonical aliasing scene, a textured plane in
//      perspective: the multiplier sum against a dense brute-force window
//      integral, per pixel from magnification to twelve periods a pixel, with
//      the theorem's own remainder bound, and the errors of a point sample
//      and of an isotropic (mipmap-like) footprint for comparison.
//   2. The observer theorem in a shader: a ridged normal map under a
//      Blinn-Phong lobe. Filtering the normal and then shading is pooling
//      before responding; the pixel theorem says respond first. And two ridge
//      fields added: a linear shader carries no cross recipe, so a minified
//      pixel shows no beat, while a specular lobe mints one.
//   3. The sampling half. A regular supersampling grid is a comb family, and
//      which harmonics it keeps is arithmetic: at sigma periods a pixel and N
//      samples, harmonic k survives exactly when k sigma / N is whole. So the
//      grid is exact (a slide) at some N and aliases fully at others, and the
//      theory names which. Random samples converge as 1/sqrt N; a golden
//      Kronecker sequence, the desert, as about 1/N.
//
// Run: node paper/tools/exp/aa.mjs

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/aa.json', import.meta.url);
const TAU = 2 * Math.PI;

const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Fourier coefficients of a function on the torus T^2 sampled on an n x n
// grid; exact for trigonometric polynomials below the grid's Nyquist, and the
// textures below are entire with coefficients under 1e-9 by |k| = 20.
const dft2 = (f, n) => {
  const s = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s[i * n + j] = f(i / n, j / n);
  const re1 = new Float64Array(n * n);
  const im1 = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let k2 = 0; k2 < n; k2++) {
      let re = 0;
      let im = 0;
      for (let j = 0; j < n; j++) {
        const a = (-TAU * k2 * j) / n;
        re += s[i * n + j] * Math.cos(a);
        im += s[i * n + j] * Math.sin(a);
      }
      re1[i * n + k2] = re;
      im1[i * n + k2] = im;
    }
  const list = [];
  for (let k1 = 0; k1 < n; k1++)
    for (let k2 = 0; k2 < n; k2++) {
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        const a = (-TAU * k1 * i) / n;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const r = re1[i * n + k2];
        const m = im1[i * n + k2];
        re += r * c - m * sn;
        im += r * sn + m * c;
      }
      const a = k1 < n / 2 ? k1 : k1 - n;
      const b = k2 < n / 2 ? k2 : k2 - n;
      list.push({ a, b, re: re / (n * n), im: im / (n * n) });
    }
  return list;
};

const dft1 = (f, n) => {
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) s[i] = f(i / n);
  const list = [];
  for (let k = 0; k < n; k++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (-TAU * k * i) / n;
      re += s[i] * Math.cos(a);
      im += s[i] * Math.sin(a);
    }
    list.push({ k: k < n / 2 ? k : k - n, re: re / n, im: im / n });
  }
  return list;
};

// The multiplier sum: sum_k fhat(k) e^{2 pi i k.mu} e^{-2 pi^2 k^T S k}, S the
// pushed-forward pixel covariance in count units. Returns the value and the
// number of terms whose multiplier exceeds 1e-12, the pixel's cost.
const multiplier2 = (coef, mu, S) => {
  let v = 0;
  let terms = 0;
  for (const { a, b, re, im } of coef) {
    const q = S[0][0] * a * a + 2 * S[0][1] * a * b + S[1][1] * b * b;
    const w = Math.exp(-2 * Math.PI * Math.PI * q);
    if (w < 1e-12) continue;
    terms++;
    const ph = TAU * (a * mu[0] + b * mu[1]);
    v += w * (re * Math.cos(ph) - im * Math.sin(ph));
  }
  return { v, terms };
};

// Second order: Phi(p+z) = mu + J z + (1/2) z^T H_c z per count c, and the
// Gaussian integral of a quadratic phase is closed form:
//   E exp(i b.z + (i/2) z^T Q z) = prod_j (1 - i rho^2 lambda_j)^{-1/2}
//                                  exp(-(1/2) b^T (Sigma^{-1} - i Q)^{-1} b),
// b = 2 pi J^T k, Q = 2 pi sum_c k_c H_c, lambda_j the eigenvalues of rho^2 Q,
// each root on the principal branch since its real part is one.
const multiplier2nd = (coef, mu, J, Hs, rho) => {
  let v = 0;
  const r2 = rho * rho;
  for (const { a, b, re, im } of coef) {
    const bx = TAU * (J[0][0] * a + J[1][0] * b);
    const by = TAU * (J[0][1] * a + J[1][1] * b);
    const q00 = TAU * (a * Hs[0][0][0] + b * Hs[1][0][0]);
    const q01 = TAU * (a * Hs[0][0][1] + b * Hs[1][0][1]);
    const q11 = TAU * (a * Hs[0][1][1] + b * Hs[1][1][1]);
    // M = Sigma^{-1} - i Q, complex symmetric 2x2
    const m00 = [1 / r2, -q00];
    const m01 = [0, -q01];
    const m11 = [1 / r2, -q11];
    const cm = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
    const det = (() => {
      const p1 = cm(m00, m11);
      const p2 = cm(m01, m01);
      return [p1[0] - p2[0], p1[1] - p2[1]];
    })();
    // b^T M^{-1} b = (m11 bx^2 - 2 m01 bx by + m00 by^2) / det
    const num = [m11[0] * bx * bx - 2 * m01[0] * bx * by + m00[0] * by * by, m11[1] * bx * bx - 2 * m01[1] * bx * by + m00[1] * by * by];
    const dd = det[0] * det[0] + det[1] * det[1];
    const quad = [(num[0] * det[0] + num[1] * det[1]) / dd, (num[1] * det[0] - num[0] * det[1]) / dd];
    const expo = [-0.5 * quad[0], -0.5 * quad[1]];
    if (expo[0] < -28) continue;
    // eigenvalues of rho^2 Q (real symmetric)
    const tr = r2 * (q00 + q11);
    const dq = r2 * r2 * (q00 * q11 - q01 * q01);
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - dq));
    const l1 = tr / 2 + disc;
    const l2 = tr / 2 - disc;
    const root = (l) => {
      // principal sqrt of 1 - i l
      const mod = Math.hypot(1, l);
      const ang = Math.atan2(-l, 1) / 2;
      return [Math.sqrt(mod) * Math.cos(ang), Math.sqrt(mod) * Math.sin(ang)];
    };
    const den = cm(root(l1), root(l2));
    const e = Math.exp(expo[0]);
    const ez = [e * Math.cos(expo[1]), e * Math.sin(expo[1])];
    const dn = den[0] * den[0] + den[1] * den[1];
    const w = [(ez[0] * den[0] + ez[1] * den[1]) / dn, (ez[1] * den[0] - ez[0] * den[1]) / dn];
    const ph = TAU * (a * mu[0] + b * mu[1]);
    const c = [re, im];
    const t = cm(cm(c, [Math.cos(ph), Math.sin(ph)]), w);
    v += t[0];
  }
  return v;
};

const multiplier1 = (coef, mu, s2) => {
  let v = 0;
  for (const { k, re, im } of coef) {
    const w = Math.exp(-2 * Math.PI * Math.PI * s2 * k * k);
    if (w < 1e-14) continue;
    const ph = TAU * k * mu;
    v += w * (re * Math.cos(ph) - im * Math.sin(ph));
  }
  return v;
};

// ---------------------------------------------------------------------------
// 1. The pixel theorem on a plane in perspective.
// Camera at the origin, focal length F pixels, plane at unit depth below,
// tile of unit size: screen (sx, sy), sy < 0, meets the plane at
// (X, Z) = (-sx/sy, -F/sy), and the texture coordinate is (X, Z) mod 1.
// ---------------------------------------------------------------------------
const F = 128;
const RHO = 0.5; // pixel window: Gaussian, half a pixel wide

const texture = (u, v) => Math.exp(2 * Math.cos(TAU * u) + 2 * Math.cos(TAU * v) + 1.5 * Math.cos(TAU * (u - v))) / 40;
const phi = (sx, sy) => [-sx / sy, -F / sy];
const jac = (sx, sy) => [
  [-1 / sy, sx / (sy * sy)],
  [0, F / (sy * sy)],
];
const hess = (sx, sy) => [
  [
    [0, 1 / (sy * sy)],
    [1 / (sy * sy), (-2 * sx) / (sy * sy * sy)],
  ],
  [
    [0, 0],
    [0, (-2 * F) / (sy * sy * sy)],
  ],
];
const hessNorm = (sx, sy) => {
  // largest second derivative of the two counts over the window (the count
  // varies fastest toward the horizon, so take the window's near-horizon edge)
  const y = sy + 4.5 * RHO;
  const d2u = Math.hypot(2 * sx / (y * y * y), 1 / (y * y));
  const d2v = (2 * F) / Math.abs(y * y * y);
  return Math.max(d2u, d2v);
};

const coef2 = dft2(texture, 64);
const tail = Math.max(...coef2.filter(({ a, b }) => Math.max(Math.abs(a), Math.abs(b)) >= 30).map(({ re, im }) => Math.hypot(re, im)));
const S1 = coef2.reduce((acc, { a, b, re, im }) => acc + Math.hypot(a, b) * Math.hypot(re, im), 0);
const kReach = Math.max(...coef2.filter(({ re, im }) => Math.hypot(re, im) > 1e-9).map(({ a, b }) => Math.hypot(a, b)));

const brute = (sx, sy) => {
  // dense grid over +-4.5 rho with Gaussian weights; spacing resolves the
  // fastest significant harmonic anywhere in the window
  const J = jac(sx, sy + 4.5 * RHO);
  const smax = Math.sqrt(Math.max(...[0, 1].map((c) => J[0][c] ** 2 + J[1][c] ** 2)) * 2);
  const spacing = Math.min(0.05, 1 / (3 * kReach * smax));
  const half = 4.5 * RHO;
  const n = Math.ceil((2 * half) / spacing);
  let acc = 0;
  let wsum = 0;
  for (let i = 0; i <= n; i++) {
    const zx = -half + (2 * half * i) / n;
    for (let j = 0; j <= n; j++) {
      const zy = -half + (2 * half * j) / n;
      const w = Math.exp(-(zx * zx + zy * zy) / (2 * RHO * RHO));
      const [u, v] = phi(sx + zx, sy + zy);
      acc += w * texture(u, v);
      wsum += w;
    }
  }
  return { value: acc / wsum, samples: (n + 1) * (n + 1) };
};

const pixels = [];
for (const sx of [0, 60])
  for (const sy of [-128, -64, -32, -24, -16, -12, -10, -8, -6]) {
    const mu = phi(sx, sy);
    const J = jac(sx, sy);
    const S = [
      [RHO * RHO * (J[0][0] ** 2 + J[0][1] ** 2), RHO * RHO * (J[0][0] * J[1][0] + J[0][1] * J[1][1])],
      [0, RHO * RHO * (J[1][0] ** 2 + J[1][1] ** 2)],
    ];
    S[1][0] = S[0][1];
    const { v: mult, terms } = multiplier2(coef2, mu, S);
    const mult2 = multiplier2nd(coef2, mu, J, hess(sx, sy), RHO);
    const ref = brute(sx, sy);
    const point = texture(mu[0], mu[1]);
    const sv = Math.sqrt(Math.max(S[0][0], S[1][1]));
    const iso = multiplier2(coef2, mu, [[sv * sv, 0], [0, sv * sv]]).v;
    const bound = Math.PI * hessNorm(sx, sy) * 2 * RHO * RHO * S1;
    pixels.push({
      sx,
      sy,
      periodsPerPixel: +(F / (sy * sy)).toFixed(4),
      terms,
      brute: ref.value,
      bruteSamples: ref.samples,
      multiplier: mult,
      errMultiplier: Math.abs(mult - ref.value),
      secondOrder: mult2,
      errSecond: Math.abs(mult2 - ref.value),
      bound,
      errPoint: Math.abs(point - ref.value),
      errIsotropic: Math.abs(iso - ref.value),
    });
  }
const withinBound = pixels.every((p) => p.errMultiplier <= p.bound);
const tight = pixels.filter((p) => p.bound < 1e-2);
const smallWhereBoundSmall = tight.every((p) => p.errMultiplier < 1e-4);
const worstMult = Math.max(...pixels.map((p) => p.errMultiplier));
const worstSecond = Math.max(...pixels.map((p) => p.errSecond));
// where the first order errs by more than 5e-3 (the rate changes by tens of
// percent across the window), the second order must take at least four
// fifths of it; the floor it leaves is the third-order phase, a radian at two
// sigma for a fifth harmonic near the horizon
const curved = pixels.filter((p) => p.errMultiplier > 5e-3);
const secondBeatsFirst = curved.length >= 3 && curved.every((p) => p.errSecond < 0.2 * p.errMultiplier);
const worstPoint = Math.max(...pixels.map((p) => p.errPoint));
const meanIso = pixels.reduce((a, p) => a + p.errIsotropic, 0) / pixels.length;
const meanMult = pixels.reduce((a, p) => a + p.errMultiplier, 0) / pixels.length;

// ---------------------------------------------------------------------------
// 2. The observer theorem in a shader.
// ---------------------------------------------------------------------------
const A = 0.15;
const P = 32;
const hvAngle = (35 * Math.PI) / 180;
const HV = [Math.sin(hvAngle), Math.cos(hvAngle)];
const slope = (u) => -TAU * A * Math.sin(TAU * u);
const normalOf = (s) => {
  const n = Math.hypot(s, 1);
  return [-s / n, 1 / n];
};
const lobe = (nrm) => Math.max(0, nrm[0] * HV[0] + nrm[1] * HV[1]) ** P;
const shadeS = (u) => lobe(normalOf(slope(u)));
const coefS = dft1(shadeS, 1024);
const tailS = Math.max(...coefS.filter(({ k }) => Math.abs(k) >= 480).map(({ re, im }) => Math.hypot(re, im)));

const bruteShade = (mu, sig, g) => {
  const half = 5 * sig;
  const spacing = Math.min(1 / 4096, sig / 200);
  const n = Math.ceil((2 * half) / spacing);
  let acc = 0;
  let wsum = 0;
  for (let i = 0; i <= n; i++) {
    const z = -half + (2 * half * i) / n;
    const w = Math.exp(-(z * z) / (2 * sig * sig));
    acc += w * g(mu + z);
    wsum += w;
  }
  return acc / wsum;
};

const shading = [];
for (const sig of [0.01, 0.03, 0.1, 0.2, 0.3, 0.5, 1]) {
  const mu = 0.37;
  const exact = bruteShade(mu, sig, shadeS);
  const mult = multiplier1(coefS, mu, sig * sig);
  // pool then respond: filter the normal, renormalise, shade
  const nx = bruteShade(mu, sig, (u) => normalOf(slope(u))[0]);
  const nz = bruteShade(mu, sig, (u) => normalOf(slope(u))[1]);
  const nn = Math.hypot(nx, nz);
  const naive = lobe([nx / nn, nz / nn]);
  shading.push({ sigma: sig, exact, multiplier: mult, errMultiplier: Math.abs(mult - exact), naive, naiveRatio: exact / naive });
}
const shadeMultOK = shading.every((s) => s.errMultiplier < 1e-6);
const meanLobe = coefS.find(({ k }) => k === 0).re;
const naiveFar = shading[shading.length - 1];

// Two ridge fields added. A linear shader of the summed slope has no cross
// recipe; the specular lobe of the summed normal does.
const LX = Math.sin((30 * Math.PI) / 180);
const LZ = Math.cos((30 * Math.PI) / 180);
const shadeL2 = (u1, u2) => -(slope(u1) + slope(u2)) * LX + LZ;
const shadeS2 = (u1, u2) => lobe(normalOf(slope(u1) + slope(u2)));
const cL = dft2(shadeL2, 64);
const cS = dft2(shadeS2, 64);
const pick = (c, a, b) => {
  const t = c.find((e) => e.a === a && e.b === b);
  return Math.hypot(t.re, t.im);
};
const crossL = pick(cL, 1, -1) / pick(cL, 1, 0);
const crossS = pick(cS, 1, -1) / pick(cS, 1, 0);
const cross2S = pick(cS, 2, -2) / pick(cS, 1, 0);

// The two fields at 1.2 and 1.2/1.08 pixels a period, both along x: the
// carriers are past the pixel's window and the 15-pixel beat is not.
const per1 = 1.2;
const per2 = 1.2 / 1.08;
const beatPeriod = 1 / (1 / per2 - 1 / per1);
const Sbeat = (() => {
  const j = [1 / per1, 1 / per2];
  return [
    [RHO * RHO * j[0] * j[0], RHO * RHO * j[0] * j[1]],
    [RHO * RHO * j[0] * j[1], RHO * RHO * j[1] * j[1]],
  ];
})();
// sixty pixels along x hold four beats exactly; the beat's own bin of the
// line's spectrum, relative to the mean, is its contrast, and the carriers'
// residue under the window lands in other bins
const line = (c) => {
  const vals = [];
  for (let x = 0; x < 60; x++) vals.push(multiplier2(c, [x / per1, x / per2], Sbeat).v);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  let re = 0;
  let im = 0;
  for (let x = 0; x < 60; x++) {
    re += vals[x] * Math.cos((TAU * 4 * x) / 60);
    im += vals[x] * Math.sin((TAU * 4 * x) / 60);
  }
  const residue = (Math.max(...vals) - Math.min(...vals)) / mean;
  return { contrast: (2 * Math.hypot(re, im)) / 60 / mean, residue, mean };
};
const beatL = line(cL);
const beatS = line(cS);

// ---------------------------------------------------------------------------
// 3. The sampling half: stations of a supersampling grid, and the desert.
// ---------------------------------------------------------------------------
const H = 8;
const r3 = rng(7);
const theta = Array.from({ length: H + 1 }, () => TAU * r3());
const content = (u) => {
  let v = 0;
  for (let k = 1; k <= H; k++) v += Math.cos(TAU * k * u + theta[k]) / k;
  return v;
};
// the pixel is a box of one pixel, sigma periods wide, starting at u0
const boxMean = (u0, sig) => {
  let v = 0;
  for (let k = 1; k <= H; k++) v += (Math.sin(TAU * k * (u0 + sig) + theta[k]) - Math.sin(TAU * k * u0 + theta[k])) / (k * TAU * k * sig);
  return v;
};
const estimate = (u0, sig, ts) => ts.reduce((a, t) => a + content(u0 + sig * t), 0) / ts.length;
const regular = (N) => Array.from({ length: N }, (_, j) => (j + 0.5) / N);
const GOLD = (Math.sqrt(5) - 1) / 2;
const kronecker = (N, t0) => Array.from({ length: N }, (_, j) => (t0 + j * GOLD) % 1);

const u0 = 0.123;
const sigGrid = 2;
const target = boxMean(u0, sigGrid);
const stations = [];
for (let N = 1; N <= 20; N++) {
  const err = Math.abs(estimate(u0, sigGrid, regular(N)) - target);
  // the grid keeps harmonic k when k sigma / N is whole; predicted exact when
  // no k <= H does
  let kept = [];
  for (let k = 1; k <= H; k++) if (Number.isInteger((k * sigGrid) / N)) kept.push(k);
  stations.push({ N, err, kept, predictedExact: kept.length === 0 });
}
const stationsOK = stations.every((s) => (s.predictedExact ? s.err < 1e-10 : s.err > 1e-3));

const rr = rng(11);
const randomErr = {};
const kronErr = {};
for (const N of [16, 64, 256, 1024]) {
  let acc = 0;
  const trials = 200;
  for (let t = 0; t < trials; t++) {
    const ts = Array.from({ length: N }, () => rr());
    acc += Math.abs(estimate(u0, sigGrid, ts) - target);
  }
  randomErr[N] = acc / trials;
  let accK = 0;
  for (let t = 0; t < trials; t++) accK += Math.abs(estimate(u0, sigGrid, kronecker(N, rr())) - target);
  kronErr[N] = accK / trials;
}
const randomScaling = randomErr[16] / randomErr[1024];
const kronScaling = kronErr[16] / kronErr[1024];

// ---------------------------------------------------------------------------
const gates = {
  textureTail: tail < 1e-8,
  pixelWithinBound: withinBound,
  pixelSmallWhereBoundSmall: smallWhereBoundSmall,
  secondOrderBeatsFirst: secondBeatsFirst,
  secondOrderWorst: worstSecond < 5e-3,
  shadeTail: tailS < 1e-6,
  shadeMultiplier: shadeMultOK,
  naiveLosesHighlight: naiveFar.naiveRatio > 10,
  linearNoCross: crossL < 1e-12,
  specularCross: crossS > 1e-3,
  linearNoBeat: beatL.contrast < 1e-6,
  specularBeat: beatS.contrast > 0.01,
  gridStations: stationsOK,
  randomRootN: randomScaling > 5 && randomScaling < 12,
  desertFasterThanRandom: kronScaling > 2.5 * randomScaling,
};
const ok = Object.values(gates).every(Boolean);

writeFileSync(
  OUT,
  JSON.stringify(
    {
      pixel: { rho: RHO, focal: F, textureTail: tail, kReach, S1, pixels, worstMult, worstSecond, worstPoint, meanIso, meanMult },
      shading: { amplitude: A, power: P, halfAngleDeg: 35, meanLobe, shading, crossL, crossS, cross2S, beatPeriod, beatL, beatS },
      sampling: { harmonics: H, sigma: sigGrid, target, stations, randomErr, kronErr, randomScaling, kronScaling },
      gates,
    },
    null,
    1,
  ),
);

console.log('pixel theorem, plane in perspective (rho = 0.5 px):');
console.log('  sx   sy   per/px  terms   brute       multiplier  |err|     2nd order |err2|    bound     |point|   |iso|');
for (const p of pixels)
  console.log(
    `  ${String(p.sx).padStart(2)} ${String(p.sy).padStart(5)} ${String(p.periodsPerPixel).padStart(8)} ${String(p.terms).padStart(5)}   ${p.brute.toFixed(6)}   ${p.multiplier.toFixed(6)}   ${p.errMultiplier.toExponential(1)}   ${p.secondOrder.toFixed(6)}  ${p.errSecond.toExponential(1)}   ${p.bound.toExponential(1)}   ${p.errPoint.toExponential(1)}   ${p.errIsotropic.toExponential(1)}`,
  );
console.log(`  worst multiplier error ${worstMult.toExponential(2)}, second order ${worstSecond.toExponential(2)}, worst point-sample error ${worstPoint.toExponential(2)}, mean isotropic error ${meanIso.toExponential(2)}`);
console.log('shading: ridge normal map under a Blinn-Phong lobe');
for (const s of shading) console.log(`  sigma ${s.sigma}: exact ${s.exact.toExponential(3)} multiplier err ${s.errMultiplier.toExponential(1)} naive ${s.naive.toExponential(3)} ratio ${s.naiveRatio.toFixed(1)}`);
console.log(`  cross recipe (1,-1) relative to (1,0): linear ${crossL.toExponential(1)}, specular ${crossS.toExponential(2)}, (2,-2) ${cross2S.toExponential(2)}`);
console.log(`  beat contrast at ${beatPeriod.toFixed(1)} px: linear ${beatL.contrast.toExponential(1)} (carrier residue ${beatL.residue.toExponential(1)}), specular ${beatS.contrast.toFixed(3)}`);
console.log(`sampling at ${sigGrid} periods a pixel, harmonics to ${H}:`);
console.log('  ' + stations.map((s) => `N${s.N}:${s.predictedExact ? 'exact' : 'k' + s.kept.join(',')}=${s.err.toExponential(0)}`).join(' '));
console.log(`  random ${JSON.stringify(randomErr)} scaling x${randomScaling.toFixed(1)}; golden ${JSON.stringify(kronErr)} scaling x${kronScaling.toFixed(1)}`);
console.log(gates);
console.log(ok ? 'all gates pass' : 'GATE FAILURE');
