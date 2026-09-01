// The teaser: eight square panels in two rows of four, each cut down the middle
// by a dashed rule -- the pattern as drawn to its left, the same parameters
// under the envelope view to its right. The split is the paper's thesis in one
// image: the fringe field is not an effect applied to a pattern, it is in the
// pattern, and the right half is the left half averaged over its own phase.
//
// Scenes and the split live in teaser-scenes.mjs, shared with the picking mock.
// Panels render at 960 px square (zoom doubled from the mock's 480 so the world
// framing is identical), 3x3 supersampling, 24 envelope taps.
//
//   node paper/tools/exp/teaser.mjs

import { mkdirSync } from 'node:fs';
import { compose, envelope, tile, view } from '../lib/render.mjs';
import { loadSolver } from '../lib/instrument.mjs';
import { writePng } from '../lib/png.mjs';
import { drawSeam, splitPanelLR, teaserScenes } from './teaser-scenes.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const SIZE = 960;
const GUTTER = 20;
const TAPS = 24;
const UNIT = SIZE / 480;

const solver = await loadSolver('final');
const SCENES = teaserScenes(solver);

const panels = [];
for (const scene of SCENES) {
  const started = Date.now();
  const V = view({
    width: SIZE,
    height: SIZE,
    zoom: (scene.zoom ?? 1.3) * UNIT,
    pan: scene.pan ?? { x: 0, y: 0 },
    superSample: 3,
  });
  const rgb = drawSeam(splitPanelLR(compose, envelope, scene, V, scene.taps ?? TAPS), V, UNIT);
  panels.push({ rgb, width: V.width, height: V.height });
  console.log(`${scene.name}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

for (const [row, slice] of [panels.slice(0, 4), panels.slice(4)].entries()) {
  const sheet = tile(slice, 4, GUTTER, 255);
  writePng(new URL(`teaser-row${row + 1}.png`, FIGS).pathname, sheet.rgb, sheet.width, sheet.height);
  console.log(`wrote teaser-row${row + 1}.png  (${sheet.width}x${sheet.height})`);
}
