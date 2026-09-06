// Pointwise check of the per-edge (star) bound for polygon indicators on the unit torus:
// |a_m| <= sum_e (l_e / (2 pi |m|)) min(1, 1 / (pi l_e |m . t_e|)), and the angular form off the strips.
// Reports the worst ratio |a_m| / bound over |m| <= 256, the fraction of frequencies inside some strip, and the
// energy split (inside strips vs outside) to see the star.
function coefAndBound(P, m) {
  const n = P.length; let re = 0, im = 0; const mm = m[0] * m[0] + m[1] * m[1]; const r = Math.sqrt(mm);
  let bound = 0, inStrip = false;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy);
    const tx = dx / l, ty = dy / l; const nx = dy / l, ny = -dx / l;
    const mt = m[0] * tx + m[1] * ty, mn = m[0] * nx + m[1] * ny;
    const term = (l / (2 * Math.PI * r)) * Math.min(1, 1 / (Math.PI * l * Math.abs(mt)));
    bound += term; if (Math.abs(mt) <= 1 / (Math.PI * l)) inStrip = true;
    if (mn === 0) continue;
    const md = m[0] * dx + m[1] * dy; const ph = -2 * Math.PI * (m[0] * p[0] + m[1] * p[1]); let Ire, Iim;
    if (Math.abs(md) < 1e-12) { Ire = l * Math.cos(ph); Iim = l * Math.sin(ph); }
    else { const a = -2 * Math.PI * md; const ere = Math.cos(a) - 1, eim = Math.sin(a); const dre = eim / a, dim = -ere / a;
      Ire = l * (Math.cos(ph) * dre - Math.sin(ph) * dim); Iim = l * (Math.cos(ph) * dim + Math.sin(ph) * dre); }
    re += mn * Ire; im += mn * Iim;
  }
  const mag = Math.hypot(-im / (2 * Math.PI * mm), re / (2 * Math.PI * mm));
  return [mag, bound, inStrip];
}
const rot = (P, deg, c = [0.5, 0.5]) => { const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t); return P.map(([x, y]) => [c[0] + cs * (x - c[0]) - sn * (y - c[1]), c[1] + sn * (x - c[0]) + cs * (y - c[1])]); };
const shapes = {
  'square 1/2 axis': [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]],
  'square 1/2 rot 20': rot([[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]], 20),
  'triangle': [[0.2, 0.2], [0.8, 0.3], [0.4, 0.8]],
  'thin rect 0.8x0.05 rot 33': rot([[0.1, 0.475], [0.9, 0.475], [0.9, 0.525], [0.1, 0.525]], 33),
};
const Mmax = 256;
for (const [name, P] of Object.entries(shapes)) {
  let worst = 0, worstM = null, count = 0, strips = 0, eIn = 0, eOut = 0; const shellIn = new Float64Array(9), shellOut = new Float64Array(9), shellN = new Float64Array(9);
  for (let x = -Mmax; x <= Mmax; x++) for (let y = -Mmax; y <= Mmax; y++) {
    if (!x && !y) continue; const r2 = x * x + y * y; if (r2 > Mmax * Mmax) continue;
    const [mag, bound, inStrip] = coefAndBound(P, [x, y]);
    const ratio = mag / bound; if (ratio > worst) { worst = ratio; worstM = [x, y]; }
    count++; if (inStrip) { strips++; eIn += mag * mag; } else eOut += mag * mag;
    const sh = Math.min(8, Math.floor(Math.log2(Math.sqrt(r2)))); if (inStrip) shellIn[sh] += mag * mag; else shellOut[sh] += mag * mag; shellN[sh]++;
  }
  console.log(`${name}: worst |a_m|/bound ${worst.toFixed(4)} at m = (${worstM}), frequencies in a strip ${strips} of ${count} (${(100 * strips / count).toFixed(2)}%), energy in strips ${eIn.toExponential(3)} vs outside ${eOut.toExponential(3)}`);
  const rows = []; for (let k = 3; k <= 8; k++) rows.push(`2^${k}: in ${shellIn[k].toExponential(2)} out ${shellOut[k].toExponential(2)}`);
  console.log('  dyadic shell energy (strip vs outside): ' + rows.join(' | '));
}
