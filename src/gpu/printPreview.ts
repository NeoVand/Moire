import { renderPrintSheets, type PrintSource, type PrintProgress } from './print';
import type { PrintSettings } from './printFormat';
import { resamplePrintPixels } from './printResample';

/** Build a display-sized proof after compositing, with explicit low-pass filtering. */
export async function fitPrintPreview(blob: Blob, bounds: { width: number; height: number }, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    signal?.throwIfAborted();
    const factor = Math.min(1, Math.max(1, bounds.width) / image.width, Math.max(1, bounds.height) / image.height);
    const targetWidth = Math.max(1, Math.round(image.width * factor));
    const targetHeight = Math.max(1, Math.round(image.height * factor));
    if (targetWidth === image.width && targetHeight === image.height) return blob;
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('This browser cannot resize a print preview.');
    ctx.drawImage(image, 0, 0);
    const data = await resamplePrintPixels(ctx.getImageData(0, 0, image.width, image.height), targetWidth, targetHeight, signal);
    canvas.width = targetWidth; canvas.height = targetHeight;
    ctx.putImageData(new ImageData(data, targetWidth, targetHeight), 0, 0);
    const fitted = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not resize the print preview.')), 'image/png');
    });
    signal?.throwIfAborted();
    return fitted;
  } finally {
    image.close();
    canvas.width = canvas.height = 1;
  }
}

/** Composite at print resolution. Filtering each sheet first loses correlations,
 * including the picture encoded by a pair of image fields. */
export async function stackPrintSheets(sheets: readonly { blob: Blob }[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!sheets.length) throw new Error('Choose at least one layer to preview.');
  const canvas = document.createElement('canvas');
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot create a print preview.');
    for (const [i, sheet] of sheets.entries()) {
      signal?.throwIfAborted();
      const image = await createImageBitmap(sheet.blob);
      try {
        signal?.throwIfAborted();
        if (i === 0) { canvas.width = image.width; canvas.height = image.height; }
        if (image.width !== canvas.width || image.height !== canvas.height) {
          throw new Error('Print sheets must have matching dimensions to preview their alignment.');
        }
        ctx.drawImage(image, 0, 0);
      } finally {
        image.close();
      }
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not encode the print preview.')), 'image/png');
    });
    signal?.throwIfAborted();
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    canvas.width = canvas.height = 1;
  }
}

export async function renderPrintPreview(
  source: PrintSource, settings: PrintSettings, layerIds: string[],
  options: { signal?: AbortSignal; progress?: (progress: PrintProgress) => void } = {},
) {
  // These are the same full-resolution PNGs the export writes, in paint order.
  const files = await renderPrintSheets(source, settings, layerIds, options);
  const stacked = await stackPrintSheets(files, options.signal);
  const layers = source.state.layers.filter((layer) => layerIds.includes(layer.id));
  return {
    ...stacked,
    sheets: files.map((file, i) => ({ id: layers[i].id, blob: file.blob })),
  };
}
