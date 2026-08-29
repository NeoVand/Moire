// Standalone WebGPU harness for the ring solver. No three.js, no React, no
// canvas: one compute pass per measurement, so the only thing being timed is the
// solver.
//
// The WGSL is not copied here. It is extracted from the shipping source and from
// the archived generations by pulling the template literals out of the wgslFn
// calls, which means this harness cannot drift from the shader it claims to
// measure. Ablations are literal string edits on that extracted source.
//
// Driven from the page: import it, call `run()`, read the JSON.

const SOURCES = {
  sweep: '/@fs/PROJECT/paper/tools/legacy/inverse.sweep.wgsl.ts',
  window1: '/@fs/PROJECT/paper/tools/legacy/inverse.window1.wgsl.ts',
  final: '/@fs/PROJECT/src/gpu/inverse.wgsl.ts',
  fieldInterp: '/@fs/PROJECT/paper/tools/legacy/expr.interp.wgsl.ts',
};

/** Literal edits to the extracted WGSL, one mechanism each. */
export const ABLATIONS = {
  'no carried rotation': [['if (jump <= stride && carried < 32) {', 'if (false) {']],
  'no support fast path': [
    [
      `  if (abs(n - 3.0) < 1e-3) {
    return max(q.x, 0.86602540378 * abs(q.y) - 0.5 * q.x);
  }
  if (abs(n - 4.0) < 1e-3) {
    return max(abs(q.x), abs(q.y));
  }
  if (abs(n - 6.0) < 1e-3) {
    let ax = abs(q.x);
    return max(ax, 0.5 * ax + 0.86602540378 * abs(q.y));
  }
`,
      '',
    ],
  ],
  'no accept exit': [
    [
      `    if (acceptBelow > 0.0 && best <= acceptBelow) {
      return best;
    }
`,
      '',
    ],
  ],
  'no Lipschitz skip': [['let safe = floor((gap - bar) / slope) + 1.0;', 'let safe = 1.0;']],
  'no reject guard': [['let guard = max(rejectAbove, s * 0.75);', 'let guard = s * 0.75;']],
  'loose drift bound': [['let drift = shapeRadiusWgsl(-offset, shapeType, sides);', 'let drift = length(offset);']],
  'pixel-anchored stride': [['var n = ceil(lo / stride) * stride;', 'var n = lo;']],
  'no polygon closed form': [['if (facets > 0.0 && shapeRadiusWgsl(-offset, shapeType, sides) <= s + 1e-4) {', 'if (false) {']],
};

let projectRoot = '';

/** Pull every WGSL function body out of the wgslFn template literals. */
async function extractWgsl(path) {
  const mod = await import(/* @vite-ignore */ `${path}?raw`);
  const src = mod.default;
  const blocks = src.match(/`[\s\S]*?`/g) ?? [];
  const fns = blocks
    .map((b) => b.slice(1, -1))
    .filter((b) => /^\s*fn\s+\w+\s*\(/.test(b));
  if (!fns.length) throw new Error(`no wgsl functions found in ${path}`);
  return fns.join('\n');
}

const KERNEL = `
struct Cfg {
  offset: vec2<f32>,
  theta: f32,
  spacing: f32,
  phase: f32,
  shapeType: f32,
  sides: f32,
  accept: f32,
  reject: f32,
  zoom: f32,
  width: f32,
  height: f32,
};

@group(0) @binding(0) var<uniform> cfg: Cfg;
@group(0) @binding(1) var<storage, read_write> out: array<f32>;

fn worldOf(i: u32) -> vec2<f32> {
  let w = u32(cfg.width);
  let px = f32(i % w) + 0.5 - cfg.width * 0.5;
  let py = f32(i / w) + 0.5 - cfg.height * 0.5;
  return vec2<f32>(px / cfg.zoom, -py / cfg.zoom);
}

@compute @workgroup_size(64)
fn timeAll(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) {
    return;
  }
  let p = worldOf(i);
  out[i] = ringDistance(p, cfg.offset, cfg.theta, cfg.spacing, cfg.phase, cfg.shapeType, cfg.sides, cfg.accept CALL_TAIL);
}
`;

const PROBE_KERNEL = `
struct Cfg {
  offset: vec2<f32>,
  theta: f32,
  spacing: f32,
  phase: f32,
  shapeType: f32,
  sides: f32,
  accept: f32,
  reject: f32,
  zoom: f32,
  width: f32,
  height: f32,
};

@group(0) @binding(0) var<uniform> cfg: Cfg;
@group(0) @binding(1) var<storage, read_write> out: array<f32>;
@group(0) @binding(2) var<storage, read> pts: array<vec2<f32>>;

@compute @workgroup_size(64)
fn probe(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) {
    return;
  }
  out[i] = ringDistance(pts[i], cfg.offset, cfg.theta, cfg.spacing, cfg.phase, cfg.shapeType, cfg.sides, cfg.accept CALL_TAIL);
}
`;

/**
 * The modulated families, for twin agreement on the field path. One point per
 * invocation, four outputs: the field, its two derivatives, and the distance the
 * shader would hand the stroke.
 */
const FIELD_KERNEL = `
struct FCfg {
  kind: f32,
  scale: f32,
  amount: f32,
  spacing: f32,
  phase: f32,
  family: f32,
  bend: f32,
  frequency: f32,
};

@group(0) @binding(0) var<uniform> cfg: FCfg;
@group(0) @binding(1) var<storage, read_write> out: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> pts: array<vec2<f32>>;

@compute @workgroup_size(64)
fn field(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) {
    return;
  }
  let p = pts[i];
  let sample = fieldWarp(p, cfg.kind, cfg.scale);
  let gain = cfg.amount * cfg.spacing;
  let warp = sample.x * gain;
  let warpGrad = vec2<f32>(sample.y, sample.z) * gain;
  var d = 0.0;
  if (cfg.family < 0.0) {
    d = lineDistance(p, 0.0, cfg.spacing, cfg.phase, 0.0, warp, warpGrad);
  } else {
    d = curveDistance(p, cfg.family, cfg.spacing, cfg.phase, cfg.bend, cfg.frequency, warp, warpGrad);
  }
  out[i] = vec4<f32>(sample, d);
}
`;

/**
 * The field path on its own, with nothing else in the kernel: one field
 * evaluation per pixel, its three components summed so the compiler cannot
 * discard it. `prog` holds the bytecode for the interpreted generation and is
 * simply unread by the unrolled one, so both variants run the same kernel over
 * the same bindings and differ only in the function they call.
 */
const FIELD_COST_PREAMBLE = `
struct Prog {
  code: array<vec4<f32>, 24>,
  lits: array<vec4<f32>, 8>,
  cfg: vec4<f32>,
};

@group(0) @binding(0) var<uniform> prog: Prog;
@group(0) @binding(1) var<storage, read_write> out: array<f32>;
`;

// Wider than the solver kernel's 64 only so that a large grid fits inside
// `maxComputeWorkgroupsPerDimension`. Both generations run at this size, so it
// cancels out of the comparison.
const FIELD_GROUP = 256;

/**
 * Field evaluations per invocation.
 *
 * One evaluation and one store per thread measures the store: this adapter's
 * timestamp counter ticks every 65.536 us, and writing the output alone already
 * costs a couple of ticks, so the compiled generation would be reported as
 * whatever the memory system happens to do. Evaluating the field `FIELD_REPEATS`
 * times and storing once puts the arithmetic well above the tick and the store
 * well below it. The position depends on the loop counter so that nothing can be
 * hoisted out, and both generations carry the identical loop.
 */
const FIELD_REPEATS = 32;

const FIELD_COST_KERNEL = `
@compute @workgroup_size(${FIELD_GROUP})
fn fieldCost(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) {
    return;
  }
  let w = u32(prog.cfg.z);
  let px = f32(i % w) + 0.5 - prog.cfg.z * 0.5;
  let py = f32(i / w) + 0.5 - prog.cfg.w * 0.5;
  var acc = 0.0;
  for (var k = 0u; k < ${FIELD_REPEATS}u; k = k + 1u) {
    let p = vec2<f32>((px + f32(k)) / prog.cfg.y, -py / prog.cfg.y);
    let s = FIELD_CALL;
    acc = acc + s.x + s.y + s.z;
  }
  out[i] = acc;
}
`;

/** Same kernel with explicit points, to check a generation before timing it. */
const FIELD_PROBE_KERNEL = `
@group(0) @binding(2) var<storage, read> pts: array<vec2<f32>>;

@compute @workgroup_size(${FIELD_GROUP})
fn fieldProbe(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pts)) {
    return;
  }
  let p = pts[i];
  let s = FIELD_CALL;
  out[i * 3u] = s.x;
  out[i * 3u + 1u] = s.y;
  out[i * 3u + 2u] = s.z;
}
`;

let device = null;
let hasTimestamps = false;

export async function init(root) {
  projectRoot = root;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  hasTimestamps = adapter.features.has('timestamp-query');
  device = await adapter.requestDevice({
    requiredFeatures: hasTimestamps ? ['timestamp-query'] : [],
  });
  device.onuncapturederror = (e) => console.error('wgpu', e.error?.message ?? e);
  const info = adapter.info ?? {};
  return {
    hasTimestamps,
    adapter: { vendor: info.vendor ?? '?', architecture: info.architecture ?? '?', description: info.description ?? '?' },
    limits: { maxComputeWorkgroups: device.limits.maxComputeWorkgroupsPerDimension },
  };
}

const cache = new Map();

async function buildModule(solver, patches = [], entry = 'timeAll') {
  const key = `${solver}|${JSON.stringify(patches)}|${entry}`;
  if (cache.has(key)) return cache.get(key);
  let wgsl = await extractWgsl(SOURCES[solver].replace('PROJECT', projectRoot));
  for (const [find, replace] of patches) {
    if (!wgsl.includes(find)) throw new Error(`probe: patch missed in ${solver}: ${find.slice(0, 60)}`);
    wgsl = wgsl.replaceAll(find, replace);
  }
  // The sweep generation predates the reject-above guard, so its ringDistance
  // takes eight arguments. Match whatever the extracted source declares.
  const sig = wgsl.match(/fn ringDistance\(([^)]*)\)/);
  const arity = sig ? sig[1].split(',').length : 9;
  const bodies = { probe: PROBE_KERNEL, field: FIELD_KERNEL };
  const kernel = (bodies[entry] ?? KERNEL).replaceAll(
    'CALL_TAIL',
    arity >= 9 ? ', cfg.reject' : ''
  );
  const code = `${wgsl}\n${kernel}`;
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length) throw new Error(`wgsl compile: ${errors.map((m) => `${m.lineNum}: ${m.message}`).join(' | ')}`);
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: entry },
  });
  const built = { pipeline, code };
  cache.set(key, built);
  return built;
}

function cfgBuffer(spec) {
  const data = new Float32Array(12);
  data[0] = spec.offset?.x ?? 0;
  data[1] = spec.offset?.y ?? 0;
  data[2] = spec.theta ?? 0;
  data[3] = spec.spacing ?? 6;
  data[4] = spec.phase ?? 0;
  data[5] = spec.shape ?? 1;
  data[6] = spec.sides ?? 6;
  data[7] = spec.accept ?? 0;
  data[8] = spec.reject ?? 0;
  data[9] = spec.zoom ?? 1;
  data[10] = spec.width ?? 1200;
  data[11] = spec.height ?? 800;
  const buf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

/** Stroke thresholds, matching src/gpu/composite.ts. */
export function strokeBand(zoom, thickness) {
  const pixel = 1 / Math.max(zoom, 0.08);
  const halfT = Math.max(thickness * 0.5, pixel * 1.15);
  const aa = pixel * 0.7;
  return { halfT, aa, accept: Math.max(halfT - aa, 0), reject: halfT + aa };
}

/**
 * Submit one pass `reps` times back to back and fence once, so the reported cost
 * is steady state rather than a first-pass cold start. Timestamp queries, when
 * available, measure the pass itself.
 */
async function runTimed(pipeline, bind, count, opts = {}) {
  const reps = opts.reps ?? 24;
  const warm = opts.warm ?? 4;
  const group = opts.group ?? 64;
  const groups = Math.ceil(count / group);
  // Over the limit the pass is a validation error, which shows up as a timestamp
  // delta of zero: a fast number that never ran. Refuse it here instead.
  const limit = device.limits.maxComputeWorkgroupsPerDimension;
  if (groups > limit) {
    throw new Error(`probe: ${groups} workgroups over the device limit of ${limit}`);
  }

  let querySet = null;
  let resolveBuf = null;
  let readBuf = null;
  if (hasTimestamps) {
    querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
    resolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    readBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }

  const dispatch = (withStamps) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(
      withStamps ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}
    );
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(groups);
    pass.end();
    if (withStamps) {
      enc.resolveQuerySet(querySet, 0, 2, resolveBuf, 0);
      enc.copyBufferToBuffer(resolveBuf, 0, readBuf, 0, 16);
    }
    device.queue.submit([enc.finish()]);
  };

  for (let i = 0; i < warm; i++) dispatch(false);
  await device.queue.onSubmittedWorkDone();

  const t0 = performance.now();
  for (let i = 0; i < reps; i++) dispatch(false);
  await device.queue.onSubmittedWorkDone();
  const wallMs = (performance.now() - t0) / reps;

  let passMs = null;
  if (hasTimestamps) {
    dispatch(true);
    await device.queue.onSubmittedWorkDone();
    await readBuf.mapAsync(GPUMapMode.READ);
    const stamps = new BigUint64Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();
    passMs = Number(stamps[1] - stamps[0]) / 1e6;
    // Millions of invocations never take zero ticks, so an empty delta means the
    // pass was dropped rather than fast.
    if (passMs === 0) throw new Error('probe: timestamp delta of zero, the pass did not run');
  }

  querySet?.destroy();
  resolveBuf?.destroy();
  readBuf?.destroy();

  return {
    wallMs: Math.round(wallMs * 1000) / 1000,
    passMs: passMs === null ? null : Math.round(passMs * 10000) / 10000,
    megapixels: Math.round((count / 1e6) * 100) / 100,
    nsPerPixel: Math.round(((passMs ?? wallMs) * 1e6) / count * 100) / 100,
  };
}

/**
 * Time one solver on one setting.
 */
export async function time(solver, spec, opts = {}) {
  const width = spec.width ?? 1200;
  const height = spec.height ?? 800;
  const count = width * height;
  const { pipeline } = await buildModule(solver, opts.patches ?? []);
  const cfg = cfgBuffer({ ...spec, width, height });
  const out = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cfg } },
      { binding: 1, resource: { buffer: out } },
    ],
  });
  const result = await runTimed(pipeline, bind, count, opts);
  out.destroy();
  cfg.destroy();
  return result;
}

// ------------------------------------------------------- interpret vs unroll
//
// Two generations of the same bytecode: the archived shader interpreter, and the
// straight-line code the shipping emitter writes for that same program. Both are
// called from one kernel over one set of bindings, so the difference between them
// is the difference between interpreting a program and having compiled it.

const fieldCache = new Map();

/**
 * `{ pipeline, code }` for one generation. `mode` is `none` (the kernel with no
 * field call at all, so a field's cost is a difference against it), `interp`, or
 * `unrolled`.
 */
async function buildFieldModule(mode, source, entry = 'fieldCost') {
  const key = `${mode}|${source}|${entry}`;
  if (fieldCache.has(key)) return fieldCache.get(key);

  const guard = await import('/src/fields/expr.wgsl.ts');
  let fns = '';
  let call = 'vec3<f32>(p.x, p.y, 0.0)';
  if (mode === 'interp') {
    fns = await extractWgsl(SOURCES.fieldInterp.replace('PROJECT', projectRoot));
    call = 'fieldInterp(p, prog.cfg.x)';
  } else if (mode === 'unrolled') {
    const { compileField } = await import('/src/fields/expr.ts');
    const compiled = compileField(source);
    if (!compiled.ok) throw new Error(`probe: ${source} does not compile: ${compiled.error}`);
    fns = `${guard.EXPR_GUARD_WGSL}\n${guard.fieldWgsl(compiled, 'fieldUnrolled')}`;
    call = 'fieldUnrolled(p, prog.cfg.x)';
  }

  const body = (entry === 'fieldProbe' ? FIELD_PROBE_KERNEL : FIELD_COST_KERNEL).replaceAll(
    'FIELD_CALL',
    call
  );
  const code = `${FIELD_COST_PREAMBLE}\n${fns}\n${body}`;
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === 'error');
  if (errors.length) {
    throw new Error(`wgsl compile (${mode}): ${errors.map((m) => `${m.lineNum}: ${m.message}`).join(' | ')}`);
  }
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: entry },
  });
  const built = { pipeline, code };
  fieldCache.set(key, built);
  return built;
}

/** The bytecode, the literals, and the four scalars, in one uniform. */
async function progBuffer(source, spec) {
  const { compileField } = await import('/src/fields/expr.ts');
  const data = new Float32Array(132);
  if (source) {
    const compiled = compileField(source);
    if (!compiled.ok) throw new Error(`probe: ${source} does not compile: ${compiled.error}`);
    if (compiled.code.length > 96) throw new Error('probe: program too long');
    data.set(compiled.code, 0);
    data.set(compiled.literals, 96);
  }
  data[128] = spec.scale ?? 180;
  data[129] = spec.zoom ?? 1;
  data[130] = spec.width ?? 1200;
  data[131] = spec.height ?? 800;
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

/** One `{ f, gx, gy }` per point, from whichever generation is asked for. */
export async function sampleFieldExpr(mode, source, points, spec = {}) {
  const { pipeline } = await buildFieldModule(mode, source, 'fieldProbe');
  const count = points.length;
  const prog = await progBuffer(source, spec);
  const pts = new Float32Array(count * 2);
  points.forEach((p, i) => {
    pts[i * 2] = p.x;
    pts[i * 2 + 1] = p.y;
  });
  const ptsBuf = device.createBuffer({
    size: pts.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ptsBuf, 0, pts);
  const out = device.createBuffer({
    size: count * 12,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const read = device.createBuffer({
    size: count * 12,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: prog } },
      { binding: 1, resource: { buffer: out } },
      { binding: 2, resource: { buffer: ptsBuf } },
    ],
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(Math.ceil(count / FIELD_GROUP));
  pass.end();
  enc.copyBufferToBuffer(out, 0, read, 0, count * 12);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const raw = new Float32Array(read.getMappedRange().slice(0));
  read.unmap();
  [prog, out, read, ptsBuf].forEach((b) => b.destroy());
  return points.map((_, i) => ({ f: raw[i * 3], gx: raw[i * 3 + 1], gy: raw[i * 3 + 2] }));
}

/**
 * Cost of one field evaluation per pixel, for one generation.
 *
 * `msPerMegapixel` is what to report: the pass time divided by the pixels and by
 * the `FIELD_REPEATS` evaluations each thread performs, so it is the cost of
 * putting this field in one layer of one frame regardless of the grid this ran on.
 */
export async function timeFieldExpr(mode, source, spec = {}, opts = {}) {
  const width = spec.width ?? 1200;
  const height = spec.height ?? 800;
  const count = width * height;
  const { pipeline } = await buildFieldModule(mode, source);
  const prog = await progBuffer(source, { ...spec, width, height });
  const out = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: prog } },
      { binding: 1, resource: { buffer: out } },
    ],
  });
  const result = await runTimed(pipeline, bind, count, { ...opts, group: FIELD_GROUP });
  out.destroy();
  prog.destroy();
  const perEval = (result.passMs ?? result.wallMs) / result.megapixels / FIELD_REPEATS;
  return {
    ...result,
    repeats: FIELD_REPEATS,
    msPerMegapixel: Math.round(perEval * 10000) / 10000,
  };
}

/**
 * Evaluate the modulated families at explicit points. Returns one
 * `{ f, gx, gy, dist }` per point, to be held against `fieldWarpCpu` and the CPU
 * distance twins.
 */
export async function sampleField(spec, points) {
  const { pipeline } = await buildModule('final', [], 'field');
  const count = points.length;
  const cfgData = new Float32Array(8);
  cfgData[0] = spec.kind ?? 1;
  cfgData[1] = spec.scale ?? 200;
  cfgData[2] = spec.amount ?? 3;
  cfgData[3] = spec.spacing ?? 6;
  cfgData[4] = spec.phase ?? 0;
  cfgData[5] = spec.family ?? -1;
  cfgData[6] = spec.bend ?? 0;
  cfgData[7] = spec.frequency ?? 1;
  const cfg = device.createBuffer({
    size: cfgData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cfg, 0, cfgData);

  const pts = new Float32Array(count * 2);
  points.forEach((p, i) => {
    pts[i * 2] = p.x;
    pts[i * 2 + 1] = p.y;
  });
  const ptsBuf = device.createBuffer({
    size: pts.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(ptsBuf, 0, pts);

  const out = device.createBuffer({
    size: count * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const read = device.createBuffer({
    size: count * 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cfg } },
      { binding: 1, resource: { buffer: out } },
      { binding: 2, resource: { buffer: ptsBuf } },
    ],
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(Math.ceil(count / 64));
  pass.end();
  enc.copyBufferToBuffer(out, 0, read, 0, count * 16);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const raw = new Float32Array(read.getMappedRange().slice(0));
  read.unmap();
  [cfg, out, read, ptsBuf].forEach((b) => b.destroy());
  return points.map((_, i) => ({
    f: raw[i * 4],
    gx: raw[i * 4 + 1],
    gy: raw[i * 4 + 2],
    dist: raw[i * 4 + 3],
  }));
}

/** Evaluate the shader at explicit points, for comparison against the CPU twin. */
export async function sample(solver, spec, points, opts = {}) {
  const { pipeline } = await buildModule(solver, opts.patches ?? [], 'probe');
  const count = points.length;
  const cfg = cfgBuffer(spec);
  const pts = new Float32Array(count * 2);
  points.forEach((p, i) => {
    pts[i * 2] = p.x;
    pts[i * 2 + 1] = p.y;
  });
  const ptsBuf = device.createBuffer({ size: pts.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ptsBuf, 0, pts);
  const out = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: count * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: cfg } },
      { binding: 1, resource: { buffer: out } },
      { binding: 2, resource: { buffer: ptsBuf } },
    ],
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(Math.ceil(count / 64));
  pass.end();
  enc.copyBufferToBuffer(out, 0, read, 0, count * 4);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Float32Array(read.getMappedRange().slice(0)));
  read.unmap();
  [cfg, out, read, ptsBuf].forEach((b) => b.destroy());
  return values;
}
