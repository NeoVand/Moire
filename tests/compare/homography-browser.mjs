import { OURS_KERNEL } from '/demo/ours-kernel.wgsl.js';

// Direct float32 compute output avoids display conversion, mesh interpolation,
// and render-target quantization when testing the shared mathematical module.
export async function captureHomographyFixtures(cases) {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('A WebGPU adapter is required.');
  const device = await adapter.requestDevice();
  const values = new Float32Array(cases.flatMap(c => [
    ...c.hu, 0, ...c.hv, 0, ...c.hd, 0,
    c.x, c.y, c.period, c.variance, c.material === 'circles' ? 1 : 0, 0, 0, 0,
  ]));
  const input = device.createBuffer({ size: values.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const output = device.createBuffer({ size: cases.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readable = device.createBuffer({ size: cases.length * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    const module = device.createShaderModule({ code: `
const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586;
${OURS_KERNEL}
struct Fixture { hu: vec4f, hv: vec4f, hd: vec4f, point: vec4f, kind: vec4f };
@group(0) @binding(0) var<storage, read> fixtures: array<Fixture>;
@group(0) @binding(1) var<storage, read_write> answers: array<vec4f>;
@compute @workgroup_size(64)
fn fixtureMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= ${cases.length}u) { return; }
  let c = fixtures[id.x];
  var result: vec2f;
  if (c.kind.x == 0.0) {
    result = checkerMeanH(c.hu.xyz, c.hv.xyz, c.hd.xyz, c.point.x, c.point.y, c.point.z, c.point.w);
  } else {
    result = circlesMeanH(c.hu.xyz, c.hv.xyz, c.hd.xyz, c.point.x, c.point.y, c.point.z, c.point.w);
  }
  answers[id.x] = vec4f(result, 0.0, 1.0);
}` });
    const compilation = await module.getCompilationInfo();
    const errors = compilation.messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(errors.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'fixtureMain' } });
    const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: output } },
    ] });
    device.queue.writeBuffer(input, 0, values);
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(cases.length / 64)); pass.end();
    encoder.copyBufferToBuffer(output, 0, readable, 0, cases.length * 16);
    device.queue.submit([encoder.finish()]);
    await readable.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readable.getMappedRange()).slice();
    readable.unmap();
    return { format: 'Float32 storage buffer', adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture },
      results: cases.map((c, i) => ({ name: c.name, mean: result[4 * i], regime: result[4 * i + 1] })) };
  } finally { input.destroy(); output.destroy(); readable.destroy(); device.destroy(); }
}
