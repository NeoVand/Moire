// The field view of a layer, in one place.
//
// A layer is a family of curves. We represent it by a *phase* function psi,
// chosen so that member n is the level set {psi = n*s + phi}. Two things fall
// out of psi and nothing else is needed to render:
//
//   index(p)    = (psi(p) - phi) / s          which member, fractionally
//   distance(p) = periodicDist(psi - phi, s) / |grad psi|
//
// The gradient divide is what turns a phase residual into a Euclidean distance,
// and it is the term the shader omits for three of the four curve families
// (see exp/gradient.mjs). Everything here is the corrected form; `noGrad`
// reproduces the shipped behaviour for the comparison figure.
//
// Gradients are carried as vectors rather than magnitudes because a layer may
// carry an encoded *field*, which shifts psi and therefore changes grad psi. The
// field itself is imported from the shipped source, not restated here, so a
// figure of an encoded field is a figure of what the app draws: a `field` is the
// text of an expression, or the id of one of the Studio's presets, compiled by
// the same compiler the shader's code generator reads and evaluated by the same
// dual-number evaluator the Studio's live preview runs.

import { compileField, FIELD_PRESETS } from '../../../src/fields/expr.ts';
import { evalField } from '../../../src/fields/evalExpr.ts';

const TAU = Math.PI * 2;
const ROOT3_2 = Math.sqrt(3) / 2;
const WAVE_CYCLE = 32;
const PARABOLA_BEND = 0.01;

const programs = new Map();

/**
 * Compile a field once. `source` is either the id of a Studio preset or the text
 * of an expression; `'none'` and the empty string mean the layer carries no
 * field. Throws rather than silently drawing an unmodulated layer, since a typo
 * in a figure script would otherwise look like a result.
 */
export function fieldProgram(source) {
  if (!source || source === 'none') return null;
  if (programs.has(source)) return programs.get(source);
  const preset = FIELD_PRESETS.find((p) => p.id === source);
  const compiled = compileField(preset ? preset.source : source);
  if (!compiled.ok) throw new Error(`field "${source}" does not compile: ${compiled.error}`);
  programs.set(source, compiled);
  return compiled;
}

/**
 * `{ f, gx, gy }` at `q`, with the partials per world unit.
 *
 * The expression is entered in coordinates normalised by `scale`, so it is
 * dimensionless and O(1) over the box `|q| < scale`; the chain rule back to world
 * units is the one divide. `src/fields/expr.wgsl.ts` wraps the emitted code the
 * same way, which is what makes this a mirror rather than a second opinion.
 */
export function sampleField(program, q, scale) {
  const L = Math.max(Math.abs(scale), 1e-3);
  const s = evalField(program.code, program.literals, q.x / L, q.y / L);
  return { f: s.f, gx: s.gx / L, gy: s.gy / L };
}

export function periodicDist(value, spacing) {
  const s = Math.abs(spacing);
  if (s < 1e-8) return Math.abs(value);
  const q = value / s;
  const f = q - Math.floor(q);
  return Math.min(f, 1 - f) * s;
}

function wrapToHalf(ang, seg) {
  const half = seg * 0.5;
  let a = ((ang + half) % seg) - half;
  if (a < -half) a += seg;
  if (a > half) a -= seg;
  return a;
}

/** Inradius metric of a regular N-gon, as a support function. |grad| = 1 a.e. */
export function shapeRadius(q, shape, sides = 6) {
  if (shape <= 1) return Math.hypot(q.x, q.y);
  if (shape === 2) return Math.max(Math.abs(q.x), Math.abs(q.y));
  const n = shape === 3 ? 3 : Math.max(3, sides);
  if (Math.abs(n - 3) < 1e-3) return Math.max(q.x, ROOT3_2 * Math.abs(q.y) - 0.5 * q.x);
  if (Math.abs(n - 4) < 1e-3) return Math.max(Math.abs(q.x), Math.abs(q.y));
  if (Math.abs(n - 6) < 1e-3) {
    const ax = Math.abs(q.x);
    return Math.max(ax, 0.5 * ax + ROOT3_2 * Math.abs(q.y));
  }
  return Math.hypot(q.x, q.y) * Math.cos(wrapToHalf(Math.atan2(q.y, q.x), TAU / n));
}

/**
 * Gradient of the inradius metric: the outward normal of the facet that attains
 * the support maximum. A unit vector everywhere off the facet seams, which is why
 * a concentric family needs no gradient divide.
 */
export function shapeGradVec(q, shape, sides = 6) {
  const r = Math.hypot(q.x, q.y);
  if (r < 1e-9) return { x: 1, y: 0 };
  if (shape <= 1) return { x: q.x / r, y: q.y / r };
  const n = shape === 2 ? 4 : shape === 3 ? 3 : Math.max(3, Math.round(sides));
  let best = -Infinity;
  let out = { x: 1, y: 0 };
  for (let k = 0; k < n; k++) {
    const a = (k * TAU) / n;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    const v = q.x * nx + q.y * ny;
    if (v > best) {
      best = v;
      out = { x: nx, y: ny };
    }
  }
  return out;
}

const SHAPE_CODE = { circle: 1, square: 2, triangle: 3, hexagon: 4, polygon: 4 };

/**
 * Build a family. `kind` names the phase function; the rest are the same knobs
 * the Studio exposes. Returns { psi, grad, spacing, phase, label }.
 *
 * `pose` is the layer transform: world -> layer coordinates, so a family can be
 * rotated and translated without touching its phase function.
 */
const LATTICE_CODE = { square: 0, hex: 1, hexagon: 1, triangle: 2 };
const HEX_Y = Math.sqrt(3) / 2;

/** Nearest lattice node in cube coordinates. Exact, and branch-light. */
function hexRound(u, v) {
  const x = u;
  const z = v;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xd = Math.abs(rx - x);
  const yd = Math.abs(ry - y);
  const zd = Math.abs(rz - z);
  if (xd > yd && xd > zd) rx = -ry - rz;
  else if (yd > zd) ry = -rx - rz;
  else rz = -rx - ry;
  return { u: rx, v: rz };
}

/** One line family, measured in world units under an anisotropic scale. */
function scaledLine(p, angle, pitch, sx, sy) {
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const s = Math.abs(pitch) < 1e-4 ? 1e-4 : pitch;
  const q = (p.x * nx + p.y * ny) / s;
  const f = q - Math.floor(q);
  const d = Math.min(f, 1 - f) * Math.abs(s);
  return d / Math.max(Math.hypot(nx / sx, ny / sy), 1e-6);
}

/**
 * Distances to the nearest edge and nearest vertex of a lattice. Ported from
 * src/gpu/latticeCpu.ts so the figures and the shader agree; hexagon edges are
 * hexagon sides via the support form, not three superposed line families.
 */
function latticeHits(p, code, spacing, sx, sy) {
  const s = Math.max(spacing, 1e-4);
  if (code <= 0) {
    const gx = p.x / (s * sx);
    const gy = p.y / (s * sy);
    const fx = gx - Math.floor(gx);
    const fy = gy - Math.floor(gy);
    const dx = Math.min(fx, 1 - fx) * s * sx;
    const dy = Math.min(fy, 1 - fy) * s * sy;
    return { edge: Math.min(dx, dy), vertex: Math.hypot(dx, dy) };
  }
  const pL = { x: p.x / sx, y: p.y / sy };
  if (code === 1) {
    const h = s * Math.sqrt(3);
    const b = pL.y / (1.5 * s);
    const a = (pL.x - b * h * 0.5) / h;
    const r = hexRound(a, b);
    const q = { x: pL.x - (r.u * h + r.v * h * 0.5), y: pL.y - r.v * 1.5 * s };
    const apothem = s * HEX_Y;
    let edge = Infinity;
    let vertex = Infinity;
    for (let k = 0; k < 6; k++) {
      const ang = (k * Math.PI) / 3;
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      edge = Math.min(
        edge,
        (apothem - (q.x * nx + q.y * ny)) / Math.max(Math.hypot(nx / sx, ny / sy), 1e-6)
      );
      const va = Math.PI / 6 + (k * Math.PI) / 3;
      vertex = Math.min(
        vertex,
        Math.hypot((q.x - s * Math.cos(va)) * sx, (q.y - s * Math.sin(va)) * sy)
      );
    }
    return { edge: Math.max(edge, 0), vertex };
  }
  const pitch = s * HEX_Y;
  const edge = Math.min(
    scaledLine(pL, 0, pitch, sx, sy),
    scaledLine(pL, Math.PI / 3, pitch, sx, sy),
    scaledLine(pL, (2 * Math.PI) / 3, pitch, sx, sy)
  );
  const vv = pL.y / (s * HEX_Y);
  const uu = (pL.x - vv * (s * 0.5)) / s;
  const r = hexRound(uu, vv);
  const cx = r.u * s + r.v * s * 0.5;
  const cy = r.v * s * HEX_Y;
  return { edge, vertex: Math.hypot((pL.x - cx) * sx, (pL.y - cy) * sy) };
}

export function family(cfg = {}) {
  const {
    kind = 'concentric',
    shape = 'circle',
    sides = 6,
    spacing = 20,
    phase = 0,
    angle = 0,
    bend = 0,
    frequency = 1,
    lineCount = 8,
    position = { x: 0, y: 0 },
    rotation = 0,
    warp = null,
    lattice = 'square',
    scale = { x: 1, y: 1 },
    drawEdges = true,
    vertexSize = 0,
    // The Studio's Field control: `field` names one of the six shipped fields,
    // `fieldAmount` is fringes per unit of it, `fieldScale` its extent.
    field = 'none',
    fieldAmount = 0,
    fieldScale = 200,
    // A constant shift of the phase residual, in world units. The envelope view's
    // one parameter: `phaseShift = u * spacing` advances the family by u periods.
    // Families that index members by two integers have no residual and ignore it.
    phaseShift = 0,
  } = cfg;

  const rot = (rotation * Math.PI) / 180;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const toLocal = (p) => {
    const x = cr * p.x + sr * p.y - position.x;
    const y = -sr * p.x + cr * p.y - position.y;
    return warp ? warp({ x, y }) : { x, y };
  };

  let psiLocal;
  let gradVecLocal;
  // Lattices index their members by two integers, so they have no phase function
  // and supply a distance directly. See the catalog section.
  let distLocal = null;

  switch (kind) {
    case 'parallel': {
      const u = { x: Math.cos(angle), y: Math.sin(angle) };
      psiLocal = (q) => q.x * u.x + q.y * u.y;
      gradVecLocal = () => u;
      break;
    }
    case 'concentric': {
      const code = SHAPE_CODE[shape] ?? 1;
      psiLocal = (q) => shapeRadius(q, code, sides);
      gradVecLocal = (q) => shapeGradVec(q, code, sides);
      break;
    }
    case 'wave': {
      const lambda = WAVE_CYCLE / Math.max(frequency, 0.05);
      const k = TAU / lambda;
      psiLocal = (q) => q.x - bend * Math.sin(k * q.y + phase);
      gradVecLocal = (q) => ({ x: 1, y: -bend * k * Math.cos(k * q.y + phase) });
      break;
    }
    case 'parabola': {
      const a = bend * PARABOLA_BEND;
      psiLocal = (q) => q.y - a * q.x * q.x;
      gradVecLocal = (q) => ({ x: -2 * a * q.x, y: 1 });
      break;
    }
    case 'hyperbola': {
      psiLocal = (q) => Math.sqrt(Math.abs(q.x * q.x - q.y * q.y));
      gradVecLocal = (q) => {
        const u = q.x * q.x - q.y * q.y;
        const m = Math.sqrt(Math.abs(u));
        if (m < 1e-9) return { x: 1e6, y: 0 };
        return { x: (Math.sign(u) * q.x) / m, y: (-Math.sign(u) * q.y) / m };
      };
      break;
    }
    case 'spiral': {
      const starts = Math.max(1, Math.round(Math.abs(bend) / spacing));
      const b = (starts * spacing) / TAU;
      psiLocal = (q) => Math.hypot(q.x, q.y) - b * Math.atan2(q.y, q.x);
      gradVecLocal = (q) => {
        const r = Math.hypot(q.x, q.y);
        if (r < 1e-6) return { x: 1e6, y: 0 };
        return { x: q.x / r + (b * q.y) / (r * r), y: q.y / r - (b * q.x) / (r * r) };
      };
      break;
    }
    case 'walking': {
      // Member n is the circle ||q - n*offset|| = n*spacing + phase: each ring
      // in its own frame, so no closed-form phase function exists. But with the
      // drift below the spacing the residual h(n) = ||q - n*offset|| - (n s + phi)
      // is strictly decreasing in n, so the bracketing pair (h(n) >= 0 > h(n+1))
      // is unique and the fractional index n + h(n)/(h(n) - h(n+1)) is a
      // continuous scalar field whose level sets are exactly the members -- the
      // local index field the fringe law needs, found by search rather than in
      // closed form. Scaled by the spacing it plays the role of psi.
      const off = cfg.offset ?? { x: 0, y: 0 };
      if (Math.hypot(off.x, off.y) >= spacing) {
        throw new Error('walking family: drift must stay below the spacing');
      }
      const hh = (q, n) => Math.hypot(q.x - n * off.x, q.y - n * off.y) - (n * spacing + phase);
      const idxLocal = (q) => {
        const h0 = hh(q, 0);
        if (h0 <= 0) return h0 / (h0 - hh(q, 1));
        let lo = 0;
        let hi = 1;
        while (hh(q, hi) > 0 && hi < 1 << 20) {
          lo = hi;
          hi *= 2;
        }
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (hh(q, mid) > 0) lo = mid;
          else hi = mid;
        }
        return lo + hh(q, lo) / (hh(q, lo) - hh(q, hi));
      };
      psiLocal = (q) => idxLocal(q) * spacing + phase;
      gradVecLocal = (q) => {
        const h = 0.05;
        return {
          x: (psiLocal({ x: q.x + h, y: q.y }) - psiLocal({ x: q.x - h, y: q.y })) / (2 * h),
          y: (psiLocal({ x: q.x, y: q.y + h }) - psiLocal({ x: q.x, y: q.y - h })) / (2 * h),
        };
      };
      break;
    }
    case 'custom': {
      // An arbitrary phase function, for encoding a field in an index difference.
      // `psiFn` is in world units like every other family; `gradFn` is optional
      // and defaults to a central difference.
      const { psiFn, gradFn } = cfg;
      psiLocal = psiFn;
      gradVecLocal = gradFn
        ? (q) => ({ x: gradFn(q), y: 0 })
        : (q) => {
            const h = 0.05;
            return {
              x: (psiFn({ x: q.x + h, y: q.y }) - psiFn({ x: q.x - h, y: q.y })) / (2 * h),
              y: (psiFn({ x: q.x, y: q.y + h }) - psiFn({ x: q.x, y: q.y - h })) / (2 * h),
            };
          };
      break;
    }
    case 'radial': {
      // The index field is the angular sector, in units that put the N lines at
      // integers. The distance, though, is not a phase residual: the shader takes
      // it straight, and subtracts a disc of radius `phase` around the origin,
      // because N lines crossing at a point is otherwise a black dot.
      const n = Math.max(1, Math.round(lineCount));
      const seg = Math.PI / n;
      const inner = Math.max(0, phase);
      psiLocal = (q) => (Math.atan2(q.y, q.x) * n) / Math.PI;
      gradVecLocal = (q) => {
        const r2 = q.x * q.x + q.y * q.y;
        if (r2 < 1e-12) return { x: 1e6, y: 0 };
        return { x: (-n * q.y) / (Math.PI * r2), y: (n * q.x) / (Math.PI * r2) };
      };
      distLocal = (q) => {
        const r = Math.hypot(q.x, q.y);
        if (r < 1e-6) return inner;
        const a = Math.atan2(q.y, q.x);
        const half = seg * 0.5;
        let w = ((a + half) % seg) - half;
        if (w < -half) w += seg;
        if (w > half) w -= seg;
        return Math.max(r * Math.abs(Math.sin(w)), inner - r);
      };
      break;
    }
    case 'lattice': {
      const code = LATTICE_CODE[lattice] ?? 0;
      const sx = Math.abs(scale.x) < 1e-4 ? 1e-4 : scale.x;
      const sy = Math.abs(scale.y) < 1e-4 ? 1e-4 : scale.y;
      psiLocal = () => 0;
      gradVecLocal = () => ({ x: 1, y: 0 });
      distLocal = (q) => {
        const hits = latticeHits(q, code, spacing, sx, sy);
        let d = Infinity;
        if (drawEdges) d = Math.min(d, hits.edge);
        if (vertexSize > 1e-3) d = Math.min(d, hits.vertex);
        return d;
      };
      break;
    }
    default:
      throw new Error(`unknown family kind: ${kind}`);
  }

  // A field is a shift of the phase residual, so it applies exactly where there is
  // a residual to shift -- not to lattices or to a radial fan. `amount · spacing`
  // is the gain that makes the index difference against an unmodulated twin come
  // out as `amount · f`, so the fringes are the field's level sets at interval
  // `1/amount`.
  const program = fieldProgram(field);
  const gain = distLocal || !program ? 0 : fieldAmount * spacing;
  if (gain !== 0) {
    const bare = psiLocal;
    const bareGrad = gradVecLocal;
    psiLocal = (q) => bare(q) - sampleField(program, q, fieldScale).f * gain;
    gradVecLocal = (q) => {
      const w = sampleField(program, q, fieldScale);
      const g = bareGrad(q);
      return { x: g.x - w.gx * gain, y: g.y - w.gy * gain };
    };
  }

  const psi = (p) => psiLocal(toLocal(p));
  const gradVec = (p) => gradVecLocal(toLocal(p));
  const grad = (p) => {
    const g = gradVec(p);
    return Math.hypot(g.x, g.y);
  };
  // Wave folds its phase into the sine; radial reads `phase` as a hole radius.
  const usePhase = (kind === 'wave' || kind === 'radial' ? 0 : phase) + phaseShift;
  const dist = distLocal
    ? (p) => distLocal(toLocal(p))
    : (p) => periodicDist(psi(p) - usePhase, spacing) / Math.max(grad(p), 1e-6);

  return {
    kind,
    spacing,
    phase: usePhase,
    label: cfg.label ?? kind,
    psi,
    grad,
    gradVec,
    field,
    fieldAmount: gain === 0 ? 0 : fieldAmount,
    fieldScale,
    /** Fractional member index at p. Integer values land on curves. */
    index: (p) => (psi(p) - usePhase) / spacing,
    /** Euclidean distance to the nearest member. */
    distance: dist,
    /** What the shader currently computes for wave / hyperbola / spiral. */
    distanceNoGrad: distLocal ? dist : (p) => periodicDist(psi(p) - usePhase, spacing),
  };
}

/**
 * Gradient of a family's index field, by central differences. The step is well
 * inside one period for every family in the catalog, so this is the local phase
 * gradient rather than a secant across curves.
 */
export function gradIndex(fam, p, h = 0.25) {
  return {
    x: (fam.index({ x: p.x + h, y: p.y }) - fam.index({ x: p.x - h, y: p.y })) / (2 * h),
    y: (fam.index({ x: p.x, y: p.y + h }) - fam.index({ x: p.x, y: p.y - h })) / (2 * h),
  };
}

/**
 * Heterodyne ratio r = |grad D| / |grad phi_mean|: how far apart the two carriers
 * are, relative to how fast they run. Small r is the fringe regime. Returns
 * Infinity where the mean gradient vanishes, since the two carriers oppose each
 * other exactly there and no fringe of the family scale survives.
 */
export function heterodyneRatio(famA, famB, p) {
  const ga = gradIndex(famA, p);
  const gb = gradIndex(famB, p);
  const mean = Math.hypot((ga.x + gb.x) / 2, (ga.y + gb.y) / 2);
  if (!(mean > 1e-4)) return Infinity;
  return Math.hypot(ga.x - gb.x, ga.y - gb.y) / mean;
}

/**
 * Ink coverage of one family at p, matching src/gpu/composite.ts: a stroke floor
 * of 1.15 pixels so hairlines survive zoom-out, and a 0.7-pixel smoothstep band.
 */
export function coverage(fam, p, thickness, pixel, useGrad = true) {
  const halfT = Math.max(thickness * 0.5, pixel * 1.15);
  const aa = pixel * 0.7;
  const d = useGrad ? fam.distance(p) : fam.distanceNoGrad(p);
  const t = Math.min(1, Math.max(0, (d - (halfT - aa)) / Math.max(2 * aa, 1e-9)));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Index-space stroke half-width: how much of one period a stroke occupies,
 * as a fraction. `halfT * |grad psi| / s` — the stroke measured in members.
 */
export function inkWidth(fam, p, thickness, pixel) {
  const halfT = Math.max(thickness * 0.5, pixel * 1.15);
  return (halfT * Math.max(fam.grad(p), 1e-6)) / fam.spacing;
}

/**
 * Mean ink coverage predicted by the index difference alone.
 *
 * Over a neighbourhood small enough that D = phi1 - phi2 is constant but large
 * enough that phi1 sweeps a full period, each family covers a band of half-width
 * w_i around the integers, and the two bands share
 * `max(0, w1 + w2 - dist(D, Z))`. So the union covers
 *
 *   2*w1 + 2*w2 - max(0, w1 + w2 - dist(D, Z)).
 *
 * A tent in the index difference, saturating once the strokes clear each other.
 * Light fringes sit on {D in Z}; dark ones halfway between. Nothing here is
 * periodic in p, or assumes the families are.
 */
export function predictedCoverage(delta, w1, w2) {
  const gap = periodicDist(delta, 1);
  const overlap = Math.max(0, w1 + w2 - gap);
  return 2 * w1 + 2 * w2 - overlap;
}
