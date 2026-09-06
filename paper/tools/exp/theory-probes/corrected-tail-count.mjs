// The price of the first-order projective correction in retained characters (bridge #254, #257):
// on the checkerboard's double sine series over the two half-period counts (odd p, q), the
// characters theta = pi (p b_v -+ q b_w) carry the affine multiplier exp(-|theta|^2 / 2) and the
// corrected one exp(-|theta|^2 / 2)[1 + i (k . theta)(|theta|^2 - 1)]. The summed tail certificate
// (Cauchy-Schwarz and Parseval on the periodized footprint density) bounds the omitted part by
// (W / 2) sqrt(sum_omitted |c_n|^2 ... ) in the collaborator's normalization; here the material's own
// coefficients are kept, so the omitted contribution is bounded by sum_omitted |coef_n| |multiplier_n|
// (the termwise bound, which is what the kernel can evaluate) and, for comparison, by the
// Cauchy-Schwarz form sqrt(sum_omitted |coef_n|^2) sqrt(sum_omitted |multiplier_n|^2).
// For each pixel: the smallest radius in |theta| whose omitted termwise sum is below the budget,
// the retained term count, affine against corrected; and the same under the conservative
// Gaussian envelope A exp(-alpha |theta|^2 / 2) of #254 for a few alpha.
const SIGMA = 0.5, LN = 0.7602859212697056;
const hu = [-50, 0, 12000], hv = [0, 0, -12000], hd = [0, 1, 1];
const dotp = (a, x, y) => a[0] * x + a[1] * y + a[2];
const data = (hn, x0, y0) => { const N0 = dotp(hn, x0, y0) / 10, D0 = dotp(hd, x0, y0); const n = [SIGMA * hn[0] / 10, SIGMA * hn[1] / 10], dd = [SIGMA * hd[0], SIGMA * hd[1]]; const m = N0 / D0, k = [dd[0] / D0, dd[1] / D0]; return { m, k, b: [n[0] / D0 - m * k[0], n[1] / D0 - m * k[1]] }; };
const budgets = [1 / 256, 1 / 512, 1 / 4096];
for (const [x, y] of [[120, 14], [120, 20], [120, 40], [60, 80]]) {
  const cv = data(hu, x, y), cw = data(hv, x, y); const k = cv.k; const nk = Math.hypot(k[0], k[1]);
  // enumerate the characters: coefficient magnitude (8 / pi^2) / (p q) / 2 for each of the two signs
  const terms = [];
  const P = 801;
  for (let p = 1; p <= P; p += 2) for (let q = 1; q <= P; q += 2) for (const sgn of [-1, 1]) {
    const th = [Math.PI * (p * cv.b[0] + sgn * q * cw.b[0]), Math.PI * (p * cv.b[1] + sgn * q * cw.b[1])];
    const t2 = th[0] * th[0] + th[1] * th[1];
    const coef = LN * (8 / (Math.PI * Math.PI)) / (p * q) / 2; // in radiance
    const aff = Math.exp(-t2 / 2);
    const corr = aff * Math.sqrt(1 + Math.pow((k[0] * th[0] + k[1] * th[1]) * (t2 - 1), 2));
    terms.push({ r: Math.sqrt(t2), coef, aff: coef * aff, corr: coef * corr });
  }
  terms.sort((a, b) => a.r - b.r);
  // suffix sums of the termwise bounds
  const n = terms.length; const sufA = new Float64Array(n + 1), sufC = new Float64Array(n + 1);
  for (let i = n - 1; i >= 0; i--) { sufA[i] = sufA[i + 1] + terms[i].aff; sufC[i] = sufC[i + 1] + terms[i].corr; }
  const line = [`(${x}, ${y}) |k| ${nk.toFixed(4)}, count spreads ${Math.hypot(cv.b[0], cv.b[1]).toFixed(3)} and ${Math.hypot(cw.b[0], cw.b[1]).toFixed(3)} a sigma; enumerated ${n} characters out to radius ${terms[n - 1].r.toFixed(1)}, where the corrected multiplier is ${terms[n - 1].corr.toExponential(1)}`];
  for (const eps of budgets) {
    let iA = 0; while (iA < n && sufA[iA] > eps) iA++;
    let iC = 0; while (iC < n && sufC[iC] > eps) iC++;
    line.push(`  budget ${eps.toExponential(2)}: affine retains ${iA} terms (radius ${iA > 0 ? terms[iA - 1].r.toFixed(2) : '0'}), corrected retains ${iC} (radius ${iC > 0 ? terms[iC - 1].r.toFixed(2) : '0'}), ratio ${iA > 0 ? (iC / iA).toFixed(3) : 'n/a'}`);
    // the conservative envelope of #254: |chi_1| <= A exp(-alpha |theta|^2 / 2)
    const env = [];
    for (const alpha of [0.5, 0.7, 0.85, 0.95]) {
      const gamma = 1 - alpha; const A = 1 + nk * (Math.pow(3 / (gamma * Math.E), 1.5) + Math.pow(1 / (gamma * Math.E), 0.5));
      // the terms under the envelope, sorted by the same radius: coefficient times A exp(-alpha r^2 / 2)
      const sufE = new Float64Array(n + 1);
      for (let i = n - 1; i >= 0; i--) sufE[i] = sufE[i + 1] + terms[i].coef * A * Math.exp(-alpha * terms[i].r * terms[i].r / 2);
      let iE = 0; while (iE < n && sufE[iE] > eps) iE++;
      env.push(`alpha ${alpha}: A ${A.toFixed(3)}, retains ${iE} (${iA > 0 ? (iE / iA).toFixed(2) : 'n/a'} of affine)`);
    }
    line.push(`    envelope form: ${env.join('; ')}`);
  }
  console.log(line.join('\n'));
}
