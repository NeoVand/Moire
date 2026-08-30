import assert from 'node:assert/strict';
import {
  TILINGS,
  foldToCell,
  polyArea,
  tilingGeometry,
  tilingHits,
  vertexDegrees,
  type TilingSpec,
} from './tilings.ts';

/**
 * A tiling catalogue is the kind of data that is easy to get plausibly wrong:
 * an octagon lattice at the wrong pitch still looks like octagons, and a snub
 * square at the wrong twist still looks like squares and triangles. So the
 * entries are checked as tilings, not eyeballed as pictures — every claim
 * below fails loudly for a rotation or a pitch that is off by anything.
 */

function approx(actual: number, expected: number, tol = 1e-6, what = '') {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${what} expected ${expected}, got ${actual}`
  );
}

/** Inside a convex regular polygon: every edge's support is not exceeded. */
function inside(
  poly: { cx: number; cy: number; n: number; r: number; rot: number },
  x: number,
  y: number,
  slack: number
): boolean {
  const apothem = poly.r * Math.cos(Math.PI / poly.n);
  const dx = x - poly.cx;
  const dy = y - poly.cy;
  for (let k = 0; k < poly.n; k++) {
    const a = poly.rot + Math.PI / poly.n + (k * 2 * Math.PI) / poly.n;
    if (dx * Math.cos(a) + dy * Math.sin(a) > apothem - slack) return false;
  }
  return true;
}

function cellArea(spec: TilingSpec): number {
  return Math.abs(spec.a1[0] * spec.a2[1] - spec.a1[1] * spec.a2[0]);
}

for (const spec of TILINGS) {
  const geo = tilingGeometry(spec.id);
  const label = spec.label;

  // 1. Every packed polygon is regular with unit edges — the length the layer's
  //    `spacing` is denominated in, so tilings stay the same size as each other.
  for (const poly of spec.polygons) {
    const edge = 2 * poly.r * Math.sin(Math.PI / poly.n);
    approx(edge, 1, 1e-9, `${label}: packed ${poly.n}-gon edge`);
  }

  if (spec.polygons.length > 0) {
    // 2. Packed polygons never overlap. This is the test that fails when a
    //    lattice pitch is too small or a snub twist is wrong: the shapes would
    //    still be regular and still look right in a thumbnail, but they would
    //    be sitting on top of each other.
    let overlaps = 0;
    const A = cellArea(spec);
    const reach = Math.hypot(spec.a1[0] + spec.a2[0], spec.a1[1] + spec.a2[1]);
    for (let i = 0; i < 4000; i++) {
      // A deterministic low-discrepancy sweep of a patch around the cell.
      const u = ((i * 0.7548776662) % 1) * 2 - 0.5;
      const v = ((i * 0.5698402909) % 1) * 2 - 0.5;
      const x = u * spec.a1[0] + v * spec.a2[0];
      const y = u * spec.a1[1] + v * spec.a2[1];
      let covers = 0;
      for (let ci = -2; ci <= 2; ci++) {
        for (let cj = -2; cj <= 2; cj++) {
          const dx = ci * spec.a1[0] + cj * spec.a2[0];
          const dy = cj * spec.a2[1] + ci * spec.a1[1];
          for (const poly of spec.polygons) {
            if (inside(poly, x - dx, y - dy, 1e-7)) covers += 1;
          }
        }
      }
      if (covers > 1) overlaps += 1;
    }
    assert.equal(overlaps, 0, `${label}: packed polygons overlap`);
    assert.ok(reach > 0 && A > 0, `${label}: degenerate cell`);

    // 3. Area accounting: the packed shapes plus the gaps the entry declares
    //    fill the cell exactly. This is what pins the pitch — a lattice one
    //    percent too loose leaves area unaccounted for, and one too tight
    //    overshoots, whatever the picture looks like.
    const packed = spec.polygons.reduce((sum, p) => sum + polyArea(p.n), 0);
    const gaps = spec.gaps.reduce((sum, [sides, count]) => sum + count * polyArea(sides), 0);
    approx(packed + gaps, cellArea(spec), 1e-6, `${label}: cell area`);
  }

  // 3b. Every vertex has exactly as many edges as its configuration has faces.
  //     This is the check that catches an edge set built from packed faces
  //     alone: in the snub tilings two triangles meet along an edge that
  //     bounds no packed shape — nine of the fifteen per cell in the snub
  //     trihexagonal — and the picture still looks entirely plausible without
  //     them. Degree is local, so no cell-counting boundary can fudge it.
  if (spec.id !== 'running-bond') {
    const wantDeg = spec.notation.split('.').length;
    const degs = vertexDegrees(spec.id);
    assert.ok(degs.length > 0, `${label}: no interior vertex to check`);
    for (const d of degs) {
      assert.equal(d, wantDeg, `${label}: a vertex has ${d} edges, not ${wantDeg}`);
    }
  }

  // 4. The generated ink is periodic under BOTH generators — the property the
  //    envelope's cell average rests on, checked through the real distance
  //    function rather than asserted of the table.
  for (const [sx, sy] of [
    [1, 1],
    [1.7, 0.6],
  ] as const) {
    for (let i = 0; i < 120; i++) {
      const a = i * 0.9137;
      const rad = (i % 17) * 5;
      const p = { x: rad * Math.cos(a), y: rad * Math.sin(a) };
      const base = tilingHits(p, spec.id, 13, sx, sy);
      for (const [dx, dy] of [
        [spec.a1[0], spec.a1[1]],
        [spec.a2[0], spec.a2[1]],
        [-spec.a2[0], -spec.a2[1]],
        [spec.a1[0] + spec.a2[0], spec.a1[1] + spec.a2[1]],
      ]) {
        const moved = tilingHits(
          { x: p.x + dx * 13 * sx, y: p.y + dy * 13 * sy },
          spec.id,
          13,
          sx,
          sy
        );
        approx(moved.edge, base.edge, 1e-3, `${label}: edge not periodic`);
        approx(moved.vertex, base.vertex, 1e-3, `${label}: vertex not periodic`);
      }
    }
  }

  // 5. The ink is exactly as dense as the declared faces imply. The farthest a
  //    point can sit from a tiling's edges is the largest face's incircle, so
  //    this pins the ink from both sides at once: a segment list that lost its
  //    neighbour copies leaves points stranded in the corners and overshoots,
  //    and a list that gained a spurious edge cuts the big face and undershoots.
  const apothem = (n: number) => 1 / (2 * Math.tan(Math.PI / n));
  const faces = [
    ...spec.polygons.map((p) => apothem(p.n)),
    ...spec.gaps.map(([sides]) => apothem(sides)),
  ];
  const bound = faces.length ? Math.max(...faces) : (spec.inradius ?? 0.5);
  const SPACING = 10;
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const a = i * 1.7231;
    const rad = (i % 29) * 7 + (i % 7) * 0.37;
    const d = tilingHits({ x: rad * Math.cos(a), y: rad * Math.sin(a) }, spec.id, SPACING).edge;
    worst = Math.max(worst, d);
  }
  assert.ok(
    worst <= bound * SPACING * 1.001,
    `${label}: a point sat ${worst.toFixed(3)} from any edge, past the ` +
      `largest face's incircle ${(bound * SPACING).toFixed(3)}`
  );
  assert.ok(
    worst >= bound * SPACING * 0.8,
    `${label}: the largest face is missing — farthest point ${worst.toFixed(3)} ` +
      `but its incircle should reach ${(bound * SPACING).toFixed(3)}`
  );

  // 6. The fold really is the cell's fundamental domain.
  for (let i = 0; i < 60; i++) {
    const p = { x: i * 13.7 - 200, y: i * -9.3 + 140 };
    const q = foldToCell(p.x, p.y, geo.a1, geo.a2, 11);
    const back = foldToCell(q.x, q.y, geo.a1, geo.a2, 11);
    approx(back.x, q.x, 1e-4, `${label}: fold is not idempotent`);
    approx(back.y, q.y, 1e-4, `${label}: fold is not idempotent`);
  }

  console.log(
    `  ${spec.notation.padEnd(9)} ${label.padEnd(22)} ` +
      `${geo.segments.length / 4} segments, ${geo.vertices.length / 2} vertices` +
      (spec.id === 'running-bond' ? '' : `, degree ${spec.notation.split('.').length}`)
  );
}

console.log('tilings checks passed');
