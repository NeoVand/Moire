import * as THREE from 'three/webgpu';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { MAX_LAYERS, isGrid, type PatternLayer, type PatternType } from '../types/moire';
import {
  buildColorNode,
  compileFieldCached,
  createCameraUniforms,
  createSlots,
  createViewUniforms,
  fieldSource,
  writeLayerSlot,
  type CameraUniforms,
  type LayerSlot,
  type ViewUniforms,
} from './composite';
import { clearLayerMorphs, hasLayerMorphs } from './typeMorph';
import type { ViewState } from '../store/project';

export interface RendererSync {
  layers: PatternLayer[];
  camera: { zoom: number; pan: { x: number; y: number } };
  backgroundColor: string;
  view: ViewState;
}

/** How many line families a layer draws at once. A lattice draws several. */
function familyCount(type: PatternType): number {
  if (type === 'grid-square') return 2;
  if (type === 'grid-hex' || type === 'grid-triangle') return 3;
  return 1;
}

/**
 * Coverage a layer would average over one of its own periods: a stroke of
 * half-width `h` on a pitch `s` inks `2h/s` of the paper, and a lattice inks that
 * much once per family it draws. It is the pivot the envelope's contrast expands
 * about — a display constant, not a measurement, so the eikonal factor is left out
 * and the layer's own spacing stands in for the local member gap.
 *
 * Counting the families matters: a grid at a tenth of its pitch covers a fifth of
 * the paper, and calling that a tenth puts the pivot far brighter than the picture
 * it is expanding about, which at any real contrast drives the whole frame to
 * black.
 */
function nominalCoverage(layer: PatternLayer, pixel: number): number {
  const halfT = Math.max(layer.thickness * 0.5, pixel * 1.15);
  const perFamily = Math.min(1, (2 * halfT) / Math.max(layer.spacing, 1e-3));
  const open = (1 - perFamily) ** familyCount(layer.type);
  return (1 - open) * layer.opacity;
}

/**
 * The slot indices the ratio view compares — the two topmost visible layers with
 * a scalar index — or null when there are not two. Lattices index their members
 * by a pair of integers, so they carry no scalar index to difference; everything
 * else qualifies, radial lines included, whose index is a sector count and still
 * a scalar the ratio can differentiate.
 */
function rankedScalars(layers: PatternLayer[], want: number): number[] {
  const out: number[] = [];
  for (let i = Math.min(layers.length, MAX_LAYERS) - 1; i >= 0 && out.length < want; i--) {
    if (layers[i].visible && !isGrid(layers[i].type)) out.push(i);
  }
  return out;
}

function ratioPair(layers: PatternLayer[]): [number, number] | null {
  const pair = rankedScalars(layers, 2);
  return pair.length === 2 ? [pair[0], pair[1]] : null;
}

/**
 * The envelope's ranked pair, unlike the ratio view's, falls back to the topmost
 * eligible layer alone. The lattice sweep orients itself against the ranked
 * partner's index gradient, and a lattice's most common companion is a single
 * scalar family — with no fallback that gradient is the zero vector and the
 * orientation choice degrades to noise. A == B costs nothing else: eta collapses
 * to zero, which only quiets the optional regime mask, and the sum-flip stays
 * off, which is right for a family against itself.
 */
function envelopePair(layers: PatternLayer[]): [number, number] | null {
  const pair = ratioPair(layers);
  if (pair) return pair;
  for (let i = Math.min(layers.length, MAX_LAYERS) - 1; i >= 0; i--) {
    if (layers[i].visible && !isGrid(layers[i].type)) return [i, i];
  }
  return null;
}

/**
 * The two-lattice (twist) mode of the envelope: engaged only when no scalar
 * layer is visible, so lattices have no partner gradient to orient against.
 * The topmost lattice becomes the reference; every other lattice matches its
 * generators to the reference's, per pixel, and rides the SAME (u, golden)
 * schedule — matched generators advance in lockstep across layers, so both
 * slow characters of a twist pair (a1−b1 and a2−b2) survive the average
 * exactly while every carrier and cross-beat is scrambled away. With one
 * lattice alone the schedule just washes it to its own cell mean, which is the
 * correct envelope of a lattice with nothing to beat against.
 */
function latticePair(layers: PatternLayer[]): [number, number] | null {
  for (let i = Math.min(layers.length, MAX_LAYERS) - 1; i >= 0; i--) {
    if (layers[i].visible && !isGrid(layers[i].type)) return null;
  }
  const grids: number[] = [];
  for (let i = Math.min(layers.length, MAX_LAYERS) - 1; i >= 0 && grids.length < 2; i--) {
    if (layers[i].visible && isGrid(layers[i].type)) grids.push(i);
  }
  if (grids.length === 0) return null;
  return [grids[0], grids.length > 1 ? grids[1] : -1];
}
// (Only the reference index reaches the shader; every other lattice matches
// against it, so a third or fourth lattice joins the same lockstep.)

/**
 * How long an expression has to stand still before it becomes a shader.
 *
 * Field expressions are compiled into the material, so each new one is a pipeline
 * build — fast, but not per keystroke fast. The editor's own preview is CPU-drawn
 * and live, so what this delays is the canvas catching up, not the feedback.
 */
const FIELD_SETTLE_MS = 220;

const scratch = new THREE.Color();

function envelopePivot(state: RendererSync): THREE.Color {
  const pivot = new THREE.Color(state.backgroundColor);
  const pixel = 1 / Math.max(state.camera.zoom, 0.08);
  for (const layer of state.layers) {
    if (!layer.visible) continue;
    scratch.set(layer.color);
    pivot.lerp(scratch, nominalCoverage(layer, pixel));
  }
  return pivot;
}

async function encodeCanvasPng(source: HTMLCanvasElement): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(source);
    const off = document.createElement('canvas');
    off.width = bitmap.width;
    off.height = bitmap.height;
    const ctx = off.getContext('2d');
    if (!ctx) throw new Error('Could not read the canvas');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => off.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('empty');
    return blob;
  } catch {
    const blob = await new Promise<Blob | null>((resolve) => source.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not capture the canvas');
    return blob;
  }
}

export class MoireRenderer {
  private renderer: THREE.WebGPURenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private material: MeshBasicNodeMaterial | null = null;
  private mesh: THREE.Mesh | null = null;
  private container: HTMLElement | null = null;
  private observer: ResizeObserver | null = null;
  private slots: LayerSlot[] = [];
  private cameraUniforms: CameraUniforms | null = null;
  private viewUniforms: ViewUniforms | null = null;
  private ready = false;
  private disposed = false;
  private lossHooked = false;
  private raf = 0;
  private morphRaf = 0;
  private fieldTimer = 0;
  private building: Promise<void> | null = null;
  /** The expressions the live material was built for, one per slot. */
  private fieldSources: string[] = [];
  private lastState: RendererSync | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;

  canvas: HTMLCanvasElement | null = null;

  async mount(container: HTMLElement): Promise<void> {
    this.disposed = false;
    this.container = container;

    const renderer = new THREE.WebGPURenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer = renderer;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    // Chrome skips backdrop-filter over a bare WebGPU canvas unless it has a CSS image.
    canvas.style.backgroundImage = 'linear-gradient(transparent, transparent)';
    canvas.setAttribute('aria-label', 'Moire canvas');
    container.appendChild(canvas);
    this.canvas = canvas;

    await renderer.init();
    if (this.disposed) {
      this.dispose();
      return;
    }

    this.hookDeviceLoss();
    this.buildScene();
    this.ready = true;
    this.resize();
    if (this.scene && this.camera) {
      try {
        await this.renderer.compileAsync(this.scene, this.camera);
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`WebGPU shader compile failed: ${message}`);
      }
    }

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
  }

  private hookDeviceLoss() {
    if (this.lossHooked || !this.renderer) return;
    const backend = this.renderer.backend as {
      device?: { lost: Promise<{ reason: string }> };
    } | undefined;
    const device = backend?.device;
    if (!device) return;
    this.lossHooked = true;
    void device.lost.then((info) => {
      if (info.reason === 'unknown' && !this.disposed && this.container) {
        const container = this.container;
        this.dispose();
        void this.mount(container);
      }
    });
  }

  private buildScene() {
    if (!this.renderer) return;

    this.cameraUniforms = createCameraUniforms();
    this.viewUniforms = createViewUniforms();
    this.slots = createSlots(MAX_LAYERS);
    this.fieldSources = this.slots.map(() => '');

    const material = this.buildMaterial();
    this.material = material;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    this.mesh = mesh;

    const scene = new THREE.Scene();
    scene.add(mesh);
    this.scene = scene;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;
  }

  /** One material for the current set of field expressions. */
  private buildMaterial(): MeshBasicNodeMaterial {
    const material = new MeshBasicNodeMaterial();
    material.colorNode = buildColorNode(
      this.cameraUniforms!,
      this.viewUniforms!,
      this.slots,
      this.fieldSources.map((source) => (source ? compileFieldCached(source) : null))
    );
    material.side = THREE.DoubleSide;
    material.toneMapped = false;
    return material;
  }

  sync(state: RendererSync) {
    this.lastState = state;
    this.writeSlots();
    this.watchFields();
    if (hasLayerMorphs()) this.ensureMorphLoop();
  }

  /**
   * Field expressions are the one part of a layer the shader is built around, so a
   * new one needs a new material. Waiting for the source to stand still keeps a
   * pipeline build off the keystroke, and a source that comes back to what is
   * already compiled — typing a character and deleting it — cancels instead of
   * rebuilding to the same thing.
   */
  private watchFields() {
    const state = this.lastState;
    if (!state || !this.ready) return;
    const settled = this.fieldSources.every(
      (source, i) => source === fieldSource(state.layers[i]?.field)
    );
    if (this.fieldTimer) clearTimeout(this.fieldTimer);
    this.fieldTimer = settled
      ? 0
      : window.setTimeout(() => {
          this.fieldTimer = 0;
          void this.rebuildFields();
        }, FIELD_SETTLE_MS);
  }

  private async rebuildFields() {
    const state = this.lastState;
    if (!this.ready || !this.renderer || !this.scene || !this.camera || !this.mesh || !state) return;
    const wanted = this.slots.map((_, i) => fieldSource(state.layers[i]?.field));
    if (wanted.every((source, i) => source === this.fieldSources[i])) return;

    this.fieldSources = wanted;
    const previous = this.material;
    const material = this.buildMaterial();
    this.material = material;
    this.mesh.material = material;

    // Hold the last frame instead of drawing through the build. A pipeline this
    // size takes long enough that compiling it inside a draw call reads as a
    // freeze, and the uniforms are shared, so the frame after it is current.
    this.ready = false;
    this.building = this.renderer.compileAsync(this.scene, this.camera).then(() => undefined);
    try {
      await this.building;
    } finally {
      this.building = null;
      this.ready = !this.disposed;
    }
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    previous?.dispose();
    // Nothing syncs while a build is in flight, so an edit made during one is only
    // noticed here.
    this.watchFields();
  }

  private writeSlots() {
    const state = this.lastState;
    if (!this.cameraUniforms || !this.viewUniforms || !state) return;
    this.cameraUniforms.zoom.value = state.camera.zoom;
    this.cameraUniforms.pan.value.set(state.camera.pan.x, state.camera.pan.y);
    this.cameraUniforms.background.value.set(state.backgroundColor);
    this.renderer?.setClearColor(state.backgroundColor, 1);

    // With fewer than two comparable layers the ratio view has nothing to say,
    // so the flag stays down and the ordinary composite shows through.
    const pair = state.view.ratio ? ratioPair(state.layers) : null;
    const envelope = state.view.envelope && !pair;
    // The regime mask and the orientation-aware sweep both read the same ranked
    // pair the ratio view compares, so an enveloped stack keeps those uniforms
    // warm even with the ratio view off.
    const maskPair = envelope ? envelopePair(state.layers) : null;
    this.viewUniforms.taps.value = envelope
      ? Math.max(2, Math.round(state.view.envelopeTaps))
      : 1;
    this.viewUniforms.sweep.value = envelope ? Math.max(0, state.view.envelopeSweep) : 0;
    this.viewUniforms.contrast.value = envelope ? state.view.envelopeContrast : 1;
    this.viewUniforms.lift.value = envelope ? state.view.envelopeLift : 0;
    this.viewUniforms.envMask.value = envelope && maskPair ? state.view.envelopeMask : 0;
    this.viewUniforms.pivot.value.copy(envelope ? envelopePivot(state) : scratch.set(0xffffff));
    this.viewUniforms.ratio.value = pair ? 1 : 0;
    this.viewUniforms.ratioA.value = pair ? pair[0] : maskPair ? maskPair[0] : -1;
    this.viewUniforms.ratioB.value = pair ? pair[1] : maskPair ? maskPair[1] : -1;
    // The third ranked scalar joins the character scan: with three layers the
    // dangerous mistake is deviating the top pair's rates for a beat that is
    // slower than one the second layer makes with the third.
    const trio = pair || maskPair ? rankedScalars(state.layers, 3) : [];
    this.viewUniforms.ratioC.value = trio.length > 2 ? trio[2] : -1;
    this.viewUniforms.ratioBlend.value = state.view.ratioBlend;
    this.viewUniforms.ratioThreshold.value = state.view.ratioThreshold;
    const latPair = envelope ? latticePair(state.layers) : null;
    this.viewUniforms.latA.value = latPair ? latPair[0] : -1;

    for (let i = 0; i < this.slots.length; i++) {
      writeLayerSlot(this.slots[i], state.layers[i]);
    }
  }

  private ensureMorphLoop() {
    if (this.morphRaf || !this.ready) return;
    const step = () => {
      this.writeSlots();
      if (this.ready && this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      this.morphRaf = hasLayerMorphs() ? requestAnimationFrame(step) : 0;
    };
    this.morphRaf = requestAnimationFrame(step);
  }

  render() {
    if (!this.ready || this.raf || !this.renderer) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.ready || !this.renderer || !this.scene || !this.camera) return;
      this.renderer.render(this.scene, this.camera);
    });
  }

  /**
   * The export frame for a scale and target aspect (width/height; 0 keeps the
   * canvas's own). The rule is cover, never crop: the export always contains at
   * least the current view, and a different aspect extends it — the pattern is
   * defined everywhere, so there is always more picture past the frame. zScale
   * multiplies the zoom uniform so the framing is identical by construction:
   * world extent is buffer over zoom, and both scale together.
   */
  private exportFrame(opts: { scale?: number; aspect?: number } = {}) {
    const scale = Math.max(opts.scale ?? 1, 0.05);
    const bufW = Math.max(1, Math.round(this.lastWidth * (this.lastDpr || 1)));
    const bufH = Math.max(1, Math.round(this.lastHeight * (this.lastDpr || 1)));
    const aspect = opts.aspect || bufW / bufH;
    const coverByWidth = aspect <= bufW / bufH;
    let width = coverByWidth ? bufW * scale : bufH * scale * aspect;
    let height = width / aspect;
    const cap = 8192 / Math.max(width, height);
    if (cap < 1) {
      width *= cap;
      height *= cap;
    }
    width = Math.max(2, Math.round(width));
    height = Math.max(2, Math.round(height));
    const zScale = coverByWidth ? width / bufW : height / bufH;
    return { width, height, zScale };
  }

  /** The pixel size `snapshot` would render for these options, without rendering. */
  snapshotSize(opts: { scale?: number; aspect?: number } = {}): { width: number; height: number } {
    const { width, height } = this.exportFrame(opts);
    return { width, height };
  }

  async snapshot(opts: { scale?: number; aspect?: number } = {}): Promise<Blob> {
    // An export that lands inside a field rebuild waits for it rather than failing.
    await this.building;
    if (
      !this.ready ||
      !this.renderer ||
      !this.scene ||
      !this.camera ||
      !this.canvas ||
      !this.cameraUniforms
    ) {
      throw new Error('Renderer is not ready');
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    // One render at an explicit framebuffer size, with the zoom uniform scaled
    // to match — the pattern is resolution-free, so the pixels are simply asked
    // again, and the stroke floor keeps hairlines printable at any size.
    const { width, height, zScale } = this.exportFrame(opts);
    const zoom0 = this.cameraUniforms.zoom.value;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.cameraUniforms.zoom.value = zoom0 * zScale;
      this.renderer.render(this.scene, this.camera);
      return await encodeCanvasPng(this.canvas);
    } finally {
      this.cameraUniforms.zoom.value = zoom0;
      this.renderer.setPixelRatio(this.lastDpr || 1);
      this.renderer.setSize(this.lastWidth, this.lastHeight, false);
      this.render();
    }
  }

  resize() {
    if (!this.renderer || !this.container) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.lastWidth && height === this.lastHeight && dpr === this.lastDpr) return;
    this.lastWidth = width;
    this.lastHeight = height;
    this.lastDpr = dpr;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    if (this.ready) this.render();
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.morphRaf) cancelAnimationFrame(this.morphRaf);
    if (this.fieldTimer) clearTimeout(this.fieldTimer);
    this.raf = 0;
    this.morphRaf = 0;
    this.fieldTimer = 0;
    this.lastState = null;
    clearLayerMorphs();
    this.observer?.disconnect();
    this.observer = null;
    this.mesh?.geometry.dispose();
    this.material?.dispose();
    this.renderer?.dispose();
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.material = null;
    this.mesh = null;
    this.canvas = null;
    this.container = null;
    this.slots = [];
    this.cameraUniforms = null;
    this.viewUniforms = null;
    this.lossHooked = false;
  }
}
