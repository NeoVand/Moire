// Work per pixel and fidelity per pixel, for every solver generation, on one
// fixed set of scenes. Writes paper/data/cost.json plus a PNG and a cost map
// per (scene, solver) into paper/figures/.
//
//   node paper/tools/exp/cost.mjs

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, FIGURES, loadAllSolvers } from '../lib/instrument.mjs';
import { referenceSolver } from '../lib/reference.mjs';
import { costImage, costStats, imageDiff, render, scene } from '../lib/raster.mjs';
import { writePng } from '../lib/png.mjs';

const W = 384;
const H = 256;

/**
 * Scenes chosen to walk the difficulty ladder the UI can actually reach:
 * a centred rotation, a translated polygon, both together, an offset as large
 * as the spacing, and a deep zoom-out where the index window is widest.
 */
const SCENES = {
  'rot-tri': {
    label: 'Triangles, rotation offset 0.03',
    zoom: 0.5,
    layers: [{ shape: 'triangle', spacing: 12, thickness: 2, rotationOffset: 0.03 }],
  },
  'rot-hex-out': {
    label: 'Hexagons, rotation offset 0.02, zoomed out',
    zoom: 0.15,
    layers: [
      { shape: 'polygon', sides: 6, spacing: 10, thickness: 2, rotationOffset: 0.02 },
    ],
  },
  'off-tri': {
    label: 'Triangles, translation offset (3, 1)',
    zoom: 0.6,
    layers: [{ shape: 'triangle', spacing: 14, thickness: 2, offset: { x: 3, y: 1 } }],
  },
  'off-large': {
    label: 'Triangles, offset as large as the spacing',
    zoom: 0.4,
    layers: [{ shape: 'triangle', spacing: 12, thickness: 2, offset: { x: 10, y: 0 } }],
  },
  'rot-off-sq': {
    label: 'Squares, rotation 0.02 and offset (2, 2)',
    zoom: 0.4,
    layers: [
      { shape: 'square', spacing: 16, thickness: 2, rotationOffset: 0.02, offset: { x: 2, y: 2 } },
    ],
  },
  deep: {
    label: 'Triangles, rotation 0.008, offset (0.5, 0.5), zoom 0.1',
    zoom: 0.1,
    layers: [
      {
        shape: 'triangle',
        spacing: 30,
        thickness: 2,
        rotationOffset: 0.008,
        offset: { x: 0.5, y: 0.5 },
      },
    ],
  },
  interference: {
    label: 'Two rotated circle families with rotation offsets',
    zoom: 1,
    layers: [
      {
        shape: 'circle',
        spacing: 6,
        thickness: 3.5,
        position: { x: 20, y: 50 },
        rotation: 50,
        offset: { x: 0, y: -0.5 },
        rotationOffset: 0.02,
        color: '#000000',
      },
      {
        shape: 'circle',
        spacing: 6,
        thickness: 3.5,
        position: { x: 10, y: -20 },
        rotation: -5.8,
        offset: { x: 0, y: 0.5 },
        rotationOffset: -0.015,
        color: '#000000',
      },
    ],
  },
};

const solvers = await loadAllSolvers();
const all = { reference: referenceSolver(), ...solvers };
const results = {};

for (const [key, spec] of Object.entries(SCENES)) {
  const sc = scene({ width: W, height: H, zoom: spec.zoom, layers: spec.layers });
  const renders = {};
  for (const [name, solver] of Object.entries(all)) {
    solver.COUNT.metric = 0;
    solver.COUNT.grad = 0;
    const t0 = performance.now();
    const out = render(sc, solver);
    const ms = performance.now() - t0;
    renders[name] = out;
    const stats = costStats(out.cost);
    results[key] ??= { label: spec.label, zoom: spec.zoom, solvers: {} };
    results[key].solvers[name] = {
      ...stats,
      grad: solver.COUNT.grad,
      cpuMsPerMpixel: Math.round((ms / ((W * H) / 1e6)) * 10) / 10,
    };
    writePng(join(FIGURES, `cost-${key}-${name}.png`), out.rgb, W, H);
  }

  const hi = Math.max(
    ...Object.values(renders).map((r) => costStats(r.cost).p99),
    1
  );
  for (const [name, out] of Object.entries(renders)) {
    writePng(join(FIGURES, `costmap-${key}-${name}.png`), costImage(out.cost, W, H, hi), W, H);
    if (name !== 'reference') {
      results[key].solvers[name].diff = imageDiff(renders.reference.rgb, out.rgb);
    }
  }
  results[key].costMapCeiling = hi;

  const line = Object.entries(results[key].solvers)
    .map(([n, s]) => `${n} mean=${s.mean} p99=${s.p99}${s.diff ? ` diff=${s.diff.fractionDiffering}` : ''}`)
    .join('  |  ');
  console.log(`${key.padEnd(14)} ${line}`);
}

writeFileSync(join(DATA, 'cost.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nwrote ${join(DATA, 'cost.json')}`);
