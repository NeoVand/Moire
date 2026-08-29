// Screen-resolution proof of the teaser: the same eight scenes as teaser.mjs
// (shared through teaser-scenes.mjs), tiled as one sheet for review. The print
// render is teaser.mjs; this exists so a lineup change can be judged in seconds
// rather than minutes.
//
//   node paper/tools/exp/teaser-mock.mjs

import { mkdirSync } from 'node:fs';
import { compose, envelope, tile, view } from '../lib/render.mjs';
import { loadSolver } from '../lib/instrument.mjs';
import { writePng } from '../lib/png.mjs';
import { drawSeam, splitPanelLR, teaserScenes } from './teaser-scenes.mjs';

const OUT = new URL('../../figures/teaser-candidates/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const SIZE = 480;
const TAPS = 16;

const solver = await loadSolver('final');
const SCENES = teaserScenes(solver);

const panels = [];
for (const scene of SCENES) {
  const started = Date.now();
  const V = view({
    width: SIZE,
    height: SIZE,
    zoom: scene.zoom ?? 1.3,
    pan: scene.pan ?? { x: 0, y: 0 },
    superSample: 2,
  });
  const rgb = drawSeam(splitPanelLR(compose, envelope, scene, V, TAPS), V, 1);
  panels.push({ rgb, width: V.width, height: V.height });
  writePng(new URL(`mock-${scene.name}.png`, OUT).pathname, rgb, V.width, V.height);
  console.log(`mock-${scene.name}.png  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

const sheet = tile(panels, 4, 10, 255);
writePng(new URL('teaser-mock.png', OUT).pathname, sheet.rgb, sheet.width, sheet.height);
console.log('wrote teaser-mock.png');
