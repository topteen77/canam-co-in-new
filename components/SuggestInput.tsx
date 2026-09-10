import React, { useEffect, useId, useRef, useState } from 'react';
import type { LocationSuggestion } from '../utils/locationSuggest';

interface SuggestInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: LocationSuggestion) => void;
  getSuggestions: (query: string) => LocationSuggestion[] | Promise<LocationSuggestion[]>;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  rows?: number;
  minChars?: number;
  disabled?: boolean;
  id?: string;
}

export const SuggestInput: React.FC<SuggestInputProps> = ({
  value,
  onChange,
  onSelect,
  getSuggestions,
  placeholder,
  className = '',
  multiline = false,
  rows = 2,
  minChars = 1,
  disabled = false,
  id
}) => {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LocationSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const getSuggestionsRef = useRef(getSuggestions);
  getSuggestionsRef.current = getSuggestions;

  useEffect(() => {
    const query = value.trim();
    if (disabled || query.length < minChars) {
      setItems([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      const current = ++requestId.current;
      setLoading(true);
      try {
        const next = await getSuggestionsRef.current(query);
        if (current !== requestId.current) return;
        setItems(next);
        setActiveIndex(next.length ? 0 : -1);
        setOpen(next.length > 0);
      } catch {
        if (current !== requestId.current) return;
        setItems([]);
        setOpen(false);
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(handle);
  }, [value, disabled, minChars]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const choose = (item: LocationSuggestion) => {
    onChange(item.address || item.label);
    onSelect?.(item);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open || !items.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(items[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const inputClass = `${className || 'block w-full px-3 py-2 text-sm border-2 border-slate-300 rounded-lg min-h-[44px]'} ${value.trim() ? 'pr-10' : ''}`;

  return (
    <div ref={containerRef} className="relative">
      {multiline ? (
        <textarea
          id={id}
          value={value}
          disabled={disabled}
          rows={rows}
          placeholder={placeholder}
          className={inputClass}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className={inputClass}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
        />
      )}
      {value.trim() && !disabled && (
        <button
          type="button"
          data-clear-field="true"
          aria-label="Clear field"
          title="Clear this field"
          className={`absolute right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-700 text-lg leading-none ${multiline ? 'top-2' : 'top-1/2 -translate-y-1/2'}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onChange('');
            setOpen(false);
          }}
        >
          ×
        </button>
      )}
      {loading && (
        <span className="absolute right-10 top-3 text-[10px] text-indigo-500">Searching…</span>
      )}
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {items.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm ${index === activeIndex ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="block font-medium">{item.label}</span>
                {item.description && (
                  <span className="block text-xs text-slate-500">{item.description}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
