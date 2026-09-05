// Fourier jets: pictures on tori as the semantics of an anti-aliasing compiler.
//
// A shader traced on this language becomes F(c_1(z), ..., c_K(z); p(z)):
// periodic in the counts c_j, smooth in the parameters. Every non-smooth
// primitive (fract, mod, sin, cos, step, sign, abs, max, min, comparisons)
// applied to something with a smooth part makes that part a count, an AXIS;
// what it computes is a PICTURE on the torus of the axes; everything smooth
// composes. A count may carry a FIELD, a picture on other axes added to it
// (fract(q + 0.2 sin psi): the axis q with the field 0.2 sin psi), which is
// the paper's field on a count, and its expansion is Jacobi-Anger in general:
// e^{2 pi i k (s + G)} = e^{2 pi i k s} e^{2 pi i k G}.
//
// The pixel is a Gaussian of sigma SIG in screen coordinates z. A JET is a
// value with gradient and Hessian in z. The pixel functional of a term
// a(z) e^{2 pi i k.c(z)} is closed form: with b = 2 pi sum k grad c and
// Q = 2 pi sum k Hess c,
//   E[a e^{i phi}] = e^{i phi0} (a0 I0 + g.I1 + tr(H I2)/2),
//   I0 = det(I - i sig^2 Q)^{-1/2} exp(-b^T M^{-1} b / 2), M = I/sig^2 - iQ,
//   I1 = i M^{-1} b I0,  I2 = (M^{-1} - M^{-1} b b^T M^{-1}) I0.
// The cost is the number of recipes k whose coefficient times multiplier is
// above CUT, enumerated in the ellipsoid of slow recipes before any term is
// computed.

const TAU = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Jets: second-order automatic differentiation in the two pixel coordinates
// ---------------------------------------------------------------------------
export class Jet {
  constructor(v, gx = 0, gy = 0, hxx = 0, hxy = 0, hyy = 0) {
    this.v = v;
    this.gx = gx;
    this.gy = gy;
    this.hxx = hxx;
    this.hxy = hxy;
    this.hyy = hyy;
  }
  static c(v) {
    return new Jet(v);
  }
  add(o) {
    return new Jet(this.v + o.v, this.gx + o.gx, this.gy + o.gy, this.hxx + o.hxx, this.hxy + o.hxy, this.hyy + o.hyy);
  }
  sub(o) {
    return new Jet(this.v - o.v, this.gx - o.gx, this.gy - o.gy, this.hxx - o.hxx, this.hxy - o.hxy, this.hyy - o.hyy);
  }
  scale(s) {
    return new Jet(this.v * s, this.gx * s, this.gy * s, this.hxx * s, this.hxy * s, this.hyy * s);
  }
  neg() {
    return this.scale(-1);
  }
  mul(o) {
    return new Jet(
      this.v * o.v,
      this.gx * o.v + this.v * o.gx,
      this.gy * o.v + this.v * o.gy,
      this.hxx * o.v + 2 * this.gx * o.gx + this.v * o.hxx,
      this.hxy * o.v + this.gx * o.gy + this.gy * o.gx + this.v * o.hxy,
      this.hyy * o.v + 2 * this.gy * o.gy + this.v * o.hyy,
    );
  }
  // f(this) with f, f', f'' at the value
  unary(f, d1, d2) {
    return new Jet(
      f,
      d1 * this.gx,
      d1 * this.gy,
      d2 * this.gx * this.gx + d1 * this.hxx,
      d2 * this.gx * this.gy + d1 * this.hxy,
      d2 * this.gy * this.gy + d1 * this.hyy,
    );
  }
  inv() {
    const v = this.v;
    return this.unary(1 / v, -1 / (v * v), 2 / (v * v * v));
  }
  div(o) {
    return this.mul(o.inv());
  }
  sqrt() {
    const s = Math.sqrt(this.v);
    // at zero the derivatives are infinite; a finite jet with the right
    // value is what a kink's tip should carry (a point of measure zero)
    if (s < 1e-150) return Jet.c(s);
    return this.unary(s, 0.5 / s, -0.25 / (s * this.v));
  }
  exp() {
    const e = Math.exp(this.v);
    return this.unary(e, e, e);
  }
  log() {
    return this.unary(Math.log(this.v), 1 / this.v, -1 / (this.v * this.v));
  }
  pow(n) {
    const v = this.v;
    return this.unary(Math.pow(v, n), n * Math.pow(v, n - 1), n * (n - 1) * Math.pow(v, n - 2));
  }
  sin() {
    return this.unary(Math.sin(this.v), Math.cos(this.v), -Math.sin(this.v));
  }
  cos() {
    return this.unary(Math.cos(this.v), -Math.sin(this.v), -Math.cos(this.v));
  }
  isConst() {
    return this.gx === 0 && this.gy === 0 && this.hxx === 0 && this.hxy === 0 && this.hyy === 0;
  }
  gradNorm() {
    return Math.hypot(this.gx, this.gy);
  }
}
const J0 = Jet.c(0);
const J1 = Jet.c(1);

// complex jets as pairs
const cj = (re, im) => ({ re, im });
const cjMul = (a, b) => cj(a.re.mul(b.re).sub(a.im.mul(b.im)), a.re.mul(b.im).add(a.im.mul(b.re)));
const cjAdd = (a, b) => cj(a.re.add(b.re), a.im.add(b.im));
const cjScale = (a, s) => cj(a.re.scale(s), a.im.scale(s));
const cjScaleC = (a, re, im) => cj(a.re.scale(re).sub(a.im.scale(im)), a.re.scale(im).add(a.im.scale(re)));

// ---------------------------------------------------------------------------
// Axes, factors, elements
// ---------------------------------------------------------------------------
const DEBUG = !!process.env.FJET_DEBUG;
let axisCounter = 0;
const axisRegistry = new Map();
// Identity of a represented expression is lossless: a count is its six jet
// components exactly, a field is its element's signature with every
// coefficient jet exact. Two fields whose coefficients agree at the pixel
// centre but differ in their derivatives (X sin B and 2X sin B on the axis
// X = 0) once shared an axis because the signature rounded the centre value
// and dropped the derivatives; their difference traced to zero. Caches may
// use approximate keys; identity may not.
const num = (v) => (v === 0 ? '0' : v.toString());
const jetSig = (j) => `${num(j.v)},${num(j.gx)},${num(j.gy)},${num(j.hxx)},${num(j.hxy)},${num(j.hyy)}`;
const axisKey = (count, field, kind) => `${kind}|${jetSig(count)}|${field ? elementSig(field) : ''}`;
// count1 = r * count2 as jets? returns r or null
const proportion = (c1, c2) => {
  const p = [c1.v, c1.gx, c1.gy, c1.hxx, c1.hxy, c1.hyy];
  const q = [c2.v, c2.gx, c2.gy, c2.hxx, c2.hxy, c2.hyy];
  let r = null;
  for (let i = 0; i < 6; i++) {
    if (Math.abs(q[i]) > 1e-12 * (1 + Math.abs(p[i]))) {
      r = p[i] / q[i];
      break;
    }
  }
  if (r === null || r <= 0) return null;
  for (let i = 0; i < 6; i++) if (Math.abs(p[i] - r * q[i]) > 1e-9 * (Math.abs(p[i]) + Math.abs(r * q[i])) + 1e-14) return null;
  return r;
};
const fieldsProportional = (f1, f2, r) => {
  if (!f1 && !f2) return true;
  if (!f1 || !f2) return false;
  return elementSig(f1) === elementSig(scale(f2, r));
};
const resolveAlias = (a, mult) => (a.alias ? resolveAlias(a.alias.axis, mult * a.alias.mult) : { axis: a, mult });
// one axis per count. A periodic count proportional to an existing one by
// an integer is the same torus: the finer count is a multiple of the
// coarser one's coordinate (the picture reads fract(r u)); when the new
// count is the coarser one, the existing axis becomes an alias of it.
const makeAxis = (count, field, kind, label) => {
  const key = axisKey(count, field, kind);
  const found = axisRegistry.get(key);
  if (found) return resolveAlias(found, 1);
  if (kind === 'periodic') {
    for (const b of axisRegistry.values()) {
      if (b.kind !== 'periodic' || b.alias) continue;
      const r = proportion(count, b.count);
      if (r === null || !fieldsProportional(field, b.field, r)) continue;
      if (Math.abs(r - Math.round(r)) < 1e-9 && r >= 1 && r <= 64) return resolveAlias(b, Math.round(r));
      const q = 1 / r;
      if (Math.abs(q - Math.round(q)) < 1e-9 && q >= 2 && q <= 64) {
        const a2 = new Axis(count, field, kind, label);
        axisRegistry.set(key, a2);
        b.alias = { axis: a2, mult: Math.round(q) };
        return { axis: a2, mult: 1 };
      }
    }
  }
  const a = new Axis(count, field, kind, label);
  axisRegistry.set(key, a);
  return { axis: a, mult: 1 };
};
export class Axis {
  // count: a Jet in periods; field: an Element on other axes, or null;
  // kind 'periodic' (period one in the count) or 'edge' (a step at zero of
  // the raw count, periodised at a per-pixel period `edgePeriod`)
  constructor(count, field, kind, label) {
    this.id = axisCounter++;
    this.count = count;
    this.field = field;
    this.kind = kind;
    this.label = label;
    this.edgePeriod = 1;
  }
}

// factor kinds:
//  { kind: 'pic', axis, fn: u -> number (periodic, u in [0,1) of the axis's
//    count plus its field), sig }
//  { kind: 'clo', axes: [Axis], fn: (coords: number[]) -> Jet, sig }
const picFactor = (axis, fn, sig) => ({ kind: 'pic', axis, fn, sig });
// a closure remembers its last evaluation: the traced shader is a graph,
// and a point evaluates every shared sub-expression once
const sameCoords = (a, b) => {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const cloFactor = (axes, fn, sig) => {
  let lastCs = null;
  let lastM = null;
  let lastVal = null;
  // the coordinate map is passed through for the pixel displacement (key
  // -1) that a closure with fields inside needs; it is part of the memo
  const memo = (cs, coords) => {
    const m = coords ? coords.get(-1) : undefined;
    if (sameCoords(cs, lastCs) && (m === lastM || (m && lastM && m[0] === lastM[0] && m[1] === lastM[1]))) return lastVal;
    lastVal = fn(cs, coords);
    lastCs = cs.slice();
    lastM = m;
    return lastVal;
  };
  return { kind: 'clo', axes, fn: memo, sig };
};

let sigCounter = 0;
const freshSig = (base) => `${base}#${sigCounter++}`;

export class Element {
  constructor(terms) {
    this.terms = terms; // [{ c: {re: Jet, im: Jet}, f: [factor] }]
  }
  static fromJet(j) {
    return new Element([{ c: cj(j, J0), f: [] }]);
  }
  static const(v) {
    return Element.fromJet(Jet.c(v));
  }
  static zero() {
    return new Element([]);
  }
  // the smooth part: sum of factor-free terms, as a real Jet
  smoothPart() {
    let s = J0;
    for (const t of this.terms) if (t.f.length === 0) s = s.add(t.c.re);
    return s;
  }
  pictured() {
    return new Element(this.terms.filter((t) => t.f.length > 0));
  }
  isSmooth() {
    return this.terms.every((t) => t.f.length === 0);
  }
  axes() {
    const set = new Map();
    for (const t of this.terms)
      for (const f of t.f) {
        if (f.kind === 'pic') collectAxis(f.axis, set);
        else for (const a of f.axes) collectAxis(a, set);
      }
    return [...set.values()];
  }
}
const collectAxis = (a, set) => {
  if (a.alias) return collectAxis(a.alias.axis, set);
  if (set.has(a.id)) return;
  set.set(a.id, a);
  if (a.field) for (const b of a.field.axes()) collectAxis(b, set);
};
// a factor rewritten onto the alias targets of its axes
const resolveFactor = (f) => {
  if (f.kind === 'pic') {
    if (!f.axis.alias) return f;
    const { axis, mult } = resolveAlias(f.axis, 1);
    const fn = f.fn;
    return picFactor(axis, (u) => fn(mult * u), `${f.sig}∘${mult}x`);
  }
  if (!f.axes.some((a) => a.alias)) return f;
  const targets = [];
  const slots = [];
  for (const a of f.axes) {
    const { axis, mult } = resolveAlias(a, 1);
    let idx = targets.indexOf(axis);
    if (idx < 0) {
      idx = targets.length;
      targets.push(axis);
    }
    slots.push([idx, mult]);
  }
  const fn = f.fn;
  return cloFactor(targets, (cs) => fn(slots.map(([i, m]) => m * cs[i])), `${f.sig}∘alias`);
};

// evaluate an element at torus coordinates (Map axisId -> u in periods) as a
// Jet; the last evaluation is remembered by the coordinates of its axes
// a term's factor structure as a key: the axes (aliases resolved) and the
// factors' signatures; equal keys are the same function of the same axes
const rootId = (a) => (a.alias ? rootId(a.alias.axis) : a.id);
const factorKey = (fs) => fs.map((f) => (f.kind === 'pic' ? `p${rootId(f.axis)}:${f.sig}` : `c${f.axes.map(rootId).join('.')}:${f.sig}`)).sort().join('|');
const termKey = (t) => {
  if (!t._fkey) t._fkey = factorKey(t.f);
  return t._fkey;
};
// the axes a factor list reaches, fields included
const deepAxesOf = (fs) => {
  const set = new Map();
  for (const f of fs) {
    if (f.kind === 'pic') collectAxis(f.axis, set);
    else for (const a of f.axes) collectAxis(a, set);
  }
  return [...set.values()];
};
// the product of a factor list at coordinates (a number)
const factorsAt = (fs, coords) => {
  let v = 1;
  for (const f of fs) {
    if (f.kind === 'pic') v *= f.fn(axisCoordinate(f.axis, coords));
    else v *= f.fn(f.axes.map((a) => bareCoordinate(a, coords)), coords).v;
  }
  return v;
};
const evalElement = (el, coords) => {
  if (!el._axes) el._axes = el.axes();
  const key = el._axes.map((a) => coords.get(a.id));
  const m = coords.get(-1);
  if (m) key.push(m[0], m[1]);
  const skip = coords.get(-2);
  if (skip) key.push(skip);
  if (el._lastKey && sameCoords(key, el._lastKey)) return el._lastVal;
  const v = evalElementRaw(el, coords);
  el._lastKey = key;
  el._lastVal = v;
  return v;
};
const evalElementRaw = (el, coords) => {
  let acc = J0;
  // terms of the shift's function H are dropped when its family carries them
  const skip = coords.get(-2);
  for (const t of el.terms) {
    if (skip && t.f.length && termKey(t) === skip) continue;
    let v = t.c.re;
    let ok = true;
    for (const f of t.f) {
      if (f.kind === 'pic') {
        const u = axisCoordinate(f.axis, coords);
        v = v.scale(f.fn(u));
      } else {
        const cs = f.axes.map((a) => bareCoordinate(a, coords));
        const r = f.fn(cs, coords);
        v = v.mul(r);
      }
      if (!ok) break;
    }
    acc = acc.add(v);
  }
  return acc;
};
// the shifted coordinate of an axis: its own coordinate plus its field at the
// other coordinates
// the shifted coordinate of an axis: its own coordinate plus its field at the
// other coordinates. The field is a jet across the pixel (its coefficients
// vary); at a point of the pixel, carried in the coordinates under the key
// -1 as the displacement from the centre, it is evaluated there. Without a
// displacement the field's value at the centre is used, and the spectral
// paths take its variation as a jet.
const jetAt = (j, m) => j.v + j.gx * m[0] + j.gy * m[1] + 0.5 * (j.hxx * m[0] * m[0] + 2 * j.hxy * m[0] * m[1] + j.hyy * m[1] * m[1]);
// the bare coordinate of an axis (its field not added): what a closure
// takes, since every closure adds the fields of its axes itself
const bareCoordinate = (axis, coords) => {
  if (axis.alias) return axis.alias.mult * bareCoordinate(axis.alias.axis, coords);
  const u = coords.get(axis.id);
  if (u === undefined) throw new Error(`no coordinate for axis ${axis.label}#${axis.id}`);
  return u;
};
const axisCoordinate = (axis, coords) => {
  if (axis.alias) return axis.alias.mult * axisCoordinate(axis.alias.axis, coords);
  let u = coords.get(axis.id);
  if (u === undefined) throw new Error(`no coordinate for axis ${axis.label}#${axis.id}`);
  if (axis.field) {
    const j = evalElement(axis.field, coords);
    const m = coords.get(-1);
    u += m ? jetAt(j, m) : j.v;
  }
  return u;
};

// ---------------------------------------------------------------------------
// The language
// ---------------------------------------------------------------------------
const lift = (x) => {
  if (x instanceof Element) return x;
  if (x instanceof Jet) return Element.fromJet(x);
  if (typeof x === 'number') return Element.const(x);
  throw new Error('cannot lift ' + x);
};
const sameFactorAxes = (f) => (f.kind === 'pic' ? [f.axis.id] : f.axes.map((a) => a.id));

const jetIsZero = (j) => j.v === 0 && j.gx === 0 && j.gy === 0 && j.hxx === 0 && j.hxy === 0 && j.hyy === 0;
const liveTerms = (terms) => terms.filter((t) => !(jetIsZero(t.c.re) && jetIsZero(t.c.im)));
// terms that are pictures on one and the same axis with constant
// coefficients sum into one picture on it (a palette lookup is one picture)
const foldSameAxis = (terms) => {
  const groups = new Map();
  const rest = [];
  for (const t of terms) {
    const ok = t.f.length > 0 && t.f.every((f) => f.kind === 'pic' && f.axis === t.f[0].axis) && jetIsConst(t.c.re) && jetIsZero(t.c.im);
    if (!ok) {
      rest.push(t);
      continue;
    }
    const id = t.f[0].axis.id;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(t);
  }
  for (const g of groups.values()) {
    if (g.length === 1) {
      rest.push(g[0]);
      continue;
    }
    const axis = g[0].f[0].axis;
    const parts = g.map((t) => ({ c: t.c.re.v, fns: t.f.map((f) => f.fn) }));
    const fn = (u) => {
      let acc = 0;
      for (const p of parts) {
        let v = p.c;
        for (const f of p.fns) v *= f(u);
        acc += v;
      }
      return acc;
    };
    const sig = `sum(${g.map((t) => `${jetSig(t.c.re)}${jetIsZero(t.c.im) ? '' : '+' + jetSig(t.c.im) + 'i'}*${t.f.map((f) => f.sig).join('*')}`).join('+')})`;
    rest.push({ c: cj(J1, J0), f: [picFactor(axis, fn, sig)] });
  }
  return rest;
};
const jetIsConst = (j) => j.gx === 0 && j.gy === 0 && j.hxx === 0 && j.hxy === 0 && j.hyy === 0;
// a jet that neither moves nor curves across the pixel: a stationary count
// with curvature is not constant (a step of eps (Z^2 - 1/2) has coverage
// erfc(1/2), not the step at its centre), so the tracer folds a count to a
// number only when both its gradient and its Hessian vanish
const jetIsFlat = (j) => j.gradNorm() < 1e-12 && Math.abs(j.hxx) + 2 * Math.abs(j.hxy) + Math.abs(j.hyy) < 1e-12;
// the reach, in pixels, over which the tracer judges a count's excursion
// (six sigma of a half-pixel Gaussian); set by the harness from its sigma
export let traceReach = 3;
export const setTraceReach = (r) => {
  traceReach = r;
};
// a threshold event 1{s >= 0} is constant across the pixel when the count's
// excursion over the reach cannot reach zero: the fold is exact for the
// model, and invariant under a positive rescaling of s (an absolute
// flatness threshold turned 1{1e-14 (Z^2 - 1/2) >= 0} into a constant)
const stepIsConstant = (j) => {
  const R = traceReach;
  const exc = j.gradNorm() * R + 0.5 * (Math.abs(j.hxx) + 2 * Math.abs(j.hxy) + Math.abs(j.hyy)) * R * R;
  return exc < Math.abs(j.v) * (1 - 1e-9);
};
export const add = (a, b) => {
  const terms = liveTerms([...lift(a).terms, ...lift(b).terms]);
  return new Element(terms.length > 1 ? foldSameAxis(terms) : terms);
};
export const neg = (a) => new Element(lift(a).terms.map((t) => ({ c: cjScale(t.c, -1), f: t.f })));
export const sub = (a, b) => add(a, neg(b));
export const scale = (a, s) => new Element(liveTerms(lift(a).terms.map((t) => ({ c: cjScale(t.c, s), f: t.f }))));

// product of two factor lists: factors on the same axis multiply into one
const directFactorAxes = (f) => (f.kind === 'pic' ? [f.axis.id] : f.axes.map((a) => a.id));
const mulFactors = (fa, fb) => {
  const out = [...fa];
  for (const g of fb) {
    // overlap is on direct axes only: a picture on an axis with a field may
    // sit beside pictures and closures on the field's axes, since the
    // evaluator folds those into the residual closure of the field's axes
    const gAxes = directFactorAxes(g);
    let merged = false;
    // two steps (0/1) of the same sum are nested sets: their product is the
    // one with the smaller offset
    if (g.stepsum && g.stepsum.gp === STEP_PIECES.step) {
      const same = (a, b) => a.gp === b.gp && elementSig(a.A) === elementSig(b.A) && a.phis.length === b.phis.length && a.phis.every((q, i) => q.axis === b.phis[i].axis && q.parts.length === b.phis[i].parts.length && q.parts.every((pp, j) => pp.beta === b.phis[i].parts[j].beta && pp.sig === b.phis[i].parts[j].sig));
      for (let i = 0; i < out.length; i++) {
        const f = out[i];
        if (f.stepsum && f.stepsum.gp === STEP_PIECES.step && same(f.stepsum, g.stepsum)) {
          if (g.stepsum.c < f.stepsum.c) out[i] = g;
          merged = true;
          break;
        }
      }
      if (merged) continue;
    }
    // a step of a sum keeps its structure: it is never merged into a
    // product closure (the evaluator multiplies the factors itself)
    for (let i = 0; i < out.length && !g.stepsum; i++) {
      const f = out[i];
      if (f.stepsum) continue;
      const fAxes = directFactorAxes(f);
      const overlap = fAxes.some((id) => gAxes.includes(id));
      if (!overlap) continue;
      if (f.kind === 'pic' && g.kind === 'pic' && f.axis === g.axis) {
        const ff = f.fn;
        const gf = g.fn;
        out[i] = picFactor(f.axis, (u) => ff(u) * gf(u), `(${f.sig}*${g.sig})`);
      } else {
        // merge into a closure over the union of axes
        const axesMap = new Map();
        for (const a of f.kind === 'pic' ? [f.axis] : f.axes) axesMap.set(a.id, a);
        for (const a of g.kind === 'pic' ? [g.axis] : g.axes) axesMap.set(a.id, a);
        const axes = [...axesMap.values()];
        const F = factorAsClosure(f, axes);
        const G = factorAsClosure(g, axes);
        out[i] = cloFactor(axes, (cs) => F(cs).mul(G(cs)), `(${f.sig}*${g.sig})`);
      }
      merged = true;
      break;
    }
    if (!merged) out.push(g);
  }
  return out;
};
// a factor as a closure over a given axis list (coords in that order)
const factorAsClosure = (f, axes) => {
  if (f.kind === 'pic') {
    const idx = axes.indexOf(f.axis);
    const fn = f.fn;
    if (!f.axis.field) return (cs) => Jet.c(fn(cs[idx]));
    const field = f.axis.field;
    return (cs) => {
      const m = new Map();
      axes.forEach((a, i) => m.set(a.id, cs[i]));
      return Jet.c(fn(cs[idx] + evalElement(field, m).v));
    };
  }
  const map = f.axes.map((a) => axes.indexOf(a));
  const fn = f.fn;
  return (cs) => fn(map.map((i) => cs[i]));
};

export const mul = (a, b) => {
  const A = lift(a);
  const B = lift(b);
  const terms = [];
  for (const ta of A.terms)
    for (const tb of B.terms) {
      const c = cjMul(ta.c, tb.c);
      if (jetIsZero(c.re) && jetIsZero(c.im)) continue;
      terms.push({ c, f: mulFactors(ta.f, tb.f) });
    }
  return new Element(terms);
};

// a smooth function of an element. Pure smooth: jet composition. Otherwise
// the element collapses to one closure over its axes and the function is
// composed on the jet the closure returns.
const smoothFn = (name, jetFn) => (x) => {
  const el = lift(x);
  if (el.isSmooth()) return Element.fromJet(jetFn(el.smoothPart()));
  return collapseWith(el, jetFn, name);
};
// A non-smooth primitive g of a constant plus a part on some counts X
// (closures, pictures) plus pictures with constant coefficients on other
// counts Phi that may carry fields over X: g(c + A(x) + sum_j B_j(phi_j +
// G_j(x))). As a function of phi it is a picture on the Phi torus whose
// coefficients are functions of a = c + A(x): T_m(a), the transform of
// phi -> g(a + B(phi)). For g linear on each side of zero (step, sign,
// relu, abs) that transform is exact: between the roots of a + B(phi) = 0
// and the jumps of B the integrand is linear in B, and Gauss-Legendre
// integrates it. The element is kept as one closure over X and bare Phi
// axes carrying that structure, so that its transform over all of them
// factorises at evaluation into the table T_m(a), tabulated once over the
// range of a, and a transform over X of T_m(c + A(x)) e^{2 pi i m.G(x)},
// which does not depend on the pixel.
const STEP_PIECES = {
  step: { am: 0, bm: 0, ap: 1, bp: 0 },
  sign: { am: -1, bm: 0, ap: 1, bp: 0 },
  relu: { am: 0, bm: 0, ap: 0, bp: 1 },
  abs: { am: 0, bm: -1, ap: 0, bp: 1 },
};
const stepOfSum = (P, c, g, name) => {
  const gp = STEP_PIECES[name];
  if (!gp) return null;
  const phiTerms = [];
  const aTerms = [];
  for (const t of P.terms) {
    const f = t.f;
    if (f.length === 1 && f[0].kind === 'pic' && f[0].axis.kind === 'periodic' && jetIsConst(t.c.re) && jetIsZero(t.c.im)) phiTerms.push(t);
    else aTerms.push(t);
  }
  if (phiTerms.length === 0) return null;
  const A = new Element(aTerms);
  const xSet = new Map();
  for (const a of A.axes()) xSet.set(a.id, a);
  const phis = new Map();
  for (const t of phiTerms) {
    const axis = t.f[0].axis;
    if (!phis.has(axis.id)) phis.set(axis.id, { axis, parts: [] });
    phis.get(axis.id).parts.push({ beta: t.c.re.v, fn: t.f[0].fn, sig: t.f[0].sig });
    if (axis.field) for (const a of axis.field.axes()) xSet.set(a.id, a);
  }
  if (phis.size > 2) return null;
  for (const { axis } of phis.values()) if (xSet.has(axis.id)) return null;
  const X = [...xSet.values()];
  if (X.length === 0) return null;
  // The shift group of a step of a sum. Axes of X that enter the closure
  // only through fields, every such field term being one function H of
  // them times a scalar (a parallax: every count shifted by the height
  // times the view), are the shift axes S. The closure is then F(x + c_X H,
  // phi + c_phi H) for the closure F over X and Phi without the shift, and
  // its transform over (X, Phi, S) is F's transform at (k, m) times the
  // transform over S of e^{2 pi i (k.c_X + m.c_phi) H}, a one-parameter
  // family in theta = 2 pi (k.c_X + m.c_phi) tabulated once.
  const aDirect = new Set();
  for (const t of A.terms) for (const f of t.f) for (const a of f.kind === 'pic' ? [f.axis] : f.ownAxes || f.axes) aDirect.add(rootId(a));
  const S0 = new Set(X.filter((a) => !a.field && !aDirect.has(rootId(a))).map((a) => rootId(a)));
  let hKey = null;
  let hFactors = null;
  let shiftOk = S0.size > 0;
  const hCoef = (el) => {
    // the sum of the H-terms' coefficient jets of a field, or null
    if (!el) return null;
    let sum = null;
    for (const t of el.terms) {
      // the direct axes of the term's factors: reaching S through an X
      // axis's own field is the shift itself, not a term of H
      const direct = t.f.flatMap((f) => (f.kind === 'pic' ? [f.axis] : f.axes)).map(rootId);
      const inS = direct.filter((id) => S0.has(id)).length;
      if (inS === 0) continue;
      if (inS !== direct.length || t.f.length === 0) {
        shiftOk = false;
        return null;
      }
      const key = termKey(t);
      if (hKey === null) {
        hKey = key;
        hFactors = t.f;
      } else if (key !== hKey) {
        shiftOk = false;
        return null;
      }
      sum = sum ? sum.add(t.c.re) : t.c.re;
    }
    return sum;
  };
  const cX = new Map();
  for (const a of X) if (!S0.has(rootId(a))) cX.set(a.id, hCoef(a.field));
  const cPhi = new Map();
  for (const q of phis.values()) cPhi.set(q.axis.id, hCoef(q.axis.field));
  const shiftAxes = shiftOk && hKey !== null ? deepAxesOf(hFactors) : [];
  const shiftIds = new Set(shiftAxes.map((a) => a.id));
  const Xtrue = shiftAxes.length ? X.filter((a) => !shiftIds.has(a.id)) : X;
  const Sax = shiftAxes.length ? X.filter((a) => shiftIds.has(a.id)) : [];
  const H = shiftAxes.length ? { key: hKey, factors: hFactors, sig: hFactors.map((f) => f.sig).join('*') } : null;
  if (Xtrue.length > 2 || Sax.length > 2) return null;
  // with one Phi axis over one X axis and no shift the plain closure (one
  // axis, its field over the other) is transformed exactly by the residual
  // paths and has been measured; the rule is for the structures those
  // cannot reach
  if (Xtrue.length + Sax.length + phis.size < 3) return null;
  const phiList = [...phis.values()].map((q) => ({
    axis: q.axis,
    parts: q.parts,
    bare: q.axis.field ? makeAxis(q.axis.count, null, 'periodic', `${q.axis.label}°`).axis : q.axis,
    B: makeB(q.parts),
    cH: cPhi.get(q.axis.id) || null,
  }));
  const XS = [...Xtrue, ...Sax];
  // a bare Phi axis that is one of the closure's own counts (a pattern whose
  // period is the bump's) is not a shift structure; the closure would be
  // self-referential
  for (const q of phiList) if (XS.some((a) => rootId(a) === rootId(q.bare))) return null;
  const axes = [...XS, ...phiList.map((q) => q.bare)];
  const nXS = XS.length;
  const fn = (cs, coords) => {
    const m = new Map();
    const disp = coords ? coords.get(-1) : undefined;
    if (disp) m.set(-1, disp);
    XS.forEach((a, i) => m.set(a.id, cs[i]));
    const at = (el) => {
      const j = evalElement(el, m);
      return disp ? jetAt(j, disp) : j.v;
    };
    let total = c + (A.terms.length ? at(A) : 0);
    phiList.forEach((q, j) => {
      const phi = cs[nXS + j] + (q.axis.field ? at(q.axis.field) : 0);
      for (const { beta, fn: pf } of q.parts) total += beta * pf(phi);
    });
    return Jet.c(g(total));
  };
  const sig = `${name}⊕(${num(c)}+${elementSig(A)}|${phiList.map((q) => `${q.axis.label}${q.axis.id}:${q.axis.field ? elementSig(q.axis.field) : ''}:${q.parts.map((pp) => `${num(pp.beta)}*${pp.sig}`).join('+')}`).join(';')})`;
  const clo = cloFactor(axes, fn, sig);
  clo.stepsum = { g, gp, c, A, X: Xtrue, S: Sax, H, cX, phis: phiList, sig };
  return new Element([{ c: cj(J1, J0), f: [clo] }]);
};

// The family of transforms over the shift torus: Q(theta; k) = the
// transform of O(s) e^{i theta H(s)} for the other closures O on S, with
// its first two theta derivatives (for the coefficient's jet: theta varies
// across the pixel with the view). Tabulated on a grid of theta by FFT on
// a midpoint grid of S, remembered by the structure (nothing in it depends
// on the pixel); a request past the range rebuilds it wider.
const shiftCache = new Map();
// grids of terms without tables (a shift or field pictures alone)
const plainGridHome = { xGrids: new Map() };
const shiftTables = (H, Saxes, OS, NGS, KWS, thetaMax, dTheta) => {
  const key = `${H.key}|${Saxes.map((a) => a.id).join(',')}|${OS.map((o) => o.sig).join('*')}|${NGS}|${KWS}|${dTheta}`;
  let T = shiftCache.get(key);
  if (T && T.thetaMax >= thetaMax) return T;
  const Theta = Math.max(thetaMax * 1.5, 1);
  const NT = Math.ceil(Theta / dTheta);
  const nS = Saxes.length;
  const n = nS === 1 ? NGS : NGS * NGS;
  // H and O on the grid
  const Hg = new Float64Array(n);
  const Og = new Float64Array(n);
  const coords = new Map();
  let hMax = 0;
  let oMax = 0;
  for (let i = 0; i < NGS; i++)
    for (let j = 0; j < (nS === 2 ? NGS : 1); j++) {
      coords.set(Saxes[0].id, (i + 0.5) / NGS);
      if (nS === 2) coords.set(Saxes[1].id, (j + 0.5) / NGS);
      const idx = nS === 2 ? i * NGS + j : i;
      Hg[idx] = factorsAt(H.factors, coords);
      let o = 1;
      for (const cl of OS) o *= cl.fn(cl.axes.map((a) => bareCoordinate(a, coords)), coords).v;
      Og[idx] = o;
      hMax = Math.max(hMax, Math.abs(Hg[idx]));
      oMax = Math.max(oMax, Math.abs(o));
    }
  const KWn = 2 * KWS + 1;
  const wn = nS === 1 ? KWn : KWn * KWn;
  const nodes = 2 * NT + 1;
  const Q = [new Float32Array(nodes * wn), new Float32Array(nodes * wn)];
  const Q1 = [new Float32Array(nodes * wn), new Float32Array(nodes * wn)];
  const Q2 = [new Float32Array(nodes * wn), new Float32Array(nodes * wn)];
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const t0 = DEBUG ? performance.now() : 0;
  const window = (dst, node) => {
    for (let kx = -KWS; kx <= KWS; kx++)
      for (let ky = -(nS === 2 ? KWS : 0); ky <= (nS === 2 ? KWS : 0); ky++) {
        const ix = ((kx % NGS) + NGS) % NGS;
        const iy = ((ky % NGS) + NGS) % NGS;
        const idx = nS === 2 ? ix * NGS + iy : ix;
        const ang = (-Math.PI * (kx + ky)) / NGS;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const r0 = re[idx] / n;
        const i0 = im[idx] / n;
        const w = node * wn + (nS === 2 ? (kx + KWS) * KWn + ky + KWS : kx + KWS);
        dst[0][w] = r0 * ca - i0 * sa;
        dst[1][w] = r0 * sa + i0 * ca;
      }
  };
  for (let node = 0; node < nodes; node++) {
    const theta = (node - NT) * dTheta;
    // Q: O e^{i theta H}; Q': i H O e^{i theta H}; Q'': -H^2 O e^{i theta H}
    for (let pass = 0; pass < 3; pass++) {
      for (let idx = 0; idx < n; idx++) {
        const ph = theta * Hg[idx];
        const cph = Math.cos(ph);
        const sph = Math.sin(ph);
        const o = Og[idx];
        const h = Hg[idx];
        if (pass === 0) {
          re[idx] = o * cph;
          im[idx] = o * sph;
        } else if (pass === 1) {
          re[idx] = -o * h * sph;
          im[idx] = o * h * cph;
        } else {
          re[idx] = -o * h * h * cph;
          im[idx] = -o * h * h * sph;
        }
      }
      if (nS === 1) fftInPlace(re, im);
      else fft2InPlace(re, im, NGS);
      window(pass === 0 ? Q : pass === 1 ? Q1 : Q2, node);
    }
  }
  if (DEBUG) console.log(`      shift tables H=${H.sig} S=[${Saxes.map((a) => a.label + '#' + a.id)}] O=[${OS.map((o) => o.sig.slice(0, 20))}] theta ${Theta.toFixed(1)} nodes ${nodes} ${(performance.now() - t0).toFixed(0)} ms`);
  T = { NT, dTheta, thetaMax: Theta, wn, KWn, KWS, nS, Q, Q1, Q2, hMax, oMax };
  if (shiftCache.size > 64) shiftCache.clear();
  shiftCache.set(key, T);
  return T;
};
// Q, Q', Q'' at theta for the window index w, by quadratic interpolation
// on the three nearest nodes: [re, im] each
const shiftAt = (T, theta, w, out) => {
  const { NT, dTheta, wn } = T;
  let x = theta / dTheta + NT;
  if (x < 1) x = 1;
  if (x > 2 * NT - 1) x = 2 * NT - 1;
  const i = Math.round(x);
  const f = x - i;
  const w0 = 0.5 * f * (f - 1);
  const w1 = 1 - f * f;
  const w2 = 0.5 * f * (f + 1);
  const a = (i - 1) * wn + w;
  const b = i * wn + w;
  const cc = (i + 1) * wn + w;
  for (let q = 0; q < 3; q++) {
    const A = q === 0 ? T.Q : q === 1 ? T.Q1 : T.Q2;
    out[2 * q] = w0 * A[0][a] + w1 * A[0][b] + w2 * A[0][cc];
    out[2 * q + 1] = w0 * A[1][a] + w1 * A[1][b] + w2 * A[1][cc];
  }
};

// a picture sum B(phi) = sum beta_i p_i(phi) on one axis: its values on a
// fine grid, its jumps (located), its critical values (extrema between
// jumps and the two sides of each jump) and its smooth bandwidth
const NB = 2048;
const makeB = (parts) => {
  const fn = (u) => {
    let b = 0;
    for (const p of parts) b += p.beta * p.fn(u);
    return b;
  };
  const grid = new Float64Array(NB + 1);
  for (let i = 0; i < NB; i++) grid[i] = fn(i / NB);
  grid[NB] = grid[0]; // periodic, exactly
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < NB; i++) {
    lo = Math.min(lo, grid[i]);
    hi = Math.max(hi, grid[i]);
  }
  const range = hi - lo;
  const diffs = new Float64Array(NB);
  for (let i = 0; i < NB; i++) diffs[i] = Math.abs(grid[i + 1] - grid[i]);
  const typical = Float64Array.from(diffs).sort()[NB >> 1];
  const jumps = [];
  for (let i = 0; i < NB; i++) {
    if (diffs[i] < 6 * typical + 1e-9 * range + 1e-300) continue;
    let x0 = i / NB;
    let x1 = (i + 1) / NB;
    const f0 = grid[i];
    const d = diffs[i];
    for (let it = 0; it < 48; it++) {
      const xm = (x0 + x1) / 2;
      if (Math.abs(fn(xm) - f0) > d / 2) x1 = xm;
      else x0 = xm;
    }
    // a steep slope shrinks with the bracket, a jump does not
    if (Math.abs(fn(x1) - fn(x0)) < 0.5 * d) continue;
    jumps.push({ at: (x0 + x1) / 2, left: fn(x0), right: fn(x1) });
  }
  const crit = [];
  for (const j of jumps) crit.push(j.left, j.right);
  const gr = 0.6180339887498949;
  for (let i = 1; i < NB; i++) {
    const d0 = grid[i] - grid[i - 1];
    const d1 = grid[i + 1] - grid[i];
    if (!(d0 * d1 < 0)) continue;
    if (jumps.some((j) => Math.abs(j.at - i / NB) < 1.5 / NB)) continue;
    // golden-section refinement of the extremum in the two cells around i
    let a = (i - 1) / NB;
    let b = (i + 1) / NB;
    const sgn = d0 > 0 ? 1 : -1;
    let c1 = b - gr * (b - a);
    let c2 = a + gr * (b - a);
    let f1 = sgn * fn(c1);
    let f2 = sgn * fn(c2);
    for (let it = 0; it < 60; it++) {
      if (f1 > f2) {
        b = c2;
        c2 = c1;
        f2 = f1;
        c1 = b - gr * (b - a);
        f1 = sgn * fn(c1);
      } else {
        a = c1;
        c1 = c2;
        f1 = f2;
        c2 = a + gr * (b - a);
        f2 = sgn * fn(c2);
      }
    }
    crit.push(fn((a + b) / 2));
  }
  if (crit.length === 0) crit.push(lo, hi);
  // the smooth bandwidth between jumps, from the pictures' names
  let bw = 0;
  for (const p of parts) {
    const mm = /∘(\d+)x/.exec(p.sig);
    const mult = mm ? Number(mm[1]) : 1;
    if (/^(sin|cos)/.test(p.sig)) bw = Math.max(bw, mult);
    else if (/^(fract|mod)/.test(p.sig)) bw = Math.max(bw, 0);
    else bw = Math.max(bw, 8 * mult);
  }
  return { fn, grid, jumps, crit, lo, hi, bw };
};

// Gauss-Legendre nodes and weights on [-1, 1]
const glCache = new Map();
// erf by Cody's rational Chebyshev approximations (1969), to 1e-16
const erf = (x) => {
  const a = [3.1611237438705656, 113.864154151050156, 377.485237685302021, 3209.37758913846947, 0.185777706184603153];
  const b = [23.6012909523441209, 244.024637934444173, 1282.61652607737228, 2844.23683343917062];
  const c = [0.564188496988670089, 8.88314979438837594, 66.1191906371416295, 298.635138197400131, 881.95222124176909, 1712.04761263407058, 2051.07837782607147, 1230.33935479799725, 2.15311535474403846e-8];
  const d = [15.7449261107098347, 117.693950891312499, 537.181101862009858, 1621.38957456669019, 3290.79923573345963, 4362.61909014324716, 3439.36767414372164, 1230.33935480374942];
  const pp = [0.305326634961232344, 0.360344899949804439, 0.125781726111229246, 0.0160837851487422766, 0.000658749161529837803, 0.0163153871373020978];
  const qq = [2.56852019228982242, 1.87295284992346725, 0.527905102951428412, 0.0605183413124413191, 0.00233520497626869185];
  const ax = Math.abs(x);
  let res;
  if (ax <= 0.46875) {
    const z = ax * ax;
    let xn = a[4] * z;
    let xd = z;
    for (let i = 0; i < 3; i++) {
      xn = (xn + a[i]) * z;
      xd = (xd + b[i]) * z;
    }
    return (x * (xn + a[3])) / (xd + b[3]);
  } else if (ax <= 4) {
    let xn = c[8] * ax;
    let xd = ax;
    for (let i = 0; i < 7; i++) {
      xn = (xn + c[i]) * ax;
      xd = (xd + d[i]) * ax;
    }
    res = (xn + c[7]) / (xd + d[7]);
    const z = Math.floor(ax * 16) / 16;
    res = Math.exp(-z * z) * Math.exp(-(ax - z) * (ax + z)) * res;
  } else {
    const z = 1 / (ax * ax);
    let xn = pp[5] * z;
    let xd = z;
    for (let i = 0; i < 4; i++) {
      xn = (xn + pp[i]) * z;
      xd = (xd + qq[i]) * z;
    }
    res = (z * (xn + pp[4])) / (xd + qq[4]);
    res = (0.5641895835477563 - res) / ax;
    const zz = Math.floor(ax * 16) / 16;
    res = Math.exp(-zz * zz) * Math.exp(-(ax - zz) * (ax + zz)) * res;
  }
  return x < 0 ? res - 1 : 1 - res;
};
// standard normal distribution function
const normalCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

const gaussLegendre = (n) => {
  const hit = glCache.get(n);
  if (hit) return hit;
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * pp * pp);
  }
  const out = { x, w };
  glCache.set(n, out);
  return out;
};
const GLN = 32;

// the boundaries on [0, 1) of the pieces on which a + B(phi) keeps its sign:
// the roots of a + B and the jumps of B, sorted
const bisectRoot = (fn, a, x0, x1) => {
  let f0 = a + fn(x0) < 0;
  for (let it = 0; it < 60; it++) {
    const xm = (x0 + x1) / 2;
    if (a + fn(xm) < 0 === f0) x0 = xm;
    else x1 = xm;
  }
  return (x0 + x1) / 2;
};
const stepBoundaries = (B, a) => {
  const pts = [];
  const g = B.grid;
  const jumpAt = new Map();
  for (const j of B.jumps) {
    const cell = Math.min(NB - 1, Math.floor(j.at * NB));
    if (!jumpAt.has(cell)) jumpAt.set(cell, []);
    jumpAt.get(cell).push(j.at);
  }
  // a sample where a + B is exactly zero is a boundary itself (a sign of a
  // sine with no offset has its roots on the grid); a change of sign
  // between two samples is bisected
  const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const cross = (x0, v0, x1, v1) => {
    if (v0 === 0) pts.push(x0);
    else if (v1 !== 0 && sgn(v0) !== sgn(v1)) pts.push(bisectRoot(B.fn, a, x0, x1));
  };
  for (let i = 0; i < NB; i++) {
    const x0 = i / NB;
    const x1 = (i + 1) / NB;
    const js = jumpAt.get(i);
    if (!js) {
      cross(x0, a + g[i], x1, a + g[i + 1]);
      continue;
    }
    // the jumps split the cell; a root may sit on either side of each
    let lo = x0;
    for (const j of js.sort((p, q) => p - q)) {
      const hiSide = Math.max(lo, j - 1e-9);
      if (hiSide > lo) cross(lo, a + B.fn(lo), hiSide, a + B.fn(hiSide));
      pts.push(j);
      lo = Math.min(x1, j + 1e-9);
    }
    if (x1 > lo) cross(lo, a + B.fn(lo), x1, a + B.fn(x1));
  }
  pts.sort((p, q) => p - q);
  const uniq = [];
  for (const p of pts) if (uniq.length === 0 || p - uniq[uniq.length - 1] > 1e-12) uniq.push(p);
  return uniq;
};
// the pieces of [0, 1) between the boundary points, as [lo, hi] with hi
// possibly past 1 (the functions are periodic)
const piecesOf = (pts) => {
  if (pts.length === 0) return [[0, 1]];
  const out = [];
  for (let i = 0; i < pts.length; i++) out.push([pts[i], i + 1 < pts.length ? pts[i + 1] : pts[0] + 1]);
  return out;
};

// T_m(a) for |m| <= M of phi -> g(a + B(phi)), g piecewise linear: exact
// by Gauss-Legendre on the pieces, sub-panels short enough for e^{-2 pi i m phi}
const stepTransform1 = (gp, B, a, M, outRe, outIm) => {
  const n = 2 * M + 1;
  for (let i = 0; i < n; i++) {
    outRe[i] = 0;
    outIm[i] = 0;
  }
  const gl = gaussLegendre(GLN);
  const hmax = Math.min(0.25, 20 / (Math.PI * (M + B.bw + 1)));
  for (const [p, q] of piecesOf(stepBoundaries(B, a))) {
    if (q - p < 1e-13) continue;
    const mid = (p + q) / 2;
    const neg = a + B.fn(mid) < 0;
    const al = neg ? gp.am : gp.ap;
    const be = neg ? gp.bm : gp.bp;
    if (al === 0 && be === 0) continue;
    const nsub = Math.max(1, Math.ceil((q - p) / hmax));
    const h = (q - p) / nsub;
    for (let s = 0; s < nsub; s++) {
      const c0 = p + (s + 0.5) * h;
      for (let i = 0; i < GLN; i++) {
        const phi = c0 + 0.5 * h * gl.x[i];
        const val = 0.5 * h * gl.w[i] * (al + be * (a + B.fn(phi)));
        // e^{-2 pi i m phi} from m = -M up, by a recurrence
        const ang = TAU * M * phi;
        let er = Math.cos(ang);
        let ei = Math.sin(ang);
        const zr = Math.cos(TAU * phi);
        const zi = -Math.sin(TAU * phi);
        for (let m = 0; m < n; m++) {
          outRe[m] += val * er;
          outIm[m] += val * ei;
          const nr = er * zr - ei * zi;
          ei = er * zi + ei * zr;
          er = nr;
        }
      }
    }
  }
};
// T_{m1 m2}(a) of (phi1, phi2) -> g(a + B1(phi1) + B2(phi2)): the inner
// transform over phi1 is exact at each phi2; the outer integral has square
// root singularities where a + B2(phi2) meets a critical value of B1, so it
// is split there and at the jumps of B2, each panel mapped by a cosine so
// that its ends are regular. Index (m1 + M1) (2 M2 + 1) + m2 + M2.
const stepTransform2 = (gp, B1, B2, a, M1, M2, outRe, outIm) => {
  const n1 = 2 * M1 + 1;
  const n2 = 2 * M2 + 1;
  for (let i = 0; i < n1 * n2; i++) {
    outRe[i] = 0;
    outIm[i] = 0;
  }
  const pts = [];
  for (const v of B1.crit) for (const r of stepBoundaries(B2, a + v)) pts.push(r);
  pts.sort((p, q) => p - q);
  const uniq = [];
  for (const p of pts) if (uniq.length === 0 || p - uniq[uniq.length - 1] > 1e-12) uniq.push(p);
  const gl = gaussLegendre(GLN);
  const tRe = new Float64Array(n1);
  const tIm = new Float64Array(n1);
  const hmax = Math.min(0.25, 20 / (Math.PI * (M1 / 2 + M2 + B2.bw + 1)));
  for (const [p, q] of piecesOf(uniq)) {
    if (q - p < 1e-13) continue;
    const nsub = Math.max(1, Math.ceil((q - p) / hmax));
    const h = (q - p) / nsub;
    for (let s = 0; s < nsub; s++) {
      const lo = p + s * h;
      for (let i = 0; i < GLN; i++) {
        // tau in [0, 1], phi = lo + h (1 - cos(pi tau)) / 2
        const tau = 0.5 * (gl.x[i] + 1);
        const phi = lo + (h * (1 - Math.cos(Math.PI * tau))) / 2;
        const w = 0.5 * gl.w[i] * ((h * Math.PI) / 2) * Math.sin(Math.PI * tau);
        if (w < 1e-18) continue;
        stepTransform1(gp, B1, a + B2.fn(phi), M1, tRe, tIm);
        const ang = TAU * M2 * phi;
        let er = Math.cos(ang);
        let ei = Math.sin(ang);
        const zr = Math.cos(TAU * phi);
        const zi = -Math.sin(TAU * phi);
        for (let m2 = 0; m2 < n2; m2++) {
          const wr = w * er;
          const wi = w * ei;
          for (let m1 = 0; m1 < n1; m1++) {
            const o = m1 * n2 + m2;
            outRe[o] += tRe[m1] * wr - tIm[m1] * wi;
            outIm[o] += tRe[m1] * wi + tIm[m1] * wr;
          }
          const nr = er * zr - ei * zi;
          ei = er * zi + ei * zr;
          er = nr;
        }
      }
    }
  }
};

// the tables of a step of a sum for the residual Phi axes named by mask:
// T_m(a) on a grid of a covering the range of c + A(x) over the X torus
// (widened by the local Phi pictures' range), dense where T is not linear
// in a; remembered by the closure's signature (nothing here depends on
// the pixel)
const stepsumCache = new Map();
const stepsumTables = (S, mask, M0, NA) => {
  const key = `${S.sig}|${mask}|${M0}|${NA}`;
  const hit = stepsumCache.get(key);
  if (hit) return hit;
  const nX = S.X.length;
  const phiR = [];
  const phiL = [];
  S.phis.forEach((q, j) => (mask & (1 << j) ? phiR : phiL).push(j));
  const nP = phiR.length;
  const Ms = nP === 1 ? [Math.max(M0, 48)] : [M0, M0];
  // the range of a = c + A(x) over the X torus
  let amin = Infinity;
  let amax = -Infinity;
  const NS = nX === 0 ? 1 : nX === 1 ? 1024 : 96;
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < (nX === 2 ? NS : 1); j++) {
      const m = new Map();
      if (S.H) {
        m.set(-2, S.H.key); // the shift's terms are the family's, not the table's
        for (const a of S.S) m.set(a.id, 0);
      }
      if (nX >= 1) m.set(S.X[0].id, (i + 0.5) / NS);
      if (nX === 2) m.set(S.X[1].id, (j + 0.5) / NS);
      const a = S.c + (S.A.terms.length ? evalElement(S.A, m).v : 0);
      if (Number.isFinite(a)) {
        amin = Math.min(amin, a);
        amax = Math.max(amax, a);
      }
    }
  if (!Number.isFinite(amin)) {
    amin = S.c;
    amax = S.c;
  }
  const pad = 0.02 * (amax - amin) + 1e-6;
  amin -= pad;
  amax += pad;
  for (const j of phiL) {
    amin += S.phis[j].B.lo;
    amax += S.phis[j].B.hi;
  }
  // where g(a + B_R) is not linear in a: a + [B_R.lo, B_R.hi] straddles zero
  let bLo = 0;
  let bHi = 0;
  for (const j of phiR) {
    bLo += S.phis[j].B.lo;
    bHi += S.phis[j].B.hi;
  }
  const aL = Math.max(amin, -bHi - 1e-9);
  const aR = Math.min(amax, -bLo + 1e-9);
  const nodes = [];
  if (aL < aR) {
    if (amin < aL) nodes.push(amin);
    for (let i = 0; i < NA; i++) nodes.push(aL + ((aR - aL) * i) / (NA - 1));
    if (amax > aR) nodes.push(amax);
  } else {
    nodes.push(amin, amax > amin ? amax : amin + 1);
  }
  const aGrid = Float64Array.from(nodes);
  const nCoef = nP === 1 ? 2 * Ms[0] + 1 : (2 * Ms[0] + 1) * (2 * Ms[1] + 1);
  const Tre = new Float64Array(aGrid.length * nCoef);
  const Tim = new Float64Array(aGrid.length * nCoef);
  const rowRe = new Float64Array(nCoef);
  const rowIm = new Float64Array(nCoef);
  const t0 = DEBUG ? performance.now() : 0;
  for (let ia = 0; ia < aGrid.length; ia++) {
    if (nP === 1) stepTransform1(S.gp, S.phis[phiR[0]].B, aGrid[ia], Ms[0], rowRe, rowIm);
    else stepTransform2(S.gp, S.phis[phiR[0]].B, S.phis[phiR[1]].B, aGrid[ia], Ms[0], Ms[1], rowRe, rowIm);
    Tre.set(rowRe, ia * nCoef);
    Tim.set(rowIm, ia * nCoef);
  }
  const tmax = new Float64Array(nCoef);
  for (let ia = 0; ia < aGrid.length; ia++) for (let q = 0; q < nCoef; q++) tmax[q] = Math.max(tmax[q], Math.hypot(Tre[ia * nCoef + q], Tim[ia * nCoef + q]));
  if (DEBUG) console.log(`      stepsum tables mask ${mask} Ms ${Ms.join(',')} a-nodes ${aGrid.length} [${amin.toFixed(3)}, ${amax.toFixed(3)}] active [${aL.toFixed(3)}, ${aR.toFixed(3)}] ${(performance.now() - t0).toFixed(0)} ms`);
  const tables = { Ms, nP, nCoef, aGrid, Tre, Tim, tmax, xGrids: new Map() };
  if (stepsumCache.size > 64) stepsumCache.clear();
  stepsumCache.set(key, tables);
  return tables;
};
// T_m(a) by linear interpolation on the a-grid: [re, im]
const stepsumT = (tables, q, a) => {
  const { aGrid, nCoef, Tre, Tim } = tables;
  const n = aGrid.length;
  if (a <= aGrid[0]) return [Tre[q], Tim[q]];
  if (a >= aGrid[n - 1]) return [Tre[(n - 1) * nCoef + q], Tim[(n - 1) * nCoef + q]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (aGrid[mid] <= a) lo = mid;
    else hi = mid;
  }
  const f = (a - aGrid[lo]) / (aGrid[hi] - aGrid[lo]);
  return [(1 - f) * Tre[lo * nCoef + q] + f * Tre[hi * nCoef + q], (1 - f) * Tim[lo * nCoef + q] + f * Tim[hi * nCoef + q]];
};
// iterative radix-2 complex FFT: in place on the given arrays, twiddles and
// the bit reversal remembered per length
const fftPlans = new Map();
const fftPlan = (n) => {
  const hit = fftPlans.get(n);
  if (hit) return hit;
  const rev = new Uint32Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    rev[i] = j;
  }
  const wr = new Float64Array(n / 2);
  const wi = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    wr[k] = Math.cos((-TAU * k) / n);
    wi[k] = Math.sin((-TAU * k) / n);
  }
  const plan = { rev, wr, wi };
  fftPlans.set(n, plan);
  return plan;
};
const fftInPlace = (R, I) => {
  const n = R.length;
  const { rev, wr, wi } = fftPlan(n);
  for (let i = 1; i < n; i++) {
    const j = rev[i];
    if (i < j) {
      let t = R[i];
      R[i] = R[j];
      R[j] = t;
      t = I[i];
      I[i] = I[j];
      I[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const cr = wr[k];
        const ci = wi[k];
        const ur = R[i + j];
        const ui = I[i + j];
        const xr = R[i + j + half];
        const xi = I[i + j + half];
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        R[i + j] = ur + vr;
        I[i + j] = ui + vi;
        R[i + j + half] = ur - vr;
        I[i + j + half] = ui - vi;
      }
    }
  }
};
const fft1 = (re, im) => {
  const R = Float64Array.from(re);
  const I = im ? Float64Array.from(im) : new Float64Array(re.length);
  fftInPlace(R, I);
  return { re: R, im: I };
};
const fft2InPlace = (R, I, N) => {
  const colR = new Float64Array(N);
  const colI = new Float64Array(N);
  for (let i = 0; i < N; i++) fftInPlace(R.subarray(i * N, (i + 1) * N), I.subarray(i * N, (i + 1) * N));
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      colR[i] = R[i * N + j];
      colI[i] = I[i * N + j];
    }
    fftInPlace(colR, colI);
    for (let i = 0; i < N; i++) {
      R[i * N + j] = colR[i];
      I[i * N + j] = colI[i];
    }
  }
};
const fft2 = (re, im, N) => {
  const R = Float64Array.from(re);
  const I = im ? Float64Array.from(im) : new Float64Array(N * N);
  fft2InPlace(R, I, N);
  return { re: R, im: I };
};

const collapseWith = (el, jetFn, name) => {
  if (el.terms.length === 0) return Element.const(jetFn(J0).v);
  // one axis, every factor a picture on it: the composition is a picture on
  // that axis (of its shifted coordinate), with the coefficients frozen
  let single = null;
  let allPics = true;
  for (const t of el.terms)
    for (const f of t.f) {
      if (f.kind !== 'pic') allPics = false;
      else if (single === null) single = f.axis;
      else if (single !== f.axis) allPics = false;
    }
  // coefficients that vary across the pixel make the composition a jet
  // valued closure (a Fourier jet), not a picture with frozen numbers
  let constCoefs = true;
  for (const t of el.terms) {
    const j = t.c.re;
    const varies = 3 * (Math.abs(j.gx) + Math.abs(j.gy)) + 4.5 * (Math.abs(j.hxx) + 2 * Math.abs(j.hxy) + Math.abs(j.hyy));
    if (varies > 1e-7 * Math.max(1, Math.abs(j.v)) || t.c.im.v !== 0 || t.c.im.gradNorm() > 0) constCoefs = false;
  }
  if (allPics && single !== null && constCoefs) {
    const terms = el.terms.map((t) => ({ c: t.c.re.v, fns: t.f.map((f) => f.fn) }));
    const fn = (u) => {
      let acc = 0;
      for (const t of terms) {
        let v = t.c;
        for (const g of t.fns) v *= g(u);
        acc += v;
      }
      return jetFn(Jet.c(acc)).v;
    };
    const sig = `${name}(${el.terms.map((t) => `${num(t.c.re.v)}*${t.f.map((f) => f.sig).join('*') || '1'}`).join('+')})`;
    return new Element([{ c: cj(J1, J0), f: [picFactor(single, fn, sig)] }]);
  }
  // otherwise a closure over all axes the element touches directly (fields
  // are evaluated inside)
  const direct = directAxes(el);
  const fn = (cs, coords) => {
    const m = new Map();
    direct.forEach((a, i) => m.set(a.id, cs[i]));
    if (coords) {
      if (coords.has(-1)) m.set(-1, coords.get(-1));
      if (coords.has(-2)) m.set(-2, coords.get(-2));
    }
    return jetFn(evalElement(el, m));
  };
  const clo = cloFactor(direct, fn, `${name}(${elementSig(el)})`);
  // the axes of the element's own factors, without the fields' axes: what a
  // shift (a parallax) may not include
  const own = new Map();
  for (const t of el.terms) for (const f of t.f) for (const a of f.kind === 'pic' ? [f.axis] : f.axes) own.set(a.id, a);
  clo.ownAxes = [...own.values()];
  return new Element([{ c: cj(J1, J0), f: [clo] }]);
};
// a structural signature: coefficient values and factor signatures; the same
// string across pixels exactly when the closure is the same function
const elementSig = (el) =>
  el.terms
    .map((t) => `${jetSig(t.c.re)}${jetIsZero(t.c.im) ? '' : '+' + jetSig(t.c.im) + 'i'}*${t.f.map((f) => (f.kind === 'pic' ? `${f.sig}[${f.axis.label}${f.axis.id}]` : f.sig)).join('*') || '1'}`)
    .join('+');
const directAxes = (el) => {
  const set = new Map();
  for (const t of el.terms)
    for (const f of t.f) {
      if (f.kind === 'pic') {
        set.set(f.axis.id, f.axis);
        if (f.axis.field) for (const b of f.axis.field.axes()) set.set(b.id, b);
      } else for (const a of f.axes) set.set(a.id, a);
    }
  return [...set.values()];
};

export const exp = smoothFn('exp', (j) => j.exp());
export const log = smoothFn('log', (j) => j.log());
export const sqrt = smoothFn('sqrt', (j) => j.sqrt());
export const inv = smoothFn('inv', (j) => j.inv());
export const div = (a, b) => {
  const B = lift(b);
  if (B.isSmooth()) return scaleJet(lift(a), B.smoothPart().inv());
  return mul(a, inv(B));
};
const scaleJet = (el, j) => new Element(el.terms.map((t) => ({ c: cj(t.c.re.mul(j), t.c.im.mul(j)), f: t.f })));
export const pow = (a, n) => {
  const A = lift(a);
  if (Number.isInteger(n) && n >= 0 && n <= 4) {
    let r = Element.const(1);
    for (let i = 0; i < n; i++) r = mul(r, A);
    return r;
  }
  return smoothFn('pow' + n, (j) => j.pow(n))(A);
};

// periodic primitives: the smooth part becomes an axis, the rest its field
const periodic = (name, period, fnOnPeriod) => (x) => {
  const el = lift(x);
  const s = el.smoothPart();
  const P = el.pictured();
  if (jetIsFlat(s) && P.terms.length > 0) {
    // no varying smooth part: a periodic function of a picture is a picture
    const c = s.v;
    return collapseWith(P, (j) => Jet.c(fnOnPeriod(((j.v + c) / period) % 1)).add(J0), name + '∘');
  }
  const count = s.scale(1 / period);
  const field = P.terms.length ? scale(P, 1 / period) : null;
  const { axis, mult } = makeAxis(count, field, 'periodic', name);
  const fn = mult === 1 ? fnOnPeriod : (u) => fnOnPeriod(fractU(mult * u));
  return new Element([{ c: cj(J1, J0), f: [picFactor(axis, fn, mult === 1 ? name : `${name}∘${mult}x`)] }]);
};
// fnOnPeriod receives u in periods (any real); must be 1-periodic
const fractU = (u) => u - Math.floor(u);
export const fract = periodic('fract', 1, fractU);
export const sin = periodic('sin', TAU, (u) => Math.sin(TAU * u));
export const cos = periodic('cos', TAU, (u) => Math.cos(TAU * u));
export const mod = (x, m) => scale(periodic('mod', m, fractU)(x), m);
export const floor = (x) => sub(x, fract(x));

// edges: step(e) = 1{e >= 0}. The smooth part becomes an edge axis whose
// period is set per pixel from its reach; a step of a picture composes.
export const step = (x) => {
  const el = lift(x);
  const s = el.smoothPart();
  const P = el.pictured();
  if (jetIsFlat(s) && P.terms.length > 0) {
    const c = s.v;
    const aff = affineOfTwoValued(P, c, (u) => (u >= 0 ? 1 : 0));
    if (aff) return aff;
    const sos = stepOfSum(P, c, (u) => (u >= 0 ? 1 : 0), 'step');
    if (sos) return sos;
    return collapseWith(P, (j) => Jet.c(j.v + c >= 0 ? 1 : 0), 'step∘');
  }
  if (P.terms.length === 0 && (jetIsConst(s) || stepIsConstant(s))) return Element.const(s.v >= 0 ? 1 : 0);
  const { axis } = makeAxis(s, P.terms.length ? P : null, 'edge', 'step');
  // the picture of an edge axis is a step at zero of the raw count; the
  // periodisation is applied at evaluation, where the period is known
  return new Element([{ c: cj(J1, J0), f: [picFactor(axis, (u) => (u >= 0 ? 1 : 0), 'step')] }]);
};
// a non-smooth function of the raw count on an edge axis, or composed on a
// picture; g is the function of the raw value
// g(c + beta h) for a two-valued closure h (a sign or a step of a sum): an
// affine function of h, since h takes the values v1, v2 only
const affineOfTwoValued = (P, c, g) => {
  if (P.terms.length !== 1) return null;
  const t = P.terms[0];
  if (t.f.length !== 1 || t.f[0].kind !== 'clo' || !t.f[0].stepsum || !jetIsConst(t.c.re) || !jetIsZero(t.c.im)) return null;
  const gp = t.f[0].stepsum.gp;
  if (gp.bm !== 0 || gp.bp !== 0) return null;
  const beta = t.c.re.v;
  const v1 = g(c + beta * gp.am);
  const v2 = g(c + beta * gp.ap);
  const a1 = (v1 + v2) / 2 - ((v2 - v1) / 2) * ((gp.ap + gp.am) / (gp.ap - gp.am));
  const a2 = (v2 - v1) / (gp.ap - gp.am);
  return new Element([{ c: cj(Jet.c(a1), J0), f: [] }, { c: cj(Jet.c(a2), J0), f: [t.f[0]] }]);
};
const edgePrimitive = (name, g) => (x) => {
  const el = lift(x);
  const s = el.smoothPart();
  const P = el.pictured();
  if (jetIsFlat(s) && P.terms.length > 0) {
    const c = s.v;
    const aff = affineOfTwoValued(P, c, g);
    if (aff) return aff;
    const sos = stepOfSum(P, c, g, name);
    if (sos) return sos;
    return collapseWith(P, (j) => Jet.c(g(j.v + c)), name + '∘');
  }
  if (P.terms.length === 0 && (jetIsConst(s) || stepIsConstant(s))) return Element.const(g(s.v));
  const { axis } = makeAxis(s, P.terms.length ? P : null, 'edge', name);
  return new Element([{ c: cj(J1, J0), f: [picFactor(axis, g, name)] }]);
};
export const relu = edgePrimitive('relu', (u) => (u > 0 ? u : 0));
export const sign = edgePrimitive('sign', (u) => (u > 0 ? 1 : u < 0 ? -1 : 0));
export const abs = edgePrimitive('abs', (u) => Math.abs(u));
export const ge = (a, b) => step(sub(a, b));
export const gt = (a, b) => step(sub(a, b));
export const le = (a, b) => step(sub(b, a));
export const lt = (a, b) => step(sub(b, a));
export const max = (a, b) => add(b, relu(sub(a, b)));
export const min = (a, b) => neg(max(neg(a), neg(b)));
export const select = (c, a, b) => add(mul(c, a), mul(sub(1, c), b));
export const eq = (a, b) => {
  // a == b for pictures with discrete values: 1 - step(|a-b| - eps) style
  const d = sub(a, b);
  return sub(1, step(sub(abs(d), 1e-9)));
};
export const dot = (u, v) => {
  let s = Element.zero();
  for (let i = 0; i < u.length; i++) s = add(s, mul(u[i], v[i]));
  return s;
};
export const cross = (a, b) => [sub(mul(a[1], b[2]), mul(a[2], b[1])), sub(mul(a[2], b[0]), mul(a[0], b[2])), sub(mul(a[0], b[1]), mul(a[1], b[0]))];
export const normalize = (v) => {
  const n = sqrt(dot(v, v));
  return v.map((c) => div(c, n));
};

// ---------------------------------------------------------------------------
// Fourier coefficients of factors
// ---------------------------------------------------------------------------
// Coefficients c_k, |k| <= K, of a 1-periodic function of one variable given
// as a callable, jump-aware: samples at M points detect jumps, jumps are
// located by bisection, and each smooth piece is integrated by Gauss-Legendre
// against e^{-2 pi i k u} with enough nodes for the highest harmonic.
const GL8 = [
  [-0.9602898565, 0.1012285363],
  [-0.7966664774, 0.2223810345],
  [-0.525532409, 0.3137066459],
  [-0.1834346425, 0.3626837834],
  [0.1834346425, 0.3626837834],
  [0.525532409, 0.3137066459],
  [0.7966664774, 0.2223810345],
  [0.9602898565, 0.1012285363],
];
const locateJumps = (fn, M) => {
  const vals = new Float64Array(M + 1);
  for (let i = 0; i <= M; i++) vals[i] = fn(i / M);
  let scale = 0;
  for (let i = 0; i <= M; i++) scale = Math.max(scale, Math.abs(vals[i]));
  const jumps = [];
  for (let i = 0; i < M; i++) {
    const d = Math.abs(vals[i + 1] - vals[i]);
    if (d > 0.2 * Math.max(scale, 1e-12) + 1e-12) {
      // bisect
      let a = i / M;
      let b = (i + 1) / M;
      let fa = vals[i];
      for (let it = 0; it < 40; it++) {
        const m = (a + b) / 2;
        const fm = fn(m);
        if (Math.abs(fm - fa) > d / 2) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      jumps.push((a + b) / 2);
    }
  }
  return jumps;
};
// returns Float64Array re, im of length 2K+1 indexed k+K
const fourier1 = (fn, K, opts = {}) => {
  const M = Math.max(64, 2 * K + 2, opts.M || 0);
  const jumps = locateJumps(fn, M);
  const re = new Float64Array(2 * K + 1);
  const im = new Float64Array(2 * K + 1);
  // pieces between jumps (the circle cut at each jump; if none, at 0)
  const cuts = jumps.length ? jumps : [0];
  const pieces = [];
  for (let i = 0; i < cuts.length; i++) {
    const a = cuts[i];
    const b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 1;
    if (b > a + 1e-12) pieces.push([a, b]);
  }
  for (const [a, b] of pieces) {
    const len = b - a;
    const panels = Math.max(1, Math.ceil(len * (K / 3 + 1)));
    for (let p = 0; p < panels; p++) {
      const pa = a + (len * p) / panels;
      const pb = a + (len * (p + 1)) / panels;
      const half = (pb - pa) / 2;
      const mid = (pa + pb) / 2;
      for (const [node, wt] of GL8) {
        const u = mid + half * node;
        const v = fn(u) * wt * half;
        const c0 = Math.cos(TAU * u);
        const s0 = Math.sin(TAU * u);
        // e^{-2 pi i k u} by recurrence
        let cr = 1;
        let ci = 0;
        for (let k = 0; k <= K; k++) {
          re[K + k] += v * cr;
          im[K + k] -= v * ci;
          if (k > 0) {
            re[K - k] += v * cr;
            im[K - k] += v * ci;
          }
          const nr = cr * c0 - ci * s0;
          ci = cr * s0 + ci * c0;
          cr = nr;
        }
      }
    }
  }
  return { re, im, K };
};
const fourierCache = new Map();
const jet2Cache = new Map();
const fourierPic = (f, K) => {
  const key = `${f.sig}|${K}`;
  let c = fourierCache.get(key);
  if (!c) {
    c = fourier1(f.fn, K);
    if (fourierCache.size > 20000) fourierCache.clear();
    fourierCache.set(key, c);
  }
  return c;
};

// ---------------------------------------------------------------------------
// The pixel functional
// ---------------------------------------------------------------------------
// moments of the quadratic-phase Gaussian: z ~ N(0, sig^2 I)
const complexInv2 = (a, b, c, d) => {
  // inverse of the complex symmetric matrix [[a, b],[b, d]] with entries [re, im]
  const cm = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const det = (() => {
    const p1 = cm(a, d);
    const p2 = cm(b, b);
    return [p1[0] - p2[0], p1[1] - p2[1]];
  })();
  const dn = det[0] * det[0] + det[1] * det[1];
  const idet = [det[0] / dn, -det[1] / dn];
  return { m00: cm(d, idet), m01: cm([-b[0], -b[1]], idet), m11: cm(a, idet) };
};
const phaseMoments = (bx, by, q00, q01, q11, sig) => {
  const r2 = sig * sig;
  const ir = 1 / r2;
  // M = I/sig^2 - iQ
  const Minv = complexInv2([ir, -q00], [0, -q01], [ir, -q11], [ir, -q11]);
  const { m00, m01, m11 } = Minv;
  // M^{-1} b
  const v0 = [m00[0] * bx + m01[0] * by, m00[1] * bx + m01[1] * by];
  const v1 = [m01[0] * bx + m11[0] * by, m01[1] * bx + m11[1] * by];
  // b^T M^{-1} b
  const quad = [bx * v0[0] + by * v1[0], bx * v0[1] + by * v1[1]];
  const ex = -0.5 * quad[0];
  if (ex < -40) return null;
  const ey = -0.5 * quad[1];
  // det(I - i sig^2 Q)^{-1/2}: eigenvalues of sig^2 Q
  const tr = r2 * (q00 + q11);
  const dq = r2 * r2 * (q00 * q11 - q01 * q01);
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - dq));
  const l1 = tr / 2 + disc;
  const l2 = tr / 2 - disc;
  const root = (l) => {
    const w = Math.sqrt(1 + l * l);
    return [Math.sqrt((w + 1) / 2), -(l < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (w - 1) / 2))];
  };
  const r1 = root(l1);
  const r2c = root(l2);
  const dr = r1[0] * r2c[0] - r1[1] * r2c[1];
  const di = r1[0] * r2c[1] + r1[1] * r2c[0];
  const dn = dr * dr + di * di;
  const e = Math.exp(ex);
  const er = e * Math.cos(ey);
  const ei = e * Math.sin(ey);
  const I0 = [(er * dr + ei * di) / dn, (ei * dr - er * di) / dn];
  // I1 = i M^{-1} b I0
  const cm = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const iv0 = [-v0[1], v0[0]];
  const iv1 = [-v1[1], v1[0]];
  const I1 = [cm(iv0, I0), cm(iv1, I0)];
  // I2 = (M^{-1} - (M^{-1}b)(M^{-1}b)^T) I0
  const I2 = {
    xx: cm([m00[0] - (v0[0] * v0[0] - v0[1] * v0[1]), m00[1] - 2 * v0[0] * v0[1]], I0),
    xy: cm([m01[0] - (v0[0] * v1[0] - v0[1] * v1[1]), m01[1] - (v0[0] * v1[1] + v0[1] * v1[0])], I0),
    yy: cm([m11[0] - (v1[0] * v1[0] - v1[1] * v1[1]), m11[1] - 2 * v1[0] * v1[1]], I0),
  };
  return { I0, I1, I2 };
};

// log of the magnitude of the quadratic-phase Gaussian integral I0, for
// pruning: exp(-b^T Re[(A - iQ)^{-1}] b / 2) |det(I - i sig^2 Q)|^{-1/2}
// with A = I/sig^2, Re[(A - iQ)^{-1}] = a (a^2 I + Q^2)^{-1}. Under a
// line condition the scalar version along the line.
const logMult = (bx, by, q00, q01, q11, cond) => {
  const r2 = cond.sig * cond.sig;
  const a = 1 / r2;
  if (cond.dim === 2) {
    // Q^2
    const s00 = q00 * q00 + q01 * q01;
    const s01 = q01 * (q00 + q11);
    const s11 = q01 * q01 + q11 * q11;
    const m00 = a * a + s00;
    const m01 = s01;
    const m11 = a * a + s11;
    const det = m00 * m11 - m01 * m01;
    const quad = (a * (m11 * bx * bx - 2 * m01 * bx * by + m00 * by * by)) / det;
    const dq = q00 * q11 - q01 * q01;
    const logDet = Math.log(1 + r2 * r2 * (s00 + s11) + r2 * r2 * r2 * r2 * dq * dq);
    return -0.5 * quad - 0.25 * logDet;
  }
  const ex = cond.e[0];
  const ey = cond.e[1];
  const mx = cond.m[0];
  const my = cond.m[1];
  const b1 = (bx + q00 * mx + q01 * my) * ex + (by + q01 * mx + q11 * my) * ey;
  const q1 = q00 * ex * ex + 2 * q01 * ex * ey + q11 * ey * ey;
  return -0.5 * b1 * b1 * (a / (a * a + q1 * q1)) - 0.25 * Math.log(1 + r2 * r2 * q1 * q1);
};

// The pixel functional under a Gaussian that may be conditioned: full 2-D
// (z ~ N(0, sig^2 I)), a line (z = m + t e, t ~ N(0, sig^2)) after
// conditioning on one local axis, or a point (z = m) after two.
// E[a(z) e^{i(phi0 + b.z + z^T Q z / 2)}] for a complex coefficient jet a.
const termExpectation = (a, phi0, bx, by, q00, q01, q11, cond) => {
  if (cond.dim === 2) {
    const m = phaseMoments(bx, by, q00, q01, q11, cond.sig);
    if (!m) return [0, 0];
    const { I0, I1, I2 } = m;
    const parts = (j) => [
      j.v * I0[0] + j.gx * I1[0][0] + j.gy * I1[1][0] + 0.5 * (j.hxx * I2.xx[0] + 2 * j.hxy * I2.xy[0] + j.hyy * I2.yy[0]),
      j.v * I0[1] + j.gx * I1[0][1] + j.gy * I1[1][1] + 0.5 * (j.hxx * I2.xx[1] + 2 * j.hxy * I2.xy[1] + j.hyy * I2.yy[1]),
    ];
    return rotate(parts(a.re), parts(a.im), phi0);
  }
  const mx = cond.m[0];
  const my = cond.m[1];
  // restrict the phase and the coefficient to z = m + t e
  const phiM = phi0 + bx * mx + by * my + 0.5 * (q00 * mx * mx + 2 * q01 * mx * my + q11 * my * my);
  const restrict = (j) => ({
    v: j.v + j.gx * mx + j.gy * my + 0.5 * (j.hxx * mx * mx + 2 * j.hxy * mx * my + j.hyy * my * my),
    g: 0,
    h: 0,
  });
  if (cond.dim === 0) {
    const ar = restrict(a.re).v;
    const ai = restrict(a.im).v;
    return rotate([ar, 0], [ai, 0], phiM);
  }
  const ex = cond.e[0];
  const ey = cond.e[1];
  const b1 = (bx + q00 * mx + q01 * my) * ex + (by + q01 * mx + q11 * my) * ey;
  const q1 = q00 * ex * ex + 2 * q01 * ex * ey + q11 * ey * ey;
  const r2 = cond.sig * cond.sig;
  // 1-D moments: M = 1/sig^2 - i q1; I0 = (1 - i sig^2 q1)^{-1/2} exp(-b1^2/(2M))
  const Mr = 1 / r2;
  const Mi = -q1;
  const Mn = Mr * Mr + Mi * Mi;
  const invR = Mr / Mn;
  const invI = -Mi / Mn;
  const ex0 = -0.5 * b1 * b1 * invR;
  if (ex0 < -40) return [0, 0];
  const ey0 = -0.5 * b1 * b1 * invI;
  const w = Math.sqrt(1 + r2 * r2 * q1 * q1);
  const rr = Math.sqrt((w + 1) / 2);
  const ri = -(r2 * q1 < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (w - 1) / 2));
  const dn = rr * rr + ri * ri;
  const e = Math.exp(ex0);
  const er = e * Math.cos(ey0);
  const ei = e * Math.sin(ey0);
  const I0 = [(er * rr + ei * ri) / dn, (ei * rr - er * ri) / dn];
  // I1 = i b1 M^{-1} I0 ; I2 = (M^{-1} - b1^2 M^{-2}) I0
  const cm = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
  const inv = [invR, invI];
  const I1 = cm([-b1 * invI, b1 * invR], I0);
  const inv2 = cm(inv, inv);
  const I2 = cm([invR - b1 * b1 * inv2[0], invI - b1 * b1 * inv2[1]], I0);
  const lineJet = (j) => {
    const g = (j.gx + j.hxx * mx + j.hxy * my) * ex + (j.gy + j.hxy * mx + j.hyy * my) * ey;
    const h = j.hxx * ex * ex + 2 * j.hxy * ex * ey + j.hyy * ey * ey;
    const v = restrict(j).v;
    return [v * I0[0] + g * I1[0] + 0.5 * h * I2[0], v * I0[1] + g * I1[1] + 0.5 * h * I2[1]];
  };
  return rotate(lineJet(a.re), lineJet(a.im), phiM);
};
const rotate = (pr, pi, phi) => {
  const vr = pr[0] - pi[1];
  const vi = pr[1] + pi[0];
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  return [vr * c - vi * s, vr * s + vi * c];
};

// Lower bounds on the rate a recipe can reach by adding integer multiples
// of other axes' rates. `x` is the rate so far, `others` the remaining
// freedoms {g, K} (rate vectors and harmonic ranges). relaxedRate2 lets the
// multiples be real (valid for every multiple of x, used to size harmonic
// ranges); pruneRate2 is exact over the integers when one freedom remains
// and otherwise falls back to the relaxed bound.
const relaxedRate2 = (x, others) => {
  const n2 = x[0] * x[0] + x[1] * x[1];
  if (others.length === 0) return n2;
  // reach bound: the others cannot move x by more than sum K |g|
  let reach = 0;
  for (const { g, K } of others) reach += K * Math.hypot(g[0], g[1]);
  const nx = Math.sqrt(n2);
  const reachBound = nx > reach ? (nx - reach) ** 2 : 0;
  if (others.length === 1) {
    const { g, K } = others[0];
    const gn = g[0] * g[0] + g[1] * g[1];
    if (gn < 1e-30) return n2;
    let m = -(x[0] * g[0] + x[1] * g[1]) / gn;
    if (m > K) m = K;
    if (m < -K) m = -K;
    const rx = x[0] + m * g[0];
    const ry = x[1] + m * g[1];
    return Math.max(rx * rx + ry * ry, reachBound);
  }
  // all parallel: the component of x across their common direction survives
  const g0 = others[0].g;
  const n0 = Math.hypot(g0[0], g0[1]);
  let parallel = n0 > 1e-15;
  for (const { g } of others) {
    const ng = Math.hypot(g[0], g[1]);
    if (ng < 1e-15) continue;
    if (Math.abs(g0[0] * g[1] - g0[1] * g[0]) > 1e-9 * n0 * ng) parallel = false;
  }
  if (parallel) {
    const perp = (x[0] * g0[1] - x[1] * g0[0]) / n0;
    return Math.max(perp * perp, reachBound);
  }
  return reachBound;
};
const pruneRate2 = (x, others) => {
  if (others.length === 1) {
    const { g, K } = others[0];
    const gn = g[0] * g[0] + g[1] * g[1];
    if (gn < 1e-30) return x[0] * x[0] + x[1] * x[1];
    const m = -(x[0] * g[0] + x[1] * g[1]) / gn;
    let best = Infinity;
    for (let mm of [Math.floor(m), Math.ceil(m)]) {
      if (mm > K) mm = K;
      if (mm < -K) mm = -K;
      const rx = x[0] + mm * g[0];
      const ry = x[1] + mm * g[1];
      best = Math.min(best, rx * rx + ry * ry);
    }
    return best;
  }
  return relaxedRate2(x, others);
};

// The jump levels of a picture: the coordinates in [0,1) where a periodic
// picture jumps (found once per picture, remembered on it); an edge picture
// has its step or kink at raw zero.
const levelsOfFn = (fn) => {
  const M = 96;
  const vals = [];
  for (let i = 0; i <= M; i++) vals.push(fn(i / M));
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const v of vals) {
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  const levels = [];
  for (let i = 0; i < M; i++) {
    const d = Math.abs(vals[i + 1] - vals[i]);
    if (d > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
      let x0 = i / M;
      let x1 = (i + 1) / M;
      const f0 = vals[i];
      for (let it = 0; it < 30; it++) {
        const xm = (x0 + x1) / 2;
        if (Math.abs(fn(xm) - f0) > d / 2) x1 = xm;
        else x0 = xm;
      }
      levels.push((x0 + x1) / 2);
    }
  }
  return levels;
};
const factorLevels = (f, axis) => {
  if (f._levels) return f._levels;
  if (axis.kind === 'edge') f._levels = [0];
  else f._levels = levelsOfFn(f.kind === 'pic' ? f.fn : (u) => f.fn([u]).v);
  return f._levels;
};
// where a coordinate along a path crosses a level (plus any integer for a
// periodic axis): the coordinate is sampled, each bracket bisected
const cutsOnPath = (items, lo, hi) => {
  const cuts = [];
  for (const { coord, levels, periodic, samples } of items) {
    if (levels.length === 0) continue;
    const N = samples;
    const cs = [];
    for (let i = 0; i <= N; i++) cs.push(coord(lo + ((hi - lo) * i) / N));
    for (let i = 0; i < N; i++) {
      const s0 = lo + ((hi - lo) * i) / N;
      const s1 = lo + ((hi - lo) * (i + 1)) / N;
      const c0 = cs[i];
      const c1 = cs[i + 1];
      const cmin = Math.min(c0, c1);
      const cmax = Math.max(c0, c1);
      for (const l of levels) {
        const k0 = periodic ? Math.ceil(cmin - l) : 0;
        const k1 = periodic ? Math.floor(cmax - l) : 0;
        for (let k = k0; k <= k1; k++) {
          const target = l + k;
          if (!periodic && (target < cmin || target > cmax)) continue;
          let x0 = s0;
          let x1 = s1;
          let f0 = c0 - target;
          for (let it = 0; it < 18; it++) {
            const xm = (x0 + x1) / 2;
            const fm = coord(xm) - target;
            if ((fm < 0) === (f0 < 0)) {
              x0 = xm;
              f0 = fm;
            } else x1 = xm;
          }
          cuts.push((x0 + x1) / 2);
        }
      }
    }
  }
  return cuts;
};
// a jump scan of a value along a path, for closures over several axes
const scanJumps = (at, lo, hi, M = 24) => {
  const vals = [];
  for (let i = 0; i <= M; i++) vals.push(at(lo + ((hi - lo) * i) / M));
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const v of vals) {
    vmin = Math.min(vmin, v);
    vmax = Math.max(vmax, v);
  }
  const jumps = [];
  for (let i = 0; i < M; i++) {
    const d = Math.abs(vals[i + 1] - vals[i]);
    if (d > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
      let x0 = lo + ((hi - lo) * i) / M;
      let x1 = lo + ((hi - lo) * (i + 1)) / M;
      const f0 = vals[i];
      for (let it = 0; it < 24; it++) {
        const xm = (x0 + x1) / 2;
        if (Math.abs(at(xm) - f0) > d / 2) x1 = xm;
        else x0 = xm;
      }
      // a steep slope shrinks with the bracket, a jump does not
      if (Math.abs(at(x1) - at(x0)) < 0.5 * d) continue;
      jumps.push((x0 + x1) / 2);
    }
  }
  return jumps;
};

const lgamma = (x) => {
  // Lanczos, enough for the bound
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  let t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -t + Math.log((2.5066282746310005 * ser) / x);
};
// one harmonic of the jet-valued samples: sum_i S_i e^{-2 pi i m u_i}
const residualCoefAt = (nodes, SR, SI, N, m) => {
  let a0 = 0;
  let a1 = 0;
  let a2 = 0;
  let a3 = 0;
  let a4 = 0;
  let a5 = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  for (let i = 0; i < N; i++) {
    const ang = -TAU * m * nodes[i][0];
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const o = 6 * i;
    a0 += SR[o] * c - SI[o] * s;
    b0 += SR[o] * s + SI[o] * c;
    a1 += SR[o + 1] * c - SI[o + 1] * s;
    b1 += SR[o + 1] * s + SI[o + 1] * c;
    a2 += SR[o + 2] * c - SI[o + 2] * s;
    b2 += SR[o + 2] * s + SI[o + 2] * c;
    a3 += SR[o + 3] * c - SI[o + 3] * s;
    b3 += SR[o + 3] * s + SI[o + 3] * c;
    a4 += SR[o + 4] * c - SI[o + 4] * s;
    b4 += SR[o + 4] * s + SI[o + 4] * c;
    a5 += SR[o + 5] * c - SI[o + 5] * s;
    b5 += SR[o + 5] * s + SI[o + 5] * c;
  }
  return [new Jet(a0, a1, a2, a3, a4, a5), new Jet(b0, b1, b2, b3, b4, b5)];
};

// ---------------------------------------------------------------------------
// Evaluation of E[element] at one pixel
// ---------------------------------------------------------------------------
export class Pixel {
  constructor(sig = 0.5, cut = 1e-4) {
    this.sig = sig;
    this.cut = cut;
    this.reach = Math.sqrt(-2 * Math.log(cut));
    this.maxK = 512;
    this.maxRecipes = 200000;
    this.localSigma = 0.02; // below this pixel-sigma (in periods) an axis is local
    this.foldGrowth = 2; // cap on the growth of harmonic ranges under curvature
    this.maxK2 = 64; // range cap per axis of a two-axis residual transform
    this.maxKline = 64; // range cap per axis under a line condition
    this.parallelSigma = 0.03; // an axis below this sigma, parallel to a faster one, is local
    this.parallelSin = 0.26; // sine of the angle within which axes count as parallel
    this.lineMaxPeriods = 24; // pointwise along a line up to this many periods of the fastest axis
    this.localPanel = 3; // Gauss-Legendre panel width along a local axis, in pixel-sigmas of it
    this.stepsumM = 24; // harmonics per Phi axis in the tables of a step of a sum (48 at least for one axis)
    this.stepsumNA = 257; // a-nodes of those tables over the range where T is not linear in a
    this.stepsumKW = 32; // window of X harmonics kept from the transform over X
    this.stepsumNG = 256; // grid per residual X axis for that transform (remembered across pixels)
    this.stepsumNGlocal = 128; // the same when local coordinates enter it (rebuilt per point)
    this.shiftNG = 64; // grid per shift axis for the family over the shift torus
    this.shiftKW = 16; // window of shift harmonics kept
    this.shiftDTheta = 0.05; // theta step of the family (quadratic interpolation)
    this.curvedWidth = true; // the width of a count includes its curvature (false: first order only, the ablation)
    this.coverageNG = 192; // grid over a curved count's excursion for the coverage integral
    this.stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0, localNodes: 0, thetaAbsMax: 0, thetaHMax: 0, shiftOrderMax: 0 };
  }
  // the width of a count under the pixel, in periods: the standard deviation
  // of g.z + z^T H z / 2 for z ~ N(0, sig^2 I), whose variance is
  // sig^2 |g|^2 + sig^4 |H|_F^2 / 2. A count at its stationary point is not
  // constant across the pixel when it curves: E cos(2 pi A t^2) over a pixel
  // of sigma 1/2 is Re (1 - 4 pi i A sig^2)^(-1/2) = 0.445 at A = 1, not 1.
  // The curvature enters the width, and with it the choice between frozen,
  // local and spectral, so that a stationary count stays spectral where the
  // quadratic phase is integrated in closed form.
  axisSigma(axis) {
    const p = axis.kind === 'edge' ? axis.edgePeriod : 1;
    const c = axis.count;
    const s2 = this.sig * this.sig;
    if (!this.curvedWidth) return (this.sig * c.gradNorm()) / p;
    const hf = c.hxx * c.hxx + 2 * c.hxy * c.hxy + c.hyy * c.hyy;
    return Math.sqrt(s2 * c.gradNorm() * c.gradNorm() + 0.5 * s2 * s2 * hf) / p;
  }
  // the first-order width alone: what the local path's line quadrature
  // sizes its panels by, since it models the count as linear along the line
  axisSigmaLinear(axis) {
    const p = axis.kind === 'edge' ? axis.edgePeriod : 1;
    return (this.sig * axis.count.gradNorm()) / p;
  }
  // does the rate dominate the curvature in the count's width? A narrow
  // count that is mostly curvature has no line to integrate along.
  rateDominates(axis) {
    if (!this.curvedWidth) return true;
    const lin = this.axisSigmaLinear(axis);
    const tot = this.axisSigma(axis);
    return lin * lin >= 0.5 * tot * tot;
  }
  // an axis is frozen (its coordinate a number) when the count neither moves
  // nor curves across the pixel, or when it is narrow (under the local
  // threshold) and mostly curvature: then the line quadrature has no line,
  // and the series in its torus coordinate would carry every harmonic at
  // full strength (a stationary count suppresses nothing), so the count is
  // held at its mean over the pixel, u0 + sig^2 tr(H) / 2. A stationary count
  // whose curvature makes it wide stays spectral, where its quadratic phase
  // is integrated in closed form (cos(2 pi t^2) under sigma 1/2 is 0.445).
  isFrozen(axis) {
    const w = this.axisSigma(axis);
    return w < 1e-9 || (w < this.localSigma && !this.rateDominates(axis));
  }
  // the value a frozen axis's coordinate takes: the mean of the count over
  // the pixel (its centre value plus the curvature's shift)
  frozenValue(axis) {
    const c = axis.count;
    return c.v + 0.5 * this.sig * this.sig * (c.hxx + c.hyy);
  }
  // the expectation of a picture of a curved count over the pixel: with
  // z ~ N(0, sig^2 I) and xi(z) = u0 + g.z + z^T H z / 2, rotate to H's
  // eigenvectors, condition on the first coordinate (Gauss-Legendre panels
  // cut where the roots in the second appear or vanish), and in the second
  // the count is a quadratic whose sublevel sets are intervals, so the
  // distribution function F(c) = P(xi <= c) is a sum of normal
  // distribution differences. The picture is sampled on a grid over the
  // count's excursion with its jumps located by bisection, interpolated
  // linearly between, and E p(xi) = sum over segments of the linear
  // interpolant integrated against dF. This is the boundary-aware coverage
  // a reviewer asked for: freezing a step of eps (Z^2 - 1/2) at its mean
  // eps/2 returns 1 for every eps, where P(Z^2 > 1/2) = erfc(1/2) = 0.4795.
  // does a picture jump within the count's excursion across the pixel?
  picturesJump(axis, fn) {
    const c = axis.count;
    const S = this.sig;
    const L = 6;
    let umin = Infinity;
    let umax = -Infinity;
    for (let i = 0; i < 32; i++) {
      const th = (TAU * i) / 32;
      for (const r of [0.5, 1]) {
        const w1 = r * L * S * Math.cos(th);
        const w2 = r * L * S * Math.sin(th);
        const u = c.v + c.gx * w1 + c.gy * w2 + 0.5 * (c.hxx * w1 * w1 + 2 * c.hxy * w1 * w2 + c.hyy * w2 * w2);
        umin = Math.min(umin, u);
        umax = Math.max(umax, u);
      }
    }
    umin = Math.min(umin, c.v);
    umax = Math.max(umax, c.v);
    const NG = 96;
    const vs = [];
    for (let i = 0; i <= NG; i++) vs.push(fn(umin + ((umax - umin) * i) / NG));
    const diffs = [];
    for (let i = 0; i < NG; i++) diffs.push(Math.abs(vs[i + 1] - vs[i]));
    const typical = diffs.slice().sort((x, y) => x - y)[Math.floor(NG * 0.5)];
    return diffs.some((d) => d > 8 * typical + 1e-9 * (Math.abs(umax - umin) + 1) + 1e-300);
  }
  // With `amp`, a coefficient jet in pixel coordinates, the integral is
  // E[amp(z) p(xi(z))]: the amplitude is a quadratic in the eigenframe and
  // its Gaussian moments over each interval are closed form, so the mask
  // keeps its correlation with the amplitude (E[Z^2 1{Z^2 >= 1/2}] is
  // 0.9189, where the product of the two expectations is 0.4795).
  coverageExpect(axis, fn, amp = null) {
    const c = axis.count;
    const S = this.sig;
    // eigen-decomposition of the Hessian
    const hxx = c.hxx;
    const hxy = c.hxy;
    const hyy = c.hyy;
    const tr = hxx + hyy;
    const disc = Math.sqrt(Math.max(0, ((hxx - hyy) / 2) ** 2 + hxy * hxy));
    const l1 = tr / 2 + disc;
    const l2 = tr / 2 - disc;
    let e1;
    if (Math.abs(hxy) > 1e-300) e1 = [l1 - hyy, hxy];
    else e1 = hxx >= hyy ? [1, 0] : [0, 1];
    const n1 = Math.hypot(e1[0], e1[1]);
    e1 = [e1[0] / n1, e1[1] / n1];
    const e2 = [-e1[1], e1[0]];
    const a1 = c.gx * e1[0] + c.gy * e1[1];
    const a2 = c.gx * e2[0] + c.gy * e2[1];
    const u0 = c.v;
    // the amplitude in the eigenframe: A(w1) + B(w1) w2 + C w2^2
    const hasAmp = amp !== null && !jetIsConst(amp);
    const c0 = amp === null ? 1 : amp.v;
    const c1 = hasAmp ? amp.gx * e1[0] + amp.gy * e1[1] : 0;
    const c2 = hasAmp ? amp.gx * e2[0] + amp.gy * e2[1] : 0;
    const c11 = hasAmp ? amp.hxx * e1[0] * e1[0] + 2 * amp.hxy * e1[0] * e1[1] + amp.hyy * e1[1] * e1[1] : 0;
    const c12 = hasAmp ? amp.hxx * e1[0] * e2[0] + amp.hxy * (e1[0] * e2[1] + e1[1] * e2[0]) + amp.hyy * e1[1] * e2[1] : 0;
    const c22 = hasAmp ? amp.hxx * e2[0] * e2[0] + 2 * amp.hxy * e2[0] * e2[1] + amp.hyy * e2[1] * e2[1] : 0;
    // Gaussian moments of orders 0, 1, 2 over [lo, hi] for N(0, S^2)
    const phiS = (w) => (Number.isFinite(w) ? Math.exp(-0.5 * (w / S) ** 2) / (S * Math.sqrt(TAU)) : 0);
    const moments = (lo, hi) => {
      const M0 = (Number.isFinite(hi) ? normalCdf(hi / S) : 1) - (Number.isFinite(lo) ? normalCdf(lo / S) : 0);
      const plo = phiS(lo);
      const phi = phiS(hi);
      const M1 = S * S * (plo - phi);
      const M2 = S * S * M0 + S * S * ((Number.isFinite(lo) ? lo * plo : 0) - (Number.isFinite(hi) ? hi * phi : 0));
      return [M0, M1, M2];
    };
    const weigh = (w1, M) => {
      if (!hasAmp) return c0 * M[0];
      const A = c0 + c1 * w1 + 0.5 * c11 * w1 * w1;
      const B = c2 + c12 * w1;
      return A * M[0] + B * M[1] + 0.5 * c22 * M[2];
    };
    const FULL = [1, 0, S * S];
    // the excursion of the count over the reach (a disc of radius L sig)
    const L = 6;
    let umin = Infinity;
    let umax = -Infinity;
    for (let i = 0; i < 64; i++) {
      const th = (TAU * i) / 64;
      for (const r of [0.25, 0.5, 0.75, 1]) {
        const w1 = r * L * S * Math.cos(th);
        const w2 = r * L * S * Math.sin(th);
        const u = u0 + a1 * w1 + a2 * w2 + 0.5 * (l1 * w1 * w1 + l2 * w2 * w2);
        umin = Math.min(umin, u);
        umax = Math.max(umax, u);
      }
    }
    // the stationary point of the quadratic, if inside the disc
    if (Math.abs(l1) > 1e-300 && Math.abs(l2) > 1e-300) {
      const w1 = -a1 / l1;
      const w2 = -a2 / l2;
      if (Math.hypot(w1, w2) < L * S) {
        const u = u0 + a1 * w1 + a2 * w2 + 0.5 * (l1 * w1 * w1 + l2 * w2 * w2);
        umin = Math.min(umin, u);
        umax = Math.max(umax, u);
      }
    }
    umin = Math.min(umin, u0);
    umax = Math.max(umax, u0);
    const span = Math.max(umax - umin, 1e-300);
    umin -= 1e-3 * span;
    umax += 1e-3 * span;
    // F(cv) = P(xi <= cv): condition on w1, intervals in w2
    const Fof = (cv) => {
      // for each w1 the set {w2: q(w2) <= 0}, q = (u0 + a1 w1 + l1 w1^2/2 - cv) + a2 w2 + l2 w2^2/2
      const probW2 = (w1) => {
        const k = u0 + a1 * w1 + 0.5 * l1 * w1 * w1 - cv;
        if (Math.abs(l2) < 1e-14 * (Math.abs(a2) + 1e-300)) {
          if (Math.abs(a2) < 1e-300) return k <= 0 ? weigh(w1, FULL) : 0;
          // a2 w2 + k <= 0
          const r = -k / a2;
          return a2 > 0 ? weigh(w1, moments(-Infinity, r)) : weigh(w1, moments(r, Infinity));
        }
        const D = a2 * a2 - 2 * l2 * k;
        if (D < 0) return l2 > 0 ? 0 : weigh(w1, FULL);
        const sq = Math.sqrt(D);
        const r1 = (-a2 - sq) / l2;
        const r2 = (-a2 + sq) / l2;
        const lo = Math.min(r1, r2);
        const hi = Math.max(r1, r2);
        const inside = moments(lo, hi);
        if (l2 > 0) return weigh(w1, inside);
        return weigh(w1, [FULL[0] - inside[0], FULL[1] - inside[1], FULL[2] - inside[2]]);
      };
      // cut the w1 line where the discriminant vanishes (roots appear), or,
      // when the second direction is inert, where the count itself crosses
      // the level (the indicator jumps in w1)
      const cuts = [-L * S, L * S];
      if (Math.abs(l2) < 1e-14 * (Math.abs(a2) + 1e-300) && Math.abs(a2) < 1e-300) {
        // l1 w1^2 / 2 + a1 w1 + (u0 - cv) = 0
        const A = 0.5 * l1;
        const B = a1;
        const C = u0 - cv;
        if (Math.abs(A) > 1e-300) {
          const dd = B * B - 4 * A * C;
          if (dd >= 0) {
            const sq = Math.sqrt(dd);
            for (const r of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (r > -L * S && r < L * S) cuts.push(r);
          }
        } else if (Math.abs(B) > 1e-300) {
          const r = -C / B;
          if (r > -L * S && r < L * S) cuts.push(r);
        }
      } else if (Math.abs(l2) >= 1e-14 * (Math.abs(a2) + 1e-300)) {
        // D(w1) = a2^2 - 2 l2 (u0 - cv + a1 w1 + l1 w1^2 / 2) = 0: quadratic in w1
        const A = -l2 * l1;
        const B = -2 * l2 * a1;
        const C = a2 * a2 - 2 * l2 * (u0 - cv);
        if (Math.abs(A) > 1e-300) {
          const dd = B * B - 4 * A * C;
          if (dd >= 0) {
            const sq = Math.sqrt(dd);
            for (const r of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) if (r > -L * S && r < L * S) cuts.push(r);
          }
        } else if (Math.abs(B) > 1e-300) {
          const r = -C / B;
          if (r > -L * S && r < L * S) cuts.push(r);
        }
      }
      cuts.sort((x, y) => x - y);
      const gl = gaussLegendre(32);
      let total = 0;
      for (let i = 0; i + 1 < cuts.length; i++) {
        const lo = cuts[i];
        const hi = cuts[i + 1];
        if (hi - lo < 1e-300) continue;
        // split long panels so the Gaussian weight is resolved
        const nsub = Math.max(1, Math.ceil((hi - lo) / (1.5 * S)));
        for (let j = 0; j < nsub; j++) {
          const p0 = lo + ((hi - lo) * j) / nsub;
          const p1 = lo + ((hi - lo) * (j + 1)) / nsub;
          const h = 0.5 * (p1 - p0);
          const m = 0.5 * (p1 + p0);
          for (let q = 0; q < gl.x.length; q++) {
            const w1 = m + h * gl.x[q];
            total += h * gl.w[q] * Math.exp(-0.5 * (w1 / S) ** 2) * probW2(w1);
          }
        }
      }
      return total / (S * Math.sqrt(TAU));
    };
    // the picture on the excursion: a grid with jumps located by bisection
    const NG = this.coverageNG;
    const pic = (u) => fn(u);
    const us = [];
    const vs = [];
    for (let i = 0; i <= NG; i++) {
      const u = umin + ((umax - umin) * i) / NG;
      us.push(u);
      vs.push(pic(u));
    }
    // jump detection: a change far above the typical step of the grid;
    // kink detection (a relu): a change of slope far above the typical one,
    // located by bisection on the deviation from the chord, since most of
    // the count's mass sits at its extremes, where a kink often is
    const diffs = [];
    for (let i = 0; i < NG; i++) diffs.push(Math.abs(vs[i + 1] - vs[i]));
    const sorted = diffs.slice().sort((x, y) => x - y);
    const typical = sorted[Math.floor(NG * 0.5)];
    const scaleV = Math.max(...vs.map(Math.abs), 1e-300);
    const d2 = [];
    for (let i = 0; i + 1 < NG; i++) d2.push(Math.abs(vs[i + 2] - 2 * vs[i + 1] + vs[i]));
    const typical2 = d2.slice().sort((x, y) => x - y)[Math.floor(d2.length * 0.5)];
    const kinkAt = (a, b) => {
      // the point in [a, b] where the slope changes: keep the half whose
      // midpoint deviates more from its chord
      let lo = a;
      let hi = b;
      for (let it = 0; it < 50; it++) {
        const m = 0.5 * (lo + hi);
        const ml = 0.5 * (lo + m);
        const mr = 0.5 * (m + hi);
        const devL = Math.abs(pic(ml) - 0.5 * (pic(lo) + pic(m)));
        const devR = Math.abs(pic(mr) - 0.5 * (pic(m) + pic(hi)));
        if (devL >= devR) hi = m;
        else lo = m;
        if (hi - lo < 1e-12 * (Math.abs(a) + Math.abs(b) + 1e-300)) break;
      }
      return 0.5 * (lo + hi);
    };
    // a jump is a step far above both its neighbours' (a kink or a smooth
    // slope has neighbours of the same size; the median is no guide when
    // most of the excursion is flat); a kink is a change of slope far above
    // its neighbours', which shows in two consecutive second differences
    const nb = (i) => Math.max(i > 0 ? diffs[i - 1] : 0, i + 1 < NG ? diffs[i + 1] : 0);
    const nb2 = (i) => Math.max(i - 2 >= 0 ? d2[i - 2] : 0, i + 1 < d2.length ? d2[i + 1] : 0);
    const isJump = (i) => diffs[i] > 4 * nb(i) + 8 * typical + 1e-12 * scaleV + 1e-300;
    const isKink = (i) => i >= 1 && i < d2.length && d2[i - 1] + d2[i] > 4 * nb2(i) + 8 * typical2 + 1e-10 * scaleV + 1e-300;
    const nodes = [[us[0], vs[0]]];
    for (let i = 0; i < NG; i++) {
      if (isJump(i)) {
        // bisect the jump
        let lo = us[i];
        let hi = us[i + 1];
        const vlo = vs[i];
        for (let it = 0; it < 60; it++) {
          const mid = 0.5 * (lo + hi);
          if (Math.abs(pic(mid) - vlo) < 0.5 * diffs[i]) lo = mid;
          else hi = mid;
        }
        nodes.push([lo, pic(lo)]);
        nodes.push([hi, pic(hi)]);
      } else if (isKink(i) && !(i + 1 < NG && isJump(i + 1)) && !(i > 0 && isJump(i - 1))) {
        // a kink between us[i-1] and us[i+1]; locate it and add a node
        const k = kinkAt(us[i - 1], us[i + 1]);
        if (k > us[i] && k < us[i + 1]) nodes.push([k, pic(k)]);
        else if (k > us[i - 1] && k < us[i] && nodes.length && nodes[nodes.length - 1][0] < k) {
          // it lies in the previous segment: insert before the last node
          const last = nodes.pop();
          nodes.push([k, pic(k)]);
          nodes.push(last);
        }
      }
      nodes.push([us[i + 1], vs[i + 1]]);
    }
    nodes.sort((p, q) => p[0] - q[0]);
    // E p(xi) = sum over segments of (alpha + beta u) integrated against dF:
    // alpha (F(b) - F(a)) + beta (b F(b) - a F(a) - int_a^b F du), the
    // last by Simpson on F (smooth between the nodes)
    let total = 0;
    let Fa = Fof(nodes[0][0]);
    for (let i = 0; i + 1 < nodes.length; i++) {
      const [ua, va] = nodes[i];
      const [ub, vb] = nodes[i + 1];
      const Fb = Fof(ub);
      if (ub - ua < 1e-9 * span) {
        // a located jump: no length to speak of, and a chord across it
        // would have a slope of 1e16 and cancel catastrophically
        Fa = Fb;
        continue;
      }
      const beta = (vb - va) / (ub - ua);
      const alpha = va - beta * ua;
      let intF = 0;
      if (beta !== 0) {
        // int_a^b F du by adaptive Simpson: F has square-root singularities
        // at the count's extremes, where a linear picture's slope matters
        const simpson = (x0, f0, x2, f2, x1, f1) => ((x2 - x0) / 6) * (f0 + 4 * f1 + f2);
        const adapt = (x0, f0, x2, f2, x1, f1, whole, depth) => {
          const xl = 0.5 * (x0 + x1);
          const xr = 0.5 * (x1 + x2);
          const fl = Fof(xl);
          const fr = Fof(xr);
          const left = simpson(x0, f0, x1, f1, xl, fl);
          const right = simpson(x1, f1, x2, f2, xr, fr);
          if (depth >= 14 || Math.abs(left + right - whole) <= 1e-10 * Math.max(1, Math.abs(whole)) * (x2 - x0) / span * 96) return left + right + (left + right - whole) / 15;
          return adapt(x0, f0, x1, f1, xl, fl, left, depth + 1) + adapt(x1, f1, x2, f2, xr, fr, right, depth + 1);
        };
        const um = 0.5 * (ua + ub);
        const Fm = Fof(um);
        intF = adapt(ua, Fa, ub, Fb, um, Fm, simpson(ua, Fa, ub, Fb, um, Fm), 0);
      }
      total += alpha * (Fb - Fa) + beta * (ub * Fb - ua * Fa - intF);
      Fa = Fb;
    }
    this.stats.recipes += nodes.length;
    return total;
  }
  // an axis may be local (its count integrated by quadrature along its
  // gradient) when it is narrow and the rate dominates the curvature
  canBeLocal(axis) {
    return !this.isFrozen(axis) && this.axisSigma(axis) < this.localSigma;
  }
  harmonicsFor(axis) {
    return Math.min(this.maxK, Math.ceil(this.reach / (TAU * Math.max(this.axisSigma(axis), 1e-9))));
  }
  // harmonic ranges for a set of rate vectors (periods per pixel) that share
  // a term: the range of each is set by the slowest rate any multiple of it
  // can reach with the others' help, iterated since the others' ranges grow
  // too. Capped at maxK; the coefficient cut prunes the rest.
  effectiveKs(gs, hns = null) {
    const R0 = this.reach / (TAU * this.sig);
    let R = R0;
    const Kof = (r) => Math.min(this.maxK, Math.ceil(R / Math.max(r, 1e-9)));
    const K = gs.map((g) => Kof(Math.hypot(g[0], g[1])));
    const grow = () => {
      if (gs.length < 2) return;
      for (let it = 0; it < 6; it++) {
        let changed = false;
        for (let i = 0; i < gs.length; i++) {
          const others = [];
          for (let j = 0; j < gs.length; j++) if (j !== i && Math.hypot(gs[j][0], gs[j][1]) > 1e-12) others.push({ g: gs[j], K: K[j] });
          const Ki = Kof(Math.sqrt(relaxedRate2(gs[i], others)));
          if (Ki > K[i]) {
            K[i] = Ki;
            changed = true;
          }
        }
        if (!changed) break;
      }
    };
    grow();
    // curvature: where the recipes' Hessians can be large the multiplier
    // decays with a smaller effective variance, so the reach in rate grows
    // by sqrt(1 + S^2 lambda^2); one round, its growth capped
    if (hns) {
      const S = this.sig * this.sig;
      let lam = 0;
      for (let i = 0; i < gs.length; i++) lam += TAU * K[i] * hns[i];
      const f = Math.min(this.foldGrowth, Math.sqrt(1 + S * S * lam * lam));
      if (f > 1.01) {
        R = R0 * f;
        for (let i = 0; i < gs.length; i++) K[i] = Math.max(K[i], Kof(Math.hypot(gs[i][0], gs[i][1])));
        grow();
      }
    }
    return K;
  }
  // spectral norm of an axis's count Hessian (periods per pixel squared);
  // under a line condition the curvature along the line
  hessNorm(axis, cond) {
    const h = this.axisHess(axis);
    if (cond && cond.dim === 1) return Math.abs(h[0] * cond.e[0] * cond.e[0] + 2 * h[1] * cond.e[0] * cond.e[1] + h[2] * cond.e[1] * cond.e[1]);
    const tr = h[0] + h[2];
    const det = h[0] * h[2] - h[1] * h[1];
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    return Math.max(Math.abs(tr / 2 + disc), Math.abs(tr / 2 - disc));
  }
  // the count of an axis at pixel displacement m, in the axis's own units
  countAt(axis, m) {
    const j = axis.count;
    return j.v + j.gx * m[0] + j.gy * m[1] + 0.5 * (j.hxx * m[0] * m[0] + 2 * j.hxy * m[0] * m[1] + j.hyy * m[1] * m[1]);
  }
  // the value of a term at one point of the pixel (both local axes fixed)
  pointValue(ts, m, localCoords) {
    const coords = this.pointCoords(ts, m, localCoords);
    let total = 0;
    for (const t of ts) {
      const j = t.c.re;
      let v = j.v + j.gx * m[0] + j.gy * m[1] + 0.5 * (j.hxx * m[0] * m[0] + 2 * j.hxy * m[0] * m[1] + j.hyy * m[1] * m[1]);
      for (const f of t.f) {
        if (v === 0) break;
        if (f.kind === 'pic') v *= f.fn(axisCoordinate(f.axis, coords));
        else v *= f.fn(f.axes.map((a) => bareCoordinate(a, coords)), coords).v;
      }
      total += v;
    }
    this.stats.recipes++;
    return total;
  }
  prepareAxis(axis) {
    if (axis.kind === 'edge') {
      // the count's width across the pixel, curvature included (a step of a
      // count at its stationary point has no rate and a whole excursion)
      const c = axis.count;
      const s2 = this.sig * this.sig;
      const hf = this.curvedWidth ? c.hxx * c.hxx + 2 * c.hxy * c.hxy + c.hyy * c.hyy : 0;
      const s = Math.sqrt(s2 * c.gradNorm() * c.gradNorm() + 0.5 * s2 * s2 * hf);
      // the period must hold the whole argument across the pixel: the
      // smooth part's reach and the field's amplitude (bounded by the sum
      // of its coefficient magnitudes)
      let amp = 0;
      if (axis.field) for (const t of axis.field.terms) amp += Math.abs(t.c.re.v) + Math.abs(t.c.im.v);
      axis.edgePeriod = Math.max(20 * s + 4 * amp, 1e-6);
      axis.center = axis.count.v;
    }
  }
  // scale of an axis's coordinate: one for periodic axes, the period of
  // an edge axis (whose coordinate is the raw argument)
  axisScale(axis) {
    return axis.kind === 'edge' ? axis.edgePeriod : 1;
  }
  axisPhase(axis, m) {
    return axis.kind === 'edge' ? 0 : TAU * m * axis.count.v;
  }
  axisRate(axis) {
    const p = axis.kind === 'edge' ? axis.edgePeriod : 1;
    return [axis.count.gx / p, axis.count.gy / p];
  }
  axisHess(axis) {
    const p = axis.kind === 'edge' ? axis.edgePeriod : 1;
    return [axis.count.hxx / p, axis.count.hxy / p, axis.count.hyy / p];
  }
  // terms with the same factor structure (the same axes in the same
  // roles) share every decision and every node: they are evaluated as one
  // bundle, the point values summed
  expect(el) {
    let total = 0;
    const groups = new Map();
    for (const t0 of el.terms) {
      const t = this.resolveTerm(t0);
      const key = t.f.map((f) => (f.kind === 'pic' ? `p${f.axis.id}` : `c${f.axes.map((a) => a.id).join('.')}`)).sort().join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    for (const ts of groups.values()) {
      const t0 = DEBUG ? performance.now() : 0;
      const d0 = this.stats.dfts;
      const r0 = this.stats.recipes;
      const v = this.expectTerm(ts);
      if (DEBUG) {
        const t = ts[0];
        const axes = this.bundleAxes(ts).map((a) => `${a.label}#${a.id}${a.kind === 'edge' ? 'E' : ''}(s=${this.axisSigma(a).toExponential(1)}${a.field ? ',F' : ''})`);
        console.log(`    bundle[${ts.length}] ${t.f.map((f) => (f.kind === 'pic' ? `pic[${f.axis.label}#${f.axis.id}]` : `clo[${f.axes.map((a) => a.label + '#' + a.id).join(',')}]`)).join('*') || '1'} axes ${axes.join(' ')} -> ${v.toExponential(3)} dfts ${this.stats.dfts - d0} recipes ${this.stats.recipes - r0} ${(performance.now() - t0).toFixed(0)} ms`);
        if (this.stats.chainPairs) console.log(`      chain: pairs ${this.stats.chainPairs} live ${this.stats.chainLive} ns ${this.stats.chainNs} samples ${this.stats.chainSamples} (avg N ${((this.stats.chainSampleN || 0) / Math.max(1, this.stats.chainSamples || 1)).toFixed(0)}) coefs ${this.stats.chainCoefs} | set ${(this.stats.chainSetMs || 0).toFixed(0)} ms samples ${(this.stats.chainSampleMs || 0).toFixed(0)} ms coefs ${(this.stats.chainCoefMs || 0).toFixed(0)} ms`);
      }
      total += v;
    }
    return total;
  }
  bundleAxes(ts) {
    const set = new Map();
    for (const t of ts)
      for (const f of t.f) {
        if (f.kind === 'pic') collectAxis(f.axis, set);
        else for (const a of f.axes) collectAxis(a, set);
      }
    return [...set.values()];
  }
  // the coordinates of every axis of a bundle at pixel displacement m,
  // local values taking precedence
  pointCoords(ts, m, localCoords) {
    const coords = new Map(localCoords);
    coords.set(-1, m);
    for (const a of this.bundleAxes(ts)) if (!coords.has(a.id)) coords.set(a.id, this.countAt(a, m));
    return coords;
  }
  // every axis a term touches: pic axes, their fields' axes, closure axes
  termAxes(t) {
    const set = new Map();
    for (const f of t.f) {
      if (f.kind === 'pic') collectAxis(f.axis, set);
      else for (const a of f.axes) collectAxis(a, set);
    }
    return [...set.values()];
  }
  // factors on aliased axes rewritten onto their targets, same-axis
  // pictures multiplied
  resolveTerm(t) {
    if (!t.f.some((f) => (f.kind === 'pic' ? f.axis.alias : f.axes.some((a) => a.alias)))) return t;
    let out = [];
    for (const f of t.f) out = mulFactors(out, [resolveFactor(f)]);
    return { c: t.c, f: out };
  }
  expectTerm(ts) {
    this.stats.terms += ts.length;
    this._resCache = new Map();
    if (ts[0].f.length === 0) {
      let v = 0;
      for (const t of ts) {
        const j = t.c.re;
        v += j.v + 0.5 * this.sig * this.sig * (j.hxx + j.hyy);
      }
      return v;
    }
    let axes = this.bundleAxes(ts);
    for (const a of axes) this.prepareAxis(a);
    let t = ts[0];
    // a local axis whose only appearance is a picture constant over the
    // reach contributes that constant and is dropped (single terms)
    let factors = t.f;
    let coefRe = t.c.re;
    let coefIm = t.c.im;
    let changed = false;
    for (const a of ts.length === 1 ? axes : []) {
      if (this.axisSigma(a) >= this.localSigma) continue;
      const usedElsewhere = factors.some((f) => (f.kind === 'clo' && f.axes.includes(a)) || (f.kind === 'pic' && f.axis !== a && f.axis.field && f.axis.field.axes().includes(a)) || (f.kind === 'pic' && f.axis === a && f.axis.field));
      if (usedElsewhere) continue;
      const mine = factors.filter((f) => f.kind === 'pic' && f.axis === a);
      if (mine.length === 0) continue;
      // the count's whole excursion across the pixel, curvature included
      const sigA = this.axisSigma(a) * this.axisScale(a);
      const c0 = a.count.v;
      let vmin = Infinity;
      let vmax = -Infinity;
      for (let i = 0; i <= 24; i++) {
        const u = c0 - 6 * sigA + (12 * sigA * i) / 24;
        const v = mine.reduce((pr, f) => pr * f.fn(u), 1);
        vmin = Math.min(vmin, v);
        vmax = Math.max(vmax, v);
      }
      if (vmax - vmin < 1e-12) {
        coefRe = coefRe.scale(vmin);
        coefIm = coefIm.scale(vmin);
        factors = factors.filter((f) => !mine.includes(f));
        changed = true;
      }
    }
    if (changed) {
      t = { c: { re: coefRe, im: coefIm }, f: factors };
      if (factors.length === 0) {
        const j = t.c.re;
        return j.v + 0.5 * this.sig * this.sig * (j.hxx + j.hyy);
      }
      ts = [t];
      axes = this.bundleAxes(ts);
    }
    // axes whose count is narrow and mostly curvature (or does not move at
    // all) are frozen: their coordinate is a number, the count's mean over
    // the pixel. A stationary count that curves enough to be wide is not
    // frozen: its quadratic phase is integrated by the spectral path (the
    // reviewer's example, cos(2 pi t^2) under a pixel of sigma 1/2, is
    // 0.445, not 1).
    const frozen = axes.filter((a) => this.isFrozen(a));
    // hard pictures on a count that is mostly curvature are replaced, term
    // by term, by their expectation under the pushed-forward pixel, the
    // coverage of the quadratic count: a frozen coordinate would put the
    // whole pixel on one side of the edge, and the periodised series of a
    // step of a stationary count converges only as K^(-1/2). Edge axes
    // qualify by kind, periodic axes when their pictures jump within the
    // excursion (a smooth picture of a curved count is exact spectrally).
    // Axes a closure or a field reads keep their coordinate (the closure
    // needs a number), and so do axes of no width.
    {
      let any = false;
      let constant = 0;
      const ts2 = [];
      const curved = axes.filter((a) => this.axisSigma(a) >= 1e-9 && !this.rateDominates(a));
      for (const tj of ts) {
        let cr = tj.c.re;
        let ci = tj.c.im;
        let fs = tj.f;
        let ch = false;
        for (const a of curved) {
          const usedElsewhere = fs.some((f) => (f.kind === 'clo' && f.axes.includes(a)) || (f.kind === 'pic' && f.axis !== a && f.axis.field && f.axis.field.axes().includes(a)) || (f.kind === 'pic' && f.axis === a && f.axis.field));
          if (usedElsewhere) continue;
          const mine = fs.filter((f) => f.kind === 'pic' && f.axis === a);
          if (mine.length === 0) continue;
          const prod = (u) => mine.reduce((pr, f) => pr * f.fn(u), 1);
          if (a.kind !== 'edge' && !this.isFrozen(a) && !this.picturesJump(a, prod)) continue;
          // the coefficient jet is integrated with the mask, and becomes the
          // number E[c p]; the term's other factors then see a constant
          // coefficient (their correlation with the mask is the stated
          // approximation)
          const vRe = this.coverageExpect(a, prod, cr);
          const vIm = jetIsZero(ci) ? 0 : this.coverageExpect(a, prod, ci);
          cr = Jet.c(vRe);
          ci = Jet.c(vIm);
          fs = fs.filter((f) => !mine.includes(f));
          ch = true;
        }
        if (!ch) {
          ts2.push(tj);
          continue;
        }
        any = true;
        if (fs.length === 0) constant += cr.v + 0.5 * this.sig * this.sig * (cr.hxx + cr.hyy);
        else ts2.push({ c: { re: cr, im: ci }, f: fs });
      }
      // the factorless part is a number; the rest goes round again with
      // its coverage axes gone
      if (any) return constant + (ts2.length ? this.expectTerm(ts2) : 0);
    }
    // local axes: axes whose pixel-sigma is small in their own scale (an
    // edge with a field counts in units of the field's amplitude); those
    // without a field over another local axis go first, so that the second
    // axis's jumps can be located with the first one fixed
    const local = axes.filter((a) => this.canBeLocal(a));
    // an axis nearly parallel to a faster axis of the term is local too
    // while its own sigma is moderate: along their common direction the
    // spectral sum is a station family without end, and quadrature is cheap
    for (const a of axes) {
      if (local.includes(a) || this.isFrozen(a) || this.axisSigma(a) >= this.parallelSigma) continue;
      const ga = this.axisRate(a);
      const na = Math.hypot(ga[0], ga[1]);
      for (const o of axes) {
        if (o === a || this.isFrozen(o) || this.axisSigma(o) <= this.axisSigma(a)) continue;
        const go = this.axisRate(o);
        const no = Math.hypot(go[0], go[1]);
        if (Math.abs(ga[0] * go[1] - ga[1] * go[0]) / (na * no) < this.parallelSin) {
          local.push(a);
          break;
        }
      }
    }
    if (local.length === 0) {
      const base = new Map();
      for (const o of frozen) base.set(o.id, this.frozenValue(o));
      let v = 0;
      for (const tj of ts) v += this.spectral(tj, { dim: 2, sig: this.sig }, base);
      return v;
    }
    const localIds = new Set(local.map((a) => a.id));
    const fieldOnLocal = (a) => !!a.field && a.field.axes().some((x) => localIds.has(x.id));
    // straight edges only? then the cuts are exact and the quadrature plain
    const straight = ts.every((t) => t.f.every((f) => (f.kind === 'pic' ? !f.axis.field : f.axes.length === 1 && !f.axes[0].field)));
    local.sort((p, q) => (fieldOnLocal(p) ? 1 : 0) - (fieldOnLocal(q) ? 1 : 0));
    // quadrature over the local axes, at most two independent directions;
    // coordinates and rates in each axis's own units
    const rawRate = (o) => {
      const P = this.axisScale(o);
      const g = this.axisRate(o);
      return [g[0] * P, g[1] * P];
    };
    const a = local[0];
    const ga = rawRate(a);
    const na = Math.hypot(ga[0], ga[1]);
    const nhat = [ga[0] / na, ga[1] / na];
    const ehat = [-nhat[1], nhat[0]];
    // a second independent local axis?
    let b = null;
    for (let i = 1; i < local.length; i++) {
      const gb = rawRate(local[i]);
      const cr = Math.abs(ga[0] * gb[1] - ga[1] * gb[0]) / (na * Math.hypot(gb[0], gb[1]));
      if (cr > 0.2) {
        b = local[i];
        break;
      }
    }
    if (!b) {
      const sigA = this.axisSigmaLinear(a) * this.axisScale(a);
      // along the line every other axis has a rate; if any is slow there
      // (a picture that changes little along the line, or a second local
      // axis nearly parallel to the first) the line is integrated pointwise
      // by quadrature with its jumps located, otherwise spectrally
      // pointwise unless the fastest axis along the line runs more than
      // lineMaxPeriods periods across it: along a line every pair of axes
      // can cancel (rates are scalars), so the spectral sum is only short
      // when the line is far field for all of them
      let lineLocal = false;
      let rMax = 0;
      for (const o of axes) {
        if (o === a) continue;
        const g = this.axisRate(o);
        const gl = Math.abs(g[0] * ehat[0] + g[1] * ehat[1]);
        if (this.sig * gl < this.localSigma) lineLocal = true;
        else if (o.kind !== 'edge') rMax = Math.max(rMax, gl);
      }
      if (rMax * 12 * this.sig <= this.lineMaxPeriods) lineLocal = true;
      // the integral along the line at a value of the axis: pointwise
      // quadrature or the conditioned spectral sum, times the density
      const along = (ua) => {
        const da = (ua - a.count.v) / na; // screen displacement along nhat
        const m = [da * nhat[0], da * nhat[1]];
        const dens = Math.exp((-(ua - a.count.v) * (ua - a.count.v)) / (2 * sigA * sigA));
        if (dens < 1e-14) return [0, dens];
        let E = 0;
        if (lineLocal) E = this.lineQuadrature(ts, m, ehat, rMax);
        else {
          const coords = new Map();
          coords.set(-1, m);
          coords.set(a.id, ua);
          for (const o of local) if (o !== a) coords.set(o.id, this.countAt(o, m));
          for (const o of frozen) coords.set(o.id, this.countAt(o, m));
          for (const tj of ts) E += this.spectral(tj, { dim: 1, sig: this.sig, m, e: ehat }, coords);
        }
        return [dens * E, dens];
      };
      // the axis's own jumps on the line through the centre seed the cuts
      const centreCoords = (ua) => {
        const da = (ua - a.count.v) / na;
        const m = [da * nhat[0], da * nhat[1]];
        const coords = new Map();
        coords.set(-1, m);
        coords.set(a.id, ua);
        for (const o of axes) if (o !== a) coords.set(o.id, this.countAt(o, m));
        return coords;
      };
      this.localNodes(ts, a, centreCoords);
      const seeds = this._lastJumps || [];
      if (DEBUG) console.log(`      1-local a=${a.label}#${a.id} (sig ${sigA.toExponential(2)}) ${lineLocal ? 'line quadrature' : 'spectral line'} seeds ${seeds.length}${straight ? ' straight' : ''}`);
      return this.adaptiveAlong(a, sigA, along, seeds, straight);
    }
    const gb = rawRate(b);
    const det = ga[0] * gb[1] - ga[1] * gb[0];
    // the point where the two counts take the values (ua, ub): the inverse
    // of the matrix whose rows are the two gradients
    const pointOf = (ua, ub) => {
      const da = ua - a.count.v;
      const db = ub - b.count.v;
      return [(gb[1] * da - ga[1] * db) / det, (-gb[0] * da + ga[0] * db) / det];
    };
    const coordsAt = (ua, ub) => {
      const m = pointOf(ua, ub);
      const coords = new Map();
      coords.set(-1, m);
      coords.set(a.id, ua);
      coords.set(b.id, ub);
      for (const o of axes) if (o !== a && o !== b) coords.set(o.id, this.countAt(o, m));
      return coords;
    };
    // joint density of (c_a, c_b) ~ N(., sig^2 G G^T)
    const S = this.sig * this.sig;
    const saa = S * (ga[0] * ga[0] + ga[1] * ga[1]);
    const sab = S * (ga[0] * gb[0] + ga[1] * gb[1]);
    const sbb = S * (gb[0] * gb[0] + gb[1] * gb[1]);
    const dS = saa * sbb - sab * sab;
    // the integral along the second axis at a value of the first, with the
    // second axis's jumps located there: [value, mass]
    const along = (ua) => {
      const nodesB = this.localNodes(ts, b, (ub) => coordsAt(ua, ub));
      let F = 0;
      let W = 0;
      const da = ua - a.count.v;
      for (const [ub, wb0] of nodesB) {
        const db = ub - b.count.v;
        const q = (sbb * da * da - 2 * sab * da * db + saa * db * db) / dS;
        const w = wb0 * Math.exp(-0.5 * q);
        if (w < 1e-16) continue;
        W += w;
        F += w * this.pointValue(ts, pointOf(ua, ub), coordsAt(ua, ub));
      }
      return [F, W];
    };
    const sigA0 = this.axisSigma(a) * this.axisScale(a);
    // with straight edges the first axis's own crossings are its cuts
    let seeds = [];
    if (straight) {
      this.localNodes(ts, a, (ua) => coordsAt(ua, b.count.v));
      seeds = this._lastJumps || [];
    }
    if (DEBUG) console.log(`      2-local a=${a.label}#${a.id} (sig ${sigA0.toExponential(2)}) b=${b.label}#${b.id}${straight ? ' straight' : ''}`);
    return this.adaptiveAlong(a, sigA0, along, seeds, straight);
  }
  // E[term] as the integral along a local axis of an integrated function:
  // along(u) returns [F, W], the integral of value times density and of the
  // density over everything else at u. Nodes: the function's own jumps
  // (an edge along the other direction) located by bisection on a scan,
  // extra cuts, Gauss-Legendre panels, then refinement where halving a
  // panel changes its sum.
  adaptiveAlong(a, sigA0, along, extraCuts, quick = false) {
    const lo = a.count.v - 6 * sigA0;
    const hi = a.count.v + 6 * sigA0;
    const NA = quick ? 0 : 24;
    const ratio = (r) => (r[1] > 1e-300 ? r[0] / r[1] : 0);
    const scan = [];
    for (let i = 0; i <= NA; i++) scan.push(along(lo + ((hi - lo) * i) / NA));
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let i = 0; i <= NA; i++) {
      const v = ratio(scan[i]);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
    const cuts = [lo, hi, ...extraCuts.filter((u) => u > lo && u < hi)];
    for (let i = 0; i < NA; i++) {
      const u0 = lo + ((hi - lo) * i) / NA;
      const u1 = lo + ((hi - lo) * (i + 1)) / NA;
      const d = Math.abs(ratio(scan[i + 1]) - ratio(scan[i]));
      if (d > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
        let x0 = u0;
        let x1 = u1;
        const f0 = ratio(scan[i]);
        for (let it = 0; it < 20; it++) {
          const xm = (x0 + x1) / 2;
          if (Math.abs(ratio(along(xm)) - f0) > d / 2) x1 = xm;
          else x0 = xm;
        }
        // a steep slope shrinks with the bracket, a jump does not; the
        // refinement takes care of slopes
        if (Math.abs(ratio(along(x1)) - ratio(along(x0))) < 0.5 * d) continue;
        cuts.push((x0 + x1) / 2);
      }
    }
    cuts.sort((p, q) => p - q);
    const gl = (pa, pb) => {
      const half = (pb - pa) / 2;
      const mid = (pa + pb) / 2;
      let F = 0;
      let W = 0;
      for (const [node, wt] of GL8) {
        const r = along(mid + half * node);
        F += wt * half * r[0];
        W += wt * half * r[1];
      }
      return [F, W];
    };
    let massEst = 0;
    const panels0 = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const pa = cuts[i];
      const pb = cuts[i + 1];
      if (pb - pa < 1e-15) continue;
      const n = Math.max(1, Math.ceil((pb - pa) / (this.localPanel * sigA0)));
      for (let q = 0; q < n; q++) {
        const qa = pa + ((pb - pa) * q) / n;
        const qb = pa + ((pb - pa) * (q + 1)) / n;
        const r = gl(qa, qb);
        panels0.push([qa, qb, r]);
        massEst += r[1];
      }
    }
    const tol = 1e-5 * Math.max(massEst, 1e-300);
    let Ftot = 0;
    let Wtot = 0;
    let refined = 0;
    if (quick) {
      for (const [, , r] of panels0) {
        Ftot += r[0];
        Wtot += r[1];
      }
      this.stats.localNodes += 1;
      return Wtot > 0 ? Ftot / Wtot : 0;
    }
    const refine = (qa, qb, r, depth) => {
      const mid = (qa + qb) / 2;
      const r1 = gl(qa, mid);
      const r2 = gl(mid, qb);
      const diff = Math.abs(r1[0] + r2[0] - r[0]);
      if (diff > tol && depth < 6) {
        refined++;
        refine(qa, mid, r1, depth + 1);
        refine(mid, qb, r2, depth + 1);
      } else {
        Ftot += r1[0] + r2[0];
        Wtot += r1[1] + r2[1];
      }
    };
    for (const [qa, qb, r] of panels0) refine(qa, qb, r, 0);
    if (DEBUG) console.log(`        adaptive: cuts ${cuts.length - 2} panels ${panels0.length} refined ${refined}`);
    this.stats.localNodes += 1;
    return Wtot > 0 ? Ftot / Wtot : 0;
  }
  // E[term] along the line z = m + s e, s ~ N(0, sig^2): Gauss-Legendre
  // panels no wider than a quarter period of the fastest axis along the
  // line, cut at the jumps of the term's value along it
  lineQuadrature(ts, m, e, rMax) {
    const sig = this.sig;
    const lo = -6 * sig;
    const hi = 6 * sig;
    const at = (u) => this.pointValue(ts, [m[0] + u * e[0], m[1] + u * e[1]], new Map());
    const cuts = this.pathCuts(ts, (u) => [m[0] + u * e[0], m[1] + u * e[1]], lo, hi, e, at);
    const width = Math.min(this.localPanel * sig, rMax > 0 ? 0.5 / rMax : Infinity);
    let acc = 0;
    let wsum = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 1e-15) continue;
      const panels = Math.max(1, Math.ceil((b - a) / width));
      for (let q = 0; q < panels; q++) {
        const pa = a + ((b - a) * q) / panels;
        const pb = a + ((b - a) * (q + 1)) / panels;
        const half = (pb - pa) / 2;
        const mid = (pa + pb) / 2;
        for (const [node, wt] of GL8) {
          const u = mid + half * node;
          const w = wt * half * Math.exp(-(u * u) / (2 * sig * sig));
          wsum += w;
          acc += w * at(u);
        }
      }
    }
    this.stats.localNodes += 1;
    return acc / wsum;
  }
  // the cuts of a bundle along a path z(u), u in [lo, hi]: where the
  // shifted coordinate of an axis with pictures crosses one of their jump
  // levels, and the jumps of closures over several axes by a value scan
  pathCuts(ts, pathZ, lo, hi, e, at) {
    const items = [];
    const perAxis = new Map();
    let needScan = false;
    for (const t of ts)
      for (const f of t.f) {
        if (f.kind === 'pic') {
          const l = factorLevels(f, f.axis);
          if (!perAxis.has(f.axis.id)) perAxis.set(f.axis.id, { axis: f.axis, levels: new Set() });
          for (const v of l) perAxis.get(f.axis.id).levels.add(v);
        } else if (f.axes.length === 1) {
          const l = factorLevels(f, f.axes[0]);
          if (!perAxis.has(f.axes[0].id)) perAxis.set(f.axes[0].id, { axis: f.axes[0], levels: new Set() });
          for (const v of l) perAxis.get(f.axes[0].id).levels.add(v);
        } else needScan = true;
      }
    // the fastest rate along the path among all axes sets the sampling
    let rMaxAll = 0;
    if (e)
      for (const a of this.bundleAxes(ts)) {
        const g = this.axisRate(a);
        rMaxAll = Math.max(rMaxAll, Math.abs(g[0] * e[0] + g[1] * e[1]));
      }
    const samples = Math.max(12, Math.ceil(4 * rMaxAll * (hi - lo)) + 4);
    for (const { axis, levels } of perAxis.values()) {
      if (levels.size === 0) continue;
      items.push({
        coord: (u) => axisCoordinate(axis, this.pointCoords(ts, pathZ(u), new Map())),
        levels: [...levels],
        periodic: axis.kind !== 'edge',
        samples,
      });
    }
    let cuts = cutsOnPath(items, lo, hi);
    if (needScan) cuts = cuts.concat(scanJumps(at, lo, hi));
    return [lo, ...cuts.filter((u) => u > lo && u < hi), hi].sort((p, q) => p - q);
  }
  // quadrature nodes along a local axis: [u, weight]; the weights carry the
  // Gaussian density normalised to one when the axis is integrated alone
  // (nodes for a second axis have the plain Gauss-Legendre weights and the
  // joint density is applied by the caller)
  localNodes(ts, axis, coordsAt, extraCuts = []) {
    const sigA = this.axisSigma(axis) * this.axisScale(axis);
    const c0 = axis.count.v;
    const lo = c0 - 6 * sigA;
    const hi = c0 + 6 * sigA;
    // the pictures of this axis in the bundle jump where its shifted
    // coordinate crosses their levels; with a coordinate callback (every
    // other axis a number once this one is) the field is included and
    // closures over several axes are scanned for jumps
    const levels = new Set();
    const multi = [];
    for (const t of ts)
      for (const f of t.f) {
        if (f.kind === 'pic' && f.axis === axis) {
          if (!f.axis.field || coordsAt) for (const v of factorLevels(f, axis)) levels.add(v);
        } else if (f.kind === 'clo' && f.axes.includes(axis)) {
          if (f.axes.length === 1 && !axis.field) for (const v of factorLevels(f, axis)) levels.add(v);
          else if (coordsAt) multi.push(f);
        }
      }
    let jumps = [];
    if (levels.size) {
      const field = axis.field;
      const coord =
        field && coordsAt
          ? (u) => {
              const cm = coordsAt(u);
              const j = evalElement(field, cm);
              const d = cm.get(-1);
              return u + (d ? jetAt(j, d) : j.v);
            }
          : (u) => u;
      // sampling follows the field's variation along the axis
      let samples = 12;
      if (field && coordsAt) samples = 24;
      jumps = cutsOnPath([{ coord, levels: [...levels], periodic: axis.kind !== 'edge', samples }], lo, hi);
    }
    if (multi.length) {
      const at = (u) => {
        const cm = coordsAt(u);
        let v = 1;
        for (const f of multi) v *= f.fn(f.axes.map((x) => bareCoordinate(x, cm)), cm).v;
        return v;
      };
      jumps = jumps.concat(scanJumps(at, lo, hi, 48));
    }
    this._lastJumps = jumps;
    const cuts = [lo, ...jumps, ...extraCuts.filter((u) => u > lo && u < hi), hi].sort((p, q) => p - q);
    const nodes = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 1e-15) continue;
      const pw = coordsAt && this.localPanelB ? this.localPanelB : this.localPanel;
      const panels = Math.max(1, Math.ceil((b - a) / (pw * sigA)));
      for (let q = 0; q < panels; q++) {
        const pa = a + ((b - a) * q) / panels;
        const pb = a + ((b - a) * (q + 1)) / panels;
        const half = (pb - pa) / 2;
        const mid = (pa + pb) / 2;
        for (const [node, wt] of GL8) nodes.push([mid + half * node, wt * half]);
      }
    }
    this.stats.localNodes += nodes.length;
    return nodes;
  }
  // the spectral part of a term under a (possibly conditioned) Gaussian, with
  // the local axes' coordinates fixed
  spectral(t, cond, localCoords) {
    this._resCache = new Map();
    // pics on spectral axes; pics on local axes become numbers; pics on
    // axes some field or closure uses fold into the closures
    let coefRe = t.c.re;
    let coefIm = t.c.im;
    let pics = [];
    const clos = [];
    const used = new Set();
    for (const f of t.f) {
      if (f.kind === 'pic') {
        if (f.axis.field) for (const a of f.axis.field.axes()) used.add(a.id);
      } else for (const a of f.axes) used.add(a.id);
    }
    for (const f of t.f) {
      if (f.kind === 'clo') clos.push(f);
      else if (localCoords.has(f.axis.id)) {
        if (!f.axis.field) {
          const v = f.fn(localCoords.get(f.axis.id));
          coefRe = coefRe.scale(v);
          coefIm = coefIm.scale(v);
        } else {
          // the picture of the shifted coordinate u_local + G: a closure over
          // the field's axes that are not local, a number if all are
          const fieldAxes = f.axis.field.axes().filter((a) => !localCoords.has(a.id));
          const u0 = localCoords.get(f.axis.id);
          const field = f.axis.field;
          const fn = f.fn;
          if (fieldAxes.length === 0) {
            const v = fn(u0 + evalElement(field, localCoords).v);
            coefRe = coefRe.scale(v);
            coefIm = coefIm.scale(v);
          } else {
            clos.push(
              cloFactor(
                fieldAxes,
                (cs) => {
                  const m = new Map(localCoords);
                  fieldAxes.forEach((a, i) => m.set(a.id, cs[i]));
                  return Jet.c(fn(u0 + evalElement(field, m).v));
                },
                `${f.sig}@${num(u0)}`,
              ),
            );
          }
        }
      } else if (used.has(f.axis.id) && !f.axis.field) {
        const axes = [f.axis];
        clos.push(cloFactor(axes, factorAsClosure(f, axes), f.sig));
      } else pics.push(f);
    }
    const c = { re: coefRe, im: coefIm };
    // a point condition (two local axes fixed): everything is evaluated at
    // the point, no series
    if (cond.dim === 0) return this.pointValue([t], cond.m, localCoords);
    // residual axes: spectral field axes and closure axes not fixed locally
    const residualMap = new Map();
    for (const p of pics) if (p.axis.field) for (const a of p.axis.field.axes()) if (!localCoords.has(a.id)) residualMap.set(a.id, a);
    for (const cl of clos) for (const a of cl.axes) if (!localCoords.has(a.id)) residualMap.set(a.id, a);
    const residual = [...residualMap.values()];
    const n = pics.length;
    const grads = pics.map((p) => this.axisRate(p.axis));
    const resGrads = residual.map((a) => this.axisRate(a));
    const resHess = residual.map((a) => this.axisHess(a));
    // harmonic ranges: each axis's range must allow the other axes of the
    // term to cancel its rate (a station between axes needs the harmonics
    // whose combined rate is slow, not the ones slow on their own); under a
    // line condition only the rates along the line count
    const proj = (g) => (cond.dim === 1 ? [g[0] * cond.e[0] + g[1] * cond.e[1], 0] : g);
    const Ks = this.effectiveKs(
      [...grads, ...resGrads].map(proj),
      [...pics.map((p) => this.hessNorm(p.axis, cond)), ...residual.map((a) => this.hessNorm(a, cond))],
    ).map((K) => (cond.dim === 1 ? Math.min(K, this.maxKline) : K));
    const picCoef = pics.map((p, i) => {
      const K = roundK(Ks[i]);
      const axis = p.axis;
      let fn = p.fn;
      if (axis.kind === 'edge') {
        const P = axis.edgePeriod;
        const c0 = axis.center;
        fn = (u) => p.fn(c0 + (u - Math.round(u)) * P);
      }
      const coef = axis.kind === 'edge' ? fourier1(fn, K) : fourierPic(p, K);
      this.stats.dfts++;
      this.stats.maxK = Math.max(this.stats.maxK || 0, K);
      return { p, K, coef };
    });
    // two residual axes are transformed jointly; their ranges stay the plain
    // ones (a station through a two-axis closure is not yet followed)
    const resK = residual.map((a, j) => (residual.length === 2 ? Math.min(this.maxK2, Ks[n + j]) : Ks[n + j]));
    const S = this.sig * this.sig;
    const lnCut = Math.log(this.cut);
    const freedom = [];
    for (let i = 0; i < n; i++) freedom.push({ g: proj(grads[i]).map((v) => TAU * v), K: picCoef[i].K, hn: TAU * this.hessNorm(pics[i].axis, cond) });
    for (let j = 0; j < residual.length; j++) freedom.push({ g: proj(resGrads[j]).map((v) => TAU * v), K: resK[j], hn: TAU * this.hessNorm(residual[j], cond) });
    // curvature budget of the freedoms from level i on: the largest
    // eigenvalue of the phase Hessian any completion can reach
    const lamRest = new Array(freedom.length + 1).fill(0);
    for (let i = freedom.length - 1; i >= 0; i--) lamRest[i] = lamRest[i + 1] + freedom[i].K * freedom[i].hn;
    // under a line condition only the component along e matters for the weight
    const rate2 = (x, y) => (cond.dim === 2 ? x * x + y * y : cond.dim === 1 ? (x * cond.e[0] + y * cond.e[1]) ** 2 : 0);
    const minRate2 = (bx, by, from) => {
      const dirs = freedom.slice(from);
      if (dirs.length === 0) return rate2(bx, by);
      const x = cond.dim === 1 ? [bx * cond.e[0] + by * cond.e[1], 0] : [bx, by];
      return pruneRate2(x, dirs);
    };
    const ks = new Array(n).fill(0);
    let acc = 0;
    let visited = 0;
    const self = this;
    const visit = (i, bx, by, logCoef, lam) => {
      if (i === n) {
        visited++;
        acc += self.residualSum(c, picCoef, ks, bx, by, logCoef, residual, resGrads, resHess, resK, clos, cond, localCoords);
        return;
      }
      const { K, coef } = picCoef[i];
      const g = grads[i];
      const hn = freedom[i].hn;
      for (let k = -K; k <= K; k++) {
        const cr = coef.re[K + k];
        const ci = coef.im[K + k];
        const mag = Math.hypot(cr, ci);
        if (mag < 1e-12) continue;
        const nbx = bx + TAU * k * g[0];
        const nby = by + TAU * k * g[1];
        const lc = logCoef + Math.log(mag);
        // the multiplier decays in the rate with an effective variance
        // S/(1 + S^2 lambda^2), lambda the curvature any completion can reach
        const lamK = lam + Math.abs(k) * hn + lamRest[i + 1];
        const Seff = S / (1 + S * S * lamK * lamK);
        const e = 0.5 * Seff * minRate2(nbx, nby, i + 1);
        if (-e + lc < lnCut) continue;
        ks[i] = k;
        visit(i + 1, nbx, nby, lc, lam + Math.abs(k) * hn);
        if (visited > self.maxRecipes) return;
      }
    };
    visit(0, 0, 0, 0, 0);
    if (visited > this.maxRecipes) this.stats.overflow++;
    return acc;
  }
  // Fourier coefficients of the residual closure of one axis. The field
  // exponential e^{2 pi i sum k G} is a product of powers of e^{2 pi i G} per
  // field, so the fields are sampled once per (term, axis) and raised to the
  // harmonic combination at hand; the closures are sampled once too.
  // Fourier coefficients of the residual closure of one axis, over a node
  // set: uniform when the closures are smooth, Gauss-Legendre pieces between
  // located jumps otherwise. The field exponential e^{2 pi i sum k G} is a
  // product of powers per field, so the fields and closures are sampled once
  // per node set and combined per harmonic combination. The node count
  // follows the exponential's bandwidth, sum |k| max|2 pi G| plus a margin.
  // the node set of a residual axis for given field harmonics (jump-aware
  // when closures jump), with its field and closure samples; the range K is
  // capped at the field exponential's bandwidth
  residualSetFor(K, axis, fields, clos, localCoords) {
    const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
    const wrap = axis.kind === 'edge' ? (u) => axis.center + (u - Math.round(u)) * per : (u) => u;
    if (!this._resCache) this._resCache = new Map();
    const baseKey = `${axis.id}|${fields.map((f) => (f.elem ? `e${f.tag}` : `a${f.axis.id}`)).join(',')}|${clos.length}`;
    let base = this._resCache.get(baseKey);
    if (!base) {
      // field amplitudes from a coarse scan, and closure jumps
      const M0 = 128;
      const amp = fields.map(() => 0);
      const cloVals = new Float64Array(M0 + 1);
      let cmin = Infinity;
      let cmax = -Infinity;
      for (let i = 0; i <= M0; i++) {
        const m = new Map(localCoords);
        m.set(axis.id, wrap(i / M0));
        fields.forEach(({ axis: fa, elem }, fi) => {
          const p = fa.kind === 'edge' ? fa.edgePeriod : 1;
          amp[fi] = Math.max(amp[fi], Math.abs((TAU * evalElement(elem || fa.field, m).v) / p));
        });
        let v = 1;
        for (const cl of clos) {
          const cs2 = cl.axes.map((a) => (localCoords.has(a.id) ? localCoords.get(a.id) : wrap(i / M0)));
          v *= cl.fn(cs2).v;
        }
        cloVals[i] = v;
        cmin = Math.min(cmin, v);
        cmax = Math.max(cmax, v);
      }
      // is each field one sinusoid of the axis? then its exponential's
      // coefficients obey the Bessel bound (A/2)^n / n!, used for pruning
      const fieldVals = fields.map(({ axis: fa, elem }) => {
        const p = fa.kind === 'edge' ? fa.edgePeriod : 1;
        const vals = new Float64Array(M0);
        for (let i = 0; i < M0; i++) {
          const m = new Map(localCoords);
          m.set(axis.id, wrap(i / M0));
          vals[i] = (TAU * evalElement(elem || fa.field, m).v) / p;
        }
        return vals;
      });
      const sinus = fieldVals.map((vals) => {
        let a1 = 0;
        let rest = 0;
        for (let j = 1; j <= 8; j++) {
          let re = 0;
          let im = 0;
          for (let i = 0; i < M0; i++) {
            re += vals[i] * Math.cos((TAU * j * i) / M0);
            im -= vals[i] * Math.sin((TAU * j * i) / M0);
          }
          const a = (2 * Math.hypot(re, im)) / M0;
          if (j === 1) a1 = a;
          else rest += a;
        }
        return rest < 1e-3 * a1 + 1e-12 ? a1 : -1;
      });
      const jumps = [];
      for (let i = 0; i < M0; i++) {
        const d = Math.abs(cloVals[i + 1] - cloVals[i]);
        if (d > 0.25 * Math.max(cmax - cmin, 1e-12) + 1e-12) {
          let x0 = i / M0;
          let x1 = (i + 1) / M0;
          const f0 = cloVals[i];
          const probe = (u) => {
            const m = new Map(localCoords);
            let v = 1;
            for (const cl of clos) {
              const cs2 = cl.axes.map((a) => (localCoords.has(a.id) ? localCoords.get(a.id) : wrap(u)));
              v *= cl.fn(cs2).v;
            }
            void m;
            return v;
          };
          for (let it = 0; it < 40; it++) {
            const xm = (x0 + x1) / 2;
            if (Math.abs(probe(xm) - f0) > d / 2) x1 = xm;
            else x0 = xm;
          }
          jumps.push((x0 + x1) / 2);
        }
      }
      // the closures' own harmonic magnitudes (no jumps: their series
      // converges and a Bessel bound convolves with it); with jumps, none
      let cloHarm = null;
      if (jumps.length === 0 && clos.length > 0) {
        cloHarm = new Float64Array(33);
        for (let j = -16; j <= 16; j++) {
          let re = 0;
          let im = 0;
          for (let i = 0; i < M0; i++) {
            re += cloVals[i] * Math.cos((TAU * j * i) / M0);
            im -= cloVals[i] * Math.sin((TAU * j * i) / M0);
          }
          cloHarm[j + 16] = Math.hypot(re, im) / M0;
        }
      } else if (clos.length === 0) {
        cloHarm = new Float64Array(33);
        cloHarm[16] = 1;
      }
      base = { amp, jumps, sinus, cloHarm, sets: new Map() };
      this._resCache.set(baseKey, base);
    }
    // bandwidth for these harmonics; with no closure on the axis the field
    // exponential's own bandwidth caps the range
    let bwF = 0;
    fields.forEach(({ k }, fi) => {
      bwF += Math.abs(k) * base.amp[fi] + 4;
    });
    // closures on the axis add their own bandwidth: taken as twice the
    // axis's plain range plus a margin
    K = Math.min(K, Math.ceil(bwF) + (clos.length ? 2 * this.harmonicsFor(axis) + 8 : 0));
    const bw = K + 4 + bwF;
    let M = 128;
    while (M < 2 * bw + 2) M *= 2;
    // node set for this M (jump-aware if the closures jump)
    let set = base.sets.get(M);
    if (!set) {
      const nodes = [];
      if (base.jumps.length === 0) {
        for (let i = 0; i < M; i++) nodes.push([i / M, 1 / M]);
      } else {
        const cuts = [...base.jumps];
        const Kn = Math.max(K, Math.ceil(bw));
        for (let i = 0; i < cuts.length; i++) {
          const a = cuts[i];
          const b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 1;
          const len = b - a;
          if (len < 1e-12) continue;
          const panels = Math.max(1, Math.ceil(len * (Kn / 3 + 1)));
          for (let q = 0; q < panels; q++) {
            const pa = a + (len * q) / panels;
            const pb = a + (len * (q + 1)) / panels;
            const half = (pb - pa) / 2;
            const mid = (pa + pb) / 2;
            for (const [node, wt] of GL8) nodes.push([mid + half * node, wt * half]);
          }
        }
      }
      // samples at the nodes
      const fieldSamples = fields.map(({ axis: fa, elem }) =>
        nodes.map(([u]) => {
          const m = new Map(localCoords);
          m.set(axis.id, wrap(u));
          const p = fa.kind === 'edge' ? fa.edgePeriod : 1;
          return (TAU * evalElement(elem || fa.field, m).v) / p;
        }),
      );
      const cloSamples = nodes.map(([u]) => {
        let j = J1;
        for (const cl of clos) {
          const cs2 = cl.axes.map((a) => (localCoords.has(a.id) ? localCoords.get(a.id) : wrap(u)));
          j = j.mul(cl.fn(cs2));
        }
        return j;
      });
      const ex = nodes.map(([u]) => [Math.cos(-TAU * u), Math.sin(-TAU * u)]);
      set = { nodes, fieldSamples, cloSamples, ex };
      base.sets.set(M, set);
    }
    // the Bessel bound's amplitude for these harmonics, or -1 if any
    // field is not one sinusoid
    let bessel = 0;
    fields.forEach(({ k }, fi) => {
      if (bessel < 0) return;
      if (base.sinus[fi] < 0) bessel = -1;
      else bessel += Math.abs(k) * base.sinus[fi];
    });
    return { set, K, bessel, cloHarm: base.cloHarm };
  }
  residualCoef1(resFn, K0, axis, fields, clos, localCoords) {
    const { set, K } = this.residualSetFor(K0, axis, fields, clos, localCoords);
    const { nodes, fieldSamples, ex } = set;
    const N = nodes.length;
    if (clos.length === 0) {
      // scalar samples: a plain DFT on numbers, wrapped as constant jets
      const fr = new Float64Array(N);
      const fi2 = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        let ph = 0;
        fields.forEach(({ k }, fi) => {
          ph += k * fieldSamples[fi][i];
        });
        fr[i] = nodes[i][1] * Math.cos(ph);
        fi2[i] = nodes[i][1] * Math.sin(ph);
      }
      const pr = new Float64Array(N);
      const pi = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const ang = TAU * K * nodes[i][0];
        pr[i] = Math.cos(ang);
        pi[i] = Math.sin(ang);
      }
      const re = [];
      const im = [];
      for (let m = -K; m <= K; m++) {
        let aR = 0;
        let aI = 0;
        for (let i = 0; i < N; i++) {
          aR += fr[i] * pr[i] - fi2[i] * pi[i];
          aI += fr[i] * pi[i] + fi2[i] * pr[i];
          const nr = pr[i] * ex[i][0] - pi[i] * ex[i][1];
          pi[i] = pr[i] * ex[i][1] + pi[i] * ex[i][0];
          pr[i] = nr;
        }
        re.push(Jet.c(aR));
        im.push(Jet.c(aI));
      }
      return { re, im, K };
    }
    const { SR, SI } = this.residualSamples(set, fields, N);
    const re = [];
    const im = [];
    for (let m = -K; m <= K; m++) {
      const [a, b] = residualCoefAt(nodes, SR, SI, N, m);
      re.push(a);
      im.push(b);
    }
    return { re, im, K };
  }
  // the weighted, phased, jet-valued samples of a node set for given field
  // harmonics: six components per node
  residualSamples(set, fields, N) {
    const { nodes, fieldSamples, cloSamples } = set;
    const key = fields.map((f) => f.k).join(',');
    if (!set.samples) set.samples = new Map();
    const hit = set.samples.get(key);
    if (hit) return hit;
    const SR = new Float64Array(6 * N);
    const SI = new Float64Array(6 * N);
    for (let i = 0; i < N; i++) {
      let ph = 0;
      fields.forEach(({ k }, fi) => {
        ph += k * fieldSamples[fi][i];
      });
      const j = cloSamples[i];
      const w = nodes[i][1];
      const c0 = w * Math.cos(ph);
      const s0 = w * Math.sin(ph);
      const o = 6 * i;
      SR[o] = j.v * c0;
      SR[o + 1] = j.gx * c0;
      SR[o + 2] = j.gy * c0;
      SR[o + 3] = j.hxx * c0;
      SR[o + 4] = j.hxy * c0;
      SR[o + 5] = j.hyy * c0;
      SI[o] = j.v * s0;
      SI[o + 1] = j.gx * s0;
      SI[o + 2] = j.gy * s0;
      SI[o + 3] = j.hxx * s0;
      SI[o + 4] = j.hxy * s0;
      SI[o + 5] = j.hyy * s0;
    }
    const out = { SR, SI };
    if (set.samples.size > 4096) set.samples.clear();
    set.samples.set(key, out);
    return out;
  }
  // Two residual axes X and Y where X's field is over Y and the pictures'
  // fields split into a part on X and a part on Y (no term mixing them),
  // closures on Y only. With phi the shifted coordinate of X, the field
  // exponential is a product, and the transform over (X, Y) at harmonics
  // (m, n) is A(m) B_m(n): A the transform over phi of the X-part, B_m the
  // transform over Y of the Y-part times X's field at harmonic m and the
  // closures. Returns null when the structure is not this.
  chainResidual(c, cr, ci, phi0, bx, by, q00, q01, q11, logCoef, residual, resGrads, resHess, resK, fields, clos, cond, localCoords) {
    const lnCut = Math.log(this.cut);
    let ix = -1;
    for (let i = 0; i < 2; i++) {
      const a = residual[i];
      const o = residual[1 - i];
      if (a.field && a.kind !== 'edge' && a.field.axes().every((z) => z.id === o.id || localCoords.has(z.id)) && (!o.field || o.field.axes().every((z) => localCoords.has(z.id)))) ix = i;
    }
    const why = (r) => {
      if (DEBUG) console.log(`      chain rejected: ${r} residual [${residual.map((a) => `${a.label}#${a.id}${a.field ? '(F:' + a.field.axes().map((z) => z.label + '#' + z.id).join(',') + ')' : ''}`).join(', ')}] fields [${fields.map((f) => `${f.axis.label}#${f.axis.id}(F:${f.axis.field.axes().map((z) => z.label + '#' + z.id).join(',')})`).join(', ')}] clos [${clos.map((cl) => cl.axes.map((a) => a.label + '#' + a.id).join(',')).join(' | ')}]`);
      return null;
    };
    if (ix < 0) return why('no chain head');
    const X = residual[ix];
    const Y = residual[1 - ix];
    if (clos.some((cl) => cl.axes.some((a) => a.id === X.id))) return why('closure on X');
    // split every field element into an X part (pictures on X only, with
    // constant coefficients) and a Y part
    const split = [];
    for (const { k, axis } of fields) {
      const xTerms = [];
      const yTerms = [];
      for (const t of axis.field.terms) {
        const onX = t.f.some((f) => (f.kind === 'pic' ? f.axis.id === X.id : f.axes.some((a) => a.id === X.id)));
        const onY = t.f.some((f) => (f.kind === 'pic' ? f.axis.id === Y.id : f.axes.some((a) => a.id === Y.id)));
        if (onX && onY) return why('a field term mixes X and Y');
        if (onX) {
          if (!t.f.every((f) => f.kind === 'pic' && f.axis.id === X.id) || !jetIsConst(t.c.re) || !jetIsZero(t.c.im)) return why('X part not constant pictures on X');
          xTerms.push(t);
        } else yTerms.push(t);
      }
      split.push({ k, axis, xTerms, yElem: new Element(yTerms) });
    }
    // A(m): the transform over phi of exp(2 pi i sum k G_X(phi))
    const fnX = (phi) => {
      let v = 0;
      for (const { k, axis, xTerms } of split) {
        const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
        for (const t of xTerms) {
          let w = t.c.re.v;
          for (const f of t.f) w *= f.fn(phi);
          v += (k * w) / per;
        }
      }
      return v;
    };
    // the range over phi is the exponential's own bandwidth (its
    // amplitude plus a margin), never more than the axis's range
    const keyA = `chainA|${X.id}|${split.map((q) => q.k).join(',')}`;
    let A = this._resCache.get(keyA);
    if (!A) {
      let amp = 0;
      for (let i = 0; i < 64; i++) amp = Math.max(amp, Math.abs(TAU * fnX(i / 64)));
      const KX = Math.min(resK[ix], Math.ceil(amp) + 8);
      let M = 128;
      while (M < 2 * (KX + amp + 8)) M *= 2;
      const re = new Float64Array(2 * KX + 1);
      const im = new Float64Array(2 * KX + 1);
      for (let i = 0; i < M; i++) {
        const u = i / M;
        const ph = TAU * fnX(u);
        const cr0 = Math.cos(ph) / M;
        const ci0 = Math.sin(ph) / M;
        // e^{-2 pi i m u} from m = -KX by a running phasor
        const step = -TAU * u;
        const dc = Math.cos(step);
        const ds = Math.sin(step);
        let pr = Math.cos(-KX * step);
        let pi = Math.sin(-KX * step);
        for (let m = -KX; m <= KX; m++) {
          re[KX + m] += cr0 * pr - ci0 * pi;
          im[KX + m] += cr0 * pi + ci0 * pr;
          const nr = pr * dc - pi * ds;
          pi = pr * ds + pi * dc;
          pr = nr;
        }
      }
      A = { re, im, K: KX };
      this._resCache.set(keyA, A);
      this.stats.dfts++;
    }
    const KX = A.K;
    const gX = resGrads[ix];
    const hX = resHess[ix];
    const gY = resGrads[1 - ix];
    const hY = resHess[1 - ix];
    const yFields = split.filter((q) => q.yElem.terms.length > 0).map((q) => ({ k: q.k, axis: q.axis, elem: q.yElem, tag: `${q.axis.id}` }));
    let acc = 0;
    const st = this.stats;
    st.chainPairs = (st.chainPairs || 0) + 2 * KX + 1;
    for (let m = -KX; m <= KX; m++) {
      const ar = A.re[KX + m];
      const ai = A.im[KX + m];
      const magA = Math.hypot(ar, ai);
      // the coefficient alone must pass the cut (the multiplier is at most one)
      if (magA < 1e-12 || logCoef + Math.log(magA) < lnCut) continue;
      const mbx = bx + TAU * m * gX[0];
      const mby = by + TAU * m * gX[1];
      const mq00 = q00 + TAU * m * hX[0];
      const mq01 = q01 + TAU * m * hX[1];
      const mq11 = q11 + TAU * m * hX[2];
      // B_m(n): the transform over Y of the Y parts, X's field at harmonic
      // m, and the closures, at the harmonics n (within the bandwidth-capped
      // range) that can pass the cut
      const fs = m === 0 ? yFields : [...yFields, { k: m, axis: X, elem: X.field, tag: `x${X.id}` }];
      const t0 = DEBUG ? performance.now() : 0;
      const { set, K: KY, bessel, cloHarm } = this.residualSetFor(resK[1 - ix], Y, fs, clos, localCoords);
      if (DEBUG) st.chainSetMs = (st.chainSetMs || 0) + performance.now() - t0;
      const N = set.nodes.length;
      st.chainLive = (st.chainLive || 0) + 1;
      let samples = null;
      // the harmonics of Y that can pass sit around the one that makes the
      // rate slowest: search outward from it, stopping a side after two
      // failures in a row
      const gy1 = cond.dim === 1 ? gY[0] * cond.e[0] + gY[1] * cond.e[1] : 0;
      const gyn = cond.dim === 1 ? gy1 * gy1 : gY[0] * gY[0] + gY[1] * gY[1];
      const proj = cond.dim === 1 ? (mbx * cond.e[0] + mby * cond.e[1]) * gy1 : mbx * gY[0] + mby * gY[1];
      const nStar = gyn > 1e-30 ? Math.round(-proj / (TAU * gyn)) : 0;
      const tryN = (n) => {
        if (n < -KY || n > KY) return false;
        st.chainNs = (st.chainNs || 0) + 1;
        const nbx = mbx + TAU * n * gY[0];
        const nby = mby + TAU * n * gY[1];
        const nq00 = mq00 + TAU * n * hY[0];
        const nq01 = mq01 + TAU * n * hY[1];
        const nq11 = mq11 + TAU * n * hY[2];
        const lm = logMult(nbx, nby, nq00, nq01, nq11, cond);
        // the coefficient is the closures' series convolved with the field
        // exponential's, whose terms obey |J_j(A)| <= (A/2)^|j| / |j|!
        let lb = 0;
        if (bessel >= 0 && cloHarm) {
          let bound = 0;
          for (let j = -16; j <= 16; j++) {
            const L = cloHarm[j + 16];
            if (L < 1e-14) continue;
            const d = Math.abs(n - j);
            const bj = d === 0 ? 1 : Math.min(1, Math.exp(d * Math.log(Math.max(bessel / 2, 1e-300)) - lgamma(d + 1)));
            bound += L * bj;
          }
          lb = Math.log(Math.max(2 * bound, 1e-300));
          if (lb > 0) lb = 0;
        }
        if (lm + logCoef + Math.log(magA) + lb < lnCut) return false;
        if (!samples) {
          const t1 = DEBUG ? performance.now() : 0;
          samples = this.residualSamples(set, fs, N);
          if (DEBUG) st.chainSampleMs = (st.chainSampleMs || 0) + performance.now() - t1;
          st.chainSamples = (st.chainSamples || 0) + 1;
          st.chainSampleN = (st.chainSampleN || 0) + N;
          this.stats.dfts++;
        }
        const t2 = DEBUG ? performance.now() : 0;
        const [br, bi] = residualCoefAt(set.nodes, samples.SR, samples.SI, N, n);
        if (DEBUG) st.chainCoefMs = (st.chainCoefMs || 0) + performance.now() - t2;
        st.chainCoefs = (st.chainCoefs || 0) + 1;
        const mag = magA * Math.hypot(br.v, bi.v);
        if (mag < 1e-12 || lm + logCoef + Math.log(mag) < lnCut) return true;
        const cj0 = cjMul(c, cjScaleC({ re: br, im: bi }, ar, ai));
        const v = termExpectation(cjScaleC(cj0, cr, ci), phi0 + this.axisPhase(X, m) + this.axisPhase(Y, n), nbx, nby, nq00, nq01, nq11, cond);
        this.stats.recipes++;
        acc += v[0];
        return true;
      };
      tryN(nStar);
      for (let side = -1; side <= 1; side += 2) {
        let fails = 0;
        for (let d = 1; d <= 2 * KY + 1 && fails < 2; d++) {
          const n = nStar + side * d;
          if (n < -KY || n > KY) break;
          if (tryN(n)) fails = 0;
          else fails++;
        }
      }
    }
    return acc;
  }
  // The sum for a step of a sum under any split of its axes: the residual
  // Phi axes are summed through the table T_m(a); a local Phi axis is a
  // number and its picture joins a; the residual X axes are transformed
  // (the transform over X of F_m(x) = O(x) T_m(a(x)) e^{2 pi i m.G(x)},
  // with O the other closures of the term, remembered across pixels when
  // nothing local enters it) or all fixed (the table read at a and G).
  // Returns null when the term's closures reach axes that are not its own.
  stepsumNo(why) {
    if (DEBUG) console.log(`      stepsum declined: ${why}`);
    return null;
  }
  // The harmonics of a set of axes that can pass the cut with a recipe of
  // rate R: the second-order magnitude is at most exp(-a |b|^2 / (2 (a^2 +
  // lam^2))) for a = 1 / sig^2, b the first-order rate and lam the
  // curvature, which grows with |k| as lam0 + sum rho_i |k_i|, so the bound
  // is a quadratic inequality in the last harmonic for each value of the
  // first, solved on each sign. Returns [[k0, k1lo, k1hi], ...] or null.
  harmonicsThrough(R, budget, gA, hA, KA, cond) {
    if (budget <= 0) return null;
    const nA = gA.length;
    const aS = 1 / (cond.sig * cond.sig);
    const rowNorm = (h) => Math.max(Math.abs(h[0]) + Math.abs(h[1]), Math.abs(h[1]) + Math.abs(h[2]));
    const lam0 = rowNorm([R.mq00, R.mq01, R.mq11]);
    const rho = hA.map((h) => TAU * rowNorm(h));
    const s2 = (2 * budget) / aS;
    let b0x;
    let b0y;
    let cxx;
    let cxy;
    let cyx;
    let cyy;
    if (cond.dim === 2) {
      b0x = R.mbx;
      b0y = R.mby;
      cxx = TAU * gA[0][0];
      cxy = TAU * gA[0][1];
      cyx = nA === 2 ? TAU * gA[1][0] : 0;
      cyy = nA === 2 ? TAU * gA[1][1] : 0;
    } else {
      const ex = cond.e[0];
      const ey = cond.e[1];
      const mx = cond.m[0];
      const my = cond.m[1];
      b0x = (R.mbx + R.mq00 * mx + R.mq01 * my) * ex + (R.mby + R.mq01 * mx + R.mq11 * my) * ey;
      b0y = 0;
      const along = (g, h) => TAU * (g[0] * ex + g[1] * ey + (h[0] * mx + h[1] * my) * ex + (h[1] * mx + h[2] * my) * ey);
      cxx = along(gA[0], hA[0]);
      cxy = 0;
      cyx = nA === 2 ? along(gA[1], hA[1]) : 0;
      cyy = 0;
    }
    const KY = nA === 2 ? KA[1] : 0;
    const solve = (A, B, C, sgn) => {
      let lo = sgn > 0 ? 0 : -KY;
      let hi = sgn > 0 ? KY : 0;
      if (Math.abs(A) < 1e-18) {
        if (Math.abs(B) < 1e-18) return C <= 0 ? [lo, hi] : [1, 0];
        const r = -C / B;
        if (B > 0) hi = Math.min(hi, Math.floor(r + 1e-9));
        else lo = Math.max(lo, Math.ceil(r - 1e-9));
        return [lo, hi];
      }
      const disc = B * B - 4 * A * C;
      if (A > 0) {
        if (disc < 0) return [1, 0];
        const sq = Math.sqrt(disc);
        return [Math.max(lo, Math.ceil((-B - sq) / (2 * A) - 1e-9)), Math.min(hi, Math.floor((-B + sq) / (2 * A) + 1e-9))];
      }
      if (disc < 0) return [lo, hi];
      const sq = Math.sqrt(disc);
      const r1 = (-B + sq) / (2 * A);
      const r2 = (-B - sq) / (2 * A);
      const left = [lo, Math.min(hi, Math.floor(Math.min(r1, r2) + 1e-9))];
      const right = [Math.max(lo, Math.ceil(Math.max(r1, r2) - 1e-9)), hi];
      const ok1 = left[0] <= left[1];
      const ok2 = right[0] <= right[1];
      if (ok1 && ok2) return [left[0], right[1]];
      if (ok1) return left;
      if (ok2) return right;
      return [1, 0];
    };
    const out = [];
    for (let kx = -KA[0]; kx <= KA[0]; kx++) {
      const px = b0x + cxx * kx;
      const py = b0y + cxy * kx;
      const L = lam0 + rho[0] * Math.abs(kx);
      if (nA === 1) {
        if (px * px + py * py <= s2 * (aS * aS + L * L)) out.push([kx, 0, 0]);
        continue;
      }
      const r1 = rho[1];
      const A0 = cyx * cyx + cyy * cyy - s2 * r1 * r1;
      const B0 = 2 * (px * cyx + py * cyy);
      const C0 = px * px + py * py - s2 * (aS * aS + L * L);
      const up = solve(A0, B0 - 2 * s2 * L * r1, C0, 1);
      const dn = solve(A0, B0 + 2 * s2 * L * r1, C0, -1);
      const lo = Math.min(up[0] <= up[1] ? up[0] : Infinity, dn[0] <= dn[1] ? dn[0] : Infinity);
      const hi = Math.max(up[0] <= up[1] ? up[1] : -Infinity, dn[0] <= dn[1] ? dn[1] : -Infinity);
      if (lo <= hi) out.push([kx, lo, hi]);
    }
    return out.length ? out : null;
  }
  // The X harmonics of a recipe when shift harmonics can complete their
  // rate: each is kept when the rate it leaves is within reach of the shift
  // lattice (the relaxed bound over the remaining freedoms), as explicit
  // pairs [kx, ky, ky]; the exact test is made per shift harmonic later.
  shiftHarmonics(R, budget, gX, hX, KX, gS, hS, KS, cond) {
    if (budget <= 0) return null;
    const aS = 1 / (cond.sig * cond.sig);
    const rowNorm = (h) => Math.max(Math.abs(h[0]) + Math.abs(h[1]), Math.abs(h[1]) + Math.abs(h[2]));
    const lam0 = rowNorm([R.mq00, R.mq01, R.mq11]);
    const proj = (g) => (cond.dim === 1 ? [g[0] * cond.e[0] + g[1] * cond.e[1], 0] : g);
    let base;
    if (cond.dim === 2) base = [R.mbx, R.mby];
    else {
      const ex = cond.e[0];
      const ey = cond.e[1];
      const mx = cond.m[0];
      const my = cond.m[1];
      base = [(R.mbx + R.mq00 * mx + R.mq01 * my) * ex + (R.mby + R.mq01 * mx + R.mq11 * my) * ey, 0];
    }
    const Xf = gX.map((g, i) => ({ g: proj([TAU * g[0], TAU * g[1]]), K: KX[i], hn: TAU * rowNorm(hX[i]) }));
    const Sf = gS.map((g, i) => ({ g: proj([TAU * g[0], TAU * g[1]]), K: KS[i], hn: TAU * rowNorm(hS[i]) }));
    const ok = (rate2, lam) => (-0.5 * aS * rate2) / (aS * aS + lam * lam) + budget >= 0;
    if (!ok(pruneRate2(base, [...Xf, ...Sf]), lam0)) return null;
    const out = [];
    const nX = gX.length;
    for (let kx = -KX[0]; kx <= KX[0]; kx++) {
      const bx = [base[0] + kx * Xf[0].g[0], base[1] + kx * Xf[0].g[1]];
      const lamx = lam0 + Math.abs(kx) * Xf[0].hn;
      if (nX === 1) {
        if (ok(pruneRate2(bx, Sf), lamx)) out.push([kx, 0, 0]);
        continue;
      }
      if (!ok(pruneRate2(bx, [Xf[1], ...Sf]), lamx)) continue;
      for (let ky = -KX[1]; ky <= KX[1]; ky++) {
        const by = [bx[0] + ky * Xf[1].g[0], bx[1] + ky * Xf[1].g[1]];
        if (ok(pruneRate2(by, Sf), lamx + Math.abs(ky) * Xf[1].hn)) out.push([kx, ky, ky]);
      }
    }
    return out.length ? out : null;
  }
  // The sum for a term whose closures include steps of sums, under any
  // split of the axes. The residual axes are the steps' bare Phi axes, the
  // shift axes S (a parallax: every count shifted by scalar multiples of
  // one function H of them) and the rest, X (at most two). For each recipe
  // of the Phi harmonics the steps contribute their tables T_m(a_i(x))
  // e^{2 pi i m.G_i(x)}, the pictures with fields their phase and the other
  // closures on X their values, all functions on the X torus with the shift
  // removed, transformed by FFT (remembered across pixels when nothing
  // local enters) or, with no residual X, read at the fixed coordinates;
  // and for each X harmonic the transform over S of O_S e^{i theta H} at
  // theta = 2 pi (m.c_phi + k.c_X + k_f.c_f), a family tabulated once, whose
  // theta derivatives carry the view's variation across the pixel as the
  // coefficient's jet. A local Phi axis is a number and its picture joins
  // its step's a. Returns null for a structure outside this.
  stepsumSum(c, cr, ci, phi0, bx, by, q00, q01, q11, logCoef, residual, resGrads, resHess, resK, clos, fields, cond, localCoords) {
    const steps = clos.filter((cl) => cl.stepsum);
    const others = clos.filter((cl) => !cl.stepsum);
    const lnCut = Math.log(this.cut);
    const resIds = new Set(residual.map((a) => a.id));
    const bareOwner = new Map();
    for (const cl of steps)
      for (const q of cl.stepsum.phis) {
        if (bareOwner.has(q.bare.id) && bareOwner.get(q.bare.id) !== cl) return this.stepsumNo(`two steps share the Phi axis ${q.bare.label}#${q.bare.id}`);
        bareOwner.set(q.bare.id, cl);
      }
    // the shift group: one H for every step that has one
    let H = null;
    const sIds = new Set();
    for (const cl of steps) {
      const S = cl.stepsum;
      if (!S.H) continue;
      if (H && H.key !== S.H.key) return this.stepsumNo('two shift functions');
      H = S.H;
      for (const a of S.S) sIds.add(a.id);
    }
    // no step with a shift: the field pictures may still carry one (a
    // picture whose field is a scalar times one function H of counts that
    // enter nothing else directly)
    if (!H && fields.length) {
      const cand = new Set(residual.filter((a) => !a.field && !bareOwner.has(a.id)).map((a) => rootId(a)));
      outer: for (const f of fields)
        for (const t of f.axis.field.terms) {
          const direct = t.f.flatMap((ff) => (ff.kind === 'pic' ? [ff.axis] : ff.axes));
          if (direct.length && direct.every((a) => cand.has(rootId(a)))) {
            H = { key: termKey(t), factors: t.f, sig: t.f.map((ff) => ff.sig).join('*') };
            for (const a of direct) sIds.add(rootId(a));
            break outer;
          }
        }
    }
    const Sres = residual.filter((a) => sIds.has(a.id));
    const Sloc = [...sIds].filter((id) => !resIds.has(id));
    if (Sres.length && Sloc.length) return this.stepsumNo('shift axes both residual and local');
    for (const id of Sloc) if (!localCoords.has(id)) return this.stepsumNo('a shift axis neither residual nor local');
    const shift = Sres.length > 0; // the family is used; otherwise H is a number in the fields
    const X = residual.filter((a) => !bareOwner.has(a.id) && !sIds.has(a.id));
    if (X.length > 2) return this.stepsumNo(`${X.length} X axes`);
    const xIds = new Set(X.map((a) => a.id));
    const known = (a) => xIds.has(a.id) || localCoords.has(a.id);
    for (const cl of steps) for (const a of cl.stepsum.X) if (!known(a)) return this.stepsumNo(`X axis ${a.label}#${a.id} of a step neither residual nor local`);
    for (const cl of steps) for (const q of cl.stepsum.phis) if (!resIds.has(q.bare.id) && !localCoords.has(q.bare.id)) return this.stepsumNo('a Phi axis neither residual nor local');
    // the other closures: on X (and local axes) or on S
    const OX = [];
    const OS = [];
    for (const o of others) {
      const onS = o.axes.every((a) => sIds.has(a.id));
      const onX = o.axes.every((a) => known(a));
      if (shift && onS) OS.push(o);
      else if (onX) OX.push(o);
      else return this.stepsumNo(`closure ${o.sig.slice(0, 40)} reaches ${o.axes.map((a) => a.label + '#' + a.id).join(',')}`);
    }
    // the H part of a field element (the sum of its H terms' coefficient
    // jets, or null), declining when a term reaches S outside H
    let hBad = null;
    const hPart = (el, what) => {
      if (!shift || !el) return null;
      let sum = null;
      for (const t of el.terms) {
        const direct = t.f.flatMap((ff) => (ff.kind === 'pic' ? [ff.axis] : ff.axes));
        if (!direct.some((a) => sIds.has(rootId(a)))) continue;
        if (termKey(t) !== H.key || !direct.every((a) => sIds.has(rootId(a)))) {
          hBad = `${what} reaches S outside H`;
          return null;
        }
        sum = sum ? sum.add(t.c.re) : t.c.re;
      }
      return sum;
    };
    // the field pictures: their H part joins theta, the rest the grid
    const fieldH = [];
    for (const f of fields) {
      for (const a of f.axis.field.axes()) if (!known(a) && !sIds.has(a.id)) return this.stepsumNo(`field of ${f.axis.label}#${f.axis.id} reaches ${a.label}#${a.id}`);
      const sum = hPart(f.axis.field, `field of ${f.axis.label}#${f.axis.id}`);
      if (hBad) return this.stepsumNo(hBad);
      const per = f.axis.kind === 'edge' ? f.axis.edgePeriod : 1;
      fieldH.push(sum ? sum.scale((TAU * f.k) / per) : null);
    }
    // each step: its residual and local Phi axes and its tables
    const parts = steps.map((cl) => {
      const S = cl.stepsum;
      const phiR = [];
      const phiL = [];
      S.phis.forEach((q, j) => (resIds.has(q.bare.id) ? phiR : phiL).push(j));
      const mask = phiR.reduce((m, j) => m | (1 << j), 0);
      const tables = phiR.length ? stepsumTables(S, mask, this.stepsumM, this.stepsumNA) : null;
      return { S, phiR, phiL, mask, tables };
    });
    const idxOf = (id) => residual.findIndex((a) => a.id === id);
    const phis = [];
    parts.forEach((P, pi) => {
      P.phiR.forEach((j, r) => {
        const q = P.S.phis[j];
        const idx = idxOf(q.bare.id);
        phis.push({ pi, j, r, bare: q.bare, g: resGrads[idx], h: resHess[idx], K: Math.min(resK[idx], P.tables.Ms[r]), cH: null, q });
      });
    });
    const nPhi = phis.length;
    if (nPhi === 0 && !shift && fields.length === 0) return this.stepsumNo('no residual Phi axis');
    const gX = X.map((a) => resGrads[idxOf(a.id)]);
    const hX = X.map((a) => resHess[idxOf(a.id)]);
    const KW = this.stepsumKW;
    const KX = X.map((a) => Math.min(resK[idxOf(a.id)], KW));
    const nXR = X.length;
    // the H coefficient of each X axis (its field's shift), a jet or null
    const cXof = X.map((a) => {
      if (!shift) return null;
      for (const cl of steps) if (cl.stepsum.cX.has(a.id)) return cl.stepsum.cX.get(a.id);
      const j = hPart(a.field, `field of X axis ${a.label}#${a.id}`);
      return j;
    });
    if (hBad) return this.stepsumNo(hBad);
    // the shift tables and the S harmonics' rates
    let ST = null;
    let gS = null;
    let hS = null;
    let KS = null;
    let thetaMax = 0;
    if (shift) {
      for (const ph of phis) ph.cH = hPart(ph.q.axis.field, `field of Phi axis ${ph.q.axis.label}#${ph.q.axis.id}`);
      if (hBad) return this.stepsumNo(hBad);
      const absv = (j) => (j ? Math.abs(j.v) : 0);
      for (const ph of phis) thetaMax += ph.K * absv(ph.cH);
      X.forEach((a, i) => (thetaMax += KX[i] * absv(cXof[i])));
      fieldH.forEach((j) => (thetaMax += absv(j) / TAU));
      thetaMax *= TAU;
      ST = shiftTables(H, Sres, OS, this.shiftNG, this.shiftKW, thetaMax, this.shiftDTheta);
      gS = Sres.map((a) => resGrads[idxOf(a.id)]);
      hS = Sres.map((a) => resHess[idxOf(a.id)]);
      KS = Sres.map((a) => Math.min(resK[idxOf(a.id)], this.shiftKW));
    }
    // coordinates with the shift's H terms dropped (when the family is used)
    const withSkip = (coords) => {
      if (!shift) return coords;
      const m = new Map(coords);
      m.set(-2, H.key);
      return m;
    };
    const aAt = (P, coords) => {
      const S = P.S;
      let a = S.c + (S.A.terms.length ? evalElement(S.A, coords).v : 0);
      for (const j of P.phiL) {
        const q = S.phis[j];
        const phi = localCoords.get(q.bare.id) + (q.axis.field ? evalElement(q.axis.field, coords).v : 0);
        for (const p of q.parts) a += p.beta * p.fn(phi);
      }
      return a;
    };
    const GAt = (coords) => phis.map((ph) => {
      const q = parts[ph.pi].S.phis[ph.j];
      return q.axis.field ? evalElement(q.axis.field, coords).v : 0;
    });
    const fieldPhaseAt = (coords) => {
      let ph = 0;
      for (const { k, axis } of fields) {
        const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
        ph += (TAU * k * evalElement(axis.field, coords).v) / per;
      }
      return ph;
    };
    const othersAt = (coords) => {
      let v = 1;
      for (const o of OX) v *= o.fn(o.axes.map((a) => bareCoordinate(a, coords)), coords).v;
      return v;
    };
    const qOf = (P, pi, m) => {
      const Ms = P.tables.Ms;
      let m0 = 0;
      let m1 = 0;
      phis.forEach((ph, i) => {
        if (ph.pi !== pi) return;
        if (ph.r === 0) m0 = m[i];
        else m1 = m[i];
      });
      return P.tables.nP === 1 ? m0 + Ms[0] : (m0 + Ms[0]) * (2 * Ms[1] + 1) + m1 + Ms[1];
    };
    const recipe = (m) => {
      let mbx = bx;
      let mby = by;
      let mq00 = q00;
      let mq01 = q01;
      let mq11 = q11;
      let phase = phi0;
      for (let i = 0; i < nPhi; i++) {
        const ph = phis[i];
        mbx += TAU * m[i] * ph.g[0];
        mby += TAU * m[i] * ph.g[1];
        mq00 += TAU * m[i] * ph.h[0];
        mq01 += TAU * m[i] * ph.h[1];
        mq11 += TAU * m[i] * ph.h[2];
        phase += this.axisPhase(ph.bare, m[i]);
      }
      return { mbx, mby, mq00, mq01, mq11, phase };
    };
    // theta as a jet for a Phi recipe and an X harmonic
    let thetaBase = null;
    if (shift) {
      thetaBase = J0;
      for (const j of fieldH) if (j) thetaBase = thetaBase.add(j);
    }
    const thetaOf = (m, kx, ky) => {
      let th = thetaBase;
      for (let i = 0; i < nPhi; i++) if (phis[i].cH && m[i]) th = th.add(phis[i].cH.scale(TAU * m[i]));
      if (cXof[0] && kx) th = th.add(cXof[0].scale(TAU * kx));
      if (nXR === 2 && cXof[1] && ky) th = th.add(cXof[1].scale(TAU * ky));
      return th;
    };
    const ms = [];
    const m = new Array(nPhi).fill(0);
    const rec = (i) => {
      if (i === nPhi) {
        ms.push(m.slice());
        return;
      }
      for (let v = -phis[i].K; v <= phis[i].K; v++) {
        m[i] = v;
        rec(i + 1);
      }
    };
    rec(0);
    let acc = 0;
    const qbuf = new Float64Array(6);
    // the contribution of one (m, k) with coefficient P (complex number),
    // rates r and phase ph2: through the shift family or directly
    const addRecipe = (mm, kx, ky, Pr, Pi, r, ph2) => {
      if (!shift) {
        if (logMult(r[0], r[1], r[2], r[3], r[4], cond) + logCoef + Math.log(Math.hypot(Pr, Pi)) < lnCut) return;
        const v = termExpectation(cjScaleC(cjScaleC(c, Pr, Pi), cr, ci), ph2, r[0], r[1], r[2], r[3], r[4], cond);
        this.stats.recipes++;
        acc += v[0];
        return;
      }
      const Rk = { mbx: r[0], mby: r[1], mq00: r[2], mq01: r[3], mq11: r[4] };
      const pmag = Math.hypot(Pr, Pi);
      const kss = this.harmonicsThrough(Rk, logCoef + Math.log(pmag * ST.oMax) - lnCut, gS, hS, KS, cond);
      if (!kss) return;
      const th = thetaOf(mm, kx, ky);
      // what the frozen scenes ask of the shift table: the argument, the
      // argument times the field's height (the Bessel argument, where a
      // 64-point torus grid aliases past about 32), and the sideband order
      if (Math.abs(th.v) > this.stats.thetaAbsMax) this.stats.thetaAbsMax = Math.abs(th.v);
      if (Math.abs(th.v) * ST.hMax > this.stats.thetaHMax) this.stats.thetaHMax = Math.abs(th.v) * ST.hMax;
      for (const [ks0, ks1lo, ks1hi] of kss) {
        const o = Math.max(Math.abs(ks0), Math.abs(ks1lo), Math.abs(ks1hi));
        if (o > this.stats.shiftOrderMax) this.stats.shiftOrderMax = o;
      }
      for (const [ks0, ks1lo, ks1hi] of kss)
        for (let ks1 = ks1lo; ks1 <= ks1hi; ks1++) {
          const w = ST.nS === 2 ? (ks0 + ST.KWS) * ST.KWn + ks1 + ST.KWS : ks0 + ST.KWS;
          shiftAt(ST, th.v, w, qbuf);
          // the coefficient jet: P (Q + Q' dtheta + Q'' dtheta^2 / 2)
          const Qr = qbuf[0];
          const Qi = qbuf[1];
          if (Math.hypot(Qr, Qi) * pmag < 1e-13) continue;
          const nbx = r[0] + TAU * (ks0 * gS[0][0] + (ST.nS === 2 ? ks1 * gS[1][0] : 0));
          const nby = r[1] + TAU * (ks0 * gS[0][1] + (ST.nS === 2 ? ks1 * gS[1][1] : 0));
          const nq00 = r[2] + TAU * (ks0 * hS[0][0] + (ST.nS === 2 ? ks1 * hS[1][0] : 0));
          const nq01 = r[3] + TAU * (ks0 * hS[0][1] + (ST.nS === 2 ? ks1 * hS[1][1] : 0));
          const nq11 = r[4] + TAU * (ks0 * hS[0][2] + (ST.nS === 2 ? ks1 * hS[1][2] : 0));
          if (logMult(nbx, nby, nq00, nq01, nq11, cond) + logCoef + Math.log(Math.hypot(Qr, Qi) * pmag) < lnCut) continue;
          const Q1r = qbuf[2];
          const Q1i = qbuf[3];
          const Q2r = qbuf[4];
          const Q2i = qbuf[5];
          // the jet of Q(theta(z)) with theta a jet: value, gradient Q' theta_g, Hessian Q'' theta_g theta_g + Q' theta_h
          const jetOf = (v, d1, d2) => new Jet(v, d1 * th.gx, d1 * th.gy, d2 * th.gx * th.gx + d1 * th.hxx, d2 * th.gx * th.gy + d1 * th.hxy, d2 * th.gy * th.gy + d1 * th.hyy);
          const Qjr = jetOf(Qr, Q1r, Q2r);
          const Qji = jetOf(Qi, Q1i, Q2i);
          const coef = cjMul(cj(Qjr, Qji), cj(Jet.c(Pr), Jet.c(Pi)));
          const ph3 = ph2 + this.axisPhase(Sres[0], ks0) + (ST.nS === 2 ? this.axisPhase(Sres[1], ks1) : 0);
          const v = termExpectation(cjScaleC(cjMul(c, coef), cr, ci), ph3, nbx, nby, nq00, nq01, nq11, cond);
          this.stats.recipes++;
          acc += v[0];
        }
    };
    if (nXR === 0) {
      const lc = withSkip(localCoords);
      if (shift) for (const a of Sres) if (!lc.has(a.id)) lc.set(a.id, 0);
      const as = parts.map((P) => aAt(P, lc));
      const G = GAt(lc);
      const ov = othersAt(lc);
      const fph = fieldPhaseAt(lc);
      if (Math.abs(ov) < 1e-15) return 0;
      for (const mm of ms) {
        let tr = ov;
        let ti = 0;
        parts.forEach((P, pi) => {
          if (!P.tables) return;
          const [r, i] = stepsumT(P.tables, qOf(P, pi, mm), as[pi]);
          const nr = tr * r - ti * i;
          ti = tr * i + ti * r;
          tr = nr;
        });
        let ph = fph;
        for (let i = 0; i < nPhi; i++) ph += TAU * mm[i] * G[i];
        const cph = Math.cos(ph);
        const sph = Math.sin(ph);
        const coefR = tr * cph - ti * sph;
        const coefI = tr * sph + ti * cph;
        if (Math.hypot(coefR, coefI) < 1e-13) continue;
        const R = recipe(mm);
        addRecipe(mm, 0, 0, coefR, coefI, [R.mbx, R.mby, R.mq00, R.mq01, R.mq11], R.phase);
      }
      return acc;
    }
    // X residual: the factors on a midpoint grid of the residual X torus;
    // the grid is remembered on the first step's tables when nothing local
    // enters it
    const cacheable = localCoords.size === 0 || [...localCoords.keys()].every((id) => id < 0 || (!steps.some((cl) => cl.axes.some((a) => a.id === id)) && !others.some((o) => o.axes.some((a) => a.id === id)) && !fields.some((f) => f.axis.field.axes().some((a) => a.id === id))));
    const NG = cacheable ? this.stepsumNG : this.stepsumNGlocal;
    const withTables = parts.find((P) => P.tables);
    const home = withTables ? withTables.tables : plainGridHome;
    const gridKey = `${X.map((a) => a.id).join(',')}|${NG}|${shift ? H.key : ''}|${steps.map((cl) => cl.stepsum.sig + ':' + parts[steps.indexOf(cl)].mask).join('*')}|${OX.map((o) => o.sig).join('*')}`;
    let grid = cacheable ? home.xGrids.get(gridKey) : null;
    if (!grid) {
      const n = nXR === 1 ? NG : NG * NG;
      const Og = new Float64Array(n);
      const Gg = phis.map(() => new Float64Array(n));
      const los = parts.map((P) => (P.tables ? new Int32Array(n) : null));
      const frs = parts.map((P) => (P.tables ? new Float64Array(n) : null));
      let oMax = 0;
      const coords = withSkip(new Map(localCoords));
      if (shift) for (const a of Sres) coords.set(a.id, 0);
      for (let i = 0; i < NG; i++)
        for (let j = 0; j < (nXR === 2 ? NG : 1); j++) {
          coords.set(X[0].id, (i + 0.5) / NG);
          if (nXR === 2) coords.set(X[1].id, (j + 0.5) / NG);
          const idx = nXR === 2 ? i * NG + j : i;
          parts.forEach((P, pi) => {
            if (!P.tables) return;
            const aG = P.tables.aGrid;
            const nA = aG.length;
            const a = aAt(P, coords);
            if (!(a > aG[0])) {
              los[pi][idx] = 0;
              frs[pi][idx] = 0;
            } else if (a >= aG[nA - 1]) {
              los[pi][idx] = nA - 2;
              frs[pi][idx] = 1;
            } else {
              let l = 0;
              let h = nA - 1;
              while (h - l > 1) {
                const mid = (l + h) >> 1;
                if (aG[mid] <= a) l = mid;
                else h = mid;
              }
              los[pi][idx] = l;
              frs[pi][idx] = (a - aG[l]) / (aG[h] - aG[l]);
            }
          });
          const G = GAt(coords);
          for (let r = 0; r < nPhi; r++) Gg[r][idx] = G[r];
          Og[idx] = othersAt(coords);
          oMax = Math.max(oMax, Math.abs(Og[idx]));
        }
      const wr = Gg.map((g) => Float64Array.from(g, (v) => Math.cos(TAU * v)));
      const wi = Gg.map((g) => Float64Array.from(g, (v) => Math.sin(TAU * v)));
      grid = { Og, Gg, los, frs, oMax, n, wr, wi, zr: new Float64Array(n), zi: new Float64Array(n), zm: null, zf: null, re: new Float64Array(n), im: new Float64Array(n), coefs: new Map(), fieldPhases: new Map() };
      if (cacheable) home.xGrids.set(gridKey, grid);
    }
    if (grid.oMax < 1e-15) return 0;
    const fkey = fields.map((f) => `${f.axis.id}:${f.k}`).join(',');
    let fph = grid.fieldPhases.get(fkey);
    if (!fph) {
      const n = grid.n;
      const pr = new Float64Array(n);
      const pi2 = new Float64Array(n);
      if (fields.length === 0) pr.fill(1);
      else {
        const coords = withSkip(new Map(localCoords));
        if (shift) for (const a of Sres) coords.set(a.id, 0);
        for (let i = 0; i < NG; i++)
          for (let j = 0; j < (nXR === 2 ? NG : 1); j++) {
            coords.set(X[0].id, (i + 0.5) / NG);
            if (nXR === 2) coords.set(X[1].id, (j + 0.5) / NG);
            const idx = nXR === 2 ? i * NG + j : i;
            const ph = fieldPhaseAt(coords);
            pr[idx] = Math.cos(ph);
            pi2[idx] = Math.sin(ph);
          }
      }
      fph = { re: pr, im: pi2 };
      if (grid.fieldPhases.size > 64) grid.fieldPhases.clear();
      grid.fieldPhases.set(fkey, fph);
    }
    const KWn = 2 * KW + 1;
    const kRates = (R, kx, ky) => [
      R.mbx + TAU * (kx * gX[0][0] + (nXR === 2 ? ky * gX[1][0] : 0)),
      R.mby + TAU * (kx * gX[0][1] + (nXR === 2 ? ky * gX[1][1] : 0)),
      R.mq00 + TAU * (kx * hX[0][0] + (nXR === 2 ? ky * hX[1][0] : 0)),
      R.mq01 + TAU * (kx * hX[0][1] + (nXR === 2 ? ky * hX[1][1] : 0)),
      R.mq11 + TAU * (kx * hX[0][2] + (nXR === 2 ? ky * hX[1][2] : 0)),
    ];
    for (const mm of ms) {
      let tm = grid.oMax * (shift ? ST.oMax : 1);
      const qs = parts.map((P, pi) => (P.tables ? qOf(P, pi, mm) : -1));
      parts.forEach((P, pi) => {
        if (P.tables) tm *= P.tables.tmax[qs[pi]];
      });
      if (tm < 1e-13) continue;
      const R = recipe(mm);
      // with a shift the X harmonics' own rate need not be slow: the shift
      // harmonics complete it, so the X range is bounded only by the window
      const ks = shift ? this.shiftHarmonics(R, logCoef + Math.log(tm) - lnCut, gX, hX, KX, gS, hS, KS, cond) : this.harmonicsThrough(R, logCoef + Math.log(tm) - lnCut, gX, hX, KX, cond);
      if (!ks) continue;
      const ckey = `${mm.join(',')}|${fkey}`;
      let F = grid.coefs.get(ckey);
      if (!F) {
        const n = grid.n;
        const { zr, zi, re, im, Og } = grid;
        const last = grid.zm;
        const rl = nPhi - 1;
        let step = !!last && grid.zf === fkey && mm[rl] === last[rl] + 1;
        for (let i = 0; step && i < rl; i++) if (mm[i] !== last[i]) step = false;
        if (step) {
          const sr = grid.wr[rl];
          const si = grid.wi[rl];
          for (let idx = 0; idx < n; idx++) {
            const a = zr[idx];
            const b = zi[idx];
            zr[idx] = a * sr[idx] - b * si[idx];
            zi[idx] = a * si[idx] + b * sr[idx];
          }
        } else {
          for (let idx = 0; idx < n; idx++) {
            let ph = 0;
            for (let r = 0; r < nPhi; r++) ph += TAU * mm[r] * grid.Gg[r][idx];
            const cph = Math.cos(ph);
            const sph = Math.sin(ph);
            zr[idx] = cph * fph.re[idx] - sph * fph.im[idx];
            zi[idx] = cph * fph.im[idx] + sph * fph.re[idx];
          }
        }
        grid.zm = mm.slice();
        grid.zf = fkey;
        for (let idx = 0; idx < n; idx++) {
          let tr = Og[idx];
          let ti = 0;
          for (let pi = 0; pi < parts.length; pi++) {
            const P = parts[pi];
            if (!P.tables) continue;
            const { Tre, Tim, nCoef } = P.tables;
            const l = grid.los[pi][idx] * nCoef + qs[pi];
            const f = grid.frs[pi][idx];
            const r = (1 - f) * Tre[l] + f * Tre[l + nCoef];
            const i = (1 - f) * Tim[l] + f * Tim[l + nCoef];
            const nr = tr * r - ti * i;
            ti = tr * i + ti * r;
            tr = nr;
          }
          re[idx] = tr * zr[idx] - ti * zi[idx];
          im[idx] = tr * zi[idx] + ti * zr[idx];
        }
        if (nXR === 1) fftInPlace(re, im);
        else fft2InPlace(re, im, NG);
        const wn = nXR === 1 ? KWn : KWn * KWn;
        const Fre = new Float32Array(wn);
        const Fim = new Float32Array(wn);
        for (let kx = -KW; kx <= KW; kx++)
          for (let ky = -(nXR === 2 ? KW : 0); ky <= (nXR === 2 ? KW : 0); ky++) {
            const ix = ((kx % NG) + NG) % NG;
            const iy = ((ky % NG) + NG) % NG;
            const idx = nXR === 2 ? ix * NG + iy : ix;
            const ang = (-Math.PI * (kx + ky)) / NG;
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const r0 = re[idx] / n;
            const i0 = im[idx] / n;
            const w = nXR === 2 ? (kx + KW) * KWn + ky + KW : kx + KW;
            Fre[w] = r0 * ca - i0 * sa;
            Fim[w] = r0 * sa + i0 * ca;
          }
        F = { re: Fre, im: Fim };
        if (grid.coefs.size > 20000) grid.coefs.clear();
        grid.coefs.set(ckey, F);
        this.stats.dfts++;
      }
      for (const [kx, kyLo, kyHi] of ks)
        for (let ky = kyLo; ky <= kyHi; ky++) {
          const w = nXR === 2 ? (kx + KW) * KWn + ky + KW : kx + KW;
          const Pr = F.re[w];
          const Pi = F.im[w];
          if (Math.hypot(Pr, Pi) < 1e-13) continue;
          const r = kRates(R, kx, ky);
          const ph2 = R.phase + this.axisPhase(X[0], kx) + (nXR === 2 ? this.axisPhase(X[1], ky) : 0);
          addRecipe(mm, kx, ky, Pr, Pi, r, ph2);
        }
    }
    return acc;
  }
  residualSum(c, picCoef, ks, bx, by, logCoef, residual, resGrads, resHess, resK, clos, cond, localCoords) {
    const S = this.sig * this.sig;
    const lnCut = Math.log(this.cut);
    let cr = 1;
    let ci = 0;
    let phi0 = 0;
    let q00 = 0;
    let q01 = 0;
    let q11 = 0;
    picCoef.forEach(({ p, K, coef }, i) => {
      const k = ks[i];
      const r = coef.re[K + k];
      const m = coef.im[K + k];
      const nr = cr * r - ci * m;
      ci = cr * m + ci * r;
      cr = nr;
      const axis = p.axis;
      phi0 += this.axisPhase(axis, k);
      const h = this.axisHess(axis);
      q00 += TAU * k * h[0];
      q01 += TAU * k * h[1];
      q11 += TAU * k * h[2];
    });
    const rateFn = (x, y) => (cond.dim === 2 ? x * x + y * y : cond.dim === 1 ? (x * cond.e[0] + y * cond.e[1]) ** 2 : 0);
    // pictures whose axis carries a field: the field's phase enters here,
    // whether its axes are residual (a transform) or local (a number)
    const fields = picCoef.map(({ p }, i) => ({ k: ks[i], axis: p.axis })).filter((x) => x.axis.field);
    if (residual.length === 0 && clos.length === 0 && fields.length === 0) {
      const v = termExpectation(cjScaleC(c, cr, ci), phi0, bx, by, q00, q01, q11, cond);
      this.stats.recipes++;
      return v[0];
    }
    // the residual closure over the residual axes (local coordinates fixed)
    const resFn = (cs) => {
      const m = new Map(localCoords);
      residual.forEach((a, i) => m.set(a.id, cs[i]));
      // the fields' phase is a jet: their coefficients vary across the pixel
      let ph = J0;
      for (const { k, axis } of fields) {
        const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
        ph = ph.add(evalElement(axis.field, m).scale((TAU * k) / per));
      }
      let re = ph.cos();
      let im = ph.sin();
      for (const cl of clos) {
        const cs2 = cl.axes.map((a) => (localCoords.has(a.id) ? localCoords.get(a.id) : cs[residual.indexOf(a)]));
        const j = cl.fn(cs2);
        re = re.mul(j);
        im = im.mul(j);
      }
      return { re, im };
    };
    if (clos.some((cl) => cl.stepsum) || (fields.length > 0 && residual.length > 2)) {
      const v = this.stepsumSum(c, cr, ci, phi0, bx, by, q00, q01, q11, logCoef, residual, resGrads, resHess, resK, clos, fields, cond, localCoords);
      if (v !== null) return v;
    }
    if (residual.length === 0) {
      // everything fixed: the closure is a constant jet
      const v = resFn([]);
      const cj0 = cjMul(c, v);
      const out = termExpectation(cjScaleC(cj0, cr, ci), phi0, bx, by, q00, q01, q11, cond);
      this.stats.recipes++;
      return out[0];
    }
    if (residual.length === 1) {
      const g = resGrads[0];
      const h = resHess[0];
      // before transforming: can any harmonic of the residual axis pass the
      // cut with a unit coefficient? (the second-order magnitude, exact for
      // the quadratic phase)
      let best = -Infinity;
      for (let m = -resK[0]; m <= resK[0]; m++) {
        const lm = logMult(bx + TAU * m * g[0], by + TAU * m * g[1], q00 + TAU * m * h[0], q01 + TAU * m * h[1], q11 + TAU * m * h[2], cond);
        if (lm > best) best = lm;
      }
      if (best + logCoef < lnCut) {
        this.stats.skipped = (this.stats.skipped || 0) + 1;
        return 0;
      }
      const coef = this.residualCoef1(resFn, resK[0], residual[0], fields, clos, localCoords);
      const K = coef.K;
      this.stats.dfts++;
      let acc = 0;
      for (let m = -K; m <= K; m++) {
        const nbx = bx + TAU * m * g[0];
        const nby = by + TAU * m * g[1];
        const cre = coef.re[K + m];
        const cim = coef.im[K + m];
        const mag = Math.hypot(cre.v, cim.v);
        if (mag < 1e-12) continue;
        const nq00 = q00 + TAU * m * h[0];
        const nq01 = q01 + TAU * m * h[1];
        const nq11 = q11 + TAU * m * h[2];
        const lm = logMult(nbx, nby, nq00, nq01, nq11, cond);
        if (lm + logCoef + Math.log(mag) < lnCut) continue;
        const cj0 = cjMul(c, { re: cre, im: cim });
        const v = termExpectation(cjScaleC(cj0, cr, ci), phi0 + this.axisPhase(residual[0], m), nbx, nby, nq00, nq01, nq11, cond);
        this.stats.recipes++;
        if (this.trace) this.trace({ ks: [...ks], m, value: v[0], mag, e: -lm });
        acc += v[0];
      }
      return acc;
    }
    if (residual.length === 2) {
      const chain = this.chainResidual(c, cr, ci, phi0, bx, by, q00, q01, q11, logCoef, residual, resGrads, resHess, resK, fields, clos, cond, localCoords);
      if (chain !== null) return chain;
      // separable: every field and closure lives on one of the two axes,
      // so the transform is two one-axis transforms, each remembered by
      // the harmonics of the fields on its axis and reused across the other
      const nonLocalAxes = (el) => el.axes().filter((a) => !localCoords.has(a.id));
      const axisOf = (axesList) => {
        const ids = new Set(axesList.map((a) => a.id));
        if (ids.size !== 1) return -1;
        return residual.findIndex((a) => ids.has(a.id));
      };
      let separable = true;
      const sideF = fields.map(({ axis }) => axisOf(nonLocalAxes(axis.field)));
      const sideC = clos.map((cl) => axisOf(cl.axes.filter((a) => !localCoords.has(a.id))));
      if (sideF.some((i) => i < 0) || sideC.some((i) => i < 0)) separable = false;
      if (separable) {
        const parts = [0, 1].map((side) => {
          const axis = residual[side];
          const fs = fields.filter((_, i) => sideF[i] === side);
          const cs = clos.filter((_, i) => sideC[i] === side);
          const key = `sep|${axis.id}|${fs.map((f) => `${f.axis.id}:${f.k}`).join(',')}|${cs.map((cl) => cl.sig.length).join(',')}`;
          let coef = this._resCache.get(key);
          if (!coef) {
            const resFn1 = (cs1) => {
              const m = new Map(localCoords);
              m.set(axis.id, cs1[0]);
              let ph = 0;
              for (const { k, axis: fa } of fs) {
                const per = fa.kind === 'edge' ? fa.edgePeriod : 1;
                ph += (TAU * k * evalElement(fa.field, m).v) / per;
              }
              let re = Jet.c(Math.cos(ph));
              let im = Jet.c(Math.sin(ph));
              for (const cl of cs) {
                const cs2 = cl.axes.map((a) => (localCoords.has(a.id) ? localCoords.get(a.id) : cs1[0]));
                const j = cl.fn(cs2);
                re = re.mul(j);
                im = im.mul(j);
              }
              return { re, im };
            };
            coef = this.residualCoef1(resFn1, resK[side], axis, fs, cs, localCoords);
            this.stats.dfts++;
            this._resCache.set(key, coef);
          }
          return coef;
        });
        let acc = 0;
        const [c0, c1] = parts;
        for (let m0 = -c0.K; m0 <= c0.K; m0++) {
          const a0 = { re: c0.re[c0.K + m0], im: c0.im[c0.K + m0] };
          const mag0 = Math.hypot(a0.re.v, a0.im.v);
          if (mag0 < 1e-12) continue;
          for (let m1 = -c1.K; m1 <= c1.K; m1++) {
            const a1 = { re: c1.re[c1.K + m1], im: c1.im[c1.K + m1] };
            const mag = mag0 * Math.hypot(a1.re.v, a1.im.v);
            if (mag < 1e-12) continue;
            const nbx = bx + TAU * (m0 * resGrads[0][0] + m1 * resGrads[1][0]);
            const nby = by + TAU * (m0 * resGrads[0][1] + m1 * resGrads[1][1]);
            const nq00 = q00 + TAU * (m0 * resHess[0][0] + m1 * resHess[1][0]);
            const nq01 = q01 + TAU * (m0 * resHess[0][1] + m1 * resHess[1][1]);
            const nq11 = q11 + TAU * (m0 * resHess[0][2] + m1 * resHess[1][2]);
            if (logMult(nbx, nby, nq00, nq01, nq11, cond) + logCoef + Math.log(mag) < lnCut) continue;
            const cj0 = cjMul(c, cjMul(a0, a1));
            const v = termExpectation(cjScaleC(cj0, cr, ci), phi0 + this.axisPhase(residual[0], m0) + this.axisPhase(residual[1], m1), nbx, nby, nq00, nq01, nq11, cond);
            this.stats.recipes++;
            acc += v[0];
          }
        }
        return acc;
      }
      let K0 = resK[0];
      let K1 = resK[1];
      // a smooth closure's coefficients decay: probe a modest range first
      // and keep it when its outer ring is already below the cut
      if (K0 > 16 || K1 > 16) {
        const Kp0 = Math.min(K0, 16);
        const Kp1 = Math.min(K1, 16);
        const probe = fourierJet2(resFn, Kp0, Kp1, residual);
        let ring = 0;
        let peak = 0;
        for (let m0 = -probe.K0; m0 <= probe.K0; m0++)
          for (let m1 = -probe.K1; m1 <= probe.K1; m1++) {
            const idx = (m0 + probe.K0) * (2 * probe.K1 + 1) + (m1 + probe.K1);
            const mag = Math.hypot(probe.re[idx].v, probe.im[idx].v);
            peak = Math.max(peak, mag);
            if (Math.abs(m0) === probe.K0 || Math.abs(m1) === probe.K1) ring = Math.max(ring, mag);
          }
        if (ring < 0.1 * this.cut * Math.max(peak, 1e-300) || ring < 1e-12) {
          K0 = Kp0;
          K1 = Kp1;
          this._probeJet2 = probe;
        } else this._probeJet2 = null;
      } else this._probeJet2 = null;
      const cacheable = fields.length === 0 && residual.every((a) => a.kind !== 'edge') && localCoords.size === 0;
      const key = cacheable ? `${clos.map((cl) => cl.sig).join('*')}|${residual.map((a) => a.id).join(',')}|${roundK(K0)}|${roundK(K1)}` : null;
      let coef = key ? jet2Cache.get(key) : null;
      if (!coef && this._probeJet2 && this._probeJet2.K0 === roundK(K0) && this._probeJet2.K1 === roundK(K1)) coef = this._probeJet2;
      if (!coef) {
        coef = fourierJet2(resFn, K0, K1, residual);
        if (key) {
          if (jet2Cache.size > 200) jet2Cache.clear();
          jet2Cache.set(key, coef);
        }
      }
      this.stats.dfts++;
      let acc = 0;
      const R0 = coef.K0;
      const R1 = coef.K1;
      for (let m0 = -K0; m0 <= K0; m0++)
        for (let m1 = -K1; m1 <= K1; m1++) {
          const idx = (m0 + R0) * (2 * R1 + 1) + (m1 + R1);
          const cre = coef.re[idx];
          const cim = coef.im[idx];
          const mag = Math.hypot(cre.v, cim.v);
          if (mag < 1e-12) continue;
          const nbx = bx + TAU * (m0 * resGrads[0][0] + m1 * resGrads[1][0]);
          const nby = by + TAU * (m0 * resGrads[0][1] + m1 * resGrads[1][1]);
          const nq00 = q00 + TAU * (m0 * resHess[0][0] + m1 * resHess[1][0]);
          const nq01 = q01 + TAU * (m0 * resHess[0][1] + m1 * resHess[1][1]);
          const nq11 = q11 + TAU * (m0 * resHess[0][2] + m1 * resHess[1][2]);
          if (logMult(nbx, nby, nq00, nq01, nq11, cond) + logCoef + Math.log(mag) < lnCut) continue;
          const cj0 = cjMul(c, { re: cre, im: cim });
          const v = termExpectation(cjScaleC(cj0, cr, ci), phi0 + this.axisPhase(residual[0], m0) + this.axisPhase(residual[1], m1), nbx, nby, nq00, nq01, nq11, cond);
          this.stats.recipes++;
          acc += v[0];
        }
      return acc;
    }
    throw new Error(`residual of ${residual.length} axes not supported yet: [${residual.map((a) => `${a.label}#${a.id}${a.field ? '(field)' : ''}`).join(', ')}] closures [${clos.map((cl) => cl.sig.slice(0, 160)).join(' | ')}] fields [${fields.map((f) => `${f.axis.label}#${f.axis.id}`).join(', ')}]`);
  }
}

// Fourier coefficients of a jet-valued complex closure of one residual axis
// (sampled, with jump awareness on the real part's value)
const fourierJet1 = (fn, K, axis) => {
  const M = Math.max(64, 2 * K + 2);
  const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
  const wrap = axis.kind === 'edge' ? (u) => axis.center + (u - Math.round(u)) * per : (u) => u;
  const samples = [];
  for (let i = 0; i < M; i++) samples.push(fn([wrap(i / M)]));
  // jump detection on the value
  const re = [];
  const im = [];
  for (let k = -K; k <= K; k++) {
    let accR = J0;
    let accI = J0;
    for (let i = 0; i < M; i++) {
      const ang = (-TAU * k * i) / M;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const { re: r, im: m } = samples[i];
      // (r + i m)(c + i s)
      accR = accR.add(r.scale(c).sub(m.scale(s)));
      accI = accI.add(r.scale(s).add(m.scale(c)));
    }
    re.push(accR.scale(1 / M));
    im.push(accI.scale(1 / M));
  }
  return { re, im, K };
};
// Coefficients over two residual axes: rows along axis 0 (uniform, dense),
// and along axis 1 a jump-aware node set per row; K rounded up to a power of
// two so the result caches across pixels.
const roundK = (K) => {
  let r = 8;
  while (r < K) r *= 2;
  return r;
};
const fourierJet2 = (fn, K0in, K1in, axes) => {
  const K0 = roundK(K0in);
  const K1 = roundK(K1in);
  if (DEBUG) console.log(`      jet2 transform K0 ${K0} K1 ${K1} axes ${axes.map((a) => a.label + '#' + a.id + (a.kind === 'edge' ? 'E' : '')).join(',')}`);
  const wrap = (a) => (a.kind === 'edge' ? (u) => a.center + (u - Math.round(u)) * a.edgePeriod : (u) => u);
  const w0 = wrap(axes[0]);
  const w1 = wrap(axes[1]);
  const n1 = 2 * K1 + 1;
  // the jumps along axis 1 on the row at u0
  const rowJumps = (u0) => {
    const x0 = w0(u0);
    const g = (u1) => fn([x0, w1(u1)]).re.v;
    const Ms = 64;
    const vals = new Float64Array(Ms + 1);
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let j = 0; j <= Ms; j++) {
      vals[j] = g(j / Ms);
      vmin = Math.min(vmin, vals[j]);
      vmax = Math.max(vmax, vals[j]);
    }
    const jumps = [];
    for (let j = 0; j < Ms; j++) {
      const d = Math.abs(vals[j + 1] - vals[j]);
      if (d > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
        let a = j / Ms;
        let b = (j + 1) / Ms;
        const f0 = vals[j];
        for (let it = 0; it < 40; it++) {
          const xm = (a + b) / 2;
          if (Math.abs(g(xm) - f0) > d / 2) b = xm;
          else a = xm;
        }
        if (Math.abs(g(b) - g(a)) < 0.5 * d) continue;
        jumps.push((a + b) / 2);
      }
    }
    return jumps;
  };
  // the row's coefficients in m1 as jets on typed arrays: six components
  // (v, gx, gy, hxx, hxy, hyy) per harmonic, real and imaginary parts
  const rowR = new Float64Array(n1 * 6);
  const rowI = new Float64Array(n1 * 6);
  const rr = new Float64Array(6);
  const mm = new Float64Array(6);
  const rowCoefs = (u0) => {
    const x0 = w0(u0);
    const g = (u1) => fn([x0, w1(u1)]);
    const jumps = rowJumps(u0);
    const nodes = [];
    if (jumps.length === 0) {
      const M1 = Math.max(64, 2 * K1 + 2);
      for (let j = 0; j < M1; j++) nodes.push([j / M1, 1 / M1]);
    } else {
      for (let q = 0; q < jumps.length; q++) {
        const a = jumps[q];
        const b = q + 1 < jumps.length ? jumps[q + 1] : jumps[0] + 1;
        const len = b - a;
        if (len < 1e-12) continue;
        const panels = Math.max(1, Math.ceil(len * (K1 / 3 + 1)));
        for (let pq = 0; pq < panels; pq++) {
          const pa = a + (len * pq) / panels;
          const pb = a + (len * (pq + 1)) / panels;
          const half = (pb - pa) / 2;
          const mid = (pa + pb) / 2;
          for (const [node, wt] of GL8) nodes.push([mid + half * node, wt * half]);
        }
      }
    }
    rowR.fill(0);
    rowI.fill(0);
    for (const [u1, wt] of nodes) {
      const { re, im } = g(u1);
      rr[0] = re.v * wt;
      rr[1] = re.gx * wt;
      rr[2] = re.gy * wt;
      rr[3] = re.hxx * wt;
      rr[4] = re.hxy * wt;
      rr[5] = re.hyy * wt;
      mm[0] = im.v * wt;
      mm[1] = im.gx * wt;
      mm[2] = im.gy * wt;
      mm[3] = im.hxx * wt;
      mm[4] = im.hxy * wt;
      mm[5] = im.hyy * wt;
      let cr = 1;
      let ci = 0;
      const c0 = Math.cos(-TAU * u1);
      const s0 = Math.sin(-TAU * u1);
      // m1 from 0 upward and downward by conjugation of the phasor
      for (let m1 = 0; m1 <= K1; m1++) {
        const op = (m1 + K1) * 6;
        const on = (K1 - m1) * 6;
        for (let q = 0; q < 6; q++) {
          rowR[op + q] += rr[q] * cr - mm[q] * ci;
          rowI[op + q] += rr[q] * ci + mm[q] * cr;
          if (m1 > 0) {
            rowR[on + q] += rr[q] * cr + mm[q] * ci;
            rowI[on + q] += mm[q] * cr - rr[q] * ci;
          }
        }
        const nr = cr * c0 - ci * s0;
        ci = cr * s0 + ci * c0;
        cr = nr;
      }
    }
  };
  // The outer direction, cut where the number of jumps on a row changes
  // (a square-root singularity of the row's coefficients) and where the
  // closure jumps along u0, integrated on cosine-mapped Gauss-Legendre
  // sub-panels between.
  const MS0 = 64;
  const counts = new Int32Array(MS0 + 1);
  for (let i = 0; i <= MS0; i++) counts[i] = rowJumps(i / MS0).length;
  const sing = [];
  for (let i = 0; i < MS0; i++) {
    if (counts[i] === counts[i + 1]) continue;
    let a = i / MS0;
    let b = (i + 1) / MS0;
    const ca = counts[i];
    for (let it = 0; it < 30; it++) {
      const m = (a + b) / 2;
      if (rowJumps(m).length === ca) a = m;
      else b = m;
    }
    sing.push((a + b) / 2);
  }
  for (const u1c of [0.13, 0.41, 0.67, 0.89]) for (const j of locateJumps((u0) => fn([w0(u0), w1(u1c)]).re.v, 64)) sing.push(j);
  sing.sort((p, q) => p - q);
  const cuts = [];
  for (const s of sing) if (cuts.length === 0 || s - cuts[cuts.length - 1] > 1e-9) cuts.push(s);
  const pieces = [];
  if (cuts.length === 0) pieces.push([0, 1]);
  else for (let i = 0; i < cuts.length; i++) pieces.push([cuts[i], i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + 1]);
  const gl = gaussLegendre(16);
  const hmax = Math.min(0.25, 20 / (Math.PI * (K0 + K1 / 2 + 2)));
  const n0 = 2 * K0 + 1;
  const accR = new Float64Array(n0 * n1 * 6);
  const accI = new Float64Array(n0 * n1 * 6);
  for (const [p, q] of pieces) {
    if (q - p < 1e-12) continue;
    const nsub = Math.max(1, Math.ceil((q - p) / hmax));
    const h = (q - p) / nsub;
    for (let s = 0; s < nsub; s++) {
      const lo = p + s * h;
      for (let i = 0; i < gl.x.length; i++) {
        const tau = 0.5 * (gl.x[i] + 1);
        const u0 = lo + (h * (1 - Math.cos(Math.PI * tau))) / 2;
        const w = 0.5 * gl.w[i] * ((h * Math.PI) / 2) * Math.sin(Math.PI * tau);
        if (w < 1e-18) continue;
        rowCoefs(u0 - Math.floor(u0));
        for (let m0 = -K0; m0 <= K0; m0++) {
          const ang = -TAU * m0 * u0;
          const c = w * Math.cos(ang);
          const sn = w * Math.sin(ang);
          const base = (m0 + K0) * n1 * 6;
          for (let t = 0; t < n1 * 6; t++) {
            accR[base + t] += rowR[t] * c - rowI[t] * sn;
            accI[base + t] += rowR[t] * sn + rowI[t] * c;
          }
        }
      }
    }
  }
  const re = new Array(n0 * n1);
  const im = new Array(n0 * n1);
  for (let idx = 0; idx < n0 * n1; idx++) {
    const o = idx * 6;
    re[idx] = new Jet(accR[o], accR[o + 1], accR[o + 2], accR[o + 3], accR[o + 4], accR[o + 5]);
    im[idx] = new Jet(accI[o], accI[o + 1], accI[o + 2], accI[o + 3], accI[o + 4], accI[o + 5]);
  }
  return { re, im, K0, K1 };
};

// a structural key of an element: its terms' coefficients and factor
// signatures, for recognising equal channels
export const elementKey = (el) => elementSig(el);
export const resetAxes = () => {
  axisCounter = 0;
  axisRegistry.clear();
};
export { evalElement, TAU, stepsumTables as __stepsumTables, stepTransform1 as __stepTransform1, stepTransform2 as __stepTransform2, makeB as __makeB, STEP_PIECES as __STEP_PIECES, fft2 as __fft2 };
