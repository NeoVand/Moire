// The fringe law across the catalog, and the criterion that says where it applies.
// Five family pairs from Table 1, ordered by how much of the frame the heterodyne
// ratio admits, and for each one:
//
//   top     the superposition as rendered, two distance fields composited
//   bottom  the same frame low-passed to the fringe field, with the predicted unit
//           level sets of D = phi1 - phi2 laid over it wherever r <= 1/4
//
// Nothing in the bottom row looks at the image: the curves come from the two index
// fields and the mask from their gradients. The last column is the negative control
// -- r > 1/4 everywhere, so no curve is drawn, and the flat grey panel is what the
// criterion predicted before anything was rasterised.
//
//   node paper/tools/exp/lawatlas.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { family, heterodyneRatio } from '../lib/fields.mjs';
import { view, compose, tile, overlayLevelSets, lowPassLuma } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
const DATA = new URL('../../data/', import.meta.url);
mkdirSync(FIGS, { recursive: true });
mkdirSync(DATA, { recursive: true });

const INK = '#15181c';
const FRINGE = [214, 20, 84];
const REGIME = 0.25;
const V = view({ width: 340, height: 340, zoom: 1, superSample: 3 });

// The pairs are the ones measured in fringe.json, with the same settings, so the
// figure and the table describe the same scenes.
const SCENES = [
  {
    label: 'two combs, 6 degrees',
    slug: 'parallel-rotate',
    a: { kind: 'parallel', spacing: 6, angle: 0 },
    b: { kind: 'parallel', spacing: 6, angle: (6 * Math.PI) / 180 },
    thickness: 1.6,
  },
  {
    label: 'circles under lines',
    slug: 'circle-parallel',
    a: { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 0, y: -260 } },
    b: { kind: 'parallel', spacing: 8, angle: Math.PI / 2 },
    thickness: 1.8,
  },
  {
    label: 'hexagons, 4 degrees',
    slug: 'hexagon-hexagon',
    a: { kind: 'concentric', shape: 'hexagon', spacing: 8 },
    b: { kind: 'concentric', shape: 'hexagon', spacing: 8, rotation: 4 },
    thickness: 1.8,
  },
  {
    label: 'circles, two centres',
    slug: 'circle-circle',
    a: { kind: 'concentric', shape: 'circle', spacing: 7, position: { x: -40, y: 0 } },
    b: { kind: 'concentric', shape: 'circle', spacing: 7, position: { x: 40, y: 0 } },
    thickness: 1.8,
  },
  {
    label: 'hyperbolae under lines',
    slug: 'hyperbola-parallel',
    a: { kind: 'hyperbola', spacing: 9, phase: 4 },
    b: { kind: 'parallel', spacing: 9, angle: Math.PI / 4 },
    thickness: 1.8,
  },
];

const panels = [];
const admitted = [];

for (const scene of SCENES) {
  const famA = family(scene.a);
  const famB = family(scene.b);
  const D = (p) => famA.index(p) - famB.index(p);
  // Same definition the table uses, from the shared field library.
  const ratio = (p) => heterodyneRatio(famA, famB, p);

  const both = compose(V, [
    { ...scene.a, thickness: scene.thickness, color: INK },
    { ...scene.b, thickness: scene.thickness, color: INK },
  ]);

  // Two carrier periods of isotropic blur is what leaves the fringe field behind.
  const sigma = 1.5 * Math.min(famA.spacing, famB.spacing) * V.zoom;
  const fringeField = lowPassLuma(both, V, sigma);
  const overlaid = overlayLevelSets(fringeField, V, D, {
    color: FRINGE,
    width: 2.2,
    opacity: 1,
    mask: (p) => ratio(p) <= REGIME,
  });

  // Share of the frame the criterion admits, on the same grid the panel uses, so
  // the caption's percentages describe exactly the pictures above them.
  let inRegime = 0;
  let total = 0;
  for (let y = 0; y < V.height; y += 4) {
    for (let x = 0; x < V.width; x += 4) {
      const p = {
        x: (x + 0.5 - V.width * 0.5) / V.zoom,
        y: -(y + 0.5 - V.height * 0.5) / V.zoom,
      };
      total += 1;
      if (ratio(p) <= REGIME) inRegime += 1;
    }
  }
  admitted.push({ scene: scene.slug, label: scene.label, admitted: inRegime / total });

  panels.push({ rgb: both, width: V.width, height: V.height });
  panels.push({ rgb: overlaid, width: V.width, height: V.height });
  console.log(`${scene.slug}: r <= ${REGIME} on ${((100 * inRegime) / total).toFixed(1)}% of the frame`);
}

// tile() fills row by row, so interleave the two rows of five.
const top = panels.filter((_, i) => i % 2 === 0);
const bottom = panels.filter((_, i) => i % 2 === 1);
const plate = tile([...top, ...bottom], SCENES.length, 9, 255);
writePng(new URL('law-atlas.png', FIGS).pathname, plate.rgb, plate.width, plate.height);
console.log(`wrote figures/law-atlas.png (${plate.width}x${plate.height})`);

writeFileSync(
  new URL('lawatlas.json', DATA),
  `${JSON.stringify({ regime: REGIME, panel: V.width, scenes: admitted }, null, 2)}\n`
);
