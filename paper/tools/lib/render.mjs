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
 * The GPU envelope's sweep for a solver-backed layer, mirrored on the CPU: one
 * solve per pixel yields the winning member and both neighbours (the
 * `ringPhaseCpu` trio), and each tap slides that residual by u of the *measured*
 * local gap, exactly `phaseDistWgsl`. Re-solving with the phase advanced by
 * u*spacing -- the old `distAt` sweep -- is wrong for a walking family: one
 * period of solver phase advances the local index by 1/(1 + drift/gap), so the
 * sweep covers a non-integer number of carrier cycles and the carrier survives
 * the average as a drift-proportional ripple.
 */
function phaseSampler(L) {
  let kx = NaN;
  let ky = NaN;
  let ph = null;
  return (p) => {
    if (p.x !== kx || p.y !== ky) {
      kx = p.x;
      ky = p.y;
      ph = L.phaseAt(p);
    }
    return ph;
  };
}

const trioDist = (ph, d) =>
  Math.max(
    Math.min(Math.abs(ph.r - d), Math.abs(ph.rUp - d), Math.abs(ph.rDown - d)),
    ph.floor
  );

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
    // `phaseAt` is the preferred hook for a solver-backed layer: (p) => the
    // solver's {r, rUp, rDown, floor} trio, swept by sliding the residual within
    // the measured local gap (see phaseSampler above). The one-point memo makes
    // the whole sweep cost a single solve per pixel.
    const sample = L.phaseAt ? phaseSampler(L) : null;
    return {
      // `dist` lets a caller substitute a distance the field library cannot supply
      // without duplicating the composite. `distAt`, its phase-advanced form
      // (p, halfT, aa, u), survives for layers that genuinely repeat under a
      // phase advance; a walking family does not -- give it `phaseAt` instead.
      fam: L.dist || sample ? null : family(L),
      swept:
        taps <= 0
          ? null
          : sample
            ? Array.from({ length: taps }, (_, k) => ({
                dist: (p) => {
                  const ph = sample(p);
                  const gap = Math.max(Math.abs(ph.rUp - ph.r), 1e-6);
                  return trioDist(ph, (k / taps) * gap);
                },
              }))
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
                : L.kind === 'lattice'
                  ? // A lattice has no scalar residual. Each tap resamples the
                    // cell: generator 1 rides u, generator 2 the golden scramble,
                    // so a twist pair that shares (u, v) keeps both slow
                    // characters and washes the carriers.
                    Array.from({ length: taps }, (_, k) =>
                      family({
                        ...L,
                        cellShift: {
                          u: k / taps - 0.5,
                          v: ((k * 0.6180339887498949) % 1) - 0.5,
                        },
                      })
                    )
                : Array.from({ length: taps }, (_, k) =>
                    family({ ...L, phaseShift: (L.phaseShift ?? 0) + (k / taps) * spacing })
                  ),
      dist:
        L.dist ??
        (sample
          ? (p) => trioDist(sample(p), 0)
          : L.distAt
            ? (p, halfT, aa) => L.distAt(p, halfT, aa, 0)
            : null),
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
function inkAt(built, p, pixel, aa, bg, out, tap = -1, flip = null, alphas = null) {
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
    // Each layer's own alpha, before the early exit: the envelope composits
    // per-layer tap means into its per-pixel pivot.
    if (alphas) alphas[li] += alpha;
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
 * averaged over one period of the phase every layer shares, then expanded by
 * `contrast` about the per-pixel INDEPENDENT-PHASE mean — each layer's own
 * tap mean, composited in paint order. That pivot is the DC of the envelope
 * with every beat correlation left out, so the expansion amplifies exactly
 * the correlation term; where no beat stands, mean == pivot and the view
 * sits at the true local gray at any contrast. It has to be per pixel: a
 * radial pencil's duty falls with radius, and grading that drifting DC
 * about one nominal constant slammed three dense fans to a black frame
 * around a blown core (the old `autoPivot` measured a global mean instead,
 * which is only right when the drift is negligible).
 *
 * Inside the average the stroke keeps its TRUE width (no hairline floor):
 * the floor keeps a render's line visible on a screen, but inside the mean
 * it inflates duty as the zoom falls and drains the beat modulation out of
 * the average. Sub-pixel strokes keep correct mean coverage through the aa
 * ramp, which is all the integral needs.
 *
 * It is not a blur. Nothing is sampled off-centre and no raster is filtered --
 * the average is over the phase parameter of Theorem 1, whose hypothesis is
 * exactly that all families advance together over the averaging neighbourhood.
 * So it is the theorem's own quantity, at full spatial resolution, and it does
 * not change with zoom.
 */
export function envelope(v, layers, opts = {}) {
  // `lift` is the tool's exposure slider, a flat shift after the expansion,
  // in [0, 1] of full white.
  const { contrast = 3, taps = ENVELOPE_TAPS, lift = 0 } = opts;
  const bg = hexToRgb(v.background);
  const pixel = 1 / Math.max(v.zoom, 0.08);
  const aa = pixel * 0.7;
  const built = build(layers.map((L) => ({ ...L, floor: L.floor ?? 0 })), taps);
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

  // A sole layer's per-pixel pivot equals its own mean identically (nothing
  // to correlate with), which would leave `contrast` dead and its drift
  // structure flat — but a single family's duty drift IS its picture (a
  // walking family's bunching). With one layer the grading falls back to a
  // constant: the frame's own mean ink, measured on a coarse grid.
  let soloPivot = null;
  if (built.length === 1) {
    const acc = [0, 0, 0];
    let n = 0;
    for (let y = 2; y < v.height; y += 5) {
      for (let x = 2; x < v.width; x += 5) {
        inkAt(built, worldOf(v, x, y, 1), pixel, aa, bg, hit, -1, null);
        for (let k = 0; k < 3; k++) acc[k] += hit[k];
        n += 1;
      }
    }
    soloPivot = acc.map((s) => s / Math.max(1, n));
  }

  const rgb = new Uint8Array(v.width * v.height * 3);
  const layerSum = new Float64Array(built.length);
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const p = worldOf(v, x, y, 1);
      if (flip) flip.on = flipAt(p);
      let r = 0;
      let g = 0;
      let b = 0;
      layerSum.fill(0);
      for (let tap = 0; tap < taps; tap++) {
        inkAt(built, p, pixel, aa, bg, hit, tap, flip, layerSum);
        r += hit[0];
        g += hit[1];
        b += hit[2];
      }
      // The pivot: each layer's own mean alpha over the taps, composited in
      // paint order — the mean the stack would have if its phases were
      // independent.
      const pivot = soloPivot ? [...soloPivot] : [bg[0], bg[1], bg[2]];
      if (!soloPivot)
        for (let li = 0; li < built.length; li++) {
          const m = layerSum[li] / taps;
          for (let k = 0; k < 3; k++) pivot[k] += (built[li].color[k] - pivot[k]) * m;
        }
      const i = (y * v.width + x) * 3;
      for (let k = 0; k < 3; k++) {
        const mean = [r, g, b][k] / taps;
        rgb[i + k] = Math.round(
          Math.min(255, Math.max(0, pivot[k] + (mean - pivot[k]) * contrast + lift * 255))
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
  const {
    color = [200, 24, 90],
    width = 1.1,
    offset = 0,
    opacity = 1,
    mask,
    // `mask` is a criterion, and a criterion has an edge. Applied as a per-pixel
    // yes/no the edge lands on the pixel grid, so a curve ends in a ragged taper
    // that reads as a broken drawing rather than as the boundary of a claim. This
    // is the width of the band, in units of the mask's own value, over which the
    // curve fades out as it approaches the edge. The mask still admits exactly
    // what it admitted: nothing is drawn on the far side of it.
    maskFade = 0,
    // Below this spacing between consecutive level sets, in device pixels, the
    // curves cannot be told apart and drawing them produces speckle rather than
    // information -- which is what happened at the centre of a rosette, where the
    // index difference is singular and its level sets crowd below the pixel. Zero
    // keeps the old behaviour.
    minPitchPx = 0,
  } = opts;
  const out = new Uint8Array(rgb);
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const p = worldOf(v, x, y, 1);
      let admit = 1;
      if (mask) {
        const m = mask(p);
        // A boolean mask keeps the old hard edge; a numeric one is the criterion's
        // own value, faded over the last `maskFade` of its range.
        admit = typeof m === 'number' ? 1 - smoothstep(-maskFade, 0, m) : m ? 1 : 0;
        if (admit <= 0.002) continue;
      }
      const val = fn(p) - offset;
      if (!Number.isFinite(val)) continue;
      // Distance to the nearest integer level, in pixels, via the local gradient.
      const h = 0.75 / v.zoom;
      const gx = (fn({ x: p.x + h, y: p.y }) - fn({ x: p.x - h, y: p.y })) / (2 * h);
      const gy = (fn({ x: p.x, y: p.y + h }) - fn({ x: p.x, y: p.y - h })) / (2 * h);
      const g = Math.hypot(gx, gy);
      if (!(g > 1e-12)) continue;
      if (minPitchPx > 0) {
        // One unit of the level index spans 1/g in world, hence zoom/g on screen.
        const pitchPx = v.zoom / g;
        admit *= smoothstep(minPitchPx * 0.7, minPitchPx, pitchPx);
        if (admit <= 0.002) continue;
      }
      const dWorld = periodicDist(val, 1) / g;
      const dPix = dWorld * v.zoom;
      const alpha = opacity * admit * (1 - smoothstep(width * 0.5, width * 0.5 + 0.9, dPix));
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
/**
 * Two renders of one scene in one panel, cut along a diagonal and separated by the
 * dashed rule the teaser uses.
 *
 * The teaser cuts left/right, which suits a wide strip; a grid of square panels
 * reads better cut corner to corner, and the diagonal gives each half a corner of
 * its own rather than a tall slice. The seam runs from the bottom-left corner to
 * the top-right, so `a` occupies the upper left and `b` the lower right.
 *
 * The rule alternates black and white dashes for the same reason it does there:
 * it is the one style that stays visible against both a dark weave and a pale
 * envelope. Width and dash length scale with the panel so a grid of small panels
 * gets the same rule a large one does, in proportion.
 */
export function splitDiagonal(a, b, v, opts = {}) {
  const { unit = v.width / 480, dash = 9, width = 2 } = opts;
  const rgb = new Uint8Array(a.length);
  // The cut is the line x/W + y/H = 1. Normalising by the gradient turns the
  // implicit value into a signed distance in pixels, so the rule has an even
  // thickness rather than one that varies with the panel's aspect.
  const nx = 1 / v.width;
  const ny = 1 / v.height;
  const len = Math.hypot(nx, ny);
  const half = Math.max(1, (width * unit) / 2);
  const step = Math.max(3, dash * unit);
  for (let y = 0; y < v.height; y++) {
    for (let x = 0; x < v.width; x++) {
      const i = (y * v.width + x) * 3;
      const d = (nx * x + ny * y - 1) / len;
      if (Math.abs(d) <= half) {
        // Position along the seam, so the dashes march down it evenly.
        const t = (-ny * x + nx * y) / len;
        const ink = Math.floor(t / step) % 2 === 0 ? 0 : 255;
        rgb[i] = ink;
        rgb[i + 1] = ink;
        rgb[i + 2] = ink;
        continue;
      }
      const src = d < 0 ? a : b;
      rgb[i] = src[i];
      rgb[i + 1] = src[i + 1];
      rgb[i + 2] = src[i + 2];
    }
  }
  return rgb;
}

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
