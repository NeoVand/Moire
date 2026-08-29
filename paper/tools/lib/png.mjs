// Minimal RGB8 / RGBA8 PNG writer. Node's zlib already emits the exact stream
// IDAT wants, so the only real work is the CRC and the per-row filter byte.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** `pixels` is tightly packed RGB or RGBA, row major, top row first. */
export function encodePng(pixels, width, height, channels = 3) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer ?? pixels, pixels.byteOffset ?? 0, pixels.length).copy(
      raw,
      y * (stride + 1) + 1,
      y * stride,
      y * stride + stride
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function writePng(path, pixels, width, height, channels = 3) {
  writeFileSync(path, encodePng(pixels, width, height, channels));
  return path;
}

/** Perceptual sequential ramps, sampled at 9 anchors and lerped. */
const RAMPS = {
  viridis: [
    [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
    [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37],
  ],
  magma: [
    [0, 0, 4], [28, 16, 68], [79, 18, 123], [129, 37, 129], [181, 54, 122],
    [229, 80, 100], [251, 135, 97], [254, 194, 135], [252, 253, 191], [252, 253, 191],
  ],
  ice: [
    [8, 12, 30], [18, 42, 84], [24, 76, 130], [30, 112, 166], [48, 146, 190],
    [96, 178, 208], [150, 205, 222], [198, 227, 238], [235, 245, 250], [255, 255, 255],
  ],
  // Cyclic, for a field shown modulo one period: the two ends must meet.
  cyclic: [
    [226, 232, 240], [150, 186, 214], [80, 128, 178], [46, 74, 124], [30, 34, 62],
    [78, 38, 66], [140, 54, 78], [196, 104, 96], [226, 176, 152], [226, 232, 240],
  ],
  // Diverging, zero in the middle, for signed residuals.
  diverging: [
    [26, 84, 130], [58, 122, 164], [112, 165, 196], [176, 208, 226], [244, 244, 242],
    [246, 210, 186], [230, 158, 124], [206, 104, 74], [166, 54, 42], [128, 22, 24],
  ],
};

export function ramp(t, name = 'viridis') {
  const anchors = RAMPS[name] ?? RAMPS.viridis;
  const u = Math.min(1, Math.max(0, t)) * (anchors.length - 1);
  const i = Math.min(anchors.length - 2, Math.floor(u));
  const f = u - i;
  const a = anchors[i];
  const b = anchors[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
