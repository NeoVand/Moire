import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  WebMOutputFormat,
  canEncodeVideo,
} from 'mediabunny';
import type { RecordSink } from './recorder';

/** The quality every recording is made at, and the one every check must ask about. */
const QUALITY = QUALITY_HIGH;

/**
 * Frames into a file, without going through PNG on the way.
 *
 * The recorder hands over the live canvas rather than an encoded picture, so a
 * frame is drawn once and passed straight to the encoder. Encoding each frame to
 * PNG only for the encoder to decode it again would double the work of a long
 * take and lose nothing but time.
 *
 * The canvas the encoder is given is not the renderer's own. That one changes
 * size between captures -- it is restored to the display size the moment each
 * snapshot is done with it -- and an encoder needs one fixed frame size for the
 * whole file. So the frames are blitted into a canvas of the stated size, which
 * costs one copy and removes a whole class of way this could go wrong.
 *
 * Timestamps are stated, not measured. Frame n is at exactly n/fps whatever the
 * wall clock did, which is the same discipline the recorder itself follows and
 * the reason the output plays at the rate it claims.
 */

export type VideoFormat = 'mp4' | 'webm';

export interface VideoFormatInfo {
  id: VideoFormat;
  label: string;
  extension: string;
  codec: 'avc' | 'vp9';
  mime: string;
}

export const VIDEO_FORMATS: VideoFormatInfo[] = [
  { id: 'mp4', label: 'MP4', extension: 'mp4', codec: 'avc', mime: 'video/mp4' },
  { id: 'webm', label: 'WebM', extension: 'webm', codec: 'vp9', mime: 'video/webm' },
];

/**
 * The sizes offered, and the reason there is a list at all.
 *
 * A still is sized as a multiple of the window, because a picture for print is
 * asked for that way. A recording is not: encoders have hard limits, and the
 * multiplier that gives a fine still gives an impossible video. A 2x export of a
 * large window is 6840x3944, which no H.264 encoder will accept and which nobody
 * wanted a video at anyway.
 *
 * Named the way people ask for them rather than by line count, with the lines in
 * the tooltip -- "4K" is what somebody wants, and 2160p is how it is spelled.
 */
export const VIDEO_SIZES: { height: number; label: string }[] = [
  { height: 720, label: 'HD' },
  { height: 1080, label: 'Full HD' },
  { height: 1440, label: '2K' },
  { height: 2160, label: '4K' },
];

/**
 * The largest frame each codec will really take.
 *
 * H.264's top level is 8192x4320 on paper, but hardware encoders in practice
 * refuse well below that and the failure is a wall of codec string. DCI 4K is
 * the honest ceiling: it clears UHD at sixteen by nine with room over, so asking
 * for 4K gives 4K, while an unusually wide frame is still held somewhere every
 * machine can encode rather than somewhere only some can.
 */
const CODEC_MAX_PIXELS: Record<VideoFormatInfo['codec'], number> = {
  avc: 4096 * 2304,
  vp9: 4096 * 2304,
};

/** The frame this format will accept nearest the one asked for, always even. */
export function videoFrameSize(
  format: VideoFormat,
  height: number,
  aspect: number
): { width: number; height: number } {
  const info = VIDEO_FORMATS.find((f) => f.id === format) ?? VIDEO_FORMATS[0];
  const max = CODEC_MAX_PIXELS[info.codec];
  let h = height;
  let w = h * aspect;
  if (w * h > max) {
    const k = Math.sqrt(max / (w * h));
    w *= k;
    h *= k;
  }
  return {
    width: Math.max(2, Math.round(w / 2) * 2),
    height: Math.max(2, Math.round(h / 2) * 2),
  };
}

/**
 * Which of them this browser can actually encode. Asked rather than assumed:
 * hardware support for H.264 in particular is not universal, and a format that
 * cannot be encoded should be greyed out before a take rather than failing
 * after one.
 */
export async function encodableFormats(
  height: number,
  aspect: number,
  fps: number
): Promise<Set<VideoFormat>> {
  const out = new Set<VideoFormat>();
  await Promise.all(
    VIDEO_FORMATS.map(async (f) => {
      try {
        // Asked about the configuration that will actually be used -- the size,
        // the rate and the quality. Asking with the library's defaults instead
        // answers a different question, and answers it yes while the real
        // configuration is refused: a codec available at 1080p can be refused at
        // 4K, and one available at 30 refused at 120.
        const size = videoFrameSize(f.id, height, aspect);
        if (await canEncodeVideo(f.codec, { ...size, framerate: fps, quality: QUALITY })) {
          out.add(f.id);
        }
      } catch {
        // An unsupported codec throws rather than answering; same conclusion.
      }
    })
  );
  return out;
}

export interface VideoSinkOptions {
  format: VideoFormat;
  width: number;
  height: number;
  fps: number;
}

export interface VideoSink extends RecordSink {
  /** The finished file, available once the recording has closed. */
  result: () => Blob | null;
}

export function videoSink(opts: VideoSinkOptions): VideoSink {
  const info = VIDEO_FORMATS.find((f) => f.id === opts.format) ?? VIDEO_FORMATS[0];
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext('2d');

  const output = new Output({
    format: info.id === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec: info.codec, quality: QUALITY });
  output.addVideoTrack(source, { frameRate: opts.fps });

  let started = false;
  let blob: Blob | null = null;

  return {
    async frame(index, frame) {
      if (!ctx) throw new Error('Could not open a 2D context for encoding.');
      // Opened before the first frame rather than lazily inside it, so a
      // configuration this machine will not take fails here -- with whatever the
      // encoder says about it -- rather than several frames later as a flush.
      if (!started) {
        await output.start();
        started = true;
      }
      ctx.drawImage(await frame.canvas(), 0, 0, canvas.width, canvas.height);
      await source.add(index / opts.fps, 1 / opts.fps);
    },
    async close(ok) {
      if (!started) return;
      if (!ok) {
        // A take that went wrong is thrown away, not finished. Asking a failed
        // encoder to finalize buries the real error under a flushing error.
        await output.cancel().catch(() => {});
        return;
      }
      await output.finalize();
      const buffer = (output.target as BufferTarget).buffer;
      if (buffer) blob = new Blob([buffer], { type: info.mime });
    },
    result: () => blob,
  };
}

export function downloadVideo(blob: Blob, format: VideoFormat, name = 'moire') {
  const info = VIDEO_FORMATS.find((f) => f.id === format) ?? VIDEO_FORMATS[0];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}-${stamp}.${info.extension}`;
  link.click();
  URL.revokeObjectURL(url);
}
