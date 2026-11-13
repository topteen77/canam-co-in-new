import React, { useMemo, useState } from 'react';
import apiClient from '../services/apiClient';

type RecordingFile = {
  id: string;
  phoneNumber: string;
  leadName: string;
  contactName: string;
  userName: string;
  direction: string;
  timestamp: string;
  duration: number;
  bytes: number;
  keep: boolean;
  saved: boolean;
};

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfWeek() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return dateInput(date);
}

function startOfMonth() {
  const date = new Date();
  return dateInput(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function RecordingStorage() {
  const [range, setRange] = useState<'week' | 'month' | 'custom'>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const load = async (nextRange = range, nextFrom = from, nextTo = to) => {
    setLoading(true);
    setMessage('');
    try {
      const params: Record<string, string> = {};
      if (nextRange === 'week') params.before = startOfWeek();
      else if (nextRange === 'month') params.before = startOfMonth();
      else {
        if (nextFrom) params.from = nextFrom;
        if (nextTo) params.to = nextTo;
      }
      const { data } = await apiClient.get('/admin/call-recordings', { params });
      setFiles(Array.isArray(data?.files) ? data.files : []);
      setTotalBytes(Number(data?.totalBytes || 0));
      setSelected([]);
    } catch {
      setMessage('Could not load recordings.');
    } finally {
      setLoading(false);
    }
  };

  const removable = files.filter((file) => !file.keep);
  const selectedBytes = useMemo(
    () => files.filter((file) => selected.includes(file.id) && !file.keep).reduce((sum, file) => sum + file.bytes, 0),
    [files, selected]
  );

  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const keep = async (file: RecordingFile) => {
    await apiClient.put(`/admin/call-recordings/${encodeURIComponent(file.id)}/keep`, { keep: !file.keep });
    await load();
  };

  const removeSelected = async () => {
    if (!selected.length) return;
    if (!window.confirm(`Remove ${selected.length} recording${selected.length === 1 ? '' : 's'} from the CRM?`)) return;
    const { data } = await apiClient.post('/admin/call-recordings/delete', { ids: selected });
    setMessage(`Removed ${data?.removed || 0} recording${data?.removed === 1 ? '' : 's'} (${formatBytes(data?.freedBytes || 0)}).`);
    await load();
  };

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Recording storage</h2>
          <p className="text-sm text-slate-500">Admin only. Kept recordings stay on the CRM and are left out of the total.</p>
        </div>
        <p className="text-sm font-semibold text-slate-800">Removable size: {formatBytes(totalBytes)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-700">
          Duration
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as 'week' | 'month' | 'custom')}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="week">Before current week</option>
            <option value="month">Before current month</option>
            <option value="custom">Custom duration</option>
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label className="text-sm text-slate-700">
              From
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-700">
              To
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </>
        )}
        <button type="button" onClick={() => load()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white">Show recordings</button>
        <button type="button" onClick={removeSelected} disabled={!selected.length} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
          Remove selected ({formatBytes(selectedBytes)})
        </button>
      </div>
      {message && <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
      {loading ? <p className="mt-3 text-sm text-slate-500">Loading recordings…</p> : files.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={removable.length > 0 && selected.length === removable.length}
                    onChange={(event) => setSelected(event.target.checked ? removable.map((file) => file.id) : [])}
                    aria-label="Select removable recordings"
                  />
                </th>
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Call</th>
                <th className="px-2 py-2">File size</th>
                <th className="px-2 py-2">Keep</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={selected.includes(file.id)} disabled={file.keep} onChange={() => toggle(file.id)} aria-label={`Select ${file.phoneNumber}`} />
                  </td>
                  <td className="px-2 py-2">{file.timestamp ? new Date(file.timestamp).toLocaleString() : ''}</td>
                  <td className="px-2 py-2">
                    <div>{file.phoneNumber}</div>
                    <div className="text-xs text-slate-500">{[file.leadName, file.contactName, file.userName].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-2 py-2">{file.saved ? formatBytes(file.bytes) : 'Not saved on CRM'}</td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => keep(file)} className={`rounded-full px-2 py-1 text-xs font-semibold ${file.keep ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                      {file.keep ? 'Kept' : 'Keep'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
