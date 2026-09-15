import { renderPrintSheets, type PrintSource, type PrintProgress } from './print';
import type { PrintSettings } from './printFormat';

/** Build a display-sized proof after compositing. Repeated half-size reductions
 * keep a browser's single bilinear image resize from inventing carrier beats. */
export async function fitPrintPreview(blob: Blob, bounds: { width: number; height: number }, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const image = await createImageBitmap(blob);
  const canvases = [document.createElement('canvas'), document.createElement('canvas')];
  try {
    signal?.throwIfAborted();
    const factor = Math.min(1, Math.max(1, bounds.width) / image.width, Math.max(1, bounds.height) / image.height);
    const targetWidth = Math.max(1, Math.round(image.width * factor));
    const targetHeight = Math.max(1, Math.round(image.height * factor));
    let source: CanvasImageSource = image;
    let width = image.width, height = image.height, step = 0;
    let canvas: HTMLCanvasElement;
    do {
      canvas = canvases[step++ % 2];
      width = Math.max(targetWidth, Math.floor(width / 2));
      height = Math.max(targetHeight, Math.floor(height / 2));
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot resize a print preview.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, width, height);
      source = canvas;
    } while (width > targetWidth || height > targetHeight);
    const fitted = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not resize the print preview.')), 'image/png');
    });
    signal?.throwIfAborted();
    return fitted;
  } finally {
    image.close();
    for (const canvas of canvases) canvas.width = canvas.height = 1;
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
