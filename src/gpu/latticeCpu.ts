const SQRT3 = Math.sqrt(3);
const HEX_Y = SQRT3 / 2;

export type LatticeKind = 0 | 1 | 2;

function clampScale(n: number): number {
  return Math.abs(n) < 1e-4 ? 1e-4 : n;
}

export function lineFamily(p: { x: number; y: number }, angle: number, pitch: number): number {
  const s = Math.abs(pitch) < 1e-4 ? 1e-4 : pitch;
  const proj = -p.x * Math.sin(angle) + p.y * Math.cos(angle);
  const q = proj / s;
  const f = q - Math.floor(q);
  return Math.min(f, 1 - f) * Math.abs(s);
}

function worldLineFamily(
  p: { x: number; y: number },
  angle: number,
  pitch: number,
  sx: number,
  sy: number,
  phase = 0
): number {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const d = lineFamily({ x: p.x + nx * pitch * phase, y: p.y + ny * pitch * phase }, angle, pitch);
  return d / Math.max(Math.hypot(nx / sx, ny / sy), 1e-6);
}

export function hexRound(u: number, v: number): { u: number; v: number } {
  const x = u;
  const z = v;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xd = Math.abs(rx - x);
  const yd = Math.abs(ry - y);
  const zd = Math.abs(rz - z);
  if (xd > yd && xd > zd) rx = -ry - rz;
  else if (yd > zd) ry = -rx - rz;
  else rz = -rx - ry;
  return { u: rx, v: rz };
}

function squareHits(
  p: { x: number; y: number },
  s: number,
  sx: number,
  sy: number
): { edge: number; vertex: number } {
  const gx = p.x / (s * sx);
  const gy = p.y / (s * sy);
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);
  const dx = Math.min(fx, 1 - fx) * s * sx;
  const dy = Math.min(fy, 1 - fy) * s * sy;
  return {
    edge: Math.min(dx, dy),
    vertex: Math.hypot(dx, dy),
  };
}

function triangleHits(
  p: { x: number; y: number },
  s: number,
  sx: number,
  sy: number
): { edge: number; vertex: number } {
  const pL = { x: p.x / sx, y: p.y / sy };
  const pitch = s * HEX_Y;
  const edge = Math.min(
    worldLineFamily(pL, 0, pitch, sx, sy),
    worldLineFamily(pL, Math.PI / 3, pitch, sx, sy),
    worldLineFamily(pL, (2 * Math.PI) / 3, pitch, sx, sy)
  );
  const vv = pL.y / (s * HEX_Y);
  const uu = (pL.x - vv * (s * 0.5)) / s;
  const r = hexRound(uu, vv);
  const cx = r.u * s + r.v * s * 0.5;
  const cy = r.v * s * HEX_Y;
  return { edge, vertex: Math.hypot((pL.x - cx) * sx, (pL.y - cy) * sy) };
}

function hexEdgeWorld(
  q: { x: number; y: number },
  s: number,
  sx: number,
  sy: number
): number {
  const apothem = s * HEX_Y;
  let edge = Infinity;
  for (let k = 0; k < 6; k++) {
    const ang = (k * Math.PI) / 3;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const dLocal = apothem - (q.x * nx + q.y * ny);
    edge = Math.min(edge, dLocal / Math.max(Math.hypot(nx / sx, ny / sy), 1e-6));
  }
  return Math.max(edge, 0);
}

function hexHits(
  p: { x: number; y: number },
  s: number,
  sx: number,
  sy: number
): { edge: number; vertex: number } {
  const pL = { x: p.x / sx, y: p.y / sy };
  const h = s * SQRT3;
  const b = pL.y / (1.5 * s);
  const a = (pL.x - b * h * 0.5) / h;
  const r = hexRound(a, b);
  const cx = r.u * h + r.v * h * 0.5;
  const cy = r.v * 1.5 * s;
  const q = { x: pL.x - cx, y: pL.y - cy };
  let vertex = Infinity;
  for (let k = 0; k < 6; k++) {
    const ang = Math.PI / 6 + (k * Math.PI) / 3;
    vertex = Math.min(vertex, Math.hypot((q.x - s * Math.cos(ang)) * sx, (q.y - s * Math.sin(ang)) * sy));
  }
  return { edge: hexEdgeWorld(q, s, sx, sy), vertex };
}

export function latticeHits(
  p: { x: number; y: number },
  kind: number,
  spacing: number,
  scaleX = 1,
  scaleY = 1
) {
  const s = Math.max(spacing, 1e-4);
  const sx = clampScale(scaleX);
  const sy = clampScale(scaleY);
  const k = Math.round(kind);
  if (k <= 0) return squareHits(p, s, sx, sy);
  if (k === 1) return hexHits(p, s, sx, sy);
  return triangleHits(p, s, sx, sy);
}

export function gridDistanceCpu(
  p: { x: number; y: number },
  kind: number,
  spacing: number,
  wantVertex: boolean,
  scaleX = 1,
  scaleY = 1
): number {
  const hits = latticeHits(p, kind, spacing, scaleX, scaleY);
  return wantVertex ? hits.vertex : hits.edge;
}

/**
 * The two translations a lattice is invariant under, in world units.
 *
 * The other families here are level sets of a scalar phase, so the envelope can
 * average over the carrier by sliding a residual — one solve, no resampling. A
 * lattice has no such scalar: its members are indexed by a pair of integers, and
 * a honeycomb in particular is not a union of line families at all, so advancing
 * a "phase" would shrink every cell towards its own centre rather than slide the
 * pattern. What a lattice does have is this translation group, so the envelope
 * averages a lattice layer over its own unit cell instead. Lattice distance is a
 * closed-form cell lookup, so resampling it per tap is affordable in a way that
 * resampling the ring solver is not.
 */
export function latticeCell(
  kind: number,
  spacing: number,
  scaleX = 1,
  scaleY = 1
): { ax: number; ay: number; bx: number; by: number } {
  const s = Math.max(spacing, 1e-4);
  const sx = clampScale(scaleX);
  const sy = clampScale(scaleY);
  const k = Math.round(kind);
  if (k <= 0) return { ax: s * sx, ay: 0, bx: 0, by: s * sy };
  // Honeycomb cell centres sit on a triangular lattice of pitch √3·s.
  if (k === 1) {
    const h = s * SQRT3;
    return { ax: h * sx, ay: 0, bx: h * 0.5 * sx, by: 1.5 * s * sy };
  }
  return { ax: s * sx, ay: 0, bx: 0.5 * s * sx, by: s * HEX_Y * sy };
}
