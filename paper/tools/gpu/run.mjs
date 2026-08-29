// Browser side of the GPU experiment. Imported by the page, returns JSON.
//
//   const { report } = await import('/@fs/<root>/paper/tools/gpu/run.mjs');
//   const json = await report('<root>');

import {
  ABLATIONS,
  init,
  sample,
  sampleField,
  sampleFieldExpr,
  strokeBand,
  time,
  timeFieldExpr,
} from './probe.mjs';

const SETTINGS = {
  'circle rot': { shape: 1, spacing: 6, theta: 0.02, offset: { x: 0, y: 0 }, thickness: 3.5 },
  'circle rot+off': { shape: 1, spacing: 6, theta: 0.02, offset: { x: 0, y: 0.5 }, thickness: 3.5 },
  'circle off': { shape: 1, spacing: 6, theta: 0, offset: { x: 0, y: 0.5 }, thickness: 3.5 },
  'square rot': { shape: 2, spacing: 20, theta: 0.02, offset: { x: 0, y: 0 }, thickness: 1.5 },
  'square rot+off': { shape: 2, spacing: 20, theta: 0.02, offset: { x: 2, y: 2 }, thickness: 1.5 },
  'square off': { shape: 2, spacing: 20, theta: 0, offset: { x: 2, y: 2 }, thickness: 1.5 },
  'triangle rot': { shape: 3, spacing: 20, theta: 0.03, offset: { x: 0, y: 0 }, thickness: 1.5 },
  'triangle rot+off': { shape: 3, spacing: 12, theta: 0.03, offset: { x: 1.5, y: 1 }, thickness: 1.5 },
  'hexagon rot+off': { shape: 4, sides: 6, spacing: 10, theta: 0.02, offset: { x: 1, y: 1 }, thickness: 1.5 },
  'nonagon rot+off': { shape: 4, sides: 9, spacing: 10, theta: 0.02, offset: { x: 1, y: 1 }, thickness: 1.5 },
  'hard: off near spacing': { shape: 2, spacing: 6, theta: 0.03, offset: { x: 4, y: 4 }, thickness: 1.5 },
  'hard: marginal drift': { shape: 4, sides: 6, spacing: 4, theta: 0.01, offset: { x: 4, y: 0 }, thickness: 1.5 },
};

const ZOOMS = [1, 0.15];
const SOLVERS = ['sweep', 'window1', 'final'];

/**
 * The field path, over every shipped field and every family that accepts one.
 * `family` is -1 for the line carrier and the curve kind otherwise.
 */
const FIELD_CASES = (() => {
  const families = [
    { label: 'lines', family: -1, spacing: 6 },
    { label: 'wave', family: 0, spacing: 8, bend: 12, frequency: 1.5 },
    { label: 'parabola', family: 1, spacing: 10, bend: 30 },
    { label: 'hyperbola', family: 2, spacing: 12 },
    { label: 'spiral', family: 3, spacing: 9, bend: 40 },
  ];
  const cases = [];
  for (let kind = 1; kind <= 6; kind++) {
    for (const f of families) {
      cases.push({ key: `${f.label} x field ${kind}`, spec: { ...f, kind, scale: 180, amount: 3 } });
    }
  }
  return cases;
})();

function expand(name, spec, zoom) {
  const band = strokeBand(zoom, spec.thickness ?? 1.5);
  return {
    key: `${name} @${zoom}`,
    spec: {
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
    },
  };
}

export async function report(root, opts = {}) {
  const meta = await init(root);
  const out = {
    meta,
    timings: {},
    ablations: {},
    agreement: null,
    field: null,
    fieldCost: null,
  };

  // 1. Do the twins agree? Same points, same settings, WGSL against TypeScript.
  const cpu = await import('/src/gpu/inverseCpu.ts');
  const points = [];
  for (let i = 1; i <= 4096; i++) {
    const u = (i * 0.7548776662466927) % 1;
    const v = (i * 0.5698402909980532) % 1;
    points.push({ x: (u - 0.5) * 3000, y: (v - 0.5) * 2000 });
  }
  // Split by regime. Where the window fits the budget both twins walk every
  // candidate and must agree to f32 precision. Where it does not, both return a
  // subsample of a family that is denser than the pixel grid, and f32 and f64
  // legitimately land on different lattice points.
  const tally = {
    exact: { compared: 0, mismatches: 0, worst: 0, worstAt: null },
    strided: { compared: 0, mismatches: 0, worst: 0, worstAt: null },
  };
  for (const [name, spec] of Object.entries(SETTINGS)) {
    for (const zoom of ZOOMS) {
      const { spec: s } = expand(name, spec, zoom);
      const gpu = await sample('final', s, points);
      const kappa = cpu.shapeKappa(s.shape, s.sides);
      const drift = cpu.ringDrift(s.offset, s.shape, s.sides);
      const offLen = Math.hypot(s.offset.x, s.offset.y);
      const guard = Math.max(s.reject, s.spacing * 0.75);
      for (let i = 0; i < points.length; i++) {
        const want = cpu.ringDistanceCpu(
          points[i],
          s.offset,
          s.theta,
          s.spacing,
          s.phase,
          s.shape,
          s.sides,
          s.accept,
          s.reject
        );
        const got = gpu[i];
        const win = cpu.ringIndexWindow(
          Math.hypot(points[i].x, points[i].y),
          offLen,
          drift,
          s.spacing,
          s.phase,
          kappa,
          guard
        );
        const bucket =
          win.hi - win.lo + 1 <= cpu.RING_BUDGET ? tally.exact : tally.strided;
        bucket.compared += 1;
        if (Math.min(want, guard) > guard - 1e-4 && got > guard - 1e-4) continue;
        const err = Math.abs(got - Math.min(want, guard));
        // f32 loses absolute precision with the magnitude of n * spacing.
        const scale = Math.max(1, (Math.hypot(points[i].x, points[i].y) + s.phase) / s.spacing);
        const tol = 1e-4 * s.spacing * Math.max(1, Math.log2(scale)) + 1e-3;
        if (err > tol) bucket.mismatches += 1;
        if (err > bucket.worst) {
          bucket.worst = err;
          bucket.worstAt = `${name} @${zoom} p=(${points[i].x.toFixed(0)},${points[i].y.toFixed(0)}) gpu=${got.toFixed(4)} cpu=${want.toFixed(4)}`;
        }
      }
    }
  }
  out.agreement = Object.fromEntries(
    Object.entries(tally).map(([k, v]) => [
      k,
      { ...v, worst: Math.round(v.worst * 1e5) / 1e5 },
    ])
  );

  // 1b. The same question for the field path. Nothing here searches, so the two
  // twins are the same arithmetic in two precisions and must agree outright.
  const fieldTally = {
    compared: 0,
    inked: 0,
    mismatches: 0,
    worstField: 0,
    worstDist: 0,
    worstAt: null,
  };
  for (const { key, spec } of FIELD_CASES) {
    const gpu = await sampleField(spec, points);
    for (let i = 0; i < points.length; i++) {
      const want = cpu.fieldWarpCpu(points[i], spec.kind, spec.scale);
      const gain = spec.amount * spec.spacing;
      const warp = want.f * gain;
      const warpGrad = { x: want.gx * gain, y: want.gy * gain };
      const wantDist =
        spec.family < 0
          ? cpu.lineDistanceCpu(points[i], 0, spec.spacing, 0, 0, warp, warpGrad)
          : cpu.curveDistanceCpu(
              points[i],
              spec.family,
              spec.spacing,
              0,
              spec.bend ?? 0,
              spec.frequency ?? 1,
              warp,
              warpGrad
            );
      const got = gpu[i];
      fieldTally.compared += 1;
      // The field is dimensionless and its gradient is per world unit, so bring
      // the gradient back to the field's scale before comparing the two.
      const fErr = Math.abs(got.f - want.f);
      const gErr = Math.max(Math.abs(got.gx - want.gx), Math.abs(got.gy - want.gy)) * spec.scale;
      const fieldErr = Math.max(fErr, gErr);
      fieldTally.worstField = Math.max(fieldTally.worstField, fieldErr);
      let bad = fieldErr > 1e-3;

      // The distance only has to be right where it can ink. Past a pitch the
      // stroke is long transparent and the value is a divided residual that f32
      // is entitled to disagree about — the eikonal divide blows up wherever a
      // family's phase gradient vanishes.
      if (Math.min(wantDist, got.dist) < spec.spacing) {
        fieldTally.inked += 1;
        const dErr = Math.abs(got.dist - wantDist);
        const tol = 1e-3 * (1 + gain * Math.max(1, Math.abs(want.f)));
        fieldTally.worstDist = Math.max(fieldTally.worstDist, dErr);
        if (dErr > tol) bad = true;
      }

      if (bad) {
        fieldTally.mismatches += 1;
        fieldTally.worstAt ??= `${key} p=(${points[i].x.toFixed(0)},${points[i].y.toFixed(0)}) f=${got.f.toFixed(5)}/${want.f.toFixed(5)} d=${got.dist.toFixed(5)}/${wantDist.toFixed(5)}`;
      }
    }
  }
  out.field = {
    cases: FIELD_CASES.length,
    compared: fieldTally.compared,
    inked: fieldTally.inked,
    mismatches: fieldTally.mismatches,
    worstField: Math.round(fieldTally.worstField * 1e7) / 1e7,
    worstDist: Math.round(fieldTally.worstDist * 1e7) / 1e7,
    worstAt: fieldTally.worstAt,
  };

  // 1c. Interpret or unroll. Same bytecode, same kernel, same bindings: the only
  // difference is whether the program is walked per pixel or was compiled into
  // arithmetic. Both generations are checked against the CPU evaluator before
  // either is timed, so a wrong answer cannot look like a fast one.
  const expr = await import('/src/fields/expr.ts');
  const emit = await import('/src/fields/emit.ts');
  const { evalField } = await import('/src/fields/evalExpr.ts');
  const SCALE = 180;
  const FRAME = { scale: SCALE, width: 1200, height: 1200 };
  // The interpreted generation is three orders of magnitude slower, so it gets
  // fewer repetitions; it needs none, since one of its passes is already hundreds
  // of timestamp ticks long.
  const FAST = { reps: opts.reps ?? 24 };
  const SLOW = { reps: 4, warm: 1 };
  const fieldCost = {
    scale: SCALE,
    width: FRAME.width,
    height: FRAME.height,
    evalsPerPixel: null,
    baseline: null,
    presets: {},
  };
  fieldCost.baseline = await timeFieldExpr('none', '', FRAME, FAST);
  fieldCost.evalsPerPixel = fieldCost.baseline.repeats;
  for (const preset of expr.FIELD_PRESETS) {
    const compiled = expr.compileField(preset.source);
    if (!compiled.ok) throw new Error(`preset ${preset.id}: ${compiled.error}`);
    const ops = compiled.code.findIndex((op) => op === expr.EXPR_OPS.halt);
    const statements = emit.emitField(compiled, emit.wgslBackend).body.length;

    // Agreement first. Both generations at the same points, against each other
    // and against the interpreter in TypeScript the editor's preview runs.
    const seen = {};
    for (const mode of ['interp', 'unrolled']) {
      seen[mode] = await sampleFieldExpr(mode, preset.source, points, { scale: SCALE });
    }
    const worst = { interp: 0, unrolled: 0, between: 0 };
    for (let i = 0; i < points.length; i++) {
      const want = evalField(compiled.code, compiled.literals, points[i].x / SCALE, points[i].y / SCALE);
      const span = Math.max(1, Math.abs(want.f), Math.abs(want.gx), Math.abs(want.gy));
      for (const mode of ['interp', 'unrolled']) {
        const got = seen[mode][i];
        worst[mode] = Math.max(
          worst[mode],
          Math.abs(got.f - want.f) / span,
          Math.abs(got.gx * SCALE - want.gx) / span,
          Math.abs(got.gy * SCALE - want.gy) / span
        );
      }
      worst.between = Math.max(
        worst.between,
        Math.abs(seen.interp[i].f - seen.unrolled[i].f) / span,
        Math.abs(seen.interp[i].gx - seen.unrolled[i].gx) * SCALE / span,
        Math.abs(seen.interp[i].gy - seen.unrolled[i].gy) * SCALE / span
      );
    }

    fieldCost.presets[preset.id] = {
      ops,
      statements,
      worst: Object.fromEntries(
        Object.entries(worst).map(([k, v]) => [k, Number(v.toExponential(2))])
      ),
      interp: await timeFieldExpr('interp', preset.source, FRAME, SLOW),
      unrolled: await timeFieldExpr('unrolled', preset.source, FRAME, FAST),
    };
  }
  // An expression that halts immediately. The interpreter still enters its loop
  // and reads an instruction; the emitter writes nothing at all, so this is the
  // cost of carrying the machinery rather than of using it.
  fieldCost.empty = { interp: await timeFieldExpr('interp', '', FRAME, FAST) };
  out.fieldCost = fieldCost;

  // 2. Cost of one full-frame pass, per solver generation.
  for (const [name, spec] of Object.entries(SETTINGS)) {
    for (const zoom of ZOOMS) {
      const { key, spec: s } = expand(name, spec, zoom);
      out.timings[key] = {};
      for (const solver of SOLVERS) {
        try {
          out.timings[key][solver] = await time(solver, s, { reps: opts.reps ?? 24 });
        } catch (e) {
          out.timings[key][solver] = { error: String(e.message ?? e) };
        }
      }
    }
  }

  // 3. One mechanism at a time, on the settings that stress the scan.
  const ablationCases = ['triangle rot+off @1', 'hard: off near spacing @1', 'hexagon rot+off @0.15'];
  for (const key of ablationCases) {
    const [name, z] = [key.slice(0, key.lastIndexOf(' @')), Number(key.slice(key.lastIndexOf('@') + 1))];
    const { spec: s } = expand(name, SETTINGS[name], z);
    out.ablations[key] = { full: await time('final', s, { reps: opts.reps ?? 24 }) };
    for (const [label, patches] of Object.entries(ABLATIONS)) {
      try {
        out.ablations[key][label] = await time('final', s, { patches, reps: opts.reps ?? 24 });
      } catch (e) {
        out.ablations[key][label] = { error: String(e.message ?? e) };
      }
    }
  }

  return JSON.stringify(out);
}
