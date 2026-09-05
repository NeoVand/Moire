import { useEffect, useRef, useState } from 'react';
import { ComparisonRenderer } from './renderer';
import type { ComparisonInfo } from './renderer';
import { METHODS } from './scene';
import type { CameraMotion, Kernel, Method } from './scene';
import { PERIOD } from './scene';
import { referencePixel, srgbToLinear } from './reference';

type Inspection = {
  x: number; y: number;
  reference: ReturnType<typeof referencePixel>;
  pixels: Record<Method, number[]>;
};

const labels: Record<Method, { title: string; subtitle: string }> = {
  raw: { title: 'No anti-aliasing', subtitle: 'One shade per pixel' },
  temporal: { title: 'Temporal AA', subtitle: 'Three.js TRAA · mipmaps · 16× anisotropy' },
  spectral: { title: 'Our method', subtitle: 'Spectral integration · checkerboard specialization' },
};

export function Comparison() {
  const canvas = useRef<Partial<Record<Method, HTMLCanvasElement>>>({});
  const engine = useRef<ComparisonRenderer>();
  const [info, setInfo] = useState<ComparisonInfo>();
  const [error, setError] = useState('');
  const [details, setDetails] = useState(false);
  const [inspection, setInspection] = useState<Inspection>();
  useEffect(() => {
    const app = new ComparisonRenderer(canvas.current as Record<Method, HTMLCanvasElement>, setInfo);
    engine.current = app; window.__compare = app;
    const observer = new ResizeObserver(() => { app.resize(); setInspection(undefined); });
    observer.observe(canvas.current.raw!);
    void app.init().catch(e => setError(e instanceof Error ? e.message : String(e)));
    return () => { observer.disconnect(); app.dispose(); delete window.__compare; };
  }, []);

  function inspect(event: React.MouseEvent<HTMLCanvasElement>) {
    const app = engine.current;
    if (!app?.info().ready) return;
    app.pause();
    const state = app.info();
    if (!state.homography) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(state.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) * state.width / rect.width)));
    const y = Math.min(state.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) * state.height / rect.height)));
    const pixels = {} as Record<Method, number[]>;
    app.draw();
    for (const method of METHODS) {
      const copy = document.createElement('canvas'); copy.width = copy.height = 1;
      const ctx = copy.getContext('2d')!;
      ctx.drawImage(canvas.current[method]!, x, y, 1, 1, 0, 0, 1, 1);
      pixels[method] = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    }
    const reference = referencePixel(state.homography, x + 0.5, y + 0.5, { period: PERIOD / state.detail });
    setInspection({ x, y, reference, pixels });
  }

  return <main className="comparison">
    <header className="compare-header">
      <a className="compare-brand" href="./" aria-label="Back to Moiré"><img src={`${import.meta.env.BASE_URL}moire-favicon.svg`} alt="" /><span>Moiré</span></a>
      <span className="compare-divider" />
      <h1>Live comparison</h1>
      <div className="compare-controls">
        <select aria-label="Camera motion" value={info?.motion ?? 'glide'} onChange={e => { setInspection(undefined); engine.current?.setMotion(e.target.value as CameraMotion); }}>
          <option value="glide">Camera glide</option><option value="approach">Approach & retreat</option><option value="still">Fixed camera</option>
        </select>
        <select aria-label="Pattern density" defaultValue="1" onChange={e => { setInspection(undefined); engine.current?.setDetail(Number(e.target.value)); }}>
          <option value="0.5">Large checks</option><option value="1">Medium checks</option><option value="2">Fine checks</option><option value="4">Very fine checks</option>
        </select>
        <button disabled={!info?.ready} className="compare-play" onClick={() => { setInspection(undefined); engine.current?.play(!info?.playing); }}>{info?.playing ? 'Pause' : 'Play'}</button>
        <button disabled={!info?.ready} onClick={() => { setInspection(undefined); engine.current?.setTime(0); }} title="Return all views to the same starting pose">Reset</button>
      </div>
    </header>
    <section className="compare-panels" aria-label="Synchronized rendering comparison">
      {METHODS.map(method => <article className={`compare-panel compare-${method}`} key={method}>
        <div className="compare-panel-title"><h2>{labels[method].title}</h2><span className="compare-timing" title="Median sum of GPU pass durations. Pass intervals can overlap, so this is not elapsed frame time. Includes temporal rendering passes; excludes copies, uploads and presentation."><small>GPU pass sum</small>{info?.gpuMs[method] == null ? '— ms' : `${info.gpuMs[method]!.toFixed(2)} ms`}</span></div>
        <div className="compare-surface"><canvas ref={el => { if (el) canvas.current[method] = el; }} aria-label={labels[method].title} onClick={inspect} title="Click a pixel to pause and compare it with a sampled reference" />{inspection && info && <span className="compare-crosshair" style={{ left: `${(inspection.x + 0.5) / info.width * 100}%`, top: `${(inspection.y + 0.5) / info.height * 100}%` }} />}</div>
        {method === 'spectral' ? <div className="compare-method-label"><select className="compare-kernel" aria-label="Integration kernel" disabled={!info?.ready} value={info?.kernel ?? 'projective'} onChange={e => {
          setInspection(undefined); setError('');
          void engine.current?.setKernel(e.target.value as Kernel).catch(e => setError(e instanceof Error ? e.message : String(e)));
        }}><option value="projective">Projected edges + spectral</option><option value="homography">Shared projected coverage</option><option value="lattice">Shared lattice kernel</option></select></div>
        : <p className="compare-method-label">{labels[method].subtitle}</p>}
      </article>)}
    </section>
    {!info?.ready && <div className="compare-loading" role="status">{error || 'Preparing three live renderers…'}</div>}
    {error && info?.ready && <p className="compare-error" role="alert">{error}</p>}
    <footer className="compare-footer">
      <span>Grazing checkerboard <span className="muted">·</span> <span className="muted">click a pixel to inspect</span></span>
      <span className="compare-live">{info?.ready ? `${Math.round(info.fps)} fps · ${info.width} × ${info.height} per view · WebGPU` : 'WebGPU'}</span>
      <button onClick={() => setDetails(!details)} aria-expanded={details}>About this comparison</button>
    </footer>
    {inspection && <section className="compare-inspection" aria-label="Pixel comparison">
      <button className="compare-close" aria-label="Close pixel inspection" onClick={() => setInspection(undefined)}>×</button>
      <h2>Pixel {inspection.x}, {inspection.y}</h2>
      {inspection.reference.status === 'ok' ? <>
        <div className="compare-swatches">
          {METHODS.map(method => {
            const rgb = inspection.pixels[method];
            const error = Math.sqrt(rgb.reduce((s, c, i) => s + (srgbToLinear(c / 255) - inspection.reference.linearRGB![i]) ** 2, 0) / 3);
            return <div key={method}><span style={{ background: `rgb(${rgb.join(',')})` }} /><b>{method === 'raw' ? 'No AA' : method === 'temporal' ? 'Temporal' : 'Ours'}</b><small>{(error * 100).toFixed(2)}% error</small></div>;
          })}
          <div><span style={{ background: `rgb(${inspection.reference.srgb!.map(c => Math.round(c * 255)).join(',')})` }} /><b>Reference</b><small>{inspection.reference.samples.toLocaleString()} samples</small></div>
        </div>
        <p>Captured at selection, against a Gaussian pixel reference in linear light. Two reference sequences differ by {(inspection.reference.sequenceDifference! * 100).toFixed(3)}%. Temporal AA uses a different filter and continues to settle.</p>
      </> : <p>{inspection.reference.reason}</p>}
    </section>}
    {details && <div className="compare-modal-backdrop" onClick={() => setDetails(false)}><section className="compare-about" role="dialog" aria-modal="true" aria-label="About this comparison" onClick={e => e.stopPropagation()}>
      <button className="compare-close" aria-label="Close" onClick={() => setDetails(false)}>×</button>
      <h2>Judge it in motion.</h2>
      <p>A grazing plane makes texture detail, false patterns, blur and motion shimmer easy to compare. This scene follows the procedural-material benchmark used by <a href="https://yyuting.github.io/docs/eg_2018.html" target="_blank" rel="noreferrer">Yang and Barnes</a>, with an interactive camera.</p>
      <p>The middle view uses the official Three.js temporal AA implementation with a mipmapped checker texture and 16× anisotropic filtering. It is a practical browser baseline. Unreal TSR, DLAA and FSR require a separate native comparison.</p>
      <p>Our view offers three integrations under the same Gaussian pixel footprint. Projected edges uses exact nearby boundaries and a finite spectral sum farther away. Shared projected coverage handles several exact boundaries together, with the shared lattice kernel as its fallback. Shared lattice alone keeps the earlier count approximation for comparison. Perspective remains approximate in the spectral paths; exact horizon conditioning and bumped materials are still to be connected.</p>
      <p>Pause to compare settled images; play to expose shimmer. The frame rate counts completed batches of all three views. The GPU meter sums pass durations, whose timestamp intervals can overlap; it is not elapsed frame time. Different reconstruction filters can trade sharpness for smoothness; this demo does not declare a winner from appearance alone.</p>
    </section></div>}
  </main>;
}
