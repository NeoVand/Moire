// The teaser's multi-layer panel: three dense radial fans whose centers make
// an equilateral triangle (side 100), mirror-symmetric about the teaser's
// seam — one fan on the axis carrying the stack's single rotation, snapped to
// 49.95 degrees so that its ray set maps to itself under the mirror (the fan
// pattern repeats every 180/200 = 0.9 degrees, and 2 x 49.95 is an exact
// multiple). The layer transform rotates about the WORLD origin, so the
// on-axis fan's stated position is R(rot) applied to its visual center.
//
// Rendered through the app's own pipeline (the zoo runner: Vite + headless
// Chrome + WebGPU), not the CPU mirror: a fan's envelope needs the per-pixel
// pivot and the all-pairs sweep schedule, and the CPU mirror's sum flip only
// knows one pair, which breaks the trio's mirror symmetry. The capture is a
// pure function of the scene below and the pixel size, so the panel is as
// reproducible as any CPU figure — it just needs the GPU.
//
//   node paper/tools/exp/fantrio-panel.mjs
//
// Writes paper/figures/teaser-fantrio.png (960x960, split render | envelope,
// no seam — teaser.mjs draws the seam so every panel's rule matches).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from '../../../node_modules/pngjs/lib/png.js';
import { writePng } from '../lib/png.mjs';

const ROOT = new URL('../../../', import.meta.url);
const OUT = new URL('tests/zoo/out/', ROOT);
const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });
mkdirSync(OUT, { recursive: true });

const R = 57.735; // circumradius: side exactly 100, the author's original scale
const ROT = 49.95; // one fan rotated half a ray gap; 2*ROT ≡ 0 (mod 0.9)
const fan = (id, cx, cy, rot) => {
  // local = R(rot)·world − position, so position = R(rot)·(visual center).
  const c = Math.cos((rot * Math.PI) / 180);
  const s = Math.sin((rot * Math.PI) / 180);
  return {
    type: 'radial-lines', visible: true, color: '#0e1013', rotation: rot, opacity: 1,
    spacing: 6, thickness: 2, phase: 150, rotationOffset: 0, sides: 6, vertexSize: 2.5,
    drawEdges: true, tileFill: 0, lineCount: 200, bend: 0, frequency: 1, tiling: 'kagome',
    id, name: id, field: { source: '', amount: 0, scale: 200 },
    position: { x: c * cx + s * cy, y: -s * cx + c * cy },
    offset: { x: 0, y: 0 }, scale: { x: 1, y: 1 },
  };
};

const scene = {
  app: 'moire', version: 2,
  layers: [
    fan('t', 0, R, ROT),
    fan('bl', (-R * Math.sqrt(3)) / 2, -R / 2, 0),
    fan('br', (R * Math.sqrt(3)) / 2, -R / 2, 0),
  ],
  selectedLayerId: 't',
  // 640/zoom world across the 1280-px capture; the central 960-px square then
  // spans 480/zoom ~ 565 world, the framing of the other teaser panels.
  camera: { zoom: 0.85, pan: { x: 0, y: 0 } },
  backgroundColor: '#ffffff',
  view: {
    envelope: true, envelopeContrast: 1.8, envelopeTaps: 52, envelopeSweep: 1.0,
    envelopeLift: -0.12, envelopeMask: 0, envelopeContours: false,
    contourWidth: 1.6, contourBands: 0.4, ratio: false, ratioBlend: 1, ratioThreshold: 0.25,
  },
  motion: { timings: [], animators: [], playOnLoad: false },
};

const probe = new URL('fantrio-cases.mjs', OUT);
writeFileSync(
  probe,
  `export const cases = ${JSON.stringify([
    { name: 'fantrio-env', scene },
    { name: 'fantrio-render', scene: { ...scene, view: { ...scene.view, envelope: false } } },
  ])};\n`
);

execFileSync(
  'node',
  ['tests/zoo/render.mjs', 'tests/zoo/out/fantrio-cases.mjs', 'tests/zoo/out/fantrio-panel', '--scale', '2'],
  { cwd: ROOT.pathname, stdio: 'inherit' }
);

const square = (name) => {
  const img = PNG.sync.read(readFileSync(new URL(`fantrio-panel/${name}.png`, OUT)));
  const crop = new PNG({ width: 960, height: 960 });
  PNG.bitblt(img, crop, (img.width - 960) / 2, 0, 960, 960, 0, 0);
  return crop;
};
const render = square('fantrio-render');
const env = square('fantrio-env');

// Left half render, right half envelope, RGB — the teaser draws the seam.
const rgb = new Uint8Array(960 * 960 * 3);
for (let y = 0; y < 960; y++) {
  for (let x = 0; x < 960; x++) {
    const src = x < 480 ? render : env;
    const s = (y * 960 + x) * 4;
    const d = (y * 960 + x) * 3;
    rgb[d] = src.data[s];
    rgb[d + 1] = src.data[s + 1];
    rgb[d + 2] = src.data[s + 2];
  }
}
writePng(new URL('teaser-fantrio.png', FIGS).pathname, rgb, 960, 960);
console.log('wrote paper/figures/teaser-fantrio.png');
