// Independent depth-coordinate references. The full circles reference and
// real CDF utility are copied unchanged from the preceding gpu-followup probe.
// These references never call or construct a compact/dense transform.
const TAU=2*Math.PI, D0=6, SIGMA=.5, CENTER_X=240, A=-2.5, B=-600;
const RADIUS=5/12, LIGHT=.76028592126970562;
const phi=z=>Math.exp(-z*z/2)/Math.sqrt(TAU);
export function directMode(ks, frequency, {d0=6,sigma=.5,A=-2.5}={}, N=65536) {
 const L=9;
 if (!(d0>L*sigma)) throw new RangeError('Reference fixture needs positive kept depth.');
 const step=2*L*sigma/N, gamma=2*Math.PI**2*sigma**2*A**2*ks**2;
 let re=0,im=0;
 for(let j=0;j<N;j++){
  const dy=-L*sigma+(j+.5)*step, d=d0+dy;
  const w=phi(dy/sigma)/sigma*step*Math.exp(-gamma/(d*d));
  const phase=TAU*frequency/d;
  re+=w*Math.cos(phase);im+=w*Math.sin(phase);
 }
 return[re,im];
}

function legendre(N) {
  const x = new Float64Array(N), w = new Float64Array(N);
  for (let j = 0; j < Math.ceil(N / 2); j++) {
    let z = Math.cos(Math.PI * (j + 0.75) / (N + 0.5)), derivative;
    for (let step = 0; step < 20; step++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= N; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      derivative = N * (z * p1 - p0) / (z * z - 1);
      const delta = p1 / derivative; z -= delta;
      if (Math.abs(delta) < 2e-15) break;
    }
    x[j] = -z; x[N - 1 - j] = z;
    w[j] = w[N - 1 - j] = 2 / ((1 - z * z) * derivative * derivative);
  }
  return { x, w };
}

function exactCirclesPanels(x, order) {
  const lowY = D0 - 9 * SIGMA, highY = D0 + 9 * SIGMA, X0 = x - CENTER_X;
  const gl = legendre(order); let total = 0, panels = 0;
  for (let n = Math.floor(B / lowY) - 1; n <= Math.ceil(B / highY) + 1; n++) {
    const ya = B / (n + 0.5 - RADIUS), yb = B / (n + 0.5 + RADIUS);
    const a = Math.max(lowY, Math.min(ya, yb)), b = Math.min(highY, Math.max(ya, yb));
    if (!(a < b)) continue;
    panels++;
    for (let j = 0; j < order; j++) {
      const theta = Math.PI / 2 * (gl.x[j] + 1), y = (a + b) / 2 - (b - a) / 2 * Math.cos(theta);
      const jacobian = (b - a) / 2 * Math.sin(theta) * Math.PI / 2;
      const v = B / y - n, h = Math.sqrt(Math.max(0, RADIUS ** 2 - (v - 0.5) ** 2));
      const u0 = A * (X0 - 9 * SIGMA) / y, u1 = A * (X0 + 9 * SIGMA) / y;
      let inner = 0;
      for (let k = Math.floor(Math.min(u0, u1)) - 1; k <= Math.ceil(Math.max(u0, u1)) + 1; k++) {
        const da = (k + 0.5 - h) * y / A - X0, db = (k + 0.5 + h) * y / A - X0;
        const lo = Math.max(-9 * SIGMA, Math.min(da, db)), hi = Math.min(9 * SIGMA, Math.max(da, db));
        if (lo < hi) inner += 0.5 * (erfCody(hi / (SIGMA * Math.SQRT2)) - erfCody(lo / (SIGMA * Math.SQRT2)));
      }
      total += gl.w[j] * jacobian * phi((y - D0) / SIGMA) / SIGMA * inner;
    }
  }
  return { value: LIGHT * total, panels, order };
}

function erfCody(x) {
  // Cody's rational Chebyshev approximation (1969), accuracy ~1e-16
  const a = [3.16112374387056560e00, 1.13864154151050156e02, 3.77485237685302021e02, 3.20937758913846947e03, 1.85777706184603153e-1];
  const b = [2.36012909523441209e01, 2.44024637934444173e02, 1.28261652607737228e03, 2.84423683343917062e03];
  const c = [5.64188496988670089e-1, 8.88314979438837594e00, 6.61191906371416295e01, 2.98635138197400131e02, 8.81952221241769090e02, 1.71204761263407058e03, 2.05107837782607147e03, 1.23033935479799725e03, 2.15311535474403846e-8];
  const dd = [1.57449261107098347e01, 1.17693950891312499e02, 5.37181101862009858e02, 1.62138957456669019e03, 3.29079923573345963e03, 4.36261909014324716e03, 3.43936767414372164e03, 1.23033935480374942e03];
  const p = [3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1, 1.60837851487422766e-2, 6.58749161529837803e-4, 1.63153871373020978e-2];
  const q = [2.56852019228982242e00, 1.87295284992346725e00, 5.27905102951428412e-1, 6.05183413124413191e-2, 2.33520497626869185e-3];
  const ax = Math.abs(x);
  let res;
  if (ax <= 0.46875) {
    const z = ax * ax; let xn = a[4] * z, xd = z;
    for (let i = 0; i < 3; i++) { xn = (xn + a[i]) * z; xd = (xd + b[i]) * z; }
    res = x * (xn + a[3]) / (xd + b[3]);
    return res;
  } else if (ax <= 4) {
    let xn = c[8] * ax, xd = ax;
    for (let i = 0; i < 7; i++) { xn = (xn + c[i]) * ax; xd = (xd + dd[i]) * ax; }
    res = (xn + c[7]) / (xd + dd[7]);
    const z = Math.floor(ax * 16) / 16; const del = (ax - z) * (ax + z);
    res = Math.exp(-z * z) * Math.exp(-del) * res;
  } else {
    const z = 1 / (ax * ax); let xn = p[5] * z, xd = z;
    for (let i = 0; i < 4; i++) { xn = (xn + p[i]) * z; xd = (xd + q[i]) * z; }
    res = z * (xn + p[4]) / (xd + q[4]);
    res = (0.5641895835477563 - res) / ax;
    const zz = Math.floor(ax * 16) / 16; const del = (ax - zz) * (ax + zz);
    res = Math.exp(-zz * zz) * Math.exp(-del) * res;
  }
  return x < 0 ? -(1 - res) : 1 - res; // erfc -> erf
}

function j1Integral(z, N = 256) {
  let sum = 0;
  for (let j = 0; j < N; j++) { const t = TAU * (j + 0.5) / N; sum += Math.cos(z * Math.sin(t) - t); }
  return sum / N;
}

function circleCoefficients(K, N = 256) {
  const list = [], area = Math.PI * RADIUS ** 2;
  for (let ks = 0; ks <= K; ks++) for (let kt = ks === 0 ? 1 : -K; kt <= K; kt++) {
    const z = TAU * RADIUS * Math.hypot(ks, kt), sign = (ks + kt) % 2 === 0 ? 1 : -1;
    list.push({ ks, kt, c: sign * area * 2 * j1Integral(z, N) / z });
  }
  return { area, list };
}

export {exactCirclesPanels,circleCoefficients,LIGHT};
