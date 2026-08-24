const SQRT3 = Math.sqrt(3);
const HEX_Y = SQRT3 / 2;

export type LatticeKind = 0 | 1 | 2;

export function lineFamily(p: { x: number; y: number }, angle: number, pitch: number): number {
  const s = Math.abs(pitch) < 1e-4 ? 1e-4 : pitch;
  const proj = -p.x * Math.sin(angle) + p.y * Math.cos(angle);
  const q = proj / s;
  const f = q - Math.floor(q);
  return Math.min(f, 1 - f) * Math.abs(s);
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

function hexNorm(p: { x: number; y: number }): number {
  const x = Math.abs(p.x);
  const y = Math.abs(p.y);
  return Math.max(x, x * 0.5 + y * HEX_Y);
}

function squareHits(p: { x: number; y: number }, s: number): { edge: number; vertex: number } {
  const gx = p.x / s;
  const gy = p.y / s;
  const fx = gx - Math.floor(gx);
  const fy = gy - Math.floor(gy);
  const dx = Math.min(fx, 1 - fx) * s;
  const dy = Math.min(fy, 1 - fy) * s;
  return {
    edge: Math.min(dx, dy),
    vertex: Math.hypot(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) * s,
  };
}

function triangleHits(p: { x: number; y: number }, s: number): { edge: number; vertex: number } {
  const pitch = s * HEX_Y;
  const edge = Math.min(
    lineFamily(p, 0, pitch),
    lineFamily(p, Math.PI / 3, pitch),
    lineFamily(p, (2 * Math.PI) / 3, pitch)
  );
  const vv = p.y / (s * HEX_Y);
  const uu = (p.x - vv * (s * 0.5)) / s;
  const r = hexRound(uu, vv);
  const cx = r.u * s + r.v * s * 0.5;
  const cy = r.v * s * HEX_Y;
  return { edge, vertex: Math.hypot(p.x - cx, p.y - cy) };
}

function hexHits(p: { x: number; y: number }, s: number): { edge: number; vertex: number } {
  const h = s * SQRT3;
  const b = p.y / (1.5 * s);
  const a = (p.x - b * h * 0.5) / h;
  const r = hexRound(a, b);
  const cx = r.u * h + r.v * h * 0.5;
  const cy = r.v * 1.5 * s;
  const q = { x: p.x - cx, y: p.y - cy };
  const apothem = s * HEX_Y;
  const edge = Math.max(0, apothem - hexNorm(q));
  let vertex = Infinity;
  for (let k = 0; k < 6; k++) {
    const ang = Math.PI / 6 + (k * Math.PI) / 3;
    vertex = Math.min(vertex, Math.hypot(q.x - s * Math.cos(ang), q.y - s * Math.sin(ang)));
  }
  return { edge, vertex };
}

export function latticeHits(p: { x: number; y: number }, kind: number, spacing: number) {
  const s = Math.max(spacing, 1e-4);
  const k = Math.round(kind);
  if (k <= 0) return squareHits(p, s);
  if (k === 1) return hexHits(p, s);
  return triangleHits(p, s);
}

export function gridDistanceCpu(
  p: { x: number; y: number },
  kind: number,
  spacing: number,
  wantVertex: boolean
): number {
  const hits = latticeHits(p, kind, spacing);
  return wantVertex ? hits.vertex : hits.edge;
}
