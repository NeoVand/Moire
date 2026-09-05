import { RenderPipeline, Vector2 } from 'three/webgpu'
import type { OrthographicCamera, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu'
import { mrt, output, pass, velocity } from 'three/tsl'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import type TRAANode from 'three/addons/tsl/display/TRAANode.js'

/** Exact implementation identity; this is not an implementation of DLAA or FSR. */
export const TEMPORAL_BASELINE = {
  label: 'Temporal AA',
  implementation: 'Three.js TRAA',
  description: 'Native-resolution temporal reprojection with camera jitter, motion vectors, depth rejection, and variance clipping.',
  source: 'https://threejs.org/docs/pages/TRAANode.html',
} as const

// r185 exposes setSize publicly, but @types/three r185 omits the declaration.
type ResizableTRAA = TRAANode & { setSize(width: number, height: number): void }

/**
 * The renderer must be initialized, unmultisampled, and sized to this panel.
 * TRAA's input/history depth textures must match its full drawing-buffer size.
 * Use a dedicated camera: RenderPipeline temporarily jitters its projection.
 * Keep material coordinates stationary in object space so Three's object/camera
 * motion vectors also describe motion of the procedural shading.
 */
export function createTemporalBaseline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: PerspectiveCamera | OrthographicCamera,
) {
  if (renderer.samples !== 0) {
    throw new Error('The temporal comparison requires MSAA to be disabled.')
  }

  const scenePass = pass(scene, camera, { samples: 0 })
  scenePass.setMRT(mrt({ output, velocity }))
  const outputNode = traa(
    scenePass.getTextureNode('output'),
    scenePass.getTextureNode('depth'),
    scenePass.getTextureNode('velocity'),
    camera,
  ) as ResizableTRAA
  const pipeline = new RenderPipeline(renderer, outputNode)
  const size = new Vector2()
  const previousSize = new Vector2()
  let framesSinceReset = 0
  let disposed = false

  return {
    scenePass,
    outputNode,
    get framesSinceReset() { return framesSinceReset },
    render() {
      if (disposed) throw new Error('The temporal comparison has been disposed.')
      renderer.getDrawingBufferSize(size)
      if (size.x < 2 || size.y < 2) return
      if (!size.equals(previousSize)) {
        framesSinceReset = 0
        previousSize.copy(size)
      }
      // The official pipeline installs TRAA's before/after jitter hooks.
      // Bypassing it with renderer.render(scene, camera) skips those hooks.
      pipeline.render()
      framesSinceReset += 1
    },
    reset() {
      if (disposed) return
      // Public resize API deliberately invalidates the next frame's history.
      // TRAA then seeds history from fresh beauty, using its normal resize path.
      // Do not call setSize at the eventual dimensions: that bypasses the check.
      outputNode.setSize(1, 1)
      framesSinceReset = 0
    },
    dispose() {
      if (disposed) return
      disposed = true
      pipeline.dispose()
      outputNode.dispose()
      scenePass.dispose()
    },
  }
}

export type TemporalBaseline = ReturnType<typeof createTemporalBaseline>
