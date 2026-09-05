import { auditWgslWatchdog, WATCHDOG_PREFIX } from './watchdog-instrument.mjs';

// The caller supplies an immutable, already instrumented shader snapshot.
// A second audit here is mandatory before any GPU pipeline or dispatch exists.
export async function captureWatchdogFixtures({ code, audit, cases }) {
  auditWgslWatchdog(code, audit.limit, audit.loopCount);
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('A WebGPU adapter is required.');
  const device = await adapter.requestDevice();
  const values = new Float32Array(cases.flatMap(c => [...c.hu, 0, ...c.hv, 0, ...c.hd, 0,
    c.x, c.y, c.period, c.variance, c.material === 'circles' ? 1 : c.material === 'synthetic' ? 2 : 0, 0, 0, 0]));
  const input = device.createBuffer({ size: values.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  const output = device.createBuffer({ size: cases.length * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const readable = device.createBuffer({ size: cases.length * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  try {
    const shader = `${code}
struct Fixture { hu: vec4f, hv: vec4f, hd: vec4f, point: vec4f, kind: vec4f };
@group(0) @binding(0) var<storage, read> fixtures: array<Fixture>;
@group(0) @binding(1) var<storage, read_write> answers: array<vec4f>;
@compute @workgroup_size(1)
fn watchdogMain(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= ${cases.length}u) { return; }
  ${WATCHDOG_PREFIX}Fuel = 0u;
  ${WATCHDOG_PREFIX}Exhausted = false;
  let c = fixtures[id.x];
  var result: vec2f;
  if (c.kind.x == 2.0) { result = diagnosticInfiniteControl(); }
  else if (c.kind.x == 0.0) { result = checkerMeanH(c.hu.xyz, c.hv.xyz, c.hd.xyz, c.point.x, c.point.y, c.point.z, c.point.w); }
  else { result = circlesMeanH(c.hu.xyz, c.hv.xyz, c.hd.xyz, c.point.x, c.point.y, c.point.z, c.point.w); }
  answers[id.x] = vec4f(result, f32(${WATCHDOG_PREFIX}Fuel), select(0.0, 1.0, ${WATCHDOG_PREFIX}Exhausted));
}`;
    // Audit the final dispatch source too: wrapper edits cannot add an unsafe loop.
    auditWgslWatchdog(shader, audit.limit, audit.loopCount);
    const module = device.createShaderModule({ code: shader });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter(m => m.type === 'error');
    if (errors.length) throw new Error(errors.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));
    const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'watchdogMain' } });
    const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: output } },
    ] });
    device.queue.writeBuffer(input, 0, values);
    const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(cases.length); pass.end();
    encoder.copyBufferToBuffer(output, 0, readable, 0, cases.length * 16); device.queue.submit([encoder.finish()]);
    await readable.mapAsync(GPUMapMode.READ);
    const result = new Float32Array(readable.getMappedRange()).slice(); readable.unmap();
    return { adapter: { vendor: adapter.info.vendor, architecture: adapter.info.architecture }, format: 'Float32 storage buffer',
      results: cases.map((c, i) => ({ name: c.name, rawMean: result[4 * i], rawRegime: result[4 * i + 1], fuel: result[4 * i + 2], exhausted: result[4 * i + 3] === 1 })) };
  } finally { input.destroy(); output.destroy(); readable.destroy(); device.destroy(); }
}
