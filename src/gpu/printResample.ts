function contributions(from: number, to: number) {
  // A Gaussian is separable AND isotropic: a ring has the same contrast in
  // every direction. A separable sinc filter passes diagonal carriers that it
  // rejects along the axes, drawing a false four-lobed pattern near Nyquist.
  // At 0.8 display pixels, a two-pixel carrier falls below 5 gray levels.
  const sigma = .8 * from / to;
  return Array.from({ length: to }, (_, pixel) => {
    const center = (pixel + .5) * from / to;
    const start = Math.max(0, Math.ceil(center - 3.5 * sigma - .5));
    const end = Math.min(from - 1, Math.floor(center + 3.5 * sigma - .5));
    const weights = new Float32Array(end - start + 1);
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      const x = (start + i + .5 - center) / sigma;
      sum += weights[i] = Math.exp(-.5 * x * x);
    }
    for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    return { start, weights };
  });
}

/** A scale-aware low-pass filter, applied to premultiplied ink and coverage.
 * Browser drawImage filters vary and can alias a fine print carrier into bands.
 * Filter the already stacked sheets so their shared-field image survives. */
export async function resamplePrintPixels(
  source: { width: number; height: number; data: Uint8ClampedArray },
  width: number, height: number, signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const horizontal = contributions(source.width, width);
  const vertical = contributions(source.height, height);
  const rows = new Float32Array(width * source.height * 4);
  const data = new Uint8ClampedArray(width * height * 4);
  const yieldToInput = async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    signal?.throwIfAborted();
  };
  for (let y = 0; y < source.height; y++) {
    if (y % 64 === 0) await yieldToInput();
    for (let x = 0; x < width; x++) {
      const { start, weights } = horizontal[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < weights.length; i++) {
        const p = (y * source.width + start + i) * 4;
        const alpha = source.data[p + 3] * weights[i];
        a += alpha;
        r += source.data[p] * alpha / 255;
        g += source.data[p + 1] * alpha / 255;
        b += source.data[p + 2] * alpha / 255;
      }
      const p = (y * width + x) * 4;
      rows[p] = r; rows[p + 1] = g; rows[p + 2] = b; rows[p + 3] = a;
    }
  }
  for (let y = 0; y < height; y++) {
    if (y % 32 === 0) await yieldToInput();
    const { start, weights } = vertical[y];
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let i = 0; i < weights.length; i++) {
        const p = ((start + i) * width + x) * 4, weight = weights[i];
        r += rows[p] * weight; g += rows[p + 1] * weight;
        b += rows[p + 2] * weight; a += rows[p + 3] * weight;
      }
      const p = (y * width + x) * 4;
      data[p + 3] = a;
      if (data[p + 3]) {
        data[p] = 255 * r / a; data[p + 1] = 255 * g / a; data[p + 2] = 255 * b / a;
      }
    }
  }
  return data;
}
