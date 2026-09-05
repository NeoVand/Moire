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
const axisKey = (count, field, kind) => {
  const r = (v) => (Math.abs(v) < 1e-300 ? '0' : v.toPrecision(12));
  return `${kind}|${r(count.v)},${r(count.gx)},${r(count.gy)},${r(count.hxx)},${r(count.hxy)},${r(count.hyy)}|${field ? elementSig(field) : ''}`;
};
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
const evalElement = (el, coords) => {
  if (!el._axes) el._axes = el.axes();
  const key = el._axes.map((a) => coords.get(a.id));
  const m = coords.get(-1);
  if (m) key.push(m[0], m[1]);
  if (el._lastKey && sameCoords(key, el._lastKey)) return el._lastVal;
  const v = evalElementRaw(el, coords);
  el._lastKey = key;
  el._lastVal = v;
  return v;
};
const evalElementRaw = (el, coords) => {
  let acc = J0;
  for (const t of el.terms) {
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
    const sig = `sum(${g.map((t) => `${t.c.re.v.toPrecision(6)}*${t.f.map((f) => f.sig).join('*')}`).join('+')})`;
    rest.push({ c: cj(J1, J0), f: [picFactor(axis, fn, sig)] });
  }
  return rest;
};
const jetIsConst = (j) => j.gx === 0 && j.gy === 0 && j.hxx === 0 && j.hxy === 0 && j.hyy === 0;
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
  if (X.length === 0 || X.length > 2) return null;
  // with one Phi axis over one X axis the plain closure (one axis, its
  // field over the other) is transformed exactly by the residual paths and
  // has been measured; the rule is for the structures those cannot reach
  if (X.length + phis.size < 3) return null;
  const phiList = [...phis.values()].map((q) => ({
    axis: q.axis,
    parts: q.parts,
    bare: q.axis.field ? makeAxis(q.axis.count, null, 'periodic', `${q.axis.label}°`).axis : q.axis,
    B: makeB(q.parts),
  }));
  const axes = [...X, ...phiList.map((q) => q.bare)];
  const nX = X.length;
  const fn = (cs, coords) => {
    const m = new Map();
    const disp = coords ? coords.get(-1) : undefined;
    if (disp) m.set(-1, disp);
    X.forEach((a, i) => m.set(a.id, cs[i]));
    const at = (el) => {
      const j = evalElement(el, m);
      return disp ? jetAt(j, disp) : j.v;
    };
    let total = c + (A.terms.length ? at(A) : 0);
    phiList.forEach((q, j) => {
      const phi = cs[nX + j] + (q.axis.field ? at(q.axis.field) : 0);
      for (const { beta, fn: pf } of q.parts) total += beta * pf(phi);
    });
    return Jet.c(g(total));
  };
  const sig = `${name}⊕(${c.toPrecision(7)}+${elementSig(A)}|${phiList.map((q) => `${q.axis.label}${q.axis.id}:${q.axis.field ? elementSig(q.axis.field) : ''}:${q.parts.map((pp) => `${pp.beta.toPrecision(6)}*${pp.sig}`).join('+')}`).join(';')})`;
  const clo = cloFactor(axes, fn, sig);
  clo.stepsum = { g, gp, c, A, X, phis: phiList, sig };
  return new Element([{ c: cj(J1, J0), f: [clo] }]);
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
  const NS = nX === 1 ? 1024 : 96;
  for (let i = 0; i < NS; i++)
    for (let j = 0; j < (nX === 2 ? NS : 1); j++) {
      const m = new Map();
      m.set(S.X[0].id, (i + 0.5) / NS);
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
    const sig = `${name}(${el.terms.map((t) => `${t.c.re.v.toPrecision(6)}*${t.f.map((f) => f.sig).join('*') || '1'}`).join('+')})`;
    return new Element([{ c: cj(J1, J0), f: [picFactor(single, fn, sig)] }]);
  }
  // otherwise a closure over all axes the element touches directly (fields
  // are evaluated inside)
  const direct = directAxes(el);
  const fn = (cs) => {
    const m = new Map();
    direct.forEach((a, i) => m.set(a.id, cs[i]));
    return jetFn(evalElement(el, m));
  };
  return new Element([{ c: cj(J1, J0), f: [cloFactor(direct, fn, `${name}(${elementSig(el)})`)] }]);
};
// a structural signature: coefficient values and factor signatures; the same
// string across pixels exactly when the closure is the same function
const elementSig = (el) =>
  el.terms
    .map((t) => `${t.c.re.v.toPrecision(7)}${t.c.im.v !== 0 ? '+' + t.c.im.v.toPrecision(7) + 'i' : ''}*${t.f.map((f) => (f.kind === 'pic' ? `${f.sig}[${f.axis.label}${f.axis.id}]` : f.sig)).join('*') || '1'}`)
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
  if (s.gradNorm() < 1e-12 && P.terms.length > 0) {
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
  if (s.gradNorm() < 1e-12 && P.terms.length > 0) {
    const c = s.v;
    const sos = stepOfSum(P, c, (u) => (u >= 0 ? 1 : 0), 'step');
    if (sos) return sos;
    return collapseWith(P, (j) => Jet.c(j.v + c >= 0 ? 1 : 0), 'step∘');
  }
  if (P.terms.length === 0 && s.gradNorm() < 1e-12) return Element.const(s.v >= 0 ? 1 : 0);
  const { axis } = makeAxis(s, P.terms.length ? P : null, 'edge', 'step');
  // the picture of an edge axis is a step at zero of the raw count; the
  // periodisation is applied at evaluation, where the period is known
  return new Element([{ c: cj(J1, J0), f: [picFactor(axis, (u) => (u >= 0 ? 1 : 0), 'step')] }]);
};
// a non-smooth function of the raw count on an edge axis, or composed on a
// picture; g is the function of the raw value
const edgePrimitive = (name, g) => (x) => {
  const el = lift(x);
  const s = el.smoothPart();
  const P = el.pictured();
  if (s.gradNorm() < 1e-12 && P.terms.length > 0) {
    const c = s.v;
    const sos = stepOfSum(P, c, g, name);
    if (sos) return sos;
    return collapseWith(P, (j) => Jet.c(g(j.v + c)), name + '∘');
  }
  if (P.terms.length === 0 && s.gradNorm() < 1e-12) return Element.const(g(s.v));
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
    this.stats = { terms: 0, recipes: 0, dfts: 0, overflow: 0, localNodes: 0 };
  }
  axisSigma(axis) {
    const p = axis.kind === 'edge' ? axis.edgePeriod : 1;
    return (this.sig * axis.count.gradNorm()) / p;
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
      const s = this.sig * axis.count.gradNorm();
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
    // axes with no rate at all (a count at its stationary point) are
    // frozen: their coordinate is a number, the count at the point
    const frozen = axes.filter((a) => a.count.gradNorm() < 1e-9);
    // local axes: axes whose pixel-sigma is small in their own scale (an
    // edge with a field counts in units of the field's amplitude); those
    // without a field over another local axis go first, so that the second
    // axis's jumps can be located with the first one fixed
    const local = axes.filter((a) => a.count.gradNorm() >= 1e-9 && this.axisSigma(a) < this.localSigma);
    // an axis nearly parallel to a faster axis of the term is local too
    // while its own sigma is moderate: along their common direction the
    // spectral sum is a station family without end, and quadrature is cheap
    for (const a of axes) {
      if (local.includes(a) || a.count.gradNorm() < 1e-9 || this.axisSigma(a) >= this.parallelSigma) continue;
      const ga = this.axisRate(a);
      const na = Math.hypot(ga[0], ga[1]);
      for (const o of axes) {
        if (o === a || o.count.gradNorm() < 1e-9 || this.axisSigma(o) <= this.axisSigma(a)) continue;
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
      for (const o of frozen) base.set(o.id, o.count.v);
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
      const sigA = this.axisSigma(a) * this.axisScale(a);
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
      const coord = field && coordsAt ? (u) => u + evalElement(field, coordsAt(u)).v : (u) => u;
      // sampling follows the field's variation along the axis
      let samples = 12;
      if (field && coordsAt) samples = 24;
      jumps = cutsOnPath([{ coord, levels: [...levels], periodic: axis.kind !== 'edge', samples }], lo, hi);
    }
    if (multi.length) {
      const at = (u) => {
        let v = 1;
        for (const f of multi) v *= f.fn(f.axes.map((x) => axisCoordinate(x, coordsAt(u)))).v;
        return v;
      };
      jumps = jumps.concat(scanJumps(at, lo, hi));
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
                `${f.sig}@${u0.toPrecision(8)}`,
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
  // The sum for a term whose closures include steps of sums, under any
  // split of the axes. The residual axes are the steps' bare Phi axes and
  // the rest, X (at most two). For each recipe of the Phi harmonics the
  // steps contribute their tables T_m(a_i(x)) e^{2 pi i m.G_i(x)}, the
  // pictures with fields their phase e^{2 pi i k G(x)} and the other
  // closures their values, all functions on the X torus whose transform
  // is taken by FFT (remembered across pixels when nothing local enters
  // it) or, with no residual X, read at the fixed coordinates. A local Phi
  // axis is a number and its picture joins its step's a. Returns null for
  // a structure outside this.
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
    const X = residual.filter((a) => !bareOwner.has(a.id));
    if (X.length > 2) return this.stepsumNo(`${X.length} X axes`);
    const xIds = new Set(X.map((a) => a.id));
    const known = (a) => xIds.has(a.id) || localCoords.has(a.id);
    for (const cl of steps) for (const a of cl.stepsum.X) if (!known(a)) return this.stepsumNo(`X axis ${a.label}#${a.id} of a step neither residual nor local`);
    for (const cl of steps) for (const q of cl.stepsum.phis) if (!resIds.has(q.bare.id) && !localCoords.has(q.bare.id)) return this.stepsumNo('a Phi axis neither residual nor local');
    for (const o of others) for (const a of o.axes) if (!known(a)) return this.stepsumNo(`closure ${o.sig.slice(0, 40)} reaches ${a.label}#${a.id}`);
    for (const f of fields) for (const a of f.axis.field.axes()) if (!known(a)) return this.stepsumNo(`field of ${f.axis.label}#${f.axis.id} reaches ${a.label}#${a.id}`);
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
    // the residual Phi axes in order, the last one innermost
    const idxOf = (id) => residual.findIndex((a) => a.id === id);
    const phis = [];
    parts.forEach((P, pi) => {
      P.phiR.forEach((j, r) => {
        const bare = P.S.phis[j].bare;
        const idx = idxOf(bare.id);
        phis.push({ pi, j, r, bare, g: resGrads[idx], h: resHess[idx], K: Math.min(resK[idx], P.tables.Ms[r]) });
      });
    });
    const nPhi = phis.length;
    if (nPhi === 0) return this.stepsumNo('no residual Phi axis');
    const gX = X.map((a) => resGrads[idxOf(a.id)]);
    const hX = X.map((a) => resHess[idxOf(a.id)]);
    const KW = this.stepsumKW;
    const KX = X.map((a) => Math.min(resK[idxOf(a.id)], KW));
    const nXR = X.length;
    // a of a step at full X coordinates: the local Phi pictures join it
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
      for (const o of others) v *= o.fn(o.axes.map((a) => coords.get(a.id))).v;
      return v;
    };
    // the table index of a part at a Phi recipe
    const qOf = (P, m) => {
      const Ms = P.tables.Ms;
      let m0 = 0;
      let m1 = 0;
      phis.forEach((ph, i) => {
        if (ph.pi !== parts.indexOf(P)) return;
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
    // the recipes of the Phi harmonics, the last axis innermost
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
    if (nXR === 0) {
      const as = parts.map((P) => aAt(P, localCoords));
      const G = GAt(localCoords);
      const ov = othersAt(localCoords);
      const fph = fieldPhaseAt(localCoords);
      if (Math.abs(ov) < 1e-15) return 0;
      for (const mm of ms) {
        let tr = ov;
        let ti = 0;
        parts.forEach((P, pi) => {
          if (!P.tables) return;
          const [r, i] = stepsumT(P.tables, qOf(P, mm), as[pi]);
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
        const mag = Math.hypot(coefR, coefI);
        if (mag < 1e-13) continue;
        const R = recipe(mm);
        if (logMult(R.mbx, R.mby, R.mq00, R.mq01, R.mq11, cond) + logCoef + Math.log(mag) < lnCut) continue;
        const v = termExpectation(cjScaleC(cjScaleC(c, coefR, coefI), cr, ci), R.phase, R.mbx, R.mby, R.mq00, R.mq01, R.mq11, cond);
        this.stats.recipes++;
        acc += v[0];
      }
      return acc;
    }
    // X residual: the factors on a midpoint grid of the residual X torus;
    // the grid is remembered on the first step's tables when nothing local
    // enters it
    const cacheable = localCoords.size === 0 || [...localCoords.keys()].every((id) => !steps.some((cl) => cl.axes.some((a) => a.id === id)) && !others.some((o) => o.axes.some((a) => a.id === id)) && !fields.some((f) => f.axis.field.axes().some((a) => a.id === id)));
    const NG = cacheable ? this.stepsumNG : this.stepsumNGlocal;
    const home = parts.find((P) => P.tables).tables;
    const gridKey = `${X.map((a) => a.id).join(',')}|${NG}|${steps.map((cl) => cl.stepsum.sig + ':' + parts[steps.indexOf(cl)].mask).join('*')}|${others.map((o) => o.sig).join('*')}`;
    let grid = cacheable ? home.xGrids.get(gridKey) : null;
    if (!grid) {
      const n = nXR === 1 ? NG : NG * NG;
      const Og = new Float64Array(n);
      const Gg = phis.map(() => new Float64Array(n));
      const los = parts.map((P) => (P.tables ? new Int32Array(n) : null));
      const frs = parts.map((P) => (P.tables ? new Float64Array(n) : null));
      let oMax = 0;
      const coords = new Map(localCoords);
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
    // the field pictures' phase on the grid, by their harmonics
    const fkey = fields.map((f) => `${f.axis.id}:${f.k}`).join(',');
    let fph = grid.fieldPhases.get(fkey);
    if (!fph) {
      const n = grid.n;
      const pr = new Float64Array(n);
      const pi2 = new Float64Array(n);
      if (fields.length === 0) pr.fill(1);
      else {
        const coords = new Map(localCoords);
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
    const KY = nXR === 2 ? KX[1] : 0;
    const aS = 1 / (cond.sig * cond.sig);
    const rowNorm = (h) => Math.max(Math.abs(h[0]) + Math.abs(h[1]), Math.abs(h[1]) + Math.abs(h[2]));
    const kList = (R, budget) => {
      if (budget <= 0) return null;
      // the curvature of a recipe grows with |k|: lam(k) <= lam0 + sum_i
      // rho_i |k_i|, so the bound |b(k)|^2 <= s2 (a^2 + lam(k)^2) is a
      // quadratic inequality in ky for each kx, solved on each sign of ky
      const lam0 = rowNorm([R.mq00, R.mq01, R.mq11]);
      const rho = hX.map((h) => TAU * rowNorm(h));
      const s2 = (2 * budget) / aS;
      // b(k) = b0 + cx kx + cy ky as vectors (dim 2) or scalars along e (dim 1)
      let b0x;
      let b0y;
      let cxx;
      let cxy;
      let cyx;
      let cyy;
      if (cond.dim === 2) {
        b0x = R.mbx;
        b0y = R.mby;
        cxx = TAU * gX[0][0];
        cxy = TAU * gX[0][1];
        cyx = nXR === 2 ? TAU * gX[1][0] : 0;
        cyy = nXR === 2 ? TAU * gX[1][1] : 0;
      } else {
        const ex = cond.e[0];
        const ey = cond.e[1];
        const mx = cond.m[0];
        const my = cond.m[1];
        b0x = (R.mbx + R.mq00 * mx + R.mq01 * my) * ex + (R.mby + R.mq01 * mx + R.mq11 * my) * ey;
        b0y = 0;
        const along = (g, h) => TAU * (g[0] * ex + g[1] * ey + (h[0] * mx + h[1] * my) * ex + (h[1] * mx + h[2] * my) * ey);
        cxx = along(gX[0], hX[0]);
        cxy = 0;
        cyx = nXR === 2 ? along(gX[1], hX[1]) : 0;
        cyy = 0;
      }
      // the set {y : A y^2 + B y + C <= 0} restricted to sgn y >= 0 and
      // [-KY, KY], as [lo, hi] (empty when lo > hi)
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
        // A < 0: the set is everything outside the roots (or everything)
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
      for (let kx = -KX[0]; kx <= KX[0]; kx++) {
        const px = b0x + cxx * kx;
        const py = b0y + cxy * kx;
        const L = lam0 + rho[0] * Math.abs(kx);
        if (nXR === 1) {
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
    };
    for (const mm of ms) {
      let tm = grid.oMax;
      const qs = parts.map((P) => (P.tables ? qOf(P, mm) : -1));
      parts.forEach((P, pi) => {
        if (P.tables) tm *= P.tables.tmax[qs[pi]];
      });
      if (tm < 1e-13) continue;
      const R = recipe(mm);
      const ks = kList(R, logCoef + Math.log(tm) - lnCut);
      if (!ks) continue;
      const ckey = `${mm.join(',')}|${fkey}`;
      let F = grid.coefs.get(ckey);
      if (!F) {
        const n = grid.n;
        const { zr, zi, re, im, Og } = grid;
        // e^{2 pi i m.G(x)} on the grid, advanced by one step of the last
        // Phi harmonic from the previous recipe when they differ by that
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
            // times the field pictures' phase
            zr[idx] = cph * fph.re[idx] - sph * fph.im[idx];
            zi[idx] = cph * fph.im[idx] + sph * fph.re[idx];
          }
        }
        grid.zm = mm.slice();
        grid.zf = fkey;
        // the product of the tables at a_i(x), times the other closures
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
          const coefR = F.re[w];
          const coefI = F.im[w];
          const mag = Math.hypot(coefR, coefI);
          if (mag < 1e-13) continue;
          const r = kRates(R, kx, ky);
          if (logMult(r[0], r[1], r[2], r[3], r[4], cond) + logCoef + Math.log(mag) < lnCut) continue;
          const ph2 = R.phase + this.axisPhase(X[0], kx) + (nXR === 2 ? this.axisPhase(X[1], ky) : 0);
          const v = termExpectation(cjScaleC(cjScaleC(c, coefR, coefI), cr, ci), ph2, r[0], r[1], r[2], r[3], r[4], cond);
          this.stats.recipes++;
          acc += v[0];
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
    if (clos.some((cl) => cl.stepsum)) {
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
      const K0 = resK[0];
      const K1 = resK[1];
      const cacheable = fields.length === 0 && residual.every((a) => a.kind !== 'edge') && localCoords.size === 0;
      const key = cacheable ? `${clos.map((cl) => cl.sig).join('*')}|${residual.map((a) => a.id).join(',')}|${roundK(K0)}|${roundK(K1)}` : null;
      let coef = key ? jet2Cache.get(key) : null;
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
        // a steep slope shrinks with the bracket, a jump does not
        if (Math.abs(g(b) - g(a)) < 0.5 * d) continue;
        jumps.push((a + b) / 2);
      }
    }
    return jumps;
  };
  // the row's coefficients in m1 (jets), by Gauss-Legendre between its jumps
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
    const rowR = new Array(n1).fill(J0);
    const rowI = new Array(n1).fill(J0);
    for (const [u1, wt] of nodes) {
      const { re, im } = g(u1);
      const r = re.scale(wt);
      const m = im.scale(wt);
      let cr = 1;
      let ci = 0;
      const c0 = Math.cos(-TAU * u1);
      const s0 = Math.sin(-TAU * u1);
      // m1 from 0 upward and downward by conjugation of the phasor
      for (let m1 = 0; m1 <= K1; m1++) {
        rowR[m1 + K1] = rowR[m1 + K1].add(r.scale(cr).sub(m.scale(ci)));
        rowI[m1 + K1] = rowI[m1 + K1].add(r.scale(ci).add(m.scale(cr)));
        if (m1 > 0) {
          rowR[K1 - m1] = rowR[K1 - m1].add(r.scale(cr).add(m.scale(ci)));
          rowI[K1 - m1] = rowI[K1 - m1].add(m.scale(cr).sub(r.scale(ci)));
        }
        const nr = cr * c0 - ci * s0;
        ci = cr * s0 + ci * c0;
        cr = nr;
      }
    }
    return { rowR, rowI, jumps: jumps.length };
  };
  // The outer direction. Where the number of jumps on a row changes, a
  // jump curve is tangent to the rows and the row's coefficients have a
  // square-root singularity in u0; where the closure jumps along u0 they
  // jump. Both are located and the circle of u0 is cut there; each piece is
  // integrated on cosine-mapped Gauss-Legendre sub-panels, which are exact
  // at square-root ends.
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
  const re = new Array(n0 * n1).fill(J0);
  const im = new Array(n0 * n1).fill(J0);
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
        const { rowR, rowI } = rowCoefs(u0 - Math.floor(u0));
        for (let m0 = -K0; m0 <= K0; m0++) {
          const ang = -TAU * m0 * u0;
          const c = w * Math.cos(ang);
          const sn = w * Math.sin(ang);
          const base = (m0 + K0) * n1;
          for (let m1 = 0; m1 < n1; m1++) {
            const r = rowR[m1];
            const m = rowI[m1];
            re[base + m1] = re[base + m1].add(r.scale(c).sub(m.scale(sn)));
            im[base + m1] = im[base + m1].add(r.scale(sn).add(m.scale(c)));
          }
        }
      }
    }
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
