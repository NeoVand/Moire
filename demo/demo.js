// The side-by-side anti-aliasing demo: a plane with the benchmark shaders
// (Yang and Barnes 2018) seen through a moving camera, rendered six ways at
// once: point sampling, supersampling, temporal AA, the hardware's mipmapped
// texture, ours, and a sampled reference. Meters: RMS error of each arm
// against the reference in linear light and after the 8-bit clamp, and the
// GPU time of each arm's pass.
import { COMMON, ARM_POINT, ARM_SSAA, ARM_REFERENCE, ARM_TAA, ARM_MIP, ARM_OURS, METERS, DISPLAY } from './wgsl.js';

const $ = (id) => document.getElementById(id);
const log = (msg) => {
  const el = $('log');
  el.textContent = `${msg}\n${el.textContent}`.split('\n').slice(0, 12).join('\n');
};

const LIGHT = [0.22808577638091165, 0.60822873701576452, 0.76028592126970562];
const ARMS = ['point', 'ssaa', 'taa', 'mip', 'ours', 'reference'];

// ---------------------------------------------------------------------------
// camera: a homography (x, y, 1) -> (Nu, Nv, D), plane coordinates (Nu, Nv) / D
// ---------------------------------------------------------------------------
// the benchmark's plane: s = -50 (x - 240) / (y + 1), t = -12000 / (y + 1),
// translated by (os, ot) on the plane
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
  log(`adapter: ${adapter.info ? `${adapter.info.vendor} ${adapter.info.architecture} ${adapter.info.description}` : 'unknown'}; timestamps ${hasTs ? 'on' : 'off'}`);
  const canvas = $('canvas');
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  let W = 480;
  let H = 320;
  const state = {
    scene: 0,
    path: 'ybBoth',
    ssaa: 16,
    refSamples: 1024,
    taaAlpha: 0.1,
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
      refA: makeTex(), refB: makeTex(),
    };
  };
  allocTextures();

  // the mipmapped picture: one period of the checkerboard (scene 0) or the circles cell (scene 1), 1024 texels, box-filtered chain
  const PIC_N = 1024;
  const picTexFor = (scene) => {
    const levels = Math.log2(PIC_N) + 1;
    const t = device.createTexture({ size: [PIC_N, PIC_N], format: 'r8unorm', mipLevelCount: levels, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    let data = new Float32Array(PIC_N * PIC_N);
    for (let j = 0; j < PIC_N; j++)
      for (let i = 0; i < PIC_N; i++) {
        const u = (i + 0.5) / PIC_N;
        const v = (j + 0.5) / PIC_N;
        let P;
        if (scene === 0) {
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
        data[j * PIC_N + i] = P;
      }
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
  let picTex = picTexFor(state.scene);
  const picSampler = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: 16 });

  // uniforms: 16 vec4
  const UBYTES = 16 * 16;
  const ubuf = device.createBuffer({ size: UBYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const dbuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  const module = (code) => device.createShaderModule({ code: COMMON + code });
  const render = (code, entry, extra = []) => {
    const layout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }, ...extra],
    });
    const mod = module(code);
    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module: mod, entryPoint: 'vsFull' },
      fragment: { module: mod, entryPoint: entry, targets: [{ format: 'rgba32float' }] },
      primitive: { topology: 'triangle-list' },
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
    mip: render(ARM_MIP, 'fsMip', [
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ]),
    ours: render(ARM_OURS, 'fsOurs'),
  };
  // meters
  const metersLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ...[1, 2, 3, 4, 5, 6].map((b) => ({ binding: b, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'unfilterable-float' } })),
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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
      ...[1, 2, 3, 4, 5, 6].map((b) => ({ binding: b, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } })),
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const displayPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [displayLayout] }),
    vertex: { module: module(DISPLAY), entryPoint: 'vsFull' },
    fragment: { module: module(DISPLAY), entryPoint: 'fsDisplay', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  let numWG = Math.ceil(W / 16) * Math.ceil(H / 16);
  let partials = device.createBuffer({ size: numWG * 10 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  let partialsRead = device.createBuffer({ size: numWG * 10 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const NPASS = 8; // point, ssaa, taa sample, taa resolve, mip, ours, reference, meters
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
    partials = device.createBuffer({ size: numWG * 10 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    partialsRead = device.createBuffer({ size: numWG * 10 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    canvas.width = 3 * W;
    canvas.height = 2 * H;
    refCount = 0;
  };
  canvas.width = 3 * W;
  canvas.height = 2 * H;

  // uniform assembly
  const uni = new Float32Array(64);
  let prevH = null;
  let refCount = 0;
  let refPing = 0;
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
    set(52, [0, state.frame, state.scene, state.scene === 0 ? 20 : 2 * (25 / 3) + 2 * (5 / 3)]);
    set(56, [state.taaAlpha, still ? 1 : 0, state.regime ? 1 : 0, state.oursMode || 0]);
  };
  const writeUniforms = (samples, seed) => {
    uni[52] = samples;
    uni[53] = seed;
    device.queue.writeBuffer(ubuf, 0, uni);
  };

  const bind = (layout, entries) => device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: ubuf } }, ...entries] });
  const view = (t) => t.createView();

  // meter state
  const meters = { rms: new Array(5).fill(NaN), rms8: new Array(5).fill(NaN), ms: new Array(NPASS).fill(NaN), pending: false };
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
  const bench = { ms: new Array(6).fill(NaN), running: false, last: 0 };
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
      bench.ms[3] = await run((enc) => draw(enc, plain(tex.mip), P.mip.pipeline, bind(P.mip.layout, [{ binding: 1, resource: picTex.createView() }, { binding: 2, resource: picSampler }])));
      bench.ms[4] = await run((enc) => draw(enc, plain(tex.ours), P.ours.pipeline, bind(P.ours.layout, [])));
      writeUniforms(state.refSamples, 1);
      bench.ms[5] = await run((enc) => draw(enc, plain(tex.refB), P.reference.pipeline, bind(P.reference.layout, [{ binding: 1, resource: view(tex.refA) }])));
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
    const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    fps = 0.9 * fps + 0.1 * (1 / Math.max(dt, 1e-3));
    if (!state.paused) state.time += dt * state.speed;
    const Hm = PATHS[state.path].at(state.time, W, H);
    const still = prevH && prevH.hu.every((v, i) => v === Hm.hu[i]) && prevH.hv.every((v, i) => v === Hm.hv[i]) && prevH.hd.every((v, i) => v === Hm.hd[i]);
    if (!still) refCount = 0;
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
      draw(enc, passDesc(tex.mip, 4), P.mip.pipeline, bind(P.mip.layout, [{ binding: 1, resource: picTex.createView() }, { binding: 2, resource: picSampler }]));
      draw(enc, passDesc(tex.ours, 5), P.ours.pipeline, bind(P.ours.layout, []));
    });
    // the reference, with its own sample count
    const refSrc = refPing ? tex.refB : tex.refA;
    const refDst = refPing ? tex.refA : tex.refB;
    writeUniforms(state.refSamples, state.frame * 7919 + 13);
    submitOne((enc) => {
      draw(enc, passDesc(refDst, 6), P.reference.pipeline, bind(P.reference.layout, [{ binding: 1, resource: view(refSrc) }]));
      // meters
      const pass = enc.beginComputePass(hasTs ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 14, endOfPassWriteIndex: 15 } } : {});
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
            { binding: 7, resource: { buffer: partials } },
          ],
        }),
      );
      pass.dispatchWorkgroups(Math.ceil(W / 16), Math.ceil(H / 16));
      pass.end();
      if (!meters.pending) {
        enc.copyBufferToBuffer(partials, 0, partialsRead, 0, numWG * 10 * 4);
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
            { binding: 6, resource: view(refDst) },
            { binding: 7, resource: { buffer: dbuf } },
          ],
        }),
      );
      dpass.draw(3);
      dpass.end();
    });
    refPing ^= 1;
    refCount = still ? refCount + 1 : 1;
    prevH = Hm;
    state.frame++;
    if (!meters.pending) {
      meters.pending = true;
      const reads = [partialsRead.mapAsync(GPUMapMode.READ)];
      if (hasTs) reads.push(tsRead.mapAsync(GPUMapMode.READ));
      Promise.all(reads)
        .then(() => {
          const arr = new Float32Array(partialsRead.getMappedRange());
          const sums = new Array(10).fill(0);
          for (let g = 0; g < numWG; g++) for (let j = 0; j < 10; j++) sums[j] += arr[g * 10 + j];
          partialsRead.unmap();
          for (let k = 0; k < 5; k++) {
            meters.rms[k] = Math.sqrt(sums[2 * k] / (W * H));
            meters.rms8[k] = Math.sqrt(sums[2 * k + 1] / (W * H));
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
    if (!bench.running && performance.now() - bench.last > 15000) benchArms();
    requestAnimationFrame(frame);
  };

  const fmt = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : '—');
  const psnr = (r) => (r > 0 ? 20 * Math.log10(1 / r) : Infinity);
  const updateTable = () => {
    const names = ['no AA (1 spp)', `SSAA ${state.ssaa}x`, 'TAA (1 spp + history)', 'mipmap, 16x aniso', 'ours (closed form)'];
    // the pass indices: point 0, ssaa 1, taa sample 2 + resolve 3, mip 4, ours 5, reference 6, meters 7
    const rows = names.map((n, k) => `<tr><td>${n}</td><td>${fmt(meters.rms[k])}</td><td>${fmt(meters.rms8[k] * 255, 2)}</td><td>${fmt(psnr(meters.rms[k]), 1)}</td><td>${fmt(bench.ms[k], 3)}</td></tr>`);
    const acc = refCount > 1 ? `, ${refCount} frames accumulated: ${(refCount * state.refSamples).toLocaleString()} spp` : '';
    rows.push(`<tr class="ref"><td>reference (${state.refSamples} spp a frame${acc})</td><td>0</td><td>0</td><td>∞</td><td>${fmt(bench.ms[5], 3)}</td></tr>`);
    $('meters').innerHTML = rows.join('');
    $('status').textContent = `${W}x${H} per pane · ${fps.toFixed(0)} fps · t = ${state.time.toFixed(1)} s · frame ${state.frame}${state.zoom ? ` · magnifier at (${state.zoom[0]}, ${state.zoom[1]})` : ''}`;
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
  $('measure').onclick = () => benchArms();
  $('heat').onchange = (e) => (state.heat = e.target.checked);
  $('gain').onchange = (e) => (state.heatGain = Number(e.target.value));
  canvas.onclick = (e) => {
    if (state.zoom) {
      state.zoom = null;
      return;
    }
    const r = canvas.getBoundingClientRect();
    const fx = ((e.clientX - r.left) / r.width) * 3;
    const fy = ((e.clientY - r.top) / r.height) * 2;
    const px = Math.floor((fx - Math.floor(fx)) * W);
    const py = Math.floor((fy - Math.floor(fy)) * H);
    state.zoom = [px, py];
  };
  window.demoState = state;
  window.demoMeters = meters;
  window.demoBench = bench;
  requestAnimationFrame(frame);
};

main().catch((e) => log(`error: ${e.message}`));
