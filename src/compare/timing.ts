import type { WebGPURenderer } from 'three/webgpu'

export type GpuTimingSnapshot = {
  available: boolean
  pending: boolean
  latestMs: number | null
  medianMs: number | null
  samples: number
  renderPasses: number | null
  error: string | null
}

/**
 * Render-pass timestamps, never CPU submission time or presentation FPS.
 *
 * Initialize the dedicated panel renderer with trackTimestamp:true. Call sample
 * once, immediately after its entire method has rendered in one animation frame.
 * Three r185 assigns every synchronous RenderPipeline subpass the same info.frame
 * and resolveTimestampsAsync('render') sums the latest frame's render passes.
 * This includes TRAA beauty, resolve, and output, but EXCLUDES texture copies,
 * uploads, queue gaps, CPU work, and presentation. Do not label it total GPU time.
 *
 * Readback is asynchronous. While one query is pending, rendering continues;
 * the next resolve also drains queued older frames and reports the latest one.
 * No private backend fields or GPU-specific APIs are used.
 */
export function createGpuTiming(renderer: WebGPURenderer) {
  let available = renderer.hasFeature('timestamp-query')
  let pending = false
  let latestMs: number | null = null
  let renderPasses: number | null = null
  let error: string | null = null
  let lastFrame = -1
  let generation = 0
  let disposed = false
  const samples: number[] = []

  return {
    sample() {
      if (disposed || !available || pending || renderer.info.frame === lastFrame) return
      if (renderer.info.render.frameCalls === 0) return
      pending = true
      lastFrame = renderer.info.frame
      const sampleGeneration = generation
      const sampledPasses = renderer.info.render.frameCalls
      void renderer.resolveTimestampsAsync('render').then(ms => {
        if (disposed || generation !== sampleGeneration) return
        if (ms === undefined || !Number.isFinite(ms) || ms < 0) {
          available = false
          error = 'GPU timestamps are unavailable.'
          return
        }
        latestMs = ms
        renderPasses = sampledPasses
        samples.push(ms)
        if (samples.length > 90) samples.shift()
      }).catch(reason => {
        if (disposed || generation !== sampleGeneration) return
        available = false
        error = reason instanceof Error ? reason.message : String(reason)
      }).finally(() => {
        pending = false
      })
    },
    snapshot(): GpuTimingSnapshot {
      const sorted = [...samples].sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      const medianMs = sorted.length === 0 ? null : sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      return { available, pending, latestMs, medianMs, samples: samples.length, renderPasses, error }
    },
    reset() {
      generation += 1
      lastFrame = -1
      latestMs = null
      renderPasses = null
      samples.length = 0
    },
    dispose() {
      disposed = true
      generation += 1
      samples.length = 0
    },
  }
}

export type GpuTiming = ReturnType<typeof createGpuTiming>
