import { NoToneMapping, SRGBColorSpace, WebGPURenderer } from 'three/webgpu';
import { createBenchmarkScene, METHODS } from './scene';
import type { CameraMotion, Homography, Kernel, Method } from './scene';
import { createTemporalBaseline } from './temporal';
import type { TemporalBaseline } from './temporal';
import { createGpuTiming } from './timing';
import type { GpuTiming } from './timing';

export interface ComparisonInfo {
  ready: boolean; backend: string; width: number; height: number; time: number;
  frame: number; playing: boolean; fps: number; motion: CameraMotion; detail: number;
  methods: Method[]; gpuMs: Record<Method, number | null>; historyFrames: number;
  homography: Homography | null;
  kernel: Kernel;
}
type Panel = { renderer: WebGPURenderer; content: ReturnType<typeof createBenchmarkScene>; temporal?: TemporalBaseline; timing: GpuTiming };
// Three's initialized WebGPU backend owns a standard GPUDevice. The bundled
// Three typings omit this runtime property; keep this narrow bridge in one place.
type DeviceBackend = { isWebGPUBackend?: boolean; device?: { queue: { onSubmittedWorkDone(): Promise<void> } } };

export class ComparisonRenderer {
  private canvases: Record<Method, HTMLCanvasElement>;
  private publish: (state: ComparisonInfo) => void;
  private panels = new Map<Method, Panel>();
  private loop = 0;
  private disposed = false;
  private previous = 0;
  private meterStart = 0;
  private meterFrames = 0;
  private lastPublish = 0;
  private preparing = true;
  private state: ComparisonInfo = {
    ready: false, backend: 'WebGPU', width: 480, height: 640, time: 0,
    frame: 0, playing: true, fps: 0, motion: 'glide', detail: 1,
    methods: METHODS, gpuMs: { raw: null, temporal: null, spectral: null }, historyFrames: 0,
    homography: null, kernel: 'projective',
  };
  constructor(canvases: Record<Method, HTMLCanvasElement>, publish: (state: ComparisonInfo) => void) {
    this.canvases = canvases; this.publish = publish;
  }

  async init() {
    if (!('gpu' in navigator)) throw new Error('This comparison needs a browser with WebGPU. Open it in Chrome or Edge.');
    for (const method of METHODS) {
      const renderer = new WebGPURenderer({ canvas: this.canvases[method], antialias: false, trackTimestamp: true });
      renderer.setPixelRatio(1);
      renderer.setSize(this.state.width, this.state.height, false);
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = NoToneMapping;
      await renderer.init();
      if (this.disposed) { renderer.dispose(); return; }
      if (!(renderer.backend as DeviceBackend).isWebGPUBackend) {
        renderer.dispose(); throw new Error('The comparison requires WebGPU; this browser selected a different renderer.');
      }
      const content = createBenchmarkScene(method);
      content.update(0, this.state.motion, this.state.width, this.state.height, this.state.detail);
      const panel: Panel = { renderer, content, timing: createGpuTiming(renderer) };
      if (method === 'temporal') panel.temporal = createTemporalBaseline(renderer, content.scene, content.camera);
      this.panels.set(method, panel);
      await renderer.compileAsync(content.scene, content.camera);
    }
    if (this.disposed) return;
    this.state.ready = true;
    this.resize();
    // Allow the temporal pipeline's first targets and history to become ready.
    for (let i = 0; i < 3; i++) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (this.disposed) return;
      this.draw(); await this.complete();
    }
    this.preparing = false;
    this.publish(this.info());
    this.loop = requestAnimationFrame(this.tick);
  }

  info = (): ComparisonInfo => ({ ...this.state, ready: this.state.ready && !this.preparing, gpuMs: { ...this.state.gpuMs }, historyFrames: this.panels.get('temporal')?.temporal?.framesSinceReset ?? 0 });

  private complete = () => Promise.all([...this.panels.values()].map(({ renderer }) =>
    (renderer.backend as DeviceBackend).device?.queue.onSubmittedWorkDone()));

  private tick = async (now: number) => {
    if (this.disposed || this.preparing) return;
    const dt = this.previous ? Math.max((now - this.previous) / 1000, 0) : 0;
    this.previous = now;
    if (dt > 0.25) this.resetTaa();
    if (this.state.playing) this.state.time += dt;
    // Keep rendering while paused: temporal history must be allowed to converge.
    this.draw();
    // Count completed batches, not an animation loop feeding a growing GPU queue.
    await this.complete();
    if (this.disposed || this.preparing) return;
    this.meterFrames++;
    if (!this.meterStart) this.meterStart = now;
    if (now - this.meterStart >= 700) {
      this.state.fps = this.meterFrames * 1000 / (now - this.meterStart);
      this.meterFrames = 0; this.meterStart = now;
    }
    if (now - this.lastPublish > 300) { this.publish(this.info()); this.lastPublish = now; }
    this.loop = requestAnimationFrame(this.tick);
  };

  draw = () => {
    if (!this.state.ready || this.disposed) return;
    for (const method of METHODS) {
      const panel = this.panels.get(method)!;
      const { content, renderer, temporal } = panel;
      const h = content.update(this.state.time, this.state.motion, this.state.width, this.state.height, this.state.detail);
      if (method === 'raw') this.state.homography = h;
      if (temporal) temporal.render(); else renderer.render(content.scene, content.camera);
      panel.timing.sample();
      this.state.gpuMs[method] = panel.timing.snapshot().medianMs;
    }
    this.state.frame++;
  };

  resize = (width?: number, height?: number) => {
    const box = this.canvases.raw.getBoundingClientRect();
    const w = Math.max(64, Math.round(width ?? box.width));
    const h = Math.max(64, Math.round(height ?? box.height));
    if (w === this.state.width && h === this.state.height) return;
    this.state.width = w; this.state.height = h;
    for (const { renderer, temporal, timing } of this.panels.values()) {
      renderer.setSize(w, h, false); temporal?.reset(); timing.reset();
    }
    this.state.gpuMs = { raw: null, temporal: null, spectral: null };
    this.publish(this.info());
  };

  play = (playing: boolean) => { this.state.playing = playing; this.publish(this.info()); };
  setTime = (seconds: number) => {
    this.state.time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    for (const { timing } of this.panels.values()) timing.reset();
    this.resetTaa(); this.draw(); this.publish(this.info());
  };
  setMotion = (motion: CameraMotion) => { this.state.motion = motion; this.setTime(0); };
  setDetail = (detail: number) => {
    this.state.detail = Math.max(0.5, Math.min(4, detail));
    for (const { timing } of this.panels.values()) timing.reset();
    this.resetTaa(); this.draw();
  };
  setKernel = async (kernel: Kernel) => {
    if (kernel !== 'projective' && kernel !== 'lattice' && kernel !== 'homography') throw new Error('Unknown integration kernel.');
    if (kernel === this.state.kernel || !this.info().ready) return;
    this.preparing = true;
    cancelAnimationFrame(this.loop);
    this.publish(this.info());
    const panel = this.panels.get('spectral')!;
    const next = createBenchmarkScene('spectral', kernel);
    let installed = false;
    try {
      await this.complete();
      if (this.disposed) return;
      next.update(this.state.time, this.state.motion, this.state.width, this.state.height, this.state.detail);
      await panel.renderer.compileAsync(next.scene, next.camera);
      if (this.disposed) return;
      const old = panel.content;
      panel.content = next;
      installed = true;
      old.dispose();
      this.state.kernel = kernel;
      panel.timing.reset();
      this.state.gpuMs.spectral = null;
      this.draw();
      await this.complete();
    } finally {
      if (!installed) next.dispose();
      if (!this.disposed) {
        this.preparing = false;
        this.previous = 0;
        this.meterStart = 0; this.meterFrames = 0; this.state.fps = 0;
        this.publish(this.info());
        this.loop = requestAnimationFrame(this.tick);
      }
    }
  };
  resetTaa = () => this.panels.get('temporal')?.temporal?.reset();
  pause = () => this.play(false);
  step = (frames = 1) => { this.pause(); for (let i = 0; i < Math.min(frames, 256); i++) this.draw(); return this.info(); };
  pixels = (method: Method) => {
    this.draw();
    const copy = document.createElement('canvas');
    copy.width = this.state.width; copy.height = this.state.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(this.canvases[method], 0, 0);
    return { width: copy.width, height: copy.height, data: Array.from(ctx.getImageData(0, 0, copy.width, copy.height).data) };
  };
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.loop);
    const panels = [...this.panels.values()];
    // A hot reload may leave an asynchronous timestamp readback in flight.
    void Promise.all(panels.map(async ({ renderer, timing }) => {
      timing.dispose();
      if (renderer.hasFeature('timestamp-query')) await renderer.resolveTimestampsAsync('render');
      await (renderer.backend as DeviceBackend).device?.queue.onSubmittedWorkDone();
    })).finally(() => {
      for (const { content, renderer, temporal } of panels) { temporal?.dispose(); content.dispose(); renderer.dispose(); }
      this.panels.clear();
    });
  }
}

declare global { interface Window { __compare?: ComparisonRenderer } }
