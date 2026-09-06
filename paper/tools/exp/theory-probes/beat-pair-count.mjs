// Pairs (m1, m2) with m1 in Z^2, m2 in R Z^2 (rotation by theta), |m1| <= M, |m1 + m2| <= rE (the pixel's far-field ellipse, a disc here).
// Reports the pair count against the prediction pi M^2 * pi rE^2 (unit dual cells), and, for two half-square masks,
// how many pairs (sorted by |a b|) keep the dropped weight within 1/256 and 1/4096 of the retained list.
function coef(P, m) {
  const n = P.length; let re = 0, im = 0; const mm = m[0] * m[0] + m[1] * m[1];
  if (mm === 0) { let a = 0; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return [a / 2, 0]; }
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[(i + 1) % n]; const dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy);
    const nx = dy / l, ny = -dx / l; const mn = m[0] * nx + m[1] * ny; if (mn === 0) continue;
    const md = m[0] * dx + m[1] * dy; const ph = -2 * Math.PI * (m[0] * p[0] + m[1] * p[1]); let Ire, Iim;
    if (Math.abs(md) < 1e-12) { Ire = l * Math.cos(ph); Iim = l * Math.sin(ph); }
    else { const a = -2 * Math.PI * md; const ere = Math.cos(a) - 1, eim = Math.sin(a); const dre = eim / a, dim = -ere / a;
      Ire = l * (Math.cos(ph) * dre - Math.sin(ph) * dim); Iim = l * (Math.cos(ph) * dim + Math.sin(ph) * dre); }
    re += mn * Ire; im += mn * Iim;
  }
  return [-im / (2 * Math.PI * mm), re / (2 * Math.PI * mm)];
}
const square = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
const M = 256;
for (const deg of [5, 20, 45]) {
  const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  for (const rE of [0.05, 0.2, 0.5]) {
    // enumerate pairs
    const pairs = [];
    for (let x = -M; x <= M; x++) for (let y = -M; y <= M; y++) {
      if (x * x + y * y > M * M) continue;
      // m2 = R n, n in Z^2, |m1 + R n| <= rE  ->  n near -R^T m1
      const ux = cs * (-x) + sn * (-y), uy = -sn * (-x) + cs * (-y);   // R^T (-m1)
      const n0 = Math.round(ux), n1 = Math.round(uy);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nx = n0 + dx, ny = n1 + dy;
        const m2x = cs * nx - sn * ny, m2y = sn * nx + cs * ny;
        const kx = x + m2x, ky = y + m2y;
        if (kx * kx + ky * ky <= rE * rE) pairs.push([x, y, nx, ny]);
      }
    }
    const pred = Math.PI * M * M * Math.PI * rE * rE;
    // weights for two half-square masks
    const w = pairs.map(([x, y, nx, ny]) => { const [ar, ai] = coef(square, [x, y]); const [br, bi] = coef(square, [nx, ny]); return Math.hypot(ar, ai) * Math.hypot(br, bi); });
    const order = w.map((v, i) => i).sort((i, j) => w[j] - w[i]);
    const total = w.reduce((s, v) => s + v, 0);
    let acc = 0, n256 = null, n4096 = null;
    for (let r = 0; r < order.length; r++) { acc += w[order[r]]; if (n256 === null && total - acc <= 1 / 256) n256 = r + 1; if (n4096 === null && total - acc <= 1 / 4096) n4096 = r + 1; }
    const withDC = pairs.filter(([x, y, nx, ny]) => (x === 0 && y === 0) || (nx === 0 && ny === 0)).length;
    console.log(`theta ${deg} rE ${rE}: pairs ${pairs.length} (prediction ${pred.toFixed(0)}, of which with a zero factor ${withDC}), total |ab| ${total.toFixed(4)}, pairs for dropped <= 1/256: ${n256}, <= 1/4096: ${n4096}`);
  }
}
