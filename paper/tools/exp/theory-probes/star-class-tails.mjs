// Dropped pair mass by class (strip x strip, strip x background, background x strip, background x background) for two half-square masks,
// A on Z^2 and B on the lattice rotated by psi degrees, pairs with |m + n| <= rE (no damping), dropped = |m| > M, partners |n| enumerated near -m.
// Against the derived class forms (research log, star law): per edge pair (e, e') with normals at angle psi_ee',
//   sb: (2/(pi l_e) + sqrt2) N_E w_e w_e' / (2 pi^3 sin psi M^2), bs symmetric, bb: N_E w_e w_e' (2 log(pi l M) + c) / (2 pi^4 sin psi M^2) with c = 2 as a placeholder,
//   ss: zero beyond M0 = 2/(pi l sin psi) + 2 rE / sin psi.
function edges(P) { const E = []; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; const dx = q[0] - p[0], dy = q[1] - p[1]; const l = Math.hypot(dx, dy); E.push({ p, q, l, t: [dx / l, dy / l], n: [dy / l, -dx / l] }); } return E; }
function coefStrip(E, m) {   // returns [|a_m|, inStrip]
  let re = 0, im = 0; const mm = m[0] * m[0] + m[1] * m[1]; let inStrip = false;
  for (const e of E) {
    const mt = m[0] * e.t[0] + m[1] * e.t[1], mn = m[0] * e.n[0] + m[1] * e.n[1];
    if (Math.abs(mt) <= 1 / (Math.PI * e.l)) inStrip = true;
    if (mn === 0) continue;
    const dx = e.q[0] - e.p[0], dy = e.q[1] - e.p[1]; const md = m[0] * dx + m[1] * dy; const ph = -2 * Math.PI * (m[0] * e.p[0] + m[1] * e.p[1]); let Ire, Iim;
    if (Math.abs(md) < 1e-12) { Ire = e.l * Math.cos(ph); Iim = e.l * Math.sin(ph); }
    else { const a = -2 * Math.PI * md; const ere = Math.cos(a) - 1, eim = Math.sin(a); const dre = eim / a, dim = -ere / a;
      Ire = e.l * (Math.cos(ph) * dre - Math.sin(ph) * dim); Iim = e.l * (Math.cos(ph) * dim + Math.sin(ph) * dre); }
    re += mn * Ire; im += mn * Iim;
  }
  return [Math.hypot(-im / (2 * Math.PI * mm), re / (2 * Math.PI * mm)), inStrip];
}
const square = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
const EA = edges(square), EB = edges(square);   // B's polygon in its own (rotated) coordinates: same square, its lattice rotated
const psiDeg = 20, t = psiDeg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
const rE = 0.2, NE = 1, Mmax = 512;
const cls = { ss: new Float64Array(Mmax + 2), sb: new Float64Array(Mmax + 2), bs: new Float64Array(Mmax + 2), bb: new Float64Array(Mmax + 2) };
const cache = new Map(); const key = (x, y) => x * 8192 + y;
const magB = (x, y) => { const k = key(x, y); let v = cache.get(k); if (!v) { v = coefStrip(EB, [x, y]); cache.set(k, v); } return v; };
for (let x = -Mmax; x <= Mmax; x++) for (let y = -Mmax; y <= Mmax; y++) {
  const r2 = x * x + y * y; if (!r2 || r2 > Mmax * Mmax) continue;
  const [am, sA] = coefStrip(EA, [x, y]); if (am === 0) continue;
  const ux = cs * (-x) + sn * (-y), uy = -sn * (-x) + cs * (-y); const n0 = Math.round(ux), n1 = Math.round(uy);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const nx = n0 + dx, ny = n1 + dy; const m2x = cs * nx - sn * ny, m2y = sn * nx + cs * ny; const kx = x + m2x, ky = y + m2y;
    if (kx * kx + ky * ky > rE * rE) continue;
    const [bn, sB] = magB(nx, ny); if (bn === 0) continue;   // strip membership of n is judged in B's own frame (its polygon's normals)
    const c = sA ? (sB ? 'ss' : 'sb') : (sB ? 'bs' : 'bb');
    cls[c][Math.ceil(Math.sqrt(r2))] += am * bn;
  }
}
// predicted constants
const l = 0.5, w = 0.5; const sq2 = Math.SQRT2;
const pairs = []; for (const e of EA) for (const f of EB) { const ang = Math.acos(Math.min(1, Math.abs(e.n[0] * (cs * f.n[0] - sn * f.n[1]) + e.n[1] * (sn * f.n[0] + cs * f.n[1])))); pairs.push(Math.sin(ang)); }
const Csb = pairs.reduce((s, sp) => s + (2 / (Math.PI * l) + sq2) * NE * w * w / (2 * Math.PI ** 3 * sp), 0);
const Cbb = (M) => pairs.reduce((s, sp) => s + NE * w * w * (2 * Math.log(Math.PI * l * M) + 2) / (2 * Math.PI ** 4 * sp), 0);
const M0 = Math.max(...pairs.map(sp => 2 / (Math.PI * l * sp) + 2 * rE / sp));
console.log(`psi ${psiDeg} deg, rE ${rE}, edge-pair sines ${[...new Set(pairs.map(v => v.toFixed(3)))].join(', ')}, M0 ${M0.toFixed(2)}, C_sb (one order, all edge pairs) ${Csb.toFixed(4)}`);
for (const M of [8, 16, 32, 64, 128, 256]) {
  const tail = c => { let s = 0; for (let r = M + 1; r <= Mmax; r++) s += cls[c][r]; return s; };
  const ss = tail('ss'), sb = tail('sb'), bs = tail('bs'), bb = tail('bb');
  console.log(`M ${M}: ss ${ss.toExponential(3)} | sb ${sb.toExponential(3)} pred ${(Csb / (M * M)).toExponential(3)} | bs ${bs.toExponential(3)} pred ${(Csb / (M * M)).toExponential(3)} | bb ${bb.toExponential(3)} pred ${(Cbb(M) / (M * M)).toExponential(3)} | total ${(ss + sb + bs + bb).toExponential(3)}`);
}
