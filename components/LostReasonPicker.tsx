import React, { useEffect, useMemo, useState } from 'react';
import { MultiSelect } from './MultiSelect';
import {
  LOST_REASON_OTHER,
  listLostReasons,
  type LostReasonRow,
} from '../services/lostReasonMasterService';

const REASON_SEP = ' | ';

type Props = {
  value?: string;
  onChange: (reason: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

function splitStoredReasons(raw: string): string[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  return text
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinStoredReasons(parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(REASON_SEP);
}

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
  /** Keep Other mode even while custom text is still empty. */
  const [otherMode, setOtherMode] = useState(false);
  const [otherDraft, setOtherDraft] = useState('');

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

  const nameLookup = useMemo(() => {
    const map = new Map<string, string>();
    names.forEach((n) => map.set(n.toLowerCase(), n));
    return map;
  }, [names]);

  const parsed = useMemo(() => {
    const parts = splitStoredReasons(value);
    const selectedMaster: string[] = [];
    const customParts: string[] = [];

    for (const part of parts) {
      const canonical = nameLookup.get(part.toLowerCase());
      if (canonical) selectedMaster.push(canonical);
      else customParts.push(part);
    }

    return {
      selectedMaster,
      customText: customParts.join(REASON_SEP),
      hasCustom: customParts.length > 0,
    };
  }, [value, nameLookup]);

  useEffect(() => {
    if (parsed.hasCustom) {
      setOtherMode(true);
      setOtherDraft((prev) => (prev === parsed.customText ? prev : parsed.customText));
      return;
    }
    // Keep local Other draft while user is typing before first character is committed.
    if (!otherMode) setOtherDraft('');
  }, [parsed.hasCustom, parsed.customText, otherMode]);

  const selectedValues = useMemo(() => {
    const values = [...parsed.selectedMaster];
    if (otherMode || parsed.hasCustom) values.push(LOST_REASON_OTHER);
    return values;
  }, [parsed.selectedMaster, parsed.hasCustom, otherMode]);

  const options = useMemo(
    () => [
      ...names.map((name) => ({ value: name, label: name })),
      { value: LOST_REASON_OTHER, label: 'Other' },
    ],
    [names]
  );

  const emitChange = (masterSelected: string[], useOther: boolean, customText: string) => {
    const parts = [...masterSelected];
    const trimmedCustom = customText.trim();
    if (useOther && trimmedCustom) parts.push(trimmedCustom);
    onChange(joinStoredReasons(parts));
  };

  const handleMultiChange = (next: string[]) => {
    const useOther = next.includes(LOST_REASON_OTHER);
    const masterSelected = next.filter((v) => v !== LOST_REASON_OTHER);
    setOtherMode(useOther);
    if (!useOther) setOtherDraft('');
    emitChange(masterSelected, useOther, useOther ? otherDraft : '');
  };

  const handleOtherTextChange = (text: string) => {
    setOtherDraft(text);
    setOtherMode(true);
    emitChange(parsed.selectedMaster, true, text);
  };

  const showOtherInput = otherMode || parsed.hasCustom;

  return (
    <div className={`space-y-2 ${className}`}>
      <MultiSelect
        label={`❗ Lost reason${required ? ' *' : ''}`}
        options={options}
        selectedValues={selectedValues}
        onChange={handleMultiChange}
        placeholder={loading ? 'Loading reasons…' : 'Select one or more reasons'}
        disabled={disabled || loading}
        maxHeight="220px"
      />

      {showOtherInput && (
        <input
          type="text"
          value={otherDraft}
          disabled={disabled}
          placeholder="Type the other reason"
          onChange={(e) => handleOtherTextChange(e.target.value)}
          className="block w-full px-3 py-2 text-sm border-2 border-rose-300 rounded-lg shadow-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-200 bg-white text-slate-800"
        />
      )}

      {loadError && <p className="text-xs text-rose-600">{loadError}</p>}
      {!loadError && !loading && names.length === 0 && (
        <p className="text-xs text-slate-500">No master reasons yet — choose Other or ask admin to add reasons.</p>
      )}
      {showOtherInput && !otherDraft.trim() && (
        <p className="text-xs text-rose-600">Enter the other reason text.</p>
      )}
    </div>
  );
};

export default LostReasonPicker;
