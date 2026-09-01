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

/** Stamp a polyline (array of world points, assumed densely sampled) into the
 * rgb buffer with round caps, `widthPx` wide; `dash` (world units on/off), if
 * given, breaks it into dashes by accumulated arclength. */
function stampPolyline(rgb, v, pts, widthPx, dash = 0) {
  const rad = (widthPx / 2) * 1.0;
  let arc = 0;
  let prev = null;
  for (const p of pts) {
    if (prev) arc += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
    if (dash > 0 && (arc / dash) % 2 > 1) continue;
    const px = (p.x - v.pan.x) * v.zoom + v.width * 0.5;
    const py = -(p.y - v.pan.y) * v.zoom + v.height * 0.5;
    const r = Math.ceil(rad + 1);
    for (let dy = -r; dy <= r; dy += 1) {
      const yy = Math.round(py) + dy;
      if (yy < 0 || yy >= v.height) continue;
      for (let dx = -r; dx <= r; dx += 1) {
        const xx = Math.round(px) + dx;
        if (xx < 0 || xx >= v.width) continue;
        const d = Math.hypot(xx - px, yy - py);
        const a = Math.max(0, Math.min(1, rad + 0.7 - d));
        if (a <= 0) continue;
        const i = (yy * v.width + xx) * 3;
        rgb[i] += (ACCENT[0] - rgb[i]) * a;
        rgb[i + 1] += (ACCENT[1] - rgb[i + 1]) * a;
        rgb[i + 2] += (ACCENT[2] - rgb[i + 2]) * a;
      }
    }
  }
}

/** Densely sampled circle polyline. */
const circlePts = (R, step = 0.35) =>
  Array.from({ length: Math.ceil((TAU * R) / step) + 1 }, (_, i) => {
    const t = (TAU * i) / Math.ceil((TAU * R) / step);
    return { x: R * Math.cos(t), y: R * Math.sin(t) };
  });

const TAU = Math.PI * 2;

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
  // The caustic: per vertex arc, the smooth branch rho(w) = s H / (theta H'),
  // plus the vertex trajectory itself (a support corner absorbs a slope range,
  // so past onset the vertex path is envelope too). Crossings of consecutive
  // members are born on these curves (gated in foldlaw.mjs).
  const rhoMax = 470;
  const rhoStar = s / (theta * Math.tan(Math.PI / 6));
  const sec = 2 / Math.sqrt(3);
  for (let j = 0; j < 6; j += 1) {
    const beta = (Math.PI / 3) * j + Math.PI / 6;
    const branch = [];
    for (let i = 0; i <= 8000; i += 1) {
      const w = -Math.PI / 6 + ((Math.PI / 6 - 1e-3) * i) / 8000;
      const H = sec * Math.cos(w);
      const dH = -sec * Math.sin(w);
      if (dH <= 1e-9) continue;
      const rho = (s * H) / (theta * dH);
      if (rho < phi || rho > rhoMax) continue;
      const u = beta + w + ((rho - phi) / s) * theta;
      branch.push({
        x: rho * (H * Math.cos(u) - dH * Math.sin(u)),
        y: rho * (H * Math.sin(u) + dH * Math.cos(u)),
      });
    }
    stampPolyline(rgb, v, branch, 2.4);
    const vertex = [];
    for (let i = 0; i <= 3000; i += 1) {
      const rho = rhoStar + ((rhoMax - rhoStar) * i) / 3000;
      const ang = beta + ((rho - phi) / s) * theta;
      vertex.push({ x: rho * sec * Math.cos(ang), y: rho * sec * Math.sin(ang) });
    }
    stampPolyline(rgb, v, vertex, 2.4);
  }
  // Onset: below this circle the calculus forbids any fold. Dashed, as a cue.
  stampPolyline(rgb, v, circlePts(s / (theta * Math.sin(Math.PI / 6))), 1.4, 6);
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
  // The two caustic branches: rho(u) = s H / (theta H') on the halves where
  // H' > 0, mapped through the frame turn.
  const He = (u) => Math.sqrt(a * a * Math.cos(u) ** 2 + b * b * Math.sin(u) ** 2);
  const dHe = (u) => ((b * b - a * a) * Math.sin(u) * Math.cos(u)) / He(u);
  const rhoMax = 470;
  for (const [lo, hi] of [[-Math.PI / 2 + 1e-3, -1e-3], [Math.PI / 2 + 1e-3, Math.PI - 1e-3]]) {
    const branch = [];
    for (let i = 0; i <= 20000; i += 1) {
      const u = lo + ((hi - lo) * i) / 20000;
      const H = He(u);
      const dH = dHe(u);
      if (dH <= 1e-9) continue;
      const rho = (s * H) / (theta * dH);
      if (rho < phi || rho > rhoMax) continue;
      const uw = u + ((rho - phi) / s) * theta;
      branch.push({
        x: rho * (H * Math.cos(uw) - dH * Math.sin(uw)),
        y: rho * (H * Math.sin(uw) + dH * Math.cos(uw)),
      });
    }
    stampPolyline(rgb, v, branch, 2.4);
  }
  const rhoStar = (2 * a * b * s) / (theta * (a * a - b * b));
  stampPolyline(rgb, v, circlePts(rhoStar * Math.sqrt((a * a + b * b) / 2)), 1.4, 6);
  panels.push({ rgb, width: v.width, height: v.height });
}

const grid = tile(panels, 3, 10);
writePng(new URL('fold-law.png', FIGS).pathname, grid.rgb, grid.width, grid.height);
console.log(`wrote figures/fold-law.png (${grid.width}x${grid.height})`);
