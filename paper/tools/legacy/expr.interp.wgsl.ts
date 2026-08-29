// A field expression *interpreted* in the shader, for the comparison in
// Section 7 of the paper. Archived here rather than in `src/` because the
// shipping renderer no longer contains it: `src/fields/emit.ts` unrolls the same
// bytecode into straight-line code instead.
//
// This is the favourable arrangement for an interpreter, deliberately. The
// program sits in a uniform buffer and is indexed in place, so nothing is copied
// per invocation and nothing is passed by value; the loop and the dispatch are
// the only structural costs left. The generation that shipped could not do that
// — three.js has no way to hand a `wgslFn` a uniform array, so the program
// travelled as `mat4x4` parameters and every call paid for the hand-over whether
// or not the program was empty — so the interpreted cost measured against this
// file is a *lower bound* on what unrolling actually saved.
//
// Semantics are `src/fields/evalExpr.ts`, opcode for opcode, including the
// guards of `EXPR_EPS` and the zero rule of `term`. `paper/tools/gpu/probe.mjs`
// pulls these template literals out and holds the result against the CPU
// evaluator before it times anything, so a divergence is a test failure rather
// than a faster number.
//
// The `prog` uniform is declared by the harness kernel, not here.

/** Keeps a divisor away from zero without flipping its sign. `EXPR_EPS.den`. */
export const exprGuardWgsl = `
fn exprGuard(v: f32) -> f32 {
  if (v < 0.0) {
    return min(v, -1e-12);
  }
  return max(v, 1e-12);
}
`;

/**
 * One term of the chain rule. An exactly-zero factor contributes nothing even
 * against an overflowed partial, which a plain multiply would turn into a NaN.
 */
export const exprTermWgsl = `
fn exprTerm(slope: f32, carried: f32) -> f32 {
  if (slope == 0.0 || carried == 0.0) {
    return 0.0;
  }
  return slope * carried;
}
`;

/**
 * `vec3(f, df/dx, df/dy)` at `q`, by running the bytecode in `prog`.
 *
 * Three parallel stacks hold the dual numbers. Op numbering is `EXPR_OPS`: 0
 * halts, 1 and 2 push the coordinates, 3 duplicates, 4--13 are unary, 14--22
 * binary, 23--24 ternary, and 32 + k pushes literal k.
 */
export const fieldInterpWgsl = `
fn fieldInterp(q: vec2<f32>, scale: f32) -> vec3<f32> {
  let L = max(abs(scale), 1e-3);
  let ux = q.x / L;
  let uy = q.y / L;

  var sv: array<f32, 16>;
  var sy: array<f32, 16>;
  var sz: array<f32, 16>;
  var sp = 0;

  for (var i = 0; i < 96; i = i + 1) {
    let op = i32(prog.code[i / 4][i % 4]);
    if (op == 0) {
      break;
    }

    if (op >= 32) {
      let k = op - 32;
      sv[sp] = prog.lits[k / 4][k % 4];
      sy[sp] = 0.0;
      sz[sp] = 0.0;
      sp = sp + 1;
      continue;
    }
    if (op == 1) {
      sv[sp] = ux;
      sy[sp] = 1.0;
      sz[sp] = 0.0;
      sp = sp + 1;
      continue;
    }
    if (op == 2) {
      sv[sp] = uy;
      sy[sp] = 0.0;
      sz[sp] = 1.0;
      sp = sp + 1;
      continue;
    }
    if (op == 3) {
      sv[sp] = sv[sp - 1];
      sy[sp] = sy[sp - 1];
      sz[sp] = sz[sp - 1];
      sp = sp + 1;
      continue;
    }

    if (op <= 13) {
      let t = sp - 1;
      let av = sv[t];
      let ay = sy[t];
      let az = sz[t];
      var v = av;
      var g = 1.0;
      if (op == 4) {
        v = -av;
        g = -1.0;
      } else if (op == 5) {
        v = abs(av);
        g = sign(av);
      } else if (op == 6) {
        v = floor(av);
        g = 0.0;
      } else if (op == 7) {
        v = sign(av);
        g = 0.0;
      } else if (op == 8) {
        v = sqrt(max(av, 0.0));
        g = select(0.0, 0.5 / max(v, 1e-6), av > 0.0);
      } else if (op == 9) {
        v = exp(av);
        g = v;
      } else if (op == 10) {
        let m = max(av, 1e-12);
        v = log(m);
        g = select(0.0, 1.0 / m, av > 1e-12);
      } else if (op == 11) {
        v = sin(av);
        g = cos(av);
      } else if (op == 12) {
        v = cos(av);
        g = -sin(av);
      } else {
        let c = cos(av);
        v = tan(av);
        g = 1.0 / max(c * c, 1e-12);
      }
      sv[t] = v;
      sy[t] = exprTerm(g, ay);
      sz[t] = exprTerm(g, az);
      continue;
    }

    if (op <= 22) {
      let t = sp - 2;
      let av = sv[t];
      let ay = sy[t];
      let az = sz[t];
      let bv = sv[t + 1];
      let by = sy[t + 1];
      let bz = sz[t + 1];
      sp = sp - 1;
      var v = av;
      var da = 1.0;
      var db = 0.0;
      if (op == 14) {
        v = av + bv;
        db = 1.0;
      } else if (op == 15) {
        v = av - bv;
        db = -1.0;
      } else if (op == 16) {
        v = av * bv;
        da = bv;
        db = av;
      } else if (op == 17) {
        let d = exprGuard(bv);
        v = av / d;
        da = 1.0 / d;
        db = select(0.0, -av / (d * d), d == bv);
      } else if (op == 18) {
        let n = round(bv);
        if (abs(bv - n) < 1e-6 && by == 0.0 && bz == 0.0) {
          let m = max(abs(av), 1e-12);
          let odd = abs(n - 2.0 * round(n * 0.5)) > 0.5;
          var sn = 1.0;
          var sm = 1.0;
          if (av < 0.0) {
            if (odd) {
              sn = -1.0;
            } else {
              sm = -1.0;
            }
          }
          v = sn * pow(m, n);
          da = n * sm * pow(m, n - 1.0);
          db = 0.0;
        } else {
          let m = max(av, 1e-12);
          v = exp(bv * log(m));
          da = select(0.0, bv * v / m, av > 1e-12);
          db = v * log(m);
        }
      } else if (op == 19) {
        let takeA = av <= bv;
        v = select(bv, av, takeA);
        da = select(0.0, 1.0, takeA);
        db = select(1.0, 0.0, takeA);
      } else if (op == 20) {
        let takeA = av >= bv;
        v = select(bv, av, takeA);
        da = select(0.0, 1.0, takeA);
        db = select(1.0, 0.0, takeA);
      } else if (op == 21) {
        let d2 = max(av * av + bv * bv, 1e-12);
        v = atan2(av, bv);
        da = bv / d2;
        db = -av / d2;
      } else {
        let h = sqrt(av * av + bv * bv);
        let hd = max(h, 1e-4);
        v = h;
        da = av / hd;
        db = bv / hd;
      }
      sv[t] = v;
      sy[t] = exprTerm(da, ay) + exprTerm(db, by);
      sz[t] = exprTerm(da, az) + exprTerm(db, bz);
      continue;
    }

    let t = sp - 3;
    sp = sp - 2;
    if (op == 23) {
      var src = t + 1;
      if (sv[t] > sv[t + 1]) {
        src = t;
      }
      var pick = t + 2;
      if (sv[src] < sv[t + 2]) {
        pick = src;
      }
      sv[t] = sv[pick];
      sy[t] = sy[pick];
      sz[t] = sz[pick];
      continue;
    }

    let den = exprGuard(sv[t + 1] - sv[t]);
    let s = (sv[t + 2] - sv[t]) / den;
    if (s <= 0.0 || s >= 1.0) {
      sv[t] = select(0.0, 1.0, s >= 1.0);
      sy[t] = 0.0;
      sz[t] = 0.0;
      continue;
    }
    let w = 6.0 * s * (1.0 - s) / den;
    let y0 = sy[t];
    let z0 = sz[t];
    sv[t] = s * s * (3.0 - 2.0 * s);
    sy[t] = w * (sy[t + 2] - y0 - s * (sy[t + 1] - y0));
    sz[t] = w * (sz[t + 2] - z0 - s * (sz[t + 1] - z0));
  }

  if (sp < 1) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  return vec3<f32>(sv[sp - 1], sy[sp - 1] / L, sz[sp - 1] / L);
}
`;
