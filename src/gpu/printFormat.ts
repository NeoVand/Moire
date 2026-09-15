export const PAPER_SIZES = [
  { id: 'a5', name: 'A5', width: 148, height: 210 },
  { id: 'a4', name: 'A4', width: 210, height: 297 },
  { id: 'a3', name: 'A3', width: 297, height: 420 },
  { id: 'letter', name: 'US Letter', width: 215.9, height: 279.4 },
  { id: 'legal', name: 'US Legal', width: 215.9, height: 355.6 },
  { id: 'tabloid', name: 'Tabloid', width: 279.4, height: 431.8 },
] as const;

export interface PrintSettings {
  paper: string;
  landscape: boolean;
  customWidth: number;
  customHeight: number;
  dpi: number;
  margin: number;
  marks: boolean;
  blackInk: boolean;
}

export const DEFAULT_PRINT: PrintSettings = {
  paper: 'a4', landscape: false, customWidth: 210, customHeight: 297,
  dpi: 300, margin: 10, marks: false, blackInk: false,
};

/** Reject oversized jobs explicitly; a print sheet must never silently shrink. */
export function printLayout(settings: PrintSettings) {
  const paper = PAPER_SIZES.find((p) => p.id === settings.paper);
  if (!paper && settings.paper !== 'custom') throw new Error('Choose a paper size.');
  const w = paper?.width ?? settings.customWidth;
  const h = paper?.height ?? settings.customHeight;
  const [widthMm, heightMm] = settings.landscape ? [h, w] : [w, h];
  if (![w, h].every((n) => Number.isFinite(n) && n >= 25 && n <= 1000)) {
    throw new Error('Paper dimensions must be between 25 and 1000 mm.');
  }
  if (![150, 300, 600].includes(settings.dpi)) throw new Error('Choose 150, 300, or 600 DPI.');
  if (!Number.isFinite(settings.margin) || settings.margin < 0 || settings.margin * 2 >= Math.min(w, h) - 1) {
    throw new Error('Reduce the margin to leave room for the drawing.');
  }
  if (settings.marks && settings.margin < 6) throw new Error('Alignment marks need a margin of at least 6 mm.');
  const px = settings.dpi / 25.4;
  const width = Math.round(widthMm * px);
  const height = Math.round(heightMm * px);
  if (Math.max(width, height) > 8192 || width * height > 24_000_000) {
    throw new Error('This sheet is too large at this resolution. Choose a lower DPI or smaller paper.');
  }
  const inset = Math.round(settings.margin * px);
  return { widthMm, heightMm, width, height, inset, artWidth: width - 2 * inset, artHeight: height - 2 * inset };
}

const crcTable = new Uint32Array(256).map((_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** PNG pHYs uses pixels per metre. Replace the browser's default 96 DPI. */
export async function pngWithDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  if (bytes.length < 33 || view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
    throw new Error('Could not encode the print sheet as PNG.');
  }
  const chunk = new Uint8Array(21);
  const data = new DataView(chunk.buffer);
  data.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  data.setUint32(8, Math.round(dpi / 0.0254));
  data.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  data.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts: BlobPart[] = [bytes.slice(0, 8)];
  for (let at = 8; at < bytes.length;) {
    if (at + 12 > bytes.length) throw new Error('Incomplete PNG sheet.');
    const end = at + view.getUint32(at) + 12;
    if (end > bytes.length) throw new Error('Incomplete PNG sheet.');
    const kind = view.getUint32(at + 4);
    if (kind !== 0x70485973) parts.push(bytes.slice(at, end));
    if (kind === 0x49484452) parts.push(chunk);
    at = end;
  }
  return new Blob(parts, { type: 'image/png' });
}

export function printFilename(index: number, name: string): string {
  const safe = name.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
  return `${String(index + 1).padStart(2, '0')}-${safe || 'layer'}.png`;
}

/** PNGs are already compressed. A stored ZIP avoids another large memory copy. */
export async function printZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const body: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;
  let directorySize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(new Uint8Array(await file.blob.arrayBuffer()));
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true); // 1980-01-01, a valid DOS date.
    l.setUint32(14, crc, true);
    l.setUint32(18, file.blob.size, true);
    l.setUint32(22, file.blob.size, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    body.push(local, file.blob);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint16(14, 33, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, file.blob.size, true);
    c.setUint32(24, file.blob.size, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    directory.push(central);
    directorySize += central.length;
    offset += local.length + file.blob.size;
  }
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  return new Blob([...body, ...directory, end], { type: 'application/zip' });
}
