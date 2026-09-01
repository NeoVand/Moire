// The selection figures: which beat wins is best approximation, drawn.
//
// Two figures come out of here, both CPU renders of the shipped compositing
// (lib/render.mjs mirrors composite.ts term for term; no screenshots).
//
// selection-stations.png — two radial fans off-centre, with the level sets of
// the per-pixel WINNING character laid over the render in accent. Along the
// axis between the fans the local pitch ratio sweeps through the rationals,
// and each rational the amplitude weight admits owns a small commensurate
// pocket: the convergent ladder as geography. The winner is found exactly as
// the shader finds it: Lagrange–Gauss reduction of the local index-gradient
// lattice, the reduced short vector plus a bounded window, under the
// amplitude weight |k1 k2|, with the shipped six as a floor.
//
// pitch3-render.png / pitch3-diag.png / pitch3-sched.png — two line families
// at a 3:1 pitch ratio and a 2° twist. The visible fringe is the (3,-1)
// character. The render carries it plainly; the diagonal average (the sweep
// that preserves every zero-sum character at once, which is all a fixed
// convention can hold) washes it; the certified schedule w = (1,3), chosen by
// the same reduction, keeps it.
//
//   node paper/tools/exp/selectionfigs.mjs

import { family, gradIndex, periodicDist, bestCharacter } from '../lib/fields.mjs';
import { compose, view } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';
import { FIGURES } from '../lib/instrument.mjs';
import { join } from 'node:path';

const ACCENT = [200, 30, 90];
const THR = 0.25;

// ------------------------------------------------- the stations panel
{
  const cfgA = { kind: 'radial', lineCount: 64, position: { x: -90, y: 0 } };
  const cfgB = { kind: 'radial', lineCount: 64, position: { x: 90, y: 0 } };
  const famA = family(cfgA);
  const famB = family(cfgB);
  const layers = [
    { ...cfgA, thickness: 0.85, color: '#000000' },
    { ...cfgB, thickness: 0.85, color: '#000000' },
  ];
  // Wide strip cropped to the axis band through both foci, so the
  // commensurate pockets sit at a readable scale beside the staircase.
  const V = view({ width: 1440, height: 480, zoom: 2.05, superSample: 2 });
  const base = compose(V, layers);

  // The overlay: level sets of the per-pixel winning character, gated by the
  // weighted merit (the regime line, faded near its edge) and by a minimum
  // on-screen pitch so a crowded ladder degrades to nothing rather than to
  // speckle. Everything is computed from the two index fields; the render
  // never sees the curves.
  const out = new Uint8Array(base);
  const smoothstep = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-9)));
    return t * t * (3 - 2 * t);
  };
  const worldOf = (x, y) => ({
    x: (x + 0.5 - V.width * 0.5) / V.zoom,
    y: -(y + 0.5 - V.height * 0.5) / V.zoom,
  });
  for (let y = 0; y < V.height; y += 1) {
    for (let x = 0; x < V.width; x += 1) {
      const p = worldOf(x, y);
      const gA = gradIndex(famA, p);
      const gB = gradIndex(famB, p);
      const w = bestCharacter(gA, gB);
      if (w.merit > THR) continue;
      const [a, b] = w.k;
      const val = a * famA.index(p) + b * famB.index(p);
      const rate = Math.hypot(a * gA.x + b * gB.x, a * gA.y + b * gB.y);
      if (!(rate > 1e-9)) continue;
      const pitchPx = V.zoom / rate;
      const admit =
        (1 - smoothstep(THR * 0.7, THR, w.merit)) * smoothstep(1.6, 2.8, pitchPx);
      if (admit <= 0.003) continue;
      const dPix = (periodicDist(val, 1) / rate) * V.zoom;
      const alpha = admit * (1 - smoothstep(1.4, 3.4, dPix));
      if (alpha <= 0.003) continue;
      const i = (y * V.width + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        out[i + c] = Math.round(out[i + c] + (ACCENT[c] - out[i + c]) * alpha);
      }
    }
  }
  writePng(join(FIGURES, 'selection-stations.png'), out, V.width, V.height);
  console.log('wrote selection-stations.png');
}

// ------------------------------------------------- the 3:1 panels
{
  const mk = (shift1, shift2) => [
    { kind: 'parallel', spacing: 15, phaseShift: shift1, thickness: 3, color: '#000000' },
    {
      kind: 'parallel',
      spacing: 5,
      rotation: 2,
      phaseShift: shift2,
      thickness: 2,
      color: '#000000',
    },
  ];
  const V = view({ width: 640, height: 640, zoom: 1.05, superSample: 2 });

  // Mean ink under a schedule (w1, w2): layer i advances w_i periods over the
  // sweep. The average is over index, not space (nothing is sampled
  // off-centre), and the result is expanded about the stack's nominal
  // coverage exactly as the tool's envelope is.
  const TAPS = 48;
  const CONTRAST = 3;
  const sweep = (w1, w2) => {
    const acc = new Float64Array(V.width * V.height * 3);
    for (let t = 0; t < TAPS; t += 1) {
      const u = (t + 0.5) / TAPS - 0.5;
      const rgb = compose(V, mk(u * w1 * 15, u * w2 * 5));
      for (let i = 0; i < acc.length; i += 1) acc[i] += rgb[i];
    }
    // The pivot: coverage each family averages over its own period, over paper.
    const pixel = 1 / V.zoom;
    let pivot = 255;
    for (const { spacing, thickness } of mk(0, 0)) {
      const halfT = Math.max(thickness * 0.5, pixel * 1.15);
      const cov = Math.min(1, (2 * halfT) / spacing);
      pivot += (0 - pivot) * cov;
    }
    const out = new Uint8Array(V.width * V.height * 3);
    for (let i = 0; i < acc.length; i += 1) {
      const mean = acc[i] / TAPS;
      out[i] = Math.round(Math.min(255, Math.max(0, pivot + (mean - pivot) * CONTRAST)));
    }
    return out;
  };

  writePng(join(FIGURES, 'pitch3-render.png'), compose(V, mk(0, 0)), V.width, V.height);
  console.log('wrote pitch3-render.png');
  writePng(join(FIGURES, 'pitch3-diag.png'), sweep(1, 1), V.width, V.height);
  console.log('wrote pitch3-diag.png');
  writePng(join(FIGURES, 'pitch3-sched.png'), sweep(1, 3), V.width, V.height);
  console.log('wrote pitch3-sched.png');
}
