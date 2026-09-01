// The observer theorem, checked (paper/notes/observer.md). Every front-end
// observer -- a pointwise nonlinearity N followed by a pooling window W at
// scale rho -- reports at a pixel p the ink potential N∘I filtered ON THE
// TORUS by the multiplier m_p(k) = Ŵ(rho · ∇(k·Φ)(p)): the window's transfer
// function at each character's own local frequency. The counting map alone
// decides which characters are slow; an observer chooses only the potential
// it averages. Four things are gated here:
//   0. which character of a 16.4:8 pair is slow -- (2,-1), period 328 world
//      units -- against the fast ones a script can mistake for it;
//   1. the multiplier identity itself, against a direct window average of a
//      chirped pair: exact without curvature, and with it the remainder sits
//      inside the stated bound and IS the multiplier's second derivative;
//   2. which observers see a beat: an additive superposition (two incoherent
//      light gratings) carries no cross character, so no linear observer sees
//      its moiré, while a squaring or saturating front end mints one at the
//      predicted amplitude -- and the multiplicative overlay of printed ink
//      carries it at the linear level;
//   3. hard ink is observer-proof (N∘I is affine in a two-valued I, so the
//      duty null of the 2:1 pair's (2,-1) station holds for every observer),
//      but a blurred stroke is not: a squaring observer reopens the null in
//      proportion to the ramp width.
// Run: node paper/tools/exp/observer.mjs

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/observer.json', import.meta.url);
const TAU = 2 * Math.PI;
const gates = [];
const gate = (name, ok, detail) => {
  gates.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
};

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-12)));
  return t * t * (3 - 2 * t);
};
/** Stroke alpha of a family with spacing s as a function of its fractional
 * index t: a pulse of half-width h with anti-alias ramps of half-width aa, in
 * world units -- the tool's own profile. */
const stroke = (s, h, aa) => (t) => {
  const d = Math.abs(t - Math.round(t)) * s;
  return aa > 0 ? 1 - smoothstep(h - aa, h + aa, d) : d <= h ? 1 : 0;
};

/** Fourier coefficients of a function on T^2 for |a|, |b| <= K, on an M x M
 * midpoint grid (edges of a hard pulse fall between samples). Separable DFT:
 * rows over t2, then columns over t1. */
function spectrum(fn, M, K) {
  const n = 2 * K + 1;
  const cosT = new Float64Array(n * M);
  const sinT = new Float64Array(n * M);
  for (let j = 0; j < n; j += 1) {
    const b = j - K;
    for (let m = 0; m < M; m += 1) {
      const ph = TAU * b * ((m + 0.5) / M);
      cosT[j * M + m] = Math.cos(ph);
      sinT[j * M + m] = Math.sin(ph);
    }
  }
  const rowRe = new Float64Array(M * n);
  const rowIm = new Float64Array(M * n);
  const vals = new Float64Array(M);
  for (let m1 = 0; m1 < M; m1 += 1) {
    const t1 = (m1 + 0.5) / M;
    for (let m2 = 0; m2 < M; m2 += 1) vals[m2] = fn(t1, (m2 + 0.5) / M);
    for (let j = 0; j < n; j += 1) {
      let re = 0;
      let im = 0;
      for (let m2 = 0; m2 < M; m2 += 1) {
        re += vals[m2] * cosT[j * M + m2];
        im -= vals[m2] * sinT[j * M + m2];
      }
      rowRe[m1 * n + j] = re / M;
      rowIm[m1 * n + j] = im / M;
    }
  }
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let sr = 0;
      let si = 0;
      for (let m1 = 0; m1 < M; m1 += 1) {
        const c = cosT[i * M + m1];
        const s = sinT[i * M + m1];
        const r = rowRe[m1 * n + j];
        const q = rowIm[m1 * n + j];
        // (r + i q) (c - i s)
        sr += r * c + q * s;
        si += q * c - r * s;
      }
      re[i * n + j] = sr / M;
      im[i * n + j] = si / M;
    }
  }
  const at = (a, b) => {
    const i = a + K;
    const j = b + K;
    return { re: re[i * n + j], im: im[i * n + j], abs: Math.hypot(re[i * n + j], im[i * n + j]) };
  };
  return { K, at };
}

/** 1-D Fourier coefficient of a period-1 function, midpoint rule. */
function coef1(fn, n, M = 8192) {
  let re = 0;
  let im = 0;
  for (let m = 0; m < M; m += 1) {
    const t = (m + 0.5) / M;
    const v = fn(t);
    re += v * Math.cos(TAU * n * t);
    im -= v * Math.sin(TAU * n * t);
  }
  return { re: re / M, im: im / M, abs: Math.hypot(re, im) / M };
}

const out = {};

// ------------------------------------------------------------- 0. slowness
// The tool's duty-null exhibit is a 16.4 : 8 pair. Its visible station is the
// character whose pullback is slow, and only one candidate is: (2,-1), with
// frequency 2/16.4 - 1/8 = -1/328 cycles per world unit. (1,-2) and (1,-1)
// are carrier-scale coefficients of the same drawing -- real, product-of-
// harmonics like every coefficient, but no fringe.
{
  const sA = 16.4;
  const sB = 8;
  const freq = (a, b) => Math.abs(a / sA + b / sB);
  const slow = freq(2, -1);
  const fast = Math.min(freq(1, -2), freq(1, -1));
  out.slowness = { pair: [sA, sB], station: [2, -1], slow, fast12: freq(1, -2), fast11: freq(1, -1) };
  gate(
    'the 16.4:8 pair beats in (2,-1)',
    Math.abs(slow - 1 / 328) < 1e-12 && fast > 0.05,
    `|(2,-1)| = 1/${(1 / slow).toFixed(1)} per world unit, (1,-2) at 1/${(1 / freq(1, -2)).toFixed(1)}, (1,-1) at 1/${(1 / freq(1, -1)).toFixed(1)}`
  );
}

// ------------------------------------------------------------- 1. multiplier
// A near-2:1 pair of soft strokes, the coarse family chirped: Φ(x) = (x/sA +
// c x^2, x/sB). A Gaussian window of standard deviation rho pooled over the
// drawing at p is predicted by the multiplier m(k) = exp(-2 pi^2 rho^2
// (k·J)^2) applied to the potential's coefficients, with J = Φ'(p); the
// curvature remainder is bounded by 2 pi c rho^2 Σ |a| |Î(a,b)|, and to first
// order it is 2 pi i a c F(k·J) with F = -Ŵ''/(4 pi^2), the window's second
// moment at the character's frequency -- the multiplier's own curvature.
{
  const sA = 16.4;
  const sB = 8;
  const alphaA = stroke(sA, 3, 0.7);
  const alphaB = stroke(sB, 1.5, 0.7);
  const potential = (t1, t2) => (1 - alphaA(t1)) * (1 - alphaB(t2));
  const K = 48;
  const spec = spectrum(potential, 512, K);
  let weighted = 0;
  for (let a = -K; a <= K; a += 1) for (let b = -K; b <= K; b += 1) weighted += Math.abs(a) * spec.at(a, b).abs;

  const pooled = (drawing, p, rho) => {
    const h = 0.05;
    let sum = 0;
    let wsum = 0;
    for (let x = p - 6 * rho; x <= p + 6 * rho; x += h) {
      const w = Math.exp(-0.5 * ((x - p) / rho) ** 2);
      sum += w * drawing(x);
      wsum += w;
    }
    return sum / wsum;
  };
  const predicted = (phi, J, rho, curv = 0) => {
    let v = 0;
    for (let a = -K; a <= K; a += 1) {
      for (let b = -K; b <= K; b += 1) {
        const c = spec.at(a, b);
        const nu = a * J[0] + b * J[1];
        const g = Math.exp(-2 * Math.PI * Math.PI * rho * rho * nu * nu);
        // The multiplier, plus the first-order curvature term: 2 pi i a c F
        // with F(nu) = rho^2 (1 - 4 pi^2 nu^2 rho^2) g, the Gaussian's
        // second moment at frequency nu.
        const F = rho * rho * (1 - 4 * Math.PI * Math.PI * nu * nu * rho * rho) * g;
        const mRe = g;
        const mIm = TAU * a * curv * F;
        const ph = TAU * (a * phi[0] + b * phi[1]);
        // Re[(mRe + i mIm) (c.re + i c.im) e^{i ph}]
        const zr = mRe * c.re - mIm * c.im;
        const zi = mRe * c.im + mIm * c.re;
        v += zr * Math.cos(ph) - zi * Math.sin(ph);
      }
    }
    return v;
  };

  const rows = [];
  for (const c of [0, 5e-8]) {
    const drawing = (x) => potential(x / sA + c * x * x, x / sB);
    for (const p of [0, 37, -120]) {
      const phi = [p / sA + c * p * p, p / sB];
      const J = [1 / sA + 2 * c * p, 1 / sB];
      for (const rho of [20, 40]) {
        const direct = pooled(drawing, p, rho);
        const pred = predicted(phi, J, rho);
        const corrected = predicted(phi, J, rho, c);
        const bound = TAU * c * rho * rho * weighted;
        rows.push({
          c,
          p,
          rho,
          direct,
          predicted: pred,
          err: Math.abs(direct - pred),
          errCorrected: Math.abs(direct - corrected),
          bound,
        });
      }
    }
  }
  out.multiplier = rows;
  const flat = rows.filter((r) => r.c === 0);
  const curved = rows.filter((r) => r.c > 0);
  const flatWorst = Math.max(...flat.map((r) => r.err));
  gate(
    'window average = torus multiplier (no curvature)',
    flatWorst < 5e-5,
    `worst |direct - predicted| ${flatWorst.toExponential(1)} over ${flat.length} pooled samples`
  );
  const inBound = curved.every((r) => r.err <= r.bound);
  gate(
    'curvature remainder inside its bound',
    inBound,
    curved.map((r) => `p=${r.p} rho=${r.rho}: ${r.err.toExponential(1)} <= ${r.bound.toExponential(1)}`).join('; ')
  );
  // Where the remainder is measurable at all, the multiplier's second
  // derivative accounts for it: the corrected prediction leaves at most a
  // tenth of the uncorrected error.
  const visible = curved.filter((r) => r.err > 1e-6);
  gate(
    'the remainder is the multiplier\'s second derivative',
    visible.length >= 3 && visible.every((r) => r.errCorrected <= 0.1 * r.err),
    visible.map((r) => `p=${r.p} rho=${r.rho}: ${r.err.toExponential(1)} -> ${r.errCorrected.toExponential(1)}`).join('; ')
  );
  const fringe = Math.abs(rows[0].direct - rows[2].direct);
  out.multiplierFringeSwing = fringe;
}

// ------------------------------------------------------------- 2. who sees it
// A near-1:1 pair, beat period 328. The printed overlay (1-a)(1-b) carries the
// cross character (1,-1) with coefficient â(1) b̂(-1); the additive
// superposition (a+b)/2 carries none. A squaring front end gives the sum the
// cross term a b / 2; a hard saturation min(a+b, 1) gives it one too.
{
  const sA = 8.2;
  const sB = 8;
  const alphaA = stroke(sA, 1.5, 0.7);
  const alphaB = stroke(sB, 1.5, 0.7);
  const K = 24;
  const M = 512;
  const mul = (t1, t2) => (1 - alphaA(t1)) * (1 - alphaB(t2));
  const add = (t1, t2) => (alphaA(t1) + alphaB(t2)) / 2;
  const specs = {
    'multiplicative, linear observer': spectrum(mul, M, K),
    'additive, linear observer': spectrum(add, M, K),
    'additive, squaring observer': spectrum((t1, t2) => add(t1, t2) ** 2, M, K),
    'additive, saturating observer': spectrum((t1, t2) => Math.min(2 * add(t1, t2), 1), M, K),
  };
  const a1 = coef1(alphaA, 1);
  const b1 = coef1(alphaB, -1);
  const product = a1.abs * b1.abs;
  const beat = {};
  for (const [name, s] of Object.entries(specs)) beat[name] = s.at(1, -1).abs;
  out.visibility = { beat, product };
  const rel = (x, y) => Math.abs(x - y) / Math.max(y, 1e-12);
  gate(
    'printed overlay: linear observer sees the beat at â(1) b̂(1)',
    rel(beat['multiplicative, linear observer'], product) < 1e-6,
    `${beat['multiplicative, linear observer'].toExponential(4)} vs ${product.toExponential(4)}`
  );
  gate(
    'additive light: no linear observer sees a beat',
    beat['additive, linear observer'] < 1e-10,
    `|(1,-1)| = ${beat['additive, linear observer'].toExponential(1)}`
  );
  gate(
    'additive light: a squaring observer mints the beat at â(1) b̂(1) / 2',
    rel(beat['additive, squaring observer'], product / 2) < 1e-6,
    `${beat['additive, squaring observer'].toExponential(4)} vs ${(product / 2).toExponential(4)}`
  );
  gate(
    'additive light: a saturating observer mints a beat',
    beat['additive, saturating observer'] > 0.01,
    `|(1,-1)| = ${beat['additive, saturating observer'].toExponential(3)}`
  );

  // The same coefficient read off a long strip of the drawing itself: 8 exact
  // beat periods at twenty samples per world unit.
  const L = 8 * 328;
  const step = 0.05;
  const nu = 1 / sA - 1 / sB;
  const proj = (fn) => {
    let re = 0;
    let im = 0;
    let n = 0;
    for (let x = step / 2; x < L; x += step) {
      const v = fn(x);
      re += v * Math.cos(TAU * nu * x);
      im += v * Math.sin(TAU * nu * x);
      n += 1;
    }
    return Math.hypot(re, im) / n;
  };
  const stripMul = proj((x) => mul(x / sA, x / sB));
  const stripSq = proj((x) => add(x / sA, x / sB) ** 2);
  out.visibilityStrip = { stripMul, stripSq };
  gate(
    'strip projection agrees with the torus coefficient',
    rel(stripMul, product) < 1e-4 && rel(stripSq, product / 2) < 1e-4,
    `strip ${stripMul.toExponential(4)} / ${stripSq.toExponential(4)} vs ${product.toExponential(4)} / ${(product / 2).toExponential(4)}`
  );
}

// ------------------------------------------------------------- 3. duty null
// The 2:1 pair's station (2,-1) rides the coarse family's second harmonic,
// which a duty-1/2 pulse lacks. Hard ink makes N∘I affine in I, so every
// observer keeps the null; a soft stroke keeps it for a linear observer
// (the trapezoid at duty 1/2 is exactly half-wave antisymmetric, ramps
// included) and loses it under a squaring one, by an amount that grows with
// the ramp.
{
  const sA = 16.4;
  const sB = 8;
  const K = 4;
  const M = 1024;
  const rows = [];
  for (const aa of [0, 0.35, 0.7, 1.4]) {
    const alphaA = stroke(sA, sA / 4, aa);
    const alphaB = stroke(sB, 1.5, aa);
    const mul = (t1, t2) => (1 - alphaA(t1)) * (1 - alphaB(t2));
    const linear = spectrum(mul, M, K).at(2, -1).abs;
    const squared = spectrum((t1, t2) => mul(t1, t2) ** 2, M, K).at(2, -1).abs;
    rows.push({ aa, linear, squared });
    console.log(`  duty null at aa ${aa.toFixed(2)}: linear ${linear.toExponential(2)}, squaring ${squared.toExponential(2)}`);
  }
  out.dutyNull = rows;
  gate(
    'hard ink: the null holds for every observer',
    rows[0].linear < 1e-12 && rows[0].squared < 1e-12,
    `linear ${rows[0].linear.toExponential(1)}, squaring ${rows[0].squared.toExponential(1)}`
  );
  gate(
    'soft ink: a linear observer keeps the null at every ramp',
    rows.every((r) => r.linear < 1e-10),
    rows.map((r) => r.linear.toExponential(1)).join(', ')
  );
  const soft = rows.slice(1);
  gate(
    'soft ink: a squaring observer reopens the null, growing with the ramp',
    soft.every((r) => r.squared > 1e-4) && soft.every((r, i) => i === 0 || r.squared > soft[i - 1].squared),
    soft.map((r) => `aa ${r.aa}: ${r.squared.toExponential(2)}`).join(', ')
  );
}

const failed = gates.filter((g) => !g.ok);
writeFileSync(OUT, JSON.stringify({ ...out, gates }, null, 1));
console.log(failed.length ? `GATE FAILURE (${failed.length})` : 'all gates pass');
process.exitCode = failed.length ? 1 : 0;
