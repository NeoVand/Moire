import { useEffect, useRef, useState } from 'react';
import { MoireMark } from './ui/MoireMark';
import { registerCapture } from '../gpu/capture';
import { MoireRenderer } from '../gpu/renderer';
import {
  clientToWorld,
  clampZoom,
  panForZoomToCursor,
  screenDeltaToWorld,
  worldDeltaToLayerPosition,
} from '../gpu/camera';
import { useProjectStore } from '../store/project';

type DragMode = 'move' | 'rotate' | 'pan';

interface DragState {
  mode: DragMode;
  lastX: number;
  lastY: number;
  lastAngle: number;
}

/**
 * Shift slows any canvas gesture to 12% — the same fine-adjust the sliders
 * have, so precision is one held key everywhere. Deltas are applied
 * incrementally, which is what lets the factor engage mid-drag.
 */
const FINE = 0.12;

export function MoireStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gpuRef = useRef<MoireRenderer | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const spaceRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [cursor, setCursor] = useState('default');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const gpu = new MoireRenderer();
    gpuRef.current = gpu;

    void gpu
      .mount(container)
      .then(() => {
        if (cancelled) {
          gpu.dispose();
          return;
        }
        const state = useProjectStore.getState();
        gpu.sync(state);
        gpu.render();
        registerCapture(
          (opts) => gpu.snapshot(opts),
          (opts) => gpu.snapshotSize(opts),
          {
            settle: () => gpu.settle(),
            info: () => ({ backend: gpu.backendName() }),
          }
        );
        setReady(true);
        useProjectStore.getState().playIntro();
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(err);
        setError(
          message.includes('WebGPU') || message.includes('gpu')
            ? 'WebGPU is not available in this browser.'
            : `Could not start the renderer: ${message}`
        );
      });

    const unsub = useProjectStore.subscribe((state) => {
      gpu.sync(state);
      gpu.render();
    });

    return () => {
      cancelled = true;
      useProjectStore.getState().cancelIntro();
      unsub();
      registerCapture(null);
      gpu.dispose();
      gpuRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        spaceRef.current = true;
        setCursor('grab');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        if (!dragRef.current) setCursor('default');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { camera, setCamera } = useProjectStore.getState();
      const rect = container.getBoundingClientRect();
      const world = clientToWorld(e.clientX, e.clientY, rect, camera.zoom, camera.pan);
      const nextZoom = clampZoom(camera.zoom * Math.exp(-e.deltaY * 0.001));
      setCamera({
        zoom: nextZoom,
        pan: panForZoomToCursor(world, e.clientX, e.clientY, rect, nextZoom),
      });
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const { camera, selectedLayerId, layers } = useProjectStore.getState();
    const layer = layers.find((item) => item.id === selectedLayerId);
    const rect = container.getBoundingClientRect();
    const world = clientToWorld(e.clientX, e.clientY, rect, camera.zoom, camera.pan);

    const pan = e.button === 1 || spaceRef.current;
    const rotate = !pan && e.altKey && !!layer;
    const mode: DragMode = pan ? 'pan' : rotate ? 'rotate' : 'move';

    dragRef.current = {
      mode,
      lastX: e.clientX,
      lastY: e.clientY,
      lastAngle: Math.atan2(world.y, world.x),
    };
    setCursor(mode === 'pan' ? 'grabbing' : mode === 'rotate' ? 'crosshair' : 'move');
    container.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      if (e.altKey) setCursor('crosshair');
      else if (spaceRef.current) setCursor('grab');
      else setCursor('default');
      return;
    }

    const store = useProjectStore.getState();
    const zoom = store.camera.zoom;

    if (drag.mode === 'pan') {
      const delta = screenDeltaToWorld(e.clientX - drag.lastX, e.clientY - drag.lastY, zoom);
      store.setPan({
        x: store.camera.pan.x - delta.x,
        y: store.camera.pan.y - delta.y,
      });
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }

    const layer = store.layers.find((item) => item.id === store.selectedLayerId);
    if (!layer) return;

    const fine = e.shiftKey ? FINE : 1;

    if (drag.mode === 'move') {
      const delta = worldDeltaToLayerPosition(
        screenDeltaToWorld(e.clientX - drag.lastX, e.clientY - drag.lastY, zoom),
        layer.rotation
      );
      store.updateLayer(layer.id, {
        position: {
          x: layer.position.x + delta.x * fine,
          y: layer.position.y + delta.y * fine,
        },
      });
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }

    const container = containerRef.current;
    if (!container) return;
    const world = clientToWorld(
      e.clientX,
      e.clientY,
      container.getBoundingClientRect(),
      zoom,
      store.camera.pan
    );
    const angle = Math.atan2(world.y, world.x);
    let degrees = ((angle - drag.lastAngle) * 180) / Math.PI;
    if (degrees > 180) degrees -= 360;
    if (degrees < -180) degrees += 360;
    drag.lastAngle = angle;
    const turned = layer.rotation + degrees * fine;
    store.updateLayer(layer.id, { rotation: ((((turned + 180) % 360) + 360) % 360) - 180 });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    setCursor(spaceRef.current ? 'grab' : 'default');
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-primary)] px-6 text-center text-sm text-[var(--text-secondary)]">
          {error}
        </div>
      )}
      {!error && !ready && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <MoireMark size={18} />
            <span className="text-[13px]">Compiling</span>
          </div>
        </div>
      )}
    </div>
  );
}
