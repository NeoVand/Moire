// Figures rendered by the shipping renderer, not by a reimplementation.
//
// Mounts its own MoireRenderer offscreen at a chosen size, syncs a scene, waits
// for the frame, and posts the PNG to the sink. Everything the paper shows as
// "the tool's output" comes through here.

let types = null;
let MoireRenderer = null;
let host = null;
let rig = null;

const SINK = 'http://localhost:5199';

export async function setup(width, height) {
  await teardown();
  types ??= await import('/src/types/moire.ts');
  MoireRenderer ??= (await import('/src/gpu/renderer.ts')).MoireRenderer;

  host = document.createElement('div');
  host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0.0001;pointer-events:none;z-index:-1;`;
  document.body.appendChild(host);
  rig = new MoireRenderer();
  await rig.mount(host);
  return { width, height, dpr: Math.min(window.devicePixelRatio || 1, 2) };
}

export async function teardown() {
  rig?.dispose();
  if (host?.parentElement) host.remove();
  rig = null;
  host = null;
}

function state(spec) {
  return {
    layers: (spec.layers ?? []).map((cfg, i) =>
      types.createLayer({
        id: `fig-${i}`,
        name: `Figure ${i}`,
        type: cfg.type ?? 'concentric-circles',
        spacing: cfg.spacing ?? 20,
        thickness: cfg.thickness ?? 1.5,
        phase: cfg.phase ?? 0,
        rotation: cfg.rotation ?? 0,
        sides: cfg.sides ?? 6,
        color: cfg.color ?? '#000000',
        opacity: cfg.opacity ?? 1,
        offset: { x: cfg.offX ?? 0, y: cfg.offY ?? 0 },
        rotationOffset: cfg.rot ?? 0,
        position: { x: cfg.posX ?? 0, y: cfg.posY ?? 0 },
      })
    ),
    camera: { zoom: spec.zoom ?? 1, pan: spec.pan ?? { x: 0, y: 0 } },
    backgroundColor: spec.background ?? '#ffffff',
  };
}

/**
 * Render one scene and post it as `name`.png. `targetWidth` downsamples through a
 * 2D canvas first: the frames are dense hairline fields, so a full-resolution PNG
 * runs to tens of megabytes and a filtered reduction reads better on paper than a
 * point sample of the same field.
 */
export async function shoot(name, spec, targetWidth = 0) {
  rig.sync(state(spec));
  const maybe = rig.renderer.render(rig.scene, rig.camera);
  if (maybe?.then) await maybe;
  await rig.renderer.backend.device.queue.onSubmittedWorkDone();

  let blob;
  if (targetWidth > 0 && targetWidth < rig.canvas.width) {
    const scale = targetWidth / rig.canvas.width;
    const off = document.createElement('canvas');
    off.width = targetWidth;
    off.height = Math.round(rig.canvas.height * scale);
    const ctx = off.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const bitmap = await createImageBitmap(rig.canvas, {
      resizeWidth: off.width,
      resizeHeight: off.height,
      resizeQuality: 'high',
    });
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    blob = await new Promise((res) => off.toBlob(res, 'image/png'));
  } else {
    blob = await rig.snapshot();
  }
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  const res = await fetch(`${SINK}/${name}.png`, { method: 'POST', body: btoa(binary) });
  return { name, bytes: bytes.length, saved: await res.text() };
}

export async function shootAll(scenes, width = 1600, height = 1000, targetWidth = 1600) {
  const info = await setup(width, height);
  const out = [info];
  for (const [name, spec] of Object.entries(scenes)) {
    out.push(await shoot(name, spec, targetWidth));
  }
  await teardown();
  return out;
}
