// The theory outside moiré: sound. Two pulse trains ADD in air, and an ear
// pools after a nonlinearity. Everything below is the observer theorem's
// arithmetic applied to that: the support of (N∘I)^ decides what the ear
// hears, and the potential is now the sum of two trains, not the product of
// two inks. Four predictions, each gated, none about moiré:
//   1. A mistuned octave of pulse trains beats at the station (2,-1). The
//      beat is carried by the lower train's second harmonic, so it vanishes
//      when the lower train's duty is one half — through a square-law ear,
//      a cubic ear and a two-stage ear alike, because a two-valued train is
//      observer-proof. A linear ear (a low-pass alone) hears no beat at any
//      duty: a sum of trains carries no cross character at all.
//   2. Soften the pulses and the null survives a square-law ear (its cross
//      term is bilinear, still a product of single-train harmonics) but
//      reopens under a cubic ear, whose s1²·s2 term carries the second
//      harmonic of a softened square. Which nonlinearity an ear has is
//      audible in a mistuned octave of blurred square waves.
//   3. Beats of beats: three sines whose pairwise beats are 30, 33 and 63 Hz
//      carry a ternary character (1,-2,1) at 3 Hz. A square-law ear cannot
//      hear it (pairwise cross terms only), nor can a cubic one (the
//      character's order, |1|+|2|+|1| = 4, exceeds three), but a cascade —
//      square, pool, square — does: hierarchical emergence needs a
//      hierarchical observer. A PRODUCT of three trains (printed, not aired)
//      carries the ternary at linear order and a low-pass alone hears it.
//   4. The golden ratio is a desert in sound too: sawtooth tones at ratio
//      2.05 have a station line at 10 Hz fivefold stronger than the
//      strongest slow line of tones at ratio phi.
// Signals are synthesised additively — exact, band-limited harmonic
// content, no sampled edges — because sampled edges beat with the sample
// grid (Corollary Nyquist) and the first cut of this script measured that
// artifact instead. Run: node paper/tools/exp/ear.mjs

import { writeFileSync } from 'node:fs';

const OUT = new URL('../../data/ear.json', import.meta.url);
const FS = 48000;
const DUR = 4;
const N = FS * DUR;
const SKIP = Math.round(0.25 * FS); // the low-pass's start-up transient
const gates = [];
const gate = (name, ok, detail) => {
  gates.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
};

// ------------------------------------------------------------ signals
/** Sum of harmonics c_n cos(2 pi n f t), n = 0..M, band-limited to 0.45 FS. */
const harmonic = (f, coef) => {
  const M = Math.floor((0.45 * FS) / f);
  const y = new Float64Array(N);
  for (let n = 0; n <= M; n += 1) {
    const c = coef(n);
    if (c === 0) continue;
    const w = (2 * Math.PI * n * f) / FS;
    for (let i = 0; i < N; i += 1) y[i] += c * Math.cos(w * i);
  }
  return y;
};
/** A pulse train of duty d: c_0 = d, c_n = 2 sin(n pi d) / (n pi); `soft`
 * multiplies each harmonic by a Gaussian roll-off (a symmetric blur of the
 * edges), which moves no zero. */
const train = (f, d, soft = 0) =>
  harmonic(f, (n) => (n === 0 ? d : ((2 * Math.sin(n * Math.PI * d)) / (n * Math.PI)) * (soft ? Math.exp(-((n / soft) ** 2)) : 1)));
const sine = (f) => harmonic(f, (n) => (n === 1 ? 1 : 0));
const saw = (f) => harmonic(f, (n) => (n === 0 ? 0 : 1 / n));
const add = (...xs) => Float64Array.from({ length: N }, (_, i) => xs.reduce((s, x) => s + x[i], 0));
const mul = (...xs) => Float64Array.from({ length: N }, (_, i) => xs.reduce((s, x) => s * x[i], 1));

// ------------------------------------------------------------ the ear
const square = (x) => x.map((v) => v * v);
const cube = (x) => x.map((v) => v * v * v);
const identity = (x) => x;
const POLES = 6;
/** Six cascaded one-pole low-passes at cutoff fc; `lpGain` is their gain,
 * to normalise lines read at different frequencies. */
const lowpass = (x, fc) => {
  const a = Math.exp((-2 * Math.PI * fc) / FS);
  const y = Float64Array.from(x);
  for (let pass = 0; pass < POLES; pass += 1) {
    let s = 0;
    for (let i = 0; i < N; i += 1) {
      s = a * s + (1 - a) * y[i];
      y[i] = s;
    }
  }
  return y;
};
const lpGain = (f, fc) => (1 / Math.sqrt(1 + (f / fc) ** 2)) ** POLES;
/** The line at f: mean removed, start-up skipped, Hann-windowed, divided
 * by the low-pass gain at f. */
const line = (y, f, fc) => {
  let mean = 0;
  for (let i = SKIP; i < N; i += 1) mean += y[i];
  mean /= N - SKIP;
  let re = 0;
  let im = 0;
  let wsum = 0;
  const L = N - SKIP;
  for (let i = SKIP; i < N; i += 1) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - SKIP)) / L);
    const v = y[i] - mean;
    re += w * v * Math.cos((2 * Math.PI * f * i) / FS);
    im += w * v * Math.sin((2 * Math.PI * f * i) / FS);
    wsum += w;
  }
  return Math.hypot(re, im) / wsum / lpGain(f, fc);
};
const ear = (x, nonlin, fc) => lowpass(nonlin(x), fc);
const fmt = (v) => v.toExponential(2);

const out = {};

// ------------------------------------------------------------ 1, 2. the octave null
{
  const f1 = 200;
  const f2 = 405; // 2 f1 + 5: the station (2,-1) beats at 5 Hz.
  const beat = 5;
  const fc = 8;
  const duties = [0.3, 0.4, 0.5, 0.6, 0.7];
  const observers = {
    linear: identity,
    'square-law': square,
    cubic: cube,
    'square, pool, square': (x) => square(lowpass(square(x), 60)),
  };
  const depth = (r) => Math.min(r[1], r[3]) / Math.max(r[2], 1e-300);
  const sweep = (soft) => {
    const rows = {};
    for (const [name, nl] of Object.entries(observers)) {
      if (soft && name === 'linear') continue;
      rows[name] = duties.map((d) => line(ear(add(train(f1, d, soft), train(f2, 0.3, soft)), nl, fc), beat, fc));
      console.log(`  octave, ${soft ? 'soft' : 'hard'} pulses, ${name.padEnd(20)} ` + rows[name].map(fmt).join('  '));
    }
    return rows;
  };
  const hard = sweep(0);
  const soft = sweep(6);
  out.octave = { duties, hard, soft, depths: { hard: Object.fromEntries(Object.entries(hard).map(([k, r]) => [k, depth(r)])), soft: Object.fromEntries(Object.entries(soft).map(([k, r]) => [k, depth(r)])) } };
  gate('hard pulses: the 50% null holds through a square-law ear', depth(hard['square-law']) > 100, `${depth(hard['square-law']).toExponential(1)}x below its neighbours`);
  gate('hard pulses: the null holds through a cubic ear', depth(hard.cubic) > 100, `${depth(hard.cubic).toExponential(1)}x`);
  gate('hard pulses: the null holds through a two-stage ear', depth(hard['square, pool, square']) > 100, `${depth(hard['square, pool, square']).toExponential(1)}x`);
  const linearMax = Math.max(...hard.linear);
  gate('a linear ear hears no beat at any duty (an aired sum has no cross character)', linearMax < 1e-5 * hard['square-law'][0], `max ${fmt(linearMax)} vs square-law ${fmt(hard['square-law'][0])}`);
  gate('soft pulses: a square-law ear keeps the null (its cross term is bilinear)', depth(soft['square-law']) > 100, `${depth(soft['square-law']).toExponential(1)}x`);
  // Band-limited synthesis rings at a hard edge, so the hard cubic line at 1/2
  // is not zero but a few parts in ten thousand; the yardstick is the null's
  // depth against its neighbours, not that residue.
  gate('soft pulses: a cubic ear reopens it to within a tenth of its neighbours', depth(soft.cubic) < 10 && depth(soft['square-law']) > 100 * depth(soft.cubic), `${depth(soft.cubic).toFixed(1)}x deep under the cubic ear against ${depth(soft['square-law']).toExponential(1)}x under the square-law`);
}

// ------------------------------------------------------------ 3. beats of beats
{
  const f = 300;
  const x = add(sine(f), sine(f + 30), sine(f + 63));
  const tern = 3; // (1,-2,1): f - 2(f + 30) + (f + 63)
  const fc = 5;
  const ref = line(ear(x, square, 50), 30, 50); // a first-order beat, for scale
  const sq = line(ear(x, square, fc), tern, fc);
  const cu = line(ear(x, cube, fc), tern, fc);
  const cascade = line(lowpass(square(lowpass(square(x), 50)), fc), tern, fc);
  console.log(`  beats of beats: square ${fmt(sq)}  cubic ${fmt(cu)}  cascade ${fmt(cascade)}  (a first-order beat: ${fmt(ref)})`);
  out.beatsOfBeats = { square: sq, cubic: cu, cascade, firstOrder: ref };
  gate('three aired sines: a square-law ear has no ternary line', sq < 1e-4 * ref, `${fmt(sq / ref)} of a first-order beat`);
  gate('three aired sines: a cubic ear has none either', cu < 1e-4 * ref, `${fmt(cu / ref)}`);
  gate('three aired sines: square, pool, square hears the 3 Hz beat of beats', cascade > 1e-2 * ref, `${fmt(cascade / ref)}`);
  const p = mul(train(f, 0.3), train(f + 30, 0.3), train(f + 63, 0.3));
  const printed = line(lowpass(p, fc), tern, fc);
  const printedRef = line(lowpass(p, 50), 30, 50);
  out.printed = { ternary: printed, firstOrder: printedRef };
  gate('three printed trains: a linear observer hears the ternary at once', printed > 1e-2 * printedRef, `${fmt(printed / printedRef)} of a first-order beat`);
}

// ------------------------------------------------------------ 4. the desert
{
  const f1 = 200;
  const fc = 40;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const two = ear(add(saw(f1), saw(2.05 * f1)), square, fc);
  const gold = ear(add(saw(f1), saw(PHI * f1)), square, fc);
  const station = line(two, 10, fc); // (2,-1): 2*200 - 410
  const goldenLines = [
    [5, 3],
    [8, 5],
    [13, 8],
  ].map(([h, k]) => {
    const fbeat = Math.abs(h * f1 - k * PHI * f1);
    return { h, k, f: fbeat, amp: line(gold, fbeat, fc) };
  });
  const strongest = Math.max(...goldenLines.map((g) => g.amp));
  console.log(`  desert: the 2.05 pair's station line ${fmt(station)}; the golden pair's slow lines ` + goldenLines.map((g) => `(${g.h},-${g.k}) at ${g.f.toFixed(1)} Hz ${fmt(g.amp)}`).join(', '));
  out.desert = { station, goldenLines };
  gate('the 2.05 pair\'s station line is fivefold the golden pair\'s strongest slow line', station > 5 * strongest, `${(station / strongest).toFixed(1)}x`);
}

const failed = gates.filter((g) => !g.ok);
writeFileSync(OUT, JSON.stringify({ ...out, gates }, null, 1));
console.log(failed.length ? `GATE FAILURE (${failed.length})` : 'all gates pass');
process.exitCode = failed.length ? 1 : 0;
