// The inverse problem's figure (paper 3, the instrument section): a grey-level
// picture on concentric circles, on one layer and shared between two, as
// scenes for the zoo renderer:
//
//   node tests/zoo/render.mjs paper/tools/exp/inverse-scenes.mjs paper/figures --scale 2
//
// writes inverse-{alone,aligned,quarter,halves-a,halves-b,halves-aligned}.png
// straight into paper/figures, through the app's own capture path. The picture
// is paper/figures/src/swans-grey.png, 512 px of luma over white, which is
// exactly what the field editor stores when a picture is picked. Every dial
// here is a field dial the editor exposes (mode, role, amount, scale, soften).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const PICTURE = new URL('../../figures/src/swans-grey.png', import.meta.url);
const image = 'data:image/png;base64,' + readFileSync(PICTURE).toString('base64');

const layer = (id, name, extra) => ({
  id,
  name,
  type: 'concentric-circles',
  visible: true,
  color: '#000000',
  position: { x: 0, y: 0 },
  rotation: 0,
  opacity: 1,
  spacing: 6,
  thickness: 3,
  phase: 0,
  offset: { x: 0, y: 0 },
  rotationOffset: 0,
  sides: 6,
  vertexSize: 2.5,
  drawEdges: true,
  tileFill: 0,
  scale: { x: 1, y: 1 },
  lineCount: 8,
  bend: 0,
  frequency: 1,
  tiling: 'kagome',
  field: { source: '', amount: 3, scale: 200 },
  ...extra,
});
// The picture's width in world units: the zoo frames 640 across and 480 down,
// and the picture is square, so this fills the height with a little margin.
const EXTENT = 470;
const field = (extra) => ({ source: '', amount: 0.5, scale: EXTENT, image, ...extra });
const pair = (aField, bField, visible = [true, true], patch = {}) => ({
  app: 'moire',
  version: 2,
  layers: [
    layer('1', 'Rings', { visible: visible[0], ...(aField ? { field: aField } : {}) }),
    layer('2', 'Picture', { visible: visible[1], field: bField, ...patch }),
  ],
  selectedLayerId: '2',
  camera: { zoom: 1, pan: { x: 0, y: 0 } },
  backgroundColor: '#ffffff',
});
// Two layers: a quarter of the shift each way, bent over half a pitch, which
// is the softness the studio sets when Two layers is chosen: log2(0.5 * pitch
// * 512 / extent).
const SOFT = Math.log2((0.5 * 6 * 512) / EXTENT);
const plain = field({});
const halfA = field({ mode: 'halves', role: 1, soften: SOFT });
const halfB = field({ mode: 'halves', role: -1, soften: SOFT });

export const cases = [
  { name: 'inverse-alone', scene: pair(null, plain, [false, true]), coords: [1, 1] },
  { name: 'inverse-aligned', scene: pair(null, plain), coords: [1, 1] },
  { name: 'inverse-quarter', scene: pair(null, plain, [true, true], { position: { x: 1.5, y: 0 } }), coords: [1, 1] },
  { name: 'inverse-halves-a', scene: pair(halfA, halfB, [true, false]), coords: [1, 1] },
  { name: 'inverse-halves-b', scene: pair(halfA, halfB, [false, true]), coords: [1, 1] },
  { name: 'inverse-halves-aligned', scene: pair(halfA, halfB), coords: [1, 1] },
];
