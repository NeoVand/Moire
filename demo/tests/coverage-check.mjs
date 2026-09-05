// The kernel's coverage integrals validated on the CPU against fine references and dense grids of the true source: the bivariate-normal jump formula for checker corners, the quadratic region (disc coverage), the Gaussianised count's error that the exact projective pullback removes, the pullback itself for the checker and the discs on two cameras, and the homography sign and scale invariance. Run: node demo/tests/coverage-check.mjs (several minutes; the grids dominate).
// CPU prototypes of the faster coverage integrals for the GPU kernel, with
// their accuracy against fine references.
//   checkerboard corner: E[w(U) w(V)] by bivariate-normal upper-tail
//     probabilities at the crossings (the jump formula) versus the panel
//     integral the kernel uses now
//   disc: P(q(x) <= 0) by a Gauss-Hermite outer integral in the gradient
//     frame versus the eigenframe panel integral
const TAU = 2 * Math.PI;
const erf = (x) => {
  // Abramowitz-Stegun 7.1.26, as in the kernel
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return s * y;
};
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const gaussLegendre = (n) => {
  const x = [];
  const w = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * pp * pp));
  }
  return { x, w };
};
// probabilists' Gauss-Hermite: nodes of He_n, weights for the standard normal density
const gaussHermite = (n) => {
  const x = [];
  const w = [];
  for (let i = 0; i < n; i++) {
    let z;
    if (i === 0) z = Math.sqrt(2 * n + 1) - 1.85575 * Math.pow(2 * n + 1, -1 / 6);
    else if (i === 1) z = x[0] - 1.14 * Math.pow(n, 0.426) / x[0];
    else if (i === 2) z = 1.86 * x[1] - 0.86 * x[0];
    else if (i === 3) z = 1.91 * x[2] - 0.91 * x[1];
    else z = 2 * x[i - 1] - x[i - 2];
    // physicists' guesses (roots of H_n), Newton on H_n, then scale to He_n
    let pp = 0;
    for (let it = 0; it < 200; it++) {
      let p1 = Math.pow(Math.PI, -0.25);
      let p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = z * Math.sqrt(2 / j) * p2 - Math.sqrt((j - 1) / j) * p3;
      }
      pp = Math.sqrt(2 * n) * p2;
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-14) break;
    }
    x.push(z);
    w.push(2 / (pp * pp));
  }
  // physicists' (weight e^{-x^2}, sum w = sqrt(pi)) to probabilists' (weight phi, sum w = 1): x -> sqrt(2) x, w -> w / sqrt(pi)
  return { x: x.map((v) => Math.SQRT2 * v), w: w.map((v) => v / Math.sqrt(Math.PI)) };
};
// ---------------------------------------------------------------------------
// bivariate normal upper tail P(X > h, Y > k), correlation r, |r| <= 0.925 (Genz 2004)
const GL12 = gaussLegendre(12);
const bvnu = (h, k, r, gl = GL12) => {
  const hk = h * k;
  const hs = 0.5 * (h * h + k * k);
  const asr = Math.asin(r);
  let bvn = 0;
  for (let i = 0; i < gl.x.length; i++) {
    const sn = Math.sin((asr * (gl.x[i] + 1)) / 2);
    bvn += gl.w[i] * Math.exp((sn * hk - hs) / (1 - sn * sn));
  }
  return (bvn * asr) / (2 * TAU) + Phi(-h) * Phi(-k);
};
// |r| > 0.925: P(X > h, Y > k) = int_h^inf phi(x) Phibar((k - r x)/s) dx, s = sqrt(1 - r^2),
// the transition at x* = k / r of width s/|r|; closed form outside, Gauss-Legendre inside
const GL16 = gaussLegendre(16);
const bvnuHigh = (h, k, r, gl = GL16) => {
  const s = Math.sqrt(Math.max(1 - r * r, 1e-14));
  const xs = k / r;
  const half = (6 * s) / Math.abs(r);
  let a = xs - half;
  let b = xs + half;
  let acc = 0;
  // below the transition: Phibar((k - r x)/s) is 1 when r > 0 and x > x* ... take the side by sign
  // for r > 0: x < x* gives k - r x > 0 large -> Phibar ~ 0; x > x* -> Phibar ~ 1
  // for r < 0: x < x* gives k - r x = k + |r| x, and x* = k/r negative ... the transition is still at x*
  const lo = Math.max(h, a);
  if (b > h) {
    // the tail above b
    const tailAbove = r > 0 ? Phi(-Math.max(b, h)) : 0;
    const tailBelowMid = r > 0 ? 0 : Phi(-h) - Phi(-Math.max(lo, h)); // r < 0: Phibar ~ 1 for x < x*
    acc += tailAbove + (r < 0 && a > h ? Phi(-h) - Phi(-a) : 0);
    if (lo < b) {
      const hw = 0.5 * (b - lo);
      const mid = 0.5 * (b + lo);
      for (let i = 0; i < gl.x.length; i++) {
        const x = mid + hw * gl.x[i];
        acc += gl.w[i] * hw * 0.3989422804014327 * Math.exp(-0.5 * x * x) * Phi(-(k - r * x) / s);
      }
    }
    void tailBelowMid;
  } else {
    // the whole half-line is beyond the transition on one side
    acc = r > 0 ? Phi(-h) : 0;
  }
  return acc;
};
const bvnuAny = (h, k, r) => (Math.abs(r) <= 0.925 ? bvnu(h, k, r) : bvnuHigh(h, k, r));
// the square wave w = +1 where fract < 1/2
const wOf = (u) => ((u - Math.floor(u)) < 0.5 ? 1 : -1);
// E[w(U)] exact
const Ew = (mu, s) => {
  if (s > 1.6) return 0;
  let acc = 0;
  for (let n = Math.floor(mu - 5.5 * s - 1); n <= Math.ceil(mu + 5.5 * s + 1); n++) acc += 2 * Phi((n + 0.5 - mu) / s) - Phi((n - mu) / s) - Phi((n + 1 - mu) / s);
  return acc;
};
// crossings of w along mu + s z within |z| < L
const crossings = (mu, s, L = 5.5) => {
  const out = [];
  const hlo = Math.floor(2 * (mu - L * s)) + 1;
  const hhi = Math.floor(2 * (mu + L * s));
  for (let h = hlo; h <= hhi; h++) out.push({ x: 0.5 * h, jump: h % 2 === 0 ? 2 : -2 }); // at an integer w jumps -1 -> +1 (+2); at a half-integer +1 -> -1 (-2)
  return out;
};
// the jump formula with BVN
const EwwBVN = (mu, su, mv, sv, rho) => {
  const cu = crossings(mu, su);
  const cv = crossings(mv, sv);
  const wu0 = wOf(mu - 5.5 * su); // w(U) at the low end, below the first crossing
  const wv0 = wOf(mv - 5.5 * sv);
  let acc = wu0 * wv0;
  for (const a of cu) acc += wv0 * a.jump * Phi(-(a.x - mu) / su);
  for (const b of cv) acc += wu0 * b.jump * Phi(-(b.x - mv) / sv);
  for (const a of cu) for (const b of cv) acc += a.jump * b.jump * bvnuAny((a.x - mu) / su, (b.x - mv) / sv, rho);
  return acc;
};
// the panel integral (the kernel's EwwOuter) with a chosen panel width and node count
const EwwPanels = (mu, su, mv, sv, rho, width = 1.2, gl = gaussLegendre(8)) => {
  const svc = sv * Math.sqrt(Math.max(1 - rho * rho, 1e-6));
  const zlo = -5.5;
  const zhi = 5.5;
  const cuts = [zlo, ...crossings(mu, su).map((c) => (c.x - mu) / su).filter((z) => z > zlo && z < zhi), zhi];
  let acc = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b <= a) continue;
    const wu = wOf(mu + su * 0.5 * (a + b));
    const panels = Math.ceil((b - a) / width);
    const dz = (b - a) / panels;
    let seg = 0;
    for (let q = 0; q < panels; q++) {
      const pa = a + q * dz;
      const half = 0.5 * dz;
      const mid = pa + half;
      for (let k = 0; k < gl.x.length; k++) {
        const z = mid + half * gl.x[k];
        const phi = 0.3989422804014327 * Math.exp(-0.5 * z * z);
        seg += gl.w[k] * half * phi * Ew(mv + rho * sv * z, svc);
      }
    }
    acc += wu * seg;
  }
  return acc;
};
// ---------------------------------------------------------------------------
// disc coverage P(q(x) <= 0), q = a0 + g.x + x^T H x / 2, x ~ N(0, S I)
// the interval of y where (lin/2) y^2 + b y + c <= 0, as a probability under N(0, S)
const innerProb = (lin, b, c, sig) => {
  if (Math.abs(lin) < 1e-9) {
    if (Math.abs(b) < 1e-12) return c <= 0 ? 1 : 0;
    const y = -c / b;
    return b > 0 ? Phi(y / sig) : 1 - Phi(y / sig);
  }
  const D = b * b - 2 * lin * c;
  if (D <= 0) return lin < 0 ? 1 : 0;
  const sq = Math.sqrt(D);
  const y1 = (-b - sq) / lin;
  const y2 = (-b + sq) / lin;
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  const p = Phi(hi / sig) - Phi(lo / sig);
  return lin > 0 ? p : 1 - p;
};
// eigenframe + panels (the kernel's quadCoverage), width in sigmas
const discPanels = (a0, g, H, S, width = 1.2, gl = gaussLegendre(8)) => {
  const sig = Math.sqrt(S);
  const tr = H[0] + H[2];
  const dt = H[0] * H[2] - H[1] * H[1];
  const disc = Math.sqrt(Math.max(0.25 * tr * tr - dt, 0));
  let l1 = 0.5 * tr + disc;
  let l2 = 0.5 * tr - disc;
  let e1 = [1, 0];
  if (Math.abs(H[1]) > 1e-12) {
    const v = [l1 - H[2], H[1]];
    const n = Math.hypot(v[0], v[1]);
    e1 = [v[0] / n, v[1] / n];
  } else if (H[2] > H[0]) e1 = [0, 1];
  let e2 = [-e1[1], e1[0]];
  let lin = l1;
  let lout = l2;
  let ein = e1;
  let eout = e2;
  if (Math.abs(l2) > Math.abs(l1)) {
    lin = l2;
    lout = l1;
    ein = e2;
    eout = e1;
  }
  const gin = g[0] * ein[0] + g[1] * ein[1];
  const gout = g[0] * eout[0] + g[1] * eout[1];
  const L = 5.5 * sig;
  // cuts where the discriminant changes sign
  const A = -lin * lout;
  const B = -2 * lin * gout;
  const C = gin * gin - 2 * lin * a0;
  const cuts = [-L, L];
  if (Math.abs(A) > 1e-12) {
    const dd = B * B - 4 * A * C;
    if (dd > 0) {
      const sq = Math.sqrt(dd);
      for (const r of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (r > -L && r < L) cuts.push(r);
    }
  } else if (Math.abs(B) > 1e-12) {
    const r = -C / B;
    if (r > -L && r < L) cuts.push(r);
  }
  cuts.sort((p, q) => p - q);
  let acc = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 1e-12) continue;
    const panels = Math.ceil((b - a) / (width * sig));
    const dz = (b - a) / panels;
    for (let q = 0; q < panels; q++) {
      const pa = a + q * dz;
      const half = 0.5 * dz;
      const mid = pa + half;
      for (let k = 0; k < gl.x.length; k++) {
        const t = mid + half * gl.x[k];
        const phi = (0.3989422804014327 * Math.exp((-0.5 * t * t) / S)) / sig;
        const c = a0 + gout * t + 0.5 * lout * t * t;
        acc += gl.w[k] * half * phi * innerProb(lin, gin, c, sig);
      }
    }
  }
  return acc;
};
// eigenframe with the mapped outer rule on the non-empty segments: t = mid + half sin(pi x / 2)
const discMapped = (a0, g, H, S, gl = gaussLegendre(12)) => {
  const sig = Math.sqrt(S);
  const tr = H[0] + H[2];
  const dt = H[0] * H[2] - H[1] * H[1];
  const disc = Math.sqrt(Math.max(0.25 * tr * tr - dt, 0));
  let l1 = 0.5 * tr + disc;
  let l2 = 0.5 * tr - disc;
  let e1 = [1, 0];
  if (Math.abs(H[1]) > 1e-12) {
    const v = [l1 - H[2], H[1]];
    const n = Math.hypot(v[0], v[1]);
    e1 = [v[0] / n, v[1] / n];
  } else if (H[2] > H[0]) e1 = [0, 1];
  let e2 = [-e1[1], e1[0]];
  let lin = l1;
  let lout = l2;
  let ein = e1;
  let eout = e2;
  if (Math.abs(l2) > Math.abs(l1)) {
    lin = l2;
    lout = l1;
    ein = e2;
    eout = e1;
  }
  const gin = g[0] * ein[0] + g[1] * ein[1];
  const gout = g[0] * eout[0] + g[1] * eout[1];
  const L = 5.5 * sig;
  const A = -lin * lout;
  const B = -2 * lin * gout;
  const C = gin * gin - 2 * lin * a0;
  const cuts = [-L, L];
  if (Math.abs(A) > 1e-12) {
    const dd = B * B - 4 * A * C;
    if (dd > 0) {
      const sq = Math.sqrt(dd);
      for (const r of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (r > -L && r < L) cuts.push(r);
    }
  } else if (Math.abs(B) > 1e-12) {
    const r = -C / B;
    if (r > -L && r < L) cuts.push(r);
  }
  cuts.sort((p, q) => p - q);
  let acc = 0;
  const width = discMapped.width || 2.0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 1e-12) continue;
    const tm = 0.5 * (a + b);
    const Dm = gin * gin - 2 * lin * (a0 + gout * tm + 0.5 * lout * tm * tm);
    if (Dm <= 0 && lin > 0) continue; // the region is empty on this segment
    const rootA = i > 0; // the segment's ends that are discriminant roots
    const rootB = i + 2 < cuts.length;
    const panels = Math.ceil((b - a) / (width * sig));
    const dz = (b - a) / panels;
    for (let q = 0; q < panels; q++) {
      const pa = a + q * dz;
      const half = 0.5 * dz;
      const mid = pa + half;
      const mapA = rootA && q === 0;
      const mapB = rootB && q === panels - 1;
      for (let k = 0; k < gl.x.length; k++) {
        const x = gl.x[k];
        let t;
        let jac;
        if (mapA && mapB) {
          t = mid + half * Math.sin((Math.PI * x) / 2);
          jac = half * (Math.PI / 2) * Math.cos((Math.PI * x) / 2);
        } else if (mapA) {
          // cluster at the low end only: t = a + 2 half (1 - cos(pi (x + 1) / 4))... use s = (x + 1)/2 in [0, 1], t = pa + dz s^2
          const sN = 0.5 * (x + 1);
          t = pa + dz * sN * sN;
          jac = dz * sN; // dt/dx = dz * 2 s * (1/2)
        } else if (mapB) {
          const sN = 0.5 * (1 - x);
          t = pa + dz - dz * sN * sN;
          jac = dz * sN;
        } else {
          t = mid + half * x;
          jac = half;
        }
        const phi = (0.3989422804014327 * Math.exp((-0.5 * t * t) / S)) / sig;
        const c = a0 + gout * t + 0.5 * lout * t * t;
        acc += gl.w[k] * jac * phi * innerProb(lin, gin, c, sig);
      }
    }
  }
  return acc;
};
// gradient frame + Gauss-Hermite outer
const discGH = (a0, g, H, S, gh) => {
  const sig = Math.sqrt(S);
  const gn = Math.hypot(g[0], g[1]);
  if (gn < 1e-12) return a0 <= 0 ? 1 : 0; // no first-order edge: fall back elsewhere
  const ey = [g[0] / gn, g[1] / gn];
  const et = [-ey[1], ey[0]];
  const Hyy = H[0] * ey[0] * ey[0] + 2 * H[1] * ey[0] * ey[1] + H[2] * ey[1] * ey[1];
  const Hyt = H[0] * ey[0] * et[0] + H[1] * (ey[0] * et[1] + ey[1] * et[0]) + H[2] * ey[1] * et[1];
  const Htt = H[0] * et[0] * et[0] + 2 * H[1] * et[0] * et[1] + H[2] * et[1] * et[1];
  let acc = 0;
  for (let i = 0; i < gh.x.length; i++) {
    const t = sig * gh.x[i];
    acc += gh.w[i] * innerProb(Hyy, gn + Hyt * t, a0 + 0.5 * Htt * t * t, sig);
  }
  return acc;
};
// ---------------------------------------------------------------------------
// tests
const rng = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const r = rng(7);
{
  // checkerboard corners
  const fine = gaussLegendre(16);
  let worstBVN = 0;
  let worstPanel = 0;
  let worstCase = null;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const su = 0.005 + 0.345 * r();
    const sv = 0.005 + 0.345 * r();
    const mu = r();
    const mv = r();
    const rho = -0.92 + 1.84 * r();
    const ref = EwwPanels(mu, su, mv, sv, rho, 0.05, fine);
    const b = EwwBVN(mu, su, mv, sv, rho);
    const p = EwwPanels(mu, su, mv, sv, rho);
    if (Math.abs(b - ref) > worstBVN) {
      worstBVN = Math.abs(b - ref);
      worstCase = { su, sv, mu, mv, rho, ref, b };
    }
    worstPanel = Math.max(worstPanel, Math.abs(p - ref));
  }
  console.log(`checker corner over ${N} random cases: worst |BVN jump formula - fine| ${worstBVN.toExponential(2)}, worst |kernel panels - fine| ${worstPanel.toExponential(2)}`);
  console.log('  worst BVN case', JSON.stringify(worstCase));
  // BVN itself against a 2-D grid for a few points
  let worstB = 0;
  for (const [h, k, rr] of [[0.3, -0.2, 0.5], [1.2, 0.8, -0.8], [-1, 2, 0.9], [0, 0, 0.92], [2.5, -2.5, 0.3]]) {
    let acc = 0;
    const M = 1400;
    const L = 7;
    const d = (2 * L) / M;
    for (let a = 0; a < M; a++)
      for (let b = 0; b < M; b++) {
        const x = -L + (a + 0.5) * d;
        const y = -L + (b + 0.5) * d;
        if (x > h && y > k) acc += Math.exp(-(x * x - 2 * rr * x * y + y * y) / (2 * (1 - rr * rr)));
      }
    acc *= (d * d) / (TAU * Math.sqrt(1 - rr * rr));
    worstB = Math.max(worstB, Math.abs(acc - bvnu(h, k, rr)));
  }
  console.log(`  bvnu against a 1400^2 grid on five points: worst ${worstB.toExponential(2)}`);
  let worstH = 0;
  for (const [h, k, rr] of [[0.3, -0.2, 0.95], [1.2, 0.8, -0.97], [-1, 2, 0.99], [0, 0, 0.93], [2.5, -2.5, -0.95], [-0.5, 0.4, 0.999], [0.7, 0.9, -0.94]]) {
    let acc = 0;
    const M = 2000;
    const L = 7;
    const d = (2 * L) / M;
    for (let a = 0; a < M; a++)
      for (let b = 0; b < M; b++) {
        const x = -L + (a + 0.5) * d;
        const y = -L + (b + 0.5) * d;
        if (x > h && y > k) acc += Math.exp(-(x * x - 2 * rr * x * y + y * y) / (2 * (1 - rr * rr)));
      }
    acc *= (d * d) / (TAU * Math.sqrt(1 - rr * rr));
    const e = Math.abs(acc - bvnuHigh(h, k, rr));
    if (e > worstH) worstH = e;
    if (e > 1e-3) console.log(`   bvnuHigh off at h ${h} k ${k} r ${rr}: grid ${acc.toFixed(6)} formula ${bvnuHigh(h, k, rr).toFixed(6)}`);
  }
  console.log(`  bvnuHigh (|r| > 0.925) against a 2000^2 grid on seven points: worst ${worstH.toExponential(2)}`);
  // how often |rho| > 0.925 on the benchmark plane
  let over = 0;
  let total = 0;
  for (let y = 0; y < 320; y += 4)
    for (let x = 0; x < 480; x += 4) {
      const D = y + 1;
      const Nu = -50 * (x - 240);
      const gu = [(-50 * D - Nu * 0) / (D * D), (0 * D - Nu * 1) / (D * D)];
      const gv = [0, (0 - -12000 * 1) / (D * D)];
      const rho = (gu[0] * gv[0] + gu[1] * gv[1]) / (Math.hypot(...gu) * Math.hypot(...gv));
      total++;
      if (Math.abs(rho) > 0.925) over++;
    }
  console.log(`  benchmark plane: |rho| > 0.925 on ${over} of ${total} sampled pixels`);
}
{
  // discs from the benchmark plane's jets: rows 40..319, random columns, a disc centre within reach
  const period = 20;
  const S = 0.25;
  const sig = 0.5;
  const R = 5 / 12;
  const gh8 = gaussHermite(8);
  const gh12 = gaussHermite(12);
  const gh16 = gaussHermite(16);
  const gh24 = gaussHermite(24);
  const fine = gaussLegendre(16);
  const worst = { panels: 0, m8w2: 0, m8w275: 0, m12w275: 0 };
  let cases = 0;
  let worstCase = null;
  for (let i = 0; i < 4000; i++) {
    const y = 40 + Math.floor(280 * r());
    const x = Math.floor(480 * r());
    const D = y + 1;
    const Nu = -50 * (x - 240);
    const Nv = -12000;
    const dD = [0, 1];
    const hu = [-50, 0];
    const hv = [0, 0];
    const gu = [(hu[0] * D - Nu * dD[0]) / (D * D) / period, (hu[1] * D - Nu * dD[1]) / (D * D) / period];
    const gv = [(hv[0] * D - Nv * dD[0]) / (D * D) / period, (hv[1] * D - Nv * dD[1]) / (D * D) / period];
    const Hu = [(-2 * dD[0] * gu[0] * period) / D / period, (-(dD[1] * gu[0] + dD[0] * gu[1]) * period) / D / period, (-2 * dD[1] * gu[1] * period) / D / period];
    const Hv = [(-2 * dD[0] * gv[0] * period) / D / period, (-(dD[1] * gv[0] + dD[0] * gv[1]) * period) / D / period, (-2 * dD[1] * gv[1] * period) / D / period];
    const gmax = Math.max(Math.hypot(...gu), Math.hypot(...gv));
    if (gmax >= 0.15) continue; // the coverage regime only
    // a disc centre at a random offset within the pixel's reach of its edge
    const ang = TAU * r();
    const dist = R + (3.5 * sig * gmax) * (2 * r() - 1);
    const du = dist * Math.cos(ang);
    const dv = dist * Math.sin(ang);
    const a0 = du * du + dv * dv - R * R;
    const g = [2 * du * gu[0] + 2 * dv * gv[0], 2 * du * gu[1] + 2 * dv * gv[1]];
    const H = [
      2 * (gu[0] * gu[0] + gv[0] * gv[0]) + 2 * du * Hu[0] + 2 * dv * Hv[0],
      2 * (gu[0] * gu[1] + gv[0] * gv[1]) + 2 * du * Hu[1] + 2 * dv * Hv[1],
      2 * (gu[1] * gu[1] + gv[1] * gv[1]) + 2 * du * Hu[2] + 2 * dv * Hv[2],
    ];
    const ref = discPanels(a0, g, H, S, 0.05, fine);
    discMapped.width = 2.0;
    const m8w2 = discMapped(a0, g, H, S, gaussLegendre(8));
    discMapped.width = 2.75;
    const m8w275 = discMapped(a0, g, H, S, gaussLegendre(8));
    const m12w275 = discMapped(a0, g, H, S, gaussLegendre(12));
    discMapped.width = 2.0;
    const vals = { panels: discPanels(a0, g, H, S), m8w2, m8w275, m12w275 };
    if (cases < 6) {
      // an independent check of the fine reference: a grid over the pixel's Gaussian
      let acc = 0;
      const M = 1600;
      const Lg = 6 * sig;
      const d = (2 * Lg) / M;
      for (let ia = 0; ia < M; ia++)
        for (let ib = 0; ib < M; ib++) {
          const px = -Lg + (ia + 0.5) * d;
          const py = -Lg + (ib + 0.5) * d;
          const q = a0 + g[0] * px + g[1] * py + 0.5 * (H[0] * px * px + 2 * H[1] * px * py + H[2] * py * py);
          if (q <= 0) acc += Math.exp((-0.5 * (px * px + py * py)) / S);
        }
      acc *= (d * d) / (TAU * S);
      console.log(`  disc reference check: fine panels ${ref.toFixed(6)} grid ${acc.toFixed(6)} diff ${Math.abs(ref - acc).toExponential(1)} (radius ${(R / gmax).toFixed(1)} px)`);
    }
    for (const k of Object.keys(vals)) {
      const e = Math.abs(vals[k] - ref);
      if (e > worst[k]) {
        worst[k] = e;
        if (k === 'm8w2') worstCase = { x, y, gmax, dist, ref, m8w2: vals.m8w2, radiusPx: R / gmax };
      }
    }
    cases++;
  }
  console.log(`disc over ${cases} plane cases (rate < 0.15): worst errors ${JSON.stringify(Object.fromEntries(Object.entries(worst).map(([k, v]) => [k, v.toExponential(2)])))}`);
  console.log('  worst m8w2 case', JSON.stringify(worstCase));
}
{
  // the checkerboard's coverage: the Gaussianised count (the kernel's Ew with
  // the curvature-aware width) against the exact quadratic-region
  // probability, on near-field pixels of two cameras
  const S = 0.25;
  const sig = 0.5;
  const fine = gaussLegendre(16);
  const gh12 = gaussHermite(12);
  const cameras = {
    benchmark: { period: 20, hu: [-50, 0, 12000], hv: [0, 0, -12000], hd: [0, 1, 1], W: 480, H: 320 },
    // a pinhole 12 units above the plane, 50 degree vertical field of view at 192 x 128, looking level, period 4
    lowcam: (() => {
      const W = 192, H = 128, f = (H / 2) / Math.tan((25 * Math.PI) / 180), cx = W / 2, cy = H / 2, Pz = 12;
      // forward +y, right +x, up +z; ray d = (X/f, 1, -(Y)/f) with X = x - cx, Y = y - cy; ground: Nu = -Pz dx, Nv = -Pz dy, D = -dz = Y/f
      return { period: 4, hu: [-Pz / f, 0, (Pz * cx) / f], hv: [0, 0, -Pz], hd: [0, 1 / f, -cy / f], W, H };
    })(),
  };
  for (const [name, cam] of Object.entries(cameras)) {
    let worstG = 0;
    let worstGH = 0;
    let worstAt = null;
    let n = 0;
    for (let i = 0; i < 6000; i++) {
      const x = Math.floor(cam.W * r()) + 0.5;
      const y = Math.floor(cam.H * r()) + 0.5;
      const p = [x, y, 1];
      const Nu = cam.hu[0] * x + cam.hu[1] * y + cam.hu[2];
      const Nv = cam.hv[0] * x + cam.hv[1] * y + cam.hv[2];
      const D = cam.hd[0] * x + cam.hd[1] * y + cam.hd[2];
      if (D <= 0) continue;
      const dD = [cam.hd[0], cam.hd[1]];
      const per = cam.period;
      const gu = [(cam.hu[0] * D - Nu * dD[0]) / (D * D) / per, (cam.hu[1] * D - Nu * dD[1]) / (D * D) / per];
      const Hu = [(-2 * dD[0] * gu[0]) / D, -(dD[1] * gu[0] + dD[0] * gu[1]) / D, (-2 * dD[1] * gu[1]) / D];
      const u0 = Nu / D / per;
      const su = Math.sqrt(S * (gu[0] ** 2 + gu[1] ** 2) + 0.5 * S * S * (Hu[0] ** 2 + 2 * Hu[1] ** 2 + Hu[2] ** 2));
      if (su >= 0.3) continue; // the coverage regime
      // E[w(U)] the kernel's way
      const mu = u0 + 0.5 * S * (Hu[0] + Hu[2]);
      const gauss = Ew(mu, su);
      // exact under the quadratic count: w(u) = wlow + sum_i jump_i 1[u >= c_i], P(u >= c) = P(q <= 0), q = c - u
      const cs = crossings(u0, Math.max(su, 1e-6));
      let exact = wOf(u0 - 5.5 * Math.max(su, 1e-6));
      let ghv = exact;
      for (const c of cs) {
        const q0 = c.x - u0;
        const g = [-gu[0], -gu[1]];
        const H = [-Hu[0], -Hu[1], -Hu[2]];
        exact += c.jump * discPanels(q0, g, H, S, 0.05, fine);
        ghv += c.jump * discMapped(q0, g, H, S);
      }
      n++;
      const eG = Math.abs(gauss - exact);
      const eGH = Math.abs(ghv - exact);
      if (eG > worstG) {
        worstG = eG;
        worstAt = { x, y, su, u0, gauss, exact, crossings: cs.length };
      }
      worstGH = Math.max(worstGH, eGH);
    }
    console.log(`checker coverage, ${name}: ${n} pixels; worst |Gaussianised - exact| ${worstG.toExponential(2)} (as a picture value: ${(0.5 * worstG).toExponential(2)}), worst |mapped GL12 - exact| ${worstGH.toExponential(2)}`);
    console.log('  worst Gaussianised at', JSON.stringify(worstAt));
  }
}
// ---------------------------------------------------------------------------
// the kernel's next coverage: quadRegion in the gradient frame (or the
// eigenframe when the linear term is small), cuts at the discriminant roots,
// sub-panels of width 2 sigma, the ends at roots mapped; and the checkerboard
// through exact marginals with the Gaussianised model's covariance
const GL8 = gaussLegendre(8);
const quadRegion = (a0, g, H, S, width = 2.0, gl = GL8) => {
  const sig = Math.sqrt(S);
  const gn = Math.hypot(g[0], g[1]);
  const hn = Math.sqrt(H[0] * H[0] + 2 * H[1] * H[1] + H[2] * H[2]);
  let ein;
  let eout;
  if (gn > 0.5 * hn * sig) {
    ein = [g[0] / gn, g[1] / gn];
    eout = [-ein[1], ein[0]];
  } else {
    const tr = H[0] + H[2];
    const dt = H[0] * H[2] - H[1] * H[1];
    const disc = Math.sqrt(Math.max(0.25 * tr * tr - dt, 0));
    const l1 = 0.5 * tr + disc;
    let e1 = [1, 0];
    if (Math.abs(H[1]) > 1e-12) {
      const v = [l1 - H[2], H[1]];
      const n = Math.hypot(v[0], v[1]);
      e1 = [v[0] / n, v[1] / n];
    } else if (H[2] > H[0]) e1 = [0, 1];
    ein = e1;
    eout = [-e1[1], e1[0]];
  }
  const lin = H[0] * ein[0] * ein[0] + 2 * H[1] * ein[0] * ein[1] + H[2] * ein[1] * ein[1];
  const lout = H[0] * eout[0] * eout[0] + 2 * H[1] * eout[0] * eout[1] + H[2] * eout[1] * eout[1];
  const lmix = H[0] * ein[0] * eout[0] + H[1] * (ein[0] * eout[1] + ein[1] * eout[0]) + H[2] * ein[1] * eout[1];
  const gin = g[0] * ein[0] + g[1] * ein[1];
  const gout = g[0] * eout[0] + g[1] * eout[1];
  const L = 5.5 * sig;
  // inner: lin/2 y^2 + (gin + lmix t) y + (a0 + gout t + lout/2 t^2) <= 0; D(t) = (gin + lmix t)^2 - 2 lin (a0 + gout t + lout t^2 / 2)
  const A = lmix * lmix - lin * lout;
  const B = 2 * gin * lmix - 2 * lin * gout;
  const C = gin * gin - 2 * lin * a0;
  const cuts = [-L, L];
  if (Math.abs(lin) > 1e-9) {
    if (Math.abs(A) > 1e-12) {
      const dd = B * B - 4 * A * C;
      if (dd > 0) {
        const sq = Math.sqrt(dd);
        for (const r of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (r > -L && r < L) cuts.push(r);
      }
    } else if (Math.abs(B) > 1e-12) {
      const r = -C / B;
      if (r > -L && r < L) cuts.push(r);
    }
  }
  cuts.sort((p, q) => p - q);
  let acc = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (b - a < 1e-12) continue;
    const tm = 0.5 * (a + b);
    const Dm = (gin + lmix * tm) ** 2 - 2 * lin * (a0 + gout * tm + 0.5 * lout * tm * tm);
    if (Math.abs(lin) > 1e-9 && Dm <= 0 && lin > 0) continue;
    const rootA = i > 0;
    const rootB = i + 2 < cuts.length;
    const panels = Math.ceil((b - a) / (width * sig));
    const dz = (b - a) / panels;
    for (let q = 0; q < panels; q++) {
      const pa = a + q * dz;
      const half = 0.5 * dz;
      const mid = pa + half;
      const mapA = rootA && q === 0;
      const mapB = rootB && q === panels - 1;
      for (let k = 0; k < gl.x.length; k++) {
        const x = gl.x[k];
        let t;
        let jac;
        if (mapA && mapB) {
          t = mid + half * Math.sin((Math.PI * x) / 2);
          jac = half * (Math.PI / 2) * Math.cos((Math.PI * x) / 2);
        } else if (mapA) {
          const sN = 0.5 * (x + 1);
          t = pa + dz * sN * sN;
          jac = dz * sN;
        } else if (mapB) {
          const sN = 0.5 * (1 - x);
          t = pa + dz - dz * sN * sN;
          jac = dz * sN;
        } else {
          t = mid + half * x;
          jac = half;
        }
        const phi = (0.3989422804014327 * Math.exp((-0.5 * t * t) / S)) / sig;
        acc += gl.w[k] * jac * phi * innerProb(lin, gin + lmix * t, a0 + gout * t + 0.5 * lout * t * t, sig);
      }
    }
  }
  return acc;
};
{
  // discs again, with quadRegion
  const period = 20;
  const S = 0.25;
  const sig = 0.5;
  const R = 5 / 12;
  const fine = gaussLegendre(16);
  let worst = 0;
  let worstCase = null;
  let cases = 0;
  const bins = new Map();
  for (let i = 0; i < 4000; i++) {
    const y = 40 + Math.floor(280 * r());
    const x = Math.floor(480 * r());
    const D = y + 1;
    const Nu = -50 * (x - 240);
    const Nv = -12000;
    const dD = [0, 1];
    const gu = [-50 / D / period, (-Nu) / (D * D) / period];
    const gv = [0, 12000 / (D * D) / period];
    const Hu = [(-2 * dD[0] * gu[0]) / D, -(dD[1] * gu[0] + dD[0] * gu[1]) / D, (-2 * dD[1] * gu[1]) / D];
    const Hv = [(-2 * dD[0] * gv[0]) / D, -(dD[1] * gv[0] + dD[0] * gv[1]) / D, (-2 * dD[1] * gv[1]) / D];
    const gmax = Math.max(Math.hypot(...gu), Math.hypot(...gv));
    if (gmax >= 0.15) continue;
    const ang = TAU * r();
    const dist = R + 3.5 * sig * gmax * (2 * r() - 1);
    const du = dist * Math.cos(ang);
    const dv = dist * Math.sin(ang);
    const a0 = du * du + dv * dv - R * R;
    const g = [2 * du * gu[0] + 2 * dv * gv[0], 2 * du * gu[1] + 2 * dv * gv[1]];
    const H = [2 * (gu[0] * gu[0] + gv[0] * gv[0]) + 2 * du * Hu[0] + 2 * dv * Hv[0], 2 * (gu[0] * gu[1] + gv[0] * gv[1]) + 2 * du * Hu[1] + 2 * dv * Hv[1], 2 * (gu[1] * gu[1] + gv[1] * gv[1]) + 2 * du * Hu[2] + 2 * dv * Hv[2]];
    const ref = discPanels(a0, g, H, S, 0.05, fine);
    const v = quadRegion(a0, g, H, S);
    const e = Math.abs(v - ref);
    const rb = Math.floor(Math.log2(R / gmax));
    bins.set(rb, Math.max(bins.get(rb) || 0, e));
    if (e > worst) {
      worst = e;
      worstCase = { x, y, radiusPx: R / gmax, dist, ref, v };
    }
    cases++;
  }
  console.log(`quadRegion on ${cases} disc cases: worst ${worst.toExponential(2)}; by radius (2^k px): ${[...bins.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${2 ** k}-${2 ** (k + 1)}px ${v.toExponential(1)}`).join(', ')}`);
  console.log('  worst', JSON.stringify(worstCase));
  // tiny discs at the centre pixel (g ~ 0): the eigenframe route
  let worstC = 0;
  for (const rad of [3, 4, 6, 10]) {
    const gm = R / rad;
    const gu = [gm, 0];
    const gv = [0, gm];
    for (const off of [0, 0.02, 0.1, 0.3]) {
      const du = off;
      const dv = 0.5 * off;
      const a0 = du * du + dv * dv - R * R;
      const g = [2 * du * gu[0], 2 * dv * gv[1]];
      const H = [2 * gu[0] * gu[0], 0, 2 * gv[1] * gv[1]];
      const ref = discPanels(a0, g, H, S, 0.05, fine);
      worstC = Math.max(worstC, Math.abs(quadRegion(a0, g, H, S) - ref));
    }
  }
  console.log(`  discs seen from near their centre (radius 3-10 px): worst ${worstC.toExponential(2)}`);
}
{
  // the checkerboard's coverage: exact marginals, Gaussian-model covariance, against a 2-D grid of the quadratic count model
  const S = 0.25;
  const sig = 0.5;
  const checkerExact = (u0, gu, Hu, v0, gv, Hv) => {
    const su = Math.sqrt(S * (gu[0] ** 2 + gu[1] ** 2) + 0.5 * S * S * (Hu[0] ** 2 + 2 * Hu[1] ** 2 + Hu[2] ** 2));
    const sv = Math.sqrt(S * (gv[0] ** 2 + gv[1] ** 2) + 0.5 * S * S * (Hv[0] ** 2 + 2 * Hv[1] ** 2 + Hv[2] ** 2));
    const mu = u0 + 0.5 * S * (Hu[0] + Hu[2]);
    const mv = v0 + 0.5 * S * (Hv[0] + Hv[2]);
    const cu = crossings(mu, su);
    const cv = crossings(mv, sv);
    const marginal = (c0, g, H, cs, sg) => {
      let acc = wOf(c0 - 5.5 * sg); // hmm: the low end in the Gaussianised parametrisation
      for (const c of cs) acc += c.jump * quadRegion(c.x - c0, [-g[0], -g[1]], [-H[0], -H[1], -H[2]], S);
      return acc;
    };
    // the low-end value must be consistent with the crossing list, which is in terms of mu (the shifted mean); use mu for both
    const Eu = (() => { let acc = wOf(mu - 5.5 * su); for (const c of cu) acc += c.jump * quadRegion(c.x - u0, [-gu[0], -gu[1]], [-Hu[0], -Hu[1], -Hu[2]], S); return acc; })();
    const Ev = (() => { let acc = wOf(mv - 5.5 * sv); for (const c of cv) acc += c.jump * quadRegion(c.x - v0, [-gv[0], -gv[1]], [-Hv[0], -Hv[1], -Hv[2]], S); return acc; })();
    void marginal;
    if (cu.length === 0 || cv.length === 0) return Eu * Ev;
    const rho = (gu[0] * gv[0] + gu[1] * gv[1]) / Math.max(Math.hypot(...gu) * Math.hypot(...gv), 1e-12);
    const joint = EwwBVN(mu, su, mv, sv, rho);
    return Eu * Ev + (joint - Ew(mu, su) * Ew(mv, sv));
  };
  const cams = {
    benchmark: { period: 20, hu: [-50, 0, 12000], hv: [0, 0, -12000], hd: [0, 1, 1], W: 480, H: 320 },
    lowcam: (() => { const W = 192, H = 128, f = (H / 2) / Math.tan((25 * Math.PI) / 180), cx = W / 2, cy = H / 2, Pz = 12; return { period: 4, hu: [-Pz / f, 0, (Pz * cx) / f], hv: [0, 0, -Pz], hd: [0, 1 / f, -cy / f], W, H }; })(),
  };
  for (const [name, cam] of Object.entries(cams)) {
    let worstE = 0;
    let worstG = 0;
    let n = 0;
    let worstAt = null;
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(cam.W * r()) + 0.5;
      const y = Math.floor(cam.H * r()) + 0.5;
      const Nu = cam.hu[0] * x + cam.hu[1] * y + cam.hu[2];
      const Nv = cam.hv[0] * x + cam.hv[1] * y + cam.hv[2];
      const D = cam.hd[0] * x + cam.hd[1] * y + cam.hd[2];
      if (D <= 0) continue;
      const dD = [cam.hd[0], cam.hd[1]];
      const per = cam.period;
      const gu = [(cam.hu[0] * D - Nu * dD[0]) / (D * D) / per, (cam.hu[1] * D - Nu * dD[1]) / (D * D) / per];
      const gv = [(cam.hv[0] * D - Nv * dD[0]) / (D * D) / per, (cam.hv[1] * D - Nv * dD[1]) / (D * D) / per];
      const Hu = [(-2 * dD[0] * gu[0]) / D, -(dD[1] * gu[0] + dD[0] * gu[1]) / D, (-2 * dD[1] * gu[1]) / D];
      const Hv = [(-2 * dD[0] * gv[0]) / D, -(dD[1] * gv[0] + dD[0] * gv[1]) / D, (-2 * dD[1] * gv[1]) / D];
      const u0 = Nu / D / per;
      const v0 = Nv / D / per;
      const su = Math.sqrt(S * (gu[0] ** 2 + gu[1] ** 2) + 0.5 * S * S * (Hu[0] ** 2 + 2 * Hu[1] ** 2 + Hu[2] ** 2));
      const sv = Math.sqrt(S * (gv[0] ** 2 + gv[1] ** 2) + 0.5 * S * S * (Hv[0] ** 2 + 2 * Hv[1] ** 2 + Hv[2] ** 2));
      if (Math.min(su, sv) >= 0.15 || Math.max(su, sv) > 1.6) continue;
      // the reference: a grid over the pixel of w(u(x)) w(v(x)) under the quadratic model
      let acc = 0;
      const M = 900;
      const Lg = 6 * sig;
      const d = (2 * Lg) / M;
      for (let ia = 0; ia < M; ia++)
        for (let ib = 0; ib < M; ib++) {
          const px = -Lg + (ia + 0.5) * d;
          const py = -Lg + (ib + 0.5) * d;
          const uu = u0 + gu[0] * px + gu[1] * py + 0.5 * (Hu[0] * px * px + 2 * Hu[1] * px * py + Hu[2] * py * py);
          const vv = v0 + gv[0] * px + gv[1] * py + 0.5 * (Hv[0] * px * px + 2 * Hv[1] * px * py + Hv[2] * py * py);
          acc += wOf(uu) * wOf(vv) * Math.exp((-0.5 * (px * px + py * py)) / S);
        }
      acc *= (d * d) / (TAU * S);
      const ex = checkerExact(u0, gu, Hu, v0, gv, Hv);
      const mu = u0 + 0.5 * S * (Hu[0] + Hu[2]);
      const mv = v0 + 0.5 * S * (Hv[0] + Hv[2]);
      const rho = (gu[0] * gv[0] + gu[1] * gv[1]) / Math.max(Math.hypot(...gu) * Math.hypot(...gv), 1e-12);
      const gs = EwwPanels(mu, su, mv, sv, rho);
      n++;
      const e = Math.abs(ex - acc);
      if (e > worstE) {
        worstE = e;
        worstAt = { x, y, su, sv, rho, grid: acc, exact: ex, gauss: gs };
      }
      worstG = Math.max(worstG, Math.abs(gs - acc));
    }
    console.log(`checker E[w w], ${name}, ${n} pixels with min(s) < 0.15 against a 900^2 grid: worst |new - grid| ${worstE.toExponential(2)}, worst |Gaussianised - grid| ${worstG.toExponential(2)} (grid error ~1e-4)`);
    console.log('  worst new at', JSON.stringify(worstAt));
  }
}
// ---------------------------------------------------------------------------
// the projective pullback: on a homography the checker's edges are exact
// lines in screen space and the discs exact conics
const projCounts = (cam, x, y) => {
  const Nu = cam.hu[0] * x + cam.hu[1] * y + cam.hu[2];
  const Nv = cam.hv[0] * x + cam.hv[1] * y + cam.hv[2];
  const D = cam.hd[0] * x + cam.hd[1] * y + cam.hd[2];
  const per = cam.period;
  const dD = [cam.hd[0], cam.hd[1]];
  return {
    D, r: [dD[0] / D, dD[1] / D],
    u0: Nu / D / per, v0: Nv / D / per,
    gu: [(cam.hu[0] * D - Nu * dD[0]) / (D * D) / per, (cam.hu[1] * D - Nu * dD[1]) / (D * D) / per],
    gv: [(cam.hv[0] * D - Nv * dD[0]) / (D * D) / per, (cam.hv[1] * D - Nv * dD[1]) / (D * D) / per],
    // the affine numerators in cells: nu = Nu/per, nv = Nv/per, with gradients
    nu0: Nu / per, nv0: Nv / per, dnu: [cam.hu[0] / per, cam.hu[1] / per], dnv: [cam.hv[0] / per, cam.hv[1] / per], dD,
  };
};
// the edges of w along count u within reach: b half-integers with |delta| / |n| < L sigma, n = g + delta r
const projEdges = (u0, g, r, sig, L = 5.5) => {
  const out = [];
  // a conservative range of b: |delta| <= L sigma |n| <= L sigma (|g| + |delta| |r|) -> |delta| (1 - L sigma |r|) <= L sigma |g|
  const rn = Math.hypot(r[0], r[1]);
  const gn = Math.hypot(g[0], g[1]);
  const denom = 1 - L * sig * rn;
  if (denom <= 0) return null; // the denominator can cross zero within reach: no pullback
  const reach = (L * sig * gn) / denom;
  const hlo = Math.ceil(2 * (u0 - reach));
  const hhi = Math.floor(2 * (u0 + reach));
  for (let h = hlo; h <= hhi; h++) {
    const b = 0.5 * h;
    const delta = u0 - b;
    const n = [g[0] + delta * r[0], g[1] + delta * r[1]];
    const nn = Math.hypot(n[0], n[1]);
    const dist = delta / Math.max(nn, 1e-30); // signed distance of the centre to the edge, in px
    if (Math.abs(dist) < L * sig) out.push({ b, jump: h % 2 === 0 ? 2 : -2, n, nn, dist });
  }
  return out;
};
const checkerProjective = (cam, x, y, S) => {
  const sig = Math.sqrt(S);
  const P = projCounts(cam, x, y);
  const eu = projEdges(P.u0, P.gu, P.r, sig);
  const ev = projEdges(P.v0, P.gv, P.r, sig);
  if (!eu || !ev) return null;
  // the value below the lowest reachable edge: w just under b_min
  const lowOf = (edges, u0) => {
    if (edges.length === 0) return wOf(u0);
    const bmin = Math.min(...edges.map((e) => e.b));
    return wOf(bmin - 1e-9);
  };
  const wu0 = lowOf(eu, P.u0);
  const wv0 = lowOf(ev, P.v0);
  let acc = wu0 * wv0;
  for (const a of eu) acc += wv0 * a.jump * Phi(a.dist / sig);
  for (const b of ev) acc += wu0 * b.jump * Phi(b.dist / sig);
  for (const a of eu)
    for (const b of ev) {
      const corr = (a.n[0] * b.n[0] + a.n[1] * b.n[1]) / (a.nn * b.nn);
      acc += a.jump * b.jump * bvnuAny(-a.dist / sig, -b.dist / sig, Math.max(-0.999999, Math.min(0.999999, corr)));
    }
  return 0.5 + 0.5 * acc;
};
const circlesProjective = (cam, x, y, S, R = 5 / 12) => {
  const sig = Math.sqrt(S);
  const P = projCounts(cam, x, y);
  const rn = Math.hypot(P.r[0], P.r[1]);
  if (6 * sig * rn >= 1) return null;
  const gmax = Math.max(Math.hypot(...P.gu), Math.hypot(...P.gv));
  const reach = (3 * sig * gmax) / (1 - 6 * sig * rn) + R;
  let acc = 0;
  let discs = 0;
  for (let nu = Math.floor(P.u0 - reach); nu <= Math.floor(P.u0 + reach); nu++)
    for (let nv = Math.floor(P.v0 - reach); nv <= Math.floor(P.v0 + reach); nv++) {
      const cu = nu + 0.5;
      const cv = nv + 0.5;
      const du = P.u0 - cu;
      const dv = P.v0 - cv;
      if (Math.hypot(du, dv) - R > 3.5 * sig * gmax / (1 - 6 * sig * rn) + 1e-6) continue;
      // q(X) = (nu - cu D)^2 + (nv - cv D)^2 - R^2 D^2, nu, nv, D affine
      const A0 = P.nu0 - cu * P.D;
      const B0 = P.nv0 - cv * P.D;
      const dA = [P.dnu[0] - cu * P.dD[0], P.dnu[1] - cu * P.dD[1]];
      const dB = [P.dnv[0] - cv * P.dD[0], P.dnv[1] - cv * P.dD[1]];
      const a0 = A0 * A0 + B0 * B0 - R * R * P.D * P.D;
      const g = [2 * A0 * dA[0] + 2 * B0 * dB[0] - 2 * R * R * P.D * P.dD[0], 2 * A0 * dA[1] + 2 * B0 * dB[1] - 2 * R * R * P.D * P.dD[1]];
      const H = [2 * (dA[0] * dA[0] + dB[0] * dB[0] - R * R * P.dD[0] * P.dD[0]), 2 * (dA[0] * dA[1] + dB[0] * dB[1] - R * R * P.dD[0] * P.dD[1]), 2 * (dA[1] * dA[1] + dB[1] * dB[1] - R * R * P.dD[1] * P.dD[1])];
      // scale q by 1 / D0^2 so the coefficients are O(1)
      const s2 = 1 / (P.D * P.D);
      acc += quadRegion(a0 * s2, [g[0] * s2, g[1] * s2], [H[0] * s2, H[1] * s2, H[2] * s2], S);
      discs++;
    }
  return { value: acc, discs };
};
// the true source on a grid over the pixel
const sourceGrid = (cam, x, y, S, picture, M = 1200) => {
  const sig = Math.sqrt(S);
  let acc = 0;
  const Lg = 6 * sig;
  const d = (2 * Lg) / M;
  for (let ia = 0; ia < M; ia++)
    for (let ib = 0; ib < M; ib++) {
      const px = x - Lg + (ia + 0.5) * d;
      const py = y - Lg + (ib + 0.5) * d;
      const Nu = cam.hu[0] * px + cam.hu[1] * py + cam.hu[2];
      const Nv = cam.hv[0] * px + cam.hv[1] * py + cam.hv[2];
      const D = cam.hd[0] * px + cam.hd[1] * py + cam.hd[2];
      const u = Nu / D / cam.period;
      const v = Nv / D / cam.period;
      const wgt = Math.exp((-0.5 * ((px - x) ** 2 + (py - y) ** 2)) / S);
      acc += picture(u, v) * wgt;
    }
  return (acc * d * d) / (TAU * S);
};
const checkerPic = (u, v) => ((u - Math.floor(u) >= 0.5) === (v - Math.floor(v) >= 0.5) ? 1 : 0);
const discPic = (u, v) => (Math.hypot(u - Math.floor(u) - 0.5, v - Math.floor(v) - 0.5) <= 5 / 12 ? 1 : 0);
{
  const S = 0.25;
  const cams = {
    benchmark: { period: 20, hu: [-50, 0, 12000], hv: [0, 0, -12000], hd: [0, 1, 1], W: 480, H: 320 },
    lowcam: (() => { const W = 192, H = 128, f = (H / 2) / Math.tan((25 * Math.PI) / 180), cx = W / 2, cy = H / 2, Pz = 12; return { period: 4, hu: [-Pz / f, 0, (Pz * cx) / f], hv: [0, 0, -Pz], hd: [0, 1 / f, -cy / f], W, H }; })(),
  };
  for (const [name, cam] of Object.entries(cams)) {
    let n = 0;
    let worstC = 0;
    let worstD = 0;
    let declined = 0;
    let worstCAt = null;
    let maxEdges = 0;
    let maxDiscs = 0;
    const t0 = Date.now();
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(cam.W * r()) + 0.5;
      const y = Math.floor(cam.H * r()) + 0.5;
      const P = projCounts(cam, x, y);
      if (P.D <= 0) continue;
      const c = checkerProjective(cam, x, y, S);
      const dsc = circlesProjective(cam, x, y, S);
      if (c === null || dsc === null) {
        declined++;
        continue;
      }
      const eu = projEdges(P.u0, P.gu, P.r, 0.5).length;
      const ev = projEdges(P.v0, P.gv, P.r, 0.5).length;
      if (eu > 6 || ev > 6 || dsc.discs > 9) {
        declined++;
        continue;
      }
      maxEdges = Math.max(maxEdges, eu, ev);
      maxDiscs = Math.max(maxDiscs, dsc.discs);
      const refC = sourceGrid(cam, x, y, S, checkerPic);
      const refD = sourceGrid(cam, x, y, S, discPic);
      n++;
      const eC = Math.abs(c - refC);
      const eD = Math.abs(dsc.value - refD);
      if (eC > worstC) {
        worstC = eC;
        worstCAt = { x, y, eu, ev, ref: refC, value: c };
      }
      worstD = Math.max(worstD, eD);
    }
    console.log(`projective pullback, ${name}: ${n} pixels (declined ${declined}), ${Date.now() - t0} ms; checker worst |value - grid| ${worstC.toExponential(2)}, discs worst ${worstD.toExponential(2)} (grid error ~1e-4); max edges per count ${maxEdges}, max discs ${maxDiscs}`);
    console.log('  worst checker at', JSON.stringify(worstCAt));
  }
}
{
  // the worst checker pixels: refine the grid, and swap the high-correlation branch for a fine conditional integral
  const S = 0.25;
  const cams = {
    benchmark: { period: 20, hu: [-50, 0, 12000], hv: [0, 0, -12000], hd: [0, 1, 1], W: 480, H: 320 },
    lowcam: (() => { const W = 192, H = 128, f = (H / 2) / Math.tan((25 * Math.PI) / 180), cx = W / 2, cy = H / 2, Pz = 12; return { period: 4, hu: [-Pz / f, 0, (Pz * cx) / f], hv: [0, 0, -Pz], hd: [0, 1 / f, -cy / f], W, H }; })(),
  };
  const fineGL = gaussLegendre(64);
  for (const [name, x, y] of [['benchmark', 338.5, 31.5], ['lowcam', 173.5, 95.5]]) {
    const cam = cams[name];
    const P = projCounts(cam, x, y);
    const eu = projEdges(P.u0, P.gu, P.r, 0.5);
    const ev = projEdges(P.v0, P.gv, P.r, 0.5);
    const corrs = [];
    for (const a of eu) for (const b of ev) corrs.push(((a.n[0] * b.n[0] + a.n[1] * b.n[1]) / (a.nn * b.nn)).toFixed(3));
    const v = checkerProjective(cam, x, y, S);
    const g1200 = sourceGrid(cam, x, y, S, checkerPic, 1200);
    const g3000 = sourceGrid(cam, x, y, S, checkerPic, 3000);
    const g4000 = sourceGrid(cam, x, y, S, checkerPic, 4000);
    console.log(`${name} (${x},${y}): value ${v.toFixed(6)}; grid 1200 ${g1200.toFixed(6)}, 3000 ${g3000.toFixed(6)}, 4000 ${g4000.toFixed(6)}; edge correlations ${corrs.join(' ')}`);
  }
}
{
  // homography sign and scale invariance of the projective pullback
  const S = 0.25;
  const cam = { period: 20, hu: [-50, 0, 12000], hv: [0, 0, -12000], hd: [0, 1, 1], W: 480, H: 320 };
  const neg = { ...cam, hu: cam.hu.map((v) => -v), hv: cam.hv.map((v) => -v), hd: cam.hd.map((v) => -v) };
  const sc = { ...cam, hu: cam.hu.map((v) => 3.7 * v), hv: cam.hv.map((v) => 3.7 * v), hd: cam.hd.map((v) => 3.7 * v) };
  let worst = 0;
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(cam.W * r()) + 0.5;
    const y = Math.floor(cam.H * r()) + 0.5;
    const a = checkerProjective(cam, x, y, S);
    const b = checkerProjective(neg, x, y, S);
    const c = checkerProjective(sc, x, y, S);
    const da = circlesProjective(cam, x, y, S);
    const db = circlesProjective(neg, x, y, S);
    const dc = circlesProjective(sc, x, y, S);
    if (a === null || da === null) continue;
    n++;
    worst = Math.max(worst, Math.abs(a - b), Math.abs(a - c), Math.abs(da.value - db.value), Math.abs(da.value - dc.value));
  }
  console.log(`sign and scale invariance over ${n} pixels: worst difference ${worst.toExponential(2)}`);
}
