// Candidates for the teaser rebuild: each panel is one scene split in half --
// the pattern above, its envelope below, with a short crossfade at the seam.
// The point of the split is the paper's thesis in one image: the fringe field
// is not an effect applied to the pattern, it is *in* the pattern, and the
// bottom half is the top half with the carrier averaged away (Section 3.5).
//
// Sixteen scenes at picking resolution; the chosen four get re-rendered at
// print resolution by the teaser script proper.
//
//   node paper/tools/exp/teaser-candidates.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { compose, envelope, tile, view } from '../lib/render.mjs';
import { loadSolver } from '../lib/instrument.mjs';
import { encodePng, writePng } from '../lib/png.mjs';

const OUT = new URL('../../figures/teaser-candidates/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, polygon: 4 };
const INK = '#0e1013';
const T = 1.6;

const V = view({ width: 400, height: 600, zoom: 1.3, superSample: 2 });
const TAPS = 16;

const solver = await loadSolver('final');

/** A walking layer the composite and the envelope can both drive. The envelope
 * sweeps the solver's {r, rUp, rDown} trio through the measured local gap
 * (phaseAt), mirroring the GPU: advancing the solver phase by u*spacing is not
 * a local carrier period for a walking family, and sweeping it that way leaves
 * a drift-proportional carrier ripple in the average. */
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
    id: 1,
    name: 'rings',
    note: 'circles about two centres, tighter carrier: hyperbolae and ellipses',
    layers: [
      L({ kind: 'concentric', shape: 'circle', spacing: 5.5, position: { x: -72, y: 0 } }),
      L({ kind: 'concentric', shape: 'circle', spacing: 5.5, position: { x: 72, y: 0 } }),
    ],
    contrast: 4.5,
  },
  {
    id: 2,
    name: 'walking-triangle',
    note: 'one self-interfering walking triangle family',
    layers: [
      walking({ offset: { x: 1.2, y: 0 }, theta: 0.03, spacing: 3.5, phase: 2, shape: 'triangle' }),
    ],
    contrast: 4.2,
  },
  {
    id: 3,
    name: 'nautilus',
    note: 'walking squares near the marginal drift',
    layers: [
      walking({ offset: { x: 4.8, y: 0 }, theta: 0.02, spacing: 6, phase: 3, shape: 'square' }),
    ],
    contrast: 4.2,
  },
  {
    id: 4,
    name: 'walking-hexagon',
    note: 'a walking hexagon pinwheel',
    layers: [
      walking({ offset: { x: 0.9, y: 0.25 }, theta: 0.025, spacing: 4, phase: 2, shape: 'polygon', sides: 6 }),
    ],
    contrast: 4.2,
  },
  {
    id: 5,
    name: 'mirrored-spirals',
    note: 'a spiral against its own reflection: 36 rays',
    layers: [
      L({ kind: 'spiral', spacing: 5, bend: 90 }),
      L({ kind: 'spiral', spacing: 5, bend: 90, warp: (q) => ({ x: q.x, y: -q.y }) }),
    ],
    contrast: 3.8,
  },
  {
    id: 6,
    name: 'counter-spirals',
    note: 'two spirals, opposite chirality, different arm counts',
    layers: [
      L({ kind: 'spiral', spacing: 5, bend: 90 }),
      L({ kind: 'spiral', spacing: 5, bend: -60 }),
    ],
    contrast: 3.8,
  },
  {
    id: 7,
    name: 'swirl-flow',
    note: 'a chosen field: streamlines of four point vortices',
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, field: 'swirl', fieldAmount: 3.5, fieldScale: 130 }),
    ],
    contrast: 3.6,
  },
  {
    id: 8,
    name: 'dipole',
    note: 'a chosen field: equipotentials of a dipole',
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, field: 'dipole', fieldAmount: 8, fieldScale: 175 }),
    ],
    contrast: 3.2,
  },
  {
    id: 9,
    name: 'saddle',
    note: 'a chosen field: the saddle, contoured',
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, field: 'saddle', fieldAmount: 3, fieldScale: 165 }),
    ],
    contrast: 3.8,
  },
  {
    id: 10,
    name: 'hyperbolae',
    note: 'two hyperbola families, spacing mismatched',
    layers: [
      L({ kind: 'hyperbola', spacing: 9, phase: 20 }),
      L({ kind: 'hyperbola', spacing: 9.36, phase: 20 }),
    ],
    contrast: 3.6,
  },
  {
    id: 11,
    name: 'spiral-rings',
    note: 'an Archimedean spiral over concentric circles',
    layers: [
      L({ kind: 'spiral', spacing: 8, bend: 8 }),
      L({ kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 30, y: 0 } }),
    ],
    contrast: 4,
  },
  {
    id: 12,
    name: 'vortex-pair',
    note: 'two walking circle families: the studio opening',
    layers: [
      walking({ offset: { x: 0, y: -0.5 }, spacing: 6, position: { x: 20, y: 50 } }),
      walking({ offset: { x: 0, y: -0.5 }, spacing: 6, position: { x: 0, y: 0 } }),
    ],
    contrast: 4.4,
  },
  {
    id: 13,
    name: 'clash',
    note: 'two walking circle families marching into each other',
    layers: [
      walking({ offset: { x: 0.9, y: 0 }, spacing: 6, phase: 3, position: { x: -46, y: 0 } }),
      walking({ offset: { x: -0.9, y: 0 }, spacing: 6, phase: 3, position: { x: 46, y: 0 } }),
    ],
    contrast: 4.2,
  },
  {
    id: 14,
    name: 'ring-triplet',
    note: 'three circle families: three fringe systems at once',
    layers: [
      L({ kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 0, y: 84 } }),
      L({ kind: 'concentric', shape: 'circle', spacing: 8, position: { x: -73, y: -42 } }),
      L({ kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 73, y: -42 } }),
    ],
    contrast: 4.2,
  },
  {
    id: 15,
    name: 'triangle-star',
    note: 'concentric triangles, tighter carrier, detuned and turned',
    layers: [
      L({ kind: 'concentric', shape: 'triangle', spacing: 5 }),
      L({ kind: 'concentric', shape: 'triangle', spacing: 5.4, rotation: 6 }),
    ],
    contrast: 4.4,
  },
  {
    id: 16,
    name: 'terrain',
    note: 'a chosen field: band-limited terrain on one of two identical line families',
    layers: [
      L({ kind: 'parallel', spacing: 5, angle: 0, thickness: 3, field: 'terrain', fieldAmount: 6, fieldScale: 300 }),
      L({ kind: 'parallel', spacing: 5, angle: 0, thickness: 3 }),
    ],
    contrast: 3.8,
  },
];

/** Top half pattern, bottom half envelope, crossfaded over a short band. */
function splitPanel(scene) {
  const top = compose(V, scene.layers);
  const bottom = envelope(V, scene.layers, { contrast: scene.contrast ?? 4, taps: TAPS });
  const rgb = new Uint8Array(top.length);
  const seam = Math.round(V.height * 0.5);
  const band = Math.round(V.height * 0.045);
  for (let y = 0; y < V.height; y++) {
    const t = Math.min(1, Math.max(0, (y - (seam - band)) / (2 * band)));
    for (let x = 0; x < V.width; x++) {
      const i = (y * V.width + x) * 3;
      for (let k = 0; k < 3; k++) {
        rgb[i + k] = Math.round(top[i + k] * (1 - t) + bottom[i + k] * t);
      }
    }
  }
  return rgb;
}

const panels = [];
for (const scene of SCENES) {
  const started = Date.now();
  const rgb = splitPanel(scene);
  panels.push({ rgb, width: V.width, height: V.height });
  const file = `cand-${String(scene.id).padStart(2, '0')}-${scene.name}.png`;
  writePng(new URL(file, OUT).pathname, rgb, V.width, V.height);
  console.log(`${file}  (${((Date.now() - started) / 1000).toFixed(1)}s)  ${scene.note}`);
}

const sheet = tile(panels, 4, 14, 255);
writePng(new URL('contact-sheet.png', OUT).pathname, sheet.rgb, sheet.width, sheet.height);

// A one-file gallery for picking: each candidate numbered, images inlined.
const cards = SCENES.map((scene, i) => {
  const png = encodePng(panels[i].rgb, V.width, V.height);
  const b64 = Buffer.from(png).toString('base64');
  return { scene, b64 };
});
writeFileSync(
  new URL('gallery.json', OUT).pathname,
  JSON.stringify(cards.map(({ scene, b64 }) => ({ id: scene.id, name: scene.name, note: scene.note, b64 })))
);
console.log(`wrote ${SCENES.length} candidates, contact-sheet.png, gallery.json`);
