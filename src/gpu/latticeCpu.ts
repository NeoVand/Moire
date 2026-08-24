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

function hexHits(
  p: { x: number; y: number },
  s: number,
  sx: number,
  sy: number
): { edge: number; vertex: number } {
  const pL = { x: p.x / sx, y: p.y / sy };
  const pitch = s * SQRT3;
  const edge = Math.min(
    worldLineFamily(pL, Math.PI / 6, pitch, sx, sy, 0.5),
    worldLineFamily(pL, Math.PI / 2, pitch, sx, sy, 0.5),
    worldLineFamily(pL, (5 * Math.PI) / 6, pitch, sx, sy, 0.5)
  );
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
  return { edge, vertex };
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
