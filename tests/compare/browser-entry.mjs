import { WebGPURenderer, RenderTarget, LinearSRGBColorSpace, NoToneMapping, UnsignedByteType, HalfFloatType } from 'three/webgpu';
import { createBenchmarkScene } from '/src/compare/scene.ts';

// Isolated material capture with the actual WebGPU shaders. Display conversion
// is disabled deliberately: these bytes are linear intensities for the
// independent source-reference comparison, not screenshots of the UI.
function validateHalfFloat(values) {
  if (!(values instanceof Uint16Array)) throw new Error('Expected IEEE float16 readback from the validation target.');
  let nonFiniteChannels = 0, outOfRangeChannels = 0, minimum = Infinity, maximum = -Infinity, maxAlphaError = 0;
  for (let i = 0; i < values.length; i++) {
    const bits = values[i], exponent = (bits >>> 10) & 31, fraction = bits & 1023;
    const sign = bits & 32768 ? -1 : 1;
    const value = exponent === 31 ? (fraction ? NaN : sign * Infinity) :
      exponent === 0 ? sign * fraction * 2 ** -24 : sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
    if (!Number.isFinite(value)) { nonFiniteChannels++; continue; }
    if (value < -0.001 || value > 1.001) outOfRangeChannels++;
    if (i % 4 === 3) maxAlphaError = Math.max(maxAlphaError, Math.abs(value - 1));
    else { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  }
  return { format: 'RGBA16Float', channels: values.length, nonFiniteChannels, outOfRangeChannels,
    minLinearRGB: Number.isFinite(minimum) ? minimum : null, maxLinearRGB: Number.isFinite(maximum) ? maximum : null, maxAlphaError };
}

export async function captureMaterials({ width = 192, height = 128, time = 0, motion = 'glide', detail = 1 } = {}) {
  const renderer = new WebGPURenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('The comparison test requires actual WebGPU.');
  const target = new RenderTarget(width, height, { type: UnsignedByteType, samples: 0 });
  const validationTarget = new RenderTarget(width, height, { type: HalfFloatType, samples: 0 });
  const result = { backend: 'webgpu', width, height, time, motion, detail, readback: 'RGBA8Unorm linear; quantization 1/255; filtered errors below this scale are not resolved.', frames: {} };
  try {
    for (const [arm, method, kernel] of [['raw', 'raw', 'projective'], ['spectral', 'spectral', 'projective'], ['lattice', 'spectral', 'lattice']]) {
      const scene = createBenchmarkScene(method, kernel);
      try {
        const h = scene.update(time, motion, width, height, detail);
        renderer.setRenderTarget(target);
        renderer.render(scene.scene, scene.camera);
        const bytes = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        result.frames[arm] = { h, method, kernel, authorKernel: arm === 'lattice' ? 'demo/ours-kernel.wgsl.js' : null, pixels: Array.from(bytes) };
        if (arm === 'lattice') {
          // A normalized-byte target clips out-of-range values and hides NaNs.
          // Keep the existing error protocol unchanged and validate float output
          // in a separate pass that is never included in performance timings.
          renderer.setRenderTarget(validationTarget);
          renderer.render(scene.scene, scene.camera);
          const floating = await renderer.readRenderTargetPixelsAsync(validationTarget, 0, 0, width, height);
          result.frames[arm].validation = validateHalfFloat(floating);
        }
      } finally { scene.dispose(); }
    }
    return result;
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    validationTarget.dispose();
    renderer.dispose();
  }
}
