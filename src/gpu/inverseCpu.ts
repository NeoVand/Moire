/**
 * CPU mirror of the WGSL inverse. Used to lock the math:
 * no maxRings, closed-form where it exists, Newton otherwise.
 */

export type ShapeKind = 1 | 2 | 3 | 4;

const EPS = 1e-6;

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

export function shapeRadius(
  q: { x: number; y: number },
  shape: ShapeKind,
  sides: number
): number {
  if (shape <= 1) return length2(q);
  if (shape === 2) return Math.max(Math.abs(q.x), Math.abs(q.y));
  const n = shape === 3 ? 3 : Math.max(3, sides);
  const ang = Math.atan2(q.y, q.x);
  const seg = (Math.PI * 2) / n;
  const half = seg * 0.5;
  let a = ((ang + half) % seg) - half;
  if (a < -half) a += seg;
  return length2(q) * Math.cos(a);
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
  const seg = (Math.PI * 2) / n;
  const half = seg * 0.5;
  let a = ((ang + half) % seg) - half;
  if (a < -half) a += seg;
  const nrm = ang - a;
  return { x: Math.cos(nrm), y: Math.sin(nrm) };
}

function ringCenter(n: number, offset: { x: number; y: number }, theta: number) {
  return rotate2d({ x: offset.x * n, y: offset.y * n }, n * theta);
}

function localQ(
  p: { x: number; y: number },
  n: number,
  offset: { x: number; y: number },
  theta: number
) {
  const c = ringCenter(n, offset, theta);
  return rotate2d({ x: p.x - c.x, y: p.y - c.y }, -n * theta);
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
  const q = localQ(p, n, offset, theta);
  return Math.abs(shapeRadius(q, shape, sides) - radius);
}

function checkNeighbors(
  p: { x: number; y: number },
  t: number,
  offset: { x: number; y: number },
  theta: number,
  spacing: number,
  phase: number,
  shape: ShapeKind,
  sides: number
): number {
  const n0 = Math.floor(t);
  let d = 1e6;
  for (let k = -2; k <= 3; k++) {
    d = Math.min(d, evalRing(p, n0 + k, offset, theta, spacing, phase, shape, sides));
  }
  return d;
}

function periodicDist(value: number, spacing: number): number {
  const t = value / spacing;
  const f = t - Math.floor(t + 0.5);
  return Math.abs(f) * spacing;
}

export function centeredMod(r: number, spacing: number, phase: number): number {
  const adj = r - phase;
  if (adj < 0) return -adj;
  return periodicDist(adj, spacing);
}

export function circleQuadratic(
  p: { x: number; y: number },
  offset: { x: number; y: number },
  spacing: number,
  phase: number,
  shape: ShapeKind = 1,
  sides = 3
): number {
  const A = dot(offset, offset) - spacing * spacing;
  const B = -2 * (dot(p, offset) + spacing * phase);
  const C = dot(p, p) - phase * phase;
  const guess = Math.max(0, (length2(p) - phase) / Math.max(spacing, 1e-5));
  let d = checkNeighbors(p, guess, offset, 0, spacing, phase, shape, sides);

  if (Math.abs(A) < 1e-6) {
    if (Math.abs(B) > 1e-6) {
      d = Math.min(d, checkNeighbors(p, -C / B, offset, 0, spacing, phase, shape, sides));
    }
    return d;
  }

  const disc = B * B - 4 * A * C;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    d = Math.min(d, checkNeighbors(p, (-B + s) / (2 * A), offset, 0, spacing, phase, shape, sides));
    d = Math.min(d, checkNeighbors(p, (-B - s) / (2 * A), offset, 0, spacing, phase, shape, sides));
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
  let d = checkNeighbors(p, Math.max(0, (rInf - phase) / spacing), offset, 0, spacing, phase, 2, 4);

  const tryAxis = (coord: number, delta: number) => {
    const plus = spacing + delta;
    if (Math.abs(plus) > 1e-6) {
      d = Math.min(d, checkNeighbors(p, (coord - phase) / plus, offset, 0, spacing, phase, 2, 4));
    }
    const minus = spacing - delta;
    if (Math.abs(minus) > 1e-6) {
      d = Math.min(d, checkNeighbors(p, (-coord - phase) / minus, offset, 0, spacing, phase, 2, 4));
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
  for (let i = 0; i < 8; i++) {
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
    step = Math.min(8, Math.max(-8, step));
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

  const t0 = Math.max(0, (length2(p) - phase) / s);
  let d = checkNeighbors(
    p,
    newtonFrom(p, t0, offset, theta, s, phase, shape, sides),
    offset,
    theta,
    s,
    phase,
    shape,
    sides
  );
  const tInf = Math.max(0, (Math.max(Math.abs(p.x), Math.abs(p.y)) - phase) / s);
  d = Math.min(
    d,
    checkNeighbors(p, newtonFrom(p, tInf, offset, theta, s, phase, shape, sides), offset, theta, s, phase, shape, sides),
    checkNeighbors(p, t0, offset, theta, s, phase, shape, sides),
    checkNeighbors(p, newtonFrom(p, t0 * 0.35, offset, theta, s, phase, shape, sides), offset, theta, s, phase, shape, sides),
    checkNeighbors(p, newtonFrom(p, t0 * 0.7, offset, theta, s, phase, shape, sides), offset, theta, s, phase, shape, sides),
    checkNeighbors(p, newtonFrom(p, t0 * 1.4 + 2, offset, theta, s, phase, shape, sides), offset, theta, s, phase, shape, sides),
    checkNeighbors(p, newtonFrom(p, t0 * 2 + 4, offset, theta, s, phase, shape, sides), offset, theta, s, phase, shape, sides)
  );
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
