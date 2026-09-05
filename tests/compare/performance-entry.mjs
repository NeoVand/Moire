import { WebGPURenderer, SRGBColorSpace, NoToneMapping } from 'three/webgpu';
import { createBenchmarkScene } from '/src/compare/scene.ts';
import { createTemporalBaseline } from '/src/compare/temporal.ts';

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

// Diagnostic read of r185's existing timestamp pairs. The public helper sums
// pass durations; overlapping pass intervals would double-count elapsed time.
// This uses the pinned backend's query pool only in this measurement harness,
// and leaves its offsets untouched for the normal public resolve below.
async function timestampIntervals(renderer) {
  const device = renderer.backend.device;
  const pool = renderer.backend.timestampQueryPool?.render;
  if (!pool?.currentQueryIndex || !pool.querySet) return null;
  const entries = [...pool.queryOffsets];
  const count = pool.currentQueryIndex;
  const bytes = count * 8;
  const resolved = device.createBuffer({ size: bytes, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const readable = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const encoder = device.createCommandEncoder();
    encoder.resolveQuerySet(pool.querySet, 0, count, resolved, 0);
    encoder.copyBufferToBuffer(resolved, 0, readable, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await readable.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(readable.getMappedRange());
    let first = times[entries[0][1]], last = times[entries[0][1] + 1];
    for (const [, index] of entries) {
      if (times[index] < first) first = times[index];
      if (times[index + 1] > last) last = times[index + 1];
    }
    const passes = entries.map(([context, index]) => ({ context, beginMs: Number(times[index] - first) / 1e6, endMs: Number(times[index + 1] - first) / 1e6 }));
    const spanMs = Number(last - first) / 1e6;
    const sumMs = passes.reduce((sum, pass) => sum + pass.endMs - pass.beginMs, 0);
    readable.unmap();
    return { spanMs, sumMs, overlapMs: sumMs - spanMs, passes };
  } finally { resolved.destroy(); readable.destroy(); }
}

export async function measureMethod({ method, width, height, time, warmFrames = 5, frames = 15 }) {
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('Performance requires actual WebGPU.');
  const queue = renderer.backend.device?.queue;
  if (!queue) throw new Error('The initialized Three WebGPU backend has no GPU queue.');
  const content = createBenchmarkScene(method);
  content.update(time, 'glide', width, height, 1);
  const temporal = method === 'temporal' ? createTemporalBaseline(renderer, content.scene, content.camera) : null;
  await renderer.compileAsync(content.scene, content.camera);
  const timestamps = renderer.hasFeature('timestamp-query');
  const samples = [];
  try {
    for (let i = 0; i < warmFrames + frames; i++) {
      // A real animation-frame boundary gives Three a fresh frame grouping
      // for all beauty/resolve/output subpasses and their timestamp queries.
      await new Promise(requestAnimationFrame);
      // Fixed camera pose intentionally isolates per-frame method cost. This
      // is not a temporal-quality test or display-refresh measurement.
      const start = performance.now();
      content.update(time, 'glide', width, height, 1);
      if (temporal) temporal.render(); else renderer.render(content.scene, content.camera);
      await queue.onSubmittedWorkDone();
      const completedWallMs = performance.now() - start;
      const renderPasses = renderer.info.render.frameCalls;
      const intervals = timestamps ? await timestampIntervals(renderer) : null;
      // Reading timestamps is outside the completed render's wall interval;
      // it does not get silently included in the next frame's GPU queue.
      const gpuRenderMs = timestamps ? await renderer.resolveTimestampsAsync('render') : null;
      await queue.onSubmittedWorkDone();
      if (i >= warmFrames) samples.push({ frame: i - warmFrames, gpuRenderMs: gpuRenderMs ?? null, gpuSpanMs: intervals?.spanMs ?? null, completedWallMs, renderPasses, intervals });
    }
    const gpu = samples.map(s => s.gpuRenderMs).filter(n => n !== null && Number.isFinite(n));
    const wall = samples.map(s => s.completedWallMs);
    const span = samples.map(s => s.gpuSpanMs).filter(n => n !== null && Number.isFinite(n));
    return { method, width, height, time, motion: 'glide', detail: 1, poseHeldFixed: true, warmFrames, frames, historyFrames: temporal?.framesSinceReset ?? null,
      gpuMedianMs: gpu.length ? median(gpu) : null, gpuMinMs: gpu.length ? Math.min(...gpu) : null, gpuMaxMs: gpu.length ? Math.max(...gpu) : null,
      gpuSpanMedianMs: span.length ? median(span) : null,
      completedWallMedianMs: median(wall), completedWallMinMs: Math.min(...wall), completedWallMaxMs: Math.max(...wall), samples };
  } finally {
    await queue.onSubmittedWorkDone();
    temporal?.dispose(); content.dispose(); renderer.dispose();
  }
}
