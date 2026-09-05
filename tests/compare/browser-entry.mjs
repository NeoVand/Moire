import { WebGPURenderer, RenderTarget, LinearSRGBColorSpace, NoToneMapping, UnsignedByteType, FloatType, HalfFloatType, NearestFilter } from 'three/webgpu';
import { createBenchmarkScene } from '/src/compare/scene.ts';

// Isolated material capture with the actual WebGPU shaders. Display conversion
// is disabled deliberately: these bytes are linear intensities for the
// independent source-reference comparison, not screenshots of the UI.
function decodeFloating(values, format) {
  if (format === 'RGBA32Float') {
    if (!(values instanceof Float32Array)) throw new Error('RGBA32Float target did not produce Float32Array readback.');
    return Array.from(values);
  }
  if (!(values instanceof Uint16Array)) throw new Error('Expected IEEE float16 readback from the fallback target.');
  return Array.from(values, bits => {
    const exponent = (bits >>> 10) & 31, fraction = bits & 1023;
    const sign = bits & 32768 ? -1 : 1;
    return exponent === 31 ? (fraction ? NaN : sign * Infinity) :
      exponent === 0 ? sign * fraction * 2 ** -24 : sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
  });
}

function validateFloating(values, format) {
  let nonFiniteChannels = 0, outOfRangeChannels = 0, minimum = Infinity, maximum = -Infinity, maxAlphaError = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) { nonFiniteChannels++; continue; }
    if (value < -0.001 || value > 1.001) outOfRangeChannels++;
    if (i % 4 === 3) maxAlphaError = Math.max(maxAlphaError, Math.abs(value - 1));
    else { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  }
  return { format, channels: values.length, nonFiniteChannels, outOfRangeChannels,
    minLinearRGB: Number.isFinite(minimum) ? minimum : null, maxLinearRGB: Number.isFinite(maximum) ? maximum : null, maxAlphaError };
}

async function floatingReadbackFormat(renderer) {
  const device = renderer.backend.device;
  if (!device) throw new Error('The initialized WebGPU renderer has no device for float-format validation.');
  // Renderability and readback do not require the optional float32-filterable
  // feature. Neither target is sampled, and its filters are explicitly nearest.
  device.pushErrorScope('validation');
  let probe, reason = null;
  try {
    probe = device.createTexture({ size: [1, 1, 1], format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  } catch (error) { reason = error.message; }
  const error = await device.popErrorScope();
  probe?.destroy();
  reason ??= error?.message ?? null;
  return { requested: 'RGBA32Float', actual: reason ? 'RGBA16Float' : 'RGBA32Float',
    precisionBits: reason ? 16 : 32, limitation: reason ? `RGBA32Float render/copy target unavailable; explicit Float16 fallback: ${reason}` : null };
}

export async function captureMaterials({ width = 192, height = 128, time = 0, motion = 'glide', detail = 1 } = {}) {
  const renderer = new WebGPURenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('The comparison test requires actual WebGPU.');
  const floatReadback = await floatingReadbackFormat(renderer);
  const target = new RenderTarget(width, height, { type: UnsignedByteType, samples: 0 });
  const validationTarget = new RenderTarget(width, height, {
    type: floatReadback.actual === 'RGBA32Float' ? FloatType : HalfFloatType,
    samples: 0, minFilter: NearestFilter, magFilter: NearestFilter,
  });
  const result = { backend: 'webgpu', width, height, time, motion, detail, readback: 'RGBA8Unorm linear legacy columns, quantization1/255; separate explicitly tagged floating readback for all three filtered arms.', floatReadback, frames: {} };
  try {
    for (const [arm, method, kernel] of [['raw', 'raw', 'projective'], ['spectral', 'spectral', 'projective'], ['lattice', 'spectral', 'lattice'], ['homography', 'spectral', 'homography']]) {
      const scene = createBenchmarkScene(method, kernel);
      try {
        const h = scene.update(time, motion, width, height, detail);
        renderer.setRenderTarget(target);
        renderer.render(scene.scene, scene.camera);
        const bytes = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        result.frames[arm] = { h, method, kernel, authorKernel: arm === 'lattice' || arm === 'homography' ? 'demo/ours-kernel.wgsl.js' : null, pixels: Array.from(bytes) };
        if (arm !== 'raw') {
          // A normalized-byte target clips out-of-range values and hides NaNs.
          // Keep the existing error protocol unchanged and validate float output
          // in a separate pass that is never included in performance timings.
          renderer.setRenderTarget(validationTarget);
          renderer.render(scene.scene, scene.camera);
          const floating = await renderer.readRenderTargetPixelsAsync(validationTarget, 0, 0, width, height);
          const floatPixels = decodeFloating(floating, floatReadback.actual);
          result.frames[arm].floatFormat = floatReadback.actual;
          result.frames[arm].floatPixels = floatPixels;
          result.frames[arm].validation = validateFloating(floatPixels, floatReadback.actual);
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
