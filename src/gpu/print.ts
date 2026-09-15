import { MoireRenderer, type RendererSync } from './renderer';
import { pngWithDpi, printFilename, printLayout, printZip, type PrintSettings } from './printFormat';

export interface PrintSource {
  state: RendererSync;
  framing: { width: number; height: number };
}

export interface PrintProgress { done: number; total: number; name: string }

const encode = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the print sheet.')), 'image/png');
});

/** Each sheet shares a frozen camera and extent. The project store is never written. */
export async function renderPrintSheets(
  source: PrintSource,
  settings: PrintSettings,
  layerIds: string[],
  options: {
    signal?: AbortSignal;
    progress?: (progress: PrintProgress) => void;
    /** Small proof of the first selected sheet, using the same framing. */
    preview?: boolean;
  } = {},
) {
  const layout = printLayout(settings);
  const layers = source.state.layers.filter((layer) => layerIds.includes(layer.id));
  if (!layers.length) throw new Error('Choose at least one layer to export.');
  if (!Number.isFinite(source.framing.width) || !Number.isFinite(source.framing.height) ||
      source.framing.width <= 0 || source.framing.height <= 0) throw new Error('Canvas is not ready.');
  const check = () => options.signal?.throwIfAborted();
  check();
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:2px;height:2px;pointer-events:none';
  container.setAttribute('aria-hidden', 'true');
  document.body.appendChild(container);
  const renderer = new MoireRenderer({ print: true });
  const page = document.createElement('canvas');
  const factor = options.preview ? Math.min(1, 420 / Math.max(layout.width, layout.height)) : 1;
  page.width = Math.round(layout.width * factor);
  page.height = Math.round(layout.height * factor);
  const inset = Math.round(layout.inset * factor);
  const size = { width: page.width - 2 * inset, height: page.height - 2 * inset };
  const files: { name: string; blob: Blob }[] = [];
  try {
    const ctx = page.getContext('2d');
    if (!ctx) throw new Error('This browser cannot create a print sheet.');
    await renderer.mount(container, 1);
    check();
    for (const [i, layer] of layers.entries()) {
      check();
      options.progress?.({ done: i, total: layers.length, name: layer.name });
      renderer.sync({
        ...source.state,
        // New ids keep print independent of any live pattern-type transition.
        layers: [{ ...layer, id: `print-${layer.id}`, visible: true, color: settings.blackInk ? '#000000' : layer.color }],
        view: { ...source.state.view, envelope: false, ratio: false, envelopeContours: false },
      });
      await renderer.snapshotWith({ size, framing: source.framing }, (canvas) => {
        check();
        ctx.clearRect(0, 0, page.width, page.height);
        ctx.drawImage(canvas, inset, inset);
      });
      check();
      if (settings.marks) {
        const reach = Math.max(2, Math.round(2 * settings.dpi / 25.4 * factor));
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, Math.round(0.2 * settings.dpi / 25.4 * factor));
        ctx.beginPath();
        for (const x of [inset / 2, page.width - inset / 2]) {
          for (const y of [inset / 2, page.height - inset / 2]) {
            ctx.moveTo(x - reach, y); ctx.lineTo(x + reach, y);
            ctx.moveTo(x, y - reach); ctx.lineTo(x, y + reach);
          }
        }
        ctx.stroke();
      }
      const blob = await encode(page);
      check();
      files.push({ name: printFilename(source.state.layers.indexOf(layer), layer.name), blob: options.preview ? blob : await pngWithDpi(blob, settings.dpi) });
      options.progress?.({ done: i + 1, total: layers.length, name: layer.name });
    }
    return files;
  } finally {
    renderer.dispose();
    container.remove();
    page.width = page.height = 1;
  }
}

export async function exportPrint(
  source: PrintSource, settings: PrintSettings, layerIds: string[],
  options: { signal?: AbortSignal; progress?: (progress: PrintProgress) => void } = {},
) {
  const files = await renderPrintSheets(source, settings, layerIds, options);
  options.signal?.throwIfAborted();
  const layout = printLayout(settings);
  files.push({ name: 'Print instructions.txt', blob: new Blob([
    `Moire print sheets\n\nPaper: ${layout.widthMm} x ${layout.heightMm} mm\nResolution: ${settings.dpi} DPI\nPixels: ${layout.width} x ${layout.height}\nMargin: ${settings.margin} mm\n\n`,
    'Print each PNG on a separate transparency sheet at 100% / actual size. Disable fit to page, automatic cropping, and borderless enlargement. Use the same paper size, orientation, and printer settings for every layer.\n\n',
    'The background and margins are transparent. Every sheet uses the same frozen view and scale. Align the sheet edges',
    settings.marks ? ' or the cross marks' : '',
    ', then slide or rotate one sheet over another.\n\n',
    ...files.map((file) => `${file.name}\n`),
  ], { type: 'text/plain' }) });
  const zip = await printZip(files);
  options.signal?.throwIfAborted();
  return zip;
}
