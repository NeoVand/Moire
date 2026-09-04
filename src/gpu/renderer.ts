import * as THREE from 'three/webgpu';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { MAX_LAYERS, isGrid, isRadialLines, type PatternLayer } from '../types/moire';
import {
  buildColorNode,
  buildTableColorNode,
  TABLE_N,
  TABLE_ROWS,
  compileFieldCached,
  type ImageField,
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

/**
 * A sole layer's nominal mean coverage — the constant pivot the envelope
 * grades a single-layer stack about (its per-pixel pivot equals its own mean
 * identically, leaving contrast dead; see soloPivot in composite.ts). A
 * stroke of half-width h on pitch p inks 2h·duty/p per family; a lattice
 * inks several families at its kind's row pitch and duty (a honeycomb's
 * walls are three families at (√3/2)s, each a third inked).
 */
function nominalCoverage(layer: PatternLayer, pixel: number): number {
  const grid = isGrid(layer.type);
  const hex = layer.type === 'grid-hex';
  const count = grid ? (layer.type === 'grid-square' ? 2 : 3) : 1;
  const pitch = grid && layer.type !== 'grid-square' ? Math.sqrt(3) / 2 : 1;
  const duty = hex ? 1 / 3 : 1;
  const halfT = Math.max(layer.thickness * 0.5, pixel * 1.15);
  const perFamily = Math.min(1, (2 * halfT * duty) / Math.max(layer.spacing * pitch, 1e-3));
  return (1 - (1 - perFamily) ** count) * layer.opacity;
}

/**
 * The stack, ranked once into the index coordinates every view consumes.
 *
 * Every visible layer contributes coordinates to the stack's joint index
 * torus — one for a scalar family (lines, rings, curves, the radial fan,
 * whose sector count is still a scalar), two generators for a lattice. The
 * character scan, the ratio view, the envelope's sweep orientation, the
 * regime mask, and the contour overlay all read this one ranking: the
 * topmost three scalar carriers and the topmost two lattices, top first.
 * The views differ only in how many rows they consume, never in how the
 * stack was ordered — and a future tiling layer joins as a layer that
 * contributes more than two coordinates, not as a new ranking.
 */
interface StackRanking {
  /** Topmost visible scalar-index layers, at most three. */
  scalars: number[];
  /** Topmost visible lattices, at most two. */
  lattices: number[];
}

function rankStack(layers: PatternLayer[]): StackRanking {
  const scalars: number[] = [];
  const lattices: number[] = [];
  for (let i = Math.min(layers.length, MAX_LAYERS) - 1; i >= 0; i--) {
    if (!layers[i].visible) continue;
    if (isGrid(layers[i].type)) {
      if (lattices.length < 2) lattices.push(i);
    } else if (scalars.length < 3) scalars.push(i);
  }
  return { scalars, lattices };
}

/** The scalar families whose nominal pitch IS their spacing — a radial
 * pencil's member gap grows with radius, so it can certify nothing. */
const PITCHED = new Set<string>([
  'straight-lines',
  'concentric-circles',
  'concentric-squares',
  'concentric-triangles',
  'concentric-polygons',
  'curve-wave',
  'curve-parabola',
  'curve-hyperbola',
  'curve-spiral',
]);

/**
 * The frame-wide deviation licence of a ranked pair: the higher-order
 * character (|a|, |b|) that the pair's nominal pitch ratio locks globally,
 * or nothing. This is the 1D convergent story of §selection run on the two
 * spacings alone: a 3:1 pair certifies (3,-1) everywhere; a 2.31:1 pair
 * certifies nothing, however many local stations a field's modulation
 * scatters over the frame. Fields, positions, and rotations are deliberately
 * ignored — anything only a PIXEL can see must not choose a schedule,
 * because per-pocket schedules quilt the envelope with seams.
 */
function pairLicense(
  P: PatternLayer | undefined,
  Q: PatternLayer | undefined,
  thr: number
): [number, number, number] {
  if (!P || !Q || !PITCHED.has(P.type) || !PITCHED.has(Q.type)) return [0, 0, 0];
  const gP = 1 / Math.max(Math.abs(P.spacing), 1e-6);
  const gQ = 1 / Math.max(Math.abs(Q.spacing), 1e-6);
  let best = Infinity;
  let ba = 0;
  let bb = 0;
  for (let a = 1; a <= 12; a += 1) {
    for (let b = 1; b <= 12; b += 1) {
      // Skip first order (always permitted, no licence needed) and the
      // zero-sum multiples (they ride the diagonal untouched).
      if (a * b <= 1 || a === b) continue;
      const beat = Math.abs(a * gP - b * gQ);
      const carrier = 0.5 * (a * gP + b * gQ);
      const merit = (beat / Math.max(carrier, 1e-9)) * a * b;
      if (merit < best) {
        best = merit;
        ba = a;
        bb = b;
      }
    }
  }
  return best < thr ? [1, ba, bb] : [0, 0, 0];
}

/**
 * How long an expression has to stand still before it becomes a shader.
 *
 * Field expressions are compiled into the material, so each new one is a pipeline
 * build — fast, but not per keystroke fast. The editor's own preview is CPU-drawn
 * and live, so what this delays is the canvas catching up, not the feedback.
 */
/**
 * A layer's image field, decoded for the GPU. The data URL is a greyscale PNG
 * the field editor made; it is read at an explicit mip level with linear
 * filtering, and `flipY` is off so texel row zero is the top of the picture.
 */
async function loadImageField(data: string): Promise<ImageField> {
  // An image element rather than createImageBitmap on the bytes: the element's
  // decoder is the forgiving one, and a data URL that has been through a
  // scene file deserves forgiveness.
  const image = new Image();
  image.src = data;
  await image.decode();
  const bitmap = await createImageBitmap(image, { colorSpaceConversion: 'none' });
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false;
  // Mipmaps are the edge-softness dial: the shader reads the picture at the
  // level `fieldSoften` asks for, and a weave reads a cell's mean darkness at
  // the level of the cell's size.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return { texture, width: bitmap.width, height: bitmap.height, aspect: bitmap.height / bitmap.width };
}

const FIELD_SETTLE_MS = 220;

/**
 * How many layer slots a stack needs compiled.
 *
 * The shader carries one solve per slot, and an inactive slot is NOT free:
 * its branch still costs registers, and the lattice coordinates every slot
 * contributes must be computed in uniform control flow, because their screen
 * derivatives cannot live inside a branch. Twelve slots for a two-layer
 * drawing measured 3.8x the per-pixel cost of two.
 *
 * So the material is compiled for the stack that exists, and the count keys a
 * rebuild the same way a field expression does — debounced, holding the last
 * frame. It counts layers PRESENT, not visible, so hiding a layer stays a
 * uniform write and never rebuilds.
 */
function slotsNeeded(layers: PatternLayer[]): number {
  return Math.min(Math.max(layers.length, 1), MAX_LAYERS);
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

/** Quiet time after the last change before a reduced frame is redrawn full size. */
const SETTLE_MS = 150;
/**
 * The frame budget a reduced buffer aims under: one vsync at 60 Hz, with the
 * measurement's own submit-to-completion latency counted against it.
 */
const FRAME_BUDGET_MS = 18;
/**
 * The pooling gate (see `view.pool`): buffer pixels per period under which,
 * or a floored half-stroke in buffer pixels under which, the plain render is
 * allowed to pool. Coarse on purpose: the shader's own weights decide.
 */
const POOL_PX = 12;
const POOL_STROKE_PX = 1.4;
/** The buffer scales tried, largest first; each step halves the pixel count. */
const INTERACTION_SCALES = [1, 0.71, 0.5, 0.35, 0.25];
/** The frame interval a stream is held to: 60 frames a second, on any display. */
const VSYNC_MS = 16.7;
/** No stream logic this soon after a mount or rebuild: warm-up jank is not a hand. */
const WARMUP_MS = 500;
/** Frames after a buffer change still draining the old buffer's work. */
const DRAIN_FRAMES = 2;
/** And the time: a backlog of overrunning frames takes longer than two frames to clear. */
const DRAIN_MS = 150;
/** Stream frames whose mean interval is one verdict on the buffer. */
const PACE_WINDOW = 8;

/** The largest buffer scale that brings a full-size frame of this cost under budget. */
function interactionScale(fullCost: number): number {
  for (const scale of INTERACTION_SCALES) {
    if (fullCost * scale * scale <= FRAME_BUDGET_MS) return scale;
  }
  return INTERACTION_SCALES[INTERACTION_SCALES.length - 1];
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
  /** Decoded image fields, by the key `fieldSource` gives them. */
  private imageFields = new Map<string, ImageField>();
  /** How many slots the live material was built for. */
  private slotCount = MAX_LAYERS;
  private lastState: RendererSync | null = null;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDpr = 0;
  /**
   * Interaction resolution. A frame that costs more than a vsync at the full
   * buffer — the exact envelope at a retina window is 60 to 140 ms — renders
   * at a reduced buffer while a hand is on something (a drag on the stage, a
   * slider, a wheel burst, a playing animator) and full size once it lets go.
   * The envelope is an average over the carrier's period, so its picture
   * holds no carrier-scale detail and survives the downsample; the plain
   * render is under a vsync at 15 Mpx and never triggers it.
   *
   * The stream starts from what this machine actually paid: `fullCost` is
   * the queue time of the last isolated full-size frame (an idle GPU
   * measures cold, so the start is a notch pessimistic). Inside the stream
   * the verdict is the one thing the viewer sees: the animation-frame
   * cadence, read by a metronome that runs for the stream's duration.
   * Chrome throttles animation frames under GPU back-pressure and not
   * otherwise, and a continuous metronome is independent of how often the
   * hand moves. A window whose mean interval overran drops the buffer
   * straight to the notch that fits (cost goes with the square of the
   * scale) and locks it there for the stream; two clean windows step it up
   * a notch. A change of buffer is free (the swapchain reconfigures in
   * under a frame), but the frames right after one are still draining the
   * old work, so they do not vote. Where a stream ended is remembered,
   * along with the notch that overran, keyed by what sets the cost's class
   * (the view, the layer count, the buffer size — the cold measurement is
   * too noisy to key on), and the next stream under the same key starts
   * there and never probes that notch again, so a second drag is right from
   * its first frame. Nothing is a stream in the first second after a mount
   * or a shader rebuild: the app's own startup burst and warm-up jank are
   * not a hand, and once poisoned the memory with "full size overruns".
   *
   * Not used, because each follows the frame rate rather than revealing it:
   * per-frame queue completion times (Chrome observes completions once per
   * frame, so every frame reads as one vsync at any scale) and the wait
   * between a frame's request and its callback (pointer events are
   * dispatched frame-aligned).
   */
  private scale = 1;
  /** The pooling gate's zoom-free part, and the finest visible pitch (world units). */
  private poolable = false;
  private poolFinest = Infinity;
  private poolStroke = Infinity;
  private poolK = 0;
  /** The pair table (see buildTableColorNode): a render target the exact envelope reads. */
  private tableRT: THREE.RenderTarget | null = null;
  private tableScene: THREE.Scene | null = null;
  private fullCost = 0;
  private lastRequest = 0;
  private settleTimer = 0;
  private metroRaf = 0;
  private lastTick = 0;
  private held = false;
  private inStream = false;
  private locked = false;
  private lockedScale = 0;
  private failedScale = 0;
  private costKey = '';
  private memoryKey = '';
  private readyAt = 0;
  private framesAtScale = 0;
  private drainUntil = 0;
  private intervals: number[] = [];
  private goodWindows = 0;
  private steppedFrom = 0;

  canvas: HTMLCanvasElement | null = null;

  async mount(container: HTMLElement, layerCount = MAX_LAYERS): Promise<void> {
    this.disposed = false;
    this.container = container;
    // Compiled for the stack the app opens with, so the first material is
    // already the right size and startup pays for no rebuild.
    this.slotCount = Math.min(Math.max(layerCount, 1), MAX_LAYERS);

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
    this.readyAt = performance.now();
    this.resize();
    if (this.scene && this.camera) {
      try {
        await this.renderer.compileAsync(this.scene, this.camera);
        this.draw();
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

    // The pair table: 512 samples of the tent per character row, half floats,
    // wrapping along the count so the window's taps wrap with it.
    const rt = new THREE.RenderTarget(TABLE_N, TABLE_ROWS, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.colorSpace = THREE.NoColorSpace;
    this.tableRT = rt;
    const tableMaterial = new MeshBasicNodeMaterial();
    tableMaterial.colorNode = buildTableColorNode(this.cameraUniforms, this.viewUniforms, this.slots.slice(0, 2));
    tableMaterial.side = THREE.DoubleSide;
    tableMaterial.toneMapped = false;
    const tableMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), tableMaterial);
    tableMesh.frustumCulled = false;
    this.tableScene = new THREE.Scene();
    this.tableScene.add(tableMesh);

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
      this.slots.slice(0, this.slotCount),
      this.fieldSources.slice(0, this.slotCount).map((source) => this.programFor(source)),
      this.tableRT?.texture ?? null
    );
    material.side = THREE.DoubleSide;
    material.toneMapped = false;
    return material;
  }

  /** A slot's field program: the decoded image, the compiled expression, or nothing. */
  private programFor(source: string) {
    if (!source) return null;
    if (source.startsWith('image:')) return this.imageFields.get(source) ?? null;
    return compileFieldCached(source);
  }

  /**
   * Image fields decode before the material that samples them is built, and a
   * texture no slot wants any more is released. Keyed by `fieldSource`, so the
   * same image on two layers decodes once.
   */
  private async loadImageFields(state: RendererSync, wanted: string[]) {
    const loads: Promise<void>[] = [];
    wanted.forEach((source, i) => {
      if (!source.startsWith('image:') || this.imageFields.has(source)) return;
      const data = state.layers[i]?.field.image;
      if (!data) return;
      loads.push(
        loadImageField(data)
          .then((field) => {
            this.imageFields.set(source, field);
          })
          .catch(() => undefined)
      );
    });
    await Promise.all(loads);
    for (const [key, field] of this.imageFields) {
      if (!wanted.includes(key)) {
        field.texture.dispose();
        this.imageFields.delete(key);
      }
    }
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
    const fieldsSettled = this.fieldSources.every(
      (source, i) => source === fieldSource(state.layers[i]?.field)
    );
    const slotsSettled = this.slotCount === slotsNeeded(state.layers);
    for (const field of this.imageFields.values()) field.texture.dispose();
    this.imageFields.clear();
    if (this.fieldTimer) clearTimeout(this.fieldTimer);
    if (fieldsSettled && slotsSettled) {
      this.fieldTimer = 0;
      return;
    }
    // An expression waits to stand still, because it is being typed. A layer
    // count is a click and has already stopped, so it rebuilds on the next
    // frame — waiting out the field delay would leave a new layer invisible
    // for a quarter second.
    this.fieldTimer = window.setTimeout(
      () => {
        this.fieldTimer = 0;
        void this.rebuildFields();
      },
      fieldsSettled ? 0 : FIELD_SETTLE_MS
    );
  }

  private async rebuildFields() {
    const state = this.lastState;
    if (!this.ready || !this.renderer || !this.scene || !this.camera || !this.mesh || !state) return;
    const wanted = this.slots.map((_, i) => fieldSource(state.layers[i]?.field));
    const wantedSlots = slotsNeeded(state.layers);
    if (
      wantedSlots === this.slotCount &&
      wanted.every((source, i) => source === this.fieldSources[i])
    ) {
      return;
    }

    this.fieldSources = wanted;
    this.slotCount = wantedSlots;
    await this.loadImageFields(state, wanted);
    if (this.disposed) return;
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
      this.readyAt = performance.now();
    }
    if (this.disposed) return;
    const t0 = performance.now();
    this.draw();
    if (this.scale === 1) void this.measure(t0);
    previous?.dispose();
    // Nothing syncs while a build is in flight, so an edit made during one is only
    // noticed here.
    this.watchFields();
  }

  /**
   * Resolves when no field rebuild is scheduled or in flight, flushing a
   * scheduled one immediately rather than waiting out the settle delay. A
   * capture taken after this sees the expressions as written — the zoo harness
   * loads a scene and settles instead of guessing at the debounce.
   */
  async settle(): Promise<void> {
    if (this.fieldTimer) {
      clearTimeout(this.fieldTimer);
      this.fieldTimer = 0;
      await this.rebuildFields();
    }
    await this.building;
  }

  /** The backend three actually initialised — goldens never compare across backends. */
  backendName(): 'webgpu' | 'webgl2' | 'unknown' {
    const backend = this.renderer?.backend as
      | { isWebGPUBackend?: boolean; isWebGLBackend?: boolean }
      | undefined;
    if (backend?.isWebGPUBackend) return 'webgpu';
    if (backend?.isWebGLBackend) return 'webgl2';
    return 'unknown';
  }

  private writeSlots() {
    const state = this.lastState;
    if (!this.cameraUniforms || !this.viewUniforms || !state) return;
    // Zoom is buffer pixels per world unit, so a reduced buffer scales it
    // with itself and the framing is identical by construction.
    this.cameraUniforms.zoom.value = state.camera.zoom * this.scale;
    this.cameraUniforms.scale.value = this.scale;
    this.cameraUniforms.pan.value.set(state.camera.pan.x, state.camera.pan.y);
    this.cameraUniforms.background.value.set(state.backgroundColor);
    this.renderer?.setClearColor(state.backgroundColor, 1);

    const rank = rankStack(state.layers);
    const scalarPair: [number, number] | null =
      rank.scalars.length >= 2 ? [rank.scalars[0], rank.scalars[1]] : null;
    // The ratio view engages whenever the measurement has characters to map:
    // two scalars, a scalar against a lattice, or a lattice pair — the eta
    // scan reads lattice ink families, so the map is not a scalar-only
    // instrument. With nothing to compare the flag stays down and the
    // ordinary composite shows through.
    const canMeasure =
      !!scalarPair ||
      (rank.scalars.length > 0 && rank.lattices.length > 0) ||
      rank.lattices.length >= 2;
    const ratioOn = state.view.ratio && canMeasure;
    const pair = ratioOn ? scalarPair : null;
    const envelope = state.view.envelope && !ratioOn;
    const contoursOn = state.view.envelopeContours;
    const wantsScan = envelope || contoursOn;
    // What sets a frame's cost class, for the interaction buffer's memory.
    this.costKey = `${envelope ? 1 : 0}${ratioOn ? 1 : 0}${contoursOn ? 1 : 0}${this.viewUniforms?.pool.value ? 1 : 0}${this.viewUniforms?.table.value ? 1 : 0}|${state.layers.length}|${this.lastWidth}x${this.lastHeight}@${this.lastDpr}`;
    // The regime mask and the orientation-aware sweep read the same ranked
    // pair the ratio view compares, so an enveloped stack keeps those uniforms
    // warm even with the ratio view off — falling back to the topmost scalar
    // alone: the lattice sweep orients itself against the ranked partner's
    // index gradient, and with no fallback that gradient is the zero vector
    // and the orientation choice degrades to noise. A == B costs nothing
    // else; eta collapses to zero, which only quiets the optional regime mask.
    const maskPair: [number, number] | null =
      wantsScan || ratioOn
        ? scalarPair ?? (rank.scalars.length ? [rank.scalars[0], rank.scalars[0]] : null)
        : null;
    // Twist mode, engaged only with no scalar visible: lattices then have no
    // partner gradient to orient against, so the topmost lattice becomes the
    // reference every other lattice matches its generators to, and the whole
    // stack rides the same (u, golden) schedule in lockstep. Only the
    // reference index reaches the shader; a third or fourth lattice matches
    // against it and joins the same lockstep.
    const latPair: [number, number] | null =
      wantsScan && rank.scalars.length === 0 && rank.lattices.length > 0
        ? [rank.lattices[0], rank.lattices[1] ?? -1]
        : null;
    // The lattice whose beat the contour overlay draws: the twist partner,
    // else the topmost lattice beating against the ranked scalar — a lattice
    // indexes members by a pair of integers, so its fringes live outside the
    // scalar ranking and must be resolved for the overlay separately.
    const latB = latPair ? latPair[1] : wantsScan && maskPair ? rank.lattices[0] ?? -1 : -1;
    this.viewUniforms.taps.value = envelope
      ? Math.max(2, Math.round(state.view.envelopeTaps))
      : 1;
    this.viewUniforms.sweep.value = envelope ? Math.max(0, state.view.envelopeSweep) : 0;
    this.viewUniforms.contrast.value = envelope ? state.view.envelopeContrast : 1;
    this.viewUniforms.lift.value = envelope ? state.view.envelopeLift : 0;
    this.viewUniforms.observer.value = envelope && state.view.envelopeSquare ? 1 : 0;
    this.viewUniforms.envMask.value = envelope && maskPair ? state.view.envelopeMask : 0;
    this.viewUniforms.contours.value = contoursOn && (pair || maskPair || latPair) ? 1 : 0;
    this.viewUniforms.contourW.value = Math.max(0.4, state.view.contourWidth);
    this.viewUniforms.contourBand.value = state.view.contourBands;
    this.viewUniforms.ratio.value = ratioOn ? 1 : 0;
    this.viewUniforms.ratioA.value = pair ? pair[0] : maskPair ? maskPair[0] : -1;
    // The A == B fallback exists for the envelope's sweep orientation; under
    // the ratio view a self-pair's beat is identically zero and would flood
    // the map with a false eta of 0, so a lone scalar keeps B empty there.
    this.viewUniforms.ratioB.value =
      pair ? pair[1] : maskPair ? (ratioOn ? -1 : maskPair[1]) : -1;
    // The third ranked scalar joins the character scan: with three layers the
    // dangerous mistake is deviating the top pair's rates for a beat that is
    // slower than one the second layer makes with the third.
    this.viewUniforms.ratioC.value =
      (pair || maskPair) && rank.scalars.length > 2 ? rank.scalars[2] : -1;
    this.viewUniforms.ratioBlend.value = state.view.ratioBlend;
    this.viewUniforms.ratioThreshold.value = state.view.ratioThreshold;
    this.viewUniforms.latA.value = latPair ? latPair[0] : -1;
    this.viewUniforms.latB.value = latB;
    // The eta measurement sees lattices in every measuring view — the ratio
    // map included, which the sweep-side latA/latB stay out of.
    const measuring = wantsScan || ratioOn;
    this.viewUniforms.scanLatA.value = measuring ? rank.lattices[0] ?? -1 : -1;
    this.viewUniforms.scanLatB.value = measuring ? rank.lattices[1] ?? -1 : -1;

    // A sole visible layer grades about its nominal coverage; see soloPivot.
    const visible = state.layers.filter((l) => l.visible);
    this.viewUniforms.soloPivot.value = envelope && visible.length === 1 ? 1 : 0;

    // The exact sweep: engaged whenever the envelope is on and every visible
    // layer carries a scalar index — a lattice (or a layer still morphing
    // out of one, read off the slot uniforms so a mid-flight class morph
    // cannot lie) keeps the tap loop, whose cell resample has no 1-D
    // segmentation. The Quality dial is a no-op while this is up: the
    // integral has no sample count.
    const latticeCode = (v: number) => (v >= 4.5 && v <= 7.5) || v > 13.5;
    const anyLattice = state.layers.some(
      (l, i) =>
        l.visible &&
        (isGrid(l.type) ||
          (i < this.slots.length && latticeCode(this.slots[i].typeFrom.value as number)))
    );
    // A morphing layer carries two trios; the exact chain carries one, so a
    // type ease (280 ms) rides the tap loop and the exact path resumes on
    // the next sync after it settles.
    this.viewUniforms.exactSweep.value = envelope && !anyLattice && !hasLayerMorphs() ? 1 : 0;
    // The pair table serves the exact envelope of two field-free scalar
    // families under a whole-number sweep (a walking family's trio is not
    // symmetric, and a partial sweep is not a function of the count alone).
    const scalarNow = state.layers.filter(
      (l) => l.visible && !isGrid(l.type) && !isRadialLines(l.type)
    );
    const sweepWhole =
      Math.abs(state.view.envelopeSweep - Math.round(state.view.envelopeSweep)) < 1e-3 &&
      state.view.envelopeSweep >= 1;
    // Only families whose trio is symmetric with a constant gap can be
    // tabulated: a geometric ring family or a wave has a pitch that varies
    // along the frame, and its tent with it.
    const TABLE_TYPES = new Set([
      'straight-lines',
      'concentric-circles',
      'concentric-squares',
      'concentric-triangles',
      'concentric-polygons',
      'curve-spiral',
    ]);
    const tableOn =
      this.viewUniforms.exactSweep.value === 1 &&
      scalarNow.length === 2 &&
      visible.length === 2 &&
      sweepWhole &&
      scalarNow.every((l) => TABLE_TYPES.has(l.type) && !l.field?.source && !l.field?.image);
    this.viewUniforms.table.value = tableOn ? 1 : 0;
    // The pixel as a pooling observer: the plain render pools where the
    // finest visible pitch drops under a few pixels a period. Scalar stacks
    // only, like the exact sweep it reuses; the envelope is already pooled.
    // The gate is coarse and cheap -- the shader's own weights decide, from
    // seven pixels a period down -- and it is asked of the BUFFER's pixels:
    // a smaller interaction buffer, or a small export, pools what it cannot
    // resolve, and the shader tells the two cases apart by the scale uniform.
    const scalar = state.layers.filter(
      (l) => l.visible && !isGrid(l.type) && !isRadialLines(l.type)
    );
    // At most four layers: the synthesis has (2M+1)^K terms.
    this.poolable =
      state.view.pool !== false && !envelope && !anyLattice && !hasLayerMorphs() && scalar.length <= 4;
    this.poolK = scalar.length;
    this.poolFinest = Math.min(...scalar.map((l) => Math.abs(l.spacing)), Infinity);
    this.poolStroke = Math.min(...scalar.map((l) => Math.abs(l.thickness) * 0.5), Infinity);
    this.viewUniforms.pool.value = this.poolGate(state.camera.zoom * this.scale, this.scale);
    if (visible.length === 1) {
      const pixel = 1 / Math.max(state.camera.zoom, 0.08);
      this.viewUniforms.pivotConst.value
        .set(state.backgroundColor)
        .lerp(new THREE.Color(visible[0].color), nominalCoverage(visible[0], pixel));
    }

    // Frame-wide deviation licences, one per ranked pair: which higher-order
    // character (if any) the pair's NOMINAL pitch ratio certifies as a global
    // rational lock. The per-pixel scan still measures every local station,
    // but only the licensed character may deviate the sweep's schedule —
    // deviation identity is a decision of the stack, never of the pixel.
    const iA = this.viewUniforms.ratioA.value as number;
    const iB = this.viewUniforms.ratioB.value as number;
    const iC = this.viewUniforms.ratioC.value as number;
    const thr = Math.max(state.view.ratioThreshold, 0.02);
    const lay = (i: number) => (i >= 0 ? state.layers[i] : undefined);
    const bDistinct = iB === iA ? undefined : lay(iB);
    this.viewUniforms.licAB.value.set(...pairLicense(lay(iA), bDistinct, thr));
    this.viewUniforms.licAC.value.set(...pairLicense(lay(iA), lay(iC), thr));
    this.viewUniforms.licBC.value.set(...pairLicense(bDistinct, lay(iC), thr));

    for (let i = 0; i < this.slots.length; i++) {
      writeLayerSlot(this.slots[i], state.layers[i]);
    }
  }

  private ensureMorphLoop() {
    if (this.morphRaf || !this.ready) return;
    const step = () => {
      this.writeSlots();
      if (this.ready && this.renderer && this.scene && this.camera) {
        this.draw();
      }
      this.morphRaf = hasLayerMorphs() ? requestAnimationFrame(step) : 0;
    };
    this.morphRaf = requestAnimationFrame(step);
  }

  render() {
    if (!this.ready || !this.renderer) return;
    const now = performance.now();
    // A held pointer, or requests inside the settle window of each other,
    // are a hand on something — once the pipeline is warm.
    const warm = now - this.readyAt > WARMUP_MS;
    const streaming = warm && (this.held || now - this.lastRequest < SETTLE_MS);
    this.lastRequest = now;
    if (streaming && !this.inStream) {
      this.inStream = true;
      if (this.costKey !== this.memoryKey) {
        this.memoryKey = this.costKey;
        this.lockedScale = 0;
        this.failedScale = 0;
      }
      // An exact envelope streams by the synthesis, not the chain whose cost
      // the rest frame measured: it starts full size and the pacing decides.
      const synthStream = this.viewUniforms?.exactSweep.value === 1 && this.poolK <= 4;
      const start =
        this.lockedScale > 0 ? this.lockedScale : synthStream ? 1 : interactionScale(this.fullCost);
      if (start < 1) this.setScale(start);
      if (this.viewUniforms) this.viewUniforms.stream.value = 1;
      this.startMetronome();
    } else if (!streaming) {
      this.inStream = false;
      if (this.viewUniforms) this.viewUniforms.stream.value = 0;
    }
    this.armSettle();
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.ready || !this.renderer || !this.scene || !this.camera) return;
      const t0 = performance.now();
      this.draw();
      if (!streaming && this.scale === 1) void this.measure(t0);
    });
  }

  /** The stream's metronome: one callback per animation frame while it lasts. */
  private startMetronome() {
    if (this.metroRaf) return;
    this.lastTick = 0;
    this.framesAtScale = 0;
    this.intervals = [];
    this.goodWindows = 0;
    this.steppedFrom = 0;
    const tick = (now: number) => {
      if (!this.inStream || this.disposed) {
        this.metroRaf = 0;
        return;
      }
      this.metroRaf = requestAnimationFrame(tick);
      if (this.lastTick) this.pace(now - this.lastTick);
      this.lastTick = now;
    };
    this.metroRaf = requestAnimationFrame(tick);
  }

  /** A hand is on the stage or a slider: no full-size frame until it lets go. */
  hold(held: boolean) {
    this.held = held;
    this.armSettle();
  }

  /** The stream ends SETTLE_MS after the last request, once nothing is held. */
  private armSettle() {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = 0;
    }
    if (this.inStream && !this.held) {
      this.settleTimer = window.setTimeout(() => this.restoreScale(), SETTLE_MS);
    }
  }

  /**
   * One frame interval joins the window; a full window is a verdict. The
   * verdict is the mean with the single worst interval left out: a GC pause
   * or a panel re-render is one long frame and not the buffer's fault, while
   * a buffer that overruns does it every frame.
   */
  private pace(interval: number) {
    if (++this.framesAtScale <= DRAIN_FRAMES || performance.now() < this.drainUntil) return;
    this.intervals.push(interval);
    const n = this.intervals.length;
    if (n < PACE_WINDOW / 2) return;
    const sum = this.intervals.reduce((a, b) => a + b, 0);
    const mean = (sum - Math.max(...this.intervals)) / (n - 1);
    // A clear overrun is answered at half a window; anything finer waits for one.
    const overran = mean > VSYNC_MS * 1.5;
    if (!overran && n < PACE_WINDOW) return;
    this.intervals = [];
    if (mean > VSYNC_MS * 1.1) {
      // Dropping frames: back to the notch this stream already held, else
      // straight to the notch that fits (a throttled cadence overstates the
      // cost, so the fit is only for a start that overran); and no larger
      // again this stream.
      const fit = this.scale * Math.sqrt(VSYNC_MS / mean);
      const next =
        this.steppedFrom ||
        INTERACTION_SCALES.find((s) => s <= fit) ||
        INTERACTION_SCALES[INTERACTION_SCALES.length - 1];
      this.steppedFrom = 0;
      this.locked = true;
      this.goodWindows = 0;
      // The smallest notch seen to fail: every notch above it fails too.
      this.failedScale = this.failedScale ? Math.min(this.failedScale, this.scale) : this.scale;
      if (next < this.scale) this.setScale(next);
      return;
    }
    if (!this.locked && ++this.goodWindows >= 2) {
      this.goodWindows = 0;
      const i = INTERACTION_SCALES.indexOf(this.scale);
      if (i > 0 && (!this.failedScale || INTERACTION_SCALES[i - 1] < this.failedScale)) {
        this.steppedFrom = this.scale;
        this.setScale(INTERACTION_SCALES[i - 1]);
      }
    }
  }

  /** What the last full-size frame cost and the buffer scale in use, for the dev bridge. */
  frameCost(): { fullCost: number; scale: number; pacing: string } {
    return {
      fullCost: this.fullCost,
      scale: this.scale,
      pacing: `stream=${this.inStream ? 1 : 0} locked=${this.locked ? 1 : 0} remembered=${this.lockedScale} failed=${this.failedScale} key=${this.memoryKey} good=${this.goodWindows} n=${this.intervals.length} metro=${this.metroRaf ? 1 : 0}`,
    };
  }

  /**
   * Whether a buffer at this zoom (world units to its pixels), drawn at this
   * fraction of the rest size, pools at all: a fine period, or a stroke whose
   * rest floor (1.15 rest pixels) the buffer's pixels cannot resolve.
   */
  private poolGate(zoom: number, scale: number): number {
    if (!this.poolable) return 0;
    // One or two families draw through the window integral at every zoom.
    if (this.poolK <= 2) return 1;
    const halfStroke = Math.max(this.poolStroke, (1.15 * scale) / Math.max(zoom, 1e-6));
    return this.poolFinest * zoom < POOL_PX || halfStroke * zoom < POOL_STROKE_PX ? 1 : 0;
  }

  /** One frame: the pair table when the exact envelope reads it, then the picture. */
  private draw() {
    if (!this.renderer || !this.scene || !this.camera) return;
    if (this.viewUniforms?.table.value === 1 && this.tableRT && this.tableScene) {
      this.renderer.setRenderTarget(this.tableRT);
      this.renderer.render(this.tableScene, this.camera);
      this.renderer.setRenderTarget(null);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** The buffer at a fraction of the full size, framing unchanged. */
  private setScale(scale: number) {
    if (!this.renderer || scale === this.scale) return;
    this.scale = scale;
    this.framesAtScale = 0;
    this.drainUntil = performance.now() + DRAIN_MS;
    this.intervals = [];
    this.renderer.setPixelRatio((this.lastDpr || 1) * scale);
    this.renderer.setSize(Math.max(1, this.lastWidth), Math.max(1, this.lastHeight), false);
    this.writeSlots();
  }

  /** The stream has stopped: back to the full buffer, and one frame of it. */
  private restoreScale() {
    this.settleTimer = 0;
    if (this.held) return;
    // Where the stream ended is where the next one under this key starts.
    this.lockedScale = this.scale;
    this.locked = false;
    this.inStream = false;
    const wasStream = this.viewUniforms?.stream.value === 1;
    if (this.viewUniforms) this.viewUniforms.stream.value = 0;
    if (this.scale === 1 && !wasStream) return;
    if (this.scale !== 1) this.setScale(1);
    this.render();
  }

  /** An isolated full-size frame's cost, from submit to the queue's completion. */
  private async measure(t0: number) {
    const backend = this.renderer?.backend as
      | { device?: { queue?: { onSubmittedWorkDone?: () => Promise<undefined> } } }
      | undefined;
    const queue = backend?.device?.queue;
    if (!queue?.onSubmittedWorkDone) return;
    try {
      await queue.onSubmittedWorkDone();
      if (!this.disposed) this.fullCost = performance.now() - t0;
    } catch {
      // A lost device; the loss hook remounts.
    }
  }

  /**
   * The export frame for a scale and target aspect (width/height; 0 keeps the
   * canvas's own). The rule is cover, never crop: the export always contains at
   * least the current view, and a different aspect extends it — the pattern is
   * defined everywhere, so there is always more picture past the frame. zScale
   * multiplies the zoom uniform so the framing is identical by construction:
   * world extent is buffer over zoom, and both scale together.
   */
  private exportFrame(opts: { scale?: number; aspect?: number; height?: number } = {}) {
    const scale = Math.max(opts.scale ?? 1, 0.05);
    const bufW = Math.max(1, Math.round(this.lastWidth * (this.lastDpr || 1)));
    const bufH = Math.max(1, Math.round(this.lastHeight * (this.lastDpr || 1)));
    const aspect = opts.aspect || bufW / bufH;
    const coverByWidth = aspect <= bufW / bufH;
    // A stated height wins over a multiplier. A still is sized relative to the
    // window because that is how a picture for print is asked for; a recording is
    // sized absolutely, because 1080p means 1080p and an encoder has opinions
    // about what it will accept.
    let width = opts.height ? opts.height * aspect : coverByWidth ? bufW * scale : bufH * scale * aspect;
    let height = width / aspect;
    const cap = 8192 / Math.max(width, height);
    if (cap < 1) {
      width *= cap;
      height *= cap;
    }
    // Even in both directions: every video encoder in use requires it, and a
    // still loses nothing by it.
    width = Math.max(2, Math.round(width / 2) * 2);
    height = Math.max(2, Math.round(height / 2) * 2);
    const zScale = coverByWidth ? width / bufW : height / bufH;
    return { width, height, zScale };
  }

  /** The pixel size `snapshot` would render for these options, without rendering. */
  snapshotSize(opts: { scale?: number; aspect?: number; height?: number } = {}): { width: number; height: number } {
    const { width, height } = this.exportFrame(opts);
    return { width, height };
  }

  async snapshot(
    opts: { scale?: number; aspect?: number; height?: number; interactionScale?: number } = {}
  ): Promise<Blob> {
    return this.snapshotWith(opts, (canvas) => encodeCanvasPng(canvas));
  }

  /**
   * One render at an explicit size, with the canvas held at that size until the
   * callback returns. A recording wants the pixels rather than a PNG of them --
   * encoding every frame to PNG only to decode it again for the encoder would
   * double the work and lose nothing but time -- and the canvas is restored the
   * moment the callback is done with it either way.
   */
  async snapshotWith<T>(
    opts: { scale?: number; aspect?: number; height?: number; interactionScale?: number } = {},
    read: (canvas: HTMLCanvasElement) => Promise<T> | T
  ): Promise<T> {
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
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = 0;
    }
    this.setScale(1);
    // One render at an explicit framebuffer size, with the zoom uniform scaled
    // to match — the pattern is resolution-free, so the pixels are simply asked
    // again, and the stroke floor keeps hairlines printable at any size.
    const { width, height, zScale } = this.exportFrame(opts);
    const zoom0 = this.cameraUniforms.zoom.value;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.cameraUniforms.zoom.value = zoom0 * zScale;
      if (this.viewUniforms) {
        this.viewUniforms.pool.value = this.poolGate(zoom0 * zScale, opts.interactionScale ?? 1);
      }
      // A harness may ask for the frame as the interaction ladder would draw
      // it: the export is already at the reduced size (its zoom scaled), and
      // this tells the shader how much smaller than rest that is, so the
      // hairline floor, the integral ramps and the pooling weight stay at
      // rest exactly as they do while a hand is on the zoom.
      this.cameraUniforms.scale.value = opts.interactionScale ?? 1;
      // A stated interaction scale asks for the frame as a stream draws it.
      if (this.viewUniforms) this.viewUniforms.stream.value = opts.interactionScale !== undefined ? 1 : 0;
      this.draw();
      return await read(this.canvas);
    } finally {
      this.cameraUniforms.scale.value = this.scale;
      if (this.viewUniforms) this.viewUniforms.stream.value = 0;
      this.cameraUniforms.zoom.value = zoom0;
      if (this.viewUniforms) this.viewUniforms.pool.value = this.poolGate(zoom0, this.scale);
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
    this.renderer.setPixelRatio(dpr * this.scale);
    this.renderer.setSize(width, height, false);
    if (this.ready) this.render();
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.morphRaf) cancelAnimationFrame(this.morphRaf);
    if (this.fieldTimer) clearTimeout(this.fieldTimer);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.metroRaf) cancelAnimationFrame(this.metroRaf);
    this.metroRaf = 0;
    this.raf = 0;
    this.morphRaf = 0;
    this.fieldTimer = 0;
    this.settleTimer = 0;
    this.scale = 1;
    this.fullCost = 0;
    this.held = false;
    this.inStream = false;
    this.locked = false;
    this.lockedScale = 0;
    this.failedScale = 0;
    this.memoryKey = '';
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
