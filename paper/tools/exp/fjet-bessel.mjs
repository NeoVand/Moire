// The analytic shift provider against the theta-grid tables it replaces.
// For a shift function that is a product of one sine or cosine per S axis,
// Q(theta; l) = int O(s) e^{i theta H(s)} e^{-2 pi i l.s} ds is a Jacobi-Anger
// series (one axis: J_l(theta), a cosine carrying i^l; two axes: products of
// two Bessel functions at theta / 2), convolved with the spectrum of the
// other closures O. The tables sample the torus on a 64-point grid and a
// theta grid; they alias past theta of about 32 (a collaborator's finding).
// Gates: provider against the 64-point table where that table is sound
// (|theta| <= 24, on theta nodes so no interpolation enters), against a
// 1024-point table where the 64-point one aliases, for one and two axes,
// sines and cosines, with and without a smooth O; the derivatives Q', Q''
// included.
//   node paper/tools/exp/fjet-bessel.mjs
import * as F from './fjet.mjs';
const { Jet, Axis, TAU } = F;
const mkAxis = (label) => new Axis(new Jet(0, 1, 0), null, 'periodic', label);
const pic = (axis, kind) => ({ kind: 'pic', axis, fn: kind === 'sin' ? (u) => Math.sin(TAU * u) : (u) => Math.cos(TAU * u), sig: kind });
const clo = (axes, fn, sig) => ({ kind: 'clo', axes, fn: (cs) => Jet.c(fn(cs)), sig });
let fails = 0;
const gate = (label, err, tol) => {
  const ok = err <= tol;
  if (!ok) fails += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: max |diff| ${err.toExponential(2)} (tol ${tol.toExponential(0)})`);
};
const compare = (H, Saxes, OS, thetas, KW, NGtable, tol, label) => {
  const A = F.__shiftAnalytic(H, Saxes, OS, 64, KW, Math.max(...thetas.map(Math.abs)) + 1);
  if (!A) throw new Error('provider declined ' + label);
  const T = F.__shiftTables(H, Saxes, OS, NGtable, KW, Math.max(...thetas.map(Math.abs)) + 1, 0.05);
  const qa = new Float64Array(6);
  const qt = new Float64Array(6);
  let worst = 0;
  let worstAt = '';
  for (const theta of thetas) {
    const nS = Saxes.length;
    for (let l1 = -KW; l1 <= KW; l1++)
      for (let l2 = -(nS === 2 ? KW : 0); l2 <= (nS === 2 ? KW : 0); l2++) {
        const wA = nS === 2 ? (l1 + A.KWS) * A.KWn + l2 + A.KWS : l1 + A.KWS;
        const wT = nS === 2 ? (l1 + T.KWS) * T.KWn + l2 + T.KWS : l1 + T.KWS;
        A.at(theta, wA, qa);
        F.__shiftAt(T, theta, wT, qt);
        for (let q = 0; q < 6; q++) {
          const d = Math.abs(qa[q] - qt[q]);
          if (d > worst) {
            worst = d;
            worstAt = `theta ${theta} l (${l1}${nS === 2 ? ',' + l2 : ''}) component ${q}`;
          }
        }
      }
  }
  gate(`${label} (grid ${NGtable}) worst at ${worstAt}`, worst, tol);
};
F.resetAxes();
{
  const a = mkAxis('sin');
  const H = { key: 'sin', factors: [pic(a, 'sin')], sig: 'sin' };
  compare(H, [a], [], [0, 0.05, 1, 5, 16, 24], 16, 64, 3e-7, 'one axis, sine, O = 1');
  compare(H, [a], [], [40, 64], 16, 1024, 3e-7, 'one axis, sine, O = 1, large theta');
  const O = [clo([a], (cs) => 1 + 0.3 * Math.cos(TAU * cs[0]) + 0.1 * Math.sin(2 * TAU * cs[0]), 'o1')];
  compare(H, [a], O, [0.05, 1, 5, 16, 24], 16, 64, 3e-7, 'one axis, sine, smooth O');
  const Hc = { key: 'cos', factors: [pic(a, 'cos')], sig: 'cos' };
  compare(Hc, [a], O, [0.05, 1, 5, 16, 24], 16, 64, 3e-7, 'one axis, cosine, smooth O');
  compare(Hc, [a], O, [40, 64], 16, 1024, 3e-7, 'one axis, cosine, smooth O, large theta');
}
{
  const a = mkAxis('sin');
  const b = mkAxis('sin');
  for (const [t1, t2] of [['sin', 'sin'], ['sin', 'cos'], ['cos', 'sin'], ['cos', 'cos']]) {
    const H = { key: `${t1}*${t2}`, factors: [pic(a, t1), pic(b, t2)], sig: `${t1}*${t2}` };
    compare(H, [a, b], [], [0.05, 1, 5, 12], 8, 64, 3e-7, `two axes, ${t1} x ${t2}, O = 1`);
  }
  const H = { key: 'sin*sin', factors: [pic(a, 'sin'), pic(b, 'sin')], sig: 'sin*sin' };
  const O = [clo([a, b], (cs) => 1 + 0.2 * Math.cos(TAU * cs[0]) * Math.sin(TAU * cs[1]) + 0.1 * Math.cos(TAU * cs[1]), 'o2')];
  compare(H, [a, b], O, [0.05, 1, 5, 12], 8, 64, 3e-7, 'two axes, sin x sin, smooth O');
  compare(H, [a, b], O, [40, 64], 8, 256, 3e-7, 'two axes, sin x sin, smooth O, large theta');
}
console.log(fails ? `${fails} gate(s) FAILED` : 'all gates pass');
process.exit(fails ? 1 : 0);
