import type { Homography } from './scene'

type RGB = [number, number, number]
export interface ReferenceOptions {
  samples?: number
  sigma?: number
  period?: number
  dark?: number
  light?: number
  sky?: RGB
  planeHalfExtent?: number
}
export interface ReferencePixel {
  status: 'ok' | 'unsupported'
  reason?: string
  linearRGB: RGB | null
  srgb: RGB | null
  ink: number | null
  /** Maximum RGB difference of two shifted sequences, in linear light. Not an error bound. */
  sequenceDifference: number | null
  samples: number
  pointInk: number | null
  horizonDistancePx: number
  elapsedMs: number
}

export function linearToSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

export function srgbToLinear(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function radicalInverse(n: number, base: number): number {
  let value = 0
  let weight = 1 / base
  while (n > 0) {
    value += (n % base) * weight
    n = Math.floor(n / base)
    weight /= base
  }
  return value
}

// The independent source reference in tests/compare/reference.mjs uses these
// same two random shifts. We cache offsets, never scene values or integrals.
function gaussianOffsets(count: number, sigma: number, seed: number): Float64Array {
  let state = seed >>> 0
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return (state + 0.5) / 4294967296
  }
  const shiftR = random(), shiftTheta = random()
  const offsets = new Float64Array(count * 2)
  for (let i = 0; i < count; i++) {
    const u = (radicalInverse(i + 1, 2) + shiftR) % 1
    const v = (radicalInverse(i + 1, 3) + shiftTheta) % 1
    const radius = sigma * Math.sqrt(-2 * Math.log(Math.max(u, Number.MIN_VALUE)))
    offsets[2 * i] = radius * Math.cos(2 * Math.PI * v)
    offsets[2 * i + 1] = radius * Math.sin(2 * Math.PI * v)
  }
  return offsets
}

let cached: { count: number; sigma: number; a: Float64Array; b: Float64Array } | null = null
function offsets(count: number, sigma: number) {
  if (!cached || cached.count !== count || cached.sigma !== sigma) {
    cached = {
      count, sigma,
      a: gaussianOffsets(count, sigma, 1701),
      b: gaussianOffsets(count, sigma, 2909),
    }
  }
  return cached
}

/**
 * Source-space Gaussian integration for one device-pixel CENTER (x,y).
 * Defaults mirror createBenchmarkScene; pass period=PERIOD/detail after edits.
 * This evaluates the exact rational homography and square-wave source, never
 * its Taylor jet, Fourier expansion, coverage approximation, or filtered texture.
 *
 * Two shifted low-discrepancy Gaussian sequences provide a convergence check,
 * not a confidence interval or certified bound. The Gaussian is untruncated.
 * A 6-sigma exclusion rejects horizon and finite-plane-edge inspection, where
 * this material-only comparison would also need filtered geometry coverage.
 */
export function referencePixel(h: Homography, x: number, y: number, options: ReferenceOptions = {}): ReferencePixel {
  const started = performance.now()
  const {
    samples = 65536, sigma = 0.5, period = 4, dark = 0.025, light = 0.82,
    sky = [0.105, 0.13, 0.16], planeHalfExtent = 50000,
  } = options
  if (!Number.isInteger(samples) || samples < 2 || samples > 262144 ||
      !(sigma > 0) || !(period > 0) || !(planeHalfExtent > 0) ||
      ![x, y, sigma, period, dark, light, planeHalfExtent, ...sky, ...h.u, ...h.v, ...h.d].every(Number.isFinite)) {
    throw new RangeError('Reference requires finite scene values and 2–262144 samples per sequence.')
  }
  const at = (a: Homography['u']) => a[0] * x + a[1] * y + a[2]
  const den = at(h.d), nu = at(h.u), nv = at(h.v)
  const denRate = Math.hypot(h.d[0], h.d[1])
  const horizonDistancePx = denRate === 0 ? Infinity : Math.abs(den) / denRate
  const u = nu / den, v = nv / den
  const pointInk = den < 0 ?
    0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * u)) * Math.sign(Math.sin(2 * Math.PI * v)) : null
  const reject = (reason: string): ReferencePixel => ({
    status: 'unsupported', reason, linearRGB: null, srgb: null, ink: null,
    sequenceDifference: null, samples: 0, pointInk, horizonDistancePx,
    elapsedMs: performance.now() - started,
  })
  const reach = 6 * sigma
  if (den === 0 || horizonDistancePx <= reach) {
    return reject('Choose a pixel farther from the horizon; this inspection compares material filtering.')
  }
  if (den < 0) {
    const denominatorMargin = 1 - reach * denRate / Math.abs(den)
    for (const [value, coefficients] of [[u, h.u], [v, h.v]] as const) {
      const gradient = Math.hypot(coefficients[0] - value * h.d[0], coefficients[1] - value * h.d[1]) / Math.abs(den)
      const excursion = reach * gradient / denominatorMargin
      if ((Math.abs(value) + excursion) * period >= planeHalfExtent) {
        return reject('Choose a pixel inside the ground plane; this inspection excludes its outer geometry edge.')
      }
    }
  }

  const integrate = (offset: Float64Array) => {
    let ground = 0, white = 0
    for (let i = 0; i < offset.length; i += 2) {
      const ox = offset[i], oy = offset[i + 1]
      const d = den + h.d[0] * ox + h.d[1] * oy
      if (d >= 0) continue
      const su = (nu + h.u[0] * ox + h.u[1] * oy) / d
      const sv = (nv + h.v[0] * ox + h.v[1] * oy) / d
      if (Math.abs(su * period) > planeHalfExtent || Math.abs(sv * period) > planeHalfExtent) continue
      ground++
      // Equal half-cell parity is exactly sign(sin(2pi*u))*sign(sin(2pi*v))
      // except on measure-zero boundaries. No high-frequency trig evaluation.
      if ((su - Math.floor(su) >= 0.5) === (sv - Math.floor(sv) >= 0.5)) white++
    }
    const groundValue = (dark * ground + (light - dark) * white) / samples
    const skyFraction = 1 - ground / samples
    return { rgb: sky.map(c => groundValue + c * skyFraction) as RGB, ink: white / samples, ground }
  }
  const sequence = offsets(samples, sigma)
  const a = integrate(sequence.a), b = integrate(sequence.b)
  const linearRGB = a.rgb.map((value, i) => (value + b.rgb[i]) * 0.5) as RGB
  return {
    status: 'ok', linearRGB, srgb: linearRGB.map(linearToSrgb) as RGB,
    ink: a.ground === samples && b.ground === samples ? (a.ink + b.ink) * 0.5 : null,
    sequenceDifference: Math.max(...a.rgb.map((value, i) => Math.abs(value - b.rgb[i]))),
    samples: samples * 2, pointInk, horizonDistancePx,
    elapsedMs: performance.now() - started,
  }
}
