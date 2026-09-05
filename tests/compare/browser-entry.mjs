import { WebGPURenderer, RenderTarget, LinearSRGBColorSpace, NoToneMapping, UnsignedByteType } from 'three/webgpu';
import { createBenchmarkScene } from '/src/compare/scene.ts';

// Isolated material capture with the actual WebGPU shaders. Display conversion
// is disabled deliberately: these bytes are linear intensities for the
// independent source-reference comparison, not screenshots of the UI.
export async function captureMaterials({ width = 192, height = 128, time = 0, motion = 'glide', detail = 1 } = {}) {
  const renderer = new WebGPURenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('The comparison test requires actual WebGPU.');
  const target = new RenderTarget(width, height, { type: UnsignedByteType, samples: 0 });
  const result = { backend: 'webgpu', width, height, time, motion, detail, frames: {} };
  try {
    for (const method of ['raw', 'spectral']) {
      const scene = createBenchmarkScene(method);
      try {
        const h = scene.update(time, motion, width, height, detail);
        renderer.setRenderTarget(target);
        renderer.render(scene.scene, scene.camera);
        const bytes = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        result.frames[method] = { h, pixels: Array.from(bytes) };
      } finally { scene.dispose(); }
    }
    return result;
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    renderer.dispose();
  }
}
