export interface CaptureOptions {
  /** Resolution multiplier over the canvas's own buffer. */
  scale?: number;
  /** Target aspect (width / height); 0 or absent keeps the canvas's own. */
  aspect?: number;
}

type CaptureFn = (opts?: CaptureOptions) => Promise<Blob>;
type SizeFn = (opts?: CaptureOptions) => { width: number; height: number };

export interface CaptureExtras {
  /** Resolves when no shader rebuild is pending — a capture after it is current. */
  settle?: () => Promise<void>;
  /** Which backend three initialised; the zoo records it beside its goldens. */
  info?: () => { backend: string };
}

let captureFn: CaptureFn | null = null;
let sizeFn: SizeFn | null = null;
let extraFns: CaptureExtras = {};

export function registerCapture(
  capture: CaptureFn | null,
  size: SizeFn | null = null,
  extras: CaptureExtras = {}
) {
  captureFn = capture;
  sizeFn = size;
  extraFns = capture ? extras : {};
}

/** One rendered frame as a PNG blob — the export dialog's preview and payload. */
export async function capturePng(opts: CaptureOptions = {}): Promise<Blob> {
  if (!captureFn) throw new Error('Canvas is not ready');
  return captureFn(opts);
}

/** The pixel size an export would have, for showing before rendering it. */
export function captureSize(opts: CaptureOptions = {}): { width: number; height: number } | null {
  return sizeFn ? sizeFn(opts) : null;
}

/** Waits out any pending shader rebuild, so the next capture is current. */
export async function captureSettle(): Promise<void> {
  await extraFns.settle?.();
}

/** Backend info, or null while no renderer is registered. */
export function captureInfo(): { backend: string } | null {
  return captureFn ? (extraFns.info?.() ?? { backend: 'unknown' }) : null;
}

export async function exportPng(opts: CaptureOptions = {}) {
  const blob = await capturePng(opts);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `moire-${stamp}.png`;
  link.click();
  URL.revokeObjectURL(url);
}
