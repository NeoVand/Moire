// The tool's own aliasing, before and after (paper 3, the instrument section):
//
//   node tests/zoo/render.mjs paper/tools/exp/alias-scenes.mjs paper/figures --scale 1
//
// writes alias-before.png and alias-after.png: the inverse figure's grey swans
// on rings of pitch 4 with a stroke of 2, the picture shared between the two
// layers, at a camera zoom that puts the rings at two buffer pixels a period.
// Before: pooling off (a scene-only switch), so the pixel comb beats with the
// rings and the hairline floor blackens the pitch. After: the plain render as
// it ships, every pixel a pooling observer.
import { cases as inverse } from './inverse-scenes.mjs';

const base = inverse.find((c) => c.name === 'inverse-halves-aligned').scene;
const at = (name, pool) => {
  const scene = JSON.parse(JSON.stringify(base));
  for (const layer of scene.layers) {
    layer.spacing = 4;
    layer.thickness = 2;
  }
  scene.camera.zoom = 0.52;
  scene.view = { pool };
  return { name, scene, coords: [1, 1] };
};
export const cases = [at('alias-before', false), at('alias-after', true)];
