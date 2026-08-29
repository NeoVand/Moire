// The pictures behind the fidelity numbers. Each case is rendered by the
// exhaustive reference and by the solvers under comparison, so a hole is visible
// as a hole rather than as a percentage.
//
//   node paper/tools/exp/artifacts.mjs

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ABLATIONS,
  BUDGET_PATCH,
  DATA,
  FIGURES,
  loadSolver,
} from '../lib/instrument.mjs';
import { referenceSolver } from '../lib/reference.mjs';
import { cropScale, dropMap, imageDiff, render, scene, worstWindow } from '../lib/raster.mjs';
import { writePng } from '../lib/png.mjs';

// Per-case inset geometry. A panel printed one column wide is about 250 pt across,
// so a crop only reads if its own pixels survive that reduction: the denser the
// field, the tighter the crop has to be.
const INSET = {
  holes: { w: 380, h: 254, scale: 2 },
  drift: { w: 200, h: 134, scale: 4 },
  anchor: { w: 200, h: 134, scale: 4 },
};

const sweep = await loadSolver('sweep');
const window1 = await loadSolver('window1');
const final = await loadSolver('final');
// Budget 64 instead of 1024, purely to force the strided fallback in a scene
// sparse enough to read. Both variants are the shipping solver with one edit.
const thinLattice = await loadSolver('final', BUDGET_PATCH(64), 'budget64-lattice');
const thinPixel = await loadSolver(
  'final',
  [...BUDGET_PATCH(64), ...ABLATIONS['pixel-anchored stride']],
  'budget64-pixel'
);

const CASES = {
  // A legible field where the fixed-sample sweep loses whole arcs. The drift
  // aims at a hexagon edge, so it is nearly a full spacing long while the
  // support ratio stays at rad(-delta)/s = 0.82 -- the regime where a fixed
  // window is not enough -- and the frame sits in the family's far field,
  // where the deviation is largest and the drawing is calm woven arcs. The
  // budget never binds, so this is a bound failure and not a truncation.
  holes: {
    label: 'Hexagons, spacing 16, offset (13.164,7.6), rotation offset 0.025, pan (1000,650), zoom 1',
    width: 1200,
    height: 800,
    zoom: 1,
    pan: { x: 1000, y: 650 },
    layers: [
      { shape: 'polygon', sides: 6, spacing: 16, thickness: 1.9, offset: { x: 13.164, y: 7.6 }, rotationOffset: 0.025 },
    ],
    solvers: { reference: referenceSolver(), sweep, final },
  },
  // Same solver family, but the drift bounded by |delta| instead of the support
  // function at -delta. The window is 100 wide; the loose bound calls it
  // unbounded and fabricates a pattern.
  drift: {
    label: 'Squares, spacing 4, offset (3,3), rotation offset 0.03, zoom 4',
    width: 1200,
    height: 800,
    zoom: 4,
    layers: [
      { shape: 'square', spacing: 4, thickness: 1, offset: { x: 3, y: 3 }, rotationOffset: 0.03 },
    ],
    solvers: { reference: referenceSolver(), window1, final },
  },
  // Budget forced to 64 so the stride engages while the field is still sparse.
  // Anchoring the lattice to the scene thins the family; anchoring it to the
  // pixel's own window breaks every ring.
  anchor: {
    label: 'Squares, spacing 12, offset (9.6,9.6), rotation 0.06, zoom 1, budget 64',
    width: 1200,
    height: 800,
    zoom: 1,
    layers: [
      { shape: 'square', spacing: 12, thickness: 1.5, offset: { x: 9.6, y: 9.6 }, rotationOffset: 0.06 },
    ],
    solvers: { reference: referenceSolver(), 'lattice-anchored': thinLattice, 'pixel-anchored': thinPixel },
  },
};

const out = {};
for (const [key, spec] of Object.entries(CASES)) {
  const sc = scene({
    width: spec.width,
    height: spec.height,
    zoom: spec.zoom,
    pan: spec.pan ?? { x: 0, y: 0 },
    layers: spec.layers,
  });
  const images = {};
  out[key] = { label: spec.label, zoom: spec.zoom, size: [spec.width, spec.height], solvers: {} };
  for (const [name, solver] of Object.entries(spec.solvers)) {
    solver.COUNT.metric = 0;
    const t0 = performance.now();
    const r = render(sc, solver);
    images[name] = r.rgb;
    writePng(join(FIGURES, `artifact-${key}-${name}.png`), r.rgb, spec.width, spec.height);
    let ink = 0;
    for (let i = 0; i < r.rgb.length; i += 3) if (r.rgb[i] < 128) ink += 1;
    out[key].solvers[name] = {
      ink: Math.round((ink / (spec.width * spec.height)) * 1000) / 1000,
      evalsPerPixel: Math.round(solver.COUNT.metric / (spec.width * spec.height)),
      seconds: Math.round((performance.now() - t0) / 100) / 10,
    };
  }
  const refName = Object.keys(spec.solvers)[0];
  const names = Object.keys(spec.solvers);
  for (const [name, rgb] of Object.entries(images)) {
    if (name === refName) continue;
    out[key].solvers[name].diff = imageDiff(images[refName], rgb);
    writePng(
      join(FIGURES, `artifact-${key}-${name}-drop.png`),
      dropMap(images[refName], rgb, spec.width, spec.height, 2),
      spec.width,
      spec.height
    );
  }

  // One inset box, shared by every panel, placed where the first non-reference
  // solver loses the most ink. Comparing crops of the same region is the only
  // way a 4% disagreement is visible on a printed page.
  const inset = INSET[key];
  const probe = images[names[1]];
  const hit = worstWindow(images[refName], probe, spec.width, spec.height, inset.w, inset.h);
  const box = { x: hit.x, y: hit.y, w: inset.w, h: inset.h };
  out[key].inset = box;
  for (const [name, rgb] of Object.entries(images)) {
    const c = cropScale(rgb, spec.width, spec.height, box, inset.scale);
    writePng(join(FIGURES, `inset-${key}-${name}.png`), c.rgb, c.width, c.height);
  }
  console.log(
    `${key.padEnd(7)} ${Object.entries(out[key].solvers)
      .map(([n, s]) => `${n}: ink ${s.ink}${s.diff ? `, differ ${(s.diff.fractionDiffering * 100).toFixed(1)}%` : ''}, ${s.evalsPerPixel} ev/px`)
      .join('   |   ')}`
  );
}

writeFileSync(join(DATA, 'artifacts.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nwrote ${join(DATA, 'artifacts.json')}`);
