// The preset gallery's thumbnails, captured from the real renderer:
//
//   node --experimental-strip-types tests/zoo/render.mjs \
//     tests/zoo/preset-scenes.mjs public/presets
//
// A preset's picture is the pixels it loads to, and a new preset brings its
// own thumbnail by rerunning the line above.
import { PRESETS } from '../../src/lib/presets.ts';

export const cases = PRESETS.map((p) => ({ name: p.id, scene: p.scene }));
