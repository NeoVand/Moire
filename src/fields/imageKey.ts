/**
 * Hiding a picture across two layers.
 *
 * An image field on one layer shows the picture in that layer alone: a shift
 * of half a member where the picture is black is a jog anyone can see. The way
 * to hide it is the oldest trick in secret sharing, in the count's currency.
 * Take a random smooth field K and give one layer the shift `A K + D/4`, the
 * other `A K - D/4`: the recipe (1,-1) subtracts the key and keeps the
 * picture, so in register the pair shows exactly what one modulated layer
 * did, while alone each layer is a wander of lines carrying a quarter of the
 * picture's jog, which is what the wander is there to bury.
 *
 * Two details make it work. The picture's edges are softened first, so that a
 * shift of half a member never happens faster than the key's own wiggles, and
 * the key carries a fine band of ripple as well as a coarse one, so that the
 * softened edges have wiggles of their own scale to hide among. And the key's
 * gradient is budgeted against the pitch, so that neither layer folds: the
 * count keeps climbing everywhere.
 *
 * Pure array arithmetic, no DOM: the field editor calls it on a decoded
 * picture, and the paper's scene generator calls it under node.
 */

/** Members of shift at the key's full darkness, on both layers. */
export const KEY_AMOUNT = 2;

/** The key's share of the fold budget: key gradient times pitch, at most this. */
const KEY_BUDGET = 0.4;

export interface KeyedPair {
  /** The key plus an eighth of the picture, as darkness in [0, 1]. */
  key: Float32Array;
  /** The key minus an eighth of the picture, as darkness in [0, 1]. */
  payload: Float32Array;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three passes of a box blur, which is a Gaussian for every purpose here. */
function soften(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  let a = src;
  for (let pass = 0; pass < 3; pass++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * radius + 1);
        const out = Math.max(0, x - radius);
        const inn = Math.min(w - 1, x + radius + 1);
        acc += a[y * w + inn] - a[y * w + out];
      }
    }
    const next = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        next[y * w + x] = acc / (2 * radius + 1);
        const out = Math.max(0, y - radius);
        const inn = Math.min(h - 1, y + radius + 1);
        acc += tmp[inn * w + x] - tmp[out * w + x];
      }
    }
    a = next;
  }
  return a;
}

/**
 * Split a picture's darkness into a key and a payload.
 *
 * `dark` is the picture as darkness in [0, 1], row-major. `spacing` is the
 * layer's pitch and `extent` the width the image will span, both in world
 * units, so the key can be budgeted against folding. Same seed, same key.
 */
export function splitDarkness(
  dark: Float32Array,
  w: number,
  h: number,
  opts: { spacing: number; extent: number; seed?: number }
): KeyedPair {
  const { spacing, extent, seed = 1 } = opts;
  const L = Math.max(w, h);
  const rnd = mulberry32(seed);

  // The picture, its edges spread over about half a percent of the frame: as
  // steep as the key is allowed to be, and no steeper, so that an edge is not
  // the sharpest thing in either layer.
  const D = soften(dark, w, h, Math.max(1, Math.round(0.006 * L)));

  // The key: a handful of coarse waves and a few fine ones, random directions
  // and phases, normalised to [-1, 1].
  const waves: { kx: number; ky: number; a: number; phi: number }[] = [];
  const wave = (lambda: number, a: number) => {
    const theta = Math.PI * rnd();
    waves.push({
      kx: (2 * Math.PI * Math.cos(theta)) / lambda,
      ky: (2 * Math.PI * Math.sin(theta)) / lambda,
      a,
      phi: 2 * Math.PI * rnd(),
    });
  };
  for (let j = 0; j < 5; j++) wave(L * (0.18 + 0.17 * rnd()), 1);
  for (let j = 0; j < 3; j++) wave(L * (0.03 + 0.02 * rnd()), 0.3);
  // The key fades out over the last few percent at the image's border, so the
  // box the image sits in leaves no seam against the plain family outside.
  const margin = 0.06;
  const fade = (t: number) => {
    const u = Math.min(1, Math.max(0, t / margin));
    return u * u * (3 - 2 * u);
  };
  const n = new Float32Array(w * h);
  let peak = 0;
  for (let y = 0; y < h; y++) {
    const fy = fade(y / h) * fade(1 - y / h);
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (const wv of waves) s += wv.a * Math.sin(wv.kx * x + wv.ky * y + wv.phi);
      s *= fy * fade(x / w) * fade(1 - x / w);
      n[y * w + x] = s;
      if (Math.abs(s) > peak) peak = Math.abs(s);
    }
  }
  // Its steepest slope, per world unit, once it is a shift of KEY_AMOUNT members.
  let slope = 0;
  const texel = extent / w;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = (n[y * w + x + 1] - n[y * w + x - 1]) / 2;
      const gy = (n[(y + 1) * w + x] - n[(y - 1) * w + x]) / 2;
      const g = Math.hypot(gx, gy) / peak / texel;
      if (g > slope) slope = g;
    }
  }
  // Darkness 0.5 +- 0.375 inside, fading to zero at the border with the
  // wander, so the box the image sits in meets the plain family outside with
  // no jump at all. Each layer adds or subtracts up to an eighth of the
  // picture and stays inside [0, 1]; their shifts then differ by half a
  // member where the picture is black, which is the inverse moiré's full
  // contrast. The swing backs off if the key would fold the family.
  const swing = Math.min(0.375, KEY_BUDGET / Math.max(1e-9, KEY_AMOUNT * slope * spacing));
  const share = 1 / (4 * KEY_AMOUNT);
  const key = new Float32Array(w * h);
  const payload = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = fade(y / h) * fade(1 - y / h);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const level = 0.5 * fy * fade(x / w) * fade(1 - x / w);
      const k = level + (swing * n[i]) / peak;
      key[i] = Math.min(1, Math.max(0, k + share * D[i]));
      payload[i] = Math.min(1, Math.max(0, k - share * D[i]));
    }
  }
  return { key, payload };
}
