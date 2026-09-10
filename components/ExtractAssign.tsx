import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExtractedLeadData } from '../services/ocrService';
import { ASSIGNABLE_FIELDS, buildOcrFieldOptions, formatSnippetForField, tokenizeExtractedText } from '../utils/parseVisitingCard';
import type { ExtractionSource } from '../services/visitingCardService';

type ExtractionPayload = {
  text: string;
  fields: ExtractedLeadData;
  source: ExtractionSource | null;
};

type ExtractAssignContextValue = {
  activeSnippet: string | null;
  setActiveSnippet: (value: string | null) => void;
  applySnippet: (field: keyof ExtractedLeadData, value: string) => void;
  extraction: ExtractionPayload | null;
  setExtraction: (payload: ExtractionPayload | null) => void;
};

const ExtractAssignContext = createContext<ExtractAssignContextValue | null>(null);

export const ExtractAssignProvider: React.FC<{
  children: React.ReactNode;
  onAssign: (field: keyof ExtractedLeadData, value: string) => void;
}> = ({ children, onAssign }) => {
  const [activeSnippet, setActiveSnippet] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionPayload | null>(null);

  const value = useMemo<ExtractAssignContextValue>(
    () => ({
      activeSnippet,
      setActiveSnippet,
      applySnippet: (field, snippet) => {
        onAssign(field, formatSnippetForField(field, snippet));
        setActiveSnippet(null);
      },
      extraction,
      setExtraction
    }),
    [activeSnippet, onAssign, extraction]
  );

  return <ExtractAssignContext.Provider value={value}>{children}</ExtractAssignContext.Provider>;
};

export const useExtractAssign = () => useContext(ExtractAssignContext);

export const ClearFieldButton: React.FC<{
  visible: boolean;
  onClear: () => void;
  className?: string;
}> = ({ visible, onClear, className = '' }) => {
  if (!visible) return null;
  return (
    <button
      type="button"
      data-clear-field="true"
      aria-label="Clear field"
      title="Clear this field"
      className={`absolute right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-700 text-lg leading-none ${className}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClear();
      }}
    >
      ×
    </button>
  );
};

export const InputWithClear: React.FC<{
  value: string;
  onClear: () => void;
  children: React.ReactNode;
  multiline?: boolean;
}> = ({ value, onClear, children, multiline = false }) => (
  <div className="relative">
    {children}
    <ClearFieldButton
      visible={Boolean(value?.trim())}
      onClear={onClear}
      className={multiline ? 'top-2' : 'top-1/2 -translate-y-1/2'}
    />
  </div>
);

const menuPosition = (button: HTMLElement | null): React.CSSProperties => {
  if (!button) return { top: 0, left: 8, width: 280, maxHeight: 240 };
  const rect = button.getBoundingClientRect();
  const width = Math.min(320, Math.max(240, window.innerWidth - 16));
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(280, Math.max(140, openUp ? spaceAbove : spaceBelow));
  let left = rect.right - width;
  if (left < 8) left = 8;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  const top = openUp ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4;
  return { top, left, width, maxHeight };
};

export const OcrValuePicker: React.FC<{
  field: keyof ExtractedLeadData;
  onPicked?: () => void;
}> = ({ field, onPicked }) => {
  const ctx = useExtractAssign();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const fieldLabel = ASSIGNABLE_FIELDS.find((item) => item.key === field)?.label || 'this field';
  const options = ctx?.extraction ? buildOcrFieldOptions(field, ctx.extraction) : [];
  const hasExtraction = Boolean(ctx?.extraction);

  useLayoutEffect(() => {
    if (!open) return;
    setStyle(menuPosition(btnRef.current));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sync = () => setStyle(menuPosition(btnRef.current));
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', sync);
    document.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', sync);
      document.removeEventListener('scroll', sync, true);
    };
  }, [open]);

  if (!ctx) return null;

  const pick = (value: string) => {
    ctx.applySnippet(field, value);
    setOpen(false);
    onPicked?.();
  };

  return (
    <div
      className="ocr-fill-wrap relative flex-shrink-0"
      data-ocr-fill="true"
      title={hasExtraction ? `Pick extracted value for ${fieldLabel}` : 'Scan a visiting card to enable this dropdown'}
    >
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Choose extracted ${fieldLabel}`}
        onClick={() => setOpen((value) => !value)}
        className="ocr-fill-select w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg border-2 border-indigo-400 bg-indigo-50 text-indigo-700 flex flex-col items-center justify-center leading-none"
      >
        <span className="text-xl font-bold">+</span>
        <span className="text-[9px] font-semibold">▾</span>
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[300]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label={`Extracted values for ${fieldLabel}`}
            className="fixed z-[301] bg-white border-2 border-indigo-200 rounded-lg shadow-2xl overflow-y-auto"
            style={style}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-3 py-2 text-[11px] font-semibold text-indigo-700 border-b border-indigo-100 sticky top-0 bg-white">
              {hasExtraction ? `Select ${fieldLabel}, then edit if needed` : 'Scan a visiting card first'}
            </p>
            {!hasExtraction && (
              <p className="px-3 py-3 text-sm text-slate-500">Upload or scan a card to see values here.</p>
            )}
            {hasExtraction && options.length === 0 && (
              <p className="px-3 py-3 text-sm text-slate-500">No extracted values for this field.</p>
            )}
            {options.map((option, index) => (
              <button
                key={`${option.value}-${index}`}
                type="button"
                role="option"
                onClick={() => pick(option.value)}
                className="w-full text-left px-3 py-2.5 min-h-[44px] text-sm text-slate-800 hover:bg-indigo-50 border-b border-slate-100 last:border-b-0 break-words"
              >
                {option.label}
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

const focusFieldInput = (row: HTMLElement | null) => {
  const el = row?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea');
  if (!el) return;
  el.focus();
  try {
    const len = el.value.length;
    el.setSelectionRange(len, len);
  } catch {
    /* email/url inputs may not support setSelectionRange */
  }
};

export const OcrInputRow: React.FC<{
  field: keyof ExtractedLeadData;
  children: React.ReactNode;
}> = ({ field, children }) => {
  const rowRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={rowRef} className="flex items-start gap-1.5">
      <div className="flex-1 min-w-0">{children}</div>
      <OcrValuePicker field={field} onPicked={() => focusFieldInput(rowRef.current)} />
    </div>
  );
};

export const LabelWithOcr: React.FC<{
  field: keyof ExtractedLeadData;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ htmlFor, children, className = 'text-sm font-bold text-slate-800' }) => (
  <label htmlFor={htmlFor} className={`block mb-1 ${className}`}>{children}</label>
);

export const DroppableField: React.FC<{
  field: keyof ExtractedLeadData;
  children: React.ReactNode;
}> = ({ field, children }) => {
  const ctx = useExtractAssign();
  const [over, setOver] = useState(false);
  if (!ctx) return <>{children}</>;

  const selected = Boolean(ctx.activeSnippet);

  return (
    <div
      className={`rounded-lg transition-all ${over || selected ? 'ring-2 ring-indigo-400 ring-offset-1' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        const text = event.dataTransfer.getData('text/plain');
        if (text) ctx.applySnippet(field, text);
        setOver(false);
      }}
      onClickCapture={(event) => {
        if (!ctx.activeSnippet) return;
        const target = event.target as HTMLElement;
        if (target.closest('[data-clear-field], [data-ocr-fill]')) return;
        event.preventDefault();
        ctx.applySnippet(field, ctx.activeSnippet);
      }}
    >
      {selected && (
        <p className="mb-1 text-[11px] font-medium text-indigo-600">Tap this field to fill selected text</p>
      )}
      {children}
    </div>
  );
};

export const StickyExtractTool: React.FC = () => {
  const ctx = useExtractAssign();
  const [expanded, setExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 640px)').matches : false
  );
  if (!ctx?.extraction?.text) return null;

  const chips = tokenizeExtractedText(ctx.extraction.text, ctx.extraction.fields);

  return (
    <div className="bg-indigo-50 px-3 py-2 sm:px-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-indigo-900">Extracted text tool</p>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="text-xs font-semibold text-indigo-700 px-2 py-1 rounded-md hover:bg-indigo-100 min-h-[32px]"
        >
          {expanded ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-[11px] text-indigo-700 mt-1">
        Tap <span className="font-bold">+</span> beside a field to open the dropdown, pick an extracted value, then edit it in the box.
      </p>
      {expanded && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 mt-2">
            {chips.map((chip) => {
              const active = ctx.activeSnippet === chip;
              return (
                <button
                  key={chip}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', chip);
                    event.dataTransfer.effectAllowed = 'copy';
                    ctx.setActiveSnippet(chip);
                  }}
                  onClick={() => ctx.setActiveSnippet(active ? null : chip)}
                  className={`flex-shrink-0 px-2.5 py-1.5 text-xs rounded-full border min-h-[36px] max-w-[220px] truncate ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-800 border-indigo-200'
                  }`}
                >
                  {chip}
                </button>
              );
            })}
          </div>
          {ctx.activeSnippet && (
            <div className="mt-2">
              <p className="text-[11px] font-semibold text-indigo-800 mb-1">Fill into:</p>
              <div className="flex flex-wrap gap-1.5">
                {ASSIGNABLE_FIELDS.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => ctx.applySnippet(field.key, ctx.activeSnippet || '')}
                    className="px-2 py-1 text-[11px] rounded-md bg-white text-indigo-800 border border-indigo-200 min-h-[32px]"
                  >
                    {field.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
