import React, { useMemo, useState } from 'react';
import apiClient from '../services/apiClient';
import { Modal } from './Modal';

type OldCallLog = {
  id: string;
  phoneNumber: string;
  leadName: string;
  contactName: string;
  userName: string;
  direction: string;
  outcome: string;
  timestamp: string;
  duration: number;
  hasRecording: boolean;
};

function dateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthsBefore(months: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setMonth(date.getMonth() - months);
  return dateInput(date);
}

export function CallLogCleanup({ onChanged }: { onChanged?: () => void }) {
  const keepUntil = monthsBefore(3);
  const [range, setRange] = useState<'3' | '6' | '12' | 'custom'>('3');
  const [before, setBefore] = useState(keepUntil);
  const [logs, setLogs] = useState<OldCallLog[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const cutoff = range === '6' ? monthsBefore(6) : range === '12' ? monthsBefore(12) : range === 'custom' ? before : keepUntil;

  const load = async (nextCutoff = cutoff) => {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await apiClient.get('/admin/call-logs', { params: { before: nextCutoff || keepUntil } });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setSelected([]);
    } catch {
      setMessage('Could not load old call logs.');
    } finally {
      setLoading(false);
    }
  };

  const selectedLogs = useMemo(() => logs.filter((log) => selected.includes(log.id)), [logs, selected]);

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const removeSelected = async () => {
    if (!selected.length) return;
    const { data } = await apiClient.post('/admin/call-logs/delete', { ids: selected });
    setConfirmOpen(false);
    const removed = Number(data?.removed || 0);
    const skipped = Array.isArray(data?.skipped) ? data.skipped.length : 0;
    setMessage(`Removed ${removed} call log${removed === 1 ? '' : 's'}.${skipped ? ` ${skipped} stayed inside the last 3 months.` : ''}`);
    await load();
    onChanged?.();
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Call log cleanup</h2>
          <p className="text-sm text-slate-500">Admin only. Call logs from the last 3 months stay on the CRM.</p>
        </div>
        <p className="text-sm font-semibold text-slate-800">Older logs: {logs.length}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">
          Older than
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as '3' | '6' | '12' | 'custom')}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">1 year</option>
            <option value="custom">Custom date</option>
          </select>
        </label>
        {range === 'custom' && (
          <label className="text-sm text-slate-700">
            Before
            <input
              type="date"
              value={before}
              max={keepUntil}
              onChange={(event) => setBefore(event.target.value && event.target.value < keepUntil ? event.target.value : keepUntil)}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        )}
        <button type="button" onClick={() => load()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Show old logs</button>
        <button type="button" onClick={() => selected.length && setConfirmOpen(true)} disabled={!selected.length} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Remove selected ({selected.length})
        </button>
      </div>
      {message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
      {loading ? <p className="mt-3 text-sm text-slate-500">Loading call logs…</p> : logs.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={logs.length > 0 && selected.length === logs.length}
                    onChange={(event) => setSelected(event.target.checked ? logs.map((log) => log.id) : [])}
                    aria-label="Select old call logs"
                  />
                </th>
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Call</th>
                <th className="px-2 py-2">Duration</th>
                <th className="px-2 py-2">Recording</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.includes(log.id)} onChange={() => toggle(log.id)} aria-label={`Select ${log.phoneNumber}`} />
                  </td>
                  <td className="px-2 py-2">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</td>
                  <td className="px-2 py-2">
                    <div>{log.phoneNumber}</div>
                    <div className="text-xs text-slate-500">{[log.leadName, log.contactName, log.userName, log.direction].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-2 py-2">{log.duration}s</td>
                  <td className="px-2 py-2">{log.hasRecording ? 'Saved file' : 'None'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Remove call logs"
        maxWidth="max-w-md"
        footer={(
          <div className="flex justify-end gap-2 px-4 py-3">
            <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            <button type="button" onClick={removeSelected} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Remove call logs</button>
          </div>
        )}
      >
        <p className="text-sm text-slate-700">
          Remove {selectedLogs.length} call log{selectedLogs.length === 1 ? '' : 's'} from before {new Date(`${cutoff}T00:00:00`).toLocaleDateString()}? Logs from the last 3 months stay. A recording saved with a removed log is deleted too.
        </p>
      </Modal>
    </div>
  );
}
