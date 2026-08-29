// Raster pipeline versus field pipeline, on one scene.
//
// The standard synthesis pipeline rasterises each layer and multiplies the images.
// That commits the pattern to a resolution, and the moire then has a Nyquist limit
// of its own: displaying it at any other scale either destroys fringes or invents
// them. The field pipeline answers a distance query per pixel instead, so there is
// no intermediate raster to alias.
//
//   node paper/tools/exp/traditions.mjs

import { mkdirSync } from 'node:fs';
import { family } from '../lib/fields.mjs';
import { view, compose, tile } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const W = 640;
const H = 340;
const INK = '#15181c';

// Two concentric families, detuned by three percent: a textbook moire.
const CFG_A = { kind: 'concentric', shape: 'circle', spacing: 11, position: { x: -70, y: 0 } };
const CFG_B = { kind: 'concentric', shape: 'circle', spacing: 11.33, position: { x: 70, y: 0 } };
const THICK = 1.6;

// --- The field pipeline: one distance query per family per pixel, at final size.
const V = view({ width: W, height: H, zoom: 1, superSample: 3 });
const fieldPanel = compose(V, [
  { ...CFG_A, thickness: THICK, color: INK },
  { ...CFG_B, thickness: THICK, color: INK },
]);

// --- The raster pipeline: rasterise each layer once, at half the display size and
// one sample per pixel with a hard stroke test, multiply the two images, then scale
// the product up to display size. Every step is what a print/transparency workflow
// does; the artefacts are the point.
const RW = Math.floor(W / 2);
const RH = Math.floor(H / 2);
const famA = family(CFG_A);
const famB = family(CFG_B);

function rasterise(fam) {
  const img = new Float64Array(RW * RH);
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      // Same world mapping, but at half resolution: one world unit is half a pixel.
      const wx = (x + 0.5) * 2 - W / 2;
      const wy = H / 2 - (y + 0.5) * 2;
      // Hard threshold, no antialiasing and no stroke floor: a bilevel plate.
      img[y * RW + x] = fam.distance({ x: wx, y: wy }) <= THICK * 0.5 ? 0 : 1;
    }
  }
  return img;
}

const plateA = rasterise(famA);
const plateB = rasterise(famB);

const rasterPanel = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    // Nearest-neighbour magnification of the product, as a print would be scanned.
    const sx = Math.min(RW - 1, x >> 1);
    const sy = Math.min(RH - 1, y >> 1);
    const t = plateA[sy * RW + sx] * plateB[sy * RW + sx];
    const g = Math.round(t * 255);
    const i = (y * W + x) * 3;
    rasterPanel[i] = g;
    rasterPanel[i + 1] = g;
    rasterPanel[i + 2] = g;
  }
}

const stack = tile(
  [
    { rgb: rasterPanel, width: W, height: H },
    { rgb: fieldPanel, width: W, height: H },
  ],
  1,
  10
);
writePng(new URL('two-traditions.png', FIGS).pathname, stack.rgb, stack.width, stack.height);
console.log(`wrote figures/two-traditions.png (${stack.width}x${stack.height})`);
