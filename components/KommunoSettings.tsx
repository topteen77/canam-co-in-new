import React, { useEffect, useState } from 'react';
import apiClient from '../services/apiClient';
import { Modal } from './Modal';
import { publishCallReady } from '../hooks/useShowCallIcon';

type KommunoAdminSettings = {
  configured?: boolean;
  source?: string;
  missing?: string[];
  baseUrl?: string;
  apiKey?: string;
  smeId?: string;
  pilotNumbers?: string;
  webhookToken?: string;
  publicBaseUrl?: string;
  recording?: boolean;
  webhookUrl?: string;
  callbackUrl?: string;
  incomingUrl?: string;
  recordingUrl?: string;
  callReady?: boolean;
  test?: { ok?: boolean; message?: string; log?: unknown } | null;
};

const EMPTY: KommunoAdminSettings = {};

export default function KommunoSettings() {
  const [form, setForm] = useState<KommunoAdminSettings>(EMPTY);
  const [recording, setRecording] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [test, setTest] = useState<KommunoAdminSettings['test']>(null);
  const [logOpen, setLogOpen] = useState(false);

  const apply = (data: KommunoAdminSettings) => {
    setForm(data || EMPTY);
    setRecording(data?.recording !== false);
    setTest(data?.test || null);
    publishCallReady(Boolean(data?.callReady));
    if (data?.test?.ok) setNotice(data.test.message || 'Kommuno API test succeeded.');
    else if (data?.test && data.test.ok === false) setError(data.test.message || 'Kommuno API test failed.');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get('/admin/kommuno');
        if (!cancelled) apply(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || 'Could not load Kommuno settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setField = (key: keyof KommunoAdminSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const { data } = await apiClient.put('/admin/kommuno', { ...form, recording });
      apply(data);
      if (data?.test?.ok) setNotice(data.test.message || 'Kommuno API test succeeded.');
      else setError(data?.test?.message || 'Kommuno API test failed.');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not save Kommuno settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading Kommuno settings…</p>;

  const fields: Array<{ key: keyof KommunoAdminSettings; label: string; hint: string }> = [
    { key: 'baseUrl', label: 'Kommuno API URL', hint: 'Base domain from the Kommuno settings page' },
    { key: 'apiKey', label: 'API key', hint: 'Sent as the apikey header' },
    { key: 'smeId', label: 'SME id', hint: '8-digit SME id' },
    { key: 'pilotNumbers', label: 'Virtual numbers', hint: 'Comma-separated, with country code' },
    { key: 'webhookToken', label: 'Webhook token', hint: 'Optional. Leave blank if Kommuno does not send a token' },
    { key: 'publicBaseUrl', label: 'Public CRM API URL', hint: 'Production origin Kommuno can reach. Localhost is ignored. Default https://canam.co.in.' },
  ];

  return (
    <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Kommuno calls</h3>
        <p className="text-sm text-slate-500 mt-1">
          Admin only. Saved values show the first and last characters. The middle stays hidden. Type a new value to replace one.
        </p>
      </div>

      <div className={`rounded-lg px-3 py-2 text-sm ${
        form.callReady ? 'bg-emerald-50 text-emerald-800' : test?.ok === false ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-950'
      }`}>
        <p className="font-semibold">
          {form.callReady ? 'API test passed' : test?.ok === false ? 'API test failed' : 'Not connected yet'}
        </p>
        <p className="mt-0.5">
          {form.callReady
            ? 'Outgoing and incoming calls use the saved Kommuno account.'
            : test?.ok === false
              ? (test.message || 'The saved settings did not pass the Kommuno API test.')
              : `Still needed: ${(form.missing || []).join(', ') || 'the Kommuno account details'}.`}
          {form.source === 'admin' ? ' Saved from this screen.' : ' Using the server environment until you save here.'}
        </p>
      </div>

      {fields.map((field) => (
        <label key={field.key} className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">{field.label}</span>
          <input
            type="text"
            autoComplete="off"
            value={String(form[field.key] || '')}
            onChange={(e) => setField(field.key, e.target.value)}
            placeholder={form[field.key] ? 'Type a new value to replace the saved one' : field.hint}
            className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">{field.hint}</span>
        </label>
      ))}

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={recording} onChange={(e) => setRecording(e.target.checked)} />
        Save call recordings
      </label>

      {form.callbackUrl && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold">Kommuno callback URL</p>
          <p className="mt-1 font-mono text-xs break-all">{form.callbackUrl}</p>
          <p className="mt-1 text-xs text-slate-500">Kommuno sends the call status to this one URL.</p>
        </div>
      )}

      {notice && <p className="text-sm font-semibold text-emerald-700">{notice}</p>}
      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-semibold text-red-600">{error}</p>
          {test && test.ok === false && (
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-red-700 border border-red-300 rounded-md hover:bg-red-50"
            >
              View log
            </button>
          )}
        </div>
      )}
      {logOpen && (
        <Modal title="Kommuno API log" onClose={() => setLogOpen(false)} maxWidth="max-w-3xl">
          <pre className="text-xs leading-5 text-slate-800 whitespace-pre-wrap break-all max-h-[60vh] overflow-auto">
            {JSON.stringify(test?.log || {}, null, 2)}
          </pre>
        </Modal>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
