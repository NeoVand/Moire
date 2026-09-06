// The side-by-side anti-aliasing demo: a plane with the benchmark shaders
// (Yang and Barnes 2018) seen through a moving camera, rendered six ways at
// once: point sampling, supersampling, temporal AA, the hardware's mipmapped
// texture, ours, and a sampled reference. Meters: RMS error of each arm
// against the reference in linear light and after the 8-bit clamp, and the
// GPU time of each arm's pass.
import { MASK, maskField, maskCoefTable } from './mask-table.js';
import { COMMON, ARM_POINT, ARM_SSAA, ARM_REFERENCE, ARM_TAA, ARM_MIP, ARM_OURS, ARM_COMBO, METERS, DISPLAY } from './wgsl.js';

const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const el = $('log');
  el.textContent = `${msg}\n${el.textContent}`.split('\n').slice(0, 12).join('\n');
};

const LIGHT = [0.22808577638091165, 0.60822873701576452, 0.76028592126970562];
const ARMS = ['point', 'ssaa', 'taa', 'mip', 'ours', 'combo', 'reference'];

// ---------------------------------------------------------------------------
// camera: a homography (x, y, 1) -> (Nu, Nv, D), plane coordinates (Nu, Nv) / D
// ---------------------------------------------------------------------------
// the benchmark's plane: s = -50 (x - 240) / (y + 1), t = -12000 / (y + 1),
// translated by (os, ot) on the plane
// the mask of scene 3 (its field, and the torus coefficient table for the kernel's far field)
const MASK_TABLE = maskCoefTable(12, 96);
const maskMean = MASK_TABLE.mean;
const homographyYB = (os, ot) => ({
  hu: [-50, os, 12000 + os],
  hv: [0, ot, -12000 + ot],
  hd: [0, 1, 1],
  eye: [0, 0, 0, 1],
});
// a pinhole camera above the plane z = 0: eye P, yaw psi about z, pitch theta
// down, focal f pixels, principal point (cx, cy)
const homographyCamera = (P, psi, theta, f, cx, cy) => {
  const F0 = [Math.cos(psi), Math.sin(psi), 0];
  const Rt = [Math.sin(psi), -Math.cos(psi), 0];
  const up = [0, 0, 1];
  const F = F0.map((c, i) => Math.cos(theta) * c - Math.sin(theta) * up[i]);
  const Up = F0.map((c, i) => Math.sin(theta) * c + Math.cos(theta) * up[i]);
  // ray d(x, y) = F + ((x - cx) / f) Rt - ((y - cy) / f) Up; each component affine in (x, y, 1)
  const comp = (k) => [Rt[k] / f, -Up[k] / f, F[k] - (cx * Rt[k]) / f + (cy * Up[k]) / f];
  const dx = comp(0);
  const dy = comp(1);
  const dz = comp(2);
  // ground point G = P - (Pz / dz) d: Nu = Px dz - Pz dx, Nv = Py dz - Pz dy, D = dz; negated so D > 0 on the ground
  const hu = dz.map((c, i) => -(P[0] * c - P[2] * dx[i]));
  const hv = dz.map((c, i) => -(P[1] * c - P[2] * dy[i]));
  const hd = dz.map((c) => -c);
  return { hu, hv, hd, eye: [P[0], P[1], P[2], 0] };
};
const inverse3 = (r0, r1, r2) => {
  const [a, b, c] = r0;
  const [d, e, f] = r1;
  const [g, h, i] = r2;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const inv = [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
  return inv;
};

const PATHS = {
  ybStill: { label: 'benchmark plane, still', at: () => homographyYB(0, 0) },
  ybStrafe: { label: 'benchmark plane, strafing', at: (t) => homographyYB(6 * t, 0) },
  ybDolly: { label: 'benchmark plane, dollying', at: (t) => homographyYB(0, 15 * t) },
  ybBoth: { label: 'benchmark plane, strafe and dolly', at: (t) => homographyYB(6 * Math.sin(0.5 * t) * 4, 15 * t) },
  fly: {
    label: 'flight over the plane',
    at: (t, W, H) => {
      const P = [40 * Math.sin(0.3 * t), -20 * t, 50 + 12 * Math.sin(0.2 * t)];
      const psi = -Math.PI / 2 + 0.35 * Math.sin(0.15 * t);
      const theta = 0.12 + 0.08 * Math.sin(0.1 * t);
      return homographyCamera(P, psi, theta, 240 * (W / 480), W / 2, -1 * (H / 320) + 0.0 * H);
    },
  },
  flyLow: {
    label: 'low flight, horizon in view',
    at: (t, W, H) => {
      const P = [20 * Math.sin(0.25 * t), -25 * t, 30 + 5 * Math.sin(0.3 * t)];
      const psi = -Math.PI / 2 + 0.25 * Math.sin(0.2 * t);
      const theta = 0.03 + 0.03 * Math.sin(0.13 * t);
      return homographyCamera(P, psi, theta, 300 * (W / 480), W / 2, H * 0.35);
    },
  },
};

// the detail layer of scenes 4 and 5 on the CPU (the same hash and quintic
// interpolation as the shader's detailT), in lattice units; 64 cells a period
const hash3 = (x, y, z) => {
  let h = (Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77) ^ Math.imul(z, 0xc2b2ae3d)) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h;
};
const unit = (h) => ((h & 0x00ffffff) + 0.5) / 16777216;
const latticeVal = (i, j) => 2 * unit(hash3(i & 63, j & 63, 77)) - 1;
const detailAt = (u, v) => {
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const fu = u - i0;
  const fv = v - j0;
  const wu = fu * fu * fu * (fu * (fu * 6 - 15) + 10);
  const wv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
  const a = latticeVal(i0, j0);
  const b = latticeVal(i0 + 1, j0);
  const c = latticeVal(i0, j0 + 1);
  const d = latticeVal(i0 + 1, j0 + 1);
  const top = a + (b - a) * wu;
  const bot = c + (d - c) * wu;
  return top + (bot - top) * wv;
};

// Halton for the TAA jitter
const halton = (i, b) => {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= b;
    r += f * (n % b);
    n = Math.floor(n / b);
  }
  return r;
};

// ---------------------------------------------------------------------------
// GPU setup
// ---------------------------------------------------------------------------
const main = async () => {
  if (!navigator.gpu) {
    log('WebGPU is not available in this browser');
    return;
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    log('no WebGPU adapter');
    return;
  }
  const wantTs = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: wantTs ? ['timestamp-query'] : [] });
  const hasTs = device.features.has('timestamp-query');
  device.lost.then((info) => log(`device lost: ${info.reason} ${info.message}`));
  // a pipeline the backend compiler rejects fails silently otherwise: name it
  device.addEventListener('uncapturederror', (e) => log(`GPU error: ${String(e.error && e.error.message).slice(0, 400)}`));
  log(`adapter: ${adapter.info ? `${adapter.info.vendor} ${adapter.info.architecture} ${adapter.info.description}` : 'unknown'}; timestamps ${hasTs ? 'on' : 'off'}`);
  const canvas = $('canvas');
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  const q = new URLSearchParams(location.search);
  let W = Number((q.get('size') || '480x320').split('x')[0]);
  let H = Number((q.get('size') || '480x320').split('x')[1]);
  const state = {
    scene: Number(q.get('scene') || 0),
    path: 'ybBoth',
    ssaa: 16,
    refSamples: 1024,
    taaAlpha: 0.1,
    // the residual arm (scenes 4 and 5): the predictor's exact mean from the
    // ours pass plus a TAA history of the residual at its own blend weight;
    // detail is the noise layer's amplitude m, detailScale its lattice in plane units
    residAlpha: 0.5,
    detail: 0.3,
    detailScale: 4,
    autoBench: true,
    manual: false,
    fixedDt: null,
    paused: false,
    time: 0,
    frame: 0,
    regime: false,
    heat: false,
    heatGain: 8,
    zoom: null,
    speed: 1,
  };

  // textures: one per arm, plus TAA's sample and history, and the reference's ping-pong
  const makeTex = (usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST) =>
    device.createTexture({ size: [W, H], format: 'rgba32float', usage });
  let tex = {};
  const allocTextures = () => {
    for (const t of Object.values(tex)) t.destroy();
    tex = {
      point: makeTex(), ssaa: makeTex(), taa: makeTex(), taaCur: makeTex(), taaHist: makeTex(), mip: makeTex(), ours: makeTex(),
      residCur: makeTex(), resid: makeTex(), residHist: makeTex(), combo: makeTex(),
      refA: makeTex(), refB: makeTex(),
    };
  };
  allocTextures();

  // the mipmapped picture: one period of the checkerboard (scene 0) or the circles cell (scene 1), 1024 texels, box-filtered chain
  const PIC_N = 1024;
  const mipPicture = (valueAt) => {
    const levels = Math.log2(PIC_N) + 1;
    const t = device.createTexture({ size: [PIC_N, PIC_N], format: 'r8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    let data = new Float32Array(PIC_N * PIC_N);
    for (let j = 0; j < PIC_N; j++)
      for (let i = 0; i < PIC_N; i++) data[j * PIC_N + i] = valueAt((i + 0.5) / PIC_N, (j + 0.5) / PIC_N);
    let n = PIC_N;
    for (let level = 0; level < levels; level++) {
      const bytes = new Uint8Array(n * n);
      for (let k = 0; k < n * n; k++) bytes[k] = Math.round(Math.min(1, Math.max(0, data[k])) * 255);
      device.queue.writeTexture({ texture: t, mipLevel: level }, bytes, { bytesPerRow: n }, [n, n]);
      if (n === 1) break;
      const m = n / 2;
      const next = new Float32Array(m * m);
      for (let j = 0; j < m; j++)
        for (let i = 0; i < m; i++) next[j * m + i] = 0.25 * (data[2 * j * n + 2 * i] + data[2 * j * n + 2 * i + 1] + data[(2 * j + 1) * n + 2 * i] + data[(2 * j + 1) * n + 2 * i + 1]);
      data = next;
      n = m;
    }
    return t;
  };
  const picTexFor = (sceneIn) => {
    const scene = sceneIn === 2 || sceneIn >= 4 ? 0 : sceneIn; // the rippled and the detailed checkerboards sample the checker texture
    return mipPicture((u, v) => {
        let P;
        if (scene === 3) {
          P = maskField(u * 1024, v * 1024) > MASK.t0 ? 1 : 0; // 1024 plane units a tile
        } else if (scene === 0) {
          const ss = u >= 0.5 ? 1 : 0;
          const tt = v >= 0.5 ? 1 : 0;
          P = ss * tt + (1 - ss) * (1 - tt);
        } else {
          const circleR = 25 / 3;
          const gap = 5 / 3;
          const d = 2 * circleR + 2 * gap;
          const xm = u * d - gap;
          const ym = v * d - gap;
          const r = Math.hypot(xm - circleR, ym - circleR);
          P = 0.5 - 0.5 * Math.sign(r - circleR);
        }
        return P;
    });
  };
  // the detail layer's picture: 64 lattice cells a tile, 16 texels a cell, (T + 1) / 2
  const detailTex = mipPicture((u, v) => 0.5 + 0.5 * detailAt(u * 64, v * 64));
  let picTex = picTexFor(state.scene);
  $('scene').value = String(state.scene);
  $('res').value = `${W}x${H}`;
  const picSampler = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 16 });

  // uniforms: 16 vec4
  const UBYTES = 17 * 16;
  const ubuf = device.createBuffer({ size: UBYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const dbuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  // the mask node's coefficient table (scene 3), read by the ours pass at binding 3
  const maskBuf = device.createBuffer({ size: MASK_TABLE.table.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(maskBuf, 0, MASK_TABLE.table);
  const maskEntry = { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } };
  const maskBind = { binding: 3, resource: { buffer: maskBuf } };

  const module = (code) => device.createShaderModule({ code: COMMON + code });
  const render = (code, entry, extra = []) => {
    const layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }, ...extra],
    });
    const mod = module(code);
    const t0 = performance.now();
    device.pushErrorScope('internal');
    device.pushErrorScope('validation');
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module: mod, entryPoint: 'vsFull' },
      fragment: { module: mod, entryPoint: entry, targets: [{ format: 'rgba32float' }] },
      primitive: { topology: 'triangle-list' },
    });
    device.popErrorScope().then((err) => err && log(`${entry}: pipeline validation error: ${err.message.slice(0, 400)}`));
    device.popErrorScope().then((err) => err && log(`${entry}: pipeline internal error: ${err.message.slice(0, 400)}`));
    // the pipeline is created asynchronously on the GPU process; wait for it once to time the compile
    device.queue.onSubmittedWorkDone();
    mod.getCompilationInfo().then((info) => {
      const ms = performance.now() - t0;
      const errs = info.messages.filter((m) => m.type === 'error');
      if (errs.length || ms > 500) log(`${entry}: shader compile ${ms.toFixed(0)} ms${errs.length ? `, ${errs.length} errors: ${errs[0].message}` : ''}`);
    });
    return { pipeline, layout };
  };
  const texEntry = (binding) => ({ binding, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } });
  const P = {
    point: render(ARM_POINT, 'fsPoint'),
    ssaa: render(ARM_SSAA, 'fsSSAA'),
    reference: render(ARM_REFERENCE, 'fsReference', [texEntry(1)]),
    taaSample: render(ARM_TAA, 'fsTaaSample'),
    taaResolve: render(ARM_TAA, 'fsTaaResolve', [texEntry(1), texEntry(2)]),
    residSample: render(ARM_TAA, 'fsResidualSample'),
    residResolve: render(ARM_TAA, 'fsResidualResolve', [texEntry(1), texEntry(2)]),
    combine: render(ARM_COMBO, 'fsCombine', [texEntry(1), texEntry(2)]),
    mip: render(ARM_MIP, 'fsMip', [
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ]),
    ours: render(ARM_OURS, 'fsOurs', [maskEntry]),
  };
  const mipBinds = () => [{ binding: 1, resource: picTex.createView() }, { binding: 2, resource: picSampler }, { binding: 3, resource: detailTex.createView() }];
  // meters
  const metersLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ...[1, 2, 3, 4, 5, 6, 7].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } })),
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const metersPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [metersLayout] }),
    compute: { module: module(METERS), entryPoint: 'csMeters' },
  });
  // display
  const displayLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((b) => ({ binding: b, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } })),
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const displayPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [displayLayout] }),
    vertex: { module: module(DISPLAY), entryPoint: 'vsFull' },
    fragment: { module: module(DISPLAY), entryPoint: 'fsDisplay', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  let numWG = Math.ceil(W / 16) * Math.ceil(H / 16);
  const NPART = 13; // six arms, two metrics, and the count of pixels measured
  let partials = device.createBuffer({ size: numWG * NPART * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  let partialsRead = device.createBuffer({ size: numWG * NPART * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const NPASS = 11; // point, ssaa, taa sample, taa resolve, mip, ours, residual sample, residual resolve, combine, reference, meters
  let querySet = null;
  let tsBuf = null;
  let tsRead = null;
  if (hasTs) {
    querySet = device.createQuerySet({ type: 'timestamp', count: 2 * NPASS });
    tsBuf = device.createBuffer({ size: 2 * NPASS * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    tsRead = device.createBuffer({ size: 2 * NPASS * 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }

  const resize = (w, h) => {
    W = w;
    H = h;
    allocTextures();
    numWG = Math.ceil(W / 16) * Math.ceil(H / 16);
    partials.destroy();
    partialsRead.destroy();
    partials = device.createBuffer({ size: numWG * NPART * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    partialsRead = device.createBuffer({ size: numWG * NPART * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    canvas.width = 4 * W;
    canvas.height = 2 * H;
    refCount = 0;
  };
  canvas.width = 4 * W;
  canvas.height = 2 * H;

  // uniform assembly
  const uni = new Float32Array(68);
  let prevH = null;
  let refCount = 0;
  let refPing = 0;
  let matKey = ''; // the material as the reference and the histories saw it: a change invalidates both
  let historyReset = true;
  let lastH = null; // the homography of the last frame rendered, for the CPU-side validity mask
  const jitter = [0, 0];
  const setUniforms = (Hm, still) => {
    const set = (o, v) => uni.set(v, o);
    set(0, [...Hm.hu, 0]);
    set(4, [...Hm.hv, 0]);
    set(8, [...Hm.hd, 0]);
    const Pm = prevH || Hm;
    set(12, [...Pm.hu, 0]);
    set(16, [...Pm.hv, 0]);
    set(20, [...Pm.hd, 0]);
    const inv = inverse3(Pm.hu, Pm.hv, Pm.hd);
    set(24, [...inv[0], 0]);
    set(28, [...inv[1], 0]);
    set(32, [...inv[2], 0]);
    set(36, [...LIGHT, 0]);
    set(40, Hm.eye);
    set(44, [W, H, 1 / W, 1 / H]);
    // TAA jitter: Halton (2, 3) through Box-Muller, sigma-scaled, in pixels
    const k = (state.frame % 64) + 1;
    const u1 = halton(k, 2);
    const u2 = halton(k, 3);
    const m = Math.sqrt(-2 * Math.log(1 - u1));
    jitter[0] = 0.5 * m * Math.cos(2 * Math.PI * u2);
    jitter[1] = 0.5 * m * Math.sin(2 * Math.PI * u2);
    set(48, [0.5, state.time, jitter[0], jitter[1]]);
    set(52, [0, state.frame, state.scene, state.scene === 1 ? 2 * (25 / 3) + 2 * (5 / 3) : 20]);
    set(56, [state.taaAlpha, still ? 1 : 0, state.regime ? 1 : 0, state.oursMode || 0]);
    set(60, [maskMean, state.detail, state.residAlpha, state.detailScale]);
    set(64, [historyReset ? 1 : 0, 0, 0, 0]);
  };
  const writeUniforms = (samples, seed) => {
    uni[52] = samples;
    uni[53] = seed;
    device.queue.writeBuffer(ubuf, 0, uni);
  };

  const bind = (layout, entries) => device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: ubuf } }, ...entries] });
  const view = (t) => t.createView();

  // meter state
  const meters = { rms: new Array(6).fill(NaN), rms8: new Array(6).fill(NaN), ms: new Array(NPASS).fill(NaN), pixels: 0, pending: false };
  const msAvg = new Array(NPASS).fill(0);
  let msN = 0;

  const passDesc = (target, idx) => {
    const d = { colorAttachments: [{ view: view(target), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] };
    if (hasTs) d.timestampWrites = { querySet, beginningOfPassWriteIndex: 2 * idx, endOfPassWriteIndex: 2 * idx + 1 };
    return d;
  };
  const draw = (enc, desc, pipeline, group) => {
    const pass = enc.beginRenderPass(desc);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  };

  // GPU time per arm: each arm's pass alone, repeated, timed from submit to
  // onSubmittedWorkDone; the pass timestamps on Metal read the command
  // buffer's span, not the pass's, so they are not used
  const bench = { ms: new Array(7).fill(NaN), running: false, last: 0 };
  const benchArms = async () => {
    if (bench.running) return;
    bench.running = true;
    const reps = 4;
    const run = async (encodePass) => {
      await device.queue.onSubmittedWorkDone();
      const t0 = performance.now();
      for (let r = 0; r < reps; r++) {
        const enc = device.createCommandEncoder();
        encodePass(enc);
        device.queue.submit([enc.finish()]);
      }
      await device.queue.onSubmittedWorkDone();
      return (performance.now() - t0) / reps;
    };
    const plain = (target) => ({ colorAttachments: [{ view: view(target), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    try {
      writeUniforms(state.ssaa, state.frame);
      bench.ms[0] = await run((enc) => draw(enc, plain(tex.point), P.point.pipeline, bind(P.point.layout, [])));
      bench.ms[1] = await run((enc) => draw(enc, plain(tex.ssaa), P.ssaa.pipeline, bind(P.ssaa.layout, [])));
      bench.ms[2] = await run((enc) => {
        draw(enc, plain(tex.taaCur), P.taaSample.pipeline, bind(P.taaSample.layout, []));
        draw(enc, plain(tex.taa), P.taaResolve.pipeline, bind(P.taaResolve.layout, [{ binding: 1, resource: view(tex.taaCur) }, { binding: 2, resource: view(tex.taaHist) }]));
      });
      bench.ms[3] = await run((enc) => draw(enc, plain(tex.mip), P.mip.pipeline, bind(P.mip.layout, mipBinds())));
      bench.ms[4] = await run((enc) => draw(enc, plain(tex.ours), P.ours.pipeline, bind(P.ours.layout, [maskBind])));
      // the residual arm's own passes (its total is this plus the ours pass)
      bench.ms[5] = await run((enc) => {
        draw(enc, plain(tex.residCur), P.residSample.pipeline, bind(P.residSample.layout, []));
        draw(enc, plain(tex.resid), P.residResolve.pipeline, bind(P.residResolve.layout, [{ binding: 1, resource: view(tex.residCur) }, { binding: 2, resource: view(tex.residHist) }]));
        draw(enc, plain(tex.combo), P.combine.pipeline, bind(P.combine.layout, [{ binding: 1, resource: view(tex.ours) }, { binding: 2, resource: view(tex.resid) }]));
      });
      writeUniforms(state.refSamples, 1);
      bench.ms[6] = await run((enc) => draw(enc, plain(tex.refB), P.reference.pipeline, bind(P.reference.layout, [{ binding: 1, resource: view(tex.refA) }])));
    } catch (e) {
      log(`bench failed: ${e.message}`);
    }
    bench.running = false;
    bench.last = performance.now();
  };

  let lastFrameTime = performance.now();
  let fps = 0;
  const frame = () => {
    if (bench.running) {
      // the frame loop yields while the arms are timed alone
      requestAnimationFrame(frame);
      lastFrameTime = performance.now();
      return;
    }
    const now = performance.now();
    const dt = state.fixedDt !== null ? state.fixedDt : Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    fps = 0.9 * fps + 0.1 * (1 / Math.max(dt, 1e-3));
    if (!state.paused) state.time += dt * state.speed;
    const Hm = PATHS[state.path].at(state.time, W, H);
    const key = `${state.scene}|${state.detail}|${state.detailScale}|${W}x${H}`;
    const sameMaterial = key === matKey;
    matKey = key;
    const still = sameMaterial && prevH && prevH.hu.every((v, i) => v === Hm.hu[i]) && prevH.hv.every((v, i) => v === Hm.hv[i]) && prevH.hd.every((v, i) => v === Hm.hd[i]);
    if (!still) refCount = 0;
    // the histories are invalid after a cut (no previous camera), a material change or a resize: the resolves take the current sample alone
    historyReset = !prevH || !sameMaterial;
    lastH = Hm;
    setUniforms(Hm, still);
    // the frame's passes share one uniform buffer per submission; arms that
    // need their own sample counts get their own writes and submissions
    const submitOne = (fn) => {
      const enc = device.createCommandEncoder();
      fn(enc);
      device.queue.submit([enc.finish()]);
    };
    // point, TAA sample, mip, ours (one write)
    writeUniforms(state.ssaa, state.frame);
    submitOne((enc) => {
      draw(enc, passDesc(tex.point, 0), P.point.pipeline, bind(P.point.layout, []));
      draw(enc, passDesc(tex.ssaa, 1), P.ssaa.pipeline, bind(P.ssaa.layout, []));
      draw(enc, passDesc(tex.taaCur, 2), P.taaSample.pipeline, bind(P.taaSample.layout, []));
      draw(enc, passDesc(tex.taa, 3), P.taaResolve.pipeline, bind(P.taaResolve.layout, [{ binding: 1, resource: view(tex.taaCur) }, { binding: 2, resource: view(tex.taaHist) }]));
      enc.copyTextureToTexture({ texture: tex.taa }, { texture: tex.taaHist }, [W, H]);
      draw(enc, passDesc(tex.mip, 4), P.mip.pipeline, bind(P.mip.layout, mipBinds()));
      draw(enc, passDesc(tex.ours, 5), P.ours.pipeline, bind(P.ours.layout, [maskBind]));
      // the residual arm: the residual at the jitter, its history, the predictor's mean added back
      draw(enc, passDesc(tex.residCur, 6), P.residSample.pipeline, bind(P.residSample.layout, []));
      draw(enc, passDesc(tex.resid, 7), P.residResolve.pipeline, bind(P.residResolve.layout, [{ binding: 1, resource: view(tex.residCur) }, { binding: 2, resource: view(tex.residHist) }]));
      enc.copyTextureToTexture({ texture: tex.resid }, { texture: tex.residHist }, [W, H]);
      draw(enc, passDesc(tex.combo, 8), P.combine.pipeline, bind(P.combine.layout, [{ binding: 1, resource: view(tex.ours) }, { binding: 2, resource: view(tex.resid) }]));
    });
    // the reference, with its own sample count
    const refSrc = refPing ? tex.refB : tex.refA;
    const refDst = refPing ? tex.refA : tex.refB;
    writeUniforms(state.refSamples, state.frame * 7919 + 13);
    submitOne((enc) => {
      draw(enc, passDesc(refDst, 9), P.reference.pipeline, bind(P.reference.layout, [{ binding: 1, resource: view(refSrc) }]));
      // meters
      const pass = enc.beginComputePass(hasTs ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 2 * (NPASS - 1), endOfPassWriteIndex: 2 * (NPASS - 1) + 1 } } : {});
      pass.setPipeline(metersPipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: metersLayout,
          entries: [
            { binding: 0, resource: { buffer: ubuf } },
            { binding: 1, resource: view(refDst) },
            { binding: 2, resource: view(tex.point) },
            { binding: 3, resource: view(tex.ssaa) },
            { binding: 4, resource: view(tex.taa) },
            { binding: 5, resource: view(tex.mip) },
            { binding: 6, resource: view(tex.ours) },
            { binding: 7, resource: view(tex.combo) },
            { binding: 8, resource: { buffer: partials } },
          ],
        }),
      );
      pass.dispatchWorkgroups(Math.ceil(W / 16), Math.ceil(H / 16));
      pass.end();
      if (!meters.pending) {
        enc.copyBufferToBuffer(partials, 0, partialsRead, 0, numWG * NPART * 4);
        if (hasTs) {
          enc.resolveQuerySet(querySet, 0, 2 * NPASS, tsBuf, 0);
          enc.copyBufferToBuffer(tsBuf, 0, tsRead, 0, 2 * NPASS * 8);
        }
      }
      // display
      device.queue.writeBuffer(dbuf, 0, new Float32Array([state.zoom ? state.zoom[0] : 0, state.zoom ? state.zoom[1] : 0, 6, state.zoom ? 1 : 0, state.heat ? 1 : 0, state.heatGain, 0, 0]));
      const dpass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      dpass.setPipeline(displayPipeline);
      dpass.setBindGroup(
        0,
        device.createBindGroup({
          layout: displayLayout,
          entries: [
            { binding: 0, resource: { buffer: ubuf } },
            { binding: 1, resource: view(tex.point) },
            { binding: 2, resource: view(tex.ssaa) },
            { binding: 3, resource: view(tex.taa) },
            { binding: 4, resource: view(tex.mip) },
            { binding: 5, resource: view(tex.ours) },
            { binding: 6, resource: view(tex.combo) },
            { binding: 7, resource: view(tex.resid) },
            { binding: 8, resource: view(refDst) },
            { binding: 9, resource: { buffer: dbuf } },
          ],
        }),
      );
      dpass.draw(3);
      dpass.end();
    });
    refPing ^= 1;
    refCount = still ? refCount + 1 : 1;
    prevH = Hm;
    if (state.frame === 0 || state.frame === 5) {
      const f = state.frame;
      const t1 = performance.now();
      device.queue.onSubmittedWorkDone().then(() => log(`frame ${f}: GPU completed ${(performance.now() - t1).toFixed(0)} ms after submit`));
    }
    state.frame++;
    if (!meters.pending) {
      meters.pending = true;
      const reads = [partialsRead.mapAsync(GPUMapMode.READ)];
      if (hasTs) reads.push(tsRead.mapAsync(GPUMapMode.READ));
      Promise.all(reads)
        .then(() => {
          const arr = new Float32Array(partialsRead.getMappedRange());
          const sums = new Array(NPART).fill(0);
          for (let g = 0; g < numWG; g++) for (let j = 0; j < NPART; j++) sums[j] += arr[g * NPART + j];
          partialsRead.unmap();
          const count = sums[12];
          meters.pixels = count;
          for (let k = 0; k < 6; k++) {
            // an empty domain (every footprint reaches the horizon) has no error to report
            meters.rms[k] = count > 0 ? Math.sqrt(sums[2 * k] / count) : NaN;
            meters.rms8[k] = count > 0 ? Math.sqrt(sums[2 * k + 1] / count) : NaN;
          }
          if (hasTs) {
            const ts = new BigInt64Array(tsRead.getMappedRange());
            for (let p = 0; p < NPASS; p++) {
              const ms = Number(ts[2 * p + 1] - ts[2 * p]) / 1e6;
              if (ms >= 0 && ms < 1e4) {
                msAvg[p] = msN === 0 ? ms : 0.9 * msAvg[p] + 0.1 * ms;
              }
            }
            msN++;
            tsRead.unmap();
          }
          meters.pending = false;
          updateTable();
        })
        .catch((e) => {
          meters.pending = false;
          log(`readback failed: ${e.message}`);
        });
    }
    if (state.autoBench && !bench.running && performance.now() - bench.last > 15000) benchArms();
    if (!state.manual) requestAnimationFrame(frame);
  };

  const fmt = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const psnr = (r) => (r > 0 ? 20 * Math.log10(1 / r) : Infinity);
  const updateTable = () => {
    const names = ['no AA (1 spp)', `SSAA ${state.ssaa}x`, `TAA (1 spp + history, alpha ${state.taaAlpha})`, 'mipmap, 16x aniso', 'ours (closed form)', `ours + residual history (alpha ${state.residAlpha}; its ms exclude the ours pass)`];
    const rows = names.map((n, k) => `<tr><td>${n}</td><td>${fmt(meters.rms[k])}</td><td>${fmt(meters.rms8[k] * 255, 2)}</td><td>${fmt(psnr(meters.rms[k]), 1)}</td><td>${fmt(bench.ms[k], 3)}</td></tr>`);
    const acc = refCount > 1 ? `, ${refCount} frames accumulated: ${(refCount * state.refSamples).toLocaleString()} spp` : '';
    rows.push(`<tr class="ref"><td>reference (${state.refSamples} spp a frame${acc})</td><td>0</td><td>0</td><td>∞</td><td>${fmt(bench.ms[6], 3)}</td></tr>`);
    $('meters').innerHTML = rows.join('');
    const excluded = W * H - meters.pixels;
    $('status').textContent = `${W}x${H} per pane · ${fps.toFixed(0)} fps · t = ${state.time.toFixed(1)} s · frame ${state.frame}${excluded > 0 ? ` · ${excluded} pixels whose footprint reaches the horizon are not measured` : ''}${state.zoom ? ` · magnifier at (${state.zoom[0]}, ${state.zoom[1]})` : ''}`;
  };

  // controls
  $('path').innerHTML = Object.entries(PATHS).map(([k, v]) => `<option value="${k}" ${k === state.path ? 'selected' : ''}>${v.label}</option>`).join('');
  $('path').onchange = (e) => {
    state.path = e.target.value;
    state.time = 0;
    prevH = null;
  };
  $('scene').onchange = (e) => {
    state.scene = Number(e.target.value);
    picTex.destroy();
    picTex = picTexFor(state.scene);
    refCount = 0;
    prevH = null; // the reference restarts: a new picture, not a still frame
  };
  $('ssaa').onchange = (e) => (state.ssaa = Number(e.target.value));
  $('refn').onchange = (e) => (state.refSamples = Number(e.target.value));
  $('res').onchange = (e) => {
    const [w, h] = e.target.value.split('x').map(Number);
    resize(w, h);
    prevH = null;
  };
  $('speed').onchange = (e) => (state.speed = Number(e.target.value));
  $('pause').onclick = () => {
    state.paused = !state.paused;
    $('pause').textContent = state.paused ? 'resume' : 'pause';
  };
  $('regime').onchange = (e) => (state.regime = e.target.checked);
  $('ralpha').onchange = (e) => (state.residAlpha = Number(e.target.value));
  $('detail').onchange = (e) => (state.detail = Number(e.target.value));
  $('measure').onclick = () => benchArms();
  $('heat').onchange = (e) => (state.heat = e.target.checked);
  $('gain').onchange = (e) => (state.heatGain = Number(e.target.value));
  canvas.onclick = (e) => {
    if (state.zoom) {
      state.zoom = null;
      return;
    }
    const r = canvas.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * 4;
    const fy = ((e.clientY - r.top) / r.height) * 2;
    const px = Math.floor((fx - Math.floor(fx)) * W);
    const py = Math.floor((fy - Math.floor(fy)) * H);
    state.zoom = [px, py];
  };
  window.demoState = state;
  window.demoMeters = meters;
  window.demoBench = bench;
  // a programmatic cut: after setting demoState.path or demoState.time directly (the
  // select's handler does this itself), call demoCut() so the reference restarts and the
  // histories are reset on the next frame instead of blending across the cut
  window.demoCut = () => {
    prevH = null;
    refCount = 0;
  };
  // the validity domain shared by the meters and the hooks: a pixel counts when its
  // footprint (3 sigma) stays on the ground plane, the same test as csMeters; the
  // Gaussian has no finite support, so a retained centre keeps an off-plane
  // probability of at most Phi(-3), about 0.00135, which a certified mean must budget
  const validMask = () => {
    const mask = new Uint8Array(W * H);
    if (!lastH) return mask.fill(1);
    const [a, b, c] = lastH.hd;
    const reach = 3 * 0.5 * Math.hypot(a, b);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = a * x + b * y + c - reach > 0 ? 1 : 0;
    return mask;
  };
  window.demoValidMask = validMask;
  // step frames without the animation loop (an occluded window throttles it):
  // the loop is suspended, each step awaits the GPU, the loop resumes after
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const manually = async (fn) => {
    const wasManual = state.manual;
    state.manual = true;
    state.autoBench = false;
    while (bench.running) await sleep(20);
    await sleep(40); // let a pending animation frame return without rescheduling
    try {
      return await fn();
    } finally {
      state.manual = wasManual;
      state.autoBench = true;
      if (!wasManual) requestAnimationFrame(frame);
    }
  };
  const stepOne = async () => {
    frame();
    await device.queue.onSubmittedWorkDone();
  };
  window.demoStep = async (n = 1) =>
    manually(async () => {
      for (let i = 0; i < n; i++) await stepOne();
      await sleep(50);
      updateTable();
    });
  // the meters over a run of frames: each frame's RMS per arm with its count of
  // accepted pixels (after the readback lands); past the warm-up, the error pooled
  // over accepted pixel-frame pairs (the sum of squared errors over the sum of counts),
  // which equals the frame-weighted figure only when the domain does not move
  window.demoRun = async (n = 60, warm = 30) =>
    manually(async () => {
      const per = [];
      for (let i = 0; i < n; i++) {
        await stepOne();
        while (meters.pending) await sleep(2);
        per.push({ rms: meters.rms.slice(), pixels: meters.pixels });
      }
      const used = per.slice(warm);
      const pairs = used.reduce((acc, f) => acc + f.pixels, 0);
      const rms = ARMS.slice(0, 6).map((_, k) => (pairs > 0 ? Math.sqrt(used.reduce((acc, f) => acc + f.rms[k] * f.rms[k] * f.pixels, 0) / pairs) : NaN));
      const counts = used.map((f) => f.pixels);
      return { arms: ARMS.slice(0, 6), rms, frames: used.length, pixelFrames: pairs, pixelsMin: Math.min(...counts), pixelsMax: Math.max(...counts), per, refFrames: refCount };
    });
  // temporal statistics of arm textures over a run of frames on a still scene: the
  // per-pixel standard deviation across frames (its RMS over the accepted pixels and
  // by row band) and the mean absolute frame-to-frame difference; the variance ratio
  // rho = Var(residCur) / Var(taaCur) is the residual's share of the sample variance.
  // The domain is the meters' validity mask taken at the first measured frame; if it
  // changes during the run (a moving camera) the result says so and is not a flicker figure
  window.demoTemporal = async (n = 64, names = ['taa', 'combo', 'ours', 'taaCur', 'residCur'], warm = 0) =>
    manually(async () => {
      const N = W * H;
      const acc = Object.fromEntries(names.map((nm) => [nm, { sum: new Float64Array(N), sq: new Float64Array(N), ad: new Float64Array(N), prev: null, count: 0 }]));
      let mask = null;
      let maskChanged = false;
      for (let i = 0; i < n + warm; i++) {
        await stepOne();
        if (i < warm) continue;
        const m = validMask();
        if (!mask) mask = m;
        else if (!maskChanged) for (let k = 0; k < N; k++) if (m[k] !== mask[k]) { maskChanged = true; break; }
        for (const nm of names) {
          const d = await window.demoReadTex(nm);
          const a = acc[nm];
          for (let k = 0; k < N; k++) {
            a.sum[k] += d[k];
            a.sq[k] += d[k] * d[k];
            if (a.prev) a.ad[k] += Math.abs(d[k] - a.prev[k]);
          }
          a.prev = d;
          a.count++;
        }
      }
      const bands = [[0, Math.round(H * 0.08)], [Math.round(H * 0.08), Math.round(H * 0.2)], [Math.round(H * 0.2), H]];
      const out = { maskChanged, pixels: 0, excluded: 0 };
      for (let k = 0; k < N; k++) out.pixels += mask[k];
      out.excluded = N - out.pixels;
      const over = (y0, y1, v, ad, c) => {
        let sv = 0;
        let sd = 0;
        let m = 0;
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const k = y * W + x; if (!mask[k]) continue; sv += v[k]; sd += ad[k] / Math.max(1, c - 1); m++; }
        return m > 0 ? { std: +Math.sqrt(sv / m).toFixed(5), var: sv / m, madiff: +(sd / m).toFixed(5), pixels: m } : { std: NaN, var: NaN, madiff: NaN, pixels: 0 };
      };
      for (const nm of names) {
        const a = acc[nm];
        const c = a.count;
        const v = new Float64Array(N);
        for (let k = 0; k < N; k++) v[k] = Math.max(0, a.sq[k] / c - (a.sum[k] / c) * (a.sum[k] / c));
        const band = bands.map(([y0, y1]) => ({ rows: `${y0}-${y1 - 1}`, ...over(y0, y1, v, a.ad, c) }));
        out[nm] = { ...over(0, H, v, a.ad, c), bands: band };
      }
      if (out.taaCur && out.residCur) out.rho = out.residCur.var / out.taaCur.var;
      return out;
    });
  // read any arm's texture back (channel 0 as a Float32Array of W * H): 'ours' or 'ref'
  window.demoReadTex = async (name) => {
    const t = name === 'ref' ? (refPing ? tex.refB : tex.refA) : tex[name];
    const bytes = W * 16;
    const buf = device.createBuffer({ size: bytes * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: t }, { buffer: buf, bytesPerRow: bytes }, [W, H]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    const out = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = data[i * 4];
    return out;
  };
  // the error of an arm (ours by default) against the reference by row band and
  // the worst pixel, over the meters' validity domain; a band with no accepted
  // pixel reads NaN
  window.demoRowError = async (bandRows = 8, name = 'ours') => {
    const a = await window.demoReadTex(name);
    const b = await window.demoReadTex('ref');
    const mask = validMask();
    let worst = { err: 0, x: 0, y: 0 };
    const bands = [];
    for (let y0 = 0; y0 < H; y0 += bandRows) {
      let s = 0;
      let n = 0;
      for (let y = y0; y < Math.min(H, y0 + bandRows); y++)
        for (let x = 0; x < W; x++) {
          const k = y * W + x;
          if (!mask[k]) continue;
          const e = a[k] - b[k];
          s += e * e;
          n++;
          if (Math.abs(e) > worst.err) worst = { err: Math.abs(e), x, y, arm: a[k], ref: b[k] };
        }
      bands.push({ rows: `${y0}-${Math.min(H, y0 + bandRows) - 1}`, rms: n > 0 ? +Math.sqrt(s / n).toFixed(5) : NaN, pixels: n });
    }
    return { bands, worst, refFrames: refCount, excluded: W * H - mask.reduce((acc, v) => acc + v, 0) };
  };
  // read the ours texture back: statistics of channel 0 by row band, for the work counter and error maps
  window.demoReadOurs = async () => {
    const bytes = W * 16;
    const buf = device.createBuffer({ size: bytes * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex.ours }, { buffer: buf, bytesPerRow: bytes }, [W, H]);
    device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(buf.getMappedRange().slice(0));
    buf.unmap();
    buf.destroy();
    const bands = [[0, Math.round(H * 0.08)], [Math.round(H * 0.08), Math.round(H * 0.2)], [Math.round(H * 0.2), H]];
    const out = { mean: 0, max: 0, bands: [] };
    let total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = data[(y * W + x) * 4]; total += v; if (v > out.max) out.max = v; }
    out.mean = total / (W * H);
    for (const [y0, y1] of bands) { let t = 0; let m = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const v = data[(y * W + x) * 4]; t += v; if (v > m) m = v; } out.bands.push({ rows: `${y0}-${y1 - 1}`, mean: +(t / ((y1 - y0) * W)).toFixed(2), max: m }); }
    return out;
  };
  requestAnimationFrame(frame);
};

main().catch((e) => log(`error: ${e.message}`));
