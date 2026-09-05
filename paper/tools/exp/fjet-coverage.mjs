// Hard pictures of a curved count. A reviewer's example: count
// xi = eps (Z^2 - 1/2), Z ~ N(0,1), picture 1{xi > 0}: the count's width is
// sqrt(2) eps, its mean eps/2 > 0, so freezing at the mean returns 1 for
// every eps, where P(Z^2 > 1/2) = erfc(1/2) = 0.4795001. The compiler had
// folded the count to a number at trace time (zero gradient) and returned
// the step at the centre, 0. Now a count that is mostly curvature keeps its
// axis, and a hard picture on it is integrated as the coverage of the
// quadratic form: conditioned on one eigen-direction, intervals in the
// other. Gates: the reviewer's example at three sizes, the relu of the
// same count (E (Z^2 - 1/2)^+ = 2 a phi(a) + P(|Z| > a) - P(|Z| > a) / 2 at
// a = 1/sqrt 2, 0.679137), and rotated rank-two counts (both curvatures,
// a rate, a cross term) with a step and a relu against a 2-D midpoint
// quadrature of the shader itself.
//
//   node paper/tools/exp/fjet-coverage.mjs
process.env.FJET_LIB = '1';
const yb = await import('./fjet-yb.mjs');
const { Jet } = await import('./fjet.mjs');
const NUM = yb.NUM;
const sig = yb.SIG;
const mk = (name, xiOf, picOf) => ({
  name,
  eval: (O, x, y, jets) => {
    const X = jets ? new Jet(x - 240, 1, 0) : x - 240;
    const Y = jets ? new Jet(y - 100, 0, 1) : y - 100;
    const v = picOf(O, xiOf(O, X, Y));
    return [v, v, v];
  },
});
const pics = {
  step: (O, xi) => O.select(O.gt(xi, 0), 1, 0),
  sign: (O, xi) => O.add(0.5, O.scale(O.sign(xi), 0.5)),
  relu: (O, xi) => O.relu(xi),
};
const ref2D = (cs, N = 2400, L = 6) => {
  let total = 0;
  for (let i = 0; i < N; i++) {
    const dx = -L * sig + (2 * L * sig * (i + 0.5)) / N;
    const wx = Math.exp(-0.5 * (dx / sig) ** 2);
    let row = 0;
    for (let j = 0; j < N; j++) {
      const dy = -L * sig + (2 * L * sig * (j + 0.5)) / N;
      row += Math.exp(-0.5 * (dy / sig) ** 2) * cs.eval(NUM, 240 + dx, 100 + dy, false)[0];
    }
    total += wx * row;
  }
  return (total * (2 * L * sig / N) ** 2) / (2 * Math.PI * sig * sig);
};
let fails = 0;
const gate = (label, ours, ref, tol) => {
  const err = Math.abs(ours - ref);
  const ok = err <= tol;
  if (!ok) fails += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ours ${ours.toFixed(7)} ref ${ref.toFixed(7)} |err| ${err.toExponential(1)} (tol ${tol.toExponential(0)})`);
};
// the reviewer's example
const erfcHalf = 0.4795001221869535;
// E (Z^2 - 1/2)^+ by a fine midpoint rule
let reluExact = 0;
{
  const n = 4000000;
  const L = 10;
  for (let i = 0; i < n; i++) {
    const z = -L + (2 * L * (i + 0.5)) / n;
    const q = z * z - 0.5;
    if (q > 0) reluExact += q * Math.exp(-0.5 * z * z);
  }
  reluExact *= (2 * L) / n / Math.sqrt(2 * Math.PI);
}
for (const eps of [1e-3, 0.1, 1]) {
  const xi = (O, X) => O.scale(O.sub(O.scale(O.mul(X, X), 1 / (sig * sig)), 0.5), eps);
  for (const [name, pic] of Object.entries(pics)) {
    const cs = mk(`stat ${name} ${eps}`, xi, pic);
    const ours = yb.oursPixel(cs, 240, 100, null)[0];
    const exact = name === 'relu' ? eps * reluExact : erfcHalf;
    gate(`reviewer eps=${eps} ${name}`, ours, exact, name === 'relu' ? 2e-6 * eps + 1e-9 : 2e-6);
  }
}
// rotated rank-two counts: eps (a X'^2 + b X'Y' + c Y'^2 + d X' + e Y' + f) / sig^2 in a frame turned by 0.6 rad
const rot = 0.6;
for (const [label, a, b, c, d, e, f] of [
  ['saddle', 0.7, 0.4, -0.3, 0.05, 0, -0.1],
  ['bowl', 0.5, 0.1, 0.8, 0.2, -0.1, -0.3],
  ['ridge', -0.6, 0, -0.02, 0, 0.15, 0.2],
]) {
  for (const eps of [1e-3, 0.3]) {
    const xi = (O, X, Y) => {
      const Xp = O.add(O.scale(X, Math.cos(rot)), O.scale(Y, Math.sin(rot)));
      const Yp = O.sub(O.scale(Y, Math.cos(rot)), O.scale(X, Math.sin(rot)));
      const q = O.add(O.add(O.add(O.scale(O.mul(Xp, Xp), a), O.scale(O.mul(Xp, Yp), b)), O.scale(O.mul(Yp, Yp), c)), O.add(O.add(O.scale(Xp, d), O.scale(Yp, e)), f));
      return O.scale(q, eps / (sig * sig));
    };
    for (const name of ['step', 'relu']) {
      const cs = mk(`${label} ${name} ${eps}`, xi, pics[name]);
      const ours = yb.oursPixel(cs, 240, 100, null)[0];
      const ref = ref2D(cs);
      gate(`${label} eps=${eps} ${name}`, ours, ref, name === 'relu' ? 3e-5 * eps + 1e-8 : 3e-5);
    }
  }
}
console.log(fails ? `${fails} gate(s) FAILED` : 'all gates pass');
process.exit(fails ? 1 : 0);
