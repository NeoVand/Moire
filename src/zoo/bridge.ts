import { capturePng, captureSize, captureSettle, captureInfo } from '../gpu/capture';
import { parseScene, serializeScene } from '../store/scene';
import { sceneOf, useProjectStore } from '../store/project';

/**
 * The scene zoo's side of the harness: a window API the headless runner drives.
 * Loaded only in dev builds and only behind `?zoo`, so the shipped app never
 * carries it.
 *
 * The one design rule is that a capture must be a pure function of the scene
 * file and the requested pixel size — never of the window layout around the
 * canvas. A scene authored at zoom 1 is framed to show REF_WIDTH world units
 * across the capture: the bridge pins the zoom so the stage's own size cancels
 * out of the math, and `snapshot` renders at the explicit framebuffer size, so
 * moving a panel or resizing the window cannot shift a golden by a pixel.
 */
const REF_WIDTH = 640;

export interface ZooApi {
  /** The renderer backend, or null while the canvas is still mounting. */
  info: () => { backend: string; fullCost?: number; scale?: number } | null;
  /** Replace the construction with a scene file's text, wholesale. */
  load: (sceneText: string) => void;
  /** One settled frame as a PNG data URL, framed by the scene alone. */
  capture: (opts?: { width?: number; height?: number; interactionScale?: number }) => Promise<string>;
  /** The construction as a scene file's text, for a harness to read back. */
  dump: () => string;
}

declare global {
  interface Window {
    __zoo?: ZooApi;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the capture'));
    reader.readAsDataURL(blob);
  });
}

window.__zoo = {
  info: () => captureInfo(),

  load: (sceneText: string) => {
    useProjectStore.getState().loadScene(parseScene(sceneText));
  },

  dump: () => serializeScene(sceneOf()),

  capture: async (opts = {}) => {
    const width = Math.round(opts.width ?? 640);
    const height = Math.round(opts.height ?? 480);
    await captureSettle();

    const store = useProjectStore.getState();
    const sceneZoom = store.camera.zoom;
    const base = captureSize({ scale: 1 });
    if (!base) throw new Error('Canvas is not ready');

    // Pin the zoom so the world width shown is REF_WIDTH / sceneZoom exactly.
    // snapshot multiplies the zoom by (output / buffer), so the buffer size —
    // the one layout-dependent quantity — cancels, and the effective zoom of
    // the capture is width / worldWidth regardless of the stage's size.
    const worldWidth = REF_WIDTH / sceneZoom;
    const aspect = width / height;
    const coverByWidth = aspect <= base.width / base.height;
    const zoom = coverByWidth ? base.width / worldWidth : (base.height * aspect) / worldWidth;
    const scale = coverByWidth ? width / base.width : height / base.height;

    store.setCamera({ zoom });
    try {
      const blob = await capturePng({ scale, aspect, interactionScale: opts.interactionScale });
      return await blobToDataUrl(blob);
    } finally {
      useProjectStore.getState().setCamera({ zoom: sceneZoom });
    }
  },
};
