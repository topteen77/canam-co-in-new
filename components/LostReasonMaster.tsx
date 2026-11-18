import React, { useEffect, useState } from 'react';
import {
  deleteLostReason,
  listLostReasons,
  saveLostReason,
  type LostReasonRow,
} from '../services/lostReasonMasterService';

export const LostReasonMaster: React.FC = () => {
  const [rows, setRows] = useState<LostReasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ id: '', name: '' });

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listLostReasons({ includeInactive: false });
      setRows(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load lost reasons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => setForm({ id: '', name: '' });

  const onSave = async () => {
    const name = form.name.trim();
    if (!name) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      await saveLostReason({ id: form.id || undefined, name });
      setNotice(form.id ? 'Reason updated.' : 'Reason added.');
      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Remove this lost reason?')) return;
    try {
      setSaving(true);
      setError(null);
      await deleteLostReason(id);
      setNotice('Reason removed.');
      if (form.id === id) resetForm();
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Lost Reason Master</h2>
        <p className="text-sm text-slate-600 mt-1">
          These reasons appear when a lead status is set to <strong>Lost</strong>. Custom “Other” reasons entered on leads are also saved here.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">{form.id ? 'Edit reason' : 'Add reason'}</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Delay in commission"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
          />
          <button
            type="button"
            disabled={saving || !form.name.trim()}
            onClick={onSave}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : form.id ? 'Update' : 'Add'}
          </button>
          {form.id && (
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">
              Cancel
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No reasons yet.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Reason</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-slate-500">{row.isSystem ? 'Default' : 'Custom'}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      type="button"
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                      onClick={() => setForm({ id: row.id, name: row.name })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-rose-600 hover:text-rose-800 font-medium"
                      onClick={() => onDelete(row.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LostReasonMaster;
