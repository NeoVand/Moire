// Table 6, regenerated: the shipped solver with one mechanism removed at a time.
//
// This exists because `data/ablation.json` was produced from a console session
// whose scene definitions were never written down -- two of the four columns are
// not in `run.mjs`'s SETTINGS, so the table could not be reproduced from the
// repository. It also went stale: the scan's accept exit became a `break` rather
// than a `return`, which moved that ablation's patch anchor, and the whole file
// predates that change.
//
// The four scenes are chosen, as the caption says, so that every mechanism has a
// column where it binds. Two are lifted from `run.mjs` unchanged; two are
// reconstructed from the published table's own labels and are marked as such.
// `verify()` checks the reconstruction against the signature the old measurement
// left behind, so a wrong guess shows up as a failed check rather than as a
// quietly different table.
//
// From the page, with `node paper/tools/sink.mjs` running:
//
//   const root = '/ABSOLUTE/PATH/TO/Moire';
//   const a = await import(`/@fs/${root}/paper/tools/gpu/ablation.mjs`);
//   const json = await a.ablation(root);
//   await fetch('http://localhost:5199/data/ablation.json', { method: 'POST', body: json });

import { ABLATIONS, init, strokeBand, time } from './probe.mjs';

// Keyed exactly as numbers.mjs reads them, so the table's columns cannot drift
// from the data again.
const SCENES = {
  // Verbatim from run.mjs.
  'triangle rot+off @1': {
    zoom: 1,
    spec: { shape: 3, spacing: 12, theta: 0.03, offset: { x: 1.5, y: 1 }, thickness: 1.5 },
  },
  'hexagon rot+off @0.15': {
    zoom: 0.15,
    spec: { shape: 4, sides: 6, spacing: 10, theta: 0.02, offset: { x: 1, y: 1 }, thickness: 1.5 },
  },
  // run.mjs's 'hard: off near spacing': a square, rotated, with |offset| = 5.66
  // against a spacing of 6. The published column is titled "near s" and the
  // published row for the exact drift bound is the only one where that bound
  // matters, which is what this setting is for.
  'square rot+off, offset near spacing @1': {
    zoom: 1,
    spec: { shape: 2, spacing: 6, theta: 0.03, offset: { x: 4, y: 4 }, thickness: 1.5 },
  },
  // Reconstructed. "translated" fixes theta = 0; "marginal drift" puts
  // rho(-delta) exactly on the spacing. For the triangle rho(q) = max(q_x,
  // (sqrt3/2)|q_y| - q_x/2), so delta = (-s, 0) gives rho(-delta) = s.
  'triangle translated, marginal drift @1': {
    zoom: 1,
    spec: { shape: 3, spacing: 12, theta: 0, offset: { x: -12, y: 0 }, thickness: 1.5 },
  },
};

// What the published table says about the reconstructed column. A marginal drift
// is the one place the polygon closed form is the difference between a linear
// solve and walking the whole budget, and the place the Lipschitz skip has
// nothing left to skip. If the reconstruction is right these two hold; if it is
// wrong they are the first things to break.
const RECONSTRUCTED = 'triangle translated, marginal drift @1';
const EXPECT = {
  'no polygon closed form': { atLeast: 20 },
  'no Lipschitz skip': { atMost: 1.1 },
};

// 3.84 megapixels of solver work, which is what the table's caption quotes. It is
// also what keeps the two translated columns measurable: at a quarter of this they
// finish in about 0.16 ms, and the timestamp counter on Apple parts ticks every
// 65.5 us, so the ratios there were dominated by the tick rather than by the
// mechanism -- the first run at 1200x800 reported a spread of 867%.
const FRAME = { width: 2400, height: 1600 };
const REPS = 32;
// The whole matrix, several times, reduced by MINIMUM rather than by median.
//
// Contention can only ever add time to a pass, never remove it, so the fastest of
// several repeats is the one least contaminated by everything else on the machine
// -- the standard reduction for a microbenchmark, and the right one here. The
// evidence that it is right is in the data: across every cell of a five-repeat run
// the median was exactly equal to the minimum while the maxima ranged up to 4.5x
// it, which is the signature of a few preempted passes rather than of a noisy
// quantity. An earlier version of this file published the median and gated on
// max - min, and that gate was measuring contamination rather than uncertainty.
const REPEATS = 7;
// A starved pass throws rather than returning a fast number. At this frame size a
// long unbroken run of dispatches gets preempted often enough that this fires
// several times an hour, so retry with a growing backoff -- the same measurement
// succeeds on its own immediately afterwards, which is what says it is contention
// and not a limit.
const RETRIES = 4;
// Yield between measurements so the compositor is not competing with the pass
// being timed. Cheap next to the pass itself, and it is what stops most retries.
const SETTLE_MS = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Half the interquartile range of a sorted array, by nearest-rank quartiles. */
const iqrHalf = (sorted) => {
  if (sorted.length < 4) return (sorted[sorted.length - 1] - sorted[0]) / 2;
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(f * (sorted.length - 1))))];
  return (q(0.75) - q(0.25)) / 2;
};
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

async function timeRetried(spec, patches, reps) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    await sleep(attempt === 0 ? SETTLE_MS : 250 * 2 ** (attempt - 1));
    try {
      return await time('final', spec, patches ? { patches, reps } : { reps });
    } catch (e) {
      last = e;
    }
  }
  // Never abort the matrix over one cell: record it and let numbers.mjs refuse
  // the table, which is a legible failure rather than a lost run.
  return { error: String(last?.message ?? last), retries: RETRIES };
}

function specFor(key, frame = FRAME) {
  const { zoom, spec } = SCENES[key];
  const band = strokeBand(zoom, spec.thickness ?? 1.5);
  return {
    shape: spec.shape,
    sides: spec.sides ?? 6,
    spacing: spec.spacing,
    phase: 0,
    theta: spec.theta,
    offset: spec.offset,
    zoom,
    accept: band.accept,
    reject: band.reject,
    ...frame,
  };
}

export async function ablation(root, opts = {}) {
  const meta = await init(root);
  const reps = opts.reps ?? REPS;
  const repeats = opts.repeats ?? REPEATS;
  // FRAME is sized for a laptop-class adapter. On a much faster one the passes may
  // land near that device's timestamp granularity, where the guard in probe.mjs
  // starts refusing them; `frame` raises the work per pass without touching
  // anything else. `megapixels` records what was actually used.
  const frame = opts.frame ?? FRAME;
  const out = { generated: 'paper/tools/gpu/ablation.mjs', device: meta, reps, repeats, frame };

  // Every scene x mechanism, `repeats` times, interleaved so that a machine that
  // warms or throttles part way through spreads that across all of them rather
  // than across whichever ran last.
  const samples = {};
  for (const key of Object.keys(SCENES)) {
    samples[key] = { full: [] };
    for (const label of Object.keys(ABLATIONS)) samples[key][label] = [];
  }
  // `full` is re-measured next to every ablation rather than once at the top of a
  // pass. The table publishes ratios, and a laptop throttles measurably over the
  // couple of minutes a pass takes, so a baseline taken at the start of the pass
  // makes every later ablation look slower than it is. Pairing them cancels any
  // drift the two share. This is what stopped the ratios moving 15% between runs.
  for (let pass = 0; pass < repeats; pass++) {
    for (const key of Object.keys(SCENES)) {
      const spec = specFor(key, frame);
      samples[key].full.push(await timeRetried(spec, null, reps));
      for (const [label, patches] of Object.entries(ABLATIONS)) {
        // A patch that no longer matches its source is a stale experiment, not a
        // fast one. probe.mjs throws; record it rather than swallowing it, so the
        // failure reaches numbers.mjs instead of a plausible number.
        const base = await timeRetried(spec, null, reps);
        const got = await timeRetried(spec, patches, reps);
        samples[key][label].push(
          got.error || base.error
            ? { error: got.error ?? base.error }
            : { ...got, baseMs: base.passMs, ratio: got.passMs / base.passMs }
        );
      }
    }
  }

  for (const key of Object.keys(SCENES)) {
    const row = {};
    for (const [label, runs] of Object.entries(samples[key])) {
      const bad = runs.find((r) => r.error);
      if (bad || !runs.length) {
        row[label] = { error: bad ? bad.error : 'no samples' };
        continue;
      }
      const pass = runs.map((r) => r.passMs);
      const lo = Math.min(...pass);
      const base = { passMs: lo, wallMs: Math.min(...runs.map((r) => r.wallMs)),
        megapixels: runs[0].megapixels, nsPerPixel: Math.min(...runs.map((r) => r.nsPerPixel)),
        samples: pass };
      if (label === 'full') {
        row[label] = base;
        continue;
      }
      // Reduce the paired RATIOS, not the times. Each ratio already has its own
      // baseline, so the median across passes is the published figure and the
      // spread of those ratios is the honest error bar on it. A minimum would be
      // wrong here: noise moves a ratio in both directions, unlike a time.
      const ratios = runs.map((r) => r.ratio).sort((a, b) => a - b);
      const mid = median(ratios);
      row[label] = {
        // `passMs` stays the measured floor, for reference. `ratio` is the figure
        // the table publishes, and numbers.mjs reads it in preference: dividing two
        // separately reduced times would throw away the pairing that makes it
        // trustworthy.
        ...base,
        ratio: Math.round(mid * 1e4) / 1e4,
        ratios: ratios.map((v) => Math.round(v * 1e4) / 1e4),
        // Half the interquartile range of the ratio, relative to the ratio: how
        // well determined the published median is. Deliberately NOT the full range
        // -- a single preempted pass is an outlier, not an error bar, and using the
        // range put +-665% on ratios whose medians agreed with the published table
        // to a few percent.
        ratioSpread: Math.round((iqrHalf(ratios) / mid) * 1e4) / 1e4,
      };
    }
    out[key] = row;
  }
  out.megapixels = out[Object.keys(SCENES)[0]].full.megapixels;

  // The gate: the widest error bar on any published ratio. This is the quantity the
  // table prints, so it is the one whose stability decides whether the table can be
  // printed at all.
  let worst = 0;
  for (const key of Object.keys(SCENES)) {
    for (const label of Object.keys(ABLATIONS)) {
      const r = out[key][label];
      if (!r || r.error || r.ratioSpread === undefined) continue;
      if (r.ratioSpread > worst) worst = r.ratioSpread;
    }
  }
  out.worstRatioSpread = Math.round(worst * 1e4) / 1e4;

  // The reconstruction check.
  const row = out[RECONSTRUCTED];
  const checks = [];
  for (const [mech, bound] of Object.entries(EXPECT)) {
    const r = row[mech];
    if (!r || r.error) {
      checks.push(`${mech}: ${r?.error ?? 'missing'}`);
      continue;
    }
    const rel = r.passMs / row.full.passMs;
    if (bound.atLeast !== undefined && rel < bound.atLeast) {
      checks.push(`${mech}: ${rel.toFixed(2)}x, expected at least ${bound.atLeast}x`);
    }
    if (bound.atMost !== undefined && rel > bound.atMost) {
      checks.push(`${mech}: ${rel.toFixed(2)}x, expected at most ${bound.atMost}x`);
    }
  }
  out.reconstructionCheck = {
    scene: RECONSTRUCTED,
    expectations: EXPECT,
    failures: checks,
    passed: checks.length === 0,
  };

  return JSON.stringify(out, null, 2);
}
