// Inverse moiré: from a target image to two families whose overlay shows it.
//
//   node paper/tools/exp/inverse-moire.mjs --out DIR [--target image.png]
//        [--size 1000] [--pitch 10] [--duty 0.5] [--wobble 0.4] [--split] [--seed 1]
//
// The theory (paper 3, sections 2 and 3). Give the base family a count xi1 and
// the second family the count xi2 = xi1 - D. The recipe (1,-1) then has combined
// count D, and a pooling observer sees the tent of the two hard strokes: for
// duties d each, the pooled transmittance is 1 - 2d + max(0, d - |D|), brightest
// where the strokes align (D = 0) and darkest where they interleave (|D| >= d).
// So a target brightness g in [0,1] is realised by the offset D = d (1 - g),
// whatever the base family is: straight lines, rings, or the wobbly random
// family used here to camouflage the modulation. Because both profiles are
// two-valued, the pooled image is the same for every pooling observer
// (Corollary 4.2(b)): the eye at arm's length, a camera out of focus, a blur.
//
// The constraints, all visible in the numbers this script prints:
//   - brightness lives in [1 - 2d, 1 - d]: with d = 1/2 the background is half
//     grey and the figure can go fully black;
//   - an edge of the target is spread over about a pitch, because D must climb
//     by d without folding the second family: |grad D| < |grad xi1|;
//   - the second layer alone shows the modulation as kinks; the random wobble
//     and --split (half the offset on each layer) reduce that, not remove it.
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { writePng } from '../lib/png.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const flag = (name) => argv.includes('--' + name);
const SIZE = +opt('size', 1000);
const P = +opt('pitch', 10); // pitch of the base family, px
const DUTY = +opt('duty', 0.5); // ink fraction of each stroke
const WOBBLE = +opt('wobble', 0.4); // |grad R| budget, as a fraction of 1/P
const SEED = +opt('seed', 1);
const SPLIT = flag('split');
const TARGET = opt('target', null);
const OUT = opt('out', null);
if (!OUT) throw new Error('give --out DIR');
mkdirSync(OUT, { recursive: true });
const SS = 3; // subsamples per pixel side

// ---- a small PNG reader: 8-bit, non-interlaced, grey / grey+alpha / RGB / RGBA.
function readPng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ctype === 3) throw new Error('export the target as an 8-bit non-interlaced grey or RGB PNG');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = new Uint8Array(w * h * ch);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    out.set(cur, y * stride);
    prev = cur;
  }
  // Luma over white, in [0,1].
  const g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * ch;
    let l = ch >= 3 ? 0.2126 * out[o] + 0.7152 * out[o + 1] + 0.0722 * out[o + 2] : out[o];
    if (ch === 2 || ch === 4) { const a = out[o + ch - 1] / 255; l = l * a + 255 * (1 - a); }
    g[i] = l / 255;
  }
  return { w, h, g };
}

// ---- the target, as brightness g in [0,1] on the SIZE x SIZE canvas.
const target = new Float32Array(SIZE * SIZE).fill(1);
if (TARGET) {
  const img = readPng(TARGET);
  const s = Math.max(img.w, img.h) / SIZE; // fit, keep aspect, white letterbox
  const ox = (SIZE - img.w / s) / 2, oy = (SIZE - img.h / s) / 2;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = (x - ox) * s - 0.5, v = (y - oy) * s - 0.5;
    if (u < 0 || v < 0 || u >= img.w - 1 || v >= img.h - 1) continue;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const i = y0 * img.w + x0;
    target[y * SIZE + x] = (1 - fy) * ((1 - fx) * img.g[i] + fx * img.g[i + 1]) + fy * ((1 - fx) * img.g[i + img.w] + fx * img.g[i + img.w + 1]);
  }
} else {
  // A heart, and a grey ramp underneath to show that grey levels work too.
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = ((x - SIZE / 2) / SIZE) * 3.2, v = -((y - SIZE * 0.42) / SIZE) * 3.2;
    const heart = Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v;
    let g = heart < 0 ? 0 : 1;
    if (y > SIZE * 0.84 && y < SIZE * 0.94 && x > SIZE * 0.1 && x < SIZE * 0.9) g = (x - SIZE * 0.1) / (SIZE * 0.8);
    target[y * SIZE + x] = g;
  }
}

// ---- separable Gaussian blur.
function blur(src, w, h, sigma) {
  const r = Math.ceil(3 * sigma);
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); acc += k[i + r] * src[y * w + xx]; }
    tmp[y * w + x] = acc;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); acc += k[i + r] * tmp[yy * w + x]; }
    out[y * w + x] = acc;
  }
  return out;
}

// The offset field D = d (1 - g), with the target softened over about a pitch
// so that D never climbs faster than the base count: no folds.
const gSoft = blur(target, SIZE, SIZE, 0.45 * P);
const D = new Float32Array(SIZE * SIZE);
for (let i = 0; i < D.length; i++) D[i] = DUTY * (1 - gSoft[i]);
const sampleD = (x, y) => {
  // bilinear, x and y in pixel units (pixel centres at integer + 0.5)
  const u = Math.min(SIZE - 1.001, Math.max(0, x - 0.5)), v = Math.min(SIZE - 1.001, Math.max(0, y - 0.5));
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const i = y0 * SIZE + x0;
  return (1 - fy) * ((1 - fx) * D[i] + fx * D[i + 1]) + fy * ((1 - fx) * D[i + SIZE] + fx * D[i + SIZE + 1]);
};

// The base family: straight lines of pitch P plus a smooth random wobble R whose
// gradient budget is WOBBLE / P, so the lines wave but never fold.
let seed = SEED >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const waves = [];
for (let j = 0; j < 3; j++) {
  const lambda = 150 + 250 * rnd();
  const theta = Math.PI * rnd();
  waves.push({ kx: (2 * Math.PI * Math.cos(theta)) / lambda, ky: (2 * Math.PI * Math.sin(theta)) / lambda, A: (WOBBLE / P) / (3 * ((2 * Math.PI) / lambda)), phi: 2 * Math.PI * rnd() });
}
const R = (x, y) => { let s = 0; for (const w of waves) s += w.A * Math.sin(w.kx * x + w.ky * y + w.phi); return s; };
const xi1 = (x, y) => x / P + R(x, y) + (SPLIT ? 0.5 * sampleD(x, y) : 0);
const xi2 = (x, y) => x / P + R(x, y) - (SPLIT ? 0.5 * sampleD(x, y) : sampleD(x, y));
const frac = (v) => v - Math.floor(v);
const ink = (xi) => frac(xi + DUTY / 2) < DUTY;

// ---- rasterise the two layers and their overlay (ink where either has ink).
const cov1 = new Float32Array(SIZE * SIZE), cov2 = new Float32Array(SIZE * SIZE), covB = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
  let c1 = 0, c2 = 0, cb = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
    const i1 = ink(xi1(px, py)), i2 = ink(xi2(px, py));
    if (i1) c1++;
    if (i2) c2++;
    if (i1 || i2) cb++;
  }
  const i = y * SIZE + x;
  cov1[i] = c1 / (SS * SS); cov2[i] = c2 / (SS * SS); covB[i] = cb / (SS * SS);
}
const grey = (cov) => { const out = new Uint8Array(SIZE * SIZE * 3); for (let i = 0; i < cov.length; i++) { const v = Math.round(255 * (1 - cov[i])); out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = v; } return out; };
const greyF = (f) => { const out = new Uint8Array(SIZE * SIZE * 3); for (let i = 0; i < f.length; i++) { const v = Math.round(255 * Math.min(1, Math.max(0, f[i]))); out[3 * i] = out[3 * i + 1] = out[3 * i + 2] = v; } return out; };

// What a pooling observer sees: the overlay blurred by one pitch.
const trans = new Float32Array(SIZE * SIZE);
for (let i = 0; i < trans.length; i++) trans[i] = 1 - covB[i];
const pooled = blur(trans, SIZE, SIZE, P);
// The theory's prediction: 1 - 2d + (d - D), i.e. 1 - 2d + d g on the softened target.
let se = 0, n = 0, sxy = 0, sxx = 0, syy = 0, mx = 0, my = 0;
for (let i = 0; i < trans.length; i++) { mx += pooled[i]; my += 1 - 2 * DUTY + DUTY * gSoft[i]; }
mx /= trans.length; my /= trans.length;
for (let y = 2 * P; y < SIZE - 2 * P; y++) for (let x = 2 * P; x < SIZE - 2 * P; x++) {
  const i = y * SIZE + x;
  const pred = 1 - 2 * DUTY + DUTY * gSoft[i];
  se += (pooled[i] - pred) ** 2; n++;
  sxy += (pooled[i] - mx) * (pred - my); sxx += (pooled[i] - mx) ** 2; syy += (pred - my) ** 2;
}
// Fold check: the second family's count must keep climbing.
let gmin = Infinity, gmax = 0;
for (let y = 1; y < SIZE - 1; y += 2) for (let x = 1; x < SIZE - 1; x += 2) {
  const gx = (xi2(x + 1.5, y + 0.5) - xi2(x - 0.5, y + 0.5)) / 2, gy = (xi2(x + 0.5, y + 1.5) - xi2(x + 0.5, y - 0.5)) / 2;
  const m = Math.hypot(gx, gy) * P;
  if (m < gmin) gmin = m;
  if (m > gmax) gmax = m;
}
console.log(`canvas ${SIZE}px, pitch ${P}px, duty ${DUTY}, wobble ${WOBBLE}${SPLIT ? ', offset split across both layers' : ''}`);
console.log(`second family's rate over the base rate: min ${gmin.toFixed(2)}, max ${gmax.toFixed(2)} (a fold would be 0)`);
console.log(`pooled overlay vs the theory's tent: rms ${(255 * Math.sqrt(se / n)).toFixed(1)} grey levels, correlation ${(sxy / Math.sqrt(sxx * syy)).toFixed(4)}`);

const put = (name, rgb) => writePng(`${OUT}/${name}`, rgb, SIZE, SIZE);
put('target.png', greyF(target));
put('layer1.png', grey(cov1));
put('layer2.png', grey(cov2));
put('overlay.png', grey(covB));
put('pooled.png', greyF(pooled));
// A contact sheet: target | layer 2 / overlay | pooled, each at half size.
const H = SIZE / 2, M = new Uint8Array(4 * H * H * 3).fill(255);
const tiles = [[greyF(target), 0, 0], [grey(cov2), H, 0], [grey(covB), 0, H], [greyF(pooled), H, H]];
for (const [rgb, ox, oy] of tiles) for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
  for (let k = 0; k < 3; k++) {
    let acc = 0;
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) acc += rgb[((2 * y + sy) * SIZE + 2 * x + sx) * 3 + k];
    M[((oy + y) * 2 * H + ox + x) * 3 + k] = Math.round(acc / 4);
  }
}
writePng(`${OUT}/sheet.png`, M, 2 * H, 2 * H);
console.log(`wrote target, layer1, layer2, overlay, pooled and sheet to ${OUT}`);
