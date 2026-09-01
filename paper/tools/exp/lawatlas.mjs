// The fringe law across the catalog, and the criterion that says where it applies.
// Five family pairs from Table 1, ordered by how much of the frame the
// weighted scan admits, and for each one:
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
import { family, gradIndex, bestCharacter, GOLDEN_CARRIER } from '../lib/fields.mjs';
import { view, compose, tile, overlayLevelSets, lowPassLuma } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
const DATA = new URL('../../data/', import.meta.url);
mkdirSync(FIGS, { recursive: true });
mkdirSync(DATA, { recursive: true });

const INK = '#15181c';
const FRINGE = [214, 20, 84];
const REGIME = 0.25;
// The plate prints five panels across the full text width. At 340 the panels
// landed near 248 DPI, below what ACM asks for and visibly so: the crimson level
// sets stair-stepped and the grey fields banded. 480 puts the same figure at
// roughly 350 DPI.
const PANEL = 480;
const GUTTER = 13;
// The world extent each panel covers. Held fixed while PANEL grew, so this is a
// resolution change and not a different figure: raising the pixel count without
// raising the zoom would have widened every view, and it did -- two of the
// admitted fractions moved before this line went in.
const WORLD = 340;
const SCALE = PANEL / WORLD;
const V = view({ width: PANEL, height: PANEL, zoom: SCALE, superSample: 3 });

// The pairs are the ones measured in fringe.json, with the same settings, so the
// figure and the table describe the same scenes.
const SCENES = [
  {
    label: 'two combs, 6 degrees',
    slug: 'parallel-rotate',
    a: { kind: 'parallel', spacing: 6, angle: GOLDEN_CARRIER },
    b: { kind: 'parallel', spacing: 6, angle: GOLDEN_CARRIER + (6 * Math.PI) / 180 },
    thickness: 1.6,
  },
  {
    label: 'circles under lines',
    slug: 'circle-parallel',
    a: { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 0, y: -260 } },
    b: { kind: 'parallel', spacing: 8, angle: GOLDEN_CARRIER + Math.PI / 2 },
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
    b: { kind: 'parallel', spacing: 9, angle: GOLDEN_CARRIER + Math.PI / 4 },
    thickness: 1.8,
  },
];

const panels = [];
const admitted = [];

for (const scene of SCENES) {
  const famA = family(scene.a);
  const famB = family(scene.b);
  // Winning character and its merit, the shader's own scan. Overlay and
  // admission both read it, so a (3,−1) pocket draws its own levels and
  // a first-order desert stays empty.
  const pick = (p) => bestCharacter(gradIndex(famA, p), gradIndex(famB, p));
  const D = (p) => {
    const { k } = pick(p);
    return k[0] * famA.index(p) + k[1] * famB.index(p);
  };
  const ratio = (p) => pick(p).merit;

  const both = compose(V, [
    { ...scene.a, thickness: scene.thickness, color: INK },
    { ...scene.b, thickness: scene.thickness, color: INK },
  ]);

  // Two carrier periods of isotropic blur is what leaves the fringe field behind.
  const sigma = 1.5 * Math.min(famA.spacing, famB.spacing) * V.zoom;
  const fringeField = lowPassLuma(both, V, sigma);
  const overlaid = overlayLevelSets(fringeField, V, D, {
    color: FRINGE,
    width: 2.2 * SCALE,
    opacity: 1,
    // Signed distance to the criterion rather than a yes/no, so the curve fades
    // out over the last tenth of the admitted range instead of ending on a pixel
    // boundary. What is admitted is unchanged: nothing is drawn above eta = 1/4.
    mask: (p) => ratio(p) - REGIME,
    maskFade: REGIME * 0.1,
    // Where the level sets crowd closer than this they cannot be drawn as
    // separate curves. At a rosette centre they crowd without bound.
    minPitchPx: 5 * SCALE,
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
const plate = tile([...top, ...bottom], SCENES.length, GUTTER, 255);
writePng(new URL('law-atlas.png', FIGS).pathname, plate.rgb, plate.width, plate.height);
console.log(`wrote figures/law-atlas.png (${plate.width}x${plate.height})`);

writeFileSync(
  new URL('lawatlas.json', DATA),
  `${JSON.stringify(
    {
      regime: REGIME,
      panel: V.width,
      gutter: GUTTER,
      // The fractions \panelrow needs to centre the labels, restated here so the
      // caption cannot drift from the geometry.
      panelFraction: V.width / (SCENES.length * V.width + (SCENES.length - 1) * GUTTER),
      gutterFraction: GUTTER / (SCENES.length * V.width + (SCENES.length - 1) * GUTTER),
      minPitchPx: 5 * SCALE,
      scenes: admitted,
    },
    null,
    2
  )}\n`
);
