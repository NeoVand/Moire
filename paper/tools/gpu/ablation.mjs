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

const REPS = 32;
// The whole matrix, several times. A single pass is not a measurement: on a busy
// machine the ratios here moved by more than the effects the table reports, and
// probe.mjs's zero-delta guard fires outright when a pass is starved. Taking the
// median of REPEATS passes and publishing the spread makes both problems visible
// instead of silent.
const REPEATS = 5;
// A starved pass throws rather than returning a fast number. Retry it a few times
// before giving up, since the cause is usually transient contention.
const RETRIES = 3;

const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

async function timeRetried(spec, patches, reps) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await time('final', spec, patches ? { patches, reps } : { reps });
    } catch (e) {
      last = e;
      // Let the queue drain before trying again.
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw last;
}

function specFor(key) {
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
    width: 1200,
    height: 800,
  };
}

export async function ablation(root, opts = {}) {
  const meta = await init(root);
  const reps = opts.reps ?? REPS;
  const repeats = opts.repeats ?? REPEATS;
  const out = { generated: 'paper/tools/gpu/ablation.mjs', device: meta, reps, repeats };

  // Every scene x mechanism, `repeats` times, interleaved so that a machine that
  // warms or throttles part way through spreads that across all of them rather
  // than across whichever ran last.
  const samples = {};
  for (const key of Object.keys(SCENES)) {
    samples[key] = { full: [] };
    for (const label of Object.keys(ABLATIONS)) samples[key][label] = [];
  }
  for (let pass = 0; pass < repeats; pass++) {
    for (const key of Object.keys(SCENES)) {
      const spec = specFor(key);
      samples[key].full.push(await timeRetried(spec, null, reps));
      for (const [label, patches] of Object.entries(ABLATIONS)) {
        // A patch that no longer matches its source is a stale experiment, not a
        // fast one. probe.mjs throws; record it rather than swallowing it, so the
        // failure reaches numbers.mjs instead of a plausible number.
        try {
          samples[key][label].push(await timeRetried(spec, patches, reps));
        } catch (e) {
          samples[key][label].push({ error: String(e.message ?? e) });
        }
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
      row[label] = {
        passMs: median(pass),
        wallMs: median(runs.map((r) => r.wallMs)),
        megapixels: runs[0].megapixels,
        nsPerPixel: median(runs.map((r) => r.nsPerPixel)),
        // What the median is hiding. A spread comparable to the effect the table
        // reports means the machine was not quiet enough to publish from.
        samples: pass.length,
        passMsMin: Math.min(...pass),
        passMsMax: Math.max(...pass),
      };
    }
    out[key] = row;
  }
  out.megapixels = out[Object.keys(SCENES)[0]].full.megapixels;

  // The spread of each published ratio across the repeats, as a fraction of the
  // ratio itself. Anything large here is a warning not to quote the table.
  let worstSpread = 0;
  for (const key of Object.keys(SCENES)) {
    const f = out[key].full;
    for (const label of Object.keys(ABLATIONS)) {
      const r = out[key][label];
      if (r.error || f.error) continue;
      const rel = r.passMs / f.passMs;
      const spread = (r.passMsMax - r.passMsMin) / f.passMs / Math.max(rel, 1e-9);
      if (spread > worstSpread) worstSpread = spread;
    }
  }
  out.worstRelativeSpread = Math.round(worstSpread * 1e4) / 1e4;

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
