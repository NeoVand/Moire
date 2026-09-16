import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Cancel01Icon, PrinterIcon } from '@hugeicons/core-free-icons';
import { captureSize } from '../gpu/capture';
import { exportPrint, type PrintProgress, type PrintSource } from '../gpu/print';
import { fitPrintPreview, renderPrintPreview } from '../gpu/printPreview';
import { DEFAULT_PRINT, PAPER_SIZES, printLayout, type PrintSettings } from '../gpu/printFormat';
import { useProjectStore } from '../store/project';
import { Icon } from './ui/Icon';

const field = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)]';
const label = 'grid gap-1.5 text-[11px] text-[var(--text-secondary)]';
const button = 'rounded-lg border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-40';
let remembered = DEFAULT_PRINT;

export function PrintDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source] = useState<PrintSource>(() => {
    const { layers, camera, backgroundColor, view } = useProjectStore.getState();
    return { state: structuredClone({ layers, camera, backgroundColor, view }), framing: captureSize() ?? { width: 0, height: 0 } };
  });
  const [settings, setSettings] = useState<PrintSettings>(remembered);
  const [selected, setSelected] = useState(() => source.state.layers.filter((l) => l.visible).map((l) => l.id));
  const [preview, setPreview] = useState<{ overlay: string; layers: Record<string, string>; overlayBlob: Blob; layerBlobs: Record<string, Blob>; width: number; height: number } | null>(null);
  const [fitted, setFitted] = useState<{ source: string; url: string } | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const [detail, setDetail] = useState(false);
  const previewViewport = useRef<HTMLDivElement>(null);
  const [previewError, setPreviewError] = useState(false);
  const [progress, setProgress] = useState<PrintProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const previewQueue = useRef<Promise<void>>(Promise.resolve());
  const previewUrls = useRef<string[]>([]);
  const fittedUrl = useRef<string | null>(null);
  const downloadUrl = useRef<string | null>(null);
  const mounted = useRef(true);
  const [previewId, setPreviewId] = useState('');
  const shownLayer = source.state.layers.find((l) => selected.includes(l.id) && l.id === previewId);
  const previewSrc = shownLayer ? preview?.layers[shownLayer.id] : preview?.overlay;
  const previewBlob = shownLayer ? preview?.layerBlobs[shownLayer.id] : preview?.overlayBlob;
  const displaySrc = detail ? previewSrc : fitted?.source === previewSrc ? fitted?.url : undefined;
  let layout: ReturnType<typeof printLayout> | undefined;
  let error = '';
  try { layout = printLayout(settings); } catch (err) { error = (err as Error).message; }
  if (!error && !selected.length) error = 'Choose at least one layer to export.';
  if (!source.framing.width) error = 'Wait for the canvas to finish loading, then reopen Print.';

  const change = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    setStatus(null);
  };

  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    return () => {
      mounted.current = false;
      abort.current?.abort();
      previewAbort.current?.abort();
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      if (fittedUrl.current) URL.revokeObjectURL(fittedUrl.current);
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);

  useEffect(() => { remembered = settings; }, [settings]);

  // Disabling controls during export can move focus to the document body.
  // Catch Escape before the floating Capture panel, even in that focus state.
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy) abort.current?.abort();
      else if (enlarged) { setEnlarged(false); setDetail(false); }
      else onClose();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [busy, enlarged, onClose]);

  useEffect(() => {
    if (busy || error) return;
    const controller = new AbortController();
    previewAbort.current = controller;
    setPreview(null);
    setPreviewError(false);
    const timer = setTimeout(() => {
      // A replaced preview finishes releasing its GPU before the next starts.
      previewQueue.current = previewQueue.current.then(async () => {
        if (controller.signal.aborted) return;
        try {
          const result = await renderPrintPreview(source, settings, selected, { signal: controller.signal });
          if (controller.signal.aborted) return;
          const overlay = URL.createObjectURL(result.blob);
          const layers = Object.fromEntries(result.sheets.map((sheet) => [sheet.id, URL.createObjectURL(sheet.blob)]));
          previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
          previewUrls.current = [overlay, ...Object.values(layers)];
          const layerBlobs = Object.fromEntries(result.sheets.map((sheet) => [sheet.id, sheet.blob]));
          setPreview({ overlay, layers, overlayBlob: result.blob, layerBlobs, width: result.width, height: result.height });
        } catch {
          if (!controller.signal.aborted) setPreviewError(true);
        }
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [source, settings, selected, error, busy]);

  useEffect(() => {
    const el = previewViewport.current;
    if (!el || !previewBlob || !previewSrc || detail) return;
    let controller: AbortController | undefined;
    const resize = () => {
      controller?.abort();
      const job = new AbortController();
      controller = job;
      const style = getComputedStyle(el);
      const dpr = window.devicePixelRatio || 1;
      const bounds = {
        width: (el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) * dpr,
        height: (el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)) * dpr,
      };
      void fitPrintPreview(previewBlob, bounds, job.signal).then((blob) => {
        if (job.signal.aborted) return;
        if (fittedUrl.current) URL.revokeObjectURL(fittedUrl.current);
        const url = URL.createObjectURL(blob);
        fittedUrl.current = url;
        setFitted({ source: previewSrc, url });
      }).catch(() => { if (!job.signal.aborted) setPreviewError(true); });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    return () => {
      observer.disconnect();
      controller?.abort();
    };
  }, [previewBlob, previewSrc, detail]);

  useEffect(() => {
    const el = previewViewport.current;
    if (el && detail) el.scrollTo((el.scrollWidth - el.clientWidth) / 2, (el.scrollHeight - el.clientHeight) / 2);
  }, [detail, preview, previewId]);

  const save = async () => {
    if (abort.current || error) return;
    const controller = new AbortController();
    abort.current = controller;
    previewAbort.current?.abort();
    setBusy(true);
    setStatus(null);
    setProgress({ done: 0, total: selected.length, name: '' });
    try {
      await previewQueue.current;
      const blob = await exportPrint(source, settings, selected, {
        signal: controller.signal,
        progress: (p) => { if (mounted.current) setProgress(p); },
      });
      controller.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = url;
      const name = `moire-print-${settings.paper}-${settings.dpi}dpi.zip`;
      setDownload({ url, name });
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
      setStatus({ text: `Saved ${selected.length} transparent ${selected.length === 1 ? 'sheet' : 'sheets'} in a ZIP.`, error: false });
    } catch (err) {
      if (mounted.current) setStatus({ text: controller.signal.aborted ? 'Export cancelled.' : err instanceof Error ? err.message : 'Could not export the print sheets.', error: !controller.signal.aborted });
    } finally {
      abort.current = null;
      if (mounted.current) { setBusy(false); setProgress(null); }
    }
  };

  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby="print-title"
      className={`m-auto max-h-[calc(100dvh-24px)] ${enlarged ? 'w-[920px]' : 'w-[660px]'} max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-0 text-[var(--text-primary)] shadow-2xl backdrop:bg-black/55`}
      onCancel={(e) => { e.preventDefault(); if (busy) abort.current?.abort(); else if (enlarged) { setEnlarged(false); setDetail(false); } else onClose(); }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-4">
        <Icon icon={PrinterIcon} size={17} />
        <h2 id="print-title" className="flex-1 text-[14px] font-medium">Export for print</h2>
        <button type="button" aria-label="Close print settings" className="rounded-md p-1 hover:bg-[var(--bg-hover)]" onClick={onClose}>
          <Icon icon={Cancel01Icon} size={16} />
        </button>
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-[1fr_230px]">
        <fieldset disabled={busy} className={`${enlarged ? 'hidden' : 'grid'} min-w-0 content-start gap-3.5`}>
          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">Print each layer on its own transparent sheet, then stack them to reveal the moiré.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Paper size
              <select className={field} value={settings.paper} onChange={(e) => change('paper', e.target.value)}>
                {PAPER_SIZES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className={label}>Orientation
              <select className={field} value={settings.landscape ? 'landscape' : 'portrait'} onChange={(e) => change('landscape', e.target.value === 'landscape')}>
                <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
              </select>
            </label>
          </div>
          {settings.paper === 'custom' && <div className="grid grid-cols-2 gap-3">
            <label className={label}>Width, mm<input className={field} type="number" min="25" max="1000" step="0.1" value={Number.isFinite(settings.customWidth) ? settings.customWidth : ''} onChange={(e) => change('customWidth', e.target.valueAsNumber)} /></label>
            <label className={label}>Height, mm<input className={field} type="number" min="25" max="1000" step="0.1" value={Number.isFinite(settings.customHeight) ? settings.customHeight : ''} onChange={(e) => change('customHeight', e.target.valueAsNumber)} /></label>
          </div>}
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Resolution
              <select className={field} value={settings.dpi} onChange={(e) => change('dpi', Number(e.target.value))}>
                <option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option>
              </select>
            </label>
            <label className={label}>Margin, mm<input className={field} type="number" min="0" step="1" value={Number.isFinite(settings.margin) ? settings.margin : ''} onChange={(e) => change('margin', e.target.valueAsNumber)} /></label>
          </div>
          <label className="flex items-center gap-2 text-[12px]"><input className="accent-[var(--text-primary)]" type="checkbox" checked={settings.marks} onChange={(e) => change('marks', e.target.checked)} />Add alignment marks</label>
          <label className="flex items-center gap-2 text-[12px]"><input className="accent-[var(--text-primary)]" type="checkbox" checked={settings.blackInk} onChange={(e) => change('blackInk', e.target.checked)} />Use black ink for every layer</label>
          <div className="border-t border-[var(--border)] pt-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
              <span className="flex-1">Layers · {selected.length} selected</span>
              <button type="button" className="hover:text-[var(--text-primary)]" onClick={() => setSelected(source.state.layers.map((l) => l.id))}>All</button>
              <button type="button" className="hover:text-[var(--text-primary)]" onClick={() => setSelected(source.state.layers.filter((l) => l.visible).map((l) => l.id))}>Visible</button>
            </div>
            <div className="grid max-h-[150px] gap-1 overflow-y-auto">
              {source.state.layers.map((layer) => <label key={layer.id} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1.5 text-[12px] hover:bg-[var(--bg-hover)]">
                <input className="accent-[var(--text-primary)]" type="checkbox" checked={selected.includes(layer.id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, layer.id] : ids.filter((id) => id !== layer.id))} />
                <span className="size-2.5 shrink-0 rounded-full border border-white/25" style={{ background: settings.blackInk ? '#000' : layer.color }} />
                <span className="truncate">{layer.name}</span>
                {!layer.visible && <span className="text-[10px] text-[var(--text-muted)]">Hidden</span>}
              </label>)}
            </div>
          </div>
        </fieldset>
        <div className={`flex min-w-0 flex-col gap-3 ${enlarged ? 'sm:col-span-2' : ''}`}>
          <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
            <span>{shownLayer ? 'Single sheet' : 'Stacked sheets'}</span>
            {enlarged && <div className="flex gap-2">
              <button type="button" aria-pressed={!detail} className={!detail ? 'text-[var(--text-primary)] underline' : ''} onClick={() => setDetail(false)}>Fit</button>
              <button type="button" aria-pressed={detail} className={detail ? 'text-[var(--text-primary)] underline' : ''} onClick={() => setDetail(true)}>100%</button>
            </div>}
            <button type="button" className="underline hover:text-[var(--text-primary)]" onClick={() => { setEnlarged(!enlarged); setDetail(false); }}>{enlarged ? 'Back to settings' : 'Enlarge'}</button>
          </div>
          <div ref={previewViewport} aria-busy={!displaySrc && !error && !previewError} className={`${enlarged ? 'h-[min(60dvh,560px)]' : 'h-[270px]'} ${detail ? 'overflow-auto' : 'flex items-center justify-center p-4'} rounded-xl bg-[var(--bg-primary)]`}>
            {displaySrc && !error ? <img
              alt={shownLayer ? `Transparent print preview of ${shownLayer.name}` : 'All selected print sheets stacked in alignment'}
              src={displaySrc}
              data-print-source={previewSrc}
              className={`${detail ? 'max-w-none' : 'max-h-full max-w-full object-contain'} block shadow-md ring-1 ring-white/30`}
              style={{
                ...(detail ? { width: preview?.width, height: preview?.height } : {}),
                backgroundColor: '#fff',
                backgroundImage: shownLayer ? 'conic-gradient(#e3e3e3 25%, #fff 0 50%, #e3e3e3 0 75%, #fff 0)' : undefined,
                backgroundSize: '12px 12px',
              }}
            /> : <div className="grid h-full place-items-center p-3 text-center text-[11px] text-[var(--text-muted)]">{error ? 'Adjust the settings to preview' : busy ? 'Exporting…' : previewError ? 'Preview unavailable' : 'Rendering print preview…'}</div>}
          </div>
          <label className={label}>Preview
            <select className={field} disabled={busy || !selected.length} value={shownLayer?.id ?? ''} onChange={(e) => setPreviewId(e.target.value)}>
              <option value="">All selected layers</option>
              {source.state.layers.filter((l) => selected.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          {layout && <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{layout.widthMm} × {layout.heightMm} mm<br />{layout.width} × {layout.height} px per sheet</p>}
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">{shownLayer ? 'Checkerboard areas are transparent. Choose All selected layers to check the overlay.' : 'Selected sheets are stacked in layer order on white. Fields and alignment match the exported PNGs.'} {detail ? 'Scroll to inspect the print pixels.' : `Fit averages fine detail. ${enlarged ? 'Choose' : 'Enlarge and choose'} 100% to inspect individual strokes.`}</p>
          <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">Print at 100% or actual size with the same settings for every sheet. Turn off fit to page.</p>
        </div>
      </div>
      <div className="grid gap-2 border-t border-[var(--border)] px-5 py-4">
        {error && <p role="alert" className="text-[12px] text-[#ef8980]">{error}</p>}
        {status && <p role={status.error ? 'alert' : 'status'} className={`text-[12px] ${status.error ? 'text-[#ef8980]' : 'text-[var(--text-secondary)]'}`}>{status.text} {download && !status.error && <a href={download.url} download={download.name} className="underline">Download again</a>}</p>}
        {busy && <div role="status" className="grid gap-1.5 text-[11px] text-[var(--text-secondary)]"><span>{progress?.done === progress?.total ? 'Packing ZIP…' : `Rendering ${Math.min((progress?.done ?? 0) + 1, selected.length)} of ${selected.length}${progress?.name ? ` · ${progress.name}` : ''}`}</span><progress className="h-1 w-full accent-[var(--text-secondary)]" max={selected.length} value={progress?.done ?? 0} /></div>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--text-muted)]">One transparent PNG per layer</span>
          {busy ? <button type="button" className={button} onClick={() => { abort.current?.abort(); setStatus({ text: 'Cancelling…', error: false }); }}>Cancel export</button> : <button type="button" className={`${button} flex items-center gap-2`} disabled={!!error} onClick={() => void save()}><Icon icon={PrinterIcon} size={15} />Export {selected.length} {selected.length === 1 ? 'layer' : 'layers'}</button>}
        </div>
      </div>
    </dialog>, document.body,
  );
}
