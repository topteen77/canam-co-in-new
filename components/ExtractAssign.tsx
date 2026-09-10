import React, { createContext, useContext, useMemo, useState } from 'react';
import type { ExtractedLeadData } from '../services/ocrService';
import { ASSIGNABLE_FIELDS, formatSnippetForField, tokenizeExtractedText } from '../utils/parseVisitingCard';
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
        if (target.closest('[data-clear-field]')) return;
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
  const [expanded, setExpanded] = useState(true);
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
      {expanded && (
        <>
          <p className="text-[11px] text-indigo-700 mb-2">
            Drag a chip onto a field, or tap a chip then tap a field. Stays here while you scroll.
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
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
