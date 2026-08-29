// CPU rasteriser for the concentric families, mirroring src/gpu/composite.ts
// term for term: same world transform, same stroke width floor, same
// antialiasing band, same accept/reject guards, same alpha composite.
//
// Slower than the GPU by orders of magnitude, but it is the only way to render
// a figure with a solver that no longer exists in the shader, and the only way
// to count work per pixel.

import { ramp } from './png.mjs';

const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, polygon: 4 };

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / Math.max(b - a, 1e-9)));
  return t * t * (3 - 2 * t);
}

export function layer(cfg = {}) {
  return {
    shape: cfg.shape ?? 'circle',
    sides: cfg.sides ?? 6,
    spacing: cfg.spacing ?? 20,
    thickness: cfg.thickness ?? 2,
    phase: cfg.phase ?? 0,
    offset: cfg.offset ?? { x: 0, y: 0 },
    rotationOffset: cfg.rotationOffset ?? 0,
    position: cfg.position ?? { x: 0, y: 0 },
    rotation: cfg.rotation ?? 0,
    opacity: cfg.opacity ?? 1,
    color: cfg.color ?? '#000000',
  };
}

export function scene(cfg = {}) {
  return {
    width: cfg.width ?? 640,
    height: cfg.height ?? 400,
    zoom: cfg.zoom ?? 1,
    pan: cfg.pan ?? { x: 0, y: 0 },
    background: cfg.background ?? '#ffffff',
    layers: (cfg.layers ?? []).map(layer),
  };
}

/**
 * Render `sc` with `solver`. Returns the RGB image plus the per-pixel count of
 * metric evaluations, which is the cost unit the paper reports.
 */
export function render(sc, solver, opts = {}) {
  const { width, height, zoom, pan } = sc;
  const superSample = opts.superSample ?? 1;
  const w = width * superSample;
  const h = height * superSample;
  const accum = new Float32Array(w * h * 3);
  const cost = new Int32Array(width * height);
  const bg = hexToRgb(sc.background);
  const { COUNT, ringDistance } = solver;

  const pixel = 1 / Math.max(zoom, 0.08);
  const aa = pixel * 0.7;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const cx = (px + 0.5) / superSample - width * 0.5;
      const cy = (py + 0.5) / superSample - height * 0.5;
      const world = { x: cx / zoom + pan.x, y: -cy / zoom + pan.y };
      let r = bg[0];
      let g = bg[1];
      let b = bg[2];
      const before = COUNT.metric;

      for (const L of sc.layers) {
        const rot = (L.rotation * Math.PI) / 180;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const local = {
          x: c * world.x + s * world.y - L.position.x,
          y: -s * world.x + c * world.y - L.position.y,
        };
        const halfT = Math.max(L.thickness * 0.5, pixel * 1.15);
        const accept = Math.max(halfT - aa, 0);
        const reject = halfT + aa;
        const d = ringDistance(
          local,
          L.offset,
          L.rotationOffset,
          L.spacing,
          L.phase,
          SHAPE_CODE[L.shape],
          L.sides,
          accept,
          reject
        );
        const alpha = (1 - smoothstep(halfT - aa, halfT + aa, d)) * L.opacity;
        if (alpha > 0) {
          const [lr, lg, lb] = hexToRgb(L.color);
          r += (lr - r) * alpha;
          g += (lg - g) * alpha;
          b += (lb - b) * alpha;
        }
      }

      const i = (py * w + px) * 3;
      accum[i] = r;
      accum[i + 1] = g;
      accum[i + 2] = b;
      const ci = Math.floor(py / superSample) * width + Math.floor(px / superSample);
      cost[ci] += COUNT.metric - before;
    }
  }

  const rgb = new Uint8Array(width * height * 3);
  const norm = superSample * superSample;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < superSample; sy++) {
        for (let sx = 0; sx < superSample; sx++) {
          const i = ((y * superSample + sy) * w + x * superSample + sx) * 3;
          r += accum[i];
          g += accum[i + 1];
          b += accum[i + 2];
        }
      }
      const o = (y * width + x) * 3;
      rgb[o] = Math.round(r / norm);
      rgb[o + 1] = Math.round(g / norm);
      rgb[o + 2] = Math.round(b / norm);
    }
  }
  if (superSample > 1) for (let i = 0; i < cost.length; i++) cost[i] = Math.round(cost[i] / norm);
  return { rgb, cost, width, height };
}

/** Log-scaled cost heatmap. `hi` is shared across a comparison so panels are readable together. */
export function costImage(cost, width, height, hi, name = 'magma') {
  const rgb = new Uint8Array(width * height * 3);
  const denom = Math.log1p(hi);
  for (let i = 0; i < cost.length; i++) {
    const [r, g, b] = ramp(Math.log1p(cost[i]) / denom, name);
    rgb[i * 3] = r;
    rgb[i * 3 + 1] = g;
    rgb[i * 3 + 2] = b;
  }
  return rgb;
}

export function costStats(cost) {
  let sum = 0;
  let max = 0;
  const sorted = Array.from(cost).sort((a, b) => a - b);
  for (const v of cost) {
    sum += v;
    if (v > max) max = v;
  }
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    mean: Math.round((sum / cost.length) * 10) / 10,
    median: pick(0.5),
    p95: pick(0.95),
    p99: pick(0.99),
    max,
  };
}

const isInk = (rgb, i) => rgb[i * 3] < 128;

/**
 * Where a solver disagrees with the reference: dropped ink in magenta, invented
 * ink in cyan, everything else the reference faded back so the pattern still
 * reads underneath.
 *
 * The markers are dilated by `grow` pixels. A figure printed at a fifth of its
 * pixel width averages single-pixel marks into the background, so without this
 * the panel that carries the finding is the one that survives least.
 */
export function dropMap(ref, test, width, height, grow = 1) {
  const drop = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = isInk(ref, i);
    const t = isInk(test, i);
    if (r !== t) drop[i] = r ? 1 : 2;
  }
  const wide = new Uint8Array(drop);
  for (let g = 0; g < grow; g++) {
    const src = new Uint8Array(wide);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (src[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (src[ny * width + nx]) {
            wide[i] = src[ny * width + nx];
            break;
          }
        }
      }
    }
  }

  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    let c;
    if (wide[i] === 1) c = [214, 31, 105];
    else if (wide[i] === 2) c = [0, 158, 176];
    else {
      const v = 176 + Math.round(ref[i * 3] * 0.31);
      c = [Math.min(255, v), Math.min(255, v), Math.min(255, v)];
    }
    rgb[i * 3] = c[0];
    rgb[i * 3 + 1] = c[1];
    rgb[i * 3 + 2] = c[2];
  }
  return rgb;
}

/** Window of the given size holding the most dropped pixels, on a coarse stride. */
export function worstWindow(ref, test, width, height, boxW, boxH) {
  let best = { x: 0, y: 0, count: -1 };
  const step = 24;
  for (let y = 0; y + boxH <= height; y += step) {
    for (let x = 0; x + boxW <= width; x += step) {
      let count = 0;
      for (let yy = y; yy < y + boxH; yy += 3) {
        for (let xx = x; xx < x + boxW; xx += 3) {
          const i = yy * width + xx;
          if (isInk(ref, i) && !isInk(test, i)) count += 1;
        }
      }
      if (count > best.count) best = { x, y, count };
    }
  }
  return best;
}

/** Nearest-neighbour magnified crop, so a hole stays a hard edge in the inset. */
export function cropScale(rgb, width, height, box, scale) {
  const w = box.w * scale;
  const h = box.h * scale;
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const sy = box.y + Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      const sx = box.x + Math.floor(x / scale);
      const si = (Math.min(height - 1, sy) * width + Math.min(width - 1, sx)) * 3;
      const di = (y * w + x) * 3;
      out[di] = rgb[si];
      out[di + 1] = rgb[si + 1];
      out[di + 2] = rgb[si + 2];
    }
  }
  return { rgb: out, width: w, height: h };
}

/** Absolute per-pixel difference against a reference render, as a percentage of pixels. */
export function imageDiff(a, b) {
  let differing = 0;
  let worst = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2])
    );
    if (d > 8) differing += 1;
    if (d > worst) worst = d;
    sum += d;
  }
  const n = a.length / 3;
  return {
    fractionDiffering: Math.round((differing / n) * 10000) / 10000,
    meanAbs: Math.round((sum / n) * 100) / 100,
    worst,
  };
}
