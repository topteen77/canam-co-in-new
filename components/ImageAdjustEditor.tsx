import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CARD_ASPECT,
  DEFAULT_ADJUSTMENTS,
  cardRatioCrop,
  clampCrop,
  exportAdjustedImage,
  loadAdjustImage,
  renderAdjustedPreview,
  type CropRect,
  type ImageAdjustments,
  type LoadedImage
} from '../utils/imageAdjust';

interface ImageAdjustEditorProps {
  file: File;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const handleStyle = (handle: Handle): React.CSSProperties => {
  const box: React.CSSProperties = {
    position: 'absolute',
    width: 28,
    height: 28,
    margin: -14,
    borderRadius: 4,
    background: '#fff',
    border: '2px solid #10b981',
    zIndex: 3
  };
  if (handle.includes('n')) box.top = 0;
  if (handle.includes('s')) box.bottom = 0;
  if (handle.includes('e')) box.right = 0;
  if (handle.includes('w')) box.left = 0;
  if (handle === 'n' || handle === 's') box.left = '50%';
  if (handle === 'e' || handle === 'w') box.top = '50%';
  return box;
};

const cursorFor = (handle: Handle): string => {
  if (handle === 'move') return 'move';
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  if (handle === 'ne' || handle === 'sw') return 'nesw-resize';
  return 'nwse-resize';
};

const applyHandle = (
  start: CropRect,
  handle: Handle,
  dx: number,
  dy: number,
  aspect: number | null
): CropRect => {
  let { x, y, width, height } = start;
  const right = x + width;
  const bottom = y + height;

  if (handle === 'move') {
    return clampCrop({ x: start.x + dx, y: start.y + dy, width, height });
  }
  if (handle.includes('w')) {
    x = Math.min(right - 0.08, start.x + dx);
    width = right - x;
  }
  if (handle.includes('e')) {
    width = Math.max(0.08, start.width + dx);
  }
  if (handle.includes('n')) {
    y = Math.min(bottom - 0.08, start.y + dy);
    height = bottom - y;
  }
  if (handle.includes('s')) {
    height = Math.max(0.08, start.height + dy);
  }

  if (aspect) {
    const fromCorner = handle.length === 2;
    if (fromCorner) {
      if (Math.abs(dx) * aspect >= Math.abs(dy)) {
        height = width / aspect;
        if (handle.includes('n')) y = bottom - height;
      } else {
        width = height * aspect;
        if (handle.includes('w')) x = right - width;
      }
    } else if (handle === 'e' || handle === 'w') {
      height = width / aspect;
      y = start.y + (start.height - height) / 2;
    } else {
      width = height * aspect;
      x = start.x + (start.width - width) / 2;
    }
  }

  return clampCrop({ x, y, width, height });
};

export const ImageAdjustEditor: React.FC<ImageAdjustEditorProps> = ({ file, onConfirm, onCancel }) => {
  const loadedRef = useRef<LoadedImage | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; crop: CropRect } | null>(null);
  const [adj, setAdj] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);
  const [lockCard, setLockCard] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const layoutPreview = useCallback(() => {
    const stage = stageRef.current;
    const canvas = previewRef.current;
    if (!stage || !canvas || !canvas.width) return;
    const rect = stage.getBoundingClientRect();
    const scale = Math.min(rect.width / canvas.width, rect.height / canvas.height);
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    setView({
      left: (rect.width - width) / 2,
      top: (rect.height - height) / 2,
      width,
      height
    });
  }, []);

  const redraw = useCallback((next: ImageAdjustments) => {
    const loaded = loadedRef.current;
    const canvas = previewRef.current;
    if (!loaded || !canvas) return;
    renderAdjustedPreview(canvas, loaded, next);
    layoutPreview();
  }, [layoutPreview]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const loaded = await loadAdjustImage(file);
        if (cancelled) {
          loaded.close();
          return;
        }
        loadedRef.current = loaded;
        setReady(true);
        redraw(DEFAULT_ADJUSTMENTS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not open this image.');
      }
    };
    start();
    return () => {
      cancelled = true;
      loadedRef.current?.close();
      loadedRef.current = null;
    };
  }, [file, redraw]);

  useEffect(() => {
    if (!ready) return;
    redraw(adj);
  }, [adj.rotation, adj.straighten, adj.brightness, adj.contrast, adj.saturate, adj.sharpen, ready, redraw]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => layoutPreview());
    observer.observe(stage);
    return () => observer.disconnect();
  }, [layoutPreview, ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const update = (patch: Partial<ImageAdjustments>) => {
    setAdj((prev) => ({ ...prev, ...patch }));
  };

  const rotateBy = (delta: number) => {
    setAdj((prev) => ({
      ...prev,
      rotation: (prev.rotation + delta + 360) % 360,
      crop: DEFAULT_ADJUSTMENTS.crop
    }));
    setLockCard(false);
  };

  const snapCardRatio = () => {
    const canvas = previewRef.current;
    const aspect = canvas && canvas.height ? canvas.width / canvas.height : CARD_ASPECT;
    setLockCard(true);
    update({ crop: cardRatioCrop(aspect) });
  };

  const clientToNorm = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const current = viewRef.current;
    if (!stage) return { x: 0, y: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      x: (clientX - rect.left - current.left) / Math.max(1, current.width),
      y: (clientY - rect.top - current.top) / Math.max(1, current.height)
    };
  };

  const onPointerDown = (handle: Handle) => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const point = clientToNorm(event.clientX, event.clientY);
    dragRef.current = { handle, startX: point.x, startY: point.y, crop: adj.crop };
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      event.preventDefault();
      const point = clientToNorm(event.clientX, event.clientY);
      const canvas = previewRef.current;
      const imageAspect = canvas && canvas.height ? canvas.width / canvas.height : 1;
      const cropAspect = lockCard ? CARD_ASPECT / imageAspect : null;
      setAdj((prev) => ({
        ...prev,
        crop: applyHandle(drag.crop, drag.handle, point.x - drag.startX, point.y - drag.startY, cropAspect)
      }));
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [view, lockCard]);

  const handleConfirm = async () => {
    const loaded = loadedRef.current;
    if (!loaded || saving) return;
    setSaving(true);
    setError('');
    try {
      const name = file.name.replace(/\.[^.]+$/, '') + '-adjusted.jpg';
      const { file: out } = await exportAdjustedImage(loaded, adj, name);
      console.info('[Visiting card] Manual adjust applied', {
        rotation: adj.rotation,
        straighten: adj.straighten,
        brightness: adj.brightness,
        contrast: adj.contrast,
        saturate: adj.saturate,
        sharpen: adj.sharpen,
        crop: adj.crop
      });
      onConfirm(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the adjusted image.');
      setSaving(false);
    }
  };

  const cropLeft = view.left + adj.crop.x * view.width;
  const cropTop = view.top + adj.crop.y * view.height;
  const cropWidth = adj.crop.width * view.width;
  const cropHeight = adj.crop.height * view.height;

  return createPortal(
    <div className="fixed inset-0 z-[230] bg-slate-950 flex flex-col text-white">
      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0 border-b border-white/10">
        <div>
          <p className="font-semibold">Adjust visiting card</p>
          <p className="text-[11px] text-white/70">Crop extra area, rotate, then fix lighting before reading.</p>
        </div>
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg bg-white/10 text-sm min-h-[44px]">
          Cancel
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex-1 min-h-0 overflow-hidden touch-none"
      >
        <canvas
          ref={previewRef}
          className="absolute pointer-events-none"
          style={{ left: view.left, top: view.top, width: view.width, height: view.height }}
        />
        {ready && (
          <>
            <div
              className="absolute border-2 border-emerald-400"
              style={{
                left: cropLeft,
                top: cropTop,
                width: cropWidth,
                height: cropHeight,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                touchAction: 'none'
              }}
              onPointerDown={onPointerDown('move')}
            >
              {HANDLES.map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`Resize ${handle}`}
                  className="p-0"
                  style={{ ...handleStyle(handle), cursor: cursorFor(handle) }}
                  onPointerDown={onPointerDown(handle)}
                />
              ))}
            </div>
          </>
        )}
        {!ready && !error && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">Opening image…</p>
        )}
      </div>

      <div className="flex-shrink-0 bg-slate-900 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3 max-h-[42vh] overflow-y-auto">
        {error && <p className="text-sm text-red-300">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => rotateBy(-90)} className="px-3 py-2 rounded-lg bg-white/10 text-sm min-h-[44px]">
            ↺ Rotate left
          </button>
          <button type="button" onClick={() => rotateBy(90)} className="px-3 py-2 rounded-lg bg-white/10 text-sm min-h-[44px]">
            ↻ Rotate right
          </button>
          <button
            type="button"
            onClick={snapCardRatio}
            className={`px-3 py-2 rounded-lg text-sm min-h-[44px] ${lockCard ? 'bg-emerald-600' : 'bg-white/10'}`}
          >
            Card shape
          </button>
          <button
            type="button"
            onClick={() => {
              setLockCard(false);
              setAdj(DEFAULT_ADJUSTMENTS);
            }}
            className="px-3 py-2 rounded-lg bg-white/10 text-sm min-h-[44px]"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          <label className="text-xs text-white/80">
            Straighten {adj.straighten > 0 ? `+${adj.straighten}` : adj.straighten}°
            <input
              type="range"
              min={-20}
              max={20}
              step={1}
              value={adj.straighten}
              onChange={(event) => update({ straighten: Number(event.target.value) })}
              className="w-full accent-emerald-500"
            />
          </label>
          <label className="text-xs text-white/80">
            Brightness {Math.round(adj.brightness * 100)}%
            <input
              type="range"
              min={60}
              max={160}
              step={1}
              value={Math.round(adj.brightness * 100)}
              onChange={(event) => update({ brightness: Number(event.target.value) / 100 })}
              className="w-full accent-emerald-500"
            />
          </label>
          <label className="text-xs text-white/80">
            Contrast {Math.round(adj.contrast * 100)}%
            <input
              type="range"
              min={60}
              max={180}
              step={1}
              value={Math.round(adj.contrast * 100)}
              onChange={(event) => update({ contrast: Number(event.target.value) / 100 })}
              className="w-full accent-emerald-500"
            />
          </label>
          <label className="text-xs text-white/80">
            Color {Math.round(adj.saturate * 100)}%
            <input
              type="range"
              min={50}
              max={170}
              step={1}
              value={Math.round(adj.saturate * 100)}
              onChange={(event) => update({ saturate: Number(event.target.value) / 100 })}
              className="w-full accent-emerald-500"
            />
          </label>
          <label className="text-xs text-white/80 sm:col-span-2">
            Clarity {Math.round(adj.sharpen * 100)}%
            <input
              type="range"
              min={0}
              max={80}
              step={1}
              value={Math.round(adj.sharpen * 100)}
              onChange={(event) => update({ sharpen: Number(event.target.value) / 100 })}
              className="w-full accent-emerald-500"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={!ready || saving}
          onClick={() => void handleConfirm()}
          className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold disabled:opacity-50 min-h-[48px]"
        >
          {saving ? 'Saving…' : 'Use this photo'}
        </button>
      </div>
    </div>,
    document.body
  );
};
