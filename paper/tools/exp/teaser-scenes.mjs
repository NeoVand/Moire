// The eight teaser scenes, shared by the picker mock (teaser-mock.mjs) and the
// print render (teaser.mjs). Zooms and pans are stated for a 480-pixel square
// panel; a renderer at another size scales zoom by size/480 to keep the same
// world framing. Order alternates textures so no two neighbours read alike:
// fans beside band systems, weaves beside smooth envelopes, across rows and
// down columns, closing on the studio's opening scene.

import { GOLDEN_CARRIER } from '../lib/fields.mjs';

export const INK = '#0e1013';
const T = 1.6;
const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, polygon: 4 };

/**
 * A walking layer driven by the shipped solver, sweeping the envelope by the
 * measured local gap (phaseAt). `rotation` is the layer pose in degrees,
 * applied as the app applies it: the query point turns into layer space, which
 * for circles amounts to rotating the walking drift.
 */
function walking(
  solver,
  {
    offset,
    theta = 0,
    spacing,
    phase = 0,
    shape = 'circle',
    sides = 6,
    position = { x: 0, y: 0 },
    rotation = 0,
    thickness = T,
  }
) {
  const rad = (-rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    thickness,
    color: INK,
    spacing,
    phaseAt: (p) => {
      const dx = p.x - position.x;
      const dy = p.y - position.y;
      return solver.ringPhase(
        { x: c * dx - s * dy, y: s * dx + c * dy },
        offset,
        theta,
        spacing,
        phase,
        SHAPE_CODE[shape],
        sides,
        0,
        spacing * 2
      );
    },
  };
}

const L = (cfg) => ({ thickness: T, color: INK, ...cfg });

export function teaserScenes(solver) {
  return [
    {
      name: 'rings',
      layers: [
        L({ kind: 'concentric', shape: 'circle', spacing: 5.5, position: { x: -72, y: 0 } }),
        L({ kind: 'concentric', shape: 'circle', spacing: 5.5, position: { x: 72, y: 0 } }),
      ],
      contrast: 4.5,
    },
    {
      name: 'terrain',
      zoom: 0.85,
      layers: [
        L({ kind: 'parallel', spacing: 5, angle: GOLDEN_CARRIER, thickness: 3, field: 'terrain', fieldAmount: 6, fieldScale: 300 }),
        L({ kind: 'parallel', spacing: 5, angle: GOLDEN_CARRIER, thickness: 3 }),
      ],
      contrast: 3.8,
    },
    {
      name: 'counter-spirals',
      layers: [
        L({ kind: 'spiral', spacing: 5, bend: 90 }),
        L({ kind: 'spiral', spacing: 5, bend: -60 }),
      ],
      contrast: 3.8,
    },
    {
      name: 'hex-twist',
      zoom: 1.15,
      layers: [
        L({ kind: 'lattice', lattice: 'hex', spacing: 10, thickness: 2 }),
        L({ kind: 'lattice', lattice: 'hex', spacing: 10, rotation: 5, thickness: 2 }),
      ],
      contrast: 5.5,
      // A lattice pair's ink is spiky under the rank-1 tap rule (hairline
      // strokes hit or miss), so the residue falls like 1/taps rather than
      // washing at the scalar families' two dozen. Offline, taps are cheap;
      // this is what resolves the superlattice of coincidence spots.
      taps: 384,
    },
    {
      name: 'swirl-flow',
      zoom: 1.0,
      layers: [
        L({ kind: 'parallel', spacing: 5, angle: GOLDEN_CARRIER }),
        L({ kind: 'parallel', spacing: 5, angle: GOLDEN_CARRIER, field: 'swirl', fieldAmount: 3.5, fieldScale: 130 }),
      ],
      contrast: 3.6,
    },
    {
      name: 'walking-hexagon',
      layers: [
        walking(solver, {
          offset: { x: 0.9, y: 0.25 },
          theta: 0.025,
          spacing: 4,
          phase: 2,
          shape: 'polygon',
          sides: 6,
        }),
      ],
      contrast: 4.2,
    },
    {
      name: 'triangle-star',
      layers: [
        L({ kind: 'concentric', shape: 'triangle', spacing: 5 }),
        L({ kind: 'concentric', shape: 'triangle', spacing: 5.4, rotation: 6 }),
      ],
      contrast: 4.4,
    },
    {
      // The author's own scene file (moire-scene-2026-08-29T18-34-49), zoomed
      // out a step: two walking circle families drifting against each other,
      // the double rosette pinned on the seam. This is the studio's opening
      // preset family.
      name: 'vortex-pair',
      zoom: 0.8,
      pan: { x: 4.805, y: -27.2 },
      layers: [
        walking(solver, {
          offset: { x: 0, y: -0.5 },
          spacing: 8.3,
          thickness: 3.5,
          position: { x: 0, y: 0 },
          rotation: 50,
        }),
        walking(solver, {
          offset: { x: 0, y: 0.5 },
          spacing: 8.3,
          thickness: 3.5,
          position: { x: 9.61, y: -54.4 },
          rotation: -5.8,
        }),
      ],
      contrast: 3,
    },
  ];
}

/** Left half pattern, right half envelope, cut hard at the seam. */
export function splitPanelLR(compose, envelope, scene, V, taps) {
  const left = compose(V, scene.layers);
  const right = envelope(V, scene.layers, { contrast: scene.contrast ?? 4, taps });
  const rgb = new Uint8Array(left.length);
  const seam = Math.round(V.width * 0.5);
  for (let y = 0; y < V.height; y++) {
    for (let x = 0; x < V.width; x++) {
      const i = (y * V.width + x) * 3;
      const src = x < seam ? left : right;
      rgb[i] = src[i];
      rgb[i + 1] = src[i + 1];
      rgb[i + 2] = src[i + 2];
    }
  }
  return rgb;
}

/**
 * The seam rule: alternating black and white dashes, the one style that reads
 * on both the dark weave and the pale envelope. `unit` scales dash length and
 * rule width with the panel size (1 at 480 px).
 */
export function drawSeam(rgb, V, unit = 1) {
  const seam = Math.round(V.width * 0.5);
  const width = Math.max(2, Math.round(2 * unit));
  const dash = Math.max(4, Math.round(9 * unit));
  const x0 = seam - Math.floor(width / 2);
  for (let y = 0; y < V.height; y++) {
    const ink = y % (dash * 2) < dash ? 0 : 255;
    for (let x = x0; x < x0 + width; x++) {
      const i = (y * V.width + x) * 3;
      rgb[i] = ink;
      rgb[i + 1] = ink;
      rgb[i + 2] = ink;
    }
  }
  return rgb;
}
