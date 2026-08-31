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

// The world the frame sees, in world units. Held fixed while the display grew, so
// raising the pixel count is a print-resolution change and nothing else.
const WORLD_W = 640;
const WORLD_H = 340;
// Display resolution. At 640 the figure printed at 190 DPI, well under what ACM
// asks for; the aliasing this figure is about was competing with the aliasing of
// its own reproduction.
const W = 1024;
const H = Math.round((W * WORLD_H) / WORLD_W);
const ZOOM = W / WORLD_W;
const INK = '#15181c';

// Two identical concentric families, centres a hand's width apart: the textbook
// two-pole moire, mirror-symmetric about the midline.
const CFG_A = { kind: 'concentric', shape: 'circle', spacing: 11, position: { x: -70, y: 0 } };
const CFG_B = { kind: 'concentric', shape: 'circle', spacing: 11, position: { x: 70, y: 0 } };
const THICK = 1.6;

// --- The field pipeline: one distance query per family per pixel, at final size.
const V = view({ width: W, height: H, zoom: ZOOM, superSample: 3 });
const fieldPanel = compose(V, [
  { ...CFG_A, thickness: THICK, color: INK },
  { ...CFG_B, thickness: THICK, color: INK },
]);

// --- The raster pipeline: rasterise each layer once, at half the display size and
// one sample per pixel with a hard stroke test, multiply the two images, then scale
// the product up to display size. Every step is what a print/transparency workflow
// does; the artefacts are the point.
// The plate's own resolution, in world terms: one sample per two world units. This
// is what creates the artefact, so it is fixed to the world and NOT to the display
// -- scaling it with W would quietly cure the very thing the panel exists to show.
const RW = Math.floor(WORLD_W / 2);
const RH = Math.floor(WORLD_H / 2);
const famA = family(CFG_A);
const famB = family(CFG_B);

function rasterise(fam) {
  const img = new Float64Array(RW * RH);
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      // Same world mapping, but at half resolution: one world unit is half a pixel.
      const wx = (x + 0.5) * 2 - WORLD_W / 2;
      const wy = WORLD_H / 2 - (y + 0.5) * 2;
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
    const sx = Math.min(RW - 1, Math.floor((x * RW) / W));
    const sy = Math.min(RH - 1, Math.floor((y * RH) / H));
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
