// The exact sweep, certified. The envelope of an all-scalar stack is not
// sampled: each layer's swept profile is piecewise cubic in the sweep
// parameter with corners the phase trio names in closed form, so the mean is
// segmented at the corners and integrated by Gauss-3 per segment. This script
// is the receipt behind that claim, three ways at once:
//   - a 65536-tap midpoint truth in double precision, per scene;
//   - a JavaScript twin of the shader's integrator (residue streams, K-way
//     cursor merge, Gauss-3, and Gauss-4 as the corner-completeness check),
//     so the arithmetic is certified independently of f32;
//   - the SHIPPED WGSL itself, compiled by paper/tools/gpu/exactsweep.mjs into
//     a compute pass over the same trios (Vite + headless Chrome + WebGPU),
//     so the renderer's own code is what gets measured.
// Scenes are drawn from every regime the integrator has to survive: pairs
// and trios on the diagonal and on deviated schedules up to the rate-12
// station, walking families' asymmetric trios, radial floors, sub-pixel
// strokes, and strokes that nearly touch. The tap loop the exact path
// replaced is run beside it at 24 and 52 taps, which is where the "annoying
// envelope artifacts" came from. Writes paper/data/exactsweep.json.
// Run: node paper/tools/exp/exactsweep.mjs   (needs the GPU; ~1 min)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const OUT = new URL('../../data/exactsweep.json', import.meta.url);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SLOTS = 3;
const STRIDE = 1 + 3 * SLOTS;
const TRUTH_TAPS = 65536;

// ------------------------------------------------------------ the integrand
// Twin of exactTrioDist / exactAlphaWgsl: the slid trio distance through the
// stroke profile. Every estimator below integrates exactly this.
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const trioDist = (ph, rate, u) => {
  const gap = Math.max(Math.abs(ph[1] - ph[0]), 1e-6);
  const off = u * rate * gap;
  const wrapped = off - Math.round(off / gap) * gap;
  const near = Math.min(Math.abs(ph[0] - wrapped), Math.abs(ph[1] - wrapped), Math.abs(ph[2] - wrapped));
  return Math.max(near, ph[3]);
};
const alphaAt = (L, u) =>
  Math.min(1, Math.max(0, (1 - smoothstep(L.pr[0] - L.pr[1], L.pr[0] + L.pr[1], trioDist(L.ph, L.rate, u))) * L.pr[2]));
const composite = (layers, u) => {
  let c = 1;
  for (const L of layers) if (L.act > 0.5) c *= 1 - alphaAt(L, u);
  return c;
};

// ------------------------------------------------------------ the twin
// exactResidues, line for line: the corners of one layer's profile folded
// into residues modulo its own period past lo, sorted.
const fract = (x) => x - Math.floor(x);
function residues(ph, pr, rate, lo) {
  const gap = Math.max(Math.abs(ph[1] - ph[0]), 1e-6);
  const rg = rate * gap;
  const P = 1 / Math.max(Math.abs(rate), 1e-6);
  const hlo = pr[0] - pr[1];
  const hhi = pr[0] + pr[1];
  const c = [ph[0], ph[0] - hhi, ph[0] + hhi, gap * 0.5];
  if (hlo > 0) c.push(ph[0] - hlo, ph[0] + hlo);
  if (ph[3] > 0) c.push(ph[0] - ph[3], ph[0] + ph[3]);
  const upGap = ph[1] - ph[0];
  const dnGap = ph[0] - ph[2];
  if (Math.abs(upGap - dnGap) > 1e-4 * gap) {
    c.push(ph[1], ph[1] - hhi, ph[1] + hhi, ph[2], ph[2] - hhi, ph[2] + hhi);
    if (hlo > 0 && c.length <= 16) c.push(ph[1] - hlo, ph[1] + hlo, ph[2] - hlo, ph[2] + hlo);
  }
  if (hhi > 0.499 * upGap && c.length < 20) c.push((ph[0] + ph[1]) * 0.5);
  if (hhi > 0.499 * dnGap && c.length < 20) c.push((ph[0] + ph[2]) * 0.5);
  const res = c.map((v) => fract((v / rg - lo) / P) * P).sort((a, b) => a - b);
  return { res, P };
}
const GAUSS3 = [
  [0.1127016653792583, 0.2777777777777778],
  [0.5, 0.4444444444444444],
  [0.8872983346207417, 0.2777777777777778],
];
const GAUSS4 = [
  [0.0694318442029737, 0.1739274225687269],
  [0.3300094782075719, 0.3260725774312731],
  [0.6699905217924281, 0.3260725774312731],
  [0.9305681557970263, 0.1739274225687269],
];
// exactChain: the K-way cursor merge over each layer's residue stream.
function chain(sweep, layers, gauss) {
  const lo = -sweep / 2;
  const hi = sweep / 2;
  const st = layers.map((L) => {
    if (L.act <= 0.5) return { res: [], cnt: 0, P: 1, base: 0, idx: 0, next: hi + 1 };
    const { res, P } = residues(L.ph, L.pr, L.rate, lo);
    return { res, cnt: res.length, P, base: 0, idx: 0, next: lo + res[0] };
  });
  let u = lo;
  let total = 0;
  for (let it = 0; it < 512; it += 1) {
    let next = hi;
    let winner = -1;
    st.forEach((s, i) => {
      if (s.next < next) {
        next = s.next;
        winner = i;
      }
    });
    const len = Math.min(next, hi) - u;
    if (len > 1e-9) {
      let seg = 0;
      for (const [x, w] of gauss) seg += w * composite(layers, u + x * len);
      total += seg * len;
    }
    u = Math.min(next, hi);
    if (winner < 0 || u >= hi) break;
    const s = st[winner];
    s.idx += 1;
    if (s.idx >= s.cnt) {
      s.idx = 0;
      s.base += s.P;
    }
    s.next = lo + s.base + s.res[s.idx];
  }
  return total / Math.max(sweep, 1e-6);
}
// exactLayerMean: one layer over its full period at rate one.
function layerMean(L, gauss) {
  const { res } = residues(L.ph, L.pr, 1, -0.5);
  const one = { ...L, rate: 1, act: 1 };
  let total = 0;
  let u = -0.5;
  for (let j = 0; j <= res.length; j += 1) {
    const next = j < res.length ? -0.5 + res[j] : 0.5;
    const len = next - u;
    if (len > 1e-9) {
      let seg = 0;
      for (const [x, w] of gauss) seg += w * alphaAt(one, u + x * len);
      total += seg * len;
    }
    u = next;
  }
  return total;
}
// The tap loop: midpoint taps over the sweep, as sweepStack samples them.
const tapped = (sweep, layers, taps) => {
  let sum = 0;
  for (let i = 0; i < taps; i += 1) sum += composite(layers, ((i + 0.5) / taps - 0.5) * sweep);
  return sum / taps;
};
const tappedLayer = (L, taps) => {
  const one = { ...L, rate: 1, act: 1 };
  let sum = 0;
  for (let i = 0; i < taps; i += 1) sum += alphaAt(one, (i + 0.5) / taps - 0.5);
  return sum / taps;
};

// ------------------------------------------------------------ the scenes
let seed = 20260901;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
// Rates that hold a character (a, b) fixed: (|b|, -a sign b), as the scan
// assigns them — the diagonal is (1, 1), the sum beat (1, -1).
const CLASSES = [
  { name: 'pair, diagonal', K: 2, rates: [1, 1] },
  { name: 'pair, sum beat', K: 2, rates: [1, -1] },
  { name: 'station 2:1', K: 2, rates: [1, 2] },
  { name: 'station 3:1', K: 2, rates: [1, 3] },
  { name: 'station 5:2', K: 2, rates: [2, 5] },
  { name: 'station 12:5', K: 2, rates: [5, 12] },
  { name: 'trio, diagonal', K: 3, rates: [1, 1, 1] },
  { name: 'trio, deviated', K: 3, rates: [1, 2, 1] },
  { name: 'walking trios', K: 2, rates: [1, 1], walk: true },
  { name: 'radial floors', K: 2, rates: [1, 1], floor: true },
  { name: 'sub-pixel strokes', K: 2, rates: [1, 1], thin: true },
  { name: 'touching strokes', K: 2, rates: [1, 1], thick: true },
];
const PER_CLASS = 40;
function makeLayer(cls, rate) {
  const gap = 3 + 37 * rand();
  const r = (rand() - 0.5) * gap;
  const up = cls.walk ? 1 + 0.6 * (rand() - 0.5) : 1;
  const dn = cls.walk ? 1 + 0.6 * (rand() - 0.5) : 1;
  const aa = 0.7 * (0.3 + 1.7 * rand());
  let hInk = 0.15 * gap * (0.2 + rand());
  if (cls.thin) hInk = 0.05 + 0.35 * rand();
  if (cls.thick) hInk = gap * (0.4 + 0.09 * rand());
  const floor = cls.floor ? rand() * 2 * hInk : 0;
  const opacity = rand() < 0.2 ? 0.7 : 1;
  return { ph: [r, r + gap * up, r - gap * dn, floor], pr: [hInk, aa, opacity, 0], act: 1, rate };
}
const scenes = [];
for (const cls of CLASSES) {
  for (let i = 0; i < PER_CLASS; i += 1) {
    const layers = Array.from({ length: SLOTS }, (_, k) =>
      k < cls.K ? makeLayer(cls, cls.rates[k]) : { ph: [0, 1, -1, 0], pr: [0.5, 0.2, 1, 0], act: 0, rate: 1 }
    );
    const sweep = [1, 1.3, 2][Math.floor(rand() * 3)];
    scenes.push({ cls: cls.name, sweep, layers });
  }
}

// ------------------------------------------------------------ CPU passes
for (const s of scenes) {
  s.truth = tapped(s.sweep, s.layers, TRUTH_TAPS);
  s.exact3 = chain(s.sweep, s.layers, GAUSS3);
  s.exact4 = chain(s.sweep, s.layers, GAUSS4);
  s.taps24 = tapped(s.sweep, s.layers, 24);
  s.taps52 = tapped(s.sweep, s.layers, 52);
  s.meansTruth = s.layers.map((L) => (L.act > 0.5 ? tappedLayer(L, TRUTH_TAPS) : 0));
  s.means3 = s.layers.map((L) => (L.act > 0.5 ? layerMean(L, GAUSS3) : 0));
}

// ------------------------------------------------------------ GPU pass
const batch = [];
for (const s of scenes) {
  batch.push(s.sweep, 0, 0, 0);
  for (const L of s.layers) batch.push(...L.ph, ...L.pr, L.act, L.rate, 0, 0);
}
if (batch.length !== scenes.length * STRIDE * 4) throw new Error('batch layout');
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { port: 5196, strictPort: false, host: '127.0.0.1' },
  logLevel: 'silent',
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-webgpu', '--hide-scrollbars', '--mute-audio'],
});
let gpu;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(180_000);
  page.on('pageerror', (err) => console.error('  page error:', err.message));
  await page.goto(`http://127.0.0.1:${port}/paper/tools/gpu/bench.html`, { waitUntil: 'domcontentloaded' });
  gpu = await page.evaluate(
    async ({ root: r, batch: b }) => {
      const m = await import(/* @vite-ignore */ `/@fs/${r}/paper/tools/gpu/exactsweep.mjs`);
      return await m.run(b);
    },
    { root, batch }
  );
} finally {
  await browser.close();
  await server.close();
}
scenes.forEach((s, i) => {
  s.gpu = gpu.result[i * 4];
  s.meansGpu = [gpu.result[i * 4 + 1], gpu.result[i * 4 + 2], gpu.result[i * 4 + 3]];
});

// ------------------------------------------------------------ the receipts
const abs = Math.abs;
const maxOf = (xs) => Math.max(...xs);
const quant = (xs, q) => {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(q * a.length))];
};
const table = CLASSES.map((cls) => {
  const rows = scenes.filter((s) => s.cls === cls.name);
  const e = (f) => rows.map(f);
  return {
    cls: cls.name,
    n: rows.length,
    exact3: { p50: quant(e((s) => abs(s.exact3 - s.truth)), 0.5), max: maxOf(e((s) => abs(s.exact3 - s.truth))) },
    exact4: { max: maxOf(e((s) => abs(s.exact4 - s.truth))) },
    gpu: { max: maxOf(e((s) => abs(s.gpu - s.exact3))), maxVsTruth: maxOf(e((s) => abs(s.gpu - s.truth))) },
    taps24: { p50: quant(e((s) => abs(s.taps24 - s.truth)), 0.5), max: maxOf(e((s) => abs(s.taps24 - s.truth))) },
    taps52: { p50: quant(e((s) => abs(s.taps52 - s.truth)), 0.5), max: maxOf(e((s) => abs(s.taps52 - s.truth))) },
  };
});
for (const t of table) {
  console.log(
    `  ${t.cls.padEnd(18)} exact3 ${t.exact3.max.toExponential(1)}  exact4 ${t.exact4.max.toExponential(1)}  ` +
      `gpu ${t.gpu.max.toExponential(1)}  24 taps ${t.taps24.max.toExponential(1)}  52 taps ${t.taps52.max.toExponential(1)}`
  );
}
const all = (f) => maxOf(scenes.map(f));
const worst = {
  exact3: all((s) => abs(s.exact3 - s.truth)),
  exact4: all((s) => abs(s.exact4 - s.truth)),
  gpuVsCpu: all((s) => abs(s.gpu - s.exact3)),
  gpuVsTruth: all((s) => abs(s.gpu - s.truth)),
  taps24: all((s) => abs(s.taps24 - s.truth)),
  taps52: all((s) => abs(s.taps52 - s.truth)),
  taps24Station12: maxOf(scenes.filter((s) => s.cls === 'station 12:5').map((s) => abs(s.taps24 - s.truth))),
  means3: all((s) => maxOf(s.layers.map((L, k) => (L.act > 0.5 ? abs(s.means3[k] - s.meansTruth[k]) : 0)))),
  meansGpu: all((s) => maxOf(s.layers.map((L, k) => (L.act > 0.5 ? abs(s.meansGpu[k] - s.means3[k]) : 0)))),
};
const gates = [
  { name: 'Gauss-3 chain within half a gray level of the 65536-tap truth', ok: worst.exact3 < 2e-3, value: worst.exact3 },
  { name: 'Gauss-4 chain within 1e-5: every corner is named', ok: worst.exact4 < 1e-5, value: worst.exact4 },
  { name: 'shipped WGSL matches the double-precision twin (f32)', ok: worst.gpuVsCpu < 1e-4, value: worst.gpuVsCpu },
  { name: 'per-layer exact mean within half a gray level', ok: worst.means3 < 2e-3, value: worst.means3 },
  { name: 'shipped per-layer mean matches its twin (f32)', ok: worst.meansGpu < 1e-4, value: worst.meansGpu },
  { name: '24 taps err past a tenth of the tonal range at the rate-12 station', ok: worst.taps24Station12 > 0.1, value: worst.taps24Station12 },
  { name: 'the exact chain beats 24 taps by a hundredfold at worst', ok: worst.exact3 * 100 < worst.taps24, value: worst.taps24 / worst.exact3 },
];
for (const g of gates) console.log(`  ${g.ok ? 'ok  ' : 'FAIL'} ${g.name}: ${g.value.toExponential(2)}`);
console.log(`  gpu: ${gpu.adapter}; ${scenes.length} scenes`);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      scenes: scenes.length,
      perClass: PER_CLASS,
      truthTaps: TRUTH_TAPS,
      adapter: gpu.adapter,
      table,
      worst,
      gates,
    },
    null,
    1
  )
);
const failed = gates.filter((g) => !g.ok);
console.log(failed.length ? `GATE FAILURE (${failed.length})` : 'all gates pass');
process.exitCode = failed.length ? 1 : 0;
