// The shipped exact sweep, run as a standalone compute pass over a batch of
// phase trios. No three.js, no canvas: the WGSL is the renderer's own text
// (composite.ts exports it), compiled here into a kernel that evaluates the
// three-slot chain and the per-layer means for every scene of the batch and
// hands the floats back. Driven headlessly by paper/tools/exp/exactsweep.mjs,
// which owns the truth and the gates.
//
// Batch layout, in vec4s per scene: a header (sweep, 0, 0, 0), then for each
// of three slots its trio (r, rUp, rDown, floor), its profile (hInk, aa,
// opacity, 0) and (active, rate, 0, 0). Output, two vec4s per scene: (mean,
// meanSq, m0sq, m1sq) and (m0, m1, m2, m2sq) — the chain's mean transmittance
// (black ink on white) under the linear and the square-law observer, and each
// slot's own exact mean coverage and mean squared coverage.

export const SLOTS = 3;
export const STRIDE = 1 + 3 * SLOTS;

export async function run(batch) {
  const { exactSweepWgsl } = await import('/src/gpu/composite.ts');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const errors = [];
  device.onuncapturederror = (e) => errors.push(e.error?.message ?? String(e));
  const scenes = batch.length / (STRIDE * 4);
  if (!Number.isInteger(scenes)) throw new Error(`batch of ${batch.length} floats is not whole scenes`);

  const args = (b) =>
    Array.from({ length: SLOTS }, (_, i) => {
      const o = `${b} + ${1 + 3 * i}u`;
      return `inp[${o}], inp[${o} + 1u], vec3<f32>(0.0), inp[${o} + 2u].x, inp[${o} + 2u].y`;
    }).join(',\n    ');
  const means = Array.from({ length: SLOTS }, (_, i) => {
    const o = `b + ${1 + 3 * i}u`;
    return `let m${i} = exactLayerMean(inp[${o}], inp[${o} + 1u]);`;
  }).join('\n  ');
  const code = `${exactSweepWgsl(SLOTS)}
@group(0) @binding(0) var<storage, read> inp: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> out: array<vec4<f32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let s = id.x;
  if (s >= ${scenes}u) { return; }
  let b = s * ${STRIDE}u;
  let lin = exactChain${SLOTS}(inp[b].x, vec3<f32>(1.0), 0.0,
    ${args('b')});
  let sq = exactChain${SLOTS}(inp[b].x, vec3<f32>(1.0), 1.0,
    ${args('b')});
  ${means}
  out[2u * s] = vec4<f32>(lin.x, sq.x, m0.y, m1.y);
  out[2u * s + 1u] = vec4<f32>(m0.x, m1.x, m2.x, m2.y);
}
`;
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const bad = info.messages.filter((m) => m.type === 'error');
  if (bad.length) throw new Error(`wgsl compile: ${bad.map((m) => `${m.lineNum}: ${m.message}`).join(' | ')}`);
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module, entryPoint: 'main' },
  });

  const data = new Float32Array(batch);
  const inp = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(inp, 0, data);
  const outBytes = scenes * 32;
  const out = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const read = device.createBuffer({ size: outBytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const bind = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: inp } },
      { binding: 1, resource: { buffer: out } },
    ],
  });
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.dispatchWorkgroups(Math.ceil(scenes / 64));
  pass.end();
  enc.copyBufferToBuffer(out, 0, read, 0, outBytes);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const result = Array.from(new Float32Array(read.getMappedRange()));
  read.unmap();
  if (errors.length) throw new Error(`webgpu: ${errors.join(' | ')}`);
  const meta = adapter.info ?? {};
  return { result, adapter: `${meta.vendor ?? '?'} ${meta.architecture ?? ''}`.trim() };
}
