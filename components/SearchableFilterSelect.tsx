import React, { useEffect, useMemo, useRef, useState } from 'react';

export type SearchableFilterOption = {
  value: string;
  label: string;
};

type SearchableFilterSelectProps = {
  label: string;
  value: string;
  options: SearchableFilterOption[];
  onChange: (value: string) => void;
  allLabel?: string;
  placeholder?: string;
  disabled?: boolean;
};

export const SearchableFilterSelect: React.FC<SearchableFilterSelectProps> = ({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
  placeholder = 'Search…',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    if (!value) return allLabel;
    return options.find((option) => option.value === value)?.label || value;
  }, [value, options, allLabel]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => (
      option.label.toLowerCase().includes(term)
      || option.value.toLowerCase().includes(term)
    ));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <label className="block relative" ref={rootRef}>
      <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm border-2 border-slate-300 rounded-lg bg-white min-h-[44px] text-left disabled:bg-slate-50 disabled:opacity-80"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate text-slate-800">{selectedLabel}</span>
        <span className="text-slate-400 shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md min-h-[40px]"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 ${!value ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-slate-700'}`}
              >
                {allLabel}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">No matches</li>
            ) : (
              filtered.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => pick(option.value)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 ${
                      value === option.value ? 'bg-indigo-50 font-semibold text-indigo-800' : 'text-slate-700'
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </label>
  );
};
