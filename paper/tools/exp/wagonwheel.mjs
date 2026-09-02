// The theory in a third domain: the wagon wheel. A wheel with N spokes of
// angular duty d turns so that spokes pass a fixed point at r per second,
// and a camera takes f frames per second. Two families: the spokes (count
// xi1 = r t) and the frames (count xi2 = f t). The sampler is a family whose
// picture is a comb — every harmonic equal — so its harmonics cost nothing
// and the visible recipe (a, -b) is priced by the spoke profile's a-th
// harmonic alone. Three predictions, each gated:
//   1. Near r = f the recipe (1,-1) is slow: the wheel is seen turning at
//      r - f spokes per second, forwards above f and backwards below it —
//      the classical wagon-wheel reversal.
//   2. At r = f/2 the recipe (2,-1) is slow: consecutive frames sit half a
//      spoke gap apart, a pooling observer averages them, and what stands
//      still is a wheel with TWICE the spokes, carried by the profile's
//      second harmonic — so it vanishes exactly when the spokes are half
//      the gap wide (duty 1/2), the octave duty null under a strobe.
//   3. At r = f/3 the tripled wheel is carried by the third harmonic and
//      vanishes at duties 1/3 and 2/3.
// The frames are the phenomenon here, so the profile is sampled at frame
// instants directly; the pooled image is the average over a run of frames.
// Run: node paper/tools/exp/wagonwheel.mjs

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/wagonwheel.json', import.meta.url);
const gates = [];
const gate = (name, ok, detail) => {
  gates.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
};
const fmt = (v) => v.toExponential(2);

/** Spoke profile on the circle: N spokes, each covering a fraction d of its
 * gap, as a function of the spoke count u (one unit per spoke). */
const spoke = (u, d) => (u - Math.floor(u) < d ? 1 : 0);
const f = 24; // frames per second
const M = 2400; // frames pooled: 100 seconds
const P = 720; // positions around the wheel, in spoke-count units (one gap = P/... see below)
// The pooled image: average over M frames of the profile at spoke count
// r t_n + u, for u across one spoke gap sampled P times.
const pooled = (r, d) => {
  const img = new Float64Array(P);
  for (let n = 0; n < M; n += 1) {
    // The frame's offset in spoke count, on the position grid: exact for the
    // rational ratios the stations sit at, so a null is a null and not a
    // rounding residue at the profile's edges.
    const off = Math.round((((n * r) % f) / f) * P) % P;
    for (let i = 0; i < P; i += 1) img[i] += spoke(((i + off) % P) / P, d);
  }
  for (let i = 0; i < P; i += 1) img[i] /= M;
  return img;
};
/** Harmonic h of a periodic image over one gap (magnitude). */
const harmonic = (img, h) => {
  let re = 0;
  let im = 0;
  for (let i = 0; i < P; i += 1) {
    re += img[i] * Math.cos((2 * Math.PI * h * i) / P);
    im += img[i] * Math.sin((2 * Math.PI * h * i) / P);
  }
  return Math.hypot(re, im) / P;
};
const out = {};

// ------------------------------------------------ 1. the reversal
{
  const d = 0.3;
  // The phase of the fundamental across frames: how far the wheel seems to
  // have turned per frame, in spoke gaps, read from consecutive frames.
  const seen = (r) => {
    const phase = (n) => {
      let re = 0;
      let im = 0;
      const t = n / f;
      for (let i = 0; i < P; i += 1) {
        const v = spoke(r * t + i / P, d);
        re += v * Math.cos((2 * Math.PI * i) / P);
        im += v * Math.sin((2 * Math.PI * i) / P);
      }
      return Math.atan2(im, re);
    };
    // Mean phase advance per frame, unwrapped to (-1/2, 1/2] gaps.
    let sum = 0;
    for (let n = 0; n < 200; n += 1) {
      let dphi = (phase(n + 1) - phase(n)) / (2 * Math.PI);
      dphi -= Math.round(dphi);
      sum += dphi;
    }
    return (-sum / 200) * f; // spokes per second, sign = direction
  };
  const rows = [22, 23, 23.5, 24.5, 25, 26].map((r) => ({ r, seen: seen(r), predicted: r - f }));
  for (const row of rows) console.log(`  spokes at ${row.r}/s, frames at ${f}/s: seen ${row.seen.toFixed(3)}/s, predicted ${row.predicted.toFixed(3)}/s`);
  out.reversal = rows;
  const worst = Math.max(...rows.map((row) => Math.abs(row.seen - row.predicted)));
  gate('near the frame rate the wheel is seen at r - f, reversing below it', worst < 1e-6, `worst error ${fmt(worst)} spokes/s`);
}

// ------------------------------------------------ 2, 3. the doubled and tripled still wheels
{
  const duties = [0.2, 0.25, 0.3, 1 / 3, 0.4, 0.5, 0.6, 2 / 3, 0.7, 0.75, 0.8];
  const doubled = duties.map((d) => ({ d, contrast: harmonic(pooled(f / 2, d), 2), fundamental: harmonic(pooled(f / 2, d), 1), law: Math.abs(Math.sin(2 * Math.PI * d) / (2 * Math.PI)) }));
  const tripled = duties.map((d) => ({ d, contrast: harmonic(pooled(f / 3, d), 3), law: Math.abs(Math.sin(3 * Math.PI * d) / (3 * Math.PI)) }));
  for (const row of doubled) console.log(`  r = f/2, duty ${row.d.toFixed(3)}: doubled wheel ${fmt(row.contrast)} (law ${fmt(row.law)}), fundamental ${fmt(row.fundamental)}`);
  for (const row of tripled) console.log(`  r = f/3, duty ${row.d.toFixed(3)}: tripled wheel ${fmt(row.contrast)} (law ${fmt(row.law)})`);
  out.doubled = doubled;
  out.tripled = tripled;
  const at = (rows, d) => rows.find((row) => Math.abs(row.d - d) < 1e-9);
  const depth = (rows, d, lo, hi) => Math.min(at(rows, lo).contrast, at(rows, hi).contrast) / Math.max(at(rows, d).contrast, 1e-300);
  const d2 = depth(doubled, 0.5, 0.4, 0.6);
  const d3a = depth(tripled, 1 / 3, 0.25, 0.4);
  const d3b = depth(tripled, 2 / 3, 0.6, 0.75);
  out.depths = { doubled: d2, tripledLow: d3a, tripledHigh: d3b };
  gate('at r = f/2 a doubled wheel stands still, and vanishes at duty 1/2', d2 > 100 && at(doubled, 0.3).contrast > 0.05, `${d2.toExponential(1)}x below its neighbours; ${fmt(at(doubled, 0.3).contrast)} at duty 0.3`);
  gate('the fundamental is washed at r = f/2 (the wheel itself does not stand still)', Math.max(...doubled.map((row) => row.fundamental)) < 1e-3, `max ${fmt(Math.max(...doubled.map((row) => row.fundamental)))}`);
  const lawErr = Math.max(...doubled.filter((row) => row.law > 0.02).map((row) => Math.abs(row.contrast - row.law) / row.law));
  gate('the doubled wheel tracks the second harmonic |sin(2 pi d) / 2 pi|', lawErr < 0.02, `within ${(lawErr * 100).toFixed(2)}%`);
  gate('at r = f/3 the tripled wheel vanishes at duties 1/3 and 2/3', d3a > 100 && d3b > 100, `${d3a.toExponential(1)}x and ${d3b.toExponential(1)}x`);
}

const failed = gates.filter((g) => !g.ok);
writeFileSync(OUT, JSON.stringify({ frameRate: f, framesPooled: M, ...out, gates }, null, 1));
console.log(failed.length ? `GATE FAILURE (${failed.length})` : 'all gates pass');
process.exitCode = failed.length ? 1 : 0;
