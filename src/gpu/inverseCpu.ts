/**
 * CPU mirror of the WGSL inverse. Used to lock the math:
 * no maxRings, closed-form where it exists, Newton otherwise.
 *
 * Rotation makes the nearest ring index wander away from |p|/spacing —
 * far from the origin a 45° square family lives near |p|/(s√2), not |p|/s.
 * Seeds must cover those orientation families or whole sides vanish.
 */

export type ShapeKind = 1 | 2 | 3 | 4;

const EPS = 1e-6;
const TAU = Math.PI * 2;

function rotate2d(p: { x: number; y: number }, a: number) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

function perp(v: { x: number; y: number }) {
  return { x: -v.y, y: v.x };
}

function length2(v: { x: number; y: number }) {
  return Math.hypot(v.x, v.y);
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

function wrapToHalf(ang: number, seg: number): number {
  const half = seg * 0.5;
  let a = ((ang + half) % seg) - half;
  if (a < -half) a += seg;
  if (a > half) a -= seg;
  return a;
}

export function shapeRadius(
  q: { x: number; y: number },
  shape: ShapeKind,
  sides: number
): number {
  if (shape <= 1) return length2(q);
  if (shape === 2) return Math.max(Math.abs(q.x), Math.abs(q.y));
  const n = shape === 3 ? 3 : Math.max(3, sides);
  const ang = Math.atan2(q.y, q.x);
  const seg = TAU / n;
  return length2(q) * Math.cos(wrapToHalf(ang, seg));
}

export function shapeGrad(
  q: { x: number; y: number },
  shape: ShapeKind,
  sides: number
): { x: number; y: number } {
  const r = length2(q);
  if (r < EPS) return { x: 1, y: 0 };
  if (shape <= 1) return { x: q.x / r, y: q.y / r };
  if (shape === 2) {
    if (Math.abs(q.x) > Math.abs(q.y)) return { x: Math.sign(q.x), y: 0 };
    return { x: 0, y: Math.sign(q.y) };
  }
  const n = shape === 3 ? 3 : Math.max(3, sides);
  const ang = Math.atan2(q.y, q.x);
  const seg = TAU / n;
  const nrm = ang - wrapToHalf(ang, seg);
  return { x: Math.cos(nrm), y: Math.sin(nrm) };
}

function shapeSideCount(shape: ShapeKind, sides: number): number {
  if (shape <= 1) return 0;
  if (shape === 2) return 4;
  if (shape === 3) return 3;
  return Math.max(3, Math.round(sides));
}

function evalRing(
  p: { x: number; y: number },
  n: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  if (n < 0) return 1e6;
  const radius = n * spacing + phase;
  if (radius < 0) return 1e6;
  const center = rotate2d({ x: offset.x * n, y: offset.y * n }, n * theta);
  const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -n * theta);
  return Math.abs(shapeRadius(q, shape, sides) - radius);
}

function checkWindow(
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  half: number
): number {
  const n0 = Math.floor(t);
  const h = Math.min(16, Math.max(0, Math.round(half)));
  let d = 1e6;
  for (let k = -h; k <= h; k++) {
    d = Math.min(d, evalRing(p, n0 + k, offset, theta, spacing, phase, shape, sides));
  }
  return d;
}

function periodicDist(value: number, spacing: number): number {
  const s = Math.abs(spacing);
  if (s < 1e-8) return Math.abs(value);
  const q = value / s;
  const f = q - Math.floor(q);
  return Math.min(f, 1 - f) * s;
}

export function centeredMod(r: number, spacing: number, phase: number): number {
  const adj = r - phase;
  if (adj < 0) return -adj;
  return periodicDist(adj, spacing);
}

function consider(
  d: number,
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number,
  half: number
): number {
  if (!Number.isFinite(t)) return d;
  return Math.min(d, checkWindow(p, t, offset, theta, spacing, phase, shape, sides, half));
}

export function circleQuadratic(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind = 1,
  sides = 3
): number {
  const r = length2(p);
  const scale = Math.max(r, 1);
  const A = dot(offset, offset) - spacing * spacing;
  const B = -2 * (dot(p, offset) + spacing * phase);
  const C = r * r - phase * phase;
  const guess = Math.max(0, (r - phase) / Math.max(spacing, 1e-5));
  let d = checkWindow(p, guess, offset, 0, spacing, phase, shape, sides, 3);

  if (Math.abs(A) < 1e-8) {
    if (Math.abs(B) > 1e-8) {
      d = consider(d, p, -C / B, offset, 0, spacing, phase, shape, sides, 3);
    }
    return d;
  }

  const Bs = B / scale;
  const Cs = C / (scale * scale);
  const disc = Bs * Bs - 4 * A * Cs;
  if (disc >= 0) {
    const sd = Math.sqrt(disc);
    const q = -0.5 * (Bs + (Bs >= 0 ? sd : -sd));
    if (Math.abs(q) > 1e-12) {
      d = consider(d, p, (q / A) * scale, offset, 0, spacing, phase, shape, sides, 3);
      d = consider(d, p, (Cs / q) * scale, offset, 0, spacing, phase, shape, sides, 3);
    }
  }
  return d;
}

/** Closed-form L∞ candidates: σ (p_a − n δ_a) = n s + φ */
export function squareTranslated(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number
): number {
  const rInf = Math.max(Math.abs(p.x), Math.abs(p.y));
  let d = checkWindow(p, Math.max(0, (rInf - phase) / spacing), offset, 0, spacing, phase, 2, 4, 3);

  const tryAxis = (coord: number, delta: number) => {
    const plus = spacing + delta;
    if (Math.abs(plus) > 1e-6) {
      d = consider(d, p, (coord - phase) / plus, offset, 0, spacing, phase, 2, 4, 3);
    }
    const minus = spacing - delta;
    if (Math.abs(minus) > 1e-6) {
      d = consider(d, p, (-coord - phase) / minus, offset, 0, spacing, phase, 2, 4, 3);
    }
  };

  tryAxis(p.x, offset.x);
  tryAxis(p.y, offset.y);
  return d;
}

function newtonFrom(
  p: { x: number; y: number },
  t0: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  let t = Math.max(0, t0);
  for (let i = 0; i < 12; i++) {
    const center = rotate2d({ x: offset.x * t, y: offset.y * t }, t * theta);
    const q = rotate2d({ x: p.x - center.x, y: p.y - center.y }, -t * theta);
    const r = shapeRadius(q, shape, sides);
    const f = r - (t * spacing + phase);
    const deltaR = rotate2d(offset, t * theta);
    const centerP = {
      x: deltaR.x + t * theta * perp(deltaR).x,
      y: deltaR.y + t * theta * perp(deltaR).y,
    };
    const qpRot = rotate2d(centerP, -t * theta);
    const pq = perp(q);
    const qp = {
      x: -theta * pq.x - qpRot.x,
      y: -theta * pq.y - qpRot.y,
    };
    const g = shapeGrad(q, shape, sides);
    const fp = dot(g, qp) - spacing;
    if (Math.abs(fp) < 1e-6) break;
    let step = f / fp;
    step = Math.min(12, Math.max(-12, step));
    t = Math.max(0, t - step);
    if (Math.abs(step) < 1e-4) break;
  }
  return t;
}

export function ringDistanceCpu(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  const s = Math.max(spacing, 1e-4);
  const hasOff = dot(offset, offset) > 1e-8;
  const hasRot = Math.abs(theta) > 1e-8;

  if (!hasOff && !hasRot) {
    return centeredMod(shapeRadius(p, shape, sides), s, phase);
  }
  if (!hasRot) {
    if (shape === 2) return squareTranslated(p, offset, s, phase);
    if (shape <= 1) return circleQuadratic(p, offset, s, phase, shape, sides);
  }

  const r2 = length2(p);
  const rInf = Math.max(Math.abs(p.x), Math.abs(p.y));
  const rShape = shapeRadius(p, shape, sides);
  const tL2 = Math.max(0, (r2 - phase) / s);
  const tInf = Math.max(0, (rInf - phase) / s);
  const tShape = Math.max(0, (rShape - phase) / s);

  let d = 1e6;
  const polish = (t0: number) => {
    d = consider(d, p, newtonFrom(p, t0, offset, theta, s, phase, shape, sides), offset, theta, s, phase, shape, sides, 4);
    d = consider(d, p, t0, offset, theta, s, phase, shape, sides, 4);
  };

  polish(tL2);
  polish(tInf);
  polish(tShape);
  polish(tL2 * 0.35);
  polish(tL2 * 1.6 + 3);

  if (hasOff) {
    const inv = r2 > EPS ? 1 / r2 : 0;
    const rot = rotate2d(offset, tShape * theta);
    const den = s + p.x * inv * rot.x + p.y * inv * rot.y;
    if (Math.abs(den) > 1e-4) polish((r2 - phase) / den);
  }

  const nSides = shapeSideCount(shape, sides);
  const sidesForSpan = nSides >= 3 ? nSides : 4;
  const seg = TAU / sidesForSpan;
  const offLen = length2(offset);
  const radialMin = r2 * Math.cos(seg * 0.5);
  const nMin = Math.max(0, (radialMin - phase) / (s + offLen + 0.5));
  const nMax = Math.max(nMin + 1, (r2 - phase) / Math.max(s - offLen, 0.2) + 2);
  const span = nMax - nMin;
  if (hasRot || (hasOff && nSides >= 3)) {
    const samples = Math.min(32, Math.max(8, Math.ceil(span / 16)));
    const step = span / samples;
    const half = Math.min(16, Math.max(4, Math.ceil(step * 0.5 + 1)));
    for (let i = 0; i < samples; i++) {
      d = consider(d, p, nMin + (i + 0.5) * step, offset, theta, s, phase, shape, sides, half);
    }
  }

  if (d > s * 0.42) {
    d = consider(d, p, tShape, offset, theta, s, phase, shape, sides, 16);
    d = consider(d, p, tL2, offset, theta, s, phase, shape, sides, 16);
    d = consider(d, p, 0.5 * (nMin + nMax), offset, theta, s, phase, shape, sides, 16);
  }
  return d;
}

export function lineDistanceCpu(
  p: { x: number; y: number },
  angle: number,
  spacing: number,
  phase: number,
  progressive: number
): number {
  const dir = { x: Math.cos(angle), y: Math.sin(angle) };
  const proj = dot(p, dir) - phase;
  const pitch = spacing + progressive;
  const s = Math.abs(pitch) > 1e-4 ? pitch : spacing;
  return periodicDist(proj, s);
}
