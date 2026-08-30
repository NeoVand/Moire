/**
 * The periodic tilings, as one declarative catalogue.
 *
 * A tiling here is a lattice plus a decoration, which is exactly what the three
 * original grids already were — the square, triangular and hexagonal tilings
 * with their edges and vertices inked. What changes is that the decoration
 * stops being three hand-written distance functions and becomes data: each
 * tiling names its translation cell and the polygons that sit in it, and the
 * ink is the union of those polygon boundaries.
 *
 * That the ink is only the polygons' boundaries is not a simplification. Most
 * of the famous tilings are "pack one shape and the gaps become the others":
 * hexagons touching at their corners leave triangles (kagome), octagons on a
 * square lattice leave squares, dodecagons on a triangular lattice leave
 * triangles. So a catalogue entry lists the shapes it *packs*, and the tiling's
 * remaining faces appear for free, bounded by the same edges.
 *
 * Everything downstream is unchanged by construction: a tiling's members are
 * still indexed by a pair of integers, so the envelope still averages it over
 * its own cell, its two generator coordinates still join the character scan,
 * and a field still spends itself as a translation along the first generator.
 * A tiling is a lattice that knows more about where its ink is.
 *
 * Lengths here are in units of the tiling's edge, and the layer's `spacing` is
 * that edge length in world units — so a tiling at spacing 16 has 16-unit
 * edges whatever its symmetry, and swapping one tiling for another keeps the
 * scale of the drawing rather than the scale of some incidental cell.
 */

export interface TilingPolygon {
  /** Centre, in edge-length units. */
  cx: number;
  cy: number;
  /** Side count. */
  n: number;
  /** Circumradius, in edge-length units. */
  r: number;
  /** Angle of the first vertex, radians. */
  rot: number;
}

export interface TilingSpec {
  id: TilingId;
  label: string;
  /** The vertex configuration, for the gallery's hover name. */
  notation: string;
  /** Translation cell, in edge-length units. */
  a1: [number, number];
  a2: [number, number];
  /** The shapes this tiling packs; the remaining faces are the gaps. */
  polygons: TilingPolygon[];
  /**
   * Faces per cell the packed polygons do NOT cover, as `[sides, count]`
   * pairs. Only the area test reads this — it is the statement that makes a
   * catalogue entry checkable rather than merely plausible.
   */
  gaps: [sides: number, count: number][];
  /**
   * A tiling the renderer already draws with a closed form: selecting it from
   * the gallery sets that pattern type instead of `tiling-periodic`, so the
   * three regular lattices keep their fast paths and the catalogue still holds
   * the whole family. Their geometry lives here anyway — it is what draws the
   * gallery thumbnail, and what the catalogue tests check.
   */
  builtin?: 'grid-square' | 'grid-hex' | 'grid-triangle';
  /**
   * The largest circle that fits inside any face, in edge-length units — so
   * the farthest a point can sit from this tiling's ink. Derived from the
   * faces for a tiling made of regular polygons; stated only where it is not.
   */
  inradius?: number;
}

export type TilingId =
  | 'square'
  | 'triangular'
  | 'hexagonal'
  | 'kagome'
  | 'truncated-square'
  | 'truncated-hex'
  | 'rhombitrihex'
  | 'snub-square'
  | 'truncated-trihex'
  | 'snub-trihex'
  | 'elongated-triangular'
  | 'running-bond';

const SQRT3 = Math.sqrt(3);
const TAU = Math.PI * 2;
/** The snub square's cell side: sqrt(2 + sqrt(3)), which is 2 cos(15 degrees). */
const SNUB_SQUARE_PITCH = Math.sqrt(2 + SQRT3);

/** Circumradius of a regular n-gon with unit edge. */
export function polyRadius(n: number): number {
  return 1 / (2 * Math.sin(Math.PI / n));
}

/** Area of a regular n-gon with unit edge. */
export function polyArea(n: number): number {
  return n / (4 * Math.tan(Math.PI / n));
}

/**
 * Every catalogue entry, in the order the gallery shows them.
 *
 * The constructions, and why each one's packed set is the whole edge set:
 *
 * - Kagome: hexagons of unit edge whose centres are the triangular lattice of
 *   pitch 2. They meet corner to corner, and the gaps are the triangles.
 * - Truncated square: octagons on a square lattice of pitch 1 + sqrt(2), the
 *   octagon's own width across the flats, so neighbours meet edge to edge and
 *   the gaps are squares.
 * - Truncated hexagonal: dodecagons on a triangular lattice of pitch
 *   2 + sqrt(3), again the width across the flats; the gaps are triangles.
 * - Rhombitrihexagonal: hexagons on a triangular lattice of pitch 1 + sqrt(3)
 *   with a square bridging each adjacent pair; the gaps are triangles.
 * - Snub square: squares in two orientations, +-15 degrees off the axes, on a
 *   square lattice of pitch 1 + sqrt(3); the gaps are triangles.
 * - Elongated triangular: a row of squares under a row of triangles, the rows
 *   offset by half an edge.
 * - Running bond: the brick wall — 2x1 rectangles, each course offset by half
 *   a brick. Not uniform (its vertices are not all alike) but famous, and the
 *   one entry here whose faces are not regular polygons.
 */
export const TILINGS: TilingSpec[] = [
  {
    id: 'square',
    label: 'Square',
    notation: '4.4.4.4',
    builtin: 'grid-square',
    a1: [1, 0],
    a2: [0, 1],
    polygons: [{ cx: 0.5, cy: 0.5, n: 4, r: polyRadius(4), rot: Math.PI / 4 }],
    gaps: [],
  },
  {
    id: 'triangular',
    label: 'Triangular',
    notation: '3.3.3.3.3.3',
    builtin: 'grid-triangle',
    a1: [1, 0],
    a2: [0.5, SQRT3 / 2],
    polygons: [
      { cx: 0.5, cy: SQRT3 / 6, n: 3, r: 1 / SQRT3, rot: Math.PI / 2 },
      { cx: 1, cy: SQRT3 / 3, n: 3, r: 1 / SQRT3, rot: -Math.PI / 2 },
    ],
    gaps: [],
  },
  {
    id: 'hexagonal',
    label: 'Hexagonal',
    notation: '6.6.6',
    builtin: 'grid-hex',
    a1: [SQRT3, 0],
    a2: [SQRT3 / 2, 1.5],
    polygons: [{ cx: 0, cy: 0, n: 6, r: 1, rot: Math.PI / 6 }],
    gaps: [],
  },
  {
    id: 'kagome',
    label: 'Kagome',
    notation: '3.6.3.6',
    a1: [2, 0],
    a2: [1, SQRT3],
    polygons: [{ cx: 0, cy: 0, n: 6, r: 1, rot: 0 }],
    gaps: [[3, 2]],
  },
  {
    id: 'truncated-square',
    label: 'Truncated square',
    notation: '4.8.8',
    a1: [1 + Math.SQRT2, 0],
    a2: [0, 1 + Math.SQRT2],
    polygons: [{ cx: 0, cy: 0, n: 8, r: polyRadius(8), rot: Math.PI / 8 }],
    gaps: [[4, 1]],
  },
  {
    id: 'truncated-hex',
    label: 'Truncated hexagonal',
    notation: '3.12.12',
    a1: [2 + SQRT3, 0],
    a2: [(2 + SQRT3) / 2, ((2 + SQRT3) * SQRT3) / 2],
    polygons: [{ cx: 0, cy: 0, n: 12, r: polyRadius(12), rot: Math.PI / 12 }],
    gaps: [[3, 2]],
  },
  {
    id: 'rhombitrihex',
    label: 'Rhombitrihexagonal',
    notation: '3.4.6.4',
    a1: [1 + SQRT3, 0],
    a2: [(1 + SQRT3) / 2, ((1 + SQRT3) * SQRT3) / 2],
    polygons: [
      { cx: 0, cy: 0, n: 6, r: 1, rot: Math.PI / 6 },
      // A square bridging each of the three neighbour directions; the pair at
      // 180 degrees belongs to the neighbouring cell, so three per cell.
      ...[0, 1, 2].map((k) => {
        const ang = (k * Math.PI) / 3;
        const d = (1 + SQRT3) / 2;
        return {
          cx: d * Math.cos(ang),
          cy: d * Math.sin(ang),
          n: 4,
          r: polyRadius(4),
          rot: ang + Math.PI / 4,
        };
      }),
    ],
    gaps: [[3, 2]],
  },
  {
    id: 'snub-square',
    label: 'Snub square',
    notation: '3.3.4.3.4',
    // Two squares and four triangles per cell, so the cell is 2 + sqrt(3)
    // and its side 2 cos(15 degrees) — not 1 + sqrt(3), which is the pitch of
    // squares separated BY a triangle edge and describes a cell twice as big.
    a1: [SNUB_SQUARE_PITCH, 0],
    a2: [0, SNUB_SQUARE_PITCH],
    polygons: [
      { cx: 0, cy: 0, n: 4, r: polyRadius(4), rot: Math.PI / 4 + Math.PI / 12 },
      {
        cx: SNUB_SQUARE_PITCH / 2,
        cy: SNUB_SQUARE_PITCH / 2,
        n: 4,
        r: polyRadius(4),
        rot: Math.PI / 4 - Math.PI / 12,
      },
    ],
    gaps: [[3, 4]],
  },
  {
    id: 'truncated-trihex',
    label: 'Truncated trihexagonal',
    notation: '4.6.12',
    // Dodecagons on a triangular lattice with a square bridging each adjacent
    // pair; the gaps are the hexagons. Pitch is the dodecagon's width across
    // the flats plus one square: (2 + sqrt(3)) + 1.
    a1: [3 + SQRT3, 0],
    a2: [(3 + SQRT3) / 2, ((3 + SQRT3) * SQRT3) / 2],
    polygons: [
      { cx: 0, cy: 0, n: 12, r: polyRadius(12), rot: Math.PI / 12 },
      ...[0, 1, 2].map((k) => {
        const ang = (k * Math.PI) / 3;
        const d = (3 + SQRT3) / 2;
        return {
          cx: d * Math.cos(ang),
          cy: d * Math.sin(ang),
          n: 4,
          r: polyRadius(4),
          rot: ang + Math.PI / 4,
        };
      }),
    ],
    gaps: [[6, 2]],
  },
  {
    id: 'snub-trihex',
    label: 'Snub trihexagonal',
    notation: '3.3.3.3.6',
    // The chiral one: hexagon centres on a triangular lattice of pitch sqrt(7)
    // — the lattice vector is 2u + v in the hexagon's own basis, which sits
    // atan(sqrt(3)/5) = 19.1 degrees off it — with eight triangles per cell
    // filling the rest.
    a1: [Math.sqrt(7), 0],
    a2: [Math.sqrt(7) / 2, (Math.sqrt(7) * SQRT3) / 2],
    polygons: [{ cx: 0, cy: 0, n: 6, r: 1, rot: -Math.atan2(SQRT3, 5) }],
    gaps: [[3, 8]],
  },
  {
    id: 'elongated-triangular',
    label: 'Elongated triangular',
    notation: '3.3.3.4.4',
    a1: [1, 0],
    a2: [0.5, 1 + SQRT3 / 2],
    polygons: [{ cx: 0.5, cy: 0.5, n: 4, r: polyRadius(4), rot: Math.PI / 4 }],
    gaps: [[3, 2]],
  },
  {
    id: 'running-bond',
    label: 'Running bond',
    notation: 'brick',
    a1: [2, 0],
    a2: [1, 1],
    polygons: [],
    gaps: [],
    // A 2x1 brick's incircle.
    inradius: 0.5,
  },
];

export const TILING_IDS = TILINGS.map((t) => t.id);

export function tilingSpec(id: TilingId): TilingSpec {
  return TILINGS.find((t) => t.id === id) ?? TILINGS[0];
}

/** The catalogue index a layer stores, and its inverse. */
export function tilingIndex(id: TilingId): number {
  const i = TILINGS.findIndex((t) => t.id === id);
  return i < 0 ? 0 : i;
}

export function tilingAt(index: number): TilingSpec {
  const i = Math.round(index);
  return TILINGS[i >= 0 && i < TILINGS.length ? i : 0];
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The polygon's corners, in edge-length units. */
function corners(poly: TilingPolygon): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < poly.n; k++) {
    const a = poly.rot + (k * TAU) / poly.n;
    out.push([poly.cx + poly.r * Math.cos(a), poly.cy + poly.r * Math.sin(a)]);
  }
  return out;
}

/**
 * One cell's polygon corners, plus any edges a tiling states outright.
 *
 * The corners are the whole story for a uniform tiling: every edge has unit
 * length and joins two of them, so the edge set is recovered below as the
 * unit-distance pairs. Packing the polygons and taking their boundaries is NOT
 * enough — in the snub tilings two triangles meet along an edge that bounds no
 * packed shape, and those edges would simply be absent (nine of the fifteen per
 * cell in the snub trihexagonal). The vertices know about them; the faces do not.
 */
function baseCorners(spec: TilingSpec): { verts: [number, number][]; segs: Segment[] } {
  const verts: [number, number][] = [];
  for (const poly of spec.polygons) {
    for (const c of corners(poly)) verts.push(c);
  }
  const segs: Segment[] = [];
  if (spec.id === 'running-bond') {
    // The brick wall is the one entry whose edges are not all unit length —
    // a course runs on past the joints — so it states its edges directly.
    segs.push({ x1: 0, y1: 0, x2: 2, y2: 0 });
    segs.push({ x1: 0, y1: 0, x2: 0, y2: 1 });
    verts.push([0, 0]);
  }
  return { verts, segs };
}

/**
 * Vertices are snapped to this grid before anything compares them. Corners
 * come out of cos/sin, so the same lattice vertex reached from two different
 * cells differs in the last bits — enough that an exact comparison sees two
 * points, and enough that a segment's canonical ordering can flip between
 * copies and defeat the dedup.
 */
const SNAP = 1e6;
const snap = (v: number) => Math.round(v * SNAP) / SNAP;

/**
 * The edges of a unit-edge tiling: every pair of vertices exactly one edge
 * apart. Non-adjacent vertices in these tilings are never at unit distance —
 * a square's diagonal is sqrt(2), a hexagon's short diagonal sqrt(3) — so the
 * pairs are exactly the edges, which the edge-count test checks outright.
 */
function unitEdges(verts: [number, number][]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      const dx = verts[j][0] - verts[i][0];
      const dy = verts[j][1] - verts[i][1];
      if (Math.abs(Math.hypot(dx, dy) - 1) > 1e-6) continue;
      out.push({ x1: verts[i][0], y1: verts[i][1], x2: verts[j][0], y2: verts[j][1] });
    }
  }
  return out;
}

/** Replicate a cell's corners over `reach` cells each way, deduped. */
function spreadCorners(spec: TilingSpec, reach: number, keep: number): [number, number][] {
  const { verts } = baseCorners(spec);
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const dx = i * spec.a1[0] + j * spec.a2[0];
      const dy = i * spec.a1[1] + j * spec.a2[1];
      for (const [vx, vy] of verts) {
        const x = snap(vx + dx);
        const y = snap(vy + dy);
        if (!nearCell({ x1: x, y1: y, x2: x, y2: y }, spec.a1, spec.a2, keep)) continue;
        const k = `${x},${y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push([x, y]);
      }
    }
  }
  return out;
}

/**
 * How far outside the cell a copy has to be kept.
 *
 * A tiling covers the plane with edges, so no point is further than about one
 * edge from one; a point folded into the cell can therefore never be nearer to
 * an edge outside this margin than to one inside it. Keeping the margin small
 * is what lets the shader skip a neighbourhood loop entirely and just walk a
 * flat list.
 */
const KEEP_MARGIN = 1.6;

function nearCell(
  seg: Segment,
  a1: [number, number],
  a2: [number, number],
  margin: number = KEEP_MARGIN
): boolean {
  const cx = [0, a1[0], a2[0], a1[0] + a2[0]];
  const cy = [0, a1[1], a2[1], a1[1] + a2[1]];
  const loX = Math.min(...cx) - margin;
  const hiX = Math.max(...cx) + margin;
  const loY = Math.min(...cy) - margin;
  const hiY = Math.max(...cy) + margin;
  const sLoX = Math.min(seg.x1, seg.x2);
  const sHiX = Math.max(seg.x1, seg.x2);
  const sLoY = Math.min(seg.y1, seg.y2);
  const sHiY = Math.max(seg.y1, seg.y2);
  return sLoX <= hiX && sHiX >= loX && sLoY <= hiY && sHiY >= loY;
}

export interface TilingGeometry {
  /** Flat list of segments, `[x1, y1, x2, y2]` each, in edge-length units. */
  segments: Float32Array;
  /** Flat list of vertices, `[x, y]` each. */
  vertices: Float32Array;
  a1: [number, number];
  a2: [number, number];
}

const geometryCache = new Map<TilingId, TilingGeometry>();

/**
 * The tiling's ink, folded to a flat list that covers a cell and everything
 * within reach of it — so a point folded into the cell needs no neighbourhood
 * search, only a walk.
 *
 * The CPU mirror and the shader read the SAME list: the table is built here
 * and written into uniforms, so the two cannot drift the way two hand-written
 * distance functions can.
 */
export function tilingGeometry(id: TilingId): TilingGeometry {
  const hit = geometryCache.get(id);
  if (hit) return hit;

  const spec = tilingSpec(id);
  const span = Math.max(Math.hypot(...spec.a1), Math.hypot(...spec.a2));
  const reach = Math.ceil((KEEP_MARGIN + 2) / Math.max(span, 0.2)) + 2;
  // Vertices are gathered a whole edge further out than segments are kept, so
  // an edge leaving the kept band still finds its far endpoint.
  const wide = spreadCorners(spec, reach, KEEP_MARGIN + 1.2);
  const segs = unitEdges(wide);

  // The edges a tiling states outright (the brick's courses), replicated.
  const { segs: stated } = baseCorners(spec);
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const dx = i * spec.a1[0] + j * spec.a2[0];
      const dy = i * spec.a1[1] + j * spec.a2[1];
      for (const t of stated) {
        segs.push({ x1: t.x1 + dx, y1: t.y1 + dy, x2: t.x2 + dx, y2: t.y2 + dy });
      }
    }
  }

  const outSegs: number[] = [];
  const outVerts: number[] = [];
  const seenSeg = new Set<string>();
  const end = (x: number, y: number) => `${snap(x)},${snap(y)}`;
  for (const m of segs) {
    if (!nearCell(m, spec.a1, spec.a2)) continue;
    const a = end(m.x1, m.y1);
    const b = end(m.x2, m.y2);
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenSeg.has(k)) continue;
    seenSeg.add(k);
    outSegs.push(m.x1, m.y1, m.x2, m.y2);
  }
  for (const [x, y] of wide) {
    if (!nearCell({ x1: x, y1: y, x2: x, y2: y }, spec.a1, spec.a2)) continue;
    outVerts.push(x, y);
  }

  const geo: TilingGeometry = {
    segments: new Float32Array(outSegs),
    vertices: new Float32Array(outVerts),
    a1: spec.a1,
    a2: spec.a2,
  };
  geometryCache.set(id, geo);
  return geo;
}

/**
 * Edges per cell, counted from the generated geometry by taking the segments
 * whose midpoint falls in the fundamental domain. The check the catalogue
 * needs: a face-based construction can miss the edges that bound no packed
 * face, and those tilings still look entirely plausible.
 */
export function vertexDegrees(id: TilingId): number[] {
  const spec = tilingSpec(id);
  const geo = tilingGeometry(id);
  const verts: [number, number][] = [];
  for (let i = 0; i < geo.vertices.length; i += 2) {
    verts.push([geo.vertices[i], geo.vertices[i + 1]]);
  }
  // Only vertices with a full edge of clearance inside the generated band can
  // see all their neighbours; the rest are the band's own boundary, not the
  // tiling's.
  // A vertex needs a whole edge of clearance inside the kept band before all
  // of its neighbours are guaranteed present; nearer the rim the missing
  // neighbours are the band's edge, not the tiling's.
  const out: number[] = [];
  for (const [x, y] of verts) {
    if (!nearCell({ x1: x, y1: y, x2: x, y2: y }, spec.a1, spec.a2, KEEP_MARGIN - 1.05)) {
      continue;
    }
    let deg = 0;
    for (const [ox, oy] of verts) {
      if (Math.abs(Math.hypot(ox - x, oy - y) - 1) < 1e-6) deg += 1;
    }
    out.push(deg);
  }
  return out;
}

export interface TilingRange {
  segStart: number;
  segCount: number;
  vertStart: number;
  vertCount: number;
  /** The translation cell, in edge-length units. */
  a1: [number, number];
  a2: [number, number];
}

export interface TilingTable {
  /** Every catalogue segment, concatenated: `[x1, y1, x2, y2]` each. */
  segments: Float32Array;
  /** Every catalogue vertex, concatenated: `[x, y]` each. */
  vertices: Float32Array;
  /** Where each catalogue entry's run begins, by catalogue index. */
  ranges: TilingRange[];
}

let tableCache: TilingTable | null = null;

/**
 * The whole catalogue as one flat table, for the shader's uniform arrays.
 *
 * The table is static — the catalogue is fixed at build time — so it is built
 * once and never rewritten. Switching tilings moves two integers in a layer's
 * slot, which is why the gallery can be clicked through as fast as the mouse
 * moves: no pipeline rebuild, no buffer upload, nothing but a start and a
 * count. And because the shader reads the same numbers `tilingHits` walks,
 * the CPU mirror cannot drift from what the GPU draws.
 */
export function tilingTable(): TilingTable {
  if (tableCache) return tableCache;
  const segments: number[] = [];
  const vertices: number[] = [];
  const ranges: TilingRange[] = [];
  for (const spec of TILINGS) {
    const geo = tilingGeometry(spec.id);
    ranges.push({
      segStart: segments.length / 4,
      segCount: geo.segments.length / 4,
      vertStart: vertices.length / 2,
      vertCount: geo.vertices.length / 2,
      a1: spec.a1,
      a2: spec.a2,
    });
    segments.push(...geo.segments);
    vertices.push(...geo.vertices);
  }
  tableCache = {
    segments: new Float32Array(segments),
    vertices: new Float32Array(vertices),
    ranges,
  };
  return tableCache;
}

/**
 * A square patch of the tiling, for a gallery thumbnail: the same segments the
 * shader walks, translated over enough cells to fill `[-h, h]^2` in edge units
 * and clipped to it. Drawing the thumbnail from the catalogue rather than from
 * a picture is what keeps the gallery honest — a thumbnail cannot show a
 * tiling the layer would not draw.
 */
export function tilingPatch(id: TilingId, h: number): Segment[] {
  const spec = tilingSpec(id);
  const span = Math.max(Math.hypot(...spec.a1), Math.hypot(...spec.a2));
  const reach = Math.ceil((h + 2) / Math.max(span, 0.2)) + 2;
  const verts: [number, number][] = [];
  const { verts: base, segs: stated } = baseCorners(spec);
  const segs: Segment[] = [];
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const dx = i * spec.a1[0] + j * spec.a2[0];
      const dy = i * spec.a1[1] + j * spec.a2[1];
      for (const [vx, vy] of base) {
        const x = vx + dx;
        const y = vy + dy;
        if (x < -h - 1.2 || x > h + 1.2 || y < -h - 1.2 || y > h + 1.2) continue;
        verts.push([x, y]);
      }
      for (const t of stated) {
        segs.push({ x1: t.x1 + dx, y1: t.y1 + dy, x2: t.x2 + dx, y2: t.y2 + dy });
      }
    }
  }
  segs.push(...unitEdges(verts));
  const inBox = (x: number, y: number) => x >= -h && x <= h && y >= -h && y <= h;
  return segs.filter(
    (m) =>
      inBox(m.x1, m.y1) ||
      inBox(m.x2, m.y2) ||
      (Math.min(m.x1, m.x2) < h &&
        Math.max(m.x1, m.x2) > -h &&
        Math.min(m.y1, m.y2) < h &&
        Math.max(m.y1, m.y2) > -h)
  );
}

/** Distance from `p` to a segment, both in layer coordinates, measured in world. */
function segmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sx: number,
  sy: number
): number {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 1e-12 ? ((px - x1) * ex + (py - y1) * ey) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (x1 + t * ex);
  const dy = py - (y1 + t * ey);
  // The stretch lives in world space, so the difference is scaled, not the
  // point: an anisotropic layer stretches its ink, not its parameterisation.
  return Math.hypot(dx * sx, dy * sy);
}

/**
 * Fold a layer-space point into the tiling's cell.
 *
 * The cell is a parallelogram, so the fold is the fractional part in the
 * generator basis — the same coordinates the character scan reads.
 */
export function foldToCell(
  px: number,
  py: number,
  a1: [number, number],
  a2: [number, number],
  spacing: number
): { x: number; y: number } {
  const ax = a1[0] * spacing;
  const ay = a1[1] * spacing;
  const bx = a2[0] * spacing;
  const by = a2[1] * spacing;
  const det = ax * by - ay * bx;
  const d = Math.abs(det) < 1e-9 ? 1e-9 : det;
  const u = (px * by - py * bx) / d;
  const v = (ax * py - ay * px) / d;
  const fu = u - Math.floor(u);
  const fv = v - Math.floor(v);
  return { x: fu * ax + fv * bx, y: fu * ay + fv * by };
}

/**
 * A tiling's edge and vertex distance at a point, in world units. The CPU twin
 * of `tilingDistance` in lattice.wgsl.ts — and the source the shader's uniform
 * table is built from, so the two share their geometry rather than mirror it.
 */
export function tilingHits(
  p: { x: number; y: number },
  id: TilingId,
  spacing: number,
  scaleX = 1,
  scaleY = 1
): { edge: number; vertex: number } {
  const s = Math.max(spacing, 1e-4);
  const sx = Math.abs(scaleX) < 1e-4 ? 1e-4 : scaleX;
  const sy = Math.abs(scaleY) < 1e-4 ? 1e-4 : scaleY;
  const geo = tilingGeometry(id);
  // Layer space, unstretched: the ink is defined there and the stretch is
  // applied when the distance is measured.
  const q = foldToCell(p.x / sx, p.y / sy, geo.a1, geo.a2, s);

  let edge = Infinity;
  for (let i = 0; i < geo.segments.length; i += 4) {
    edge = Math.min(
      edge,
      segmentDistance(
        q.x,
        q.y,
        geo.segments[i] * s,
        geo.segments[i + 1] * s,
        geo.segments[i + 2] * s,
        geo.segments[i + 3] * s,
        sx,
        sy
      )
    );
  }
  let vertex = Infinity;
  for (let i = 0; i < geo.vertices.length; i += 2) {
    const dx = q.x - geo.vertices[i] * s;
    const dy = q.y - geo.vertices[i + 1] * s;
    vertex = Math.min(vertex, Math.hypot(dx * sx, dy * sy));
  }
  return { edge, vertex };
}
