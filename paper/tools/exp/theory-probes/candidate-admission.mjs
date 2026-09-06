// Candidate admission for the checkerboard on the benchmark plane (bridge #241, #235):
// per pixel, the whitened rational count g = m + (b . Z) / (1 + k . Z) on ||Z|| <= R,
// its affine model (error <= R |b| rho / (1 - rho)) and quadratic model
// (error <= R |b| rho^2 / (1 - rho)), rho = R |k|; the wrapped band certificates of
// #235 applied with those allowances, the common tail exp(-R^2 / 2), the checker's
// two counts summed under the range-one graph certificate; the fraction of pixels
// admitted at a radiance error budget by row band; and a Monte Carlo of the actual
// disagreement mass against the bounds on a few rows.
// The "reliable slope" wrapped bound for the quadratic model is a conjecture, marked.
const W = 240, H = 160, SIGMA = 0.5, LN = 0.7602859212697056;
const hu = [-50, 0, 12000], hv = [0, 0, -12000], hd = [0, 1, 1]; // homographyYB(0, 0)
const dotp = (a, x, y) => a[0] * x + a[1] * y + a[2];
const Phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; }
const L = 1; // count unit: half a period, thresholds at the integers
// the count's whitened data at a pixel: v = s / 10 or w = t / 10
const countData = (hn, x0, y0) => {
  const N0 = dotp(hn, x0, y0) / 10, D0 = dotp(hd, x0, y0);
  const n = [SIGMA * hn[0] / 10, SIGMA * hn[1] / 10], d = [SIGMA * hd[0], SIGMA * hd[1]];
  const m = N0 / D0, k = [d[0] / D0, d[1] / D0];
  const b = [n[0] / D0 - m * k[0], n[1] / D0 - m * k[1]];
  return { m, b, k, N0, D0, n, d };
};
const norm = (v) => Math.hypot(v[0], v[1]);
const wrappedAffine = (delta, s) => Math.min(1, 2 * delta / L + 2 * delta / (Math.sqrt(2 * Math.PI) * s));
const phi = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
// the wrapped band mass of an affine count of offset o and slope s (counts a sigma), allowance delta: the direct sum over the thresholds near o
const wrappedMass = (o, s, delta) => {
  if (delta >= L / 2) return 1;
  if (s < 1e-9) { const f = Math.abs(o - Math.round(o)); return f <= delta ? 1 : 0; }
  let mass = 0;
  const n0 = Math.floor(o - 8 * s - 1), n1 = Math.ceil(o + 8 * s + 1);
  for (let n = n0; n <= n1; n++) mass += Phi((n + delta - o) / s) - Phi((n - delta - o) / s);
  return Math.min(1, mass);
};
// the quadratic model's band mass with allowance delta: along the depth direction z the count is
// m + (b . khat) z (1 - |k| z) + (b_perp . Z_perp)(1 - |k| z), affine in Z_perp given z; integrate the wrapped affine mass over z
const quadMass = (c, delta) => {
  const nk = norm(c.k);
  if (nk < 1e-12) return wrappedMass(c.m, norm(c.b), delta);
  const kh = [c.k[0] / nk, c.k[1] / nk];
  const bk = c.b[0] * kh[0] + c.b[1] * kh[1];
  const bperp = Math.hypot(c.b[0] - bk * kh[0], c.b[1] - bk * kh[1]);
  const Zmax = 6, n = 120; let mass = 0;
  for (let i = 0; i <= n; i++) {
    const z = -Zmax + 2 * Zmax * i / n, w = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * (2 * Zmax / n) / 3;
    const fac = 1 - nk * z;
    mass += w * phi(z) * wrappedMass(c.m + bk * z * fac, Math.abs(bperp * fac), delta);
  }
  return Math.min(1, mass);
};
const certify = (c, R) => {
  const rho = R * norm(c.k);
  if (rho >= 1) return null;
  const nb = norm(c.b);
  const d1 = R * nb * rho / (1 - rho), d2 = R * nb * rho * rho / (1 - rho);
  // H2 = -(b k^T + k b^T): eigenvalues -(b.k) +- |b||k|
  const bk = c.b[0] * c.k[0] + c.b[1] * c.k[1];
  const l1 = -bk + nb * norm(c.k), l2 = -bk - nb * norm(c.k);
  const h = Math.max(Math.abs(l1), Math.abs(l2)), dH = Math.sqrt(Math.abs(l1 * l2));
  const pAff = d1 >= L / 2 ? 1 : wrappedAffine(d1, nb);
  let pQuad = 1;
  if (d2 < L / 2) {
    const curv = h > 0 ? Math.min(1, 2 * d2 / L + (8 / Math.PI) * Math.sqrt(d2 / h)) : 1;
    const u = 2 * Math.PI * d2 / L;
    const two = dH > 0 ? Math.min(1, 2 * d2 / L + Math.min(u <= 1 ? (2 * d2 / (Math.PI * dH)) * (2 + Math.log(L / (2 * Math.PI * d2))) : Infinity, L / (6 * dH))) : 1;
    pQuad = Math.min(curv, two);
  }
  // conjecture: a reliable slope lambda along b's direction on the reach gives the affine-type wrapped bound
  const e = [c.b[0] / nb, c.b[1] / nb];
  const He = [-(c.b[0] * (c.k[0] * e[0] + c.k[1] * e[1]) + c.k[0] * bk / nb), -(c.b[1] * (c.k[0] * e[0] + c.k[1] * e[1]) + c.k[1] * bk / nb)];
  const lambda = nb - R * norm(He);
  const pConj = d2 < L / 2 && lambda > 0 ? wrappedAffine(d2, lambda) : 1;
  const pAffExact = wrappedMass(c.m, nb, d1);
  const pQuadExact = quadMass(c, d2);
  return { rho, nb, d1, d2, h, dH, pAff, pQuad, pConj, lambda, pAffExact, pQuadExact };
};
const bands = [[1, 13], [13, 32], [32, 64], [64, 160]];
for (const R of [3.5, 4]) {
  const tail = Math.exp(-R * R / 2);
  console.log(`R = ${R}, tail ${tail.toExponential(2)}, budget: radiance error W p with W = ${LN.toFixed(3)}`);
  for (const [y0, y1] of bands) {
    const adm = { aff: [0, 0, 0], quad: [0, 0, 0], conj: [0, 0, 0], affX: [0, 0, 0], quadX: [0, 0, 0] }; let n = 0; const budgets = [1 / 128, 1 / 256, 1 / 512];
    let sumRho = 0, sumNb = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      const cv = certify(countData(hu, x, y), R), cw = certify(countData(hv, x, y), R);
      n++;
      if (!cv || !cw) continue;
      sumRho += cv.rho; sumNb += Math.max(cv.nb, cw.nb);
      const errs = { aff: LN * Math.min(1, tail + cv.pAff + cw.pAff), quad: LN * Math.min(1, tail + cv.pQuad + cw.pQuad), conj: LN * Math.min(1, tail + cv.pConj + cw.pConj), affX: LN * Math.min(1, tail + cv.pAffExact + cw.pAffExact), quadX: LN * Math.min(1, tail + cv.pQuadExact + cw.pQuadExact) };
      for (const key of Object.keys(errs)) budgets.forEach((bud, i) => { if (errs[key] <= bud) adm[key][i]++; });
    }
    const pct = (a) => a.map((v) => (100 * v / n).toFixed(1) + '%').join(' / ');
    console.log(`  rows ${y0}-${y1 - 1}: mean rho ${(sumRho / n).toFixed(3)}, mean count spread ${(sumNb / n).toFixed(2)} a sigma; admitted at 1/128, 1/256, 1/512: affine ${pct(adm.aff)}; quadratic (audited bounds) ${pct(adm.quad)}; quadratic (conjectured slope bound) ${pct(adm.conj)}; affine with its exact model band mass ${pct(adm.affX)}; quadratic with its exact model band mass ${pct(adm.quadX)}`);
  }
}
// Monte Carlo of the actual disagreement between the rational checker and each model's checker under the pixel Gaussian, on a few pixels
console.log('Monte Carlo disagreement mass (rational checker against the model checker, Gaussian samples, R = 3.5, 200k samples) against the certified p at a few pixels');
const R = 3.5, tail = Math.exp(-R * R / 2);
let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => { const u1 = rnd(), u2 = rnd(); return [Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2), Math.sqrt(-2 * Math.log(1 - u1)) * Math.sin(2 * Math.PI * u2)]; };
const checker = (v, w) => ((Math.floor(v) + Math.floor(w)) & 1);
for (const [x, y] of [[0, 8], [120, 8], [0, 20], [120, 20], [0, 40], [120, 40], [60, 80], [120, 140]]) {
  const cv = countData(hu, x, y), cw = countData(hv, x, y);
  const zv = certify(cv, R), zw = certify(cw, R);
  let disAff = 0, disQuad = 0, N = 200000;
  for (let i = 0; i < N; i++) {
    const Z = gauss();
    const ratio = (c) => (c.N0 + c.n[0] * Z[0] + c.n[1] * Z[1]) / (c.D0 + c.d[0] * Z[0] + c.d[1] * Z[1]);
    const aff = (c) => c.m + c.b[0] * Z[0] + c.b[1] * Z[1];
    const quad = (c) => { const bz = c.b[0] * Z[0] + c.b[1] * Z[1], kz = c.k[0] * Z[0] + c.k[1] * Z[1]; return c.m + bz - bz * kz; };
    const truth = checker(ratio(cv), ratio(cw));
    if (checker(aff(cv), aff(cw)) !== truth) disAff++;
    if (checker(quad(cv), quad(cw)) !== truth) disQuad++;
  }
  const f = (v) => (v === null ? 'n/a' : v.toFixed(4));
  console.log(`  pixel (${x}, ${y}): rho ${zv ? zv.rho.toFixed(3) : '>=1'}, spread ${zv ? zv.nb.toFixed(3) : '-'}; affine: measured ${(disAff / N).toFixed(4)} certified ${zv && zw ? f(Math.min(1, tail + zv.pAff + zw.pAff)) : 'n/a'} exact-band ${zv && zw ? f(Math.min(1, tail + zv.pAffExact + zw.pAffExact)) : 'n/a'}; quadratic: measured ${(disQuad / N).toFixed(4)} certified (audited) ${zv && zw ? f(Math.min(1, tail + zv.pQuad + zw.pQuad)) : 'n/a'} conjectured ${zv && zw ? f(Math.min(1, tail + zv.pConj + zw.pConj)) : 'n/a'} exact-band ${zv && zw ? f(Math.min(1, tail + zv.pQuadExact + zw.pQuadExact)) : 'n/a'}`);
}
