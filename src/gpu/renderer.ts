import * as THREE from 'three/webgpu';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { MAX_LAYERS, type PatternLayer } from '../types/moire';
import {
  buildColorNode,
  createCameraUniforms,
  createSlots,
  writeLayerSlot,
  type CameraUniforms,
  type LayerSlot,
} from './composite';
import { clearLayerMorphs, hasLayerMorphs } from './typeMorph';

export interface RendererSync {
  layers: PatternLayer[];
  camera: { zoom: number; pan: { x: number; y: number } };
  backgroundColor: string;
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
  private ready = false;
  private disposed = false;
  private lossHooked = false;
  private raf = 0;
  private morphRaf = 0;
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
    this.slots = createSlots(MAX_LAYERS);

    const material = new MeshBasicNodeMaterial();
    material.colorNode = buildColorNode(this.cameraUniforms, this.slots);
    material.side = THREE.DoubleSide;
    material.toneMapped = false;
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

  sync(state: RendererSync) {
    this.lastState = state;
    this.writeSlots();
    if (hasLayerMorphs()) this.ensureMorphLoop();
  }

  private writeSlots() {
    const state = this.lastState;
    if (!this.cameraUniforms || !state) return;
    this.cameraUniforms.zoom.value = state.camera.zoom;
    this.cameraUniforms.pan.value.set(state.camera.pan.x, state.camera.pan.y);
    this.cameraUniforms.background.value.set(state.backgroundColor);
    this.renderer?.setClearColor(state.backgroundColor, 1);

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

  async snapshot(): Promise<Blob> {
    if (!this.ready || !this.renderer || !this.scene || !this.camera || !this.canvas) {
      throw new Error('Renderer is not ready');
    }
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.renderer.render(this.scene, this.camera);
    return encodeCanvasPng(this.canvas);
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
    this.raf = 0;
    this.morphRaf = 0;
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
    this.lossHooked = false;
  }
}
