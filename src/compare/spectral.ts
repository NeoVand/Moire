import { wgslFn } from 'three/tsl';

/**
 * Live specialization of the compiler's Fourier / Gaussian-character route.
 *
 * The source is an ordinary 50%-duty checkerboard. A pixel is a Gaussian with
 * sigma 0.5 device pixels. Each character uses the complete quadratic phase,
 * including the mixed Hessian, and both sum/difference characters of the two
 * square waves are integrated together. Filtering each square wave separately
 * would erase their correlation at grazing angles.
 *
 * The projective wrapper integrates the exact screen-space checker edges when
 * the footprint meets at most one edge per axis. Otherwise it uses the finite
 * 16-by-16 odd-harmonic specialization, not the general CPU compiler or its
 * exact depth-conditioning path. The latter's two approximation errors are
 * Fourier truncation and replacing the projective phase by a quadratic.
 * None of these numerical errors is a certified whole-image bound.
 */
export const SPECTRAL_HARMONICS = 16;
// For this finite recipe box, dropping a character of magnitude <= exp(-18)
// changes checker coverage by at most 8/pi²*(sum_{odd<=31}1/n)²*exp(-18)
// (< 9e-8 in exact arithmetic). This is a bound on the actual quadratic
// multiplier, including curvature, not a first-order frequency heuristic.
export const CHARACTER_LOG_CUT = -18;
export type Pair = readonly [number, number];
export interface CheckerJet {
  uv: Pair;
  dx: Pair;
  dy: Pair;
  dxx: Pair;
  dxy: Pair;
  dyy: Pair;
  /** Gradient of projective denominator divided by its value at this pixel. */
  denominator?: Pair;
}

// A&S 7.1.26 normal-CDF approximation. Its error is well below the demo's
// finite-character / source-model error; this is not interval arithmetic.
function normalCdf(value: number): number {
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
    0.284496736) * t + 0.254829592) * t) * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(value) * erf);
}

const GL16_X = [0.09501250983763744, 0.2816035507792589, 0.4580167776572274, 0.6178762444026438,
  0.755404408355003, 0.8656312023878318, 0.9445750230732326, 0.9894009349916499];
const GL16_W = [0.1894506104550685, 0.1826034150449236, 0.16915651939500254, 0.14959598881657674,
  0.12462897125553388, 0.09515851168249279, 0.062253523938647894, 0.027152459411754096];

/** Plackett's correlation integral, theta=asin(rho), with GL16 quadrature. */
function bivariateCdf(a: number, b: number, rho: number): number {
  const pa = normalCdf(a), pb = normalCdf(b);
  if (rho >= 1 - 1e-12) return normalCdf(Math.min(a, b));
  if (rho <= -1 + 1e-12) return Math.max(0, pa + pb - 1);
  const half = 0.5 * Math.asin(Math.min(1, Math.max(-1, rho)));
  let integral = 0;
  for (let i = 0; i < GL16_X.length; i++) for (const sign of [-1, 1]) {
    const theta = half * (1 + sign * GL16_X[i]);
    const s = Math.sin(theta), c = Math.cos(theta);
    const numerator = Math.max(0, (a - b) * (a - b) + 2 * a * b * (1 - s));
    integral += GL16_W[i] * Math.exp(-0.5 * numerator / (c * c));
  }
  return Math.max(0, Math.min(Math.min(pa, pb), pa * pb + half * integral / (2 * Math.PI)));
}

/**
 * Exact projective edge geometry, when the 6-sigma disk reaches at most one
 * checker edge per axis. The CDF is numerical (GL16), and ignoring the outside
 * disk costs at most exp(-18). Return null where multiple edges/pole matter.
 */
export function projectiveCoverageCpu(jet: CheckerJet, sigma = 0.5): number | null {
  if (!jet.denominator) return null;
  const r = jet.denominator;
  const poleReach = 6 * sigma * Math.hypot(...r);
  if (poleReach >= 0.25) return null;
  const boundary = jet.uv.map(v => Math.round(2 * v));
  const delta = jet.uv.map((v, i) => v - boundary[i] * 0.5);
  const excursion = jet.dx.map((v, i) => 6 * sigma * Math.hypot(v, jet.dy[i]) / (1 - poleReach));
  if (excursion.some((v, i) => v >= 0.5 - Math.abs(delta[i]))) return null;
  const nx = jet.dx.map((v, i) => v + delta[i] * r[0]);
  const ny = jet.dy.map((v, i) => v + delta[i] * r[1]);
  const widths = nx.map((v, i) => sigma * Math.hypot(v, ny[i]));
  const parity = ((boundary[0] + boundary[1]) % 2 === 0) ? 1 : -1;
  if (widths[0] === 0 || widths[1] === 0) {
    const signs = delta.map((v, i) => widths[i] === 0 ? Math.sign(v) : 2 * normalCdf(v / widths[i]) - 1);
    return 0.5 + 0.5 * parity * signs[0] * signs[1];
  }
  const a = delta[0] / widths[0], b = delta[1] / widths[1];
  const rho = sigma * sigma * (nx[0] * nx[1] + ny[0] * ny[1]) / (widths[0] * widths[1]);
  const expectation = 1 - 2 * normalCdf(a) - 2 * normalCdf(b) + 4 * bivariateCdf(a, b, rho);
  return Math.min(1, Math.max(0, 0.5 + 0.5 * parity * expectation));
}

export function projectiveCheckerCpu(jet: CheckerJet, sigma = 0.5, harmonics = SPECTRAL_HARMONICS): number {
  if (sigma === 0) return checkerPointCpu(jet.uv);
  return projectiveCoverageCpu(jet, sigma) ?? spectralCheckerCpu(jet, sigma, harmonics);
}

/** Re E exp(i(theta + g.X + X' H X / 2)), X ~ N(0,sigma² I). */
export function gaussianCharacterCpu(
  theta: number, gradient: Pair, hessian: readonly [number, number, number], sigma: number,
): number {
  const [gx, gy] = gradient;
  const [hxx, hxy, hyy] = hessian;
  const s2 = sigma * sigma;
  const hNorm2 = hxx * hxx + 2 * hxy * hxy + hyy * hyy;
  const exponentBound = -0.5 * s2 * (gx * gx + gy * gy) / (1 + s2 * s2 * hNorm2);
  if (exponentBound < CHARACTER_LOG_CUT) return 0;
  const dr = 1 - s2 * s2 * (hxx * hyy - hxy * hxy);
  const di = -s2 * (hxx + hyy);
  const norm = dr * dr + di * di;
  const qr = gx * gx + gy * gy;
  const qi = -s2 * (hyy * gx * gx - 2 * hxy * gx * gy + hxx * gy * gy);
  const er = -0.5 * s2 * (qr * dr + qi * di) / norm;
  const ei = -0.5 * s2 * (qi * dr - qr * di) / norm;
  return Math.pow(norm, -0.25) * Math.exp(Math.min(er, 0)) *
    Math.cos(theta + ei - 0.5 * Math.atan2(di, dr));
}

export function checkerPointCpu(uv: Pair): number {
  return (uv[0] - Math.floor(uv[0]) >= 0.5) ===
    (uv[1] - Math.floor(uv[1]) >= 0.5) ? 1 : 0;
}

function sourceSafe(jet: CheckerJet, sigma: number): boolean {
  return [0, 1].every(axis => {
    const u = jet.uv[axis] - Math.floor(jet.uv[axis]);
    const edge = Math.min(u, Math.abs(u - 0.5), 1 - u);
    const g = Math.hypot(jet.dx[axis], jet.dy[axis]);
    const h = Math.hypot(jet.dxx[axis], Math.SQRT2 * jet.dxy[axis], jet.dyy[axis]);
    // On |X| <= 6 sigma, the Taylor phase cannot cross a square-wave edge.
    // The omitted Gaussian probability is exp(-18), for the quadratic model.
    return edge > 6 * sigma * g + 18 * sigma * sigma * h;
  });
}

function activeHarmonics(jet: CheckerJet, sigma: number, cap: number): number {
  const a = jet.dx[0] ** 2 + jet.dy[0] ** 2;
  const b = jet.dx[0] * jet.dx[1] + jet.dy[0] * jet.dy[1];
  const c = jet.dx[1] ** 2 + jet.dy[1] ** 2;
  const largest = 0.5 * (a + c + Math.hypot(a - c, 2 * b));
  const determinant = jet.dx[0] * jet.dy[1] - jet.dy[0] * jet.dx[1];
  const smallest = largest === 0 ? 0 : 0.99 * determinant * determinant / largest;
  const h2 = jet.dxx[0] ** 2 + jet.dxx[1] ** 2 + 2 * (jet.dxy[0] ** 2 + jet.dxy[1] ** 2) +
    jet.dyy[0] ** 2 + jet.dyy[1] ** 2;
  const s2 = sigma * sigma;
  const denominator = 4 * Math.PI * Math.PI * s2 * (0.5 * smallest + CHARACTER_LOG_CUT * s2 * h2);
  if (denominator <= 0) return cap;
  const order = Math.sqrt(Math.max(0, -CHARACTER_LOG_CUT / denominator - 1));
  // One spare odd order makes the boundary conservative under rounding.
  return Math.min(cap, Math.max(1, Math.ceil((order + 1) / 2)));
}

export function spectralCheckerCpu(jet: CheckerJet, sigma = 0.5, harmonics = SPECTRAL_HARMONICS): number {
  if (sigma === 0 || sourceSafe(jet, sigma)) return checkerPointCpu(jet.uv);
  let result = 0.5;
  const tau = 2 * Math.PI;
  const u = jet.uv.map(value => value - Math.floor(value));
  const count = activeHarmonics(jet, sigma, harmonics);
  for (let a = 0; a < count; a++) {
    const m = 2 * a + 1;
    for (let b = 0; b < count; b++) {
      const n = 2 * b + 1;
      const character = (sign: number) => gaussianCharacterCpu(
        tau * (m * u[0] + sign * n * u[1]),
        [tau * (m * jet.dx[0] + sign * n * jet.dx[1]), tau * (m * jet.dy[0] + sign * n * jet.dy[1])],
        [tau * (m * jet.dxx[0] + sign * n * jet.dxx[1]),
          tau * (m * jet.dxy[0] + sign * n * jet.dxy[1]),
          tau * (m * jet.dyy[0] + sign * n * jet.dyy[1])], sigma,
      );
      result += 4 / (Math.PI * Math.PI * m * n) * (character(-1) - character(1));
    }
  }
  return Math.min(1, Math.max(0, result));
}

export const gaussianCharacterWGSL = /* wgsl */ `
fn comparisonGaussianCharacter(theta: f32, g: vec2f, h: vec3f, sigma: f32) -> f32 {
  let s2 = sigma * sigma;
  let hNorm2 = h.x*h.x + 2.0*h.y*h.y + h.z*h.z;
  let exponentBound = -0.5*s2*dot(g,g)/(1.0+s2*s2*hNorm2);
  if (exponentBound < ${CHARACTER_LOG_CUT}.0) { return 0.0; }
  let dr = 1.0 - s2 * s2 * (h.x * h.z - h.y * h.y);
  let di = -s2 * (h.x + h.z);
  let norm = dr * dr + di * di;
  let qr = dot(g, g);
  let qi = -s2 * (h.z*g.x*g.x - 2.0*h.y*g.x*g.y + h.x*g.y*g.y);
  let er = -0.5*s2 * (qr*dr + qi*di) / norm;
  let ei = -0.5*s2 * (qi*dr - qr*di) / norm;
  return inverseSqrt(sqrt(norm)) * exp(min(er, 0.0)) * cos(theta + ei - 0.5*atan2(di, dr));
}`;

export const spectralCheckerWGSL = /* wgsl */ `
fn comparisonSpectralChecker(uv: vec2f, dx: vec2f, dy: vec2f,
  dxx: vec2f, dxy: vec2f, dyy: vec2f, sigma: f32) -> f32 {
  let p = fract(uv);
  let point = select(0.0, 1.0, (p.x >= 0.5) == (p.y >= 0.5));
  let edge = min(min(p, abs(p-vec2f(0.5))), vec2f(1.0)-p);
  let gWidth = sqrt(dx*dx + dy*dy);
  let hWidth = sqrt(dxx*dxx + 2.0*dxy*dxy + dyy*dyy);
  if (sigma == 0.0 || all(edge > 6.0*sigma*gWidth + 18.0*sigma*sigma*hWidth)) { return point; }
  let tau = 6.283185307179586;
  // A lower singular-value bound on all combined gradients, paired with an
  // upper bound on all combined Hessians, limits the whole character box.
  // It preserves near-parallel cancellation: its smallest width tends to zero.
  let ga = dx.x*dx.x+dy.x*dy.x;
  let gb = dx.x*dx.y+dy.x*dy.y;
  let gc = dx.y*dx.y+dy.y*dy.y;
  let largest = 0.5*(ga+gc+sqrt((ga-gc)*(ga-gc)+4.0*gb*gb));
  let determinant = dx.x*dy.y-dy.x*dx.y;
  let smallest = 0.99*determinant*determinant/max(largest,1e-30);
  let h2 = dot(dxx,dxx)+2.0*dot(dxy,dxy)+dot(dyy,dyy);
  let s2 = sigma*sigma;
  let boxDenominator = tau*tau*s2*(0.5*smallest-18.0*s2*h2);
  var count = ${SPECTRAL_HARMONICS};
  if (boxDenominator > 0.0) {
    let order = sqrt(max(0.0,18.0/boxDenominator-1.0));
    count = min(count,max(1,i32(ceil((order+1.0)*0.5))));
  }
  var result = 0.5;
  for (var a = 0; a < count; a++) {
    let m = f32(2*a+1);
    for (var b = 0; b < count; b++) {
      let n = f32(2*b+1);
      let gm = tau * vec2f(m*dx.x - n*dx.y, m*dy.x - n*dy.y);
      let gp = tau * vec2f(m*dx.x + n*dx.y, m*dy.x + n*dy.y);
      let hm = tau * vec3f(m*dxx.x - n*dxx.y, m*dxy.x - n*dxy.y, m*dyy.x - n*dyy.y);
      let hp = tau * vec3f(m*dxx.x + n*dxx.y, m*dxy.x + n*dxy.y, m*dyy.x + n*dyy.y);
      let vm = comparisonGaussianCharacter(tau*(m*p.x-n*p.y), gm, hm, sigma);
      let vp = comparisonGaussianCharacter(tau*(m*p.x+n*p.y), gp, hp, sigma);
      result += (0.4052847345693511 / (m*n)) * (vm-vp);
    }
  }
  return clamp(result, 0.0, 1.0);
}`;

const gaussianCharacter = wgslFn(gaussianCharacterWGSL);
// Three accepts its callable WGSL function as an include; @types models only
// the underlying FunctionNode (the same runtime pattern as inverse.wgsl.ts).
// @ts-expect-error callable wgslFn includes are supported by Three's builder.
export const spectralChecker = wgslFn(spectralCheckerWGSL, [gaussianCharacter]);

export const normalCdfWGSL = /* wgsl */ `
fn comparisonNormalCdf(value: f32) -> f32 {
  let x = abs(value) * 0.7071067811865475;
  let t = 1.0 / (1.0 + 0.3275911*x);
  let erf = 1.0 - (((((1.061405429*t - 1.453152027)*t + 1.421413741)*t -
    0.284496736)*t + 0.254829592)*t) * exp(-x*x);
  return 0.5*(1.0 + sign(value)*erf);
}`;
export const bivariateCdfWGSL = /* wgsl */ `
fn comparisonBivariateCdf(a: f32, b: f32, correlation: f32) -> f32 {
  let pa = comparisonNormalCdf(a);
  let pb = comparisonNormalCdf(b);
  let rho = clamp(correlation, -1.0, 1.0);
  if (rho >= 0.9999999) { return comparisonNormalCdf(min(a,b)); }
  if (rho <= -0.9999999) { return max(0.0, pa+pb-1.0); }
  let nodes = array<f32, 8>(${GL16_X.map(v => v.toPrecision(17)).join(', ')});
  let weights = array<f32, 8>(${GL16_W.map(v => v.toPrecision(17)).join(', ')});
  let half = 0.5*asin(rho);
  var integral = 0.0;
  for (var i = 0; i < 8; i++) {
    let theta1 = half*(1.0-nodes[i]);
    let theta2 = half*(1.0+nodes[i]);
    let c1 = cos(theta1); let c2 = cos(theta2);
    let ab = (a-b)*(a-b);
    let n1 = max(0.0, ab + 2.0*a*b*(1.0-sin(theta1)));
    let n2 = max(0.0, ab + 2.0*a*b*(1.0-sin(theta2)));
    integral += weights[i]*(exp(-0.5*n1/(c1*c1)) + exp(-0.5*n2/(c2*c2)));
  }
  return clamp(pa*pb + half*integral*0.15915494309189535, 0.0, min(pa,pb));
}`;
export const projectiveCheckerWGSL = /* wgsl */ `
fn comparisonProjectiveChecker(uv: vec2f, dx: vec2f, dy: vec2f,
  dxx: vec2f, dxy: vec2f, dyy: vec2f, sigma: f32, denominator: vec2f) -> f32 {
  let poleReach = 6.0*sigma*length(denominator);
  let boundary = round(2.0*uv);
  let delta = uv-0.5*boundary;
  let excursion = 6.0*sigma*sqrt(dx*dx+dy*dy)/max(1.0-poleReach, 0.001);
  if (poleReach < 0.25 && all(excursion < vec2f(0.5)-abs(delta))) {
    let nx = dx + delta*denominator.x;
    let ny = dy + delta*denominator.y;
    let widths = sigma*sqrt(nx*nx+ny*ny);
    let parity = select(-1.0, 1.0, (i32(boundary.x)+i32(boundary.y))%2 == 0);
    if (min(widths.x,widths.y) <= 1e-15) {
      let signs = vec2f(
        select(2.0*comparisonNormalCdf(delta.x/max(widths.x,1e-15))-1.0, sign(delta.x), widths.x <= 1e-15),
        select(2.0*comparisonNormalCdf(delta.y/max(widths.y,1e-15))-1.0, sign(delta.y), widths.y <= 1e-15));
      return clamp(0.5+0.5*parity*signs.x*signs.y, 0.0, 1.0);
    }
    let a = delta.x/widths.x; let b = delta.y/widths.y;
    let rho = sigma*sigma*(nx.x*nx.y+ny.x*ny.y)/(widths.x*widths.y);
    let expectation = 1.0-2.0*comparisonNormalCdf(a)-2.0*comparisonNormalCdf(b)+
      4.0*comparisonBivariateCdf(a,b,rho);
    return clamp(0.5+0.5*parity*expectation, 0.0, 1.0);
  }
  return comparisonSpectralChecker(uv,dx,dy,dxx,dxy,dyy,sigma);
}`;
const normalCdfNode = wgslFn(normalCdfWGSL);
// @ts-expect-error callable wgslFn includes are supported by Three's builder.
const bivariateCdfNode = wgslFn(bivariateCdfWGSL, [normalCdfNode]);
// @ts-expect-error callable wgslFn includes are supported by Three's builder.
export const projectiveChecker = wgslFn(projectiveCheckerWGSL, [normalCdfNode, bivariateCdfNode, spectralChecker]);
