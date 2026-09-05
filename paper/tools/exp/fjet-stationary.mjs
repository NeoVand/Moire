// A count at its stationary point still varies across the pixel when it
// curves. The reviewer's example: count u = A t^2 with t the pixel offset,
// picture cos(2 pi u), Gaussian pixel of sigma 1/2. The exact pixel is the
// Gaussian integral of a quadratic phase,
//   E cos(2 pi A (d + s z)^2) = Re (1 - 2ic)^(-1/2) exp(-b^2 / (2 (1 - 2ic))) e^{2 pi i A d^2},
//   b = 4 pi A d s, c = 2 pi A s^2,
// which is 0.445 at A = 1, d = 0, s = 1/2, where a rule that freezes a count
// with no rate returns cos(0) = 1. The compiler's width of a count under the
// pixel is now the standard deviation of g.z + z^T H z / 2, so a curving
// stationary count is spectral and its quadratic phase is integrated in
// closed form. This gate holds the compiler to the closed form at a few
// offsets and curvatures, and to a two-million-sample reference for the
// hard-edged version (sign of the cosine), where the far harmonics decay
// only as k^(-3/2) and the cut leaves a residue.
//
//   node paper/tools/exp/fjet-stationary.mjs
process.env.FJET_LIB = '1';
const yb = await import('./fjet-yb.mjs');
const { Jet } = await import('./fjet.mjs');
const sig = yb.SIG;

const makeCase = (A, hard) => ({
  name: `stationary A=${A}${hard ? ' hard' : ''}`,
  eval: (O, x, y, jets) => {
    const X = jets ? new Jet(x - 240, 1, 0) : x - 240;
    const u = O.scale(O.mul(X, X), A);
    const cu = O.cos(O.scale(u, 2 * Math.PI));
    const v = hard ? O.add(0.5, O.scale(O.sign(cu), 0.5)) : cu;
    return [v, v, v];
  },
});
const exact = (A, d) => {
  const b = 2 * Math.PI * A * 2 * d * sig;
  const c = 2 * Math.PI * A * sig * sig;
  const mod = Math.hypot(1, -2 * c);
  const arg = Math.atan2(-2 * c, 1);
  const pm = Math.pow(mod, -0.5);
  const pa = -0.5 * arg;
  const den = 2 * (1 + 4 * c * c);
  const er = (-b * b) / den;
  const ei = (-b * b * 2 * c) / den;
  return pm * Math.exp(er) * Math.cos(pa + ei + 2 * Math.PI * A * d * d);
};

let fails = 0;
const gate = (label, ours, ref, tol) => {
  const err = Math.abs(ours - ref);
  const ok = err <= tol;
  if (!ok) fails += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ours ${ours.toFixed(6)} ref ${ref.toFixed(6)} |err| ${err.toExponential(1)} (tol ${tol.toExponential(0)})`);
};
for (const A of [0.2, 1, 5]) {
  const cs = makeCase(A, false);
  for (const d of [0, 0.001, 0.1, 0.5, 1]) {
    const ours = yb.oursPixel(cs, 240 + d, 100, null)[0];
    gate(`smooth A=${A} d=${d}`, ours, exact(A, d), 1e-8);
  }
}
{
  const cs = makeCase(1, true);
  for (const d of [0, 0.5]) {
    const ours = yb.oursPixel(cs, 240 + d, 100, null)[0];
    const ref = yb.brutePixel(cs, 240 + d, 100, 2000000, 11);
    gate(`hard A=1 d=${d}`, ours, ref, 4e-3);
  }
}
console.log(fails ? `${fails} gate(s) FAILED` : 'all gates pass');
process.exit(fails ? 1 : 0);
