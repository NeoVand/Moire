// Mock of the reworked teaser: eight square panels in two rows of four, each
// split down the middle -- the moiré on the left, its envelope on the right,
// with a short crossfade at the vertical seam. Scenes are the user's picks from
// the candidate gallery (1, 4, 6, 7, 9, 15, 16) plus the studio's opening
// vortex pair as the eighth.
//
//   node paper/tools/exp/teaser-mock.mjs

import { mkdirSync } from 'node:fs';
import { compose, envelope, tile, view } from '../lib/render.mjs';
import { loadSolver } from '../lib/instrument.mjs';
import { writePng } from '../lib/png.mjs';

const OUT = new URL('../../figures/teaser-candidates/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, polygon: 4 };
const INK = '#0e1013';
const T = 1.6;
const TAPS = 16;
const SIZE = 480;

const solver = await loadSolver('final');

// The envelope sweeps the solver's {r, rUp, rDown} trio through the measured
// local gap (phaseAt), not the solver phase through u*spacing: a walking
// family's phase period is not a local carrier period, and the old sweep left
// a drift-proportional carrier ripple in every envelope half.
function walking({ offset, theta = 0, spacing, phase = 0, shape = 'circle', sides = 6, position = { x: 0, y: 0 } }) {
  return {
    thickness: T,
    color: INK,
    spacing,
    phaseAt: (p) =>
      solver.ringPhase(
        { x: p.x - position.x, y: p.y - position.y },
        offset,
        theta,
        spacing,
        phase,
        SHAPE_CODE[shape],
        sides,
        0,
        spacing * 2
      ),
  };
}

const L = (cfg) => ({ thickness: T, color: INK, ...cfg });

const SCENES = [
  {
    name: 'rings',
    layers: [
      L({ kind: 'concentric', shape: 'circle', spacing: 5.5, position: { x: -72, y: 0 } }),
      L({ kind: 'concentric', shape: 'circle', spacing: 5.5, position: { x: 72, y: 0 } }),
    ],
    contrast: 4.5,
  },
  {
    name: 'counter-spirals',
    layers: [
      L({ kind: 'spiral', spacing: 5, bend: 90 }),
      L({ kind: 'spiral', spacing: 5, bend: -60 }),
    ],
    contrast: 3.8,
  },
  {
    name: 'terrain',
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0, thickness: 3, field: 'terrain', fieldAmount: 6, fieldScale: 300 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, thickness: 3 }),
    ],
    contrast: 3.8,
  },
  {
    name: 'walking-hexagon',
    layers: [
      walking({ offset: { x: 0.9, y: 0.25 }, theta: 0.025, spacing: 4, phase: 2, shape: 'polygon', sides: 6 }),
    ],
    contrast: 4.2,
  },
  {
    name: 'swirl-flow',
    zoom: 1.0, // zoomed out relative to the others, per review
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, field: 'swirl', fieldAmount: 3.5, fieldScale: 130 }),
    ],
    contrast: 3.6,
  },
  {
    name: 'triangle-star',
    layers: [
      L({ kind: 'concentric', shape: 'triangle', spacing: 5 }),
      L({ kind: 'concentric', shape: 'triangle', spacing: 5.4, rotation: 6 }),
    ],
    contrast: 4.4,
  },
  {
    name: 'saddle',
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, field: 'saddle', fieldAmount: 3, fieldScale: 165 }),
    ],
    contrast: 3.8,
  },
  {
    name: 'vortex-pair',
    layers: [
      walking({ offset: { x: 0, y: -0.5 }, spacing: 6, position: { x: 20, y: 50 } }),
      walking({ offset: { x: 0, y: -0.5 }, spacing: 6, position: { x: 0, y: 0 } }),
    ],
    contrast: 4.4,
  },
];

/** Left half pattern, right half envelope, crossfaded over a short band. */
function splitPanelLR(scene, V) {
  const left = compose(V, scene.layers);
  const right = envelope(V, scene.layers, { contrast: scene.contrast ?? 4, taps: TAPS });
  const rgb = new Uint8Array(left.length);
  const seam = Math.round(V.width * 0.5);
  const band = Math.round(V.width * 0.045);
  for (let y = 0; y < V.height; y++) {
    for (let x = 0; x < V.width; x++) {
      const t = Math.min(1, Math.max(0, (x - (seam - band)) / (2 * band)));
      const i = (y * V.width + x) * 3;
      for (let k = 0; k < 3; k++) {
        rgb[i + k] = Math.round(left[i + k] * (1 - t) + right[i + k] * t);
      }
    }
  }
  return rgb;
}

const panels = [];
for (const scene of SCENES) {
  const V = view({ width: SIZE, height: SIZE, zoom: scene.zoom ?? 1.3, superSample: 2 });
  const started = Date.now();
  const rgb = splitPanelLR(scene, V);
  panels.push({ rgb, width: V.width, height: V.height });
  writePng(new URL(`mock-${scene.name}.png`, OUT).pathname, rgb, V.width, V.height);
  console.log(`mock-${scene.name}.png  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

const sheet = tile(panels, 4, 10, 255);
writePng(new URL('teaser-mock.png', OUT).pathname, sheet.rgb, sheet.width, sheet.height);
console.log('wrote teaser-mock.png');
