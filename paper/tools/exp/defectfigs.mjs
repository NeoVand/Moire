// The defect figure: a circle-valued field mints a dislocation, drawn.
//
// Three CPU renders of the shipped compositing (no screenshots):
//
// defect-fork.png     — ONE line family carrying theta/tau at amount 5: the
//                       charge-5 fork grating, five extra members fanning out
//                       of the origin.
// defect-pair.png     — the same family over its unmodulated twin: the moiré
//                       carries the defect.
// defect-envelope.png — the pair under the envelope view: five fringes ending
//                       at the defect, which no exact (single-valued) field
//                       can draw, with the core where the fringe law fails.
//
// The counting experiment behind the figure is tools/exp/defects.mjs.
//
//   node paper/tools/exp/defectfigs.mjs

import { compose, envelope, view } from '../lib/render.mjs';
import { GOLDEN_CARRIER } from '../lib/fields.mjs';
import { writePng } from '../lib/png.mjs';
import { FIGURES } from '../lib/instrument.mjs';
import { join } from 'node:path';

const V = view({ width: 640, height: 640, zoom: 1.35, superSample: 2 });

const forked = () => ({
  kind: 'parallel',
  spacing: 10,
  angle: GOLDEN_CARRIER,
  field: 'theta / tau',
  fieldAmount: 5,
  fieldScale: 200,
  thickness: 2,
  color: '#000000',
});
const plain = () => ({
  kind: 'parallel',
  spacing: 10,
  angle: GOLDEN_CARRIER,
  thickness: 2,
  color: '#000000',
});

writePng(join(FIGURES, 'defect-fork.png'), compose(V, [forked()]), V.width, V.height);
console.log('wrote defect-fork.png');

writePng(join(FIGURES, 'defect-pair.png'), compose(V, [forked(), plain()]), V.width, V.height);
console.log('wrote defect-pair.png');

writePng(
  join(FIGURES, 'defect-envelope.png'),
  envelope(V, [forked(), plain()], { contrast: 3 }),
  V.width,
  V.height
);
console.log('wrote defect-envelope.png');
