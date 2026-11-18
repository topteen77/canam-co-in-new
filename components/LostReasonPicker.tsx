import React, { useEffect, useMemo, useState } from 'react';
import {
  LOST_REASON_OTHER,
  listLostReasons,
  type LostReasonRow,
} from '../services/lostReasonMasterService';

type Props = {
  value?: string;
  onChange: (reason: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

export const LostReasonPicker: React.FC<Props> = ({
  value = '',
  onChange,
  disabled = false,
  required = true,
  className = '',
}) => {
  const [reasons, setReasons] = useState<LostReasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const rows = await listLostReasons();
        if (!cancelled) setReasons(rows);
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.response?.data?.error || err?.message || 'Failed to load lost reasons');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(
    () => reasons.map((r) => r.name).filter(Boolean),
    [reasons]
  );

  const selected = useMemo(() => {
    const current = String(value || '').trim();
    if (!current) return '';
    if (names.some((n) => n.toLowerCase() === current.toLowerCase())) return current;
    return LOST_REASON_OTHER;
  }, [value, names]);

  const otherText = selected === LOST_REASON_OTHER ? String(value || '') : '';

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-bold text-slate-800 mb-1">
        ❗ Lost reason{required ? ' *' : ''}
      </label>
      <select
        value={selected}
        disabled={disabled || loading}
        onChange={(e) => {
          const next = e.target.value;
          if (next === LOST_REASON_OTHER) {
            onChange(otherText || '');
            return;
          }
          onChange(next);
        }}
        className="block w-full px-3 py-2 text-sm border-2 border-rose-300 rounded-lg shadow-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-200 bg-white text-slate-800"
      >
        <option value="">{loading ? 'Loading reasons…' : 'Select reason'}</option>
        {names.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
        <option value={LOST_REASON_OTHER}>Other</option>
      </select>

      {selected === LOST_REASON_OTHER && (
        <input
          type="text"
          value={otherText}
          disabled={disabled}
          placeholder="Type the other reason"
          onChange={(e) => onChange(e.target.value)}
          className="block w-full px-3 py-2 text-sm border-2 border-rose-300 rounded-lg shadow-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-200 bg-white text-slate-800"
        />
      )}

      {loadError && <p className="text-xs text-rose-600">{loadError}</p>}
      {!loadError && !loading && names.length === 0 && (
        <p className="text-xs text-slate-500">No master reasons yet — choose Other or ask admin to add reasons.</p>
      )}
    </div>
  );
};

export default LostReasonPicker;
