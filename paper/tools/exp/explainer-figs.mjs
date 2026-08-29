// Figures for the explainer page: small, self-contained pedagogy panels.
//
//   node paper/tools/exp/explainer-figs.mjs

import { mkdirSync } from 'node:fs';
import { compose, envelope, overlayLevelSets, tile, view } from '../lib/render.mjs';
import { family, heterodyneRatio } from '../lib/fields.mjs';
import { writePng } from '../lib/png.mjs';

const OUT = new URL('../../figures/teaser-candidates/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const INK = '#0e1013';

// --- A. The two combs: each alone, then together. ---------------------------
const VA = view({ width: 300, height: 300, zoom: 1.1, superSample: 2 });
const combA = { kind: 'parallel', spacing: 7, angle: 0.5, thickness: 1.7, color: INK };
const combB = { kind: 'parallel', spacing: 7, angle: 0.59, thickness: 1.7, color: INK };
const panels = [
  { rgb: compose(VA, [combA]), width: VA.width, height: VA.height },
  { rgb: compose(VA, [combB]), width: VA.width, height: VA.height },
  { rgb: compose(VA, [combA, combB]), width: VA.width, height: VA.height },
];
const strip = tile(panels, 3, 12, 255);
writePng(new URL('ex-combs.png', OUT).pathname, strip.rgb, strip.width, strip.height);

// --- B. Rings pair with the unit level sets of D drawn over it. -------------
const VB = view({ width: 460, height: 340, zoom: 1.0, superSample: 2 });
const ringA = { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: -17, y: 0 }, thickness: 1.6, color: INK };
const ringB = { kind: 'concentric', shape: 'circle', spacing: 8.32, position: { x: 17, y: 0 }, thickness: 1.6, color: INK };
const famA = family(ringA);
const famB = family(ringB);
const over = overlayLevelSets(
  compose(VB, [ringA, ringB]),
  VB,
  (p) => famA.index(p) - famB.index(p),
  {
    color: [200, 30, 90],
    width: 2.2,
    // Only where the theorem speaks: eta <= 1/4, the paper's own criterion.
    mask: (p) => heterodyneRatio(famA, famB, p) <= 0.25,
  }
);
writePng(new URL('ex-rings-D.png', OUT).pathname, over, VB.width, VB.height);

// --- C. The same pair's envelope, no overlay: what the average keeps. -------
const env = envelope(VB, [ringA, ringB], { contrast: 4, taps: 16 });
writePng(new URL('ex-rings-env.png', OUT).pathname, env, VB.width, VB.height);

console.log('wrote ex-combs.png, ex-rings-D.png, ex-rings-env.png');
