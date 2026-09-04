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
const cloFactor = (axes, fn, sig) => ({ kind: 'clo', axes, fn, sig });

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

// evaluate an element at torus coordinates (Map axisId -> u in periods) as a Jet
const evalElement = (el, coords) => {
  let acc = J0;
  for (const t of el.terms) {
    let v = t.c.re;
    let ok = true;
    for (const f of t.f) {
      if (f.kind === 'pic') {
        const u = axisCoordinate(f.axis, coords);
        v = v.scale(f.fn(u));
      } else {
        const cs = f.axes.map((a) => axisCoordinate(a, coords));
        const r = f.fn(cs);
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
const axisCoordinate = (axis, coords) => {
  if (axis.alias) return axis.alias.mult * axisCoordinate(axis.alias.axis, coords);
  let u = coords.get(axis.id);
  if (u === undefined) throw new Error(`no coordinate for axis ${axis.label}#${axis.id}`);
  if (axis.field) u += evalElement(axis.field, coords).v;
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
    for (let i = 0; i < out.length; i++) {
      const f = out[i];
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
    this.localPanel = 3; // Gauss-Legendre panel width along a local axis, in pixel-sigmas of it
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
  pointValue(t, m, localCoords) {
    const coords = new Map(localCoords);
    for (const a of this.termAxes(t)) if (!coords.has(a.id)) coords.set(a.id, this.countAt(a, m));
    const j = t.c.re;
    let v = j.v + j.gx * m[0] + j.gy * m[1] + 0.5 * (j.hxx * m[0] * m[0] + 2 * j.hxy * m[0] * m[1] + j.hyy * m[1] * m[1]);
    for (const f of t.f) {
      if (f.kind === 'pic') v *= f.fn(axisCoordinate(f.axis, coords));
      else v *= f.fn(f.axes.map((a) => axisCoordinate(a, coords))).v;
      if (v === 0) break;
    }
    this.stats.recipes++;
    return v;
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
  expect(el) {
    let total = 0;
    for (const t of el.terms) {
      const t0 = DEBUG ? performance.now() : 0;
      const d0 = this.stats.dfts;
      const r0 = this.stats.recipes;
      const v = this.expectTerm(t);
      if (DEBUG) {
        const axes = this.termAxes(t).map((a) => `${a.label}#${a.id}${a.kind === 'edge' ? 'E' : ''}(s=${this.axisSigma(a).toExponential(1)}${a.field ? ',F' : ''})`);
        console.log(`    term ${t.f.map((f) => (f.kind === 'pic' ? `pic[${f.axis.label}#${f.axis.id}]` : `clo[${f.axes.map((a) => a.label + '#' + a.id).join(',')}]`)).join('*') || '1'} coef ${t.c.re.v.toExponential(2)} axes ${axes.join(' ')} -> ${v.toExponential(3)} dfts ${this.stats.dfts - d0} recipes ${this.stats.recipes - r0} ${(performance.now() - t0).toFixed(0)} ms`);
      }
      total += v;
    }
    return total;
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
  expectTerm(t) {
    this.stats.terms++;
    this._resCache = new Map();
    t = this.resolveTerm(t);
    if (t.f.length === 0) {
      const j = t.c.re;
      return j.v + 0.5 * this.sig * this.sig * (j.hxx + j.hyy);
    }
    let axes = this.termAxes(t);
    for (const a of axes) this.prepareAxis(a);
    // a local axis whose only appearance is a picture constant over the
    // reach contributes that constant and is dropped
    let factors = t.f;
    let coefRe = t.c.re;
    let coefIm = t.c.im;
    let changed = false;
    for (const a of axes) {
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
      axes = this.termAxes(t);
    }
    // axes with no rate at all (a count at its stationary point) are
    // frozen: their coordinate is a number, the count at the point
    const frozen = axes.filter((a) => a.count.gradNorm() < 1e-9);
    // local axes: axes whose pixel-sigma is small in their own scale (an
    // edge with a field counts in units of the field's amplitude); those
    // without a field over another local axis go first, so that the second
    // axis's jumps can be located with the first one fixed
    const local = axes.filter((a) => a.count.gradNorm() >= 1e-9 && this.axisSigma(a) < this.localSigma);
    if (local.length === 0) {
      const base = new Map();
      for (const o of frozen) base.set(o.id, o.count.v);
      return this.spectral(t, { dim: 2, sig: this.sig }, base);
    }
    const localIds = new Set(local.map((a) => a.id));
    const fieldOnLocal = (a) => !!a.field && a.field.axes().some((x) => localIds.has(x.id));
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
    const nodesA = this.localNodes(t, a, null);
    let acc = 0;
    if (!b) {
      const sigA = this.axisSigma(a) * this.axisScale(a);
      // along the line every other axis has a rate; if any is slow there
      // (a picture that changes little along the line, or a second local
      // axis nearly parallel to the first) the line is integrated pointwise
      // by quadrature with its jumps located, otherwise spectrally
      let lineLocal = false;
      let rMax = 0;
      for (const o of axes) {
        if (o === a) continue;
        const g = this.axisRate(o);
        const gl = Math.abs(g[0] * ehat[0] + g[1] * ehat[1]);
        if (this.sig * gl < this.localSigma) lineLocal = true;
        else if (o.kind !== 'edge') rMax = Math.max(rMax, gl);
      }
      let wsum = 0;
      const weighted = nodesA.map(([ua, w]) => {
        const dens = Math.exp((-(ua - a.count.v) * (ua - a.count.v)) / (2 * sigA * sigA));
        wsum += w * dens;
        return [ua, w * dens];
      });
      for (const [ua, wa] of weighted) {
        if (wa / wsum < 1e-12) continue;
        const da = (ua - a.count.v) / na; // screen displacement along nhat
        const m = [da * nhat[0], da * nhat[1]];
        if (lineLocal) {
          acc += (wa / wsum) * this.lineQuadrature(t, m, ehat, rMax);
          continue;
        }
        const coords = new Map();
        coords.set(a.id, ua);
        for (const o of local) if (o !== a) coords.set(o.id, this.countAt(o, m));
        for (const o of frozen) coords.set(o.id, this.countAt(o, m));
        acc += (wa / wsum) * this.spectral(t, { dim: 1, sig: this.sig, m, e: ehat }, coords);
      }
      return acc;
    }
    const gb = rawRate(b);
    const det = ga[0] * gb[1] - ga[1] * gb[0];
    const pointOf = (ua, ub) => {
      const da = ua - a.count.v;
      const db = ub - b.count.v;
      return [(gb[1] * da - gb[0] * db) / det, (-ga[1] * da + ga[0] * db) / det];
    };
    const coordsAt = (ua, ub) => {
      const m = pointOf(ua, ub);
      const coords = new Map();
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
    // where the number of jumps along the second axis changes with the
    // first (a disc's extreme points), the integrand along the first axis
    // has a singularity: locate those points and cut the first axis there
    const sigA0 = this.axisSigma(a) * this.axisScale(a);
    const jumpCount = (ua) => this.localNodes(t, b, (ub) => coordsAt(ua, ub)).length;
    const aCuts = [];
    if (t.f.some((f) => f.kind === 'clo' && f.axes.length > 1) || b.field) {
      const NA = 24;
      let prev = jumpCount(a.count.v - 6 * sigA0);
      for (let i = 1; i <= NA; i++) {
        const u1 = a.count.v - 6 * sigA0 + (12 * sigA0 * i) / NA;
        const cnt = jumpCount(u1);
        if (cnt !== prev) {
          let x0 = u1 - (12 * sigA0) / NA;
          let x1 = u1;
          for (let it = 0; it < 30; it++) {
            const xm = (x0 + x1) / 2;
            if (jumpCount(xm) === prev) x0 = xm;
            else x1 = xm;
          }
          aCuts.push((x0 + x1) / 2);
          prev = cnt;
        }
      }
    }
    // the first axis's own jumps are located on the second axis's centre line
    const nodesA2 = this.localNodes(t, a, (ua) => coordsAt(ua, b.count.v), aCuts);
    if (DEBUG) console.log(`      2-local a=${a.label}#${a.id} (sig ${sigA0.toExponential(2)}) b=${b.label}#${b.id} nodesA ${nodesA2.length} aCuts ${aCuts.map((u) => u.toFixed(4)).join(',')}`);
    let wsum = 0;
    const contributions = [];
    for (const [ua, wa0] of nodesA2) {
      // the second axis's nodes, with its jumps located at this first node
      const nodesB = this.localNodes(t, b, (ub) => coordsAt(ua, ub));
      if (DEBUG && Math.abs(ua - a.count.v) < 0.3 * sigA0) console.log(`        ua ${ua.toFixed(5)} nodesB ${nodesB.length} jumps ${this._lastJumps.map((u) => u.toFixed(5)).join(',')}`);
      for (const [ub, wb0] of nodesB) {
        const da = ua - a.count.v;
        const db = ub - b.count.v;
        const q = (sbb * da * da - 2 * sab * da * db + saa * db * db) / dS;
        const dens = Math.exp(-0.5 * q);
        const w = wa0 * wb0 * dens;
        if (w < 1e-14) continue;
        const m = pointOf(ua, ub);
        const coords = new Map();
        coords.set(a.id, ua);
        coords.set(b.id, ub);
        for (const o of local) if (o !== a && o !== b) coords.set(o.id, this.countAt(o, m));
        contributions.push([w, m, coords]);
        wsum += w;
      }
    }
    for (const [w, m, coords] of contributions) acc += (w / wsum) * this.spectral(t, { dim: 0, m }, coords);
    return acc;
  }
  // E[term] along the line z = m + s e, s ~ N(0, sig^2): Gauss-Legendre
  // panels no wider than a quarter period of the fastest axis along the
  // line, cut at the jumps of the term's value along it
  lineQuadrature(t, m, e, rMax) {
    const sig = this.sig;
    const lo = -6 * sig;
    const hi = 6 * sig;
    const at = (u) => this.pointValue(t, [m[0] + u * e[0], m[1] + u * e[1]], new Map());
    const M = 24;
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
      if (Math.abs(vals[i + 1] - vals[i]) > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
        let x0 = lo + ((hi - lo) * i) / M;
        let x1 = lo + ((hi - lo) * (i + 1)) / M;
        const f0 = vals[i];
        for (let it = 0; it < 40; it++) {
          const xm = (x0 + x1) / 2;
          if (Math.abs(at(xm) - f0) > Math.abs(vals[i + 1] - vals[i]) / 2) x1 = xm;
          else x0 = xm;
        }
        jumps.push((x0 + x1) / 2);
      }
    }
    const cuts = [lo, ...jumps, hi];
    const width = Math.min(this.localPanel * sig, rMax > 0 ? 0.25 / rMax : Infinity);
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
  // quadrature nodes along a local axis: [u, weight]; the weights carry the
  // Gaussian density normalised to one when the axis is integrated alone
  // (nodes for a second axis have the plain Gauss-Legendre weights and the
  // joint density is applied by the caller)
  localNodes(t, axis, coordsAt, extraCuts = []) {
    const sigA = this.axisSigma(axis) * this.axisScale(axis);
    const c0 = axis.count.v;
    const lo = c0 - 6 * sigA;
    const hi = c0 + 6 * sigA;
    // the pictures of this axis in the term, to find jumps and constancy;
    // with a coordinate callback (every other axis a number once this one
    // is), pictures through fields and closures on the axis are probed too
    const fns = [];
    for (const f of t.f) {
      if (f.kind === 'pic' && f.axis === axis) {
        if (!f.axis.field) fns.push(f.fn);
        else if (coordsAt) {
          const field = f.axis.field;
          const fn = f.fn;
          fns.push((u) => fn(u + evalElement(field, coordsAt(u)).v));
        }
      } else if (f.kind === 'clo' && f.axes.includes(axis)) {
        if (f.axes.length === 1 && !axis.field) fns.push((u) => f.fn([u]).v);
        else if (coordsAt) fns.push((u) => f.fn(f.axes.map((x) => axisCoordinate(x, coordsAt(u)))).v);
      }
    }
    const probe = (u) => fns.reduce((p, g) => p * g(u), 1);
    // sample for jumps
    const M = 24;
    const vals = [];
    for (let i = 0; i <= M; i++) vals.push(probe(lo + ((hi - lo) * i) / M));
    let vmin = Infinity;
    let vmax = -Infinity;
    for (const v of vals) {
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
    const otherFactors = t.f.some((f) => (f.kind === 'clo' && f.axes.includes(axis)) || (f.kind === 'pic' && f.axis.field && f.axis.field.axes().includes(axis)));
    void otherFactors;
    const jumps = [];
    for (let i = 0; i < M; i++) {
      if (Math.abs(vals[i + 1] - vals[i]) > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
        let x0 = lo + ((hi - lo) * i) / M;
        let x1 = lo + ((hi - lo) * (i + 1)) / M;
        const f0 = vals[i];
        for (let it = 0; it < 40; it++) {
          const xm = (x0 + x1) / 2;
          if (Math.abs(probe(xm) - f0) > Math.abs(vals[i + 1] - vals[i]) / 2) x1 = xm;
          else x0 = xm;
        }
        jumps.push((x0 + x1) / 2);
      }
    }
    this._lastJumps = jumps;
    const cuts = [lo, ...jumps, ...extraCuts.filter((u) => u > lo && u < hi), hi].sort((p, q) => p - q);
    const nodes = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i];
      const b = cuts[i + 1];
      if (b - a < 1e-15) continue;
      const panels = Math.max(1, Math.ceil((b - a) / (this.localPanel * sigA)));
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
    if (cond.dim === 0) return this.pointValue(t, cond.m, localCoords);
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
    );
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
  residualCoef1(resFn, K, axis, fields, clos, localCoords) {
    const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
    const wrap = axis.kind === 'edge' ? (u) => axis.center + (u - Math.round(u)) * per : (u) => u;
    if (!this._resCache) this._resCache = new Map();
    const baseKey = `${axis.id}`;
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
        fields.forEach(({ axis: fa }, fi) => {
          const p = fa.kind === 'edge' ? fa.edgePeriod : 1;
          amp[fi] = Math.max(amp[fi], Math.abs((TAU * evalElement(fa.field, m).v) / p));
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
      base = { amp, jumps, sets: new Map() };
      this._resCache.set(baseKey, base);
    }
    // bandwidth for these harmonics; with no closure on the axis the field
    // exponential's own bandwidth caps the range
    let bwF = 0;
    fields.forEach(({ k }, fi) => {
      bwF += Math.abs(k) * base.amp[fi] + 4;
    });
    if (clos.length === 0) K = Math.min(K, Math.ceil(bwF));
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
      const fieldSamples = fields.map(({ axis: fa }) =>
        nodes.map(([u]) => {
          const m = new Map(localCoords);
          m.set(axis.id, wrap(u));
          const p = fa.kind === 'edge' ? fa.edgePeriod : 1;
          return (TAU * evalElement(fa.field, m).v) / p;
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
    const { nodes, fieldSamples, cloSamples, ex } = set;
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
    const sr = new Array(N);
    const si = new Array(N);
    for (let i = 0; i < N; i++) {
      let ph = 0;
      fields.forEach(({ k }, fi) => {
        ph += k * fieldSamples[fi][i];
      });
      const j = cloSamples[i].scale(nodes[i][1]);
      sr[i] = j.scale(Math.cos(ph));
      si[i] = j.scale(Math.sin(ph));
    }
    const re = [];
    const im = [];
    // e^{-2 pi i m u_j} by powers: keep the running phasor per node
    const pr = new Float64Array(N).fill(1);
    const pi = new Float64Array(N).fill(0);
    // start at m = -K: phasor e^{+2 pi i K u}
    for (let i = 0; i < N; i++) {
      const ang = TAU * K * nodes[i][0];
      pr[i] = Math.cos(ang);
      pi[i] = Math.sin(ang);
    }
    for (let m = -K; m <= K; m++) {
      let aR = J0;
      let aI = J0;
      for (let i = 0; i < N; i++) {
        aR = aR.add(sr[i].scale(pr[i]).sub(si[i].scale(pi[i])));
        aI = aI.add(sr[i].scale(pi[i]).add(si[i].scale(pr[i])));
        const nr = pr[i] * ex[i][0] - pi[i] * ex[i][1];
        pi[i] = pr[i] * ex[i][1] + pi[i] * ex[i][0];
        pr[i] = nr;
      }
      re.push(aR);
      im.push(aI);
    }
    return { re, im, K };
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
      let ph = 0;
      for (const { k, axis } of fields) {
        const per = axis.kind === 'edge' ? axis.edgePeriod : 1;
        ph += (TAU * k * evalElement(axis.field, m).v) / per;
      }
      let re = Jet.c(Math.cos(ph));
      let im = Jet.c(Math.sin(ph));
      for (const cl of clos) {
        const cs2 = cl.axes.map((a) => (localCoords.has(a.id) ? localCoords.get(a.id) : cs[residual.indexOf(a)]));
        const j = cl.fn(cs2);
        re = re.mul(j);
        im = im.mul(j);
      }
      return { re, im };
    };
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
  const M0 = 4 * K0 + 8;
  const wrap = (a) => (a.kind === 'edge' ? (u) => a.center + (u - Math.round(u)) * a.edgePeriod : (u) => u);
  const w0 = wrap(axes[0]);
  const w1 = wrap(axes[1]);
  const rowCoef = new Array(M0);
  for (let i = 0; i < M0; i++) {
    const u0 = w0(i / M0);
    const g = (u1) => fn([u0, w1(u1)]);
    // jumps along axis 1 on this row
    const Ms = 64;
    const vals = new Float64Array(Ms + 1);
    let vmin = Infinity;
    let vmax = -Infinity;
    for (let j = 0; j <= Ms; j++) {
      vals[j] = g(j / Ms).re.v;
      vmin = Math.min(vmin, vals[j]);
      vmax = Math.max(vmax, vals[j]);
    }
    const jumps = [];
    for (let j = 0; j < Ms; j++) {
      const d = Math.abs(vals[j + 1] - vals[j]);
      if (d > 0.25 * Math.max(vmax - vmin, 1e-12) + 1e-12) {
        let x0 = j / Ms;
        let x1 = (j + 1) / Ms;
        const f0 = vals[j];
        for (let it = 0; it < 40; it++) {
          const xm = (x0 + x1) / 2;
          if (Math.abs(g(xm).re.v - f0) > d / 2) x1 = xm;
          else x0 = xm;
        }
        jumps.push((x0 + x1) / 2);
      }
    }
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
    const rowR = new Array(2 * K1 + 1);
    const rowI = new Array(2 * K1 + 1);
    for (let m1 = -K1; m1 <= K1; m1++) {
      rowR[m1 + K1] = J0;
      rowI[m1 + K1] = J0;
    }
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
    rowCoef[i] = { rowR, rowI };
  }
  const re = new Array((2 * K0 + 1) * (2 * K1 + 1));
  const im = new Array((2 * K0 + 1) * (2 * K1 + 1));
  for (let m0 = -K0; m0 <= K0; m0++)
    for (let m1 = -K1; m1 <= K1; m1++) {
      let aR = J0;
      let aI = J0;
      for (let i = 0; i < M0; i++) {
        const ang = (-TAU * m0 * i) / M0;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const r = rowCoef[i].rowR[m1 + K1];
        const m = rowCoef[i].rowI[m1 + K1];
        aR = aR.add(r.scale(c).sub(m.scale(sn)));
        aI = aI.add(r.scale(sn).add(m.scale(c)));
      }
      const idx = (m0 + K0) * (2 * K1 + 1) + (m1 + K1);
      re[idx] = aR.scale(1 / M0);
      im[idx] = aI.scale(1 / M0);
    }
  return { re, im, K0, K1 };
};

export const resetAxes = () => {
  axisCounter = 0;
  axisRegistry.clear();
};
export { evalElement, TAU };
