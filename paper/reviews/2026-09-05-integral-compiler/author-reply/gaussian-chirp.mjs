/**
 * CPU reference: interval moments of a Gaussian times a quadratic phase.
 * No dependencies; deliberately not a production Faddeeva/GPU implementation.
 * See CORRELATED-COVERAGE.md for the error contract and derivation.
 */
const SQRT_TAU = Math.sqrt(2 * Math.PI);
const EPS = Number.EPSILON;
const LOG2 = Math.log(2);

const mul = ([ar, ai], [br, bi]) => [ar * br - ai * bi, ar * bi + ai * br];
const polar = (logMagnitude, phase) => {
  const magnitude = Math.exp(logMagnitude);
  return [magnitude * Math.cos(phase), magnitude * Math.sin(phase)];
};

function fullLine(B, Q) {
  const den = 1 + Q * Q;
  const inv = [1 / den, Q / den];
  const logMagnitude = -0.25 * Math.log(den) - (B * B) / (2 * den);
  const phase = 0.5 * Math.atan(Q) - (B * B * Q) / (2 * den);
  const inv2 = mul(inv, inv);
  const factors = [[1, 0], [-B * inv[1], B * inv[0]],
    [inv[0] - B * B * inv2[0], inv[1] - B * B * inv2[1]]];
  // Apply factors in logarithmic polar form, avoiding premature underflow of M0.
  return factors.map(([r, i]) => r === 0 && i === 0 ? [0, 0]
    : polar(logMagnitude + Math.log(Math.hypot(r, i)), phase + Math.atan2(i, r)));
}

function oneTail(L) {
  if (L === Infinity) return [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE];
  const logPhi = -0.5 * L * L - Math.log(SQRT_TAU);
  // Mills' inequality and integration by parts; bounds for orders 0, 1, 2.
  // Keep the polynomial factor before exponentiation near density underflow.
  return [logPhi - Math.log(L), logPhi, logPhi + Math.log(L + 1 / L)]
    .map(x => Math.max(Number.MIN_VALUE, Math.exp(x)));
}

/**
 * Return M_j = E[W^j 1{a<=W<=b} exp(i(beta W + q W^2/2))], j=0,1,2.
 * W ~ N(0,sigma^2). Complex numbers are [real, imaginary].
 *
 * normalized:false instead returns the unnormalized Gaussian-weighted integral.
 * absTol targets each STANDARDIZED moment (W/sigma)^j before normalization;
 * tolerance[j] reports the corresponding requested error in returned units.
 * Bounds may be infinite; reversed bounds negate the integral.
 *
 * `estimatedError` includes a HEURISTIC floating-point allowance. This is not
 * certified interval arithmetic. `analyticErrorBound` bounds truncation in exact
 * arithmetic. Callers MUST inspect status; budget/range violations throw.
 */
export function gaussianChirpMoments({
  a = -Infinity, b = Infinity, sigma = 1, beta = 0, q = 0,
  normalized = true, absTol = 1e-10, maxPanels = 262144, method = 'auto',
} = {}) {
  if (!(Number.isFinite(sigma) && sigma > 0 && Number.isFinite(sigma * sigma) && sigma * sigma > 0))
    throw new RangeError('sigma and sigma squared must be finite and positive');
  if (![beta, q].every(Number.isFinite) || typeof a !== 'number' || typeof b !== 'number' || Number.isNaN(a) || Number.isNaN(b))
    throw new RangeError('beta and q must be finite; a and b must be real extended bounds');
  if (!(Number.isFinite(absTol) && absTol > 0) || !Number.isSafeInteger(maxPanels) || maxPanels < 1)
    throw new RangeError('absTol must be positive and finite; maxPanels must be a positive integer');
  if (method !== 'auto' && method !== 'series') throw new RangeError('method must be auto or series');
  if (typeof normalized !== 'boolean') throw new TypeError('normalized must be boolean');
  const B = beta * sigma;
  const Q = (q * sigma) * sigma;
  // A stated, tested reference scope, not a universal complex special function.
  if (!Number.isFinite(B) || !Number.isFinite(Q) || Math.max(Math.abs(B), Math.abs(Q)) > 1e6)
    throw new RangeError('reference scope requires |beta*sigma| and |q*sigma^2| <= 1e6');
  const normalization = normalized ? 1 : SQRT_TAU * sigma;
  const scales = [normalization, normalization * sigma, normalization * sigma * sigma];
  if (!scales.every(x => Number.isFinite(x) && x > 0))
    throw new RangeError('moment output scales must be finite and positive');
  let sign = 1;
  if (a > b) { [a, b] = [b, a]; sign = -1; }
  const finish = (moments, tail, truncation, roundoff, details) => {
    const analyticErrorBound = tail.map((x, j) => (x + truncation[j]) * scales[j]);
    const roundoffEstimate = roundoff.map((x, j) => x * scales[j]);
    const estimatedError = analyticErrorBound.map((x, j) => x + roundoffEstimate[j]);
    const tolerance = scales.map(s => absTol * s);
    return {
      moments: moments.map((z, j) => z.map(x => sign * scales[j] * x)),
      status: estimatedError.every((e, j) => e <= tolerance[j]) ? 'estimated-tolerance-met' : 'roundoff-limited',
      tolerance, estimatedError, analyticErrorBound, roundoffEstimate,
      tailBound: tail.map((x, j) => x * scales[j]),
      seriesBound: truncation.map((x, j) => x * scales[j]),
      ...details,
    };
  };
  const zero = () => [[0, 0], [0, 0], [0, 0]];
  if (a === b) return finish(zero(), [0, 0, 0], [0, 0, 0], [0, 0, 0], { method: 'empty', panels: 0, coefficients: 0 });
  if (a === -Infinity && b === Infinity && method === 'auto') {
    const moments = fullLine(B, Q);
    const conditioning = 32 * EPS * (1 + B * B / (1 + Q * Q) + Math.abs(B * B * Q / (1 + Q * Q)));
    const roundoff = moments.map(z => Math.max(Number.MIN_VALUE, conditioning * Math.hypot(...z)));
    return finish(moments, [0, 0, 0], [0, 0, 0], roundoff, { method: 'full-line-analytic', panels: 0, coefficients: 0 });
  }

  let L = 8;
  while (2 * Math.max(...oneTail(L)) > absTol / 16 && L < 38) L += 0.5;
  if (2 * Math.max(...oneTail(L)) > absTol / 16)
    throw new RangeError('requested tolerance is below the supported Gaussian-tail range');
  const lower = a / sigma;
  const upper = b / sigma;
  const tail = [0, 0, 0];
  // Use the closer endpoint if the entire requested interval is in a tail.
  if (lower < -L) {
    const bound = oneTail(Math.max(L, -upper));
    for (let j = 0; j < 3; j++) tail[j] += bound[j];
  }
  if (upper > L) {
    const bound = oneTail(Math.max(L, lower));
    for (let j = 0; j < 3; j++) tail[j] += bound[j];
  }
  const lo = Math.max(-L, lower);
  const hi = Math.min(L, upper);
  const unclipped = Number.isFinite(a) && Number.isFinite(b) && lower >= -L && upper <= L;
  // Do not subtract independently rounded a/sigma and b/sigma: that can erase
  // or badly change a one-ulp interval. Preserve its original endpoint gap.
  const width = unclipped ? (b - a) / sigma : hi - lo;
  if (unclipped && width === 0) throw new RangeError('standardized interval width underflows binary64');
  if (!(width > 0)) return finish(zero(), tail, [0, 0, 0], [0, 0, 0], { method: 'tail-truncated', cutoff: L, panels: 0, coefficients: 0 });

  // Limit |alpha|+|gamma| on every panel. Unlike an adaptive quadrature
  // difference test, this cannot mistake unresolved whole oscillations for zero.
  const H = Math.hypot(1, Q);
  const maxA = Math.max(Math.hypot(lo, B + Q * lo), Math.hypot(hi, B + Q * hi));
  const maxHalfWidth = 1.5 / (maxA + Math.sqrt(maxA * maxA + 1.5 * H));
  const panels = Math.max(1, Math.ceil(width / (2 * maxHalfWidth)));
  if (panels > maxPanels) throw new RangeError(`Gaussian chirp needs ${panels} panels; maxPanels=${maxPanels}`);
  const totals = new Float64Array(6);
  const compensation = new Float64Array(6);
  const truncation = [0, 0, 0];
  const roundoff = [0, 0, 0];
  let coefficients = 0;
  for (let panel = 0; panel < panels; panel++) {
    const h = width / (2 * panels);
    const c = lo + width * ((panel + 0.5) / panels);
    if (!(h > 0)) throw new RangeError('panel endpoints are unresolved in binary64');
    const ar = -c * h, ai = (B + Q * c) * h;
    const gr = -h * h / 2, gi = Q * h * h / 2;
    const alpha = Math.hypot(ar, ai), gamma = Math.hypot(gr, gi);
    const prefactor = h * Math.exp(-c * c / 2) / SQRT_TAU;
    const radius = Math.abs(c) + h;
    const logEnvelope = 2 * alpha + 4 * gamma;
    // On |z|=2, |exp(alpha*z+gamma*z^2)| <= exp(2|alpha|+4|gamma|).
    // Cauchy => sum_{n>N}|d_n| <= exp(logEnvelope) * 2^-N on [-1,1].
    const largestMoment = Math.max(1, radius * radius);
    const N = Math.max(12, Math.ceil((Math.log(16 * panels) + Math.log(prefactor) + Math.log(largestMoment)
      + logEnvelope - Math.log(absTol)) / LOG2));
    if (!Number.isFinite(N) || N > 1074) throw new RangeError('series degree exceeds binary64 reference scope');
    coefficients += N + 1;
    const integrals = new Float64Array(6); // integrals of 1,x,x^2 times the series
    let prevR = 1, prevI = 0, prev2R = 0, prev2I = 0;
    for (let n = 0; n <= N; n++) {
      let dr = prevR, di = prevI;
      if (n > 0) {
        dr = (ar * prevR - ai * prevI + 2 * (gr * prev2R - gi * prev2I)) / n;
        di = (ar * prevI + ai * prevR + 2 * (gr * prev2I + gi * prev2R)) / n;
        prev2R = prevR; prev2I = prevI; prevR = dr; prevI = di;
      }
      if (n % 2 === 0) {
        integrals[0] += 2 * dr / (n + 1); integrals[1] += 2 * di / (n + 1);
        integrals[4] += 2 * dr / (n + 3); integrals[5] += 2 * di / (n + 3);
      } else {
        integrals[2] += 2 * dr / (n + 2); integrals[3] += 2 * di / (n + 2);
      }
    }
    const phase = B * c + Q * c * c / 2;
    const cr = Math.cos(phase), ci = Math.sin(phase);
    for (let j = 0; j < 3; j++) {
      const r = j === 0 ? integrals[0] : j === 1 ? c * integrals[0] + h * integrals[2]
        : c * c * integrals[0] + 2 * c * h * integrals[2] + h * h * integrals[4];
      const i = j === 0 ? integrals[1] : j === 1 ? c * integrals[1] + h * integrals[3]
        : c * c * integrals[1] + 2 * c * h * integrals[3] + h * h * integrals[5];
      const parts = [prefactor * (r * cr - i * ci), prefactor * (r * ci + i * cr)];
      for (let k = 0; k < 2; k++) {
        const index = 2 * j + k;
        const y = parts[k] - compensation[index];
        const t = totals[index] + y;
        compensation[index] = (t - totals[index]) - y;
        totals[index] = t;
      }
      const massBound = 2 * prefactor * radius ** j;
      truncation[j] += massBound * Math.exp(logEnvelope - N * LOG2);
      // A deliberately separate engineering estimate, NOT a proved error bound.
      // Account for phase formation, coefficients, moment arithmetic and summing.
      roundoff[j] += 16 * EPS * (N + 8 + Math.abs(B * c) + Math.abs(Q * c * c / 2))
        * massBound * Math.exp(alpha + gamma);
    }
  }
  return finish([[totals[0], totals[1]], [totals[2], totals[3]], [totals[4], totals[5]]], tail, truncation, roundoff,
    { method: 'bounded-local-series', cutoff: L, panels, coefficients });
}
