// A/B of carrier angles against the pixel lattice. Four strips of the same
// parallel pair at 0°, arctan(1/2), the golden off-vertical, and 45°.
// Inspected at screen scale and at a 300 dpi downsample before GOLDEN_CARRIER
// was frozen. Not a paper figure.
//
//   node --experimental-strip-types paper/tools/exp/carrier-angle.mjs

import { GOLDEN_CARRIER } from '../lib/fields.mjs';
import { compose, tile, view } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';
import { FIGURES } from '../lib/instrument.mjs';
import { join } from 'node:path';

const ANGLES = [
  ['0', 0],
  ['arctan-1/2', Math.atan(0.5)],
  ['golden', GOLDEN_CARRIER],
  ['45', Math.PI / 4],
];

const V = view({ width: 420, height: 280, zoom: 1.4, superSample: 2 });
const panels = [];
for (const [name, angle] of ANGLES) {
  const rgb = compose(V, [
    { kind: 'parallel', spacing: 5, angle, thickness: 1.8, color: '#12161c' },
    {
      kind: 'parallel',
      spacing: 5,
      angle,
      thickness: 1.8,
      color: '#12161c',
      field: 'terrain',
      fieldAmount: 5,
      fieldScale: 220,
    },
  ]);
  panels.push({ rgb, width: V.width, height: V.height });
  console.log(`${name}: ${(angle * 180) / Math.PI} deg`);
}
const strip = tile(panels, 4, 8, 255);
writePng(join(FIGURES, 'carrier-angle-ab.png'), strip.rgb, strip.width, strip.height);
console.log('wrote carrier-angle-ab.png');
