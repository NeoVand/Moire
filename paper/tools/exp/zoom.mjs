// What the stroke floor actually buys, measured.
//
// The claim we shipped on faith is that clamping the stroke half-width to 1.15 px
// keeps a zoomed-out pattern from breaking up. That is a claim about sampling, so the
// honest test is against a well-prefiltered reference: render the same world window
// at 36 samples per pixel, then render it at one sample per pixel -- what the shader
// does -- under three rules, and report how each one differs from the reference.
//
//   ours     distance composite with the stroke floor of Eq. (26)
//   noFloor  the same, floor removed, so strokes may fall below the sample spacing
//   value    threshold the *phase* residual against a constant, with no gradient
//            divide and no floor: the shader-sandbox idiom of Section 2
//
// Two numbers per rule. *Bias* is the mean signed ink error: how much darker or
// lighter than truth the frame is. *Noise* is the standard deviation of that error,
// which is the speckle -- the thing that reads as breakage rather than as a shade.
// The interesting result is that they trade against each other.
//
// Also writes the figure.
//
//   node paper/tools/exp/zoom.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { compose, tile, view } from '../lib/render.mjs';
import { loadSolver } from '../lib/instrument.mjs';
import { writePng } from '../lib/png.mjs';

const FIGS = new URL('../../figures/', import.meta.url);
const DATA = new URL('../../data/', import.meta.url);
mkdirSync(FIGS, { recursive: true });
mkdirSync(DATA, { recursive: true });

// One ink, as the tool's own default project has it.
const INK = '#14171b';

// ---------------------------------------------------------------- measurement

// A spiral over circles: closed-form, aperiodic, and with a gradient magnitude that
// is not 1, so the value composite has something to get wrong.
const SCENE = [
  { kind: 'spiral', spacing: 12, bend: 72 },
  { kind: 'concentric', shape: 'circle', spacing: 13, position: { x: 40, y: -25 } },
];
const THICK = 1.8;
const WORLD = 256;
const ZOOMS = [2, 1, 0.5, 0.25, 0.125];
const RULES = {
  ours: { floor: 1.15, useGrad: true },
  noFloor: { floor: 0, useGrad: true },
  value: { floor: 0, useGrad: false },
};
const REF_SS = 6;

/** Per-pixel ink fraction of the frame at `zoom`, at `ss` samples per pixel. */
function inkImage(zoom, rule, ss) {
  const px = Math.round(WORLD * zoom);
  const V = view({ width: px, height: px, zoom, superSample: ss });
  const rgb = compose(
    V,
    SCENE.map((cfg) => ({ ...cfg, thickness: THICK, color: '#000000', ...rule }))
  );
  const ink = new Float64Array(px * px);
  for (let i = 0; i < px * px; i++) {
    const o = i * 3;
    ink[i] = 1 - (0.299 * rgb[o] + 0.587 * rgb[o + 1] + 0.114 * rgb[o + 2]) / 255;
  }
  return { ink, px };
}

const results = {};
const gain = [];
for (const name of Object.keys(RULES)) results[name] = { perZoom: [] };

for (const zoom of ZOOMS) {
  // The reference is the same rule as `ours` -- the same geometry, the same stroke --
  // only sampled properly. Comparing a rule against a prefiltered version of itself
  // isolates the sampling error from any difference of intent.
  const ref = inkImage(zoom, RULES.ours, REF_SS);
  const refNoFloor = inkImage(zoom, RULES.noFloor, REF_SS);
  const period = SCENE[0].spacing * zoom;

  // What the clamp costs even when sampled perfectly: the floor draws more ink than
  // the hairline it stands in for, and this is how much.
  const meanOf = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  gain.push({
    zoom,
    periodPx: Math.round(period * 100) / 100,
    inkGain: Math.round((meanOf(ref.ink) - meanOf(refNoFloor.ink)) * 1e4) / 1e4,
  });

  for (const [name, rule] of Object.entries(RULES)) {
    const got = inkImage(zoom, rule, 1);
    // `ours` clamps the stroke, so its own prefiltered version is the honest target;
    // the other two intend the unclamped stroke.
    const target = name === 'ours' ? ref : refNoFloor;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < got.ink.length; i++) {
      const e = got.ink[i] - target.ink[i];
      sum += e;
      sumSq += e * e;
    }
    const n = got.ink.length;
    const bias = sum / n;
    const noise = Math.sqrt(Math.max(sumSq / n - bias * bias, 0));
    results[name].perZoom.push({
      zoom,
      px: got.px,
      periodPx: Math.round(period * 100) / 100,
      bias: Math.round(bias * 1e4) / 1e4,
      noise: Math.round(noise * 1e4) / 1e4,
    });
  }
}

for (const [name, r] of Object.entries(results)) {
  const biases = r.perZoom.map((p) => p.bias);
  const noises = r.perZoom.map((p) => p.noise);
  r.worstBias = Math.max(...biases.map(Math.abs));
  r.worstNoise = Math.max(...noises);
  r.coarsestBias = biases[biases.length - 1];
  r.coarsestNoise = noises[noises.length - 1];
  console.log(
    `${name.padEnd(8)} worst |bias| ${r.worstBias.toFixed(3)}   worst noise ${r.worstNoise.toFixed(3)}` +
      `   at the coarsest zoom: bias ${r.coarsestBias.toFixed(3)}, noise ${r.coarsestNoise.toFixed(3)}`
  );
}

const worstGain = Math.max(...gain.map((g) => g.inkGain));
console.log(
  `floor's own cost: up to ${worstGain.toFixed(3)} extra ink even when sampled perfectly`
);

const decades = Math.log10(ZOOMS[0] / ZOOMS[ZOOMS.length - 1]);
writeFileSync(
  new URL('zoom.json', DATA),
  JSON.stringify(
    {
      world: WORLD,
      thickness: THICK,
      zooms: ZOOMS,
      referenceSamples: REF_SS * REF_SS,
      decades: decades.toFixed(1),
      scene: 'Archimedean spiral over displaced concentric circles',
      floorInkGain: gain,
      worstFloorInkGain: worstGain,
      ...results,
    },
    null,
    2
  )
);
console.log(`wrote data/zoom.json (${decades.toFixed(1)} decades)`);

// -------------------------------------------------------------------- figure

// The picture uses a different scene from the measurement, because it has a
// different job: the measurement needs a pair every rule can express, and the
// picture needs a pair whose fringe system is still legible after its carrier
// stops being resolvable. This one is the tool's own opening view -- the project
// Moire eases into on first load -- recomposed on the frame's diagonal, so that an
// eight-fold zoom-out lands on a fringe rosette rather than on a black square.
// Both families walk, so both go through the shipped solver.
const solver = await loadSolver('final');
const PANEL = 540;

/** The tool's layer pose, then the shipped ring solver. Mirrors composite.ts. */
function ringLayer(L, floor) {
  const rot = (L.rotation * Math.PI) / 180;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return {
    thickness: L.thickness,
    color: L.color,
    floor,
    dist: (p, halfT, aa) =>
      solver.ringDistance(
        { x: c * p.x + s * p.y - L.position.x, y: -s * p.x + c * p.y - L.position.y },
        L.offset,
        0,
        L.spacing,
        0,
        1,
        6,
        Math.max(halfT - aa, 0),
        halfT + aa
      ),
  };
}

const K = 3;

/**
 * Where to store a layer's position so its family lands on a given world point.
 *
 * A layer's pose rotates before it translates -- `ringLayer` above, and
 * composite.ts, both compute q = R(-rot) p - position -- so the centre of the
 * family is at R(rot) * position, not at position. Setting `position` to a point
 * on the diagonal therefore does *not* put the centre on the diagonal unless the
 * rotation happens to be zero, which is the bug this replaces: the two centres
 * were at (-9.2, 105.7) and (-82.2, -67.0), on a line 113 degrees off the
 * diagonal the caption claimed, with their midpoint 50 units from the frame's.
 * Inverting the rotation here is the whole fix.
 */
function positionFor(centre, rotationDeg) {
  const r = (-rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: c * centre.x - s * centre.y, y: s * centre.x + c * centre.y };
}

// The two centres, on the frame's diagonal and symmetric about its middle, so
// every zoom frames the pair the same way and the fringe rosette between them
// stays centred as the view widens.
const POLE = 23 * K;
const OPENING = [
  {
    centre: { x: POLE, y: POLE },
    rotation: 50,
    spacing: 6 * K,
    offset: { x: 0, y: -0.5 * K },
    thickness: 3.5,
    color: INK,
  },
  {
    centre: { x: -POLE, y: -POLE },
    rotation: -5.8,
    spacing: 6 * K,
    offset: { x: 0, y: 0.5 * K },
    thickness: 3.5,
    color: INK,
  },
].map((L) => ({ ...L, position: positionFor(L.centre, L.rotation) }));

// The claim the caption makes, checked rather than asserted.
for (const L of OPENING) {
  const r = (L.rotation * Math.PI) / 180;
  const back = {
    x: Math.cos(r) * L.position.x - Math.sin(r) * L.position.y,
    y: Math.sin(r) * L.position.x + Math.cos(r) * L.position.y,
  };
  if (Math.abs(back.x - L.centre.x) > 1e-9 || Math.abs(back.y - L.centre.y) > 1e-9) {
    throw new Error(`layer pose does not land on its centre: wanted ${JSON.stringify(L.centre)}, got ${JSON.stringify(back)}`);
  }
  if (Math.abs(back.x - back.y) > 1e-9) {
    throw new Error(`centre ${JSON.stringify(back)} is not on the frame's diagonal`);
  }
}

function panel(zoom, { floor = 1.15 } = {}) {
  const V = view({ width: PANEL, height: PANEL, zoom, superSample: 1 });
  return {
    rgb: compose(V, OPENING.map((L) => ringLayer(L, floor))),
    width: PANEL,
    height: PANEL,
  };
}

const SHOWN = [2, 1, 0.25];
const panels = SHOWN.map((z) => panel(z));
panels.push(panel(SHOWN[2], { floor: 0 }));
const strip = tile(panels, 4, 14, 255);
writePng(new URL('zoom.png', FIGS).pathname, strip.rgb, strip.width, strip.height);
console.log(`wrote figures/zoom.png (${strip.width}x${strip.height}) at zooms ${SHOWN.join(', ')}`);
