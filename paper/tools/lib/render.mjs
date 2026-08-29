// A CPU renderer over the field library, matching src/gpu/composite.ts term for
// term: same world transform, same stroke floor, same antialias band, same
// over-composite. Slower than the shader by orders of magnitude, but it can
// render a field the shader does not have (an index field, a corrected
// distance, a solver that no longer exists) and it can count work per pixel.

import { ENVELOPE_TAPS } from '../../../src/types/moire.ts';
import { family, gradIndex, periodicDist } from './fields.mjs';
import { ramp } from './png.mjs';

export { ENVELOPE_TAPS };

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-9)));
  return t * t * (3 - 2 * t);
}

export function view(cfg = {}) {
  return {
    width: cfg.width ?? 640,
    height: cfg.height ?? 400,
    zoom: cfg.zoom ?? 1,
    pan: cfg.pan ?? { x: 0, y: 0 },
    background: cfg.background ?? '#ffffff',
    superSample: cfg.superSample ?? 2,
  };
}

/** World position of a (possibly supersampled) device pixel. */
function worldOf(v, x, y, ss) {
  const cx = (x + 0.5) / ss - v.width * 0.5;
  const cy = (y + 0.5) / ss - v.height * 0.5;
  return { x: cx / v.zoom + v.pan.x, y: -cy / v.zoom + v.pan.y };
}

/**
 * Resolve layer configs once. Each entry is `{ ...familyCfg, thickness, color,
 * opacity, useGrad }`; `useGrad = false` reproduces the shipped shader for the
 * families that omit the gradient divide.
 *
 * `taps > 0` also builds the phase-advanced copies the envelope averages over,
 * once, rather than per pixel.
 */
function build(layers, taps = 0) {
  return layers.map((L) => {
    const spacing = L.spacing ?? 20;
    return {
      // `dist` lets a caller substitute a distance the field library cannot supply
      // -- the walking solver, say -- without duplicating the composite. `distAt`
      // is its phase-advanced form, (p, halfT, aa, u) with u in periods, so a
      // solver-backed layer can join the envelope's sweep: advancing the walking
      // family's phase by u*spacing advances every member by u, exactly as
      // phaseShift does for the closed forms.
      fam: L.dist ? null : family(L),
      swept:
        taps <= 0
          ? null
          : L.distAt
            ? Array.from({ length: taps }, (_, k) => ({
                dist: (p, halfT, aa) => L.distAt(p, halfT, aa, k / taps),
              }))
            : L.dist
              ? null
              : L.kind === 'radial'
                ? // A radial pencil spends the advancing index as a rotation:
                  // one index period is one line gap, 180/N degrees.
                  Array.from({ length: taps }, (_, k) =>
                    family({
                      ...L,
                      rotation:
                        (L.rotation ?? 0) + (k / taps) * (180 / Math.max(1, Math.round(L.lineCount ?? 8))),
                    })
                  )
                : Array.from({ length: taps }, (_, k) =>
                    family({ ...L, phaseShift: (L.phaseShift ?? 0) + (k / taps) * spacing })
                  ),
      dist: L.dist ?? (L.distAt ? (p, halfT, aa) => L.distAt(p, halfT, aa, 0) : null),
      thickness: L.thickness ?? 1.8,
      color: hexToRgb(L.color ?? '#000000'),
      opacity: L.opacity ?? 1,
      useGrad: L.useGrad !== false,
      spacing,
      // Pixels of stroke half-width below which the shader refuses to go. 1.15 is
      // what ships; 0 reproduces a renderer without the floor, for the zoom figure.
      floor: L.floor ?? 1.15,
    };
  });
}

/**
 * Background, then every layer over it: the shader's running mix, term for term.
 * `u` advances every layer's phase by that fraction of its own period, which is
 * the one parameter the envelope averages over; at `u = 0` this is the render.
 */
function inkAt(built, p, pixel, aa, bg, out, tap = -1, flip = null) {
  out[0] = bg[0];
  out[1] = bg[1];
  out[2] = bg[2];
  for (let li = 0; li < built.length; li++) {
    const L = built[li];
    const halfT = Math.max(L.thickness * 0.5, pixel * L.floor);
    // The sum-aware sweep: the flipped layer takes the mirrored tap, which is
    // the same period walked backwards -- its own average is unchanged, but the
    // correlation with the other layer preserves phi1 + phi2 instead of
    // phi1 - phi2, so a sum moire survives the average.
    const useTap = flip && li === flip.index && flip.on ? flip.taps - 1 - tap : tap;
    const swept = tap < 0 || !L.swept ? null : L.swept[useTap];
    const d = swept
      ? swept.dist
        ? swept.dist(p, halfT, aa)
        : L.useGrad
          ? swept.distance(p)
          : swept.distanceNoGrad(p)
      : L.dist
        ? L.dist(p, halfT, aa)
        : L.useGrad
          ? L.fam.distance(p)
          : L.fam.distanceNoGrad(p);
    const alpha = (1 - smoothstep(halfT - aa, halfT + aa, d)) * L.opacity;
    if (alpha <= 0) continue;
    out[0] += (L.color[0] - out[0]) * alpha;
    out[1] += (L.color[1] - out[1]) * alpha;
    out[2] += (L.color[2] - out[2]) * alpha;
  }
  return out;
}

/** Composite a list of layers. */
export function compose(v, layers) {
  const ss = v.superSample;
  const W = v.width * ss;
  const H = v.height * ss;
  const bg = hexToRgb(v.background);
  const pixel = 1 / Math.max(v.zoom, 0.08);
  const aa = pixel * 0.7;
  const built = build(layers);
  const hit = [0, 0, 0];

  const acc = new Float32Array(v.width * v.height * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      inkAt(built, worldOf(v, x, y, ss), pixel, aa, bg, hit);
      const o = (Math.floor(y / ss) * v.width + Math.floor(x / ss)) * 3;
      acc[o] += hit[0];
      acc[o + 1] += hit[1];
      acc[o + 2] += hit[2];
    }
  }

  const rgb = new Uint8Array(v.width * v.height * 3);
  const norm = ss * ss;
  for (let i = 0; i < rgb.length; i++) rgb[i] = Math.round(acc[i] / norm);
  return rgb;
}

/**
 * The tool's envelope view, mirroring src/gpu/composite.ts: the same composite
 * averaged over one period of the phase every layer shares, then expanded about
 * the stack's nominal coverage by `contrast`.
 *
 * It is not a blur. Nothing is sampled off-centre and no raster is filtered --
 * the average is over the phase parameter of Theorem 1, whose hypothesis is
 * exactly that all families advance together over the averaging neighbourhood.
 * So it is the theorem's own quantity, at full spatial resolution, and it does
 * not change with zoom.
 */
export function envelope(v, layers, opts = {}) {
  const { contrast = 3, taps = ENVELOPE_TAPS } = opts;
  const bg = hexToRgb(v.background);
  const pixel = 1 / Math.max(v.zoom, 0.08);
  const aa = pixel * 0.7;
  const built = build(layers, taps);
  const hit = [0, 0, 0];

  // The tool's orientation-aware sweep, mirrored here: a family's index sign is
  // a convention, so between the last two closed-form layers the beat lives in
  // whichever of the difference and the sum is slower, and where the sum wins
  // the second layer walks its period backwards. Solver-backed layers carry no
  // index function on this path, so pairs involving one keep the diagonal.
  const withFam = built.map((L, i) => (L.fam ? i : -1)).filter((i) => i >= 0);
  const pair = withFam.length >= 2 ? withFam.slice(-2) : null;
  const flip = pair ? { index: pair[1], taps, on: false } : null;
  const famA = pair ? built[pair[0]].fam : null;
  const famB = pair ? built[pair[1]].fam : null;
  const flipAt = (p) => {
    if (!pair) return false;
    const a = gradIndex(famA, p);
    const b = gradIndex(famB, p);
    const gd = Math.hypot(a.x - b.x, a.y - b.y);
    const gs = Math.hypot(a.x + b.x, a.y + b.y);
    return gs < gd;
  };

  // Coverage a family averages over one of its own periods: a stroke of
  // half-width h on pitch s inks 2h/s. The pivot the contrast expands about.
  const pivot = [...bg];
  for (const L of built) {
    const halfT = Math.max(L.thickness * 0.5, pixel * L.floor);
    const cov = Math.min(1, (2 * halfT) / Math.max(L.spacing, 1e-3)) * L.opacity;
    for (let k = 0; k < 3; k++) pivot[k] += (L.color[k] - pivot[k]) * cov;
  }

  const rgb = new Uint8Array(v.width * v.height * 3);
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const p = worldOf(v, x, y, 1);
      if (flip) flip.on = flipAt(p);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let tap = 0; tap < taps; tap++) {
        inkAt(built, p, pixel, aa, bg, hit, tap, flip);
        r += hit[0];
        g += hit[1];
        b += hit[2];
      }
      const i = (y * v.width + x) * 3;
      for (let k = 0; k < 3; k++) {
        const mean = [r, g, b][k] / taps;
        rgb[i + k] = Math.round(
          Math.min(255, Math.max(0, pivot[k] + (mean - pivot[k]) * contrast))
        );
      }
    }
  }
  return rgb;
}

/** Scalar field of world position, colour-mapped. `wrap` shows it modulo 1. */
export function fieldImage(v, fn, opts = {}) {
  const { name = 'viridis', lo = null, hi = null, wrap = false } = opts;
  const vals = new Float64Array(v.width * v.height);
  let mn = Infinity;
  let mx = -Infinity;
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const val = fn(worldOf(v, x, y, 1));
      vals[y * v.width + x] = val;
      if (Number.isFinite(val)) {
        if (val < mn) mn = val;
        if (val > mx) mx = val;
      }
    }
  }
  const a = lo ?? mn;
  const b = hi ?? mx;
  const rgb = new Uint8Array(v.width * v.height * 3);
  for (let i = 0; i < vals.length; i++) {
    let t;
    if (wrap) {
      const f = vals[i] - Math.floor(vals[i]);
      t = f;
    } else {
      t = (vals[i] - a) / Math.max(b - a, 1e-9);
    }
    const [r, g, bl] = ramp(Math.min(1, Math.max(0, t)), name);
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = bl;
  }
  return { rgb, min: mn, max: mx };
}

/**
 * Draw the level sets of `fn` at unit spacing over an existing image. This is how
 * the fringe figure is checked: the curves are computed from the index difference
 * alone and laid over a render that never saw them.
 */
export function overlayLevelSets(rgb, v, fn, opts = {}) {
  const { color = [200, 24, 90], width = 1.1, offset = 0, opacity = 1, mask } = opts;
  const out = new Uint8Array(rgb);
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const p = worldOf(v, x, y, 1);
      if (mask && !mask(p)) continue;
      const val = fn(p) - offset;
      if (!Number.isFinite(val)) continue;
      // Distance to the nearest integer level, in pixels, via the local gradient.
      const h = 0.75 / v.zoom;
      const gx = (fn({ x: p.x + h, y: p.y }) - fn({ x: p.x - h, y: p.y })) / (2 * h);
      const gy = (fn({ x: p.x, y: p.y + h }) - fn({ x: p.x, y: p.y - h })) / (2 * h);
      const g = Math.hypot(gx, gy);
      if (!(g > 1e-12)) continue;
      const dWorld = periodicDist(val, 1) / g;
      const dPix = dWorld * v.zoom;
      const alpha = opacity * (1 - smoothstep(width * 0.5, width * 0.5 + 0.9, dPix));
      if (alpha <= 0.002) continue;
      const i = (y * v.width + x) * 3;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(out[i + k] + (color[k] - out[i + k]) * alpha);
    }
  }
  return out;
}

/**
 * What the eye takes from a superposition: an isotropic low pass a couple of
 * carrier periods wide, applied to luminance and stretched to fill the range. The
 * carrier disappears and the fringe field is what is left, which is the quantity
 * Theorem 1 is a statement about. `sigma` is in device pixels.
 */
export function lowPassLuma(rgb, v, sigma, opts = {}) {
  const { lo = 18, hi = 250 } = opts;
  const W = v.width;
  const H = v.height;
  const rad = Math.ceil(2.5 * sigma);
  const k = [];
  for (let d = -rad; d <= rad; d++) k.push(Math.exp((-d * d) / (2 * sigma * sigma)));

  const rowPass = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let w = 0;
      for (let d = -rad; d <= rad; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= W) continue;
        const i = (y * W + xx) * 3;
        s += (0.299 * rgb[i] + 0.587 * rgb[i + 1] + 0.114 * rgb[i + 2]) * k[d + rad];
        w += k[d + rad];
      }
      rowPass[y * W + x] = s / w;
    }
  }

  const col = new Float64Array(W * H);
  let mn = Infinity;
  let mx = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      let w = 0;
      for (let d = -rad; d <= rad; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= H) continue;
        s += rowPass[yy * W + x] * k[d + rad];
        w += k[d + rad];
      }
      const val = s / w;
      col[y * W + x] = val;
      if (val < mn) mn = val;
      if (val > mx) mx = val;
    }
  }

  const out = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const t = (col[i] - mn) / Math.max(mx - mn, 1e-9);
    const g = Math.round(lo + t * (hi - lo));
    out[i * 3] = g;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = g;
  }
  return out;
}

/** Side-by-side panel assembly with a hairline gutter, so figures stay one file. */
export function tile(panels, cols, gutter = 8, bg = 245) {
  const pw = panels[0].width;
  const ph = panels[0].height;
  const rows = Math.ceil(panels.length / cols);
  const W = cols * pw + (cols - 1) * gutter;
  const H = rows * ph + (rows - 1) * gutter;
  const out = new Uint8Array(W * H * 3).fill(bg);
  panels.forEach((panel, i) => {
    const cx = (i % cols) * (pw + gutter);
    const cy = Math.floor(i / cols) * (ph + gutter);
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        const s = (y * pw + x) * 3;
        const d = ((cy + y) * W + cx + x) * 3;
        out[d] = panel.rgb[s];
        out[d + 1] = panel.rgb[s + 1];
        out[d + 2] = panel.rgb[s + 2];
      }
    }
  });
  return { rgb: out, width: W, height: H };
}
