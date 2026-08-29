// Candidate scenes for the holes figure (fig:holes): a walking family near the
// marginal drift, pretty enough to open the results section, and broken enough
// under SWEEP that the lost arcs read. Each candidate renders reference, sweep,
// and the lost-ink map at picking resolution (same world window as the final
// figure, fewer pixels), with the measured loss printed beside it.
//
//   node paper/tools/exp/artifacts-candidates.mjs

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FIGURES, loadSolver } from '../lib/instrument.mjs';
import { referenceSolver } from '../lib/reference.mjs';
import { dropMap, imageDiff, render, scene } from '../lib/raster.mjs';
import { tile } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const OUT = join(FIGURES, 'teaser-candidates');
mkdirSync(OUT, { recursive: true });

const sweep = await loadSolver('sweep');

// Picking resolution: the final figure's 1200x800 world window at zoom 2/3.
const W = 800;
const H = 533;
const Z = 2 / 3;

// All drifts sit near the margin for their shape's support radius -- squares
// and the L-infinity norm, circles and the Euclidean one -- because that is
// the regime where a fixed enumeration actually fails.
const CANDIDATES = [
  { id: 1, note: 'gentle nautilus', layers: [{ shape: 'square', spacing: 16, thickness: 1.8, offset: { x: 12.8, y: 12.8 }, rotationOffset: 0.03 }] },
  { id: 2, note: 'slow nautilus', layers: [{ shape: 'square', spacing: 16, thickness: 1.8, offset: { x: 12.8, y: 12.8 }, rotationOffset: 0.018 }] },
  { id: 3, note: 'fast nautilus', layers: [{ shape: 'square', spacing: 16, thickness: 1.8, offset: { x: 12.8, y: 12.8 }, rotationOffset: 0.05 }] },
  { id: 4, note: 'coarse nautilus', layers: [{ shape: 'square', spacing: 20, thickness: 2.1, offset: { x: 16, y: 16 }, rotationOffset: 0.025 }] },
  { id: 5, note: 'counter-twist', layers: [{ shape: 'square', spacing: 16, thickness: 1.8, offset: { x: 12.8, y: -12.8 }, rotationOffset: 0.03 }] },
  { id: 6, note: 'circle vortex', layers: [{ shape: 'circle', spacing: 14, thickness: 1.8, offset: { x: 8.4, y: 8.4 }, rotationOffset: 0.045 }] },
  { id: 7, note: 'triangle nautilus', layers: [{ shape: 'triangle', spacing: 16, thickness: 1.8, offset: { x: 9, y: 9 }, rotationOffset: 0.035 }] },
  { id: 8, note: 'hexagon nautilus', layers: [{ shape: 'polygon', sides: 6, spacing: 16, thickness: 1.8, offset: { x: 9.6, y: 9.6 }, rotationOffset: 0.025 }] },
];

const rows = [];
for (const cand of CANDIDATES) {
  const sc = scene({ width: W, height: H, zoom: Z, layers: cand.layers });
  const ref = referenceSolver();
  const t0 = performance.now();
  const refImg = render(sc, ref).rgb;
  const sweepImg = render(sc, sweep).rgb;
  const diff = imageDiff(refImg, sweepImg);
  const drop = dropMap(refImg, sweepImg, W, H, 2);
  rows.push({ rgb: refImg, width: W, height: H });
  rows.push({ rgb: sweepImg, width: W, height: H });
  rows.push({ rgb: drop, width: W, height: H });
  console.log(
    `#${cand.id} ${cand.note.padEnd(18)} sweep differs ${(diff.fractionDiffering * 100).toFixed(1)}% ` +
      `(${((performance.now() - t0) / 1000).toFixed(0)}s)`
  );
}

const sheet = tile(rows, 3, 12, 255);
writePng(join(OUT, 'holes-candidates.png'), sheet.rgb, sheet.width, sheet.height);
console.log('wrote holes-candidates.png (rows: reference | sweep | lost ink)');
