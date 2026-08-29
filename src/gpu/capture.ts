type CaptureFn = (scale?: number) => Promise<Blob>;

let captureFn: CaptureFn | null = null;

export function registerCapture(fn: CaptureFn | null) {
  captureFn = fn;
}

/** `scale` multiplies the canvas pixel ratio for the one exported frame. */
export async function exportPng(scale = 1) {
  if (!captureFn) throw new Error('Canvas is not ready');
  const blob = await captureFn(scale);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `moire-${stamp}.png`;
  link.click();
  URL.revokeObjectURL(url);
}
