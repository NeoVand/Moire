import { WebGPURenderer, SRGBColorSpace, NoToneMapping, REVISION } from 'three/webgpu';
import { createBenchmarkScene } from '/src/compare/scene.ts';
import { createTemporalBaseline } from '/src/compare/temporal.ts';

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};

// Resolve ONCE through Three, then copy its already-resolved raw buffer.
// Previously this harness called resolveQuerySet twice and compared two GPU
// readbacks; it could discard a run before saving the differing values. The
// public sum and diagnostic span below now use exactly the same timestamp bytes.
// Only this pinned r185 measurement harness reads the private resolved buffer;
// Three alone manages query allocation, reset, resolve, and its public counters.
async function timestampIntervals(renderer) {
  if (String(REVISION) !== '185') throw new Error(`Timestamp diagnostics require reviewed Three r185, found r${REVISION}.`);
  const device = renderer.backend.device;
  const pool = renderer.backend.timestampQueryPool?.render;
  if (!pool?.currentQueryIndex || !pool.querySet) return null;
  if (pool.pendingResolve) throw new Error('A concurrent timestamp resolve would make this sample ambiguous.');
  const entries = [...pool.queryOffsets];
  const count = pool.currentQueryIndex;
  const bytes = count * 8;
  const publicSumMs = await renderer.resolveTimestampsAsync('render');
  if (pool.currentQueryIndex !== 0 || pool.queryOffsets.size !== 0) {
    throw new Error('Another render wrote timestamp queries during this isolated readback.');
  }
  const readable = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const encoder = device.createCommandEncoder();
    // This is a buffer copy, not a second query resolve. The canonical buffer
    // remains unchanged until the next frame, which this harness has not begun.
    encoder.copyBufferToBuffer(pool.resolveBuffer, 0, readable, 0, bytes);
    device.queue.submit([encoder.finish()]);
    await readable.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(readable.getMappedRange());
    let first = times[entries[0][1]], last = times[entries[0][1] + 1];
    for (const [, index] of entries) {
      if (times[index] < first) first = times[index];
      if (times[index + 1] > last) last = times[index + 1];
    }
    const frameSums = new Map();
    const passes = entries.map(([context, index]) => {
      const match = context.match(/:f(\d+)$/);
      const frame = match ? Number(match[1]) : null;
      const durationMs = Number(times[index + 1] - times[index]) / 1e6;
      frameSums.set(frame, (frameSums.get(frame) ?? 0) + durationMs);
      return { context, frame, beginNs: String(times[index]), endNs: String(times[index + 1]),
        beginMs: Number(times[index] - first) / 1e6, endMs: Number(times[index + 1] - first) / 1e6,
        durationMs, publicDurationMs: pool.timestamps.get(context) ?? null };
    });
    const spanMs = Number(last - first) / 1e6;
    const frameIds = [...frameSums.keys()];
    const sumMs = frameSums.get(frameIds.at(-1)); // Same latest-frame selection/order as Three.
    const allFramesSumMs = passes.reduce((sum, pass) => sum + pass.durationMs, 0);
    readable.unmap();
    return { source: 'single-public-resolve-buffer-copy', queryCount: count, pairCount: entries.length, frameIds,
      publicFrames: [...pool.frames], publicSumMs: publicSumMs ?? null, publicDifferenceMs: publicSumMs === undefined ? null : publicSumMs - sumMs,
      spanMs, sumMs, allFramesSumMs, overlapMs: allFramesSumMs - spanMs, passes };
  } finally { readable.destroy(); }
}

export async function measureMethod({ method, width, height, time, warmFrames = 5, frames = 15 }) {
  if (!['raw', 'temporal', 'spectral', 'lattice', 'homography'].includes(method)) throw new Error(`Unknown comparison arm: ${method}`);
  const shared = ['lattice','homography'].includes(method);
  const sceneMethod = shared ? 'spectral' : method;
  const kernel = shared ? method : 'projective';
  const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('Performance requires actual WebGPU.');
  const queue = renderer.backend.device?.queue;
  if (!queue) throw new Error('The initialized Three WebGPU backend has no GPU queue.');
  const content = createBenchmarkScene(sceneMethod, kernel);
  content.update(time, 'glide', width, height, 1);
  const temporal = method === 'temporal' ? createTemporalBaseline(renderer, content.scene, content.camera) : null;
  await renderer.compileAsync(content.scene, content.camera);
  const timestamps = renderer.hasFeature('timestamp-query');
  const samples = [];
  let failure = null;
  try {
    for (let i = 0; i < warmFrames + frames; i++) {
      // A real animation-frame boundary gives Three a fresh frame grouping
      // for all beauty/resolve/output subpasses and their timestamp queries.
      await new Promise(requestAnimationFrame);
      // Fixed camera pose intentionally isolates per-frame method cost. This
      // is not a temporal-quality test or display-refresh measurement.
      const start = performance.now();
      let completedWallMs = null, rendererFrame = null, renderPasses = null;
      try {
        content.update(time, 'glide', width, height, 1);
        if (temporal) temporal.render(); else renderer.render(content.scene, content.camera);
        // Capture counters before yielding: Three's private RAF keeps running
        // and can reset frameCalls while onSubmittedWorkDone is pending.
        rendererFrame = renderer.info.frame;
        renderPasses = renderer.info.render.frameCalls;
        await queue.onSubmittedWorkDone();
        completedWallMs = performance.now() - start;
        const intervals = timestamps ? await timestampIntervals(renderer) : null;
        // Both the public resolve and diagnostic buffer copy remain outside
        // the completed render wall interval and finish before the next frame.
        await queue.onSubmittedWorkDone();
        if (i >= warmFrames) samples.push({ frame: i - warmFrames, rendererFrame,
          gpuRenderMs: intervals?.publicSumMs ?? null, gpuSpanMs: intervals?.spanMs ?? null,
          completedWallMs, renderPasses, intervals });
      } catch (error) {
        failure = { iteration: i, phase: i < warmFrames ? 'warmup' : 'measured', message: error.message,
          stack: error.stack, completedWallMs, rendererFrame, renderPasses };
        break;
      }
    }
    const gpu = samples.map(s => s.gpuRenderMs).filter(n => n !== null && Number.isFinite(n));
    const wall = samples.map(s => s.completedWallMs);
    const span = samples.map(s => s.gpuSpanMs).filter(n => n !== null && Number.isFinite(n));
    return { method, sceneMethod, kernel, authorKernel: shared ? 'demo/ours-kernel.wgsl.js' : null, threeRevision: REVISION, timestampsSupported: timestamps, failure, width, height, time, motion: 'glide', detail: 1, poseHeldFixed: true, warmFrames, frames, historyFrames: temporal?.framesSinceReset ?? null,
      gpuMedianMs: gpu.length ? median(gpu) : null, gpuMinMs: gpu.length ? Math.min(...gpu) : null, gpuMaxMs: gpu.length ? Math.max(...gpu) : null,
      gpuSpanMedianMs: span.length ? median(span) : null,
      completedWallMedianMs: wall.length ? median(wall) : null, completedWallMinMs: wall.length ? Math.min(...wall) : null, completedWallMaxMs: wall.length ? Math.max(...wall) : null, samples };
  } finally {
    await queue.onSubmittedWorkDone();
    temporal?.dispose(); content.dispose(); renderer.dispose();
  }
}
