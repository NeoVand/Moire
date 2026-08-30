// Two uses of a chosen index difference, each shown as rendered and under the
// tool's envelope view. Both panels are ordinary Studio states: a Parallel layer,
// and a second Parallel layer with the Field control set. Nothing here is a
// closure written for the figure -- the fields come from src/gpu/inverseCpu.ts,
// the CPU twin of the shader's `fieldWarp`.
//
//   node paper/tools/exp/instrument.mjs

import { mkdirSync } from 'node:fs';
import { view, compose, envelope, tile } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const PITCH = 6.2;
const INK = '#12161c';
const T = 1.7;
const V = view({ width: 560, height: 560, zoom: 0.78, superSample: 3 });

/** A carrier, and the same carrier with one of the shipped fields encoded. */
function encode(field, fieldAmount, fieldScale) {
  const base = { kind: 'parallel', angle: 0, spacing: PITCH, phase: 0, thickness: T, color: INK };
  return [base, { ...base, field, fieldAmount, fieldScale }];
}

// Stream function of four point vortices. Its level sets are the streamlines of
// the flow, so encoding it draws them without integrating one.
const streamlines = encode('swirl', 2, 180);

// A carrier against a warped copy of itself: the shadow-moire arrangement. For a
// carrier of vertical lines and a displacement along x, the encoded field is the
// displacement itself, here a sum of three Gaussians.
const deformation = encode('bumps', 2.6, 200);

const panel = (layers) => ({ rgb: compose(V, layers), width: V.width, height: V.height });
const env = (layers) => ({
  rgb: envelope(V, layers, { contrast: 2.4 }),
  width: V.width,
  height: V.height,
});

const grid = tile(
  [panel(streamlines), env(streamlines), panel(deformation), env(deformation)],
  2,
  10
);
writePng(new URL('instrument.png', FIGS).pathname, grid.rgb, grid.width, grid.height);
console.log(`wrote figures/instrument.png (${grid.width}x${grid.height})`);
