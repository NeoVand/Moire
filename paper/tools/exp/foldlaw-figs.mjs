// The fold-law figure: three walking families rendered by brute-force nearest
// member (the renderer knows nothing of the support calculus), with the fold
// locus the calculus predicts drawn over them in accent.
//
//   (a) walking circles at supersonic drift |delta| = 1.6 s: the members
//       osculate along the two Mach lines <p, nu> = phi with <delta, nu> = -s.
//   (b) rotating hexagons: nesting breaks at the circle R* = s/(theta sin(pi/6)).
//   (c) rotating ellipse gauge: R* = [2ab s/(theta (a^2-b^2))] sqrt((a^2+b^2)/2).
//
// Writes figures/fold-law.png. Run with  node paper/tools/exp/foldlaw-figs.mjs

import { mkdirSync } from 'node:fs';
import { view, compose, tile } from '../lib/render.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(FIGS, { recursive: true });

const INK = '#12161c';
const ACCENT = [226, 32, 92];
const SIZE = 760;


const rot = (a, p) => ({
  x: Math.cos(a) * p.x - Math.sin(a) * p.y,
  y: Math.sin(a) * p.x + Math.cos(a) * p.y,
});

/** Blend an overlay locus into an rgb buffer: alpha falls over `w` pixels of
 * the locus's own distance function (in world units at this zoom). */
function overlay(rgb, v, distFn, widthPx) {
  const pixel = 1 / v.zoom;
  const w = widthPx * pixel;
  for (let y = 0; y < v.height; y += 1) {
    for (let x = 0; x < v.width; x += 1) {
      const p = {
        x: (x + 0.5 - v.width * 0.5) / v.zoom + v.pan.x,
        y: -(y + 0.5 - v.height * 0.5) / v.zoom + v.pan.y,
      };
      const d = distFn(p);
      const a = Math.max(0, Math.min(1, 1.6 - d / (w * 0.5)));
      if (a <= 0) continue;
      const i = (y * v.width + x) * 3;
      rgb[i] += (ACCENT[0] - rgb[i]) * a;
      rgb[i + 1] += (ACCENT[1] - rgb[i + 1]) * a;
      rgb[i + 2] += (ACCENT[2] - rgb[i + 2]) * a;
    }
  }
}

const panels = [];

// --- (a) Mach wake -----------------------------------------------------------
{
  const s = 7;
  const phi = 28;
  const dlen = 1.5 * s;
  const v = view({ width: SIZE, height: SIZE, zoom: 1.35, pan: { x: 140, y: 0 }, superSample: 3 });
  const nMax = 110;
  const dist = (p) => {
    let best = Infinity;
    for (let n = 0; n <= nMax; n += 1) {
      best = Math.min(best, Math.abs(Math.hypot(p.x - n * dlen, p.y) - (n * s + phi)));
    }
    return best;
  };
  const rgb = compose(v, [{ dist, thickness: 1.2, color: INK, spacing: s }]);
  // Envelope: <p, nu> = phi with <delta, nu> = -s. The tangency to member n
  // sits at x_n = n delta + (n s + phi) nu, marching forward from x_0 = phi nu,
  // so the envelope of the n >= 0 family is the ray, not the full line.
  const cos = -s / dlen;
  const sin = Math.sqrt(1 - cos * cos);
  const rayDist = (p, nu) => {
    const x0 = { x: phi * nu.x, y: phi * nu.y };
    const t = { x: dlen + s * nu.x, y: s * nu.y };
    const tl = Math.hypot(t.x, t.y);
    const along = ((p.x - x0.x) * t.x + (p.y - x0.y) * t.y) / tl;
    if (along <= 0) return Math.hypot(p.x - x0.x, p.y - x0.y);
    return Math.abs((p.x - x0.x) * nu.x + (p.y - x0.y) * nu.y);
  };
  const machDist = (p) =>
    Math.min(rayDist(p, { x: cos, y: sin }), rayDist(p, { x: cos, y: -sin }));
  overlay(rgb, v, machDist, 2.6);
  panels.push({ rgb, width: v.width, height: v.height });
}

// --- (b) rotating hexagons ---------------------------------------------------
{
  const s = 6;
  const phi = 3;
  const theta = 0.06;
  const v = view({ width: SIZE, height: SIZE, zoom: 1.2, superSample: 3 });
  const nMax = 84;
  const S3 = Math.sqrt(3) / 2;
  const rad = (q) => {
    const ax = Math.abs(q.x);
    const ay = Math.abs(q.y);
    // Unit-inradius hexagon with two horizontal sides... facets at 0, 60, 120deg:
    return Math.max(ax, 0.5 * ax + S3 * ay);
  };
  const dist = (p) => {
    let best = Infinity;
    for (let n = 0; n <= nMax; n += 1) {
      const q = rot(-n * theta, p);
      best = Math.min(best, Math.abs(rad(q) - (n * s + phi)));
    }
    return best;
  };
  const rgb = compose(v, [{ dist, thickness: 1.0, color: INK, spacing: s }]);
  const Rstar = s / (theta * Math.sin(Math.PI / 6));
  overlay(rgb, v, (p) => Math.abs(Math.hypot(p.x, p.y) - Rstar), 2.6);
  panels.push({ rgb, width: v.width, height: v.height });
}

// --- (c) rotating ellipses ---------------------------------------------------
{
  const s = 6;
  const phi = 3;
  const theta = 0.06;
  const a = 1.4;
  const b = 1 / 1.4;
  const v = view({ width: SIZE, height: SIZE, zoom: 1.2, superSample: 3 });
  const nMax = 112;
  const dist = (p) => {
    let best = Infinity;
    for (let n = 0; n <= nMax; n += 1) {
      const q = rot(-n * theta, p);
      const g = Math.sqrt((q.x / a) ** 2 + (q.y / b) ** 2);
      best = Math.min(best, Math.abs(g - (n * s + phi)));
    }
    return best;
  };
  const rgb = compose(v, [{ dist, thickness: 1.0, color: INK, spacing: s }]);
  const rhoStar = (2 * a * b * s) / (theta * (a * a - b * b));
  const Rstar = rhoStar * Math.sqrt((a * a + b * b) / 2);
  overlay(rgb, v, (p) => Math.abs(Math.hypot(p.x, p.y) - Rstar), 2.6);
  panels.push({ rgb, width: v.width, height: v.height });
}

const grid = tile(panels, 3, 10);
writePng(new URL('fold-law.png', FIGS).pathname, grid.rgb, grid.width, grid.height);
console.log(`wrote figures/fold-law.png (${grid.width}x${grid.height})`);
