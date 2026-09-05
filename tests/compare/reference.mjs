// Independent source integration. This samples the original ray/plane shader,
// never the spectral expansion or its Taylor model. The two shifted sequences
// are convergence diagnostics, not a deterministic bound on the true integral.
const TAU = 2 * Math.PI;

function radicalInverse(n, base) {
  let value = 0;
  let weight = 1 / base;
  while (n > 0) {
    value += (n % base) * weight;
    n = Math.floor(n / base);
    weight /= base;
  }
  return value;
}

function random(seed) {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return (x + 0.5) / 4294967296;
  };
}

export function gaussianOffsets(count = 65536, sigma = 0.5, seed = 1701) {
  if (!Number.isInteger(count) || count < 2 || !(sigma > 0)) {
    throw new RangeError('Expected at least two samples and a positive sigma.');
  }
  const rand = random(seed);
  const shiftR = rand();
  const shiftTheta = rand();
  const offsets = new Float64Array(count * 2);
  for (let i = 0; i < count; i++) {
    const u = (radicalInverse(i + 1, 2) + shiftR) % 1;
    const v = (radicalInverse(i + 1, 3) + shiftTheta) % 1;
    const radius = sigma * Math.sqrt(-2 * Math.log(Math.max(u, Number.MIN_VALUE)));
    offsets[2 * i] = radius * Math.cos(TAU * v);
    offsets[2 * i + 1] = radius * Math.sin(TAU * v);
  }
  return offsets;
}

export function integratePixel(sourceAt, x, y, offsets) {
  let sum = 0;
  let correction = 0;
  for (let i = 0; i < offsets.length; i += 2) {
    const sample = sourceAt(x + offsets[i], y + offsets[i + 1]);
    if (!Number.isFinite(sample)) throw new Error(`Nonfinite source sample at ${x},${y}.`);
    const corrected = sample - correction;
    const next = sum + corrected;
    correction = next - sum - corrected;
    sum = next;
  }
  return sum / (offsets.length / 2);
}

export function comparePixel(sourceAt, x, y, { samples = 65536, sigma = 0.5 } = {}) {
  const a = integratePixel(sourceAt, x, y, gaussianOffsets(samples, sigma, 1701));
  const b = integratePixel(sourceAt, x, y, gaussianOffsets(samples, sigma, 2909));
  return { mean: (a + b) / 2, sequenceDifference: Math.abs(a - b), samples: samples * 2 };
}
