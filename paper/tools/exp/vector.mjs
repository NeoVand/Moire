// What the same patterns cost as explicit geometry.
//
// The obvious objection to the whole paper is that two families of curves are two
// sets of paths, and path renderers are mature: emit the members as strokes and
// let a vector back end draw them. For one family at one zoom that is true, and it
// is the better answer. This measures where it stops being true, on the five pairs
// of Table 1 -- the same scenes as Figure 18, so the two can be read together.
//
// Everything here stays inside the tool's own controls: zoom is clamped to
// [MIN_ZOOM, MAX_ZOOM] and spacing to [1, 120] by the Studio, and no setting below
// is outside those. That matters, because both effects grow without bound and it
// would be easy, and worthless, to measure them somewhere the tool cannot go.
//
// Two quantities, neither of them about any particular vector renderer:
//
//   cost        how many distinct curves meet the frame, and their total arc
//               length in device pixels. The members are the level sets
//               psi = n s + phi, so the count is the number of integers whose
//               level lies in psi's range over the frame -- exact, no enumeration.
//               The length of all of them at once is (1/s) * integral of
//               |grad psi| over the frame, by the coarea formula, which needs no
//               flattening tolerance and so belongs to no particular back end.
//
//   conflation  the error a path renderer makes that a field renderer does not.
//               A vector back end antialiases each path and composites the results
//               with `over`, so N members give 1 - prod(1 - alpha_i). Within one
//               family the strokes are disjoint -- a point lies within half a
//               stroke width of at most one member, since the width is below the
//               spacing -- so the true coverage of their union is sum(alpha_i),
//               and `over` undercounts it. We hand the vector side *exact*
//               per-path coverage, each alpha_i measured at 144 samples per pixel,
//               so what remains is the compositing rule alone and not any
//               renderer's antialiasing quality. The error is a function of how
//               many members share a pixel, 1/(s*zoom), which the tool reaches by
//               zooming out, by fining the spacing, or by both.
//
// The field renderer's cost is constant throughout: two index evaluations and two
// gradients per pixel, whatever the member count.
//
//   node paper/tools/exp/vector.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { family } from '../lib/fields.mjs';
import { writePng } from '../lib/png.mjs';
import { tile } from '../lib/render.mjs';
import { MIN_ZOOM, MAX_ZOOM } from '../../../src/gpu/camera.ts';

const DATA = new URL('../../data/', import.meta.url);
const FIGS = new URL('../../figures/', import.meta.url);
mkdirSync(DATA, { recursive: true });
mkdirSync(FIGS, { recursive: true });

// The Studio's spacing slider, from src/components/Studio.tsx.
const MIN_SPACING = 1;

// The pairs of Table 1 and Figure 18, with their settings, so the figures describe
// the same five scenes. `scale` multiplies both spacings to walk the pattern into
// the sub-pixel regime the way a user does, with the slider.
const SCENES = [
  {
    label: 'two combs',
    slug: 'parallel-rotate',
    a: { kind: 'parallel', spacing: 6, angle: 0 },
    b: { kind: 'parallel', spacing: 6, angle: (6 * Math.PI) / 180 },
  },
  {
    label: 'circles under lines',
    slug: 'circle-parallel',
    a: { kind: 'concentric', shape: 'circle', spacing: 8, position: { x: 0, y: -260 } },
    b: { kind: 'parallel', spacing: 8, angle: Math.PI / 2 },
  },
  {
    label: 'hexagons, 4 degrees',
    slug: 'hexagon-hexagon',
    a: { kind: 'concentric', shape: 'hexagon', spacing: 8 },
    b: { kind: 'concentric', shape: 'hexagon', spacing: 8, rotation: 4 },
  },
  {
    label: 'circles, two centres',
    slug: 'circle-circle',
    a: { kind: 'concentric', shape: 'circle', spacing: 7, position: { x: -40, y: 0 } },
    b: { kind: 'concentric', shape: 'circle', spacing: 7, position: { x: 40, y: 0 } },
  },
  {
    label: 'hyperbolae under lines',
    slug: 'hyperbola-parallel',
    a: { kind: 'hyperbola', spacing: 9, phase: 4 },
    b: { kind: 'parallel', spacing: 9, angle: Math.PI / 4 },
  },
];

/** Both families' spacings scaled by `k`, never below the slider's floor. */
function scaled(scene, k) {
  const fit = (cfg) => ({ ...cfg, spacing: Math.max(MIN_SPACING, cfg.spacing * k) });
  return { ...scene, a: fit(scene.a), b: fit(scene.b) };
}

// psi is nonnegative for these kinds, so members below zero do not exist.
const NONNEGATIVE = new Set(['concentric', 'hyperbola']);

const PANEL = 340; // device pixels, the panel size of Figure 18
const THICK = 1.8; // stroke width in world units, as the figures draw it

/** The frame in world units at `zoom`, as a half-extent. */
const halfExtent = (zoom) => (PANEL * 0.5) / zoom;

/**
 * Range of psi over the frame, and the integral of |grad psi| over it.
 *
 * Quadrature on an offset grid. The offsets matter, and they have to differ
 * between the axes: the hyperbola's gradient is singular on x = +-y, and any grid
 * using the same offset on both axes puts a whole diagonal of cell centres exactly
 * on it, where the field library returns a sentinel. That sentinel then carries the
 * integral, and since the diagonal holds `grid` cells of area step^2 the answer
 * falls as 1/grid instead of converging -- which is what the convergence check
 * below reported the first time. Two offsets whose difference is irrational never
 * land on either diagonal at any grid. The singular set has measure zero and the
 * integral through it converges (|grad psi| ~ d^-1/2 at the asymptote), so this is
 * a fix rather than a dodge, and the check confirms it.
 */
const OFF_X = 0.31830988618; // 1/pi
const OFF_Y = 0.70710678118; // 1/sqrt(2)
function survey(fam, zoom, grid) {
  const h = halfExtent(zoom);
  const step = (2 * h) / grid;
  let lo = Infinity;
  let hi = -Infinity;
  let gradSum = 0;
  for (let j = 0; j < grid; j++) {
    const y = -h + (j + OFF_Y) * step;
    for (let i = 0; i < grid; i++) {
      const x = -h + (i + OFF_X) * step;
      const p = { x, y };
      const v = fam.psi(p);
      if (Number.isFinite(v)) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const g = fam.grad(p);
      if (Number.isFinite(g)) gradSum += g;
    }
  }
  return { lo, hi, gradIntegral: gradSum * step * step };
}

const GRID = 768;

/** Members of `fam` meeting the frame, and their total arc length in device px. */
function census(cfg, zoom, grid = GRID) {
  const fam = family(cfg);
  const { lo, hi, gradIntegral } = survey(fam, zoom, grid);
  const s = fam.spacing;
  const phi = fam.phase;
  let nLo = Math.ceil((lo - phi) / s);
  const nHi = Math.floor((hi - phi) / s);
  if (NONNEGATIVE.has(cfg.kind)) nLo = Math.max(nLo, Math.ceil(-phi / s));
  return {
    members: Math.max(0, nHi - nLo + 1),
    inkPx: (gradIntegral / s) * zoom,
  };
}

// ------------------------------------------------------- the compositing error

/**
 * True union coverage against what `over` gives, on one frame.
 *
 * At SS x SS samples per pixel we record, for each family, which member inked each
 * sample. Within a family the strokes are disjoint, so the exact coverage of
 * member n is its own sample count over SS^2 and the exact coverage of the family
 * is their sum. Compositing those same exact coverages with `over` is what a path
 * renderer does; the gap is the whole of the effect, with antialiasing held
 * perfect on both sides. Across the two families strokes really can overlap, so
 * that union is measured rather than assumed and both sides get the same
 * two-layer `over`.
 */
const SS = 12;
const CONF_PANEL = 256;
// Above this mean coverage the strokes are wider than the gaps and the frame is
// solid ink: `over` still loses its share, but there is no pattern left to lose it
// from, so these settings are excluded from every headline below.
const LEGIBLE = 0.95;
// Below this RMS contrast the frame carries no fringe field, so "how much of it
// survived" has no denominator. Settings under it are reported but never averaged.
const FRINGES = 0.01;
function conflation(scene, zoom, opts = {}) {
  const { images = false, panel = CONF_PANEL } = opts;
  const famA = family(scene.a);
  const famB = family(scene.b);
  const h = (panel * 0.5) / zoom;
  const half = THICK * 0.5;
  const step = (2 * h) / (panel * SS);
  const n2 = SS * SS;

  let sumTrue = 0;
  let sumOver = 0;
  let sumAbs = 0;
  let worst = 0;
  let sumMembers = 0;
  // Always kept: the contrast metric below needs the whole field, not a running sum.
  const covT = new Float32Array(panel * panel);
  const covO = new Float32Array(panel * panel);

  const tallyA = new Map();
  const tallyB = new Map();
  for (let py = 0; py < panel; py++) {
    for (let px = 0; px < panel; px++) {
      tallyA.clear();
      tallyB.clear();
      let union = 0;
      for (let sy = 0; sy < SS; sy++) {
        const y = h - (py * SS + sy + 0.5) * step;
        for (let sx = 0; sx < SS; sx++) {
          const x = -h + (px * SS + sx + 0.5) * step;
          const p = { x, y };
          const inA = famA.distance(p) <= half;
          const inB = famB.distance(p) <= half;
          if (inA) {
            const n = Math.round(famA.index(p));
            tallyA.set(n, (tallyA.get(n) ?? 0) + 1);
          }
          if (inB) {
            const n = Math.round(famB.index(p));
            tallyB.set(n, (tallyB.get(n) ?? 0) + 1);
          }
          if (inA || inB) union += 1;
        }
      }
      const trueCov = union / n2;
      let keepA = 1;
      for (const c of tallyA.values()) keepA *= 1 - c / n2;
      let keepB = 1;
      for (const c of tallyB.values()) keepB *= 1 - c / n2;
      const overCov = 1 - keepA * keepB;

      sumTrue += trueCov;
      sumOver += overCov;
      const e = overCov - trueCov;
      sumAbs += Math.abs(e);
      if (Math.abs(e) > Math.abs(worst)) worst = e;
      sumMembers += tallyA.size + tallyB.size;
      covT[py * panel + px] = trueCov;
      covO[py * panel + px] = overCov;
    }
  }

  const n = panel * panel;
  const meanTrue = sumTrue / n;
  const meanOver = sumOver / n;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  // The quantity that actually matters. A moire is the spatial modulation of the
  // coverage, not its mean, and the two rules do very different things to it:
  // sum(alpha_i) is nearly constant across the frame, so `over`, which depends on
  // the members only through that sum, flattens the modulation while keeping the
  // average. Mean ink understates this by an order of magnitude, so we measure the
  // fringe contrast directly on both.
  const cTrue = fringeContrast(covT, panel);
  const cOver = fringeContrast(covO, panel);
  const rawTrue = rmsContrast(covT);
  const rawOver = rmsContrast(covO);
  // A ratio needs something in the denominator. Below FRINGES the true frame has no
  // fringe field to preserve -- the strokes have closed over and the panel is flat
  // -- so the fraction preserved is undefined rather than large, and saying so is
  // better than reporting the noise.
  const hasFringes = cTrue >= FRINGES;
  return {
    fringeContrastTrue: r4(cTrue),
    fringeContrastOver: r4(cOver),
    hasFringes,
    contrastLost: hasFringes ? r4(1 - cOver / cTrue) : null,
    // The same ratio without the blur, so the blur can be audited.
    contrastLostUnblurred: hasFringes && rawTrue > FRINGES ? r4(1 - rawOver / rawTrue) : null,
    zoom,
    spacing: Math.round(Math.min(famA.spacing, famB.spacing) * 100) / 100,
    // The regime variable: members sharing a pixel, measured rather than derived.
    membersPerPixel: r4(sumMembers / n),
    trueInk: r4(meanTrue),
    overInk: r4(meanOver),
    inkLost: r4(1 - meanOver / Math.max(meanTrue, 1e-9)),
    meanAbsError: r4(sumAbs / n),
    worstPixelError: r4(worst),
    covTrue: images ? covT : null,
    covOver: images ? covO : null,
    panel,
  };
}

/**
 * RMS contrast of the fringe field, sigma / mean.
 *
 * A light separable Gaussian first, to drop the residual carrier: in this regime
 * the carrier period is already below a pixel, so what survives sampling is
 * aliasing noise rather than signal, and counting it as contrast would flatter
 * whichever rule is noisier. The fringes are tens of pixels wide, so `BLUR` does
 * not touch them -- `contrastRawTrue` below is the unblurred number, reported so
 * the choice can be checked rather than trusted.
 */
const BLUR = 3;
function blurField(src, panel, sigma) {
  const rad = Math.ceil(2.5 * sigma);
  const k = [];
  for (let d = -rad; d <= rad; d++) k.push(Math.exp((-d * d) / (2 * sigma * sigma)));
  const pass = (input) => {
    const out = new Float32Array(panel * panel);
    for (let y = 0; y < panel; y++) {
      for (let x = 0; x < panel; x++) {
        let s = 0;
        let w = 0;
        for (let d = -rad; d <= rad; d++) {
          const xx = x + d;
          if (xx < 0 || xx >= panel) continue;
          s += input[y * panel + xx] * k[d + rad];
          w += k[d + rad];
        }
        out[y * panel + x] = s / w;
      }
    }
    return out;
  };
  // Rows, then the same pass on the transpose, which is the columns.
  const rows = pass(src);
  const t = new Float32Array(panel * panel);
  for (let y = 0; y < panel; y++) for (let x = 0; x < panel; x++) t[x * panel + y] = rows[y * panel + x];
  const cols = pass(t);
  const out = new Float32Array(panel * panel);
  for (let y = 0; y < panel; y++) for (let x = 0; x < panel; x++) out[x * panel + y] = cols[y * panel + x];
  return out;
}

function rmsContrast(field) {
  let sum = 0;
  for (let i = 0; i < field.length; i++) sum += field[i];
  const mean = sum / field.length;
  if (mean < 1e-9) return 0;
  let sq = 0;
  for (let i = 0; i < field.length; i++) {
    const d = field[i] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / field.length) / mean;
}

function fringeContrast(cov, panel) {
  return rmsContrast(blurField(cov, panel, BLUR));
}

// ------------------------------------------------------------------- measure

// The tool's whole zoom range, an even split in log.
const ZOOMS = [10, 4, 2, 1, 0.5, 0.25, MIN_ZOOM];
// Spacing scales, walking the same patterns down toward the slider's floor.
const SCALES = [1, 0.5, 0.25, 0.125];

const out = {
  panel: PANEL,
  confPanel: CONF_PANEL,
  thickness: THICK,
  zoomRange: [MIN_ZOOM, MAX_ZOOM],
  spacingFloor: MIN_SPACING,
  zooms: ZOOMS,
  spacingScales: SCALES,
  samplesPerPixel: SS * SS,
  grid: GRID,
  scenes: [],
};

console.log(`cost: members and stroke length over the tool's zoom range [${MIN_ZOOM}, ${MAX_ZOOM}]\n`);
for (const scene of SCENES) {
  const counts = ZOOMS.map((zoom) => {
    const a = census(scene.a, zoom);
    const b = census(scene.b, zoom);
    return {
      zoom,
      members: a.members + b.members,
      membersA: a.members,
      membersB: b.members,
      inkPx: Math.round(a.inkPx + b.inkPx),
    };
  });
  console.log(`  ${scene.label}`);
  for (const c of counts) {
    console.log(
      `    zoom ${String(c.zoom).padStart(5)}   members ${String(c.members).padStart(6)}` +
        `   stroke ${String(c.inkPx).padStart(8)} px`
    );
  }
  out.scenes.push({ slug: scene.slug, label: scene.label, counts });
}

// Convergence of the quadrature, on the case that stresses it: the hyperbola,
// whose gradient is singular on the asymptotes.
const CONV_GRIDS = [384, 768, 1536];
const conv = CONV_GRIDS.map((g) => Math.round(census(SCENES[4].a, 1, g).inkPx));
const drift = Math.abs(conv[2] - conv[1]) / Math.max(conv[2], 1);
out.convergence = { grids: CONV_GRIDS, inkPx: conv, relativeDrift: Math.round(drift * 1e4) / 1e4 };
console.log(
  `\nquadrature convergence (hyperbola, zoom 1): ${conv.join(' -> ')} px` +
    `  (last step ${(100 * drift).toFixed(1)}%)`
);
if (drift > 0.05) {
  throw new Error(
    `quadrature has not converged: ${conv.join(' -> ')} still moving by ` +
      `${(100 * drift).toFixed(1)}% at grid ${CONV_GRIDS[2]}. The stroke lengths are not measurements.`
  );
}

// The compositing error against how many members share a pixel. Both knobs, so the
// curve is not resting on one of them.
console.log('\ncompositing: true union coverage vs per-path `over`\n');
const pooled = [];
for (const scene of SCENES) {
  const rows = [];
  for (const k of SCALES) {
    for (const zoom of [1, 0.25, MIN_ZOOM]) {
      const row = conflation(scaled(scene, k), zoom);
      // The coverage buffers are only for the figure; they must not reach the JSON.
      delete row.covTrue;
      delete row.covOver;
      delete row.panel;
      row.spacingScale = k;
      rows.push(row);
      pooled.push({ scene: scene.slug, ...row });
    }
  }
  rows.sort((p, q) => p.membersPerPixel - q.membersPerPixel);
  const entry = out.scenes.find((s) => s.slug === scene.slug);
  entry.conflation = rows;
  console.log(`  ${scene.label}`);
  for (const r of rows) {
    console.log(
      `    s=${String(r.spacing).padStart(5)} zoom ${String(r.zoom).padStart(5)}` +
        `   members/px ${r.membersPerPixel.toFixed(2).padStart(6)}` +
        `   ink lost ${(100 * r.inkLost).toFixed(1).padStart(5)}%` +
        `   contrast ${r.fringeContrastTrue.toFixed(3)} -> ${r.fringeContrastOver.toFixed(3)}` +
        `   lost ${r.contrastLost === null ? '    --' : `${(100 * r.contrastLost).toFixed(1).padStart(5)}%`}` +
        `${r.trueInk >= LEGIBLE ? '   [solid]' : ''}${!r.hasFringes ? '   [no fringes]' : ''}`
    );
  }
}

// Headline numbers for the prose.
//
// The compositing rows are filtered to settings where a pattern still exists. Once
// the strokes are wider than the gaps the frame is solid ink, `over` still loses
// its 12%, and neither number describes anything a user would look at. The
// interesting regime is the one where the carrier is still a carrier.
const legible = pooled.filter((r) => r.trueInk < LEGIBLE && r.hasFringes);
const atFloor = (s) => s.counts.find((c) => c.zoom === MIN_ZOOM);
const maxMembers = Math.max(...out.scenes.map((s) => atFloor(s).members));
const maxInk = Math.max(...out.scenes.map((s) => atFloor(s).inkPx));
const maxLost = Math.max(...legible.map((r) => r.inkLost));
const maxContrastLost = Math.max(...legible.map((r) => r.contrastLost));
const worstRow = legible.find((r) => r.contrastLost === maxContrastLost);
const maxPixel = Math.max(...legible.map((r) => Math.abs(r.worstPixelError)));
// One member per pixel is where a vector back end stops being able to see what it
// is drawing, and two is where the carrier is unambiguously gone. The bands are
// split there rather than at round numbers of members.
const quiet = legible.filter((r) => r.membersPerPixel < 1);
const dense = legible.filter((r) => r.membersPerPixel >= 6);
const mid = legible.filter((r) => r.membersPerPixel >= 3 && r.membersPerPixel < 6);
const crowded = legible.filter((r) => r.membersPerPixel >= 2);
const median = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const band = (rows) =>
  rows.length
    ? {
        settings: rows.length,
        minInkLost: r4(Math.min(...rows.map((r) => r.inkLost))),
        maxInkLost: r4(Math.max(...rows.map((r) => r.inkLost))),
        minContrastLost: r4(Math.min(...rows.map((r) => r.contrastLost))),
        maxContrastLost: r4(Math.max(...rows.map((r) => r.contrastLost))),
      }
    : null;
out.summary = {
  legibleThreshold: LEGIBLE,
  legibleSettings: legible.length,
  membersAtZoomFloor: maxMembers,
  inkPxAtZoomFloor: maxInk,
  maxInkLost: maxLost,
  maxContrastLost,
  maxContrastLostAt: worstRow && {
    scene: worstRow.scene,
    spacing: worstRow.spacing,
    zoom: worstRow.zoom,
    membersPerPixel: worstRow.membersPerPixel,
  },
  // The same figure without the carrier-suppressing blur, as a check that the
  // effect is not manufactured by it.
  maxContrastLostUnblurred: Math.max(...legible.map((r) => r.contrastLostUnblurred)),
  maxPixelError: maxPixel,
  belowOnePerPixel: band(quiet),
  threeToSix: band(mid),
  sixAndUp: band(dense),
  // The headline band: two or more members to a pixel, where the carrier is gone.
  twoAndUp: {
    ...band(crowded),
    medianContrastLost: r4(median(crowded.map((r) => r.contrastLost))),
  },
};

// ---------------------------------------------------------------- the figure

// Two plots, as CSV for pgfplots, so the curves stay vector at any print size.
const costCsv = ['scene,zoom,members,inkpx'];
for (const s of out.scenes) {
  for (const c of s.counts) costCsv.push(`${s.slug},${c.zoom},${c.members},${c.inkPx}`);
}
writeFileSync(new URL('vector-cost.csv', DATA), `${costCsv.join('\n')}\n`);

// One column per scene, so pgfplots can draw five series from one table. Rows are
// sorted by members per pixel within each scene and padded with `nan`, which
// pgfplots skips.
const confBySlug = out.scenes.map((s) => ({
  slug: s.slug,
  rows: s.conflation
    .filter((r) => r.trueInk < LEGIBLE && r.hasFringes)
    .sort((p, q) => p.membersPerPixel - q.membersPerPixel),
}));
const depth = Math.max(...confBySlug.map((s) => s.rows.length));
const head = confBySlug.flatMap((s) => [`${s.slug}_mpp`, `${s.slug}_lost`]).join(',');
const confCsv = [head];
for (let i = 0; i < depth; i++) {
  confCsv.push(
    confBySlug
      .flatMap((s) => {
        const r = s.rows[i];
        return r ? [r.membersPerPixel, (100 * r.contrastLost).toFixed(2)] : ['nan', 'nan'];
      })
      .join(',')
  );
}
writeFileSync(new URL('vector-conflation.csv', DATA), `${confCsv.join('\n')}\n`);

// And the picture: what the two rules actually draw. Deliberately not the worst
// setting measured, which is reached by fining the spacing as well as zooming out.
// This is the scene at its own spacing, at the tool's own zoom floor -- nothing
// unusual asked of it.
const SHOW = { slug: 'circle-circle', scale: 1, zoom: MIN_ZOOM };
const showScene = scaled(SCENES.find((s) => s.slug === SHOW.slug), SHOW.scale);
const shown = conflation(showScene, SHOW.zoom, { images: true, panel: 300 });
const P = shown.panel;
// Both coverage panels get the same linear stretch, computed from the reference
// alone: without it the fringes sit in an 8% band about mid grey and neither panel
// shows anything on paper. Because it is one transform applied to both, what the
// pair shows is still the difference between the two rules and not a difference of
// display. The window is the reference's mean plus or minus three of its standard
// deviations, so the reference fills the range by construction and the vector panel
// is drawn on the reference's terms.
let stretchLo = 0;
let stretchHi = 1;
{
  let sum = 0;
  for (let i = 0; i < P * P; i++) sum += shown.covTrue[i];
  const mean = sum / (P * P);
  let sq = 0;
  for (let i = 0; i < P * P; i++) sq += (shown.covTrue[i] - mean) ** 2;
  const sd = Math.sqrt(sq / (P * P));
  stretchLo = mean - 3 * sd;
  stretchHi = mean + 3 * sd;
}
/** Coverage to ink under the shared stretch: more covered is darker. */
function inkPanel(cov) {
  const rgb = new Uint8Array(P * P * 3);
  const span = Math.max(stretchHi - stretchLo, 1e-9);
  for (let i = 0; i < P * P; i++) {
    const t = Math.min(1, Math.max(0, (cov[i] - stretchLo) / span));
    const v = Math.round(255 * (1 - t));
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = v;
  }
  return { rgb, width: P, height: P };
}
// The difference, signed and amplified, so the structure of the loss is visible:
// crimson where `over` draws too little ink, blue where too much.
const AMP = 4;
function diffPanel(a, b) {
  const rgb = new Uint8Array(P * P * 3);
  for (let i = 0; i < P * P; i++) {
    const e = Math.max(-1, Math.min(1, (b[i] - a[i]) * AMP));
    const t = Math.abs(e);
    const hue = e < 0 ? [214, 20, 84] : [27, 108, 168];
    for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.round(255 + (hue[k] - 255) * t);
  }
  return { rgb, width: P, height: P };
}
const strip = tile(
  [inkPanel(shown.covTrue), inkPanel(shown.covOver), diffPanel(shown.covTrue, shown.covOver)],
  3,
  10,
  255
);
writePng(new URL('vector-wash.png', FIGS).pathname, strip.rgb, strip.width, strip.height);
out.figure = {
  scene: SHOW.slug,
  spacingScale: SHOW.scale,
  zoom: SHOW.zoom,
  panel: P,
  amplification: AMP,
  membersPerPixel: shown.membersPerPixel,
  trueInk: shown.trueInk,
  overInk: shown.overInk,
  inkLost: shown.inkLost,
  fringeContrastTrue: shown.fringeContrastTrue,
  fringeContrastOver: shown.fringeContrastOver,
  contrastLost: shown.contrastLost,
  worstPixelError: shown.worstPixelError,
};
console.log(
  `\nwrote figures/vector-wash.png (${strip.width}x${strip.height})  --  ` +
    `${shown.membersPerPixel.toFixed(2)} members/px, ${(100 * shown.inkLost).toFixed(1)}% of the ink lost`
);

writeFileSync(new URL('vector.json', DATA), `${JSON.stringify(out, null, 2)}\n`);
const pct = (v) => `${(100 * v).toFixed(1)}%`;
const bandLine = (name, b) =>
  `    ${name.padEnd(20)} ink ${pct(b.minInkLost).padStart(6)} .. ${pct(b.maxInkLost).padStart(6)}` +
  `     contrast ${pct(b.minContrastLost).padStart(6)} .. ${pct(b.maxContrastLost).padStart(6)}`;
console.log(
  `\nwrote data/vector.json  (${legible.length} settings where a pattern is still legible)\n` +
    `  at the zoom floor: up to ${maxMembers} members, ${Math.round(maxInk)} px of stroke per frame\n` +
    `  what \`over\` loses:\n` +
    `${bandLine('below 1 member/px', out.summary.belowOnePerPixel)}\n` +
    `${bandLine('3 to 6 members/px', out.summary.threeToSix)}\n` +
    `${bandLine('6+ members/px', out.summary.sixAndUp)}\n` +
    `  worst fringe contrast lost ${pct(maxContrastLost)} ` +
    `(${out.summary.maxContrastLostAt.scene}, ${out.summary.maxContrastLostAt.membersPerPixel.toFixed(1)}/px)` +
    `; unblurred ${pct(out.summary.maxContrastLostUnblurred)}\n` +
    `  worst single pixel ${maxPixel.toFixed(3)}`
);
